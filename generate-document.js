// ══════════════════════════════════════════════════════════
//  netlify/functions/generate-document.js
//  Proxy seguro para Claude API — API key NUNCA exposta
//  no frontend. Inclui verificação de créditos.
// ══════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Você é o motor de geração de documentos do MzDocs Pro, plataforma de automação documental para Moçambique.

CONTEXTO GEOCULTURAL:
- País: Moçambique | Idioma: Português moçambicano (formal, acessível)
- Moeda: Metical (MZN) | Formatos: A4, normas moçambicanas
- Universidades de referência: UEM, UJC, UP, UNILÚRIO, UCM, ISRI

PRINCÍPIOS OBRIGATÓRIOS:
1. Gerar documentos COMPLETOS, prontos para uso imediato — sem cortes ou sumários
2. Linguagem formal adaptada ao nível (acadêmico, profissional, comercial)
3. Incluir TODOS os elementos estruturais obrigatórios para o tipo de documento
4. Formatar em Markdown (converte facilmente para PDF/Word)
5. NUNCA inventar dados pessoais — usar [PLACEHOLDER] se necessário
6. NUNCA incluir meta-comentários como "Aqui está o documento..." — começar directamente
7. Verificar coerência lógica antes de finalizar (valores em tabelas, datas, nomes)

RESTRIÇÕES ABSOLUTAS:
- Não usar gírias ou português do Brasil informal
- Não inventar estatísticas ou leis sem fonte — usar [VERIFICAR]
- Não deixar secções obrigatórias em branco — usar [PREENCHER]
- Tabelas de orçamento DEVEM ter valores numéricos concretos em MZN`;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // ── Validar API Key configurada ──────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada nas environment variables do Netlify');
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Serviço temporariamente indisponível. Configure ANTHROPIC_API_KEY.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  const { serviceType, prompt, userId, userCredits } = body;

  // ── Validações básicas ───────────────────────────────────
  if (!serviceType || !prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'serviceType e prompt são obrigatórios' }) };
  }

  // ── Verificar créditos ───────────────────────────────────
  // Em produção: verificar no banco de dados (Supabase/PlanetScale)
  // Aqui usamos o valor do cliente como fallback (proteger no banco)
  if (typeof userCredits === 'number' && userCredits < 1) {
    return {
      statusCode: 402, headers,
      body: JSON.stringify({
        error: 'Créditos insuficientes',
        code: 'INSUFFICIENT_CREDITS',
        message: 'Compre mais créditos para continuar a gerar documentos.'
      })
    };
  }

  // ── Rate limiting básico (por IP) ────────────────────────
  const clientIP = event.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  // Em produção: implementar rate limiting com Redis/Upstash

  // ── Chamar Claude API ────────────────────────────────────
  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (fetchErr) {
    console.error('Erro ao chamar Claude API:', fetchErr);
    return {
      statusCode: 503, headers,
      body: JSON.stringify({ error: 'Não foi possível contactar o serviço de IA. Tente novamente.' })
    };
  }

  if (!claudeRes.ok) {
    const errBody = await claudeRes.text().catch(() => '');
    console.error(`Claude API ${claudeRes.status}:`, errBody);
    return {
      statusCode: claudeRes.status >= 500 ? 503 : claudeRes.status,
      headers,
      body: JSON.stringify({ error: `Erro no serviço de IA (${claudeRes.status})` })
    };
  }

  const claudeData = await claudeRes.json();
  const document = claudeData.content?.[0]?.text || '';

  if (!document) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Resposta inválida da IA' }) };
  }

  // ── Deduzir crédito (em produção: actualizar base de dados) ──
  const creditsRemaining = typeof userCredits === 'number' ? Math.max(0, userCredits - 1) : null;

  // Log para monitoramento (sem dados pessoais)
  console.log(JSON.stringify({
    event: 'document_generated',
    serviceType,
    userId: userId ? userId.slice(0, 8) + '***' : 'unknown',
    tokens: claudeData.usage?.output_tokens || 0,
    timestamp: new Date().toISOString(),
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      document,
      creditsRemaining,
      usage: {
        inputTokens:  claudeData.usage?.input_tokens  || 0,
        outputTokens: claudeData.usage?.output_tokens || 0,
      },
    }),
  };
};
