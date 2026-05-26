// api/ocr-analyze.js — Proxy server-side para análise OCR via IA
// Evita expor chaves no cliente. Usa Groq (visão) como primário, Gemini como fallback.

const GROQ_BASE  = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

module.exports = async function handler(req, res) {
  // CORS
  const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { ocrText = '', schema = [], serviceType = '', imageBase64, mimeType } = req.body || {};

  if (!schema.length) return res.status(400).json({ error: 'schema required' });

  const schemaDesc = schema.map(f => `- ${f.id}: "${f.label}" (${f.type})`).join('\n');
  const textSnippet = ocrText.slice(0, 3000);

  const systemPrompt = `Você é um extractor de dados de documentos. Analise o conteúdo e extraia campos estruturados. Responda APENAS em JSON válido, sem markdown nem explicações.`;

  const userPrompt = `TEXTO DO DOCUMENTO:
${textSnippet}

TIPO: ${serviceType}

CAMPOS A EXTRAIR:
${schemaDesc}

Responda APENAS neste formato JSON:
{
  "fields": {
    "nome_campo": {"value": "valor", "confidence": 0.9, "source": "ocr"}
  },
  "missing": ["campo_nao_encontrado"]
}`;

  // ── 1. Tentar Groq ───────────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const messages = [];

      // Se há imagem, usar modelo vision do Groq
      if (imageBase64 && mimeType && mimeType.startsWith('image/')) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: userPrompt }
          ]
        });
      } else {
        messages.push({ role: 'user', content: userPrompt });
      }

      const r = await fetch(GROQ_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: imageBase64 ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile',
          max_tokens: 1000,
          temperature: 0.1,
          messages,
        }),
      });

      if (r.ok) {
        const d = await r.json();
        const raw = d.choices?.[0]?.message?.content || '{}';
        const parsed = safeParseJSON(raw);
        if (parsed?.fields) return res.status(200).json(parsed);
      }
    } catch (e) {
      console.warn('[ocr-analyze] Groq failed:', e.message);
    }
  }

  // ── 2. Fallback: Gemini ──────────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const parts = [];
      if (imageBase64 && mimeType && mimeType.startsWith('image/')) {
        parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
      }
      parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

      const r = await fetch(
        `${GEMINI_BASE}/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] }),
        }
      );

      if (r.ok) {
        const d = await r.json();
        const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = safeParseJSON(raw);
        if (parsed?.fields) return res.status(200).json(parsed);
      }
    } catch (e) {
      console.warn('[ocr-analyze] Gemini failed:', e.message);
    }
  }

  // ── 3. Sem providers disponíveis — retorna vazio graciosamente ───────────
  return res.status(200).json({ fields: {}, missing: schema.map(f => f.id) });
};

function safeParseJSON(raw) {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (_) {
    return null;
  }
}
