import React from 'react';
import { BarChart3, TrendingUp, Target, Calendar, Users, Zap, ArrowUpRight, Brain } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSkillRouterLogs, useSkillEvents, useSkills } from '@/hooks/useSkills';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

const KPICard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; change?: string; changePositive?: boolean }> = ({
  label, value, icon, change, changePositive
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-start justify-between mb-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">{icon}</div>
    </div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    {change && (
      <p className={`text-xs mt-1 flex items-center gap-1 ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
        <ArrowUpRight className={`w-3 h-3 ${!changePositive ? 'rotate-180' : ''}`} /> {change}
      </p>
    )}
  </div>
);

export const SkillAnalytics: React.FC = () => {
  const { data: logs = [] } = useSkillRouterLogs();
  const { data: events = [] } = useSkillEvents();
  const { data: skills = [] } = useSkills({ status: 'published' });

  // Compute KPIs from logs and events
  const totalSkillExecutions = logs.filter(l => l.skill_executada).length;
  const totalFallbacks = logs.filter(l => l.fallback_ativado).length;
  const avgConfidence = logs.length > 0
    ? (logs.reduce((sum, l) => sum + (l.score_confianca || 0), 0) / logs.length * 100).toFixed(1)
    : '—';

  const appointmentEvents = events.filter(e => e.event_type === 'appointment_confirmed').length;
  const handoffEvents = events.filter(e => e.event_type === 'handoff_triggered').length;
  const conversionEvents = events.filter(e => e.event_type === 'conversion_event').length;
  const qualifiedEvents = events.filter(e => e.event_type === 'lead_state_changed' && (e.payload as any)?.estado_novo === 'QUALIFIED').length;

  // Events per day (last 7 days)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dayStr = format(date, 'dd/MM', { locale: ptBR });
    const dayStart = startOfDay(date).toISOString();
    const dayEnd = new Date(startOfDay(date).getTime() + 86400000).toISOString();
    const count = events.filter(e => e.created_at >= dayStart && e.created_at < dayEnd).length;
    return { dia: dayStr, eventos: count };
  });

  // Skill usage from logs
  const skillUsage = skills.map(s => ({
    nome: s.nome.length > 16 ? s.nome.slice(0, 16) + '…' : s.nome,
    execucoes: logs.filter(l => l.skill_id === s.id && l.skill_executada).length,
    score: Math.round(s.score_base * 100),
  })).filter(s => s.execucoes > 0 || true).slice(0, 8);

  // Lead state distribution
  const stateColors: Record<string, string> = {
    NEW_LEAD: '#64748b',
    DISCOVERY: '#3b82f6',
    QUALIFIED: '#8b5cf6',
    OBJECTION: '#f59e0b',
    READY_TO_BOOK: '#10b981',
    BOOKED: '#22c55e',
    FOLLOWUP: '#06b6d4',
    HANDOFF_HUMAN: '#ef4444',
  };

  const stateDistribution = Object.entries(
    events
      .filter(e => e.event_type === 'lead_state_changed')
      .reduce((acc: Record<string, number>, e) => {
        const state = (e.payload as any)?.estado_novo || 'UNKNOWN';
        acc[state] = (acc[state] || 0) + 1;
        return acc;
      }, {})
  ).map(([estado, count]) => ({ estado, count }));

  const eventsPerType = Object.entries(
    events.reduce((acc: Record<string, number>, e) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1;
      return acc;
    }, {})
  ).map(([tipo, total]) => ({ tipo: tipo.replace(/_/g, ' '), total })).sort((a, b) => b.total - a.total).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Skills Executadas" value={totalSkillExecutions} icon={<Zap className="w-4 h-4" />} />
        <KPICard label="Qualificados" value={qualifiedEvents} icon={<Target className="w-4 h-4" />} />
        <KPICard label="Agendamentos" value={appointmentEvents} icon={<Calendar className="w-4 h-4" />} />
        <KPICard label="Conversões" value={conversionEvents} icon={<TrendingUp className="w-4 h-4" />} />
        <KPICard label="Confiança Média" value={`${avgConfidence}%`} icon={<Brain className="w-4 h-4" />} />
        <KPICard label="Handoffs Humanos" value={handoffEvents} icon={<Users className="w-4 h-4" />} />
        <KPICard label="Fallbacks" value={totalFallbacks} icon={<BarChart3 className="w-4 h-4" />} />
        <KPICard label="Skills Publicadas" value={skills.length} icon={<Zap className="w-4 h-4" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Events per day */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Eventos por Dia (7 dias)</h3>
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Sem dados ainda. Os eventos aparecerão conforme as skills forem usadas em produção.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={last7}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="eventos" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Skill usage */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Uso por Skill</h3>
          {skillUsage.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Publique skills para ver métricas de uso.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={skillUsage} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="execucoes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Event types */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Eventos por Tipo</h3>
          {eventsPerType.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Aguardando primeiros eventos.
            </div>
          ) : (
            <div className="space-y-2">
              {eventsPerType.map((item, i) => {
                const max = eventsPerType[0]?.total || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 truncate capitalize">{item.tipo}</span>
                    <div className="flex-1 bg-muted/30 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.total / max) * 100}%` }}
                        transition={{ delay: i * 0.05 }}
                        className="h-2 bg-primary rounded-full"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{item.total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lead state distribution */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição de Estados do Lead</h3>
          {stateDistribution.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Aguardando transições de estado.
            </div>
          ) : (
            <div className="space-y-2">
              {stateDistribution.sort((a, b) => b.count - a.count).map((item, i) => {
                const max = stateDistribution[0]?.count || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 truncate">{item.estado}</span>
                    <div className="flex-1 bg-muted/30 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.count / max) * 100}%` }}
                        transition={{ delay: i * 0.05 }}
                        className="h-2 rounded-full"
                        style={{ backgroundColor: stateColors[item.estado] || 'hsl(var(--primary))' }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
