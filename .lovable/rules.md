# Regras Técnicas Obrigatórias

## Nina Orchestrator — Não Alterar

### 1. `processing_locked` (conversations)
A coluna `public.conversations.processing_locked` é **obrigatória**. Garante processamento sequencial de mensagens, evitando concorrência e quebra de ordem cronológica. **NUNCA remover ou sobrescrever.**

### 2. System Prompt — Isolamento de Contexto
O `system_prompt` da `nina-orchestrator` contém regra de isolamento de contexto que impede alucinações de conversas passadas afetarem novos contatos. **Preservar sempre.**

### 3. Índices de Performance
Índices nas tabelas `public.messages` e `public.nina_processing_queue` foram adicionados para reduzir latência. **Não remover.**

### 4. Processamento Sequencial (batch 1)
A fila de processamento opera em modo sequencial (batch size = 1) com monitoramento anti-travamento. **Manter este comportamento.**

### 5. Ordem de Mensagens (chunk_group_id + chunk_index)
O `send_queue` usa `chunk_group_id` e `chunk_index` para garantir entrega ordenada. Chunk N só processa após chunk N-1 ser `completed`. **Não alterar esta lógica.**
