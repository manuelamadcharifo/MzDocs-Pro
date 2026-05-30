// services/Services.js — OpenRouterService + MPesaService + SupabaseService
import { Validator } from '../utils/Formatter.js';
import { Formatter } from '../utils/Formatter.js';

export class OpenRouterService {
  constructor() {
    this.endpoint = '/api/generate-document';
    this.models = {
      primary:   'meta-llama/llama-3.3-70b-instruct:free',
      fallback:  'google/gemma-3-27b-it:free',
      emergency: 'nvidia/nemotron-3-nano-30b-a3b:free',
    };
    this.currentModel = this.models.primary;
  }

  async generate(serviceType, formData, ocrText = null, credits = null, cost = 1, templateData = null, pickerTemplate = null) {
    const prompt = this._buildPrompt(serviceType, formData, ocrText, templateData, pickerTemplate);
    return await this._callBackend(serviceType, prompt, credits, cost);
  }


  async generateRaw(prompt, reeditData = null, credits = null) {
    const userId = localStorage.getItem('mz_uid') || 'anon';

    // Obter token JWT para autenticação no servidor
    let authToken = null;
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      authToken = await authManager.getValidToken();
    } catch { /* sem token */ }

    if (!authToken) {
      throw Object.assign(new Error('Sessão expirada. Inicie sessão novamente.'), { code: 'AUTH_REQUIRED' });
    }

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };

    // Deduzir 1 crédito antes da reedição
    const deductRes = await fetch('/api/deduct-credit', {
      method: 'POST', headers,
      body: JSON.stringify({ cost: 1 }),
    });
    if (deductRes.status === 402) {
      const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e;
    }
    if (!deductRes.ok) {
      const d = await deductRes.json().catch(() => ({}));
      throw new Error(d.error || 'Erro ao verificar créditos.');
    }
    const { credits: creditsAfterDeduct } = await deductRes.json();

    const body = reeditData
      ? {
          serviceType: reeditData.serviceType || 'reedit',
          prompt: prompt,
          userId,
          _reedit: true,
          _currentContent: reeditData.currentContent,
          _instruction: reeditData.instruction,
        }
      : {
          serviceType: 'reedit',
          prompt,
          userId,
        };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 429) { const e = new Error('RATE_LIMIT'); e.status = 429; throw e; }
    if (res.status === 402) { const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e; }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.error || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    return await res.json();
  }

  async _callBackend(serviceType, prompt, credits = null, cost = 1) {
    const userId = localStorage.getItem('mz_uid') || 'anon';

    // Obter token JWT para autenticação no servidor
    let authToken = null;
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      authToken = await authManager.getValidToken();
    } catch { /* sem token */ }

    if (!authToken) {
      throw Object.assign(new Error('Sessão expirada. Inicie sessão novamente.'), { code: 'AUTH_REQUIRED' });
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // ── PASSO 1: Deduzir créditos via /api/deduct-credit ────────────────
    // Feito ANTES da geração para garantir que os créditos são consumidos
    // mesmo que a geração falhe (o servidor de IA pode falhar, o crédito foi usado).
    const deductRes = await fetch('/api/deduct-credit', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ cost }),
    });

    if (deductRes.status === 401) {
      const e = new Error('Sessão inválida. Inicie sessão novamente.'); e.status = 401;
      throw e;
    }
    if (deductRes.status === 402) {
      const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e;
    }
    if (!deductRes.ok) {
      const d = await deductRes.json().catch(() => ({}));
      throw new Error(d.error || 'Erro ao verificar créditos. Tente novamente.');
    }

    const { credits: creditsAfterDeduct } = await deductRes.json();

    // ── PASSO 2: Gerar documento ─────────────────────────────────────────
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        serviceType,
        prompt,
        userId,
        creditsRemaining: creditsAfterDeduct, // enviado de volta para o cliente via resposta
      }),
    });

    if (res.status === 429) { const e = new Error('RATE_LIMIT'); e.status = 429; throw e; }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.error || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    const result = await res.json();
    // Garantir que creditsRemaining está sempre presente (vem do /api/deduct-credit)
    if (typeof result.creditsRemaining !== 'number') {
      result.creditsRemaining = creditsAfterDeduct;
    }
    return result;
  }

  _buildPrompt(type, data, ocr, templateData = null, pickerTemplate = null) {
    // ── Bloco de template próprio (se o utilizador carregou um modelo) ─────
    // CORRIGIDO: tratamento separado para imagem vs texto extraído (PDF/Word).
    // Antes, quando o utilizador carregava uma IMAGEM, templateData.text era vazio
    // e o bloco retornava '' silenciosamente — a IA ignorava o modelo e gerava
    // o documento no layout padrão MzDocs. Agora a instrução de estrutura é sempre
    // injectada, seja com texto extraído (PDF/Word) ou com descrição estrutural (imagem).
    const templateBlock = (() => {
      if (!templateData) return '';
      const src = templateData.text || '';

      // Caso 1: Imagem carregada (base64 disponível, sem texto extraível)
      // A IA não pode "ver" a imagem directamente neste fluxo, mas consegue
      // reproduzir a estrutura visual se descrevermos o tipo de layout pretendido.
      if (!src && templateData.base64) {
        return `

MODELO DO UTILIZADOR (imagem de layout carregada):
O utilizador carregou uma imagem com o layout visual que pretende reproduzir. Siga rigorosamente as seguintes regras de estrutura:

REGRAS OBRIGATÓRIAS DE ESTRUTURA:
1. Mantenha EXACTAMENTE as mesmas secções na mesma ordem que aparecem num documento deste tipo
2. Se for um CV/Curriculo: reproduza layout com barra lateral (contactos, competencias, linguas) e area principal (experiencia, formacao, realizacoes) — nao use layout de coluna simples
3. Se for um documento formal (contrato, requerimento, acta): mantenha cabecalhos formais no topo, corpo estruturado e espacos para assinaturas no rodape
4. Se for um orcamento/factura/recibo: mantenha tabelas com colunas alinhadas e totais no rodape
5. NAO use o layout padrao generico — reproduza a estrutura visual do tipo de documento mostrado na imagem
6. Mantenha hierarquia visual: titulos de seccao em destaque, subseccoes indentadas, bullets onde aplicavel

INSTRUCAO CRITICA: O documento gerado DEVE ter a estrutura visual do tipo de documento da imagem. NAO gere um documento com layout diferente do modelo fornecido.
`;
      }

      // Caso 2: PDF ou Word carregado (texto extraido disponivel)
      if (!src) return '';
      return `

MODELO DO UTILIZADOR (estrutura/layout a respeitar):
O utilizador forneceu o seguinte modelo. Mantenha a estrutura, cabecalhos, seccoes e estilo exactamente como estao. Substitua apenas os marcadores de conteudo com os dados reais fornecidos abaixo.

--- INICIO DO MODELO ---
${src.slice(0, 6000)}
--- FIM DO MODELO ---

INSTRUCAO CRITICA: Preencha o modelo acima com os dados reais. NAO gere um documento diferente. Mantenha o layout, a sequencia e o estilo do modelo. Se o modelo tiver marcadores como [NOME], [DATA], [VALOR], substitua-os pelos dados reais fornecidos.
`;
    })();

    // Utilitário: número por extenso em MZN (simplificado)
    const _numPorExtenso = (val) => {
      const n = parseInt(val || 0);
      if (n === 0) return 'zero';
      const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez',
        'onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
      const d = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
      const c = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
      if (n < 20) return u[n];
      if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' e ' + u[n%10] : '');
      if (n < 1000) return (n===100?'cem':c[Math.floor(n/100)]) + (n%100 ? ' e ' + _numPorExtenso(n%100) : '');
      if (n < 1000000) {
        const m = Math.floor(n/1000);
        const r = n%1000;
        return (m===1?'mil':_numPorExtenso(m)+' mil') + (r ? ' e ' + _numPorExtenso(r) : '');
      }
      return n.toLocaleString('pt-MZ') + ' (por extenso)';
    };

    const ocrBlock = ocr ? `\n\nRascunho OCR (use como base, corrija erros):\n${ocr}` : '';

    // ── Picker template: quando um template do marketplace com htmlTemplate está activo ──
    // O modelo tem um layout HTML estruturado (duas colunas, sidebar, etc.)
    // Geramos o documento como HTML directamente para fidelidade máxima ao template.
    if (pickerTemplate?.htmlTemplate) {
      return this._buildHTMLStructuredPrompt(type, data, ocr, pickerTemplate);
    }

    const builders = {
      trabalho: () => {
        const pags    = parseInt(data.paginas) || 5;
        const devPags = Math.max(2, pags - 3);
        const numCaps = Math.max(2, Math.round(devPags / 1.5));
        const palavras = pags * 420;
        const ano = new Date().getFullYear();

        const capsEstrutura = Array.from({ length: numCaps }, (_, i) => {
          const capNum = i + 2;
          return [
            '',
            '---PAGE_BREAK---',
            `## ${capNum}. [Título do Capítulo ${i + 1} — específico ao tema "${data.tema}"]`,
            '',
            `### ${capNum}.1 [Subtítulo A — aspecto principal]`,
            `[ESCREVA AGORA: mínimo 4 parágrafos completos de 6-8 linhas cada. Conteúdo académico real com dados, datas, nomes, exemplos concretos do contexto moçambicano/africano. PROIBIDO usar marcadores de lugar.]`,
            '',
            `### ${capNum}.2 [Subtítulo B — aspecto complementar]`,
            `[ESCREVA AGORA: mínimo 3 parágrafos completos de 6-8 linhas cada. Análise crítica, comparações, implicações práticas para Moçambique.]`,
            '',
            `### ${capNum}.3 [Subtítulo C — síntese do capítulo]`,
            `[ESCREVA AGORA: mínimo 2 parágrafos de 5-6 linhas resumindo os pontos-chave do capítulo e ligando ao próximo.]`,
          ].join('\n');
        }).join('\n');

        const indice = Array.from({ length: numCaps }, (_, i) =>
          `   ${i + 2}. [Capítulo ${i + 1}] .................................................. ${i + 4}`
        ).join('\n');

        return `Você é um docente universitário experiente. Redija um TRABALHO ACADÉMICO COMPLETO, EXTENSO E DETALHADO seguindo exactamente a estrutura abaixo.

DADOS DO TRABALHO:
- Tema: "${data.tema}"
- Disciplina: ${data.disciplina}
- Nível: ${data.nivel}
- Extensão: ${pags} folhas A4 = MÍNIMO ${palavras} palavras de conteúdo real
- Requisitos do docente: ${data.requisitos || 'seguir normas académicas padrão APA'}

REGRAS ABSOLUTAS DE CONTEÚDO:
1. O marcador ---PAGE_BREAK--- separa cada folha A4 — use-o exactamente como indicado
2. Cada parágrafo deve ter 6-8 linhas de texto académico denso e contínuo
3. NUNCA escreva "[PREENCHER]", "[escrever aqui]" ou qualquer marcador de lugar no conteúdo narrativo — escreva o texto real
4. Use exemplos reais, dados históricos verificáveis, contexto moçambicano e africano sempre que possível
5. Corrija ortografia e acentuação em português europeu/moçambicano
6. Títulos e subtítulos em **negrito** e bem hierarquizados

REGRAS DE QUALIDADE (violações tornam o documento inaceitável):
- NUNCA repita o mesmo parágrafo ou ideia em secções diferentes — cada secção deve trazer conteúdo NOVO
- NUNCA use linguagem genérica: "crescimento sustentável", "uma das principais", "de extrema importância" são proibidas
- NUNCA inclua referências bibliográficas fictícias — se não tens referências reais, usa a fórmula indicada no fim
- SEMPRE escreve texto académico denso, com dados, datas, nomes e exemplos concretos
- Cada parágrafo tem EXACTAMENTE 1 ideia principal desenvolvida em 6-8 linhas

ESTRUTURA OBRIGATÓRIA (copie exactamente incluindo ---PAGE_BREAK---):

---PAGE_BREAK---
# ${data.tema}

---PAGE_BREAK---
## Índice

   1. Introdução .................................................. 3
${indice}
   ${numCaps + 2}. Conclusão .................................................. ${numCaps + 4}
   ${numCaps + 3}. Referências Bibliográficas ................................ ${numCaps + 5}

---PAGE_BREAK---
## 1. Introdução

[ESCREVA AGORA um texto introdutório com MÍNIMO 5 parágrafos de 6-8 linhas cada:
Parágrafo 1 — Contextualização: apresente o tema com dados históricos, geográficos ou sociais reais que enquadrem o leitor. Cite datas, locais e factos verificáveis.
Parágrafo 2 — Relevância: explique por que este tema é importante para Moçambique, para África e para o mundo actual. Use argumentos sólidos.
Parágrafo 3 — Objectivos: defina claramente o objectivo geral e pelo menos 3 objectivos específicos do trabalho usando verbos de acção (analisar, descrever, comparar, avaliar...).
Parágrafo 4 — Metodologia: descreva o tipo de pesquisa (bibliográfica, qualitativa, descritiva), as fontes consultadas e os critérios de selecção.
Parágrafo 5 — Estrutura do trabalho: apresente brevemente o que o leitor encontrará em cada capítulo.]
${capsEstrutura}
---PAGE_BREAK---
## ${numCaps + 2}. Conclusão

[ESCREVA AGORA uma conclusão com MÍNIMO 4 parágrafos de 6-8 linhas cada:
Parágrafo 1 — Síntese geral: retome os principais achados de cada capítulo de forma integrada, mostrando como se relacionam.
Parágrafo 2 — Resposta aos objectivos: avalie explicitamente se os objectivos propostos na introdução foram atingidos e como.
Parágrafo 3 — Contribuições e limitações: indique o contributo deste trabalho para o conhecimento na área e reconheça as limitações encontradas.
Parágrafo 4 — Recomendações: proponha acções concretas para gestores, políticos, educadores ou investigadores, e indique linhas futuras de pesquisa.]

---PAGE_BREAK---
## ${numCaps + 3}. Referências Bibliográficas

INSTRUÇÃO CRÍTICA PARA AS REFERÊNCIAS:
- Lista apenas referências que EXISTEM REALMENTE e são verificáveis
- Formato APA 7ª edição obrigatório
- Se não tens certeza de uma referência, NÃO a incluas
- No mínimo: 1 livro académico real + 1 relatório de organismo oficial (ONU, Banco Mundial, INE Moçambique, SADC)
- Após a lista de referências reais, adiciona SEMPRE esta nota: "[O autor deve completar com referências específicas consultadas durante a pesquisa]"
- NUNCA adiciona aviso de que as referências são fictícias — em vez disso, só lista referências reais ou deixa a nota acima
`;
      },

      cv: () => {
        const isPrimeiroEmprego = (data.perfilCV || '').includes('Primeiro Emprego');
        const temExperiencia    = !!(data.experiencia && data.experiencia.trim());
        return `Você é especialista sénior em recursos humanos para o mercado moçambicano. Crie um CURRÍCULO VITAE PROFISSIONAL completo e pronto a usar em Markdown.

PERFIL DO CANDIDATO: ${data.perfilCV || 'Com Experiência Profissional'}

DADOS:
- Nome: ${data.nome} | Cargo pretendido: ${data.cargo}
- Nascimento: ${data.nascimento || '[a completar]'} | Telefone: ${data.contacto}
- Email: ${data.email || '[a completar]'} | Localização: ${data.localizacao || 'Moçambique'}
- Línguas: ${data.linguas || 'Português (nativo)'}
- Formação: ${data.formacao}
- Experiência: ${data.experiencia || 'Sem experiência formal prévia'}
- Habilidades técnicas: ${data.habilidades || '[a completar]'}
- Realização de destaque: ${data.exemplo || '[nenhuma fornecida]'}
- Objectivo: ${data.objectivo || '[a completar]'}${ocrBlock}

REGRAS OBRIGATÓRIAS:
1. Use VERBOS DE ACÇÃO no passado com resultados mensuráveis — use os dados de "Realização de destaque" como base real, não invente
2. NUNCA: "profissional dedicado", "trabalho em equipa" sem contexto específico
3. Máximo 2 páginas A4. NUNCA inclua foto, estado civil, religião, filiação política
4. Formação: do mais recente para o mais antigo
5. ${isPrimeiroEmprego ? 'PERFIL PRIMEIRO EMPREGO: enfatize formação, voluntariado, estágios, actividades extra-curriculares e potencial. Use secção "Experiências de Formação / Estágios / Voluntariado"' : 'PERFIL EXPERIENTE: cada cargo com bullets de realizações com impacto mensurável'}
6. Línguas: inclua SEMPRE a secção de línguas com os níveis fornecidos
7. A secção "Realização de destaque" deve ser usada literalmente com os factos concretos fornecidos

ESTRUTURA OBRIGATÓRIA:

# ${data.nome}
**${data.cargo}**
📞 ${data.contacto} | ✉️ ${data.email || '[email]'} | 📍 ${data.localizacao || 'Moçambique'}

---

## Objectivo Profissional
[2-3 frases específicas baseadas em "${data.objectivo || data.cargo}": competência principal + valor concreto que oferece + tipo de organização pretendida]

---

## Formação Académica
[Formate cada entrada: **Grau — Curso** | Instituição | Ano — do mais recente para o mais antigo]

---

## ${isPrimeiroEmprego && !temExperiencia ? 'Experiências de Formação / Estágios / Voluntariado' : 'Experiência Profissional'}
[Para cada cargo/experiência: **Cargo** | Organização | Período — seguido de 2-3 bullets com acções e resultados concretos]

---

## Realização de Destaque
[Expanda e estruture o seguinte exemplo fornecido pelo candidato: "${data.exemplo || 'a preencher'}"]

---

## Competências Técnicas
${data.habilidades || '[ferramentas, software, equipamentos]'}

---

## Línguas
[Formate: Língua — Nível (Nativo / Fluente / Avançado / Intermédio / Básico)]

---

## Referências
Disponíveis mediante solicitação.`;
      },
      carta: () => {
        const tipo = data.tipo || 'Pedido Formal';
        const isReclamacao   = tipo === 'Reclamação';
        const isDemissao     = tipo === 'Demissão';
        const isCandidatura  = tipo === 'Candidatura a Emprego' || tipo === 'Carta de Motivação';
        const isComercial    = tipo === 'Apresentação Comercial';

        const blocoCondicional = isReclamacao
          ? `\n- N.º de referência / encomenda: ${data.refReclamacao || '[indicar referência]'}`
          : isDemissao
          ? `\n- Data de saída pretendida: ${data.dataSaida || '[a indicar]'}\n- Aviso prévio: ${data.avisoPrevio || 'Sim (30 dias)'}`
          : '';

        const estruturaPorTipo = isCandidatura
          ? `[§1 — Apresentação directa: quem é, para que vaga/função se candidata e como soube da oportunidade. 2-3 linhas sem "venho por este meio"]

[§2 — Correspondência perfil/vaga: mostre como a sua formação (${data.formacao || 'não indicada'}) e experiência se encaixam directamente nos requisitos. 4-5 linhas com exemplos concretos]

[§3 — Motivação genuína: por que esta empresa/organização especificamente. 3-4 linhas]

[§4 — Chamada à acção: solicita entrevista com disponibilidade concreta]`
          : isReclamacao
          ? `[§1 — Identificação do problema: descreva de forma factual o que aconteceu, quando, e qual o impacto. Mencione a ref. ${data.refReclamacao || '[referência]'}. 3-4 linhas]

[§2 — Evidências e tentativas anteriores: o que já foi comunicado ou tentado resolver, sem resultado. 3-4 linhas]

[§3 — Pedido específico e prazo: o que pretende exactamente (reembolso / substituição / explicação) e em que prazo razoável. 2-3 linhas]

[§4 — Aviso: consequências caso não haja resposta (reclamação no Livro de Reclamações / entidade reguladora)]`
          : isDemissao
          ? `[§1 — Comunicação directa da demissão: data de entrada na empresa, cargo, e data de saída pretendida (${data.dataSaida || '[data]'}). ${data.avisoPrevio ? 'Mencione o aviso prévio: ' + data.avisoPrevio : ''}. 2-3 linhas]

[§2 — Motivação (opcional e diplomática): razão genérica sem queimar pontes. 2-3 linhas]

[§3 — Comprometimento com transição: disponibilidade para formar substituto, entregar trabalhos pendentes, garantir continuidade. 3-4 linhas]

[§4 — Agradecimento genuíno pela oportunidade e experiência]`
          : isComercial
          ? `[§1 — Apresentação da empresa/serviço: o que oferece, para quem, e por que é relevante para o destinatário específico. 3-4 linhas]

[§2 — Proposta de valor concreta: dados, resultados, casos de sucesso. 4-5 linhas]

[§3 — Oferta específica e próximo passo: reunião, demonstração, proposta formal. 2-3 linhas]`
          : `[§1 — Apresentação e propósito directo: 2-3 linhas sem "venho por este meio"]

[§2 — Desenvolvimento do ponto principal: factos e fundamentos. 4-5 linhas]

[§3 — Pontos complementares se existirem. 3-4 linhas]

[§4 — Pedido claro com prazo: "Solicito a V.ª Ex.ª que... até [data]"]`;

        return `Você é especialista em comunicação formal moçambicana. Redija uma CARTA FORMAL COMPLETA do tipo "${tipo}" — adapte RIGOROSAMENTE o tom, estrutura e linguagem a este tipo específico.

DADOS:
- Tipo: ${tipo}
- Remetente: ${data.remetenteNome}, ${data.remetenteLocal || 'Maputo'}
- Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}
- Assunto: ${data.assunto}
- O que comunicar: ${data.pontos}${blocoCondicional}${ocrBlock}

REGRAS:
1. NUNCA use "Venho por este meio" — comece directamente
2. Máximo 1 página A4. Tom 100% adaptado ao tipo "${tipo}"
3. Cada parágrafo: UMA única ideia, 3-5 linhas
4. Data por extenso: ${data.remetenteLocal || 'Maputo'}, [dia] de [mês] de [ano]
5. Para Reclamação: tom assertivo mas respeitoso, nunca agressivo
6. Para Demissão: tom positivo, agradecido, profissional — nunca crítico

ESTRUTURA OBRIGATÓRIA:

**${data.remetenteNome}**
${data.remetenteLocal || 'Maputo'}, [data por extenso]

Exmo(a). Sr(a). ${data.destinatarioNome}
${data.destinatarioEnti}

**Assunto: ${data.assunto}**

[Saudação adequada ao tipo "${tipo}"],

${estruturaPorTipo}

Com os melhores cumprimentos,

_______________________________
**${data.remetenteNome}**`;
      },
      orcamento: () => {
        const anoAtual = new Date().getFullYear();
        const temInfra = data.infraestrutura && !data.infraestrutura.includes('Não aplicável');
        return `Você é engenheiro civil experiente com 15 anos de obra em Moçambique. Elabore um ORÇAMENTO DE CONSTRUÇÃO DETALHADO em Markdown.

DADOS DA OBRA:
- Tipo de obra: ${data.tipoObra}
- Área: ${data.area || 'a calcular'} m² | N.º de pisos: ${data.nPisos || 'Térreo (R/C)'}
- Localização: ${data.local}
- Acabamento: ${data.acabamento || 'Médio / Padrão'}
- Fase: ${data.fase}
- Cobertura: ${data.cobertura || 'Laje de betão'}
- Infraestrutura: ${data.infraestrutura || 'a verificar'}
- Prazo desejado: ${data.prazo || 60} dias
- Detalhes: ${data.extra || 'padrão'}${ocrBlock}

REGRAS CRÍTICAS:
1. Preços de mercado moçambicano ${anoAtual} em MZN — use intervalos realistas; NÃO use valores fixos desactualizados
2. Preços de referência actuais: cimento 50kg ≈ 900–1.000 MZN/saco | tijolo cerâmico ≈ 6–9 MZN/un | ferro 12mm ≈ 500–550 MZN/vara | areia ≈ 1.800–2.200 MZN/m³ | brita ≈ 2.200–2.600 MZN/m³
3. Quantidades calculadas com base na área (${data.area || '?'} m²), n.º de pisos (${data.nPisos || 'R/C'}) e tipo de obra fornecidos
4. Tabelas com separador de milhares: 12 500,00 MZN (nunca "12500MZN")
5. Cobertura "${data.cobertura || 'Laje de betão'}": inclua materiais e mão-de-obra específicos a este tipo
6. ${temInfra ? `Infraestrutura "${data.infraestrutura}": inclua secção específica de instalações` : 'Infraestrutura não indicada: mencione que orçamento de instalações é separado'}
7. Adicione linha de imprevistos (10%) e imposto (IVA 16% se aplicável)
8. Nota de validade do orçamento: 30 dias (preços sujeitos a variação)

ESTRUTURA OBRIGATÓRIA:

# Orçamento de ${data.tipoObra}
**${data.local} | ${new Date().toLocaleDateString('pt-MZ')} | Válido por 30 dias**

## Resumo da Obra
[Descrição técnica: tipo, área, n.º pisos, cobertura, localização, padrão de acabamento, prazo]

## 1. Materiais de Construção

| Material | Unid. | Qtd. Est. | Preço Unit. (MZN) | Total (MZN) |
|---|---|---|---|---|
| Cimento (50kg) | Saco | [qtd calculada] | [900–1.000] | [total] |
| Tijolo cerâmico | Unid. | [qtd calculada] | [7–9] | [total] |
| Areia | m³ | [qtd] | [1.900] | [total] |
| Brita | m³ | [qtd] | [2.400] | [total] |
| Ferro 12mm | Vara | [qtd] | [520] | [total] |
| [Materiais de cobertura para ${data.cobertura || 'laje'}] | [unid] | [qtd] | [preço] | [total] |
| [Outros materiais específicos à obra] | | | | |
| **TOTAL MATERIAIS** | | | | **[total]** |

## 2. Mão-de-Obra

| Profissional | Dias | Diária (MZN) | Total (MZN) |
|---|---|---|---|
| Mestre de obras | [n] | [1.300] | [total] |
| Pedreiro | [n] | [950] | [total] |
| Servente | [n] | [650] | [total] |
| Carpinteiro (cofragem) | [n] | [1.100] | [total] |
| Electricista | [n] | [1.100] | [total] |
| Canalizador | [n] | [1.100] | [total] |
| **TOTAL MÃO-DE-OBRA** | | | **[total]** |

## 3. Equipamentos e Alugueres

| Item | Período | Custo (MZN) |
|---|---|---|
| Betoneira | [n dias] | [total] |
| Andaimes | [n dias] | [total] |
| **TOTAL EQUIPAMENTOS** | | **[total]** |

## 4. Resumo Financeiro

| Categoria | Valor (MZN) |
|---|---|
| Materiais | [total] |
| Mão-de-obra | [total] |
| Equipamentos | [total] |
| Imprevistos (10%) | [total] |
| **TOTAL GERAL (sem IVA)** | **[TOTAL]** |

## 5. Condições Comerciais
- **Validade:** 30 dias a contar de ${new Date().toLocaleDateString('pt-MZ')}
- **Prazo de execução:** ${data.prazo || 60} dias úteis após inicio
- **Pagamento sugerido:** 30% mobilização + 40% a meio da obra + 30% na entrega
- **Garantia de mão-de-obra:** 6 meses para defeitos de execução
- **Nota:** Preços sujeitos a variação cambial USD/MZN e disponibilidade de mercado`;
      },
      arrendamento: () => {
        const _numPorExtenso2 = (val) => {
          const n = parseInt(val || 0);
          if (n === 0) return 'zero';
          const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
          const d = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
          const c = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
          if (n < 20) return u[n];
          if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' e ' + u[n%10] : '');
          if (n < 1000) return (n===100?'cem':c[Math.floor(n/100)]) + (n%100 ? ' e ' + _numPorExtenso2(n%100) : '');
          if (n < 1000000) { const m=Math.floor(n/1000); const r=n%1000; return (m===1?'mil':_numPorExtenso2(m)+' mil')+(r?' e '+_numPorExtenso2(r):''); }
          return n.toLocaleString('pt-MZ') + ' (por extenso)';
        };
        const isComercial = data.tipoImovel?.includes('Comercial') || data.tipoImovel?.includes('Escritório') || data.tipoImovel?.includes('Loja');
        const avisoPrazo = data.duracao === '6 meses' ? '30 (trinta)' : '60 (sessenta)';
        const districtName = data.local?.includes('Maputo') ? 'KaMpfumo' : data.local?.includes('Matola') ? 'Matola' : (data.local?.split(',')[0] || 'Maputo');
        return `Você é advogado especialista em direito imobiliário moçambicano. Redija um CONTRATO DE ARRENDAMENTO juridicamente válido e completo.

BASE LEGAL OBRIGATÓRIA:
- Lei n.º 19/2013, de 23 de Setembro (Lei do Arrendamento Urbano de Moçambique)
- Código Civil de Moçambique (Decreto n.º 47344, de 25 de Novembro de 1966, com alterações)
- Lei n.º 7/2015, de 6 de Outubro (Lei da Mediação e Arbitragem)
- Decreto n.º 61/2006, de 26 de Dezembro (Regulamento do Arrendamento Urbano)
- Lei n.º 32/2007 e Decreto n.º 21/2004 (obrigações fiscais sobre rendimentos prediais)

DADOS:
- Tipo de imóvel: ${data.tipoImovel}
- Finalidade: ${isComercial ? 'comercial/profissional' : 'habitacional'}
- Senhorio: ${data.proprietario} | BI: ${data.biProprietario}
- Inquilino: ${data.locatario} | BI: ${data.biLocatario}
- Localização: ${data.local}
- Renda: ${parseInt(data.valor || 0).toLocaleString('pt-MZ')} MZN/mês (${_numPorExtenso2(data.valor)} meticais)
- Método de pagamento: ${data.metodoPagamento || 'a acordar'}
- Duração: ${data.duracao}
- Caução: ${data.caucao}
- Água e electricidade: ${data.quemPagaServicos || 'a acordar'}
- Condições especiais: ${data.condicoes || 'Nenhuma'}${ocrBlock}

REGRAS DE QUALIDADE:
1. NUNCA deixar campos obrigatórios em branco — use os dados fornecidos
2. Valor da renda SEMPRE por extenso E em algarismos
3. Data de início OBRIGATÓRIA — use "[DATA DE INÍCIO: ____/____/______]" se não fornecida
4. Multa de mora máxima 3% ao mês conforme Lei n.º 19/2013, art. 22.º
5. Aviso prévio de rescisão: ${avisoPrazo} dias, nos termos do art. 34.º
6. Incluir cláusula específica sobre método de pagamento: ${data.metodoPagamento || 'a definir'}
7. Incluir cláusula clara sobre quem paga água e electricidade: ${data.quemPagaServicos}
8. ${isComercial ? 'Contrato COMERCIAL: incluir cláusula sobre horário de funcionamento, uso exclusivamente comercial, e obrigação de licença comercial pelo Inquilino' : 'Contrato HABITACIONAL: incluir cláusula sobre uso exclusivamente habitacional e proibição de subarrendamento'}
9. Obrigações fiscais: Senhorio obrigado a declarar rendas ao IRPS (imposto sobre rendimentos prediais)

ESTRUTURA OBRIGATÓRIA:

---

# CONTRATO DE ARRENDAMENTO ${data.tipoImovel.toUpperCase()}

**ENTRE:**

**SENHORIO:** ${data.proprietario}, portador(a) do Bilhete de Identidade n.º **${data.biProprietario}**, residente em ________________________________, doravante designado(a) **"Senhorio"**;

**E**

**INQUILINO:** ${data.locatario}, portador(a) do Bilhete de Identidade n.º **${data.biLocatario}**, residente em ________________________________, doravante designado(a) **"Inquilino"**;

Celebram, de mútuo acordo e boa-fé, o presente Contrato de Arrendamento, regido pela Lei n.º 19/2013, de 23 de Setembro, e pelo Código Civil de Moçambique:

---

## **CLÁUSULA 1.ª — OBJECTO**

1.1 O Senhorio cede ao Inquilino, para uso exclusivo como ${data.tipoImovel}, o imóvel sito em **${data.local}**, composto por ________________________________ (descrever: n.º de divisões, características).

1.2 O imóvel destina-se exclusivamente a fins **${isComercial ? 'comerciais/profissionais' : 'habitacionais'}**, sendo expressamente proibida a sublocação ou alteração de finalidade sem autorização escrita do Senhorio, nos termos do artigo 14.º da Lei n.º 19/2013.

---

## **CLÁUSULA 2.ª — PRAZO**

2.1 O presente contrato tem início em **[DATA DE INÍCIO: ____/____/______]** e vigorará pelo período de **${data.duracao}**, findando em **[DATA DE TÉRMINO: ____/____/______]**.

2.2 Findo o prazo, o contrato renovar-se-á automaticamente por iguais períodos, salvo comunicação escrita de não renovação com antecedência mínima de **${avisoPrazo} dias**, conforme artigo 34.º da Lei n.º 19/2013.

---

## **CLÁUSULA 3.ª — RENDA E CONDIÇÕES DE PAGAMENTO**

3.1 A renda mensal é fixada em **${parseInt(data.valor || 0).toLocaleString('pt-MZ')} MZN (${_numPorExtenso2(data.valor)} meticais)**, devida até ao dia **5 (cinco)** de cada mês.

3.2 O pagamento será efectuado por **${data.metodoPagamento || '________________________________'}**${data.metodoPagamento === 'M-Pesa' ? ' para o número: ________________________________' : data.metodoPagamento === 'Transferência Bancária' || data.metodoPagamento === 'Depósito Bancário' ? ' para a conta n.º ________________________________, Banco ________________________________' : ''}.

3.3 Em caso de mora no pagamento, o Inquilino pagará ao Senhorio uma multa de **3% (três por cento)** sobre o valor em dívida por cada mês de atraso, nos termos do artigo 22.º da Lei n.º 19/2013, sem prejuízo de juros legais.

3.4 A renda poderá ser actualizada anualmente de acordo com o índice de inflação oficial publicado pelo INE — Instituto Nacional de Estatística de Moçambique, com pré-aviso de 30 dias, a partir do segundo ano de vigência do contrato.

---

## **CLÁUSULA 4.ª — CAUÇÃO**

4.1 O Inquilino entrega ao Senhorio, a título de caução, o montante de **${data.caucao}**, no acto da assinatura deste contrato.

4.2 A caução destina-se a garantir o cumprimento das obrigações contratuais, incluindo reparação de danos causados ao imóvel além do desgaste normal.

4.3 A caução será devolvida no prazo máximo de **30 (trinta) dias** após a entrega das chaves e verificação do estado do imóvel, deduzidos eventuais danos, rendas em atraso ou despesas de recuperação, nos termos do artigo 25.º da Lei n.º 19/2013.

---

## **CLÁUSULA 5.ª — ENCARGOS (ÁGUA, ELECTRICIDADE E SERVIÇOS)**

5.1 **${data.quemPagaServicos === 'Incluídas na renda' ? 'As despesas de água e electricidade estão INCLUÍDAS no valor da renda mensal acordada.' : data.quemPagaServicos === 'Proprietário' ? 'As despesas de água e electricidade são da responsabilidade do SENHORIO.' : data.quemPagaServicos === 'Inquilino (separado da renda)' ? 'As despesas de água e electricidade são da responsabilidade EXCLUSIVA do INQUILINO, a pagar directamente às entidades fornecedoras (FIPAG / EDM), não estando incluídas no valor da renda.' : 'As despesas de água e electricidade serão acordadas separadamente entre as partes.'}**

5.2 Outras despesas de condomínio, lixo, segurança ou manutenção de espaços comuns: ________________________________.

---

## **CLÁUSULA 6.ª — OBRIGAÇÕES DO SENHORIO**

O Senhorio obriga-se a:

a) Entregar o imóvel em boas condições de habitabilidade e com todos os equipamentos em funcionamento;
b) Assegurar o gozo pacífico do imóvel pelo Inquilino durante o período contratual;
c) Realizar as obras de conservação estrutural necessárias para manter o imóvel em boas condições;
d) Não proceder a vistoria do imóvel sem aviso prévio de 48 horas, salvo em caso de emergência;
e) Cumprir as obrigações fiscais relativas às rendas recebidas (IRPS — rendimentos prediais), nos termos da legislação tributária moçambicana.

---

## **CLÁUSULA 7.ª — OBRIGAÇÕES DO INQUILINO**

O Inquilino obriga-se a:

a) Pagar a renda no prazo e pelo método acordados na Cláusula 3.ª;
b) Usar o imóvel exclusivamente para o fim estipulado na Cláusula 1.ª;
c) Conservar o imóvel, efectuando as reparações de pequena conservação a seu cargo;
d) Não realizar obras de transformação sem autorização escrita do Senhorio;
e) Não sublocar, ceder ou transferir, no todo ou em parte, o uso do imóvel sem autorização;
f) Permitir ao Senhorio a realização de obras urgentes, mediante pré-aviso;
g) Entregar o imóvel nas mesmas condições em que o recebeu, salvo desgaste normal de uso.

**Condições especiais acordadas:** ${data.condicoes || 'Nenhuma condição especial além das estabelecidas por lei.'}

${isComercial ? `---

## **CLÁUSULA 8.ª — DISPOSIÇÕES ESPECIAIS (ARRENDAMENTO COMERCIAL)**

8.1 O Inquilino obriga-se a obter e manter válidas todas as licenças e autorizações administrativas necessárias ao exercício da sua actividade, não podendo imputar ao Senhorio qualquer responsabilidade por atrasos ou recusas.

8.2 O Inquilino pode adaptar o imóvel às suas necessidades comerciais, desde que autorizado por escrito pelo Senhorio e revertendo as obras ao estado original no final do contrato, salvo acordo em contrário.` : ''}

---

## **CLÁUSULA ${isComercial ? '9' : '8'}.ª — RESCISÃO**

${isComercial ? '9' : '8'}.1 **Por iniciativa do Inquilino:** Mediante comunicação escrita ao Senhorio com antecedência mínima de **${avisoPrazo} dias**, nos termos do artigo 35.º da Lei n.º 19/2013.

${isComercial ? '9' : '8'}.2 **Por iniciativa do Senhorio:** Nas condições previstas no artigo 36.º da Lei n.º 19/2013, nomeadamente: falta de pagamento de renda por período superior a 60 dias; uso indevido do imóvel; realização de obras não autorizadas; subarrendamento não autorizado.

${isComercial ? '9' : '8'}.3 Em caso de rescisão com justa causa imputável ao Inquilino, este perderá o direito à devolução da caução, sem prejuízo de indemnização por danos adicionais.

---

## **CLÁUSULA ${isComercial ? '10' : '9'}.ª — RESOLUÇÃO DE CONFLITOS E FORO**

${isComercial ? '10' : '9'}.1 As partes comprometem-se a resolver amigavelmente quaisquer litígios emergentes do presente contrato.

${isComercial ? '10' : '9'}.2 Não sendo possível a resolução amigável, as partes poderão recorrer à mediação nos termos da Lei n.º 7/2015, de 6 de Outubro.

${isComercial ? '10' : '9'}.3 Para os litígios que não possam ser resolvidos por mediação, fica eleito o **Tribunal Judicial de Distrito de ${districtName}**, com renúncia expressa de qualquer outro.

---

## **CLÁUSULA ${isComercial ? '11' : '10'}.ª — DISPOSIÇÕES FINAIS**

${isComercial ? '11' : '10'}.1 O presente contrato é celebrado em dois exemplares de igual valor, ficando um na posse de cada parte.

${isComercial ? '11' : '10'}.2 Tudo o que não estiver expressamente previsto neste contrato reger-se-á pela Lei n.º 19/2013, de 23 de Setembro, e pelo Código Civil de Moçambique.

${isComercial ? '11' : '10'}.3 A nulidade de qualquer cláusula não afecta a validade das restantes, que subsistirão em pleno vigor.

---

**${data.local?.split(',').pop()?.trim() || 'Maputo'}, ______ de __________________ de ________**

| | |
|---|---|
| **O SENHORIO** | **O INQUILINO** |
| ${data.proprietario} | ${data.locatario} |
| BI: ${data.biProprietario} | BI: ${data.biLocatario} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

---
*Reconhecimento de assinaturas recomendado para contratos com renda superior a 50.000 MZN/mês ou duração superior a 12 meses.*
*Nota fiscal: o Senhorio é obrigado a declarar as rendas recebidas ao IRPS (rendimentos prediais) junto da Autoridade Tributária de Moçambique.*`;
      },
      procuracao: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoProc = data.tipoProc || 'Especial (acto específico)';
        const isGeral = tipoProc === 'Geral (todos os actos)';
        const isImóvel = tipoProc === 'Venda de Imóvel';
        const isBancaria = tipoProc === 'Bancária';
        const isJudicial = tipoProc === 'Judicial';
        const tipoDocIdent = data.tipoDocIdent || 'Bilhete de Identidade (BI)';
        const subMandato = data.subMandato || 'Não (poderes intransmissíveis)';

        const poderesPorTipo = isGeral
          ? `**PODERES GERAIS:**
Para em meu nome e representação praticar todos os actos de administração ordinária e extraordinária, incluindo, mas não se limitando a:

1. Representar-me perante quaisquer entidades públicas e privadas, incluindo ministérios, repartições, tribunais, bancos, seguradoras e serviços notariais;
2. Assinar contratos, acordos e documentos de qualquer natureza;
3. Receber e dar quitação de quaisquer quantias que me sejam devidas;
4. Gerir contas bancárias, efectuar depósitos, levantamentos e transferências;
5. Representar-me em processos administrativos e judiciais;
6. Praticar quaisquer actos necessários à prossecução dos meus interesses.

**PODERES EXPRESSAMENTE EXCLUÍDOS (o procurador NÃO pode, sem nova procuração específica):**
- Alienar, hipotecar ou onerar bens imóveis;
- Contrair empréstimos em meu nome acima de 100.000 MZN;
- Fazer doações em meu nome;
- Nomear sub-procuradores${subMandato.includes('Não') ? '.' : ' (salvo autorização abaixo).'}`
          : isImóvel
          ? `**PODERES ESPECIAIS PARA VENDA DE IMÓVEL:**
O mandatário fica expressamente autorizado a:

1. Representar-me na negociação e celebração da escritura pública de compra e venda do imóvel sito em ________________________________, com a descrição predial n.º _______ da Conservatória do Registo Predial de _______;
2. Assinar a escritura pública de compra e venda, declarações e demais documentos necessários à formalização da venda;
3. Fixar o preço de venda e respectivas condições de pagamento;
4. Receber o preço de venda e dar quitação;
5. Praticar todos os demais actos necessários ao registo da transmissão junto da Conservatória do Registo Predial.

**PODERES EXCLUÍDOS:** O mandatário NÃO está autorizado a praticar quaisquer actos que extravasem o objecto específico da venda acima identificada.`
          : isBancaria
          ? `**PODERES ESPECIAIS BANCÁRIOS:**
O mandatário fica expressamente autorizado a, junto das instituições bancárias onde o outorgante seja titular de contas:

1. Movimentar, a débito e a crédito, as contas bancárias do outorgante;
2. Efectuar depósitos, levantamentos e transferências bancárias;
3. Requerer extratos, comprovativos e outros documentos bancários;
4. Assinar contratos de crédito ou outros instrumentos bancários (valor máximo: _________________ MZN);
5. Representar o outorgante perante o Banco de Moçambique e demais entidades de supervisão financeira.

*Conforme o Aviso n.º 01/GBM/2017 do Banco de Moçambique, esta procuração deve ser apresentada no banco para registo.*`
          : isJudicial
          ? `**PODERES ESPECIAIS JUDICIAIS:**
O mandatário (advogado/procurador judicial) fica expressamente autorizado a:

1. Representar-me em todos os actos e termos do processo n.º _______ (ou a identificar) perante o Tribunal _______;
2. Praticar todos os actos processuais, incluindo apresentação de petições, respostas, recursos e incidentes;
3. Transigir, desistir, confessar, reconvir e praticar quaisquer actos que a lei permita;
4. Receber notificações e citações em meu nome;
5. Substabelecer os poderes aqui conferidos a outros advogados (mandatário judicial).`
          : `**PODERES ESPECIAIS PARA:**
${data.acto}

O mandatário fica expressamente autorizado a:
1. Praticar todos os actos necessários à concretização do objectivo acima descrito;
2. Assinar todos os documentos necessários, incluindo declarações, requerimentos, contratos e recibos;
3. Representar-me perante as entidades competentes para o efeito;
4. Receber e dar quitação de valores directamente relacionados com o mandato.

**O mandatário NÃO está autorizado a:**
- Praticar actos que extravasem o objecto específico deste mandato;
- Efectuar actos a título gratuito em meu nome.`;

        const clausulaSubMandato = subMandato.includes('Não')
          ? 'O mandatário NÃO pode substabelecer os poderes aqui conferidos, sendo os mesmos intransmissíveis.'
          : subMandato.includes('todo')
          ? 'O mandatário PODE substabelecer os poderes aqui conferidos no todo, mediante comunicação escrita ao outorgante.'
          : 'O mandatário PODE substabelecer os poderes aqui conferidos em parte, mediante comunicação escrita ao outorgante.';

        const reconhecimentoObrigatorio = isImóvel || isGeral || isBancaria || isJudicial;

        return `Você é advogado especialista em direito civil e notariado moçambicano. Redija uma PROCURAÇÃO / MANDATO juridicamente válida, completa e lista para uso em ${tipoProc}.

BASE LEGAL OBRIGATÓRIA:
- Código Civil de Moçambique, artigos 262.º a 294.º (Representação e Procuração)
- Código do Notariado de Moçambique (Decreto n.º 47619, de 31 de Março de 1967, com alterações)
- Lei n.º 4/2013, de 22 de Fevereiro (Lei do Notariado — reconhecimento de assinaturas)
${isBancaria ? '- Aviso n.º 01/GBM/2017 do Banco de Moçambique (procurações bancárias)' : ''}
${isImóvel ? '- Lei n.º 19/2013, de 23 de Setembro (negócios imobiliários); Lei de Terras n.º 19/1997' : ''}
${isJudicial ? '- Código de Processo Civil de Moçambique; Estatuto da Ordem dos Advogados (Lei n.º 7/1994)' : ''}

DADOS:
- Tipo: ${tipoProc}
- Tipo de documento de identidade: ${tipoDocIdent}
- Outorgante: ${data.outorgante} | ${tipoDocIdent}: ${data.biOutorgante}
- Morada do Outorgante: ${data.moradaOutorgante}
- Procurador/Mandatário: ${data.procurador} | ${tipoDocIdent}: ${data.biProcurador}
- Morada do Procurador: ${data.moradaProcurador}
- Poderes/Acto: ${data.acto}
- Sub-mandato: ${subMandato}
- Validade: ${data.validade}
- Local: ${data.local}${ocrBlock}

REGRAS CRÍTICAS:
1. Use os dados fornecidos — NUNCA deixe campos obrigatórios em branco
2. Para procuração sobre imóveis: reconhecimento notarial é SEMPRE obrigatório (art. 80.º do Código do Notariado)
3. Para procuração geral: liste EXPLICITAMENTE os actos excluídos
4. Inclua SEMPRE a cláusula de sub-mandato conforme instrução: "${subMandato}"

DOCUMENTO COMPLETO:

---

# PROCURAÇÃO ${tipoProc.toUpperCase()}

**OUTORGANTE (quem dá o poder):**
Eu, **${data.outorgante}**, portador(a) de ${tipoDocIdent} n.º **${data.biOutorgante}**, [nacionalidade moçambicana / outra: ______], residente em **${data.moradaOutorgante}**, no pleno uso das minhas faculdades civis e jurídicas,

**NOMEIO E CONSTITUO MEU PROCURADOR/MANDATÁRIO:**

**${data.procurador}**, portador(a) de ${tipoDocIdent} n.º **${data.biProcurador}**, residente em **${data.moradaProcurador}**,

**CONFERINDO-LHE OS SEGUINTES PODERES:**

${poderesPorTipo}

**CLÁUSULA DE SUB-MANDATO:**
${clausulaSubMandato}

**VALIDADE:** A presente procuração é válida por **${data.validade}** a contar da data de assinatura${data.validade === 'Até revogação' || data.validade === 'Indeterminada' ? ', podendo ser revogada a qualquer momento mediante comunicação escrita ao mandatário e a terceiros' : ''}.

Esta procuração é outorgada nos termos dos artigos 262.º e seguintes do Código Civil de Moçambique.

---

**${data.local}, ${dataFmt}**

| | |
|---|---|
| **O OUTORGANTE** | **O PROCURADOR** |
| ${data.outorgante} | ${data.procurador} |
| ${tipoDocIdent}: ${data.biOutorgante} | ${tipoDocIdent}: ${data.biProcurador} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Aceite e assinatura)* |

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |

---

**RECONHECIMENTO NOTARIAL** *(${reconhecimentoObrigatorio ? 'OBRIGATÓRIO para este tipo de procuração' : 'recomendado para maior segurança jurídica'})*

Reconheço a assinatura aposta neste documento como sendo do próprio punho de **${data.outorgante}**, nos termos da Lei n.º 4/2013, de 22 de Fevereiro.

**Notário/Conservador:** ___________________________ | **Data:** ___/___/______
**Livro n.º:** _______ | **Folha:** _______ | **Verba n.º:** _______
**Emolumentos pagos:** _______ MZN | **Selo:** [espaço para selo notarial]`;
      },
      requerimento: () => {
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const entidade = data.entidade || 'Outra';

        const legalMapEntidade = {
          'Conservatória dos Registos': {
            lei: 'Lei n.º 8/2004, de 21 de Julho (Lei dos Registos e Identificação Civil), e Decreto n.º 10/2006, de 12 de Abril (Regulamento dos Registos Civis)',
            cargo: 'Conservador dos Registos Civis',
          },
          'Direcção Provincial de Educação': {
            lei: 'Lei n.º 6/92, de 6 de Maio (Lei do Sistema Nacional de Educação), e Diploma Ministerial aplicável ao nível de ensino',
            cargo: 'Director(a) Provincial de Educação',
          },
          'Hospital Provincial': {
            lei: 'Lei n.º 14/2014, de 11 de Setembro (Lei de Saúde), e Regulamento Geral dos Hospitais Públicos',
            cargo: 'Director(a) Clínico(a) / Director(a) de Administração',
          },
          'INSS': {
            lei: 'Lei n.º 7/2009, de 11 de Março (Regime Jurídico da Segurança Social Obrigatória), e Decreto n.º 49/2009, de 11 de Setembro',
            cargo: 'Director(a) do Instituto Nacional de Segurança Social',
          },
          'Direcção de Migração': {
            lei: 'Lei n.º 5/1993, de 28 de Dezembro (Lei dos Estrangeiros), e Decreto n.º 108/2014, de 31 de Dezembro (Regulamento da Lei dos Estrangeiros)',
            cargo: 'Director(a) Nacional de Migração',
          },
          'Câmara Municipal': {
            lei: 'Lei n.º 2/97, de 18 de Fevereiro (Lei dos Órgãos Locais do Estado — LOLE), e Regulamento Municipal aplicável',
            cargo: 'Presidente do Conselho Municipal',
          },
          'Repartição de Finanças': {
            lei: 'Lei n.º 15/2002, de 26 de Junho (Lei de Bases do Sistema Tributário), e Decreto n.º 6/2006 (Regulamento da Autoridade Tributária)',
            cargo: 'Chefe da Repartição de Finanças',
          },
          'Outra': {
            lei: 'legislação moçambicana aplicável à matéria em causa',
            cargo: 'Responsável / Director(a) do Serviço',
          },
        };

        const entInfo = legalMapEntidade[entidade] || legalMapEntidade['Outra'];

        return `Redija um REQUERIMENTO OFICIAL completo, juridicamente fundamentado e estruturado, destinado à ${entidade} em Moçambique.

BASE LEGAL APLICÁVEL À ${entidade.toUpperCase()}:
${entInfo.lei}

DADOS:
- Entidade destinatária: ${entidade}
- Cargo do responsável: ${entInfo.cargo}
- Assunto: ${data.assunto}
- Requerente: ${data.remetente} | BI n.º: ${data.bi} | Tel: ${data.contacto}
- Endereço do requerente: ${data.endereco}
- Fundamento do pedido: ${data.fundamento}
- Documentos anexos: ${data.anexos || 'Ver lista abaixo'}${ocrBlock}

ESTRUTURA LEGAL MOÇAMBICANA OBRIGATÓRIA:

Exmo(a). Sr(a). ${entInfo.cargo}
${entidade}
[Cidade/Localidade]

**ASSUNTO: ${data.assunto.toUpperCase()}**

**N.º de Processo:** ___/____/____ *(a preencher pela repartição)*

Eu, **${data.remetente}**, portador(a) do Bilhete de Identidade n.º **${data.bi}**, residente em **${data.endereco}**, contacto **${data.contacto}**, nos termos do disposto na ${entInfo.lei.split(',')[0]}, venho, respeitosamente, expor e requerer o seguinte:

**I. EXPOSIÇÃO DOS FACTOS**

[Parágrafo 1 — Contextualização (4-5 linhas): apresenta quem é o requerente, a sua situação actual e o contexto que motiva o pedido. Seja específico e factual, baseando-se em: "${data.fundamento}"]

[Parágrafo 2 — Necessidade e justificação (4-5 linhas): explica com precisão por que é necessário o que está a pedir, quais as consequências de não obter o pedido, e como isso afecta os direitos ou obrigações legais do requerente.]

[Parágrafo 3 — Fundamento legal (3-4 linhas): ao abrigo do disposto na ${entInfo.lei.split(',')[0]}, o(a) requerente tem direito a _____________________, sendo este requerimento o meio adequado para o exercício desse direito.]

**II. DO PEDIDO**

Face ao exposto, e nos termos da ${entInfo.lei.split(',')[0]}, vem o(a) requerente REQUERER a V.ª Ex.ª que se digne:

1. [Pedido principal específico e concreto — use linguagem formal: "...determinar", "...autorizar", "...emitir", "...deferir" — baseado no assunto: "${data.assunto}"]
2. [Pedido secundário, se aplicável]
3. Que seja notificado(a) do resultado do presente requerimento através do contacto ${data.contacto} ou por escrito no endereço acima indicado, no prazo máximo de [30/60] dias.

**III. ANEXOS**

Junta-se ao presente requerimento os seguintes documentos:

${data.anexos ? data.anexos.split(/[,;]/).map((a, i) => (i+1) + '. ' + a.trim()).join('\n') : '1. Cópia do Bilhete de Identidade\n2. [Outros documentos relevantes conforme exigência da entidade]'}

**IV. COMPROMISSO**

O(A) requerente declara, sob compromisso de honra, que todos os factos expostos são verdadeiros e que os documentos juntos são autênticos, ficando ciente das responsabilidades legais decorrentes de falsas declarações, nos termos do Código Penal de Moçambique.

Pede deferimento.

${data.endereco || 'Maputo'}, ${dataFormatada}

_________________________________________
**${data.remetente}**
*(Assinatura)*

---

*Para uso da repartição:*
Data de entrada: ____/____/______ | N.º de Processo: _______ | Recebido por: _____________`;
      },
      residencia: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        return `Você é jurista especialista em direito administrativo moçambicano. Redija uma DECLARAÇÃO DE RESIDÊNCIA formal e juridicamente válida.

BASE LEGAL:
- Código Civil de Moçambique, artigo 82.º (Domicílio)
- Código Penal de Moçambique (Lei n.º 35/2014, de 31 de Dezembro), artigo 347.º (falsas declarações)
- Lei n.º 8/2004, de 21 de Julho (Lei dos Registos e Identificação Civil)

DADOS:
- Declarante: ${data.declarante} | BI: ${data.bi} | Nascimento: ${data.nascimento}
- Naturalidade: ${data.naturalidade}
- Endereço: ${data.endereco}
- Tempo de residência: ${data.tempo}
- Finalidade: ${data.finalidade}
- Chefe de quarteirão/Presidente de bairro: ${data.chefe || '[nome a preencher]'}${ocrBlock}

REGRA: O documento deve ser COMPLETO e CONCRETO — nunca em branco ou com marcadores de lugar.

DOCUMENTO COMPLETO:

---

# DECLARAÇÃO DE RESIDÊNCIA

**${data.declarante.toUpperCase()}**

---

Eu, **${data.declarante}**, portador(a) do Bilhete de Identidade n.º **${data.bi}**, nascido(a) em **${data.nascimento}**, natural de **${data.naturalidade}**, venho por este meio DECLARAR, sob compromisso de honra e nos termos do artigo 82.º do Código Civil de Moçambique, que:

**1. RESIDÊNCIA ACTUAL**

Resido de forma habitual, permanente e estável no endereço: **${data.endereco}**, onde me encontro domiciliado(a) há **${data.tempo}**, desde aproximadamente o ano ______.

**2. FINALIDADE DA DECLARAÇÃO**

A presente declaração é emitida para efeitos de **${data.finalidade}**, e destina-se exclusivamente à(s) entidade(s) a quem for apresentada.

**3. COMPROMISSO DE VERACIDADE**

O(A) declarante afirma, sob compromisso de honra, que todos os factos acima expostos são verdadeiros e correspondem à realidade. O(A) declarante está ciente de que a prestação de falsas declarações constitui crime punível nos termos do artigo 347.º da Lei n.º 35/2014, de 31 de Dezembro (Código Penal de Moçambique), com pena de prisão de até 2 anos ou multa.

**4. VALIDADE**

A presente declaração é válida pelo período de **90 (noventa) dias** a contar da data de emissão, ou até alteração das condições de residência acima declaradas.

---

**${data.endereco?.split(',').pop()?.trim() || 'Maputo'}, ${dataFmt}**

**O(A) DECLARANTE:**

_________________________________________
**${data.declarante}**
BI n.º ${data.bi}

---

**CONFIRMAÇÃO DO CHEFE DE QUARTEIRÃO / PRESIDENTE DE BAIRRO:**

Eu, **${data.chefe || '____________________________________'}**, na qualidade de Chefe de Quarteirão / Presidente do Bairro ______________________, CONFIRMO que o(a) Sr(a). **${data.declarante}** reside efectivamente no endereço indicado, sendo do meu conhecimento pessoal.

_________________________________________
**${data.chefe || '____________________________________'}**
Cargo: ___________________________________
Contacto: ________________________________

---

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

---
*Documento emitido pela plataforma MzDocs Pro. A autenticidade das informações é da responsabilidade exclusiva do declarante.*`;
      },

      prestacao: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const valorNum = parseInt(data.valorTotal || 0);
        const _n2 = (val) => {
          const n = parseInt(val || 0);
          if (n === 0) return 'zero';
          const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
          const d = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
          const c = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
          if (n < 20) return u[n];
          if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' e ' + u[n%10] : '');
          if (n < 1000) return (n===100?'cem':c[Math.floor(n/100)]) + (n%100 ? ' e ' + _n2(n%100) : '');
          if (n < 1000000) { const m=Math.floor(n/1000); const r=n%1000; return (m===1?'mil':_n2(m)+' mil')+(r?' e '+_n2(r):''); }
          return n.toLocaleString('pt-MZ') + ' (por extenso)';
        };
        const incluiMat = data.incluiMateriais || 'Não — apenas mão-de-obra';
        const temPI = !!(data.propriedadeInt && data.propriedadeInt.trim());
        return `Você é advogado especialista em direito comercial moçambicano. Redija um CONTRATO DE PRESTAÇÃO DE SERVIÇOS juridicamente válido e completo.

BASE LEGAL OBRIGATÓRIA:
- Código Civil de Moçambique, artigos 1154.º a 1156.º (Contrato de Prestação de Serviços)
- Código Civil, artigos 1207.º a 1230.º (Empreitada — aplicável quando há entrega de obra física)
- Lei n.º 3/1993, de 24 de Junho (Lei das Actividades Comerciais)
- Lei n.º 4/2004 (Trabalho por Conta Própria e Protecção Social Independente)
- Código de Processo Civil de Moçambique (resolução de conflitos)

DADOS:
- Tipo de serviço: ${data.servico}
- Inclui materiais: ${incluiMat}
- Prestador: ${data.prestador} | NUIT: ${data.nuitPrestador || 'N/A'}
- Morada do Prestador: ${data.moradaPrestador}
- Cliente: ${data.cliente} | BI: ${data.biCliente || 'N/A'}
- Local de execução: ${data.localExecucao}
- Valor total: ${valorNum.toLocaleString('pt-MZ')} MZN (${_n2(data.valorTotal)} meticais)
- Prazo: ${data.prazo} dias
- Condições de pagamento: ${data.pagamento}
- Descrição: ${data.descricao}
- Propriedade intelectual / entregáveis: ${data.propriedadeInt || 'não especificado'}
- Penalidades: ${data.penalidades || '1% do valor por dia de atraso'}${ocrBlock}

REGRAS:
1. Use o regime de PRESTAÇÃO DE SERVIÇOS (arts. 1154.º ss.) para trabalho intelectual/técnico sem entrega de obra física; use EMPREITADA (arts. 1207.º ss.) quando há entrega de obra ou resultado tangível
2. Materiais: ${incluiMat} — reflicta isso claramente na cláusula de objecto e preço
3. ${temPI ? 'Incluir cláusula de propriedade intelectual baseada no que foi fornecido: "' + data.propriedadeInt + '"' : 'Incluir cláusula padrão de propriedade intelectual: entregáveis passam para o cliente após pagamento total'}
4. Incluir cláusula de confidencialidade
5. Incluir cláusula de resolução de conflitos com foro eleito

ESTRUTURA COMPLETA:

---

# CONTRATO DE PRESTAÇÃO DE SERVIÇOS

**ENTRE:**

**PRESTADOR:** ${data.prestador}${data.nuitPrestador ? ', NUIT n.º ' + data.nuitPrestador : ''}, com sede/domicílio profissional em **${data.moradaPrestador}**, doravante designado **"Prestador"**;

**E**

**CLIENTE:** ${data.cliente}${data.biCliente ? ', portador(a) do BI n.º ' + data.biCliente : ''}, doravante designado **"Cliente"**;

Celebram o presente Contrato de Prestação de Serviços nos termos dos artigos 1154.º e seguintes do Código Civil de Moçambique:

---

## **CLÁUSULA 1.ª — OBJECTO**

1.1 O Prestador obriga-se a realizar, de forma autónoma e independente, os seguintes serviços: **${data.servico}**.

1.2 Descrição detalhada: ${data.descricao}

1.3 **Materiais:** ${incluiMat === 'Sim — materiais incluídos no valor' ? 'Os materiais necessários à execução do serviço estão INCLUÍDOS no valor total acordado, sendo fornecidos pelo Prestador.' : incluiMat === 'Não — apenas mão-de-obra' ? 'O presente contrato abrange EXCLUSIVAMENTE mão-de-obra. Os materiais são fornecidos e custeados pelo Cliente.' : 'A responsabilidade pelos materiais é parcial: o Prestador fornece ___________________; o Cliente fornece ___________________ . Detalhe na descrição acima.'}

1.4 Local de execução: **${data.localExecucao}**

---

## **CLÁUSULA 2.ª — PRAZO**

2.1 Os serviços serão executados no prazo de **${data.prazo} (${_n2(data.prazo)}) dias** a contar da data de assinatura deste contrato / data de pagamento do adiantamento *(riscar o que não se aplica)*.

2.2 Em caso de atraso imputável ao Prestador, este pagará ao Cliente uma penalidade de **${data.penalidades || '1% do valor total por dia de atraso'}**, até ao limite de 20% do valor total.

2.3 O prazo poderá ser prorrogado por acordo escrito entre as partes, em caso de força maior ou por solicitação justificada do Cliente.

---

## **CLÁUSULA 3.ª — PREÇO E CONDIÇÕES DE PAGAMENTO**

3.1 O valor total acordado é de **${valorNum.toLocaleString('pt-MZ')} MZN (${_n2(data.valorTotal)} meticais)**, ${incluiMat === 'Sim — materiais incluídos no valor' ? 'incluindo materiais e mão-de-obra' : 'referente exclusivamente a mão-de-obra'}.

3.2 Condições de pagamento: **${data.pagamento}**

3.3 O pagamento será efectuado por [M-Pesa / transferência bancária / dinheiro] para ________________________________.

3.4 O não pagamento nas datas acordadas confere ao Prestador o direito de suspender os serviços, sem penalidade, até regularização.

---

## **CLÁUSULA 4.ª — PROPRIEDADE INTELECTUAL E ENTREGÁVEIS**

${temPI ? `4.1 ${data.propriedadeInt}

