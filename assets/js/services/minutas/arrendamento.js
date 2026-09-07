// assets/js/services/minutas/arrendamento.js
// MINUTA FIXA — Contrato de Arrendamento. Adaptado de
// services/prompts/arrendamento.js, que já era quase 100% determinístico
// (a IA só formatava dados já calculados em JS).
import { formatMZN, numeroPorExtenso, dataHojeExtenso } from './_shared.js';

export function render(data = {}) {
  const tipoImovel = data.tipoImovel || '';
  const isComercial = /comercial|escritório|loja/i.test(tipoImovel);
  const proprietario = data.proprietario || '';
  const biProprietario = data.biProprietario || '';
  const locatario = data.locatario || '';
  const biLocatario = data.biLocatario || '';
  const local = data.local || '';
  const valor = parseFloat(data.valor || 0);
  const metodoPagamento = data.metodoPagamento || '';
  const duracao = data.duracao || '';
  const caucao = data.caucao || '';
  const quemPagaServicos = data.quemPagaServicos || '';
  const condicoes = data.condicoes || '';
  const avisoPrazo = duracao === '6 meses' ? '30 (trinta)' : '60 (sessenta)';
  const districtName = local.includes('Maputo') ? 'KaMpfumo' : local.includes('Matola') ? 'Matola' : (local.split(',')[0] || 'Maputo');
  const nClausulaExtra = isComercial ? '9' : '8';
  const nClausulaForo  = isComercial ? '10' : '9';
  const nClausulaFinal = isComercial ? '11' : '10';

  const clausulaContaPagamento = metodoPagamento === 'M-Pesa'
    ? ' para o número: ________________________________'
    : (metodoPagamento === 'Transferência Bancária' || metodoPagamento === 'Depósito Bancário')
      ? ' para a conta n.º ________________________________, Banco ________________________________'
      : '';

  const servicosFrase = quemPagaServicos === 'Incluídas na renda'
    ? 'As despesas de água e electricidade estão INCLUÍDAS no valor da renda mensal acordada.'
    : quemPagaServicos === 'Proprietário'
      ? 'As despesas de água e electricidade são da responsabilidade do SENHORIO.'
      : quemPagaServicos === 'Inquilino (separado da renda)'
        ? 'As despesas de água e electricidade são da responsabilidade EXCLUSIVA do INQUILINO, a pagar directamente às entidades fornecedoras (FIPAG / EDM), não estando incluídas no valor da renda.'
        : 'As despesas de água e electricidade serão acordadas separadamente entre as partes.';

  return `---

# CONTRATO DE ARRENDAMENTO ${tipoImovel.toUpperCase()}

**ENTRE:**

**SENHORIO:** ${proprietario}, portador(a) do Bilhete de Identidade n.º **${biProprietario}**, doravante designado(a) **"Senhorio"**;

**E**

**INQUILINO:** ${locatario}, portador(a) do Bilhete de Identidade n.º **${biLocatario}**, doravante designado(a) **"Inquilino"**;

Celebram, de mútuo acordo e boa-fé, o presente Contrato de Arrendamento, regido pelo Código Civil de Moçambique (artigos 1022.º e seguintes — Locação):

---

## **CLÁUSULA 1.ª — OBJECTO**

1.1 O Senhorio cede ao Inquilino, para uso exclusivo como ${tipoImovel}, o imóvel sito em **${local}**.

1.2 O imóvel destina-se exclusivamente a fins **${isComercial ? 'comerciais/profissionais' : 'habitacionais'}**, sendo expressamente proibida a sublocação ou alteração de finalidade sem autorização escrita do Senhorio, nos termos do Código Civil de Moçambique (artigo 1038.º — obrigações do locatário).

---

## **CLÁUSULA 2.ª — PRAZO**

2.1 O presente contrato tem início em **[PREENCHER: data de início ____/____/______]** e vigorará pelo período de **${duracao}**, findando em **[PREENCHER: data de término ____/____/______]**.

2.2 Findo o prazo, o contrato renovar-se-á automaticamente por iguais períodos, salvo comunicação escrita de não renovação com antecedência mínima de **${avisoPrazo} dias**.

---

## **CLÁUSULA 3.ª — RENDA E CONDIÇÕES DE PAGAMENTO**

3.1 A renda mensal é fixada em **${formatMZN(valor)} MZN (${numeroPorExtenso(valor)} meticais)**, devida até ao dia **5 (cinco)** de cada mês.

3.2 O pagamento será efectuado por **${metodoPagamento || '________________________________'}**${clausulaContaPagamento}.

3.3 Em caso de mora no pagamento, o Inquilino pagará ao Senhorio uma multa de **3% (três por cento)** sobre o valor em dívida por cada mês de atraso, sem prejuízo de juros legais.

3.4 A renda poderá ser actualizada anualmente de acordo com o índice de inflação oficial publicado pelo INE — Instituto Nacional de Estatística de Moçambique, com pré-aviso de 30 dias, a partir do segundo ano de vigência do contrato.

---

## **CLÁUSULA 4.ª — CAUÇÃO**

4.1 O Inquilino entrega ao Senhorio, a título de caução, o montante de **${caucao}**, no acto da assinatura deste contrato.

4.2 A caução destina-se a garantir o cumprimento das obrigações contratuais, incluindo reparação de danos causados ao imóvel além do desgaste normal.

4.3 A caução será devolvida no prazo máximo de **30 (trinta) dias** após a entrega das chaves e verificação do estado do imóvel, deduzidos eventuais danos, rendas em atraso ou despesas de recuperação.

---

## **CLÁUSULA 5.ª — ENCARGOS (ÁGUA, ELECTRICIDADE E SERVIÇOS)**

5.1 **${servicosFrase}**

5.2 Outras despesas de condomínio, lixo, segurança ou manutenção de espaços comuns: ________________________________.

---

## **CLÁUSULA 6.ª — OBRIGAÇÕES DO SENHORIO**

O Senhorio obriga-se a:

a) Entregar o imóvel em boas condições de habitabilidade e com todos os equipamentos em funcionamento;
b) Assegurar o gozo pacífico do imóvel pelo Inquilino durante o período contratual;
c) Realizar as obras de conservação estrutural necessárias para manter o imóvel em boas condições;
d) Não proceder a vistoria do imóvel sem aviso prévio de 48 horas, salvo em caso de emergência;
e) Cumprir as obrigações fiscais relativas às rendas recebidas (IRPS — rendimentos prediais).

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

**Condições especiais acordadas:** ${condicoes || 'Nenhuma condição especial além das estabelecidas por lei.'}

${isComercial ? `---

## **CLÁUSULA 8.ª — DISPOSIÇÕES ESPECIAIS (ARRENDAMENTO COMERCIAL)**

8.1 O Inquilino obriga-se a obter e manter válidas todas as licenças e autorizações administrativas necessárias ao exercício da sua actividade, não podendo imputar ao Senhorio qualquer responsabilidade por atrasos ou recusas.

8.2 O Inquilino pode adaptar o imóvel às suas necessidades comerciais, desde que autorizado por escrito pelo Senhorio e revertendo as obras ao estado original no final do contrato, salvo acordo em contrário.` : ''}

---

## **CLÁUSULA ${nClausulaExtra}.ª — RESCISÃO**

${nClausulaExtra}.1 **Por iniciativa do Inquilino:** Mediante comunicação escrita ao Senhorio com antecedência mínima de **${avisoPrazo} dias**.

${nClausulaExtra}.2 **Por iniciativa do Senhorio:** Nos casos previstos neste contrato e nos princípios gerais de incumprimento do Código Civil de Moçambique, nomeadamente: falta de pagamento de renda por período superior a 60 dias; uso indevido do imóvel; realização de obras não autorizadas; subarrendamento não autorizado.

${nClausulaExtra}.3 Em caso de rescisão com justa causa imputável ao Inquilino, este perderá o direito à devolução da caução, sem prejuízo de indemnização por danos adicionais.

---

## **CLÁUSULA ${nClausulaForo}.ª — RESOLUÇÃO DE CONFLITOS E FORO**

${nClausulaForo}.1 As partes comprometem-se a resolver amigavelmente quaisquer litígios emergentes do presente contrato.

${nClausulaForo}.2 Não sendo possível a resolução amigável, as partes poderão recorrer à mediação nos termos da Lei n.º 7/2015, de 6 de Outubro.

${nClausulaForo}.3 Para os litígios que não possam ser resolvidos por mediação, fica eleito o **Tribunal Judicial de Distrito de ${districtName}**, com renúncia expressa de qualquer outro.

---

## **CLÁUSULA ${nClausulaFinal}.ª — DISPOSIÇÕES FINAIS**

${nClausulaFinal}.1 O presente contrato é celebrado em dois exemplares de igual valor, ficando um na posse de cada parte.

${nClausulaFinal}.2 Tudo o que não estiver expressamente previsto neste contrato reger-se-á pelo Código Civil de Moçambique e demais legislação aplicável.

${nClausulaFinal}.3 A nulidade de qualquer cláusula não afecta a validade das restantes, que subsistirão em pleno vigor.

---

**${districtName}, ${dataHojeExtenso()}**

| | |
|---|---|
| **O SENHORIO** | **O INQUILINO** |
| ${proprietario} | ${locatario} |
| BI: ${biProprietario} | BI: ${biLocatario} |
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
}
