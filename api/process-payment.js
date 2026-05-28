// api/process-payment.js
const { createClient } = require('@supabase/supabase-js');

const origin    = process.env.SITE_URL || 'https://mzdocs.co.mz';
const WA_NUMBER = process.env.WA_SUPPORT_NUMBER || '258858695506';

const PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso'  },
  starter: { credits: 10,  price: 120,  name: 'Starter' },
  basico:  { credits: 25,  price: 280,  name: 'Básico'  },
  pro:     { credits: 60,  price: 600,  name: 'Pro'     },
  empresa: { credits: 150, price: 1500, name: 'Empresa' },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const packageId    = body.packageId;
  const rawPhone     = body.phone || body.phoneNumber || '';
  const mode         = body.mode || 'manual';
  const userId       = body.userId || null;
  const provider     = body.provider || 'mpesa';

  console.log('[process-payment] Recebido:', { packageId, rawPhone, mode, userId });

  if (!rawPhone) {
    return res.status(400).json({ error: 'Número de telemóvel é obrigatório (campo: phone ou phoneNumber)' });
  }
  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({ error: 'Pacote inválido', available: Object.keys(PACKAGES) });
  }

  const pkg            = PACKAGES[packageId];
  const cleanPhone     = rawPhone.replace(/\D/g, '');
  const normalizedPhone = cleanPhone.startsWith('258') ? `+${cleanPhone}` : `+258${cleanPhone}`;

  // ── Modo manual (WhatsApp) ────────────────────────────────────────────────
  if (mode === 'manual') {
    const referenceId = `MZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    // Guardar pedido na tabela transactions (lida pelo AdminTransactions.js)
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supabase.from('transactions').insert({
          reference_id:   referenceId,
          user_id:        userId || null,
          package_id:     packageId,
          credits:        pkg.credits,
          amount:         pkg.price,
          status:         'pending',
          payment_method: 'manual',
          phone_number:   normalizedPhone,
        });
      }
    } catch (dbErr) {
      console.warn('[process-payment] Supabase insert falhou (não crítico):', dbErr.message);
    }

    const waMessage = encodeURIComponent(
      `*Pagamento MzDocs Pro*\n\n` +
      `Referência: ${referenceId}\n` +
      `Pacote: ${pkg.name}\n` +
      `Créditos: ${pkg.credits}\n` +
      `Valor: ${pkg.price} MZN\n` +
      `Telemóvel: ${normalizedPhone}\n\n` +
      `Segue o comprovativo de pagamento M-Pesa.`
    );

    return res.status(200).json({
      success:      true,
      mode:         'manual',
      referenceId,
      package:      pkg,
      phone:        normalizedPhone,
      whatsappLink: `https://wa.me/${WA_NUMBER}?text=${waMessage}`,
      message:      'Pedido registado. Envie o comprovativo pelo WhatsApp.',
    });
  }

  // ── Modo M-Pesa automático ────────────────────────────────────────────────
  const isConfigured = !!process.env.MPESA_API_KEY && !!process.env.MPESA_SERVICE_CODE;

  if (mode === 'mpesa' && !isConfigured) {
    return res.status(503).json({
      error:    'M-Pesa não configurado',
      fallback: 'Use modo manual',
    });
  }

  if (mode === 'mpesa' && isConfigured) {
    return res.status(503).json({
      error: 'Integração M-Pesa ainda não implementada. Use modo manual.',
    });
  }

  return res.status(400).json({ error: 'Modo de pagamento inválido: ' + mode });
};
