UPDATE nina_settings 
SET system_prompt_override = REPLACE(
  system_prompt_override,
  '7. PIX: "Nossa chave pix" + "familianavares@gmail.com" + "Vc realizando o pagamento me mande o comprovante pfv para confirmação"',
  E'7. PIX (enviar em 3 mensagens SEPARADAS, uma de cada vez):\n   Msg 1: "Nossa chave pix"\n   Msg 2: "familianavares@gmail.com" (SOZINHA, sem nada antes ou depois — para o cliente copiar)\n   Msg 3: "Vc realizando o pagamento me mande o comprovante pfv para confirmação"'
)
WHERE id = 'e3396aae-21be-4a5a-a56b-b5ca0b1dd6da';