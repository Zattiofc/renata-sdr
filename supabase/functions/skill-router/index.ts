import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Skill Router: seleciona a melhor skill dado intenção + estado + nicho
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();
    const {
      intencao,        // string detectada
      lead_state,      // enum lead_state
      nicho,           // string
      conversation_id,
      contact_id,
      message_id,
      historico_recente = [],
    } = body;

    const startTime = Date.now();

    // 1. Buscar skills publicadas
    const { data: skills, error } = await supabase
      .from('skills')
      .select('*')
      .eq('status', 'published')
      .order('score_base', { ascending: false });

    if (error) throw error;
    if (!skills || skills.length === 0) {
      return new Response(JSON.stringify({ skill: null, motivo: 'Nenhuma skill publicada', fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Scoring por critérios
    const scored = skills.map((skill: any) => {
      let score = skill.score_base || 0.5;
      let motivos: string[] = [];

      // Boost por estado do lead
      if (skill.lead_states_aplicaveis?.includes(lead_state)) {
        score += 0.3;
        motivos.push(`estado ${lead_state} compatível`);
      }

      // Boost por nicho exato
      if (skill.nicho === nicho) {
        score += 0.2;
        motivos.push(`nicho ${nicho} exato`);
      } else if (skill.nicho === 'generico') {
        score += 0.05;
        motivos.push('nicho genérico como fallback');
      }

      // Boost por trigger matching
      const intencaoLower = (intencao || '').toLowerCase();
      const triggerMatch = (skill.triggers || []).some((t: string) =>
        intencaoLower.includes(t.toLowerCase()) || t.toLowerCase().includes(intencaoLower)
      );
      if (triggerMatch) {
        score += 0.25;
        motivos.push('trigger correspondente');
      }

      // Penalidade por skill core muito genérica se há opção específica
      if (skill.is_core && nicho !== 'generico') {
        score -= 0.05;
      }

      return { skill, score: Math.min(score, 1.0), motivos };
    });

    // 3. Ordenar por score e selecionar melhor
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const CONFIDENCE_THRESHOLD = 0.6;
    const isFallback = best.score < CONFIDENCE_THRESHOLD;
    const tempoResposta = Date.now() - startTime;

    // 4. Log da seleção
    await supabase.from('skill_router_logs').insert({
      conversation_id: conversation_id || null,
      contact_id: contact_id || null,
      message_id: message_id || null,
      skill_id: isFallback ? null : best.skill.id,
      skill_nome: isFallback ? null : best.skill.nome,
      score_confianca: best.score,
      motivo_escolha: best.motivos.join('; '),
      intencao_detectada: intencao,
      estado_lead: lead_state || null,
      nicho: nicho,
      tempo_resposta_ms: tempoResposta,
      skill_executada: !isFallback,
      fallback_ativado: isFallback,
    } as any);

    // 5. Log evento analytics
    await supabase.from('skill_events').insert({
      event_type: 'skill_selected',
      skill_id: isFallback ? null : best.skill.id,
      conversation_id: conversation_id || null,
      contact_id: contact_id || null,
      nicho: nicho,
      lead_state: lead_state || null,
      payload: {
        intencao,
        score: best.score,
        fallback: isFallback,
        tempo_ms: tempoResposta,
      } as any,
    } as any);

    if (isFallback) {
      console.log(`[SkillRouter] Fallback ativado — confiança insuficiente: ${best.score}`);
      return new Response(JSON.stringify({
        skill: null,
        fallback: true,
        motivo: `Confiança insuficiente (${(best.score * 100).toFixed(0)}%). Usar resposta de clarificação.`,
        score: best.score,
        candidato: best.skill.nome,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[SkillRouter] Skill selecionada: ${best.skill.nome} (score: ${best.score.toFixed(3)})`);

    return new Response(JSON.stringify({
      skill: best.skill,
      score: best.score,
      motivo: best.motivos.join('; '),
      fallback: false,
      tempo_ms: tempoResposta,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SkillRouter] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg, skill: null, fallback: true }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
