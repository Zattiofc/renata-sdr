
-- Fix 1: Update process_after default to 8 seconds instead of 20
ALTER TABLE public.message_grouping_queue 
  ALTER COLUMN process_after SET DEFAULT (now() + interval '8 seconds');

-- Fix 2: Ensure vector extension is enabled in the correct schema
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Fix 3: Create text-based knowledge search function as RAG fallback
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks_text(
  search_query text,
  max_results integer DEFAULT 8,
  filter_category text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  file_id uuid,
  content text,
  chunk_index integer,
  metadata jsonb,
  category text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  search_terms text[];
  term text;
BEGIN
  -- Split query into individual words for flexible matching
  search_terms := string_to_array(lower(search_query), ' ');
  
  RETURN QUERY
  SELECT 
    kc.id,
    kc.file_id,
    kc.content,
    kc.chunk_index,
    kc.metadata,
    kc.category,
    -- Calculate similarity based on how many search terms match
    (
      SELECT COUNT(*)::double precision / GREATEST(array_length(search_terms, 1), 1)
      FROM unnest(search_terms) AS t(term)
      WHERE lower(kc.content) LIKE '%' || t.term || '%'
    ) AS similarity
  FROM public.knowledge_chunks kc
  INNER JOIN public.knowledge_files kf ON kf.id = kc.file_id AND kf.status = 'ready'
  WHERE 
    (filter_category IS NULL OR kc.category = filter_category)
    AND EXISTS (
      SELECT 1 FROM unnest(search_terms) AS t(term)
      WHERE lower(kc.content) LIKE '%' || t.term || '%'
    )
  ORDER BY 
    (
      SELECT COUNT(*)::double precision
      FROM unnest(search_terms) AS t(term)
      WHERE lower(kc.content) LIKE '%' || t.term || '%'
    ) DESC,
    (kc.effectiveness_score) DESC NULLS LAST
  LIMIT max_results;
END;
$$;
