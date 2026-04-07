

## Plano: Recuperar Service Role Key + Corrigir Build Errors

### 1. Criar Edge Function temporária `get-service-key`
- Função simples que lê `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` e retorna o valor
- Após copiar a chave, a função será removida por segurança

### 2. Corrigir erros de build no `nina-orchestrator`
O último diff introduziu 3 erros:
- **Linha ~456**: `conversation.id` — a variável `conversation` não tem `.id` no escopo atual (deveria usar a conversa correta do contexto)
- **Linha ~466**: `systemPrompt` não está definido — o código removeu a declaração mas ainda referencia a variável
- **Linha ~475**: Mesmo problema — `systemPrompt` passado para `processQueueItem` sem estar declarado

**Correção**: Restaurar a declaração de `systemPrompt` antes do bloco adicionado e corrigir a referência de `conversation`

### 3. Corrigir erros de build no `ai-assistant`
- 4 ocorrências de `catch (e)` onde `e` é `unknown` — adicionar type assertion `(e as Error).message`

### 4. Corrigir outros erros menores
- `backfill-embeddings`: `Supabase.ai.Session` não existe + `error` unknown
- `evolution-webhook`: `reactionMessage` property  
- `generate-embeddings`: mesmos problemas do backfill
- `import-inventory`: `error` unknown
- `run-automations`: `error`/`err` unknown

### Arquivos a editar
| Arquivo | Alteração |
|---|---|
| `supabase/functions/get-service-key/index.ts` | Criar (temporário) |
| `supabase/functions/nina-orchestrator/index.ts` | Restaurar `systemPrompt` + corrigir `conversation` ref |
| `supabase/functions/ai-assistant/index.ts` | Type assertions em catch blocks |
| `supabase/functions/backfill-embeddings/index.ts` | Fix Supabase.ai + error typing |
| `supabase/functions/evolution-webhook/index.ts` | Fix reactionMessage property |
| `supabase/functions/generate-embeddings/index.ts` | Fix Supabase.ai + error typing |
| `supabase/functions/import-inventory/index.ts` | Fix error typing |
| `supabase/functions/run-automations/index.ts` | Fix error typing |

