// api/misc.js — v4.0 (Router fino — P1-07, Ago/2026)
// ──────────────────────────────────────────────────────────────────────────
// REFACTOR (P1-07, auditoria Ago/2026): este ficheiro tinha ~3.234 linhas e
// concentrava OCR, pagamentos, blog, afiliados, templates, analytics e
// configuração num único módulo — o maior problema arquitectural apontado
// na auditoria ("monólito de funções"). A razão histórica era genuína:
// poupar Serverless Functions no plano Vercel Hobby (limite de 12, ver
// vercel.json).
//
// A solução aplicada NÃO cria novas functions — continua a existir apenas
// esta rota Vercel (/api/misc). O que mudou é que cada domínio de negócio
// agora vive no seu próprio ficheiro em api/_services/, e este ficheiro
// passa a ser exclusivamente:
//   1. o mapeamento URL/action → handler (routing table);
//   2. nada de lógica de negócio.
//
// Isto reduz, por domínio: complexidade, risco de regressão ao editar uma
// área não relacionada, blast radius de um bug, e dificuldade de escrever
// testes focados (cada api/_services/*.js pode ser testado isoladamente).
//
// Mapeamento (nenhuma rota mudou — só o ficheiro que a implementa):
//   api/_services/payments.js    → verify-receipt
//   api/_services/ocr.js         → ocr-analyze
//   api/_services/legal.js       → legal-search
//   api/_services/blog.js        → sitemap.xml, blog-list, blog-cron,
//                                   github-diagnostic
//   api/_services/site.js        → page-view, marketing, config,
//                                   public-reviews, push-subscribe/
//                                   unsubscribe, document-usage
//   api/_services/templates.js   → namespace _ns=templates (marketplace)
//   api/_services/affiliates.js  → namespace _ns=affiliate (afiliados)
//
// verifyReceiptInternal() continua exportado a partir DESTE ficheiro (não
// só de api/_services/payments.js) para não obrigar a mudar o import em
// api/process-payment.js — compatibilidade total, zero mudança de contrato.
// ──────────────────────────────────────────────────────────────────────────

const { handleVerifyReceipt, verifyReceiptInternal } = require('./_services/payments');
const { handleOcrAnalyze }                            = require('./_services/ocr');
const { handleLegalSearch }                           = require('./_services/legal');
const {
  handleSitemap,
  handleBlogList,
  handleBlogCron,
  handleGithubDiagnostic,
}                                                      = require('./_services/blog');
const {
  handlePageView,
  handleMarketing,
  handleConfig,
  handlePublicReviews,
  handlePushSubscribe,
  handlePushUnsubscribe,
  handleDocumentUsage,
}                                                      = require('./_services/site');
const { handleTemplates }                             = require('./_services/templates');
const { handleAffiliate }                             = require('./_services/affiliates');

// ── Main router ─────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const urlPath     = (req.url || '').split('?')[0];
  const pathParts   = urlPath.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const q           = req.query || {};

  if (q._ns === 'affiliate') return handleAffiliate(q._a || lastSegment || '', req, res);
  if (q._ns === 'templates') return handleTemplates(q._a || 'list', req, res);
  if (q._ns === 'marketing') return handleMarketing(q._a || 'track', req, res);

  const isAffiliate = pathParts.includes('affiliate');
  if (isAffiliate) return handleAffiliate(lastSegment === 'affiliate' ? (q.action || '') : lastSegment, req, res);

  const isTemplates = pathParts.includes('templates');
  if (isTemplates) return handleTemplates(lastSegment === 'templates' ? (q.action || 'list') : lastSegment, req, res);

  const action = (lastSegment && lastSegment !== 'misc') ? lastSegment : (q.action || '');

  if (action === 'page-view')                           return handlePageView(req, res);
  if (action === 'sitemap.xml' || action === 'sitemap') return handleSitemap(req, res);
  if (action === 'ocr-analyze')                         return handleOcrAnalyze(req, res);
  if (action === 'legal-search')                        return handleLegalSearch(req, res);
  if (action === 'config' || action === 'misc')         return handleConfig(req, res);
  if (action === 'public-reviews')                       return handlePublicReviews(req, res);
  if (action === 'verify-receipt')                      return handleVerifyReceipt(req, res);
  if (action === 'blog-cron')                           return handleBlogCron(req, res);
  if (action === 'blog-list')                           return handleBlogList(req, res);
  if (action === 'github-diagnostic')                   return handleGithubDiagnostic(req, res);
  if (action === 'push-subscribe')                       return handlePushSubscribe(req, res);
  if (action === 'push-unsubscribe')                     return handlePushUnsubscribe(req, res);
  // v40: dobrado aqui (em vez de um ficheiro api/*.js novo) para não
  // ultrapassar o limite de 12 Serverless Functions do plano Vercel Hobby
  // — ver vercel.json, que já tinha exactamente 12 ficheiros declarados.
  if (action === 'document-usage')                       return handleDocumentUsage(req, res);

  return res.status(404).json({ error: `Rota desconhecida: "${action}".` });
};

// Exportar para uso directo em process-payment.js (sem HTTP round-trip) —
// mesma assinatura e contrato de sempre, apenas re-exportada a partir do
// módulo onde a lógica agora vive.
module.exports.verifyReceiptInternal = verifyReceiptInternal;
