// assets/js/services/prompts/arrendamento.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
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
}

export function buildDataBlock(data) {
  const num = (v) => parseInt(v || 0).toLocaleString('pt-MZ');
  return `- Tipo: ${data.tipoImovel || ''}
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
  Cada cláusula: <p><strong>Cláusula N.ª — TÍTULO</strong></p><p>texto...</p>`;
}
