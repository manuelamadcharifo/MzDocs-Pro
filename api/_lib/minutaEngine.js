// api/_lib/minutaEngine.js
// Motor de renderização SEGURO para minutas submetidas por parceiros.
//
// PROPRIEDADE DE SEGURANÇA CRÍTICA: este motor NUNCA executa código. Faz
// apenas substituição de texto — encontra "{{TOKEN}}" e troca pelo valor
// correspondente numa tabela de dados já pronta (string → string). Não há
// eval(), não há Function(), não há acesso a nada além do que está no
// objecto `data` passado explicitamente. Uma minuta de parceiro nunca pode
// "fazer mais" do que aparecer com dados diferentes no lugar dos tokens —
// não pode chamar funções, não pode aceder à base de dados, não pode
// alterar o comportamento da aplicação.
//
// Espelhado no cliente em assets/js/services/minutas/partnerEngine.js —
// AMBAS as cópias têm de fazer exactamente a mesma coisa (é código pequeno
// e estável de propósito, precisamente para manter as duas cópias fáceis
// de manter iguais). Ver esse ficheiro para o comentário completo.

// Placeholders permitidos por serviceType — apenas os 7 serviços que já
// têm minuta fixa da própria plataforma (assets/js/services/minutas/*.js)
// aceitam minutas de parceiro nesta primeira versão, porque só esses têm
// clausulado invariável (os restantes — cv, trabalho, carta, etc. — são
// documentos que dependem de composição livre, onde "minuta de parceiro"
// não faz sentido do mesmo jeito). {{DATA_HOJE}} está sempre disponível,
// em qualquer serviço, e é sempre calculado pelo motor — nunca pelo autor.
const CAMPOS_POR_SERVICO = {
  recibo: {
    EMITENTE: 'emitente', NUIT_EMITENTE: 'nuitEmitente', ENDERECO_EMITENTE: 'enderecoEmitente',
    CLIENTE: 'cliente', BI_CLIENTE: 'biCliente', TIPO_DOC: 'tipoDoc', NUM_DOC: 'numDoc',
    OBS: 'obs', PAGAMENTO: 'pagamento', CONTA_BANCARIA: 'contaBancaria', LOCAL: 'local',
    VALOR_FORMATADO: '_valorFormatado', VALOR_EXTENSO: '_valorExtenso',
  },
  procuracao: {
    TIPO_PROC: 'tipoProc', OUTORGANTE: 'outorgante', BI_OUTORGANTE: 'biOutorgante',
    MORADA_OUTORGANTE: 'moradaOutorgante', PROCURADOR: 'procurador', BI_PROCURADOR: 'biProcurador',
    MORADA_PROCURADOR: 'moradaProcurador', TIPO_DOC_IDENT: 'tipoDocIdent', ACTO: 'acto',
    SUB_MANDATO: 'subMandato', VALIDADE: 'validade', LOCAL: 'local',
  },
  requerimento: {
    TIPO: 'tipo', REQUERENTE: 'requerente', BI: 'bi', ENTIDADE: 'entidade', ASSUNTO: 'assunto',
    JUSTIFICACAO: 'justificacao', CONTACTO: 'contacto', LOCAL: 'local',
  },
  residencia: {
    REQUERENTE: 'requerente', BI: 'bi', BAIRRO: 'bairro', RUA: 'rua', CIDADE: 'cidade',
    TEMPO_CASAS: 'tempoCasas', FINALIDADE: 'finalidade', CHEFE_BAIRRO: 'chefeBairro', LOCAL: 'local',
  },
  licenca: {
    TIPO_LICENCA: 'tipoLicenca', REQUERENTE: 'requerente', NUIT: 'nuit', CONTACTO: 'contacto',
    ENTIDADE: 'entidade', OBJECTO: 'objecto', TIPO_ESTABELEC: 'tipoEstabelec', AREA_M2: 'areaM2',
    HORARIO: 'horario', N_POSTOS_TRABALHO: 'nPostosTrabalho', LOCAL: 'local', DOCUMENTOS: 'documentos',
  },
  prestacao: {
    PRESTADOR: 'prestador', BI_PREST: 'biPrest', CLIENTE: 'cliente', BI_CLIENTE: 'biCliente',
    SERVICO: 'servico', PAGAMENTO: 'pagamento', INICIO: 'inicio', PRAZO: 'prazo',
    PENALIDADES: 'penalidades', LOCAL: 'local',
    VALOR_FORMATADO: '_valorFormatado', VALOR_EXTENSO: '_valorExtenso',
  },
  arrendamento: {
    TIPO_IMOVEL: 'tipoImovel', PROPRIETARIO: 'proprietario', BI_PROPRIETARIO: 'biProprietario',
    LOCATARIO: 'locatario', BI_LOCATARIO: 'biLocatario', LOCAL: 'local', METODO_PAGAMENTO: 'metodoPagamento',
    DURACAO: 'duracao', CAUCAO: 'caucao', QUEM_PAGA_SERVICOS: 'quemPagaServicos', CONDICOES: 'condicoes',
    VALOR_FORMATADO: '_valorFormatado', VALOR_EXTENSO: '_valorExtenso',
  },
};

const SEMPRE_DISPONIVEL = ['DATA_HOJE'];

function servicosComMinutaDeParceiro() {
  return Object.keys(CAMPOS_POR_SERVICO);
}

function placeholdersPermitidos(serviceType) {
  const campos = CAMPOS_POR_SERVICO[serviceType];
  if (!campos) return null;
  return [...Object.keys(campos), ...SEMPRE_DISPONIVEL];
}

// Extrai todos os "{{TOKEN}}" de um texto (maiúsculas/números/underscore).
function extrairPlaceholders(texto) {
  const encontrados = new Set();
  const re = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(texto || '')) !== null) encontrados.add(m[1]);
  return [...encontrados];
}

// Valida um texto de minuta contra a whitelist de um serviceType. Devolve
// { ok, placeholdersUsados, placeholdersInvalidos }. Não lança excepção —
// quem chama decide o que fazer com placeholdersInvalidos.
function validarMinuta(serviceType, texto) {
  const permitidos = placeholdersPermitidos(serviceType);
  if (!permitidos) {
    return { ok: false, placeholdersUsados: [], placeholdersInvalidos: [], erro: 'service_type_nao_suportado' };
  }
  const usados = extrairPlaceholders(texto);
  const invalidos = usados.filter(p => !permitidos.includes(p));
  return { ok: invalidos.length === 0, placeholdersUsados: usados, placeholdersInvalidos: invalidos };
}

module.exports = {
  CAMPOS_POR_SERVICO,
  servicosComMinutaDeParceiro,
  placeholdersPermitidos,
  extrairPlaceholders,
  validarMinuta,
};
