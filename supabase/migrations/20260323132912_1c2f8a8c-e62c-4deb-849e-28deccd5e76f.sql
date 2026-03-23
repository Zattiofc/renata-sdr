
-- ============================================================
-- SKILLS SUITE — Schema completo
-- ============================================================

-- 1. ENUM: status da skill
CREATE TYPE public.skill_status AS ENUM (
  'draft', 'in_review', 'approved', 'published', 'archived'
);

-- 2. ENUM: estados do lead
CREATE TYPE public.lead_state AS ENUM (
  'NEW_LEAD', 'DISCOVERY', 'QUALIFIED', 'OBJECTION',
  'READY_TO_BOOK', 'BOOKED', 'FOLLOWUP', 'HANDOFF_HUMAN'
);

-- 3. ENUM: modo do lab
CREATE TYPE public.lab_mode AS ENUM (
  'train', 'create', 'improve', 'simulate'
);

-- ============================================================
-- SKILLS — Biblioteca de skills
-- ============================================================
CREATE TABLE public.skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  nicho TEXT NOT NULL DEFAULT 'generico',
  triggers TEXT[] DEFAULT '{}',
  objetivo TEXT,
  fluxo JSONB DEFAULT '[]',
  respostas_base JSONB DEFAULT '[]',
  ctas_permitidos TEXT[] DEFAULT '{}',
  guardrails TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  autor_id UUID,
  autor_nome TEXT,
  status public.skill_status NOT NULL DEFAULT 'draft',
  versao INTEGER NOT NULL DEFAULT 1,
  is_core BOOLEAN NOT NULL DEFAULT false,
  lead_states_aplicaveis public.lead_state[] DEFAULT '{}',
  score_base NUMERIC(4,2) DEFAULT 0.5,
  changelog JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read skills" ON public.skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage skills" ON public.skills FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members can create draft skills" ON public.skills FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = autor_id AND status = 'draft');
CREATE POLICY "Authors can update own drafts" ON public.skills FOR UPDATE TO authenticated
  USING (auth.uid() = autor_id AND status IN ('draft', 'in_review'));

-- ============================================================
-- SKILL_VERSIONS — Versionamento imutável
-- ============================================================
CREATE TABLE public.skill_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  publicado_por UUID,
  publicado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notas_publicacao TEXT,
  is_rollback_target BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read skill_versions" ON public.skill_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage skill_versions" ON public.skill_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- SKILL_APPROVALS — Workflow de aprovação
-- ============================================================
CREATE TABLE public.skill_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  solicitado_por UUID,
  solicitado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  revisado_por UUID,
  revisado_em TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read approvals" ON public.skill_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert approvals" ON public.skill_approvals FOR INSERT TO authenticated WITH CHECK (auth.uid() = solicitado_por);
CREATE POLICY "Admins can manage approvals" ON public.skill_approvals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- NICHE_PACKS — Packs por nicho
-- ============================================================
CREATE TABLE public.niche_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_nicho TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icp_persona TEXT,
  dores_principais TEXT[] DEFAULT '{}',
  objecoes_comuns TEXT[] DEFAULT '{}',
  provas_sociais_sugeridas TEXT[] DEFAULT '{}',
  tom_de_voz TEXT,
  termos_proibidos TEXT[] DEFAULT '{}',
  ctas_preferenciais TEXT[] DEFAULT '{}',
  perguntas_qualificacao TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.niche_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read niche_packs" ON public.niche_packs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage niche_packs" ON public.niche_packs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- LEAD_STATE_HISTORY — Histórico de estados do lead
-- ============================================================
CREATE TABLE public.lead_state_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  estado_anterior public.lead_state,
  estado_novo public.lead_state NOT NULL,
  motivo TEXT,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access lead_state_history" ON public.lead_state_history FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Adicionar estado atual ao contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_state public.lead_state DEFAULT 'NEW_LEAD';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_state_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- ============================================================
-- SKILL_ROUTER_LOGS — Log de seleção de skill
-- ============================================================
CREATE TABLE public.skill_router_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  skill_nome TEXT,
  score_confianca NUMERIC(4,3),
  motivo_escolha TEXT,
  intencao_detectada TEXT,
  estado_lead public.lead_state,
  nicho TEXT,
  tempo_resposta_ms INTEGER,
  skill_executada BOOLEAN DEFAULT false,
  fallback_ativado BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_router_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access skill_router_logs" ON public.skill_router_logs FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- SKILL_EVENTS — Eventos de analytics
