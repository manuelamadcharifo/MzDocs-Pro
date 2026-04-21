// api/process-payment.js — M-Pesa C2B com validação de ambiente
const { createClient } = require('@supabase/supabase-js');

const PACKAGES = { starter:{amount:150,credits:10}, basico:{amount:350,credits:25}, pro:{amount:750,credits:60} };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error:'Method Not Allowed'});

  let body;
  try { body = JSON.parse(req.body || '{}'); }
  catch { return res.status(400).json({error:'Body inválido'}); }

  const { phoneNumber, amount, packageId, environment, userId } = body;

  // ── Validação 1: Ambiente deve bater ──────────────────────
  const serverEnv = process.env.MPESA_ENV || 'sandbox';
  if (environment !== serverEnv) {
    return res.status(400).json({
      error: 'ENVIRONMENT_MISMATCH',
      message: `Ambiente incorreto. Esperado: ${serverEnv}, Recebido: ${environment}`,
      solution: 'Verifique se MPESA_ENV está correcto no Vercel.'
    });
  }

  // ── Validação 2: Pacote e montante ────────────────────────
  const pkg = PACKAGES[packageId];
  if (!pkg) return res.status(400).json({error:'Pacote inválido'});
  if (parseInt(amount) !== pkg.amount) return res.status(400).json({error:'Montante não corresponde ao pacote'});

  // ── Validação 3: Número M-Pesa ────────────────────────────
  if (!/^2588[4-7]\d{7}$/.test(phoneNumber)) {
    return res.status(400).json({error:'Número M-Pesa inválido'});
  }

  // ── Verificar credenciais M-Pesa ──────────────────────────
  if (!process.env.MPESA_API_KEY || !process.env.MPESA_PUBLIC_KEY || !process.env.MPESA_SERVICE_CODE) {
    console.error('Credenciais M-Pesa não configuradas');
    // Em sandbox, simular sucesso para testes
    if (serverEnv === 'sandbox') {
      console.warn('[M-Pesa] SANDBOX MODE: Simulando pagamento bem-sucedido');
      await addCreditsToUser(userId, pkg.credits);
      return res.status(200).json({
        success: true, transactionId: 'SANDBOX_' + Date.now(),
        creditsAdded: pkg.credits, sandbox: true,
        message: `[SANDBOX] ${pkg.credits} créditos adicionados (teste)`
      });
    }
    return res.status(503).json({error:'Pagamentos indisponíveis. Configure as credenciais M-Pesa.'});
  }

  // ── Chamada real M-Pesa ───────────────────────────────────
  const transRef = `MZDOCS-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const mpesaBase = serverEnv === 'production' ? 'https://api.mpesa.vm.co.mz' : 'https://api.sandbox.vm.co.mz';

  try {
    const encKey = encryptApiKey(process.env.MPESA_API_KEY, process.env.MPESA_PUBLIC_KEY);

    const mpRes = await fetch(`${mpesaBase}/ipg/v1x/c2bPayment/singleStage/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${encKey}`,
        'Origin': process.env.MPESA_ORIGIN || mpesaBase,
      },
      body: JSON.stringify({
        input_TransactionReference: transRef,
        input_CustomerMSISDN:       phoneNumber,
        input_Amount:               pkg.amount.toString(),
        input_ThirdPartyReference:  `${packageId}-${userId?.slice(0,8)||'anon'}`,
        input_ServiceProviderCode:  process.env.MPESA_SERVICE_CODE,
      }),
    });

    const mpData = await mpRes.json();
    if (mpData.output_ResponseCode !== 'INS-0') {
      throw new Error(getMpesaError(mpData.output_ResponseCode));
    }

    await addCreditsToUser(userId, pkg.credits);

    console.log(JSON.stringify({ event:'payment_success', transRef, pkg:packageId, credits:pkg.credits, ts:new Date().toISOString() }));
    return res.status(200).json({
      success: true, transactionId: mpData.output_TransactionID,
      creditsAdded: pkg.credits, message: `Pagamento confirmado! ${pkg.credits} créditos adicionados.`
    });

  } catch (err) {
    console.error('[M-Pesa] Erro:', err.message);
    return res.status(400).json({ success:false, message: err.message });
  }
};

async function addCreditsToUser(userId, credits) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.rpc('add_credits', { user_id: userId, amount: credits });
  } catch (e) { console.warn('Supabase addCredits falhou:', e.message); }
}

function encryptApiKey(apiKey, publicKeyB64) {
  const { createPublicKey, publicEncrypt, constants } = require('crypto');
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64}\n-----END PUBLIC KEY-----`;
  const key = createPublicKey(pem);
  return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(apiKey)).toString('base64');
}

const MPESA_ERRORS = {
  'INS-9':'Saldo insuficiente na conta M-Pesa.',
  'INS-16':'Limite diário atingido.',
  'INS-18':'Número não registado no M-Pesa.',
  'INS-22':'Utilizador cancelou a transacção.',
  'INS-23':'Tempo esgotado — sem resposta do utilizador.',
  'INS-24':'Transacção pendente em curso.',
  'INS-25':'Conta M-Pesa bloqueada.',
};
function getMpesaError(code) { return MPESA_ERRORS[code] || `Erro M-Pesa (${code}). Contacte o suporte.`; }