4.2 A transferência da propriedade dos entregáveis para o Cliente ocorre apenas após o pagamento integral do valor acordado na Cláusula 3.ª.` : `4.1 Todos os entregáveis (ficheiros, relatórios, obras, designs e quaisquer outros resultados) produzidos no âmbito deste contrato tornam-se propriedade exclusiva do **Cliente** após o pagamento integral do valor acordado.

4.2 Até ao pagamento integral, o Prestador mantém todos os direitos sobre os entregáveis e pode recusar a sua entrega.`}

---

## **CLÁUSULA 5.ª — CONFIDENCIALIDADE**

5.1 Ambas as partes comprometem-se a manter em estrita confidencialidade todas as informações, dados, documentos e segredos comerciais a que tenham acesso no âmbito deste contrato.

5.2 Esta obrigação mantém-se por um período de **2 (dois) anos** após a conclusão ou rescisão do contrato.

---

## **CLÁUSULA 6.ª — GARANTIA**

6.1 O Prestador garante que os serviços serão executados com diligência profissional e de acordo com as regras da arte.

6.2 Em caso de defeito imputável ao Prestador, este obriga-se a corrigir, sem custos adicionais para o Cliente, no prazo de ________________________________.

---

## **CLÁUSULA 7.ª — RESCISÃO**

7.1 Qualquer das partes pode rescindir o contrato mediante comunicação escrita com antecedência mínima de **15 (quinze) dias**.

7.2 Em caso de rescisão por iniciativa do Cliente sem justa causa, o Prestador tem direito a receber a proporção do trabalho já executado, acrescida de 10% do valor remanescente a título de indemnização.

7.3 Em caso de rescisão por justa causa imputável ao Prestador, o Cliente tem direito à devolução de todos os adiantamentos pagos.

---

## **CLÁUSULA 8.ª — RESOLUÇÃO DE CONFLITOS E FORO**

8.1 As partes comprometem-se a resolver amigavelmente qualquer litígio emergente do presente contrato.

8.2 Para os litígios que não possam ser resolvidos amigavelmente, fica eleito o **Tribunal Judicial de Distrito de ${data.localExecucao?.split(',').pop()?.trim() || 'Maputo'}**, com renúncia expressa de qualquer outro foro.

---

## **CLÁUSULA 9.ª — DISPOSIÇÕES FINAIS**

9.1 O presente contrato é celebrado em dois exemplares de igual valor.

9.2 Qualquer alteração ao presente contrato só é válida se feita por escrito e assinada por ambas as partes.

---

**${data.localExecucao?.split(',').pop()?.trim() || 'Maputo'}, ${dataFmt}**

| | |
|---|---|
| **O PRESTADOR** | **O CLIENTE** |
| ${data.prestador} | ${data.cliente} |
| NUIT: ${data.nuitPrestador || '___________'} | BI: ${data.biCliente || '___________'} |
| ___________________________ | ___________________________ |
| *(Assinatura e carimbo)* | *(Assinatura)* |`;
      },
      recibo: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoDoc = data.tipoDoc || 'Recibo Simples';
        const isFactura   = tipoDoc === 'Factura';
        const isProforma  = tipoDoc === 'Factura Proforma';
        const isNDebito   = tipoDoc === 'Nota de Débito';
        const isRecibo    = tipoDoc === 'Recibo Simples';
        const valorBruto  = parseFloat(data.valor || 0);
        const comIVA      = data.iva === 'Sim';
        const valorIVA    = comIVA ? (valorBruto * 0.16).toFixed(2) : 0;
        const valorLiquido = comIVA ? (valorBruto * 1.16).toFixed(2) : valorBruto.toFixed(2);

        const nuitObrigatorio = isFactura || isProforma || isNDebito;
        const validadeProforma = isProforma ? (data.validadeProforma || 30) : null;

        return `Você é contabilista especializado no regime fiscal moçambicano. Elabore um(a) ${tipoDoc.toUpperCase()} completo(a) e conforme a legislação tributária vigente.

BASE LEGAL APLICÁVEL:
- Lei n.º 32/2007, de 28 de Dezembro (Lei do IVA em Moçambique) — IVA à taxa de 16%
- Decreto n.º 7/2008 (Regulamento do IVA)
- Decreto n.º 70/2022, de 31 de Dezembro (Faturação eletrónica — obrigatória para grandes contribuintes)
- Circular n.º 8/AT/2016 (Autoridade Tributária — requisitos de documentos fiscais)
- Lei n.º 15/2002, de 26 de Junho (Lei de Bases do Sistema Tributário de Moçambique)

DADOS:
- Tipo de documento: ${tipoDoc}
- Emitente: ${data.emitente} | NUIT: ${data.nuitEmitente || '[OBRIGATÓRIO para Factura]'}
- Endereço/contacto emitente: ${data.enderecoEmitente || '________________________________'}
- Cliente: ${data.cliente} | BI/NUIT: ${data.biCliente || 'N/A'}
- Descrição: ${data.descricao}
- Valor base: ${valorBruto.toLocaleString('pt-MZ')} MZN
- IVA: ${data.iva || 'Não (regime simplificado)'}
- Forma de pagamento: ${data.pagamento}
- Conta/M-Pesa: ${data.contaBancaria || 'não indicado'}
${isProforma ? '- Validade da proforma: ' + validadeProforma + ' dias' : ''}
- Local e data: ${data.local}${ocrBlock}

REGRAS FISCAIS CRÍTICAS:
1. ${isFactura ? 'FACTURA: NUIT do emitente é OBRIGATÓRIO. Numeração sequencial obrigatória. IVA separado do valor base se aplicável.' : ''}
2. ${isProforma ? 'FACTURA PROFORMA: é uma ESTIMATIVA, não uma cobrança. NÃO aplique IVA (o IVA só é exigível na factura definitiva). Inclua validade de ' + validadeProforma + ' dias e condições de entrega.' : ''}
3. ${isRecibo ? 'RECIBO SIMPLES: documento de quitação — confirma pagamento já recebido. Não inclui IVA separado.' : ''}
4. ${isNDebito ? 'NOTA DE DÉBITO: emitida para cobrar valores adicionais não incluídos na factura original. Deve referenciar a factura original.' : ''}
5. ${comIVA ? 'IVA calculado: base ' + valorBruto.toLocaleString('pt-MZ') + ' MZN × 16% = ' + parseFloat(valorIVA).toLocaleString('pt-MZ') + ' MZN | Total c/ IVA: ' + parseFloat(valorLiquido).toLocaleString('pt-MZ') + ' MZN' : 'Operação sem IVA — motivo: ' + (data.iva || 'regime simplificado')}
6. ${nuitObrigatorio && !data.nuitEmitente ? 'ATENÇÃO: NUIT do emitente não foi fornecido — assinale claramente no documento como [OBRIGATÓRIO — INSERIR NUIT]' : ''}

DOCUMENTO COMPLETO:

---

# ${tipoDoc.toUpperCase()}

**N.º:** ${tipoDoc === 'Recibo Simples' ? 'REC' : tipoDoc === 'Factura' ? 'FT' : tipoDoc === 'Factura Proforma' ? 'FP' : 'ND'}/____/${hoje.getFullYear()}
**Data:** ${data.local}
${isProforma ? '**Válida até:** [calcular: ' + validadeProforma + ' dias após data acima]\n**Esta Proforma NÃO constitui cobrança fiscal — sujeita a confirmação de encomenda**' : ''}

---

## EMITENTE

| | |
|---|---|
| **Nome / Empresa:** | ${data.emitente} |
| **NUIT:** | ${data.nuitEmitente || (nuitObrigatorio ? '**[INSERIR NUIT — OBRIGATÓRIO]**' : 'N/A (regime simplificado)')} |
| **Endereço / Contacto:** | ${data.enderecoEmitente || '________________________________'} |

## CLIENTE / ADQUIRENTE

| | |
|---|---|
| **Nome:** | ${data.cliente} |
| **BI / NUIT:** | ${data.biCliente || '________________________________'} |

---

## DESCRIÇÃO ${isNDebito ? '(VALOR ADICIONAL — referente à Factura n.º _________)' : ''}

| Descrição | ${comIVA ? 'Valor Base (MZN)' : 'Valor (MZN)'} |
|---|---|
${data.descricao.split('\n').filter(Boolean).map(linha => `| ${linha.trim()} | |`).join('\n')}
${comIVA ? `| | |
| **Subtotal (sem IVA):** | **${valorBruto.toLocaleString('pt-MZ')}** |
| **IVA (16%):** | **${parseFloat(valorIVA).toLocaleString('pt-MZ')}** |
| **TOTAL (com IVA):** | **${parseFloat(valorLiquido).toLocaleString('pt-MZ')} MZN** |` : `| **TOTAL:** | **${valorBruto.toLocaleString('pt-MZ')} MZN** |`}

---

## CONDIÇÕES DE PAGAMENTO

- **Forma:** ${data.pagamento}
${data.contaBancaria ? '- **Conta / M-Pesa:** ' + data.contaBancaria : ''}
${isProforma ? `- **Condições de entrega:** [definir: imediata / prazo / condições] \n- **Validade desta proforma:** ${validadeProforma} dias a contar da data acima` : ''}
${isNDebito ? '- **Prazo de pagamento:** ______ dias a contar da data deste documento' : ''}
${!isProforma && !isRecibo ? '- **Esta factura é exigível na data indicada acima**' : ''}

---

${isRecibo ? `## DECLARAÇÃO DE QUITAÇÃO

