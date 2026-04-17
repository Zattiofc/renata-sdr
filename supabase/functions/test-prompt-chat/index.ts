import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { splitMessageIntoChunks } from "../_shared/message-chunking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function processPromptTemplate(prompt: string, contactName = "Usuário Teste", contactPhone = "5511999999999"): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo" };
  const dataBR = now.toLocaleDateString("pt-BR", options);
  const horaBR = now.toLocaleTimeString("pt-BR", options);
  const dataHora = `${dataBR} ${horaBR}`;
  const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const diaSemana = diasSemana[now.getDay()];
  const firstName = contactName.trim().split(/\s+/)[0] || contactName;

  return prompt
    .replace(/\{\{\s*data_hora\s*\}\}/g, dataHora)
    .replace(/\{\{\s*data\s*\}\}/g, dataBR)
    .replace(/\{\{\s*hora\s*\}\}/g, horaBR)
    .replace(/\{\{\s*dia_semana\s*\}\}/g, diaSemana)
    .replace(/\{\{\s*cliente_nome\s*\}\}/g, firstName)
    .replace(/\{\{\s*cliente_telefone\s*\}\}/g, contactPhone);
}

const checkInventoryTool = {
  type: "function",
  function: {
    name: "check_inventory",
    description: "Consultar estoque de produtos. Use quando o cliente perguntar sobre disponibilidade, preço ou produtos.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Termo de busca (nome, SKU ou categoria). Vazio = lista todos." }
      },
      required: []
    }
  }
};

const reserveInventoryTool = {
  type: "function",
  function: {
    name: "reserve_inventory",
    description: "Reservar/dar saída no estoque ao confirmar pedido. EM SIMULAÇÃO: não persiste, apenas valida disponibilidade.",
    parameters: {
      type: "object",
      properties: {
        product_name: { type: "string", description: "Nome exato do produto" },
        quantity: { type: "number", description: "Quantidade a reservar" }
      },
      required: ["product_name", "quantity"]
    }
  }
};

