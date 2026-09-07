// assets/js/services/minutas/prestacao.js
// MINUTA FIXA — Contrato de Prestação de Serviços.
//
// NOTA IMPORTANTE: o gerador por IA actualmente activo para este serviço
// (services/prompts/prestacao.js) lê data.moradaPrestador e
// data.nuitPrestador — campos que NÃO EXISTEM no formulário real
// (ServiceDefinitions.js → prestacao.fields só tem: prestador, biPrest,
// cliente, biCliente, servico, valor, pagamento, inicio, prazo,
// penalidades, local). Isto produz "undefined" na cláusula de morada em
// TODO contrato gerado hoje por esse caminho. Esta minuta usa os campos
// REAIS do formulário e nunca interpola um valor sem verificar primeiro se
// existe.
import { formatMZN, numeroPorExtenso, dataHojeExtenso } from './_shared.js';

export function render(data = {}) {
  const prestador = data.prestador || '';
  const biPrest = data.biPrest || '';
  const cliente = data.cliente || '';
  const biCliente = data.biCliente || '';
  const servico = data.servico || '';
  const valor = parseFloat(data.valor || 0);
  const pagamento = data.pagamento || '';
  const inicio = data.inicio || '';
  const prazo = data.prazo || '';
  const penalidades = data.penalidades || '1% do valor total por dia de atraso';
  const local = data.local || `Maputo, ${dataHojeExtenso()}`;
  const foro = local.split(',')[0]?.trim() || 'Maputo';
  const inicioFrase = inicio ? `a partir de **${inicio}**` : 'a contar da data de assinatura deste contrato';

  return `---

# CONTRATO DE PRESTAÇÃO DE SERVIÇOS

**ENTRE:**

**PRESTADOR:** ${prestador}${biPrest ? ', BI n.º ' + biPrest : ''}, doravante designado **"Prestador"**;

**E**

**CLIENTE:** ${cliente}${biCliente ? ', portador(a) do BI/NUIT n.º ' + biCliente : ''}, doravante designado **"Cliente"**;

Celebram o presente Contrato de Prestação de Serviços nos termos dos artigos 1154.º e seguintes do Código Civil de Moçambique:

---

## **CLÁUSULA 1.ª — OBJECTO**

1.1 O Prestador obriga-se a realizar, de forma autónoma e independente, os seguintes serviços: **${servico}**.

1.2 Local de execução: **${local}**

---

## **CLÁUSULA 2.ª — PRAZO**

2.1 Os serviços serão executados no prazo de **${prazo}**, ${inicioFrase}.

2.2 Em caso de atraso imputável ao Prestador, este pagará ao Cliente uma penalidade de **${penalidades}**, até ao limite de 20% do valor total.

2.3 O prazo poderá ser prorrogado por acordo escrito entre as partes, em caso de força maior ou por solicitação justificada do Cliente.

---

## **CLÁUSULA 3.ª — PREÇO E CONDIÇÕES DE PAGAMENTO**

3.1 O valor total acordado é de **${formatMZN(valor)} MZN (${numeroPorExtenso(valor)} meticais)**.

3.2 Condições de pagamento: **${pagamento}**

3.3 O não pagamento nas datas acordadas confere ao Prestador o direito de suspender os serviços, sem penalidade, até regularização.

---

## **CLÁUSULA 4.ª — PROPRIEDADE INTELECTUAL E ENTREGÁVEIS**

4.1 Todos os entregáveis (ficheiros, relatórios, obras e quaisquer outros resultados) produzidos no âmbito deste contrato tornam-se propriedade exclusiva do **Cliente** após o pagamento integral do valor acordado.

4.2 Até ao pagamento integral, o Prestador mantém todos os direitos sobre os entregáveis e pode recusar a sua entrega.

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

8.2 Para os litígios que não possam ser resolvidos amigavelmente, fica eleito o **Tribunal Judicial de Distrito de ${foro}**, com renúncia expressa de qualquer outro foro.

---

## **CLÁUSULA 9.ª — DISPOSIÇÕES FINAIS**

9.1 O presente contrato é celebrado em dois exemplares de igual valor.

9.2 Qualquer alteração ao presente contrato só é válida se feita por escrito e assinada por ambas as partes.

---

**${local}**

| | |
|---|---|
| **O PRESTADOR** | **O CLIENTE** |
| ${prestador} | ${cliente} |
| BI: ${biPrest || '___________'} | BI/NUIT: ${biCliente || '___________'} |
| ___________________________ | ___________________________ |
| *(Assinatura e carimbo)* | *(Assinatura)* |`;
}
