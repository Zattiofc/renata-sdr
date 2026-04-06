CREATE OR REPLACE FUNCTION public.claim_nina_processing_batch(p_limit integer DEFAULT 50)
 RETURNS SETOF public.nina_processing_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    UPDATE public.nina_processing_queue
    SET status = 'pending', updated_at = now(), scheduled_for = now(), retry_count = retry_count + 1
    WHERE status = 'processing' AND updated_at < now() - interval '2 minutes';

    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.nina_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, created_at DESC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.nina_processing_queue n
    SET status = 'processing', updated_at = now()
    WHERE n.id IN (SELECT id FROM cte)
    RETURNING n.*;
END;
$function$;