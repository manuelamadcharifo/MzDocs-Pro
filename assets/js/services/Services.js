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

  async generate(serviceType, formData, ocrText = null, credits = null, cost = 1) {
    const prompt = this._buildPrompt(serviceType, formData, ocrText);
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

  _buildPrompt(type, data, ocr) {
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

      cv: () =>
        `Você é especialista em recursos humanos para o mercado moçambicano. Crie um CURRÍCULO VITAE PROFISSIONAL completo em Markdown.

DADOS:
- Nome: ${data.nome} | Cargo pretendido: ${data.cargo}
- Nascimento: ${data.nascimento || '[a completar]'} | Telefone: ${data.contacto || '[a completar]'}
- Email: ${data.email || '[a completar]'}
- Formação: ${data.formacao}
- Experiência: ${data.experiencia || 'Recém-formado'}
- Habilidades: ${data.habilidades || '[a completar]'}
- Objectivo: ${data.objectivo || '[a completar]'}${ocrBlock}

REGRAS OBRIGATÓRIAS:
1. Use VERBOS DE ACÇÃO no passado com resultados mensuráveis: "Gerenciei equipa de 5 pessoas", "Reduzi custos em 15%"
2. NUNCA: "profissional dedicado", "trabalho em equipa", "orientado para resultados" sem exemplo concreto
3. Máximo 2 páginas A4. NUNCA inclua foto, estado civil, religião, filiação política
4. Formação: do mais recente para o mais antigo

ESTRUTURA OBRIGATÓRIA:

# ${data.nome}
**${data.cargo}**
📞 ${data.contacto || '[telefone]'} | ✉️ ${data.email || '[email]'} | 📍 Moçambique

---

## Objectivo Profissional
[2-3 frases específicas: competência principal + valor que oferece + tipo de organização pretendida]

---

## Formação Académica
[**Grau — Curso** | Instituição | Ano de conclusão — do mais recente para o mais antigo]

---

## Experiência Profissional
[**Cargo** | Empresa | Período]
[- Acção específica com resultado mensurável]
[- Acção específica com resultado mensurável]

---

## Competências Técnicas
[Informática | Línguas (nível) | Ferramentas específicas]

---

## Referências
Disponíveis mediante solicitação.`,

      carta: () =>
        `Você é especialista em comunicação formal moçambicana. Redija uma CARTA FORMAL COMPLETA do tipo "${data.tipo}".

DADOS:
- Remetente: ${data.remetenteNome}, ${data.remetenteLocal || 'Maputo'}
- Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}
- Assunto: ${data.assunto}
- Pontos a abordar: ${data.pontos}${ocrBlock}

REGRAS:
1. NUNCA use "Venho por este meio" — comece directamente com a apresentação
2. Máximo 1 página A4. Tom adaptado ao tipo "${data.tipo}"
3. Cada parágrafo: UMA única ideia, 3-5 linhas
4. Data por extenso: ${data.remetenteLocal || 'Maputo'}, [dia] de [mês] de [ano]

ESTRUTURA OBRIGATÓRIA:

**${data.remetenteNome}**
[Cargo/Endereço se aplicável] | ${data.contacto || '[contacto]'}

${data.remetenteLocal || 'Maputo'}, [data por extenso]

Exmo(a). Sr(a). ${data.destinatarioNome}
${data.destinatarioEnti}

**Assunto: ${data.assunto}**

[Saudação adequada],

[§1 — Apresentação e propósito directo: 2-3 linhas sem "venho por este meio"]

[§2 — Desenvolvimento do ponto principal de "${data.pontos}": factos e fundamentos. 4-5 linhas]

[§3 — Pontos complementares se existirem. 3-4 linhas]

[§4 — Pedido claro com prazo: "Solicito a V.ª Ex.ª que... até [data]"]

Com os melhores cumprimentos,

_______________________________
**${data.remetenteNome}**`,

      orcamento: () =>
        `Você é engenheiro civil experiente em Moçambique. Elabore um ORÇAMENTO DE CONSTRUÇÃO DETALHADO em Markdown.

DADOS:
- Obra: ${data.tipoObra}
- Área: ${data.area || 'a calcular'} m² | Local: ${data.local}
- Acabamento: ${data.acabamento || 'Médio/Padrão'}
- Fase: ${data.fase}
- Prazo: ${data.prazo || 60} dias
- Detalhes: ${data.extra || 'padrão'}${ocrBlock}

REGRAS:
1. Preços de mercado moçambicano ${new Date().getFullYear()} em MZN (cimento ≈ 850-950 MZN/saco, tijolo ≈ 5-8 MZN/un, ferro 12mm ≈ 480 MZN/vara)
2. Quantidades calculadas com base na área e tipo de obra fornecidos
3. Tabelas com separador de milhares: 12 500,00 MZN (não "12500MZN")
4. NUNCA invente preços que não existem — use intervalos realistas do mercado

ESTRUTURA OBRIGATÓRIA:

# Orçamento de ${data.tipoObra}
**${data.local} | ${new Date().toLocaleDateString('pt-MZ')}**

## Resumo da Obra
[Descrição técnica: tipo, área, localização, padrão de acabamento, prazo]

## 1. Materiais de Construção

| Material | Unid. | Qtd. Estimada | Preço Unit. (MZN) | Total (MZN) |
|---|---|---|---|---|
| Cimento (50kg) | Saco | [qtd] | [900] | [total] |
| Tijolo cerâmico | Unid. | [qtd] | [7] | [total] |
| Areia (m³) | m³ | [qtd] | [1 800] | [total] |
| Brita | m³ | [qtd] | [2 200] | [total] |
| Ferro 12mm | Vara | [qtd] | [480] | [total] |
| Telha (tipo) | m² | [qtd] | [variável] | [total] |
| [outros materiais específicos à obra] | | | | |
| **TOTAL MATERIAIS** | | | | **[total]** |

## 2. Mão-de-Obra

| Profissional | Dias | Diária (MZN) | Total (MZN) |
|---|---|---|---|
| Mestre de obras | [n] | [1 200] | [total] |
| Pedreiro | [n] | [900] | [total] |
| Servente | [n] | [600] | [total] |
| Electricista (se aplicável) | [n] | [1 100] | [total] |
| Canalizador (se aplicável) | [n] | [1 100] | [total] |
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
| **TOTAL GERAL** | **[TOTAL]** |

## 5. Condições Comerciais
- Validade do orçamento: 30 dias
- Prazo de execução: ${data.prazo || 60} dias úteis após início
- Pagamento: [condições a acordar]
- Garantia de mão-de-obra: 6 meses
- [Nota: preços sujeitos a variação cambial do USD/MZN]`,

      arrendamento: () =>
        `Você é advogado especialista em direito imobiliário moçambicano. Redija um CONTRATO DE ARRENDAMENTO juridicamente válido e completo.

BASE LEGAL OBRIGATÓRIA:
- Lei n.º 19/2013, de 23 de Setembro (Lei do Arrendamento Urbano de Moçambique)
- Código Civil de Moçambique (Decreto n.º 47344, de 25 de Novembro de 1966, com alterações)
- Lei n.º 7/2015, de 6 de Outubro (Lei da Mediação e Arbitragem — para resolução de conflitos)
- Decreto n.º 61/2006, de 26 de Dezembro (Regulamento do Arrendamento Urbano)

DADOS:
- Tipo de imóvel: ${data.tipoImovel}
- Senhorio: ${data.proprietario}
- Inquilino: ${data.locatario}
- Localização: ${data.local}
- Renda: ${parseInt(data.valor || 0).toLocaleString('pt-MZ')} MZN/mês (${_numPorExtenso(data.valor)} meticais)
- Duração: ${data.duracao}
- Caução: ${data.caucao}
- Condições especiais: ${data.condicoes || 'Nenhuma'}${ocrBlock}

REGRAS DE QUALIDADE:
1. NUNCA deixar campos em branco sem orientação — use "____________________" com nota "(a preencher)"
2. Valor da renda SEMPRE por extenso E em algarismos
3. Data de início OBRIGATÓRIA — use "[DATA DE INÍCIO: ____/____/______]" se não fornecida
4. Multa de mora máxima 3% ao mês conforme Lei n.º 19/2013, art. 22.º
5. Aviso prévio de rescisão: mínimo 30 dias (arrendamento ≤ 1 ano) ou 60 dias (> 1 ano), nos termos do art. 34.º
6. Cláusulas em MAIÚSCULAS e NEGRITO, numeradas

ESTRUTURA OBRIGATÓRIA:

---

# CONTRATO DE ARRENDAMENTO ${data.tipoImovel.toUpperCase()}

**ENTRE:**

**SENHORIO:** ${data.proprietario}, portador(a) do Bilhete de Identidade n.º ________________, residente em ________________________________, doravante designado(a) **"Senhorio"**;

**E**

**INQUILINO:** ${data.locatario}, portador(a) do Bilhete de Identidade n.º ________________, residente em ________________________________, doravante designado(a) **"Inquilino"**;

Celebram, de mútuo acordo e boa-fé, o presente Contrato de Arrendamento, que se rege pelas seguintes cláusulas e pelas disposições da Lei n.º 19/2013, de 23 de Setembro, e do Código Civil de Moçambique:

---

## **CLÁUSULA 1.ª — OBJECTO**

1.1 O Senhorio cede ao Inquilino, para uso exclusivo como ${data.tipoImovel}, o imóvel sito em **${data.local}**, composto por ________________________________ (descrever: n.º de divisões, características).

1.2 O imóvel destina-se exclusivamente a fins **${data.tipoImovel.includes('Comercial') || data.tipoImovel.includes('Escritório') || data.tipoImovel.includes('Loja') ? 'comerciais/profissionais' : 'habitacionais'}**, sendo expressamente proibida a sublocação ou alteração de finalidade sem autorização escrita do Senhorio, nos termos do artigo 14.º da Lei n.º 19/2013.

---

## **CLÁUSULA 2.ª — PRAZO**

2.1 O presente contrato tem início em **[DATA DE INÍCIO: ____/____/______]** e vigorará pelo período de **${data.duracao}**, findando em **[DATA DE TÉRMINO: ____/____/______]**.

2.2 Findo o prazo, o contrato renovar-se-á automaticamente por iguais períodos, salvo comunicação escrita de não renovação com antecedência mínima de **${data.duracao === '6 meses' ? '30 (trinta)' : '60 (sessenta)'} dias**, conforme artigo 34.º da Lei n.º 19/2013.

---

## **CLÁUSULA 3.ª — RENDA E CONDIÇÕES DE PAGAMENTO**

3.1 A renda mensal é fixada em **${parseInt(data.valor || 0).toLocaleString('pt-MZ')} MZN (${_numPorExtenso(data.valor)} meticais)**, devida até ao dia **5 (cinco)** de cada mês.

3.2 O pagamento será efectuado por [M-Pesa / transferência bancária / dinheiro] para a conta/número: ________________________________.

3.3 Em caso de mora no pagamento, o Inquilino pagará ao Senhorio uma multa de **3% (três por cento)** sobre o valor em dívida por cada mês de atraso, nos termos do artigo 22.º da Lei n.º 19/2013, sem prejuízo de juros legais.

3.4 A renda poderá ser actualizada anualmente de acordo com o índice de inflação oficial publicado pelo INE — Instituto Nacional de Estatística de Moçambique, com pré-aviso de 30 dias.

---

## **CLÁUSULA 4.ª — CAUÇÃO**

4.1 O Inquilino entrega ao Senhorio, a título de caução, o montante de **${data.caucao}**, correspondente a _____ meses de renda, no acto da assinatura deste contrato.

4.2 A caução destina-se a garantir o cumprimento das obrigações contratuais, incluindo reparação de danos causados ao imóvel além do desgaste normal.

4.3 A caução será devolvida no prazo máximo de **30 (trinta) dias** após a entrega das chaves e verificação do estado do imóvel, deduzidos eventuais danos, rendas em atraso ou despesas de recuperação, nos termos do artigo 25.º da Lei n.º 19/2013.

---

## **CLÁUSULA 5.ª — OBRIGAÇÕES DO SENHORIO**

O Senhorio obriga-se a:

a) Entregar o imóvel em boas condições de habitabilidade e com todos os equipamentos em funcionamento;
b) Assegurar o gozo pacífico do imóvel pelo Inquilino durante o período contratual;
c) Realizar as obras de conservação estrutural necessárias para manter o imóvel em boas condições;
d) Não proceder a vistoria do imóvel sem aviso prévio de 48 horas, salvo em caso de emergência;
e) Cumprir as obrigações fiscais relativas às rendas recebidas, nos termos da legislação tributária moçambicana.

---

## **CLÁUSULA 6.ª — OBRIGAÇÕES DO INQUILINO**

O Inquilino obriga-se a:

a) Pagar a renda no prazo e local acordados;
b) Usar o imóvel exclusivamente para o fim estipulado na Cláusula 1.ª;
c) Conservar o imóvel, efectuando as reparações de pequena conservação a seu cargo;
d) Não realizar obras de transformação sem autorização escrita do Senhorio;
e) Não sublocar, ceder ou transferir, no todo ou em parte, o uso do imóvel sem autorização;
f) Permitir ao Senhorio a realização de obras urgentes, mediante pré-aviso;
g) Entregar o imóvel nas mesmas condições em que o recebeu, salvo desgaste normal de uso.

**Condições especiais acordadas:** ${data.condicoes || 'Nenhuma condição especial além das estabelecidas por lei.'}

---

## **CLÁUSULA 7.ª — RESCISÃO**

7.1 **Por iniciativa do Inquilino:** Mediante comunicação escrita ao Senhorio com antecedência mínima de **${data.duracao === '6 meses' ? '30' : '60'} (${data.duracao === '6 meses' ? 'trinta' : 'sessenta'}) dias**, nos termos do artigo 35.º da Lei n.º 19/2013.

7.2 **Por iniciativa do Senhorio:** Nas condições previstas no artigo 36.º da Lei n.º 19/2013, nomeadamente: falta de pagamento de renda por período superior a 60 dias; uso indevido do imóvel; realização de obras não autorizadas; subarrendamento não autorizado.

7.3 Em caso de rescisão com justa causa imputável ao Inquilino, este perderá o direito à devolução da caução, sem prejuízo de indemnização por danos adicionais.

---

## **CLÁUSULA 8.ª — RESOLUÇÃO DE CONFLITOS E FORO**

8.1 As partes comprometem-se a resolver amigavelmente quaisquer litígios emergentes do presente contrato.

8.2 Não sendo possível a resolução amigável, as partes poderão recorrer à mediação nos termos da Lei n.º 7/2015, de 6 de Outubro.

8.3 Para os litígios que não possam ser resolvidos por mediação, fica eleito o **Tribunal Judicial de Distrito de ${data.local?.includes('Maputo') ? 'KaMpfumo' : data.local?.includes('Matola') ? 'Matola' : data.local?.split(',')[0] || 'Maputo'}**, com renúncia expressa de qualquer outro.

---

## **CLÁUSULA 9.ª — DISPOSIÇÕES FINAIS**

9.1 O presente contrato é celebrado em dois exemplares de igual valor, ficando um na posse de cada parte.

9.2 Tudo o que não estiver expressamente previsto neste contrato reger-se-á pela Lei n.º 19/2013, de 23 de Setembro, e pelo Código Civil de Moçambique.

9.3 A nulidade de qualquer cláusula não afecta a validade das restantes, que subsistirão em pleno vigor.

---

**${data.local?.split(',').pop()?.trim() || 'Maputo'}, ______ de __________________ de ________**

| | |
|---|---|
| **O SENHORIO** | **O INQUILINO** |
| ${data.proprietario} | ${data.locatario} |
| BI: ________________ | BI: ________________ |
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
*Reconhecimento de assinaturas recomendado para contratos com renda superior a 50.000 MZN/mês ou duração superior a 12 meses.*`,

      procuracao: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        return `Você é advogado especialista em direito civil moçambicano. Redija uma PROCURAÇÃO / MANDATO juridicamente válida e completa.

BASE LEGAL OBRIGATÓRIA:
- Código Civil de Moçambique, artigos 262.º a 294.º (Representação e Procuração)
- Código do Notariado de Moçambique (Decreto n.º 47619, de 31 de Março de 1967, com alterações)
- Lei n.º 4/2013, de 22 de Fevereiro (Lei do Notariado — reconhecimento de assinaturas)
- Para procurações bancárias: Aviso n.º 01/GBM/2017 do Banco de Moçambique

DADOS:
- Tipo: ${data.tipoProc}
- Outorgante: ${data.outorgante} | BI: ${data.biOutorgante}
- Procurador/Mandatário: ${data.procurador} | BI: ${data.biProcurador}
- Poderes/Acto: ${data.acto}
- Validade: ${data.validade}
- Local: ${data.local}${ocrBlock}

REGRAS CRÍTICAS:
1. O documento DEVE ter conteúdo completo e não pode ser gerado em branco
2. NUNCA use "[a preencher]" nos campos obrigatórios — use os dados fornecidos
3. Para procuração especial: descreva os poderes com MÁXIMA especificidade
4. Para procuração geral: liste EXPLICITAMENTE os actos autorizados E os excluídos
5. Inclua SEMPRE cláusula de sub-mandato (se é permitido ou não)
6. O reconhecimento notarial é OBRIGATÓRIO para actos que envolvam imóveis ou valores > 100.000 MZN

ESTRUTURA OBRIGATÓRIA — ESCREVA O DOCUMENTO COMPLETO AGORA:

---

# PROCURAÇÃO ${data.tipoProc.toUpperCase()}

**OUTORGANTE (quem dá o poder):**
Eu, **${data.outorgante}**, portador(a) do Bilhete de Identidade n.º **${data.biOutorgante}**, [nacionalidade moçambicana/outra], residente em ________________________________, no pleno uso das minhas faculdades civis e jurídicas,

**NOMEIO E CONSTITUO MEU PROCURADOR/MANDATÁRIO:**

**${data.procurador}**, portador(a) do Bilhete de Identidade n.º **${data.biProcurador}**, residente em ________________________________,

**CONFERINDO-LHE OS SEGUINTES PODERES:**

${data.tipoProc === 'Geral (todos os actos)' ? `**PODERES GERAIS:**
Para em meu nome e representação praticar todos os actos de administração ordinária e extraordinária, incluindo, mas não se limitando a:

1. Representar-me perante quaisquer entidades públicas e privadas, incluindo ministérios, repartições, tribunais, bancos, seguradoras e serviços notariais;
2. Assinar contratos, acordos e documentos de qualquer natureza;
3. Receber e dar quitação de quaisquer quantias que me sejam devidas;
4. Gerir contas bancárias, efectuar depósitos, levantamentos e transferências;
5. Representar-me em processos administrativos e judiciais;
6. Praticar quaisquer actos necessários à prossecução dos meus interesses.

**PODERES EXCLUÍDOS (o procurador NÃO pode):**
- Alienar, hipotecar ou onerar bens imóveis sem nova procuração específica;
- Contrair empréstimos em meu nome acima de [valor];
- Fazer doações em meu nome;
- Nomear sub-procuradores.` :
`**PODERES ESPECIAIS PARA:**
${data.acto}

O mandatário fica expressamente autorizado a:
1. Praticar todos os actos necessários à concretização do objectivo acima descrito;
2. Assinar todos os documentos necessários, incluindo declarações, requerimentos, contratos e recibos;
3. Representar-me perante as entidades competentes para o efeito;
4. Receber e dar quitação de valores directamente relacionados com o mandato.

**O mandatário NÃO está autorizado a:**
- Praticar actos que extravasem o objeto específico deste mandato;
- Nomear sub-procuradores sem autorização escrita;
- Efectuar actos a título gratuito em meu nome.`}

**VALIDADE:** A presente procuração é válida por **${data.validade}** a contar da data de assinatura${data.validade === 'Até revogação' || data.validade === 'Indeterminada' ? ', podendo ser revogada a qualquer momento mediante comunicação escrita ao mandatário' : ''}.

**SUB-MANDATO:** O mandatário [pode / não pode — escolha conforme o caso] substabelecer os poderes aqui conferidos, no todo ou em parte.

Esta procuração é outorgada nos termos dos artigos 262.º e seguintes do Código Civil de Moçambique.

---

**${data.local}, ${dataFmt}**

| | |
|---|---|
| **O OUTORGANTE** | **O PROCURADOR** |
| ${data.outorgante} | ${data.procurador} |
| BI: ${data.biOutorgante} | BI: ${data.biProcurador} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Aceite e assinatura)* |

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |

---

**RECONHECIMENTO NOTARIAL** *(obrigatório para actos sobre imóveis e valores superiores a 100.000 MZN)*

Reconheço a assinatura aposta neste documento como sendo do próprio punho de **${data.outorgante}**, nos termos da Lei n.º 4/2013, de 22 de Fevereiro.

**Notário/Conservador:** ___________________________ | **Data:** ___/___/______
**Livro n.º:** _______ | **Folha:** _______ | **Verba n.º:** _______
**Selo:** [espaço para selo notarial]`;
      },

      requerimento: () => {
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        return `Redija um REQUERIMENTO OFICIAL completo e juridicamente estruturado para repartição pública em Moçambique.

DADOS:
- Entidade destinatária: ${data.entidade}
- Assunto: ${data.assunto}
- Requerente: ${data.remetente} | BI n.º: ${data.bi} | Tel: ${data.contacto}
- Endereço do requerente: ${data.endereco}
- Fundamento do pedido: ${data.fundamento}
- Documentos anexos: ${data.anexos || 'Ver lista abaixo'}${ocrBlock}

ESTRUTURA LEGAL MOÇAMBICANA OBRIGATÓRIA:

Exmo(a). Sr(a). [Cargo e nome do responsável, ex: Director(a) dos Serviços de...]
${data.entidade}
[Cidade]

**ASSUNTO: ${data.assunto.toUpperCase()}**

**N.º de Processo:** ___/____/____ *(a preencher pela repartição)*

Eu, **${data.remetente}**, portador(a) do Bilhete de Identidade n.º **${data.bi}**, residente em **${data.endereco}**, contacto **${data.contacto}**, nos termos da legislação moçambicana em vigor, venho, respeitosamente, expor e requerer o seguinte:

**I. EXPOSIÇÃO DOS FACTOS**

[Parágrafo 1 — Contextualização (4-5 linhas): apresenta quem é o requerente, a sua situação actual e o contexto que motiva o pedido. Seja específico e factual.]

[Parágrafo 2 — Necessidade e justificação (4-5 linhas): explica com precisão por que é necessário o que está a pedir, quais as consequências de não obter o pedido, e como isso afecta os seus direitos ou obrigações legais.]

[Parágrafo 3 — Fundamento legal (3-4 linhas): cita a base legal aplicável — por exemplo, "ao abrigo do disposto no artigo [X] da Lei n.º [Y]/[ano], de [data]" — ou fundamenta no direito administrativo geral.]

**II. DO PEDIDO**

Face ao exposto, e nos termos legais aplicáveis, vem o(a) requerente REQUERER a V.ª Ex.ª que se digne:

1. [Pedido principal específico e concreto — use linguagem formal: "...determinar", "...autorizar", "...emitir", "...deferir"]
2. [Pedido secundário, se aplicável]
3. Que seja notificado(a) do resultado do presente requerimento através do contacto ${data.contacto} ou por escrito no endereço acima indicado.

**III. ANEXOS**

Junta-se ao presente requerimento os seguintes documentos:

${data.anexos ? data.anexos.split(/[,;]/).map((a, i) => (i+1) + '. ' + a.trim()).join('\n') : '1. Cópia do Bilhete de Identidade\n2. [Outros documentos relevantes]'}

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
        return `Você é advogado especialista em direito comercial moçambicano. Redija um CONTRATO DE PRESTAÇÃO DE SERVIÇOS juridicamente válido e completo.

BASE LEGAL OBRIGATÓRIA:
- Código Civil de Moçambique, artigos 1154.º a 1156.º (Contrato de Prestação de Serviços)
- Lei n.º 3/1993, de 24 de Junho (Lei das Actividades Comerciais)
- Código do Trabalho de Moçambique (Lei n.º 23/2007, de 1 de Agosto) — para distinção prestação/emprego
- Lei n.º 32/2007, de 31 de Dezembro (Sistema Tributário — IVA 16%)
- Lei n.º 7/2015, de 6 de Outubro (Mediação e Arbitragem)

DADOS:
- Serviço: ${data.servico}
- Prestador: ${data.prestador} | NUIT: ${data.nuitPrestador || 'N/A'}
- Cliente: ${data.cliente} | BI: ${data.biCliente || 'N/A'}
- Valor total: ${valorNum.toLocaleString('pt-MZ')} MZN | Pagamento: ${data.pagamento}
- Prazo: ${data.prazo} dias
- Descrição: ${data.descricao}
- Penalidades: ${data.penalidades || '1% do valor por dia de atraso'}${ocrBlock}

---

# CONTRATO DE PRESTAÇÃO DE SERVIÇOS

**ENTRE AS PARTES:**

**PRESTADOR:** ${data.prestador}, portador(a) do BI/NUIT n.º **${data.nuitPrestador || '____________________'}**, com sede/domicílio em ________________________________, doravante designado(a) **"Prestador"**;

**E**

**CLIENTE:** ${data.cliente}, portador(a) do Bilhete de Identidade n.º **${data.biCliente || '____________________'}**, residente em ________________________________, doravante designado(a) **"Cliente"**;

Celebram, nos termos dos artigos 1154.º e seguintes do Código Civil de Moçambique, o presente Contrato de Prestação de Serviços, sujeito às seguintes cláusulas:

---

## **CLÁUSULA 1.ª — OBJECTO**

1.1 O Prestador obriga-se a prestar ao Cliente os seguintes serviços: **${data.servico}**.

1.2 **Descrição detalhada:** ${data.descricao}

1.3 O âmbito do serviço inclui especificamente: [listar materiais, equipamentos, software, deliverables concretos incluídos].

1.4 Estão expressamente **excluídos** do presente contrato: [listar o que não está incluído].

---

## **CLÁUSULA 2.ª — PRAZO DE EXECUÇÃO**

2.1 O serviço terá início em **____/____/______** e deverá estar concluído no prazo de **${data.prazo} (${data.prazo} dias úteis)**, até **____/____/______**.

2.2 O prazo poderá ser prorrogado por acordo escrito das partes, mediante justificação fundamentada apresentada com antecedência mínima de **5 (cinco) dias úteis**.

2.3 Consideram-se causas de força maior, suspensivas do prazo: catástrofes naturais, greve geral, pandemia declarada, ou outros factos alheios à vontade do Prestador.

---

## **CLÁUSULA 3.ª — PREÇO E CONDIÇÕES DE PAGAMENTO**

3.1 O preço total pelos serviços é de **${valorNum.toLocaleString('pt-MZ')} MZN (${_numPorExtenso(data.valorTotal)} meticais)**, ${data.iva === 'Sim' ? `acrescido de IVA à taxa de 16% (dezasseis por cento), nos termos da Lei n.º 32/2007, totalizando **${(valorNum * 1.16).toLocaleString('pt-MZ')} MZN**` : 'isento de IVA'}.

3.2 **Condições de pagamento:** ${data.pagamento}.

3.3 Os pagamentos serão efectuados por [M-Pesa / transferência bancária / cheque] para: ________________________________.

3.4 Em caso de atraso no pagamento, o Cliente pagará ao Prestador uma penalidade de **${data.penalidades || '1% (um por cento) do valor em dívida por cada dia de atraso'}**, sem prejuízo de juros legais nos termos do Código Civil.

3.5 O não pagamento no prazo convencionado por período superior a **15 (quinze) dias** constitui fundamento para suspensão imediata dos serviços pelo Prestador.

---

## **CLÁUSULA 4.ª — OBRIGAÇÕES DO PRESTADOR**

O Prestador obriga-se a:

a) Executar os serviços com diligência, competência técnica e dentro dos prazos acordados;
b) Utilizar materiais/equipamentos de qualidade adequada à natureza do serviço;
c) Manter confidencialidade sobre informações do Cliente a que aceda no exercício do mandato;
d) Comunicar imediatamente ao Cliente qualquer impedimento que possa comprometer o prazo ou qualidade;
e) Garantir os serviços prestados pelo prazo de **[90 dias / 6 meses / 1 ano — conforme a natureza]** após a entrega;
f) Cumprir todas as normas legais e regulamentares aplicáveis à actividade.

