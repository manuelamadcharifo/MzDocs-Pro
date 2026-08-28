// api/account.js — Router fino (consolidação de Serverless Functions, Ago/2026)
// ──────────────────────────────────────────────────────────────────────────
// MOTIVO: o plano Vercel Hobby tem um tecto de 12 Serverless Functions, e o
// projecto estava exactamente em 12/12 — sem margem para adicionar qualquer
// função nova (ex.: webhook do PaySuite/ClicPay, dispatch de SMS M-Pesa —
// ver secção 12 do README). Este ficheiro substitui 4 functions antigas
// (api/verify-credits.js, api/deduct-credit.js, api/delete-temp-account.js,
// api/cleanup-temp-accounts.js) por 1 só, seguindo o mesmo padrão "router
// fino + lógica em api/_services/" já usado em api/misc.js e
// api/admin/index.js. As rotas públicas não mudaram — só o ficheiro que as
// implementa (ver rewrites novos em vercel.json).
// ──────────────────────────────────────────────────────────────────────────

const {
  handleVerifyCredits,
  handleDeductCredit,
  handleDeleteTempAccount,
  handleCleanupTempAccounts,
  handleMyPackages,
} = require('./_services/account');

module.exports = async function handler(req, res) {
  const op = (req.query && req.query._op) || '';

  if (op === 'verify-credits')        return handleVerifyCredits(req, res);
  if (op === 'deduct-credit')         return handleDeductCredit(req, res);
  if (op === 'delete-temp-account')   return handleDeleteTempAccount(req, res);
  if (op === 'cleanup-temp-accounts') return handleCleanupTempAccounts(req, res);
  // NOVO (v65): pacotes exclusivos por categoria de parceiro/afiliado —
  // GET /api/account?_op=my-packages (não precisa de rewrite próprio em
  // vercel.json, chamado directamente com a query string pelo frontend).
  if (op === 'my-packages')           return handleMyPackages(req, res);

  return res.status(404).json({ error: `Rota desconhecida: "${op}".` });
};
