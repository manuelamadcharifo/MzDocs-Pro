// assets/js/services/prompts/orcamento.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
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
}

export function buildDataBlock(data) {
  return `- Tipo de obra: ${data.tipoObra || ''}
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
{{TOTAL_GERAL}} = subtotal + imprevistos (valor final em MZN)`;
}
