# Observabilidade estruturada (P2-04)

`api/_lib/observability.js` centraliza a emissão de eventos estruturados
para responder rapidamente a perguntas operacionais sem grep manual nos
logs do Vercel — ex.: *"quantos pagamentos foram auto-aprovados hoje?"*,
*"qual a taxa de fallback do OCR esta semana?"*, *"quantos refunds
falharam este mês?"*.

## Como funciona

```js
const { logEvent } = require('../_lib/observability');
logEvent('payment', 'auto_approved', { transactionId, userId, credits });
```

Cada chamada:
1. Emite sempre uma linha JSON em `stdout` — capturada automaticamente
   pelos Logs do Vercel, e por qualquer log drain externo que venha a ser
   ligado (Axiom, Datadog, Better Stack...) sem mudar nenhuma linha de
   código, só a configuração do projecto Vercel.
2. Tenta gravar (best-effort, nunca bloqueia, nunca lança excepção) em
   `metrics_events` (`migration_v59_observability.sql`), para permitir
   dashboards SQL simples directamente no Supabase.

## Taxonomia de eventos

| Categoria  | Evento                | Quando é emitido |
|------------|------------------------|-------------------|
| `payment`  | `pending`              | Transacção criada em `process-payment.js` |
| `payment`  | `auto_approved`        | IA aprovou automaticamente o comprovativo |
| `payment`  | `credited`             | Créditos efectivamente atribuídos ao utilizador |
| `payment`  | `credit_failed`        | RPC de confirmação/crédito falhou |
| `payment`  | `review_needed`        | Comprovativo enviado para revisão manual |
| `payment`  | `duplicate_receipt`    | Hash do comprovativo já usado antes |
| `ocr`      | `started`              | Início de um pedido de `ocr-analyze` |
| `ocr`      | `success`              | Transcrição concluída com sucesso (inclui `path`: `per_page`/`combined`/`openrouter_fallback`) |
| `ocr`      | `failed`               | Todos os providers de IA falharam |
| `ocr`      | `fallback_model`       | Teve de recorrer ao provider de reserva (OpenRouter) |
| `document` | `generation_success`   | Documento gerado com sucesso |
| `document` | `generation_failed`    | Falha a gerar documento |
| `document` | `refund_success`       | Reembolso de crédito após falha, com sucesso |
| `document` | `refund_failed`        | Reembolso de crédito falhou — **requer atenção manual** |
| `ai`       | `request` / `*_success` / `*_failed` | Chamadas a providers de IA (via `withTiming`) |
| `ledger`   | `consumed` / `expired` | Movimentos do `credit_ledger` |

## Dashboards prontos (SQL views)

`migration_v59_observability.sql` cria três views para consulta directa no
Supabase SQL editor ou em qualquer ferramenta de BI ligada por Postgres:

```sql
SELECT * FROM v_payment_funnel_daily LIMIT 30;
SELECT * FROM v_ocr_health_daily LIMIT 30;
SELECT * FROM v_document_generation_daily LIMIT 30;
```

## Alertas recomendados (ainda não automatizados — P2 futuro)

A auditoria original pedia especificamente:
- **Alerta para pagamentos confirmados sem crédito** — hoje isto é
  estruturalmente muito mais difícil de acontecer graças à RPC atómica
  (`confirm_payment_and_credit`, migration_v57), mas um alerta continua a
  fazer sentido como rede de segurança: `SELECT * FROM
  v_payment_funnel_daily WHERE auto_approved > credited`.
- **Alerta para refunds falhados** — `SELECT * FROM metrics_events WHERE
  category='document' AND event='refund_failed' AND created_at >
  now() - interval '1 hour'`. Ligar isto a uma function/cron que notifica
  por Telegram (reaproveitando `api/_lib/notifyTelegram.js`, já usado para
  `review_needed`) é o próximo passo natural — fora do âmbito desta
  primeira entrega de observabilidade.

## Limpeza

`cleanup_old_metrics_events()` apaga registos com mais de 90 dias — chamar
a partir do mesmo cron diário que já existe para outras tarefas de limpeza
(`cleanup-temp-accounts.js` ou equivalente), evitando crescimento
descontrolado da tabela.
