import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Bot, Loader2, Calendar, Wand2, Building2, RotateCcw, Info, MessageSquare, Eye, EyeOff } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import PromptGeneratorSheet from './PromptGeneratorSheet';
import PromptTestModal from './PromptTestModal';
import KnowledgeBase from './KnowledgeBase';
import { DEFAULT_NINA_PROMPT } from '@/prompts/default-nina-prompt';
import { useAuth } from '@/hooks/useAuth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AgentSettings {
  id?: string;
  system_prompt_override: string | null;
  is_active: boolean;
  auto_response_enabled: boolean;
  ai_model_mode: 'flash' | 'pro' | 'pro3' | 'adaptive';
  ai_provider: 'openai' | 'anthropic' | 'google';
  ai_api_key: string | null;
  ai_model_name: string | null;
  message_breaking_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  company_name: string | null;
  sdr_name: string | null;
  ai_scheduling_enabled: boolean;
  is_24_7: boolean;
}

const AI_PROVIDERS = [
  { id: 'openai' as const, label: 'OpenAI', icon: '🤖' },
  { id: 'google' as const, label: 'Google Gemini', icon: '💎' },
  { id: 'anthropic' as const, label: 'Anthropic', icon: '🧠' },
];

const PROVIDER_MODELS: Record<string, { id: string; label: string; desc: string; category?: string }[]> = {
  openai: [
    // GPT-5.x family (latest)
    { id: 'gpt-5.4', label: 'GPT-5.4', desc: 'Mais recente e capaz', category: 'GPT-5.x' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', desc: 'Rápido, otimizado p/ código', category: 'GPT-5.x' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', desc: 'Ultra rápido e econômico', category: 'GPT-5.x' },
    { id: 'gpt-5.2', label: 'GPT-5.2', desc: 'Raciocínio aprimorado', category: 'GPT-5.x' },
    { id: 'gpt-5', label: 'GPT-5', desc: 'Multimodal poderoso', category: 'GPT-5.x' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', desc: 'Custo-benefício', category: 'GPT-5.x' },
    { id: 'gpt-5-nano', label: 'GPT-5 Nano', desc: 'Alto volume', category: 'GPT-5.x' },
    // Reasoning models
    { id: 'o4-mini', label: 'o4-mini', desc: 'Raciocínio rápido', category: 'Reasoning' },
    { id: 'o3', label: 'o3', desc: 'Raciocínio profundo', category: 'Reasoning' },
    { id: 'o3-mini', label: 'o3-mini', desc: 'Raciocínio econômico', category: 'Reasoning' },
    // Legacy
    { id: 'gpt-4o', label: 'GPT-4o', desc: 'Estável e confiável', category: 'Legacy' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Econômico', category: 'Legacy' },
  ],
  google: [
    // Gemini 3.x family (latest)
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'Mais avançado, raciocínio complexo', category: 'Gemini 3.x' },
    { id: 'gemini-3-flash', label: 'Gemini 3 Flash', desc: 'Potente e rápido', category: 'Gemini 3.x' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', desc: 'Ultra econômico', category: 'Gemini 3.x' },
    // Gemini 2.5 family
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Raciocínio + multimodal', category: 'Gemini 2.5' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Balanceado', category: 'Gemini 2.5' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Mais econômico', category: 'Gemini 2.5' },
    // Legacy
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Estável', category: 'Legacy' },
  ],
  anthropic: [
    // Claude 4.6 family (latest)
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', desc: 'Mais inteligente, agentes e código', category: 'Claude 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: 'Melhor custo-benefício', category: 'Claude 4.6' },
    // Claude 4.5 family
    { id: 'claude-opus-4-5-20250220', label: 'Claude Opus 4.5', desc: 'Criatividade avançada', category: 'Claude 4.5' },
    // Claude 4 family
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', desc: 'Confiável', category: 'Claude 4' },
    { id: 'claude-haiku-4-20250514', label: 'Claude Haiku 4', desc: 'Ultra rápido', category: 'Claude 4' },
    // Legacy
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', desc: 'Estável', category: 'Legacy' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', desc: 'Econômico', category: 'Legacy' },
  ],
};

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

// Using shared prompt from @/prompts/default-nina-prompt

