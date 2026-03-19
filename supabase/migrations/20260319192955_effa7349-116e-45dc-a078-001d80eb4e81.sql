-- ============================================================
-- BLOCK 1: REALTIME PUBLICATION
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'messages','conversations','contacts','deals',
    'pipeline_stages','teams','team_functions','team_members','appointments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    ELSE
      RAISE NOTICE '% already in supabase_realtime', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- BLOCK 2: CRITICAL TRIGGERS
-- ============================================================

-- 2.1 handle_new_user function + trigger on auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, has_logged_in, must_change_password)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', false, false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2.2 auto_create_deal_on_contact
CREATE OR REPLACE FUNCTION public.auto_create_deal_for_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_stage_id uuid;
BEGIN
  SELECT id INTO first_stage_id
  FROM public.pipeline_stages
  WHERE is_active = true
  ORDER BY position ASC
  LIMIT 1;

  IF first_stage_id IS NOT NULL THEN
    INSERT INTO public.deals (title, contact_id, stage_id, user_id)
    VALUES (
      COALESCE(NEW.name, NEW.phone_number),
      NEW.id,
      first_stage_id,
      NEW.user_id
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_deal_on_contact ON public.contacts;
CREATE TRIGGER auto_create_deal_on_contact
  AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_deal_for_contact();

-- 2.3 update_conversation_last_message trigger
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.sent_at, updated_at = now()
  WHERE id = NEW.conversation_id;

  UPDATE public.contacts
  SET last_activity = now(), updated_at = now()
  FROM public.conversations
  WHERE conversations.id = NEW.conversation_id
    AND contacts.id = conversations.contact_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_conversation_last_message_trigger ON public.messages;
CREATE TRIGGER update_conversation_last_message_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

-- 2.4 ensure single default WhatsApp instance
CREATE OR REPLACE FUNCTION public.ensure_single_default_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.whatsapp_instances
    SET is_default = false
    WHERE id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_single_default ON public.whatsapp_instances;
CREATE TRIGGER ensure_single_default
  BEFORE INSERT OR UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_instance();

-- 2.5 updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'contacts','conversations','conversation_states',
    'nina_processing_queue','message_processing_queue',
    'send_queue','nina_settings','tag_definitions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%s_updated_at ON public.%I', replace(t,'-','_'), t);
    EXECUTE format(
      'CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      replace(t,'-','_'), t
    );
  END LOOP;
END $$;

-- ============================================================
-- BLOCK 3: RLS SINGLE-TENANT
-- ============================================================

-- 3.1 deals
DROP POLICY IF EXISTS "Users can manage own deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can access all deals" ON public.deals;
CREATE POLICY "Authenticated users can access all deals"
  ON public.deals FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 3.2 appointments
DROP POLICY IF EXISTS "Users can manage own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can access all appointments" ON public.appointments;
CREATE POLICY "Authenticated users can access all appointments"
  ON public.appointments FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- BLOCK 7: WHITE LABEL ENHANCEMENTS
-- ============================================================

-- 7.1 tenant_settings table
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name text NOT NULL DEFAULT 'default',
  brand_name text,
  logo_url text,
  primary_color text,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  calendar_provider text DEFAULT 'internal',
  llm_provider text DEFAULT 'lovable',
  llm_model text DEFAULT 'google/gemini-2.5-flash',
  timezone text DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage tenant settings" ON public.tenant_settings;
CREATE POLICY "Authenticated users can manage tenant settings"
  ON public.tenant_settings FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER set_tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert default tenant if none exists
INSERT INTO public.tenant_settings (tenant_name)
SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.tenant_settings);

-- 7.3 Prompt pack versioning table
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenant_settings(id) ON DELETE CASCADE,
  prompt_type text NOT NULL CHECK (prompt_type IN ('system_prompt','objection_prompt','qualification_prompt','handoff_prompt','out_of_scope_policy')),
  content text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage prompts" ON public.prompt_versions;
CREATE POLICY "Authenticated users can manage prompts"
  ON public.prompt_versions FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER set_prompt_versions_updated_at
  BEFORE UPDATE ON public.prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
