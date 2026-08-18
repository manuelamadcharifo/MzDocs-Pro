// api/misc.js — v3.0 (Verificação automática de comprovativos)
// ALTERAÇÕES v3.0:
//  1. NOVA rota POST /api/verify-receipt — valida comprovativos M-Pesa/e-Mola/mKesh
//     via IA visão (Gemini/OpenRouter), aprovação automática se confidence >= 0.85,
//     fallback para revisão manual admin se confidence < 0.85.
//  2. Helper verifyReceiptInternal() exportado para uso em process-payment.js.
//  3. Rate limit de 3 uploads/IP/min para verify-receipt (anti-fraude).
//  4. Hash SHA-256 do comprovativo para evitar reutilização (anti-fraude).
//  5. Usa api/_lib/visionAI.js em vez de chamadas directas à API Gemini.
//
// Alterações v2.0 mantidas integralmente.

const crypto  = require('crypto');
const QRCode  = require('qrcode');
const { analyzeImage, parseJSON: parseVisionJSON } = require('./_lib/visionAI');
const { buscarArtigosRelevantes } = require('./_lib/legalSearch');
const { notifyPaymentNeedsReview } = require('./_lib/notifyTelegram'); // NOVO — alerta Telegram para revisão manual

const {
  restRequest,
  rpc,
  getUserFromToken,
  selectOne,
  insert,
  update,
  del,
  countRows,
  adminCreateUser,
  adminGetUserById,
  storageCreateSignedUrl,
  SUPABASE_URL,
  SERVICE_KEY,
} = require('./_lib/supabaseAdmin');

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');
const ORIGIN   = SITE_URL;

// NOTA (migração): as funções de Afiliados e Templates usavam um cliente
// SDK à parte (@supabase/supabase-js + 'ws' explícito) só para estas duas
// secções, porque o SDK falha em runtimes Node < 22 sem WebSocket nativo
// ("Node.js 20 detected without native WebSocket support"). Foram migradas
// para o wrapper REST puro api/_lib/supabaseAdmin.js — o mesmo padrão já
// usado no resto do projecto — eliminando por completo a dependência do
// SDK e do pacote 'ws' nesta secção.

// ATENÇÃO: ao adicionar novas páginas estáticas em /pages/, acrescentar aqui também.
// Páginas geradas pelo admin (blog_pages) são lidas automaticamente da BD — não precisam
// de estar nesta lista.
const STATIC_PAGES = [
  { loc: '/',                                                                    priority: '1.0', changefreq: 'weekly'  },
  { loc: '/pages/',                                                              priority: '0.7', changefreq: 'weekly'  },
  // Páginas SEO estáticas — ficheiros físicos em /pages/
  { loc: '/pages/como-fazer-cv-mocambique.html',                                 priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/cv-licenciado-mocambique.html',                                 priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/cv-sem-experiencia-mocambique.html',                            priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/como-fazer-um-cv-de-um-licenciado-em-mocambique/',              priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/carta-candidatura-emprego-mocambique.html',                     priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-formal-mocambique.html',                                  priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-recomendacao-mocambique.html',                            priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/contrato-arrendamento-mocambique.html',                         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-residencia-mocambique.html',                         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-rendimentos-mocambique.html',                        priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/plano-negocios-mocambique.html',                                priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/procuracao-mocambique.html',                                    priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/recibo-pagamento-mocambique.html',                              priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/requerimento-emprego-mocambique.html',                          priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/trabalho-escolar-mocambique.html',                              priority: '0.8', changefreq: 'monthly' },
  // Outras páginas públicas
  { loc: '/parceiros.html',                                                      priority: '0.6', changefreq: 'monthly' },
  { loc: '/templates.html',                                                      priority: '0.6', changefreq: 'weekly'  },
  { loc: '/legal.html',                                                          priority: '0.3', changefreq: 'monthly' },
];

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

// ── Main router ───────────────────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════════════
// VERIFY-RECEIPT — validação automática de comprovativos por IA
// POST /api/verify-receipt
// ════════════════════════════════════════════════════════════════════════════

// CORRIGIDO (auditoria, ponto 5): usava um Map em memória do processo —
// não confiável em ambiente serverless, onde cada invocação pode rodar
// numa instância diferente (um atacante pode contornar o limite acertando
// instâncias distintas). Agora usa o mesmo mecanismo com persistência via
// Redis já testado em generate-document.js (ver api/_lib/rateLimit.js),
// com fallback gracioso para Map local apenas se Redis não estiver
// configurado.
const { checkRateLimit } = require('./_lib/rateLimit');

async function checkReceiptRateLimit(ip) {
  // max 3 uploads por IP por minuto
  return checkRateLimit('receipt', ip, { limit: 3, windowSec: 60 });
}

// Preços/créditos dos pacotes: única fonte de verdade em _lib/packages.js
// (ver esse ficheiro para o porquê — corrige duplicação em 5 locais e o
// bug de a verificação automática de comprovativos nunca reflectir
// alterações de preço feitas no painel de admin).
const { loadPackagesFromSettings, estimateMznPerCredit } = require('./_lib/packages');

const RECEIPT_PROMPT = (wallet) =>
  `És um verificador de comprovativos de transferência bancária moçambicana (M-Pesa, e-Mola, mKesh). ` +
  `Analisa esta imagem com MUITO RIGOR. ` +
  `PRIMEIRO verifica: esta imagem É um comprovativo/recibo de transferência de dinheiro? ` +
  `Se NÃO for (ex: selfie, paisagem, documento qualquer, screenshot aleatório, imagem escura, imagem ilegível, etc.), ` +
  `devolve imediatamente: {"valid":false,"amount":0,"reference":"","recipient_phone":"","status":"NAO_COMPROVATIVO","transaction_date":"","confidence":0.0,"rejection_reason":"Imagem não é um comprovativo de transferência"}. ` +
  `Se FOR um comprovativo ${wallet}, extrai os dados e responde APENAS em JSON válido (sem markdown, sem texto extra): ` +
  `{"valid":boolean,"amount":number,"reference":"string","recipient_phone":"string","status":"string","transaction_date":"string","confidence":0.0,"rejection_reason":""}. ` +
  `"status" deve ser EXACTAMENTE um de: SUCESSO, CONFIRMADO, PENDENTE, FALHA. ` +
  `"confidence" é a tua certeza de 0.0 a 1.0 de que extraíste os dados correctamente — se a imagem estiver desfocada ou ilegível, usa 0.0. ` +
  `"amount" é o valor em MZN como número. "reference" é o código de transacção. ` +
  `"rejection_reason" é vazio se válido, ou o motivo de rejeição se inválido.`;

// ── Criação automática de conta avulso (NOVO v3.1) ──────────────────────────
// Gera password temporária no mesmo formato usado pelo admin em
// handleConfirmAvulso (api/admin/index.js), para manter consistência.
function _genTempPassword() {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '0123456789';
  let pass = '';
  for (let i = 0; i < 4; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) pass += digits[Math.floor(Math.random() * digits.length)];
  return pass;
}

/**
 * Cria automaticamente uma conta temporária "avulso" e liga-a à transacção,
 * sem qualquer intervenção do administrador. Espelha a lógica de
 * handleConfirmAvulso (api/admin/index.js), mas usando REST pura
 * (adminCreateUser) em vez do SDK, e é chamada a partir do fluxo de
 * aprovação automática por IA em verifyReceiptInternal.
 *
 * @returns {Promise<{tempEmail:string, tempPass:string, tempUserId:string}>}
 */
async function _createAvulsoAccount({ reference, phone, credits, transactionId }) {
  const ref       = reference || ('AV' + Date.now());
  const tempEmail = `temp_${ref.toLowerCase()}@mzdocs.temp`;
  const tempPass  = _genTempPassword();

  const newUser = await adminCreateUser({
    email:    tempEmail,
    password: tempPass,
    userMetadata: { full_name: `Avulso ${ref}`, is_temp: true, temp_ref: ref, phone: phone || '' },
  });
  const tempUserId = newUser.id;

  await update('profiles', 'id', tempUserId, {
    is_temp:       true,
    temp_ref:      ref,
    // CORRIGIDO (auditoria segurança Julho 2026): já não se grava a password
    // em texto limpo em profiles.temp_password — era um risco real (qualquer
    // fuga da base de dados, ou de um admin comprometido, expunha passwords
    // de utilizadores em claro, ao contrário das passwords normais, que o
    // Supabase Auth já guarda em hash). A password ainda é devolvida UMA VEZ
    // na resposta desta chamada (accountInfo.tempPass, mais abaixo) para
    // mostrar ao cliente imediatamente — só deixa de ficar guardada para sempre.
    // Para gerar uma nova mais tarde (ex: cliente perdeu o acesso), o admin
    // usa a acção 'regenerate-temp-password' em api/admin/index.js.
    credits,
    plan:          'free',
    account_type:  'avulso',
    full_name:     `Avulso ${ref}`,
    phone:         phone || null,
    updated_at:    new Date().toISOString(),
  });

  // Ligar a transacção à nova conta (estava com user_id NULL, pois o
  // pagamento avulso é iniciado sem sessão/registo prévio).
  if (transactionId) {
    await restRequest(`transactions?id=eq.${transactionId}`, {
      method: 'PATCH',
      body:   { user_id: tempUserId },
      prefer: 'return=minimal',
    }).catch(e => console.warn('[verify-receipt] falha ao ligar user_id à transacção:', e.message));
  }

  return { tempEmail, tempPass, tempUserId };
}

/**
 * verifyReceiptInternal — lógica de verificação reutilizável.
 * Chamado por handleVerifyReceipt e por process-payment.js directamente.
 *
 * @param {object} params
 * @param {string} params.imageBase64
 * @param {string} params.mimeType
 * @param {string} params.reference    — referência da transacção em transactions
 * @param {string} params.phone        — número normalizado (+258...)
 * @param {number} params.amount       — valor esperado em MZN
 * @param {string} params.wallet       — 'M-Pesa' | 'e-Mola' | 'mKesh'
 * @param {string} params.userId       — UUID do utilizador (pode ser null)
 * @param {string} params.transactionId — ID da linha em transactions
 * @param {string} params.packageId    — chave do pacote (avulso/starter/...)
 * @returns {Promise<object>} resultado da verificação
 */
async function verifyReceiptInternal({ imageBase64, mimeType, reference, phone, amount, wallet, userId, transactionId, packageId }) {

  // ── 1. Sanitizar imagem ────────────────────────────────────────────────
  const MAX_B64 = 2 * 1024 * 1024 * 1.37; // ~2MB em base64 (~2.74MB string)
  if (!imageBase64 || imageBase64.length > MAX_B64) {
    return { success: false, error: 'Imagem inválida ou demasiado grande (máx 2MB)' };
  }
  const imgMime = (mimeType || 'image/jpeg');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(imgMime)) {
    return { success: false, error: 'Formato de imagem não suportado. Use JPEG ou PNG.' };
  }

  // ── 2. Hash do comprovativo (anti-fraude: evita reutilização) ──────────
  const receiptHash = crypto.createHash('sha256').update(imageBase64.slice(0, 5000)).digest('hex');

  // Verificar se este hash já foi processado com sucesso
  try {
    const existing = await restRequest(
      `transactions?receipt_hash=eq.${receiptHash}&status=eq.completed&select=reference_id&limit=1`
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return {
        success:      false,
        verified:     false,
        autoApproved: false,
        error:        'Este comprovativo já foi utilizado anteriormente.',
        code:         'DUPLICATE_RECEIPT',
      };
    }
  } catch (_) { /* coluna pode não existir ainda — ignorar */ }

  // ── 3. Chamar IA visão ─────────────────────────────────────────────────
  let aiResult;
  try {
    const rawText = await analyzeImage(imageBase64, RECEIPT_PROMPT(wallet || 'móvel'), {
      mimeType:  imgMime,
      logPrefix: 'verify-receipt',
    });
    aiResult = parseVisionJSON(rawText);
  } catch (aiErr) {
    console.error('[verify-receipt] IA falhou:', aiErr.message);
    // Falha da IA → colocar em revisão manual sem rejeitar automaticamente
    await _markReviewNeeded(transactionId, receiptHash, 0, 'Falha de IA: ' + aiErr.message);
    return {
      success:      true,
      verified:     false,
      autoApproved: false,
      nextStep:     'awaiting_review',
      message:      'Não foi possível validar automaticamente. Receberá confirmação em até 15 min.',
    };
  }

  const confidence      = Number(aiResult.confidence) || 0;
  const aiAmount        = Number(aiResult.amount) || 0;
  const aiStatus        = String(aiResult.status || '').toUpperCase();
  const aiRef           = String(aiResult.reference || '');
  const aiDate          = aiResult.transaction_date || '';
  const rejectionReason = aiResult.rejection_reason || '';

  console.log('[verify-receipt] IA resultado:', { confidence, aiAmount, aiStatus, aiRef, rejectionReason });

  // ── Rejeição explícita: não é comprovativo ─────────────────────────────
  if (aiStatus === 'NAO_COMPROVATIVO' || (rejectionReason && confidence === 0)) {
    return {
      success:      false,
      verified:     false,
      autoApproved: false,
      error:        rejectionReason || 'A imagem enviada não é um comprovativo de transferência. Por favor envie o screenshot do M-Pesa, e-Mola ou mKesh após o pagamento.',
      code:         'NOT_A_RECEIPT',
    };
  }
  // ── 4. Validações de negócio ───────────────────────────────────────────
  // CORRIGIDO: PACKAGES[packageId] hard-coded fazia a verificação automática
  // de comprovativos comparar sempre contra o preço antigo, mesmo depois de
  // o admin alterar o preço em Configurações — ver api/_lib/packages.js.
  const currentPackages = await loadPackagesFromSettings();
  const pkg = currentPackages[packageId];

  // 4a. Verificar se referência já confirmada noutras transacções
  let alreadyConfirmed = false;
  if (aiRef) {
    try {
      const refs = await restRequest(
        `transactions?receipt_ref=eq.${encodeURIComponent(aiRef)}&status=eq.completed&select=id&limit=1`
      );
      alreadyConfirmed = Array.isArray(refs) && refs.length > 0;
    } catch (_) {}
  }

  // 4b. Verificar data (máx 60 min de tolerância — cobre erros de relógio)
  let dateOk = false;
  if (aiDate) {
    try {
      const txTime   = new Date(aiDate).getTime();
      const diffMins = (Date.now() - txTime) / 60000;
      dateOk = diffMins >= 0 && diffMins <= 60;
    } catch (_) {}
  }

  // 4c. Valor corresponde ao pacote esperado (tolerância de 1 MZN)
  const amountOk = pkg ? Math.abs(aiAmount - pkg.price) <= 1 : false;

  // 4d. Status de sucesso
  const statusOk = ['SUCESSO', 'CONFIRMADO', 'APPROVED', 'SUCCESS'].includes(aiStatus);

  const allChecksPass = !alreadyConfirmed && dateOk && amountOk && statusOk;

  // ── 5. Decisão: aprovação automática ou revisão manual ─────────────────
  if (confidence >= 0.85 && allChecksPass) {
    // ── APROVAÇÃO AUTOMÁTICA ───────────────────────────────────────────
    try {
      const credits = pkg ? pkg.credits : 0;

      // 5a. Atualizar transacção → confirmed
      // CORRIGIDO (auditoria, ponto 6): mesma classe de race condition do
      // handleConfirmPayment (admin/index.js) — o PATCH não tinha condição
      // de status, então duas chamadas de verify-receipt quase simultâneas
      // (ex.: o utilizador a clicar 2x no upload) podiam ambas passar pela
      // checagem inicial antes de qualquer uma escrever, duplicando os
      // créditos. Adicionado "&status=eq.pending" ao filtro — PostgREST
      // só aplica o PATCH às linhas que ainda estiverem pending — e usa-se
      // return=representation para detectar se 0 linhas foram afectadas
      // (já confirmada por outra chamada) antes de prosseguir para creditar.
      // CORRIGIDO v3.1: o status gravado aqui era 'confirmed', mas TODO o
      // resto do sistema (handleStats do dashboard, o badge "✅ Confirmado"
      // em AdminTransactions.js, handleConfirmPayment/handleConfirmAvulso)
      // usa 'completed'. Resultado: pagamentos aprovados automaticamente
      // pela IA ficavam com um status que a dashboard não reconhecia, e a
      // "Receita Confirmada (30d)" nunca os contava (mostrava 0 MZN mesmo
      // com pagamentos reais confirmados). Ver migration_v25 para corrigir
      // também as linhas antigas já gravadas como 'confirmed'.
      const updatedTx = await restRequest(
        `transactions?id=eq.${transactionId}&status=eq.pending`,
        {
          method: 'PATCH',
          body: {
            status:              'completed',
            confirmed_at:        new Date().toISOString(),
            receipt_hash:        receiptHash,
            receipt_verified:    true,
            receipt_confidence:  confidence,
            verification_method: 'auto',
            receipt_ref:         aiRef || null,
          },
          prefer: 'return=representation',
        }
      );

      // Se 0 linhas vieram, outra chamada já confirmou esta transação
      // entre a checagem inicial e este PATCH — abortar sem creditar de novo.
      if (!Array.isArray(updatedTx) || updatedTx.length === 0) {
        console.warn('[verify-receipt] Transação já confirmada por outra chamada concorrente:', transactionId);
        return {
          success:      true,
          verified:     true,
          autoApproved: false,
          nextStep:     'already_confirmed',
          message:      'Este pagamento já tinha sido confirmado.',
        };
      }

      // 5b. Adicionar créditos ao utilizador — ou, se for uma compra
      // "avulso" sem sessão (cliente anónimo, o caso mais comum de
      // pagamento avulso), criar a conta temporária automaticamente e
      // devolver as credenciais para login imediato, SEM qualquer acção
      // do administrador (CORRIGIDO v3.1 — antes disto, um pagamento
      // avulso confirmado pela IA ficava "confirmado" na base de dados mas
      // sem crédito nenhum atribuído a ninguém, porque userId era null e a
      // criação da conta só existia no botão manual "🎫 Criar Conta" do
      // admin, em handleConfirmAvulso).
      let accountInfo   = null;
      let creditedUser  = null;
      if (userId && credits > 0) {
        await rpc('add_credits', { user_id: userId, amount: credits });
        creditedUser = userId;

        // 5c. Registar em credit_logs
        await insert('credit_logs', {
          user_id:        userId,
          transaction_id: transactionId,
          action:         'bonus',
          credits:        credits,
          document_type:  null,
          note:           `Pagamento auto-verificado — pacote ${packageId} (confidence: ${confidence.toFixed(2)})`,
        }).catch(e => console.warn('[verify-receipt] credit_logs insert:', e.message));

      } else if (!userId && packageId === 'avulso' && credits > 0) {
        try {
          accountInfo  = await _createAvulsoAccount({ reference, phone, credits, transactionId });
          creditedUser = accountInfo.tempUserId;

          await insert('credit_logs', {
            user_id:        accountInfo.tempUserId,
            transaction_id: transactionId,
            action:         'purchase_confirmed',
            credits:        credits,
            document_type:  null,
            note:           `Conta avulso criada automaticamente após verificação IA (confidence: ${confidence.toFixed(2)})`,
          }).catch(e => console.warn('[verify-receipt] credit_logs insert:', e.message));

          console.log('[verify-receipt] Conta avulso criada automaticamente:', accountInfo.tempEmail, 'para transacção', transactionId);
        } catch (accErr) {
          // Pagamento já está confirmado (status completed) — não reverter.
          // Marcar a transacção para follow-up manual do admin, para não
          // perder o cliente que já pagou mas cuja conta falhou ao criar.
          console.error('[verify-receipt] Falha ao criar conta avulso automática:', accErr.message);
          await restRequest(`transactions?id=eq.${transactionId}`, {
            method: 'PATCH',
            body:   { review_reason: 'FALHA_CRIACAO_CONTA_AVULSO: ' + accErr.message },
            prefer: 'return=minimal',
          }).catch(() => {});
        }
      }

      // 5d. CORRIGIDO (auditoria de pagamentos, v3.2): a comissão de
      // afiliado só era processada em handleConfirmPayment (confirmação
      // MANUAL do admin) — a aprovação automática por IA, que é hoje o
      // caminho principal de qualquer pagamento (avulso ou com conta),
      // nunca chamava process_affiliate_commission. Resultado: qualquer
      // venda auto-aprovada pela IA não gerava comissão nenhuma para o
      // afiliado que a referiu, de forma silenciosa. Chamamos aqui
      // (fire-and-forget, não bloqueia a resposta ao cliente).
      if (creditedUser) {
        rpc('process_affiliate_commission_v2', {
          p_transaction_id: transactionId,
          p_user_id:        creditedUser,
          p_package_id:     packageId,
          p_amount:         amount,
        }).catch(e => console.warn('[verify-receipt] process_affiliate_commission falhou:', e.message));
      }

      // NOVO (Fase 2 — Marketing Analytics): só agora — depois dos créditos
      // terem sido mesmo atribuídos — é que esta venda conta para o
      // dashboard de marketing. Sem visitor_id (ex: venda confirmada pelo
      // admin numa transacção antiga, criada antes desta Fase 2) o evento
      // simplesmente não é gravado; nunca inventamos uma origem.
      if (creditedUser && updatedTx[0]?.visitor_id) {
        insert('marketing_events', {
          visitor_id:    updatedTx[0].visitor_id,
          user_id:       creditedUser,
          event:         'credit_purchase',
          document_type: null,
          value:         amount,
          metadata:      { package_id: packageId, credits, verification_method: 'auto' },
        }).catch(e => console.warn('[verify-receipt] marketing_events insert:', e.message));
      }

      console.log('[verify-receipt] AUTO-APROVADO:', transactionId, 'créditos:', credits);

      return {
        success:      true,
        verified:     true,
        autoApproved: true,
        creditsAdded: credits,
        nextStep:     'completed',
        message:      accountInfo
          ? `Pagamento confirmado! A sua conta foi criada automaticamente com ${credits} créditos.`
          : `Pagamento confirmado! ${credits} créditos adicionados à sua conta.`,
        ...(accountInfo ? {
          tempEmail:  accountInfo.tempEmail,
          tempPass:   accountInfo.tempPass,
          tempUserId: accountInfo.tempUserId,
          autoLogin:  true,
        } : {}),
      };

    } catch (confirmErr) {
      console.error('[verify-receipt] Erro ao confirmar transacção:', confirmErr.message);
      // Falha ao gravar → revisão manual como fallback seguro
      await _markReviewNeeded(transactionId, receiptHash, confidence, 'Erro ao confirmar: ' + confirmErr.message);
      return {
        success:      true,
        verified:     false,
        autoApproved: false,
        nextStep:     'awaiting_review',
        message:      'Pagamento validado mas ocorreu um erro técnico. A equipa irá confirmar em 15 min.',
      };
    }

  } else {
    // ── REVISÃO MANUAL ─────────────────────────────────────────────────
    const reason = !allChecksPass
      ? [
          alreadyConfirmed ? 'referência já usada' : null,
          !dateOk          ? 'data fora do intervalo' : null,
          !amountOk        ? `valor incorreto (esperado ${pkg?.price} MZN, detectado ${aiAmount})` : null,
          !statusOk        ? `status inválido (${aiStatus})` : null,
        ].filter(Boolean).join('; ')
      : `confidence baixa (${confidence.toFixed(2)})`;

    await _markReviewNeeded(transactionId, receiptHash, confidence, reason);

    return {
      success:      true,
      verified:     false,
      autoApproved: false,
      nextStep:     'awaiting_review',
      message:      confidence < 0.4
        ? 'Imagem pouco nítida. Tente uma foto mais clara ou aguarde revisão manual (até 15 min).'
        : 'Comprovativo recebido. A equipa irá verificar em até 15 minutos.',
    };
  }
}