---

## **CLÁUSULA 5.ª — OBRIGAÇÕES DO CLIENTE**

O Cliente obriga-se a:

a) Efectuar os pagamentos nos prazos e condições acordados;
b) Fornecer ao Prestador todas as informações, documentos e acessos necessários à execução do serviço;
c) Designar um responsável para acompanhamento e aprovação das etapas do trabalho;
d) Proceder à vistoria/teste do serviço entregue no prazo de **5 (cinco) dias úteis**; findo este prazo sem reclamação, o serviço considera-se aceite;
e) Não divulgar a terceiros informações confidenciais do Prestador.

---

## **CLÁUSULA 6.ª — PROPRIEDADE INTELECTUAL**

6.1 Todos os trabalhos, obras e criações produzidos no âmbito deste contrato são, após pagamento integral, propriedade do **Cliente**, incluindo direitos de utilização, reprodução e modificação.

6.2 O Prestador poderá referenciar o trabalho no seu portfólio salvo indicação contrária escrita do Cliente.

---

## **CLÁUSULA 7.ª — RESCISÃO**

7.1 Qualquer das partes pode rescindir o contrato mediante aviso prévio escrito de **15 (quinze) dias**.

7.2 Em caso de rescisão pelo Cliente antes da conclusão, o Prestador tem direito ao pagamento proporcional ao trabalho executado, acrescido de **15% (quinze por cento)** a título de indemnização.

