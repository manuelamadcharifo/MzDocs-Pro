// api/process-payment.js — M-Pesa C2B com validação de ambiente
const { createClient } = require('@supabase/supabase-js');
const { PACKAGES, MPESA_ERRORS } = require('../config/constants');
const ErrorHandler = require('../utils/ErrorHandler');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    let body;
    try {
      body = JSON.parse(req.body || '{}');
    } catch {
      res.status(400).json({ error: 'Body inválido' });
      return;
    }

    const { phoneNumber, amount, packageId, environment, userId } = body;

    const serverEnv = process.env.MPESA_ENV || 'production';

    if (environment !== serverEnv) {
      res.status(400).json({ error: `Ambiente incorreto. Esperado: ${serverEnv}, Recebido: ${environment}` });
      return;
    }

    const pkg = PACKAGES[packageId];
    if (!pkg) { res.status(400).json({ error: 'Pacote inválido' }); return; }

    if (parseInt(amount) !== pkg.amount) {
      res.status(400).json({ error: 'Montante não corresponde ao pacote' });
      return;
    }

    if (!/^2588[4-7]\d{7}$/.test(phoneNumber)) {
      res.status(400).json({ error: 'Número M-Pesa inválido' });
      return;
    }

    const serverHasCreds =
      process.env.MPESA_API_KEY &&
      process.env.MPESA_PUBLIC_KEY &&
      process.env.MPESA_SERVICE_CODE;

    if (!serverHasCreds) {
      ErrorHandler.logError(
        'process-payment',
        new Error('M-Pesa credentials not configured')
      );

      const isTestMode = serverEnv !== 'production';

      if (isTestMode) {
        await addCreditsToUser(userId, pkg.credits);

        res.status(200).json({
          success: true,
          transactionId: 'TESTPAY_' + Date.now(),
          creditsAdded: pkg.credits,
          testMode: true,
          message: `Pagamento simulado: ${pkg.credits} créditos adicionados.`,
        });
        return;
      }

      res.status(503).json({ error: 'Pagamentos indisponíveis. Configure as credenciais M-Pesa.' });
      return;
    }

    const transRef = `MZDOCS-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;

    const mpesaOrigin =
      process.env.MPESA_ORIGIN || 'https://api.mpesa.vm.co.mz';

    try {
      const encKey = encryptApiKey(
        process.env.MPESA_API_KEY,
        process.env.MPESA_PUBLIC_KEY
      );

      const mpRes = await fetch(
        `${mpesaOrigin.replace(/\/$/, '')}/ipg/v1x/c2bPayment/singleStage/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${encKey}`,
            Origin: mpesaOrigin,
          },
          body: JSON.stringify({
            input_TransactionReference: transRef,
            input_CustomerMSISDN: phoneNumber,
            input_Amount: pkg.amount.toString(),
            input_ThirdPartyReference: `${packageId}-${userId?.slice(0, 8) || 'anon'}`,
            input_ServiceProviderCode: process.env.MPESA_SERVICE_CODE,
          }),
        }
      );

      const mpData = await mpRes.json();

      if (mpData.output_ResponseCode !== 'INS-0') {
        throw new Error(getMpesaError(mpData.output_ResponseCode));
      }

      await addCreditsToUser(userId, pkg.credits);

      console.log(
        JSON.stringify({
          event: 'payment_success',
          transRef,
          pkg: packageId,
          credits: pkg.credits,
          ts: new Date().toISOString(),
        })
      );

      res.status(200).json({
        success: true,
        transactionId: mpData.output_TransactionID,
        creditsAdded: pkg.credits,
        message: `Pagamento confirmado! ${pkg.credits} créditos adicionados.`,
      });
    } catch (err) {
      ErrorHandler.logError('process-payment', err, { transRef });
      res.status(400).json({ error: err.message });
    }
  } catch (error) {
    console.error(error);
    ErrorHandler.logError('process-payment', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

async function addCreditsToUser(userId, credits) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    ErrorHandler.logError(
      'addCreditsToUser',
      new Error('Supabase not configured or no userId')
    );
    return;
  }

  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    await sb.rpc('add_credits', {
      user_id: userId,
      amount: credits,
    });
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

function getMpesaError(code) {
  return MPESA_ERRORS[code] || `Erro M-Pesa (${code}). Contacte o suporte.`;
}