import React, { useState, useEffect } from 'react';
import { X, Save, Send, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateSkill, useUpdateSkill, usePublishSkill, type Skill, type NichePack } from '@/hooks/useSkills';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const LEAD_STATES = ['NEW_LEAD','DISCOVERY','QUALIFIED','OBJECTION','READY_TO_BOOK','BOOKED','FOLLOWUP','HANDOFF_HUMAN'];

interface Props {
  open: boolean;
  onClose: () => void;
  skill: Skill | null;
  isNew: boolean;
  packs: NichePack[];
}

export const SkillEditorModal: React.FC<Props> = ({ open, onClose, skill, isNew, packs }) => {
  const qc = useQueryClient();
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const publishSkill = usePublishSkill();

  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    nicho: 'generico',
    objetivo: '',
    triggers: '',
    ctas: '',
    guardrails: '',
    tags: '',
    lead_states: [] as string[],
    score_base: 0.8,
  });

  useEffect(() => {
    if (skill) {
      setForm({
        nome: skill.nome || '',
        descricao: skill.descricao || '',
        nicho: skill.nicho || 'generico',
        objetivo: skill.objetivo || '',
        triggers: (skill.triggers || []).join(', '),
        ctas: (skill.ctas_permitidos || []).join('\n'),
        guardrails: (skill.guardrails || []).join('\n'),
        tags: (skill.tags || []).join(', '),
        lead_states: skill.lead_states_aplicaveis || [],
        score_base: skill.score_base || 0.8,
      });
    } else {
      setForm({ nome: '', descricao: '', nicho: 'generico', objetivo: '', triggers: '', ctas: '', guardrails: '', tags: '', lead_states: [], score_base: 0.8 });
    }
  }, [skill, open]);

  const toggleState = (state: string) => {
    setForm(prev => ({
      ...prev,
      lead_states: prev.lead_states.includes(state)
        ? prev.lead_states.filter(s => s !== state)
        : [...prev.lead_states, state],
    }));
  };

  const buildPayload = () => ({
    nome: form.nome,
    descricao: form.descricao,
    nicho: form.nicho,
    objetivo: form.objetivo,
    triggers: form.triggers.split(',').map(t => t.trim()).filter(Boolean),
    ctas_permitidos: form.ctas.split('\n').map(c => c.trim()).filter(Boolean),
    guardrails: form.guardrails.split('\n').map(g => g.trim()).filter(Boolean),
    tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    lead_states_aplicaveis: form.lead_states,
    score_base: form.score_base,
  });

  const handleSaveDraft = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (isNew) {
      await createSkill.mutateAsync(buildPayload() as any);
    } else if (skill) {
      await updateSkill.mutateAsync({ id: skill.id, ...buildPayload() } as any);
    }
    onClose();
  };

  const handleSendForReview = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    const { data: user } = await supabase.auth.getUser();
    let skillId = skill?.id;

    if (isNew) {
      const saved = await createSkill.mutateAsync(buildPayload() as any) as any;
      skillId = saved?.id;
    } else if (skill) {
      await updateSkill.mutateAsync({ id: skill.id, ...buildPayload() } as any);
    }

    if (skillId) {
      await supabase.from('skills').update({ status: 'in_review' } as any).eq('id', skillId);
      await supabase.from('skill_approvals').insert({
        skill_id: skillId,
        solicitado_por: user.user?.id,
        status: 'pending',
      } as any);
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['skill_approvals'] });
      toast.success('Skill enviada para revisão!');
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{isNew ? 'Nova Skill' : `Editar: ${skill?.nome}`}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome *</label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="ex: objection-handler-saude" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nicho</label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground"
                value={form.nicho}
                onChange={e => setForm(p => ({ ...p, nicho: e.target.value }))}
              >
                <option value="generico">Genérico</option>
                {packs.filter(p => !p.is_default).map(p => (
                  <option key={p.nome_nicho} value={p.nome_nicho}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descrição</label>
            <Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="O que essa skill faz?" rows={2} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Objetivo Principal</label>
            <Input value={form.objetivo} onChange={e => setForm(p => ({ ...p, objetivo: e.target.value }))} placeholder="ex: Qualificar o lead coletando dados mínimos" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Triggers (separados por vírgula)</label>
            <Input value={form.triggers} onChange={e => setForm(p => ({ ...p, triggers: e.target.value }))} placeholder="ex: olá, oi, quero saber mais, me interessa" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Estados do Lead Aplicáveis</label>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATES.map(state => (
                <button
                  key={state}
                  onClick={() => toggleState(state)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    form.lead_states.includes(state)
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-muted text-muted-foreground border border-border hover:border-primary/20'
                  }`}
                >
                  {state}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CTAs Permitidos (um por linha)</label>
              <Textarea value={form.ctas} onChange={e => setForm(p => ({ ...p, ctas: e.target.value }))} placeholder="Agendar demo&#10;Enviar material" rows={3} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Guardrails (um por linha)</label>
              <Textarea value={form.guardrails} onChange={e => setForm(p => ({ ...p, guardrails: e.target.value }))} placeholder="Não prometer resultados&#10;Não insistir após 2 tentativas" rows={3} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags (separadas por vírgula)</label>
              <Input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="ex: qualificacao, discovery" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Score Base (0-1)</label>
              <Input
                type="number" min={0} max={1} step={0.05}
                value={form.score_base}
                onChange={e => setForm(p => ({ ...p, score_base: parseFloat(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveDraft} disabled={createSkill.isPending || updateSkill.isPending} className="gap-2">
              <Save className="w-4 h-4" /> Salvar Rascunho
            </Button>
            <Button onClick={handleSendForReview} disabled={createSkill.isPending || updateSkill.isPending} className="gap-2">
              <Send className="w-4 h-4" /> Enviar para Revisão
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
