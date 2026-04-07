
-- Add chunk ordering columns to send_queue
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS chunk_group_id text;
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0;
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS total_chunks integer DEFAULT 1;

-- Create index for efficient chunk group lookups
CREATE INDEX IF NOT EXISTS idx_send_queue_chunk_group ON public.send_queue (chunk_group_id, chunk_index) WHERE chunk_group_id IS NOT NULL;

-- Replace claim_send_queue_batch to respect chunk ordering:
-- Only claim a chunk if its previous chunk (same group) is already completed
CREATE OR REPLACE FUNCTION public.claim_send_queue_batch(p_limit integer DEFAULT 10)
RETURNS SETOF send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    RETURN QUERY
    WITH eligible AS (
        SELECT s.id
        FROM public.send_queue s
        WHERE s.status = 'pending'
          AND (s.scheduled_at IS NULL OR s.scheduled_at <= now())
          AND (
            s.chunk_group_id IS NULL
            OR s.chunk_index = 0
            OR EXISTS (
              SELECT 1 FROM public.send_queue prev
              WHERE prev.chunk_group_id = s.chunk_group_id
                AND prev.chunk_index = s.chunk_index - 1
                AND prev.status = 'completed'
            )
          )
        ORDER BY s.priority DESC, s.scheduled_at ASC NULLS FIRST, s.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.send_queue sq
    SET status = 'processing', updated_at = now()
    WHERE sq.id IN (SELECT id FROM eligible)
    RETURNING sq.*;
END;
$function$;
