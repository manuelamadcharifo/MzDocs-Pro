
// api/extract-template.js
// Extracção de template via visão de imagem — um único pedido à IA.
// Envia a imagem + instruções numa só chamada, pedindo directamente o JSON.
// Suporta: Gemini (primário) → OpenRouter vision (fallback).

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const OR_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OR_VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5-8b',
  'meta-llama/llama-4-scout:free',
  'microsoft/phi-4-multimodal-instruct:free',
];

const SERVICE_NAMES = {
  cv: 'Currículo (CV)', carta: 'Carta', orcamento: 'Orçamento',
  arrendamento: 'Contrato de Arrendamento', recibo: 'Recibo/Factura',
  prestacao: 'Contrato de Prestação', recomendacao: 'Carta de Recomendação',
  requerimento: 'Requerimento', residencia: 'Declaração de Residência',
  planonegocio: 'Plano de Negócios', procuracao: 'Procuração',
  licenca: 'Licença', acta: 'Acta', trabalho: 'Trabalho Académico',
};

function buildPrompt(docType) {
  return `Analisa esta imagem de um template de ${docType} e gera código HTML+CSS que replica FIELMENTE o layout visual observado.

Responde APENAS com este JSON (sem markdown, sem \`\`\`json, sem texto extra):
{
  "name": "Nome profissional de 2-3 palavras (ex: Clássico Profissional, Moderno Colorido, Executivo Premium, Bicolor Elegante, Jovem Dinâmico)",
  "description": "Frase curta (máx 6 palavras) descrevendo o estilo",
  "accent": "#hexcolor da cor de destaque principal observada",
  "bg": "#hexcolor do fundo geral observado",
  "htmlTemplate": "HTML COMPLETO usando EXACTAMENTE as classes e estrutura abaixo",
  "css": "CSS COMPLETO com as cores, fontes e espaçamentos EXACTOS observados na imagem"
}

ESTRUTURA OBRIGATÓRIA DO htmlTemplate:
- SE TEM SIDEBAR LATERAL: <div class="cv-page cv-two-col"><aside class="cv-sidebar"><div class="cv-avatar">{{INICIAIS}}</div><div class="cv-sidebar-name">{{NOME}}</div><div class="cv-sidebar-cargo">{{CARGO}}</div><div class="cv-sidebar-divider"></div><div class="cv-section"><h2 class="cv-section-title">Contactos</h2><div class="cv-contact-item">📞 {{CONTACTO}}</div><div class="cv-contact-item">✉️ {{EMAIL}}</div><div class="cv-contact-item">📍 {{LOCALIZACAO}}</div></div><div class="cv-section"><h2 class="cv-section-title">Competências</h2><ul class="cv-skills-list">{{HABILIDADES_LIST}}</ul></div><div class="cv-section"><h2 class="cv-section-title">Línguas</h2>{{LINGUAS}}</div></aside><main class="cv-main"><section class="cv-section"><h2 class="cv-section-title">Objectivo Profissional</h2><p class="cv-text">{{OBJECTIVO}}</p></section><section class="cv-section"><h2 class="cv-section-title">Formação Académica</h2><div class="cv-entries">{{FORMACAO}}</div></section><section class="cv-section"><h2 class="cv-section-title">Experiência Profissional</h2><div class="cv-entries">{{EXPERIENCIA}}</div></section><section class="cv-section"><h2 class="cv-section-title">Realização de Destaque</h2><p class="cv-text">{{REALIZACAO}}</p></section>{{EXTRA}}</main></div>
- SE NÃO TEM SIDEBAR (cabeçalho colorido no topo): <div class="cv-page"><header class="cv-header"><div class="cv-avatar">{{INICIAIS}}</div><div class="cv-header-info"><h1 class="cv-name">{{NOME}}</h1><p class="cv-cargo">{{CARGO}}</p><div class="cv-contacts"><span>📞 {{CONTACTO}}</span><span>✉️ {{EMAIL}}</span><span>📍 {{LOCALIZACAO}}</span></div></div></header><div class="cv-body"><section class="cv-section"><h2 class="cv-section-title">Objectivo Profissional</h2><p class="cv-text">{{OBJECTIVO}}</p></section><section class="cv-section"><h2 class="cv-section-title">Formação Académica</h2><div class="cv-entries">{{FORMACAO}}</div></section><section class="cv-section"><h2 class="cv-section-title">Experiência Profissional</h2><div class="cv-entries">{{EXPERIENCIA}}</div></section><section class="cv-section"><h2 class="cv-section-title">Competências</h2><ul class="cv-skills-list">{{HABILIDADES_LIST}}</ul></section>{{EXTRA}}</div></div>

PLACEHOLDERS disponíveis: {{NOME}}, {{CARGO}}, {{CONTACTO}}, {{EMAIL}}, {{LOCALIZACAO}}, {{INICIAIS}}, {{OBJECTIVO}}, {{FORMACAO}}, {{EXPERIENCIA}}, {{HABILIDADES}}, {{HABILIDADES_LIST}}, {{LINGUAS}}, {{REALIZACAO}}, {{EXTRA}}

CSS OBRIGATÓRIO (substitui COR_* pelas cores EXACTAS observadas na imagem):
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:FONTE_REAL; font-size:10pt; color:COR_TEXTO; width:210mm; min-height:297mm; background:COR_FUNDO; }
.cv-page { width:210mm; min-height:297mm; background:COR_FUNDO; }
.cv-two-col { display:flex; min-height:297mm; }
.cv-sidebar { width:LARGURA_SIDEBAR_mm; background:COR_SIDEBAR; color:COR_SIDEBAR_TEXTO; padding:14mm 8mm; flex-shrink:0; }
.cv-main { flex:1; padding:12mm 10mm; }
.cv-avatar { width:52pt; height:52pt; border-radius:50%; background:rgba(255,255,255,0.2); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18pt; font-weight:700; margin:0 auto 10pt; border:2px solid rgba(255,255,255,0.3); }
.cv-sidebar-name { font-size:12pt; font-weight:800; text-align:center; margin-bottom:3pt; word-break:break-word; }
.cv-sidebar-cargo { font-size:8.5pt; text-align:center; opacity:0.82; margin-bottom:10pt; }
.cv-sidebar-divider { height:1px; background:rgba(255,255,255,0.25); margin:8pt 0; }
.cv-sidebar .cv-section { margin-bottom:10pt; }
.cv-sidebar .cv-section-title { font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; opacity:0.7; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:3pt; margin-bottom:5pt; }
.cv-contact-item { font-size:8.5pt; margin-bottom:4pt; opacity:0.9; word-break:break-all; }
.cv-skills-list { list-style:none; padding:0; }
.cv-skills-list li { font-size:8.5pt; padding:3pt 0; border-bottom:1px solid rgba(255,255,255,0.1); opacity:0.9; }
.cv-lang-item { font-size:8.5pt; margin-bottom:5pt; }
.cv-lang-name { font-weight:700; display:block; }
.cv-lang-bar { background:rgba(255,255,255,0.2); height:3pt; border-radius:2pt; margin-top:2pt; }
.cv-lang-fill { background:rgba(255,255,255,0.7); height:100%; border-radius:2pt; }
.cv-header { background:COR_HEADER; color:COR_HEADER_TEXTO; padding:10mm 12mm; display:flex; align-items:center; gap:12pt; }
.cv-name { font-size:18pt; font-weight:800; line-height:1.1; margin-bottom:2pt; }
.cv-cargo { font-size:10pt; opacity:0.85; margin-bottom:5pt; }
.cv-contacts { display:flex; flex-wrap:wrap; gap:4pt 12pt; font-size:8.5pt; opacity:0.9; }
.cv-body { padding:10mm 12mm; }
.cv-main .cv-section, .cv-body .cv-section { margin-bottom:10pt; }
.cv-main .cv-section-title, .cv-body .cv-section-title { font-size:9.5pt; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:COR_ACCENT; border-bottom:2px solid COR_ACCENT; padding-bottom:2pt; margin-bottom:6pt; }
.cv-text { font-size:9.5pt; line-height:1.55; color:#374151; }
.cv-entries { font-size:9.5pt; }
.cv-entry { margin-bottom:6pt; }
.cv-entry-date { font-size:8pt; color:#6b7280; font-style:italic; }
.cv-entry-title { font-size:10pt; font-weight:700; color:#111827; margin-top:1pt; }
.cv-entry-company { font-size:9pt; color:#4b5563; margin-top:1pt; }
.cv-entry-bullets { padding-left:12pt; margin-top:3pt; }
.cv-entry-bullets li { font-size:9pt; margin-bottom:1.5pt; }

IMPORTANTE: Usa as cores e layout EXACTOS da imagem. Não inventar cores — retirar da imagem.`;
}

function parseJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim()); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  // Tentar extrair campos individualmente se o JSON está partido
  throw new Error('JSON inválido na resposta da IA');
}

async function callGeminiVision(apiKey, imageBase64, mimeType, prompt) {
  let lastErr;
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt },
          ]}],
          generationConfig: { maxOutputTokens: 8000, temperature: 0.2 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `Gemini HTTP ${res.status} (${model})`);
        if (res.status === 429 || res.status === 503) { console.warn(`[extract-template] Gemini quota ${model}, a saltar`); continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) throw new Error(`Gemini resposta vazia (${data.candidates?.[0]?.finishReason})`);
      console.log(`[extract-template] OK via Gemini ${model} (${text.length} chars)`);
      return text;
    } catch (err) {
      console.warn(`[extract-template] Gemini ${model}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini: todos os modelos falharam');
}

async function callOpenRouterVision(apiKey, imageBase64, mimeType, prompt) {
  let lastErr;
  for (const model of OR_VISION_MODELS) {
    try {
      const res = await fetch(OR_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': SITE_URL,
          'X-Title': 'MzDocs Pro',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          temperature: 0.2,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ]}],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `OR HTTP ${res.status} (${model})`);
        if (res.status === 429) { console.warn(`[extract-template] OR quota ${model}, a saltar`); continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('OR resposta vazia');
      console.log(`[extract-template] OK via OR ${model} (${text.length} chars)`);
      return text;
    } catch (err) {
      console.warn(`[extract-template] OR ${model}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('OpenRouter: todos os modelos falharam');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const { imageBase64, mimeType, serviceKey } = body || {};
  if (!imageBase64 || !serviceKey) {
    return res.status(400).json({ error: 'imageBase64 e serviceKey são obrigatórios' });
  }
  if (imageBase64.length > 14 * 1024 * 1024) {
    return res.status(413).json({ error: 'Imagem demasiado grande (máx 10MB)' });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const OR_KEY     = process.env.OPENROUTER_API_KEY || process.env.OR_API_KEY;

  if (!GEMINI_KEY && !OR_KEY) {
    return res.status(500).json({ error: 'Nenhuma API key configurada (GEMINI_API_KEY ou OPENROUTER_API_KEY)' });
  }

  const docType = SERVICE_NAMES[serviceKey] || serviceKey;
  const imgMime = mimeType || 'image/jpeg';
  const prompt  = buildPrompt(docType);

  try {
    let rawText = '';

    // Tentar Gemini primeiro (um único pedido com visão + geração)
    if (GEMINI_KEY) {
      try {
        rawText = await callGeminiVision(GEMINI_KEY, imageBase64, imgMime, prompt);
      } catch (geminiErr) {
        console.warn('[extract-template] Gemini falhou, a tentar OpenRouter:', geminiErr.message);
        if (OR_KEY) {
          rawText = await callOpenRouterVision(OR_KEY, imageBase64, imgMime, prompt);
        } else {
          throw geminiErr;
        }
      }
    } else {
      rawText = await callOpenRouterVision(OR_KEY, imageBase64, imgMime, prompt);
    }

    const parsed = parseJSON(rawText);
    if (!parsed.htmlTemplate || !parsed.css) {
      throw new Error('Resposta inválida da IA — htmlTemplate ou css em falta');
    }

    return res.status(200).json({
      ok:           true,
      name:         parsed.name         || 'Template Personalizado',
      description:  parsed.description  || 'Extraído da sua imagem',
      accent:       parsed.accent       || '#3B82F6',
      bg:           parsed.bg           || '#fff',
      htmlTemplate: parsed.htmlTemplate,
      css:          parsed.css,
    });

  } catch (err) {
    console.error('[extract-template] Erro final:', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno ao extrair template' });
  }
};