Eu, **${data.emitente}**, declaro ter recebido de **${data.cliente}** a quantia de **${valorBruto.toLocaleString('pt-MZ')} MZN** (por extenso: ________________________________), a título de pagamento pelo(s) bem(ns)/serviço(s) acima descritos, dando-lhe a plena e total quitação.` : ''}

**${data.emitente}**
${data.local}

_________________________________________
*(Assinatura${data.nuitEmitente ? ' e carimbo' : ''})*

---

*${comIVA ? 'Documento sujeito a IVA à taxa de 16%, conforme Lei n.º 32/2007, de 28 de Dezembro.' : 'Operação isenta ou não sujeita a IVA — ' + (data.iva || 'regime simplificado') + '.'}*
${isProforma ? '*Factura Proforma: documento sem valor fiscal. O IVA será aplicado na factura definitiva após confirmação da encomenda.*' : ''}`;
      },
      recomendacao: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoRec = data.tipoRec || 'Recomendação Profissional';
        const temExemplo = !!(data.exemploConcreto && data.exemploConcreto.trim());
        return `Você é especialista em comunicação profissional e académica. Redija uma ${tipoRec.toUpperCase()} completa, persuasiva e genuinamente útil para o destinatário.

DADOS:
- Tipo: ${tipoRec}
- Recomendador: ${data.recomendador} | Cargo: ${data.cargoRec} | Entidade: ${data.entidadeRec}
- Recomendado: ${data.recomendado} | Cargo/função pretendida: ${data.cargoRecm}
- Relação e período: ${data.relacao}
- Qualidades a destacar: ${data.qualidades}
- Exemplo concreto fornecido: ${data.exemploConcreto || '[NÃO FORNECIDO — ver regra 3]'}
- Destinatário: ${data.destinatario || 'A quem possa interessar'}${ocrBlock}

REGRAS CRÍTICAS:
1. USE os dados fornecidos pelo utilizador como base — não invente factos, nomes de projectos ou situações não descritas
2. Qualidades SEMPRE com contexto específico: nunca "é pontual" sem um exemplo; nunca "é líder" sem uma situação concreta
3. ${temExemplo ? 'EXEMPLO FORNECIDO: use o exemplo concreto literalmente como base da secção central: "' + data.exemploConcreto + '"' : 'EXEMPLO NÃO FORNECIDO: assinale claramente no parágrafo central com [INSERIR EXEMPLO CONCRETO — o recomendador deve adicionar uma situação real aqui], não invente'}
4. Tom caloroso mas factual — evite superlativos vazios ("excepcional", "extraordinário") sem base concreta
5. Máximo 1 página A4 — carta de recomendação longa não é lida
6. Frase de abertura: NUNCA use "Venho por este meio" — comece directamente com quem é o recomendador e a sua autoridade

ESTRUTURA OBRIGATÓRIA:

**${data.recomendador}**
${data.cargoRec}
${data.entidadeRec}

${dataFmt}

${data.destinatario || 'A Quem Possa Interessar'}

---

**Assunto: ${tipoRec} — ${data.recomendado}**

[Parágrafo 1 — ABERTURA E CREDENCIAL DO RECOMENDADOR (3-4 linhas):
Comece com uma afirmação directa: "Conheço [nome] desde [período], tendo trabalhado directamente com ele/ela como [relação]."
Estabeleça a credencial do recomendador para esta recomendação específica.
Baseie-se em: "${data.relacao}"]

[Parágrafo 2 — CAPACIDADES E QUALIDADES COM CONTEXTO ESPECÍFICO (4-5 linhas):
Para cada qualidade em "${data.qualidades}", adicione contexto específico da relação de trabalho.
Exemplo de formato correcto: "A sua [qualidade] ficou demonstrada quando [situação/contexto específico do dia-a-dia de trabalho]."
NÃO use qualidades soltas sem contexto.]

[Parágrafo 3 — EXEMPLO CONCRETO DE REALIZAÇÃO (4-5 linhas — NÚCLEO DA CARTA):
${temExemplo ? 'Expanda e estruture o seguinte exemplo real fornecido pelo recomendador: "' + data.exemploConcreto + '". Descreva o contexto, o que o recomendado fez especificamente, e o resultado/impacto.' : '[INSERIR EXEMPLO CONCRETO — o recomendador deve descrever aqui uma situação real que tenha observado, com contexto, acção e resultado. Esta secção é obrigatória para credibilidade.]'}]

[Parágrafo 4 — ADEQUAÇÃO PARA A FUNÇÃO E RECOMENDAÇÃO (3-4 linhas):
Ligue explicitamente as qualidades demonstradas ao cargo/função pretendida: "${data.cargoRecm}".
Termine com uma recomendação clara e sem reservas: "Recomendo sem reservas..." ou "Não hesito em recomendar..."]

Com os melhores cumprimentos,

_________________________________________
**${data.recomendador}**
${data.cargoRec}
${data.entidadeRec}
[Contacto directo]`;
      },
      planonegocio: () => {
        const anoActual = new Date().getFullYear();
        const inv = parseInt(data.investimento || 0);
        const nTrab = parseInt(data.nTrabalhadores || 1);
        const financParcial = data.financiamentoParcial || 'Não — a candidatar a 100%';
        const temCapProprio = financParcial.includes('capital próprio');
        return `Você é consultor sénior de negócios com experiência no mercado moçambicano. Elabore um PLANO DE NEGÓCIOS completo, credível e adequado para candidatura a financiamento bancário ou institucional em Moçambique.

DADOS:
- Nome do negócio: ${data.nomeNegocio}
- Forma jurídica: ${data.formaJuridica}
- Sector: ${data.sector}
- Proprietário: ${data.proprietario} | Localização: ${data.local}
- Descrição: ${data.descricao}
- Investimento total necessário: ${inv.toLocaleString('pt-MZ')} MZN
- Situação de financiamento: ${financParcial}
- N.º de trabalhadores previstos: ${nTrab}
- Público-alvo: ${data.clientes}
- Concorrência e diferencial: ${data.concorrencia || 'a analisar'}
- Prazo de retorno esperado: ${data.retorno}${ocrBlock}

REGRAS:
1. Use dados reais do mercado moçambicano ${anoActual} — taxas de juro BCI/BIM/Standard Bank ≈ 23-28% ao ano; inflação ≈ 5-7%; câmbio USD/MZN ≈ consultar BdM
2. Forma jurídica "${data.formaJuridica}": reflicta os requisitos legais específicos (capital mínimo para Lda = 20.000 MZN; SA = 2.000.000 MZN)
3. ${temCapProprio ? 'Capital próprio parcial disponível — estruture o plano financeiro mostrando a proporção capital próprio / financiamento externo' : 'Financiamento a 100% — justifique a viabilidade e o colateral disponível'}
4. N.º de trabalhadores: ${nTrab} — calcule a folha salarial com base no salário mínimo por sector em Moçambique ${anoActual}
5. Projecções financeiras: 3 anos, com cenário base e pessimista
6. Incluir análise SWOT com dados específicos do mercado de ${data.local}

ESTRUTURA OBRIGATÓRIA (formato profissional para banco/incubadora):

---

# PLANO DE NEGÓCIOS — ${data.nomeNegocio.toUpperCase()}

**${data.formaJuridica} | ${data.sector} | ${data.local} | ${anoActual}**
**Elaborado por:** ${data.proprietario}

---

## 1. SUMÁRIO EXECUTIVO

[150-200 palavras: síntese do negócio, oportunidade de mercado, necessidade de financiamento (${inv.toLocaleString('pt-MZ')} MZN), retorno esperado (${data.retorno}), e o que torna este negócio viável em ${data.local}. NUNCA genérico — seja específico ao sector e localização.]

---

## 2. DESCRIÇÃO DO NEGÓCIO

### 2.1 Missão e Visão
**Missão:** [frase concisa sobre o propósito]
**Visão:** [onde quer estar em 3-5 anos]

### 2.2 Descrição Detalhada
${data.descricao}
[Expanda: o que exactamente vende/oferece, como funciona o processo de serviço/produção/venda, qual o modelo de receita]

### 2.3 Forma Jurídica e Constituição
**Forma:** ${data.formaJuridica}
[Requisitos legais: capital mínimo, registo na Conservatória do Comércio, licenças necessárias para o sector "${data.sector}" em Moçambique, NUIT, alvará municipal]

---

## 3. ANÁLISE DE MERCADO

### 3.1 Mercado-Alvo
${data.clientes}
[Tamanho estimado do mercado em ${data.local}: quantas pessoas/empresas potencialmente, poder de compra, comportamento de consumo]

### 3.2 Análise da Concorrência
${data.concorrencia || '[Identificar 2-3 concorrentes directos e indirectos em ' + data.local + ']'}
[Para cada concorrente: preço, qualidade, localização, fraquezas que o negócio pode explorar]

### 3.3 Diferencial Competitivo
[O que torna ${data.nomeNegocio} diferente e preferível — seja específico, não genérico]

### 3.4 Análise SWOT

| | Favoráveis | Desfavoráveis |
|---|---|---|
| **Internos** | **Forças:** [3-4 pontos específicos ao negócio] | **Fraquezas:** [3-4 pontos honestos] |
| **Externos** | **Oportunidades:** [3-4 oportunidades reais do mercado de ${data.local} em ${anoActual}] | **Ameaças:** [riscos reais: inflação, concorrência, regulação] |

---

## 4. PLANO OPERACIONAL

### 4.1 Estrutura Operacional
[Como funciona o negócio dia-a-dia: horário, processo de atendimento, ciclo de compra/produção/venda/entrega]

### 4.2 Localização
**${data.local}** — [justificativa: proximidade ao cliente-alvo, custo, acessibilidade]

### 4.3 Equipa e Recursos Humanos

| Cargo | N.º | Salário mensal est. (MZN) | Total/mês (MZN) |
|---|---|---|---|
| [Proprietário/Gestor] | 1 | [salário mínimo sector + % gestão] | |
| [Colaboradores operacionais] | ${Math.max(nTrab - 1, 0)} | [salário mínimo sector ${data.sector} ${anoActual}] | |
| **TOTAL FOLHA SALARIAL** | **${nTrab}** | | **[total/mês]** |

---

## 5. PLANO FINANCEIRO

### 5.1 Investimento Inicial

| Item | Valor (MZN) |
|---|---|
| Equipamentos e utensílios | |
| Stock inicial / Matérias-primas | |
| Licenças e registos | |
| Renda (3 meses adiantada) | |
| Capital de giro (3 meses) | |
| Outros | |
| **TOTAL INVESTIMENTO** | **${inv.toLocaleString('pt-MZ')}** |

### 5.2 Fontes de Financiamento

| Fonte | Valor (MZN) | % |
|---|---|---|
| ${temCapProprio ? 'Capital próprio do promotor' : '[Capital a financiar]'} | | |
| [Banco / Instituição financiadora] | | |
| **TOTAL** | **${inv.toLocaleString('pt-MZ')}** | **100%** |

### 5.3 Projecções de Receita (3 anos)

| | Ano 1 | Ano 2 | Ano 3 |
|---|---|---|---|
| Receita bruta estimada (MZN) | | | |
| Custos operacionais (MZN) | | | |
| Folha salarial (MZN/ano) | | | |
| **Resultado líquido (MZN)** | | | |
| **Margem líquida (%)** | | | |

*Premissas: [crescimento de vendas conservador 10-15%/ano; inflação ${anoActual} ≈ 6%; taxa de juro bancária ≈ 25%/ano se aplicável]*

### 5.4 Ponto de Equilíbrio (Break-Even)
[Calcular: custos fixos mensais / margem de contribuição unitária = n.º de unidades/clientes necessários para cobrir custos]

**Prazo de retorno do investimento estimado: ${data.retorno}**

---

## 6. GESTÃO DE RISCOS

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Inflação / depreciação do MZN | Alta | Alto | Ajuste trimestral de preços |
| Concorrência de novos entrantes | Média | Médio | Fidelização de clientes, qualidade |
| Inadimplência de clientes | Média | Alto | Pagamento adiantado / a pronto |
| [Risco específico do sector ${data.sector}] | | | |

---

## 7. CONCLUSÃO E PEDIDO DE FINANCIAMENTO

[Síntese do potencial do negócio em ${data.local}, a necessidade específica de ${inv.toLocaleString('pt-MZ')} MZN, o retorno esperado para o financiador em ${data.retorno}, e o compromisso do promotor. Mencione a criação de ${nTrab} postos de trabalho como impacto social positivo.]

---

*Use dados realistas do mercado moçambicano ${anoActual}.*`;
      },
      licenca: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoLicenca = data.tipoLicenca || 'Licença Comercial (Alvará)';
        const tipoEstabelec = data.tipoEstabelec || 'Permanente (estrutura fixa)';

        const leiMap = {
          'Licença Comercial (Alvará)': {
            lei: 'Lei n.º 3/1993, de 24 de Junho (Lei das Actividades Comerciais); Decreto n.º 43/2004, de 1 de Setembro (Regulamento de Licenciamento das Actividades Comerciais); Regulamento Municipal correspondente',
            entidade: 'Câmara Municipal / Conselho Municipal',
            prazo: '30 a 60 dias úteis',
            docs: 'Certidão comercial, planta de localização, alvará de construção (se aplicável), comprovativo de NUIT, documento de identidade do requerente, parecer de conformidade técnica',
          },
          'Licença de Construção': {
            lei: 'Regulamento Geral de Construção e Habitação Urbana (Decreto n.º 28/1994); Lei do Ordenamento do Território (Lei n.º 19/2007, de 18 de Julho); Decreto n.º 23/2008 (Regulamento de Licenciamento de Construção)',
            entidade: 'Direcção Municipal de Infra-estruturas / DINOTER',
            prazo: '45 a 90 dias úteis',
            docs: 'Projecto de construção aprovado, levantamento topográfico, título de uso e aproveitamento da terra (DUAT), certidão de não dívida fiscal',
          },
          'Autorização de Evento': {
            lei: 'Regulamento Municipal de Eventos; Decreto n.º 66/2010 (Segurança em Eventos Públicos); Lei n.º 7/2017 (Prevenção e Combate ao Branqueamento de Capitais — para eventos de grande dimensão)',
            entidade: 'Câmara Municipal; Polícia da República de Moçambique (para eventos públicos)',
            prazo: '15 a 30 dias úteis — submeter com mínimo 30 dias de antecedência',
            docs: 'Plano do evento, local, capacidade, medidas de segurança, seguro de responsabilidade civil (recomendado), carta do proprietário do espaço',
          },
          'Licença de Transporte': {
            lei: 'Lei n.º 21/2008, de 31 de Dezembro (Lei de Transportes Rodoviários); Decreto n.º 26/2011 (Regulamento de Transportes Rodoviários); Diploma Ministerial n.º 64/2007',
            entidade: 'Instituto Nacional de Transportes Terrestres (INATTER)',
            prazo: '30 a 45 dias úteis',
            docs: 'Registo do(s) veículo(s), carta de condução válida, seguro obrigatório, certificado de inspecção técnica, certidão comercial',
          },
          'Licença Ambiental': {
            lei: 'Lei n.º 20/97, de 1 de Outubro (Lei do Ambiente); Decreto n.º 54/2015, de 31 de Dezembro (Regulamento de Avaliação de Impacto Ambiental); Lei n.º 5/2017 (Gestão de Resíduos)',
            entidade: 'Ministério da Terra e Ambiente (MITADER) / Direcção Provincial do Ambiente',
            prazo: '60 a 180 dias úteis (dependendo da categoria ambiental: A, B ou C)',
            docs: 'Relatório de Avaliação de Impacto Ambiental (EIA ou EPDA), plano de gestão ambiental, certidão de não dívida, termos de referência aprovados',
          },
          'Outra': {
            lei: 'legislação específica aplicável ao tipo de licença/autorização requerida',
            entidade: data.entidade || 'Entidade competente',
            prazo: 'a confirmar junto da entidade',
            docs: 'conforme exigência específica da entidade',
          },
        };

        const lic = leiMap[tipoLicenca] || leiMap['Outra'];

        return `Você é especialista em direito administrativo e licenciamento em Moçambique. Redija um PEDIDO DE LICENÇA / REQUERIMENTO DE AUTORIZAÇÃO formal, juridicamente fundamentado e completo.

BASE LEGAL APLICÁVEL A "${tipoLicenca}":
${lic.lei}

DADOS:
- Tipo de licença: ${tipoLicenca}
- Requerente: ${data.requerente} | NUIT: ${data.nuit} | Tel: ${data.contacto}
- Entidade destinatária: ${data.entidade}
- Objecto do pedido: ${data.objecto}
- Tipo de estabelecimento: ${tipoEstabelec}
- Área: ${data.areaM2 ? data.areaM2 + ' m²' : 'não indicada'}
- Horário de funcionamento: ${data.horario || 'a definir'}
- N.º de postos de trabalho previstos: ${data.nPostosTrabalho || 'a indicar'}
- Local exacto: ${data.local}
- Documentos a anexar: ${data.documentos || lic.docs}${ocrBlock}

REGRAS:
1. Mencionar a base legal específica para "${tipoLicenca}" — não usar linguagem genérica
2. Tipo de estabelecimento "${tipoEstabelec}": reflectir nas condições do pedido (permanente vs temporário vs ambulante)
3. Prazo esperado de resposta para este tipo: ${lic.prazo}
4. Lista de documentos obrigatórios específicos a este tipo de licença
5. Frase de abertura: NUNCA "Venho por este meio" — comece directamente

REQUERIMENTO COMPLETO:

---

# PEDIDO DE ${tipoLicenca.toUpperCase()}

Exmo(a). Sr(a). Presidente / Director(a)
**${data.entidade}**
[Localidade]

**Assunto: Pedido de ${tipoLicenca} — ${data.objecto.substring(0, 60)}...**

Eu/A empresa **${data.requerente}**, com NUIT n.º **${data.nuit}**, contacto **${data.contacto}**, ao abrigo do disposto na ${lic.lei.split(';')[0]}, requer a V.ª Ex.ª a concessão de **${tipoLicenca}** para os fins abaixo descritos:

---

## I. IDENTIFICAÇÃO DO REQUERENTE

| | |
|---|---|
| **Nome / Razão Social:** | ${data.requerente} |
| **NUIT:** | ${data.nuit} |
| **Telefone:** | ${data.contacto} |
| **Endereço:** | ${data.local} |

---

## II. OBJECTO DO PEDIDO

**Tipo de ${tipoLicenca.toLowerCase().includes('licença') ? 'estabelecimento' : 'actividade'}:** ${data.objecto}

**Tipo:** ${tipoEstabelec}

**Local exacto:** ${data.local}

${data.areaM2 ? '**Área:** ' + data.areaM2 + ' m²' : ''}
${data.horario ? '**Horário de funcionamento pretendido:** ' + data.horario : ''}
${data.nPostosTrabalho ? '**Postos de trabalho a criar:** ' + data.nPostosTrabalho : ''}

---

## III. FUNDAMENTAÇÃO LEGAL

O presente pedido fundamenta-se no disposto na seguinte legislação:

${lic.lei.split(';').map((l, i) => (i+1) + '. ' + l.trim()).join('\n')}

O requerente declara cumprir todos os requisitos legais e regulamentares exigidos para a actividade pretendida, comprometendo-se a observar todas as normas aplicáveis durante o exercício da mesma.

---

## IV. DOCUMENTOS ANEXOS

O requerente junta ao presente pedido os seguintes documentos:

${(data.documentos || lic.docs).split(/[,;]/).map((d, i) => (i+1) + '. ' + d.trim()).join('\n')}

---

## V. COMPROMISSO E DECLARAÇÃO

O requerente declara, sob compromisso de honra:

a) Que todos os dados constantes do presente pedido são verdadeiros e correspondem à realidade;
b) Que não existem dívidas fiscais ou contributivas em seu nome junto da Autoridade Tributária de Moçambique;
c) Que cumprirá todas as condições e obrigações decorrentes da licença, caso concedida;
d) Que aceita a realização de vistorias e inspecções por parte das entidades competentes.

---

Nestes termos, pede deferimento no prazo previsto na lei (${lic.prazo}).

**${data.local}, ${dataFmt}**

_________________________________________
**${data.requerente}**
*(Assinatura e carimbo, se aplicável)*

---

*Para uso da entidade destinatária:*
Data de entrada: ____/____/______ | N.º de processo: _______ | Recebido por: _______________`;
      },
      acta: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const pautaItems = data.pauta ? data.pauta.split(/\n|;/).map(p => p.trim()).filter(Boolean) : ['Ponto único'];
        const deliberacaoItems = data.deliberacoes ? data.deliberacoes.split(/\n|;/).map(d => d.trim()).filter(Boolean) : [];
        return `Você é secretário jurídico experiente em organizações moçambicanas. Redija uma ACTA DE REUNIÃO formal, completa e juridicamente válida.

BASE LEGAL:
- Lei n.º 8/2008, de 15 de Julho (Lei das Associações)
- Lei n.º 23/1992, de 31 de Dezembro (Lei das Cooperativas)
- Código Civil de Moçambique, artigos 157.º e ss. (Associações e Pessoas Colectivas)
- Estatutos da ${data.organizacao} (quando aplicável)

DADOS:
- Organização: ${data.organizacao} | Tipo: ${data.tipoReuniao}
- Data: ${data.data} às ${data.hora} | Local: ${data.local}
- Presidente de mesa: ${data.presidente} | Secretário: ${data.secretario}
- Presentes: ${data.presentes}
- Pauta: ${data.pauta}
- Deliberações: ${data.deliberacoes}${ocrBlock}

DOCUMENTO COMPLETO:

---

# ACTA N.º ___/______

## ${data.tipoReuniao.toUpperCase()} DA ${data.organizacao.toUpperCase()}

---

**Data:** ${data.data}
**Hora de início:** ${data.hora}
**Local:** ${data.local}
**Tipo de reunião:** ${data.tipoReuniao}

---

### MESA

| Cargo | Nome |
|---|---|
| **Presidente da Mesa** | ${data.presidente} |
| **Secretário(a)** | ${data.secretario} |

---

### MEMBROS PRESENTES

${data.presentes}

**Total de membros presentes:** [N]
**Quórum:** [Verificado / Não verificado] — [N] de [N total] membros, representando [%] do total, nos termos do artigo [X] dos Estatutos.

---

### ABERTURA

Pelas **${data.hora}** do dia **${data.data}**, no local acima indicado, o(a) Sr(a). **${data.presidente}**, na qualidade de Presidente da Mesa, declarou aberta a ${data.tipoReuniao}, verificado o quórum estatutário.

O(A) Sr(a). **${data.secretario}** assumiu as funções de Secretário(a) e procedeu à leitura e aprovação da acta da reunião anterior *(se aplicável)*.

---

### ORDEM DO DIA

${pautaItems.map((p, i) => `**Ponto ${i+1}:** ${p}`).join('\n\n')}

---

### DISCUSSÃO E DELIBERAÇÕES

${pautaItems.map((p, i) => {
  const del = deliberacaoItems[i] || '[Descreva a discussão e deliberação deste ponto]';
  return `#### Ponto ${i+1}: ${p}

