// api/process-payment.js — M-Pesa C2B + Manual

const PACKAGES = {
  starter: { amount: 150, credits: 10 },
  basico: { amount: 350, credits: 25 },
  pro: { amount: 750, credits: 60 }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const { mode, phoneNumber, amount, packageId, environment, userId } = body;
  const pkg = PACKAGES[packageId];

  if (!pkg) return res.status(400).json({ error: 'Pacote inválido' });

  const mpesaConfigured = process.env.MPESA_API_KEY && process.env.MPESA_SERVICE_CODE;

  if (mode === 'mpesa' && mpesaConfigured && environment === 'production') {
    try {
      const result = await processMPesaPayment(phoneNumber, pkg.amount, packageId);
      await saveTransaction(userId, packageId, pkg, 'mpesa', result.receipt);
      return res.status(200).json({
        success: true,
        mode: 'automatic',
        receipt: result.receipt,
        message: 'Confirme o pagamento no seu telemóvel'
      });
    } catch (err) {
      return processManual(userId, packageId, pkg, phoneNumber, res);
    }
  } else {
    return processManual(userId, packageId, pkg, phoneNumber, res);
  }
}

async function processManual(userId, packageId, pkg, phoneNumber, res) {
  const referenceId = 'MAN' + Math.random().toString(36).substring(2, 10).toUpperCase();
  await saveTransaction(userId, packageId, pkg, 'manual', null, referenceId, phoneNumber);

  const whatsappNumber = process.env.WHATSAPP_NUMBER || '258858695506';
  const message = `🧾 *PAGAMENTO MzDocs Pro*\n\n` +
    `📦 Pacote: ${packageId.toUpperCase()}\n` +
    `💰 Valor: ${pkg.amount} MZN\n` +
    `🆔 Referência: ${referenceId}\n` +
    `📱 Número: ${phoneNumber || 'N/A'}\n\n` +
    `Por favor, faça M-Pesa para *${whatsappNumber}* e envie o comprovativo aqui.`;

  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return res.status(200).json({
    success: true,
    mode: 'manual',
    referenceId,
    whatsappLink,
    message: 'Envie o comprovativo pelo WhatsApp'
  });
}

async function processMPesaPayment(phone, amount, packageId) {
  const apiKey = process.env.MPESA_API_KEY;
  const serviceCode = process.env.MPESA_SERVICE_CODE;

  const response = await fetch('https://api.mpesa.vm.co.mz:18346/ipg/v1x/c2bPayment/singleStage/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Origin': process.env.SITE_URL || 'https://mzdocs-pro.vercel.app'
    },
    body: JSON.stringify({
      input_TransactionReference: `MZDOCS-${Date.now()}`,
      input_CustomerMSISDN: phone,
      input_Amount: amount.toString(),
      input_ThirdPartyReference: packageId,
      input_ServiceProviderCode: serviceCode
    })
  });

  if (!response.ok) throw new Error('M-Pesa API error');

  const data = await response.json();
  return { receipt: data.output_TransactionID };
}

async function saveTransaction(userId, packageId, pkg, method, receipt, referenceId, phone) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    await supabase.from('transactions').insert({
      user_id: userId || 'anon',
      package_id: packageId,
      amount: pkg.amount,
      credits: pkg.credits,
      status: 'pending',
      payment_method: method,
      mpesa_receipt: receipt,
      reference_id: referenceId,
      phone_number: phone
    });
  } catch (e) {
    console.warn('[process-payment] Falha ao guardar transação:', e.message);
  }
}

export const config = { maxDuration: 30 };