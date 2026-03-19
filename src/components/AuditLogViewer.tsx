import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Clock, User, Search, Loader2 } from 'lucide-react';

interface AuditLog {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'secret.viewed': { label: 'Segredo visualizado', color: 'text-amber-600 bg-amber-500/10' },
  'secret.updated': { label: 'Segredo atualizado', color: 'text-blue-600 bg-blue-500/10' },
  'member.created': { label: 'Membro criado', color: 'text-emerald-600 bg-emerald-500/10' },
  'member.deleted': { label: 'Membro removido', color: 'text-red-600 bg-red-500/10' },
  'member.updated': { label: 'Membro atualizado', color: 'text-blue-600 bg-blue-500/10' },
  'pipeline.stage_created': { label: 'Etapa criada', color: 'text-emerald-600 bg-emerald-500/10' },
  'pipeline.stage_deleted': { label: 'Etapa removida', color: 'text-red-600 bg-red-500/10' },
  'pipeline.deal_moved': { label: 'Deal movido', color: 'text-primary bg-primary/10' },
  'settings.updated': { label: 'Config atualizada', color: 'text-blue-600 bg-blue-500/10' },
  'deal.score_updated': { label: 'Score atualizado', color: 'text-violet-600 bg-violet-500/10' },
};

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as any[]) || []);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      (log.user_email || '').toLowerCase().includes(term) ||
      (log.action || '').toLowerCase().includes(term) ||
      (log.entity_type || '').toLowerCase().includes(term)
    );
  });

  const getActionInfo = (action: string) => ACTION_LABELS[action] || { label: action, color: 'text-muted-foreground bg-muted' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Trilha de Auditoria</h3>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum log de auditoria encontrado
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
          {filteredLogs.map((log) => {
            const actionInfo = getActionInfo(log.action);
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg hover:bg-accent/30 transition-colors">
                <div className={`p-1.5 rounded ${actionInfo.color}`}>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{log.entity_type}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{log.user_email || 'Sistema'}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {new Date(log.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
                      {JSON.stringify(log.details).substring(0, 100)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
