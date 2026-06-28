// assets/js/marketplace/SampleData.js
//
// CORRIGIDO: a galeria de templates comunitários (templates.html) mostrava
// só o ícone genérico 🎨 (sem preview real) ou, quando tentava mostrar algo,
// um preview pouco convincente com apenas título+descrição em texto pequeno
// — não parecia de facto um documento. A causa: não existia nenhum conjunto
// de dados de exemplo realistas para preencher os placeholders {{...}} de
// cada tipo de template (cv, carta, recibo, etc.), e o sistema de preview
// foi recriado do zero em vez de reaproveitar o motor já testado em
// TemplatePicker.js + A4Renderer.js (renderA4Pages, _fillTemplate).
//
// Este módulo fornece, para cada serviço, um objecto de dados de exemplo
// fiel ao tipo de documento (nomes, valores e textos moçambicanos
// plausíveis), no MESMO formato de chaves que TemplatePicker._fillTemplate
// já consome — para que o preview da galeria use exactamente o mesmo motor
// de renderização do resto da aplicação, em vez de um sistema próprio.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Entrada de CV no formato HTML que cv.js espera dentro de {{EXPERIENCIA}}/{{FORMACAO}}
const cvEntry = (date, title, company, bullets = []) => `
  <div class="cv-entry">
    <p class="cv-entry-date">${esc(date)}</p>
    <p class="cv-entry-title">${esc(title)}</p>
    <p class="cv-entry-company">${esc(company)}</p>
    ${bullets.length ? `<ul class="cv-entry-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
  </div>`;

// Linha de tabela genérica de N colunas
const tr = (...cols) => `<tr>${cols.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;

export const SAMPLE_DATA = {

  cv: {
    NOME: 'Maria José Cossa', INICIAIS: 'MC', CARGO: 'Técnica Administrativa',
    CONTACTO: '+258 84 123 4567', EMAIL: 'mariacossa@exemplo.co.mz', LOCALIZACAO: 'Maputo, Moçambique',
    OBJECTIVO: 'Profissional dedicada com 5 anos de experiência em gestão administrativa e atendimento ao público, à procura de novos desafios numa empresa em crescimento onde possa aplicar as suas competências organizativas.',
    REALIZACAO: 'Implementou um novo sistema de arquivo digital que reduziu o tempo de procura de documentos em 40%.',
    HABILIDADES: 'Gestão de Agenda, Atendimento ao Cliente, Microsoft Office, Redacção de Relatórios, Organização de Eventos',
    HABILIDADES_LIST: ['Gestão de Agenda', 'Atendimento ao Cliente', 'Microsoft Office', 'Redacção de Relatórios', 'Organização de Eventos'].map(h => `<li>${h}</li>`).join(''),
    FORMACAO: cvEntry('2018 – 2021', 'Licenciatura em Gestão de Empresas', 'Universidade Eduardo Mondlane, Maputo'),
    EXPERIENCIA: cvEntry('2021 – Presente', 'Técnica Administrativa', 'Empresa Exemplo, Lda', ['Gestão de correspondência e arquivo', 'Apoio à direcção na organização de reuniões', 'Controlo de stock de material de escritório']),
    LINGUAS: '<div class="cv-lang-item"><span class="cv-lang-name">Português</span></div><div class="cv-lang-item"><span class="cv-lang-name">Inglês</span></div>',
    EXTRA: '',
  },

  carta: {
    DATA: '28 de Junho de 2026', LOCAL: 'Maputo', REF: 'Ref.ª 045/2026',
    REMETENTE_NOME: 'Maria José Cossa', REMETENTE_CARGO: 'Técnica Administrativa', REMETENTE_CARGO_PRETENDIDO: 'Coordenadora Administrativa',
    DESTINATARIO_NOME: 'Eng. João Ferreira', DESTINATARIO_ENTI: 'Director Geral, Empresa Exemplo, Lda',
    MINISTERIO: 'Ministério da Educação e Desenvolvimento Humano', INICIAIS: 'MJC', INICIAIS_EMPRESA: 'EE',
    ASSUNTO: 'Candidatura à vaga de Coordenadora Administrativa',
    CORPO: 'Venho por este meio apresentar a minha candidatura à vaga acima mencionada, anunciada no vosso portal institucional. Possuo cinco anos de experiência na área administrativa, com especial enfoque em gestão documental e apoio à direcção, competências que considero relevantes para a posição em causa. Coloco-me disponível para uma entrevista em data e hora a combinar.',
  },

  trabalho: {
    TEMA: 'O Papel da Mulher na Luta de Libertação de Moçambique', CURSO: 'Licenciatura em História',
    INSTITUICAO: 'Universidade Eduardo Mondlane', AUTORES: 'Maria José Cossa', LOCAL_ANO: 'Maputo, 2026',
    INTRODUCAO: 'A participação feminina na luta de libertação nacional constitui um dos capítulos mais relevantes, ainda que historicamente menos divulgados, da história de Moçambique. O presente trabalho propõe-se analisar o contributo das mulheres moçambicanas durante o período da luta armada, entre 1964 e 1974, destacando os seus papéis enquanto combatentes, enfermeiras, educadoras e mobilizadoras políticas nas zonas libertadas.',
    DESENVOLVIMENTO: 'Durante a luta armada de libertação nacional, as mulheres moçambicanas desempenharam funções multifacetadas que extravasaram largamente o espaço doméstico a que tradicionalmente estavam relegadas. A criação do Destacamento Feminino da FRELIMO, em 1967, representou um marco fundamental neste processo, permitindo a formação militar e política de centenas de mulheres que viriam a actuar tanto na frente de combate como no apoio logístico às tropas.',
    CONCLUSAO: 'Conclui-se que o contributo feminino para a independência de Moçambique foi determinante e multidimensional, ultrapassando largamente o reconhecimento historiográfico que lhe tem sido atribuído. Recomenda-se a continuação da investigação nesta área, nomeadamente através da recolha de testemunhos orais das combatentes ainda vivas.',
    REFERENCIAS: '<p>Mondlane, E. (1969). <em>Lutar por Moçambique</em>. Editora Sá da Costa.</p><p>Casal, A. (2008). <em>Mulheres em Armas</em>. Imprensa Universitária.</p>',
  },

  recibo: {
    EMITENTE: 'João Ferreira', NUIT_EMITENTE: '400123456', CLIENTE: 'Manuel Amad Charifo', BI_CLIENTE: '110987654321A',
    DATA: '28 de Junho de 2026', NUM_DOC: '001/2026', DESCRICAO: 'Serviços de bate-chapa e pintura de viatura',
    FORMA_PAGAMENTO: 'Dinheiro', TAXA_IVA: '0', VALOR_IVA: '0,00', VALOR_TOTAL: '15.000,00',
    ITEMS_RECIBO: tr('Bate chapa de mini-bus', '1', '7.000,00', '7.000,00') + tr('Pintura completa', '1', '8.000,00', '8.000,00'),
    SUBTOTAL: '15.000,00',
  },

  orcamento: {
    TITULO_OBRA: 'Orçamento para Construção de Muro de Vedação', LOCAL_DATA: 'Maputo, 28 de Junho de 2026',
    AREA_PISOS: '40m lineares', VALIDADE: '30 dias', NUM_ORC: '012/2026', CLIENTE: 'Manuel Amad Charifo', EMPRESA: 'Construções Exemplo, Lda', PRAZO: '21 dias úteis', IMPREVISTOS: '5%',
    ITEMS_MATERIAIS: tr('Cimento (saco 50kg)', 'saco', '60', '450,00', '27.000,00') + tr('Tijolo de cimento', 'unid.', '2.400', '25,00', '60.000,00') + tr('Areia', 'm³', '8', '1.200,00', '9.600,00'),
    TOTAL_MATERIAIS: '96.600,00',
    ITEMS_MAO_OBRA: tr('Pedreiro', '21', '800,00', '16.800,00') + tr('Ajudante', '21', '500,00', '10.500,00'),
    TOTAL_MAO_OBRA: '27.300,00', ITEMS_TODOS: '', TOTAL_GERAL: '123.900,00',
  },

  arrendamento: {
    SENHORIO_NOME: 'João Ferreira', SENHORIO_BI: '110123456789B', INQUILINO_NOME: 'Manuel Amad Charifo', INQUILINO_BI: '110987654321A',
    TIPO_IMOVEL: 'Apartamento T3', IMOVEL_LOCAL: 'Avenida Eduardo Mondlane, n.º 245, Bairro Central, Maputo',
    CLAUSULAS: '<p><strong>1.ª</strong> O presente contrato tem a duração de 12 (doze) meses, com início em 1 de Julho de 2026.</p><p><strong>2.ª</strong> A renda mensal é fixada em 25.000,00 MZN, a liquidar até ao dia 5 de cada mês.</p><p><strong>3.ª</strong> O inquilino obriga-se a manter o imóvel em bom estado de conservação.</p>',
  },

  prestacao: {
    PRESTADOR: 'João Ferreira', NUIT_PRESTADOR: '400123456', MORADA_PRESTADOR: 'Rua da Liberdade, n.º 123, Beira',
    CLIENTE: 'Empresa Exemplo, Lda', BI_CLIENTE: '110987654321A', SERVICO: 'Manutenção de sistemas informáticos',
    CLAUSULAS: '<p><strong>1.ª</strong> O Prestador compromete-se a realizar o serviço de manutenção mensal dos equipamentos informáticos do Cliente.</p><p><strong>2.ª</strong> O valor mensal pelos serviços é de 18.000,00 MZN, pagável até ao dia 10 de cada mês.</p>',
  },

  recomendacao: {
    DATA: '28 de Junho de 2026', LOCAL: 'Maputo', RECOMENDADOR: 'Eng. António Matavele', CARGO_REC: 'Director de Recursos Humanos',
    ENTIDADE_REC: 'Empresa Exemplo, Lda',
    CORPO: 'Venho por este meio recomendar a Sr.ª Maria José Cossa, que trabalhou sob a minha supervisão directa durante três anos na função de Técnica Administrativa. Destacou-se pela pontualidade, capacidade organizativa e excelente relacionamento com colegas e clientes. Recomendo-a sem qualquer reserva para as funções a que se propõe candidatar.',
  },

  requerimento: {
    REQUERENTE: 'Manuel Amad Charifo', BI: '110987654321A', ENDERECO: 'Bairro Polana Caniço, Rua das Acácias, n.º 12, Maputo',
    ENTIDADE: 'Direcção Provincial de Educação de Maputo', ASSUNTO: 'Pedido de emissão de certificado de equivalência',
    FUNDAMENTO: 'Tendo concluído o 12º ano de escolaridade no ano de 2024 e necessitando do referido certificado para efeitos de matrícula universitária, requeiro a Vossa Excelência a emissão do mesmo com a maior brevidade possível.',
    DATA: '28 de Junho de 2026', LOCAL: 'Maputo',
  },

  residencia: {
    DECLARANTE: 'João Machel', BI: '110123456789B', NASCIMENTO: '14 de Março de 1990', NATURALIDADE: 'Maputo',
    ENDERECO: 'Rua das Acácias, n.º 12, Bairro Polana Caniço, Maputo', TEMPO: 'Mais de 10 anos',
    FINALIDADE: 'Processo de matrícula universitária', CHEFE: 'Sr. Manuel Tembe', LOCAL: 'Maputo', DATA: '28 de Junho de 2026',
  },

  planonegocio: {
    NOME_NEGOCIO: 'Padaria Pão Quente', SECTOR: 'Panificação e Pastelaria', PROPRIETARIO: 'Maria José Cossa', LOCAL: 'Maputo', ANO: '2026',
    SUMARIO: 'A Padaria Pão Quente pretende fornecer pão fresco e produtos de pastelaria de qualidade ao Bairro Central de Maputo, suprindo a procura local com preços competitivos e atendimento personalizado.',
    DESCRICAO_NEGOCIO: 'O negócio consistirá numa padaria de bairro com produção própria, vendendo pão, bolos e bebidas, com horário das 5h às 20h, sete dias por semana.',
    ANALISE_MERCADO: 'O Bairro Central conta com mais de 15.000 habitantes e apenas duas padarias estabelecidas, representando uma oportunidade de mercado significativa, sobretudo no período da manhã.',
    ITEMS_FINANCEIROS: tr('Equipamento de panificação', '180.000,00') + tr('Reforma do espaço', '60.000,00') + tr('Capital de giro inicial', '40.000,00'),
    INVESTIMENTO_TOTAL: '280.000,00', RETORNO: '18 meses',
    EQUIPA: 'A equipa inicial será composta por 1 padeiro, 1 ajudante e 1 atendente de balcão, sob supervisão directa da proprietária.',
  },

  procuracao: null, // sem htmlTemplate — ver SAMPLE_MARKDOWN abaixo

  licenca: {
    REQUERENTE: 'Construções Exemplo, Lda', NUIT: '400789123', CONTACTO: '+258 82 987 6543',
    OBJECTO: 'Licenciamento de obra de construção de moradia unifamiliar', ENTIDADE: 'Conselho Municipal de Maputo',
    FUNDAMENTACAO: 'Nos termos do Regulamento de Licenciamento de Obras em vigor, requer-se a emissão da licença de construção para o imóvel sito na Avenida Julius Nyerere, n.º 88, Maputo.',
    HORARIO: 'Das 7h às 17h, de segunda a sábado', LOCAL: 'Maputo', DATA: '28 de Junho de 2026',
  },

  acta: {
    TIPO_REUNIAO: 'Reunião Ordinária do Conselho Directivo', NUM_ACTA: '003/2026', ORGANIZACAO: 'Associação Exemplo',
    DATA: '28 de Junho de 2026', HORA: '14h00', LOCAL: 'Sede da Associação, Maputo',
    PRESIDENTE: 'Eng. António Matavele', SECRETARIO: 'Maria José Cossa',
    PRESENTES: 'Eng. António Matavele (Presidente), Maria José Cossa (Secretária), João Ferreira (Tesoureiro), Manuel Amad Charifo (Vogal)',
    PAUTA: '<p>1. Apresentação do relatório financeiro do 1.º semestre.</p><p>2. Discussão sobre a renovação do contrato de arrendamento da sede.</p><p>3. Outros assuntos.</p>',
    DELIBERACOES: '<p>Foi deliberado, por unanimidade, aprovar o relatório financeiro apresentado e renovar o contrato de arrendamento da sede por mais 12 meses.</p>',
  },
};

// ── Markdown de exemplo para serviços sem htmlTemplate (ex.: procuracao) ──
// Estes templates só têm CSS — o preview deve passar pelo conversor
// markdownToHtml normal (mesmo caminho usado quando tpl.htmlTemplate é nulo
// em TemplatePicker._renderPreview).
export const SAMPLE_MARKDOWN = {
  procuracao: `# PROCURAÇÃO

Eu, **João Ferreira**, portador do Bilhete de Identidade n.º **110123456789B**, venho por este meio constituir meu bastante procurador o Sr. **Manuel Amad Charifo**, portador do Bilhete de Identidade n.º **110987654321A**, a quem confiro os poderes necessários para, em meu nome, representar-me junto da Conservatória do Registo Predial de Maputo, podendo assinar todos os documentos necessários para esse efeito.

A presente procuração é válida por um período de 90 (noventa) dias a contar da data da sua assinatura.

Maputo, 28 de Junho de 2026

_________________________________________
**João Ferreira**
BI n.º 110123456789B`,

  generic: `# Título do Documento de Exemplo

Este é um texto de demonstração que ilustra como o conteúdo aparece quando formatado com este modelo. O documento real gerado pela plataforma substituirá este texto pelos dados fornecidos no formulário.

## Secção de Exemplo

Cada modelo aplica a sua própria tipografia, espaçamento e cores a este tipo de conteúdo — o objectivo desta pré-visualização é dar uma ideia fiel do resultado final.`,
};

/**
 * Preenche um template HTML com os placeholders {{CHAVE}} substituídos
 * pelos dados fornecidos. Idêntico a TemplatePicker._fillTemplate — mantido
 * como função pura e independente aqui para poder ser reutilizada na
 * galeria sem instanciar o TemplatePicker completo.
 */
export function fillTemplate(htmlTemplate, data) {
  if (!htmlTemplate) return '';
  let result = htmlTemplate;
  for (const [key, value] of Object.entries(data || {})) {
    const rx = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
    result = result.replace(rx, value != null ? String(value) : '');
  }
  result = result.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return result;
}

/**
 * Devolve os dados de exemplo para um serviço, com fallback genérico
 * (TEMA/NOME preenchidos a partir do nome/descrição do template) quando o
 * serviço não está mapeado em SAMPLE_DATA.
 */
export function getSampleData(serviceKey, fallbackName, fallbackDesc) {
  const base = SAMPLE_DATA[serviceKey];
  if (base) return base;
  return {
    TEMA: fallbackName || 'Título do Documento de Exemplo',
    NOME: fallbackName || 'Nome de Exemplo',
    OBJECTIVO: fallbackDesc || '',
  };
}
