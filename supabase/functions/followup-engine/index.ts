import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    console.log('[FollowUp] Starting follow-up engine...')

    // === PHASE 1: Send follow-ups to cold leads ===
    const cutoff24h = new Date(Date.now() - 24 * 3600000).toISOString()

    const { data: coldLeads, error: queryError } = await supabase
      .from('contacts')
      .select('id, name, call_name, phone_number, client_memory, instance_id')
      .lt('last_activity', cutoff24h)
      .in('lead_state', ['NEW_LEAD', 'QUALIFIED'])
      .or('is_blocked.is.null,is_blocked.eq.false')

    if (queryError) {
      console.error('[FollowUp] Query error:', queryError)
      throw queryError
    }

    // Filter out contacts that already received follow-up
    const eligibleLeads = (coldLeads || []).filter(c => {
      const memory = c.client_memory as Record<string, any> || {}
      return memory.followup_sent !== true
    })

    console.log(`[FollowUp] Found ${coldLeads?.length || 0} cold leads, ${eligibleLeads.length} eligible for follow-up`)

    let sentCount = 0
    let errorCount = 0

    for (const lead of eligibleLeads) {
      try {
        const nome = lead.call_name || lead.name || 'Cliente'

        // Find the most recent conversation for this contact
        const { data: conv } = await supabase
          .from('conversations')
          .select('id, instance_id')
          .eq('contact_id', lead.id)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .single()

        if (!conv) {
          console.log(`[FollowUp] No conversation found for contact ${lead.id}, skipping`)
          continue
        }

        const instanceId = conv.instance_id || lead.instance_id

        const message = `Olá ${nome}! Notei que você não conseguiu concluir seu pedido da safra de abril. Temos poucas porções de Pastrami e Bacon disponíveis. Quer que eu reserve para você ou tem alguma dúvida sobre a entrega?`

        // Enqueue message via send_queue
        const { error: sendError } = await supabase.from('send_queue').insert({
          conversation_id: conv.id,
          contact_id: lead.id,
          content: message,
          message_type: 'text',
          from_type: 'nina',
          status: 'pending',
          instance_id: instanceId,
          metadata: { automation: 'followup_engine', followup_type: 'rescue' },
        })

        if (sendError) {
          throw sendError
        }

        // Mark followup_sent = true in client_memory
        const currentMemory = (lead.client_memory as Record<string, any>) || {}
        const updatedMemory = { ...currentMemory, followup_sent: true, followup_sent_at: new Date().toISOString() }

        await supabase
          .from('contacts')
          .update({ client_memory: updatedMemory })
          .eq('id', lead.id)

        // Log execution
        await supabase.from('automation_executions').insert({
          automation_id: '00000000-0000-0000-0000-000000000001', // sentinel ID for followup engine
          contact_id: lead.id,
          conversation_id: conv.id,
          result: 'success',
          metadata: { type: 'followup_rescue', message_preview: message.substring(0, 80) },
        })

        sentCount++
        console.log(`[FollowUp] Sent follow-up to ${nome} (${lead.id})`)
      } catch (err) {
        errorCount++
        console.error(`[FollowUp] Error processing lead ${lead.id}:`, err)

        // Log error to audit_logs
        await supabase.from('audit_logs').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          action: 'followup_error',
          entity_type: 'followup',
          entity_id: lead.id,
          details: { error: (err as Error).message, contact_name: lead.name },
        }).catch(() => {})
      }
    }

    // === PHASE 2: Move stale follow-up leads to INACTIVE ===
    const cutoff48h = new Date(Date.now() - 48 * 3600000).toISOString()

    const { data: staleLeads } = await supabase
      .from('contacts')
      .select('id, client_memory, lead_state')
      .lt('last_activity', cutoff48h)
      .in('lead_state', ['NEW_LEAD', 'QUALIFIED'])
      .or('is_blocked.is.null,is_blocked.eq.false')

    const leadsToDeactivate = (staleLeads || []).filter(c => {
      const memory = c.client_memory as Record<string, any> || {}
      return memory.followup_sent === true
    })

    let deactivatedCount = 0

    for (const lead of leadsToDeactivate) {
      const { error } = await supabase
        .from('contacts')
        .update({ lead_state: 'INACTIVE', lead_state_updated_at: new Date().toISOString() })
        .eq('id', lead.id)

      if (!error) {
        // Record state change
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', lead.id)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        await supabase.from('lead_state_history').insert({
          contact_id: lead.id,
          conversation_id: conv?.id || null,
          estado_anterior: lead.lead_state,
          estado_novo: 'INACTIVE',
          motivo: 'Sem interação 48h após follow-up automático',
        })

        deactivatedCount++
      }
    }

    console.log(`[FollowUp] Summary: ${sentCount} sent, ${errorCount} errors, ${deactivatedCount} deactivated`)

    return new Response(JSON.stringify({
      followups_sent: sentCount,
      errors: errorCount,
      leads_deactivated: deactivatedCount,
      total_eligible: eligibleLeads.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[FollowUp] Fatal error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
