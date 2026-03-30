

# Seção de Estoque — Consulta e Atualização pela IA

## Viabilidade

Totalmente viável. O sistema já possui:
- **Tool calling** no `nina-orchestrator` (ex: `update_deal_stage`, `create_appointment`)
- **Tabela `official_materials`** com `produto_relacionado` e `linha_negocio`
- Infraestrutura de RAG e embeddings

Basta criar uma tabela de estoque, uma UI de gestão, e duas tools para a IA consultar e atualizar quantidades.

---

## 1. Banco de Dados — Migration

**Tabela `inventory`:**

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| product_name | text | Nome do produto |
| sku | text (unique) | Código do produto |
| category | text | Linha de negócio (humano, veterinario, etc.) |
| quantity | integer | Quantidade em estoque |
| min_quantity | integer | Estoque mínimo (alerta) |
| unit | text | Unidade (un, cx, kg, ml) |
| price | numeric | Preço unitário |
| description | text | Descrição do produto |
| is_active | boolean | Ativo/inativo |
| updated_by | uuid | Último usuário que atualizou |
| created_at / updated_at | timestamp | |

**Tabela `inventory_movements`:** (histórico)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| inventory_id | uuid FK | Produto |
| type | text | `in` (entrada), `out` (saída), `adjustment` |
| quantity | integer | Quantidade movimentada |
| reason | text | Motivo (venda, reposição, ajuste) |
| contact_id | uuid | Contato associado (se venda) |
| conversation_id | uuid | Conversa associada |
| created_by | text | `nina` / `manual` / user_id |
| created_at | timestamp | |

RLS: acesso total para `authenticated` (single-tenant).

## 2. Edge Function — Tools da IA

Adicionar ao `nina-orchestrator` duas tools:

**`check_inventory`**: Consulta estoque por nome/SKU/categoria. Retorna lista com nome, quantidade disponível, preço e status. A IA usa para informar o cliente sobre disponibilidade.

**`reserve_inventory`**: Registra saída de estoque quando cliente confirma pedido. Cria registro em `inventory_movements` e decrementa `quantity`. Inclui validação de estoque suficiente.

Contexto no prompt: injetar lista de produtos com estoque baixo e categorias disponíveis.

## 3. UI — Página `/inventory`

- **Dashboard de estoque**: cards com totais, alertas de estoque baixo
- **Tabela de produtos**: nome, SKU, categoria, quantidade, preço, status
- **CRUD**: adicionar/editar/remover produtos
- **Histórico de movimentações**: por produto, com filtros por tipo e período
- **Indicadores**: produtos abaixo do mínimo, movimentações recentes

## 4. Integração

- **Sidebar**: novo item "Estoque" com ícone `Package`
- **App.tsx**: rota `/inventory`
- **nina-orchestrator**: tools + contexto de estoque no prompt

## Arquivos a criar/editar

| Arquivo | Ação |
|---|---|
| `supabase/migrations/xxx.sql` | Tabelas inventory + inventory_movements + RLS |
| `src/pages/Inventory.tsx` | Página de gestão de estoque |
| `src/hooks/useInventory.ts` | Hook CRUD + movimentações |
| `supabase/functions/nina-orchestrator/index.ts` | Tools check_inventory + reserve_inventory |
| `src/components/Sidebar.tsx` | Novo menu "Estoque" |
| `src/App.tsx` | Rota /inventory |

