import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, getAIConfigFromSettings } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { arquivo_url, file_name } = await req.json();

    if (!arquivo_url) {
      return new Response(JSON.stringify({ error: "arquivo_url é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the PDF to extract text
    let pdfText = "";
    try {
      const pdfResponse = await fetch(arquivo_url);
      if (pdfResponse.ok) {
        const buffer = await pdfResponse.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        
        const textMatches = rawText.match(/\(([^)]+)\)/g);
        if (textMatches) {
          pdfText = textMatches
            .map(m => m.slice(1, -1))
            .filter(t => t.length > 2 && /[a-zA-ZÀ-ú]/.test(t))
            .join(" ")
            .slice(0, 8000);
        }
      }
    } catch (e) {
      console.log("PDF text extraction failed, using filename only:", e);
    }

    const systemPrompt = `Você é um assistente especializado em classificar materiais comerciais da Hexamedical, empresa que vende equipamentos de ressonância magnética e diagnóstico por imagem.

Linhas de negócio disponíveis: humano, veterinario, servicos, hexai
Tipos disponíveis: folheto, ficha_tecnica, apresentacao, exames, institucional

Produtos conhecidos:
- Humano: Magnifico Open, S-Scan (musculoesquelético), O-Scan (extremidades/ortopédico)
- Veterinário: Magnifico VET, Vet-MR Grande, O-Scan VET
- Serviços: manutenção, instalação, treinamento
- HexAI: soluções de inteligência artificial para diagnóstico

Baseado no conteúdo e nome do arquivo, retorne a classificação do material.`;

    const userPrompt = `Analise este material e retorne os campos preenchidos.

Nome do arquivo: ${file_name || "desconhecido"}
Conteúdo extraído do PDF:
${pdfText || "(não foi possível extrair texto, use o nome do arquivo)"}

Retorne APENAS os campos classificados.`;

    const aiMessages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const aiTools = [
      {
        type: "function",
        function: {
          name: "classify_material",
          description: "Classifica um material comercial da Hexamedical",
          parameters: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Título descritivo do material" },
              linha_negocio: { type: "string", enum: ["humano", "veterinario", "servicos", "hexai"] },
              tipo: { type: "string", enum: ["folheto", "ficha_tecnica", "apresentacao", "exames", "institucional"] },
              produto_relacionado: { type: "string", description: "Nome do produto relacionado" },
              tags: { type: "array", items: { type: "string" }, description: "Tags relevantes para busca" },
              observacoes_uso: { type: "string", description: "Quando e como usar este material" }
            },
            required: ["titulo", "linha_negocio", "tipo", "tags"],
            additionalProperties: false
          }
        }
      }
    ];

    const toolChoice = { type: "function", function: { name: "classify_material" } };

    // Use user's configured AI provider from nina_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings } = await supabase
      .from('nina_settings')
      .select('ai_provider, ai_api_key, ai_model_name')
      .limit(1)
      .maybeSingle();

    const aiConfig = getAIConfigFromSettings(settings || {});

    if (!aiConfig.apiKey) {
      return new Response(JSON.stringify({ error: "Nenhum provedor de IA disponível. Configure uma API Key em Configurações > Agente." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await callAI(aiConfig, {
      messages: aiMessages,
      tools: aiTools,
      tool_choice: toolChoice,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao analisar material com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try content
    const content = data.choices?.[0]?.message?.content;
    return new Response(JSON.stringify({ error: "Não foi possível classificar o material", raw: content }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyze-material error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
