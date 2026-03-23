import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Skill {
  id: string;
  nome: string;
  descricao: string | null;
  nicho: string;
  triggers: string[];
  objetivo: string | null;
  fluxo: any[];
  respostas_base: any[];
  ctas_permitidos: string[];
  guardrails: string[];
  tags: string[];
  autor_id: string | null;
  autor_nome: string | null;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived';
  versao: number;
  is_core: boolean;
  lead_states_aplicaveis: string[];
  score_base: number;
  changelog: any[];
  created_at: string;
  updated_at: string;
}

export interface NichePack {
  id: string;
  nome_nicho: string;
  label: string;
  icp_persona: string | null;
  dores_principais: string[];
  objecoes_comuns: string[];
  provas_sociais_sugeridas: string[];
  tom_de_voz: string | null;
  termos_proibidos: string[];
  ctas_preferenciais: string[];
  perguntas_qualificacao: string[];
  is_default: boolean;
  is_active: boolean;
}

export interface SkillEvent {
  skill_name: string;
  total: number;
  conversions: number;
  avg_score: number;
}

export function useSkills(filters?: { nicho?: string; status?: string }) {
  return useQuery({
    queryKey: ['skills', filters],
    queryFn: async () => {
      let query = supabase.from('skills').select('*').order('created_at', { ascending: false });
      if (filters?.nicho) query = query.eq('nicho', filters.nicho);
      if (filters?.status) query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Skill[];
    },
  });
}

export function useSkillVersions(skillId?: string) {
  return useQuery({
    queryKey: ['skill_versions', skillId],
    queryFn: async () => {
      if (!skillId) return [];
      const { data, error } = await supabase
        .from('skill_versions')
        .select('*')
        .eq('skill_id', skillId)
        .order('versao', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!skillId,
  });
}

export function useSkillApprovals() {
  return useQuery({
    queryKey: ['skill_approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skill_approvals')
        .select('*, skills(nome, nicho, versao)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useNichePacks() {
  return useQuery({
    queryKey: ['niche_packs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('niche_packs')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return (data || []) as NichePack[];
    },
  });
}

export function useSkillRouterLogs() {
  return useQuery({
    queryKey: ['skill_router_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skill_router_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSkillEvents() {
  return useQuery({
    queryKey: ['skill_events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skill_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useLabSessions() {
  return useQuery({
    queryKey: ['lab_sessions'],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const { data, error } = await supabase
        .from('lab_sessions')
        .select('*')
        .eq('user_id', user.user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skill: Partial<Skill>) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('skills')
        .insert({
          ...skill,
          autor_id: user.user?.id,
          autor_nome: user.user?.email,
          status: 'draft',
          versao: 1,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success('Skill criada com sucesso!');
    },
    onError: (e: any) => toast.error('Erro ao criar skill: ' + e.message),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Skill> & { id: string }) => {
      const { data, error } = await supabase
        .from('skills')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success('Skill atualizada!');
    },
    onError: (e: any) => toast.error('Erro ao atualizar: ' + e.message),
  });
}

export function usePublishSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const { data: user } = await supabase.auth.getUser();
      // Get current skill
      const { data: skill, error: fetchErr } = await supabase
        .from('skills')
        .select('*')
        .eq('id', skillId)
        .single();
      if (fetchErr) throw fetchErr;

      const newVersion = (skill.versao || 1) + 1;

      // Create version snapshot
      await supabase.from('skill_versions').insert({
        skill_id: skillId,
        versao: newVersion,
        snapshot: skill as any,
        publicado_por: user.user?.id,
        is_rollback_target: true,
      } as any);

      // Update skill status
      const { data, error } = await supabase
        .from('skills')
        .update({ status: 'published', versao: newVersion } as any)
        .eq('id', skillId)
        .select()
        .single();
      if (error) throw error;

      // Log event
      await supabase.from('skill_events').insert({
        event_type: 'skill_published',
        skill_id: skillId,
        payload: { versao: newVersion, publicado_por: user.user?.id } as any,
      } as any);

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['skill_versions'] });
      toast.success('Skill publicada em produção!');
    },
    onError: (e: any) => toast.error('Erro ao publicar: ' + e.message),
  });
}

export function useRollbackSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ skillId, versionId }: { skillId: string; versionId: string }) => {
      const { data: version } = await supabase
        .from('skill_versions')
        .select('snapshot, versao')
        .eq('id', versionId)
        .single();
      if (!version) throw new Error('Versão não encontrada');

      const { error } = await supabase
        .from('skills')
        .update({ ...(version.snapshot as any), status: 'published', versao: version.versao } as any)
        .eq('id', skillId);
      if (error) throw error;

      await supabase.from('skill_events').insert({
        event_type: 'skill_rollback',
        skill_id: skillId,
        payload: { rolled_back_to: version.versao } as any,
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success('Rollback realizado com sucesso!');
    },
    onError: (e: any) => toast.error('Erro no rollback: ' + e.message),
  });
}
