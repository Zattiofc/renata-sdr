import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, RotateCcw, BookOpen, Zap, FlaskConical, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSkills, useCreateSkill } from '@/hooks/useSkills';

type LabMode = 'train' | 'create' | 'improve' | 'simulate';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const MODE_CONFIG: Record<LabMode, { label: string; icon: React.ReactNode; color: string; description: string; placeholder: string }> = {
  train: {
    label: 'Treinar',
    icon: <BookOpen className="w-4 h-4" />,
    color: 'text-blue-400',
    description: 'Cole uma conversa real para extrair intenção, objeções e sugerir melhorias.',
    placeholder: 'Cole aqui a conversa real que você quer analisar...',
  },
  create: {
    label: 'Criar Skill',
    icon: <Zap className="w-4 h-4" />,
    color: 'text-primary',
    description: 'Descreva o objetivo da skill e o sistema gera um rascunho completo.',
    placeholder: 'Descreva o objetivo da skill que você quer criar. Ex: "Preciso de uma skill para tratar objeção de preço para clínicas odontológicas"',
  },
  improve: {
    label: 'Melhorar Skill',
    icon: <RotateCcw className="w-4 h-4" />,
    color: 'text-amber-400',
    description: 'Selecione uma skill existente e proponha otimizações baseadas em dados.',
    placeholder: 'Descreva o problema que você está vendo na skill ou o que quer melhorar...',
  },
  simulate: {
    label: 'Simulação',
    icon: <FlaskConical className="w-4 h-4" />,
    color: 'text-green-400',
    description: 'Teste uma skill em cenário controlado e receba score de qualidade.',
    placeholder: 'Descreva o cenário de simulação ou a mensagem do lead para testar...',
  },
};

const SYSTEM_PROMPTS: Record<LabMode, string> = {
  train: `Você é um analista especialista em SDR conversacional. Analise a conversa fornecida e retorne:
1. **Intenções detectadas** (lista)
2. **Estado do lead** (NEW_LEAD/DISCOVERY/QUALIFIED/OBJECTION/READY_TO_BOOK/BOOKED/FOLLOWUP/HANDOFF_HUMAN)
3. **Objeções identificadas** (se houver)
4. **Pontos de melhoria** na abordagem do SDR
5. **Skill recomendada** para cada situação
6. **Próximo passo ideal** para esse lead
Use markdown. Seja objetivo e acionável.`,

  create: `Você é um arquiteto de skills para SDR conversacional. Quando o usuário descrever um objetivo, crie um rascunho completo de skill no seguinte formato JSON:

\`\`\`json
{
  "nome": "nome-da-skill",
  "descricao": "...",
  "nicho": "...",
  "triggers": ["palavra1", "palavra2"],
  "objetivo": "...",
  "fluxo": [
    {"step": 1, "acao": "..."},
    {"step": 2, "acao": "..."}
  ],
  "respostas_base": [
    {"contexto": "...", "mensagem": "..."}
  ],
  "ctas_permitidos": ["CTA 1", "CTA 2"],
  "guardrails": ["Regra 1", "Regra 2"],
  "tags": ["tag1", "tag2"],
  "lead_states_aplicaveis": ["DISCOVERY", "QUALIFIED"]
}
\`\`\`

Após o JSON, explique brevemente cada seção e pergunte se há ajustes.`,

  improve: `Você é um otimizador de skills para SDR. Analise a skill ou problema descrito e forneça:
1. **Diagnóstico** — o que está causando baixa performance
2. **Melhorias propostas** — lista de otimizações específicas
3. **Copy alternativo** — exemplo de mensagem melhorada
4. **Guardrails adicionais** — riscos a mitigar
5. **KPIs para medir sucesso** — como saber se melhorou
Use exemplos concretos. Seja diretivo.`,

  simulate: `Você é um avaliador de skills para SDR. Para cada mensagem de lead fornecida, simule a execução de uma skill e retorne:

**Avaliação da Skill:**
- 🎯 **Clareza**: X/10 — [justificativa]
- 🚀 **Força do CTA**: X/10 — [justificativa]  
- ✅ **Compliance**: X/10 — [justificativa]
- 💰 **Potencial de Conversão**: X/10 — [justificativa]
- **Score Geral**: X/10

**Resposta Simulada:**
[A resposta que a skill geraria]

**Pontos de Atenção:**
[Lista de riscos ou melhorias]`,
};

export const SkillLabChat: React.FC = () => {
  const [mode, setMode] = useState<LabMode>('create');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: skills } = useSkills({ status: 'published' });
  const createSkill = useCreateSkill();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleModeChange = (newMode: LabMode) => {
    setMode(newMode);
    setShowModeMenu(false);
    setMessages([]);
    setInput('');
  };

  const extractAndSaveSkill = async (content: string) => {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) return;
    try {
      const skillData = JSON.parse(jsonMatch[1]);
      await createSkill.mutateAsync(skillData);
    } catch {
      // Silent fail — user can save manually
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input, timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPTS[mode] },
        ...newMessages.map(m => ({ role: m.role, content: m.content })),
      ];

      const resp = await fetch(`${supabaseUrl}/functions/v1/skill-lab-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, mode }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const result = await resp.json();
      const assistantContent = result.content || 'Sem resposta do assistente.';

      const assistantMsg: Message = { role: 'assistant', content: assistantContent, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);

      // Auto-save if mode is 'create' and response contains JSON
      if (mode === 'create' && assistantContent.includes('```json')) {
        await extractAndSaveSkill(assistantContent);
      }
    } catch (error: any) {
      toast.error('Erro no Lab: ' + error.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const currentMode = MODE_CONFIG[mode];

  return (
    <div className="flex flex-col h-[calc(100vh-240px)] min-h-[500px] rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-card/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`${currentMode.color}`}>{currentMode.icon}</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Modo: {currentMode.label}</p>
            <p className="text-xs text-muted-foreground">{currentMode.description}</p>
          </div>
        </div>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => setShowModeMenu(!showModeMenu)}
          >
            Mudar Modo <ChevronDown className="w-3 h-3" />
          </Button>
          <AnimatePresence>
            {showModeMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 mt-2 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
              >
                {(Object.entries(MODE_CONFIG) as [LabMode, typeof currentMode][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => handleModeChange(key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-primary/5 transition-colors text-left ${mode === key ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                  >
                    <span className={cfg.color}>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center gap-4 py-12"
            >
              <div className={`p-4 rounded-2xl bg-primary/10 border border-primary/20 ${currentMode.color}`}>
                {currentMode.icon}
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Modo {currentMode.label}</p>
                <p className="text-muted-foreground text-sm max-w-md">{currentMode.description}</p>
              </div>
              <p className="text-xs text-muted-foreground italic">{currentMode.placeholder}</p>
            </motion.div>
          )}
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content.split('```').map((part, idx) => {
                    if (idx % 2 === 1) {
                      const lines = part.split('\n');
                      const lang = lines[0];
                      const code = lines.slice(1).join('\n');
                      return (
                        <pre key={idx} className="mt-2 mb-2 p-3 bg-black/30 rounded-lg text-xs overflow-x-auto">
                          <code>{code}</code>
                        </pre>
                      );
                    }
                    return <span key={idx}>{part}</span>;
                  })}
                </div>
                <p className="text-[10px] opacity-50 mt-1 text-right">
                  {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Processando...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/80">
        <div className="flex gap-3">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={currentMode.placeholder}
            className="flex-1 min-h-[60px] max-h-[120px] resize-none text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="self-end px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 ml-1">Enter para enviar · Shift+Enter para nova linha</p>
      </div>
    </div>
  );
};
