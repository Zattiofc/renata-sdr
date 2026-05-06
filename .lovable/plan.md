# Corrigir: agente desligado mas enviando follow-up sozinho

## Diagnóstico

O orquestrador principal (`nina-orchestrator`) respeita corretamente os toggles `is_active` e `auto_response_enabled` em `nina_settings` — quando você desliga o agente, ele não responde a mensagens recebidas.

**Mas existe um segundo motor independente:** a edge function `smart-followup`, disparada por cron diariamente (10:00 GMT-3), que analisa conversas paradas há 12h+ e envia follow-ups proativos via Gemini. Ela **não verifica** `is_active` nem `auto_response_enabled` antes de enviar — busca diretamente `nina_settings` apenas para pegar `company_name`, `sdr_name` e `timezone`, e segue enviando.

É por isso que mesmo com o agente "desligado" você viu mensagens saindo sozinhas.

## Correção

### 1. `supabase/functions/smart-followup/index.ts`

Adicionar checagem global no início (antes de buscar candidatos):

- Selecionar também `is_active` e `auto_response_enabled` de `nina_settings`.
- Se `is_active = false` **OU** `auto_response_enabled = false` → logar `⛔ Agent disabled — skipping follow-up run` e retornar `{ status: 'skipped', reason: 'agent_disabled' }` sem processar nada.

### 2. (Defensivo) Respeitar horário ativo

Opcional na mesma rodada: se `nina_settings.active_hours_start/end` estiver definido e o horário atual (no `timezone` configurado) estiver fora da janela, também pular. Isso alinha o follow-up à mesma regra do orquestrador descrita em `mem://features/agent-toggle-enforcement`.

### 3. Atualizar memória

Atualizar `mem://features/autonomous-followup-engine` para registrar: "Respeita `is_active` e `auto_response_enabled` antes de qualquer envio."

## Fora de escopo

- Não mexer no orquestrador (já está correto).
- Não tocar em `run-automations`, `broadcast-processor` (broadcasts são intencionalmente independentes do toggle do agente — são campanhas manuais).
- Sem mudanças de UI.

## Como validar

Após o deploy, com o agente desligado, invocar manualmente o `smart-followup` e confirmar nos logs: `⛔ Agent disabled — skipping follow-up run` e zero mensagens enfileiradas.
