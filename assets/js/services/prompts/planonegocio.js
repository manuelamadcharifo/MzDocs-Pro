// assets/js/services/prompts/planonegocio.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
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
}

export function buildDataBlock(data) {
  const num = (v) => parseInt(v || 0).toLocaleString('pt-MZ');
  return `- Negócio: ${data.nomeNegocio || ''}  |  Forma jurídica: ${data.formaJuridica || ''}
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
{{RETORNO}} = projecção de retorno: ${data.retorno || ''} com análise de ponto de equilíbrio`;
}
