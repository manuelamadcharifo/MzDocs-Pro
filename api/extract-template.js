// api/extract-template.js — v2.0
// Extracção de template via visão de imagem.
// ALTERAÇÃO v2.0: a lógica de chamada IA foi extraída para
// api/_lib/visionAI.js (helper reutilizável). Este ficheiro mantém
// o prompt e a validação do resultado; apenas delega ao helper.

const { analyzeImage, parseJSON } = require('./_lib/visionAI');

const SERVICE_NAMES = {
  cv: 'Currículo (CV)', carta: 'Carta', orcamento: 'Orçamento',
  arrendamento: 'Contrato de Arrendamento', recibo: 'Recibo/Factura',
  prestacao: 'Contrato de Prestação', recomendacao: 'Carta de Recomendação',
  requerimento: 'Requerimento', residencia: 'Declaração de Residência',
  planonegocio: 'Plano de Negócios', procuracao: 'Procuração',
  licenca: 'Licença', acta: 'Acta', trabalho: 'Trabalho Académico',
};

// CORRIGIDO: este prompt foi sempre escrito especificamente para CV (29
// classes cv-*, placeholders {{NOME}}/{{CARGO}}/{{HABILIDADES_LIST}}...),
// reflectindo o seu único uso anterior — extracção de modelo de CV em
// TemplatePicker.js. Ao ligar "tirar foto" também ao formulário de
// submissão de templates da galeria (que aceita qualquer tipo de
// documento — carta, trabalho, arrendamento, etc.), passou a ser
// necessário um caminho para os demais tipos. Mantém-se buildCvPrompt
// inalterado para serviceKey === 'cv' (mesmo comportamento de sempre);
// para os outros tipos, buildGenericPrompt deixa a IA decidir, a partir
// da imagem, que secções/classes fazem sentido para aquele tipo de
// documento, em vez de forçar a estrutura de CV.
function buildCvPrompt(docType) {
  return `Analisa esta imagem de um template de ${docType} e gera código HTML+CSS que replica FIELMENTE o layout visual observado.\n\nResponde APENAS com este JSON (sem markdown, sem \`\`\`json, sem texto extra):\n{\n  \"name\": \"Nome profissional de 2-3 palavras (ex: Clássico Profissional, Moderno Colorido, Executivo Premium, Bicolor Elegante, Jovem Dinâmico)\",\n  \"description\": \"Frase curta (máx 6 palavras) descrevendo o estilo\",\n  \"accent\": \"#hexcolor da cor de destaque principal observada\",\n  \"bg\": \"#hexcolor do fundo geral observado\",\n  \"htmlTemplate\": \"HTML COMPLETO usando EXACTAMENTE as classes e estrutura abaixo\",\n  \"css\": \"CSS COMPLETO com as cores, fontes e espaçamentos EXACTOS observados na imagem\"\n}\n\nESTRUTURA OBRIGATÓRIA DO htmlTemplate:\n- SE TEM SIDEBAR LATERAL: <div class=\"cv-page cv-two-col\"><aside class=\"cv-sidebar\"><div class=\"cv-avatar\">{{INICIAIS}}</div><div class=\"cv-sidebar-name\">{{NOME}}</div><div class=\"cv-sidebar-cargo\">{{CARGO}}</div><div class=\"cv-sidebar-divider\"></div><div class=\"cv-section\"><h2 class=\"cv-section-title\">Contactos</h2><div class=\"cv-contact-item\">📞 {{CONTACTO}}</div><div class=\"cv-contact-item\">✉️ {{EMAIL}}</div><div class=\"cv-contact-item\">📍 {{LOCALIZACAO}}</div></div><div class=\"cv-section\"><h2 class=\"cv-section-title\">Competências</h2><ul class=\"cv-skills-list\">{{HABILIDADES_LIST}}</ul></div><div class=\"cv-section\"><h2 class=\"cv-section-title\">Línguas</h2>{{LINGUAS}}</div></aside><main class=\"cv-main\"><section class=\"cv-section\"><h2 class=\"cv-section-title\">Objectivo Profissional</h2><p class=\"cv-text\">{{OBJECTIVO}}</p></section><section class=\"cv-section\"><h2 class=\"cv-section-title\">Formação Académica</h2><div class=\"cv-entries\">{{FORMACAO}}</div></section><section class=\"cv-section\"><h2 class=\"cv-section-title\">Experiência Profissional</h2><div class=\"cv-entries\">{{EXPERIENCIA}}</div></section><section class=\"cv-section\"><h2 class=\"cv-section-title\">Realização de Destaque</h2><p class=\"cv-text\">{{REALIZACAO}}</p></section>{{EXTRA}}</main></div>\n- SE NÃO TEM SIDEBAR (cabeçalho colorido no topo): <div class=\"cv-page\"><header class=\"cv-header\"><div class=\"cv-avatar\">{{INICIAIS}}</div><div class=\"cv-header-info\"><h1 class=\"cv-name\">{{NOME}}</h1><p class=\"cv-cargo\">{{CARGO}}</p><div class=\"cv-contacts\"><span>📞 {{CONTACTO}}</span><span>✉️ {{EMAIL}}</span><span>📍 {{LOCALIZACAO}}</span></div></div></header><div class=\"cv-body\"><section class=\"cv-section\"><h2 class=\"cv-section-title\">Objectivo Profissional</h2><p class=\"cv-text\">{{OBJECTIVO}}</p></section><section class=\"cv-section\"><h2 class=\"cv-section-title\">Formação Académica</h2><div class=\"cv-entries\">{{FORMACAO}}</div></section><section class=\"cv-section\"><h2 class=\"cv-section-title\">Experiência Profissional</h2><div class=\"cv-entries\">{{EXPERIENCIA}}</div></section><section class=\"cv-section\"><h2 class=\"cv-section-title\">Competências</h2><ul class=\"cv-skills-list\">{{HABILIDADES_LIST}}</ul></section>{{EXTRA}}</div></div>\n\nPLACEHOLDERS disponíveis: {{NOME}}, {{CARGO}}, {{CONTACTO}}, {{EMAIL}}, {{LOCALIZACAO}}, {{INICIAIS}}, {{OBJECTIVO}}, {{FORMACAO}}, {{EXPERIENCIA}}, {{HABILIDADES}}, {{HABILIDADES_LIST}}, {{LINGUAS}}, {{REALIZACAO}}, {{EXTRA}}\n\nCSS OBRIGATÓRIO (substitui COR_* pelas cores EXACTAS observadas na imagem):\n* { box-sizing:border-box; margin:0; padding:0; }\nbody { font-family:FONTE_REAL; font-size:10pt; color:COR_TEXTO; width:210mm; min-height:297mm; background:COR_FUNDO; }\n.cv-page { width:210mm; min-height:297mm; background:COR_FUNDO; }\n.cv-two-col { display:flex; min-height:297mm; }\n.cv-sidebar { width:LARGURA_SIDEBAR_mm; background:COR_SIDEBAR; color:COR_SIDEBAR_TEXTO; padding:14mm 8mm; flex-shrink:0; }\n.cv-main { flex:1; padding:12mm 10mm; }\n.cv-avatar { width:52pt; height:52pt; border-radius:50%; background:rgba(255,255,255,0.2); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18pt; font-weight:700; margin:0 auto 10pt; border:2px solid rgba(255,255,255,0.3); }\n.cv-sidebar-name { font-size:12pt; font-weight:800; text-align:center; margin-bottom:3pt; word-break:break-word; }\n.cv-sidebar-cargo { font-size:8.5pt; text-align:center; opacity:0.82; margin-bottom:10pt; }\n.cv-sidebar-divider { height:1px; background:rgba(255,255,255,0.25); margin:8pt 0; }\n.cv-sidebar .cv-section { margin-bottom:10pt; }\n.cv-sidebar .cv-section-title { font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; opacity:0.7; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:3pt; margin-bottom:5pt; }\n.cv-contact-item { font-size:8.5pt; margin-bottom:4pt; opacity:0.9; word-break:break-all; }\n.cv-skills-list { list-style:none; padding:0; }\n.cv-skills-list li { font-size:8.5pt; padding:3pt 0; border-bottom:1px solid rgba(255,255,255,0.1); opacity:0.9; }\n.cv-lang-item { font-size:8.5pt; margin-bottom:5pt; }\n.cv-lang-name { font-weight:700; display:block; }\n.cv-lang-bar { background:rgba(255,255,255,0.2); height:3pt; border-radius:2pt; margin-top:2pt; }\n.cv-lang-fill { background:rgba(255,255,255,0.7); height:100%; border-radius:2pt; }\n.cv-header { background:COR_HEADER; color:COR_HEADER_TEXTO; padding:10mm 12mm; display:flex; align-items:center; gap:12pt; }\n.cv-name { font-size:18pt; font-weight:800; line-height:1.1; margin-bottom:2pt; }\n.cv-cargo { font-size:10pt; opacity:0.85; margin-bottom:5pt; }\n.cv-contacts { display:flex; flex-wrap:wrap; gap:4pt 12pt; font-size:8.5pt; opacity:0.9; }\n.cv-body { padding:10mm 12mm; }\n.cv-main .cv-section, .cv-body .cv-section { margin-bottom:10pt; }\n.cv-main .cv-section-title, .cv-body .cv-section-title { font-size:9.5pt; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:COR_ACCENT; border-bottom:2px solid COR_ACCENT; padding-bottom:2pt; margin-bottom:6pt; }\n.cv-text { font-size:9.5pt; line-height:1.55; color:#374151; }\n.cv-entries { font-size:9.5pt; }\n.cv-entry { margin-bottom:6pt; }\n.cv-entry-date { font-size:8pt; color:#6b7280; font-style:italic; }\n.cv-entry-title { font-size:10pt; font-weight:700; color:#111827; margin-top:1pt; }\n.cv-entry-company { font-size:9pt; color:#4b5563; margin-top:1pt; }\n.cv-entry-bullets { padding-left:12pt; margin-top:3pt; }\n.cv-entry-bullets li { font-size:9pt; margin-bottom:1.5pt; }\n\nIMPORTANTE: Usa as cores e layout EXACTOS da imagem. Não inventar cores — retirar da imagem.`;
}

