import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { contact_id, material_id, conversation_id, canal, mensagem_contexto, deal_id } = await req.json();

    if (!contact_id || !material_id) {
      return new Response(JSON.stringify({ error: "contact_id e material_id são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch material
    const { data: material, error: matError } = await supabase
      .from("official_materials")
      .select("*")
      .eq("id", material_id)
      .eq("status", "ativo")
      .maybeSingle();

    if (matError || !material) {
      return new Response(JSON.stringify({ error: "Material não encontrado ou inativo" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch contact
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone_number, name")
      .eq("id", contact_id)
      .maybeSingle();

    if (!contact) {
      return new Response(JSON.stringify({ error: "Contato não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current deal stage if deal_id provided
    let etapa_funil = null;
    if (deal_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select("stage, pipeline_stages!inner(title)")
        .eq("id", deal_id)
        .maybeSingle();
      etapa_funil = (deal as any)?.pipeline_stages?.title || deal?.stage || null;
    }

    // If WhatsApp channel, enqueue the material for sending
    let status_envio = "sucesso";
    let erro = null;

    if (canal === "whatsapp" && conversation_id) {
      // Get conversation instance
      const { data: conv } = await supabase
        .from("conversations")
        .select("instance_id")
        .eq("id", conversation_id)
        .maybeSingle();

      // Send context message first
      const contextMsg = mensagem_contexto || 
        `📄 Segue o material oficial: *${material.titulo}*`;

      // Insert context message
      const { data: msgData } = await supabase.from("messages").insert({
        conversation_id,
        content: contextMsg,
        from_type: "nina",
        type: "text",
        status: "sent",
      }).select("id").single();

      // Enqueue context text message
      await supabase.from("send_queue").insert({
        conversation_id,
        contact_id,
        content: contextMsg,
        from_type: "nina",
        message_type: "text",
        message_id: msgData?.id || null,
        instance_id: conv?.instance_id || null,
        priority: 2,
      });

      // Insert media message
      const { data: mediaMsgData } = await supabase.from("messages").insert({
        conversation_id,
        content: material.titulo,
        from_type: "nina",
        type: "document",
        media_url: material.arquivo_url,
        status: "sent",
      }).select("id").single();

      // Enqueue media message
      await supabase.from("send_queue").insert({
        conversation_id,
        contact_id,
        content: material.titulo,
        from_type: "nina",
        message_type: "document",
        media_url: material.arquivo_url,
        message_id: mediaMsgData?.id || null,
        instance_id: conv?.instance_id || null,
        priority: 2,
      });
    }

    // Log the send event
    await supabase.from("material_send_logs").insert({
      contact_id,
      material_id,
      conversation_id: conversation_id || null,
      deal_id: deal_id || null,
      canal: canal || "whatsapp",
      enviado_por: "ia",
      status_envio,
      erro,
      etapa_funil_no_envio: etapa_funil,
      mensagem_contexto: mensagem_contexto || null,
    });

    return new Response(JSON.stringify({
      success: true,
      material: {
        titulo: material.titulo,
        arquivo_url: material.arquivo_url,
        tipo: material.tipo,
        linha_negocio: material.linha_negocio,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-material error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
