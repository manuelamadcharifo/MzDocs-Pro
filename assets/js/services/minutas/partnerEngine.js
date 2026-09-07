// assets/js/services/minutas/partnerEngine.js
// Motor de renderização SEGURO para minutas submetidas por parceiros —
// espelho, em ESM, de api/_lib/minutaEngine.js (server-side, CommonJS). As
// DUAS cópias têm de fazer exactamente a mesma substituição de texto; por
// isso este ficheiro é deliberadamente pequeno e sem lógica extra.
//
// PROPRIEDADE DE SEGURANÇA CRÍTICA (repetida aqui de propósito — é a coisa
// mais importante deste ficheiro): renderMinutaParceiro() NUNCA executa
// código. Não há eval(), não há new Function(), não há template literals
// do JavaScript a interpretar o texto do parceiro. É substituição de texto
// simples: encontra "{{TOKEN}}" e troca pela string correspondente num
// mapa já calculado. O texto de um parceiro nunca pode fazer mais do que
// aparecer com dados diferentes.
import { formatMZN, numeroPorExtenso, dataHojeExtenso } from './_shared.js';

// Mesma whitelist do servidor (api/_lib/minutaEngine.js#CAMPOS_POR_SERVICO)
// — mantida em sincronia manualmente (ficheiro pequeno e estável). Serve
// aqui só para saber que campos calcular/copiar de `data`; a validação de
// segurança que impede placeholders não autorizados acontece sempre no
// servidor, no momento da SUBMISSÃO (nunca confiar só no cliente).
const CAMPOS_POR_SERVICO = {
  recibo: ['EMITENTE', 'NUIT_EMITENTE', 'ENDERECO_EMITENTE', 'CLIENTE', 'BI_CLIENTE', 'TIPO_DOC',
    'NUM_DOC', 'OBS', 'PAGAMENTO', 'CONTA_BANCARIA', 'LOCAL', 'VALOR_FORMATADO', 'VALOR_EXTENSO'],
  procuracao: ['TIPO_PROC', 'OUTORGANTE', 'BI_OUTORGANTE', 'MORADA_OUTORGANTE', 'PROCURADOR',
    'BI_PROCURADOR', 'MORADA_PROCURADOR', 'TIPO_DOC_IDENT', 'ACTO', 'SUB_MANDATO', 'VALIDADE', 'LOCAL'],
  requerimento: ['TIPO', 'REQUERENTE', 'BI', 'ENTIDADE', 'ASSUNTO', 'JUSTIFICACAO', 'CONTACTO', 'LOCAL'],
  residencia: ['REQUERENTE', 'BI', 'BAIRRO', 'RUA', 'CIDADE', 'TEMPO_CASAS', 'FINALIDADE', 'CHEFE_BAIRRO', 'LOCAL'],
  licenca: ['TIPO_LICENCA', 'REQUERENTE', 'NUIT', 'CONTACTO', 'ENTIDADE', 'OBJECTO', 'TIPO_ESTABELEC',
    'AREA_M2', 'HORARIO', 'N_POSTOS_TRABALHO', 'LOCAL', 'DOCUMENTOS'],
  prestacao: ['PRESTADOR', 'BI_PREST', 'CLIENTE', 'BI_CLIENTE', 'SERVICO', 'PAGAMENTO', 'INICIO',
    'PRAZO', 'PENALIDADES', 'LOCAL', 'VALOR_FORMATADO', 'VALOR_EXTENSO'],
  arrendamento: ['TIPO_IMOVEL', 'PROPRIETARIO', 'BI_PROPRIETARIO', 'LOCATARIO', 'BI_LOCATARIO', 'LOCAL',
    'METODO_PAGAMENTO', 'DURACAO', 'CAUCAO', 'QUEM_PAGA_SERVICOS', 'CONDICOES', 'VALOR_FORMATADO', 'VALOR_EXTENSO'],
};

// camelCase dos campos reais do formulário para cada TOKEN em maiúsculas —
// mesmo mapeamento nome-a-nome do servidor.
const CAMPO_ORIGEM = {
  EMITENTE: 'emitente', NUIT_EMITENTE: 'nuitEmitente', ENDERECO_EMITENTE: 'enderecoEmitente',
  CLIENTE: 'cliente', BI_CLIENTE: 'biCliente', TIPO_DOC: 'tipoDoc', NUM_DOC: 'numDoc', OBS: 'obs',
  PAGAMENTO: 'pagamento', CONTA_BANCARIA: 'contaBancaria', LOCAL: 'local',
  TIPO_PROC: 'tipoProc', OUTORGANTE: 'outorgante', BI_OUTORGANTE: 'biOutorgante',
  MORADA_OUTORGANTE: 'moradaOutorgante', PROCURADOR: 'procurador', BI_PROCURADOR: 'biProcurador',
  MORADA_PROCURADOR: 'moradaProcurador', TIPO_DOC_IDENT: 'tipoDocIdent', ACTO: 'acto',
  SUB_MANDATO: 'subMandato', VALIDADE: 'validade',
  TIPO: 'tipo', REQUERENTE: 'requerente', BI: 'bi', ENTIDADE: 'entidade', ASSUNTO: 'assunto',
  JUSTIFICACAO: 'justificacao', CONTACTO: 'contacto',
  BAIRRO: 'bairro', RUA: 'rua', CIDADE: 'cidade', TEMPO_CASAS: 'tempoCasas',
  FINALIDADE: 'finalidade', CHEFE_BAIRRO: 'chefeBairro',
  TIPO_LICENCA: 'tipoLicenca', NUIT: 'nuit', OBJECTO: 'objecto', TIPO_ESTABELEC: 'tipoEstabelec',
  AREA_M2: 'areaM2', HORARIO: 'horario', N_POSTOS_TRABALHO: 'nPostosTrabalho', DOCUMENTOS: 'documentos',
  PRESTADOR: 'prestador', BI_PREST: 'biPrest', SERVICO: 'servico', INICIO: 'inicio', PRAZO: 'prazo',
  PENALIDADES: 'penalidades',
  TIPO_IMOVEL: 'tipoImovel', PROPRIETARIO: 'proprietario', BI_PROPRIETARIO: 'biProprietario',
  LOCATARIO: 'locatario', BI_LOCATARIO: 'biLocatario', METODO_PAGAMENTO: 'metodoPagamento',
  DURACAO: 'duracao', CAUCAO: 'caucao', QUEM_PAGA_SERVICOS: 'quemPagaServicos', CONDICOES: 'condicoes',
};

function _montarDados(serviceType, rawData) {
  const tokens = CAMPOS_POR_SERVICO[serviceType] || [];
  const out = { DATA_HOJE: dataHojeExtenso() };
  for (const token of tokens) {
    if (token === 'VALOR_FORMATADO') { out[token] = formatMZN(rawData.valor) + ' MZN'; continue; }
    if (token === 'VALOR_EXTENSO')   { out[token] = numeroPorExtenso(rawData.valor) + ' meticais'; continue; }
    const campoOrigem = CAMPO_ORIGEM[token];
    out[token] = campoOrigem ? (rawData[campoOrigem] ?? '') : '';
  }
  return out;
}

// Substituição de texto simples — nunca interpreta o texto como código.
function _substituir(texto, dados) {
  return String(texto || '').replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, token) =>
    Object.prototype.hasOwnProperty.call(dados, token) ? String(dados[token]) : match
  );
}

export function renderMinutaParceiro(serviceType, minutaText, rawData = {}) {
  const dados = _montarDados(serviceType, rawData);
  return _substituir(minutaText, dados);
}
