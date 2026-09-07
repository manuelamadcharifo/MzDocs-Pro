// assets/js/services/minutas/residencia.js
// MINUTA FIXA — Declaração de Residência. Adaptado de
// services/prompts/residencia.js (secção "DOCUMENTO COMPLETO:"), que já era
// 100% determinística — a IA não compunha texto livre nenhum, só formatava
// dados já prontos. Mesmos campos reais do formulário (ServiceDefinitions.js
// → residencia.fields): requerente, bi, bairro, rua, cidade, tempoCasas,
// finalidade, chefeBairro, local.
import { dataHojeExtenso, preencher } from './_shared.js';

export function render(data = {}) {
  const declarante = data.requerente || '';
  const bi = data.bi || '';
  const endereco = [data.rua, data.bairro, data.cidade].filter(Boolean).join(', ');
  const tempo = data.tempoCasas || '';
  const finalidade = data.finalidade || '';
  const chefe = data.chefeBairro || '';
  const localData = data.local || `${data.cidade || 'Maputo'}, ${dataHojeExtenso()}`;

  return `---

# DECLARAÇÃO DE RESIDÊNCIA

**${(declarante || 'DECLARANTE NÃO IDENTIFICADO').toUpperCase()}**

---

Eu, **${declarante}**, portador(a) do Bilhete de Identidade n.º **${bi}**, venho por este meio DECLARAR, sob compromisso de honra e nos termos do artigo 82.º do Código Civil de Moçambique, que:

**1. RESIDÊNCIA ACTUAL**

Resido de forma habitual, permanente e estável no endereço: **${endereco}**, onde me encontro domiciliado(a) há **${tempo}**.

**2. FINALIDADE DA DECLARAÇÃO**

A presente declaração é emitida para efeitos de **${finalidade}**, e destina-se exclusivamente à(s) entidade(s) a quem for apresentada.

**3. COMPROMISSO DE VERACIDADE**

O(A) declarante afirma, sob compromisso de honra, que todos os factos acima expostos são verdadeiros e correspondem à realidade. O(A) declarante está ciente de que a prestação de falsas declarações perante a autoridade constitui crime punível nos termos do artigo 271.º do Código Penal de Moçambique.

**4. VALIDADE**

A presente declaração é válida pelo período de **90 (noventa) dias** a contar da data de emissão, ou até alteração das condições de residência acima declaradas.

---

**${localData}**

**O(A) DECLARANTE:**

_________________________________________
**${declarante}**
BI n.º ${bi}

---

**CONFIRMAÇÃO DO CHEFE DE QUARTEIRÃO / PRESIDENTE DE BAIRRO:**

Eu, **${chefe || preencher('nome do Chefe de Quarteirão / Presidente do Bairro')}**, na qualidade de Chefe de Quarteirão / Presidente do Bairro **${data.bairro || ''}**, CONFIRMO que o(a) Sr(a). **${declarante}** reside efectivamente no endereço indicado, sendo do meu conhecimento pessoal.

_________________________________________
**${chefe || preencher('nome do Chefe de Quarteirão / Presidente do Bairro')}**
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
}