7.3 Em caso de rescisão por incumprimento do Prestador, o Cliente tem direito à devolução dos valores pagos referentes ao trabalho não executado, acrescido de indemnização por danos comprovados.

---

## **CLÁUSULA 8.ª — RESOLUÇÃO DE CONFLITOS E FORO**

8.1 As partes comprometem-se a resolver amigavelmente quaisquer divergências no prazo de **15 dias**.

8.2 Não sendo possível, recorrerão à mediação nos termos da Lei n.º 7/2015, de 6 de Outubro.

8.3 Para litígios não resolvidos por mediação, fica eleito o **Tribunal Judicial de Comarca de Maputo**, com renúncia a qualquer outro.

---

**${data.local || 'Maputo'}, ${dataFmt}**

| | |
|---|---|
| **O PRESTADOR** | **O CLIENTE** |
| ${data.prestador} | ${data.cliente} |
| NUIT: ${data.nuitPrestador || '___________'} | BI: ${data.biCliente || '___________'} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |`;
      },

      recibo: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const valorNum = parseFloat(data.valor || 0);
        const temIva   = data.iva === 'Sim';
        const subtotal = temIva ? valorNum / 1.16 : valorNum;
        const ivaValor = temIva ? valorNum - subtotal : 0;
        const numDoc   = Math.floor(Math.random() * 9000) + 1000;
        return `Você é contabilista experiente em Moçambique. Elabore um ${(data.tipoDoc || 'RECIBO').toUpperCase()} formal e juridicamente válido.

