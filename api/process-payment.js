// api/process-payment.js
// Estrutura preparada para integração MPesa / e-Mola

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

const PACKAGES = {
  'starter': { credits: 5, price: 150, label: 'Starter — 5 créditos' },
  'basic':   { credits: 15, price: 375, label: 'Básico — 15 créditos' },
  'pro':     { credits: 50, price: 1000, label: 'Pro — 50 créditos' },
  'business':{ credits: 200, price: 3000, label: 'Business — 200 créditos' },
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

  const { phone, packageId, provider = 'mpesa' } = body;

  if (!phone) return res.status(400).json({ error: 'Número de telemóvel é obrigatório' });
  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({ error: 'Pacote inválido', available: Object.keys(PACKAGES) });
  }

  const pkg = PACKAGES[packageId];
  const cleanPhone = phone.replace(/\D/g, '');
  const normalizedPhone = cleanPhone.startsWith('258') ? `+${cleanPhone}` : `+258${cleanPhone}`;

  const isConfigured = !!process.env.MPESA_API_KEY && !!process.env.MPESA_SERVICE_CODE;

  if (!isConfigured) {
    console.log(`[MPesa Sandbox] Simulação: ${pkg.label} para ${normalizedPhone}`);
    await new Promise(r => setTimeout(r, 1500));
    const transactionId = `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    return res.status(200).json({
      success: true,
      sandbox: true,
      message: 'Pagamento simulado com sucesso. Em produção, o utilizador receberá pedido USSD no telemóvel.',
      transactionId,
      package: pkg,
      phone: normalizedPhone,
      nextStep: 'Adicione MPESA_API_KEY e MPESA_SERVICE_CODE nas variáveis de ambiente para activar pagamentos reais.',
    });
  }

  return res.status(503).json({ 
    error: 'Serviço de pagamento não configurado.',
    help: 'Contacte o administrador para activar pagamentos.' 
  });
};
