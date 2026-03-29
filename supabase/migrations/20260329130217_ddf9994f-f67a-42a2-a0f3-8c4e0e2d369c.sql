
-- Add category to knowledge_chunks for segmented RAG
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'geral';
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS effectiveness_score FLOAT DEFAULT 0.0;
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Add category to knowledge_files
ALTER TABLE public.knowledge_files ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'geral';

-- Create knowledge_suggestions table for auto-learning
CREATE TABLE IF NOT EXISTS public.knowledge_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'conversation',
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage knowledge_suggestions"
  ON public.knowledge_suggestions FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Create rag_feedback table to track RAG quality
CREATE TABLE IF NOT EXISTS public.rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  chunks_used UUID[] DEFAULT '{}',
  chunks_similarity FLOAT[] DEFAULT '{}',
  response_quality TEXT DEFAULT 'unknown',
  knowledge_gap_detected BOOLEAN DEFAULT false,
  gap_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rag_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage rag_feedback"
  ON public.rag_feedback FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Updated_at triggers
CREATE OR REPLACE TRIGGER set_knowledge_suggestions_updated_at
  BEFORE UPDATE ON public.knowledge_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enhanced match function with category filter and re-ranking
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_enhanced(
  query_embedding extensions.vector,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 8,
  filter_category text DEFAULT NULL
)
RETURNS TABLE(id uuid, file_id uuid, content text, chunk_index integer, metadata jsonb, similarity double precision, category text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.file_id,
    kc.content,
    kc.chunk_index,
    kc.metadata,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    kc.category
  FROM public.knowledge_chunks kc
  WHERE (1 - (kc.embedding <=> query_embedding))::FLOAT > match_threshold
    AND (filter_category IS NULL OR kc.category = filter_category)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- Function to update chunk usage stats
CREATE OR REPLACE FUNCTION public.track_chunk_usage(chunk_ids uuid[], quality text DEFAULT 'neutral')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.knowledge_chunks
  SET usage_count = usage_count + 1,
      last_used_at = now(),
      effectiveness_score = CASE
        WHEN quality = 'good' THEN LEAST(effectiveness_score + 0.1, 1.0)
        WHEN quality = 'bad' THEN GREATEST(effectiveness_score - 0.1, -1.0)
        ELSE effectiveness_score
      END
  WHERE id = ANY(chunk_ids);
END;
$function$;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_suggestions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rag_feedback;
