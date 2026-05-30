// api/extract-template.js
// Extracção de template via visão de imagem — usa Gemini (gratuito, já no projecto).
// Processo em 2 passos:
//   1. Análise visual detalhada da imagem (Gemini vision)
//   2. Geração de htmlTemplate + css fiel ao layout observado (Gemini texto)
// Fallback: OpenRouter com modelos gratuitos que suportam visão.

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-2.5-flash: suporta visão, gratuito (15 RPM / 1M TPD no tier free)
// gemini-2.0-flash: fallback
const GEMINI_VISION_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

// OpenRouter — modelos gratuitos com suporte a imagem (vision)
const OR_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OR_VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5-8b',
  'meta-llama/llama-4-scout:free',   // Llama 4 Scout tem vision
  'microsoft/phi-4-multimodal-instruct:free',
];

const SERVICE_NAMES = {
  cv:           'Currículo (CV)',
  carta:        'Carta',
  orcamento:    'Orçamento',
  arrendamento: 'Contrato de Arrendamento',
  recibo:       'Recibo/Factura',
  prestacao:    'Contrato de Prestação',
  recomendacao: 'Carta de Recomendação',
  requerimento: 'Requerimento',
  residencia:   'Declaração de Residência',
  planonegocio: 'Plano de Negócios',
  procuracao:   'Procuração',
  licenca:      'Licença',
  acta:         'Acta',
  trabalho:     'Trabalho Académico',
};

// ── Gemini com visão ────────────────────────────────────────────────────────
async function callGeminiVision(apiKey, imageBase64, mimeType, textPrompt) {
  let lastErr;
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: textPrompt },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.3,
          },
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
        lastErr = new Error(d?.error?.message || `Gemini vision HTTP ${res.status}`);
        if (res.status === 429) { console.warn(`[Gemini vision] quota ${model}, a saltar`); continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) throw new Error(`Gemini vision vazio (${data.candidates?.[0]?.finishReason})`);
      console.log(`[extract-template] Análise OK via Gemini vision ${model}`);
      return text;
    } catch (err) {
      console.warn(`[Gemini vision] ${model} falhou:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini vision: todos os modelos falharam');
}

// ── Gemini texto puro (para o passo 2 de geração) ──────────────────────────
async function callGeminiText(apiKey, textPrompt) {
  let lastErr;
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
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
        lastErr = new Error(d?.error?.message || `Gemini HTTP ${res.status}`);
        if (res.status === 429) { console.warn(`[Gemini text] quota ${model}, a saltar`); continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) throw new Error(`Gemini texto vazio (${data.candidates?.[0]?.finishReason})`);
      console.log(`[extract-template] Geração OK via Gemini text ${model}`);
      return text;
    } catch (err) {
      console.warn(`[Gemini text] ${model} falhou:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini text: todos os modelos falharam');
}

// ── OpenRouter vision (fallback) ────────────────────────────────────────────
async function callOpenRouterVision(apiKey, imageBase64, mimeType, textPrompt) {
  let lastErr;
  for (const model of OR_VISION_MODELS) {
    try {
      const res = await fetch(OR_BASE, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer':  SITE_URL,
          'X-Title':       'MzDocs Pro',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          temperature: 0.3,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              { type: 'text', text: textPrompt },
            ],
          }],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `OR vision HTTP ${res.status}`);
        if (res.status === 429) { console.warn(`[OR vision] rate limit ${model}, a saltar`); continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('OpenRouter vision: resposta vazia');
      console.log(`[extract-template] Análise OK via OpenRouter ${model}`);
      return text;
    } catch (err) {
      console.warn(`[OR vision] ${model} falhou:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('OpenRouter vision: todos os modelos falharam');
}

// ── OpenRouter texto (fallback geração) ────────────────────────────────────
async function callOpenRouterText(apiKey, textPrompt) {
  const textModels = [
    'google/gemini-2.0-flash-exp:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen3-8b:free',
  ];
  let lastErr;
  for (const model of textModels) {
    try {
      const res = await fetch(OR_BASE, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer':  SITE_URL,
          'X-Title':       'MzDocs Pro',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          temperature: 0.2,
          messages: [{ role: 'user', content: textPrompt }],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `OR HTTP ${res.status}`);
        if (res.status === 429) { console.warn(`[OR text] rate limit ${model}, a saltar`); continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('OpenRouter text: resposta vazia');
      console.log(`[extract-template] Geração OK via OpenRouter text ${model}`);
      return text;
    } catch (err) {
      console.warn(`[OR text] ${model} falhou:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('OpenRouter text: todos os modelos falharam');
}

// ── Parse JSON robusto ──────────────────────────────────────────────────────
function parseJSON(text) {
  // Tentar directamente
  try { return JSON.parse(text.trim()); } catch (_) {}
  // Remover markdown fences
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim()); } catch (_) {}
  // Extrair o primeiro bloco JSON do texto
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) {}
  }
  throw new Error('Não foi possível extrair JSON válido da resposta');
}

