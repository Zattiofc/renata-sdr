
-- Add lead enrichment fields to contacts table
ALTER TABLE public.contacts 
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS linha_negocio text,
  ADD COLUMN IF NOT EXISTS resumo_vivo text;

-- Create memory_events table for tracking key moments per lead
CREATE TABLE IF NOT EXISTS public.memory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by contact
CREATE INDEX IF NOT EXISTS idx_memory_events_contact_id ON public.memory_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_events_tipo ON public.memory_events(contact_id, tipo);

-- Enable RLS
ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can access all memory_events (single-tenant)
CREATE POLICY "Authenticated users can access all memory_events"
  ON public.memory_events FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Enable realtime for memory_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_events;
