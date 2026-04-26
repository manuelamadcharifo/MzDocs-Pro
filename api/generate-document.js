// api/generate-document.js
// Proxy seguro para OpenRouter API — chave NUNCA exposta no frontend

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Verificar API Key
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_KEY) {
    console.error('[generate-document] OPENROUTER_API_KEY não configurada');
    return res.status(503).json({ error: 'Serviço indisponível. Configure OPENROUTER_API_KEY.' });
  }

  let body;
  try { body = JSON.parse(req.body || '{}'); }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const { serviceType, prompt, userId, userCredits, _reedit, _currentContent, _instruction } = body;
  
  let finalPrompt = prompt;

  // Se for reedição, constrói prompt especial
  if (_reedit === true && _currentContent && _instruction) {
    finalPrompt = `Você é um editor de documentos profissional. 

DOCUMENTO ATUAL:
"""
${_currentContent}
"""

INSTRUÇÃO DO UTILIZADOR:
"${_instruction}"

TAREFA: Edite o documento acima seguindo a instrução do utilizador. 
Mantenha o formato Markdown. 
Não altere partes que não foram mencionadas na instrução.
Responda apenas com o documento editado, sem explicações adicionais.`;
  }

  if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });

  // Verificar créditos
  if (typeof userCredits === 'number' && userCredits < 1) {
    return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', code: 'INSUFFICIENT_CREDITS' });
  }

  // Tentar modelos em cascata (fallback automático)
  let lastError = null;
  for (const model of MODELS) {
    try {
      const result = await callOpenRouter(finalPrompt, model, OPENROUTER_KEY);
      const creditsRemaining = typeof userCredits === 'number' ? Math.max(0, userCredits - 1) : null;

      // Log (sem dados pessoais)
      console.log(JSON.stringify({
        event: 'doc_generated', serviceType,
        model, tokens: result.usage?.total_tokens || 0,
        userId: userId ? userId.slice(0, 8) + '***' : 'anon',
        ts: new Date().toISOString(),
      }));

      return res.status(200).json({ document: result.content, model, creditsRemaining, usage: result.usage });

    } catch (err) {
      console.warn(`[generate-document] Modelo ${model} falhou:`, err.status, err.message);
      lastError = err;

      // Rate limit → tentar próximo modelo
      if (err.status === 429 || err.status === 503) continue;
      // Outros erros → parar
      break;
    }
  }

  // Todos os modelos falharam
  const status = lastError?.status === 429 ? 429 : 503;
  return res.status(status).json({
    error: status === 429
      ? 'Limite de velocidade atingido. Tente novamente em alguns segundos.'
      : 'Serviço de IA temporariamente indisponível.',
    code: status === 429 ? 'RATE_LIMIT' : 'SERVICE_UNAVAILABLE',
  });
};

async function callOpenRouter(prompt, model, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.VERCEL_URL || 'https://mzdocs-pro.vercel.app',
      'X-Title': 'MzDocs Pro',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  4000,
      temperature: 0.7,
      top_p:       0.9,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const e = new Error(data?.error?.message || `OpenRouter HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage:   data.usage,
  };
}