O(A) Presidente deu a palavra aos membros para discussão do referido ponto.

[Resuma a discussão: quem falou, principais argumentos apresentados, propostas apresentadas]

**Deliberação:** ${del}

**Votação:** Aprovado por [unanimidade / maioria de X votos a favor, Y contra, Z abstenções], nos termos do artigo [X] dos Estatutos da ${data.organizacao}.

**Responsável pela execução:** ________________________________
**Prazo:** ____/____/______`;
}).join('\n\n---\n\n')}

---

### ASSUNTOS GERAIS E INFORMAÇÕES

[Registar aqui informações diversas, comunicações, avisos e outros assuntos não incluídos na ordem do dia, apresentados pelos membros.]

---

### ENCERRAMENTO

Nada mais havendo a tratar, o(a) Presidente declarou encerrada a reunião pelas **______** horas, sendo a presente acta lavrada e aprovada pelos membros da mesa.

---

**${data.local}, ${dataFmt}**

| | |
|---|---|
| **O Presidente da Mesa** | **O(A) Secretário(a)** |
| ${data.presidente} | ${data.secretario} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

**VOGAIS DA MESA (se aplicável):**

| Vogal 1 | Vogal 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| ___________________________ | ___________________________ |

---

*Acta aprovada em reunião de ____/____/______ / Aprovada por circulação em ____/____/______*
*Arquivada no Livro de Actas n.º _____, folha _____, da ${data.organizacao}.*`;
      },

    };

    const basePrompt = (builders[type] || builders.trabalho)();
    // Injectar bloco de template no início do prompt (antes das instruções)
    return templateBlock ? templateBlock + '\n\n' + basePrompt : basePrompt;
  }


  // ── Geração HTML estruturado para qualquer documento com template de picker ─────
  // Quando o template tem htmlTemplate, pedimos HTML directamente à IA.
  // Isto permite layouts fiéis: duas colunas (CV), cabeçalho corporativo (carta),
  // tabelas estruturadas (orçamento), artigos numerados (contratos), etc.
  _buildHTMLStructuredPrompt(type, data, ocr, pickerTemplate) {
    const ocrBlock = ocr ? `\n\nRascunho OCR (use como base):\n${ocr}` : '';
    const htmlStructure = pickerTemplate.htmlTemplate;
    const templateName  = pickerTemplate.name || 'modelo seleccionado';
    const templateCss   = (pickerTemplate.css || '').slice(0, 2000);

    const dataBlock = this._buildDataBlock(type, data);

    return `Você é especialista em documentos profissionais moçambicanos. Crie um documento em HTML ESTRUTURADO usando EXACTAMENTE as classes CSS do template "${templateName}".

TIPO DE DOCUMENTO: ${type}

DADOS DO DOCUMENTO:
${dataBlock}${ocrBlock}

ESTRUTURA HTML OBRIGATÓRIA DO TEMPLATE (substitua os placeholders {{...}} pelos dados reais):
${htmlStructure}

CSS DO TEMPLATE (referência das classes disponíveis):
${templateCss}

REGRAS ABSOLUTAS:
1. Substitua TODOS os placeholders {{...}} pelos dados reais fornecidos acima
2. Use EXACTAMENTE as classes CSS do template — NÃO invente classes novas
3. Para listas (experiências, cláusulas, itens de tabela) gere múltiplos elementos HTML com as classes do template
4. Conteúdo REAL e COMPLETO — NUNCA deixe placeholders por substituir
5. Português formal de Moçambique
6. VERBOS DE ACÇÃO com resultados mensuráveis nas experiências profissionais
7. NÃO adicione estilos inline excepto width:% em barras de progresso

FORMATO ENTRADA GENÉRICA (cv-entry, doc-entry):
<div class="cv-entry">
  <p class="cv-entry-date">PERÍODO</p>
  <p class="cv-entry-title">TÍTULO/CARGO</p>
  <p class="cv-entry-company">ORGANIZAÇÃO | LOCAL</p>
  <ul class="cv-entry-bullets"><li>Realização concreta</li></ul>
</div>

RESPOSTA: Devolva APENAS o HTML, começando com a tag raiz do template e terminando com </div>. SEM markdown, SEM explicações, SEM \`\`\`html.`;
  }

  // ── Dados específicos por tipo de documento para prompt HTML ─────────────
  _buildDataBlock(type, data) {
    const num = (v) => parseInt(v || 0).toLocaleString('pt-MZ');
    const iniciais = (data.nome || 'CV').split(' ').slice(0,2).map(n => n[0] || '').join('').toUpperCase();

    const blocks = {
      cv: () => `- Nome: ${data.nome || ''}  |  Iniciais: ${iniciais}
- Cargo: ${data.cargo || ''}
- Telefone: ${data.contacto || ''}  |  Email: ${data.email || '[email]'}  |  Localização: ${data.localizacao || 'Moçambique'}
- Nascimento: ${data.nascimento || '[a completar]'}
- Línguas: ${data.linguas || 'Português (nativo)'}
- Formação: ${data.formacao || ''}
- Experiência: ${data.experiencia || 'Sem experiência formal prévia'}
- Habilidades: ${data.habilidades || '[ferramentas, software]'}
- Realização de destaque: ${data.exemplo || '[nenhuma fornecida]'}
- Objectivo: ${data.objectivo || '[a completar]'}
- Perfil: ${data.perfilCV || 'Com Experiência Profissional'}

MAPEAMENTO DE PLACEHOLDERS:
{{INICIAIS}} = ${iniciais}
{{NOME}} = ${data.nome || ''}
{{CARGO}} = ${data.cargo || ''}
{{CONTACTO}} = ${data.contacto || ''}
{{EMAIL}} = ${data.email || '[email]'}
{{LOCALIZACAO}} = ${data.localizacao || 'Moçambique'}
{{OBJECTIVO}} = 2-3 frases baseadas em "${data.objectivo || data.cargo || ''}"
{{FORMACAO}} = elementos <div class="cv-entry"> para cada formação (mais recente primeiro)
{{EXPERIENCIA}} = elementos <div class="cv-entry"> para cada cargo/estágio com bullets de realizações
{{REALIZACAO}} = parágrafo expandindo: "${data.exemplo || 'a completar'}"
{{HABILIDADES}} = texto: ${data.habilidades || ''}
{{HABILIDADES_LIST}} = <li> para cada habilidade de: ${data.habilidades || ''}
{{LINGUAS}} = elementos de língua com barra de progresso (Português nativo=100%, Inglês básico=30%, etc.)
{{EXTRA}} = informação adicional (carta de condução, disponibilidades, publicações)`,

      carta: () => {
        const iniciais = (data.remetenteNome || 'XX').split(' ').slice(0,2).map(n=>n[0]||'').join('').toUpperCase();
        const ministrioLabel = data.ministerio || data.remetenteNome || '';
        return `- Tipo: ${data.tipo || 'Formal'}
- Remetente: ${data.remetenteNome || ''}  |  Cargo: ${data.remetenteCargo || ''}  |  Local: ${data.remetenteLocal || 'Maputo'}
- Destinatário: ${data.destinatarioNome || ''} — ${data.destinatarioEnti || ''}
- Assunto: ${data.assunto || ''}
- Pontos a comunicar: ${data.pontos || ''}
- Referência: ${data.ref || 'S/Ref.'}
- Cargo pretendido (candidatura): ${data.cargoPretendido || data.cargo || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{REMETENTE_NOME}} = ${data.remetenteNome || ''}
{{REMETENTE_CARGO}} = ${data.remetenteCargo || data.cargo || ''}
{{INICIAIS}} = ${iniciais}
{{INICIAIS_EMPRESA}} = ${iniciais}
{{LOCAL}} = ${data.remetenteLocal || 'Maputo'}
{{DATA}} = data de hoje por extenso (ex: Maputo, 30 de Maio de 2026)
{{REF}} = ${data.ref || 'S/Ref.'}
{{MINISTERIO}} = ${ministrioLabel}
{{REPARTIÇÃO}} = ${data.reparticao || data.remetenteNome || ''}
{{DESTINATARIO_NOME}} = ${data.destinatarioNome || ''}
{{DESTINATARIO_ENTI}} = ${data.destinatarioEnti || ''}
{{ASSUNTO}} = ${data.assunto || ''}
{{REMETENTE_CARGO_PRETENDIDO}} = ${data.cargoPretendido || data.cargo || ''}
{{CORPO}} = corpo formal e completo da carta, desenvolvendo os pontos: "${data.pontos || ''}"
           (mínimo 3 parágrafos; linguagem formal; português de Moçambique)`;
      },

      orcamento: () => `- Tipo de obra: ${data.tipoObra || ''}
- Área: ${data.area || '?'} m² | Pisos: ${data.nPisos || 'R/C'} | Local: ${data.local || ''}
- Acabamento: ${data.acabamento || 'Médio'} | Cobertura: ${data.cobertura || 'Laje'}
- Prazo: ${data.prazo || 60} dias | Fase: ${data.fase || ''} | Cliente: ${data.cliente || ''}
- Empresa emitente: ${data.empresa || data.prestador || 'Empresa de Construção'}
- Detalhes adicionais: ${data.extra || 'padrão'}

MAPEAMENTO DE PLACEHOLDERS:
{{TITULO_OBRA}} = Orçamento de ${data.tipoObra || ''}
{{LOCAL_DATA}} = ${data.local || 'Maputo'}, hoje por extenso
{{AREA_PISOS}} = ${data.area || '?'} m² | ${data.nPisos || 'R/C'} piso(s)
{{EMPRESA}} = ${data.empresa || data.prestador || 'Empresa de Construção'}
{{CLIENTE}} = ${data.cliente || '[nome do cliente]'}
{{NUM_ORC}} = ${data.numOrc || '001/' + new Date().getFullYear()}
{{PRAZO}} = ${data.prazo || 60}
{{VALIDADE}} = Válido por 30 dias a partir da data de emissão
{{ITEMS_MATERIAIS}} = gere 8-15 linhas <tr><td>material</td><td>un</td><td>qtd</td><td>preço</td><td>total MZN</td></tr> realistas para "${data.tipoObra || ''}" com acabamento ${data.acabamento || 'Médio'}
{{ITEMS_MAO_OBRA}} = gere 4-8 linhas <tr><td>profissional</td><td>dias</td><td>diária MZN</td><td>total MZN</td></tr>
{{ITEMS_TODOS}} = combinar materiais e mão-de-obra numa única tabela (para templates simples)
{{TOTAL_MATERIAIS}} = calcule o subtotal dos materiais em MZN
{{TOTAL_MAO_OBRA}} = calcule o subtotal da mão-de-obra em MZN
{{SUBTOTAL}} = soma de materiais + mão-de-obra
{{IMPREVISTOS}} = 10% do subtotal
{{TOTAL_GERAL}} = subtotal + imprevistos (valor final em MZN)`,

      arrendamento: () => `- Tipo: ${data.tipoImovel || ''}
- Senhorio: ${data.proprietario || ''}  |  BI: ${data.biProprietario || ''}
- Inquilino: ${data.locatario || ''}  |  BI: ${data.biLocatario || ''}
- Local: ${data.local || ''}
- Renda: ${num(data.valor)} MZN/mês  |  Duração: ${data.duracao || ''}
- Caução: ${data.caucao || ''}  |  Pagamento: ${data.metodoPagamento || ''}
- Serviços incluídos: ${data.quemPagaServicos || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{SENHORIO_NOME}} = ${data.proprietario || ''}
{{SENHORIO_BI}} = ${data.biProprietario || ''}
{{INQUILINO_NOME}} = ${data.locatario || ''}
{{INQUILINO_BI}} = ${data.biLocatario || ''}
{{IMOVEL_LOCAL}} = ${data.local || ''}
{{TIPO_IMOVEL}} = ${data.tipoImovel || ''}
{{RENDA_VALOR}} = ${num(data.valor)} MZN/mês
{{RENDA_EXTENSO}} = [escreva o valor por extenso em português]
{{DURACAO}} = ${data.duracao || ''}
{{CAUCAO}} = ${data.caucao || ''}
{{DATA}} = data de hoje por extenso
{{LOCAL_DATA}} = ${data.local || 'Maputo'}, hoje
{{CLAUSULAS}} = gere cláusulas completas numeradas (Cláusula 1ª a 12ª) cobrindo:
  objecto do contrato, identificação do imóvel, prazo (${data.duracao || ''}), renda (${num(data.valor)} MZN),
  caução (${data.caucao || ''}), forma de pagamento (${data.metodoPagamento || ''}),
  serviços e encargos (${data.quemPagaServicos || ''}), obrigações do senhorio, obrigações do inquilino,
  conservação e reparações, rescisão antecipada, foro competente (Tribunal de ${data.local || 'Maputo'})
  Cada cláusula: <p><strong>Cláusula N.ª — TÍTULO</strong></p><p>texto...</p>`,

      procuracao: () => `- Tipo: ${data.tipoProc || 'Especial'}
- Outorgante: ${data.outorgante || ''}  |  BI: ${data.biOutorgante || ''}  |  Morada: ${data.moradaOutorgante || ''}
- Procurador: ${data.procurador || ''}  |  BI: ${data.biProcurador || ''}  |  Morada: ${data.moradaProcurador || ''}
- Poderes: ${data.acto || ''}
- Sub-mandato: ${data.subMandato || 'Não'}
- Validade: ${data.validade || ''}  |  Local: ${data.local || ''}`,

      requerimento: () => `- Entidade: ${data.entidade || ''}
- Requerente: ${data.remetente || ''}  |  BI: ${data.bi || ''}  |  Contacto: ${data.contacto || ''}
- Endereço: ${data.endereco || ''}
- Assunto: ${data.assunto || ''}
- Fundamento: ${data.fundamento || ''}
- Anexos: ${data.anexos || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{ENTIDADE}} = ${data.entidade || ''}
{{REQUERENTE}} = ${data.remetente || ''}
{{BI}} = ${data.bi || ''}
{{ENDERECO}} = ${data.endereco || ''}
{{ASSUNTO}} = ${data.assunto || ''}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso
{{FUNDAMENTO}} = texto formal desenvolvendo: "${data.fundamento || ''}" (2-3 parágrafos com base legal quando aplicável)
{{CONTACTO}} = ${data.contacto || ''}`,

      residencia: () => `- Declarante: ${data.declarante || ''}  |  BI: ${data.bi || ''}
- Nascimento: ${data.nascimento || ''}  |  Naturalidade: ${data.naturalidade || ''}
- Endereço: ${data.endereco || ''}  |  Tempo de residência: ${data.tempo || ''}
- Finalidade: ${data.finalidade || ''}
- Chefe de quarteirão/Lider: ${data.chefe || '[nome do responsável]'}

MAPEAMENTO DE PLACEHOLDERS:
{{DECLARANTE}} = ${data.declarante || ''}
{{BI}} = ${data.bi || ''}
{{NASCIMENTO}} = ${data.nascimento || ''}
{{NATURALIDADE}} = ${data.naturalidade || ''}
{{ENDERECO}} = ${data.endereco || ''}
{{TEMPO}} = ${data.tempo || ''}
{{FINALIDADE}} = ${data.finalidade || ''}
{{CHEFE}} = ${data.chefe || '[nome do responsável]'}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso`,

      prestacao: () => `- Serviço: ${data.servico || ''}
- Prestador: ${data.prestador || ''}  |  NUIT: ${data.nuitPrestador || ''}  |  Morada: ${data.moradaPrestador || ''}
- Cliente: ${data.cliente || ''}  |  BI/NUIT: ${data.biCliente || ''}  |  Morada: ${data.moradaCliente || ''}
- Valor total: ${num(data.valorTotal)} MZN  |  Prazo: ${data.prazo || ''} dias
- Pagamento: ${data.pagamento || ''}
- Penalização por atraso: ${data.penalizacao || '0.5%/dia'}
- Descrição: ${data.descricao || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{PRESTADOR}} = ${data.prestador || ''}
{{NUIT_PRESTADOR}} = ${data.nuitPrestador || ''}
{{MORADA_PRESTADOR}} = ${data.moradaPrestador || ''}
{{CLIENTE}} = ${data.cliente || ''}
{{BI_CLIENTE}} = ${data.biCliente || ''}
{{SERVICO}} = ${data.servico || ''}
{{DESCRICAO}} = ${data.descricao || ''}
{{VALOR_TOTAL}} = ${num(data.valorTotal)} MZN
{{PRAZO}} = ${data.prazo || ''} dias
{{PAGAMENTO}} = ${data.pagamento || ''}
{{DATA}} = data de hoje por extenso
{{CLAUSULAS}} = gere cláusulas completas numeradas para contrato de prestação de serviços:
  objecto, obrigações do prestador, obrigações do cliente, prazo de execução, valor e pagamento,
  penalizações, propriedade intelectual, rescisão, foro competente`,

      recibo: () => {
        const valorBase = parseFloat(data.valor || 0);
        const taxaIva   = data.iva === 'Sim' ? 16 : (parseFloat(data.taxaIva) || 0);
        const valorIva  = valorBase * taxaIva / 100;
        const valorTotal = valorBase + valorIva;
        return `- Tipo: ${data.tipoDoc || 'Recibo Simples'}
- Emitente: ${data.emitente || ''}  |  NUIT: ${data.nuitEmitente || 'N/A'}
- Cliente: ${data.cliente || ''}  |  BI/NUIT: ${data.biCliente || ''}
- Descrição: ${data.descricao || ''}
- Valor base: ${valorBase.toLocaleString('pt-MZ')} MZN | IVA: ${taxaIva}% | Total: ${valorTotal.toLocaleString('pt-MZ')} MZN
- Pagamento: ${data.pagamento || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{EMITENTE}} = ${data.emitente || ''}
{{NUIT_EMITENTE}} = ${data.nuitEmitente || 'N/A'}
{{CLIENTE}} = ${data.cliente || ''}
{{BI_CLIENTE}} = ${data.biCliente || ''}
{{DESCRICAO}} = ${data.descricao || ''}
{{NUM_DOC}} = ${data.numDoc || '001/' + new Date().getFullYear()}
{{DATA}} = data de hoje por extenso
{{FORMA_PAGAMENTO}} = ${data.pagamento || 'Numerário'}
{{ITEMS_RECIBO}} = gere 1-3 linhas <tr><td>descrição</td><td>qtd</td><td>preço unit</td><td>total</td></tr> para: "${data.descricao || ''}"
{{TAXA_IVA}} = ${taxaIva}
{{VALOR_IVA}} = ${valorIva.toLocaleString('pt-MZ')} MZN
{{SUBTOTAL}} = ${valorBase.toLocaleString('pt-MZ')} MZN
{{VALOR_TOTAL}} = ${valorTotal.toLocaleString('pt-MZ')} MZN`;
      },

      recomendacao: () => `- Tipo: ${data.tipoRec || 'Profissional'}
- Recomendador: ${data.recomendador || ''}  |  Cargo: ${data.cargoRec || ''}  |  Entidade: ${data.entidadeRec || ''}
- Recomendado: ${data.recomendado || ''}  |  Cargo/Bolsa pretendido: ${data.cargoRecm || ''}
- Relação de trabalho: ${data.relacao || ''}
- Qualidades evidenciadas: ${data.qualidades || ''}
- Exemplo concreto: ${data.exemploConcreto || '[a completar]'}

MAPEAMENTO DE PLACEHOLDERS:
{{RECOMENDADOR}} = ${data.recomendador || ''}
{{CARGO_REC}} = ${data.cargoRec || ''}
{{ENTIDADE_REC}} = ${data.entidadeRec || ''}
{{RECOMENDADO}} = ${data.recomendado || ''}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso
{{CORPO}} = carta completa de recomendação (3-4 parágrafos):
  1. Apresentação do recomendador e relação com o recomendado
  2. Competências e qualidades: "${data.qualidades || ''}"
  3. Exemplo concreto: "${data.exemploConcreto || ''}"
  4. Recomendação explícita para "${data.cargoRecm || ''}"`,

      planonegocio: () => `- Negócio: ${data.nomeNegocio || ''}  |  Forma jurídica: ${data.formaJuridica || ''}
- Sector: ${data.sector || ''}  |  Local: ${data.local || ''}
- Proprietário: ${data.proprietario || ''}
- Investimento total: ${num(data.investimento)} MZN
- Trabalhadores: ${data.nTrabalhadores || 1}  |  Público-alvo: ${data.clientes || ''}
- Retorno esperado: ${data.retorno || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{NOME_NEGOCIO}} = ${data.nomeNegocio || ''}
{{SECTOR}} = ${data.sector || ''}
{{PROPRIETARIO}} = ${data.proprietario || ''}
{{LOCAL}} = ${data.local || ''}
{{ANO}} = ${new Date().getFullYear()}
{{INVESTIMENTO_TOTAL}} = ${num(data.investimento)} MZN
{{SUMARIO}} = sumário executivo do negócio (2-3 frases)
{{DESCRICAO_NEGOCIO}} = descrição detalhada: o que faz, como funciona, proposta de valor
{{ANALISE_MERCADO}} = análise do mercado em ${data.local || 'Moçambique'} para ${data.sector || ''}: clientes-alvo, concorrência, oportunidades
{{ITEMS_FINANCEIROS}} = linhas <tr><td>componente</td><td>valor MZN</td></tr> (equipamento, stock, licenças, fundo de maneio...)
{{EQUIPA}} = estrutura organizacional com ${data.nTrabalhadores || 1} colaborador(es) e funções
{{RETORNO}} = projecção de retorno: ${data.retorno || ''} com análise de ponto de equilíbrio`,

      licenca: () => `- Tipo: ${data.tipoLicenca || 'Licença Comercial'}
- Requerente: ${data.requerente || ''}  |  NUIT: ${data.nuit || ''}  |  Contacto: ${data.contacto || ''}
- Entidade destinatária: ${data.entidade || ''}
- Objecto da licença: ${data.objecto || ''}
- Área: ${data.areaM2 || ''} m²  |  Horário: ${data.horario || ''}  |  Local: ${data.local || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{REQUERENTE}} = ${data.requerente || ''}
{{NUIT}} = ${data.nuit || ''}
{{CONTACTO}} = ${data.contacto || ''}
{{ENTIDADE}} = ${data.entidade || ''}
{{OBJECTO}} = ${data.objecto || ''}
{{AREA_M2}} = ${data.areaM2 || ''}
{{HORARIO}} = ${data.horario || ''}
{{LOCAL}} = ${data.local || ''}
{{DATA}} = data de hoje por extenso
{{FUNDAMENTACAO}} = fundamentação jurídica do pedido (2 parágrafos referenciando legislação moçambicana aplicável)`,

      acta: () => `- Organização: ${data.organizacao || ''}  |  Tipo: ${data.tipoReuniao || ''}
- Data: ${data.data || ''}  |  Hora: ${data.hora || ''}  |  Local: ${data.local || ''}
- Presidente: ${data.presidente || ''}  |  Secretário: ${data.secretario || ''}
- Presentes: ${data.presentes || ''}
- Pauta: ${data.pauta || ''}
- Deliberações: ${data.deliberacoes || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{ORGANIZACAO}} = ${data.organizacao || ''}
{{TIPO_REUNIAO}} = ${data.tipoReuniao || ''}
{{NUM_ACTA}} = ${data.numActa || '001/' + new Date().getFullYear()}
{{DATA}} = ${data.data || 'data de hoje por extenso'}
{{HORA}} = ${data.hora || ''}
{{LOCAL}} = ${data.local || ''}
{{PRESIDENTE}} = ${data.presidente || ''}
{{SECRETARIO}} = ${data.secretario || ''}
{{PRESENTES}} = ${data.presentes || ''}
{{PAUTA}} = lista formatada dos pontos da ordem do dia: "${data.pauta || ''}"
           Formato: <p>1. Ponto um</p><p>2. Ponto dois</p>...
{{DELIBERACOES}} = deliberações formais detalhadas sobre: "${data.deliberacoes || ''}"
                  Formato: <p><strong>Ponto 1:</strong> texto da deliberação aprovada por unanimidade/maioria.</p>`,

      trabalho: () => `- Tema: ${data.tema || ''}
- Disciplina: ${data.disciplina || ''}  |  Nível: ${data.nivel || ''}
- Páginas: ${data.paginas || 5}  |  Requisitos: ${data.requisitos || 'APA'}`,
    };

    return (blocks[type] || blocks.carta)();
  }

}

