// ══════════════════════════════════════════════════════════
//  netlify/functions/process-payment.js
//  Integração M-Pesa C2B (Customer to Business)
//  Documentação oficial: https://developer.mpesa.vm.co.mz
// ══════════════════════════════════════════════════════════

const PACKAGES = {
  starter:  { amount: 150,  credits: 10 },
  basico:   { amount: 350,  credits: 25 },
  pro:      { amount: 750,  credits: 60 },
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido' }) }; }

  const { phoneNumber, amount, packageId, userId } = body;

  // ── Validações ──────────────────────────────────────────
  if (!phoneNumber || !packageId || !userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campos obrigatórios em falta' }) };
  }

  const pkg = PACKAGES[packageId];
  if (!pkg) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Pacote inválido' }) };
  }

  // Validar número moçambicano (258 + 9 dígitos)
  if (!/^2588[4-7]\d{7}$/.test(phoneNumber)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Número M-Pesa inválido. Use formato: 2588XXXXXXXX' }) };
  }

  // Verificar que o montante bate certo (evitar manipulação de preços)
  if (parseInt(amount) !== pkg.amount) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Montante inválido para o pacote seleccionado' }) };
  }

  // ── Verificar credenciais M-Pesa ────────────────────────
  if (!process.env.MPESA_API_KEY || !process.env.MPESA_PUBLIC_KEY || !process.env.MPESA_SERVICE_CODE) {
    console.error('Credenciais M-Pesa não configuradas');
    return {
      statusCode: 503, headers,
      body: JSON.stringify({ error: 'Pagamentos temporariamente indisponíveis. Configure as variáveis M-Pesa.' })
    };
  }

  // ── Gerar referência única de transacção ────────────────
  const transactionRef = `MZDOCS-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const thirdPartyRef  = `PKG-${packageId.toUpperCase()}-${userId.slice(0,8)}`;

  // ── Encriptar API Key com RSA Public Key ─────────────────
  // A M-Pesa exige que a API Key seja encriptada com a Public Key
  let encryptedApiKey;
  try {
    encryptedApiKey = await encryptApiKey(
      process.env.MPESA_API_KEY,
      process.env.MPESA_PUBLIC_KEY
    );
  } catch (err) {
    console.error('Erro ao encriptar API Key:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro de configuração de segurança' }) };
  }

  // ── Chamada à API M-Pesa C2B ─────────────────────────────
  const mpesaBaseURL = process.env.MPESA_ENV === 'production'
    ? 'https://api.mpesa.vm.co.mz'
    : 'https://api.sandbox.vm.co.mz';

  let mpesaRes;
  try {
    mpesaRes = await fetch(`${mpesaBaseURL}/ipg/v1x/c2bPayment/singleStage/`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${encryptedApiKey}`,
        'Origin':        process.env.MPESA_ORIGIN || 'developer.mpesa.vm.co.mz',
      },
      body: JSON.stringify({
        input_TransactionReference:    transactionRef,
        input_CustomerMSISDN:          phoneNumber,
        input_Amount:                  pkg.amount.toString(),
        input_ThirdPartyReference:     thirdPartyRef,
        input_ServiceProviderCode:     process.env.MPESA_SERVICE_CODE,
      }),
    });
  } catch (fetchErr) {
    console.error('Erro ao contactar M-Pesa:', fetchErr);
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Não foi possível contactar o M-Pesa. Tente novamente.' }) };
  }

  const mpesaData = await mpesaRes.json();
  console.log('M-Pesa response:', JSON.stringify({ ...mpesaData, userId: userId.slice(0,8)+'***' }));

  // ── Verificar resposta ───────────────────────────────────
  // Código de sucesso M-Pesa: INS-0
  const isSuccess = mpesaData.output_ResponseCode === 'INS-0';

  if (!isSuccess) {
    const errMsg = getMpesaErrorMessage(mpesaData.output_ResponseCode);
    return {
      statusCode: 400, headers,
      body: JSON.stringify({
        success: false,
        code: mpesaData.output_ResponseCode,
        message: errMsg,
      }),
    };
  }

  // ── Adicionar créditos (em produção: actualizar BD) ──────
  // TODO: Chamar Supabase/PlanetScale para adicionar créditos ao userId
  // await db.addCredits(userId, pkg.credits, transactionRef);

  console.log(JSON.stringify({
    event: 'payment_success',
    transactionRef,
    mpesaTransId: mpesaData.output_TransactionID,
    packageId,
    credits: pkg.credits,
    userId: userId.slice(0,8) + '***',
    timestamp: new Date().toISOString(),
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      transactionId: mpesaData.output_TransactionID,
      transactionRef,
      creditsAdded: pkg.credits,
      message: `Pagamento confirmado! ${pkg.credits} créditos adicionados à sua conta.`,
    }),
  };
};

// ════════════════════════════════════
// ENCRIPTAÇÃO RSA (M-Pesa requirement)
// ════════════════════════════════════
async function encryptApiKey(apiKey, publicKeyBase64) {
  // Usando Web Crypto API (disponível no Node.js 18+)
  // Para Node.js < 18, usar 'crypto' nativo ou 'node-forge'

  const { createPublicKey, publicEncrypt, constants } = require('crypto');

  const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;
  const pubKey = createPublicKey(pubKeyPem);

  const encrypted = publicEncrypt(
    {
      key: pubKey,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(apiKey)
  );

  return encrypted.toString('base64');
}

// ════════════════════════════════════
// MENSAGENS DE ERRO M-PESA
// ════════════════════════════════════
function getMpesaErrorMessage(code) {
  const errors = {
    'INS-1':  'Erro interno do sistema M-Pesa. Tente mais tarde.',
    'INS-6':  'Transacção não permitida para este utilizador.',
    'INS-9':  'Saldo insuficiente na conta M-Pesa.',
    'INS-10': 'Valor em falta ou inválido.',
    'INS-13': 'Código de serviço inválido.',
    'INS-14': 'Montante da transacção inválido.',
    'INS-15': 'Créditos insuficientes.',
    'INS-16': 'Limite diário da conta atingido.',
    'INS-17': 'Transacção em curso. Aguarde e tente novamente.',
    'INS-18': 'Número de telefone inválido ou não registado no M-Pesa.',
    'INS-20': 'Pedido mal formado.',
    'INS-21': 'Serviço indisponível de momento.',
    'INS-22': 'O utilizador cancelou a transacção.',
    'INS-23': 'Timeout — o utilizador não respondeu a tempo.',
    'INS-24': 'O utilizador já tem uma transacção pendente.',
    'INS-25': 'Bloqueio de conta — conta M-Pesa bloqueada.',
  };
  return errors[code] || `Erro M-Pesa (${code}). Contacte o suporte.`;
}
