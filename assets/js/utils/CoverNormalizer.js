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
//
// NOVO: para níveis universitários (Pré-Universitário, Licenciatura,
// Mestrado/Doutoramento) insere-se também uma FOLHA DE ROSTO como página
// própria, a seguir à capa — parte obrigatória da estrutura académica
// convencional (capa "limpa" com só título/instituição/autor, seguida de
// uma folha de rosto que repete os dados e acrescenta a frase formal de
// enquadramento do trabalho). Tal como a capa, é construída no código com
// os dados reais — nunca pedida à IA — pelas mesmas razões de fiabilidade.
const ACADEMIC_LEVELS = new Set(['Pré-Universitário', 'Licenciatura', 'Mestrado/Doutoramento']);

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
  const isAcademico = ACADEMIC_LEVELS.has(data.nivel);
  const folhaRostoBlock = isAcademico ? _buildFolhaRostoBlock(data) : '';

  const before = lines.slice(0, h1Idx + 1);
  const after  = lines.slice(end);
  const middle = [
    ...(capaBlock ? ['', capaBlock, ''] : ['']),
    ...(folhaRostoBlock ? ['---PAGE_BREAK---', '', folhaRostoBlock, ''] : []),
  ];

  return [...before, ...middle, ...after].join('\n');
}

// CORRIGIDO (2ª ronda — "a capa não pode ter tabelas, tem de ser bonita e
// profissional como a de um designer, simples e organizada"): a versão
// anterior já não usava uma lista solta, mas passou a usar uma TABELA GFM
// (Campo | Detalhe) — visualmente uma grelha de formulário, não uma capa.
// Removida a tabela por completo. O renderer partilhado (A4Renderer.js →
// markdownToHtml) ESCAPA qualquer HTML/CSS bruto que se tente inserir aqui
// (não há forma de usar <div align="center"> directamente na capa), por
// isso o resultado tem de vir só de Markdown simples, usado com
// intenção tipográfica:
//  - o título (# tema) já sai centrado e grande (H1) — inalterado, é o
//    elemento dominante da capa;
//  - hr's (---) delimitam três blocos verticais claros: título /
//    instituição+disciplina / identificação do autor+data — o mesmo
//    princípio de "blocos separados por regra fina" usado em capas reais;
//  - a instituição vai em H2 (maior, com respiro vertical próprio);
//  - disciplina/nível ficam em itálico, uma única linha subtil por baixo
//    da instituição — não competem visualmente com ela;
//  - o nome do(a) estudante fica em negrito, sozinho na sua própria linha
//    (maior peso visual do que o resto dos dados de identificação);
//  - turma e docente ficam em texto simples, uma linha cada;
//  - cidade+ano fecham a capa a negrito, como assinatura final.
// Tudo dentro do que o parser Markdown partilhado já suporta (h1-h6, hr,
// negrito, itálico) — sem tabela, sem HTML cru.
function _buildCapaBlock(data = {}) {
  const instituicao = (data.instituicao || '').trim();
  const estudante = (data.aluno || data.nome || '').trim();
  const detalhes = [
    data.turma   && `Turma/Classe: ${data.turma}`,
    data.docente && `Docente: ${data.docente}`,
  ].filter(Boolean);

  // Sem NENHUM dado de identificação preenchido (todos os campos são
  // opcionais no formulário) — não há nada de real para mostrar; mais vale
  // não inserir bloco nenhum do que inventar "[PREENCHER]" como a IA fazia.
  if (!instituicao && !estudante && !detalhes.length) return '';

  const cidade = (data.local || data.cidade || 'Maputo').trim();
  const ano    = new Date().getFullYear();

  const parts = ['---', ''];
  if (instituicao) {
    parts.push(`## ${instituicao.toUpperCase()}`);
    parts.push('');
    if (data.disciplina || data.nivel) {
      parts.push(`*${[data.disciplina, data.nivel].filter(Boolean).join(' — ')}*`);
      parts.push('');
    }
  }
  parts.push('---');
  parts.push('');
  if (estudante) {
    parts.push(`**${estudante}**`);
    parts.push('');
  }
  detalhes.forEach(l => { parts.push(l); parts.push(''); });
  parts.push('---');
  parts.push('');
  parts.push(`**${cidade}, ${ano}**`);

  return parts.join('\n');
}

// NOVO — Folha de Rosto: página própria, a seguir à capa, com os mesmos
// dados mas acrescentando a frase formal de enquadramento do trabalho
// (padrão convencional em universidades moçambicanas/portuguesas: "Trabalho
// apresentado à disciplina de X, do curso de Y, como requisito parcial de
// avaliação"). Tal como a capa, sem tabela — título centrado (H1, herdado
// do CSS partilhado) seguido de texto corrido justificado, mais próximo de
// uma folha de rosto real do que a capa (que é deliberadamente mais
// minimalista).
function _buildFolhaRostoBlock(data = {}) {
  const instituicao = (data.instituicao || '').trim();
  const estudante = (data.aluno || data.nome || '').trim();
  if (!instituicao && !estudante) return ''; // sem dados suficientes — não vale a pena duplicar a capa vazia

  const disciplina = (data.disciplina || '').trim();
  const docente = (data.docente || '').trim();
  const cidade = (data.local || data.cidade || 'Maputo').trim();
  const ano = new Date().getFullYear();

  const parts = [];
  if (instituicao) parts.push(`# ${instituicao.toUpperCase()}`, '');
  if (estudante) parts.push(`## ${estudante}`, '');
  parts.push(`## ${data.tema || ''}`, '');

  const enquadramento = [
    'Trabalho académico',
    disciplina ? `apresentado na disciplina de ${disciplina}` : null,
    'como parte dos requisitos de avaliação',
    docente ? `sob orientação de ${docente}` : null,
  ].filter(Boolean).join(', ') + '.';
  parts.push(enquadramento, '');
  parts.push('---', '');
  parts.push(`**${cidade}, ${ano}**`);

  return parts.join('\n');
}
