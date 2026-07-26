// assets/js/services/prompts/planonegocio.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)

// ── Normalização de dados ───────────────────────────────────────────────
// CORRIGIDO (bug real, mesma classe do "[undefined]" da recomendacao.js —
// aqui pior, porque sem colchetes/fallback, "undefined" aparecia solto no
// meio do texto várias vezes). O formulário real (ServiceDefinitions.js →
// planonegocio.fields) usa nomeNegocio/setor/descricao/mercadoAlvo/
// concorrentes/modelo/investimento/previsaoRec/equipa/finalidade — mas este
// ficheiro lia data.formaJuridica, data.sector, data.proprietario,
// data.local, data.clientes, data.concorrencia, data.retorno e
// data.nTrabalhadores, NENHUM dos quais existe no formulário (a maioria SEM
// fallback `|| ''`), e nunca lia data.modelo nem data.finalidade (campos
// obrigatórios do formulário, ignorados). Correcções de fundo, não só de
// nomes:
//  - "retorno" (prazo de retorno) não é o mesmo que "previsaoRec" (previsão
//    de receita MENSAL) — passamos a pedir à IA para CALCULAR o prazo de
//    retorno a partir de investimento ÷ previsaoRec, em vez de usar um
//    campo que nunca existiu.
//  - "equipa" no formulário é texto livre (nomes/funções dos promotores),
//    não um número de trabalhadores — a tabela de folha salarial por
//    "nTrabalhadores" (sempre 1, porque o campo nunca existia) foi
//    substituída por uma secção que usa o texto real fornecido.
//  - "modelo" (como ganha dinheiro) e "finalidade" (para que serve o
//    plano — crédito bancário, concurso, incubadora...) passam a ser
//    usados, porque moldam o tom e a estrutura esperada do documento.
//  - "local" e "formaJuridica" não são recolhidos pelo formulário; usa-se
//    um valor por omissão sensato em vez de deixar "undefined".
function _normalize(data = {}) {
  return {
    nomeNegocio: data.nomeNegocio || '',
    sector:      data.sector      || data.setor       || '',
    descricao:   data.descricao   || '',
    clientes:    data.clientes    || data.mercadoAlvo  || '',
    concorrencia:data.concorrencia|| data.concorrentes || '',
    modelo:      data.modelo      || '',
    investimento:data.investimento|| 0,
    previsaoRec: data.previsaoRec || 0,
    equipa:      data.equipa      || '',
    finalidade:  data.finalidade  || '',
    local:       data.local       || 'Moçambique',
  };
}

