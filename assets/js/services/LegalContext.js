// assets/js/services/LegalContext.js
// ──────────────────────────────────────────────────────────────────────────
// FASE 2 — Motor Jurídico (RAG): ponte entre o frontend e /api/legal-search.
//
// Chamado pelos prompt-builders dos 5 serviços jurídicos (arrendamento,
// procuracao, requerimento, residencia, acta) ANTES de montar o prompt
// final, para obter artigos de lei REAIS em vez das citações estáticas
// anteriores — ver docs/legal/VERIFICACAO-LEGAL.md para o histórico de
// erros que isto corrige (ex: "Lei n.º 19/2013" que não existe).
//
// IMPORTANTE — comportamento em caso de falha: esta busca NUNCA bloqueia
// a geração do documento. Se a API estiver indisponível, devolve null,
// e o prompt-builder deve usar o seu texto estático de fallback (já
// corrigido na Fase 1) em vez do RAG. Gerar o documento sem o RAG é
// preferível a não gerar o documento.
// ──────────────────────────────────────────────────────────────────────────

const ENDPOINT = '/api/legal-search';
const TIMEOUT_MS = 6000; // não vale a pena esperar mais — cai no fallback estático

/**
 * Busca artigos de lei relevantes para o contexto de um documento.
 *
 * @param {string} query — descrição em português do que se procura
 *   (ex: "procuração para venda de imóvel", "declaração de residência")
 * @param {string} serviceType — chave do serviço (ex: 'arrendamento'),
 *   usada no backend para restringir a busca aos diplomas relevantes
 * @returns {Promise<{texto: string, avisoQualidade: boolean} | null>}
 *   null quando a busca falhou ou não encontrou nada com confiança suficiente
 *   — nesse caso, o chamador deve usar o seu texto estático de fallback.
 */
export async function buscarContextoJuridico(query, serviceType) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, serviceType }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.encontrado || !Array.isArray(data.resultados) || data.resultados.length === 0) {
      return null;
    }

    const texto = formatarParaPrompt(data.resultados, data.avisoQualidade);
    return { texto, avisoQualidade: !!data.avisoQualidade };
  } catch (_) {
    // Rede em falha, timeout, ou resposta inesperada — fallback silencioso.
    // Não usar console.error aqui: isto é um caminho ESPERADO em condições
    // de rede fraca (comum no contexto moçambicano), não uma excepção rara.
    return null;
  }
}

function formatarParaPrompt(resultados, avisoQualidade) {
  const linhas = resultados.map(r => {
    const tituloParte = r.titulo ? ` (${r.titulo})` : '';
    return `- ${r.diploma}, Artigo ${r.artigo}.º${tituloParte}: ${r.texto.replace(/\s+/g, ' ').trim()}`;
  });

  let bloco = `BASE LEGAL (artigos recuperados da base de legislação moçambicana — citar EXACTAMENTE como aparecem abaixo, não adicionar nem inventar outros artigos):\n${linhas.join('\n')}`;

  if (avisoQualidade) {
    bloco += `\n\nNOTA: parte do texto acima provém de digitalização (OCR) e pode conter pequenas imprecisões de carácter — cite o número do artigo e o diploma com confiança, mas não reproduza o texto literal palavra por palavra.`;
  }

  return bloco;
}
