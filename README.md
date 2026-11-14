# Fly Trap — loja com checkout Pix PaySi

Landing page da Fly Trap com checkout Pix direto. O navegador envia os dados do pedido para funções serverless em `api/`; somente o servidor se comunica com a PaySi.

## Segurança

- A chave PaySi nunca fica no HTML ou JavaScript público.
- O preço vem das ofertas publicadas na PaySi, não do navegador.
- Cada tentativa usa uma chave de idempotência para evitar cobrança duplicada.
- O backend valida kit, CPF, contato e endereço antes de criar o pagamento.

## Catálogo PaySi

| Kit | Valor | Slug da oferta |
| --- | ---: | --- |
| Essencial — 1 unidade | R$ 59,90 | `fly-trap-fedbaaa9` |
| Família — 3 unidades | R$ 129,90 | `fly-trap-e079fc96` |
| Pro — 5 unidades | R$ 189,90 | `fly-trap-9652aa56` |

As ofertas usam Pix, garantia de 7 dias e liquidação D32. Os valores precisam permanecer iguais aos exibidos em `index.html`.

## Publicação na Vercel

1. Importe este repositório na Vercel.
2. Em **Settings → Environment Variables**, crie `PAYSI_API_KEY` com a chave restrita a `payments_read` e `payments_write`.
3. Faça o deploy.
4. Teste uma compra real de baixo risco e confirme o status no painel PaySi.

Use `.env.example` apenas como referência. Nunca faça commit do arquivo `.env` nem da chave real.

## Arquivos principais

- `index.html`, `styles.css` e `script.js` — loja e checkout no navegador.
- `api/create-payment.js` — cria a cobrança Pix na PaySi.
- `api/payment-status.js` — consulta o pagamento enquanto o checkout está aberto.
- `api/_paysi.js` — configuração server-side e mapeamento seguro dos kits.
- `termos.html` e `privacidade.html` — textos básicos que devem receber os dados comerciais da loja antes das vendas.