BASE LEGAL:
- Lei n.º 32/2007 (Sistema Tributário — IVA 16%)
- Decreto n.º 14/2015 (Regulamento do IVA em Moçambique)
- Lei n.º 20/2013 (Lei das Finanças Públicas — obrigação de facturação)
- Circular n.º 8/AT/2016 (Autoridade Tributária — requisitos de factura)

DADOS:
- Tipo: ${data.tipoDoc} | N.º: ${numDoc}
- Emitente: ${data.emitente} | NUIT: ${data.nuitEmitente || 'N/A'}
- Cliente: ${data.cliente} | BI: ${data.biCliente || 'N/A'}
- Descrição: ${data.descricao}
- Valor: ${valorNum.toLocaleString('pt-MZ')} MZN | IVA: ${data.iva}
- Pagamento: ${data.pagamento}
- Local/Data: ${data.local || dataFmt}${ocrBlock}

DOCUMENTO COMPLETO:

---

# ${(data.tipoDoc || 'RECIBO').toUpperCase()} N.º ${numDoc}/${new Date().getFullYear()}

| | |
|---|---|
| **Emitente:** | **${data.emitente}** |
| **NUIT:** | ${data.nuitEmitente || 'N/A'} |
| **Endereço:** | ________________________________ |
| **Telefone:** | ________________________________ |
| **Email:** | ________________________________ |

