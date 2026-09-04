// api/_services/payments.js — VERIFY-RECEIPT (extraído de api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Refactor de estrutura (Ago/2026): este ficheiro contém integralmente a
// lógica que antes vivia dentro do monólito api/misc.js (~3.200 linhas) —
// verificação automática de comprovativos M-Pesa/e-Mola/mKesh por IA visão,
// criação automática de conta "avulso", e o helper verifyReceiptInternal()
// consumido directamente por api/process-payment.js.
//
// NENHUMA LÓGICA DE NEGÓCIO FOI ALTERADA nesta extracção — é um "move" puro
// de código, não uma reescrita. Os comentários de auditoria originais
// (P0-01, P0/P1-02, etc.) foram preservados tal como estavam no ficheiro-mãe.
//
// api/misc.js continua a ser o ÚNICO entrypoint HTTP desta funcionalidade
// (rota /api/misc?action=verify-receipt) — apenas faz require() deste
// módulo e delega. Isto mantém o projecto dentro do limite de 12 Serverless
// Functions do plano Vercel Hobby (ver vercel.json) enquanto reduz o
// ficheiro monolítico a um router fino.
// ──────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { analyzeImage, parseJSON: parseVisionJSON } = require('../_lib/visionAI');
const { notifyPaymentNeedsReview } = require('../_lib/notifyTelegram');
const {
  restRequest,
  rpc,
  insert,
  update,
  adminCreateUser,
} = require('../_lib/supabaseAdmin');
const { ORIGIN, parseBody } = require('../_lib/httpHelpers');
const { logEvent } = require('../_lib/observability');

const { checkRateLimit } = require('../_lib/rateLimit');

async function checkReceiptRateLimit(ip) {
  // max 3 uploads por IP por minuto
  return checkRateLimit('receipt', ip, { limit: 3, windowSec: 60 });
}

// ── P0.2 (Master Audit, Set/2026): validação do DESTINATÁRIO do comprovativo ──
// CORRIGIDO: a verificação automática validava valor + data + status, mas
// nunca confirmava que o dinheiro do comprovativo tinha ido PARA a conta do
// MzDocs — só que o valor "batia certo". Um comprovativo real de outra
// transferência (para outra pessoa, com o mesmo valor de um pacote) passava
// nos restantes checks e era auto-aprovado. Esta função normaliza qualquer
// formato de número moçambicano (com/sem +258, com/sem espaços) para 9
// dígitos, o mesmo formato usado em todo o resto do projecto (ver
// normalizePhone em api/process-payment.js).
function normalizePhone(raw) {
  let num = String(raw || '').replace(/\D/g, '');
  if (num.startsWith('258')) num = num.slice(3);
  return num;
}

// Número(s) que recebem os pagamentos do MzDocs Pro. Configurável por env
// var (MZDOCS_RECEIVING_PHONES, separados por vírgula) para o dia em que
// existir mais do que uma carteira — por omissão, o número único já usado
// em todo o checkout/WhatsApp do projecto.
const MZDOCS_RECEIVING_PHONES = String(
  process.env.MZDOCS_RECEIVING_PHONES || process.env.WA_SUPPORT_NUMBER || '258858695506'
)
  .split(',')
  .map(normalizePhone)
  .filter(Boolean);