// services/MPesaService.js — Integração M-Pesa com detecção de ambiente

export class MPesaService {
  constructor() {
    this.endpoint = '/api/process-payment';
    this.env = this._detectEnv();
  }

  _detectEnv() {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'sandbox';
    if (hostname.includes('netlify.app') && new URLSearchParams(location.search).has('debug')) return 'sandbox';
    return 'production';
  }

  isSandbox() { return this.env === 'sandbox'; }

  validatePhone(raw) {
    if (!Validator.phone(raw)) throw new Error('Número inválido. Use formato: 84 XXX XXXX');
  }

  async processPayment(phone, amount, packageId) {
    this.validatePhone(phone);
    if (!Validator.amount(amount)) throw new Error('Valor inválido para o pacote');

    const body = {
      phoneNumber: Formatter.phone(phone),
      amount: parseInt(amount),
      packageId,
      environment: this.env,
      timestamp: Date.now(),
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Erro no pagamento');
    return data;
  }
}

// services/SupabaseService.js — Persistência de créditos
export class SupabaseService {
  constructor() {
    this._client = null;
    this._ready = false;
  }

  async init() {
    // CORRIGIDO: reutilizar o cliente do authManager se disponível
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      await authManager.ready();
      if (authManager.supabase) {
        this._client = authManager.supabase;
        this._ready = true;
        return true;
      }
    } catch { /* fallback abaixo */ }

