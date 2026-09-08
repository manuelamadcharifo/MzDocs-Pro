// tests/reedit-page-break-regression.test.js
// Bug real reportado por capturas de ecrã (Set/2026): ao reeditar um
// documento por IA no editor, os marcadores de página ficavam expostos
// como texto literal no documento final ("page break exposto"), o modelo
// aplicado parecia "desaparecer", e fechar o editor a seguir tinha um
// comportamento estranho.
//
// CAUSA RAIZ CONFIRMADA (por leitura directa do código):
// `handleReedit()` (assets/js/controllers/DocumentController.js) enviava
// `currentContent` directamente para a IA, sem remover os marcadores
// `---PAGE_BREAK---` que o motor de paginação real (Paginator.js) já tinha
// inserido — OBRIGATÓRIOS para o PDF/Word ficarem consistentes com o
// preview (ver Paginator.js). O prompt pedia à IA para "reescrever o
// documento completo... mantendo formato Markdown" — mas `---` sozinho é
// sintaxe válida de Markdown (linha horizontal), por isso a IA reformatava
// o marcador de forma inconsistente (espaços a mais/a menos, dentro de um
// parágrafo, etc.). O motor de paginação só reconhece o marcador EXACTO
// `---PAGE_BREAK---` — qualquer variante corrompida deixava de ser
// interpretada como quebra de página e passava a aparecer como TEXTO
// LITERAL VISÍVEL no documento final.
//
// Corrigido: os marcadores são removidos ANTES de construir o prompt (a
// paginação é uma decisão de layout — nunca informação que a IA precise de
// ver ou reescrever), e removidos novamente DEPOIS da resposta da IA, como
// defesa extra. O motor de paginação volta a calcular as quebras do zero,
// correctamente, a partir do conteúdo já limpo.
//
// Este teste lê o ficheiro-fonte real e confirma, de forma estática, que
// os marcadores nunca chegam a ir para o prompt da IA — mesmo padrão já
// usado por outros testes deste ficheiro para não montar um sandbox
// completo de ES modules com todas as dependências pesadas de
// DocumentController.js.

const fs = require('fs');
const path = require('path');

describe('Reedit por IA — marcadores ---PAGE_BREAK--- nunca vão para o prompt da IA', () => {
  const src = fs.readFileSync(path.join(__dirname, '../assets/js/controllers/DocumentController.js'), 'utf8');

  function extractHandleReedit() {
    const start = src.indexOf('async handleReedit(');
    expect(start).toBeGreaterThan(-1);
    // Extrai até ao próximo método ao mesmo nível de indentação (" }\n\n ")
    // — suficiente para cobrir todo o corpo de handleReedit() sem depender
    // de parsear JS a sério. Se handleReedit() for o ÚLTIMO método da
    // classe, esse padrão não existe (segue-se logo o fecho da classe,
    // "}\n}") — nesse caso o fim do ficheiro serve de limite.
    let end = src.indexOf('\n }\n\n ', start);
    if (end === -1) end = src.length;
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  // NOTA: a implementação evoluiu depois da correcção original desta
  // suite — passou a limpar `currentContent` numa única variável
  // `cleanContent` logo no topo de handleReedit() (antes até do débito de
  // crédito), em vez de uma variável dedicada só para o prompt
  // (`cleanContentForAI`) mais uma limpeza defensiva separada da resposta
  // da IA. Mesma garantia de fundo (marcadores nunca chegam à IA); só a
  // forma de o testar precisou de acompanhar essa mudança.
  test('currentContent é limpo de marcadores de página ANTES de construir o prompt', () => {
    const fn = extractHandleReedit();
    expect(fn).toMatch(/cleanContent\s*=\s*\(currentContent[\s\S]{0,60}\.replace\(\/[^/]*PAGE_BREAK[^/]*\/g/);
    // O prompt em si (template string enviado a generateRaw) referencia a
    // versão limpa, não a crua.
    const promptMatch = /generateRaw\(\s*`[^`]*\$\{(\w+)\}[\s\S]*?"""/.exec(fn);
    expect(promptMatch).not.toBeNull();
    expect(promptMatch[1]).toBe('cleanContent');
    expect(fn).not.toMatch(/\$\{currentContent\}/);
  });

  test('documentos longos (trabalho/transcricao, ou conteúdo extenso) são bloqueados ANTES de debitar crédito', () => {
    // NOVO (Set/2026): reedição por IA reescreve sempre o documento inteiro
    // numa única chamada com tecto fixo de tokens — insuficiente para um
    // "Trabalho Escolar" de várias páginas (gerado originalmente por uma
    // CADEIA de chamadas, ver LongDocumentEngine.js). Sem este bloqueio, o
    // resultado vinha cortado a meio e ainda cobrava 1 crédito por um
    // documento pior do que o original.
    const fn = extractHandleReedit();
    expect(fn).toMatch(/isLongDoc\s*=\s*serviceType\s*===\s*'trabalho'\s*\|\|\s*serviceType\s*===\s*'transcricao'/);
    expect(fn).toMatch(/contentTooLong/);
    const guardIdx  = fn.search(/if\s*\(isLongDoc\s*\|\|\s*contentTooLong\)/);
    const creditIdx = fn.indexOf('canConsume(1)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(creditIdx);
  });

  test('a normalização real remove o marcador e o texto à sua volta corretamente (execução da regex)', () => {
    const PAGE_BREAK_RE = /\n*---PAGE_BREAK---\n*/g;
    const withBreaks = 'Primeira página.\n\n---PAGE_BREAK---\n\nSegunda página.';
    const cleaned = withBreaks.replace(PAGE_BREAK_RE, '\n\n');
    expect(cleaned).not.toContain('PAGE_BREAK');
    expect(cleaned).toBe('Primeira página.\n\nSegunda página.');
  });

  test('conteúdo sem marcadores nenhuns não é afectado (idempotente, sem falso positivo)', () => {
    const PAGE_BREAK_RE = /\n*---PAGE_BREAK---\n*/g;
    const plain = 'Um documento normal, sem quebras de página nenhumas.';
    expect(plain.replace(PAGE_BREAK_RE, '\n\n')).toBe(plain);
  });

  test('template/modelo activo é preservado ao recarregar o editor depois da reedição', () => {
    // NOVO (Set/2026 — reportado por Manuel: "ao redigir com IA, remove o
    // modelo seleccionado e volta ao modelo padrão"). loadDocument()
    // (DocumentEditor.js) só mantém o template se receber
    // templateCss/templateHtml explicitamente — sem isto, QUALQUER
    // reedição por IA apagava o modelo escolhido. Lê-se o template
    // directamente de window.documentEditor (fonte mais fresca — cobre
    // também edições manuais feitas no separador "Editar Modelo" antes
    // deste pedido), não de uma cópia potencialmente desactualizada.
    const fn = extractHandleReedit();
    expect(fn).toMatch(/window\.documentEditor\._templateCss/);
    expect(fn).toMatch(/window\.documentEditor\._templateHtml/);
    const loadCallMatch = /loadDocument\(result\.document,[^)]*\)/.exec(fn);
    expect(loadCallMatch).not.toBeNull();
    // A chamada tem de passar 4 argumentos (conteúdo, serviço, css, html)
    // — só 2 argumentos é exactamente o bug antigo (perdia o template).
    const argCount = loadCallMatch[0].split(',').length;
    expect(argCount).toBeGreaterThanOrEqual(4);
  });
});
