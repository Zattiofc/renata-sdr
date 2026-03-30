import React, { useState } from 'react';
import { Zap, Plus, Trash2, Pencil, Activity, Clock, CheckCircle2, XCircle, Play } from 'lucide-react';
import { useAutomations, Automation } from '@/hooks/useAutomations';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TRIGGER_OPTIONS = [
  { value: 'no_reply', label: 'Sem resposta por X horas', description: 'Lead não respondeu após um tempo' },
  { value: 'new_contact', label: 'Novo contato', description: 'Quando um novo contato é criado' },
  { value: 'lead_state_change', label: 'Mudança de estado', description: 'Quando o estado do lead muda' },
  { value: 'tag_added', label: 'Tag adicionada', description: 'Quando uma tag específica é adicionada' },
];

const ACTION_OPTIONS = [
  { value: 'send_message', label: 'Enviar mensagem', description: 'Envia uma mensagem via WhatsApp' },
  { value: 'add_tag', label: 'Adicionar tag', description: 'Adiciona uma tag ao contato' },
  { value: 'change_stage', label: 'Mover no pipeline', description: 'Move o deal para outra etapa' },
  { value: 'notify_team', label: 'Notificar equipe', description: 'Envia notificação para a equipe' },
];

const LEAD_STATES = [
  'NEW_LEAD', 'ENGAGING', 'QUALIFYING', 'NURTURING', 'INTERESTED',
  'SCHEDULING', 'SCHEDULED', 'OBJECTION_HANDLING', 'HOT_LEAD',
  'CONVERTING', 'WON', 'LOST', 'DORMANT', 'REACTIVATING',
];

interface AutomationForm {
  name: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  max_executions: number;
  cooldown_hours: number;
  is_active: boolean;
}

const defaultForm: AutomationForm = {
  name: '',
  trigger_type: 'no_reply',
  trigger_config: { hours: 5 },
  action_type: 'send_message',
  action_config: { message: '' },
  max_executions: 3,
  cooldown_hours: 24,
  is_active: true,
};