---

**CLIENTE / COMPRADOR:**

| Campo | Dados |
|---|---|
| Nome | ${data.cliente} |
| BI/NUIT | ${data.biCliente || 'N/A'} |
| Endereço | ________________________________ |

---

## Descrição dos Bens / Serviços

| N.º | Descrição | Qtd. | Preço Unit. (MZN) | Total (MZN) |
|---|---|---|---|---|
${data.descricao.split(/[,;\n]/).map((item, i) => `| ${i+1} | ${item.trim()} | 1 | [valor] | [valor] |`).join('\n')}
| | | | **Subtotal** | **${subtotal.toLocaleString('pt-MZ', {minimumFractionDigits:2})}** |
${temIva ? `| | | | **IVA (16%)** | **${ivaValor.toLocaleString('pt-MZ', {minimumFractionDigits:2})}** |` : '| | | | *Isento de IVA* | *—* |'}
| | | | **TOTAL GERAL** | **${valorNum.toLocaleString('pt-MZ', {minimumFractionDigits:2})} MZN** |

**Por extenso:** ${_numPorExtenso(data.valor)} meticais ${temIva ? '(incluindo IVA)' : ''}

---

**Forma de pagamento:** ${data.pagamento}
**Estado:** ${data.pagamento === 'A prazo' ? '⏳ A Pagar' : '✅ Pago'}