// Preços/créditos dos pacotes: única fonte de verdade em _lib/packages.js
// (ver esse ficheiro para o porquê — corrige duplicação em 5 locais e o
// bug de a verificação automática de comprovativos nunca reflectir
// alterações de preço feitas no painel de admin).
// packageTotalCredits() inclui o bónus escada (NOVO — monetização): sem
// isto, esta via de confirmação (verificação por IA de imagem) creditava
// apenas pkg.credits "nu", ignorando o bónus já prometido ao cliente no
// checkout/mensagem de WhatsApp (ver api/process-payment.js) — o valor
// gravado na transacção ficava certo, mas o crédito realmente atribuído
// ficava a menos.
const { loadPackagesFromSettings, packageTotalCredits } = require('../_lib/packages');

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
  `"recipient_phone" é MUITO IMPORTANTE: o número de telefone ou conta PARA QUEM o dinheiro foi enviado (o destinatário/beneficiário da transferência, normalmente indicado como "Para", "Recebido por", "Beneficiário" ou similar) — NUNCA o número de quem enviou o dinheiro. Extrai só os dígitos, sem espaços. Se não conseguires identificar com confiança o destinatário, devolve "recipient_phone":"". ` +
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
    // CORRIGIDO (P19 — Master Hardening, Set/2026): esta chamada escrevia
    // `credits` directamente aqui E os dois chamadores (verifyReceiptInternal
    // acima e smsConfirm.js) chamavam DEPOIS `add_credits(tempUserId,
    // credits)` — que é ADITIVO (`credits = credits + amount`, ver
    // migration_v52_credit_ledger.sql). Resultado real, confirmado por
    // leitura do código: uma compra avulso de X créditos, aprovada
    // automaticamente (IA de visão ou SMS), creditava 2X. Pior ainda: o
    // trigger on_auth_user_created (schema.sql) já insere a conta nova com
    // `credits = 3` por omissão (créditos grátis de boas-vindas, legado,
    // anterior à v66) ANTES desta função correr — por isso o valor tem de
    // ser explicitamente ZERADO aqui, e não apenas omitido, para que a
    // única fonte de verdade do saldo final seja o `add_credits()` que os
    // chamadores já fazem a seguir (que também grava correctamente em
    // credit_ledger — o que esta função nunca fez, ficando o ledger sempre
    // incompleto para contas avulso).
    credits:       0,
    // CORRIGIDO (auditoria segurança Julho 2026): já não se grava a password
    // em texto limpo em profiles.temp_password — era um risco real (qualquer
    // fuga da base de dados, ou de um admin comprometido, expunha passwords
    // de utilizadores em claro, ao contrário das passwords normais, que o
    // Supabase Auth já guarda em hash). A password ainda é devolvida UMA VEZ
    // na resposta desta chamada (accountInfo.tempPass, mais abaixo) para
    // mostrar ao cliente imediatamente — só deixa de ficar guardada para sempre.
    // Para gerar uma nova mais tarde (ex: cliente perdeu o acesso), o admin
    // usa a acção 'regenerate-temp-password' em api/admin/index.js.
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
      logEvent('payment', 'duplicate_receipt', { transactionId, packageId });
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

  // 4e. Destinatário é mesmo o MzDocs (CORRIGIDO — P0.2, Master Audit Set/2026).
  // Sem isto, um comprovativo válido de OUTRA transferência (mesmo valor,
  // pessoa diferente) passava em todos os outros checks. Se a IA não
  // conseguir identificar o destinatário com confiança, o número extraído
  // fica curto/vazio e o check falha por omissão — nunca aprovamos "às
  // cegas" (ver Nível 3 da recomendação da auditoria: elemento ilegível ⇒
  // revisão manual, nunca AUTO_APPROVE).
  const aiRecipientNorm = normalizePhone(aiResult.recipient_phone);
  const recipientOk     = aiRecipientNorm.length >= 9 && MZDOCS_RECEIVING_PHONES.includes(aiRecipientNorm);

  const allChecksPass = !alreadyConfirmed && dateOk && amountOk && statusOk && recipientOk;

  // ── 5. Decisão: aprovação automática ou revisão manual ─────────────────
  if (confidence >= 0.85 && allChecksPass) {
    // ── APROVAÇÃO AUTOMÁTICA ───────────────────────────────────────────
    // CORRIGIDO (auditoria — P0/P1-02, Ago/2026): "confirmar transacção" e
    // "creditar utilizador" costumavam ser duas chamadas REST separadas
    // (PATCH + rpc('add_credits')), protegidas apenas por checagens
    // aplicativas (status=eq.pending no filtro, depois um SELECT a
    // credit_logs para não creditar 2x). Isso funcionava na prática, mas
    // deixava uma janela real: se o processo morresse ou a rede falhasse
    // ENTRE os dois passos, a transacção ficava 'completed' sem crédito
    // nenhum atribuído. Ver migration_v57_atomic_payment_confirmation.sql
    // — confirm_payment_and_credit() faz os dois passos DENTRO da mesma
    // transacção Postgres (atómico de verdade, não apenas idempotente).
    //
    // O caminho "avulso sem conta ainda" continua fora desta RPC porque
    // criar o utilizador exige uma chamada à API de Admin do Supabase Auth
    // (HTTP externo, não pode viver dentro de uma transacção SQL) — mas
    // usa a MESMA verificação de idempotência (credit_logs) para nunca
    // criar/creditar duas vezes.
    const credits = pkg ? packageTotalCredits(pkg) : 0;
    let rpcResult;
    try {
      rpcResult = await rpc('confirm_payment_and_credit', {
        p_transaction_id:    transactionId,
        p_receipt_hash:      receiptHash,
        p_receipt_ref:       aiRef || null,
        p_confidence:        confidence,
        p_credits:           userId ? credits : 0, // avulso sem conta: RPC só confirma, não credita
        p_user_id:           userId || null,
        p_verification_note: `Pagamento auto-verificado — pacote ${packageId}`,
      });
    } catch (rpcErr) {
      console.error('[verify-receipt] Erro ao chamar confirm_payment_and_credit:', rpcErr.message);
      logEvent('payment', 'credit_failed', { transactionId, userId, packageId, error: rpcErr.message });
      await _markReviewNeeded(transactionId, receiptHash, confidence, 'Erro ao confirmar (RPC): ' + rpcErr.message);
      return {
        success:      true,
        verified:     false,
        autoApproved: false,
        nextStep:     'awaiting_review',
        message:      'Pagamento validado mas ocorreu um erro técnico. A equipa irá confirmar em 15 min.',
      };
    }

    if (rpcResult && rpcResult.already_confirmed) {
      console.warn('[verify-receipt] Transação já confirmada por outra chamada concorrente:', transactionId);
      return {
        success:      true,
        verified:     true,
        autoApproved: false,
        nextStep:     'already_confirmed',
        message:      'Este pagamento já tinha sido confirmado.',
      };
    }

    let accountInfo  = null;
    let creditedUser = userId || null;

    if (!userId && packageId === 'avulso' && credits > 0) {
      // Compra avulso sem sessão — a transacção já está 'completed' (feito
      // pela RPC acima); falta criar a conta temporária e creditá-la.
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

        await rpc('add_credits', { user_id: accountInfo.tempUserId, amount: credits }).catch(e =>
          console.error('[verify-receipt] add_credits para conta avulso falhou:', e.message));

        console.log('[verify-receipt] Conta avulso criada automaticamente:', accountInfo.tempEmail, 'para transacção', transactionId);
      } catch (accErr) {
        // Pagamento já está confirmado (status completed) — não reverter.
        // Marcar a transacção para follow-up manual do admin, para não
        // perder o cliente que já pagou mas cuja conta falhou ao criar.
        console.error('[verify-receipt] Falha ao criar conta avulso automática:', accErr.message);
        logEvent('payment', 'credit_failed', { transactionId, packageId, reason: 'avulso_account_creation_failed', error: accErr.message });
        await restRequest(`transactions?id=eq.${transactionId}`, {
          method: 'PATCH',
          body:   { review_reason: 'FALHA_CRIACAO_CONTA_AVULSO: ' + accErr.message },
          prefer: 'return=minimal',
        }).catch(() => {});
      }
    }

    // CORRIGIDO (auditoria de pagamentos, v3.2): a comissão de afiliado só
    // era processada em handleConfirmPayment (confirmação MANUAL do
    // admin) — a aprovação automática por IA, que é hoje o caminho
    // principal de qualquer pagamento (avulso ou com conta), nunca
    // chamava process_affiliate_commission. Chamado aqui (fire-and-forget,
    // não bloqueia a resposta ao cliente).
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
    // dashboard de marketing. Sem visitor_id o evento simplesmente não é
    // gravado; nunca inventamos uma origem.
    if (creditedUser && rpcResult?.visitor_id) {
      insert('marketing_events', {
        visitor_id:    rpcResult.visitor_id,
        user_id:       creditedUser,
        event:         'credit_purchase',
        document_type: null,
        value:         amount,
        metadata:      { package_id: packageId, credits, verification_method: 'auto' },
      }).catch(e => console.warn('[verify-receipt] marketing_events insert:', e.message));
    }

    console.log('[verify-receipt] AUTO-APROVADO:', transactionId, 'créditos:', credits);
    logEvent('payment', 'auto_approved', { transactionId, userId: creditedUser, packageId, credits, confidence });
    if (creditedUser) logEvent('payment', 'credited', { transactionId, userId: creditedUser, credits });

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

  } else {
    // ── REVISÃO MANUAL ─────────────────────────────────────────────────
    const reason = !allChecksPass
      ? [
          alreadyConfirmed ? 'referência já usada' : null,
          !dateOk          ? 'data fora do intervalo' : null,
          !amountOk        ? `valor incorreto (esperado ${pkg?.price} MZN, detectado ${aiAmount})` : null,
          !statusOk        ? `status inválido (${aiStatus})` : null,
          !recipientOk     ? 'destinatário não confirmado (número ilegível ou diferente da conta do MzDocs)' : null,
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
    logEvent('payment', 'review_needed', { transactionId, confidence, reason });

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
  let tx;
  try {
    const rows = await restRequest(
      `transactions?id=eq.${transactionId}&status=in.(pending,review_needed)&select=id,package_id,amount,user_id&limit=1`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Transacção não encontrada ou já processada.' });
    }
    tx = rows[0];
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao verificar transacção.' });
  }

  // CORRIGIDO (auditoria segurança — P0-01, Ago/2026): package_id, user_id e
  // amount deixam de vir do corpo do pedido (body) para decidir quantos
  // créditos atribuir e a quem. Antes disto, o servidor confirmava apenas
  // que o transactionId existia e estava pending, mas depois usava os
  // valores de packageId/userId/amount tal como enviados pelo cliente —
  // um atacante podia reaproveitar um transactionId válido (de uma compra
  // já criada, ex.: pacote "avulso") e declarar no pedido um packageId mais
  // caro (ex.: "empresa") ou um userId diferente do dono real da compra.
  // Se o comprovativo fosse aprovado automaticamente pela IA, o sistema
  // creditava a conta errada ou creditava mais do que o pago. Agora a
  // linha `tx` lida da base de dados é a única fonte de verdade — os
  // campos packageId/userId/amount do body só servem de log/depuração e
  // nunca chegam a verifyReceiptInternal.
  if (packageId && tx.package_id && String(packageId) !== String(tx.package_id)) {
    console.warn('[verify-receipt] packageId do pedido não corresponde à transacção — ignorado, a usar o da BD.',
      { transactionId, requested: packageId, actual: tx.package_id });
  }
  if (userId && tx.user_id && String(userId) !== String(tx.user_id)) {
    console.warn('[verify-receipt] userId do pedido não corresponde à transacção — ignorado, a usar o da BD.',
      { transactionId, requested: userId, actual: tx.user_id });
  }

  try {
    const trustedPackageId = tx.package_id;
    const trustedUserId    = tx.user_id || null;
    const fallbackPackages = await loadPackagesFromSettings();
    const result = await verifyReceiptInternal({
      imageBase64, mimeType, reference, phone,
      amount: Number(tx.amount) || (fallbackPackages[trustedPackageId]?.price || 0),
      wallet: wallet || 'móvel',
      userId:        trustedUserId,
      transactionId,
      packageId:     trustedPackageId,
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
// e, agora, para reutilização em api/_services/smsConfirm.js (NOVO —
// confirmação automática via SMS M-Pesa reencaminhado): _createAvulsoAccount
// era só de uso interno; passa a ser exportada para não duplicar a lógica
// de criação de conta avulso num segundo sítio.
module.exports = {
  handleVerifyReceipt,
  verifyReceiptInternal,
  _createAvulsoAccount,
};