async function _markReviewNeeded(transactionId, receiptHash, confidence, reason) {
  try {
    await restRequest(
      `transactions?id=eq.${transactionId}`,
      {
        method: 'PATCH',
        body: {
          status:              'review_needed',
          receipt_hash:        receiptHash || null,
          receipt_confidence:  confidence || 0,
          verification_method: 'pending',
          review_reason:       reason || null,
        },
        prefer: 'return=minimal',
      }
    );
    console.log('[verify-receipt] marcado review_needed:', transactionId, reason);

    // NOVO (Fase 5 — Notificações administrativas): avisa o admin que há
    // um comprovativo à espera de revisão manual — best-effort, nunca deve
    // impedir o fluxo de verificação em si.
    insert('admin_notifications', {
      type:    'pending_receipt',
      title:   '🧾 Comprovativo à espera de revisão',
      message: `Confiança ${(confidence || 0) < 0.4 ? 'baixa' : 'moderada'} na verificação automática (${reason || 'motivo não especificado'}). Transacção ${transactionId}.`,
      link:    '#transactions',
    }).catch(e => console.warn('[verify-receipt] admin_notifications insert falhou:', e.message));

    // NOVO — alerta imediato por Telegram, ao lado da notificação in-app
    // acima (não a substitui). Fire-and-forget, best-effort: nunca deve
    // impedir o fluxo de verificação em si.
    notifyPaymentNeedsReview({ transactionId, reason, confidence });
  } catch (e) {
    console.error('[verify-receipt] _markReviewNeeded falhou:', e.message);
  }
}