-- ============================================================
CREATE TABLE public.skill_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  nicho TEXT,
  lead_state public.lead_state,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access skill_events" ON public.skill_events FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- LAB_SESSIONS — Sessões do Chat Interno (Lab)
-- ============================================================
CREATE TABLE public.lab_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  modo public.lab_mode NOT NULL DEFAULT 'create',
  titulo TEXT,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  messages JSONB DEFAULT '[]',
  resultado JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lab_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own lab sessions" ON public.lab_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SKILL_EXPERIMENTS — A/B Testing
-- ============================================================
CREATE TABLE public.skill_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  skill_id_a UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  skill_id_b UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  nicho TEXT,
  lead_state public.lead_state,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  variante_vencedora TEXT CHECK (variante_vencedora IN ('a', 'b')),
  metricas JSONB DEFAULT '{"a": {"impressions": 0, "conversions": 0}, "b": {"impressions": 0, "conversions": 0}}',
  janela_minima_dias INTEGER DEFAULT 7,
  iniciado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  concluido_em TIMESTAMP WITH TIME ZONE,
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access experiments" ON public.skill_experiments FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- Realtime publications
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.skills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_versions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_state_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_router_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_sessions;

-- ============================================================
-- Timestamps automáticos
-- ============================================================
CREATE TRIGGER skills_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER skill_approvals_updated_at BEFORE UPDATE ON public.skill_approvals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER niche_packs_updated_at BEFORE UPDATE ON public.niche_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER lab_sessions_updated_at BEFORE UPDATE ON public.lab_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER skill_experiments_updated_at BEFORE UPDATE ON public.skill_experiments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SEED: Core Skills
-- ============================================================
INSERT INTO public.skills (nome, descricao, nicho, triggers, objetivo, fluxo, respostas_base, ctas_permitidos, guardrails, tags, is_core, lead_states_aplicaveis, score_base, status, versao) VALUES

('lead-qualification', 'Qualificação inicial do lead — identifica fit, coleta dados mínimos e avança o estado', 'generico',
 ARRAY['olá','oi','bom dia','boa tarde','boa noite','quero saber mais','me interessa','informações'],
 'Qualificar o lead coletando: nome, empresa, cargo, interesse principal e disponibilidade',
 '[{"step":1,"acao":"Saudação personalizada e abertura de descoberta"},{"step":2,"acao":"Perguntar sobre o contexto/desafio atual"},{"step":3,"acao":"Identificar interesse e fit"},{"step":4,"acao":"Coletar dados mínimos (nome, empresa, cargo)"},{"step":5,"acao":"Propor próximo passo com CTA claro"}]'::jsonb,
 '[{"contexto":"primeiro_contato","mensagem":"Olá! Fico feliz em ter seu contato. Me conta um pouco sobre você — qual é o seu principal desafio hoje?"},{"contexto":"sem_resposta_nome","mensagem":"Pode me dizer como prefere ser chamado(a)?"}]'::jsonb,
 ARRAY['Agendar demo de 30 min', 'Contar mais sobre a solução', 'Enviar material'],
 ARRAY['Não prometer resultados garantidos','Não coletar dados sensíveis desnecessários','Não pressionar por decisão imediata'],
 ARRAY['qualificacao','discovery','core'],
 true, ARRAY['NEW_LEAD','DISCOVERY']::public.lead_state[], 0.9, 'published', 1),

('objection-handler', 'Tratamento de objeções comuns: preço, tempo, concorrência, necessidade', 'generico',
 ARRAY['caro','não tenho verba','já tenho','estou satisfeito','vou pensar','não é prioridade','outro fornecedor'],
 'Neutralizar objeção, requalificar valor e retomar momentum para agendamento',
 '[{"step":1,"acao":"Validar a objeção sem discutir"},{"step":2,"acao":"Fazer pergunta de aprofundamento"},{"step":3,"acao":"Reencadrar com benefício relevante"},{"step":4,"acao":"Apresentar prova social ou dado concreto"},{"step":5,"acao":"CTA de baixo atrito (ex: demo rápida de 15 min)"}]'::jsonb,
 '[{"contexto":"objecao_preco","mensagem":"Entendo completamente — orçamento é sempre uma consideração importante. Posso perguntar: o que seria necessário para esse investimento fazer sentido para você?"},{"contexto":"objecao_tempo","mensagem":"Faz total sentido — todos estamos com agenda cheia. Por isso mesmo a demo é de apenas 20 min, direto ao ponto. Qual seria um horário que funcionaria?"}]'::jsonb,
 ARRAY['Demo rápida de 20 min', 'Enviar case de sucesso', 'Conversar com especialista'],
 ARRAY['Não invalidar a objeção','Não insistir mais de 2 vezes na mesma objeção','Oferecer handoff humano se persistir'],
 ARRAY['objecao','tratamento','core'],
 true, ARRAY['OBJECTION','QUALIFIED']::public.lead_state[], 0.88, 'published', 1),

