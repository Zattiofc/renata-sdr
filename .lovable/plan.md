## Diagnóstico

Dois pontos no código estão **sobrepondo** o que você definiu no Prompt do Sistema:

### 1. Guardrail de PIX automático
No `nina-orchestrator/index.ts` (linhas 2715-2774) existe a função `enforcePixGuardrail` que **anexa programaticamente** "Nossa chave PIX: familianavares@gmail.com" em **qualquer** resposta que tenha "Pedido" + "Total". Isso ignora o que o prompt diz. Por isso o PIX continua sendo enviado mesmo após você instruir o contrário.

### 2. Nome completo do cliente
A variável `{{ cliente_nome }}` já recebe só o primeiro nome (linha 3258 faz `split(/\s+/)[0]`). O problema é que o **nome completo do contato** ("Renata Tavares") aparece em outros lugares enviados ao modelo:
- Bloco de contexto do lead (`contact.name` cru)
- `resumo_vivo` / memória da conversa
- Histórico de mensagens anteriores

O modelo acaba ecoando "Renata Tavares" do contexto, não da variável.

---

## Plano de correção

### A. Remover o guardrail de PIX
- Em `supabase/functions/nina-orchestrator/index.ts`:
  - Remover a função `enforcePixGuardrail` e todas as chamadas a ela.
  - Manter apenas `DEFAULT_PIX_KEY` se for usada por outras tools (validar antes de remover).
- O envio do PIX passa a depender **100% do prompt do sistema**, como você já configurou.

### B. Atualizar memórias que forçavam PIX
- `mem://technical/pix-delivery-guardrail` → marcar como descontinuada.
- `mem://business/sales-playbook-joao` → remover a regra "PIX em sequência obrigatória".
- Atualizar `mem://index.md` removendo a linha "PIX key... Always send in a separate message chunk" do Core (passa a ser decisão do prompt).

### C. Forçar primeiro nome em todo lugar
Em `nina-orchestrator/index.ts`:
1. Criar helper `getFirstName(contact)` único.
2. Onde o `contact.name` é injetado no contexto enviado ao modelo (bloco do lead, prompt enhancements, ferramentas), substituir por `firstName`.
3. Adicionar uma **etapa de pós-processamento** na resposta do modelo: se a resposta contém `"{firstName} {lastName}"` (nome completo do contato), substituir por apenas `firstName`. Isso garante que mesmo se o modelo alucinar, o cliente nunca recebe nome+sobrenome.
4. Reforçar no prompt do sistema (apenas como reforço, não como única defesa) a regra de primeiro nome.

### D. Validação
- Testar via "Simulação Real" (PromptTestModal) com um contato chamado "Renata Tavares":
  - Verificar que Joao chama apenas "Renata".
  - Verificar que o PIX **não é enviado** se o prompt não pedir.
  - Verificar que se você instruir no prompt para enviar PIX, ele ainda envia (não quebrar o caso positivo).

---

## Arquivos alterados
- `supabase/functions/nina-orchestrator/index.ts` (remover guardrail PIX + sanitização de nome)
- `mem://index.md`, `mem://technical/pix-delivery-guardrail`, `mem://business/sales-playbook-joao` (alinhar memórias)

## Riscos
- Se você tiver instruções no prompt esperando que o sistema "complete" o PIX automaticamente, elas precisarão ser revistas. Recomendo deixar o prompt explícito sobre **quando** enviar (ex: "só envie a chave PIX quando o cliente pedir" ou "envie junto com o resumo após confirmação").

Aprova esse plano? Posso executar em seguida.