async function handleVerifyReceipt(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // Rate limit: 3 uploads/IP/min
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!await checkReceiptRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados pedidos. Aguarde um minuto e tente de novo.', code: 'RATE_LIMITED' });
  }

  const body = parseBody(req);
  const { imageBase64, mimeType, reference, phone, amount, wallet, userId, transactionId, packageId } = body;

  if (!imageBase64 || !transactionId || !packageId) {
    return res.status(400).json({ error: 'imageBase64, transactionId e packageId são obrigatórios.' });
  }

  // Verificar que a transacção existe e está pendente
  try {
    const rows = await restRequest(
      `transactions?id=eq.${transactionId}&status=in.(pending,review_needed)&select=id,package_id,amount,user_id&limit=1`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Transacção não encontrada ou já processada.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao verificar transacção.' });
  }

  try {
    const fallbackPackages = await loadPackagesFromSettings();
    const result = await verifyReceiptInternal({
      imageBase64, mimeType, reference, phone,
      amount: Number(amount) || (fallbackPackages[packageId]?.price || 0),
      wallet: wallet || 'móvel',
      userId, transactionId, packageId,
    });
    // Sempre 200 — success:false é resposta de negócio, não erro HTTP.
    // O frontend distingue pelos campos success/code/nextStep.
    return res.status(200).json(result);
  } catch (err) {
    console.error('[verify-receipt] erro inesperado:', err.message);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}

// Exportar para uso directo em process-payment.js (sem HTTP round-trip)
module.exports.verifyReceiptInternal = verifyReceiptInternal;

// ════════════════════════════════════════════════════════════════════════════
// PAGE-VIEW
// ════════════════════════════════════════════════════════════════════════════
async function handlePageView(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { slug } = parseBody(req);
  if (!slug || typeof slug !== 'string' || slug.length > 100)
    return res.status(400).json({ error: 'slug inválido' });

  try {
    await rpc('increment_page_views', { p_slug: slug });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[handlePageView] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível registar a visualização.' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MARKETING ANALYTICS — Fase 1 (fundação de tracking)
// POST /api/misc?_ns=marketing&_a=visit   { visitor_id, source, referrer, landing_page, device, browser, language }
// POST /api/misc?_ns=marketing&_a=event   { visitor_id, user_id?, event, document_type?, value?, metadata? }
//
// Rota única, sem função serverless nova (reutiliza api/misc.js, dentro do
// limite de 12 do plano Hobby). Nunca falha de forma visível para o
// utilizador — analytics não deve poder quebrar a experiência da app; em
// erro, respondemos sempre 200 e só registamos no log do servidor.
// ════════════════════════════════════════════════════════════════════════════
const VALID_MKT_EVENTS = new Set([
  'signup', 'login', 'document_generated', 'pdf_download',
  'credit_purchase', 'plan_purchase', 'became_affiliate',
  'referred_friend', 'commission_earned', 'template_created', 'template_purchased',
]);

function _clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || '0.0.0.0';
}

function _parseDevice(ua = '') {
  if (/mobile/i.test(ua) && !/ipad|tablet/i.test(ua)) return 'mobile';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

function _parseBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/safari\//i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/opr\//i.test(ua)) return 'Opera';
  return 'outro';
}

async function handleMarketing(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  // Rate limit por IP — analytics é o alvo perfeito para spam/flood
  // (não custa créditos, é tentador abusar). 60/min é generoso para uso
  // normal (1 visita + poucos eventos por carregamento de página) e
  // barra scripts a martelar o endpoint.
  const ip = _clientIp(req);
  const allowed = await checkRateLimit('marketing', ip, { limit: 60, windowSec: 60 }).catch(() => true);
  if (!allowed) return res.status(200).json({ ok: false, throttled: true });

  const body = parseBody(req);
  const visitorId = (body.visitor_id || '').toString().slice(0, 64);
  if (!visitorId) return res.status(200).json({ ok: false, error: 'visitor_id required' });

  try {
    if (action === 'visit') {
      const ua = (req.headers['user-agent'] || '').slice(0, 300);
      await insert('marketing_visits', {
        visitor_id:       visitorId,
        marketing_source: (body.source || 'direct').toString().slice(0, 50).toLowerCase(),
        referrer:         (body.referrer || '').toString().slice(0, 500) || null,
        landing_page:     (body.landing_page || '/').toString().slice(0, 300),
        user_agent:       ua,
        device:           _parseDevice(ua),
        browser:          _parseBrowser(ua),
        // CORRIGIDO: país/cidade vêm dos headers de geo do próprio Vercel —
        // zero custo, zero chamada a um serviço externo de geo-IP.
        country:          req.headers['x-vercel-ip-country'] || null,
        city:             req.headers['x-vercel-ip-city']    || null,
        language:         (body.language || '').toString().slice(0, 10) || null,
        ip_hash:          crypto.createHash('sha256').update(ip).digest('hex'),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'event') {
      const event = (body.event || '').toString();
      if (!VALID_MKT_EVENTS.has(event)) return res.status(200).json({ ok: false, error: 'evento desconhecido' });
      await insert('marketing_events', {
        visitor_id:    visitorId,
        user_id:       (body.user_id && /^[0-9a-f-]{36}$/i.test(body.user_id)) ? body.user_id : null,
        event,
        document_type: (body.document_type || '').toString().slice(0, 50) || null,
        value:         Number.isFinite(body.value) ? body.value : null,
        metadata:      (body.metadata && typeof body.metadata === 'object') ? body.metadata : {},
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: false, error: `acção desconhecida: ${action}` });
  } catch (err) {
    // Nunca deixar analytics derrubar a experiência do utilizador.
    console.error('[handleMarketing] erro:', err.message);
    return res.status(200).json({ ok: false });
  }
}


async function handleSitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  // Páginas dinâmicas criadas pelo admin (blog_pages publicadas na BD).
  //
  // FORMATO DA URL:
  //   - O admin publica via GitHub commit em pages/<slug>/index.html
  //     (ver handleGeneratePage em api/admin/index.js).
  //   - Logo a URL pública é /pages/<slug>/ (cleanUrls no vercel.json),
  //     NÃO /pages/<slug>.html como estava antes (bug anterior).
  //
  // DEDUPLICAÇÃO:
  //   - Se uma página dinâmica tiver o mesmo slug de uma estática já listada
  //     em STATIC_PAGES (ex: como-fazer-cv-mocambique), a entrada estática
  //     tem prioridade. Isto evita duplicados no sitemap quando uma página
  //     estática foi posteriormente republicada pelo admin.
  let dynamicPages = [];
  try {
    const data = await restRequest(
      'blog_pages?published=eq.true&select=slug,updated_at,title&order=updated_at.desc&limit=500'
    );

    // Conjunto de slugs já cobertos pelas páginas estáticas
    const staticSlugs = new Set(
      STATIC_PAGES
        .map(p => {
          // Extrai o slug do loc: /pages/foo.html → foo | /pages/foo/ → foo
          const m = p.loc.match(/\/pages\/([^/]+?)(?:\.html|\/?$)/);
          return m ? m[1] : null;
        })
        .filter(Boolean)
    );

    dynamicPages = (Array.isArray(data) ? data : [])
      .filter(p => p.slug && !staticSlugs.has(p.slug))
      .map(p => ({
        // CORRIGIDO (auditoria de indexação): antes usava '/pages/slug/'
        // (com barra final), mas a tag <link rel="canonical"> gerada pelo
        // mesmo template (blogTemplate.js) usa '/pages/slug' (SEM barra) —
        // e como o vercel.json não define trailingSlash:true, o Vercel
        // redirecciona (308) de /slug/ para /slug por omissão. Ou seja, o
        // sitemap estava a listar URLs que fazem um salto de redirect
        // antes de chegar à versão canónica — más práticas para SEO
        // (Google prefere URLs do sitemap que respondem 200 directamente).
        // Agora ambos usam exactamente a mesma forma.
        loc:        `/pages/${p.slug}`,
        priority:   '0.8',
        changefreq: 'monthly',
        lastmod:    p.updated_at ? p.updated_at.slice(0, 10) : undefined,
      }));
  } catch (_) {
    // Falha silenciosa: o sitemap serve as páginas estáticas mesmo sem BD
  }

  const allPages = [...STATIC_PAGES, ...dynamicPages];

  const urlEntries = allPages.map(p => {
    const lines = [
      `  <url>`,
      `    <loc>${SITE_URL}${p.loc}</loc>`,
      p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>` : null,
      `    <changefreq>${p.changefreq}</changefreq>`,
      `    <priority>${p.priority}</priority>`,
      `  </url>`,
    ].filter(Boolean);
    return lines.join('\n');
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;

  return res.status(200).send(xml);
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════════════
// NOTA (auditoria Jul/2026 — corrigido comentário anterior que contradizia o
// código): este endpoint EXPÕE supabaseUrl + supabaseAnonKey de propósito, e
// isso está correcto. AuthManager.js usa-os no browser para criar um cliente
// Supabase real (createClient), necessário para autenticação e para as
// poucas escritas directas feitas pelo painel admin (ver AdminApp.js).
//
// A anon key do Supabase é, por desenho, uma chave PÚBLICA — todo o modelo
// de segurança do Supabase assume que ela vai parar ao browser de qualquer
// app que a use, e a protecção real vem do Row Level Security (RLS) em
// cada tabela, não do sigilo desta chave. Confirmado nesta auditoria:
//   - profiles/documents/transactions têm RLS activo com políticas "own
//     row" para utilizadores normais e políticas de admin (baseadas em
//     is_admin=true verificado no próprio Postgres, não confiado ao
//     cliente) em polices.sql.
//   - migration_v50_protect_sensitive_profile_columns.sql acrescenta uma
//     camada extra: mesmo dentro da própria linha, um utilizador normal
//     não consegue alterar directamente is_admin/credits/aff_balance/etc.
// O que NUNCA pode ir para aqui (nem para nenhum endpoint público) é a
// SERVICE_ROLE_KEY — essa sim ignora todo o RLS e só é usada server-side
// em api/_lib/supabaseAdmin.js.
async function handleConfig(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // CORRIGIDO: 60s + stale-while-revalidate=300s fazia alterações de preço
  // feitas no painel de admin (system_settings → packages, devolvido aqui)
  // demorarem até vários minutos a propagar para o utilizador, mesmo após
  // limpar a cache do browser — a CDN da Vercel podia continuar a servir
  // a resposta antiga em cache durante esse período. supabaseUrl/anonKey
  // não mudam, mas packages/docsGenerated mudam com frequência suficiente
  // (controlados por admin) para justificarem um cache bem mais curto.
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl     = process.env.SUPABASE_URL      || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const isSandbox       = !process.env.MPESA_API_KEY || !process.env.MPESA_SERVICE_CODE;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(200).json({ configured: false, isSandbox, message: 'Supabase não configurado' });
  }

  // Contador público de documentos gerados (evita COUNT(*) full-scan)
  let docsGenerated = null;
  try {
    // Preferir valor pré-agregado em analytics_metrics se existir
    const metrics = await restRequest(
      'analytics_metrics?metric_type=eq.counter&metric_name=eq.docs_generated&order=metric_date.desc&limit=1&select=metric_value'
    );
    if (Array.isArray(metrics) && metrics[0]?.metric_value > 0) {
      docsGenerated = metrics[0].metric_value;
    } else {
      // Fallback: count directo (mais lento em tabelas grandes)
      // CORRIGIDO (auditoria de dados, v27): credit_usage_log nunca é
      // escrita pelo código actual — a tabela real é credit_logs
      // (action='consume'). Ver mesma correcção em handleStats/handleAnalytics.
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/credit_logs?select=id&action=eq.consume`,
        {
          method: 'HEAD',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Prefer': 'count=exact',
          },
        }
      );
      const countHeader = countRes.headers.get('content-range');
      if (countHeader) docsGenerated = parseInt(countHeader.split('/')[1]) || 0;
    }
  } catch (_) {}

  // Resumo real de avaliações públicas (nunca inventado) — usado pelo hero
  // em vez do "4.9 (128 avaliações)" fixo que lá estava antes. Só conta
  // avaliações com status='approved' (ver migration_v44_public_reviews.sql
  // e api/_lib/contentModeration.js): passaram pelo filtro automático de
  // abuso/spam ou foram aprovadas manualmente por um admin.
  let reviewsSummary = null;
  try {
    const rows = await restRequest('user_feedback?status=eq.approved&select=rating');
    if (Array.isArray(rows) && rows.length > 0) {
      const count = rows.length;
      const avg   = rows.reduce((s, r) => s + (r.rating || 0), 0) / count;
      reviewsSummary = { avg: Math.round(avg * 10) / 10, count };
    }
  } catch (_) {}

  // Pacotes (preços/créditos) — única fonte de verdade em system_settings,
  // via _lib/packages.js. Antes desta correcção, o frontend usava valores
  // hard-coded em PaymentService.js/PaymentController.js que nunca
  // reflectiam alterações feitas no painel de admin.
  const packages = await loadPackagesFromSettings();

  // CORRIGIDO: mesmo problema dos pacotes, mas para os campos de
  // "Configurações do Sistema" (Nome do Site, Créditos Grátis, WhatsApp
  // Suporte) — o admin altera-os em /admin.html, mas o número de WhatsApp
  // estava hard-coded em 4 ficheiros do frontend
  // (DocumentController.js, DocumentEditor.js, PaymentService.js,
  // Models.js), e os créditos grátis hard-coded numa função SQL
  // (handle_new_user, migration_v13_fix_signup_credits.sql) — nenhum dos
  // dois lia esta tabela. Expor aqui é o primeiro passo para os 4 locais
  // do frontend passarem a usar o valor real; a função SQL precisa de
  // ser corrigida separadamente (não pode ler isto via HTTP).
  let whatsappSupport = null, freeCreditsNormal = null, freeCreditsExpiryDays = null;
  try {
    const settingsRows = await restRequest(
      `system_settings?key=in.(whatsapp_support,free_credits_normal,free_credits_expiry_days)&select=key,value`
    );
    if (Array.isArray(settingsRows)) {
      const sMap = {};
      settingsRows.forEach(r => { sMap[r.key] = r.value; });
      if (sMap.whatsapp_support) whatsappSupport = sMap.whatsapp_support;
      if (Number.isFinite(Number(sMap.free_credits_normal)))      freeCreditsNormal     = Number(sMap.free_credits_normal);
      if (Number.isFinite(Number(sMap.free_credits_expiry_days))) freeCreditsExpiryDays = Number(sMap.free_credits_expiry_days);
    }
  } catch (e) {
    console.warn('[handleConfig] Falha ao carregar settings extra:', e.message);
  }

  // supabaseUrl/supabaseAnonKey são intencionalmente públicos — ver nota
  // completa no topo desta função (handleConfig). A protecção real é o
  // RLS de cada tabela, não o sigilo desta chave.
  return res.status(200).json({
    configured:    true,
    isSandbox,
    docsGenerated,
    reviewsSummary,
    supabaseUrl,
    supabaseAnonKey,
    packages,
    whatsappSupport,
    freeCreditsNormal,
    freeCreditsExpiryDays,
    // Chave pública VAPID — necessária no browser para subscrever push
    // (registration.pushManager.subscribe). A chave privada nunca sai do
    // servidor (ver api/_lib/webpush.js).
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// AVALIAÇÕES PÚBLICAS (v44) — testemunhos reais, aprovados, para o hero e a
// secção "O que dizem os utilizadores". Só devolve avaliações com
// status='approved' (ver migration_v44_public_reviews.sql): passaram pelo
// filtro automático de abuso/spam (api/_lib/contentModeration.js) ou foram
// aprovadas manualmente por um admin em /api/admin?action=reviews. Nunca
// inventa nem completa com dados fictícios — se não houver nenhuma ainda,
// devolve uma lista vazia e o frontend trata isso de forma honesta.
// ════════════════════════════════════════════════════════════════════════════
async function handlePublicReviews(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // Só testemunhos com comentário real (não só estrelas) fazem sentido
    // como citação pública; limitamos às 12 mais recentes por serviço
    // variado, com comentário de pelo menos 8 caracteres para evitar
    // "bom." como testemunho.
    const rows = await restRequest(
      `user_feedback?status=eq.approved&comment=not.is.null&order=created_at.desc&limit=40&select=service,rating,comment,display_name,created_at`
    );
    const withComment = (Array.isArray(rows) ? rows : [])
      .filter(r => (r.comment || '').trim().length >= 8)
      .slice(0, 12)
      .map(r => ({
        service: r.service,
        rating: r.rating,
        comment: r.comment,
        // Nunca mostra publicamente o nome completo do perfil nem o
        // telefone — só o display_name que a própria pessoa escolheu
        // dar ao avaliar, ou "Utilizador" como alternativa neutra.
        name: r.display_name || 'Utilizador',
        created_at: r.created_at,
      }));

    // Resumo agregado (todas as aprovadas, não só as que têm comentário)
    const allApproved = await restRequest('user_feedback?status=eq.approved&select=rating');
    const count = Array.isArray(allApproved) ? allApproved.length : 0;
    const avg   = count > 0
      ? Math.round((allApproved.reduce((s, r) => s + (r.rating || 0), 0) / count) * 10) / 10
      : null;

    return res.status(200).json({ success: true, summary: { avg, count }, testimonials: withComment });
  } catch (err) {
    console.error('[public-reviews]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — subscrição do browser (clientes)
// POST /api/misc?action=push-subscribe   { subscription }
// POST /api/misc?action=push-unsubscribe { endpoint }
// A subscrição de ADMINS usa a mesma tabela mas passa por
// /api/admin?action=push-subscribe (exige token de admin) — ver admin/index.js.
// ════════════════════════════════════════════════════════════════════════════
async function handlePushSubscribe(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = parseBody(req);
    const sub  = body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ error: 'subscription inválida (faltam endpoint/keys)' });
    }

    // Utilizador autenticado (opcional — subscrições de convidados também
    // são aceites, ficam com user_id nulo).
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    if (token) {
      const { user } = await getUserFromToken(token);
      if (user?.id) userId = user.id;
    }

    const row = {
      endpoint:     sub.endpoint,
      p256dh:       sub.keys.p256dh,
      auth:         sub.keys.auth,
      user_id:      userId,
      target:       'client',
      user_agent:   (req.headers['user-agent'] || '').slice(0, 300),
      last_seen_at: new Date().toISOString(),
    };

    // Upsert por endpoint (um dispositivo pode re-subscrever várias vezes).
    // on_conflict=endpoint aponta para a UNIQUE constraint criada na
    // migration_v35 — sem isto o PostgREST tentaria o conflito pela PK (id),
    // que nunca colide, e criaria uma linha duplicada por subscrição.
    await restRequest('push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      body: row,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push-subscribe]', err);
    return res.status(500).json({ error: err.message || 'Erro ao guardar subscrição' });
  }
}

async function handlePushUnsubscribe(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = parseBody(req);
    const endpoint = body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint é obrigatório' });
    await restRequest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push-unsubscribe]', err);
    return res.status(500).json({ error: err.message || 'Erro ao remover subscrição' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES  (/api/templates/:action)
// Migrado para o wrapper REST puro api/_lib/supabaseAdmin.js
// ════════════════════════════════════════════════════════════════════════════
async function handleTemplates(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  switch (action) {
    case 'list':        return tplList(req, res);
    case 'submit':      return tplSubmit(req, res);
    case 'rate':        return tplRate(req, res);
    case 'download':    return tplDownload(req, res);
    case 'approve':     return tplApprove(req, res);
    case 'reject':      return tplReject(req, res);
    case 'pending':     return tplPending(req, res);
    // ── Acções que faltavam (rotas já existiam no vercel.json e o
    // frontend templates.html já as chamava — só a implementação aqui
    // estava em falta). Usam REST puro (rpc/restRequest), sem o SDK
    // antigo, seguindo a função match_legal_chunks e tplList como
    // referência de estilo. Dependem das funções/views criadas na
    // migration_v12_community_templates.sql.
    case 'gallery':     return tplGallery(req, res);
    case 'mine':        return tplMine(req, res);
    case 'saved':       return tplSaved(req, res);
    case 'save':        return tplSave(req, res);
    case 'use':         return tplUse(req, res);
    case 'report':      return tplReport(req, res);
    case 'share-token': return tplShareToken(req, res);
    case 'by-token':    return tplByToken(req, res);
    case 'delete':      return tplDelete(req, res);
    // NOVO (v38): saldo de royalties e pedido de levantamento para quem
    // cria templates pagos — mesmo padrão já usado pelos afiliados.
    case 'earnings':    return tplEarnings(req, res);
    case 'withdraw':    return tplWithdraw(req, res);
    // NOVO: só afiliados ou parceiros aprovados podem VENDER templates na
    // Galeria (a plataforma não tem como pagar royalties a quem não está
    // associado ao projecto). Esta acção diz ao frontend se o utilizador
    // actual pode definir preço, para mostrar (ou esconder) essa parte do
    // formulário de submissão.
    case 'seller-status': return tplSellerStatus(req, res);
    default:            return res.status(404).json({ error: 'Acção de template não encontrada' });
  }
}

async function tplList(req, res) {
  const service = req.query?.service || null;
  const limit   = Math.min(parseInt(req.query?.limit || 50), 100);

  // CORRIGIDO (bug grave): esta função ignorava por completo req.query.id.
  // O frontend (templates.html → openDetail) chama isto como
  // "/list?id=eq.<uuid>&limit=1" para carregar UM template específico ao
  // clicar num card — mas como o "id" nunca era lido nem aplicado ao filtro,
  // a query executada era sempre "ORDER BY downloads DESC LIMIT 1", ou seja,
  // devolvia sempre o template mais descarregado do catálogo inteiro,
  // fosse qual fosse o id pedido. Resultado: clicar em QUALQUER card da
  // galeria abria sempre o mesmo modal (o template nº1 em downloads).
  //
  // Validamos o formato UUID em vez de concatenar req.query.id directamente
  // no path — sem isto, alguém podia injectar filtros extra do PostgREST
  // (ex: "...&id=neq.0&status=neq.approved") através da query string.
  const idMatch = /^(?:eq\.)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    .exec(String(req.query?.id || ''));
  const id = idMatch ? idMatch[1] : null;

  // CORRIGIDO: faltava template_html aqui — só template_css estava no
  // select. Sem o HTML, o frontend (templates.html → _buildSampleHtml)
  // nunca conseguia preencher os placeholders {{...}} com dados de
  // exemplo e caía sempre no fallback markdown genérico ("Título do
  // Documento de Exemplo... texto de demonstração"), mesmo para
  // templates com HTML real guardado na tabela.
  const fields  = 'id,service_type,template_name,description,thumbnail_url,template_html,template_css,downloads,likes,rating_sum,rating_count,created_at';
  let path = `templates_custom?status=eq.approved&is_public=eq.true&order=downloads.desc&limit=${limit}&select=${fields}`;
  if (service) path += `&service_type=eq.${encodeURIComponent(service)}`;
  if (id) path += `&id=eq.${id}`;
  try {
    const data = await restRequest(path);
    const templates = (Array.isArray(data) ? data : []).map(t => ({
      ...t,
      avg_rating: t.rating_count > 0 ? Math.round((t.rating_sum / t.rating_count) * 10) / 10 : null,
    }));
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error('[tplList] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os modelos. Tente novamente.' });
  }
}

// ── Elegibilidade para VENDER templates (créditos > 0) ─────────────────────
// REGRA DE NEGÓCIO: a plataforma só pode pagar royalties a quem já está
// associado ao projecto — afiliados aprovados (profiles.is_affiliate) ou
// parceiros aprovados e activos (tabela partners, ligados à conta via
// partners.linked_user_id — ver migration_v55). Um utilizador comum pode
// sempre criar e submeter os seus próprios templates (privados, ou
// públicos gratuitos), mas NUNCA lhes definir um preço em créditos.
// Esta função é a verificação "amigável" ao nível da aplicação — a
// garantia definitiva (que não depende de nenhum código de API estar
// correcto) é o trigger enforce_template_credit_eligibility na base de
// dados, que força credit_cost=0 em qualquer INSERT/UPDATE que viole esta
// regra, seja qual for o caminho usado para lá chegar.
async function isEligibleTemplateSeller(userId) {
  if (!userId) return false;
  try {
    const profile = await selectOne('profiles', 'id', userId, 'is_affiliate');
    if (profile?.is_affiliate) return true;
  } catch (_) { /* ignora — trata como não elegível */ }
  try {
    const rows = await restRequest(
      `partners?linked_user_id=eq.${userId}&status=eq.approved&active=eq.true&select=id&limit=1`
    );
    if (Array.isArray(rows) && rows.length) return true;
  } catch (_) { /* coluna pode não existir ainda — ver migration_v55 */ }
  return false;
}

// GET /api/templates/seller-status — usado pelo formulário "Submeter
// Template" para decidir se mostra a secção de preço/créditos ou uma
// mensagem a explicar como se tornar elegível para vender.
async function tplSellerStatus(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const eligible = await isEligibleTemplateSeller(user.id);
  // NOVO: devolve também a taxa MZN/crédito em vigor, para o formulário
  // "Submeter Template" mostrar "≈ X MZN" ao vivo enquanto o criador define
  // o preço — o mesmo cálculo que o admin já vê em /api/admin/templates
  // (mzn_per_credit), calculado a partir dos pacotes de créditos activos.
  let mznPerCredit = 0;
  try {
    const packages = await loadPackagesFromSettings();
    mznPerCredit = estimateMznPerCredit(packages);
  } catch (_) { /* falha a obter a taxa não deve bloquear o resto do formulário */ }
  return res.status(200).json({
    success: true, eligible,
    mzn_per_credit: Math.round(mznPerCredit * 100) / 100,
  });
}

async function tplSubmit(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body = parseBody(req);
  const { service_type, template_name, description, template_css, thumbnail_url, template_file, template_html } = body;
  if (!service_type || !template_name || !template_css)
    return res.status(400).json({ error: 'service_type, template_name e template_css são obrigatórios' });

  // CORRIGIDO: esta função nunca lia body.template_type nem body.tags —
  // o formulário em templates.html envia ambos (rádio "Comunidade"/
  // "Privado" + campo de tags), mas eram descartados em silêncio. Ficava
  // sempre gravado o valor por omissão da coluna (template_type =
  // 'community'), pelo que um template submetido como "Privado" nunca
  // recebia is_public/aprovação imediata nem share_token — ficava preso
  // como 'pending', igual a um template público comum, contrariando o que
  // o próprio formulário promete ("Templates privados são aprovados
  // imediatamente"). As tags eram sempre perdidas.
  const rawType = String(body.template_type || 'community').trim();
  const template_type = rawType === 'private' ? 'private' : 'community';
  const tags = Array.isArray(body.tags) ? body.tags.map(t => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 10) : [];

  // NOVO (v39): o cliente pode propor as suas próprias regras de venda —
  // o preço em CRÉDITOS (a mesma moeda usada em toda a plataforma; nunca
  // um valor monetário à parte) a cobrar de quem usar o seu template, e a
  // percentagem que fica para si. Esta percentagem é SEMPRE limitada
  // entre 60% e 70% (o resto, 30%-40%, fica para a plataforma), mesmo que
  // o valor enviado esteja fora da banda — nunca confiamos apenas na
  // validação do lado do cliente. A base de dados tem o mesmo limite via
  // CHECK constraint, como segunda camada de protecção. O admin continua
  // a poder rever/ajustar o preço em créditos antes de aprovar (ver
  // handleTemplates), tal como já acontecia com templates "premium".
  // Templates privados nunca são vendidos (credit_cost forçado a 0).
  // NOVO: só afiliados/parceiros aprovados podem vender templates — um
  // utilizador comum pode sempre submeter (privado, ou público gratuito),
  // mas nunca com preço em créditos. Isto é reforçado outra vez ao nível
  // da base de dados (trigger), mas verifica-se aqui também para devolver
  // uma mensagem clara em vez de o preço ser simplesmente ignorado.
  const canSell = template_type === 'private' ? false : await isEligibleTemplateSeller(user.id);

  const rawCost = parseInt(body.credit_cost, 10);
  // Limite do projecto: nenhuma operação cobra mais de 10 créditos (ver
  // VALID_COSTS em api/deduct-credit.js) — antes permitia até 50, um
  // template aprovado com esse preço nunca poderia sequer ser debitado.
  const requestedCost = Number.isFinite(rawCost) ? Math.min(10, Math.max(0, rawCost)) : 0;
  const credit_cost = canSell ? requestedCost : 0;
  const blockedSale  = !canSell && requestedCost > 0; // pediu preço mas não é elegível
  const rawShare = parseFloat(body.author_share_percent);
  const author_share_percent = Number.isFinite(rawShare)
    ? Math.min(70, Math.max(60, rawShare))
    : 65; // omisso → 65%, o valor intermédio da banda permitida

  // Templates privados: aprovação imediata (só o autor os vê, ou quem tiver
  // o link secreto) — mesma regra já implementada na função Postgres
  // submit_template (migration_v12), replicada aqui porque esta rota usa
  // insert() directo em vez dessa RPC.
  const isPrivate   = template_type === 'private';
  const share_token = isPrivate ? crypto.randomBytes(16).toString('hex') : null;

  let data;
  try {
    data = await insert('templates_custom', {
      user_id: user.id,
      service_type:  service_type.trim().slice(0, 50),
      template_name: template_name.trim().slice(0, 100),
      description:   (description || '').trim().slice(0, 300),
      template_html: (template_html || '').slice(0, 20000),
      template_css:  template_css.slice(0, 20000),
      thumbnail_url: thumbnail_url || null,
      template_file: template_file || null,
      tags,
      template_type,
      share_token,
      status:        isPrivate ? 'approved' : 'pending',
      is_public:     false, // mesmo aprovado, um template privado nunca entra na galeria pública
      credit_cost,
      author_share_percent,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({
    success: true, id: data.id, share_token,
    message: isPrivate
      ? 'Template privado guardado! Já pode partilhar o link.'
      : blockedSale
        ? 'Template submetido gratuitamente. Só afiliados ou parceiros aprovados podem vender templates na plataforma — torne-se afiliado para poder definir um preço da próxima vez.'
        : credit_cost > 0
          ? `Template submetido com preço de ${credit_cost} créditos (${author_share_percent}% para si). Aguarda aprovação.`
          : 'Template submetido! Aguarda aprovação.',
  });
}

async function tplRate(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, rating, comment } = parseBody(req);
  if (!template_id || !rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'template_id e rating (1-5) são obrigatórios' });
  try {
    const data = await rpc('rate_template', {
      p_template_id: template_id, p_user_id: user.id,
      p_rating: parseInt(rating), p_comment: (comment || '').slice(0, 500),
    });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function tplDownload(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { template_id, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    await rpc('increment_template_downloads', { p_template_id: template_id });
  } catch (_) { /* contador é best-effort */ }
  try {
    await insert('template_downloads', { template_id, session_id: session_id || null });
  } catch (_) { /* registo de download é best-effort */ }
  return res.status(200).json({ ok: true });
}

async function tplApprove(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id } = parseBody(req);
  await rpc('approve_template', { p_template_id: template_id });
  return res.status(200).json({ success: true });
}

async function tplReject(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id, note } = parseBody(req);
  await rpc('reject_template', { p_template_id: template_id, p_note: note || '' });
  return res.status(200).json({ success: true });
}

async function tplPending(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const data = await restRequest(
    'templates_custom?status=eq.pending&order=created_at.asc&select=id,service_type,template_name,description,thumbnail_url,status,created_at,user_id'
  );
  return res.status(200).json({ success: true, templates: data || [] });
}

// ── Auxiliar: extrair utilizador autenticado a partir do header
// Authorization, via REST puro (sem o SDK antigo) — usado pelas 9 funções
// abaixo, todas adicionadas para completar o que templates.html (página
// de marketplace comunitário) já chamava mas api/misc.js ainda não tinha
// implementado. Devolve null em vez de lançar erro — cada função decide
// se autenticação é obrigatória ou opcional (ex: 'use' regista a sessão
// mesmo sem login, via session_id).
async function getAuthUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { user } = await getUserFromToken(token);
  return user;
}

// GET /api/templates/gallery?sort=&limit=&offset=&type=
// Usa a view v_templates_gallery (migration_v12) — já calcula avg_rating
// e popularity_score, e já filtra status='approved' AND is_public=true.
async function tplGallery(req, res) {
  const limit   = Math.min(parseInt(req.query?.limit || 24), 50);
  const offset  = Math.max(parseInt(req.query?.offset || 0), 0);
  const sort    = req.query?.sort || 'popular';
  const type    = req.query?.type || null;
  // v39: mini filtro Grátis/Pagos na Galeria Comunitária — os templates são
  // sempre pagos em créditos (credit_cost), nunca um valor MZN à parte.
  const pricing = req.query?.pricing || null; // 'free' | 'paid'

  const sortColumn = {
    popular: 'popularity_score',
    recent:  'created_at',
    rating:  'avg_rating',
    downloads: 'downloads',
  }[sort] || 'popularity_score';

  let path = `v_templates_gallery?order=${sortColumn}.desc.nullslast&limit=${limit}&offset=${offset}`;
  if (type)    path += `&template_type=eq.${encodeURIComponent(type)}`;
  if (pricing === 'free') path += `&credit_cost=eq.0`;
  if (pricing === 'paid') path += `&credit_cost=gt.0`;

  try {
    const templates = await restRequest(path);
    return res.status(200).json({ success: true, templates: Array.isArray(templates) ? templates : [] });
  } catch (err) {
    console.error('[tplGallery] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar a galeria. Tente novamente.' });
  }
}

// GET /api/templates/mine — templates submetidos pelo utilizador autenticado.
// Usa a view v_my_templates (já filtra por auth.uid() no lado do Postgres,
// mas como chamamos com a service_role key — que ignora RLS — filtramos
// explicitamente por user_id aqui em vez de confiar em auth.uid()).
async function tplMine(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    // CORRIGIDO: faltavam template_html e template_css no select — sem
    // eles, o preview real do documento não conseguia ser mostrado na
    // aba "Os Meus" (mesmo bug da galeria pública, ver
    // migration_v23_fix_gallery_view_html_css.sql).
    // CORRIGIDO: faltavam também is_public, credit_cost, author_share_percent
    // e template_type — o criador não conseguia ver se o seu template já
    // (ou ainda não) estava mesmo visível na galeria pública, nem quanto
    // preço/percentagem ficou definido para ele (ver migration_v54).
    const templates = await restRequest(
      `templates_custom?user_id=eq.${user.id}&order=created_at.desc&select=id,service_type,template_name,description,thumbnail_url,status,is_public,template_type,rejection_note,use_count,downloads,is_featured,credit_cost,author_share_percent,template_html,template_css,created_at,share_token`
    );
    return res.status(200).json({ success: true, templates: Array.isArray(templates) ? templates : [] });
  } catch (err) {
    console.error('[tplMine] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os seus templates.' });
  }
}

// GET /api/templates/saved — templates guardados pelo utilizador na sua
// colecção pessoal (tabela template_saves, join com templates_custom).
async function tplSaved(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    const saves = await restRequest(
      `template_saves?user_id=eq.${user.id}&select=template_id,templates_custom(id,service_type,template_name,description,thumbnail_url,downloads,use_count,likes,rating_count,template_type,template_html,template_css,created_at)`
    );
    const templates = (Array.isArray(saves) ? saves : [])
      .map(s => s.templates_custom)
      .filter(Boolean);
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error('[tplSaved] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os templates guardados.' });
  }
}

