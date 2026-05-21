// api/admin/generate-page.js — v8.1
// Usa IA (mesmo sistema multi-provider do generate-document.js) para gerar
// um artigo de blog completo em HTML a partir de um título e palavras-chave.
// Apenas administradores.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';
const SITE_NAME = 'MzDocs Pro';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Auth admin ──────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.SUPABASE_ANON_KEY;

  const supabase      = createClient(supabaseUrl, anonKey || serviceKey, { realtime: { transport: ws } });
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });

  // ── Parâmetros ──────────────────────────────────────────────────────────
  const { title, keywords = '', tone = 'informativo', word_count = 600 } = req.body;
  if (!title) return res.status(400).json({ error: 'title é obrigatório' });

  const prompt = buildPrompt(title, keywords, tone, word_count);

  // ── Gerar com IA (tentativa em cascata pelos providers disponíveis) ──────
  let html = null;
  let usedProvider = null;

  // 1. Groq
  if (!html && process.env.GROQ_API_KEY) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 3000,
          temperature: 0.4,
        }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content;
      if (text && text.length > 200) { html = extractHTML(text); usedProvider = 'groq'; }
    } catch (_) {}
  }

  // 2. Gemini
  if (!html && process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.length > 200) { html = extractHTML(text); usedProvider = 'gemini'; }
    } catch (_) {}
  }

  // 3. OpenRouter
  if (!html && process.env.OPENROUTER_API_KEY) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': SITE_URL,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 3000,
        }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content;
      if (text && text.length > 200) { html = extractHTML(text); usedProvider = 'openrouter'; }
    } catch (_) {}
  }

  if (!html) {
    return res.status(503).json({ error: 'Nenhum provider de IA disponível. Verifique as API keys.' });
  }

  // ── Gerar meta_description automática (primeiros 155 caracteres do texto) ─
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const meta_description = plainText.slice(0, 155).trim() + (plainText.length > 155 ? '…' : '');

  // ── Gerar slug sugerido a partir do título ────────────────────────────────
  const slug = slugify(title);

  return res.status(200).json({
    success:          true,
    title,
    slug,
    meta_description,
    content_html:     html,
    ai_generated:     true,
    provider:         usedProvider,
  });
};

// ── Prompt ─────────────────────────────────────────────────────────────────
function buildPrompt(title, keywords, tone, wordCount) {
  return `És um especialista em SEO e redacção de conteúdo para o mercado moçambicano.

Escreve um artigo de blog completo sobre: "${title}"
Palavras-chave a incluir naturalmente: ${keywords || 'documentos, Moçambique'}
Tom: ${tone}
Extensão aproximada: ${wordCount} palavras

REGRAS OBRIGATÓRIAS:
- Escreve em português europeu (não brasileiro)
- O conteúdo deve ser útil e específico para Moçambique (exemplos locais, referências a instituições moçambicanas, M-Pesa, etc.)
- Inclui H2 e H3 para estruturar o artigo
- Inclui uma secção de FAQ com 3-4 perguntas frequentes no final
- Menciona que o MzDocs Pro pode ajudar a criar estes documentos rapidamente com IA
- NÃO inclui a tag <html>, <head>, <body> ou <!DOCTYPE> — apenas o conteúdo do artigo
- Devolve APENAS HTML válido: usa <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>
- Não uses Markdown, não uses blocos de código, apenas HTML puro

Começa directamente com o conteúdo HTML, sem preâmbulo.`;
}

// ── Extrair HTML limpo da resposta da IA ──────────────────────────────────
function extractHTML(text) {
  // Remover blocos de código markdown (```html ... ```)
  let clean = text.replace(/```html?\n?/gi, '').replace(/```\n?/g, '').trim();
  // Remover tags de documento completo se a IA as incluiu
  clean = clean
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
    .trim();
  return clean;
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}
