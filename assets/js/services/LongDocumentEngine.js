// assets/js/services/LongDocumentEngine.js
// Motor de geração em cadeia para documentos longos (20+ páginas)
// Arquitectura: Planeamento → Geração Sequencial (alternando providers) → Consolidação

const LONG_DOC_ENDPOINT   = '/api/generate-document';
const CHUNK_DOC_ENDPOINT  = '/api/generate-chunk'; // novo endpoint para chunks

// Serviços que activam geração longa (podem ter muitas páginas)
const LONG_DOC_SERVICES = new Set(['trabalho', 'planonegocio', 'prestacao', 'arrendamento']);

// Limite em páginas — acima deste valor activa o motor de cadeia
const LONG_DOC_PAGE_THRESHOLD = 6;

export class LongDocumentEngine {
  constructor() {
    this._onProgress = null; // callback de progresso
    this._aborted    = false;
  }

  /** Regista callback de progresso: fn({ phase, step, total, text }) */
  onProgress(fn) { this._onProgress = fn; return this; }

  /** Verifica se um serviço/formulário activa geração longa */
  static isLongDoc(serviceType, formData) {
    if (!LONG_DOC_SERVICES.has(serviceType)) return false;
    const pages = parseInt(formData?.paginas || formData?.paginas || 0);
    if (serviceType === 'trabalho' && pages >= LONG_DOC_PAGE_THRESHOLD) return true;
    if (serviceType === 'planonegocio') return true; // sempre longo
    return false;
  }

  abort() { this._aborted = true; }

  _emit(data) { this._onProgress?.(data); }

  // ── ENTRADA PRINCIPAL ──────────────────────────────────────────
  async generate(serviceType, prompt, formData, credits) {
    this._aborted = false;

    // FASE 1: Planeamento — pede ao LLM para criar o índice estruturado
    this._emit({ phase: 'plan', step: 0, total: 3, text: '📋 A planear estrutura do documento…' });

    let sections;
    try {
      sections = await this._planDocument(serviceType, formData, credits);
    } catch (e) {
      // Se o planeamento falhar, cair no fluxo normal (single-shot)
      console.warn('[LongDocEngine] Planeamento falhou, a usar geração normal:', e.message);
      return null; // sinal para o controller usar o fluxo padrão
    }

    if (this._aborted) throw new Error('Abortado pelo utilizador');

    // FASE 2: Geração sequencial de secções
    this._emit({ phase: 'generate', step: 1, total: sections.length + 2, text: `✍️ A gerar ${sections.length} secções…` });

    const generatedSections = [];
    const summaries         = [];

    for (let i = 0; i < sections.length; i++) {
      if (this._aborted) throw new Error('Abortado pelo utilizador');

      const section = sections[i];
      this._emit({
        phase: 'generate',
        step:  i + 1,
        total: sections.length + 2,
        text:  `✍️ Secção ${i + 1}/${sections.length}: ${section.title}…`,
        provider: section.provider,
      });

      const sectionContent = await this._generateSection(section, summaries, formData, credits);
      generatedSections.push(sectionContent);

      // Resumo compacto para contexto das próximas secções (max 300 palavras)
      const summary = this._extractSummary(sectionContent, section.title);
      summaries.push(summary);
    }

    if (this._aborted) throw new Error('Abortado pelo utilizador');

    // FASE 3: Consolidação — une tudo e cria índice final
    this._emit({
      phase: 'consolidate',
      step:  sections.length + 2,
      total: sections.length + 2,
      text:  '🔗 A consolidar e rever coerência…',
    });

    const fullDocument = await this._consolidate(
      serviceType,
      generatedSections,
      sections,
      formData,
      credits
    );

    return { document: fullDocument, model: 'Chain-of-Generation (multi-provider)', sections: sections.length };
  }

