const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return res.status(200).set(headers).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).set(headers).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (!body) {
    try {
      body = JSON.parse(req);
    } catch {
      return res.status(400).set(headers).json({ error: 'Invalid body' });
    }
  }

  const { serviceType, prompt, userId } = body || {};

  if (!serviceType || !prompt) {
    return res.status(400).set(headers).json({ error: 'serviceType and prompt required' });
  }

  // Check credentials
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).set(headers).json({
      error: 'OpenRouter API not configured. Contact support.',
      testMode: true,
      result: '[MODO DE TESTE] Este é um resultado fictício.\n\nEm produção, aqui apareceria o documento gerado pela IA.\n\nServiço: ' + serviceType
    });
  }

  try {
    // Try primary model first
    const result = await callOpenRouter(prompt, 'meta-llama/llama-3.3-70b-instruct:free');

    // Deduct credit if Supabase configured
    if (userId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await sb.rpc('deduct_credit', { p_user_id: userId }).catch(() => {});
    }

    return res.status(200).set(headers).json({
      success: true,
      result,
      model: 'meta-llama/llama-3.3-70b-instruct:free'
    });

  } catch (error) {
    console.error('[generate-document] Error:', error.message);

    // Fallback to test mode result
    return res.status(200).set(headers).json({
      success: true,
      result: '[MODO OFFLINE] Documento em modo de demonstração.\n\nEm produção: ' + serviceType,
      error: error.message
    });
  }
};

async function callOpenRouter(prompt, model) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.SITE_URL || 'https://mzdocs.app',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Você é um assistente especializado em redação de documentos profissionais em português moçambicano.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000,
      temperature: 0.7,
    }),
  });

  if (res.status === 429) {
    const e = new Error('Rate limited');
    e.status = 429;
    throw e;
  }

  if (!res.ok) {
    throw new Error(`OpenRouter error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