// POST /api/templates/save  { template_id }
// Alterna guardar/remover da colecção pessoal — usa toggle_save_template
// (migration_v12), que já trata o INSERT/DELETE atomicamente.
async function tplSave(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('toggle_save_template', { p_template_id: template_id, p_user_id: user.id });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplSave] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível guardar o template.' });
  }
}

// POST /api/templates/use  { template_id, service_key }
// Regista que o template foi efectivamente aplicado a um documento
// (diferente de 'download' — ver comentário em template_uses na
// migration_v12). Login não é exigido aqui pelo frontend (templates.html
// já valida currentUser antes de chamar, mas mantemos tolerante a
// session_id para não bloquear o fluxo de geração caso a sessão expire).
async function tplUse(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  const { template_id, service_key, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('use_template', {
      p_template_id: template_id,
      p_user_id: user?.id || null,
      p_session_id: session_id || null,
      p_service_key: service_key || '',
    });
    // NOVO (v39): repartição de receita entre o criador do template
    // (vendedor) e a plataforma, sempre entre 60%-70% para o criador e
    // 30%-40% para a plataforma (author_share_percent, definido pelo
    // próprio cliente ao submeter o template — ver tplSubmit — e
    // validado/limitado a essa banda tanto no servidor como por CHECK
    // constraint na base de dados).
    //
    // IMPORTANTE: quem usa o template paga sempre em CRÉDITOS
    // (credit_cost, a mesma moeda já usada em toda a plataforma) — nunca
    // um valor monetário à parte. O valor em MZN só existe internamente,
    // para o criador poder levantar via M-Pesa: convertemos os créditos
    // gastos para MZN usando a taxa média (dinâmica) dos pacotes activos
    // — a mesma fonte de verdade do checkout — nunca um valor fixo.
    if (result?.success && user?.id && (result.credit_cost || 0) > 0) {
      const packages    = await loadPackagesFromSettings();
      const mznPerCredit = estimateMznPerCredit(packages);
      const amountMzn    = Math.round(result.credit_cost * mznPerCredit * 100) / 100;
      rpc('process_template_sale', {
        p_template_id:   template_id,
        p_buyer_id:      user.id,
        p_credits_spent: result.credit_cost,
        p_amount_mzn:    amountMzn,
      }).catch(e => console.warn('[tplUse] process_template_sale falhou:', e.message));
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplUse] erro:', err.message);
    // Não bloquear o fluxo de aplicação do template por falha no registo
    // de uso — o utilizador já está a navegar para a página de geração
    // quando isto é chamado (ver templates.html → useTemplate()).
    return res.status(200).json({ success: false });
  }
}

// POST /api/templates/report  { template_id, reason, detail? }
// reason deve ser um dos valores aceites pelo CHECK de template_reports:
// 'spam' | 'inappropriate' | 'copyright' | 'poor_quality' | 'other'
async function tplReport(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, reason, detail } = parseBody(req);
  const motivosValidos = ['spam', 'inappropriate', 'copyright', 'poor_quality', 'other'];
  if (!template_id || !motivosValidos.includes(reason)) {
    return res.status(400).json({ error: 'template_id e reason (spam|inappropriate|copyright|poor_quality|other) são obrigatórios' });
  }
  try {
    await insert('template_reports', {
      template_id,
      reporter_id: user.id,
      reason,
      detail: (detail || '').slice(0, 500),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tplReport] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível enviar o relatório.' });
  }
}

// POST /api/templates/share-token  { template_id }
// Gera (ou regenera) o token de partilha de um template privado — só o
// dono pode fazê-lo (verificado dentro de regenerate_share_token, SQL).
async function tplShareToken(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('regenerate_share_token', { p_template_id: template_id, p_user_id: user.id });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplShareToken] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível gerar o link de partilha.' });
  }
}

// GET /api/templates/by-token?token=...
// Acesso público a um template privado partilhado por link directo —
// não exige autenticação (o token É a autorização).
async function tplByToken(req, res) {
  const token = req.query?.token || '';
  if (!token) return res.status(400).json({ error: 'token obrigatório' });
  try {
    const rows = await restRequest(
      `templates_custom?share_token=eq.${encodeURIComponent(token)}&select=id,service_type,template_name,description,template_html,template_css,thumbnail_url,downloads,use_count&limit=1`
    );
    const template = Array.isArray(rows) ? rows[0] : null;
    if (!template) return res.status(404).json({ error: 'Link inválido ou expirado' });
    return res.status(200).json({ success: true, template });
  } catch (err) {
    console.error('[tplByToken] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar o template.' });
  }
}

// POST /api/templates/delete  { template_id }
// Só o dono pode apagar o seu próprio template — verificado explicitamente
// aqui (não delegado a uma função RPC) porque é uma operação destrutiva e
// simples o suficiente para validar directamente.
async function tplDelete(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const rows = await restRequest(`templates_custom?id=eq.${template_id}&select=user_id`);
    const tpl = Array.isArray(rows) ? rows[0] : null;
    if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado' });
    if (tpl.user_id !== user.id) return res.status(403).json({ success: false, error: 'Não autorizado' });
    await restRequest(`templates_custom?id=eq.${template_id}`, { method: 'DELETE' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tplDelete] erro:', err.message);
    return res.status(500).json({ success: false, error: 'Não foi possível apagar o template.' });
  }
}

// GET /api/templates/earnings — saldo e histórico de vendas de templates
// pagos criados pelo próprio utilizador (v38: repartição de receita).
async function tplEarnings(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    const profile = await selectOne('profiles', 'id', user.id, 'template_author_balance,template_author_total_earned');
    const sales = await restRequest(
      `template_sales?author_id=eq.${user.id}&order=created_at.desc&limit=50` +
      `&select=id,template_id,amount_mzn,author_share_mzn,created_at,templates_custom(template_name)`
    );
    const withdrawals = await restRequest(
      `template_withdrawals?author_id=eq.${user.id}&order=created_at.desc&limit=20` +
      `&select=id,amount,status,created_at,processed_at`
    );
    return res.status(200).json({
      success: true,
      balance:      profile?.template_author_balance || 0,
      total_earned: profile?.template_author_total_earned || 0,
      sales:        sales || [],
      withdrawals:  withdrawals || [],
    });
  } catch (err) {
    console.error('[tplEarnings] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os ganhos.' });
  }
}

// POST /api/templates/withdraw  { amount, phone } — pedido de levantamento
// de royalties de templates. Mesmo padrão de validação de affWithdraw
// (número M-Pesa, saldo suficiente, sem pedido duplicado pendente).
async function tplWithdraw(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseFloat(body.amount || 0);
  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });
  if (!Number.isFinite(amount) || amount <= 0)
    return res.status(400).json({ error: 'Valor inválido' });
  // NOVO (pedido do fundador — controlo administrativo): antes disto não
  // existia NENHUM valor mínimo de levantamento para royalties de
  // templates (só para afiliados, ver affWithdraw acima). Lê o mesmo
  // padrão de system_settings, editável em Configurações → "Templates —
  // Royalties de Criadores".
  const minSetting = await selectOne('system_settings', 'key', 'tpl_min_withdraw', 'value');
  const minWithdraw = parseInt(minSetting?.value || '100');
  if (amount < minWithdraw) return res.status(400).json({ error: `Valor mínimo: ${minWithdraw} MZN` });
  const profile = await selectOne('profiles', 'id', user.id, 'template_author_balance');
  if (amount > (profile?.template_author_balance || 0))
    return res.status(400).json({ error: 'Saldo insuficiente' });
  const pendingW = await restRequest(`template_withdrawals?author_id=eq.${user.id}&status=eq.pending&select=id&limit=1`);
  if (pendingW && pendingW.length > 0)
    return res.status(400).json({ error: 'Já tem um levantamento pendente. Aguarde a conclusão.' });
  try {
    await insert('template_withdrawals', { author_id: user.id, amount, mpesa_phone: phone, status: 'pending' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  await update('profiles', 'id', user.id, { template_author_balance: (profile.template_author_balance || 0) - amount });
  insert('admin_notifications', {
    type:    'withdrawal_request',
    title:   '💸 Pedido de levantamento — royalties de template',
    message: `${amount} MZN para ${phone}. Processar em até 48h.`,
    link:    '#templates',
  }).catch(e => console.warn('[tplWithdraw] admin_notifications insert falhou:', e.message));
  return res.status(200).json({ success: true, message: `Pedido de ${amount} MZN submetido. Processado em até 48 horas via M-Pesa.` });
}

// ════════════════════════════════════════════════════════════════════════════
// AFILIADOS  (/api/affiliate/:action) — v2 Pro (segmentos, ranking, antifraude)
// ════════════════════════════════════════════════════════════════════════════
async function handleAffiliate(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    switch (action) {
      case 'register':      return await affRegister(req, res);
      case 'dashboard':     return await affDashboard(req, res);
      case 'click':         return await affClick(req, res);
      case 'withdraw':      return await affWithdraw(req, res);
      case 'check':         return await affCheck(req, res);
      case 'ranking':       return await affRanking(req, res);
      case 'notifications': return await affNotifications(req, res);
      // v41: Kit de Marketing — materiais activos + QR pessoal do afiliado
      // (rota antes inexistente: o front-end de afiliado.html já chamava
      // /api/affiliate/materials e /api/affiliate/qrcode, mas caía sempre
      // no "default" abaixo e devolvia 404 "Acção não encontrada").
      case 'materials':     return await affMaterials(req, res);
      case 'qrcode':        return await affQrcode(req, res);
      default:              return res.status(404).json({ error: 'Acção não encontrada' });
    }
  } catch (err) {
    console.error('[handleAffiliate] crash:', action, err.message);
    // CORRIGIDO: o erro técnico cru (ex: detalhes internos do SDK Supabase)
    // chegava directamente ao utilizador final no ecrã ("Quero ser Parceiro").
    // Agora a mensagem amigável é a única coisa exposta na resposta da API —
    // o detalhe técnico continua disponível nos logs do servidor (console.error
    // acima) para diagnóstico, sem nunca aparecer na interface do utilizador.
    return res.status(500).json({ error: 'Não foi possível concluir o registo. Por favor, tente novamente dentro de alguns instantes.' });
  }
}

async function affRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida' });
    const body = parseBody(req);
    const segment     = ['papelaria','cyber','universidade','explicacao','digitador','individual'].includes(body.segment) ? body.segment : 'individual';
    const businessName = (body.business_name || '').trim().slice(0, 100) || null;
    const city         = (body.city || '').trim().slice(0, 60) || null;
    const mpesaPhone   = (body.mpesa_phone || '').replace(/\s/g, '').slice(0, 20) || null;

    let profile;
    try {
      profile = await selectOne('profiles', 'id', user.id, '*');
    } catch (profileErr) {
      return res.status(500).json({ error: 'Erro ao ler perfil: ' + profileErr.message });
    }
    if (!profile) {
      const authUser = await adminGetUserById(user.id).catch(() => null);
      const meta = authUser?.user_metadata || {};
      try {
        await insert('profiles', {
          id: user.id, email: user.email || '', full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Utilizador',
          phone: meta.phone || null, credits: 0, plan: 'free', is_admin: false, is_temp: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      } catch (insertErr) {
        return res.status(500).json({ error: 'Não foi possível criar o perfil: ' + insertErr.message });
      }
      const newProfile = await selectOne('profiles', 'id', user.id, '*');
      if (!newProfile) return res.status(500).json({ error: 'Perfil criado mas não encontrado. Tente de novo.' });
      return continueRegister(res, user, newProfile, { segment, businessName, city, mpesaPhone });
    }
    if (profile.ref_code) {
      // Já registado — actualizar segmento/info extra se fornecido
      const updates = { aff_segment: segment };
      if (businessName) updates.aff_business_name = businessName;
      if (city) updates.aff_city = city;
      if (mpesaPhone) updates.aff_phone_mpesa = mpesaPhone;
      await update('profiles', 'id', user.id, updates);
      return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });
    }
    return continueRegister(res, user, profile, { segment, businessName, city, mpesaPhone });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
}

