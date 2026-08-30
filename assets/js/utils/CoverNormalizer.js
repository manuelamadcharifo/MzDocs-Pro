// assets/js/utils/CoverNormalizer.js
//
// PROBLEMA QUE ESTE FICHEIRO RESOLVE:
// Para "Trabalho Escolar", o prompt (services/prompts/trabalho.js) sempre
// pediu à IA para reproduzir, logo a seguir ao título, um bloco de
// identificação (Instituição/Disciplina/Nível/Estudante/Turma/Docente) —
// mas os modelos gratuitos usados (Llama 3.3 70B free, Gemma 3 27B free,
// Nemotron) nem sempre respeitam o formato pedido: em vez das linhas
// "**Label:** valor" instruídas, por vezes geram uma TABELA markdown com
// placeholders genéricos tipo "[Nome Completo do Aluno]" ou
// "[Nome da Instituição de Ensino]" em vez dos dados reais que o aluno já
// tinha preenchido no formulário — visível no PDF final como uma tabela
// feia e com informação errada na capa.
//
// Em vez de continuar a "pedir com mais força" à IA (abordagem frágil,
// depende sempre da IA acertar), este módulo TIRA essa responsabilidade da
// IA: depois de recebida a resposta, localizamos o título e substituímos
// TUDO o que vier a seguir a ele (até à próxima quebra de página ou
// cabeçalho) por um bloco construído no código, sempre com os dados reais
// do formulário — nunca com o que a IA escreveu. Corre uma única vez, logo
// após a geração (DocumentController._generateNormal/_generateLong), por
// isso o resultado fica gravado no documento e beneficia automaticamente o
// preview, o download em PDF e o download em Word — sem ser preciso repetir
// a lógica em cada exportador.
export function normalizeTrabalhoCover(markdown, data) {
  if (!markdown || typeof markdown !== 'string') return markdown;

  const lines = markdown.split('\n');
  const h1Idx = lines.findIndex(l => /^#\s+\S/.test(l.trim()));
  if (h1Idx === -1) return markdown; // sem título reconhecível — não mexe

  // Zona da "capa" = tudo entre o título e a próxima quebra de página real
  // ou o próximo cabeçalho de secção (## / ###) — o que vier primeiro.
  let end = h1Idx + 1;
  while (end < lines.length) {
    const t = lines[end].trim();
    if (t === '---PAGE_BREAK---' || /^#{2,3}\s/.test(t)) break;
    end++;
  }

  const capaBlock = _buildCapaBlock(data);
  const before = lines.slice(0, h1Idx + 1);
  const after  = lines.slice(end);
  const middle = capaBlock ? ['', capaBlock, ''] : [''];

  return [...before, ...middle, ...after].join('\n');
}

// CORRIGIDO (capa "desorganizada"/pouco cuidada): esta função gerava uma
// lista solta de linhas "**Label:** valor" separadas por "---" — sem
// nenhuma estrutura visual, ficava com aspecto de rascunho em vez de capa
// académica. O renderer partilhado (A4Renderer.js → markdownToHtml) ESCAPA
// qualquer HTML bruto que se tente inserir aqui (não há forma de usar
// <div align="center"> ou CSS inline directamente na capa), por isso a
// melhoria tem de vir de sintaxe Markdown que o parser já trata de forma
// visualmente distinta:
//  - o título (# tema) já sai centrado e grande (H1) — inalterado;
//  - o nome da instituição passa a cabeçalho H2 (maior e com mais respiro
//    vertical do que texto normal em negrito);
//  - os dados de identificação passam a uma tabela GFM real de 2 colunas
//    ("Campo | Detalhe"), que o CSS partilhado já estiliza como uma caixa
//    limpa com cabeçalho azul-marinho e linhas alternadas (mesmo estilo
//    usado em qualquer tabela do documento) — em vez de uma lista solta;
//  - cidade/ano fecham a capa a negrito, como assinatura final.
// Todas as peças usam apenas Markdown suportado pelo parser partilhado
// (h1-h6, hr, tabela GFM, negrito) — sem qualquer HTML cru, para não correr
// o risco de aparecer escapado ("&lt;div&gt;") no documento final.
function _buildCapaBlock(data = {}) {
  const instituicao = (data.instituicao || '').trim();
  const idFields = [
    data.disciplina && ['Disciplina', data.disciplina],
    data.nivel        && ['Nível', data.nivel],
    (data.aluno || data.nome) && ['Estudante', data.aluno || data.nome],
    data.turma        && ['Turma/Classe', data.turma],
    data.docente      && ['Docente', data.docente],
  ].filter(Boolean);

  // Sem NENHUM dado de identificação preenchido (todos os campos são
  // opcionais no formulário) — não há nada de real para mostrar; mais vale
  // não inserir bloco nenhum do que inventar "[PREENCHER]" como a IA fazia.
  if (!instituicao && !idFields.length) return '';

  const cidade = (data.local || data.cidade || 'Maputo').trim();
  const ano    = new Date().getFullYear();

  const parts = ['---', ''];
  if (instituicao) {
    parts.push(`## ${instituicao.toUpperCase()}`);
    parts.push('');
  }
  if (idFields.length) {
    parts.push('| Campo | Detalhe |');
    parts.push('|---|---|');
    idFields.forEach(([label, val]) => parts.push(`| ${label} | ${val} |`));
    parts.push('');
  }
  parts.push('---');
  parts.push('');
  parts.push(`**${cidade}, ${ano}**`);

  return parts.join('\n');
}
