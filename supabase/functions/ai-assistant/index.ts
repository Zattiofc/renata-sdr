import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const tools = [
  {
    type: "function",
    function: {
      name: "query_contacts",
      description: "Buscar contatos no banco de dados. Pode filtrar por nome, telefone, status de lead, última atividade, tags, etc.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string", description: "Termo de busca (nome, telefone, email)" },
          lead_state: { type: "string", description: "Estado do lead: NEW_LEAD, ENGAGED, QUALIFIED, NEGOTIATING, WON, LOST, INACTIVE" },
          inactive_hours: { type: "number", description: "Filtrar contatos inativos há mais de X horas" },
          limit: { type: "number", description: "Número máximo de resultados (padrão 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_deals",
      description: "Buscar deals/negócios no pipeline. Pode filtrar por estágio, contato, valor, prioridade.",
      parameters: {
        type: "object",
        properties: {
          stage_name: { type: "string", description: "Nome do estágio do pipeline" },
          contact_name: { type: "string", description: "Nome do contato associado" },
          min_value: { type: "number", description: "Valor mínimo do deal" },
          priority: { type: "string", description: "Prioridade: low, medium, high" },
          stale_days: { type: "number", description: "Deals parados há mais de X dias" },
          limit: { type: "number", description: "Número máximo de resultados (padrão 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_stage",
      description: "Mover um deal para outro estágio do pipeline.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "ID do deal" },
          stage_name: { type: "string", description: "Nome do novo estágio" },
        },
        required: ["deal_id", "stage_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Enviar uma mensagem WhatsApp para um contato específico.",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Número do telefone do destinatário (com DDI)" },
          message: { type: "string", description: "Conteúdo da mensagem" },
          contact_name: { type: "string", description: "Nome do contato (para busca se phone_number não fornecido)" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_bulk_followup",
      description: "Enviar follow-up para múltiplos contatos de uma vez. Filtra contatos e envia mensagem personalizada.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            description: "Filtros para selecionar contatos",
            properties: {
              inactive_hours: { type: "number", description: "Inativos há mais de X horas" },
              lead_state: { type: "string", description: "Estado do lead" },
              tags: { type: "array", items: { type: "string" }, description: "Tags dos contatos" },
            },
          },
          message_template: { type: "string", description: "Template da mensagem. Use {name} para nome do contato." },
          max_recipients: { type: "number", description: "Máximo de destinatários (padrão 10)" },
        },
        required: ["message_template"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_inventory",
      description: "Consultar o estoque atual de produtos.",
      parameters: {
        type: "object",
        properties: {
          product_name: { type: "string", description: "Nome do produto para buscar" },
          low_stock_only: { type: "boolean", description: "Mostrar apenas produtos com estoque baixo" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_appointments",
      description: "Listar agendamentos/reuniões.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Data inicial (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Data final (YYYY-MM-DD)" },
          status: { type: "string", description: "Status: scheduled, completed, cancelled" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_conversations",
      description: "Buscar conversas recentes, sem resposta, ou por status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Status da conversa: nina, human, waiting, closed" },
          unanswered_hours: { type: "number", description: "Conversas sem resposta há mais de X horas" },
          contact_name: { type: "string", description: "Nome do contato" },
          limit: { type: "number", description: "Número máximo de resultados (padrão 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description: "Obter estatísticas gerais do sistema: total de contatos, deals, conversas ativas, etc.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// Tool execution functions
async function executeQueryContacts(supabase: any, args: any) {
  let query = supabase.from("contacts").select("id, name, call_name, phone_number, email, lead_state, last_activity, tags, empresa, cidade, resumo_vivo");
  
  if (args.search_term) {
    query = query.or(`name.ilike.%${args.search_term}%,call_name.ilike.%${args.search_term}%,phone_number.ilike.%${args.search_term}%,email.ilike.%${args.search_term}%`);
  }
  if (args.lead_state) query = query.eq("lead_state", args.lead_state);
  if (args.inactive_hours) {
    const cutoff = new Date(Date.now() - args.inactive_hours * 3600000).toISOString();
    query = query.lt("last_activity", cutoff);
  }
  
  const { data, error } = await query.order("last_activity", { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  return { contacts: data, count: data?.length || 0 };
}

async function executeQueryDeals(supabase: any, args: any) {
  let query = supabase.from("deals").select("id, title, value, priority, stage, stage_id, company, notes, tags, created_at, updated_at, contact_id, contacts(name, phone_number), pipeline_stages(title)");
  
  if (args.contact_name) {
    const { data: contacts } = await supabase.from("contacts").select("id").ilike("name", `%${args.contact_name}%`);
    if (contacts?.length) query = query.in("contact_id", contacts.map((c: any) => c.id));
    else return { deals: [], count: 0, message: "Nenhum contato encontrado com esse nome" };
  }
  if (args.priority) query = query.eq("priority", args.priority);
  if (args.min_value) query = query.gte("value", args.min_value);
  if (args.stale_days) {
    const cutoff = new Date(Date.now() - args.stale_days * 86400000).toISOString();
    query = query.lt("updated_at", cutoff);
  }
  if (args.stage_name) {
    const { data: stages } = await supabase.from("pipeline_stages").select("id").ilike("title", `%${args.stage_name}%`);
    if (stages?.length) query = query.in("stage_id", stages.map((s: any) => s.id));
  }
  
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  return { deals: data, count: data?.length || 0 };
}

async function executeUpdateDealStage(supabase: any, args: any) {
  const { data: stages } = await supabase.from("pipeline_stages").select("id, title").ilike("title", `%${args.stage_name}%`);
  if (!stages?.length) return { error: `Estágio "${args.stage_name}" não encontrado` };
  
  const stage = stages[0];
  const { error } = await supabase.from("deals").update({ stage_id: stage.id, stage: stage.title, updated_at: new Date().toISOString() }).eq("id", args.deal_id);
  if (error) return { error: error.message };
  return { success: true, message: `Deal movido para "${stage.title}"` };
}

async function executeSendWhatsAppMessage(supabase: any, args: any) {
  let phone = args.phone_number;
  
  if (!phone && args.contact_name) {
    const { data: contacts } = await supabase.from("contacts").select("phone_number, name").ilike("name", `%${args.contact_name}%`).limit(1);
    if (!contacts?.length) return { error: `Contato "${args.contact_name}" não encontrado` };
    phone = contacts[0].phone_number;
  }
  if (!phone) return { error: "Número de telefone ou nome do contato é necessário" };

  // Get default instance
  const { data: instance } = await supabase.from("whatsapp_instances").select("*").eq("is_default", true).single();
  const { data: settings } = await supabase.from("nina_settings").select("evolution_api_url, evolution_api_key").limit(1).single();
  
  if (!instance || !settings?.evolution_api_url) return { error: "Instância WhatsApp não configurada" };

  const cleanPhone = phone.replace(/\D/g, "");
  try {
    const resp = await fetch(`${settings.evolution_api_url}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: settings.evolution_api_key },
      body: JSON.stringify({ number: cleanPhone, text: args.message }),
    });
    const result = await resp.json();
    if (!resp.ok) return { error: `Falha ao enviar: ${JSON.stringify(result)}` };
    return { success: true, message: `Mensagem enviada para ${phone}` };
  } catch (e) {
    return { error: `Erro de conexão: ${e.message}` };
  }
}

async function executeSendBulkFollowup(supabase: any, args: any) {
  const filter = args.filter || {};
  let query = supabase.from("contacts").select("id, name, call_name, phone_number");
  
  if (filter.inactive_hours) {
    const cutoff = new Date(Date.now() - filter.inactive_hours * 3600000).toISOString();
    query = query.lt("last_activity", cutoff);
  }
  if (filter.lead_state) query = query.eq("lead_state", filter.lead_state);
  if (filter.tags?.length) query = query.overlaps("tags", filter.tags);
  
  const { data: contacts, error } = await query.limit(args.max_recipients || 10);
  if (error) return { error: error.message };
  if (!contacts?.length) return { message: "Nenhum contato encontrado com os filtros aplicados", count: 0 };

  const { data: instance } = await supabase.from("whatsapp_instances").select("*").eq("is_default", true).single();
  const { data: settings } = await supabase.from("nina_settings").select("evolution_api_url, evolution_api_key").limit(1).single();
  
  if (!instance || !settings?.evolution_api_url) return { error: "Instância WhatsApp não configurada" };

  const results: any[] = [];
  for (const contact of contacts) {
    const name = contact.call_name || contact.name || "Cliente";
    const msg = args.message_template.replace(/\{name\}/g, name);
    const cleanPhone = contact.phone_number.replace(/\D/g, "");
    
    try {
      const resp = await fetch(`${settings.evolution_api_url}/message/sendText/${instance.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: settings.evolution_api_key },
        body: JSON.stringify({ number: cleanPhone, text: msg }),
      });
      results.push({ contact: name, phone: contact.phone_number, status: resp.ok ? "enviado" : "falhou" });
      // Small delay between messages
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      results.push({ contact: name, phone: contact.phone_number, status: "erro", error: e.message });
    }
  }
  
  return { total: contacts.length, results };
}

async function executeCheckInventory(supabase: any, args: any) {
  let query = supabase.from("inventory").select("*").eq("is_active", true);
  if (args.product_name) query = query.ilike("product_name", `%${args.product_name}%`);
  if (args.low_stock_only) query = query.raw("quantity <= min_quantity");
  
  const { data, error } = await query.order("product_name");
  if (error) return { error: error.message };
  
  if (args.low_stock_only && data) {
    const lowStock = data.filter((i: any) => i.quantity <= i.min_quantity);
    return { products: lowStock, count: lowStock.length };
  }
  return { products: data, count: data?.length || 0 };
}

async function executeListAppointments(supabase: any, args: any) {
  let query = supabase.from("appointments").select("*, contacts(name, phone_number)");
  if (args.date_from) query = query.gte("date", args.date_from);
  if (args.date_to) query = query.lte("date", args.date_to);
  if (args.status) query = query.eq("status", args.status);
  
  const { data, error } = await query.order("date").order("time").limit(20);
  if (error) return { error: error.message };
  return { appointments: data, count: data?.length || 0 };
}

async function executeQueryConversations(supabase: any, args: any) {
  let query = supabase.from("conversations").select("id, status, last_message_at, is_active, tags, contacts(name, phone_number)");
  
  if (args.status) query = query.eq("status", args.status);
  if (args.unanswered_hours) {
    const cutoff = new Date(Date.now() - args.unanswered_hours * 3600000).toISOString();
    query = query.lt("last_message_at", cutoff).eq("is_active", true);
  }
  if (args.contact_name) {
    const { data: contacts } = await supabase.from("contacts").select("id").ilike("name", `%${args.contact_name}%`);
    if (contacts?.length) query = query.in("contact_id", contacts.map((c: any) => c.id));
  }
  
  const { data, error } = await query.order("last_message_at", { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  return { conversations: data, count: data?.length || 0 };
}

async function executeGetSystemStats(supabase: any) {
  const [contacts, deals, conversations, inventory, appointments] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("deals").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("inventory").select("id, quantity, min_quantity").eq("is_active", true),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
  ]);
  
  const lowStock = inventory.data?.filter((i: any) => i.quantity <= i.min_quantity)?.length || 0;
  
  return {
    total_contacts: contacts.count || 0,
    total_deals: deals.count || 0,
    active_conversations: conversations.count || 0,
    scheduled_appointments: appointments.count || 0,
    low_stock_items: lowStock,
    total_inventory_items: inventory.data?.length || 0,
  };
}

async function executeTool(supabase: any, name: string, args: any): Promise<any> {
  switch (name) {
    case "query_contacts": return executeQueryContacts(supabase, args);
    case "query_deals": return executeQueryDeals(supabase, args);
    case "update_deal_stage": return executeUpdateDealStage(supabase, args);
    case "send_whatsapp_message": return executeSendWhatsAppMessage(supabase, args);
    case "send_bulk_followup": return executeSendBulkFollowup(supabase, args);
    case "check_inventory": return executeCheckInventory(supabase, args);
    case "list_appointments": return executeListAppointments(supabase, args);
    case "query_conversations": return executeQueryConversations(supabase, args);
    case "get_system_stats": return executeGetSystemStats(supabase);
    default: return { error: `Tool "${name}" não encontrada` };
  }
}

const SYSTEM_PROMPT = `Você é o Assistente IA interno do sistema CRM/SDR. Você tem acesso completo ao banco de dados e pode executar ações no sistema.

## Suas capacidades:
- **Consultar contatos**: buscar por nome, telefone, estado, atividade
- **Consultar deals/pipeline**: ver negócios, filtrar por estágio, valor, prioridade
- **Mover deals**: alterar estágio no pipeline
- **Enviar mensagens WhatsApp**: enviar para contatos individuais
- **Follow-up em massa**: enviar mensagens para múltiplos contatos filtrados
- **Consultar estoque**: ver produtos, quantidades, alertas de estoque baixo
- **Ver agendamentos**: listar reuniões e compromissos
- **Consultar conversas**: ver conversas ativas, sem resposta, por status
- **Estatísticas do sistema**: visão geral de contatos, deals, conversas

## Regras:
1. Sempre use as tools disponíveis para buscar dados reais — nunca invente dados
2. Para ações destrutivas ou envios em massa, CONFIRME com o operador antes de executar
3. Apresente os dados de forma clara e organizada usando markdown (tabelas, listas)
4. Ao enviar mensagens, mostre claramente para quem foi enviado e o conteúdo
5. Use linguagem profissional mas amigável em português brasileiro
6. Se não encontrar dados, informe claramente e sugira alternativas
7. Quando mostrar contatos ou deals, inclua informações relevantes como telefone, status, valor

## Formato de resposta:
- Use **negrito** para destacar informações importantes
- Use tabelas markdown para listas de dados
- Use ✅ ❌ ⚠️ para indicar status de ações
- Seja conciso mas completo`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get configured model
    const { data: settings } = await supabase.from("nina_settings").select("ai_provider, ai_model_name").limit(1).single();
    let model = "google/gemini-3-flash-preview";
    if (settings?.ai_model_name) {
      const m = settings.ai_model_name;
      if (m.includes("/")) model = m;
      else if (settings.ai_provider === "openai") model = `openai/${m}`;
      else model = `google/${m}`;
    }

    // Conversation with tool calling loop
    let conversationMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const MAX_TOOL_ROUNDS = 5;
    let finalContent = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch(LOVABLE_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: conversationMessages, tools, tool_choice: "auto" }),
      });

      if (!response.ok) {
        const status = response.status;
        const errText = await response.text();
        console.error(`AI gateway error (${status}):`, errText);
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos no workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${status}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No response from AI");

      const assistantMsg = choice.message;
      conversationMessages.push(assistantMsg);

      // If no tool calls, we're done
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        finalContent = assistantMsg.content || "";
        break;
      }

      // Execute all tool calls
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs = {};
        try { fnArgs = JSON.parse(toolCall.function.arguments || "{}"); } catch {}
        
        console.log(`Executing tool: ${fnName}`, fnArgs);
        const result = await executeTool(supabase, fnName, fnArgs);
        
        conversationMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // If last round and still calling tools, force a text response
      if (round === MAX_TOOL_ROUNDS - 1) {
        finalContent = assistantMsg.content || "Processamento concluído. Verifique os resultados acima.";
      }
    }

    return new Response(JSON.stringify({ content: finalContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
