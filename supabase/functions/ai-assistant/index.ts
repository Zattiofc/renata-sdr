import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const tools = [
  // ===== CONTACTS =====
  {
    type: "function",
    function: {
      name: "query_contacts",
      description: "Buscar contatos no banco de dados. Pode filtrar por nome, telefone, status de lead, última atividade, tags, empresa, cidade.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string", description: "Termo de busca (nome, telefone, email)" },
          lead_state: { type: "string", description: "Estado do lead: NEW_LEAD, ENGAGED, QUALIFIED, NEGOTIATING, WON, LOST, INACTIVE" },
          inactive_hours: { type: "number", description: "Filtrar contatos inativos há mais de X horas" },
          tags: { type: "array", items: { type: "string" }, description: "Filtrar por tags" },
          limit: { type: "number", description: "Número máximo de resultados (padrão 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_contact",
      description: "Atualizar dados de um contato existente (nome, email, tags, notas, lead_state, empresa, cargo, cidade, estado, is_blocked).",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "ID do contato" },
          contact_name: { type: "string", description: "Nome do contato para busca (se não tiver ID)" },
          updates: {
            type: "object",
            description: "Campos a atualizar",
            properties: {
              name: { type: "string" },
              call_name: { type: "string" },
              email: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              lead_state: { type: "string" },
              empresa: { type: "string" },
              cargo: { type: "string" },
              cidade: { type: "string" },
              estado: { type: "string" },
              is_blocked: { type: "boolean" },
              blocked_reason: { type: "string" },
            },
          },
        },
        required: ["updates"],
      },
    },
  },
  // ===== DEALS / PIPELINE =====
  {
    type: "function",
    function: {
      name: "query_deals",
      description: "Buscar deals/negócios no pipeline. Pode filtrar por estágio, contato, valor, prioridade, tags.",
      parameters: {
        type: "object",
        properties: {
          stage_name: { type: "string", description: "Nome do estágio do pipeline" },
          contact_name: { type: "string", description: "Nome do contato associado" },
          min_value: { type: "number" },
          priority: { type: "string", description: "low, medium, high" },
          stale_days: { type: "number", description: "Deals parados há mais de X dias" },
          limit: { type: "number" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal",
      description: "Atualizar um deal: mover estágio, alterar valor, prioridade, tags, notas, marcar como ganho/perdido.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "ID do deal" },
          deal_title: { type: "string", description: "Título do deal para busca (se não tiver ID)" },
          updates: {
            type: "object",
            properties: {
              stage_name: { type: "string", description: "Nome do novo estágio" },
              value: { type: "number" },
              priority: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              mark_won: { type: "boolean" },
              mark_lost: { type: "boolean" },
              lost_reason: { type: "string" },
            },
          },
        },
        required: ["updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_pipeline_stages",
      description: "Listar, criar, atualizar ou reordenar estágios do pipeline de vendas.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update", "reorder"], description: "Ação a executar" },
          stage_id: { type: "string", description: "ID do estágio (para update)" },
          title: { type: "string", description: "Nome do estágio" },
          color: { type: "string", description: "Cor do estágio (ex: border-blue-500)" },
          position: { type: "number", description: "Posição no pipeline" },
          is_active: { type: "boolean" },
          ai_trigger_criteria: { type: "string", description: "Critérios para a IA mover deals para este estágio automaticamente" },
        },
        required: ["action"],
      },
    },
  },
  // ===== TEAM =====
  {
    type: "function",
    function: {
      name: "manage_team",
      description: "Gerenciar equipe: listar membros, funções, atualizar status, configurar recebimento de reuniões. Também gerencia funções (closer, SDR, etc).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_members", "list_functions", "update_member", "update_function", "create_function"], description: "Ação" },
          member_id: { type: "string" },
          function_id: { type: "string" },
          updates: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              status: { type: "string", enum: ["active", "inactive", "invited"] },
              receives_meetings: { type: "boolean" },
              function_id: { type: "string" },
              is_active: { type: "boolean" },
              description: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // ===== WHATSAPP MESSAGING =====
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Enviar uma mensagem WhatsApp para um contato específico.",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Número do telefone (com DDI)" },
          message: { type: "string", description: "Conteúdo da mensagem" },
          contact_name: { type: "string", description: "Nome do contato (para busca)" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_bulk_followup",
      description: "Enviar follow-up para múltiplos contatos. Filtra e envia mensagem personalizada com {name}.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            properties: {
              inactive_hours: { type: "number" },
              lead_state: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
          },
          message_template: { type: "string", description: "Use {name} para nome do contato" },
          max_recipients: { type: "number", description: "Máximo de destinatários (padrão 10)" },
        },
        required: ["message_template"],
      },
    },
  },
  // ===== INVENTORY =====
  {
    type: "function",
    function: {
      name: "manage_inventory",
      description: "Consultar, adicionar, atualizar estoque ou registrar movimentações (entrada/saída).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update", "add_stock", "remove_stock"], description: "Ação" },
          product_id: { type: "string" },
          product_name: { type: "string" },
          low_stock_only: { type: "boolean" },
          updates: {
            type: "object",
            properties: {
              product_name: { type: "string" },
              description: { type: "string" },
              sku: { type: "string" },
              price: { type: "number" },
              quantity: { type: "number" },
              min_quantity: { type: "number" },
              category: { type: "string" },
              unit: { type: "string" },
              is_active: { type: "boolean" },
            },
          },
          movement_quantity: { type: "number", description: "Quantidade para entrada/saída" },
          movement_reason: { type: "string", description: "Motivo da movimentação" },
        },
        required: ["action"],
      },
    },
  },
  // ===== APPOINTMENTS =====
  {
    type: "function",
    function: {
      name: "manage_appointments",
      description: "Listar, criar, atualizar ou cancelar agendamentos/reuniões.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update", "cancel"], description: "Ação" },
          appointment_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string" },
          status: { type: "string" },
          new_data: {
            type: "object",
            properties: {
              title: { type: "string" },
              date: { type: "string" },
              time: { type: "string" },
              duration: { type: "number" },
              description: { type: "string" },
              contact_name: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // ===== CONVERSATIONS =====
  {
    type: "function",
    function: {
      name: "manage_conversations",
      description: "Buscar conversas, alterar status (nina/human/waiting/closed), ver mensagens recentes de uma conversa.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "get_messages", "update_status"], description: "Ação" },
          conversation_id: { type: "string" },
          contact_name: { type: "string" },
          status: { type: "string", description: "nina, human, waiting, closed" },
          unanswered_hours: { type: "number" },
          new_status: { type: "string", description: "Novo status para a conversa" },
          limit: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  // ===== AUTOMATIONS =====
  {
    type: "function",
    function: {
      name: "manage_automations",
      description: "Listar, criar, ativar/desativar automações do sistema (follow-ups automáticos, etc).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "toggle", "delete"], description: "Ação" },
          automation_id: { type: "string" },
          new_data: {
            type: "object",
            properties: {
              name: { type: "string" },
              trigger_type: { type: "string", description: "no_reply, new_contact, lead_state_change, tag_added" },
              trigger_config: { type: "object" },
              action_type: { type: "string", description: "send_message, update_lead_state, assign_team, send_material" },
              action_config: { type: "object" },
              cooldown_hours: { type: "number" },
              max_executions: { type: "number" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // ===== MATERIALS =====
  {
    type: "function",
    function: {
      name: "manage_materials",
      description: "Listar, consultar materiais oficiais (folhetos, catálogos, vídeos) e logs de envio.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "list_send_logs"], description: "Ação" },
          search_term: { type: "string" },
          linha_negocio: { type: "string" },
          limit: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  // ===== NINA SETTINGS (FULL ACCESS) =====
  {
    type: "function",
    function: {
      name: "manage_nina_settings",
      description: "Consultar ou atualizar TODAS as configurações da IA/Nina: horário comercial, delays, modelo de IA, status, prompt do sistema, chaves de API, ElevenLabs, Evolution API, etc. Use action 'get' para ver tudo incluindo o system_prompt_override. Use action 'update' para alterar qualquer campo.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "update"], description: "Ação" },
          updates: {
            type: "object",
            description: "Qualquer campo da tabela nina_settings pode ser atualizado aqui",
            properties: {
              is_active: { type: "boolean" },
              auto_response_enabled: { type: "boolean" },
              company_name: { type: "string" },
              sdr_name: { type: "string" },
              business_hours_start: { type: "string" },
              business_hours_end: { type: "string" },
              business_days: { type: "array", items: { type: "number" } },
              response_delay_min: { type: "number" },
              response_delay_max: { type: "number" },
              message_breaking_enabled: { type: "boolean" },
              ai_scheduling_enabled: { type: "boolean" },
              system_prompt_override: { type: "string", description: "O prompt principal do sistema que a IA usa para responder clientes. Pode ser lido e editado livremente." },
              ai_provider: { type: "string", description: "Provedor de IA: google, openai, anthropic" },
              ai_model_name: { type: "string", description: "Nome do modelo de IA" },
              ai_model_mode: { type: "string" },
              adaptive_response_enabled: { type: "boolean" },
              audio_response_enabled: { type: "boolean" },
              elevenlabs_api_key: { type: "string" },
              elevenlabs_voice_id: { type: "string" },
              elevenlabs_model: { type: "string" },
              elevenlabs_stability: { type: "number" },
              elevenlabs_similarity_boost: { type: "number" },
              elevenlabs_style: { type: "number" },
              elevenlabs_speed: { type: "number" },
              elevenlabs_speaker_boost: { type: "boolean" },
              evolution_api_url: { type: "string" },
              evolution_api_key: { type: "string" },
              timezone: { type: "string" },
              route_all_to_receiver_enabled: { type: "boolean" },
              test_phone_numbers: { type: "object" },
              test_system_prompt: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // ===== KNOWLEDGE BASE =====
  {
    type: "function",
    function: {
      name: "manage_knowledge_base",
      description: "Consultar a base de conhecimento: listar arquivos, buscar chunks por termo, ver sugestões pendentes.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_files", "search_chunks", "list_suggestions"], description: "Ação" },
          search_term: { type: "string", description: "Termo para busca semântica nos chunks" },
          category: { type: "string" },
          status: { type: "string", description: "Status das sugestões: pending, approved, rejected" },
          limit: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  // ===== BROADCASTS =====
  {
    type: "function",
    function: {
      name: "manage_broadcasts",
      description: "Listar campanhas de broadcast e seus resultados.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_campaigns", "get_campaign_details"] },
          campaign_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  // ===== AUDIT / STATS =====
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description: "Obter estatísticas gerais do sistema: total de contatos, deals por estágio, conversas ativas, estoque, agendamentos, leads por estado.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "query_audit_logs",
      description: "Consultar logs de auditoria: alterações de configurações, ações executadas, etc.",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", description: "Tipo de entidade (nina_settings, pipeline, deal, etc)" },
          action: { type: "string", description: "Tipo de ação (update, create, delete)" },
          limit: { type: "number" },
        },
        required: [],
      },
    },
  },
  // ===== WHATSAPP INSTANCES =====
  {
    type: "function",
    function: {
      name: "manage_whatsapp_instances",
      description: "Listar instâncias WhatsApp configuradas, ver status de conexão.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "check_status"], description: "Ação" },
        },
        required: ["action"],
      },
    },
  },
  // ===== DESIGN SETTINGS =====
  {
    type: "function",
    function: {
      name: "manage_design_settings",
      description: "Consultar ou atualizar configurações visuais: cores, fontes, logo, nome exibido na sidebar, subtítulo.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "update"], description: "Ação" },
          updates: {
            type: "object",
            properties: {
              primary_color: { type: "string" },
              accent_color: { type: "string" },
              sidebar_bg_color: { type: "string" },
              sidebar_primary_color: { type: "string" },
              heading_font: { type: "string" },
              body_font: { type: "string" },
              company_display_name: { type: "string" },
              company_subtitle: { type: "string" },
              logo_url: { type: "string" },
              sidebar_identity_enabled: { type: "boolean" },
              sidebar_identity_font: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // ===== RAW DATABASE QUERY (READ) =====
  {
    type: "function",
    function: {
      name: "execute_database_query",
      description: "Executar uma query SELECT no banco de dados para ler qualquer dado. Use para consultas complexas, JOINs, aggregations, ou acessar tabelas que não têm uma tool específica. APENAS SELECT (leitura).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Query SQL SELECT a executar. Exemplos: 'SELECT * FROM send_queue ORDER BY created_at DESC LIMIT 10', 'SELECT COUNT(*) FROM messages WHERE from_type = \\'nina\\''" },
        },
        required: ["query"],
      },
    },
  },
  // ===== RAW DATABASE MUTATION =====
  {
    type: "function",
    function: {
      name: "execute_database_mutation",
      description: "Executar INSERT, UPDATE ou DELETE no banco de dados. Use para operações que não têm uma tool específica. CUIDADO: operações destrutivas. Sempre confirme com o operador antes de deletar dados.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Query SQL (INSERT/UPDATE/DELETE) a executar" },
        },
        required: ["query"],
      },
    },
  },
  // ===== NICHE PACKS =====
  {
    type: "function",
    function: {
      name: "manage_niche_packs",
      description: "Gerenciar pacotes de nicho: listar, criar, atualizar ou ativar/desativar packs de nicho com personas, dores, objeções, tom de voz, etc.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "get", "create", "update", "toggle"], description: "Ação" },
          pack_id: { type: "string" },
          updates: {
            type: "object",
            properties: {
              nome_nicho: { type: "string" },
              label: { type: "string" },
              icp_persona: { type: "string" },
              tom_de_voz: { type: "string" },
              dores_principais: { type: "array", items: { type: "string" } },
              objecoes_comuns: { type: "array", items: { type: "string" } },
              perguntas_qualificacao: { type: "array", items: { type: "string" } },
              ctas_preferenciais: { type: "array", items: { type: "string" } },
              provas_sociais_sugeridas: { type: "array", items: { type: "string" } },
              termos_proibidos: { type: "array", items: { type: "string" } },
              is_active: { type: "boolean" },
              is_default: { type: "boolean" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
];

// ========== TOOL EXECUTION FUNCTIONS ==========

async function executeQueryContacts(supabase: any, args: any) {
  let query = supabase.from("contacts").select("id, name, call_name, phone_number, email, lead_state, last_activity, tags, empresa, cidade, cargo, estado, resumo_vivo, is_blocked, notes");
  if (args.search_term) query = query.or(`name.ilike.%${args.search_term}%,call_name.ilike.%${args.search_term}%,phone_number.ilike.%${args.search_term}%,email.ilike.%${args.search_term}%`);
  if (args.lead_state) query = query.eq("lead_state", args.lead_state);
  if (args.inactive_hours) query = query.lt("last_activity", new Date(Date.now() - args.inactive_hours * 3600000).toISOString());
  if (args.tags?.length) query = query.overlaps("tags", args.tags);
  const { data, error } = await query.order("last_activity", { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  return { contacts: data, count: data?.length || 0 };
}

async function executeUpdateContact(supabase: any, args: any) {
  let contactId = args.contact_id;
  if (!contactId && args.contact_name) {
    const { data } = await supabase.from("contacts").select("id, name").ilike("name", `%${args.contact_name}%`).limit(1);
    if (!data?.length) return { error: `Contato "${args.contact_name}" não encontrado` };
    contactId = data[0].id;
  }
  if (!contactId) return { error: "contact_id ou contact_name necessário" };
  const updates = { ...args.updates, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("contacts").update(updates).eq("id", contactId);
  if (error) return { error: error.message };
  return { success: true, message: "Contato atualizado" };
}

async function executeQueryDeals(supabase: any, args: any) {
  let query = supabase.from("deals").select("id, title, value, priority, stage, stage_id, company, notes, tags, created_at, updated_at, lost_reason, won_at, lost_at, qualification_score, contact_id, contacts(name, phone_number), pipeline_stages(title, color)");
  if (args.contact_name) {
    const { data: c } = await supabase.from("contacts").select("id").ilike("name", `%${args.contact_name}%`);
    if (c?.length) query = query.in("contact_id", c.map((x: any) => x.id));
    else return { deals: [], count: 0 };
  }
  if (args.priority) query = query.eq("priority", args.priority);
  if (args.min_value) query = query.gte("value", args.min_value);
  if (args.stale_days) query = query.lt("updated_at", new Date(Date.now() - args.stale_days * 86400000).toISOString());
  if (args.stage_name) {
    const { data: s } = await supabase.from("pipeline_stages").select("id").ilike("title", `%${args.stage_name}%`);
    if (s?.length) query = query.in("stage_id", s.map((x: any) => x.id));
  }
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  return { deals: data, count: data?.length || 0 };
}

async function executeUpdateDeal(supabase: any, args: any) {
  let dealId = args.deal_id;
  if (!dealId && args.deal_title) {
    const { data } = await supabase.from("deals").select("id").ilike("title", `%${args.deal_title}%`).limit(1);
    if (!data?.length) return { error: `Deal "${args.deal_title}" não encontrado` };
    dealId = data[0].id;
  }
  if (!dealId) return { error: "deal_id ou deal_title necessário" };

  const u: any = { updated_at: new Date().toISOString() };
  const upd = args.updates;
  if (upd.stage_name) {
    const { data: s } = await supabase.from("pipeline_stages").select("id, title").ilike("title", `%${upd.stage_name}%`);
    if (!s?.length) return { error: `Estágio "${upd.stage_name}" não encontrado` };
    u.stage_id = s[0].id; u.stage = s[0].title;
  }
  if (upd.value !== undefined) u.value = upd.value;
  if (upd.priority) u.priority = upd.priority;
  if (upd.tags) u.tags = upd.tags;
  if (upd.notes) u.notes = upd.notes;
  if (upd.mark_won) u.won_at = new Date().toISOString();
  if (upd.mark_lost) { u.lost_at = new Date().toISOString(); u.lost_reason = upd.lost_reason || null; }

  const { error } = await supabase.from("deals").update(u).eq("id", dealId);
  if (error) return { error: error.message };
  return { success: true, message: "Deal atualizado" };
}

async function executeManagePipelineStages(supabase: any, args: any) {
  if (args.action === "list") {
    const { data, error } = await supabase.from("pipeline_stages").select("*").order("position");
    if (error) return { error: error.message };
    return { stages: data, count: data?.length || 0 };
  }
  if (args.action === "create") {
    const { data: existing } = await supabase.from("pipeline_stages").select("position").order("position", { ascending: false }).limit(1);
    const pos = args.position ?? ((existing?.[0]?.position || 0) + 1);
    const { data, error } = await supabase.from("pipeline_stages").insert({ title: args.title, color: args.color || "border-slate-500", position: pos, is_active: true, ai_trigger_criteria: args.ai_trigger_criteria || null }).select().single();
    if (error) return { error: error.message };
    return { success: true, stage: data };
  }
  if (args.action === "update" && args.stage_id) {
    const u: any = {};
    if (args.title) u.title = args.title;
    if (args.color) u.color = args.color;
    if (args.position !== undefined) u.position = args.position;
    if (args.is_active !== undefined) u.is_active = args.is_active;
    if (args.ai_trigger_criteria !== undefined) u.ai_trigger_criteria = args.ai_trigger_criteria;
    const { error } = await supabase.from("pipeline_stages").update(u).eq("id", args.stage_id);
    if (error) return { error: error.message };
    return { success: true, message: "Estágio atualizado" };
  }
  return { error: "Parâmetros inválidos" };
}

async function executeManageTeam(supabase: any, args: any) {
  if (args.action === "list_members") {
    const { data, error } = await supabase.from("team_members").select("*, team_functions(name)").order("created_at");
    if (error) return { error: error.message };
    return { members: data, count: data?.length || 0 };
  }
  if (args.action === "list_functions") {
    const { data, error } = await supabase.from("team_functions").select("*").order("name");
    if (error) return { error: error.message };
    return { functions: data, count: data?.length || 0 };
  }
  if (args.action === "update_member" && args.member_id) {
    const { error } = await supabase.from("team_members").update(args.updates).eq("id", args.member_id);
    if (error) return { error: error.message };
    return { success: true, message: "Membro atualizado" };
  }
  if (args.action === "update_function" && args.function_id) {
    const { error } = await supabase.from("team_functions").update(args.updates).eq("id", args.function_id);
    if (error) return { error: error.message };
    return { success: true, message: "Função atualizada" };
  }
  if (args.action === "create_function") {
    const { data, error } = await supabase.from("team_functions").insert({ name: args.updates?.name, description: args.updates?.description, is_active: true }).select().single();
    if (error) return { error: error.message };
    return { success: true, function: data };
  }
  return { error: "Ação inválida" };
}

async function executeSendWhatsAppMessage(supabase: any, args: any) {
  let phone = args.phone_number;
  if (!phone && args.contact_name) {
    const { data } = await supabase.from("contacts").select("phone_number, name").ilike("name", `%${args.contact_name}%`).limit(1);
    if (!data?.length) return { error: `Contato "${args.contact_name}" não encontrado` };
    phone = data[0].phone_number;
  }
  if (!phone) return { error: "Número ou nome do contato necessário" };
  const { data: instance } = await supabase.from("whatsapp_instances").select("*").eq("is_default", true).single();
  const { data: settings } = await supabase.from("nina_settings").select("evolution_api_url, evolution_api_key").limit(1).single();
  if (!instance || !settings?.evolution_api_url) return { error: "WhatsApp não configurado" };
  try {
    const resp = await fetch(`${settings.evolution_api_url}/message/sendText/${instance.instance_name}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: settings.evolution_api_key },
      body: JSON.stringify({ number: phone.replace(/\D/g, ""), text: args.message }),
    });
    if (!resp.ok) return { error: `Falha: ${await resp.text()}` };
    return { success: true, message: `Mensagem enviada para ${phone}` };
  } catch (e) { return { error: (e as Error).message }; }
}

async function executeSendBulkFollowup(supabase: any, args: any) {
  const f = args.filter || {};
  let query = supabase.from("contacts").select("id, name, call_name, phone_number");
  if (f.inactive_hours) query = query.lt("last_activity", new Date(Date.now() - f.inactive_hours * 3600000).toISOString());
  if (f.lead_state) query = query.eq("lead_state", f.lead_state);
  if (f.tags?.length) query = query.overlaps("tags", f.tags);
  const { data: contacts, error } = await query.limit(args.max_recipients || 10);
  if (error) return { error: error.message };
  if (!contacts?.length) return { message: "Nenhum contato encontrado", count: 0 };

  const { data: instance } = await supabase.from("whatsapp_instances").select("*").eq("is_default", true).single();
  const { data: settings } = await supabase.from("nina_settings").select("evolution_api_url, evolution_api_key").limit(1).single();
  if (!instance || !settings?.evolution_api_url) return { error: "WhatsApp não configurado" };

  const results: any[] = [];
  for (const c of contacts) {
    const name = c.call_name || c.name || "Cliente";
    const msg = args.message_template.replace(/\{name\}/g, name);
    try {
      const resp = await fetch(`${settings.evolution_api_url}/message/sendText/${instance.instance_name}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: settings.evolution_api_key },
        body: JSON.stringify({ number: c.phone_number.replace(/\D/g, ""), text: msg }),
      });
      results.push({ contact: name, phone: c.phone_number, status: resp.ok ? "enviado" : "falhou" });
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) { results.push({ contact: name, phone: c.phone_number, status: "erro" }); }
  }
  return { total: contacts.length, results };
}

async function executeManageInventory(supabase: any, args: any) {
  if (args.action === "list") {
    let query = supabase.from("inventory").select("*").eq("is_active", true);
    if (args.product_name) query = query.ilike("product_name", `%${args.product_name}%`);
    const { data, error } = await query.order("product_name");
    if (error) return { error: error.message };
    const items = args.low_stock_only ? data?.filter((i: any) => i.quantity <= i.min_quantity) : data;
    return { products: items, count: items?.length || 0 };
  }
  if (args.action === "create") {
    const { data, error } = await supabase.from("inventory").insert(args.updates).select().single();
    if (error) return { error: error.message };
    return { success: true, product: data };
  }
  if (args.action === "update") {
    let id = args.product_id;
    if (!id && args.product_name) {
      const { data } = await supabase.from("inventory").select("id").ilike("product_name", `%${args.product_name}%`).limit(1);
      if (!data?.length) return { error: "Produto não encontrado" };
      id = data[0].id;
    }
    const { error } = await supabase.from("inventory").update({ ...args.updates, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { error: error.message };
    return { success: true, message: "Produto atualizado" };
  }
  if (args.action === "add_stock" || args.action === "remove_stock") {
    let id = args.product_id;
    if (!id && args.product_name) {
      const { data } = await supabase.from("inventory").select("id, quantity").ilike("product_name", `%${args.product_name}%`).limit(1);
      if (!data?.length) return { error: "Produto não encontrado" };
      id = data[0].id;
    }
    const qty = args.movement_quantity || 0;
    const type = args.action === "add_stock" ? "in" : "out";
    const { error: movErr } = await supabase.from("inventory_movements").insert({ inventory_id: id, type, quantity: qty, reason: args.movement_reason || "Ajuste manual via assistente", created_by: "ai-assistant" });
    if (movErr) return { error: movErr.message };
    const { data: prod } = await supabase.from("inventory").select("quantity").eq("id", id).single();
    const newQty = type === "in" ? (prod?.quantity || 0) + qty : Math.max(0, (prod?.quantity || 0) - qty);
    await supabase.from("inventory").update({ quantity: newQty, updated_at: new Date().toISOString() }).eq("id", id);
    return { success: true, message: `${type === "in" ? "Entrada" : "Saída"} de ${qty} unidades registrada. Novo estoque: ${newQty}` };
  }
  return { error: "Ação inválida" };
}

async function executeManageAppointments(supabase: any, args: any) {
  if (args.action === "list") {
    let query = supabase.from("appointments").select("*, contacts(name, phone_number)");
    if (args.date_from) query = query.gte("date", args.date_from);
    if (args.date_to) query = query.lte("date", args.date_to);
    if (args.status) query = query.eq("status", args.status);
    const { data, error } = await query.order("date").order("time").limit(20);
    if (error) return { error: error.message };
    return { appointments: data, count: data?.length || 0 };
  }
  if (args.action === "create") {
    const d = args.new_data;
    let contactId = null;
    if (d?.contact_name) {
      const { data: c } = await supabase.from("contacts").select("id").ilike("name", `%${d.contact_name}%`).limit(1);
      if (c?.length) contactId = c[0].id;
    }
    const { data, error } = await supabase.from("appointments").insert({
      title: d?.title || "Reunião", date: d?.date, time: d?.time || "10:00",
      duration: d?.duration || 60, description: d?.description, contact_id: contactId,
    }).select().single();
    if (error) return { error: error.message };
    return { success: true, appointment: data };
  }
  if (args.action === "update" && args.appointment_id) {
    const { error } = await supabase.from("appointments").update(args.new_data).eq("id", args.appointment_id);
    if (error) return { error: error.message };
    return { success: true, message: "Agendamento atualizado" };
  }
  if (args.action === "cancel" && args.appointment_id) {
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", args.appointment_id);
    if (error) return { error: error.message };
    return { success: true, message: "Agendamento cancelado" };
  }
  return { error: "Ação inválida" };
}

async function executeManageConversations(supabase: any, args: any) {
  if (args.action === "list") {
    let query = supabase.from("conversations").select("id, status, last_message_at, is_active, tags, assigned_team, contacts(name, phone_number, lead_state)");
    if (args.status) query = query.eq("status", args.status);
    if (args.unanswered_hours) query = query.lt("last_message_at", new Date(Date.now() - args.unanswered_hours * 3600000).toISOString()).eq("is_active", true);
    if (args.contact_name) {
      const { data: c } = await supabase.from("contacts").select("id").ilike("name", `%${args.contact_name}%`);
      if (c?.length) query = query.in("contact_id", c.map((x: any) => x.id));
    }
    const { data, error } = await query.order("last_message_at", { ascending: false }).limit(args.limit || 20);
    if (error) return { error: error.message };
    return { conversations: data, count: data?.length || 0 };
  }
  if (args.action === "get_messages" && args.conversation_id) {
    const { data, error } = await supabase.from("messages").select("content, from_type, type, sent_at, media_type").eq("conversation_id", args.conversation_id).order("sent_at", { ascending: false }).limit(args.limit || 30);
    if (error) return { error: error.message };
    return { messages: data?.reverse(), count: data?.length || 0 };
  }
  if (args.action === "update_status" && args.conversation_id && args.new_status) {
    const { error } = await supabase.from("conversations").update({ status: args.new_status, updated_at: new Date().toISOString() }).eq("id", args.conversation_id);
    if (error) return { error: error.message };
    return { success: true, message: `Conversa atualizada para "${args.new_status}"` };
  }
  return { error: "Ação inválida" };
}

async function executeManageAutomations(supabase: any, args: any) {
  if (args.action === "list") {
    const { data, error } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
    if (error) return { error: error.message };
    return { automations: data, count: data?.length || 0 };
  }
  if (args.action === "create" && args.new_data) {
    const { data, error } = await supabase.from("automations").insert(args.new_data).select().single();
    if (error) return { error: error.message };
    return { success: true, automation: data };
  }
  if (args.action === "toggle" && args.automation_id) {
    const { data: a } = await supabase.from("automations").select("is_active").eq("id", args.automation_id).single();
    const { error } = await supabase.from("automations").update({ is_active: !a?.is_active }).eq("id", args.automation_id);
    if (error) return { error: error.message };
    return { success: true, message: `Automação ${!a?.is_active ? "ativada" : "desativada"}` };
  }
  if (args.action === "delete" && args.automation_id) {
    const { error } = await supabase.from("automations").delete().eq("id", args.automation_id);
    if (error) return { error: error.message };
    return { success: true, message: "Automação removida" };
  }
  return { error: "Ação inválida" };
}

async function executeManageMaterials(supabase: any, args: any) {
  if (args.action === "list") {
    let query = supabase.from("official_materials").select("id, titulo, tipo, linha_negocio, produto_relacionado, status, versao, arquivo_url, data_publicacao, tags");
    if (args.search_term) query = query.or(`titulo.ilike.%${args.search_term}%,produto_relacionado.ilike.%${args.search_term}%`);
    if (args.linha_negocio) query = query.eq("linha_negocio", args.linha_negocio);
    const { data, error } = await query.eq("status", "ativo").order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return { error: error.message };
    return { materials: data, count: data?.length || 0 };
  }
  if (args.action === "list_send_logs") {
    const { data, error } = await supabase.from("material_send_logs").select("*, contacts(name), official_materials(titulo)").order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return { error: error.message };
    return { logs: data, count: data?.length || 0 };
  }
  return { error: "Ação inválida" };
}

async function executeManageNinaSettings(supabase: any, args: any) {
  if (args.action === "get") {
    // Return ALL fields so the assistant can read everything including the prompt
    const { data, error } = await supabase.from("nina_settings").select("*").limit(1).single();
    if (error) return { error: error.message };
    // Mask sensitive keys partially for display but still show them
    return { settings: data };
  }
  if (args.action === "update") {
    const { error } = await supabase.from("nina_settings").update({ ...args.updates, updated_at: new Date().toISOString() }).not("id", "is", null);
    if (error) return { error: error.message };
    return { success: true, message: "Configurações atualizadas com sucesso" };
  }
  return { error: "Ação inválida" };
}

async function executeManageKnowledgeBase(supabase: any, args: any) {
  if (args.action === "list_files") {
    const { data, error } = await supabase.from("knowledge_files").select("*").order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return { error: error.message };
    return { files: data, count: data?.length || 0 };
  }
  if (args.action === "search_chunks" && args.search_term) {
    const { data, error } = await supabase.from("knowledge_chunks").select("id, content, category, chunk_index, usage_count, file_id, knowledge_files(file_name)").ilike("content", `%${args.search_term}%`).limit(args.limit || 10);
    if (error) return { error: error.message };
    return { chunks: data, count: data?.length || 0 };
  }
  if (args.action === "list_suggestions") {
    let query = supabase.from("knowledge_suggestions").select("*");
    if (args.status) query = query.eq("status", args.status);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return { error: error.message };
    return { suggestions: data, count: data?.length || 0 };
  }
  return { error: "Ação inválida" };
}

async function executeManageBroadcasts(supabase: any, args: any) {
  if (args.action === "list_campaigns") {
    const { data, error } = await supabase.from("broadcast_campaigns").select("id, name, status, total_recipients, sent_count, failed_count, created_at, started_at, completed_at").order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return { error: error.message };
    return { campaigns: data, count: data?.length || 0 };
  }
  if (args.action === "get_campaign_details" && args.campaign_id) {
    const { data: campaign } = await supabase.from("broadcast_campaigns").select("*").eq("id", args.campaign_id).single();
    const { data: recipients } = await supabase.from("broadcast_recipients").select("phone_number, status, error_message, sent_at").eq("campaign_id", args.campaign_id).limit(50);
    return { campaign, recipients, recipients_count: recipients?.length || 0 };
  }
  return { error: "Ação inválida" };
}

async function executeGetSystemStats(supabase: any) {
  const [contacts, deals, conversations, inventory, appointments, leadStates, stageStats] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("deals").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("inventory").select("id, quantity, min_quantity").eq("is_active", true),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("contacts").select("lead_state"),
    supabase.from("deals").select("stage_id, pipeline_stages(title)"),
  ]);
  const lowStock = inventory.data?.filter((i: any) => i.quantity <= i.min_quantity)?.length || 0;
  const leadsByState: Record<string, number> = {};
  leadStates.data?.forEach((c: any) => { leadsByState[c.lead_state || 'UNKNOWN'] = (leadsByState[c.lead_state || 'UNKNOWN'] || 0) + 1; });
  const dealsByStage: Record<string, number> = {};
  stageStats.data?.forEach((d: any) => { const s = d.pipeline_stages?.title || 'Sem estágio'; dealsByStage[s] = (dealsByStage[s] || 0) + 1; });

  return {
    total_contacts: contacts.count || 0,
    total_deals: deals.count || 0,
    active_conversations: conversations.count || 0,
    scheduled_appointments: appointments.count || 0,
    low_stock_items: lowStock,
    total_inventory_items: inventory.data?.length || 0,
    leads_by_state: leadsByState,
    deals_by_stage: dealsByStage,
  };
}

async function executeQueryAuditLogs(supabase: any, args: any) {
  let query = supabase.from("audit_logs").select("*");
  if (args.entity_type) query = query.eq("entity_type", args.entity_type);
  if (args.action) query = query.eq("action", args.action);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  return { logs: data, count: data?.length || 0 };
}

async function executeManageWhatsAppInstances(supabase: any, args: any) {
  if (args.action === "list") {
    const { data, error } = await supabase.from("whatsapp_instances").select("*").order("created_at");
    if (error) return { error: error.message };
    return { instances: data, count: data?.length || 0 };
  }
  if (args.action === "check_status") {
    const { data: instances } = await supabase.from("whatsapp_instances").select("*");
    const { data: settings } = await supabase.from("nina_settings").select("evolution_api_url, evolution_api_key").limit(1).single();
    if (!settings?.evolution_api_url) return { error: "Evolution API não configurada" };
    const results: any[] = [];
    for (const inst of instances || []) {
      try {
        const resp = await fetch(`${settings.evolution_api_url}/instance/connectionState/${inst.instance_name}`, {
          headers: { apikey: settings.evolution_api_key },
        });
        const data = await resp.json();
        results.push({ name: inst.instance_name, is_default: inst.is_default, status: data?.instance?.state || "unknown" });
      } catch { results.push({ name: inst.instance_name, status: "error" }); }
    }
    return { instances: results };
  }
  return { error: "Ação inválida" };
}

async function executeManageDesignSettings(supabase: any, args: any) {
  if (args.action === "get") {
    const { data, error } = await supabase.from("design_settings").select("*").limit(1).single();
    if (error) return { error: error.message };
    return { settings: data };
  }
  if (args.action === "update") {
    const { error } = await supabase.from("design_settings").update({ ...args.updates, updated_at: new Date().toISOString() }).not("id", "is", null);
    if (error) return { error: error.message };
    return { success: true, message: "Configurações visuais atualizadas" };
  }
  return { error: "Ação inválida" };
}

async function executeDatabaseQuery(supabase: any, args: any) {
  const query = (args.query || "").trim();
  if (!query) return { error: "Query vazia" };
  
  // Only allow SELECT for the read-only tool
  const normalized = query.replace(/\s+/g, " ").toUpperCase();
  if (!normalized.startsWith("SELECT")) {
    return { error: "Apenas queries SELECT são permitidas nesta tool. Use execute_database_mutation para INSERT/UPDATE/DELETE." };
  }
  
  try {
    const { data, error } = await supabase.rpc("execute_readonly_query", { sql_query: query });
    if (error) {
      // Fallback: try using postgrest directly via raw SQL
      // This won't work with supabase-js, so we use the REST API
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_readonly_query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        body: JSON.stringify({ sql_query: query }),
      });
      if (!resp.ok) {
        // If function doesn't exist, try a simpler approach with known tables
        return { error: `Query falhou: ${error.message}. Dica: use as tools específicas (query_contacts, query_deals, etc) ou peça ao admin para criar a função execute_readonly_query.` };
      }
      const result = await resp.json();
      return { data: result, count: Array.isArray(result) ? result.length : 1 };
    }
    return { data, count: Array.isArray(data) ? data.length : 1 };
  } catch (e) {
    return { error: `Erro: ${(e as Error).message}` };
  }
}

async function executeDatabaseMutation(supabase: any, args: any) {
  const query = (args.query || "").trim();
  if (!query) return { error: "Query vazia" };
  
  const normalized = query.replace(/\s+/g, " ").toUpperCase();
  // Block dangerous operations
  if (normalized.includes("DROP TABLE") || normalized.includes("DROP SCHEMA") || normalized.includes("TRUNCATE") || normalized.includes("ALTER TABLE")) {
    return { error: "Operações DDL (DROP, ALTER, TRUNCATE) não são permitidas. Use apenas INSERT, UPDATE, DELETE." };
  }
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_mutation_query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ sql_query: query }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { error: `Mutation falhou: ${body}. Use as tools específicas (update_contact, update_deal, etc) como alternativa.` };
    }
    const result = await resp.json();
    return { success: true, result, message: "Query executada com sucesso" };
  } catch (e) {
    return { error: `Erro: ${(e as Error).message}` };
  }
}

async function executeManageNichePacks(supabase: any, args: any) {
  if (args.action === "list") {
    const { data, error } = await supabase.from("niche_packs").select("*").order("created_at", { ascending: false });
    if (error) return { error: error.message };
    return { packs: data, count: data?.length || 0 };
  }
  if (args.action === "get" && args.pack_id) {
    const { data, error } = await supabase.from("niche_packs").select("*").eq("id", args.pack_id).single();
    if (error) return { error: error.message };
    return { pack: data };
  }
  if (args.action === "create") {
    const { data, error } = await supabase.from("niche_packs").insert(args.updates).select().single();
    if (error) return { error: error.message };
    return { success: true, pack: data };
  }
  if (args.action === "update" && args.pack_id) {
    const { error } = await supabase.from("niche_packs").update({ ...args.updates, updated_at: new Date().toISOString() }).eq("id", args.pack_id);
    if (error) return { error: error.message };
    return { success: true, message: "Pack atualizado" };
  }
  if (args.action === "toggle" && args.pack_id) {
    const { data: p } = await supabase.from("niche_packs").select("is_active").eq("id", args.pack_id).single();
    const { error } = await supabase.from("niche_packs").update({ is_active: !p?.is_active }).eq("id", args.pack_id);
    if (error) return { error: error.message };
    return { success: true, message: `Pack ${!p?.is_active ? "ativado" : "desativado"}` };
  }
  return { error: "Ação inválida" };
}

async function executeTool(supabase: any, name: string, args: any): Promise<any> {
  const map: Record<string, Function> = {
    query_contacts: executeQueryContacts,
    update_contact: executeUpdateContact,
    query_deals: executeQueryDeals,
    update_deal: executeUpdateDeal,
    manage_pipeline_stages: executeManagePipelineStages,
    manage_team: executeManageTeam,
    send_whatsapp_message: executeSendWhatsAppMessage,
    send_bulk_followup: executeSendBulkFollowup,
    manage_inventory: executeManageInventory,
    manage_appointments: executeManageAppointments,
    manage_conversations: executeManageConversations,
    manage_automations: executeManageAutomations,
    manage_materials: executeManageMaterials,
    manage_nina_settings: executeManageNinaSettings,
    manage_knowledge_base: executeManageKnowledgeBase,
    manage_broadcasts: executeManageBroadcasts,
    get_system_stats: executeGetSystemStats,
    query_audit_logs: executeQueryAuditLogs,
    manage_whatsapp_instances: executeManageWhatsAppInstances,
    manage_design_settings: executeManageDesignSettings,
    execute_database_query: executeDatabaseQuery,
    execute_database_mutation: executeDatabaseMutation,
    manage_niche_packs: executeManageNichePacks,
  };
  const fn = map[name];
  if (!fn) return { error: `Tool "${name}" não encontrada` };
  return fn(supabase, args);
}

const SYSTEM_PROMPT = `Você é o Assistente IA interno — o centro de comando ABSOLUTO do sistema CRM/SDR. Você tem AUTONOMIA TOTAL e acesso COMPLETO a TUDO no sistema. Nada está fora do seu alcance.

## 🔓 AUTONOMIA TOTAL — Suas capacidades:

### 📇 Contatos
- Buscar, filtrar e atualizar contatos (nome, email, tags, lead_state, empresa, cargo, etc)
- Bloquear/desbloquear contatos
- Ver resumo vivo e notas de cada contato

### 📊 Pipeline / Deals
- Consultar deals por estágio, valor, prioridade, contato
- Mover deals entre estágios
- Atualizar valor, prioridade, tags, notas
- Marcar como ganho ou perdido (com motivo)
- Gerenciar estágios do pipeline (criar, editar, reordenar, definir critérios IA)

### 👥 Equipe
- Listar membros e suas funções (closer, SDR, etc)
- Atualizar status, configurar recebimento de reuniões
- Criar/editar funções da equipe

### 💬 Conversas & WhatsApp
- Buscar conversas por status, contato, tempo sem resposta
- Ver histórico de mensagens de uma conversa
- Alterar status (nina/human/waiting/closed)
- Enviar mensagens WhatsApp individuais ou em massa (follow-up)
- Ver status das instâncias WhatsApp

### 📦 Estoque
- Consultar produtos, preços, quantidades
- Adicionar/remover estoque com movimentação registrada
- Criar/editar produtos
- Alertas de estoque baixo

### 📅 Agendamentos
- Listar, criar, atualizar ou cancelar reuniões
- Filtrar por data e status

### ⚡ Automações
- Listar automações configuradas
- Criar novas automações (follow-up, mudança de estado, etc)
- Ativar/desativar automações

### 📚 Base de Conhecimento
- Listar arquivos da base
- Buscar conteúdo nos chunks
- Ver sugestões de conhecimento pendentes

### 📡 Broadcasts
- Listar campanhas e resultados
- Ver detalhes de destinatários

### ⚙️ Configurações COMPLETAS do Sistema
- **LER E EDITAR O PROMPT DO SISTEMA** (system_prompt_override) — pode ler o prompt atual inteiro e modificá-lo
- Alterar provedor e modelo de IA (ai_provider, ai_model_name)
- Configurar horário comercial, delays, delays de resposta
- Configurar Evolution API (url, key)
- Configurar ElevenLabs (voz, modelo, parâmetros)
- Ativar/desativar resposta automática, áudio, agendamento IA
- Alterar nome da empresa e do SDR
- Configurar timezone, message breaking, route_all_to_receiver
- **Qualquer campo da tabela nina_settings pode ser lido e alterado**

### 🎨 Design & Visual
- Ler e alterar cores, fontes, logo
- Alterar nome exibido na sidebar e subtítulo
- Configurar identidade visual da sidebar

### 🗄️ Acesso Direto ao Banco de Dados
- **execute_database_query**: executar qualquer SELECT no banco para consultas complexas, JOINs, aggregations
- **execute_database_mutation**: executar INSERT, UPDATE, DELETE para qualquer operação que não tenha tool específica

### 🏷️ Pacotes de Nicho
- Listar, criar, editar e ativar/desativar packs de nicho
- Configurar personas, dores, objeções, tom de voz, CTAs

### 📋 Auditoria
- Consultar logs de alterações no sistema

### 📊 Estatísticas
- Visão geral completa: contatos, deals por estágio, leads por estado, conversas, estoque, agendamentos

## Regras de comportamento:
1. **SEMPRE** use as tools para dados reais — NUNCA invente dados
2. Você tem **TOTAL AUTONOMIA** para ler e editar qualquer configuração, inclusive o prompt do sistema
3. Para ações destrutivas (deletar dados em massa), **CONFIRME** com o operador antes
4. Apresente dados em **tabelas markdown** organizadas
5. Use ✅ ❌ ⚠️ 📊 📇 para indicar status
6. Seja proativo: ao mostrar problemas, sugira soluções
7. Português brasileiro, profissional mas amigável
8. Se algo falhar, explique e sugira alternativas
9. Quando pedirem para ver ou editar o prompt, use manage_nina_settings com action "get" para ler e "update" com system_prompt_override para editar
10. NUNCA diga que não tem acesso a algo. Você tem acesso a TUDO.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get configured model and API key
    const { data: settings } = await supabase.from("nina_settings").select("ai_provider, ai_model_name, ai_api_key").limit(1).single();
    
    const userApiKey = settings?.ai_api_key;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // Determine if we use direct Google API or Lovable Gateway
    const useDirectGoogle = !!userApiKey && settings?.ai_provider === 'google';
    
    let model: string;
    let apiUrl: string;
    let apiKey: string;
    
    if (useDirectGoogle) {
      model = settings.ai_model_name || "gemini-2.5-flash";
      // Strip provider prefix
      if (model.includes("/")) model = model.split("/").pop() || model;
      apiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      apiKey = userApiKey;
      console.log(`[AI Assistant] Using direct Google API with model: ${model}`);
    } else {
      if (!LOVABLE_API_KEY) throw new Error("No API key configured");
      model = "google/gemini-3-flash-preview";
      if (settings?.ai_model_name) {
        const m = settings.ai_model_name;
        if (m.includes("/")) model = m;
        else if (settings.ai_provider === "openai") model = `openai/${m}`;
        else model = `google/${m}`;
      }
      apiUrl = LOVABLE_GATEWAY;
      apiKey = LOVABLE_API_KEY;
      console.log(`[AI Assistant] Using Lovable Gateway with model: ${model}`);
    }

    let conversationMessages: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    const MAX_ROUNDS = 10;
    let finalContent = "";

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: conversationMessages, tools, tool_choice: "auto" }),
      });

      if (!response.ok) {
        const s = response.status;
        const body = await response.text();
        console.error(`[AI Assistant] API error ${s}:`, body.substring(0, 500));
        if (s === 429) return new Response(JSON.stringify({ error: "Rate limit. Tente em alguns segundos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (s === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${s} - ${body.substring(0, 200)}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No response from AI");

      const msg = choice.message;
      conversationMessages.push(msg);

      if (!msg.tool_calls?.length) { finalContent = msg.content || ""; break; }

      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        console.log(`Tool: ${tc.function.name}`, JSON.stringify(args).substring(0, 200));
        const result = await executeTool(supabase, tc.function.name, args);
        conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      if (round === MAX_ROUNDS - 1) finalContent = msg.content || "Processamento concluído.";
    }

    return new Response(JSON.stringify({ content: finalContent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
