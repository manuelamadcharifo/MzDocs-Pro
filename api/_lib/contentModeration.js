// api/_lib/contentModeration.js
// ─────────────────────────────────────────────────────────────────────────
// Filtro leve de conteúdo abusivo para comentários de avaliações públicas
// (ver handleFeedback em api/admin/index.js). Não é perfeito — nenhum
// filtro de palavras é — mas cobre os casos mais comuns em português (e
// alguns em inglês, comum em spam) para que nenhum comentário obviamente
// ofensivo chegue a aparecer publicamente sem revisão humana.
//
// Três resultados possíveis:
//   'clean'    → sem sinais de abuso, pode ser aprovado automaticamente
//   'flagged'  → linguagem duvidosa/palavrão leve — fica "pending" à
//                espera de revisão de um admin antes de aparecer publicamente
//   'blocked'  → discurso de ódio, ameaças ou spam óbvio — a submissão é
//                rejeitada de imediato, nunca chega a gravar-se como
//                pública nem entra na fila de moderação
//
// Isto é defesa em profundidade: MESMO um comentário 'clean' só fica
// público depois de aprovado automaticamente por esta função — nunca por
// omissão de moderação nenhuma. Ver approvalStatusFor() no fim do ficheiro.
// ─────────────────────────────────────────────────────────────────────────

// Discurso de ódio / ameaças / conteúdo que nunca deve ser gravado, nem
// para fila de moderação — bloqueio imediato.
const BLOCK_PATTERNS = [
  /\bmata(r|-te|-vos)?\b/i,
  /\bvou\s+te\s+matar\b/i,
  /\bmorr(e|am)\s+(tu|todos|voc[eê]s)\b/i,
  /\bfilho\s+da\s+puta\b/i,
  /\bfdp\b/i,
  /\bviado\s+de\s+merda\b/i,
  /\bpreto\s+de\s+merda\b/i,
  /\bmac[au]a\s+de\s+merda\b/i,
  // spam/phishing óbvio em comentário de avaliação
  /https?:\/\/\S+/i,
  /\bwa\.me\/\d+/i,
  /\bwhatsapp\S*\d{8,}/i,
];

// Linguagem ofensiva mas não extrema — passa a "pending" para um humano
// decidir, em vez de ficar pública automaticamente ou ser rejeitada sem
// hipótese de contexto (pode ser uma crítica legítima e dura, não abuso).
const FLAG_PATTERNS = [
  /\bmerda\b/i,
  /\bcaralho\b/i,
  /\bfoda-?se\b/i,
  /\bputa\b/i,
  /\bcabr[ãa]o\b/i,
  /\bidiota\b/i,
  /\bburro(s)?\b/i,
  /\bin[uú]til\b/i,
  /\bpor(c|k)aria\b/i,
  /\blix(o|a)\b/i,
  /\bscam\b/i,
  /\bgolpe\b/i,
  /\broubo\b/i,
  /\bladr[ãa]o\b/i,
  /\bnojent[oa]\b/i,
  /\bodeio\b/i,
];

// Repetição excessiva de caracteres ("nãooooooo", "!!!!!!!!") ou de
// maiúsculas — sinal fraco de spam/raiva descontrolada, não bloqueia
// sozinho mas soma para "flagged".
function _hasSpammyPattern(text) {
  return /(.)\1{5,}/.test(text) || /[A-ZÀ-Ú]{15,}/.test(text);
}

/**
 * Avalia um comentário de avaliação e devolve 'clean' | 'flagged' | 'blocked'.
 * @param {string} text
 */
function moderateComment(text) {
  const t = (text || '').trim();
  if (!t) return 'clean'; // sem comentário, só estrelas — nada a moderar

  for (const re of BLOCK_PATTERNS) {
    if (re.test(t)) return 'blocked';
  }
  for (const re of FLAG_PATTERNS) {
    if (re.test(t)) return 'flagged';
  }
  if (_hasSpammyPattern(t)) return 'flagged';

  return 'clean';
}

/**
 * Decide o status inicial a gravar na tabela user_feedback a partir do
 * resultado da moderação e da nota dada. Notas muito baixas (1–2 estrelas)
 * com comentário ficam sempre "pending" mesmo que o texto pareça limpo —
 * são o tipo de review com maior valor para o negócio rever antes de ser
 * pública (pode ser um problema real a corrigir, não abuso).
 */
function approvalStatusFor(moderationResult, rating, hasComment) {
  if (moderationResult === 'blocked') return null; // nunca gravar como pública
  if (moderationResult === 'flagged') return 'pending';
  if (hasComment && rating <= 2) return 'pending';
  return 'approved';
}

module.exports = { moderateComment, approvalStatusFor };
