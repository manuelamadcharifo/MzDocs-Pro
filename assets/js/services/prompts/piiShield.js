// services/prompts/piiShield.js — NOVO (Julho 2026)
// ──────────────────────────────────────────────────────────────────────────
// Em vez de bloquear fornecedores de IA com risco de treino nos dados
// (ver dataRisk em api/_lib/aiProviderRegistry.js), este módulo garante que
// NENHUM fornecedor — de risco ou não — recebe o valor real dos campos do
// formulário identificados como dados pessoais. Os valores são substituídos
// por marcadores opacos ([[DADO_1]], [[DADO_2]]...) ANTES de o prompt sair
// do browser, e repostos no documento devolvido, também no browser. O mapa
// marcador→valor real nunca sai do browser.
//
// LIMITAÇÕES CONHECIDAS (documentadas, não escondidas):
//  1. Só protege campos ESTRUTURADOS do formulário (nome, BI, NUIT,
//     telefone, morada, etc.) — não protege dados pessoais que um
//     utilizador escreva dentro de um campo de texto livre (ex: "motivo",
//     "descrição"), porque isso exigiria reconhecimento de texto (NER), uma
//     técnica bem menos fiável. Reduz muito a exposição, não elimina 100%.
//  2. Depende de o modelo de IA reproduzir o marcador sem o alterar. Isto é
//     fiável na generalidade dos modelos (é só uma string opaca), mas não
//     está garantido — por isso unmaskText() sinaliza `hasLeftoverTokens`
//     quando algum marcador não foi substituído na resposta, para o
//     chamador poder avisar o utilizador em vez de entregar o documento com
//     um "[[DADO_3]]" visível por engano.
//  3. Não cobre o fluxo de reedição de documento já gerado
//     (OpenRouterService.generateRaw / _reedit), que reenvia o conteúdo já
//     REAL do documento anterior para a IA aplicar uma instrução — nesse
//     ponto o texto já não é um formData estruturado, é o documento inteiro
//     em prosa, pelo que a mesma limitação do ponto 1 se aplica ao
//     documento completo, não só a um campo.
// ──────────────────────────────────────────────────────────────────────────

// Radicais (sem acentos, minúsculas) que, ao aparecerem no id do campo,
// classificam o seu valor como dado pessoal a mascarar. Construído a partir
// da lista real de campos em ServiceDefinitions.js (todos os serviços) —
// deliberadamente inclusivo: mascarar um campo a mais é inofensivo (a IA
// só recebe um marcador em vez do texto), mascarar um campo sensível a
// menos é que é o erro a evitar.
const SENSITIVE_KEY_STEMS = [
    // identificação da pessoa
    'nome', 'nuit', 'contribuinte', 'passaporte', 'identidade', 'nascimento',
    // contacto
    'telefone', 'telemovel', 'celular', 'contacto', 'email',
    // morada / localização de residência
    'morada', 'endereco', 'domicilio', 'bairro', 'rua', 'cidade',
    // papéis/partes nomeadas em contratos e documentos jurídicos
    'requerente', 'proprietario', 'locatario', 'locador', 'outorgante',
    'procurador', 'prestador', 'cliente', 'emitente', 'candidato',
    'recomendador', 'chefebairro', 'presidente', 'secretario', 'aluno',
    'docente', 'entidade', 'organizacao', 'destinatario', 'remetente',
    'testemunha', 'representante', 'fiador', 'vendedor', 'comprador',
    'devedor', 'credor', 'empregador', 'empregado', 'trabalhador',
    'mandante', 'mandatario', 'herdeiro',
    // financeiro
    'contabancaria', 'iban', 'mpesa',
];

function _stripAccents(s) {
    return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _isSensitiveKey(key) {
    if (!key) return false;
    // "bi" isolado (BI = Bilhete de Identidade) precisa de tratamento à
    // parte — é curto demais para bater por substring sem apanhar palavras
    // como "habilidades" ou "biblioteca". Cobre o padrão camelCase real
    // usado no projecto: bi, biPrest, biCliente, biProprietario, etc.
    if (/^bi([A-Z]|$)/.test(key) || key.toLowerCase() === 'numerobi') return true;

    const norm = _stripAccents(key).toLowerCase();
    return SENSITIVE_KEY_STEMS.some(stem => norm.includes(stem));
}

/**
 * Mascara os valores de campos sensíveis num objecto de formData plano.
 * Não mascara campos vazios, não-string, nem desce a objectos aninhados
 * (os formulários deste projecto são planos, um nível só, por serviço).
 *
 * @param {Object} data - formData tal como vem do formulário do serviço
 * @returns {{maskedData: Object, tokenMap: Map<string,string>}}
 */
export function maskFormData(data) {
    if (!data || typeof data !== 'object') {
        return { maskedData: data, tokenMap: new Map() };
    }

    const maskedData = { ...data };
    const tokenMap = new Map(); // marcador -> valor real
    let counter = 0;

    for (const key of Object.keys(maskedData)) {
        const value = maskedData[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!_isSensitiveKey(key)) continue;

        counter += 1;
        const token = `[[DADO_${counter}]]`;
        tokenMap.set(token, value);
        maskedData[key] = token;
    }

    return { maskedData, tokenMap };
}

/**
 * Repõe os valores reais no texto devolvido pela IA, substituindo cada
 * marcador [[DADO_N]] pelo respectivo valor original.
 *
 * @param {string} text - documento devolvido pela IA (pode conter marcadores)
 * @param {Map<string,string>} tokenMap - mapa devolvido por maskFormData
 * @returns {{text: string, hasLeftoverTokens: boolean}}
 */
export function unmaskText(text, tokenMap) {
    if (!text || !tokenMap || tokenMap.size === 0) {
        return { text, hasLeftoverTokens: false };
    }

    let result = text;
    for (const [token, real] of tokenMap.entries()) {
        // split/join em vez de replace() — substitui TODAS as ocorrências
        // (o mesmo dado pode repetir-se, ex: nome no cabeçalho e na
        // assinatura), sem os problemas de escaping de regex.
        result = result.split(token).join(real);
    }

    // Rede de segurança: se sobrar algum marcador (o modelo alterou-o ou
    // não o reproduziu), o chamador precisa de saber para não entregar o
    // documento com um "[[DADO_3]]" visível por engano.
    const hasLeftoverTokens = /\[\[DADO_\d+\]\]/.test(result);
    return { text: result, hasLeftoverTokens };
}
