// netlify/functions/process-payment.js
// M-Pesa C2B payment processing — corrigido v4

const { createClient } = require('@supabase/supabase-js');
const ErrorHandler = require('../../utils/ErrorHandler');

const PACKAGES = {
  starter: { amount: 150, credits: 10 },
  basico:  { amount: 350, credits: 25 },
  pro:     { amount: 750, credits: 60 },
};

const MPESA_ERRORS = {
  'INS-9':  'Saldo insuficiente na conta M-Pesa.',
  'INS-16': 'Limite diário de transacções atingido.',
  'INS-18': 'Número não registado no M-Pesa.',
  'INS-22': 'Transacção cancelada pelo utilizador.',
  'INS-23': 'Tempo esgotado — sem resposta. Tenta novamente.',
  'INS-24': 'Já existe uma transacção pendente. Aguarda.',
  'INS-25': 'Conta M-Pesa bloqueada. Contacta a Vodacom.',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return makeError(405, 'Método não permitido');
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return makeError(400, 'Pedido inválido');
  }

  const { phoneNumber, amount, packageId, environment, userId } = body;

  // Validar ambiente
  const serverEnv = process.env.MPESA_ENV || 'production';
  if (environment && environment !== serverEnv) {
    return makeError(400, `Ambiente incorrecto. Esperado: ${serverEnv}`);
  }

  // Validar pacote
  const pkg = PACKAGES[packageId];
  if (!pkg) {
    return makeError(400, 'Pacote de créditos inválido');
  }

  // Validar valor
  if (parseInt(amount) !== pkg.amount) {
    return makeError(400, 'O valor não corresponde ao pacote seleccionado');
  }

  // Validar número M-Pesa moçambicano: +258 84/85/86/87 + 7 dígitos
  if (!phoneNumber || !/^2588[4-7]\d{7}$/.test(phoneNumber)) {
    return makeError(400, 'Número de telemóvel inválido. Usa 84XXXXXXX ou 85XXXXXXX');
  }

  const hasCredentials = (
    process.env.MPESA_API_KEY &&
    process.env.MPESA_PUBLIC_KEY &&
    process.env.MPESA_SERVICE_CODE
  );

  // ── MODO SANDBOX (sem credenciais reais) ──────────────────
  if (!hasCredentials) {
    const isTestMode = serverEnv !== 'production';

    if (isTestMode) {
      // Simular pagamento em sandbox
      await addCreditsToUser(userId, pkg.credits);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          transactionId: `SANDBOX_${Date.now()}`,
          creditsAdded: pkg.credits,
          testMode: true,
          message: `Sandbox: ${pkg.credits} créditos adicionados.`,
        }),
      };
    }

    // Produção sem credenciais — erro claro
    ErrorHandler.logError('process-payment', new Error('M-Pesa credentials missing'));
    return makeError(503, 'Pagamentos M-Pesa temporariamente indisponíveis. Tenta mais tarde.');
  }

  // ── PAGAMENTO REAL M-PESA ─────────────────────────────────
  const transRef = `MZDOCS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const mpesaOrigin = (process.env.MPESA_ORIGIN || 'https://api.mpesa.vm.co.mz').replace(/\/$/, '');

  try {
    const encKey = encryptApiKey(process.env.MPESA_API_KEY, process.env.MPESA_PUBLIC_KEY);

    const mpRes = await fetch(`${mpesaOrigin}/ipg/v1x/c2bPayment/singleStage/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${encKey}`,
        'Origin': mpesaOrigin,
      },
      body: JSON.stringify({
        input_TransactionReference:  transRef,
        input_CustomerMSISDN:        phoneNumber,
        input_Amount:                pkg.amount.toString(),
        input_ThirdPartyReference:   `${packageId}-${(userId || 'anon').slice(0, 8)}`,
        input_ServiceProviderCode:   process.env.MPESA_SERVICE_CODE,
      }),
    });

    let mpData;
    try {
      mpData = await mpRes.json();
    } catch {
      throw new Error('Resposta inválida da M-Pesa. Tenta novamente.');
    }

    if (mpData.output_ResponseCode !== 'INS-0') {
      const msg = MPESA_ERRORS[mpData.output_ResponseCode] ||
        `Erro M-Pesa (${mpData.output_ResponseCode}). Contacta o suporte.`;
      throw new Error(msg);
    }

    // Adicionar créditos após pagamento confirmado
    await addCreditsToUser(userId, pkg.credits);

    console.log(JSON.stringify({
      event: 'payment_success',
      transRef,
      pkg: packageId,
      credits: pkg.credits,
      ts: new Date().toISOString(),
    }));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        transactionId: mpData.output_TransactionID,
        creditsAdded: pkg.credits,
        message: `Pagamento confirmado! +${pkg.credits} créditos adicionados.`,
      }),
    };

  } catch (err) {
    ErrorHandler.logError('process-payment', err, { transRef });
    return makeError(400, err.message || 'Erro ao processar pagamento. Tenta novamente.');
  }
};

// ── HELPERS ───────────────────────────────────────────────────

async function addCreditsToUser(userId, credits) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('[process-payment] Supabase não configurado — créditos não persistidos');
    return;
  }
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.rpc('add_credits', { user_id: userId, amount: credits });
  } catch (e) {
    ErrorHandler.logError('addCreditsToUser', e);
  }
}

function encryptApiKey(apiKey, publicKeyB64) {
  const { createPublicKey, publicEncrypt, constants } = require('crypto');
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64}\n-----END PUBLIC KEY-----`;
  const key = createPublicKey(pem);
  return publicEncrypt(
    { key, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(apiKey)
  ).toString('base64');
}

function makeError(status, message) {
  return {
    statusCode: status,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}
