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

  const packageId = body.packageId;
  const rawPhone  = body.phone || body.phoneNumber || '';
  const mode      = body.mode || 'manual';
  // userId pode ser UUID real (utilizador autenticado) ou string anon — guardamos o que vier,
  // mas só associamos à transação se parecer um UUID válido do Supabase
  const rawUserId = body.userId || null;

  console.log('[process-payment] Recebido:', { packageId, rawPhone, mode, rawUserId });

  if (!rawPhone) {
    return res.status(400).json({ error: 'Número de telemóvel é obrigatório (campo: phone ou phoneNumber)' });
  }
  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({ error: 'Pacote inválido', available: Object.keys(PACKAGES) });
  }

  const pkg             = PACKAGES[packageId];
  const cleanPhone      = rawPhone.replace(/\D/g, '');
  const normalizedPhone = cleanPhone.startsWith('258') ? `+${cleanPhone}` : `+258${cleanPhone}`;

  // Determinar userId real: só aceitar UUIDs reais (formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userId = rawUserId && UUID_REGEX.test(rawUserId) ? rawUserId : null;

  // ── Modo manual (WhatsApp) ────────────────────────────────────────────────
  if (mode === 'manual') {
    const referenceId = `MZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    // ── CORRIGIDO: usar SUPABASE_SERVICE_ROLE_KEY (nome correcto da env var) ──
    const supabaseUrl     = process.env.SUPABASE_URL;
    const supabaseRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // era SUPABASE_SERVICE_KEY — ERRADO

    if (supabaseUrl && supabaseRoleKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { error: insertErr } = await supabase.from('transactions').insert({
          reference_id:   referenceId,
          user_id:        userId,          // null se anónimo — válido, coluna aceita NULL
          package_id:     packageId,
          credits:        pkg.credits,
          amount:         pkg.price,
          status:         'pending',
          payment_method: 'manual',
          phone_number:   normalizedPhone,
        });

        if (insertErr) {
          // Logar o erro real para debug no Vercel — não falhar silenciosamente
          console.error('[process-payment] ERRO ao gravar transação:', insertErr.message, insertErr.code);
        } else {
          console.log('[process-payment] Transação gravada:', referenceId, '| user_id:', userId || 'anónimo');
        }
      } catch (dbErr) {
        console.error('[process-payment] Excepção Supabase:', dbErr.message);
      }
    } else {
      console.warn('[process-payment] Supabase não configurado — transação NÃO gravada. Vars em falta:',
        !supabaseUrl ? 'SUPABASE_URL ' : '',
        !supabaseRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : ''
      );
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
