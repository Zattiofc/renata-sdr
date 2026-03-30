import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Automation {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  max_executions: number;
  cooldown_hours: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationExecution {
  id: string;
  automation_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  executed_at: string;
  result: string;
  metadata: Record<string, any>;
}

export function useAutomations() {
  const queryClient = useQueryClient();

  const automationsQuery = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Automation[];
    },
  });

  const executionsQuery = useQuery({
    queryKey: ['automation-executions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_executions')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AutomationExecution[];
    },
  });

  const createAutomation = useMutation({
    mutationFn: async (automation: Omit<Automation, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('automations')
        .insert({ ...automation, created_by: user.user?.id || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automação criada com sucesso');
    },
    onError: (err: any) => toast.error(`Erro ao criar automação: ${err.message}`),
  });

  const updateAutomation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Automation> & { id: string }) => {
      const { data, error } = await supabase
        .from('automations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automação atualizada');
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const deleteAutomation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automação excluída');
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const toggleAutomation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('automations')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  return {
    automations: automationsQuery.data || [],
    executions: executionsQuery.data || [],
    isLoading: automationsQuery.isLoading,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
  };
}
