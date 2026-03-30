
-- 1. Add unique index on messages.whatsapp_message_id to prevent duplicate incoming messages
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_message_id_unique 
ON public.messages (whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;

-- 2. Add unique index on send_queue to prevent duplicate responses for the same message
CREATE UNIQUE INDEX IF NOT EXISTS idx_send_queue_dedup 
ON public.send_queue (conversation_id, contact_id) 
WHERE status = 'pending' AND from_type = 'nina';

-- 3. Create storage bucket for knowledge base documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-docs', 
  'knowledge-docs', 
  false,
  20971520,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain', 'text/markdown']
) ON CONFLICT (id) DO NOTHING;

-- 4. RLS for knowledge-docs bucket
CREATE POLICY "Authenticated users can upload knowledge docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'knowledge-docs');

CREATE POLICY "Authenticated users can read knowledge docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'knowledge-docs');

CREATE POLICY "Authenticated users can delete knowledge docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'knowledge-docs');

-- 5. Add storage_path column to knowledge_files for binary file reference
ALTER TABLE public.knowledge_files ADD COLUMN IF NOT EXISTS storage_path text;
