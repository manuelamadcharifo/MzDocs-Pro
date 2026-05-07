// assets/js/services/OpenRouterService.js — IA gratuita com fallback automático
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

  async generate(serviceType, formData, ocrText = null, credits = null) {
    const prompt = this._buildPrompt(serviceType, formData, ocrText);
    return await this._callBackend(serviceType, prompt, credits);
}


  async generateRaw(prompt, reeditData = null, credits = null) {
    const userId      = localStorage.getItem('mz_uid') || 'anon';
    const userCredits = credits !== null ? credits : 0;

    const body = reeditData
      ? {
          serviceType: reeditData.serviceType || 'reedit',
          prompt: prompt,
          userId,
          userCredits: userCredits,
          _reedit: true,
          _currentContent: reeditData.currentContent,
          _instruction: reeditData.instruction,
        }
      : {
          serviceType: 'reedit',
          prompt,
          userId,
          userCredits: credits
        };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  async _callBackend(serviceType, prompt, credits = null) {
    const userId       = localStorage.getItem('mz_uid') || 'anon';
    const userCredits  = credits !== null ? credits : 0;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType, prompt, userId, userCredits: userCredits }),
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

  _buildPrompt(type, data, ocr) {
    const ocrBlock = ocr ? `\n\nRascunho OCR (use como base, corrija erros):\n${ocr}` : '';

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

ESTRUTURA OBRIGATÓRIA (copie exactamente incluindo ---PAGE_BREAK---):

---PAGE_BREAK---
# ${data.tema}

| | |
|---|---|
| **Instituição:** | [Nome da Instituição] |
| **Curso/Disciplina:** | ${data.disciplina} |
| **Nível:** | ${data.nivel} |
| **Aluno(a):** | [Nome Completo] |
| **Número de Estudante:** | [Número] |
| **Docente:** | [Nome do Professor] |
| **Cidade e Ano:** | Maputo, ${ano} |

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

[Liste MÍNIMO 7 referências reais e verificáveis em formato APA 7ª edição, incluindo obrigatoriamente:
- Pelo menos 2 livros académicos publicados sobre o tema
- Pelo menos 1 artigo científico de revista indexada
- Pelo menos 1 relatório de organismo internacional (ONU, Banco Mundial, UA, SADC)
- Pelo menos 1 fonte moçambicana (INE, Governo de Moçambique, universidades moçambicanas)

Exemplo de formato:
Apelido, A. B. (Ano). *Título do livro em itálico*. Editora.
Apelido, A. B., & Apelido, C. D. (Ano). Título do artigo. *Nome da Revista*, Volume(Número), páginas. https://doi.org/xxxxx]
`;
      },


      cv: () =>
        `Crie um CURRÍCULO VITAE PROFISSIONAL em Markdown para o mercado moçambicano.
Nome: ${data.nome}. Cargo: ${data.cargo}. Nascimento: ${data.nascimento || '-'}.
Contacto: ${data.contacto || '-'}. Email: ${data.email || '-'}.
Formação: ${data.formacao}. Experiência: ${data.experiencia || 'Recém-formado'}.
Habilidades: ${data.habilidades || '-'}. Objectivo: ${data.objectivo || '-'}${ocrBlock}
Formato Europass: Dados Pessoais → Objectivo → Formação → Experiência (verbos de acção) → Competências → Referências.`,

      carta: () =>
        `Redija uma CARTA FORMAL COMPLETA do tipo "${data.tipo}".
Remetente: ${data.remetenteNome}, ${data.remetenteLocal || 'Maputo'}.
Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}.
Assunto: ${data.assunto}. Pontos: ${data.pontos}.${ocrBlock}
Estrutura: cabeçalho com data/local → dados de remetente e destinatário → assunto → saudação formal → 3-4 parágrafos → fecho → assinatura.`,

      orcamento: () =>
        `Elabore um ORÇAMENTO DE CONSTRUÇÃO DETALHADO em Markdown com tabelas.
Obra: ${data.tipoObra}. Área: ${data.area || '?'} m². Local: ${data.local}.
Acabamento: ${data.acabamento || 'médio'}. Fase: ${data.fase}. Prazo: ${data.prazo || 60} dias.
Detalhes: ${data.extra || 'padrão'}.${ocrBlock}
Incluir: resumo da obra → tabelas de materiais por fase (cimento, tijolos, ferro, areia, telha etc.) com quantidades e preços MZN → mão-de-obra → equipamentos → resumo financeiro com total → condições comerciais.
Preços de mercado moçambicano ${new Date().getFullYear()}.`,

      arrendamento: () =>
        `Redija um CONTRATO DE ARRENDAMENTO completo e juridicamente estruturado conforme o Código Civil de Moçambique e o Decreto-Lei n.º 41/2018.
DADOS:
- Tipo de imóvel: ${data.tipoImovel}
- Proprietário (Senhorio): ${data.proprietario}
- Locatário (Inquilino): ${data.locatario}
- Localização: ${data.local}
- Renda mensal: ${data.valor} MZN
- Duração: ${data.duracao}
- Caução: ${data.caucao}
- Condições especiais: ${data.condicoes || 'Nenhuma'}${ocrBlock}
ESTRUTURA OBRIGATÓRIA:
CLÁUSULA 1 – Objecto (descrição do imóvel, endereço, finalidade)
CLÁUSULA 2 – Prazo (data de início, duração, renovação)
CLÁUSULA 3 – Renda (valor em MZN, data de pagamento, multa por atraso)
CLÁUSULA 4 – Caução (valor, condições de devolução)
CLÁUSULA 5 – Obrigações do Proprietário
CLÁUSULA 6 – Obrigações do Locatário
CLÁUSULA 7 – Rescisão (prazos de aviso prévio, causas)
CLÁUSULA 8 – Foro (Maputo)
ASSINATURAS: local, data, nome e BI de ambas as partes + 2 testemunhas.
Use linguagem jurídica formal em português de Moçambique.`,

      procuracao: () =>
        `Redija uma PROCURAÇÃO / MANDATO formal e juridicamente válida em Moçambique.
DADOS:
- Tipo: ${data.tipoProc}
- Outorgante: ${data.outorgante} (BI: ${data.biOutorgante})
- Procurador: ${data.procurador} (BI: ${data.biProcurador})
- Acto específico: ${data.acto}
- Validade: ${data.validade}
- Local e data: ${data.local}${ocrBlock}
ESTRUTURA:
1. TÍTULO: "PROCURAÇÃO" + tipo
2. EXPOSIÇÃO: Eu, [outorgante], portador do BI n.º [BI], outorgo poderes a:
3. NOMEAÇÃO: [procurador], portador do BI n.º [BI]
4. PODERES CONFERIDOS: descrição detalhada (assinar, retirar, receber, dar quitação...)
5. LIMITES: o que NÃO pode fazer
6. VALIDADE e condição de revogação
7. ASSINATURAS: outorgante + procurador + 2 testemunhas com BI + espaço para reconhecimento de firma
Linguagem formal, jurídica, em português de Moçambique.`,

      requerimento: () =>
        `Redija um REQUERIMENTO OFICIAL formal para repartição pública em Moçambique.
DADOS:
- Entidade: ${data.entidade}
- Assunto: ${data.assunto}
- Requerente: ${data.remetente} | BI: ${data.bi} | Tel: ${data.contacto}
- Endereço: ${data.endereco}
- Fundamento: ${data.fundamento}
- Anexos: ${data.anexos || 'Nenhum especificado'}${ocrBlock}
ESTRUTURA:
1. CABEÇALHO: Exmo(a). Sr(a). Director(a) da [entidade]
2. ASSUNTO em maiúsculas
3. IDENTIFICAÇÃO: Eu, [nome], BI n.º [BI], residente em [endereço], contacto [tel], venho REQUERER:
4. EXPOR (3 parágrafos: contexto, necessidade, urgência)
5. REQUERER: pedido específico e formal
6. ANEXOS: lista
7. FECHO: "Pela atenção, desde já agradeço" + local + data + assinatura
Linguagem formal, respeitosa, típica da administração pública moçambicana.`,

      residencia: () =>
        `Redija uma DECLARAÇÃO DE RESIDÊNCIA formal para uso em repartições, bancos e empresas em Moçambique.
DADOS:
- Declarante: ${data.declarante} | BI: ${data.bi} | Nascimento: ${data.nascimento}
- Naturalidade: ${data.naturalidade}
- Endereço: ${data.endereco}
- Tempo de residência: ${data.tempo}
- Finalidade: ${data.finalidade}
- Chefe de quarteirão: ${data.chefe || 'Não informado'}${ocrBlock}
ESTRUTURA:
1. TÍTULO: "DECLARAÇÃO DE RESIDÊNCIA"
2. TEXTO: Eu, [nome], BI n.º [BI], nascido em [data] em [naturalidade], residente em [endereço] há [tempo], DECLARO:
3. DECLARAÇÃO: confirmo que resido no endereço acima desde [data aproximada]
4. FINALIDADE: esta declaração destina-se a [finalidade]
5. COMPROMISSO: assumo responsabilidade pela veracidade (art. 347 Código Penal de Moçambique)
6. ASSINATURAS: declarante + 2 testemunhas com BI + chefe de quarteirão + data
Linguagem jurídica formal em português de Moçambique.`,

      prestacao: () =>
        `Elabore um CONTRATO DE PRESTAÇÃO DE SERVIÇOS formal para o mercado moçambicano.
DADOS:
- Serviço: ${data.servico}
- Prestador: ${data.prestador} (NUIT: ${data.nuitPrestador || 'Não informado'})
- Cliente: ${data.cliente} (BI: ${data.biCliente})
- Valor total: ${data.valorTotal} MZN | Pagamento: ${data.pagamento}
- Prazo: ${data.prazo} dias
- Descrição: ${data.descricao}
- Penalidades: ${data.penalidades || 'Não especificadas'}${ocrBlock}
ESTRUTURA OBRIGATÓRIA:
1. TÍTULO + PARTES (identificação completa)
2. OBJECTO: descrição detalhada do serviço, escopo, exclusões
3. OBRIGAÇÕES DO PRESTADOR: prazo, qualidade, materiais, garantia
4. OBRIGAÇÕES DO CLIENTE: pagamento, acesso, colaboração
5. PREÇO E PAGAMENTO: valor, forma, prazos, multa por atraso
6. PRAZO E ENTREGA: data de início, entrega, cláusula de aceitação
7. RESCISÃO: condições, aviso prévio, pagamento proporcional
8. RESPONSABILIDADE E FORO (Maputo)
9. ASSINATURAS: ambas as partes + 2 testemunhas + data`,

      recibo: () =>
        `Elabore um ${data.tipoDoc.toUpperCase()} formal para comércio em Moçambique.
DADOS:
- Emitente: ${data.emitente} (NUIT: ${data.nuitEmitente || 'Não informado'})
- Cliente: ${data.cliente} (BI: ${data.biCliente})
- Descrição: ${data.descricao}
- Valor: ${data.valor} MZN | IVA: ${data.iva} | Pagamento: ${data.pagamento}
- Local e data: ${data.local}${ocrBlock}
ESTRUTURA:
1. CABEÇALHO: nome, NUIT, contacto do emitente
2. TÍTULO: "${data.tipoDoc.toUpperCase()} N.º [número]"
3. DADOS DO CLIENTE: nome, BI
4. TABELA Markdown: Descrição | Qtd | Preço Unit. | Total
5. RESUMO: subtotal → IVA (16% se aplicável) → TOTAL GERAL
6. FORMA DE PAGAMENTO e status ("Pago" / "A pagar")
7. Se recibo: "Recebi a quantia de [valor por extenso] meticais referente a [descrição]"
8. ASSINATURAS: emitente + cliente + data
Nota de rodapé com referência legal se aplicável.`,

      recomendacao: () =>
        `Redija uma CARTA DE RECOMENDAÇÃO formal e convincente.
DADOS:
- Tipo: ${data.tipoRec}
- Recomendador: ${data.recomendador}, ${data.cargoRec} na ${data.entidadeRec}
- Recomendado: ${data.recomendado} | Cargo pretendido: ${data.cargoRecm}
- Relação: ${data.relacao}
- Qualidades: ${data.qualidades}
- Destinatário: ${data.destinatario || 'A quem possa interessar'}${ocrBlock}
ESTRUTURA:
1. CABEÇALHO: dados do recomendador, contacto, data
2. DESTINATÁRIO: Exmo. Sr. / À atenção de [destinatário]
3. ASSUNTO: "Carta de Recomendação – [nome]"
4. INTRODUÇÃO: quem sou, cargo, como e há quanto tempo conheço o candidato
5. CORPO (4 parágrafos):
   - Desempenho profissional/académico com exemplos concretos
   - Qualidades pessoais e interpessoais específicas
   - Realizações mensuráveis, projectos, impacto real
   - Comparação positiva com pares (sem depreciar terceiros)
6. CONCLUSÃO: recomendação explícita e entusiasta
7. DISPONIBILIDADE: contacto para confirmação
8. ASSINATURA: nome, cargo, entidade
Tom formal mas caloroso, com exemplos específicos (nunca genérico).`,

      planonegocio: () =>
        `Elabore um PLANO DE NEGÓCIOS SIMPLIFICADO para pequenos empreendedores em Moçambique.
DADOS:
- Nome: ${data.nomeNegocio} | Sector: ${data.sector}
- Proprietário: ${data.proprietario} | Local: ${data.local}
- Descrição: ${data.descricao}
- Investimento inicial: ${data.investimento} MZN
- Clientes-alvo: ${data.clientes}
- Concorrência e diferencial: ${data.concorrencia || 'A definir'}
- Prazo de retorno: ${data.retorno}${ocrBlock}
ESTRUTURA (máximo 6 páginas A4):
1. RESUMO EXECUTIVO: missão, visão, investimento, retorno esperado
2. DESCRIÇÃO DO NEGÓCIO: o que vende, como funciona, modelo de receita
3. ANÁLISE DE MERCADO: tamanho, tendências, clientes-alvo em Moçambique
4. PLANO DE MARKETING: preço, promoção, canais de venda (inclui M-Pesa/WhatsApp)
5. PLANO OPERACIONAL: processos, fornecedores, equipamentos, local
6. PLANO FINANCEIRO: tabela com investimento inicial, custos mensais, receitas projetadas (12 meses), ponto de equilíbrio
7. EQUIPE: quem trabalha e funções
8. RISCOS E MITIGAÇÃO: 3 riscos + soluções
9. CONCLUSÃO: pedido de apoio/financiamento
Use dados realistas do mercado moçambicano ${new Date().getFullYear()}.`,

      licenca: () =>
        `Redija um PEDIDO DE LICENÇA / AUTORIZAÇÃO formal para entidade pública em Moçambique.
DADOS:
- Tipo: ${data.tipoLicenca}
- Requerente: ${data.requerente} (NUIT: ${data.nuit}) | Tel: ${data.contacto}
- Entidade: ${data.entidade}
- Objecto: ${data.objecto}
- Local exacto: ${data.local}
- Documentos: ${data.documentos || 'Não especificados'}${ocrBlock}
ESTRUTURA:
1. CABEÇALHO: Exmo. Sr. Presidente/Director da [entidade]
2. ASSUNTO: "Pedido de [tipo de licença]"
3. IDENTIFICAÇÃO: Eu, [nome/entidade], NUIT [n.º], contacto [tel], venho REQUERER:
4. FUNDAMENTAÇÃO (3-4 parágrafos):
   - Descrição do projecto/actividade
   - Benefícios para a comunidade (emprego, economia local)
   - Compromisso de cumprimento de normas (ambiente, segurança)
   - Referência legal aplicável (Lei n.º 15/2013, Decreto n.º 43/2015...)
5. PEDIDO FORMAL: emissão de [tipo de licença] para [descrição]
6. LISTA DE ANEXOS
7. COMPROMISSO de veracidade e cumprimento das condições
8. ASSINATURAS: requerente + 2 testemunhas + data
Linguagem formal com referências à legislação moçambicana aplicável.`,

      acta: () =>
        `Redija uma ACTA DE REUNIÃO formal e completa para organização moçambicana.
DADOS:
- Organização: ${data.organizacao} | Tipo: ${data.tipoReuniao}
- Data: ${data.data} às ${data.hora} | Local: ${data.local}
- Presidente de mesa: ${data.presidente} | Secretário: ${data.secretario}
- Presentes: ${data.presentes}
- Pauta: ${data.pauta}
- Deliberações: ${data.deliberacoes}${ocrBlock}
ESTRUTURA:
1. TÍTULO: "ACTA DA [tipo] DA [organização] – [data]"
2. CABEÇALHO: data, hora de início, local, tipo de reunião
3. MESA: presidente e secretário com cargos
4. PRESENTES: lista completa com cargos (se houver)
5. ABERTURA: quem declarou aberta e hora exacta
6. PAUTA: cada ponto numerado com discussão resumida e votação (se houver)
7. DELIBERAÇÕES: decisão clara de cada ponto ("Foi deliberado por unanimidade...", "Aprovado por X votos...")
8. ASSUNTOS GERAIS: informações avulsas
9. ENCERRAMENTO: hora e quem encerrou
10. ASSINATURAS: presidente + secretário + 2 vogais da mesa
Linguagem formal, impessoal. Inclua menção ao Estatuto/Regulamento quando pertinente.`,

    };

    return (builders[type] || builders.trabalho)();
  }
}

// services/MPesaService.js — Integração M-Pesa com detecção de ambiente
import { Validator } from '../utils/Formatter.js';
import { Formatter } from '../utils/Formatter.js';

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