const Automations: React.FC = () => {
  const { automations, executions, isLoading, createAutomation, updateAutomation, deleteAutomation, toggleAutomation } = useAutomations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AutomationForm>(defaultForm);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(null);

  const todayExecutions = executions.filter(e => {
    const today = new Date();
    const execDate = new Date(e.executed_at);
    return execDate.toDateString() === today.toDateString();
  });

  const successRate = executions.length > 0
    ? Math.round((executions.filter(e => e.result === 'success').length / executions.length) * 100)
    : 0;

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEdit = (auto: Automation) => {
    setEditingId(auto.id);
    setForm({
      name: auto.name,
      trigger_type: auto.trigger_type,
      trigger_config: auto.trigger_config,
      action_type: auto.action_type,
      action_config: auto.action_config,
      max_executions: auto.max_executions,
      cooldown_hours: auto.cooldown_hours,
      is_active: auto.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateAutomation.mutate({ id: editingId, ...form });
    } else {
      createAutomation.mutate(form as any);
    }
    setModalOpen(false);
  };

  const handleTriggerChange = (type: string) => {
    let config: Record<string, any> = {};
    switch (type) {
      case 'no_reply': config = { hours: 5 }; break;
      case 'new_contact': config = { minutes: 2 }; break;
      case 'lead_state_change': config = { target_state: 'INTERESTED', minutes: 5 }; break;
      case 'tag_added': config = { tag: '' }; break;
    }
    setForm(f => ({ ...f, trigger_type: type, trigger_config: config }));
  };

  const handleActionChange = (type: string) => {
    let config: Record<string, any> = {};
    switch (type) {
      case 'send_message': config = { message: '' }; break;
      case 'add_tag': config = { tag: '' }; break;
      case 'change_stage': config = { stage_id: '' }; break;
      case 'notify_team': config = { message: '' }; break;
    }
    setForm(f => ({ ...f, action_type: type, action_config: config }));
  };

  const filteredExecutions = selectedAutomation
    ? executions.filter(e => e.automation_id === selectedAutomation)
    : executions;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Automações</h1>
            <p className="text-sm text-muted-foreground">Regras automáticas de follow-up e ações</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Automação
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Zap className="w-5 h-5" />} label="Automações Ativas" value={automations.filter(a => a.is_active).length} />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Execuções Hoje" value={todayExecutions.length} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Taxa de Sucesso" value={`${successRate}%`} />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Total Execuções" value={executions.length} />
      </div>

      {/* Automations List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Regras</h2>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : automations.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center">
            <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma automação criada</p>
            <Button onClick={openCreate} variant="outline" className="mt-3 gap-2">
              <Plus className="w-4 h-4" /> Criar Primeira Automação
            </Button>
          </div>
        ) : (
          automations.map(auto => (
            <div
              key={auto.id}
              className={`border rounded-xl p-4 transition-all cursor-pointer ${
                selectedAutomation === auto.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/30'
              }`}
              onClick={() => setSelectedAutomation(selectedAutomation === auto.id ? null : auto.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-2 h-2 rounded-full ${auto.is_active ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{auto.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {TRIGGER_OPTIONS.find(t => t.value === auto.trigger_type)?.label || auto.trigger_type}
                      {' → '}
                      {ACTION_OPTIONS.find(a => a.value === auto.action_type)?.label || auto.action_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Switch
                    checked={auto.is_active}
                    onCheckedChange={(checked) => toggleAutomation.mutate({ id: auto.id, is_active: checked })}
                  />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(auto)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteAutomation.mutate(auto.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Trigger details */}
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                {auto.trigger_type === 'no_reply' && <span>⏱ {auto.trigger_config.hours || 5}h sem resposta</span>}
                {auto.trigger_type === 'new_contact' && <span>🆕 {auto.trigger_config.minutes || 2}min após criar</span>}
                {auto.trigger_type === 'lead_state_change' && <span>🔄 Estado → {auto.trigger_config.target_state}</span>}
                {auto.trigger_type === 'tag_added' && <span>🏷️ Tag: {auto.trigger_config.tag}</span>}
                <span>Max: {auto.max_executions}x</span>
                <span>Cooldown: {auto.cooldown_hours}h</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Execution Log */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Log de Execuções {selectedAutomation && '(filtrado)'}
        </h2>
        {filteredExecutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução registrada</p>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Automação</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {filteredExecutions.slice(0, 20).map(exec => {
                  const auto = automations.find(a => a.id === exec.automation_id);
                  return (
                    <tr key={exec.id} className="border-t border-border">
                      <td className="p-3 text-foreground">
                        {format(new Date(exec.executed_at), "dd/MM HH:mm", { locale: ptBR })}
                      </td>
                      <td className="p-3 text-foreground">{auto?.name || 'Removida'}</td>
                      <td className="p-3">
                        {exec.result === 'success' ? (
                          <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="w-3.5 h-3.5" /> Sucesso</span>
                        ) : (
                          <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" /> Erro</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Automação' : 'Nova Automação'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Follow-up 5h sem resposta"
              />
            </div>

            {/* Trigger */}
            <div>
              <Label>Gatilho</Label>
              <Select value={form.trigger_type} onValueChange={handleTriggerChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trigger Config */}
            {form.trigger_type === 'no_reply' && (
              <div>
                <Label>Horas sem resposta</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.trigger_config.hours || 5}
                  onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, hours: parseInt(e.target.value) || 5 } }))}
                />
              </div>
            )}
            {form.trigger_type === 'new_contact' && (
              <div>
                <Label>Minutos após criação</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.trigger_config.minutes || 2}
                  onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, minutes: parseInt(e.target.value) || 2 } }))}
                />
              </div>
            )}
            {form.trigger_type === 'lead_state_change' && (
              <div>
                <Label>Estado alvo</Label>
                <Select
                  value={form.trigger_config.target_state || ''}
                  onValueChange={v => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, target_state: v } }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.trigger_type === 'tag_added' && (
              <div>
                <Label>Tag</Label>
                <Input
                  value={form.trigger_config.tag || ''}
                  onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, tag: e.target.value } }))}
                  placeholder="Ex: vip"
                />
              </div>
            )}

            {/* Action */}
            <div>
              <Label>Ação</Label>
              <Select value={form.action_type} onValueChange={handleActionChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Config */}
            {(form.action_type === 'send_message' || form.action_type === 'notify_team') && (
              <div>
                <Label>Mensagem</Label>
                <Textarea
                  value={form.action_config.message || ''}
                  onChange={e => setForm(f => ({ ...f, action_config: { ...f.action_config, message: e.target.value } }))}
                  placeholder="Olá! Vi que não conseguimos conversar..."
                  rows={3}
                />
              </div>
            )}
            {form.action_type === 'add_tag' && (
              <div>
                <Label>Tag a adicionar</Label>
                <Input
                  value={form.action_config.tag || ''}
                  onChange={e => setForm(f => ({ ...f, action_config: { ...f.action_config, tag: e.target.value } }))}
                  placeholder="Ex: follow-up-enviado"
                />
              </div>
            )}
            {form.action_type === 'change_stage' && (
              <div>
                <Label>ID da etapa do pipeline</Label>
                <Input
                  value={form.action_config.stage_id || ''}
                  onChange={e => setForm(f => ({ ...f, action_config: { ...f.action_config, stage_id: e.target.value } }))}
                  placeholder="UUID da etapa"
                />
              </div>
            )}

            {/* Limits */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Máx. execuções por contato</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_executions}
                  onChange={e => setForm(f => ({ ...f, max_executions: parseInt(e.target.value) || 3 }))}
                />
              </div>
              <div>
                <Label>Cooldown (horas)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.cooldown_hours}
                  onChange={e => setForm(f => ({ ...f, cooldown_hours: parseInt(e.target.value) || 24 }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) => (
  <div className="border border-border rounded-xl p-4 bg-card">
    <div className="flex items-center gap-2 text-muted-foreground mb-2">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
  </div>
);

export default Automations;
