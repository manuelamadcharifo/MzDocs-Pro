// api/_lib/piiRedaction.js — v1.0
// ─────────────────────────────────────────────────────────────────────────
// SEGURANÇA (auditoria Jul/2026, item 5 — "Conteúdo enviado para fornecedores
// de IA externos"): antes desta correcção, o texto completo do prompt (que
// pode conter número de BI, NUIT, contactos e morada do utilizador, porque
// vem directamente dos campos de formulário) era enviado tal e qual aos
// fornecedores de inferência (Groq, Gemini, Cerebras, etc.). Alguns destes
// fornecedores, em planos gratuitos, podem reter/usar prompts para treino.
//
// Este módulo faz uma redacção conservadora — só substitui padrões muito
// específicos e de baixo risco de falso positivo (BI moçambicano, NUIT com
// contexto explícito, e-mail, telefone moçambicano) por marcadores opacos
// (ex: "‹‹BI_1››") antes de enviar o prompt ao motor de IA, e restaura os
// valores reais no texto devolvido, antes de o mostrar ao utilizador.
//
// IMPORTANTE — isto é defesa em profundidade, não uma garantia absoluta:
//   • Um modelo de linguagem pode, raramente, não reproduzir o marcador
//     exactamente (reformatação, tradução, resumo). Nesse caso o marcador
//     fica visível no documento final em vez do valor restaurado — é um
//     defeito visível e fácil de detectar (não um vazamento silencioso),
//     e o utilizador pode sempre corrigir manualmente ou pedir para o
//     assistente reescrever esse campo.
//   • Não substitui o cuidado geral de minimização de dados: continua a ser
//     preferível, sempre que o desenho do formulário permitir, preencher
//     estes campos directamente no documento final sem passar pelo modelo.
// ─────────────────────────────────────────────────────────────────────────

// BI moçambicano: 12 dígitos + 1 letra de verificação (ex: 110100123456A).
// Padrão distintivo — baixo risco de apanhar outro tipo de número por engano.
const BI_PATTERN = /\b(\d{12})([A-Za-z])\b/g;

// NUIT: 9 dígitos — só redigido quando precedido da palavra "NUIT" a uma
// distância curta, para não confundir com números de telefone (também têm
// 9 dígitos em Moçambique). Isto reduz drasticamente falsos positivos.
const NUIT_PATTERN = /\b(NUIT|N\.?U\.?I\.?T\.?)\s*[:\-]?\s*(\d{9})\b/gi;

// Telefone moçambicano: 9 dígitos começados por 8 (82/83/84/85/86/87),
// com ou sem prefixo +258.
const PHONE_PATTERN = /(\+?258\s?)?(\b8[2-7]\d{7}\b)/g;

// E-mail — padrão simples, suficiente para o caso de uso (texto livre de
// formulário, não validação de RFC completa).
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

const MARK_OPEN  = '\u2039\u2039'; // ‹‹
const MARK_CLOSE = '\u203a\u203a'; // ››

/**
 * Substitui BI, NUIT, telefone e e-mail encontrados em `text` por
 * marcadores opacos e devolve o texto redigido + o mapa para restaurar.
 *
 * @param {string} text
 * @returns {{ text: string, tokens: Record<string,string>, count: number }}
 */
function redactSensitive(text) {
  if (!text || typeof text !== 'string') return { text: text || '', tokens: {}, count: 0 };

  const tokens = {};
  let n = 0;
  let out = text;

  const nextToken = (prefix, value) => {
    n += 1;
    const token = `${MARK_OPEN}${prefix}_${n}${MARK_CLOSE}`;
    tokens[token] = value;
    return token;
  };

  // Ordem importa: BI (dígitos+letra) antes de NUIT/telefone (só dígitos),
  // para não haver sobreposição de padrões.
  out = out.replace(BI_PATTERN, (full) => nextToken('BI', full));
  out = out.replace(NUIT_PATTERN, (full, label, digits) => {
    const token = nextToken('NUIT', digits);
    // Preserva exactamente o separador original entre a etiqueta e o número
    // (":", "-", espaço, ou nada) — só os dígitos são substituídos pelo
    // marcador, para que a restauração reproduza o texto original ao byte.
    return full.replace(digits, token);
  });
  out = out.replace(PHONE_PATTERN, (full) => nextToken('TEL', full));
  out = out.replace(EMAIL_PATTERN, (full) => nextToken('EMAIL', full));

  return { text: out, tokens, count: n };
}

/**
 * Restaura no texto devolvido pelo modelo os valores reais a partir do
 * mapa de tokens produzido por redactSensitive(). Segura mesmo que algum
 * token não apareça no texto (modelo pode não o ter reproduzido).
 *
 * @param {string} text
 * @param {Record<string,string>} tokens
 * @returns {string}
 */
function restoreSensitive(text, tokens) {
  if (!text || typeof text !== 'string' || !tokens) return text || '';
  let out = text;
  for (const [token, value] of Object.entries(tokens)) {
    // split/join evita problemas de caracteres especiais do token em regex
    out = out.split(token).join(value);
  }
  return out;
}

module.exports = { redactSensitive, restoreSensitive };