export function buildPrompt(data, ocrBlock) {
        const anoActual = new Date().getFullYear();
        const d = _normalize(data);
        const inv  = parseInt(d.investimento || 0);
        const recMensal = parseInt(d.previsaoRec || 0);
        // Prazo de retorno CALCULADO (investimento ÷ receita mensal), em vez
        // de um campo "retorno" que nunca existiu no formulário.
        const prazoRetorno = (inv > 0 && recMensal > 0)
          ? `aproximadamente ${Math.ceil(inv / recMensal)} meses (${inv.toLocaleString('pt-MZ')} MZN ÷ ${recMensal.toLocaleString('pt-MZ')} MZN/mês)`
          : '[a calcular com base no investimento e na receita mensal projectada]';
        const temEquipa = !!(d.equipa && d.equipa.trim());
        return `Você é consultor sénior de negócios com experiência no mercado moçambicano. Elabore um PLANO DE NEGÓCIOS completo, credível e adequado para candidatura a financiamento bancário ou institucional em Moçambique.

DADOS:
- Nome do negócio: ${d.nomeNegocio}
- Sector: ${d.sector}
- Localização: ${d.local}
- Descrição: ${d.descricao}
- Modelo de receita (como ganha dinheiro): ${d.modelo}
- Investimento total necessário: ${inv.toLocaleString('pt-MZ')} MZN
- Previsão de receita mensal: ${recMensal ? recMensal.toLocaleString('pt-MZ') + ' MZN' : '[não indicada]'}
- Público-alvo: ${d.clientes}
- Concorrência e diferencial: ${d.concorrencia || 'a analisar'}
- Equipa / Promotores: ${d.equipa || '[não indicada]'}
- Finalidade do plano: ${d.finalidade || 'Candidatura a financiamento'}${ocrBlock}

REGRAS:
1. Use dados reais do mercado moçambicano ${anoActual} — taxas de juro BCI/BIM/Standard Bank ≈ 23-28% ao ano; inflação ≈ 5-7%; câmbio USD/MZN ≈ consultar BdM
2. Sugira uma forma jurídica adequada à escala e sector do negócio (ex: Empresário em Nome Individual para negócios pequenos; Sociedade por Quotas (Lda) — capital mínimo 20.000 MZN — para a maioria das PMEs; Sociedade Anónima (SA) — capital mínimo 2.000.000 MZN — apenas para operações de grande escala), justificando a escolha
3. Prazo de retorno do investimento: ${prazoRetorno}. Apresente este cálculo de forma clara na secção financeira
4. Equipa: ${temEquipa ? 'baseie a secção de Recursos Humanos na equipa/promotores fornecidos: "' + d.equipa + '" — estruture funções e, se fizer sentido, estime necessidade de colaboradores adicionais' : 'a equipa/promotores não foi indicada — assinale isso claramente e sugira uma estrutura mínima típica para este tipo de negócio, sem inventar nomes'}
5. Adapte o tom e a ênfase à finalidade do plano ("${d.finalidade || 'Candidatura a financiamento'}"): para candidatura a crédito bancário, enfatize garantias e capacidade de reembolso; para concurso de empreendedorismo, enfatize inovação e impacto; para incubadora, enfatize potencial de escala
6. Projecções financeiras: 3 anos, com cenário base e pessimista, partindo da receita mensal indicada (${recMensal ? recMensal.toLocaleString('pt-MZ') + ' MZN/mês' : 'a estimar com base no modelo de receita'})
7. Incluir análise SWOT com dados específicos do mercado de ${d.local} e do sector "${d.sector}"

ESTRUTURA OBRIGATÓRIA (formato profissional para banco/incubadora):

---

# PLANO DE NEGÓCIOS — ${d.nomeNegocio.toUpperCase()}

**${d.sector} | ${d.local} | ${anoActual}**
**Finalidade:** ${d.finalidade || 'Candidatura a financiamento'}

---

## 1. SUMÁRIO EXECUTIVO

[150-200 palavras: síntese do negócio, oportunidade de mercado, necessidade de financiamento (${inv.toLocaleString('pt-MZ')} MZN), prazo de retorno estimado (${prazoRetorno}), e o que torna este negócio viável em ${d.local}. NUNCA genérico — seja específico ao sector e localização.]

---

## 2. DESCRIÇÃO DO NEGÓCIO

### 2.1 Missão e Visão
**Missão:** [frase concisa sobre o propósito]
**Visão:** [onde quer estar em 3-5 anos]

### 2.2 Descrição Detalhada
${d.descricao}
[Expanda: o que exactamente vende/oferece, como funciona o processo de serviço/produção/venda]

### 2.3 Modelo de Receita
${d.modelo}
[Expanda como este modelo gera a receita mensal projectada]

### 2.4 Forma Jurídica Sugerida
[Sugira e justifique a forma jurídica mais adequada, conforme a REGRA 2 acima — capital mínimo, registo na Conservatória do Comércio, licenças necessárias para o sector "${d.sector}" em Moçambique, NUIT, alvará municipal]

---

## 3. ANÁLISE DE MERCADO

### 3.1 Mercado-Alvo
${d.clientes}
[Tamanho estimado do mercado em ${d.local}: quantas pessoas/empresas potencialmente, poder de compra, comportamento de consumo]

### 3.2 Análise da Concorrência
${d.concorrencia || '[Identificar 2-3 concorrentes directos e indirectos em ' + d.local + ']'}
[Para cada concorrente: preço, qualidade, localização, fraquezas que o negócio pode explorar]

### 3.3 Diferencial Competitivo
[O que torna ${d.nomeNegocio} diferente e preferível — seja específico, não genérico]

### 3.4 Análise SWOT

| | Favoráveis | Desfavoráveis |
|---|---|---|
| **Internos** | **Forças:** [3-4 pontos específicos ao negócio] | **Fraquezas:** [3-4 pontos honestos] |
| **Externos** | **Oportunidades:** [3-4 oportunidades reais do mercado de ${d.local} em ${anoActual}] | **Ameaças:** [riscos reais: inflação, concorrência, regulação] |

---

## 4. PLANO OPERACIONAL

### 4.1 Estrutura Operacional
[Como funciona o negócio dia-a-dia: horário, processo de atendimento, ciclo de compra/produção/venda/entrega]

### 4.2 Localização
**${d.local}** — [justificativa: proximidade ao cliente-alvo, custo, acessibilidade]

### 4.3 Equipa e Promotores
${d.equipa || '[Equipa não indicada — sugira uma estrutura mínima típica para este tipo e escala de negócio]'}
[Estruture funções e responsabilidades com base na informação acima; estime custos de folha salarial apenas se houver base suficiente para tal]

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

### 5.2 Receita Projectada e Retorno

| | Valor |
|---|---|
| Receita mensal projectada | ${recMensal ? recMensal.toLocaleString('pt-MZ') + ' MZN' : '[a estimar]'} |
| Prazo de retorno estimado | ${prazoRetorno} |

### 5.3 Projecções de Receita (3 anos)

| | Ano 1 | Ano 2 | Ano 3 |
|---|---|---|---|
| Receita bruta estimada (MZN) | | | |
| Custos operacionais (MZN) | | | |
| **Resultado líquido (MZN)** | | | |
| **Margem líquida (%)** | | | |

*Premissas: [crescimento de vendas conservador 10-15%/ano; inflação ${anoActual} ≈ 6%; taxa de juro bancária ≈ 25%/ano se aplicável]*

### 5.4 Ponto de Equilíbrio (Break-Even)
[Calcular: custos fixos mensais / margem de contribuição unitária = n.º de unidades/clientes necessários para cobrir custos]

---

## 6. GESTÃO DE RISCOS

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Inflação / depreciação do MZN | Alta | Alto | Ajuste trimestral de preços |
| Concorrência de novos entrantes | Média | Médio | Fidelização de clientes, qualidade |
| Inadimplência de clientes | Média | Alto | Pagamento adiantado / a pronto |
| [Risco específico do sector ${d.sector}] | | | |

---

## 7. CONCLUSÃO E PEDIDO

[Síntese do potencial do negócio em ${d.local}, a necessidade específica de ${inv.toLocaleString('pt-MZ')} MZN, o prazo de retorno esperado (${prazoRetorno}), e como isto serve a finalidade indicada ("${d.finalidade || 'Candidatura a financiamento'}").]

---

*Use dados realistas do mercado moçambicano ${anoActual}.*`;
}

