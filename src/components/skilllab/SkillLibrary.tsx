import React, { useState } from 'react';
import { Search, Plus, Filter, Tag, Target, Zap, CheckCircle2, Clock, Archive, Edit2, Send, Eye, ChevronRight, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { motion } from 'framer-motion';
import { useSkills, useNichePacks, usePublishSkill, type Skill } from '@/hooks/useSkills';
import { SkillEditorModal } from './SkillEditorModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: <Edit2 className="w-3 h-3" /> },
  in_review: { label: 'Em revisão', color: 'bg-amber-500/20 text-amber-400', icon: <Clock className="w-3 h-3" /> },
  approved: { label: 'Aprovada', color: 'bg-blue-500/20 text-blue-400', icon: <CheckCircle2 className="w-3 h-3" /> },
  published: { label: 'Publicada', color: 'bg-primary/20 text-primary', icon: <Globe className="w-3 h-3" /> },
  archived: { label: 'Arquivada', color: 'bg-muted/50 text-muted-foreground', icon: <Archive className="w-3 h-3" /> },
};

const LEAD_STATE_LABELS: Record<string, string> = {
  NEW_LEAD: 'Novo',
  DISCOVERY: 'Descoberta',
  QUALIFIED: 'Qualificado',
  OBJECTION: 'Objeção',
  READY_TO_BOOK: 'Pronto',
  BOOKED: 'Agendado',
  FOLLOWUP: 'Follow-up',
  HANDOFF_HUMAN: 'Humano',
};

export const SkillLibrary: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterNicho, setFilterNicho] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isNewSkill, setIsNewSkill] = useState(false);

  const { data: skills = [], isLoading } = useSkills({
    nicho: filterNicho || undefined,
    status: filterStatus || undefined,
  });
  const { data: packs = [] } = useNichePacks();
  const publishSkill = usePublishSkill();

  const filtered = skills.filter(s =>
    s.nome.toLowerCase().includes(search.toLowerCase()) ||
    s.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    s.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => {
    setSelectedSkill(null);
    setIsNewSkill(true);
    setIsEditorOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setSelectedSkill(skill);
    setIsNewSkill(false);
    setIsEditorOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar skills..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <select
          className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground"
          value={filterNicho}
          onChange={e => setFilterNicho(e.target.value)}
        >
          <option value="">Todos os nichos</option>
          {packs.map(p => <option key={p.nome_nicho} value={p.nome_nicho}>{p.label}</option>)}
        </select>
        <select
          className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Skill
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'archived').map(([status, cfg]) => {
          const count = skills.filter(s => s.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${filterStatus === status ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:border-primary/20'}`}
            >
              <span className={`p-1.5 rounded-lg ${cfg.color}`}>{cfg.icon}</span>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
                <p className="text-lg font-bold text-foreground">{count}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-40 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma skill encontrada</p>
          <p className="text-sm mt-1">Crie sua primeira skill no Chat Interno ou clique em "Nova Skill"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(skill => {
            const statusCfg = STATUS_CONFIG[skill.status] || STATUS_CONFIG.draft;
            return (
              <motion.div
                key={skill.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border bg-card p-4 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground text-sm truncate">{skill.nome}</h3>
                      {skill.is_core && (
                        <span className="px-1.5 py-0.5 bg-primary/15 text-primary text-[10px] rounded font-mono">CORE</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{skill.descricao}</p>
                  </div>
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ml-3 flex-shrink-0 ${statusCfg.color}`}>
                    {statusCfg.icon} {statusCfg.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {skill.lead_states_aplicaveis?.slice(0, 3).map(state => (
                    <span key={state} className="px-2 py-0.5 bg-muted rounded-full text-[10px] text-muted-foreground">
                      {LEAD_STATE_LABELS[state] || state}
                    </span>
                  ))}
                  {skill.tags?.slice(0, 2).map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px]">
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>v{skill.versao}</span>
                    <span className="capitalize">{skill.nicho}</span>
                    <span>Score: {(skill.score_base * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(skill)}>
                      <Edit2 className="w-3 h-3 mr-1" /> Editar
                    </Button>
                    {skill.status === 'approved' && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => publishSkill.mutate(skill.id)}
                        disabled={publishSkill.isPending}
                      >
                        <Send className="w-3 h-3 mr-1" /> Publicar
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <SkillEditorModal
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        skill={selectedSkill}
        isNew={isNewSkill}
        packs={packs}
      />
    </div>
  );
};