async function continueRegister(res, user, profile, extra = {}) {
  try {
    const namePart = (profile.full_name || user.email || 'MZD').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const ref_code = namePart + Math.floor(10000 + Math.random() * 90000);
    const existing = await selectOne('profiles', 'ref_code', ref_code, 'id');
    const finalCode = existing ? ref_code + Math.floor(Math.random() * 9) : ref_code;
    const updates = {
      ref_code: finalCode,
      is_affiliate: false,
      aff_segment:  extra.segment || 'individual',
      aff_joined_at: new Date().toISOString(),
    };
    if (extra.businessName) updates.aff_business_name = extra.businessName;
    if (extra.city)         updates.aff_city          = extra.city;
    if (extra.mpesaPhone)   updates.aff_phone_mpesa   = extra.mpesaPhone;
    try {
      await update('profiles', 'id', user.id, updates);
    } catch (updateErr) {
      console.error('[affRegister] erro ao actualizar perfil:', updateErr.message, updateErr.code);
      if (updateErr.message.includes('column') || updateErr.code === '42703')
        return res.status(500).json({ error: 'Não foi possível concluir o registo. A equipa já foi notificada.', sql_needed: true });
      return res.status(500).json({ error: 'Não foi possível guardar o seu registo. Por favor, tente novamente.' });
    }

    // NOVO (Fase 5): avisa o admin de uma nova candidatura a afiliado —
    // best-effort, nunca deve fazer a candidatura falhar.
    insert('admin_notifications', {
      type:    'affiliate_application',
      title:   '🤝 Nova candidatura a afiliado',
      message: `${profile.full_name || user.email || 'Utilizador'} candidatou-se (código ${finalCode}). Aguarda aprovação.`,
      link:    '#affiliates',
    }).catch(e => console.warn('[affRegister] admin_notifications insert falhou:', e.message));

    return res.status(200).json({ success: true, ref_code: finalCode, is_affiliate: false, message: 'Candidatura enviada! Aguarde aprovação em 24-48h.' });
  } catch (err) {
    console.error('[affRegister] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível concluir o registo. Por favor, tente novamente dentro de alguns instantes.' });
  }
}

async function affDashboard(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const profile = await selectOne('profiles', 'id', user.id,
    'ref_code,is_affiliate,aff_balance,aff_total_earned,aff_clicks,aff_conversions,full_name,phone,aff_segment,aff_tier,aff_business_name,aff_city,aff_phone_mpesa,aff_is_blocked,aff_block_reason');
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  const commissions = await restRequest(
    `affiliate_commissions?affiliate_id=eq.${user.id}&order=created_at.desc&limit=20` +
    `&select=id,package_id,sale_amount,commission_mzn,status,created_at`
  );

  let withdrawals = await restRequest(
    `affiliate_withdrawals?affiliate_id=eq.${user.id}&order=created_at.desc&limit=10` +
    `&select=id,amount,mpesa_phone,status,created_at,processed_at,receipt_number,receipt_screenshot_path`
  );

  // SEGURANÇA (auditoria Jul/2026): o bucket "affiliate-receipts" é privado
  // — gera-se aqui um URL assinado e temporário (5 min) só para os
  // levantamentos deste afiliado autenticado, em vez de expor um URL
  // público permanente.
  withdrawals = await Promise.all(
    (withdrawals || []).map(async (w) => ({
      ...w,
      receipt_screenshot_url: w.receipt_screenshot_path
        ? await storageCreateSignedUrl('affiliate-receipts', w.receipt_screenshot_path, 300)
        : null,
    }))
  );

  // NOVO: "Meus Referidos" — lista de quem se registou com o link deste
  // afiliado (profiles.referred_by), não só quem já gerou comissão. Antes
  // só se via o total agregado de cliques/conversões — agora dá para ver
  // exactamente QUEM entrou pelo link e se já é cliente pagante ou não.
  const referralsRaw = await restRequest(
    `profiles?referred_by=eq.${user.id}&order=created_at.desc&limit=200` +
    `&select=id,full_name,phone,created_at,account_type`
  );

  let referrals = [];
  let payingReferrals = 0;
  if (referralsRaw && referralsRaw.length) {
    const refIds = referralsRaw.map(r => r.id);
    const idsList = refIds.map(id => encodeURIComponent(id)).join(',');
    const commByReferred = await restRequest(
      `affiliate_commissions?affiliate_id=eq.${user.id}&referred_user_id=in.(${idsList})` +
      `&select=referred_user_id,commission_mzn,status`
    );

    const commMap = {};
    (commByReferred || []).forEach(c => {
      const m = commMap[c.referred_user_id] || { count: 0, total: 0, paid: false };
      m.count += 1;
      if (c.status === 'approved' || c.status === 'paid') { m.total += c.commission_mzn || 0; m.paid = true; }
      commMap[c.referred_user_id] = m;
    });

    referrals = referralsRaw.map(r => {
      const c = commMap[r.id];
      if (c?.paid) payingReferrals++;
      // Privacidade: primeiro nome + inicial do apelido (mesmo padrão já
      // usado no ranking de afiliados), nunca o telefone completo do
      // referido a outro utilizador.
      const parts = (r.full_name || '').trim().split(/\s+/).filter(Boolean);
      const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] || 'Utilizador');
      return {
        id: r.id,
        name: displayName,
        joined_at: r.created_at,
        account_type: r.account_type || 'normal',
        purchased: !!c?.paid,
        commissions_count: c?.count || 0,
        commission_total: c?.total || 0,
      };
    });
  }

  // Ranking do mês actual
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const rankingRaw = await restRequest(
    `affiliate_ranking?month=eq.${currentMonth}&order=rank_position.asc&limit=10` +
    `&select=affiliate_id,rank_position,conversions,commission_mzn,tier`
  );

  // Enriquecer ranking com nomes
  let ranking = [];
  if (rankingRaw && rankingRaw.length > 0) {
    const ids = rankingRaw.map(r => r.affiliate_id);
    const idsList = ids.map(id => encodeURIComponent(id)).join(',');
    const pnames = await restRequest(`profiles?id=in.(${idsList})&select=id,full_name,aff_segment,ref_code`);
    const nameMap = {};
    (pnames || []).forEach(p => { nameMap[p.id] = p; });
    ranking = rankingRaw.map(r => ({
      ...r,
      name: nameMap[r.affiliate_id]?.full_name?.split(' ')[0] + ' ' + (nameMap[r.affiliate_id]?.full_name?.split(' ')[1]?.[0] || '') + '.' || 'Parceiro',
      segment: nameMap[r.affiliate_id]?.aff_segment || 'individual',
      ref_code: nameMap[r.affiliate_id]?.ref_code || '',
    }));
  }

  // Notificações não lidas
  const notifs = await restRequest(
    `affiliate_notifications?affiliate_id=eq.${user.id}&is_read=eq.false&order=created_at.desc&limit=5` +
    `&select=id,type,title,body,created_at`
  );
  const unreadCount = await countRows('affiliate_notifications', `?affiliate_id=eq.${user.id}&is_read=eq.false`);

  const settingsKeys = ['aff_min_withdraw', 'aff_rate_basico', 'aff_rate_pro', 'aff_rate_empresa', 'aff_bonus_papelaria', 'aff_bonus_cyber', 'aff_bonus_universidade']
    .map(k => encodeURIComponent(k)).join(',');
  const settings = await restRequest(`system_settings?key=in.(${settingsKeys})&select=key,value`);
  const cfg = {};
  (settings || []).forEach(s => { cfg[s.key] = s.value; });

  return res.status(200).json({
    success: true,
    profile: {
      ref_code:     profile.ref_code,
      is_affiliate: profile.is_affiliate,
      is_blocked:   profile.aff_is_blocked || false,
      block_reason: profile.aff_block_reason || null,
      balance:      profile.aff_balance || 0,
      total_earned: profile.aff_total_earned || 0,
      clicks:       profile.aff_clicks || 0,
      conversions:  profile.aff_conversions || 0,
      name:         profile.full_name || 'Parceiro',
      mpesa_phone:  profile.aff_phone_mpesa || profile.phone || '',
      segment:      profile.aff_segment || 'individual',
      tier:         profile.aff_tier || 'bronze',
      link:         `${SITE_URL}/?ref=${profile.ref_code}`,
      conversion_rate: profile.aff_clicks > 0 ? Math.round((profile.aff_conversions / profile.aff_clicks) * 100) : 0,
    },
    commissions:  commissions || [],
    withdrawals:  withdrawals || [],
    referrals,
    referrals_summary: {
      total:  referralsRaw?.length || 0,
      paying: payingReferrals,
    },
    ranking,
    notifications: notifs || [],
    unread_notifications: unreadCount || 0,
    config: cfg,
  });
}

// v41: GET /api/affiliate/materials — lista os materiais de marketing
// activos (panfletos/banners/etc.) enviados pelo admin. Cada peça é
// devolvida com a imagem (base64) ou link externo e as zonas de QR/texto
// já definidas — a composição final (QR pessoal colado por cima) acontece
// no browser do afiliado, nunca aqui no servidor.
async function affMaterials(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const profile = await selectOne('profiles', 'id', user.id, 'ref_code');
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  let data;
  try {
    data = await restRequest(
      'marketing_materials?is_active=eq.true&order=sort_order.asc,created_at.desc' +
      '&select=id,title,description,category,media_type,file_data,external_url,width_px,height_px,qr_zone,text_zone,sort_order,created_at'
    );
  } catch (error) {
    console.error('[affMaterials]', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar os materiais de marketing.' });
  }

  return res.status(200).json({ success: true, materials: data || [] });
}

// v41: GET /api/affiliate/qrcode — gera (em memória, sem gravar em disco)
// o PNG do QR code pessoal do afiliado, apontando para o seu link de
// referência (?ref=CODIGO). Usado para compor os materiais de marketing
// no browser do afiliado (canvas) com o SEU QR colado por cima.
async function affQrcode(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const profile = await selectOne('profiles', 'id', user.id, 'ref_code,full_name');
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  try {
    const link = `${SITE_URL}/?ref=${profile.ref_code}`;
    const qr_png = await QRCode.toDataURL(link, { width: 500, margin: 2, color: { dark: '#07101F', light: '#FFFFFF' } });
    return res.status(200).json({
      success: true,
      qr_png,
      ref_code: profile.ref_code,
      full_name: profile.full_name || '',
      link,
    });
  } catch (err) {
    console.error('[affQrcode]', err.message);
    return res.status(500).json({ error: 'Não foi possível gerar o seu QR code.' });
  }
}

async function affClick(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body    = parseBody(req);
  const refCode = (body.ref_code || '').trim().toUpperCase();
  const page    = (body.page || '/').slice(0, 200);
  if (!refCode) return res.status(400).json({ error: 'ref_code em falta' });
  const ip     = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip + refCode).digest('hex').slice(0, 16);
  // Antifraude: verificar burst de cliques antes de registar
  const sinceIso = new Date(Date.now() - 3600000).toISOString();
  const recentClicks = await restRequest(
    `affiliate_clicks?ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`
  );
  const clickCount = recentClicks?.length || 0;
  if (clickCount >= 30) {
    // Burst detectado — registar fraude mas retornar ok silenciosamente
    const aff = await selectOne('profiles', 'ref_code', refCode, 'id');
    if (aff) {
      try {
        await insert('affiliate_fraud_flags', {
          affiliate_id: aff.id, flag_type: 'ip_burst',
          description: 'IP com ' + (clickCount+1) + ' cliques na última hora', severity: 'critical',
        });
      } catch (_) { /* registo de fraude é best-effort — não deve bloquear a resposta ao clique */ }
    }
    return res.status(200).json({ ok: true });
  }
  try {
    await rpc('register_affiliate_click', { p_ref_code: refCode, p_ip_hash: ipHash, p_page: page });
  } catch (error) {
    console.error('[affClick] error:', error.message);
  }
  return res.status(200).json({ ok: true });
}

