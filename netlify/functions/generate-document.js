// netlify/functions/generate-document.js
// Proxy seguro para OpenRouter API — chave NUNCA exposta no frontend

const ErrorHandler = require('../../utils/ErrorHandler');

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return ErrorHandler.createResponse(405, 'Method Not Allowed');

    // Verificar API Key
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) {
      ErrorHandler.logError('generate-document', new Error('OPENROUTER_API_KEY not configured'));
      return ErrorHandler.createResponse(503, 'Serviço indisponível. Configure OPENROUTER_API_KEY.');
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return ErrorHandler.createResponse(400, 'Body JSON inválido'); }

    const { serviceType, prompt, userId, userCredits } = body;
    if (!prompt) return ErrorHandler.createResponse(400, 'prompt obrigatório');

    // Verificar créditos
    if (typeof userCredits === 'number' && userCredits < 1) {
      return ErrorHandler.createResponse(402, 'INSUFFICIENT_CREDITS', 'INSUFFICIENT_CREDITS');
    }

    // Tentar modelos em cascata (fallback automático)
    let lastError = null;
    for (const model of MODELS) {
      try {
        const result = await callOpenRouter(prompt, model, OPENROUTER_KEY);
        const creditsRemaining = typeof userCredits === 'number' ? Math.max(0, userCredits - 1) : null;

        // Log (sem dados pessoais)
        console.log(JSON.stringify({
          event: 'doc_generated', serviceType,
          model, tokens: result.usage?.total_tokens || 0,
          userId: userId ? userId.slice(0, 8) + '***' : 'anon',
          ts: new Date().toISOString(),
        }));

        return {
          statusCode: 200, headers,
          body: JSON.stringify({ document: result.content, model, creditsRemaining, usage: result.usage }),
        };

      } catch (err) {
        ErrorHandler.logError('generate-document', err, { model });
        lastError = err;

        // Rate limit → tentar próximo modelo
        if (err.status === 429 || err.status === 503) continue;
        // Outros erros → parar
        break;
      }
    }

    // Todos os modelos falharam
    const status = lastError?.status === 429 ? 429 : 503;
    return ErrorHandler.createResponse(status, status === 429
      ? 'Limite de velocidade atingido. Tente novamente em alguns segundos.'
      : 'Serviço de IA temporariamente indisponível.', status === 429 ? 'RATE_LIMIT' : 'SERVICE_UNAVAILABLE');

  } catch (error) {
    ErrorHandler.logError('generate-document', error);
    return ErrorHandler.createResponse(500, 'Internal Server Error');
  }
};

async function callOpenRouter(prompt, model, apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'X-Title': 'MzDocs Pro',
  };
  if (process.env.SITE_URL) {
    headers['HTTP-Referer'] = process.env.SITE_URL;
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  2000,
      temperature: 0.3,
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