('offer-closer', 'Fechamento da oferta — para leads qualificados com fit e interesse confirmados', 'generico',
 ARRAY['quanto custa','qual o preço','como funciona','quero contratar','vamos fechar','me manda proposta'],
 'Apresentar oferta de forma consultiva, criar urgência legítima e conduzir ao fechamento ou agendamento',
 '[{"step":1,"acao":"Confirmar entendimento das necessidades"},{"step":2,"acao":"Apresentar solução personalizada"},{"step":3,"acao":"Destacar ROI/benefício principal"},{"step":4,"acao":"Apresentar próximo passo claro"},{"step":5,"acao":"Remover fricção final"}]'::jsonb,
 '[{"contexto":"apresentar_oferta","mensagem":"Com base no que você me contou, a solução ideal seria [X]. Isso resolveria diretamente [dor principal]. Posso te mostrar em detalhe numa call de 30 min?"}]'::jsonb,
 ARRAY['Agendar call de fechamento', 'Enviar proposta personalizada', 'Apresentar ao decisor'],
 ARRAY['Não inventar preços sem base','Não prometer desconto sem autorização','Confirmar com humano antes de comprometer valores'],
 ARRAY['fechamento','oferta','core'],
 true, ARRAY['QUALIFIED','READY_TO_BOOK']::public.lead_state[], 0.85, 'published', 1),

('appointment-booker', 'Agendamento de reunião/demo — conduz o lead do interesse à agenda confirmada', 'generico',
 ARRAY['quero agendar','marcar reunião','demo','demonstração','quando posso','horário disponível'],
 'Confirmar agenda, coletar dados necessários e registrar o agendamento',
 '[{"step":1,"acao":"Confirmar tipo e duração do encontro"},{"step":2,"acao":"Oferecer 2-3 opções de data/hora"},{"step":3,"acao":"Confirmar email para convite"},{"step":4,"acao":"Registrar agendamento e enviar confirmação"},{"step":5,"acao":"Definir expectativa de próximos passos"}]'::jsonb,
 '[{"contexto":"propor_horarios","mensagem":"Ótimo! Tenho disponibilidade para você na [data1] às [hora1] ou [data2] às [hora2]. Qual funciona melhor?"},{"contexto":"confirmar","mensagem":"Perfeito! Agendei para [data] às [hora]. Vou te enviar o convite no email [email]. Qualquer dúvida, pode me chamar aqui!"}]'::jsonb,
 ARRAY['Confirmar agendamento', 'Reagendar', 'Adicionar ao calendário'],
 ARRAY['Verificar disponibilidade antes de confirmar','Coletar email antes de registrar','Confirmar fuso horário'],
 ARRAY['agendamento','booking','core'],
 true, ARRAY['READY_TO_BOOK','QUALIFIED']::public.lead_state[], 0.95, 'published', 1),

('followup-reactivation', 'Reativação de leads frios ou sem resposta — retoma contato com valor novo', 'generico',
 ARRAY['follow','reativação','sem resposta'],
 'Reengajar lead inativo com novo ângulo de valor, sem pressão',
 '[{"step":1,"acao":"Reconhecer o silêncio sem culpar"},{"step":2,"acao":"Trazer novo ângulo/valor desde último contato"},{"step":3,"acao":"Pergunta aberta de baixo atrito"},{"step":4,"acao":"CTA simples (uma pergunta ou um sim/não)"}]'::jsonb,
 '[{"contexto":"lead_frio","mensagem":"Oi [nome]! Passando para compartilhar algo que talvez seja relevante para você: [insight/novidade]. Ainda faz sentido conversarmos?"},{"contexto":"sem_resposta_3dias","mensagem":"Oi! Só queria checar se ficou alguma dúvida da nossa última conversa. Posso ajudar com algo?"}]'::jsonb,
 ARRAY['Retomar conversa', 'Agendar rápido', 'Enviar novo material'],
 ARRAY['Não demonstrar desespero','Máximo 3 tentativas de reativação','Após 3 sem resposta, marcar para revisão humana'],
 ARRAY['followup','reativacao','core'],
 true, ARRAY['FOLLOWUP','DISCOVERY']::public.lead_state[], 0.75, 'published', 1),