async function affWithdraw(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseInt(body.amount || 0);
  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });
  const profile = await selectOne('profiles', 'id', user.id, 'aff_balance,is_affiliate,aff_is_blocked,aff_tier');
  if (!profile?.is_affiliate) return res.status(403).json({ error: 'Apenas afiliados aprovados podem levantar' });
  if (profile.aff_is_blocked) return res.status(403).json({ error: 'Conta suspensa. Contacte o suporte.' });
  const minSetting = await selectOne('system_settings', 'key', 'aff_min_withdraw', 'value');
  let minWithdraw = parseInt(minSetting?.value || '200');
  // Diamante tem mínimo reduzido
  if (profile.aff_tier === 'diamante') minWithdraw = Math.max(50, Math.floor(minWithdraw * 0.5));
  if (amount < minWithdraw) return res.status(400).json({ error: `Valor mínimo: ${minWithdraw} MZN` });
  if (amount > (profile.aff_balance || 0)) return res.status(400).json({ error: 'Saldo insuficiente' });
  // Verificar levantamento pendente em duplicado
  const pendingW = await restRequest(`affiliate_withdrawals?affiliate_id=eq.${user.id}&status=eq.pending&select=id&limit=1`);
  if (pendingW && pendingW.length > 0)
    return res.status(400).json({ error: 'Já tem um levantamento pendente. Aguarde a conclusão.' });
  try {
    await insert('affiliate_withdrawals', { affiliate_id: user.id, amount, mpesa_phone: phone, status: 'pending' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  await update('profiles', 'id', user.id, { aff_balance: (profile.aff_balance || 0) - amount });
  // Notificação
  try {
    await insert('affiliate_notifications', {
      affiliate_id: user.id, type: 'withdrawal',
      title: '💸 Pedido de Levantamento',
      body: `Pedido de ${amount} MZN submetido. Processado em até 48h via M-Pesa.`,
    });
  } catch (_) { /* notificação é best-effort */ }

  // NOVO (Fase 5): avisa o admin de que há um levantamento à espera de
  // processamento — o afiliado já recebeu a confirmação acima; isto é só
  // para o admin saber sem ter de ir verificar a secção manualmente.
  insert('admin_notifications', {
    type:    'withdrawal_request',
    title:   '💸 Pedido de levantamento de afiliado',
    message: `${amount} MZN para ${phone}. Processar em até 48h.`,
    link:    '#affiliates',
  }).catch(e => console.warn('[affWithdraw] admin_notifications insert falhou:', e.message));
  return res.status(200).json({ success: true, message: `Pedido de ${amount} MZN submetido. Processado em até 48 horas via M-Pesa.` });
}

async function affCheck(req, res) {
  const refCode = req.query?.ref || '';
  if (!refCode) return res.status(400).json({ error: 'ref em falta' });
  const data = await selectOne('profiles', 'ref_code', refCode, 'full_name,is_affiliate,ref_code,aff_segment');
  if (!data) return res.status(404).json({ error: 'Link inválido' });
  return res.status(200).json({
    valid: true, is_affiliate: data.is_affiliate,
    name: data.full_name || 'Parceiro MzDocs',
    segment: data.aff_segment || 'individual',
  });
}

async function affRanking(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const month = req.query?.month || new Date().toISOString().slice(0, 7);
  const ranking = await restRequest(
    `affiliate_ranking?month=eq.${month}&order=rank_position.asc&limit=20` +
    `&select=affiliate_id,rank_position,conversions,revenue_mzn,commission_mzn,tier`
  );
  if (!ranking || !ranking.length) return res.status(200).json({ success: true, ranking: [], month });
  const ids = ranking.map(r => r.affiliate_id);
  const idsList = ids.map(id => encodeURIComponent(id)).join(',');
  const profiles = await restRequest(`profiles?id=in.(${idsList})&select=id,full_name,aff_segment`);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return res.status(200).json({
    success: true, month,
    ranking: ranking.map(r => ({
      ...r,
      name: pm[r.affiliate_id]?.full_name?.split(' ').slice(0,2).join(' ') || 'Parceiro',
      segment: pm[r.affiliate_id]?.aff_segment || 'individual',
    })),
  });
}

async function affNotifications(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  if (req.method === 'POST') {
    // Marcar como lidas
    await update('affiliate_notifications', 'affiliate_id', user.id, { is_read: true }, '&is_read=eq.false');
    return res.status(200).json({ success: true });
  }
  const data = await restRequest(
    `affiliate_notifications?affiliate_id=eq.${user.id}&order=created_at.desc&limit=20` +
    `&select=id,type,title,body,is_read,created_at`
  );
  return res.status(200).json({ success: true, notifications: data || [] });
}
// ════════════════════════════════════════════════════════════════════════════
// OCR-ANALYZE — proxy IA (preservado integralmente da v1.0)
// ════════════════════════════════════════════════════════════════════════════
async function handleOcrAnalyze(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const body = parseBody(req);
  const { ocrText = '', schema = [], serviceType = '', imageBase64, imagesBase64, mimeType } = body;
  if (!schema.length) return res.status(400).json({ error: 'schema required' });

  // NOVO: várias páginas do mesmo rascunho manuscrito (Trabalho Escolar) —
  // imagesBase64 é um array; mantém-se compatibilidade total com o fluxo de
  // 1 foto (imageBase64, string única) usado por todos os outros serviços.
  // CORRIGIDO: o limite estava fixo em 8 imagens para TODOS os serviços,
  // mas o frontend (OCRController → MAX_PAGES_BY_SERVICE) já permite até 25
  // páginas para "transcricao" (Digitalizar Documento) — o utilizador podia
  // enviar 9+ fotos e o backend descartava silenciosamente tudo a partir da
  // 9ª, sem avisar ninguém. Agora o limite acompanha o do frontend por
  // serviço (continua conservador nos outros serviços, que normalmente só
  // têm um rascunho pequeno).
  const MAX_IMAGES_BY_SERVICE = { transcricao: 20, trabalho: 8 };
  const maxImages = MAX_IMAGES_BY_SERVICE[serviceType] || 8;
  const images = Array.isArray(imagesBase64) && imagesBase64.length
    ? imagesBase64.slice(0, maxImages)
    : (imageBase64 ? [imageBase64] : []);
  const hasImage = images.length > 0 && !!mimeType?.startsWith('image/');
  const isMultiPage = images.length > 1;

  // CORRIGIDO (bug crítico de "não consegue ler manuscritos"): a transcrição
  // completa ("transcript") só era pedida quando havia MAIS DE 1 página
  // (isMultiPage). No serviço "transcricao" (Digitalizar Documento), o
  // utilizador pode perfeitamente digitalizar UMA única página de cada vez
  // — nesse caso, antes desta correcção, a IA nunca era instruída a
  // transcrever o conteúdo manuscrito, só a preencher o campo opcional
  // "titulo". Agora, sempre que o serviço for "transcricao", pedimos a
  // transcrição completa independentemente do nº de páginas enviadas.
  const wantsTranscript = isMultiPage || serviceType === 'transcricao';

  const schemaDesc = schema.map(f => `- ${f.id}: "${f.label}" (${f.type})`).join('\n');

  // NOVO: com várias páginas (ou no serviço de digitalização/transcrição),
  // além de extrair os campos do formulário, pedimos também a TRANSCRIÇÃO
  // integral do texto manuscrito (em ordem de leitura, todas as páginas),
  // para servir de base ao documento final — sem isto, um rascunho só
  // contribuía com os metadados da capa (tema/nível/disciplina), perdendo
  // o conteúdo que o utilizador efectivamente escreveu.
  // CORRIGIDO (bug crítico de "inventa informação falsa" / "páginas
  // desaparecem"): a instrução anterior não dizia explicitamente ao modelo
  // para NÃO inventar conteúdo, nem pedia uma transcrição literal página a
  // página — com várias imagens densas de letra manuscrita, isso levava o
  // modelo, sob pressão do limite de tokens, a "desistir" de transcrever
  // literalmente e a preencher com texto genérico plausível mas inventado
  // (ex.: uma lista de frases soltas sobre a Bíblia que nunca esteve nas
  // fotos). Agora a instrução é explícita: transcrição literal, com
  // marcador por página, proibição clara de gerar conteúdo genérico/não
  // verificável, e uso de [ILEGÍVEL]/[PÁGINA N NÃO LEGÍVEL] em vez de
  // inventar quando a letra não dá para ler.
  const transcriptInstructions = wantsTranscript
    ? `\n- Além dos campos, transcreve TAMBÉM o texto manuscrito de TODAS as ${images.length > 1 ? `${images.length} páginas` : 'páginas'}, pela ordem em que foram fornecidas, para o campo "transcript".\n- REGRA ABSOLUTA: transcreve APENAS o que está literalmente escrito nas imagens. NUNCA acrescentes frases, ideias, listas ou conteúdo que não estejam fisicamente escritos na página — mesmo que o tema pareça religioso, académico ou familiar a um padrão comum, NÃO completes com frases genéricas do teu conhecimento geral. Isto é transcrição, não geração de texto.\n${images.length > 1 ? `- Usa um marcador "--- Página N ---" antes do texto de cada página, para as ${images.length} páginas fornecidas, na ordem em que foram enviadas.\n` : ''}- Se uma palavra, linha ou página inteira estiver ilegível, escreve exactamente [ILEGÍVEL] (ou [PÁGINA NÃO LEGÍVEL] se a página toda estiver impossível de ler) nesse ponto — nunca adivinhes nem substituas por conteúdo plausível.\n- Não resumas nem cortes conteúdo por a resposta estar a ficar longa — a transcrição TEM de cobrir todas as páginas fornecidas.\n`
    : '';
  const transcriptFormat = wantsTranscript ? `,"transcript":"texto completo transcrito de todas as páginas, com marcadores --- Página N --- se houver mais de uma"` : '';

  const userPrompt = `És um digitador/transcritor extremamente rigoroso de documentos moçambicanos, incluindo manuscritos. A tua única tarefa de transcrição é reproduzir fielmente o que está escrito — nunca gerar, resumir ou completar conteúdo por conta própria.\n${ocrText ? `TEXTO EXTRAÍDO DO DOCUMENTO:\n${ocrText.slice(0, 2000)}\n` : ''}\nTIPO DE DOCUMENTO: ${serviceType}\n\nCAMPOS A EXTRAIR:\n${schemaDesc}\n\nINSTRUÇÕES:\n- Analisa ${hasImage ? (isMultiPage ? `as ${images.length} imagens (páginas do mesmo rascunho, nesta ordem) e o texto` : 'a imagem e o texto') : 'o texto'} cuidadosamente, página a página\n- Para cada campo, extrai o valor exacto que aparece no documento\n- Se o campo não existir, inclui-o em "missing" (isto é normal e não é um erro — nem todos os documentos têm todos os campos)${transcriptInstructions}- Responde APENAS com JSON válido, sem markdown, sem explicações\n\nFORMATO OBRIGATÓRIO:\n{"fields":{"id_campo":{"value":"valor encontrado","confidence":0.95,"source":"ocr"}},"missing":["campo_ausente"]${transcriptFormat}}`;

  // CORRIGIDO: o limite de tokens estava fixo em 4000 independentemente do
  // número de páginas. Para 8-9 páginas de letra manuscrita densa, 4000
  // tokens de saída não chegam nem para metade do conteúdo — o modelo corta
  // a transcrição a meio (ou, sob essa pressão, começa a resumir/inventar
  // em vez de continuar a transcrever literalmente, o que explica tanto as
  // "páginas que desaparecem" como o conteúdo genérico/inventado a partir
  // de certo ponto). Agora escala com o nº de páginas.
  const maxTokens = wantsTranscript
    ? Math.min(8000, 1500 + images.length * 700)
    : 1500;

  // CORRIGIDO (causa da mensagem repetida "A imagem foi demasiado escura
  // para ler."): enviar várias páginas manuscritas TODAS JUNTAS numa única
  // chamada ao modelo de visão (como o código fazia até aqui) sobrecarrega
  // a atenção do modelo — com 7-9 imagens no mesmo pedido, modelos de visão
  // gratuitos (Gemini Flash, Groq llama-4-scout) tendem a "desistir" da
  // maioria das páginas e devolver uma desculpa genérica repetida, mesmo
  // quando o conteúdo é perfeitamente legível a olho nu numa imagem sozinha
  // (confirmado manualmente: as mesmas fotos, analisadas uma a uma, dão
  // ~90% de leitura). A correcção: para múltiplas páginas, faz-se AGORA UMA
  // CHAMADA DE IA POR PÁGINA (em vez de uma chamada só com todas as
  // imagens), cada uma com a atenção total do modelo dedicada a essa única
  // imagem, e no fim juntam-se as transcrições com marcadores "--- Página N
  // ---". Isto está também alinhado com o modelo de custo da app, que já
  // cobra por página digitalizada (dynamicCostPerPage) — ou seja, o custo
  // de fazer 1 chamada por página já era o esperado, só a implementação
  // técnica é que ainda ia tudo numa única chamada.
  const _sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));

  // NOVO: orçamento de tempo global para todo o pipeline de transcrição
  // multi-página. api/misc.js tem maxDuration:60s (ver vercel.json) — este
  // orçamento fica com margem de segurança (45s) para sobrar sempre tempo
  // de escrever a resposta antes da função serverless ser abatida a meio,
  // o que produziria um erro de rede genérico no browser em vez de uma
  // resposta (parcial que seja) com o que já foi conseguido transcrever.
  const _ocrDeadline = Date.now() + 45000;
  const _timeLeft = () => _ocrDeadline - Date.now();

  // NOVO (diagnóstico): antes, quando TODOS os fornecedores falhavam, a
  // única pista no cliente era "Não foi possível extrair dados" — sem
  // dizer se foi 429 (limite de pedidos), chave em falta, quota diária
  // esgotada, ou outro erro. Isto tornava impossível distinguir "bug no
  // código" de "quota gratuita esgotada por testes repetidos no mesmo
  // dia" (o cenário mais provável ao fim de várias rondas de teste
  // seguidas). Regista-se aqui um resumo por página/fornecedor, devolvido
  // ao cliente como "_debug" só quando o resultado final falha ou é
  // parcial — nunca visível na UI normal, mas aparece na consola do
  // browser (ver SmartOCRService.js) para diagnóstico rápido.
  const _ocrDebugLog = [];
  function _logOcrAttempt(label, info) { _ocrDebugLog.push(`${label}: ${info}`); }

  // CORRIGIDO (causa raiz das páginas "[ILEGÍVEL]" em cascata, sobretudo a
  // partir da página 3-4): a versão anterior desistia de cada página ao
  // primeiro 429/503 (limite de pedidos-por-minuto dos planos gratuitos do
  // Gemini/Groq), confiando só numa "ronda de recuperação" única e global
  // no fim — nessa altura, com 6-9 páginas a repetir o mesmo erro em maré,
  // muitas ainda caíam no mesmo limite de taxa e ficavam definitivamente
  // por ler. Agora cada página tenta o MESMO fornecedor até 2 vezes, com
  // pausa progressiva (backoff), antes de passar ao fornecedor seguinte —
  // dá tempo à janela de limite de pedidos-por-minuto da API se libertar
  // sem desistir logo da página.
  async function _callGeminiPage(img, pagePrompt, pageNum) {
    if (!process.env.GEMINI_API_KEY) { _logOcrAttempt(`Gemini p${pageNum}`, 'sem GEMINI_API_KEY configurada'); return null; }
    for (let attempt = 0; attempt < 2 && _timeLeft() > 4000; attempt++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: img } }, { text: pagePrompt }] }], generationConfig: { maxOutputTokens: 2600, temperature: 0.1 } }) });
        if (r.ok) {
          const d = await r.json();
          const parsed = _safeJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Gemini p${pageNum}`, 'ok'); return parsed; }
          _logOcrAttempt(`Gemini p${pageNum}`, 'HTTP 200 mas sem conteúdo útil (resposta vazia/genérica)');
          break; // resposta válida mas sem conteúdo útil — não vale repetir
        }
        let bodyTxt = '';
        try { bodyTxt = (await r.text()).slice(0, 200); } catch (_) {}
        if (r.status === 429 || r.status === 503) {
          _logOcrAttempt(`Gemini p${pageNum}`, `HTTP ${r.status} (limite/indisponível) tentativa ${attempt + 1} — ${bodyTxt}`);
          if (attempt === 0 && _timeLeft() > 5000) { await _sleep(1500 + Math.random() * 800); continue; }
        } else {
          _logOcrAttempt(`Gemini p${pageNum}`, `HTTP ${r.status} — ${bodyTxt}`);
          console.warn(`[ocr-analyze] Gemini página ${pageNum} status:`, r.status);
        }
        break;
      } catch (e) { _logOcrAttempt(`Gemini p${pageNum}`, `excepção: ${e.message}`); console.warn(`[ocr-analyze] Gemini página ${pageNum} exception:`, e.message); break; }
    }
    return null;
  }

  async function _callGroqPage(img, pagePrompt, pageNum) {
    if (!process.env.GROQ_API_KEY) { _logOcrAttempt(`Groq p${pageNum}`, 'sem GROQ_API_KEY configurada'); return null; }
    for (let attempt = 0; attempt < 2 && _timeLeft() > 4000; attempt++) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 2600, temperature: 0.1, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${img}` } }, { type: 'text', text: pagePrompt }] }] }),
        });
        if (r.ok) {
          const d = await r.json();
          if (!d.error) {
            const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
            if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Groq p${pageNum}`, 'ok'); return parsed; }
            _logOcrAttempt(`Groq p${pageNum}`, 'HTTP 200 mas sem conteúdo útil');
          } else {
            _logOcrAttempt(`Groq p${pageNum}`, `erro na resposta: ${d.error?.message || JSON.stringify(d.error).slice(0, 150)}`);
          }
          break;
        }
        let bodyTxt = '';
        try { bodyTxt = (await r.text()).slice(0, 200); } catch (_) {}
        if ((r.status === 429 || r.status === 503) && attempt === 0 && _timeLeft() > 5000) {
          _logOcrAttempt(`Groq p${pageNum}`, `HTTP ${r.status} (limite/indisponível) tentativa ${attempt + 1} — ${bodyTxt}`);
          await _sleep(1200 + Math.random() * 600); continue;
        }
        _logOcrAttempt(`Groq p${pageNum}`, `HTTP ${r.status} — ${bodyTxt}`);
        break;
      } catch (e) { _logOcrAttempt(`Groq p${pageNum}`, `excepção: ${e.message}`); console.warn(`[ocr-analyze] Groq página ${pageNum} exception:`, e.message); break; }
    }
    return null;
  }

  async function transcribeSinglePage(img, pageNum, totalPages) {
    const pagePrompt = `És um digitador/transcritor extremamente rigoroso de documentos moçambicanos, incluindo manuscritos. A tua única tarefa é reproduzir fielmente o que está escrito nesta imagem — nunca gerar, resumir ou completar conteúdo por conta própria.\n\nEsta é a página ${pageNum} de ${totalPages} de um mesmo rascunho/caderno manuscrito.\n\nTIPO DE DOCUMENTO: ${serviceType}\n${schema.length ? `\nSe algum destes campos aparecer NESTA página, extrai também:\n${schemaDesc}\n` : ''}\nINSTRUÇÕES:\n- Transcreve TODO o texto manuscrito visível nesta imagem, exactamente como está escrito, mantendo a ordem das linhas e parágrafos.\n- REGRA ABSOLUTA: transcreve APENAS o que está literalmente escrito. NUNCA acrescentes frases, ideias ou conteúdo que não estejam fisicamente na página, mesmo que o tema pareça familiar (religioso, académico, etc.).\n- Roda mentalmente a imagem se o texto estiver de lado ou invertido — o teu trabalho é ler o conteúdo, independentemente da orientação da fotografia.\n- Se uma palavra ou linha estiver ilegível, escreve [ILEGÍVEL] apenas nesse ponto e continua a transcrever o resto normalmente — não desistas da página inteira por causa de uma palavra difícil.\n- Só usa "[PÁGINA NÃO LEGÍVEL]" como transcrição se a imagem estiver GENUINAMENTE em branco, completamente fora de foco, ou sem nenhum texto visível — não uses isto apenas porque a letra é cursiva ou difícil; faz sempre o teu melhor esforço antes de desistir.\n- Responde APENAS com JSON válido, sem markdown, sem explicações.\n\nFORMATO OBRIGATÓRIO:\n{"fields":{"id_campo":{"value":"valor encontrado","confidence":0.95,"source":"ocr"}},"missing":[],"transcript":"texto completo desta página"}`;

    const gemini = await _callGeminiPage(img, pagePrompt, pageNum);
    if (gemini) return gemini;
    return await _callGroqPage(img, pagePrompt, pageNum);
  }

  async function transcribeAllPagesSeparately() {
    // CORRIGIDO: concorrência reduzida de 3 para 2 e desfasamento maior no
    // arranque de cada "trabalhador" (300ms → 700ms) — reduz ainda mais o
    // pico de pedidos/segundo contra os limites gratuitos do Gemini/Groq,
    // já que agora cada página também pode repetir até 2x sozinha.
    const CONCURRENCY = 2;
    const results = new Array(images.length).fill(null);
    let next = 0;
    async function worker(workerIndex) {
      await _sleep(workerIndex * 700); // desfasamento para suavizar o arranque
      while (next < images.length && _timeLeft() > 4000) {
        const i = next++;
        results[i] = await transcribeSinglePage(images[i], i + 1, images.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, (_, w) => worker(w)));

    // CORRIGIDO: em vez de UMA ronda de recuperação, agora são até DUAS,
    // cada uma com uma pausa maior que a anterior — a maioria das falhas
    // observadas eram picos de limite de taxa (429), não páginas realmente
    // ilegíveis, e uma pausa mais longa dá tempo à janela do limite se
    // libertar. Cada ronda respeita o orçamento de tempo global (_timeLeft)
    // para nunca arriscar ultrapassar o limite da função serverless.
    // NOVO: antes, uma página só era repetida nas rondas de recuperação se
    // `transcribeSinglePage` tivesse FALHADO (lançado erro/devolvido null).
    // Se a chamada tivesse sucesso técnico mas devolvesse um transcript
    // vazio/ilegível (ex.: foto desfocada, modelo desistiu à primeira), o
    // resultado ficava marcado como "concluído" e NUNCA tinha uma 2ª
    // chance — mesmo havendo tempo/orçamento de sobra e a causa mais
    // provável ser variação do modelo gratuito, não a imagem em si.
    // Agora tratamos como "ainda por resolver" tanto os `null` como os
    // resultados sem transcript real, para lhes dar a mesma 2ª e 3ª
    // oportunidade que já existia para os erros de rede/limite de taxa.
    const _isPageDone = (r) => !!(r && r.transcript && r.transcript.trim());

    for (const pauseMs of [1200, 2200]) {
      if (results.every(_isPageDone)) break;
      if (_timeLeft() < 6000) break;
      await _sleep(pauseMs);
      for (let i = 0; i < results.length; i++) {
        if (!_isPageDone(results[i]) && _timeLeft() > 4000) {
          results[i] = await transcribeSinglePage(images[i], i + 1, images.length);
        }
      }
    }

    const mergedFields = {};
    const missingSet = new Set(schema.map(f => f.id));
    const transcriptParts = [];
    let anyRealContent = false;
    results.forEach((r, i) => {
      if (r?.fields) {
        for (const [k, v] of Object.entries(r.fields)) {
          if (v?.value && !mergedFields[k]) { mergedFields[k] = v; missingSet.delete(k); }
        }
      }
      const pageText = (r?.transcript && r.transcript.trim()) ? r.transcript.trim() : '[PÁGINA NÃO LEGÍVEL]';
      if (pageText !== '[PÁGINA NÃO LEGÍVEL]') anyRealContent = true;
      transcriptParts.push(`--- Página ${i + 1} ---\n${pageText}`);
    });
    if (!anyRealContent) return null;
    return { fields: mergedFields, missing: Array.from(missingSet), transcript: transcriptParts.join('\n\n') };
  }

  // Para várias páginas com pedido de transcrição, tenta primeiro o
  // caminho página-a-página (mais fiável); só recorre ao pedido único com
  // todas as imagens juntas (código original abaixo) como último recurso.
  if (isMultiPage && wantsTranscript && (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY)) {
    const merged = await transcribeAllPagesSeparately();
    if (merged) return res.status(200).json({ ...merged, _debug: _ocrDebugLog });
  } else if (isMultiPage && wantsTranscript) {
    _logOcrAttempt('multi-página', 'nem GEMINI_API_KEY nem GROQ_API_KEY configuradas — a saltar directamente para o fallback combinado');
  }

  // ── Tentativas por provider (cada uma devolve o JSON parseado ou null) ──
  async function tryGroq() {
    if (!process.env.GROQ_API_KEY) { _logOcrAttempt('Groq (combinado)', 'sem GROQ_API_KEY configurada'); return null; }
    const visionModels = hasImage
      ? ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview', 'meta-llama/llama-4-maverick-17b-128e-instruct']
      : ['llama-3.3-70b-versatile'];
    for (const model of visionModels) {
      try {
        const content = hasImage
          ? [...images.map(img => ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${img}` } })), { type: 'text', text: userPrompt }]
          : userPrompt;
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.1, messages: [{ role: 'user', content }] }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.error) { _logOcrAttempt(`Groq (combinado, ${model})`, `erro: ${d.error?.message}`); console.warn('[ocr-analyze] Groq model error:', model, d.error?.message); continue; }
          const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
          if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Groq (combinado, ${model})`, 'ok'); return parsed; }
          _logOcrAttempt(`Groq (combinado, ${model})`, 'HTTP 200 mas sem conteúdo útil');
        } else {
          _logOcrAttempt(`Groq (combinado, ${model})`, `HTTP ${r.status}`);
        }
      } catch (e) { _logOcrAttempt(`Groq (combinado, ${model})`, `excepção: ${e.message}`); console.warn('[ocr-analyze] Groq exception:', model, e.message); }
    }
    return null;
  }

  async function tryGemini() {
    if (!process.env.GEMINI_API_KEY) { _logOcrAttempt('Gemini (combinado)', 'sem GEMINI_API_KEY configurada'); return null; }
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']) {
      try {
        const parts = [];
        if (hasImage) images.forEach(img => parts.push({ inline_data: { mime_type: mimeType, data: img } }));
        parts.push({ text: userPrompt });
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 } }) });
        if (r.ok) {
          const d = await r.json();
          const parsed = _safeJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Gemini (combinado, ${model})`, 'ok'); return parsed; }
          _logOcrAttempt(`Gemini (combinado, ${model})`, 'HTTP 200 mas sem conteúdo útil');
        } else {
          _logOcrAttempt(`Gemini (combinado, ${model})`, `HTTP ${r.status}`);
        }
      } catch (e) { _logOcrAttempt(`Gemini (combinado, ${model})`, `excepção: ${e.message}`); console.warn('[ocr-analyze] Gemini exception:', e.message); }
    }
    return null;
  }

  // CORRIGIDO (causa principal do conteúdo inventado/páginas em falta):
  // a ordem anterior tentava sempre Groq primeiro, mesmo para leitura de
  // manuscritos com várias páginas — os modelos de visão gratuitos do Groq
  // (llama-4-scout, llama-3.2-vision) são bons para documentos impressos
  // simples, mas muito menos fiáveis do que o Gemini a interpretar várias
  // imagens de letra manuscrita em simultâneo, tendendo a "compensar" com
  // texto genérico quando não consegue ler bem. Para pedidos com imagem(ns)
  // que precisem de transcrição (manuscritos/"transcricao"), tenta-se agora
  // o Gemini primeiro; para os restantes casos (extracção simples de campos
  // de 1 documento impresso), mantém-se a ordem original (Groq primeiro,
  // que é mais rápido/barato e já funcionava bem para esses casos).
  const preferGeminiFirst = hasImage && wantsTranscript;
  const providers = preferGeminiFirst ? [tryGemini, tryGroq] : [tryGroq, tryGemini];
  for (const tryProvider of providers) {
    const parsed = await tryProvider();
    if (parsed) return res.status(200).json(parsed);
  }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const content = hasImage
        ? [...images.map(img => ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${img}` } })), { type: 'text', text: userPrompt }]
        : userPrompt;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': SITE_URL },
        body: JSON.stringify({ model: hasImage ? 'meta-llama/llama-4-scout' : 'meta-llama/llama-3.3-70b-instruct', max_tokens: maxTokens, temperature: 0.1, messages: [{ role: 'user', content }] }),
      });
      if (r.ok) {
        const d = await r.json();
        const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
        if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt('OpenRouter (combinado)', 'ok'); return res.status(200).json(parsed); }
        _logOcrAttempt('OpenRouter (combinado)', 'HTTP 200 mas sem conteúdo útil');
      } else {
        _logOcrAttempt('OpenRouter (combinado)', `HTTP ${r.status}`);
      }
    } catch (e) { _logOcrAttempt('OpenRouter (combinado)', `excepção: ${e.message}`); console.warn('[ocr-analyze] OpenRouter:', e.message); }
  } else {
    _logOcrAttempt('OpenRouter (combinado)', 'sem OPENROUTER_API_KEY configurada');
  }

  console.error('[ocr-analyze] Todos os providers falharam.', _ocrDebugLog.join(' | '));
  return res.status(200).json({ fields: {}, missing: schema.map(f => f.id), _debug: _ocrDebugLog });
}

function _safeJSON(raw) {
  const cleaned = (raw || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  // CORRIGIDO: com transcrições longas (várias páginas), a resposta do
  // modelo por vezes é cortada mesmo com maxTokens generoso (ex.: o modelo
  // ainda estava a meio da última página quando atingiu o limite), o que
  // deixa o JSON tecnicamente inválido (aspas/chavetas por fechar) — antes
  // isto fazia o parse falhar por completo e perdia-se TUDO, incluindo as
  // páginas anteriores já bem transcritas. Este salvamento tenta recuperar
  // pelo menos o conteúdo de "transcript" já gerado antes do corte, em vez
  // de descartar a resposta inteira.
  const tMatch = cleaned.match(/"transcript"\s*:\s*"/);
  if (tMatch) {
    const start = tMatch.index + tMatch[0].length;
    let text = '', i = start, closed = false;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (ch === '\\' && i + 1 < cleaned.length) { text += cleaned[i + 1]; i += 2; continue; }
      if (ch === '"') { closed = true; break; }
      text += ch; i++;
    }
    if (text.trim()) {
      return { fields: {}, missing: [], transcript: text + (closed ? '' : ' [TEXTO CORTADO — tente com menos páginas de cada vez]') };
    }
  }
  return null;
}

// CORRIGIDO (bug crítico): antes, uma resposta só era aceite como válida se
// `fields` tivesse pelo menos 1 campo preenchido — `if (parsed?.fields &&
// Object.keys(parsed.fields).length > 0)`. Isto DESCARTAVA respostas
// perfeitamente válidas sempre que a IA não encontrava nenhum dos campos do
// formulário (ex.: notas manuscritas sem um "título" claro, para o serviço
// "transcricao"/Digitalizar Documento), MESMO QUE a IA tivesse conseguido
// transcrever todo o texto manuscrito no campo "transcript". O resultado:
// o texto transcrito era deitado fora, o pipeline caía no fallback final
// ({fields:{}, missing:[...]}, sem "transcript"), e o utilizador via
// "Não foi possível extrair dados. Preencha manualmente" mesmo quando a
// leitura do manuscrito tinha, na realidade, funcionado.
//
// Agora uma resposta é considerada válida (e devolvida) se tiver PELO MENOS
// UM dos dois: campos preenchidos OU uma transcrição não-vazia.
function _hasUsefulOcrResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const hasFields     = !!parsed.fields && Object.keys(parsed.fields).length > 0;
  const hasTranscript = typeof parsed.transcript === 'string' && parsed.transcript.trim().length > 0;
  return hasFields || hasTranscript;
}

// ════════════════════════════════════════════════════════════════════════════
// LEGAL-SEARCH — busca semântica de artigos de lei (Fase 2: Motor Jurídico)
// POST /api/legal-search
//
// Substitui as citações estáticas (hard-coded) nos prompts de
// assets/js/services/prompts/{arrendamento,requerimento,residencia,
// procuracao,acta}.js por artigos REAIS recuperados da base vectorial —
// ver docs/legal/VERIFICACAO-LEGAL.md para o histórico de erros que esta
// mudança visa evitar (citações de leis inexistentes, artigos trocados).
//
// O frontend chama isto ANTES de montar o prompt final para
// generate-document.js, e injecta o resultado na secção "BASE LEGAL" —
// ver assets/js/services/LegalContext.js.
// ════════════════════════════════════════════════════════════════════════════

// CORRIGIDO (auditoria, ponto 5): mesmo problema do checkReceiptRateLimit
// — Map local não confiável em ambiente serverless. Ver api/_lib/rateLimit.js.
async function checkLegalSearchRateLimit(ip) {
  // max 20 buscas por IP por minuto — generoso para uso normal
  return checkRateLimit('legal-search', ip, { limit: 20, windowSec: 60 });
}

// Mapeia cada serviço jurídico aos diplomas relevantes — restringir a
// busca evita que, por exemplo, uma procuração receba por engano um
// artigo do Código Penal sobre crimes fiscais só porque a frase tem
// alguma semelhança semântica incidental. Quando um serviço não está
// aqui, a busca corre sobre TODOS os diplomas confirmados.
const DIPLOMAS_POR_SERVICO = {
  arrendamento: ['codigo-civil'],
  procuracao:   ['codigo-civil', 'codigo-notariado', 'estatuto-oam'],
  requerimento: ['lei-proteccao-social', 'lei-orgaos-locais', 'lei-estrangeiros', 'lei-sistema-tributario'],
  residencia:   ['codigo-civil', 'codigo-penal'],
  acta:         ['codigo-civil', 'lei-actividades-comerciais', 'lei-associacoes'],
};

async function handleLegalSearch(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (ip && !await checkLegalSearchRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente dentro de 1 minuto.' });
  }

  const body = parseBody(req);
  const { query = '', serviceType = '' } = body;

  if (!query.trim()) {
    return res.status(400).json({ error: 'query é obrigatório (descrição do que se procura, ex: "procuração para venda de imóvel").' });
  }
  if (query.length > 500) {
    return res.status(400).json({ error: 'query demasiado longa (máx. 500 caracteres).' });
  }

  const diplomaSlugs = DIPLOMAS_POR_SERVICO[serviceType] || null;

  try {
    const { resultados, avisoQualidade } = await buscarArtigosRelevantes(query, { diplomaSlugs });
    return res.status(200).json({ resultados, avisoQualidade, encontrado: resultados.length > 0 });
  } catch (err) {
    console.error('[legal-search] erro:', err.message);
    // Falhar de forma graciosa: o frontend trata "encontrado: false" como
    // "sem base legal recuperada" e cai no texto genérico de fallback
    // (ver LegalContext.js) — nunca bloqueia a geração do documento por
    // a busca jurídica ter falhado.
    return res.status(200).json({ resultados: [], avisoQualidade: false, encontrado: false, erro: 'busca_indisponivel' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOG-CRON — publica a fila de agendamento e, se activado, gera um novo
// artigo por IA quando chega a hora (auditoria de conteúdo, v27).
// Chamado diariamente pelo cron nativo do Vercel (vercel.json) em
// GET /api/misc?action=blog-cron, com o cabeçalho Authorization: Bearer
// $CRON_SECRET (Vercel injecta isto automaticamente quando CRON_SECRET
// está definido nas env vars). Também aceita POST com o cabeçalho
// x-cron-secret, para permitir accionar manualmente ou via um serviço
// externo (ex: cron-job.org), tal como o padrão já usado em
// cleanup-temp-accounts.js.
// ════════════════════════════════════════════════════════════════════════════

function _blogSlugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function _blogExtractHTML(text) {
  return String(text || '')
    .replace(/```html/gi, '').replace(/```/g, '')
    .trim();
}

// Similaridade simples por sobreposição de palavras (Jaccard) — suficiente
// para apanhar títulos praticamente repetidos sem precisar de embeddings.
function _titleSimilarity(a, b) {
  const norm = s => new Set(
    String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length > 3)
  );
  const setA = norm(a), setB = norm(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  return inter / new Set([...setA, ...setB]).size;
}

function _isTooSimilar(candidateTitle, existingTitles, threshold = 0.55) {
  return existingTitles.some(t => _titleSimilarity(candidateTitle, t) >= threshold);
}

async function _callAiText(prompt, { maxTokens = 3000, temperature = 0.5 } = {}) {
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content;
      if (text?.length > 50) return { text, provider: 'groq' };
    } catch (e) { console.warn('[blog-cron] Groq falhou:', e.message); }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text?.length > 50) return { text, provider: 'gemini' };
    } catch (e) { console.warn('[blog-cron] Gemini falhou:', e.message); }
  }
  return null;
}

// Publica o HTML estático no GitHub — mesma lógica de
// api/admin/index.js::_generateStaticPage, duplicada aqui porque as duas
// funções vivem em ficheiros/serverless functions diferentes (limite de
// 12 funções do plano Hobby da Vercel não permite extrair para um módulo
// importado sem cuidado de bundling — mantemos a duplicação pequena e
// explícita, tal como já acontecia com outros helpers deste projecto).
const { publishBlogPageToGithub } = require('./_lib/blogTemplate');

async function _publishBlogStaticFile(slug, title, metaDescription, contentHtml, SITE_URL) {
  await publishBlogPageToGithub({ slug, title, metaDescription, contentHtml, SITE_URL });
}

async function _generateAndPublishArticle({ title, keywords, existingTitles, transactionNote }) {
  const avoidBlock = existingTitles.length
    ? `\n\nJÁ EXISTEM estes artigos no blog — o teu deve cobrir um ângulo/subtema DIFERENTE, sem repetir conteúdo:\n${existingTitles.slice(0, 80).map(t => `- ${t}`).join('\n')}`
    : '';

  const prompt = `És um especialista em SEO e redacção de conteúdo para o mercado moçambicano.\n\nEscreve um artigo de blog completo sobre: "${title}"\nPalavras-chave a incluir naturalmente: ${keywords || 'documentos, Moçambique'}\nTom: informativo\nExtensão aproximada: 700 palavras${avoidBlock}\n\nREGRAS OBRIGATÓRIAS:\n- Escreve em português europeu (não brasileiro)\n- Conteúdo específico para Moçambique (exemplos locais, instituições moçambicanas, M-Pesa, etc.)\n- Inclui H2 e H3, e uma secção FAQ com 3-4 perguntas no final\n- Menciona que o MzDocs Pro pode ajudar a criar estes documentos rapidamente com IA\n- NÃO incluis <html>, <head>, <body> ou <!DOCTYPE> — apenas conteúdo do artigo\n- Devolve APENAS HTML válido: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>\n- Não uses Markdown, apenas HTML puro\n\nComeça directamente com o conteúdo HTML, sem preâmbulo.`;

  const result = await _callAiText(prompt, { maxTokens: 3000, temperature: 0.5 });
  if (!result) throw new Error('Nenhum provider de IA disponível para gerar o artigo.');

  const html = _blogExtractHTML(result.text);
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const metaDescription = plainText.slice(0, 155).trim() + (plainText.length > 155 ? '…' : '');
  let slug = _blogSlugify(title);

  // Garantir slug único (sufixo -2, -3... se já existir)
  let suffix = 1;
  let finalSlug = slug;
  while (true) {
    const existing = await restRequest(`blog_pages?slug=eq.${finalSlug}&select=id&limit=1`);
    if (!Array.isArray(existing) || existing.length === 0) break;
    suffix++; finalSlug = `${slug}-${suffix}`;
    if (suffix > 20) { finalSlug = `${slug}-${Date.now()}`; break; }
  }

  const nowIso = new Date().toISOString();
  const inserted = await insert('blog_pages', {
    slug: finalSlug, title, meta_description: metaDescription, content_html: html,
    published: true, ai_generated: true, published_at: nowIso, updated_at: nowIso,
    topic_keywords: keywords || null,
  });
  const newPage = Array.isArray(inserted) ? inserted[0] : inserted;

  const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';
  await _publishBlogStaticFile(finalSlug, title, metaDescription, html, SITE_URL)
    .catch(e => {
      console.warn('[blog-cron] publicação estática falhou:', e.message, transactionNote || '');
      // NOVO (Fase 5): o artigo já ficou gravado em blog_pages (published:true
      // acima), mas se o ficheiro estático no GitHub falhar, o sitemap/URL
      // real pode não existir — o admin precisa de saber para investigar
      // (normalmente token do GitHub expirado ou rate-limit).
      insert('admin_notifications', {
        type:    'blog_publish_failed',
        title:   '⚠️ Falha ao publicar artigo no GitHub',
        message: `"${title}" (slug: ${finalSlug}) foi gravado na base de dados mas a publicação estática falhou: ${e.message}`,
        link:    '#blog',
      }).catch(() => {});
    });

  return { slug: finalSlug, title, id: newPage?.id, provider: result.provider };
}

// ════════════════════════════════════════════════════════════════════════════
// GITHUB-DIAGNOSTIC — testa as credenciais do GitHub server-side, sem nunca
// expor o valor do token. Usa-se uma vez para diagnosticar o problema do
// "publicação estática falhou" e depois pode remover-se.
// GET/POST /api/misc?action=github-diagnostic  (mesmo header que blog-cron)
// ════════════════════════════════════════════════════════════════════════════
async function handleGithubDiagnostic(req, res) {
  const bearerSecret = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const customSecret  = req.headers['x-vercel-cron-secret'] || req.headers['x-cron-secret'] || '';
  const providedSecret = bearerSecret || customSecret;
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  const report = {
    envVarsPresentes: { GITHUB_OWNER: !!owner, GITHUB_REPO: !!repo, GITHUB_TOKEN: !!token },
    ownerUsado: owner || null,
    repoUsado: repo || null,
  };

  if (!owner || !repo || !token) {
    report.conclusao = 'Falta pelo menos uma env var — vê envVarsPresentes acima.';
    return res.status(200).json(report);
  }

  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    const body = await r.json().catch(() => ({}));
    report.status = r.status;

    if (r.status === 401) {
      report.conclusao = 'Token inválido ou expirado (Bad credentials). Gera um novo Personal Access Token no GitHub.';
    } else if (r.status === 404) {
      report.conclusao = `Repositório "${owner}/${repo}" não encontrado com este token — confirma se GITHUB_OWNER/GITHUB_REPO estão certos, ou se é um fine-grained token sem acesso a este repo.`;
    } else if (r.status === 200) {
      const podeEscrever = body?.permissions?.push === true;
      report.repoEncontrado = true;
      report.permissoes = body?.permissions || null;
      report.conclusao = podeEscrever
        ? 'Tudo certo: o token acede ao repositório e TEM permissão de escrita (push). O problema deve estar noutro sítio — verifica os logs do próximo blog-cron.'
        : 'O token acede ao repositório mas NÃO tem permissão de escrita. Se for um PAT clássico, falta o scope "repo". Se for fine-grained, falta "Contents: Read and write".';
    } else {
      report.corpo = JSON.stringify(body).slice(0, 500);
      report.conclusao = `Resposta inesperada do GitHub (${r.status}) — vê o corpo acima.`;
    }
    return res.status(200).json(report);
  } catch (e) {
    report.erro = e.message;
    report.conclusao = 'Excepção de rede ao contactar a API do GitHub.';
    return res.status(200).json(report);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOG-LIST — endpoint público (sem autenticação) que lista artigos do blog
// já publicados, mais recentes primeiro, com pesquisa opcional por título
// ou descrição. Usado pela página /blog para listar e pesquisar artigos.
// GET /api/misc?action=blog-list&q=termo&limit=60&offset=0
// ════════════════════════════════════════════════════════════════════════════
async function handleBlogList(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const q      = (req.query.q || '').toString().trim();
    const limit  = Math.min(parseInt(req.query.limit, 10)  || 60, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Mais recente primeiro: published_at (com nulls por último, para
    // artigos antigos que possam não ter esse campo preenchido), e
    // updated_at como critério de desempate/fallback.
    let path = `blog_pages?published=eq.true&select=slug,title,meta_description,published_at,updated_at,views`
             // NOTA: não usar "updated_at" como critério de desempate — a
             // tabela tem um trigger que actualiza updated_at em QUALQUER
             // alteração da linha, incluindo o simples incremento de
             // visitas (views = views + 1). Um artigo antigo muito visto
             // ficaria sempre a parecer "recente". published_at é o único
             // campo que reflecte o momento real da publicação.
             + `&order=published_at.desc.nullslast&limit=${limit}&offset=${offset}`;

    if (q) {
      // Remove caracteres que têm significado especial na sintaxe do
      // PostgREST (vírgulas, parêntesis, %) para evitar quebrar a query.
      const safe = q.replace(/[%,()]/g, ' ').trim();
      if (safe) {
        const pattern = encodeURIComponent(`*${safe}*`);
        path += `&or=(title.ilike.${pattern},meta_description.ilike.${pattern})`;
      }
    }

    const rows = await restRequest(path);
    const posts = (Array.isArray(rows) ? rows : []).map(p => ({
      slug: p.slug,
      title: p.title,
      description: p.meta_description || '',
      date: p.published_at || p.updated_at,
      views: p.views || 0,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ posts, count: posts.length });
  } catch (e) {
    console.error('[blog-list] erro:', e.message);
    return res.status(500).json({ error: 'Erro ao carregar artigos do blog.' });
  }
}

async function handleBlogCron(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Autenticação do cron: aceita tanto o header nativo que a Vercel injecta
  // (Authorization: Bearer $CRON_SECRET) como um header custom, para
  // permitir também accionar via serviço externo — mesmo padrão de
  // api/cleanup-temp-accounts.js.
  const bearerSecret = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const customSecret  = req.headers['x-vercel-cron-secret'] || req.headers['x-cron-secret'] || '';
  const providedSecret = bearerSecret || customSecret;
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const results = { published: [], failed: [], autogen: null };

  try {
    // 1. Processar a fila (títulos manuais/IA já agendados e vencidos).
    //    Limitado a 2 por execução para não estourar o timeout da função.
    const nowIso = new Date().toISOString();
    const due = await restRequest(
      `blog_schedule_queue?status=eq.pending&scheduled_at=lte.${encodeURIComponent(nowIso)}&order=scheduled_at.asc&limit=2`
    );

    if (Array.isArray(due) && due.length) {
      const existingPages = await restRequest('blog_pages?select=title');
      const existingTitles = (existingPages || []).map(p => p.title);

      for (const item of due) {
        try {
          const article = await _generateAndPublishArticle({
            title: item.title, keywords: item.keywords, existingTitles,
            transactionNote: `fila:${item.id}`,
          });
          existingTitles.push(item.title);
          await restRequest(`blog_schedule_queue?id=eq.${item.id}`, {
            method: 'PATCH', body: { status: 'published', blog_page_id: article.id }, prefer: 'return=minimal',
          });
          results.published.push({ id: item.id, title: item.title, slug: article.slug });
        } catch (itemErr) {
          console.error('[blog-cron] falha ao publicar item da fila:', item.id, itemErr.message);
          await restRequest(`blog_schedule_queue?id=eq.${item.id}`, {
            method: 'PATCH', body: { status: 'failed', error_note: itemErr.message }, prefer: 'return=minimal',
          }).catch(() => {});
          results.failed.push({ id: item.id, title: item.title, error: itemErr.message });
        }
      }
    }

    // 2. Geração automática por IA (se activada) — só corre se NENHUM item
    //    manual foi processado agora, para manter o ritmo previsível e não
    //    duplicar o "orçamento" de chamadas de IA da mesma execução.
    if (results.published.length === 0) {
      const settingsRows = await restRequest(
        `system_settings?key=in.(blog_autogen_enabled,blog_autogen_interval_days,blog_autogen_last_run,blog_monthly_limit)&select=key,value`
      );
      const settings = {};
      (settingsRows || []).forEach(r => { settings[r.key] = r.value; });

      const enabled      = settings.blog_autogen_enabled === 'true';
      const intervalDays = parseInt(settings.blog_autogen_interval_days, 10) || 7;
      const monthlyLimit = Math.max(1, parseInt(settings.blog_monthly_limit, 10) || 12);
      const lastRun       = settings.blog_autogen_last_run ? new Date(settings.blog_autogen_last_run) : null;
      const dueForAutogen = !lastRun || (Date.now() - lastRun.getTime()) >= intervalDays * 86400000;

      // Conta o que já está publicado ou agendado para o mês corrente, para
      // nunca deixar a geração automática ultrapassar o tecto mensal
      // (blog_monthly_limit) — o mesmo tecto que se aplica ao agendamento
      // manual em massa, para manter um ritmo de publicação que o Google
      // não veja como conteúdo em massa gerado por IA.
      const now        = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const [publishedThisMonth, pendingThisMonth] = await Promise.all([
        restRequest(`blog_pages?published_at=gte.${encodeURIComponent(monthStart)}&published_at=lt.${encodeURIComponent(monthEnd)}&select=id`),
        restRequest(`blog_schedule_queue?status=eq.pending&scheduled_at=gte.${encodeURIComponent(monthStart)}&scheduled_at=lt.${encodeURIComponent(monthEnd)}&select=id`),
      ]);
      const monthTotal = (publishedThisMonth?.length || 0) + (pendingThisMonth?.length || 0);
      const monthlyLimitReached = monthTotal >= monthlyLimit;

      if (monthlyLimitReached) {
        results.autogen = { skipped: 'monthly_limit_reached', monthTotal, monthlyLimit };
      } else if (enabled && dueForAutogen) {
        const existingPages = await restRequest('blog_pages?select=title');
        const pendingQueue  = await restRequest('blog_schedule_queue?status=eq.pending&select=title');
        const existingTitles = [
          ...(existingPages || []).map(p => p.title),
          ...(pendingQueue  || []).map(p => p.title),
        ];

        try {
          // Pedir à IA um título+subtema novo, derivado dos serviços do
          // MzDocs Pro mas ainda não coberto pelos artigos existentes.
          const ideaPrompt = `Sugere UM título de artigo de blog sobre documentos/burocracia em Moçambique (CVs, contratos, cartas, declarações, procurações, etc.), pensado para SEO.\n\nNÃO podes repetir nem parafrasear de perto nenhum destes títulos já publicados ou já agendados:\n${existingTitles.slice(0, 100).map(t => `- ${t}`).join('\n') || '(nenhum ainda)'}\n\nPode ser um subtema/ângulo derivado de um dos temas já existentes (ex: uma variante para outra profissão, outra província, outro tipo de documento relacionado), desde que seja claramente distinto.\n\nResponde APENAS em JSON válido, sem markdown: {"title":"...","keywords":"palavra1, palavra2, palavra3"}`;

          const ideaResult = await _callAiText(ideaPrompt, { maxTokens: 200, temperature: 0.8 });
          if (!ideaResult) throw new Error('IA indisponível para sugerir título.');

          let idea;
          try {
            const jsonMatch = ideaResult.text.match(/\{[\s\S]*\}/);
            idea = JSON.parse(jsonMatch ? jsonMatch[0] : ideaResult.text);
          } catch (_) {
            throw new Error('Resposta da IA não é JSON válido para o título sugerido.');
          }

          if (!idea?.title || _isTooSimilar(idea.title, existingTitles)) {
            throw new Error('Título sugerido pela IA repete conteúdo já existente — a saltar esta execução.');
          }

          const article = await _generateAndPublishArticle({
            title: idea.title, keywords: idea.keywords, existingTitles,
            transactionNote: 'autogen',
          });

          await restRequest('system_settings?key=eq.blog_autogen_last_run', {
            method: 'PATCH', body: { value: new Date().toISOString() }, prefer: 'return=minimal',
          });

          results.autogen = { title: idea.title, slug: article.slug };
        } catch (autoErr) {
          console.error('[blog-cron] geração automática falhou:', autoErr.message);
          results.autogen = { error: autoErr.message };
        }
      }
    }

    console.log('[blog-cron] concluído:', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('[blog-cron] erro geral:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT-USAGE (v40) — limites de downloads/edições por documento
// Antes vivia em api/document-usage.js; dobrado aqui para o projecto se
// manter dentro das 12 Serverless Functions do plano Vercel Hobby (ver
// vercel.json → rewrite "/api/document-usage" → "/api/misc", que faz o
// endpoint continuar acessível no mesmo URL de sempre, sem o front-end
// precisar de nenhuma alteração).
//
// GET  /api/document-usage?document_id=X
//   → estado actual (downloads/edições usados e limite, plano do documento)
// POST /api/document-usage  { action, document_id, kind? }
//   action = 'consume-download' | 'consume-edit' | 'unlock-extra'
//   kind   = 'download' | 'edit'   (só para 'unlock-extra')
//
// A lógica real (limites, contadores, protecção contra alteração directa
// pelo cliente) vive nas funções SECURITY DEFINER da base de dados — ver
// supabase/migration_v40_document_usage_limits.sql. Isto é só a camada
// HTTP fina por cima delas.
// ════════════════════════════════════════════════════════════════════════════
async function handleDocumentUsage(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória.', code: 'AUTH_REQUIRED' });

  let userId;
  try {
    const { user, error } = await getUserFromToken(token);
    if (error || !user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Erro ao verificar sessão: ' + e.message });
  }

  try {
    if (req.method === 'GET') {
      const documentId = req.query?.document_id;
      if (!documentId) return res.status(400).json({ error: 'document_id em falta' });

      const doc = await selectOne(
        'documents', 'id', documentId,
        'id,user_id,downloads_used,downloads_limit,edits_used,edits_limit,plan_tier_at_creation'
      );
      if (!doc || doc.user_id !== userId) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }

      return res.status(200).json({ success: true, usage: _formatDocUsage(doc) });
    }

    if (req.method === 'POST') {
      const body = parseBody(req) || {};
      const { action, document_id: documentId, kind } = body;
      if (!documentId) return res.status(400).json({ error: 'document_id em falta' });

      if (action === 'consume-download') {
        const result = await rpc('consume_document_download', { p_document_id: documentId, p_user_id: userId });
        if (!result?.success) return res.status(404).json({ error: result?.error || 'Documento não encontrado' });
        return res.status(200).json({ success: true, ...result });
      }

      if (action === 'consume-edit') {
        const result = await rpc('consume_document_edit', { p_document_id: documentId, p_user_id: userId });
        if (!result?.success) return res.status(404).json({ error: result?.error || 'Documento não encontrado' });
        return res.status(200).json({ success: true, ...result });
      }

      if (action === 'unlock-extra') {
        if (!['download', 'edit'].includes(kind)) {
          return res.status(400).json({ error: 'kind deve ser "download" ou "edit"' });
        }
        const result = await rpc('unlock_document_extra', { p_document_id: documentId, p_user_id: userId, p_kind: kind });
        if (!result?.success) {
          const insufficient = result?.error === 'Créditos insuficientes';
          return res.status(insufficient ? 402 : 404)
            .json({ error: result?.error || 'Erro ao desbloquear', code: insufficient ? 'INSUFFICIENT_CREDITS' : undefined });
        }
        return res.status(200).json({ success: true, ...result });
      }

      return res.status(400).json({ error: 'action desconhecida (consume-download, consume-edit, unlock-extra)' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[document-usage]', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

function _formatDocUsage(doc) {
  const unlimitedDownloads = doc.downloads_limit === null;
  const unlimitedEdits     = doc.edits_limit === null;
  return {
    plan_tier:            doc.plan_tier_at_creation || 'free',
    downloads_used:       doc.downloads_used || 0,
    downloads_limit:      doc.downloads_limit,
    downloads_remaining:  unlimitedDownloads ? null : Math.max(0, doc.downloads_limit - (doc.downloads_used || 0)),
    downloads_unlimited:  unlimitedDownloads,
    edits_used:           doc.edits_used || 0,
    edits_limit:           doc.edits_limit,
    edits_remaining:       unlimitedEdits ? null : Math.max(0, doc.edits_limit - (doc.edits_used || 0)),
    edits_unlimited:       unlimitedEdits,
  };
}
