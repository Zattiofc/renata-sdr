import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, getAIConfigFromSettings } from "../_shared/ai-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { contact_id, conversation_id, user_message, ai_response, current_memory, user_id, rag_feedback } = await req.json();

    console.log(`[Analyze Conversation] Starting analysis for contact ${contact_id}`);

    const interactionCount = (current_memory.interaction_summary?.total_conversations || 0) + 1;
    // Full analysis every 3 interactions for better data capture
    const shouldAnalyze = interactionCount === 1 || interactionCount % 3 === 0;
    
    console.log(`[Analyze] Interaction #${interactionCount}, full analysis: ${shouldAnalyze}`);

    // === RAG FEEDBACK TRACKING (always, even on basic updates) ===
    if (rag_feedback && conversation_id) {
      try {
        await supabase.from('rag_feedback').insert({
          conversation_id,
          contact_id,
          query_text: (user_message || '').substring(0, 500),
          chunks_used: rag_feedback.chunks_used || [],
          chunks_similarity: rag_feedback.chunks_similarity || [],
          knowledge_gap_detected: !rag_feedback.had_rag_context && (user_message || '').length > 20,
          gap_description: !rag_feedback.had_rag_context ? `Sem contexto RAG para: "${(user_message || '').substring(0, 200)}"` : null
        });
        console.log('[Analyze] RAG feedback tracked');
      } catch (ragFbErr) {
        console.error('[Analyze] RAG feedback tracking error (non-fatal):', ragFbErr);
      }
    }

    if (!shouldAnalyze) {
      // === BASIC UPDATE: Still extract obvious profile data from messages ===
      const contactUpdate: Record<string, any> = {};
      const lowerMsg = (user_message || '').toLowerCase();
      
      // Extract cargo from common patterns
      if (!current_memory.lead_profile?.cargo_extracted) {
        const cargoPatterns = [
          /sou\s+(?:o|a)\s+(ceo|cto|cfo|coo|diretor[a]?|gerente|coordenador[a]?|médic[oa]?|dr\.?\s*\w+|dra\.?\s*\w+|sóci[oa]?|dono|dona|proprietári[oa]?)/i,
          /(?:meu cargo|trabalho como|atuo como)\s+(?:é\s+)?(\w[\w\s]{2,30})/i,
        ];
        for (const pattern of cargoPatterns) {
          const match = lowerMsg.match(pattern);
          if (match) {
            contactUpdate.cargo = match[1].trim();
            break;
          }
        }
      }
      
      // Extract empresa patterns
      if (!current_memory.lead_profile?.empresa_extracted) {
        const empresaPatterns = [
          /(?:somos|sou d[aeo]|trabalho n[aeo]|minha empresa|nossa empresa|aqui é)\s+(?:uma?\s+)?([\w\s]{3,40})/i,
        ];
        for (const pattern of empresaPatterns) {
          const match = lowerMsg.match(pattern);
          if (match) {
            const empresa = match[1].trim();
            if (empresa.length > 2 && !['um', 'uma', 'que', 'sim', 'não'].includes(empresa.toLowerCase())) {
              contactUpdate.empresa = empresa;
              break;
            }
          }
        }
      }
      
      // Update contact if any profile fields were extracted
      if (Object.keys(contactUpdate).length > 0) {
        await supabase.from('contacts').update(contactUpdate).eq('id', contact_id);
        console.log('[Analyze] Basic update extracted profile fields:', Object.keys(contactUpdate));
      }
      
      const basicMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200)
          }
        ]
      };
      
      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: basicMemory
      });
      
      return new Response(JSON.stringify({ updated: true, type: 'basic', profile_extracted: Object.keys(contactUpdate) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get AI config from nina_settings
    const { data: ninaSettings } = await supabase
      .from('nina_settings')
      .select('ai_provider, ai_api_key, ai_model_name')
      .limit(1)
      .maybeSingle();
    
    const aiConfig = getAIConfigFromSettings(ninaSettings || {});

    // FULL ANALYSIS
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, title, ai_trigger_criteria, position')
      .eq('is_ai_managed', true)
      .not('ai_trigger_criteria', 'is', null)
      .eq('is_active', true)
      .order('position', { ascending: true });

    const { data: currentDeal } = await supabase
      .from('deals')
      .select('id, stage_id, stage')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasAiManagedStages = stages && stages.length > 0;

    const stagesCriteria = hasAiManagedStages
      ? stages.map(s => `- ${s.title} (ID: ${s.id}): ${s.ai_trigger_criteria}`).join('\n')
      : '';

    // Include RAG feedback context for self-improvement analysis
    const ragContext = rag_feedback?.had_rag_context
      ? `RAG ativo: ${rag_feedback.chunks_used?.length || 0} chunks usados (similaridade: ${(rag_feedback.chunks_similarity || []).map((s: number) => s.toFixed(2)).join(', ')})`
      : 'RAG inativo: Nenhum chunk relevante encontrado para esta pergunta';

    const conversationSnippet = `
MENSAGEM DO CLIENTE:
${user_message}

RESPOSTA DO ASSISTENTE:
${ai_response}

CONTEXTO ATUAL:
- Interesses conhecidos: ${current_memory.lead_profile?.interests?.join(', ') || 'Nenhum'}
- Dores identificadas: ${current_memory.sales_intelligence?.pain_points?.join(', ') || 'Nenhuma'}
- Score atual: ${current_memory.lead_profile?.qualification_score || 0}/100
- ${ragContext}
${hasAiManagedStages ? `
CRITÉRIOS DOS ESTÁGIOS DO PIPELINE:
${stagesCriteria}

ESTÁGIO ATUAL DO DEAL: ${currentDeal?.stage || 'Sem estágio'}` : ''}
    `.trim();

    const tools: any[] = [
      {
        type: "function",
        function: {
          name: "update_memory_insights",
          description: "Extrair insights estruturados da conversa para atualizar memória do cliente",
          parameters: {
            type: "object",
            properties: {
              interests: { type: "array", items: { type: "string" }, description: "Lista de interesses (max 5)" },
              pain_points: { type: "array", items: { type: "string" }, description: "Dores mencionadas (max 5)" },
              objections: { type: "array", items: { type: "string" }, description: "Objeções levantadas pelo lead (max 5)" },
              qualification_score: { type: "number", description: "Score de qualificação 0-100", minimum: 0, maximum: 100 },
              next_best_action: { type: "string", enum: ["qualify", "demo", "followup", "close", "nurture"] },
              budget_indication: { type: "string", enum: ["unknown", "low", "medium", "high"] },
              decision_timeline: { type: "string", enum: ["unknown", "immediate", "1month", "3months", "6months+"] },
              resumo_vivo: { type: "string", description: "Resumo factual de 5-10 linhas do estado atual do lead" },
              empresa: { type: "string", description: "Nome da empresa do lead se mencionado" },
              cargo: { type: "string", description: "Cargo do lead se mencionado" },
              cidade: { type: "string", description: "Cidade do lead se mencionada" },
              estado: { type: "string", description: "Estado (UF) do lead se mencionado" },
              linha_negocio: { type: "string", description: "Linha de negócio de interesse" },
              eventos: { 
                type: "array", 
                items: { 
                  type: "object",
                  properties: {
                    tipo: { type: "string", enum: ["qualificacao", "objecao", "interesse", "agendamento", "no_show", "perda", "retomada", "aguardando", "guardrail", "fora_escopo", "spam", "agressao"] },
                    descricao: { type: "string" }
                  },
                  required: ["tipo", "descricao"]
                },
                description: "Eventos importantes detectados nesta interação (max 3)"
              },
              intent_classification: {
                type: "object",
                properties: {
                  categoria: { type: "string", enum: ["in_scope", "partial", "out_of_scope"] },
                  subtipo: { type: "string" },
                  acao_tomada: { type: "string", enum: ["seguir", "redirecionar", "encerrar", "escalar_humano"] }
                },
                description: "Classificação de intenção da interação"
              },
              response_quality: {
                type: "string",
                enum: ["excellent", "good", "adequate", "poor", "off_topic"],
                description: "Qualidade da resposta do assistente: excellent (resposta perfeita), good (boa mas poderia melhorar), adequate (aceitável), poor (ruim/genérica), off_topic (fora do contexto)"
              },
              knowledge_gap: {
                type: "object",
                properties: {
                  detected: { type: "boolean", description: "Se foi detectada falta de informação na base de conhecimento" },
                  topic: { type: "string", description: "Tópico que faltou informação" },
                  suggested_content: { type: "string", description: "Conteúdo sugerido para adicionar à base (máx 500 chars)" },
                  category: { type: "string", enum: ["produto_servico", "oferta_precos", "faq", "politicas", "provas_sociais", "scripts_vendas", "compliance", "geral"] }
                },
                description: "Lacuna de conhecimento detectada - quando a IA não tinha informação suficiente para responder bem"
              },
              successful_pattern: {
                type: "object",
                properties: {
                  detected: { type: "boolean", description: "Se a resposta representou um padrão de sucesso replicável" },
                  pattern_type: { type: "string", enum: ["objection_handling", "qualification", "closing", "rapport", "reactivation"] },
                  description: { type: "string", description: "Descrição do padrão de sucesso para aprendizado" }
                },
                description: "Padrão de sucesso detectado - quando a resposta da IA foi especialmente eficaz"
              }
            },
            required: ["interests", "pain_points", "qualification_score", "next_best_action", "budget_indication", "decision_timeline", "resumo_vivo", "response_quality"],
            additionalProperties: false
          }
        }
      }
    ];

    if (hasAiManagedStages) {
      tools.push({
        type: "function",
        function: {
          name: "determine_deal_stage",
          description: "Determinar estágio do pipeline",
          parameters: {
            type: "object",
            properties: {
              suggested_stage_id: { type: "string", enum: stages.map(s => s.id) },
              confidence: { type: "number", minimum: 0, maximum: 100 },
              reasoning: { type: "string" }
            },
            required: ["suggested_stage_id", "confidence", "reasoning"],
            additionalProperties: false
          }
        }
      });
    }

    const systemPrompt = `Você é um analista de conversas de vendas e especialista em auto-aprimoramento de IA.
Analise a interação e:
1. Extraia insights estruturados para atualizar a memória do cliente
2. ${hasAiManagedStages ? 'Determine para qual estágio do pipeline o deal deve ir' : 'Avalie o progresso do lead'}
3. Gere um resumo_vivo factual de 5-10 linhas do estado atual do lead
4. Detecte eventos importantes (qualificação, objeção, interesse, etc.)
5. Extraia dados de perfil do lead se mencionados (empresa, cargo, cidade, estado, linha de negócio)
6. AVALIE A QUALIDADE da resposta do assistente: foi precisa, contextual, empática? Ou genérica, fora de tom, incompleta?
7. DETECTE LACUNAS DE CONHECIMENTO: O assistente teve informações suficientes para responder? Se não, sugira o conteúdo que deveria existir na base.
8. DETECTE PADRÕES DE SUCESSO: Se a resposta foi especialmente eficaz (tratou objeção, qualificou bem, fechou agendamento), registre o padrão para replicação.

CRITÉRIO DE QUALIDADE:
- excellent: Resposta perfeita, personalizada, com CTA claro e informação precisa
- good: Boa resposta mas poderia ser mais específica ou empática
- adequate: Resposta aceitável mas genérica
- poor: Resposta ruim, genérica, sem contexto ou repetitiva
- off_topic: Resposta fora do contexto da conversa`;

    const analysisResponse = await callAI(aiConfig, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationSnippet }
      ],
      tools,
    });

    if (!analysisResponse.ok) {
      console.error('[Analyze] AI analysis failed:', analysisResponse.status);
      throw new Error('AI analysis failed');
    }

    const analysisData = await analysisResponse.json();
    const toolCalls = analysisData.choices?.[0]?.message?.tool_calls || [];
    
    if (toolCalls.length === 0) {
      throw new Error('No insights extracted');
    }

    let insights = null;
    let stageResult = null;

    for (const toolCall of toolCalls) {
      if (toolCall.function?.name === 'update_memory_insights') {
        insights = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'determine_deal_stage') {
        stageResult = JSON.parse(toolCall.function.arguments);
      }
    }

    if (insights) {
      const updatedMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        lead_profile: {
          ...current_memory.lead_profile,
          interests: Array.from(new Set([
            ...(current_memory.lead_profile?.interests || []),
            ...insights.interests
          ])).slice(0, 10),
          qualification_score: insights.qualification_score,
          lead_stage: insights.qualification_score > 70 ? 'qualified' : 
                      insights.qualification_score > 40 ? 'engaged' : 'new',
          budget_indication: insights.budget_indication,
          decision_timeline: insights.decision_timeline
        },
        sales_intelligence: {
          ...current_memory.sales_intelligence,
          pain_points: Array.from(new Set([
            ...(current_memory.sales_intelligence?.pain_points || []),
            ...insights.pain_points
          ])).slice(0, 10),
          objections: Array.from(new Set([
            ...(current_memory.sales_intelligence?.objections || []),
            ...(insights.objections || [])
          ])).slice(0, 10),
          next_best_action: insights.next_best_action
        },
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200),
            insights_extracted: {
              qualification_score: insights.qualification_score,
              next_action: insights.next_best_action,
              response_quality: insights.response_quality
            }
          }
        ]
      };

      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: updatedMemory
      });

      // === UPDATE RESUMO_VIVO on contacts table ===
      if (insights.resumo_vivo) {
        const contactUpdate: Record<string, any> = { resumo_vivo: insights.resumo_vivo };
        if (insights.empresa) contactUpdate.empresa = insights.empresa;
        if (insights.cargo) contactUpdate.cargo = insights.cargo;
        if (insights.cidade) contactUpdate.cidade = insights.cidade;
        if (insights.estado) contactUpdate.estado = insights.estado;
        if (insights.linha_negocio) contactUpdate.linha_negocio = insights.linha_negocio;

        await supabase.from('contacts').update(contactUpdate).eq('id', contact_id);
        console.log('[Analyze] Updated resumo_vivo and lead fields on contact');
      }

      // === LOG MEMORY EVENTS ===
      if (insights.eventos && insights.eventos.length > 0) {
        const eventRows = insights.eventos.map((evt: any) => ({
          contact_id,
          conversation_id: conversation_id || null,
          tipo: evt.tipo,
          payload: { descricao: evt.descricao }
        }));
        const { error: evtError } = await supabase.from('memory_events').insert(eventRows);
        if (evtError) {
          console.error('[Analyze] Error logging memory events:', evtError);
        } else {
          console.log(`[Analyze] Logged ${eventRows.length} memory events`);
        }
      }

      // === LOG INTENT CLASSIFICATION (guardrail telemetry) ===
      if (insights.intent_classification && insights.intent_classification.categoria !== 'in_scope') {
        const intentEvent = {
          contact_id,
          conversation_id: conversation_id || null,
          tipo: 'guardrail',
          payload: {
            intent_category: insights.intent_classification.categoria,
            subtipo: insights.intent_classification.subtipo || 'outro',
            acao_tomada: insights.intent_classification.acao_tomada || 'seguir',
            descricao: `Análise pós-conversa detectou intenção ${insights.intent_classification.categoria}`
          }
        };
        await supabase.from('memory_events').insert(intentEvent);
        console.log(`[Analyze] Logged intent classification: ${insights.intent_classification.categoria}`);
      }

      // === SELF-IMPROVEMENT: Track RAG quality and update chunk effectiveness ===
      if (rag_feedback?.chunks_used?.length > 0 && insights.response_quality) {
        const qualityMap: Record<string, string> = {
          'excellent': 'good', 'good': 'good', 'adequate': 'neutral', 'poor': 'bad', 'off_topic': 'bad'
        };
        const quality = qualityMap[insights.response_quality] || 'neutral';
        
        try {
          await supabase.rpc('track_chunk_usage', {
            chunk_ids: rag_feedback.chunks_used,
            quality
          });
          console.log(`[Analyze] Updated RAG chunk effectiveness: ${quality} for ${rag_feedback.chunks_used.length} chunks`);
        } catch (trackErr) {
          console.error('[Analyze] Error tracking chunk effectiveness:', trackErr);
        }

        // Update rag_feedback record with quality
        if (conversation_id) {
          await supabase.from('rag_feedback')
            .update({ response_quality: insights.response_quality })
            .eq('conversation_id', conversation_id)
            .order('created_at', { ascending: false })
            .limit(1);
        }
      }

      // === SELF-IMPROVEMENT: Auto-generate knowledge suggestions ===
      if (insights.knowledge_gap?.detected && insights.knowledge_gap.suggested_content) {
        try {
          await supabase.from('knowledge_suggestions').insert({
            source_type: 'gap_detection',
            source_conversation_id: conversation_id || null,
            source_contact_id: contact_id,
            category: insights.knowledge_gap.category || 'geral',
            title: insights.knowledge_gap.topic || 'Lacuna detectada',
            content: insights.knowledge_gap.suggested_content,
            confidence: 0.7,
            status: 'pending'
          });
          console.log(`[Analyze] Knowledge gap suggestion created: ${insights.knowledge_gap.topic}`);
        } catch (gapErr) {
          console.error('[Analyze] Error creating knowledge suggestion:', gapErr);
        }
      }

      // === SELF-IMPROVEMENT: Capture successful patterns as knowledge ===
      if (insights.successful_pattern?.detected && insights.successful_pattern.description) {
        try {
          await supabase.from('knowledge_suggestions').insert({
            source_type: 'success_pattern',
            source_conversation_id: conversation_id || null,
            source_contact_id: contact_id,
            category: 'scripts_vendas',
            title: `Padrão de sucesso: ${insights.successful_pattern.pattern_type}`,
            content: `${insights.successful_pattern.description}\n\nPergunta do lead: ${(user_message || '').substring(0, 200)}\nResposta eficaz: ${(ai_response || '').substring(0, 300)}`,
            confidence: 0.8,
            status: 'pending'
          });
          console.log(`[Analyze] Success pattern captured: ${insights.successful_pattern.pattern_type}`);
        } catch (patternErr) {
          console.error('[Analyze] Error capturing success pattern:', patternErr);
        }
      }

      // === SELF-IMPROVEMENT: Detect consistently poor responses and escalate ===
      if (insights.response_quality === 'poor' || insights.response_quality === 'off_topic') {
        // Check recent rag_feedback for patterns of poor quality
        const { data: recentFeedback } = await supabase
          .from('rag_feedback')
          .select('response_quality, knowledge_gap_detected')
          .eq('contact_id', contact_id)
          .order('created_at', { ascending: false })
          .limit(5);

        const poorCount = (recentFeedback || []).filter(f => f.response_quality === 'poor' || f.response_quality === 'off_topic').length;
        
        if (poorCount >= 3) {
          // Create high-priority suggestion for knowledge base review
          await supabase.from('knowledge_suggestions').insert({
            source_type: 'quality_alert',
            source_conversation_id: conversation_id || null,
            source_contact_id: contact_id,
            category: 'geral',
            title: `⚠️ Qualidade baixa recorrente - revisão necessária`,
            content: `O assistente teve ${poorCount} respostas de baixa qualidade nas últimas interações com este contato. Possível falta de informações na base de conhecimento ou prompt inadequado. Última pergunta sem resposta adequada: "${(user_message || '').substring(0, 300)}"`,
            confidence: 0.9,
            status: 'pending'
          });
          console.log(`[Analyze] Quality alert created: ${poorCount} poor responses for contact ${contact_id}`);
        }
      }
    }

    let dealMoved = false;
    if (stageResult && currentDeal && stageResult.suggested_stage_id !== currentDeal.stage_id && stageResult.confidence > 70) {
      const newStage = stages?.find(s => s.id === stageResult.suggested_stage_id);
      if (newStage) {
        const { error: updateError } = await supabase
          .from('deals')
          .update({ stage_id: stageResult.suggested_stage_id, stage: newStage.title })
          .eq('id', currentDeal.id);
        if (!updateError) dealMoved = true;
      }
    }

    return new Response(JSON.stringify({ 
      updated: true, 
      type: 'full', 
      insights: {
        response_quality: insights?.response_quality,
        knowledge_gap: insights?.knowledge_gap?.detected || false,
        successful_pattern: insights?.successful_pattern?.detected || false
      }, 
      stage_result: stageResult, 
      deal_moved: dealMoved 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Analyze] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
