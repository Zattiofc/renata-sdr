import React, { useState } from 'react';
import { GitBranch, RotateCcw, Clock, User, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { useSkills, useSkillVersions, useSkillApprovals, usePublishSkill, useRollbackSkill } from '@/hooks/useSkills';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const ApprovalCard: React.FC<{ approval: any }> = ({ approval }) => {
  const qc = useQueryClient();
  const publishSkill = usePublishSkill();

  const handleApprove = async () => {
    const { data: user } = await supabase.auth.getUser();
    await supabase.from('skill_approvals').update({
      status: 'approved',
      revisado_por: user.user?.id,
      revisado_em: new Date().toISOString(),
    } as any).eq('id', approval.id);
    await supabase.from('skills').update({ status: 'approved' } as any).eq('id', approval.skill_id);
    qc.invalidateQueries({ queryKey: ['skill_approvals'] });
    qc.invalidateQueries({ queryKey: ['skills'] });
    toast.success('Skill aprovada!');
  };

  const handleReject = async () => {
    const { data: user } = await supabase.auth.getUser();
    await supabase.from('skill_approvals').update({
      status: 'rejected',
      revisado_por: user.user?.id,
      revisado_em: new Date().toISOString(),
    } as any).eq('id', approval.id);
    await supabase.from('skills').update({ status: 'draft' } as any).eq('id', approval.skill_id);
    qc.invalidateQueries({ queryKey: ['skill_approvals'] });
    qc.invalidateQueries({ queryKey: ['skills'] });
    toast.info('Skill retornada para rascunho.');
  };

  const statusIcon = {
    pending: <AlertCircle className="w-4 h-4 text-amber-400" />,
    approved: <CheckCircle2 className="w-4 h-4 text-green-400" />,
    rejected: <XCircle className="w-4 h-4 text-red-400" />,
    published: <Send className="w-4 h-4 text-primary" />,
  }[approval.status] || <AlertCircle className="w-4 h-4" />;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="font-medium text-sm text-foreground">{approval.skills?.nome || 'Skill'}</span>
          <span className="text-xs text-muted-foreground">v{approval.skills?.versao}</span>
        </div>
        {approval.status === 'pending' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10" onClick={handleReject}>
              <XCircle className="w-3 h-3 mr-1" /> Rejeitar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleApprove}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> Aprovar
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Solicitado em {format(new Date(approval.created_at), "d MMM 'às' HH:mm", { locale: ptBR })}
      </p>
    </div>
  );
};

const SkillVersionHistory: React.FC<{ skill: any }> = ({ skill }) => {
  const [expanded, setExpanded] = useState(false);
  const { data: versions = [] } = useSkillVersions(expanded ? skill.id : undefined);
  const rollback = useRollbackSkill();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm text-foreground">{skill.nome}</span>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded font-mono">v{skill.versao}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] ${
            skill.status === 'published' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>{skill.status}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
              {versions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nenhuma versão arquivada ainda.</p>
              ) : (
                versions.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium text-foreground">Versão {v.versao}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(v.publicado_em || v.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {v.notas_publicacao && <p className="text-[10px] text-muted-foreground italic">{v.notas_publicacao}</p>}
                      </div>
                    </div>
                    {v.is_rollback_target && v.versao < skill.versao && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => rollback.mutate({ skillId: skill.id, versionId: v.id })}
                        disabled={rollback.isPending}
                      >
                        <RotateCcw className="w-3 h-3" /> Rollback
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SkillVersions: React.FC = () => {
  const { data: skills = [], isLoading } = useSkills();
  const { data: approvals = [], isLoading: approvalsLoading } = useSkillApprovals();
  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Pending Approvals */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-foreground">Fila de Aprovação</h3>
          {pendingApprovals.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full font-medium">
              {pendingApprovals.length} pendente{pendingApprovals.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {approvalsLoading ? (
          <div className="h-20 rounded-xl border border-border animate-pulse bg-card" />
        ) : pendingApprovals.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary/40" />
            <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingApprovals.map(a => <ApprovalCard key={a.id} approval={a} />)}
          </div>
        )}
      </div>

      {/* Version History */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Histórico de Versões</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl border border-border animate-pulse bg-card" />)}
          </div>
        ) : skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma skill ainda.</p>
        ) : (
          <div className="space-y-3">
            {skills.map(skill => <SkillVersionHistory key={skill.id} skill={skill} />)}
          </div>
        )}
      </div>
    </div>
  );
};
