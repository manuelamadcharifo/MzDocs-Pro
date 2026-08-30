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

  const parts = [];
  if (instituicao) {
    parts.push('---');
    parts.push('');
    parts.push(`**${instituicao.toUpperCase()}**`);
    parts.push('');
  }
  if (idFields.length) {
    parts.push('---');
    parts.push('');
    parts.push(idFields.map(([label, val]) => `**${label}:** ${val}`).join('\n'));
    parts.push('');
  }
  const cidade = (data.local || data.cidade || 'Maputo').trim();
  const ano    = new Date().getFullYear();
  parts.push(`${cidade}, ${ano}`);

  return parts.join('\n');
}
