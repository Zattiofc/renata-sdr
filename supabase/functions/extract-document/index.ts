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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { file_id, storage_path, file_type, file_name } = await req.json();

    if (!file_id || !storage_path) {
      return new Response(JSON.stringify({ error: "file_id and storage_path are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ExtractDoc] Processing file ${file_id}: ${file_name} (${file_type})`);

    // Update status
    await supabase
      .from("knowledge_files")
      .update({ status: "processing" })
      .eq("id", file_id);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("knowledge-docs")
      .download(storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    let extractedText = "";
    const normalizedType = file_type.toLowerCase();

    if (normalizedType === "csv") {
      // CSV: direct text extraction
      extractedText = await fileData.text();
      console.log(`[ExtractDoc] CSV extracted: ${extractedText.length} chars`);

    } else if (normalizedType === "xlsx" || normalizedType === "xls") {
      // XLSX: convert to text representation via AI Vision
      const buffer = await fileData.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      
      // Get AI config
      const { data: settings } = await supabase
        .from("nina_settings")
        .select("ai_provider, ai_api_key, ai_model_name")
        .limit(1)
        .maybeSingle();
      const aiConfig = getAIConfigFromSettings(settings || {});

      if (!aiConfig.apiKey) {
        throw new Error("No AI provider configured for document extraction");
      }

      // Use AI to extract structured data from spreadsheet
      // For XLSX, we send as a document and ask AI to extract text
      extractedText = await extractWithAI(aiConfig, base64, file_name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      console.log(`[ExtractDoc] XLSX extracted via AI: ${extractedText.length} chars`);

    } else if (normalizedType === "pdf") {
      // PDF: try text extraction first, fallback to AI Vision
      const buffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Attempt basic text extraction from PDF
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const textMatches = rawText.match(/\(([^)]+)\)/g);
      let nativeText = "";
      if (textMatches) {
        nativeText = textMatches
          .map(m => m.slice(1, -1))
          .filter(t => t.length > 2 && /[a-zA-ZÀ-ú]/.test(t))
          .join(" ");
      }

      if (nativeText.length > 200) {
        // Good native extraction
        extractedText = nativeText;
        console.log(`[ExtractDoc] PDF native text: ${extractedText.length} chars`);
      } else {
        // Fallback to AI Vision (OCR)
        const base64 = arrayBufferToBase64(buffer);
        const { data: settings } = await supabase
          .from("nina_settings")
          .select("ai_provider, ai_api_key, ai_model_name")
          .limit(1)
          .maybeSingle();
        const aiConfig = getAIConfigFromSettings(settings || {});

        if (!aiConfig.apiKey) {
          throw new Error("No AI provider configured for PDF OCR");
        }

        extractedText = await extractWithAI(aiConfig, base64, file_name, "application/pdf");
        console.log(`[ExtractDoc] PDF OCR via AI: ${extractedText.length} chars`);
      }

    } else if (normalizedType === "docx") {
      // DOCX: extract text from XML content
      const buffer = await fileData.arrayBuffer();
      extractedText = await extractDocxText(buffer);
      
      if (extractedText.length < 50) {
        // Fallback to AI
        const base64 = arrayBufferToBase64(buffer);
        const { data: settings } = await supabase
          .from("nina_settings")
          .select("ai_provider, ai_api_key, ai_model_name")
          .limit(1)
          .maybeSingle();
        const aiConfig = getAIConfigFromSettings(settings || {});

        if (aiConfig.apiKey) {
          extractedText = await extractWithAI(aiConfig, base64, file_name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        }
      }
      console.log(`[ExtractDoc] DOCX extracted: ${extractedText.length} chars`);

    } else {
      // Plain text fallback
      extractedText = await fileData.text();
      console.log(`[ExtractDoc] Plain text: ${extractedText.length} chars`);
    }

    if (!extractedText || extractedText.trim().length < 10) {
      await supabase
        .from("knowledge_files")
        .update({ status: "error", error_message: "Não foi possível extrair texto do documento" })
        .eq("id", file_id);

      return new Response(JSON.stringify({ error: "No text extracted" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean and normalize extracted text
    extractedText = extractedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s{3,}/g, "  ")
      .trim();

    // Auto-categorize content using simple heuristics
    const category = detectCategory(extractedText, file_name);

    // Update file record with category
    await supabase
      .from("knowledge_files")
      .update({ category })
      .eq("id", file_id);

    console.log(`[ExtractDoc] Detected category: ${category}`);

    return new Response(JSON.stringify({ 
      success: true, 
      text: extractedText,
      category,
      char_count: extractedText.length 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ExtractDoc] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Try to update file status
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.file_id) {
        const supabase2 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase2
          .from("knowledge_files")
          .update({ status: "error", error_message: message })
          .eq("id", body.file_id);
      }
    } catch {}

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function extractWithAI(
  aiConfig: any,
  base64Data: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  // Use Google Gemini with inline_data for document understanding
  if (aiConfig.provider === "google") {
    const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia TODO o conteúdo textual deste documento "${fileName}" de forma organizada e estruturada.
                
Regras:
- Extraia TUDO: títulos, parágrafos, tabelas, listas, notas
- Mantenha a estrutura original (seções, sub-seções)
- Para tabelas, use formato markdown
- Para listas, mantenha a formatação com bullets/números
- NÃO adicione comentários ou análises suas
- NÃO omita nenhum conteúdo
- Retorne APENAS o texto extraído do documento`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ExtractDoc] AI extraction error:", response.status, errText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  // OpenAI fallback
  const response = await callAI(aiConfig, {
    messages: [
      {
        role: "user",
        content: `Extraia todo o conteúdo textual do documento "${fileName}" de forma organizada. Retorne APENAS o texto extraído, sem comentários.`,
      },
    ],
    max_tokens: 8000,
    temperature: 0,
  });

  if (!response.ok) {
    throw new Error("AI extraction failed");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  // DOCX is a ZIP file containing XML
  // Simple extraction: find document.xml content and extract text from <w:t> tags
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  // Look for text between <w:t> tags (simplified DOCX text extraction)
  const textMatches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  if (textMatches) {
    const extracted = textMatches
      .map(m => {
        const match = m.match(/<w:t[^>]*>([^<]+)<\/w:t>/);
        return match ? match[1] : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return extracted;
  }

  return "";
}

function detectCategory(text: string, fileName: string): string {
  const lower = (text + " " + fileName).toLowerCase();
  
  if (/pre[cç]o|valor|tabela.*pre[cç]o|custo|or[cç]amento|investimento/i.test(lower)) return "precos";
  if (/faq|perguntas?\s*frequentes|d[uú]vida/i.test(lower)) return "faq";
  if (/pol[ií]tica|termos?\s*de\s*uso|contrato|regulamento|compliance/i.test(lower)) return "politicas";
  if (/depoimento|case|resultado|prova\s*social|sucesso/i.test(lower)) return "provas_sociais";
  if (/script|roteiro|abordagem|pitch/i.test(lower)) return "scripts_vendas";
  if (/produto|servi[cç]o|solu[cç][aã]o|funcionalidade|especifica[cç]/i.test(lower)) return "produto_servico";
  if (/oferta|promo[cç][aã]o|desconto|plano/i.test(lower)) return "oferta_precos";
  
  return "geral";
}
