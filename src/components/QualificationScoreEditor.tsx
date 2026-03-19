import React, { useState } from 'react';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { Button } from './Button';
import { Target } from 'lucide-react';

export interface ScoreCriteria {
  pain: number;
  timeline: number;
  decision: number;
  fit: number;
  [key: string]: number;
}

interface QualificationScoreEditorProps {
  currentScore: number;
  onSave: (score: number, criteria: ScoreCriteria) => void;
  className?: string;
}

const CRITERIA_LABELS: Record<keyof ScoreCriteria, { label: string; description: string }> = {
  pain: { label: 'Dor Identificada', description: 'Lead tem problema claro que seu produto resolve?' },
  timeline: { label: 'Prazo / Urgência', description: 'Qual a urgência de resolver o problema?' },
  decision: { label: 'Acesso ao Decisor', description: 'Está falando com quem decide?' },
  fit: { label: 'Fit Técnico', description: 'O produto atende as necessidades técnicas?' },
};

export const QualificationScoreEditor: React.FC<QualificationScoreEditorProps> = ({
  currentScore,
  onSave,
  className = '',
}) => {
  const [criteria, setCriteria] = useState<ScoreCriteria>({
    pain: Math.round(currentScore * 0.25),
    timeline: Math.round(currentScore * 0.25),
    decision: Math.round(currentScore * 0.25),
    fit: Math.round(currentScore * 0.25),
  });

  const totalScore = criteria.pain + criteria.timeline + criteria.decision + criteria.fit;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'SQL — Qualificado';
    if (score >= 40) return 'MQL — Em qualificação';
    return 'Frio — Não qualificado';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Score de Qualificação</span>
        </div>
        <div className="text-right">
          <span className={`text-2xl font-bold ${getScoreColor(totalScore)}`}>{totalScore}%</span>
          <p className={`text-[10px] font-medium ${getScoreColor(totalScore)}`}>{getScoreLabel(totalScore)}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            totalScore >= 70 ? 'bg-emerald-500' : totalScore >= 40 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${totalScore}%` }}
        />
      </div>

      {/* Criteria sliders */}
      <div className="space-y-3">
        {(Object.keys(CRITERIA_LABELS) as Array<keyof ScoreCriteria>).map((key) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-muted-foreground">{CRITERIA_LABELS[key].label}</Label>
              <span className="text-xs font-mono font-bold text-foreground">{criteria[key]}/25</span>
            </div>
            <Slider
              value={[criteria[key]]}
              onValueChange={([val]) => setCriteria(prev => ({ ...prev, [key]: val }))}
              max={25}
              step={1}
              className="w-full"
            />
            <p className="text-[9px] text-muted-foreground/70">{CRITERIA_LABELS[key].description}</p>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        className="w-full"
        onClick={() => onSave(totalScore, criteria)}
      >
        Salvar Score ({totalScore}%)
      </Button>
    </div>
  );
};