    // Fallback: tentar /api/config directamente
    try {
      const r = await fetch('/api/config');
      if (!r.ok) return false;
      const config = await r.json();
      if (!config.configured) return false;
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      this._client = createClient(config.supabaseUrl, config.supabaseAnonKey);
      this._ready = true;
      return true;
    } catch (e) {
      console.warn('[Supabase] Falha ao inicializar:', e);
      return false;
    }
  }

  async syncUser(userId) {
    // NOTA: não aceita localCredits — o Supabase é sempre a fonte de verdade.
    // Nunca fazer Math.max com localStorage para não repor créditos já gastos.
    if (!this._ready) return null;
    try {
      const { data, error } = await this._client
        .from('profiles')
        .select('credits, plan, plan_expires_at, monthly_renewal_at')
        .eq('id', userId)
        .single();

      if (error?.code === 'PGRST116') {
        // Perfil não existe ainda (raro — o trigger devia criá-lo)
        return null;
      }
      if (error) throw error;

      // Verificar e atribuir créditos mensais se aplicável
      const plan = data.plan || 'free';
      const expires = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
      const planActive = plan !== 'free' && (!expires || expires > new Date());

      if (planActive) {
        const lastRenewal = data.monthly_renewal_at ? new Date(data.monthly_renewal_at) : null;
        const now = new Date();
        const sameMonth = lastRenewal &&
          lastRenewal.getFullYear() === now.getFullYear() &&
          lastRenewal.getMonth()    === now.getMonth();

        if (!sameMonth) {
          // Chamar RPC para atribuir créditos mensais (idempotente no servidor)
          try {
            const { data: newCredits } = await this._client
              .rpc('grant_monthly_credits', { target_user_id: userId });
            if (typeof newCredits === 'number') {
              return { credits: newCredits, plan };
            }
          } catch (e) {
            console.warn('[Supabase] grant_monthly_credits falhou:', e);
          }
        }
      }

      return { credits: data.credits, plan };
    } catch (e) {
      console.warn('[Supabase] syncUser falhou:', e);
      return null;
    }
  }

  async deductCredit(userId) {
    if (!this._ready) return null;
    try {
      const { data } = await this._client.rpc('deduct_credit', { user_id: userId });
      return typeof data === 'number' ? data : null;
    } catch { return null; }
  }

  async updateCredits(userId, credits) {
    if (!this._ready) return;
    try {
      // CORRIGIDO: tabela 'profiles', campo updated_at
      await this._client.from('profiles').upsert({
        id: userId,
        credits,
        updated_at: new Date().toISOString()
      });
    } catch (e) { console.warn('[Supabase] updateCredits falhou:', e); }
  }
}
