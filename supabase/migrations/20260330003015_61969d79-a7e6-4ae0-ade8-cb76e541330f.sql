
-- Automations table
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_executions integer NOT NULL DEFAULT 3,
  cooldown_hours integer NOT NULL DEFAULT 24,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Automation executions table
CREATE TABLE public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  executed_at timestamp with time zone NOT NULL DEFAULT now(),
  result text NOT NULL DEFAULT 'success',
  metadata jsonb DEFAULT '{}'::jsonb
);

-- RLS
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage automations"
  ON public.automations FOR ALL TO authenticated
  USING (auth.role() = 'authenticated'::text)
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can manage automation_executions"
  ON public.automation_executions FOR ALL TO authenticated
  USING (auth.role() = 'authenticated'::text)
  WITH CHECK (auth.role() = 'authenticated'::text);

-- Indexes
CREATE INDEX idx_automation_executions_automation_id ON public.automation_executions(automation_id);
CREATE INDEX idx_automation_executions_contact_id ON public.automation_executions(contact_id);
CREATE INDEX idx_automation_executions_executed_at ON public.automation_executions(executed_at DESC);

-- updated_at trigger
CREATE TRIGGER set_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
