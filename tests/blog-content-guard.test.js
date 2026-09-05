// tests/blog-content-guard.test.js
// P1.9 (Master Hardening & Release Gate v2, Set/2026, Fase 6 — extensão)
//
// Prova guardBlogContent()/detectAiMention()/scanOverclaims()
// (api/_lib/blogContentGuard.js): artigos que mencionam geração por IA, ou
// que fazem alegações que o MzDocs Pro não cumpre, são sinalizados —  e
// texto normal do produto NÃO dispara falsos positivos (em particular a
// palavra portuguesa comum "ia", pretérito de "ir", que não pode ser
// confundida com a sigla "IA").

const { guardBlogContent, detectAiMention, scanOverclaims } = require('../api/_lib/blogContentGuard.js');

describe('Fase 6 — detectAiMention()', () => {
  test.each([
    '<p>Este artigo foi feito com o apoio de IA.</p>',
    '<p>Usamos inteligência artificial para preparar este conteúdo.</p>',
    '<p>O texto foi gerado por um chatbot treinado para isto.</p>',
    '<p>Este conteúdo foi gerado automaticamente por um algoritmo.</p>',
    '<p>Escrito com recurso ao GPT-4 e a outros modelos de linguagem.</p>',
    '<p>Usamos a Google Gemini para produzir estes artigos.</p>',
  ])('detecta menção a IA em: %s', (html) => {
    expect(detectAiMention(html)).not.toBeNull();
  });

  test.each([
    '<p>Ele ia trabalhar todos os dias antes de mudar de emprego.</p>',
    '<p>A candidata ia enviar o currículo ontem, mas atrasou-se.</p>',
    '<p>Faça o seu CV profissional em minutos com o MzDocs Pro.</p>',
    '<p>Este guia explica como preencher uma procuração correctamente.</p>',
  ])('NÃO dispara falso positivo em: %s', (html) => {
    expect(detectAiMention(html)).toBeNull();
  });
});

describe('Fase 6 — scanOverclaims()', () => {
  test.each([
    ['<p>O MzDocs Pro substitui o aconselhamento jurídico profissional.</p>', 'legal_advice_substitute'],
    ['<p>Tenha um advogado incluído no seu plano, disponível 24 horas.</p>', 'lawyer_included'],
    ['<p>O seu documento fica com validade legal garantida.</p>', 'legal_validity_guarantee'],
    ['<p>Garantimos a aceitação do seu pedido pela conservatória.</p>', 'approval_guarantee'],
    ['<p>Enviamos automaticamente o seu documento à conservatória.</p>', 'auto_submission'],
    ['<p>Somos uma empresa legalmente registada em Moçambique.</p>', 'company_registered'],
    ['<p>Fazemos entrega grátis em todo o país.</p>', 'nationwide_free_delivery'],
    ['<p>Temos suporte 24 horas por dia para todos os clientes.</p>', 'support_24_7'],
  ])('detecta alegação arriscada em: %s', (html, expectedId) => {
    const found = scanOverclaims(html);
    expect(found.map(f => f.id)).toContain(expectedId);
  });

  test('NÃO dispara em texto normal do produto', () => {
    const html = '<p>Com o MzDocs Pro pode criar o seu currículo, carta de candidatura ou procuração em poucos minutos, de forma simples.</p>';
    expect(scanOverclaims(html)).toEqual([]);
  });
});

describe('Fase 6 — guardBlogContent() (combinado)', () => {
  test('artigo limpo não dispara nenhum aviso', () => {
    const html = '<h2>Como fazer uma procuração</h2><p>Uma procuração é um documento que autoriza outra pessoa a agir em seu nome. Com o MzDocs Pro pode criar a sua em poucos minutos.</p>';
    const result = guardBlogContent(html);
    expect(result.aiMention).toBeNull();
    expect(result.overclaims).toEqual([]);
  });

  test('artigo com menção a IA e alegação arriscada dispara os dois', () => {
    const html = '<p>Este artigo foi gerado com inteligência artificial. O MzDocs Pro substitui o aconselhamento jurídico profissional.</p>';
    const result = guardBlogContent(html);
    expect(result.aiMention).not.toBeNull();
    expect(result.overclaims.length).toBeGreaterThan(0);
  });
});
