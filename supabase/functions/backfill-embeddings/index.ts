import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('id, content')
      .is('embedding', null)
      .limit(3);

    if (error) throw error;

    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All chunks already have embeddings',
        processed: 0,
        remaining: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Backfill] Processing ${chunks.length} chunks without embeddings`);

    // @ts-ignore - Supabase AI is available in edge runtime
    const session = new Supabase.ai.Session("gte-small");
    let successCount = 0;

    for (const chunk of chunks) {
      try {
        const embedding = await session.run(chunk.content, { mean_pool: true, normalize: true });
        const embeddingArray = Array.from(embedding as Float32Array);

        const { error: updateError } = await supabase
          .from('knowledge_chunks')
          .update({ embedding: embeddingArray })
          .eq('id', chunk.id);

        if (updateError) {
          console.error(`[Backfill] Error updating chunk ${chunk.id}:`, updateError);
        } else {
          successCount++;
          console.log(`[Backfill] ✅ Generated embedding for chunk ${chunk.id}`);
        }
      } catch (chunkError) {
        console.error(`[Backfill] Error processing chunk ${chunk.id}:`, chunkError);
      }
    }

    const { count: remaining } = await supabase
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: successCount,
      remaining: remaining || 0,
      message: remaining && remaining > 0 
        ? `Processed ${successCount}. Call again to process ${remaining} more.`
        : `All done! ${successCount} embeddings generated.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[Backfill] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