export interface AgentSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const AgentSettings = forwardRef<AgentSettingsRef, {}>((props, ref) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>({
    system_prompt_override: null,
    is_active: true,
    auto_response_enabled: true,
    ai_model_mode: 'flash',
    ai_provider: 'google',
    ai_api_key: null,
    ai_model_name: null,
    message_breaking_enabled: true,
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    business_days: [1, 2, 3, 4, 5],
    company_name: null,
    sdr_name: null,
    ai_scheduling_enabled: true,
    is_24_7: false,
  });

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: loadSettings,
    isSaving: saving
  }));

  useEffect(() => {
    if (user?.id) {
      loadSettings();
    }
  }, [user?.id]);

  const loadSettings = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      // Fetch global nina_settings (no user_id filter - single tenant)
      const { data, error } = await supabase
        .from('nina_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Se não existe registro, admin precisa configurar via onboarding
      if (!data) {
        console.log('[AgentSettings] No global settings found');
        setLoading(false);
        return;
      }

      // Load settings from global data
      setSettings({
        id: data.id,
        system_prompt_override: data.system_prompt_override,
        is_active: data.is_active,
        ai_model_mode: (data.ai_model_mode === 'flash' || data.ai_model_mode === 'pro' || data.ai_model_mode === 'pro3' || data.ai_model_mode === 'adaptive') 
          ? data.ai_model_mode 
          : 'flash',
        ai_provider: ((data as any).ai_provider === 'openai' || (data as any).ai_provider === 'anthropic' || (data as any).ai_provider === 'google')
          ? (data as any).ai_provider
          : 'google',
        ai_api_key: (data as any).ai_api_key || null,
        ai_model_name: (data as any).ai_model_name || null,
        message_breaking_enabled: data.message_breaking_enabled,
        business_hours_start: data.business_hours_start,
        business_hours_end: data.business_hours_end,
        business_days: data.business_days,
        company_name: data.company_name,
        sdr_name: data.sdr_name,
        ai_scheduling_enabled: data.ai_scheduling_enabled ?? true,
        auto_response_enabled: data.auto_response_enabled,
      });
    } catch (error) {
      console.error('[AgentSettings] Error loading settings:', error);
      toast.error('Erro ao carregar configurações do agente');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate API key is set
      if (!settings.ai_api_key) {
        toast.error('Configure a API Key do provedor de IA antes de salvar');
        setSaving(false);
        return;
      }

      // Update global settings
      const { error } = await supabase
        .from('nina_settings')
        .update({
          system_prompt_override: settings.system_prompt_override,
          is_active: settings.is_active,
          auto_response_enabled: settings.auto_response_enabled,
          ai_model_mode: settings.ai_model_mode,
          ai_provider: settings.ai_provider,
          ai_api_key: settings.ai_api_key,
          ai_model_name: settings.ai_model_name,
          message_breaking_enabled: settings.message_breaking_enabled,
          business_hours_start: settings.business_hours_start,
          business_hours_end: settings.business_hours_end,
          business_days: settings.business_days,
          company_name: settings.company_name,
          sdr_name: settings.sdr_name,
          ai_scheduling_enabled: settings.ai_scheduling_enabled,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settings.id!);

      if (error) throw error;

      toast.success('Configurações do agente salvas com sucesso!');
    } catch (error) {
      console.error('Error saving agent settings:', error);
      toast.error('Erro ao salvar configurações do agente');
    } finally {
      setSaving(false);
    }
  };

  const toggleBusinessDay = (day: number) => {
    setSettings(prev => ({
      ...prev,
      business_days: prev.business_days.includes(day)
        ? prev.business_days.filter(d => d !== day)
        : [...prev.business_days, day].sort()
    }));
  };

  const handlePromptGenerated = (prompt: string) => {
    setSettings(prev => ({ ...prev, system_prompt_override: prompt }));
  };

  const handleRestoreDefault = () => {
    setSettings(prev => ({ ...prev, system_prompt_override: DEFAULT_NINA_PROMPT }));
    toast.success('Prompt restaurado para o padrão');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <PromptGeneratorSheet
        open={isGeneratorOpen}
        onOpenChange={setIsGeneratorOpen}
        onPromptGenerated={handlePromptGenerated}
      />
      <PromptTestModal
        open={isTestModalOpen}
        onOpenChange={setIsTestModalOpen}
        systemPrompt={settings.system_prompt_override || DEFAULT_NINA_PROMPT}
      />
      
      <TooltipProvider>
      <div className="space-y-6">
        {/* System Prompt - PRIMEIRA SEÇÃO */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Prompt do Sistema</h3>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestoreDefault}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restaurar Padrão
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTestModalOpen(true)}
                className="text-primary hover:text-primary hover:bg-primary/10"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Testar Prompt
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsGeneratorOpen(true)}
                className="text-primary hover:text-primary hover:bg-primary/10"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Gerar com IA
              </Button>
            </div>
          </div>
          
          {/* Nota explicativa sobre o prompt */}
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <p className="flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Template de exemplo:</strong> Este é um modelo inicial para você começar. 
                Personalize completamente com as informações da sua empresa, produtos, serviços e tom de comunicação.
              </span>
            </p>
          </div>
          
          <textarea
            value={settings.system_prompt_override || ''}
            onChange={(e) => setSettings({ ...settings, system_prompt_override: e.target.value || null })}
            placeholder="Cole ou escreva o prompt do agente aqui..."
            rows={12}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y font-mono custom-scrollbar"
          />
          <details className="mt-3">
            <summary className="text-xs text-primary cursor-pointer hover:text-primary/80 flex items-center gap-2">
              <span>📋</span> Variáveis dinâmicas disponíveis
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted border border-border text-xs font-mono space-y-1">
              <div><span className="text-primary">{"{{ data_hora }}"}</span> → Data e hora atual (ex: 29/11/2024 14:35:22)</div>
              <div><span className="text-primary">{"{{ data }}"}</span> → Apenas data (ex: 29/11/2024)</div>
              <div><span className="text-primary">{"{{ hora }}"}</span> → Apenas hora (ex: 14:35:22)</div>
              <div><span className="text-primary">{"{{ dia_semana }}"}</span> → Dia da semana por extenso (ex: sexta-feira)</div>
              <div><span className="text-primary">{"{{ cliente_nome }}"}</span> → Nome do cliente na conversa</div>
              <div><span className="text-primary">{"{{ cliente_telefone }}"}</span> → Telefone do cliente</div>
            </div>
          </details>
        </div>

        {/* 2-Column Grid: Company Info + Business Hours */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Info */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-foreground">Informações da Empresa</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Nome da Empresa <span className="text-amber-600 text-[10px]">(recomendado)</span>
                </label>
                <input
                  type="text"
                  value={settings.company_name || ''}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value || null })}
                  placeholder="Nome da sua empresa"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Nome do Agente <span className="text-amber-600 text-[10px]">(recomendado)</span>
                </label>
                <input
                  type="text"
                  value={settings.sdr_name || ''}
                  onChange={(e) => setSettings({ ...settings, sdr_name: e.target.value || null })}
                  placeholder="Nome do agente (ex: Ana, Sofia)"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>

          {/* Business Hours */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-foreground">Horário de Atendimento</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Início</label>
                  <input
                    type="time"
                    value={settings.business_hours_start}
                    onChange={(e) => setSettings({ ...settings, business_hours_start: e.target.value })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Fim</label>
                  <input
                    type="time"
                    value={settings.business_hours_end}
                    onChange={(e) => setSettings({ ...settings, business_hours_end: e.target.value })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Dias da Semana</label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      onClick={() => toggleBusinessDay(day.value)}
                      className={`flex-1 h-9 text-xs font-medium rounded-lg transition-all ${
                        settings.business_days.includes(day.value)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Comportamento */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-5 h-5 text-violet-600" />
            <h3 className="font-semibold text-foreground">Comportamento</h3>
          </div>
          
          {/* AI Provider Selection */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-3 block">Provedor de IA</label>
            <div className="grid grid-cols-3 gap-2">
              {AI_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSettings({ ...settings, ai_provider: provider.id, ai_model_name: PROVIDER_MODELS[provider.id]?.[0]?.id || null })}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                    settings.ai_provider === provider.id
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <span className="text-lg">{provider.icon}</span>
                  <span className="text-xs font-medium">{provider.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              API Key ({AI_PROVIDERS.find(p => p.id === settings.ai_provider)?.label})
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.ai_api_key || ''}
                onChange={(e) => setSettings({ ...settings, ai_api_key: e.target.value || null })}
                placeholder={`Cole sua API Key do ${AI_PROVIDERS.find(p => p.id === settings.ai_provider)?.label}`}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!settings.ai_api_key && (
              <p className="text-xs text-amber-600 mt-1">⚠️ API Key obrigatória para o agente funcionar</p>
            )}
          </div>

          {/* Model Selection per provider */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-3 block">Modelo</label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {(PROVIDER_MODELS[settings.ai_provider] || []).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSettings({ ...settings, ai_model_name: model.id })}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                    settings.ai_model_name === model.id
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <span className="text-xs font-medium">{model.label}</span>
                  <span className="text-[10px] text-center opacity-70">{model.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles em grid 2x2 com tooltips */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted border border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-foreground cursor-help flex items-center gap-1.5">
                    Agente Ativo
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Liga ou desliga o agente de IA completamente. Quando desativado, nenhuma resposta automática será enviada.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.is_active}
                  onChange={(e) => setSettings({ ...settings, is_active: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted border border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-foreground cursor-help flex items-center gap-1.5">
                    Resposta Automática
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Quando ativo, o agente responde automaticamente sem necessidade de aprovação humana.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_response_enabled}
                  onChange={(e) => setSettings({ ...settings, auto_response_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted border border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-foreground cursor-help flex items-center gap-1.5">
                    Quebrar Mensagens
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Divide respostas longas em várias mensagens menores, simulando uma conversa mais natural.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.message_breaking_enabled}
                  onChange={(e) => setSettings({ ...settings, message_breaking_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted border border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-foreground cursor-help flex items-center gap-1.5">
                    Agendamento via IA
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">Permite que o agente crie, altere e cancele agendamentos automaticamente durante a conversa.</p>
                </TooltipContent>
              </Tooltip>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ai_scheduling_enabled}
                  onChange={(e) => setSettings({ ...settings, ai_scheduling_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Knowledge Base */}
        <KnowledgeBase />

      </div>
      </TooltipProvider>
    </>
  );
});

AgentSettings.displayName = 'AgentSettings';

export default AgentSettings;