  // ── FASE 1: PLANEAMENTO ────────────────────────────────────────
  async _planDocument(serviceType, formData, credits) {
    const userId = localStorage.getItem('mz_uid') || 'anon';
    const pages  = parseInt(formData?.paginas || 10);

    let planPrompt = '';

    if (serviceType === 'trabalho') {
      planPrompt = `Crie um ÍNDICE ESTRUTURADO para um trabalho académico de ${pages} páginas sobre o tema "${formData.tema}" (${formData.disciplina}, nível ${formData.nivel}).
Devolva APENAS um JSON válido neste formato exacto, sem comentários:
{
  "sections": [
    {"id": "intro", "title": "Introdução", "words": 800, "type": "intro"},
    {"id": "cap1",  "title": "Título do Capítulo 1 (específico ao tema)", "words": 1200, "type": "body"},
    {"id": "cap2",  "title": "Título do Capítulo 2", "words": 1200, "type": "body"},
    {"id": "conc",  "title": "Conclusão", "words": 600, "type": "conclusion"},
    {"id": "refs",  "title": "Referências Bibliográficas", "words": 400, "type": "references"}
  ]
}
O número de capítulos deve ser proporcional a ${pages} páginas (≈ ${Math.round(pages * 0.7)} páginas de desenvolvimento).
Títulos dos capítulos devem ser específicos ao tema "${formData.tema}", não genéricos.`;

    } else if (serviceType === 'planonegocio') {
      planPrompt = `Crie um ÍNDICE para um Plano de Negócios completo para "${formData.nomeNegocio}" (sector: ${formData.sector}, local: ${formData.localNeg || formData.local || 'Moçambique'}).
Devolva APENAS JSON válido:
{
  "sections": [
    {"id": "exec",    "title": "Resumo Executivo",         "words": 800,  "type": "intro"},
    {"id": "negocio", "title": "Descrição do Negócio",     "words": 1000, "type": "body"},
    {"id": "mercado", "title": "Análise de Mercado",        "words": 1500, "type": "body"},
    {"id": "market",  "title": "Plano de Marketing",        "words": 1200, "type": "body"},
    {"id": "oper",    "title": "Plano Operacional",         "words": 1000, "type": "body"},
    {"id": "fin",     "title": "Projecções Financeiras",    "words": 1500, "type": "body"},
    {"id": "riscos",  "title": "Riscos e Mitigação",        "words": 600,  "type": "body"},
    {"id": "conc",    "title": "Conclusão e Pedido de Apoio","words": 500, "type": "conclusion"}
  ]
}`;
    }

    const res = await fetch(LONG_DOC_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceType: '__plan__',
        prompt: planPrompt,
        userId,
        userCredits: credits,
        _planMode: true,
      }),
    });

    if (!res.ok) throw new Error(`Planeamento HTTP ${res.status}`);
    const data = await res.json();
    const raw  = data.document || data.content || '';

    // Extrair JSON da resposta (pode haver texto antes/depois)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta de planeamento não contém JSON');

    const plan = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(plan.sections) || plan.sections.length === 0) {
      throw new Error('Plano sem secções');
    }

    // Distribui providers em round-robin pelas secções
    const PROVIDERS = ['groq', 'gemini', 'openrouter'];
    return plan.sections.map((s, i) => ({
      ...s,
      provider: PROVIDERS[i % PROVIDERS.length],
      index:    i,
    }));
  }

  // ── FASE 2: GERAÇÃO DE SECÇÃO ──────────────────────────────────
  async _generateSection(section, previousSummaries, formData, credits) {
    const userId  = localStorage.getItem('mz_uid') || 'anon';
    const context = previousSummaries.length > 0
      ? `\n\nCONTEXTO DAS SECÇÕES ANTERIORES (para coerência):\n${previousSummaries.slice(-3).join('\n---\n')}`
      : '';

    const sectionPrompt = this._buildSectionPrompt(section, formData, context);

    const res = await fetch(LONG_DOC_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceType: '__section__',
        prompt:      sectionPrompt,
        userId,
        userCredits: credits,
        _preferProvider: section.provider, // hint para o backend
        _sectionMode: true,
      }),
    });

    if (!res.ok) {
      // Fallback — tenta sem provider específico
      const res2 = await fetch(LONG_DOC_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: '__section__',
          prompt:      sectionPrompt,
          userId,
          userCredits: credits,
        }),
      });
      if (!res2.ok) throw new Error(`Secção "${section.title}" falhou`);
      const d2 = await res2.json();
      return d2.document || d2.content || '';
    }

    const data = await res.json();
    return data.document || data.content || '';
  }

  _buildSectionPrompt(section, formData, context) {
    const words  = section.words || 800;
    const isBody = section.type === 'body';

    if (section.type === 'references') {
      return `Gere uma secção de REFERÊNCIAS BIBLIOGRÁFICAS em formato APA 7ª edição.
Liste MÍNIMO 8 referências reais e verificáveis incluindo:
- Pelo menos 2 livros académicos
- 1 artigo científico de revista indexada
- 1 relatório de organismo internacional (ONU, Banco Mundial, UA, SADC)
- 1 fonte moçambicana (INE, Governo, universidades moçambicanas)
Devolva APENAS a secção de referências, sem cabeçalho "## Referências".${context}`;
    }

    return `Redija a secção "${section.title}" de um documento académico/profissional.
REQUISITOS:
- Mínimo ${words} palavras de conteúdo real e denso
- Linguagem formal em português de Moçambique
- Use Markdown (##, ###, **negrito**, listas quando pertinente)
- Conteúdo específico ao tema: ${formData.tema || formData.nomeNegocio || 'descrito no formulário'}
- Dados reais, exemplos concretos do contexto moçambicano/africano
- NÃO use [PREENCHER] nem placeholders — escreva conteúdo real
- Esta é APENAS a secção "${section.title}" — não escreva outras secções
${isBody ? '- Inclua pelo menos 3 subsecções com ### ' : ''}
${context}

DEVOLVA APENAS o conteúdo da secção "${section.title}", começando com "## ${section.title}".`;
  }

  // ── FASE 3: CONSOLIDAÇÃO ───────────────────────────────────────
  async _consolidate(serviceType, sections, sectionMeta, formData, credits) {
    const userId = localStorage.getItem('mz_uid') || 'anon';

    // Página de rosto e índice
    const coverPage  = this._buildCoverPage(serviceType, formData, sectionMeta);
    const fullBody   = sections.join('\n\n---PAGE_BREAK---\n\n');
    const totalWords = sections.join(' ').split(/\s+/).length;

    // Para documentos muito longos, pular consolidação pesada e apenas montar
    if (totalWords > 8000) {
      return `${coverPage}\n\n${fullBody}`;
    }

    // Consolidação leve — pede ao LLM para verificar coerência
    const consolidatePrompt = `Revisa brevemente este documento e corrige apenas:
1. Referências cruzadas entre secções (ex: "conforme mencionado na Introdução")
2. Inconsistências de dados (nomes, datas, números contraditórios)
3. Tom e linguagem uniforme
4. NÃO reescreva o documento completo — apenas pequenas correcções

DOCUMENTO:
${fullBody.slice(0, 6000)}... [continua]

Devolva o documento completo corrigido em Markdown.`;

    try {
      const res = await fetch(LONG_DOC_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: '__consolidate__',
          prompt:      consolidatePrompt,
          userId,
          userCredits: credits,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const consolidated = data.document || data.content || '';
        if (consolidated.length > 500) {
          return `${coverPage}\n\n${consolidated}`;
        }
      }
    } catch (e) {
      console.warn('[LongDocEngine] Consolidação falhou, usando montagem directa:', e.message);
    }

    // Fallback — montagem directa sem consolidação
    return `${coverPage}\n\n${fullBody}`;
  }

  _buildCoverPage(serviceType, formData, sectionMeta) {
    const ano = new Date().getFullYear();

    if (serviceType === 'trabalho') {
      const indexLines = sectionMeta.map((s, i) =>
        `   ${i + 1}. ${s.title} .................................................. ${i + 3}`
      ).join('\n');

      return `---PAGE_BREAK---
# ${formData.tema || 'Trabalho Académico'}

| | |
|---|---|
| **Instituição:** | [Nome da Instituição] |
| **Curso/Disciplina:** | ${formData.disciplina || '[Disciplina]'} |
| **Nível:** | ${formData.nivel || '[Nível]'} |
| **Aluno(a):** | [Nome Completo] |
| **Docente:** | [Nome do Professor] |
| **Cidade e Ano:** | Maputo, ${ano} |

---PAGE_BREAK---
## Índice

${indexLines}`;
    }

    if (serviceType === 'planonegocio') {
      const indexLines = sectionMeta.map((s, i) =>
        `   ${i + 1}. ${s.title} .................................................. ${i + 3}`
      ).join('\n');

      return `---PAGE_BREAK---
# PLANO DE NEGÓCIOS
# ${formData.nomeNegocio || '[Nome do Negócio]'}

| | |
|---|---|
| **Empresa/Negócio:** | ${formData.nomeNegocio || '[Nome]'} |
| **Sector:** | ${formData.sector || '[Sector]'} |
| **Proprietário:** | ${formData.proprietario || '[Nome]'} |
| **Localização:** | ${formData.localNeg || formData.local || 'Moçambique'} |
| **Data:** | ${new Date().toLocaleDateString('pt-MZ')} |
| **Investimento Inicial:** | ${formData.investimento ? formData.investimento + ' MZN' : '[Valor]'} |

---PAGE_BREAK---
## Índice

${indexLines}`;
    }

    return '';
  }

  // Extrai resumo compacto de uma secção (para passar como contexto às seguintes)
  _extractSummary(content, title) {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const words = lines.join(' ').split(/\s+/).slice(0, 80).join(' ');
    return `[${title}]: ${words}…`;
  }
}