('handoff-human', 'Transferência para humano — casos sensíveis, complexos ou por solicitação', 'generico',
 ARRAY['falar com humano','atendente','pessoa real','gerente','responsável','reclamação','urgente','problema grave'],
 'Transferir com contexto completo para o time humano sem perder qualidade',
 '[{"step":1,"acao":"Confirmar necessidade de handoff"},{"step":2,"acao":"Resumir contexto ao lead"},{"step":3,"acao":"Registrar transferência no sistema"},{"step":4,"acao":"Informar tempo estimado de resposta"},{"step":5,"acao":"Deixar contato de emergência se aplicável"}]'::jsonb,
 '[{"contexto":"solicitacao_humano","mensagem":"Claro! Vou conectar você com um especialista da nossa equipe. Eles entrarão em contato em breve. Posso passar um resumo do que conversamos para agilizar o atendimento?"},{"contexto":"caso_sensivel","mensagem":"Entendo a situação e quero garantir que você receba o melhor suporte. Vou acionar nosso time especializado agora."}]'::jsonb,
 ARRAY['Acionar time humano', 'Agendar ligação urgente', 'Enviar para gerência'],
 ARRAY['Não inventar prazos sem confirmação','Sempre passar contexto completo','Registrar motivo do handoff'],
 ARRAY['handoff','escalacao','core'],
 true, ARRAY['HANDOFF_HUMAN','OBJECTION','READY_TO_BOOK']::public.lead_state[], 1.0, 'published', 1);

-- ============================================================
-- SEED: Niche Packs
-- ============================================================
INSERT INTO public.niche_packs (nome_nicho, label, icp_persona, dores_principais, objecoes_comuns, provas_sociais_sugeridas, tom_de_voz, termos_proibidos, ctas_preferenciais, perguntas_qualificacao, is_default) VALUES

('generico', 'Genérico Consultivo', 'Empresário ou gestor de PME buscando melhorar processos ou resultados',
 ARRAY['Falta de tempo','Processos ineficientes','Dificuldade de escalar','Custo alto de operação'],
 ARRAY['Está caro','Já tenho solução','Não é prioridade agora','Preciso aprovar com a diretoria'],
 ARRAY['Casos de empresas similares','Depoimentos de clientes','Dados de ROI médio'],
 'Consultivo, objetivo, humano. Evitar jargões. Mensagens curtas e escaneáveis.',
 ARRAY['garantido','100% certeza','nunca falha','melhor do mercado'],
 ARRAY['Agendar demo','Enviar material','Conversar com especialista'],
 ARRAY['Qual é o seu principal desafio hoje?','Como você resolve isso atualmente?','Quem mais está envolvido na decisão?'],
 true),

('clinica_saude', 'Clínica e Saúde', 'Gestor ou dono de clínica/hospital/consultório preocupado com eficiência e experiência do paciente',
 ARRAY['Alto volume de faltas/cancelamentos','Gestão de agenda ineficiente','Dificuldade com follow-up pós-consulta','Processos manuais que roubam tempo'],
 ARRAY['Minha equipe já está sobrecarregada','Privacidade dos pacientes','Custo de implementação','Resistência da equipe médica'],
 ARRAY['Redução de X% em faltas','Aumento de retenção de pacientes','Clínicas parceiras com resultados'],
 'Empático, profissional, preciso. Respeitar termos técnicos. Demonstrar segurança e compliance.',
 ARRAY['cura garantida','tratamento infalível','diagnóstico via chat'],
 ARRAY['Agendar demonstração','Conversar com consultor de saúde','Ver cases de clínicas similares'],
 ARRAY['Quantos pacientes atende por mês?','Qual é a maior dificuldade na gestão hoje?','Já usam algum sistema de gestão?','Como fazem follow-up pós-consulta?'],
 false),

