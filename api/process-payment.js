// api/process-payment.js
// Trata: criação de pedido + rastreio de clique de afiliado + confirmação de pagamento

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WA_NUMBER   = process.env.WHATSAPP_NUMBER || '258840000000';
const SITE_URL    = process.env.SITE_URL || 'https://mzdocs.co.mz';

const PACKAGES = {
  starter: { name: 'Starter', price: 150, credits: 10 },
  basico:  { name: 'Básico',  price: 350, credits: 25 },
  pro:     { name: 'Pro',     price: 750, credits: 60 },
};

async function sb(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase ${method} ${path}: ${t}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function sbRpc(fn, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return r.ok;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || (req.body && req.body.action);

  // ─────────────────────────────────────────────
  // ACÇÃO 1: track-click — regista clique de afiliado
  // GET /api/process-payment?action=track&code=MAN77831
  // ─────────────────────────────────────────────
  if (action === 'track') {
    const code = (req.query.code || '').toUpperCase();
    if (!code) return res.redirect(302, SITE_URL);

    try {
      // Verificar se afiliado existe e está aprovado
      const affiliates = await sb(`affiliates?code=eq.${code}&status=eq.approved&select=id`);
      if (!affiliates || affiliates.length === 0) return res.redirect(302, SITE_URL);

      // Anti-fraude: hash IP+data+code para não contar o mesmo IP 2x no mesmo dia
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      const today = new Date().toISOString().split('T')[0];
      const raw = ip + today + code;
      let hash = 0;
      for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
      const ipHash = Math.abs(hash).toString(36);

      // Verificar se já clicou hoje
      const existing = await sb(`affiliate_clicks?affiliate_code=eq.${code}&ip_hash=eq.${ipHash}&select=id`);
      if (!existing || existing.length === 0) {
        // Registar clique
        await sb('affiliate_clicks', 'POST', { affiliate_code: code, ip_hash: ipHash });
        // Incrementar contador
        await sbRpc('increment_affiliate_clicks', { aff_code: code });
      }
    } catch (e) {
      console.error('Erro track-click:', e.message);
    }

    // Sempre redirecionar para o site com o código na URL
    return res.redirect(302, `${SITE_URL}?ref=${code}`);
  }

  // ─────────────────────────────────────────────
  // ACÇÃO 2: create-order — cria pedido pendente
  // POST /api/process-payment  body: { action:'create', packageId, phone, userId, affiliateCode }
  // ─────────────────────────────────────────────
  if (action === 'create') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST requerido' });

    const { packageId, phone, userId, affiliateCode } = req.body;
    if (!packageId || !phone || !userId) {
      return res.status(400).json({ error: 'Dados incompletos: packageId, phone e userId são obrigatórios' });
    }

    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: 'Pacote inválido' });

    // Gerar ID único
    const txId = 'MZN' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

    try {
      await sb('transactions', 'POST', {
        id: txId,
        user_id: userId,
        package_id: packageId,
        package_name: pkg.name,
        amount: pkg.price,
        credits: pkg.credits,
        phone: phone,
        status: 'pending',
        mode: 'manual_whatsapp',
        affiliate_code: affiliateCode || null,
        created_at: new Date().toISOString(),
      });

      // Montar link WhatsApp
      const msg = encodeURIComponent(
        `🧾 *PEDIDO — MzDocs Pro*\n\n` +
        `📦 Pacote: *${pkg.name}*\n` +
        `💰 Valor: *${pkg.price} MZN*\n` +
        `⚡ Créditos: *${pkg.credits}*\n` +
        `📱 Nº M-Pesa: *${phone}*\n` +
        `🔖 Ref: *${txId}*\n\n` +
        `Transferir ${pkg.price} MZN para o nº M-Pesa da empresa e enviar comprovativo.`
      );

      return res.status(200).json({
        success: true,
        orderId: txId,
        whatsappUrl: `https://wa.me/${WA_NUMBER}?text=${msg}`,
        package: pkg,
      });

    } catch (err) {
      console.error('Erro create-order:', err.message);
      return res.status(500).json({ error: 'Erro ao criar pedido. Tenta novamente.' });
    }
  }

  // ─────────────────────────────────────────────
  // ACÇÃO 3: confirm — admin confirma ou rejeita pedido
  // POST /api/process-payment  body: { action:'confirm', orderId, decision:'approve'|'reject' }
  // ─────────────────────────────────────────────
  if (action === 'confirm') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST requerido' });

    const { orderId, decision } = req.body;
    if (!orderId || !decision) return res.status(400).json({ error: 'orderId e decision são obrigatórios' });

    try {
      // Buscar pedido
      const orders = await sb(`transactions?id=eq.${orderId}&select=*`);
      if (!orders || orders.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
      const order = orders[0];
      if (order.status !== 'pending') return res.status(400).json({ error: 'Pedido já foi processado' });

      if (decision === 'approve') {
        // Confirmar pagamento
        await sb(`transactions?id=eq.${orderId}`, 'PATCH', {
          status: 'completed',
          confirmed_at: new Date().toISOString(),
        });
        // Adicionar créditos
        await sbRpc('add_credits', { p_user_id: order.user_id, p_credits: order.credits });
        // Comissão de afiliado (10%)
        if (order.affiliate_code) {
          const commission = Math.round(order.amount * 0.10);
          await sbRpc('register_affiliate_conversion', { aff_code: order.affiliate_code, commission });
        }
        return res.status(200).json({ success: true, message: `✅ Pedido ${orderId} confirmado. ${order.credits} créditos adicionados.` });

      } else if (decision === 'reject') {
        await sb(`transactions?id=eq.${orderId}`, 'PATCH', {
          status: 'failed',
          rejected_at: new Date().toISOString(),
        });
        return res.status(200).json({ success: true, message: `❌ Pedido ${orderId} rejeitado.` });

      } else {
        return res.status(400).json({ error: 'decision deve ser "approve" ou "reject"' });
      }

    } catch (err) {
      console.error('Erro confirm:', err.message);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }

  // Nenhuma acção reconhecida
  return res.status(400).json({ error: 'Acção inválida. Use: track, create, ou confirm' });
}
