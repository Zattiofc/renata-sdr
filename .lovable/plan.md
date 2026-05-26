## Remover campo "Script de Vendas" das Configurações

Como o script já está embutido no Prompt do Sistema, vamos remover o campo dedicado e o pipeline que o injetava separadamente.

### Mudanças

**Frontend**
- `src/components/settings/AgentSettings.tsx`: remover a seção "Script de Vendas" (textarea, botão "Restaurar Padrão", estado e save da coluna `sales_script`).
- `src/prompts/default-sales-script.ts`: deletar arquivo.

**Backend**
- `supabase/functions/nina-orchestrator/index.ts`: remover a leitura de `sales_script` de `nina_settings` e a injeção do bloco `<sales_script>` no prompt final. O orquestrador volta a usar apenas o `system_prompt`.

**Banco de dados**
- Migration: `ALTER TABLE public.nina_settings DROP COLUMN IF EXISTS sales_script;`

### Observações
- Nenhum dado de cliente é perdido — a coluna era opcional e o conteúdo equivalente já está no prompt do sistema.
- O comportamento volta a ser: 1 fonte de verdade = `system_prompt` + base de conhecimento (RAG).