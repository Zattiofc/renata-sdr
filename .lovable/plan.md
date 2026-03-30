

# Automações — Menu de Regras Automatizadas

## Visão Geral
Criar uma página **Automações** (`/automations`) onde o usuário configura regras do tipo "se X acontecer, então faça Y", armazenadas no banco e executadas por uma edge function periódica (cron via `pg_cron`).

## Exemplo de uso
> "Cliente não respondeu há 5 horas → enviar follow-up automático"

---

## Arquitetura

```text
┌──────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  UI: /automations │────▶│  Tabela: automations  │◀────│  pg_cron (1min) │
│  CRUD de regras   │     │  trigger + action     │     │  ↓              │
└──────────────────┘     └──────────────────────┘     │  Edge Function  │
                                                       │  run-automations│
                                                       └────────┬────────┘
                                                                │
                                                       ┌────────▼────────┐
                                                       │  send_queue     │
                                                       │  (WhatsApp msg) │
                                                       └─────────────────┘
```

---

## 1. Banco de Dados — Migration

**Tabela `automations`:**
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| name | text | Nome da automação |
| is_active | boolean | Liga/desliga |
| trigger_type | text | Ex: `no_reply`, `lead_state_change`, `tag_added`, `new_contact` |
| trigger_config | jsonb | Parâmetros (ex: `{ "hours": 5 }`) |
| action_type | text | Ex: `send_message`, `add_tag`, `change_stage`, `notify_team` |
| action_config | jsonb | Parâmetros (ex: `{ "message": "Olá, tudo bem?" }`) |
| max_executions | int | Limite por contato (evitar spam) |
| cooldown_hours | int | Intervalo mínimo entre execuções |
| created_by | uuid | Usuário que criou |
| created_at / updated_at | timestamp | |

**Tabela `automation_executions`:**
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| automation_id | uuid FK | |
| contact_id | uuid FK | |
| conversation_id | uuid | |
| executed_at | timestamp | |
| result | text | success / error |
| metadata | jsonb | Detalhes |

RLS: acesso total para `authenticated` (single-tenant).

## 2. Edge Function — `run-automations`

Chamada a cada minuto via `pg_cron`. Lógica por trigger_type:

- **`no_reply`**: busca conversas com `status = 'nina'`, `last_message_at < now() - X horas`, última mensagem do tipo `nina/human` (ou seja, o lead não respondeu). Enfileira follow-up na `send_queue`.
- **`new_contact`**: contatos criados nos últimos 2 min sem mensagem → envia boas-vindas.
- **`lead_state_change`**: verifica `lead_state_history` para transições recentes.
- **`tag_added`**: verifica contatos com tag específica sem execução anterior.

Cada execução registra em `automation_executions` para evitar duplicatas e respeitar cooldown/max.

## 3. Página UI — `src/pages/Automations.tsx`

- Lista de automações com toggle ativo/inativo
- Modal de criação/edição com:
  - Nome
  - **Gatilho** (dropdown): "Sem resposta por X horas", "Novo contato", "Mudança de estado", "Tag adicionada"
  - Config do gatilho (campos dinâmicos por tipo)
  - **Ação** (dropdown): "Enviar mensagem", "Adicionar tag", "Mover no pipeline", "Notificar equipe"
  - Config da ação (campos dinâmicos)
  - Limite de execuções e cooldown
- Log de execuções recentes por automação
- Contadores: execuções hoje, taxa de sucesso

## 4. Integração

- **Sidebar**: adicionar item "Automações" com ícone `Zap`
- **App.tsx**: rota `/automations`
- **pg_cron**: schedule `run-automations` a cada minuto
- **config.toml**: `verify_jwt = false` para `run-automations`

## Arquivos a criar/editar

| Arquivo | Ação |
|---|---|
| `supabase/migrations/xxx.sql` | Tabelas + RLS + realtime |
| `supabase/functions/run-automations/index.ts` | Motor de execução |
| `src/pages/Automations.tsx` | Página principal |
| `src/hooks/useAutomations.ts` | Hook CRUD |
| `src/components/Sidebar.tsx` | Novo menu item |
| `src/App.tsx` | Nova rota |
| `supabase/config.toml` | Config da edge function |

