// api/_lib/blogContentGuard.js
// ──────────────────────────────────────────────────────────────────────────
// P1.9 (Master Hardening & Release Gate v2, Set/2026, Fase 6) — EXTENSÃO
// pedida pelo cliente: os artigos gerados "têm que evitar falar de geração
// com inteligência artificial ou falar coisas que juridicamente vai criar
// problemas ou falar coisas que o MzDocs Pro não faz".
//
// O prompt em blog.js já pede à IA para não fazer nada disto — mas um
// pedido no prompt não é uma garantia (o próprio projecto já viu, noutros
// contextos, modelos a ignorar instruções). Este ficheiro é uma segunda
// camada, determinística, aplicada DEPOIS do texto já estar gerado —
// mesmo padrão de defesa em profundidade já usado no resto do projecto
// (ex.: legalCaveatBlock no prompt + SENSITIVE_TOPIC_PATTERN a forçar
// revisão de qualquer forma, independentemente do que o prompt pediu).
//
// Se qualquer um dos scanners abaixo disparar, blog.js força
// needs_review=TRUE (nunca bloqueia/descarta o artigo — só impede que vá
// para o ar sem um humano ver primeiro), mesmo para tópicos que não são
// legal/fiscal/administrativos.
// ──────────────────────────────────────────────────────────────────────────

// Menções a "IA"/geração automática. "\bIA\b" é deliberadamente
// case-SENSITIVE (maiúsculas exactas) e testado à parte do resto — em
// minúsculas, "ia" é uma palavra portuguesa comum (pretérito imperfeito de
// "ir": "ele ia trabalhar"), que geraria falsos positivos constantes se
// fosse case-insensitive.
const AI_MENTION_PATTERN_CI = new RegExp([
  'intelig[eê]ncia\\s+artificial',
  'chatgpt', 'gpt-?\\d', '\\bllm\\b', 'modelos?\\s+de\\s+linguagem',
  'chatbot', 'rob[oô]\\s+de\\s+conversa',
  'gerado\\s+(automaticamente\\s+)?por\\s+(um[a]?\\s+)?(rob[oô]|m[aá]quina|algoritmo)',
  '\\bopenai\\b', '\\bgoogle\\s+gemini\\b', '\\bgroq\\b', '\\bcohere\\b',
  '\\bopenrouter\\b', '\\bcerebras\\b', '\\bsambanova\\b', '\\bhugging\\s*face\\b',
].join('|'), 'i');
const AI_MENTION_PATTERN_CS = /\bIA\b|\bI\.A\.(?!\w)/;

// Alegações que a plataforma NÃO cumpre hoje e que criam risco jurídico ou
// de confiança se um artigo de blog as afirmar como facto — baseado nos
// próprios avisos já existentes em legal.html ("carácter orientativo, não
// substitui aconselhamento jurídico profissional") e no estado real do
// negócio confirmado em auditorias anteriores (registo comercial ainda em
// curso, sem advogado interno, sem gateway automático de pagamento, sem
// submissão automática a entidades oficiais).
const OVERCLAIM_PATTERNS = [
  {
    id:    'legal_advice_substitute',
    label: 'sugere que substitui aconselhamento jurídico profissional',
    re:    /substitui(?:\s+o)?\s+aconselhamento\s+jur[ií]dico/i,
  },
  {
    id:    'lawyer_included',
    label: 'sugere um advogado incluído/sempre disponível na plataforma',
    re:    /advogado\s+(inclu[ií]do|gr[aá]tis|dispon[ií]vel\s+24|sempre\s+dispon[ií]vel)/i,
  },
  {
    id:    'legal_validity_guarantee',
    label: 'garante validade legal ou reconhecimento notarial que a plataforma não fornece',
    re:    /(validade\s+legal\s+garantid[ao]|certificad[oa]\s+legalmente|reconhecimento\s+not[aá]rial\s+inclu[ií]do|assinatura\s+digital\s+com\s+validade\s+legal)/i,
  },
  {
    id:    'approval_guarantee',
    label: 'garante aprovação por uma entidade externa',
    re:    /(aprova[cç][aã]o\s+garantida|garantimos\s+a\s+aceita[cç][aã]o)/i,
  },
  {
    id:    'auto_submission',
    label: 'sugere submissão automática do documento às autoridades (não existe)',
    re:    /envia(?:mos)?\s+automaticamente\s+(?:o\s+)?(?:seu\s+)?documento\s+(?:[àa]s?\s+)?(?:autoridades|reparti[cç][aã]o|conservat[oó]ria|\bINSS\b|\bAT\b)/i,
  },
  {
    id:    'company_registered',
    label: 'afirma registo comercial/NUIT que ainda está em curso',
    re:    /(empresa\s+(?:legalmente\s+)?registada|sociedade\s+licenciada|o\s+nosso\s+NUIT\s*[:é])/i,
  },
  {
    id:    'nationwide_free_delivery',
    label: 'promete entrega física gratuita em todo o país',
    re:    /entrega\s+gr[aá]tis\s+em\s+todo\s+o\s+pa[ií]s/i,
  },
  {
    id:    'support_24_7',
    label: 'promete suporte 24 horas por dia',
    re:    /suporte\s+24\s*(?:horas|\/\s*7|h\b)/i,
  },
];

function _plainText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** @returns {string|null} o termo encontrado, ou null se não houver menção a IA/geração automática. */
function detectAiMention(html) {
  const text = _plainText(html);
  const ciMatch = text.match(AI_MENTION_PATTERN_CI);
  if (ciMatch) return ciMatch[0];
  const csMatch = text.match(AI_MENTION_PATTERN_CS);
  return csMatch ? csMatch[0] : null;
}

/** @returns {Array<{id:string, label:string, match:string}>} lista de alegações arriscadas encontradas (vazia se nenhuma). */
function scanOverclaims(html) {
  const text = _plainText(html);
  const found = [];
  for (const { id, label, re } of OVERCLAIM_PATTERNS) {
    const m = text.match(re);
    if (m) found.push({ id, label, match: m[0] });
  }
  return found;
}

/**
 * Corre os dois scanners de uma vez sobre o HTML de um artigo.
 * @returns {{ aiMention: string|null, overclaims: Array<{id:string,label:string,match:string}> }}
 */
function guardBlogContent(html) {
  return {
    aiMention:  detectAiMention(html),
    overclaims: scanOverclaims(html),
  };
}

module.exports = { guardBlogContent, detectAiMention, scanOverclaims };
