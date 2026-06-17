// assets/js/services/prompts/recomendacao.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoRec = data.tipoRec || 'Recomendação Profissional';
        const temExemplo = !!(data.exemploConcreto && data.exemploConcreto.trim());
        return `Você é especialista em comunicação profissional e académica. Redija uma ${tipoRec.toUpperCase()} completa, persuasiva e genuinamente útil para o destinatário.

DADOS:
- Tipo: ${tipoRec}
- Recomendador: ${data.recomendador} | Cargo: ${data.cargoRec} | Entidade: ${data.entidadeRec}
- Recomendado: ${data.recomendado} | Cargo/função pretendida: ${data.cargoRecm}
- Relação e período: ${data.relacao}
- Qualidades a destacar: ${data.qualidades}
- Exemplo concreto fornecido: ${data.exemploConcreto || '[NÃO FORNECIDO — ver regra 3]'}
- Destinatário: ${data.destinatario || 'A quem possa interessar'}${ocrBlock}

REGRAS CRÍTICAS:
1. USE os dados fornecidos pelo utilizador como base — não invente factos, nomes de projectos ou situações não descritas
2. Qualidades SEMPRE com contexto específico: nunca "é pontual" sem um exemplo; nunca "é líder" sem uma situação concreta
3. ${temExemplo ? 'EXEMPLO FORNECIDO: use o exemplo concreto literalmente como base da secção central: "' + data.exemploConcreto + '"' : 'EXEMPLO NÃO FORNECIDO: assinale claramente no parágrafo central com [INSERIR EXEMPLO CONCRETO — o recomendador deve adicionar uma situação real aqui], não invente'}
4. Tom caloroso mas factual — evite superlativos vazios ("excepcional", "extraordinário") sem base concreta
5. Máximo 1 página A4 — carta de recomendação longa não é lida
6. Frase de abertura: NUNCA use "Venho por este meio" — comece directamente com quem é o recomendador e a sua autoridade

ESTRUTURA OBRIGATÓRIA:

**${data.recomendador}**
${data.cargoRec}
${data.entidadeRec}

${dataFmt}

${data.destinatario || 'A Quem Possa Interessar'}

---

**Assunto: ${tipoRec} — ${data.recomendado}**

[Parágrafo 1 — ABERTURA E CREDENCIAL DO RECOMENDADOR (3-4 linhas):
Comece com uma afirmação directa: "Conheço [nome] desde [período], tendo trabalhado directamente com ele/ela como [relação]."
Estabeleça a credencial do recomendador para esta recomendação específica.
Baseie-se em: "${data.relacao}"]

[Parágrafo 2 — CAPACIDADES E QUALIDADES COM CONTEXTO ESPECÍFICO (4-5 linhas):
Para cada qualidade em "${data.qualidades}", adicione contexto específico da relação de trabalho.
Exemplo de formato correcto: "A sua [qualidade] ficou demonstrada quando [situação/contexto específico do dia-a-dia de trabalho]."
NÃO use qualidades soltas sem contexto.]

[Parágrafo 3 — EXEMPLO CONCRETO DE REALIZAÇÃO (4-5 linhas — NÚCLEO DA CARTA):
${temExemplo ? 'Expanda e estruture o seguinte exemplo real fornecido pelo recomendador: "' + data.exemploConcreto + '". Descreva o contexto, o que o recomendado fez especificamente, e o resultado/impacto.' : '[INSERIR EXEMPLO CONCRETO — o recomendador deve descrever aqui uma situação real que tenha observado, com contexto, acção e resultado. Esta secção é obrigatória para credibilidade.]'}]

[Parágrafo 4 — ADEQUAÇÃO PARA A FUNÇÃO E RECOMENDAÇÃO (3-4 linhas):
Ligue explicitamente as qualidades demonstradas ao cargo/função pretendida: "${data.cargoRecm}".
Termine com uma recomendação clara e sem reservas: "Recomendo sem reservas..." ou "Não hesito em recomendar..."]

Com os melhores cumprimentos,

_________________________________________
**${data.recomendador}**
${data.cargoRec}
${data.entidadeRec}
[Contacto directo]`;
}

export function buildDataBlock(data) {
  return `- Tipo: ${data.tipoRec || 'Profissional'}
- Recomendador: ${data.recomendador || ''}  |  Cargo: ${data.cargoRec || ''}  |  Entidade: ${data.entidadeRec || ''}
- Recomendado: ${data.recomendado || ''}  |  Cargo/Bolsa pretendido: ${data.cargoRecm || ''}
- Relação de trabalho: ${data.relacao || ''}
- Qualidades evidenciadas: ${data.qualidades || ''}
- Exemplo concreto: ${data.exemploConcreto || '[a completar]'}

MAPEAMENTO DE PLACEHOLDERS:
{{RECOMENDADOR}} = ${data.recomendador || ''}
{{CARGO_REC}} = ${data.cargoRec || ''}
{{ENTIDADE_REC}} = ${data.entidadeRec || ''}
{{RECOMENDADO}} = ${data.recomendado || ''}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso
{{CORPO}} = carta completa de recomendação (3-4 parágrafos):
  1. Apresentação do recomendador e relação com o recomendado
  2. Competências e qualidades: "${data.qualidades || ''}"
  3. Exemplo concreto: "${data.exemploConcreto || ''}"
  4. Recomendação explícita para "${data.cargoRecm || ''}"`;
}
