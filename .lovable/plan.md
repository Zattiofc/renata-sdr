

# Chat IA Interno — Assistente de Operações do Sistema

## Visão Geral
Criar uma página **Assistente IA** acessível no sidebar, onde o operador do sistema pode conversar com uma IA que tem acesso completo ao banco de dados e pode executar ações como enviar mensagens, consultar contatos, analisar pipeline, disparar follow-ups, etc.

Diferente do chat de WhatsApp (que é a Nina falando com leads), este é um **chat interno para o operador** gerenciar o sistema via linguagem natural.

## Exemplo de uso
- "Analise os contatos que não responderam nas últimas 24h e envie um follow-up"
- "Quais deals estão parados no estágio Qualificação há mais de 3 dias?"
- "Mova o deal do João para Negociação"
- "Me mostre o estoque atual de Pastrami"
- "Envie uma mensagem pro 5511999999999 dizendo que o pedido está pronto"

---

## Arquitetura

```text
┌─────────────────┐       ┌──────────────────────┐
│  /ai-assistant   │──────▶│  Edge Function        │
│  (React page)   │       │  ai-assistant         │
│  Chat UI        │◀──────│                       │
└─────────────────┘       │  Tools:               │
                          │  - query_database     │
                          │  - send_message       │
                          │  - update_deal        │
                          │  - list_contacts      │
                          │  - check_inventory    │
                          │  - create_automation  │
                          │  - send_bulk_followup │
                          └──────────┬───────────┘
                                     │
                              Supabase DB + 
                              send-evolution-message
```

## O que será construído

### 1. Edge Function `ai-assistant`
- Recebe mensagens do operador + histórico de conversa
- Usa o modelo configurado em `nina_settings` (via Lovable AI gateway)
- System prompt focado em operações internas (não é a Nina/SDR)
- **Tools disponíveis:**
  - `query_contacts` — buscar contatos por nome, telefone, status, última atividade
  - `query_deals` — buscar deals por estágio, contato, valor
  - `update_deal_stage` — mover deal no pipeline
  - `send_whatsapp_message` — enviar mensagem via Evolution API
  - `send_bulk_followup` — enviar follow-up para múltiplos contatos de uma vez
  - `check_inventory` — consultar estoque atual
  - `list_appointments` — consultar agendamentos
  - `query_conversations` — buscar conversas recentes, sem resposta, etc.
- Loop de tool calling: executa tools, retorna resultado para a IA, e repete até ter resposta final

### 2. Página React `/ai-assistant`
- Chat interface simples com histórico de mensagens na sessão
- Renderização markdown das respostas (react-markdown)
- Indicador de loading enquanto a IA processa
- Exibição de ações executadas (ex: "✅ Mensagem enviada para João")

### 3. Sidebar
- Novo item "Assistente IA" com ícone `Bot` do lucide-react

### 4. Rota no App.tsx
- `/ai-assistant` → componente `AIAssistant`

## Detalhes técnicos

### Edge Function — tools com acesso real ao banco
Cada tool executa queries reais via `supabase` client (service role). Exemplo:

- `query_contacts`: `SELECT * FROM contacts WHERE name ILIKE '%termo%' OR last_activity < now() - interval 'X hours'`
- `send_whatsapp_message`: invoca `send-evolution-message` internamente
- `send_bulk_followup`: itera sobre contatos filtrados e envia mensagem personalizada para cada um

### System Prompt
Prompt de operador interno — explica que o assistente tem acesso ao banco, pode executar ações, e deve confirmar antes de ações destrutivas ou envios em massa.

### Config
- `supabase/config.toml`: adicionar `[functions.ai-assistant]` com `verify_jwt = false`

## Arquivos a criar/editar

| Arquivo | Ação |
|---|---|
| `supabase/functions/ai-assistant/index.ts` | Edge function com tools |
| `src/pages/AIAssistant.tsx` | Página de chat |
| `src/components/Sidebar.tsx` | Novo menu item |
| `src/App.tsx` | Nova rota |
| `supabase/config.toml` | Config da edge function |

