import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Smart Follow-up Engine
 * 
 * Instead of blasting generic messages, this function:
 * 1. Queries conversations idle for 12+ hours
 * 2. Sends each conversation's last 15 messages to AI
 * 3. AI analyzes and decides: should we follow up? what type? what message?
 * 4. Only sends if AI recommends it
 * 5. Logs every decision (sent or skipped) for audit
 * 
 * Safety: max 10 follow-ups per run, min 12h since last follow-up per contact
 */

const MAX_FOLLOWUPS_PER_RUN = 10;
const MIN_IDLE_HOURS = 12;
const MIN_HOURS_SINCE_LAST_FOLLOWUP = 24;
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface FollowUpDecision {
  should_followup: boolean;
  reason: string;
  followup_type: 'payment_reminder' | 'reengagement' | 'delivery_update' | 'soft_check' | 'none';
  message: string;
  urgency: 'low' | 'medium' | 'high';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (!lovableApiKey) {
    console.error('[SmartFollowUp] LOVABLE_API_KEY not configured');
    return new Response(JSON.stringify({ error: 'AI key not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('[SmartFollowUp] 🧠 Starting smart follow-up analysis...');

    // 1. Get nina_settings for company context
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('company_name, sdr_name, timezone')
      .limit(1)
      .maybeSingle();

    const companyName = settings?.company_name || 'a empresa';
    const sdrName = settings?.sdr_name || 'João';

    // 2. Query CANDIDATE conversations (idle 12h+, nina-managed, not blocked)
    const idleSince = new Date(Date.now() - MIN_IDLE_HOURS * 60 * 60 * 1000).toISOString();

    const { data: candidates, error: candError } = await supabase
      .from('conversations')
      .select(`
        id, status, last_message_at, contact_id, instance_id,
        contact:contacts!inner(
          id, name, call_name, phone_number, is_blocked, lead_state,
          client_memory, resumo_vivo, tags
        )
      `)
      .eq('is_active', true)
      .eq('status', 'nina')
      .lt('last_message_at', idleSince)
      .order('last_message_at', { ascending: true })
      .limit(30); // Analyze up to 30 but send max 10

    if (candError) {
      console.error('[SmartFollowUp] Error querying candidates:', candError);
      throw candError;
    }

    if (!candidates || candidates.length === 0) {
      console.log('[SmartFollowUp] No idle conversations found. All good! ✅');
      return new Response(JSON.stringify({ 
        status: 'no_candidates', 
        message: 'No conversations need follow-up' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[SmartFollowUp] Found ${candidates.length} candidate conversations`);

    // 3. Filter out blocked contacts and those with recent follow-ups
    const eligibleCandidates = [];
    
    for (const conv of candidates) {
      const contact = conv.contact as any;
      
      // Skip blocked
      if (contact?.is_blocked) {
        console.log(`[SmartFollowUp] Skipping ${contact.name} - blocked`);
        continue;
      }

      // Skip INACTIVE leads
      if (contact?.lead_state === 'INACTIVE' || contact?.lead_state === 'LOST') {
        console.log(`[SmartFollowUp] Skipping ${contact.name} - lead_state: ${contact.lead_state}`);
        continue;
      }

      // Check if we already sent a follow-up recently (via memory_events)
      const { data: recentFollowup } = await supabase
        .from('memory_events')
        .select('created_at')
        .eq('contact_id', contact.id)
        .eq('tipo', 'smart_followup')
        .gte('created_at', new Date(Date.now() - MIN_HOURS_SINCE_LAST_FOLLOWUP * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (recentFollowup && recentFollowup.length > 0) {
        console.log(`[SmartFollowUp] Skipping ${contact.name} - follow-up sent <${MIN_HOURS_SINCE_LAST_FOLLOWUP}h ago`);
        continue;
      }

      // Check total follow-ups sent to this contact (max 3 ever before human review)
      const { count: totalFollowups } = await supabase
        .from('memory_events')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contact.id)
        .eq('tipo', 'smart_followup');

      if ((totalFollowups || 0) >= 3) {
        console.log(`[SmartFollowUp] Skipping ${contact.name} - already received 3 follow-ups (max)`);
        continue;
      }

      eligibleCandidates.push(conv);
    }

    console.log(`[SmartFollowUp] ${eligibleCandidates.length} eligible after filtering`);

    if (eligibleCandidates.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'all_filtered', 
        message: 'All candidates filtered out by safety checks' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. For each eligible, fetch messages and ask AI
    let followupsSent = 0;
    const results: Array<{
      contact: string;
      decision: string;
      type: string;
      sent: boolean;
    }> = [];

    for (const conv of eligibleCandidates) {
      if (followupsSent >= MAX_FOLLOWUPS_PER_RUN) {
        console.log('[SmartFollowUp] Max follow-ups per run reached');
        break;
      }

      const contact = conv.contact as any;
      const contactName = contact.call_name || contact.name || 'Cliente';

      // Fetch last 15 messages for context
      const { data: messages } = await supabase
        .from('messages')
        .select('content, from_type, type, sent_at')
        .eq('conversation_id', conv.id)
        .order('sent_at', { ascending: false })
        .limit(15);

      if (!messages || messages.length === 0) {
        console.log(`[SmartFollowUp] No messages for ${contactName}, skipping`);
        continue;
      }

      // Build conversation transcript (oldest first)
      const transcript = [...messages].reverse().map(m => {
        const sender = m.from_type === 'user' ? contactName : sdrName;
        const content = m.content || `[${m.type}]`;
        return `[${sender}]: ${content}`;
      }).join('\n');

      const lastMessage = messages[0]; // Most recent
      const hoursIdle = (Date.now() - new Date(conv.last_message_at).getTime()) / (1000 * 60 * 60);

      // 5. Ask AI to analyze
      const aiPrompt = `Você é um analista de vendas especializado. Analise esta conversa e decida se um follow-up é necessário.

CONTEXTO:
- Empresa: ${companyName}
- SDR: ${sdrName}
- Cliente: ${contactName}
- Telefone: ${contact.phone_number}
- Horas sem interação: ${Math.round(hoursIdle)}h
- Última mensagem enviada por: ${lastMessage.from_type === 'user' ? 'CLIENTE' : sdrName}
- Resumo do cliente: ${contact.resumo_vivo || 'Sem resumo disponível'}
- Tags: ${(contact.tags || []).join(', ') || 'nenhuma'}

TRANSCRIÇÃO (últimas mensagens):
${transcript}

REGRAS PARA DECIDIR:
1. Se o CLIENTE disse "obrigado", "valeu", "ok, tudo certo" ou algo que ENCERRA a conversa naturalmente → NÃO fazer follow-up
2. Se o ${sdrName} pediu um comprovante/pix e o cliente não enviou → follow-up tipo "payment_reminder" (gentil)
3. Se houve interesse mas o cliente sumiu sem responder → follow-up tipo "reengagement" (curioso, não insistente)
4. Se foi combinado um prazo e ele já passou → follow-up tipo "soft_check"
5. Se a conversa já teve tom de despedida ou o cliente claramente não tem interesse → NÃO fazer follow-up
6. Se o ${sdrName} já mandou a última mensagem e ela já era um follow-up ou encerramento → NÃO fazer follow-up (evitar insistência)
7. NUNCA envie follow-up se a última mensagem do ${sdrName} já foi um "fico no aguardo" ou "qualquer dúvida estou aqui"

IMPORTANTE: A mensagem deve ser CURTA (máx 2 linhas), natural, como se fosse WhatsApp real. Use o nome do cliente. Sem emojis excessivos (máx 1). Tom casual e humano.`;

      try {
        const aiResponse = await fetch(AI_GATEWAY_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'Você analisa conversas de vendas e decide follow-ups. Responda APENAS com a tool call solicitada.' },
              { role: 'user', content: aiPrompt }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'followup_decision',
                description: 'Retorna a decisão sobre follow-up para esta conversa',
                parameters: {
                  type: 'object',
                  properties: {
                    should_followup: { 
                      type: 'boolean', 
                      description: 'true se deve enviar follow-up, false se não' 
                    },
                    reason: { 
                      type: 'string', 
                      description: 'Justificativa breve da decisão (1 frase)' 
                    },
                    followup_type: { 
                      type: 'string', 
                      enum: ['payment_reminder', 'reengagement', 'delivery_update', 'soft_check', 'none'],
                      description: 'Tipo do follow-up' 
                    },
                    message: { 
                      type: 'string', 
                      description: 'Mensagem de follow-up para enviar (se should_followup=true). Máximo 2 linhas, tom natural de WhatsApp.' 
                    },
                    urgency: { 
                      type: 'string', 
                      enum: ['low', 'medium', 'high'],
                      description: 'Urgência do follow-up' 
                    }
                  },
                  required: ['should_followup', 'reason', 'followup_type', 'message', 'urgency'],
                  additionalProperties: false
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'followup_decision' } }
          })
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`[SmartFollowUp] AI error for ${contactName}:`, aiResponse.status, errText);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        
        if (!toolCall?.function?.arguments) {
          console.error(`[SmartFollowUp] No tool call in AI response for ${contactName}`);
          continue;
        }

        const decision: FollowUpDecision = JSON.parse(toolCall.function.arguments);
        
        console.log(`[SmartFollowUp] 🤖 Decision for ${contactName}: ${decision.should_followup ? '✅ SEND' : '⏭️ SKIP'} - ${decision.reason}`);

        results.push({
          contact: contactName,
          decision: decision.should_followup ? 'send' : 'skip',
          type: decision.followup_type,
          sent: false
        });

        if (!decision.should_followup) {
          // Log the skip decision
          await supabase.from('memory_events').insert({
            contact_id: contact.id,
            conversation_id: conv.id,
            tipo: 'smart_followup_skip',
            payload: {
              reason: decision.reason,
              type: decision.followup_type,
              hours_idle: Math.round(hoursIdle)
            }
          });
          continue;
        }

        // 6. SEND the follow-up via send_queue
        // Create message record first
        const { data: msgRecord, error: msgErr } = await supabase
          .from('messages')
          .insert({
            conversation_id: conv.id,
            content: decision.message,
            type: 'text',
            from_type: 'nina',
            status: 'sent',
            metadata: { 
              source: 'smart_followup',
              followup_type: decision.followup_type,
              urgency: decision.urgency
            }
          })
          .select('id')
          .single();

        if (msgErr) {
          console.error(`[SmartFollowUp] Error creating message for ${contactName}:`, msgErr);
          continue;
        }

        // Add to send queue
        const { error: queueErr } = await supabase
          .from('send_queue')
          .insert({
            conversation_id: conv.id,
            contact_id: contact.id,
            instance_id: conv.instance_id,
            message_id: msgRecord.id,
            content: decision.message,
            message_type: 'text',
            from_type: 'nina',
            status: 'pending',
            priority: decision.urgency === 'high' ? 3 : decision.urgency === 'medium' ? 2 : 1,
            metadata: { source: 'smart_followup', followup_type: decision.followup_type }
          });

        if (queueErr) {
          console.error(`[SmartFollowUp] Error queuing message for ${contactName}:`, queueErr);
          continue;
        }

        // Log the follow-up
        await supabase.from('memory_events').insert({
          contact_id: contact.id,
          conversation_id: conv.id,
          tipo: 'smart_followup',
          payload: {
            message: decision.message,
            type: decision.followup_type,
            urgency: decision.urgency,
            reason: decision.reason,
            hours_idle: Math.round(hoursIdle)
          }
        });

        // Update conversation last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conv.id);

        followupsSent++;
        results[results.length - 1].sent = true;

        console.log(`[SmartFollowUp] ✅ Follow-up sent to ${contactName}: "${decision.message.substring(0, 50)}..."`);

        // Small delay between AI calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 1500));

      } catch (aiErr) {
        console.error(`[SmartFollowUp] Error processing ${contactName}:`, aiErr);
        continue;
      }
    }

    // 7. Log audit summary
    const adminUserId = await getAdminUserId(supabase);
    if (adminUserId) {
      await supabase.from('audit_logs').insert({
        user_id: adminUserId,
        action: 'smart_followup_run',
        entity_type: 'system',
        details: {
          candidates_found: candidates.length,
          eligible_after_filter: eligibleCandidates.length,
          followups_sent: followupsSent,
          results
        }
      });
    }

    // Trigger whatsapp-sender to process the queue
    if (followupsSent > 0) {
      await fetch(`${supabaseUrl}/functions/v1/trigger-whatsapp-sender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: '{}'
      }).catch(err => console.error('[SmartFollowUp] Error triggering sender:', err));
    }

    const summary = `Analyzed ${candidates.length} conversations, sent ${followupsSent} follow-ups`;
    console.log(`[SmartFollowUp] 🏁 ${summary}`);

    return new Response(JSON.stringify({ 
      status: 'completed',
      summary,
      candidates_analyzed: candidates.length,
      eligible: eligibleCandidates.length,
      followups_sent: followupsSent,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SmartFollowUp] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function getAdminUserId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}