${data.tipoDoc?.toLowerCase().includes('recibo') ? `---

**DECLARAÇÃO DE RECEBIMENTO:**

Eu, **${data.emitente}**, portador(a) do NUIT **${data.nuitEmitente || '____________________'}**, DECLARO ter recebido do(a) Sr(a). **${data.cliente}** a quantia de **${valorNum.toLocaleString('pt-MZ', {minimumFractionDigits:2})} MZN (${_numPorExtenso(data.valor)} meticais)**, referente a: ${data.descricao}.

**${data.local || 'Maputo'}, ${dataFmt}**

_________________________________________
**${data.emitente}**
*(Assinatura e carimbo)*` : ''}

---

*Documento emitido nos termos da Lei n.º 20/2013 e Circular n.º 8/AT/2016 da Autoridade Tributária de Moçambique.*
*${temIva ? 'IVA incluído à taxa de 16%, conforme Lei n.º 32/2007.' : 'Operação isenta de IVA.'}*`;
      },

      recomendacao: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        return `Você é ${data.recomendador}, ${data.cargoRec} na ${data.entidadeRec}. Redija uma CARTA DE RECOMENDAÇÃO formal, específica e convincente.

DADOS:
- Tipo: ${data.tipoRec}
- Recomendado: ${data.recomendado} | Para: ${data.cargoRecm}
- Relação: ${data.relacao}
- Qualidades a destacar: ${data.qualidades}
- Destinatário: ${data.destinatario || 'A quem possa interessar'}${ocrBlock}

REGRAS CRÍTICAS:
1. CADA qualidade com EXEMPLO CONCRETO — "demostrou liderança quando [situação real]"
2. NUNCA: "pessoa dedicada", "trabalha em equipa" sem contexto específico
3. A conclusão deve ser RECOMENDAÇÃO EXPLÍCITA E INCONDICIONAL
4. Tom: caloroso mas credível — entusiasta mas não exagerado

DOCUMENTO COMPLETO:

---

**${data.recomendador}**
${data.cargoRec} — ${data.entidadeRec}
📞 [contacto] | ✉️ [email]

${dataFmt}

${data.destinatario || 'A quem possa interessar'}

**Assunto: Carta de Recomendação — ${data.recomendado}**

Exmo(a). Sr(a),

**[PARÁGRAFO 1 — CREDENCIAL DO RECOMENDADOR]**
Sou ${data.recomendador}, ${data.cargoRec} na ${data.entidadeRec} há [X] anos, com responsabilidade sobre [área específica]. Nesta qualidade, tive a oportunidade de trabalhar directamente com ${data.recomendado} no contexto de ${data.relacao}.

**[PARÁGRAFO 2 — CONTEXTO DA RELAÇÃO]**
Conheci ${data.recomendado} em [mês/ano] quando [descreva o contexto específico: projecto, equipa, curso]. Durante [período], trabalhamos [diariamente / frequentemente] em [tipo de trabalho], o que me permitiu observar de perto as suas capacidades técnicas e humanas.

**[PARÁGRAFO 3 — DESEMPENHO COM EXEMPLOS CONCRETOS]**
No que respeita às qualidades de "${data.qualidades}", posso afirmar com base em factos concretos: [descreva 2-3 situações específicas em que o recomendado demonstrou cada qualidade mencionada, com resultados mensuráveis. Ex: "No projecto X, ${data.recomendado} liderou uma equipa de Y pessoas, entregou Z resultado em W semanas, superando a expectativa em A%"].

**[PARÁGRAFO 4 — REALIZAÇÕES E IMPACTO]**
Uma realização que ilustra bem o perfil de ${data.recomendado} foi [descreva um projecto, iniciativa ou situação específica com impacto mensurável na ${data.entidadeRec} ou na equipa].

**[PARÁGRAFO 5 — RECOMENDAÇÃO EXPLÍCITA]**
Recomendo **${data.recomendado} sem reservas** para o cargo/função de **${data.cargoRecm}**. Tenho plena confiança de que trará contribuições significativas e que irá superar as expectativas da vossa organização. Se precisar de informação adicional, estou disponível no contacto acima.

Com os melhores cumprimentos,

_________________________________________
**${data.recomendador}**
${data.cargoRec}
${data.entidadeRec}
[Contacto directo]`;
      },

      planonegocio: () => {
        const anoActual = new Date().getFullYear();
        return `Elabore um PLANO DE NEGÓCIOS PROFISSIONAL para o seguinte empreendimento em Moçambique.

