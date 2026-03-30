import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[import-inventory] Processing file: ${file.name}, size: ${file.size}`);

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Convert to text-based content for AI analysis
    let rawContent = '';
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
      rawContent = new TextDecoder('utf-8').decode(bytes);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // For Excel files, use a simple TSV extraction approach
      // We'll decode as much text as possible and send to AI
      // First try UTF-8, fallback to latin1
      try {
        rawContent = new TextDecoder('utf-8').decode(bytes);
      } catch {
        rawContent = new TextDecoder('latin1').decode(bytes);
      }
      
      // If binary content, extract readable strings
      if (rawContent.includes('\x00') || rawContent.length < 10) {
        const strings: string[] = [];
        let current = '';
        for (let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          if (c >= 32 && c < 127) {
            current += String.fromCharCode(c);
          } else if (current.length > 2) {
            strings.push(current);
            current = '';
          } else {
            current = '';
          }
        }
        if (current.length > 2) strings.push(current);
        rawContent = strings.join(' | ');
      }
    } else {
      rawContent = new TextDecoder('utf-8').decode(bytes);
    }

    // Truncate if too large
    if (rawContent.length > 15000) {
      rawContent = rawContent.substring(0, 15000) + '\n...[truncated]';
    }

    console.log(`[import-inventory] Extracted content length: ${rawContent.length}`);

    // Fetch AI model from nina_settings
    const { data: ninaSettings } = await supabase
      .from('nina_settings')
      .select('ai_model_name, ai_api_key')
      .limit(1)
      .single();

    // Normalize model name to include provider prefix
    let configuredModel = ninaSettings?.ai_model_name || 'google/gemini-2.5-flash';
    if (configuredModel && !configuredModel.includes('/')) {
      if (configuredModel.startsWith('gpt-') || configuredModel.startsWith('o1') || configuredModel.startsWith('o3') || configuredModel.startsWith('o4')) {
        configuredModel = `openai/${configuredModel}`;
      } else if (configuredModel.startsWith('gemini')) {
        configuredModel = `google/${configuredModel}`;
      }
    }

    // Use AI to structure the data
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI API key not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[import-inventory] Using AI model: ${configuredModel}`);

    const systemPrompt = `Você é um assistente que analisa planilhas de estoque e extrai produtos estruturados.

IMPORTANTE: Responda APENAS com um JSON array válido, sem markdown, sem \`\`\`, sem texto antes ou depois.

Cada item deve ter:
- product_name (string, obrigatório): nome do produto
- sku (string ou null): código/SKU se houver
- category (string): categoria identificada (ex: "humano", "veterinario", "suplemento", "cosmético", "geral")
- quantity (number): quantidade em estoque (0 se não informado)
- min_quantity (number): estoque mínimo sugerido (5 se não informado)
- unit (string): unidade (un, cx, kg, ml, etc.)
- price (number): preço unitário (0 se não informado)
- description (string ou null): descrição do produto

Analise TODAS as linhas da planilha. Identifique padrões de colunas automaticamente.
Se houver preços em formato brasileiro (R$ 1.234,56), converta para número.
Ignore linhas de cabeçalho, totais, ou linhas vazias.`;

    const buildRequestBody = (model: string) => ({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analise esta planilha e extraia todos os produtos:\n\n${rawContent}` }
      ],
      ...(model.startsWith('openai/')
        ? { max_completion_tokens: 4096 }
        : { temperature: 0.1, max_tokens: 4096 }),
    });

    let aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(configuredModel)),
    });

    if (!aiResponse.ok) {
      const primaryErrText = await aiResponse.text();
      console.error('[import-inventory] AI error (primary model):', primaryErrText);

      const fallbackModel = 'google/gemini-3-flash-preview';
      if (configuredModel !== fallbackModel) {
        console.log(`[import-inventory] Retrying with fallback model: ${fallbackModel}`);
        aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildRequestBody(fallbackModel)),
        });
      }

      if (!aiResponse.ok) {
        const fallbackErrText = await aiResponse.text();
        console.error('[import-inventory] AI error (fallback model):', fallbackErrText);
        return new Response(
          JSON.stringify({ error: 'AI analysis failed', details: fallbackErrText || primaryErrText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const aiData = await aiResponse.json();
    const messageContent = aiData?.choices?.[0]?.message?.content;

    let aiContent = '';
    if (typeof messageContent === 'string') {
      aiContent = messageContent;
    } else if (Array.isArray(messageContent)) {
      aiContent = messageContent
        .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
        .join('\n');
    }

    if (!aiContent && typeof aiData?.output_text === 'string') {
      aiContent = aiData.output_text;
    }

    // Clean markdown wrapping if present
    aiContent = aiContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    console.log(`[import-inventory] AI response length: ${aiContent.length}`);

    let products: any[];
    try {
      products = JSON.parse(aiContent);
    } catch (parseErr) {
      console.error('[import-inventory] Failed to parse AI response:', aiContent.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: aiContent.substring(0, 500), ai_shape: typeof aiData }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    if (!Array.isArray(products) || products.length === 0) {
      return new Response(JSON.stringify({ error: 'No products found in file', products: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Return structured products for user review before inserting
    const structured = products.map((p: any, idx: number) => ({
      product_name: String(p.product_name || `Produto ${idx + 1}`),
      sku: p.sku || null,
      category: String(p.category || 'geral'),
      quantity: Math.max(0, Number(p.quantity) || 0),
      min_quantity: Math.max(0, Number(p.min_quantity) || 5),
      unit: String(p.unit || 'un'),
      price: Math.max(0, Number(p.price) || 0),
      description: p.description || null,
      is_active: true,
    }));

    console.log(`[import-inventory] Extracted ${structured.length} products`);

    return new Response(JSON.stringify({ products: structured, total: structured.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[import-inventory] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
