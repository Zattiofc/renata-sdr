UPDATE public.nina_processing_queue 
SET status = 'pending', retry_count = 0, error_message = NULL, updated_at = now() 
WHERE status IN ('pending', 'failed') AND error_message LIKE '%dedup%';