async function runRagSearch(supabase: any, query: string): Promise<{ chunks: any[]; mode: string }> {
  if (!query.trim()) return { chunks: [], mode: "skip" };

  // Strategy 1: embedding-based
  try {
    const ragSession = new (globalThis as any).Supabase.ai.Session("gte-small");
    const queryEmbedding = await ragSession.run(query, { mean_pool: true, normalize: true });
    const queryArray = Array.from(queryEmbedding as Float32Array);

    for (const threshold of [0.65, 0.55, 0.45, 0.35]) {
      const { data, error } = await supabase.rpc('match_knowledge_chunks_enhanced', {
        query_embedding: queryArray,
        match_threshold: threshold,
        match_count: 8,
        filter_category: null,
      });
      if (error) break;
      if (data && data.length > 0) return { chunks: data, mode: `embedding@${threshold}` };
    }
  } catch (e) {
    console.warn('[test-prompt] embedding unavailable:', (e as Error).message);
  }

  // Strategy 2: text fallback
  const { data: textChunks } = await supabase.rpc('search_knowledge_chunks_text', {
    search_query: query.substring(0, 500),
    max_results: 8,
    filter_category: null,
  });
  const useful = (textChunks || []).filter((c: any) => (c.similarity || 0) > 0.15);
  if (useful.length > 0) return { chunks: useful, mode: "text" };

  return { chunks: [], mode: "none" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, systemPrompt, contactName, contactPhone } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const lastUserMsg = [...(messages || [])].reverse().find((m: any) => m.role === 'user')?.content || '';

    // === RAG ===
    const lastFew = (messages || []).slice(-5).map((m: any) => m.content).filter(Boolean).join(' ');
    const ragQuery = `${lastUserMsg} ${lastFew}`.trim().substring(0, 600);
    const { chunks: ragChunks, mode: ragMode } = await runRagSearch(supabase, ragQuery);

    // === Inventory context ===
    const { data: inventoryItems } = await supabase
      .from('inventory')
      .select('product_name, sku, quantity, unit, min_quantity, category, price')
      .eq('is_active', true)
      .order('product_name');

    let processedPrompt = processPromptTemplate(systemPrompt || "", contactName || "Usuário Teste", contactPhone || "5511999999999");

    // Inject contact context
    processedPrompt += `\n\n<contact_context>
Cliente em simulação: ${contactName || 'Usuário Teste'}
Telefone: ${contactPhone || '5511999999999'}
Modo: SIMULAÇÃO REAL (RAG + estoque ativos, ferramentas de venda em dry-run)
</contact_context>`;

    // Inject RAG
    if (ragChunks.length > 0) {
      const reranked = ragChunks
        .map((c: any) => ({ ...c, final_score: (c.similarity || 0.5) + (c.effectiveness_score || 0) * 0.15 }))
        .sort((a: any, b: any) => b.final_score - a.final_score)
        .slice(0, 5);
      const knowledgeContext = reranked.map((c: any) => {
        const cat = c.category && c.category !== 'geral' ? `[${c.category.toUpperCase()}] ` : '';
        return `${cat}${c.content}`;
      }).join('\n---\n');
      processedPrompt += `\n\n<knowledge_context>
INSTRUÇÕES: Use APENAS quando relevante para a pergunta. Não invente dados.
${knowledgeContext}
</knowledge_context>`;
    }

    // Inject inventory snapshot
    if (inventoryItems && inventoryItems.length > 0) {
      const cats = [...new Set(inventoryItems.map((p: any) => p.category))];
      const lowStock = inventoryItems.filter((p: any) => p.quantity <= p.min_quantity);
      processedPrompt += `\n\n<inventory_context>
ESTOQUE — Use as ferramentas check_inventory e reserve_inventory para consultar/reservar produtos.
Categorias: ${cats.join(', ')}
Total de produtos ativos: ${inventoryItems.length}
${lowStock.length > 0 ? `⚠️ Estoque baixo: ${lowStock.map((p: any) => `${p.product_name} (${p.quantity} ${p.unit})`).join(', ')}` : ''}
</inventory_context>`;
    }

    const tools = [checkInventoryTool, reserveInventoryTool];
    const debugInfo: any = {
      ragMode,
      ragChunks: ragChunks.length,
      inventoryItemsAvailable: inventoryItems?.length || 0,
      toolCalls: [] as any[],
    };

    let chatMessages: any[] = [
      { role: "system", content: processedPrompt },
      ...(messages || []),
    ];

    // Two-pass loop with tool support (max 3 tool rounds)
    let finalContent = "";
    for (let round = 0; round < 4; round++) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: chatMessages,
          tools,
          tool_choice: "auto",
          temperature: 0.7,
          max_tokens: 1200,
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos esgotados." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const text = await aiResp.text();
        console.error("AI Gateway error:", aiResp.status, text);
        return new Response(JSON.stringify({ error: "Erro ao conectar com a IA" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await aiResp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      const toolCalls = msg?.tool_calls || [];

      if (toolCalls.length === 0) {
        finalContent = msg?.content || "";
        break;
      }

      // Push assistant message with tool_calls
      chatMessages.push({
        role: "assistant",
        content: msg?.content || "",
        tool_calls: toolCalls,
      });

      // Execute each tool
      for (const tc of toolCalls) {
        const fname = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* ignore */ }
        let resultText = "";

        if (fname === "check_inventory") {
          const term = (args.search || "").toLowerCase();
          let q = supabase.from('inventory').select('*').eq('is_active', true).limit(20);
          if (term) q = q.or(`product_name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`);
          const { data: items } = await q;
          if (items && items.length > 0) {
            resultText = "Resultados do estoque:\n" + items.map((p: any) =>
              `• ${p.product_name} (SKU: ${p.sku || 'N/A'}) — Qtd: ${p.quantity} ${p.unit} — R$ ${Number(p.price).toFixed(2)} — Cat: ${p.category}${p.quantity <= p.min_quantity ? ' ⚠️ BAIXO' : ''}`
            ).join("\n");
          } else {
            resultText = `Nenhum produto encontrado${term ? ` para "${term}"` : ''}.`;
          }
          debugInfo.toolCalls.push({ tool: fname, args, found: items?.length || 0 });
        } else if (fname === "reserve_inventory") {
          // Dry-run: validate stock without persisting
          const { data: prod } = await supabase
            .from('inventory')
            .select('*')
            .eq('is_active', true)
            .ilike('product_name', `%${args.product_name || ''}%`)
            .limit(1)
            .maybeSingle();
          if (!prod) {
            resultText = `❌ [SIMULAÇÃO] Produto "${args.product_name}" não encontrado.`;
          } else if (prod.quantity < (args.quantity || 0)) {
            resultText = `❌ [SIMULAÇÃO] Estoque insuficiente. Disponível: ${prod.quantity} ${prod.unit}, solicitado: ${args.quantity}.`;
          } else {
            const total = Number(prod.price) * Number(args.quantity);
            resultText = `✅ [SIMULAÇÃO] Reserva validada (não persistida): ${args.quantity}x ${prod.product_name} = R$ ${total.toFixed(2)}. Estoque pós-venda seria: ${prod.quantity - args.quantity} ${prod.unit}.`;
          }
          debugInfo.toolCalls.push({ tool: fname, args, simulated: true });
        } else {
          resultText = `[SIMULAÇÃO] Ferramenta ${fname} não disponível no modo de teste.`;
        }

        chatMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultText,
        });
      }
    }

    const chunks = splitMessageIntoChunks(finalContent || "");

    return new Response(JSON.stringify({
      response: finalContent,
      chunks,
      debug: debugInfo,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("test-prompt-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
