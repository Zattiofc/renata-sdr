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

    // Fetch active automations
    const { data: automations, error: autoError } = await supabase
      .from('automations')
      .select('*')
      .eq('is_active', true)

    if (autoError) throw autoError
    if (!automations?.length) {
      return new Response(JSON.stringify({ message: 'No active automations', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let totalExecuted = 0

    for (const automation of automations) {
      try {
        const executed = await processAutomation(supabase, automation)
        totalExecuted += executed
      } catch (err) {
        console.error(`Error processing automation ${automation.id}:`, err)
      }
    }

    return new Response(JSON.stringify({ processed: totalExecuted, automations: automations.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('run-automations error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function processAutomation(supabase: any, automation: any): Promise<number> {
  const { trigger_type, trigger_config, action_type, action_config, id, max_executions, cooldown_hours } = automation
  let executed = 0

  switch (trigger_type) {
    case 'no_reply':
      executed = await handleNoReply(supabase, automation)
      break
    case 'new_contact':
      executed = await handleNewContact(supabase, automation)
      break
    case 'lead_state_change':
      executed = await handleLeadStateChange(supabase, automation)
      break
    case 'tag_added':
      executed = await handleTagAdded(supabase, automation)
      break
  }

  return executed
}

async function canExecute(supabase: any, automationId: string, contactId: string, maxExec: number, cooldownHours: number): Promise<boolean> {
  // Check max executions per contact
  const { count: totalCount } = await supabase
    .from('automation_executions')
    .select('*', { count: 'exact', head: true })
    .eq('automation_id', automationId)
    .eq('contact_id', contactId)

  if ((totalCount || 0) >= maxExec) return false

  // Check cooldown
  const cooldownCutoff = new Date(Date.now() - cooldownHours * 3600000).toISOString()
  const { count: recentCount } = await supabase
    .from('automation_executions')
    .select('*', { count: 'exact', head: true })
    .eq('automation_id', automationId)
    .eq('contact_id', contactId)
    .gte('executed_at', cooldownCutoff)

  return (recentCount || 0) === 0
}

async function executeAction(supabase: any, automation: any, contactId: string, conversationId: string | null) {
  const { action_type, action_config, id } = automation

  try {
    switch (action_type) {
      case 'send_message': {
        if (!conversationId) break
        const message = action_config.message || 'Olá! Posso te ajudar?'
        
        // Get contact for send_queue
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id, instance_id')
          .eq('id', conversationId)
          .single()

        if (conv) {
          await supabase.from('send_queue').insert({
            conversation_id: conversationId,
            contact_id: conv.contact_id,
            content: message,
            message_type: 'text',
            from_type: 'nina',
            status: 'pending',
            instance_id: conv.instance_id,
            metadata: { automation_id: id, automated: true },
          })
        }
        break
      }
      case 'add_tag': {
        const tag = action_config.tag
        if (!tag) break
        const { data: contact } = await supabase
          .from('contacts')
          .select('tags')
          .eq('id', contactId)
          .single()
        
        const currentTags = contact?.tags || []
        if (!currentTags.includes(tag)) {
          await supabase
            .from('contacts')
            .update({ tags: [...currentTags, tag] })
            .eq('id', contactId)
        }
        break
      }
      case 'change_stage': {
        const stageId = action_config.stage_id
        if (!stageId) break
        await supabase
          .from('deals')
          .update({ stage_id: stageId })
          .eq('contact_id', contactId)
        break
      }
      case 'notify_team': {
        // Log as notification (could integrate with external service)
        console.log(`[NOTIFY] Automation ${id} triggered for contact ${contactId}: ${action_config.message || 'Atenção necessária'}`)
        break
      }
    }

    // Record execution
    await supabase.from('automation_executions').insert({
      automation_id: id,
      contact_id: contactId,
      conversation_id: conversationId,
      result: 'success',
      metadata: { action_type, action_config },
    })
  } catch (err) {
    await supabase.from('automation_executions').insert({
      automation_id: id,
      contact_id: contactId,
      conversation_id: conversationId,
      result: 'error',
      metadata: { error: err.message },
    })
  }
}

async function handleNoReply(supabase: any, automation: any): Promise<number> {
  const hours = automation.trigger_config.hours || 5
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString()

  // Find conversations where last message was from nina/human (not client) and older than X hours
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, contact_id, instance_id')
    .eq('is_active', true)
    .lt('last_message_at', cutoff)
    .in('status', ['nina', 'human'])

  if (!conversations?.length) return 0

  let count = 0
  for (const conv of conversations) {
    // Check last message is NOT from client
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('from_type')
      .eq('conversation_id', conv.id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single()

    if (lastMsg?.from_type === 'client') continue // client did reply

    const allowed = await canExecute(supabase, automation.id, conv.contact_id, automation.max_executions, automation.cooldown_hours)
    if (!allowed) continue

    await executeAction(supabase, automation, conv.contact_id, conv.id)
    count++
  }
  return count
}

async function handleNewContact(supabase: any, automation: any): Promise<number> {
  const minutesWindow = automation.trigger_config.minutes || 2
  const cutoff = new Date(Date.now() - minutesWindow * 60000).toISOString()

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .gte('created_at', cutoff)

  if (!contacts?.length) return 0

  let count = 0
  for (const contact of contacts) {
    const allowed = await canExecute(supabase, automation.id, contact.id, automation.max_executions, automation.cooldown_hours)
    if (!allowed) continue

    // Find conversation for this contact
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    await executeAction(supabase, automation, contact.id, conv?.id || null)
    count++
  }
  return count
}

async function handleLeadStateChange(supabase: any, automation: any): Promise<number> {
  const targetState = automation.trigger_config.target_state
  const minutesWindow = automation.trigger_config.minutes || 5
  const cutoff = new Date(Date.now() - minutesWindow * 60000).toISOString()

  let query = supabase
    .from('lead_state_history')
    .select('contact_id, conversation_id')
    .gte('created_at', cutoff)

  if (targetState) {
    query = query.eq('estado_novo', targetState)
  }

  const { data: changes } = await query

  if (!changes?.length) return 0

  let count = 0
  for (const change of changes) {
    const allowed = await canExecute(supabase, automation.id, change.contact_id, automation.max_executions, automation.cooldown_hours)
    if (!allowed) continue

    await executeAction(supabase, automation, change.contact_id, change.conversation_id)
    count++
  }
  return count
}

async function handleTagAdded(supabase: any, automation: any): Promise<number> {
  const targetTag = automation.trigger_config.tag
  if (!targetTag) return 0

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .contains('tags', [targetTag])

  if (!contacts?.length) return 0

  let count = 0
  for (const contact of contacts) {
    const allowed = await canExecute(supabase, automation.id, contact.id, automation.max_executions, automation.cooldown_hours)
    if (!allowed) continue

    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    await executeAction(supabase, automation, contact.id, conv?.id || null)
    count++
  }
  return count
}
