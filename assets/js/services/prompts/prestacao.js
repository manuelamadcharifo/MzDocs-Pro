// assets/js/services/prompts/prestacao.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
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
}

export function buildDataBlock(data) {
  const num = (v) => parseInt(v || 0).toLocaleString('pt-MZ');
  return `- Serviço: ${data.servico || ''}
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
  penalizações, propriedade intelectual, rescisão, foro competente`;
}
