// api/extract-template.js
// Proxy seguro para a API Anthropic — evita bloqueio CORS do browser.
// Processo em 2 passos:
//   1. Análise visual detalhada da imagem (via claude-sonnet com vision)
//   2. Geração de htmlTemplate + css fiel ao layout observado

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SERVICE_NAMES = {
  cv:           'Currículo (CV)',
  carta:        'Carta',
  orcamento:    'Orçamento',
  arrendamento: 'Contrato de Arrendamento',
  recibo:       'Recibo/Factura',
  prestacao:    'Contrato de Prestação',
  recomendacao: 'Carta de Recomendação',
  requerimento: 'Requerimento',
  residencia:   'Declaração de Residência',
  planonegocio: 'Plano de Negócios',
  procuracao:   'Procuração',
  licenca:      'Licença',
  acta:         'Acta',
  trabalho:     'Trabalho Académico',
};

async function callAnthropic(body) {
  const resp = await fetch(ANTHROPIC_URL, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`Anthropic API ${resp.status}: ${err}`);
  }
  return resp.json();
}

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  SITE_URL);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Validações básicas ────────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const { imageBase64, mimeType, serviceKey } = body || {};

  if (!imageBase64 || !serviceKey) {
    return res.status(400).json({ error: 'imageBase64 e serviceKey são obrigatórios' });
  }

  // Limite de tamanho: base64 de 10MB → ~13.3MB string → rejeitar > 14MB
  if (imageBase64.length > 14 * 1024 * 1024) {
    return res.status(413).json({ error: 'Imagem demasiado grande (máx 10MB)' });
  }

  const docType   = SERVICE_NAMES[serviceKey] || serviceKey;
  const imageMime = mimeType || 'image/jpeg';

  try {
    // ── PASSO 1: Análise visual detalhada da imagem ───────────────────────
    const analysisData = await callAnthropic({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: imageMime, data: imageBase64 },
          },
          {
            type: 'text',
            text: `Analisa esta imagem de um template de ${docType} com MÁXIMO DETALHE visual. Descreve:

1. LAYOUT GERAL: quantas colunas? Existe sidebar/barra lateral? Onde está o cabeçalho? Qual a largura aproximada da sidebar em mm?
2. CORES EXACTAS: cor de fundo da página (hex), cor do cabeçalho/sidebar (hex), cor do texto principal (hex), cor de accent/destaque (hex).
3. TIPOGRAFIA: tamanho do nome principal (grande/médio/pequeno), estilo dos títulos de secção (maiúsculas? sublinhado? negrito? com linha decorativa?). Serif ou sans-serif?
4. SECÇÕES VISÍVEIS: lista TODAS as secções por ordem exacta em que aparecem (ex: nome, cargo, contactos, objectivo, formação, experiência, competências, línguas, referências).
5. ELEMENTOS ESPECIAIS: avatar/círculo com iniciais? barras de progresso para línguas/competências? ícones? linhas decorativas? bordas coloridas? badges?
6. ESPAÇAMENTOS: padding interno das secções, gaps entre elementos (apertado/médio/espaçado).
7. NOME SUGERIDO: propõe um nome profissional de 2-3 palavras para este template ao estilo: "Clássico Profissional", "Moderno Colorido", "Executivo Premium", "Jovem Dinâmico", "Minimalista Clean", "Bicolor Elegante". O nome deve descrever visualmente o estilo.

Responde em texto detalhado com todos os detalhes observados.`,
          },
        ],
      }],
    });

    const analysis = analysisData.content?.find(b => b.type === 'text')?.text || '';
    if (!analysis) throw new Error('Análise visual devolveu resposta vazia');

    // ── PASSO 2: Geração de htmlTemplate + css baseado na análise ───────────
    const genData = await callAnthropic({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `És um especialista em HTML/CSS para documentos profissionais. Com base na análise visual abaixo, gera o código que replica FIELMENTE o template observado.

ANÁLISE DO TEMPLATE:
${analysis}

TIPO DE DOCUMENTO: ${docType}

Gera APENAS este JSON (sem markdown, sem \`\`\`json, sem texto extra antes ou depois):
{
  "name": "Nome profissional exato sugerido na análise (2-3 palavras, ex: Clássico Profissional, Moderno Colorido)",
  "description": "Frase curta de 1 linha descrevendo o estilo visual",
  "accent": "#hexcolor da cor de destaque principal",
  "bg": "#hexcolor do fundo do card preview (cor do sidebar ou fundo da página)",
  "htmlTemplate": "HTML COMPLETO fiel ao layout observado com todos os placeholders",
  "css": "CSS COMPLETO e detalhado que replica exactamente cores, fontes, espaçamentos e layout"
}

REGRAS ABSOLUTAS PARA htmlTemplate:
- Replicar EXACTAMENTE a estrutura observada (número de colunas, posição dos elementos)
- Com sidebar: <div class="cv-page cv-two-col"><aside class="cv-sidebar">CONTEÚDO_SIDEBAR</aside><main class="cv-main">CONTEÚDO_PRINCIPAL</main></div>
- Sem sidebar: <div class="cv-page">CONTEÚDO</div>
- Placeholders OBRIGATÓRIOS conforme as secções observadas: {{NOME}}, {{CARGO}}, {{CONTACTO}}, {{EMAIL}}, {{LOCALIZACAO}}, {{INICIAIS}}, {{OBJECTIVO}}, {{FORMACAO}}, {{EXPERIENCIA}}, {{HABILIDADES}}, {{HABILIDADES_LIST}}, {{LINGUAS}}, {{REALIZACAO}}, {{EXTRA}}
- Secções: <div class="cv-section"><h2 class="cv-section-title">TÍTULO EM MAIÚSCULAS</h2>CONTEÚDO</div>
- Entradas: <div class="cv-entry"><p class="cv-entry-date">período</p><p class="cv-entry-title">cargo/curso</p><p class="cv-entry-company">empresa/instituição | local</p><ul class="cv-entry-bullets"><li>realização concreta</li></ul></div>
- Avatar com iniciais: <div class="cv-avatar">{{INICIAIS}}</div>
- Lista de habilidades: <ul class="cv-skills-list">{{HABILIDADES_LIST}}</ul>
- Barras de língua: <div class="cv-lang-item"><span class="cv-lang-name">Português</span><span class="cv-lang-level">Nativo</span><div class="cv-lang-bar"><div class="cv-lang-fill" style="width:100%"></div></div></div>

REGRAS ABSOLUTAS PARA css (cores e medidas EXACTAS conforme análise — NUNCA usar cores genéricas):
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:FONTE_REAL; width:210mm; min-height:297mm; color:COR_TEXTO_REAL; background:COR_FUNDO_REAL; }
.cv-page { width:210mm; min-height:297mm; }
.cv-two-col { display:flex; min-height:297mm; }
.cv-sidebar { width:LARGURA_REALmm; background:COR_SIDEBAR_REAL; padding:Xmm Ymm; flex-shrink:0; }
.cv-main { flex:1; padding:Xmm Ymm; overflow:hidden; }
.cv-avatar { width:52pt; height:52pt; border-radius:50%; background:COR_ACCENT; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18pt; font-weight:700; margin:0 auto 14pt; letter-spacing:1px; }
.cv-section { margin-bottom:12pt; }
.cv-section-title { font-size:TAMANHO_REALpt; font-weight:700; color:COR_TITULO; text-transform:UPPERCASE_OU_CAPITALIZE; border-bottom:ESTILO_REAL; padding-bottom:3pt; margin-bottom:6pt; letter-spacing:Xpx; }
.cv-entry { margin-bottom:7pt; }
.cv-entry-date { font-size:8.5pt; color:COR_DATA; font-style:italic; }
.cv-entry-title { font-size:10pt; font-weight:700; color:COR_TITULO_ENTRY; margin-top:1pt; }
.cv-entry-company { font-size:9pt; color:COR_COMPANY; }
.cv-entry-bullets { padding-left:11pt; margin-top:3pt; }
.cv-entry-bullets li { font-size:9pt; margin-bottom:2pt; line-height:1.4; }
.cv-skills-list { list-style:none; padding:0; }
.cv-skills-list li { font-size:9.5pt; padding:2pt 0; }
.cv-lang-item { margin-bottom:6pt; }
.cv-lang-name { font-size:9.5pt; font-weight:600; display:block; }
.cv-lang-level { font-size:8pt; color:COR_SECUNDARIA; display:block; margin-bottom:2pt; }
.cv-lang-bar { background:rgba(255,255,255,0.25); height:4pt; border-radius:2pt; }
.cv-lang-fill { background:COR_ACCENT_REAL; height:100%; border-radius:2pt; }
/* Adicionar TODOS os outros estilos necessários para replicar fielmente o template */`,
        }],
      }],
    });

    const genText = genData.content?.find(b => b.type === 'text')?.text || '';
    if (!genText) throw new Error('Geração de código devolveu resposta vazia');

    // ── Parse JSON robusto ────────────────────────────────────────────────
    let parsed;
    try {
      const clean = genText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (_) {
      const jsonMatch = genText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Não foi possível extrair JSON da resposta');
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (!parsed.htmlTemplate || !parsed.css) {
      throw new Error('Resposta inválida — htmlTemplate ou css em falta');
    }

    return res.status(200).json({
      ok:          true,
      name:        parsed.name        || 'Template Personalizado',
      description: parsed.description || 'Extraído da sua imagem',
      accent:      parsed.accent      || '#3B82F6',
      bg:          parsed.bg          || '#fff',
      htmlTemplate: parsed.htmlTemplate,
      css:          parsed.css,
    });

  } catch (err) {
    console.error('[extract-template] Erro:', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno ao extrair template' });
  }
};
