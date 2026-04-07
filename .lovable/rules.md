# Regras Técnicas Obrigatórias

## Esquema de Banco — Preservação Obrigatória

### 1. `processing_locked` (conversations)
A coluna `public.conversations.processing_locked` (BOOLEAN DEFAULT false) é **obrigatória**. Garante processamento sequencial de mensagens, evitando concorrência e quebra de ordem cronológica. **NUNCA remover, renomear ou sobrescrever.**

### 2. Índice vetorial `idx_knowledge_chunks_embedding`
O índice em `public.knowledge_chunks.embedding` é essencial para a performance da busca RAG. **Não remover.**

### 3. Função `public.auto_unlock_stuck_conversations`
Função de segurança que auto-destrava conversas travadas há mais de 2 minutos. **Não remover.** É a rede de segurança contra falhas do orchestrator.

## Nina Orchestrator — Não Alterar
### 4. Lógica de Lock/Unlock no Orchestrator
A `nina-orchestrator` usa `lockConversation` e `unlockConversation` para travar a conversa durante processamento. **Preservar esta lógica em todos os deploys.**

### 5. System Prompt — Isolamento de Contexto
O `system_prompt` da `nina-orchestrator` contém regra de isolamento de contexto que impede alucinações de conversas passadas afetarem novos contatos. **Preservar sempre.**

### 3. Índices de Performance
Índices nas tabelas `public.messages` e `public.nina_processing_queue` foram adicionados para reduzir latência. **Não remover.**

### 4. Processamento Sequencial (batch 1)
A fila de processamento opera em modo sequencial (batch size = 1) com monitoramento anti-travamento. **Manter este comportamento.**

### 5. Ordem de Mensagens (chunk_group_id + chunk_index)
O `send_queue` usa `chunk_group_id` e `chunk_index` para garantir entrega ordenada. Chunk N só processa após chunk N-1 ser `completed`. **Não alterar esta lógica.**