DADOS DO NEGÓCIO:
- Nome: ${data.nomeNegocio} | Sector: ${data.sector}
- Proprietário: ${data.proprietario} | Local: ${data.local}
- Descrição: ${data.descricao}
- Investimento inicial: ${data.investimento} MZN
- Clientes-alvo: ${data.clientes}
- Concorrência e diferencial: ${data.concorrencia || 'A definir pelo proprietário'}
- Prazo de retorno esperado: ${data.retorno}${ocrBlock}

REGRAS DE QUALIDADE OBRIGATÓRIAS:
1. NUNCA use frases genéricas: "uma das principais marcas", "crescimento sustentável e rentável", "qualidade e inovação" — estas são proibidas
2. CADA secção deve ser específica ao negócio "${data.nomeNegocio}" — nunca genérica
3. Se um dado não foi fornecido, apresenta campo "[A preencher pelo empreendedor]" — NUNCA inventa valores
4. Projectões financeiras: se não há dados de base, apresenta tabela com fórmulas e instruções de preenchimento
5. Use dados reais do mercado moçambicano ${anoActual} (inflação, taxa de câmbio, tendências do sector ${data.sector})
6. Sem repetições — cada secção traz informação NOVA e ESPECÍFICA

ESTRUTURA OBRIGATÓRIA (use ---PAGE_BREAK--- entre cada secção principal):

---PAGE_BREAK---
# ${data.nomeNegocio}
**Plano de Negócios ${anoActual}**

---PAGE_BREAK---
## Índice

1. Resumo Executivo .................................................. 3
2. Descrição do Negócio .............................................. 4
3. Análise de Mercado ................................................. 5
4. Plano de Marketing ................................................. 6
5. Plano Operacional .................................................. 7
6. Plano Financeiro ................................................... 8
7. Equipa e Estrutura ................................................. 9
8. Riscos e Mitigação ................................................. 10
9. Conclusão e Pedido de Apoio ........................................ 11

---PAGE_BREAK---
## 1. Resumo Executivo

[Escreve 3-4 parágrafos concisos e específicos sobre "${data.nomeNegocio}":
- Parágrafo 1: O que é o negócio, o que vende/oferece, em que contexto do sector ${data.sector} se insere em ${data.local}
- Parágrafo 2: Modelo de receita específico, proposta de valor diferenciada face à concorrência (${data.concorrencia || 'mercado local'})
- Parágrafo 3: Investimento de ${data.investimento} MZN — como será utilizado (percentagem por categoria)
- Parágrafo 4: Retorno esperado em ${data.retorno} com base nas condições do mercado moçambicano]

---PAGE_BREAK---
## 2. Descrição do Negócio

[Descreve em 4-5 parágrafos específicos:
- História e motivação: por que ${data.proprietario} criou este negócio, problema que resolve em ${data.local}
- Produtos/serviços: lista detalhada com preços de referência em MZN
- Modelo de operação: como funciona no dia-a-dia (horário, processos, equipa)
- Vantagem competitiva: o que torna ${data.nomeNegocio} diferente dos concorrentes em ${data.local}
- Fase actual e próximos passos nos primeiros 6 meses]

---PAGE_BREAK---
## 3. Análise de Mercado

[4 parágrafos específicos ao sector ${data.sector} em Moçambique:
- Tamanho do mercado: dados reais do INE ou Banco de Moçambique sobre o sector ${data.sector}
- Clientes-alvo: perfil detalhado de ${data.clientes} (localização, rendimento médio, comportamento de compra)
- Concorrência directa em ${data.local}: nomeia concorrentes reais se possível, analisa pontos fracos
- Tendências ${anoActual}-${anoActual+2}: oportunidades e ameaças específicas ao sector em Moçambique]

---PAGE_BREAK---
## 4. Plano de Marketing

[3-4 parágrafos + estratégia específica:
- Preços: tabela comparativa com concorrência, justificação da margem
- Canais de venda: presença física em ${data.local}, WhatsApp Business, M-Pesa, redes sociais — com plano de acção concreto
- Promoção: estratégia de captação dos primeiros 50 clientes (orçamento específico, canais, mensagem)
- Fidelização: como manter clientes recorrentes no contexto de ${data.local}]

---PAGE_BREAK---
## 5. Plano Operacional

[Descreve com detalhe:
- Localização e instalações: endereço exacto em ${data.local}, custos de renda/espaço
- Equipamentos e fornecedores: lista de equipamentos necessários com preços MZN, fornecedores locais preferidos
- Processos diários: fluxo de trabalho do negócio hora a hora
- Cadeia de abastecimento: de onde vêm os produtos/materiais, prazo de entrega, condições de pagamento]

---PAGE_BREAK---
## 6. Plano Financeiro

[Apresenta as seguintes tabelas com valores em MZN:]

### 6.1 Investimento Inicial — Total: ${data.investimento} MZN

| Item | Valor (MZN) | % do Total |
|---|---|---|
| Equipamentos | [A preencher] | [%] |
| Stock inicial | [A preencher] | [%] |
| Renda (3 meses) | [A preencher] | [%] |
| Marketing inicial | [A preencher] | [%] |
| Licenças e taxas | [A preencher] | [%] |
| Reserva de emergência | [A preencher] | [%] |
| **TOTAL** | **${data.investimento} MZN** | **100%** |

### 6.2 Projecção Financeira — 12 Meses

| Mês | Receita Prevista (MZN) | Custos Fixos (MZN) | Custos Variáveis (MZN) | Lucro/Prejuízo (MZN) |
|---|---|---|---|---|
| Mês 1 | [A preencher] | [A preencher] | [A preencher] | [Fórmula: Receita - Custos] |
| Mês 2-3 | [A preencher] | [A preencher] | [A preencher] | [A preencher] |
| Mês 4-6 | [A preencher] | [A preencher] | [A preencher] | [A preencher] |
| Mês 7-12 | [A preencher] | [A preencher] | [A preencher] | [A preencher] |

**Ponto de Equilíbrio:** [Calcule: Custos Fixos Mensais ÷ Margem de Contribuição (%)]
**Prazo de Retorno do Investimento:** ${data.retorno}

---PAGE_BREAK---
## 7. Equipa e Estrutura

[Descreve quem trabalha no negócio:
- ${data.proprietario}: função, experiência, dedicação (tempo integral/parcial)
- Outros colaboradores previstos: número, funções, custo mensal em MZN
- Organograma simples se aplicável
- Plano de formação se necessário]

---PAGE_BREAK---
## 8. Riscos e Mitigação

| Risco | Probabilidade | Impacto | Estratégia de Mitigação |
|---|---|---|---|
| Baixa procura inicial | [Alta/Média/Baixa] | Alto | [Acção específica] |
| Aumento de custos (inflação MZN) | Alta | Médio | Contratos de fornecimento a preço fixo; revisão trimestral |
| Concorrência agressiva | [A avaliar] | [A avaliar] | [Acção específica] |
| Problemas de liquidez | Média | Alto | Reserva de emergência de [X] MZN; crédito pré-aprovado |

