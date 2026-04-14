// netlify/functions/process-payment.js — M-Pesa C2B com validação de ambiente
const { createClient } = require('@supabase/supabase-js');
const { PACKAGES, MPESA_ERRORS } = require('../../config/constants');
const ErrorHandler = require('../../utils/ErrorHandler');

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return ErrorHandler.createResponse(405, 'Method Not Allowed');

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return ErrorHandler.createResponse(400, 'Body inválido'); }

    const { phoneNumber, amount, packageId, environment, userId } = body;

    // ── Validação 1: Ambiente deve bater ──────────────────────
    const serverEnv = process.env.MPESA_ENV || 'production';
    if (environment !== serverEnv) {
      return ErrorHandler.createResponse(400, `Ambiente incorreto. Esperado: ${serverEnv}, Recebido: ${environment}`);
    }

    // ── Validação 2: Pacote e montante ────────────────────────
    const pkg = PACKAGES[packageId];
    if (!pkg) return ErrorHandler.createResponse(400, 'Pacote inválido');
    if (parseInt(amount) !== pkg.amount) return ErrorHandler.createResponse(400, 'Montante não corresponde ao pacote');

    // ── Validação 3: Número M-Pesa ────────────────────────────
    if (!/^2588[4-7]\d{7}$/.test(phoneNumber)) {
      return ErrorHandler.createResponse(400, 'Número M-Pesa inválido');
    }

    // ── Verificar credenciais M-Pesa ──────────────────────────
    if (!process.env.MPESA_API_KEY || !process.env.MPESA_PUBLIC_KEY || !process.env.MPESA_SERVICE_CODE) {
      ErrorHandler.logError('process-payment', new Error('M-Pesa credentials not configured'));
      const isTestMode = serverEnv !== 'production';
      if (isTestMode) {
        console.warn('[M-Pesa] TEST MODE: Simulando pagamento bem-sucedido');
        await addCreditsToUser(userId, pkg.credits);
        return { statusCode: 200, headers, body: JSON.stringify({
          success: true, transactionId: 'TESTPAY_' + Date.now(),
          creditsAdded: pkg.credits, testMode: true,
          message: `Pagamento simulado: ${pkg.credits} créditos adicionados.`
        })};
      }
      return ErrorHandler.createResponse(503, 'Pagamentos indisponíveis. Configure as credenciais M-Pesa.');
    }

    // ── Chamada real M-Pesa ───────────────────────────────────
    const transRef = `MZDOCS-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const mpesaOrigin = process.env.MPESA_ORIGIN || 'https://api.mpesa.vm.co.mz';

    try {
      const encKey = encryptApiKey(process.env.MPESA_API_KEY, process.env.MPESA_PUBLIC_KEY);

      const mpRes = await fetch(`${mpesaOrigin.replace(/\/$/, '')}/ipg/v1x/c2bPayment/singleStage/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encKey}`,
          'Origin': mpesaOrigin,
        },
        body: JSON.stringify({
          input_TransactionReference: transRef,
          input_CustomerMSISDN: phoneNumber,
          input_Amount: pkg.amount.toString(),
          input_ThirdPartyReference: `${packageId}-${userId?.slice(0,8)||'anon'}`,
          input_ServiceProviderCode: process.env.MPESA_SERVICE_CODE,
        }),
      });

      const mpData = await mpRes.json();
      if (mpData.output_ResponseCode !== 'INS-0') {
        throw new Error(getMpesaError(mpData.output_ResponseCode));
      }

      await addCreditsToUser(userId, pkg.credits);

      console.log(JSON.stringify({ event:'payment_success', transRef, pkg:packageId, credits:pkg.credits, ts:new Date().toISOString() }));
      return { statusCode:200, headers, body: JSON.stringify({
        success: true, transactionId: mpData.output_TransactionID,
        creditsAdded: pkg.credits, message: `Pagamento confirmado! ${pkg.credits} créditos adicionados.`
      })};

    } catch (err) {
      ErrorHandler.logError('process-payment', err, { transRef });
      return ErrorHandler.createResponse(400, err.message);
    }

  } catch (error) { console.error(error); }
    ErrorHandler.logError('process-payment', error);
    return ErrorHandler.createResponse(500, 'Internal Server Error');
  }
};

async function addCreditsToUser(userId, credits) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    ErrorHandler.logError('addCreditsToUser', new Error('Supabase not configured or no userId'));
    return;
  }
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.rpc('add_credits', { user_id: userId, amount: credits });
<<<<<<< HEAD
  } catch (e) { console.error(e); } console.error(e);
=======
  } catch (e) {
>>>>>>> parent of 0a3b775 (SUPER FIX: production ready)
    ErrorHandler.logError('addCreditsToUser', e);
  }
}

function encryptApiKey(apiKey, publicKeyB64) {
  const { createPublicKey, publicEncrypt, constants } = require('crypto');
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64}\n-----END PUBLIC KEY-----`;
  const key = createPublicKey(pem);
  return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(apiKey)).toString('base64');
}

function getMpesaError(code) {
  return MPESA_ERRORS[code] || `Erro M-Pesa (${code}). Contacte o suporte.`;
}
<<<<<<< HEAD
  } catch (e) { console.error(e); } console.error(e);
=======
  } catch (e) {
>>>>>>> parent of 0a3b775 (SUPER FIX: production ready)
    return { statusCode:200, headers, body: JSON.stringify({ userId, credits:3, source:'fallback' }) };
  }
};