// ── Handler principal ───────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  SITE_URL);
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

  const docType  = SERVICE_NAMES[serviceKey] || serviceKey;
  const imgMime  = mimeType || 'image/jpeg';

  const analysisPrompt = `Analisa esta imagem de um template de ${docType} com MÁXIMO DETALHE visual. Descreve:

1. LAYOUT GERAL: quantas colunas? Existe sidebar/barra lateral? Onde está o cabeçalho? Largura aproximada da sidebar em mm?
2. CORES EXACTAS: cor de fundo da página (hex), cor do cabeçalho/sidebar (hex), cor do texto principal (hex), cor de accent (hex).
3. TIPOGRAFIA: tamanho do nome principal, estilo dos títulos de secção (maiúsculas? sublinhado? negrito? linha decorativa?). Serif ou sans-serif?
4. SECÇÕES VISÍVEIS: lista TODAS por ordem exacta (ex: nome, cargo, contactos, objectivo, formação, experiência, competências, línguas).
5. ELEMENTOS ESPECIAIS: avatar/círculo com iniciais? barras de progresso? ícones? bordas coloridas?
6. ESPAÇAMENTOS: padding interno, gaps entre elementos (apertado/médio/espaçado).
7. NOME SUGERIDO: propõe um nome profissional de 2-3 palavras ao estilo: "Clássico Profissional", "Moderno Colorido", "Executivo Premium", "Jovem Dinâmico", "Bicolor Elegante".

Responde em texto detalhado com todos os detalhes observados.`;

  try {
    // ── PASSO 1: Análise visual da imagem ─────────────────────────────────
    let analysis = '';
    if (GEMINI_KEY) {
      analysis = await callGeminiVision(GEMINI_KEY, imageBase64, imgMime, analysisPrompt);
    } else {
      analysis = await callOpenRouterVision(OR_KEY, imageBase64, imgMime, analysisPrompt);
    }

    // ── PASSO 2: Geração de htmlTemplate + css ────────────────────────────
    const genPrompt = `És um especialista em HTML/CSS para documentos profissionais. Com base na análise visual abaixo, gera o código que replica FIELMENTE o template observado.

ANÁLISE DO TEMPLATE:
${analysis}

TIPO DE DOCUMENTO: ${docType}

Gera APENAS este JSON (sem markdown, sem \`\`\`json, sem texto extra):
{
  "name": "Nome profissional sugerido na análise (2-3 palavras)",
  "description": "Frase curta descrevendo o estilo visual",
  "accent": "#hexcolor da cor de destaque principal",
  "bg": "#hexcolor do fundo do card preview",
  "htmlTemplate": "HTML COMPLETO fiel ao layout observado com todos os placeholders",
  "css": "CSS COMPLETO que replica exactamente cores, fontes, espaçamentos e layout"
}

REGRAS PARA htmlTemplate:
- Com sidebar: <div class="cv-page cv-two-col"><aside class="cv-sidebar">SIDEBAR</aside><main class="cv-main">PRINCIPAL</main></div>
- Sem sidebar: <div class="cv-page">CONTEÚDO</div>
- Placeholders: {{NOME}}, {{CARGO}}, {{CONTACTO}}, {{EMAIL}}, {{LOCALIZACAO}}, {{INICIAIS}}, {{OBJECTIVO}}, {{FORMACAO}}, {{EXPERIENCIA}}, {{HABILIDADES}}, {{HABILIDADES_LIST}}, {{LINGUAS}}, {{REALIZACAO}}, {{EXTRA}}
- Secções: <div class="cv-section"><h2 class="cv-section-title">TÍTULO</h2>CONTEÚDO</div>
- Entradas: <div class="cv-entry"><p class="cv-entry-date">período</p><p class="cv-entry-title">cargo</p><p class="cv-entry-company">empresa | local</p><ul class="cv-entry-bullets"><li>realização</li></ul></div>
- Avatar: <div class="cv-avatar">{{INICIAIS}}</div>
- Skills: <ul class="cv-skills-list">{{HABILIDADES_LIST}}</ul>
- Línguas: <div class="cv-lang-item"><span class="cv-lang-name">Português</span><span class="cv-lang-level">Nativo</span><div class="cv-lang-bar"><div class="cv-lang-fill" style="width:100%"></div></div></div>

REGRAS PARA css (cores EXACTAS da análise, NUNCA genéricas):
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:FONTE_REAL; width:210mm; min-height:297mm; color:COR_TEXTO_REAL; }
.cv-page { width:210mm; min-height:297mm; background:COR_FUNDO_REAL; }
.cv-two-col { display:flex; min-height:297mm; }
.cv-sidebar { width:LAGURAmm; background:COR_SIDEBAR; padding:Xmm Ymm; flex-shrink:0; }
.cv-main { flex:1; padding:Xmm Ymm; }
.cv-avatar { width:52pt; height:52pt; border-radius:50%; background:COR_ACCENT; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18pt; font-weight:700; margin:0 auto 14pt; }
.cv-section { margin-bottom:12pt; }
.cv-section-title { font-size:10pt; font-weight:700; color:COR_TITULO; text-transform:uppercase; border-bottom:1px solid COR; padding-bottom:3pt; margin-bottom:6pt; }
.cv-entry { margin-bottom:7pt; }
.cv-entry-date { font-size:8.5pt; color:COR_DATA; }
.cv-entry-title { font-size:10pt; font-weight:700; }
.cv-entry-company { font-size:9pt; }
.cv-entry-bullets { padding-left:11pt; margin-top:3pt; }
.cv-entry-bullets li { font-size:9pt; margin-bottom:2pt; }
.cv-skills-list { list-style:none; padding:0; }
.cv-skills-list li { font-size:9.5pt; padding:2pt 0; }
.cv-lang-bar { background:rgba(0,0,0,0.15); height:4pt; border-radius:2pt; }
.cv-lang-fill { background:COR_ACCENT; height:100%; border-radius:2pt; }`;

    let genText = '';
    if (GEMINI_KEY) {
      try { genText = await callGeminiText(GEMINI_KEY, genPrompt); }
      catch (e) {
        console.warn('[extract-template] Gemini text falhou, a tentar OR:', e.message);
        if (OR_KEY) genText = await callOpenRouterText(OR_KEY, genPrompt);
        else throw e;
      }
    } else {
      genText = await callOpenRouterText(OR_KEY, genPrompt);
    }

    const parsed = parseJSON(genText);
    if (!parsed.htmlTemplate || !parsed.css) {
      throw new Error('Resposta inválida — htmlTemplate ou css em falta');
    }

    return res.status(200).json({
      ok:           true,
      name:         parsed.name         || 'Template Personalizado',
      description:  parsed.description  || 'Extraído da sua imagem',
      accent:       parsed.accent        || '#3B82F6',
      bg:           parsed.bg            || '#fff',
      htmlTemplate: parsed.htmlTemplate,
      css:          parsed.css,
    });

  } catch (err) {
    console.error('[extract-template] Erro:', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno ao extrair template' });
  }
};
