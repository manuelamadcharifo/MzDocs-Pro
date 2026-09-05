// api/_lib/textSanitize.js
// ──────────────────────────────────────────────────────────────────────────
// P1.8 (Master Hardening & Release Gate v2, Set/2026) — SANITIZAÇÃO
// BACKEND DE FEEDBACK (e qualquer outro texto livre submetido por
// utilizadores que venha a ser mostrado a outras pessoas).
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual, antes desta
// correcção): `handleFeedback()` (api/admin/index.js) só fazia
// `(comment || '').trim().slice(0, 500)` antes de gravar em
// `user_feedback.comment` — nenhuma remoção de HTML, scripts, handlers de
// eventos ou esquemas de URL perigosos. `moderateComment()`
// (contentModeration.js) verifica só linguagem ofensiva, é uma camada
// completamente diferente e não relacionada com segurança de marcação.
//
// Isto por si só não seria um problema SE todos os consumidores desta
// coluna escapassem correctamente ao mostrar — mas confirmado por leitura
// de `assets/js/admin/AdminApp.js`, dois pontos NÃO escapavam:
//   - linha ~2555 (lista de feedback pendente no admin): `${f.comment ||
//     '<span ...>—</span>'}` — ZERO escaping, XSS armazenado directo,
//     executado na sessão do PRÓPRIO ADMIN ao rever comentários pendentes
//     (exactamente os mais prováveis de serem hostis, por definição).
//   - linha ~2632 (avaliações públicas aprovadas): só
//     `.replace(/</g,'&lt;')` — escapa aberturas de tag mas não `&`, `"`,
//     nem outras técnicas de injecção.
//
// Corrigido em duas frentes, como pedido explicitamente no plano de
// hardening ("O backend deve tratar feedback como texto puro. Não confiar
// apenas em escapeHtml() no frontend"):
//   1. Este módulo — sanitização no BACKEND, antes de gravar (esta função).
//   2. assets/js/admin/AdminApp.js — escaping correcto em AMBOS os pontos
//      de leitura (defesa em profundidade — nunca confiar só numa camada).
// ──────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * Remove HTML/scripts/handlers de eventos/esquemas de URL perigosos de uma
 * string de texto livre submetida por um utilizador, para que o valor
 * gravado na base de dados seja sempre texto puro seguro — nunca dependente
 * de o(s) consumidor(es) futuros escaparem correctamente ao mostrar.
 *
 * Testado explicitamente (ver tests/feedback-security.test.js) contra:
 *   <script>alert(1)</script>
 *   <img src=x onerror=alert(1)>
 *   SVG malicioso (<svg onload=...>)
 *   event handlers soltos (onclick=..., onmouseover=...)
 *   URLs javascript: (<a href="javascript:...">)
 *
 * @param {string} input
 * @param {number} maxLen  limite de tamanho aplicado DEPOIS da sanitização
 *                         (remover marcação pode reduzir o comprimento —
 *                         truncar antes poderia cortar uma tag a meio e
 *                         deixar lixo, ou desperdiçar espaço útil de texto
 *                         real cortando cedo demais).
 * @returns {string}
 */
function sanitizePlainText(input, maxLen = 500) {
  if (typeof input !== 'string') return '';
  let text = input;

  // 1. Remover POR COMPLETO tags perigosas incluindo o seu CONTEÚDO
  //    (<script>...</script>, <style>...</style>) — para estas, mesmo o
  //    texto lá dentro não deve sobreviver como texto solto.
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // 2. Remover todas as restantes tags HTML (abertura, fecho, auto-
  //    fechadas) — para estas, o TEXTO à volta/dentro é preservado como
  //    texto normal (ex.: "<b>Óptimo</b> serviço" vira "Óptimo serviço"),
  //    só a marcação em si desaparece.
  text = text.replace(/<[^>]*>/g, ' ');

  // 3. Remover esquemas de URL perigosos que possam sobreviver como texto
  //    solto (ex.: alguém escreve "javascript:alert(1)" sem nenhuma tag à
  //    volta) e ser reconstruídos por um consumidor futuro menos cuidadoso
  //    (ex.: um botão "copiar link" que monta um <a href="..."> a partir
  //    deste texto).
  text = text.replace(/javascript\s*:/gi, '');
  text = text.replace(/data\s*:\s*text\/html/gi, '');
  text = text.replace(/vbscript\s*:/gi, '');

  // 4. Remover handlers de eventos inline remanescentes (on\w+\s*=) mesmo
  //    fora de uma tag reconhecida — defesa extra para o caso de a regex
  //    de remoção de tags não apanhar alguma variante malformada de
  //    propósito para a contornar.
  text = text.replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 5. Descodificar entidades HTML básicas de volta para os caracteres
  //    literais (para não deixar "&lt;script&gt;" sobreviver como texto
  //    ambíguo que um consumidor futuro poderia decidir "desescapar" e
  //    voltar a interpretar como marcação) e voltar a passar pelos passos
  //    1-4 uma segunda vez, para apanhar HTML que só aparece depois de
  //    descodificar entidades (ex.: um payload duplamente codificado).
  const decodeEntities = (s) => s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0*60;?/gi, '<')
    .replace(/&#0*62;?/gi, '>')
    .replace(/&#x0*3c;?/gi, '<')
    .replace(/&#x0*3e;?/gi, '>');
  const decoded = decodeEntities(text);
  if (decoded !== text) {
    text = decoded
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/javascript\s*:/gi, '')
      .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }

  // 6. Normalizar espaços em branco (várias tags/handlers removidos deixam
  //    espaços a mais) e caracteres de controlo invisíveis.
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  // 7. Limite de tamanho — sempre depois da sanitização (ver JSDoc acima).
  return text.slice(0, maxLen);
}

module.exports = { sanitizePlainText };