('estetica', 'Estética e Beleza', 'Dono de clínica de estética ou salão de beleza que quer aumentar retenção e ticket médio',
 ARRAY['Dificuldade de reter clientes','Agenda com buracos','Baixo retorno para procedimentos maiores','Concorrência de preço'],
 ARRAY['Não quero parecer spam','Clientes não respondem','Minha clientela é difícil','Já tentei WhatsApp antes'],
 ARRAY['Aumento de retorno de clientes','Mais agendamentos via automação','Casos de clínicas de estética'],
 'Caloroso, inspiracional, focado em transformação e resultado visual. Use linguagem motivacional com moderação.',
 ARRAY['elimina rugas garantido','resultados imediatos sem esforço'],
 ARRAY['Agendar visita','Ver demonstração','Receber proposta personalizada'],
 ARRAY['Quantos clientes ativos tem?','Qual procedimento tem maior ticket?','Como é o processo de retenção hoje?'],
 false),

('imobiliario', 'Imobiliário', 'Corretor, construtora ou imobiliária que quer qualificar leads e aumentar conversão',
 ARRAY['Muitos leads mas poucos qualificados','Tempo perdido com leads frios','Dificuldade de follow-up sistemático','Mercado competitivo'],
 ARRAY['Já tenho CRM','Minha equipe não vai usar','Muito caro para o volume','Prefiro indicações'],
 ARRAY['Corretores com mais visitas agendadas','Construtoras com maior velocidade de venda','Dados de qualificação'],
 'Profissional, orientado a resultado, direto. Use dados e comparações de mercado.',
 ARRAY['valorização garantida','melhor investimento do mercado'],
 ARRAY['Agendar tour virtual','Conversar com consultor','Ver portfólio de imóveis'],
 ARRAY['Está buscando para moradia ou investimento?','Qual é o ticket médio do seu produto?','Quantos leads recebe por mês?','Qual é o tempo médio do seu ciclo de vendas?'],
 false),

('educacao', 'Educação e Cursos', 'Infoprodutor, escola ou plataforma de cursos que quer converter matrículas',
 ARRAY['Alto CAC','Baixa taxa de matrícula','Abandono de carrinho','Leads que não avançam'],
 ARRAY['Não tenho tempo','Já fiz curso e não apliquei','Não sei se funciona','Está caro'],
 ARRAY['Alunos com resultados concretos','Taxa de empregabilidade','Depoimentos em vídeo'],
 'Inspiracional mas realista. Foco em transformação e resultado prático. Evitar promessas vazias.',
 ARRAY['fica rico em 30 dias','resultado garantido sem esforço','fórmula mágica'],
 ARRAY['Garantir vaga','Conhecer a metodologia','Falar com ex-aluno'],
 ARRAY['Qual é seu objetivo com esse curso?','Já tentou aprender isso antes?','O que impediu de ir adiante?','Quando pretende começar?'],
 false),

('servicos_locais', 'Serviços Locais', 'Empresa local (advocacia, contabilidade, consultoria, etc.) que quer mais clientes qualificados',
 ARRAY['Dependência de indicações','Dificuldade de escalar atendimento','Tempo perdido com leads desqualificados','Visibilidade limitada'],
 ARRAY['Não preciso de marketing','Meus clientes vêm por indicação','Não tenho equipe para isso'],
 ARRAY['Clientes locais com resultados','Casos de profissionais autônomos','Depoimentos de parceiros'],
 'Confiável, local, parceiro. Enfatizar proximidade e conhecimento do mercado regional.',
 ARRAY['resultado jurídico garantido','sem risco algum'],
 ARRAY['Agendar reunião presencial','Enviar proposta','Conversar com o responsável'],
 ARRAY['Qual é o principal serviço que oferece?','Como os clientes chegam hoje?','Qual é o maior desafio do seu crescimento?'],
 false),

('ecommerce', 'E-commerce', 'Loja virtual que quer recuperar carrinhos, aumentar retenção e LTV',
 ARRAY['Alto abandono de carrinho','Baixa recorrência de compra','Custo alto de aquisição','Concorrência de preço'],
 ARRAY['Não quero incomodar clientes','Já tenho email marketing','Meus clientes não respondem'],
 ARRAY['Recuperação de X% de carrinhos abandonados','Aumento de LTV','Cases de lojas similares'],
 'Ágil, orientado a urgência, focado em benefício imediato. Use gatilhos com responsabilidade.',
 ARRAY['oferta por tempo limitado irreversível','você vai perder'],
 ARRAY['Ver carrinho','Pegar cupom','Falar com atendente'],
 ARRAY['Qual é o ticket médio?','Qual produto tem maior abandono?','Como fazem retenção hoje?'],
 false);
