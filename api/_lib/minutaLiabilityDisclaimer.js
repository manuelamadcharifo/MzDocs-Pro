// api/_lib/minutaLiabilityDisclaimer.js
// Texto único e oficial do disclaimer de responsabilidade que um
// parceiro/afiliado tem de aceitar antes de submeter uma minuta própria.
// Fonte única de verdade: tanto a validação no submit (partnerMinutas.js)
// como o formulário no frontend (via acção 'disclaimer', para nunca haver
// dois textos a divergir) usam ESTA string.
//
// ⚠️ NÃO REVISTO POR UM ADVOGADO. Este texto foi escrito com bom senso para
// deixar claro, em português simples, que a responsabilidade pelo conteúdo
// jurídico é do autor da minuta — mas antes de activar esta funcionalidade
// para parceiros reais, um advogado moçambicano deve rever esta cláusula
// (idealmente também os Termos de Uso gerais da plataforma, para garantir
// que não há contradição entre os dois textos).
const MINUTA_LIABILITY_DISCLAIMER_VERSION = 1;

const MINUTA_LIABILITY_DISCLAIMER_TEXT = `DECLARAÇÃO DE RESPONSABILIDADE DO AUTOR DA MINUTA

Ao submeter esta minuta para publicação na MzDocs Pro, eu declaro e aceito que:

1. Sou o único responsável pelo conteúdo jurídico, técnico e factual do texto que estou a submeter, incluindo a sua conformidade com a legislação moçambicana aplicável.

2. A MzDocs Pro actua apenas como plataforma tecnológica que disponibiliza esta minuta a outros utilizadores — não redige, não revê e não garante a validade jurídica do conteúdo que eu próprio(a) escrevi.

3. Em caso de reclamação, litígio, acção judicial ou qualquer outro procedimento decorrente do uso desta minuta por terceiros, a responsabilidade é exclusivamente minha, e não da MzDocs Pro, dos seus sócios, colaboradores ou representantes.

4. Comprometo-me a indemnizar e isentar de responsabilidade a MzDocs Pro por quaisquer custos, danos ou prejuízos que resultem, directa ou indirectamente, de conteúdo por mim submetido.

5. Esta minuta poderá ser usada por qualquer utilizador da plataforma que a seleccione, sem que eu tenha conhecimento prévio de cada uso individual, e aceito essa condição de utilização.

6. Esta declaração fica registada, com data, hora e o texto exacto aqui apresentado, como prova da minha aceitação.`;

module.exports = {
  MINUTA_LIABILITY_DISCLAIMER_VERSION,
  MINUTA_LIABILITY_DISCLAIMER_TEXT,
};
