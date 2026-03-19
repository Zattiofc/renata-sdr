
-- Table: official_materials (biblioteca de materiais)
CREATE TABLE public.official_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  linha_negocio text NOT NULL DEFAULT 'humano',
  produto_relacionado text,
  tipo text NOT NULL DEFAULT 'folheto',
  idioma text NOT NULL DEFAULT 'pt-BR',
  versao text NOT NULL DEFAULT '1.0',
  data_publicacao date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'ativo',
  arquivo_url text NOT NULL,
  thumbnail_url text,
  tags text[] DEFAULT '{}'::text[],
  observacoes_uso text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

ALTER TABLE public.official_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read official_materials"
  ON public.official_materials FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage official_materials"
  ON public.official_materials FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Table: material_send_logs (log de envios)
CREATE TABLE public.material_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  material_id uuid REFERENCES public.official_materials(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  canal text NOT NULL DEFAULT 'whatsapp',
  enviado_por text NOT NULL DEFAULT 'ia',
  status_envio text NOT NULL DEFAULT 'sucesso',
  erro text,
  etapa_funil_no_envio text,
  mensagem_contexto text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read material_send_logs"
  ON public.material_send_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert material_send_logs"
  ON public.material_send_logs FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Trigger updated_at for official_materials
CREATE TRIGGER update_official_materials_updated_at
  BEFORE UPDATE ON public.official_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for materials
INSERT INTO storage.buckets (id, name, public) VALUES ('materials', 'materials', true);

-- Storage RLS
CREATE POLICY "Authenticated can upload materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materials');

CREATE POLICY "Anyone can read materials"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'materials');

CREATE POLICY "Admins can delete materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials' AND has_role(auth.uid(), 'admin'));