---PAGE_BREAK---
## 9. Conclusão e Pedido de Apoio

[2-3 parágrafos:
- Síntese do potencial de ${data.nomeNegocio} para o mercado de ${data.local}
- Pedido específico: tipo de apoio/financiamento pretendido, valor, condições propostas
- Compromisso do empreendedor: o que oferece em troca (garantias, relatórios, transparência)]

Use dados realistas do mercado moçambicano ${anoActual}.`;
      },

      licenca: () => {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const leiMap = {
          'Licença Comercial (Alvará)': 'Lei n.º 3/1993, de 24 de Junho (Lei das Actividades Comerciais), Decreto n.º 43/2015 (Regulamento de Licenciamento Simplificado), Lei n.º 15/2013 (Lei do Ambiente — para actividades com impacto ambiental)',
          'Licença de Construção': 'Lei n.º 19/2007, de 18 de Julho (Lei de Ordenamento Territorial), Regulamento de Construção Urbana, Decreto n.º 23/2008 (Regulamento sobre o Processo Construtivo)',
          'Autorização de Evento': 'Lei n.º 7/2013 (Lei das Assembleias, Reuniões e Manifestações), Decreto Municipal aplicável da Câmara competente',
          'Licença de Transporte': 'Lei n.º 26/2006, de 23 de Agosto (Lei dos Transportes Terrestres), Decreto n.º 12/2010 (Regulamento dos Transportes)',
          'Licença Ambiental': 'Lei n.º 20/1997, de 1 de Outubro (Lei do Ambiente), Decreto n.º 54/2015 (Regulamento de Avaliação de Impacto Ambiental), Decreto n.º 25/2011',
        };
        const leiAplicavel = leiMap[data.tipoLicenca] || 'legislação municipal e nacional aplicável à actividade em causa';
        return `Você é jurista especialista em direito administrativo e licenciamento empresarial em Moçambique. Redija um PEDIDO DE LICENÇA formal, completo e juridicamente fundamentado.

BASE LEGAL: ${leiAplicavel}

DADOS:
- Tipo: ${data.tipoLicenca}
- Requerente: ${data.requerente} | NUIT: ${data.nuit} | Tel: ${data.contacto}
- Entidade: ${data.entidade}
- Objecto: ${data.objecto}
- Local: ${data.local}
- Documentos: ${data.documentos || 'listados abaixo'}${ocrBlock}

DOCUMENTO COMPLETO:

---

**${data.requerente}**
NUIT: ${data.nuit} | Tel: ${data.contacto}
${data.local}

${dataFmt}

**Exmo(a). Sr(a). Presidente / Director(a)**
${data.entidade}
[Cidade/Localidade]

**Assunto: PEDIDO DE ${data.tipoLicenca.toUpperCase()}**
**Ref.ª:** ___/______/[Serviço] *(a preencher pela entidade)*

---

Exmo(a). Sr(a),

**${data.requerente}**, com NUIT n.º **${data.nuit}**, com sede/domicílio em **${data.local}**, contacto **${data.contacto}**, vem, respeitosamente, nos termos da ${leiAplicavel.split(',')[0]}, REQUERER a V.ª Ex.ª a emissão de **${data.tipoLicenca}** para o exercício da seguinte actividade:

---

**I. IDENTIFICAÇÃO DO REQUERENTE E DA ACTIVIDADE**

O requerente exerce / pretende exercer a actividade de **${data.objecto}**, no local sito em **${data.local}**, tratando-se de [descrever: estabelecimento permanente / temporário / obra / evento], com início previsto em ____/____/______.

[Descreva em 3-4 linhas: dimensão do estabelecimento, número de trabalhadores previstos, capacidade, horário de funcionamento, impacto esperado na comunidade local.]

---

**II. FUNDAMENTAÇÃO LEGAL**

O presente pedido é apresentado ao abrigo do disposto na ${leiAplicavel}, sendo que:

1. A actividade em causa enquadra-se na categoria de [categoria legal específica];
2. O requerente reúne todas as condições técnicas, financeiras e legais exigidas pela legislação aplicável;
3. A instalação/actividade cumpre [ou cumprirá após vistoria] com todas as normas de segurança, higiene e ambiente em vigor.

---

**III. BENEFÍCIOS PARA A COMUNIDADE**

A concessão da presente licença contribuirá para:

a) Criação de [N] postos de trabalho directos e [N] indirectos na comunidade local;
b) Dinamização da economia do bairro/cidade de [localidade];
c) Prestação de [serviço/produto] que actualmente não existe ou é deficitário na área;
d) Aumento da base tributária municipal e nacional.

---

**IV. COMPROMISSOS DO REQUERENTE**

O requerente compromete-se a:

1. Cumprir rigorosamente todas as normas legais e regulamentares aplicáveis;
2. Obter todas as licenças e autorizações complementares que se revelem necessárias;
3. Permitir vistorias e inspecções pelas autoridades competentes;
4. Não iniciar a actividade antes da emissão da licença requerida;
5. Comunicar à entidade licenciadora qualquer alteração substancial das condições que fundamentam este pedido.

---

**V. DOCUMENTOS ANEXOS**

Junta-se ao presente pedido os seguintes documentos:

${data.documentos ? data.documentos.split(/[,;\n]/).map((d, i) => `${i+1}. ${d.trim()}`).join('\n') : `1. Cópia do Bilhete de Identidade / Certidão Comercial
2. Comprovativo de NUIT
3. Mapa de localização do estabelecimento/obra
4. Memória descritiva da actividade
5. [Outros conforme exigência específica da entidade]`}

---

**VI. PEDIDO**

Face ao exposto, vem o(a) requerente PEDIR a V.ª Ex.ª que se digne:

1. Analisar e **deferir** o presente pedido de ${data.tipoLicenca};
2. Emitir o respectivo documento de licenciamento/autorização;
3. Comunicar ao requerente o resultado através do contacto **${data.contacto}** ou por escrito no endereço indicado.

**Pede e aguarda deferimento.**

---

**${data.local?.split(',').pop()?.trim() || 'Maputo'}, ${dataFmt}**

_________________________________________
**${data.requerente}**
NUIT: ${data.nuit}
*(Assinatura e carimbo, se empresa)*

---

*Para uso dos serviços:*
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

    return (builders[type] || builders.trabalho)();
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