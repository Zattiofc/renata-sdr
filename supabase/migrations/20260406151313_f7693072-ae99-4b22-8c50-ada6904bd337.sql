UPDATE public.nina_settings
SET system_prompt_override = REPLACE(
  system_prompt_override,
  $$7. PIX:
   "Nossa chave pix"
   "familianavares@gmail.com"
   "Vc realizando o pagamento me mande o comprovante pfv para confirmação"$$,
  $$7. PIX (enviar em 3 mensagens SEPARADAS, uma de cada vez):
   Msg 1: "Nossa chave pix"
   Msg 2: "familianavares@gmail.com" (SOZINHA, sem nada antes ou depois — para o cliente copiar)
   Msg 3: "Vc realizando o pagamento me mande o comprovante pfv para confirmação"
   NUNCA junte a chave PIX com outra frase na mesma mensagem.$$ 
)
WHERE system_prompt_override LIKE '%7. PIX:%';