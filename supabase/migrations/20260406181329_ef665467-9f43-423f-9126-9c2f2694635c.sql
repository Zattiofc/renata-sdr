UPDATE public.nina_processing_queue
SET priority = 100,
    scheduled_for = now(),
    status = 'pending',
    error_message = null,
    updated_at = now()
WHERE conversation_id = 'eb86e905-183f-4bb6-80de-d6dc7f4f525d'
  AND status IN ('pending','failed','processing');