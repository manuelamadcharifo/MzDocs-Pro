// api/_lib/pricingRegistry.js
// ──────────────────────────────────────────────────────────────────────────
// P20 (Master Hardening & Release Gate v2, Set/2026) —
// "cost" NÃO PODE SER CONTROLADO PELO CLIENTE.
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual):
// api/_services/account.js (handleDeductCredit) tinha:
//
//   const rawCost = parseInt(body?.cost);
//   const cost    = VALID_COSTS.includes(rawCost) ? rawCost : 1;
//
// `VALID_COSTS` é só um intervalo (1 a 10) — NÃO liga o custo ao
// `documentType` real do pedido. Um cliente malicioso (fora da interface
// normal — ex.: curl/Postman directo ao endpoint) podia enviar
// `documentType: "procuracao"` (custo real: 3 créditos) com `cost: 1` e
// pagar apenas 1 crédito por um documento que devia custar 3. O mesmo valia
// para a compra de templates pagos do marketplace (`documentType:
// "template_<key>"`), onde o `cost` também vinha directamente do corpo do
// pedido (ver assets/js/marketplace/TemplatePicker.js, antes desta ronda).
//
// Este ficheiro é a ÚNICA fonte de verdade do preço oficial em créditos de
// cada operação. api/_services/account.js passa a IGNORAR `body.cost` por
// completo no caminho de DÉBITO (a via de REEMBOLSO mantém o comportamento
// anterior — ver nota em handleDeductCredit — não faz parte do âmbito do
// P20, que é especificamente sobre COBRAR de menos, não sobre devolver a
// mais; ver tabela de Definition of Done).
//
// Espelha os valores de assets/js/services/ServiceDefinitions.js (campo
// `cost` de cada serviço). Os dois ficheiros são mantidos manualmente em
// sincronia — o frontend só APRESENTA o preço (ver P1.2 nesta mesma ronda);
// quem cobra a sério é sempre este registo, do lado do servidor.
// ──────────────────────────────────────────────────────────────────────────

'use strict';

// Custo oficial em créditos por `documentType` — espelha
// assets/js/services/ServiceDefinitions.js (campo `cost` de cada serviço).
const SERVICE_COSTS = Object.freeze({
  cv:            2,
  trabalho:      1, // + custo progressivo por tamanho — ver EXTRA_PAGE_COST
  transcricao:   1,
  carta:         2,
  arrendamento:  2,
  requerimento:  2,
  recibo:        1,
  procuracao:    3,
  orcamento:     1,
  residencia:    1,
  prestacao:     3,
  recomendacao:  2,
  planonegocio:  2, // + custo progressivo por tamanho — ver EXTRA_PAGE_COST
  licenca:       1,
  acta:          3,
  impressao:     1,
  foto:          1,
  conversao:     1,
});

// Custo por omissão para qualquer `documentType` desconhecido/ausente —
// mesmo valor que já era o comportamento anterior (`cost` inválido caía
// sempre em 1), preservado para não regredir chamadas antigas/legadas.
const DEFAULT_COST = 1;

// Custo fixo de cada "crédito extra" cobrado durante a geração em cadeia
// (P1.2/LongDocumentEngine.js — a cada ~6000 caracteres gerados além do
// que o crédito inicial cobre). Nunca controlado pelo cliente: mesmo que o
// corpo do pedido envie outro valor em `cost`, este é o único usado quando
// `chargeType === 'extra_page'`.
const EXTRA_PAGE_COST = 1;

// Serviços que suportam o modelo de custo progressivo por tamanho — só
// estes podem legitimamente enviar `chargeType: 'extra_page'`. Qualquer
// outro `documentType` com esse chargeType é rejeitado (ver
// resolveOfficialCost abaixo) — impede usar 'extra_page' como forma de
// pagar sempre 1 crédito por um serviço cujo preço de catálogo é maior.
const LONG_DOC_SERVICES = Object.freeze(new Set(['trabalho', 'planonegocio']));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMPLATE_PREFIX = 'template_';

function isTemplateDocumentType(documentType) {
  return typeof documentType === 'string' && documentType.startsWith(TEMPLATE_PREFIX);
}

function extractTemplateId(documentType) {
  if (!isTemplateDocumentType(documentType)) return null;
  const id = documentType.slice(TEMPLATE_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

/**
 * Determina o custo OFICIAL (em créditos) de uma operação de dedução.
 * Nunca confia em `cost` vindo do cliente.
 *
 * @param {Object}   params
 * @param {string|null} params.documentType
 * @param {'initial'|'extra_page'} params.chargeType
 * @param {Function} params.selectOne  — mesma função de api/_lib/supabaseAdmin.js
 *                                       (injectada para permitir mock em testes)
 * @returns {Promise<number|null>} custo em créditos, ou `null` se o pedido
 *          for inválido (o chamador deve responder 400 nesse caso).
 */
async function resolveOfficialCost({ documentType, chargeType, selectOne }) {
  // ── Cobrança incremental (custo progressivo por tamanho) ────────────────
  if (chargeType === 'extra_page') {
    return LONG_DOC_SERVICES.has(documentType) ? EXTRA_PAGE_COST : null;
  }

  // ── Compra de template pago do marketplace ──────────────────────────────
  // Preço real vem de templates_custom.credit_cost (server-side, nunca do
  // cliente) — ver migration_v39_template_credits_only.sql. `documentType`
  // tem de trazer o UUID real do template (ver TemplatePicker.js, alterado
  // nesta ronda para deixar de enviar apenas a `service_key`).
  if (isTemplateDocumentType(documentType)) {
    const templateId = extractTemplateId(documentType);
    if (!templateId) {
      // Formato inesperado (chamada antiga do cliente, antes deste deploy,
      // que ainda envia só a service_key) — cai no custo por omissão em vez
      // de rejeitar, para não partir compras em curso durante o deploy;
      // NUNCA maior do que 1 crédito de risco, e sempre menor ou igual ao
      // preço real (nunca cobra a mais do que o combinado).
      return DEFAULT_COST;
    }
    try {
      const tpl = await selectOne('templates_custom', 'id', templateId, 'credit_cost');
      if (tpl && typeof tpl.credit_cost === 'number' && tpl.credit_cost > 0) {
        return tpl.credit_cost;
      }
    } catch (e) {
      console.warn('[pricingRegistry] Falha ao ler credit_cost do template:', e.message);
    }
    return DEFAULT_COST;
  }

  // ── Catálogo normal de serviços ──────────────────────────────────────────
  if (documentType && Object.prototype.hasOwnProperty.call(SERVICE_COSTS, documentType)) {
    return SERVICE_COSTS[documentType];
  }

  return DEFAULT_COST;
}

module.exports = {
  SERVICE_COSTS,
  DEFAULT_COST,
  EXTRA_PAGE_COST,
  LONG_DOC_SERVICES,
  isTemplateDocumentType,
  extractTemplateId,
  resolveOfficialCost,
};