export function buildDataBlock(data) {
  const d = _normalize(data);
  const num = (v) => parseInt(v || 0).toLocaleString('pt-MZ');
  return `- Negócio: ${d.nomeNegocio}  |  Sector: ${d.sector}  |  Local: ${d.local}
- Descrição: ${d.descricao}
- Modelo de receita: ${d.modelo}
- Investimento total: ${num(d.investimento)} MZN  |  Receita mensal projectada: ${num(d.previsaoRec)} MZN
- Público-alvo: ${d.clientes}
- Concorrência: ${d.concorrencia}
- Equipa / Promotores: ${d.equipa}
- Finalidade do plano: ${d.finalidade}

MAPEAMENTO DE PLACEHOLDERS:
{{NOME_NEGOCIO}} = ${d.nomeNegocio}
{{SECTOR}} = ${d.sector}
{{LOCAL}} = ${d.local}
{{ANO}} = ${new Date().getFullYear()}
{{INVESTIMENTO_TOTAL}} = ${num(d.investimento)} MZN
{{RECEITA_MENSAL}} = ${num(d.previsaoRec)} MZN
{{SUMARIO}} = sumário executivo do negócio (2-3 frases)
{{DESCRICAO_NEGOCIO}} = descrição detalhada: o que faz, como funciona, proposta de valor
{{MODELO_RECEITA}} = como o negócio ganha dinheiro, com base em: "${d.modelo}"
{{ANALISE_MERCADO}} = análise do mercado em ${d.local} para ${d.sector}: clientes-alvo ("${d.clientes}"), concorrência ("${d.concorrencia}"), oportunidades
{{ITEMS_FINANCEIROS}} = linhas <tr><td>componente</td><td>valor MZN</td></tr> (equipamento, stock, licenças, fundo de maneio...)
{{EQUIPA}} = estrutura organizacional com base em: "${d.equipa}"
{{RETORNO}} = prazo de retorno estimado a partir de investimento ÷ receita mensal, com análise de ponto de equilíbrio`;
}
