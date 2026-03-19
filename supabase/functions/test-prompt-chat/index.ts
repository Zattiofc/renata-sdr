import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, getAIConfigFromSettings } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function replacePromptVariables(prompt: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo" };
  
  const dataBR = now.toLocaleDateString("pt-BR", options);
  const horaBR = now.toLocaleTimeString("pt-BR", options);
  const dataHora = `${dataBR} ${horaBR}`;
  
  const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const diaSemana = diasSemana[now.getDay()];

  return prompt
    .replace(/\{\{\s*data_hora\s*\}\}/g, dataHora)
    .replace(/\{\{\s*data\s*\}\}/g, dataBR)
    .replace(/\{\{\s*hora\s*\}\}/g, horaBR)
    .replace(/\{\{\s*dia_semana\s*\}\}/g, diaSemana)
    .replace(/\{\{\s*cliente_nome\s*\}\}/g, "Usuário Teste")
    .replace(/\{\{\s*cliente_telefone\s*\}\}/g, "5511999999999");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, systemPrompt } = await req.json();
    
    // Get AI config from nina_settings
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
      return new Response(JSON.stringify({ error: "API Key do provedor de IA não configurada. Vá em Configurações > Agente para configurar." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const processedPrompt = replacePromptVariables(systemPrompt || "");

    const response = await callAI(aiConfig, {
      messages: [
        { role: "system", content: processedPrompt },
        ...messages,
      ],
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI error:", response.status, text);
      return new Response(JSON.stringify({ error: "Erro ao conectar com a IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ response: content }), {
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