function buildGenericPrompt(docType) {
  return `Analisa esta imagem de um template de ${docType} e gera código HTML+CSS que replica FIELMENTE o layout visual observado (cores, tipografia, espaçamentos, alinhamentos, presença de tabelas, cabeçalhos, marcas de água, bordas, etc.).

Responde APENAS com este JSON (sem markdown, sem \`\`\`json, sem texto extra):
{
  "name": "Nome profissional de 2-3 palavras para este template (ex: Clássico Formal, Moderno Minimalista, Corporativo Azul)",
  "description": "Frase curta (máx 8 palavras) descrevendo o estilo e para que serve",
  "accent": "#hexcolor da cor de destaque principal observada na imagem",
  "bg": "#hexcolor do fundo geral observado",
  "htmlTemplate": "HTML COMPLETO da estrutura do documento, usando classes CSS descritivas que TU escolhas (ex: doc-header, doc-title, doc-section, doc-table) — adequadas ao tipo de documento e ao que vês na imagem",
  "css": "CSS COMPLETO com as cores, fontes, espaçamentos e bordas EXACTOS observados na imagem, estilizando as classes que usaste no htmlTemplate"
}

REGRAS PARA O htmlTemplate:
- Estrutura o documento em secções coerentes com um "${docType}" — observa a imagem para decidir quais secções existem (cabeçalho/título, corpo principal, tabela de dados se houver, bloco de assinatura, rodapé, etc.)
- Onde houver texto variável (nomes, datas, valores, endereços, parágrafos de conteúdo), usa placeholders no formato {{NOME_DESCRITIVO}} em MAIÚSCULAS (ex: {{NOME_REQUERENTE}}, {{DATA}}, {{VALOR_TOTAL}}, {{CORPO_TEXTO}}) em vez de inventar texto fixo
- Usa tags semânticas simples: <header>, <section>, <table> quando aplicável, <footer> — com classes CSS para estilo
- NÃO uses classes começadas por "cv-" (essas são reservadas à estrutura de Currículo) — usa classes próprias começadas por "doc-"
- O documento deve ter o tamanho A4 (width:210mm) tal como na imagem

IMPORTANTE: usa as cores, tipografia e layout EXACTOS observados na imagem. Não inventar cores — retirar da imagem. Se a imagem estiver desfocada ou ilegível numa parte, reconstrói essa parte de forma plausível para o tipo de documento "${docType}", mas mantém fiel tudo o que conseguires observar com clareza.`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const { imageBase64, mimeType, serviceKey } = body || {};
  if (!imageBase64 || !serviceKey) {
    return res.status(400).json({ error: 'imageBase64 e serviceKey são obrigatórios' });
  }
  if (imageBase64.length > 14 * 1024 * 1024) {
    return res.status(413).json({ error: 'Imagem demasiado grande (máx 10MB)' });
  }

  const docType = SERVICE_NAMES[serviceKey] || serviceKey;
  const imgMime = mimeType || 'image/jpeg';
  const prompt  = serviceKey === 'cv' ? buildCvPrompt(docType) : buildGenericPrompt(docType);

  try {
    const rawText = await analyzeImage(imageBase64, prompt, {
      mimeType:  imgMime,
      logPrefix: 'extract-template',
    });

    const parsed = parseJSON(rawText);
    if (!parsed.htmlTemplate || !parsed.css) {
      throw new Error('Resposta inválida da IA — htmlTemplate ou css em falta');
    }

    return res.status(200).json({
      ok:           true,
      name:         parsed.name         || 'Template Personalizado',
      description:  parsed.description  || 'Extraído da sua imagem',
      accent:       parsed.accent       || '#3B82F6',
      bg:           parsed.bg           || '#fff',
      htmlTemplate: parsed.htmlTemplate,
      css:          parsed.css,
    });

  } catch (err) {
    console.error('[extract-template] Erro final:', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno ao extrair template' });
  }
};
