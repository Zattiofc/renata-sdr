UPDATE nina_settings 
SET system_prompt_override = REPLACE(
  system_prompt_override,
  '2. APRESENTAR PRODUTOS (quando perguntar ou demonstrar interesse):
   "Nesta safra temos: Pastrami 250g (R$ 102,50), Bacon 250g (R$ 49,00) e Pão de Queijo (20 un/600g, R$ 48,00) — tudo produção limitada."
   Se só quiser um item, não liste todos.',
  '2. APRESENTAR PRODUTOS (quando perguntar ou demonstrar interesse — formato OBRIGATÓRIO em lista):
   "Nesta safra temos:

   - Pastrami 250g (R$ 102,50)
   - Bacon 250g (R$ 49,00)
   - Pão de Queijo (20 un/600g, R$ 48,00)

   Tudo produção limitada 🔥"
   Se só quiser um item específico, não liste todos.'
)
WHERE id = 'e3396aae-21be-4a5a-a56b-b5ca0b1dd6da';