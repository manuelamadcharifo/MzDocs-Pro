// assets/js/services/LongDocumentEngine.js
// Motor de geração em cadeia para documentos longos (trabalhos 6+ páginas, plano de negócios)
// Arquitectura: Planeamento → Geração Sequencial (alternando providers) → Montagem final
//
// CORRECÇÕES v2.0 (Junho/2026):
//  BUG 1 CORRIGIDO — Crédito era debitado em Fase 0 ANTES do planeamento.
//    Se o planeamento falhasse (timeout, JSON inválido, provider indisponível),
//    a função retornava null SEM reembolsar o crédito. O utilizador perdia
//    o crédito sem receber documento.
//    SOLUÇÃO: crédito agora é debitado DEPOIS de o planeamento ter sucesso
//    (entre Fase 1 e Fase 2). Se o planeamento falhar → zero débito.
//    Se Fases 2/3 falharem após o débito → chama refund_credit via
//    /api/deduct-credit?refund=true (igual ao fluxo normal).
//
//  BUG 2 CORRIGIDO — result podia ser null quando o planeamento retornava
//    null. Em _generateLong (DocumentController) a linha seguinte:
//      if (typeof result.creditsRemaining === 'number')
//    lançava TypeError: Cannot read properties of null.
//    Esse erro era silenciosamente engolido pelo catch, o botão ficava
//    disabled (hideLoader não era chamado em _generateLong), e o crédito
//    já tinha sido debitado. Resolução: null já não pode acontecer pós-débito.
//
//  BUG 3 CORRIGIDO — _generateLong em DocumentController.js não chamava
//    DocumentView.showLoader()/hideLoader(). O utilizador via o botão
//    desactivado sem qualquer feedback visual de progresso.
//    SOLUÇÃO: corrigido em DocumentController.js (ver esse ficheiro).
//
//  BUG 4 CORRIGIDO — Timeout em falta em _planDocument: se o servidor
//    demorava mais de 60s a responder ao pedido de planeamento, o fetch
//    ficava pendente indefinidamente (o botão nunca era re-activado).
//    SOLUÇÃO: AbortController com timeout de 55s.
//
// NOVO v3.0 (Custo progressivo por tamanho — Junho/2026):
//  Antes, um trabalho de 6 páginas e um de 30 páginas custavam exactamente
//  o mesmo (1 crédito fixo da Fase 1b), apesar do segundo consumir muito
//  mais tokens de IA. Isto foi corrigido com um modelo HÍBRIDO:
//    • 1 crédito é debitado ao iniciar (Fase 1b, como já acontecia) — cobre
//      o planeamento + as primeiras secções.
//    • A partir daí, o motor SOMA os caracteres de cada secção gerada.
//      Sempre que o total acumulado cruza um novo múltiplo de
//      CHARS_PER_EXTRA_CREDIT, é debitado AUTOMATICAMENTE +1 crédito extra
//      via /api/deduct-credit (mesmo endpoint já existente — nenhuma function
//      nova), e o saldo é validado ANTES de continuar para a secção seguinte.
//    • Se o utilizador não tiver créditos suficientes para a próxima secção,
//      o motor PÁRA de forma controlada e devolve o documento PARCIAL já
//      gerado (com as secções pagas) em vez de falhar tudo ou gerar conteúdo
//      que o utilizador não pagou.
//    • Cada dedução incremental fica registada em credit_logs com nota
//      explícita, para auditoria (quantos caracteres geraram aquele débito).

const ENDPOINT = '/api/generate-document';

// Serviços que activam geração longa
const LONG_DOC_SERVICES = new Set(['trabalho', 'planonegocio']);

// Limite — trabalhos acima deste nº de páginas usam o motor de cadeia
const PAGE_THRESHOLD = 6;

// Delay entre chamadas para não esgotar rate limit (ms)
const INTER_CALL_DELAY = 5000; // 5s entre chamadas para respeitar RPM dos providers

// ── Custo progressivo por tamanho ───────────────────────────────────────────
// Cada secção gerada soma caracteres a um contador acumulado. A cada
// CHARS_PER_EXTRA_CREDIT caracteres, debita-se +1 crédito. Valor calibrado
// para ~6.000 caracteres ≈ 1 página A4 de texto corrido em português formal
// (fonte 12pt, espaçamento 1.5) — ou seja, a cobrança extra acompanha
// aproximadamente 1 crédito por página adicional além do que o crédito
// inicial já cobre.
const CHARS_PER_EXTRA_CREDIT = 6000;

export class LongDocumentEngine {
  constructor() {
    this._onProgress = null;
    this._aborted    = false;
  }

  // NOVO (P1.2 — Master Hardening, Set/2026): estimativa de custo TOTAL
  // mostrada ao utilizador ANTES de gerar — ver comentário completo em
  // ServiceDefinitions.js (campo `progressiveEstimate` de trabalho/
  // planonegocio) e em DocumentController.js/Views.js (consumidores).
  //
  // PROBLEMA que isto substitui: "trabalho" tinha DOIS mecanismos de custo
  // independentes — um cálculo por páginas (dynamicCostPerPage:5, "1
  // crédito a cada 5 páginas") usado para a cobrança INICIAL, e este
  // CHARS_PER_EXTRA_CREDIT (progressivo, por caracteres realmente gerados)
  // cobrado DURANTE a geração. Um trabalho de 20 páginas mostrava/cobrava
  // inicialmente 4 créditos (20÷5) mas depois continuava a debitar mais
  // créditos progressivamente conforme o texto crescia — o utilizador
  // nunca via o custo total real antecipadamente, e podia legitimamente
  // achar que estava a pagar 4 créditos quando o total real rondava as 20.
  //
  // Correcção: uma ÚNICA fonte de verdade — o modelo progressivo por
  // caracteres, que é o que REALMENTE é cobrado (ver `generate()` acima e
  // api/_lib/pricingRegistry.js). Esta função só traduz esse modelo para
  // uma estimativa de páginas, usando a MESMA constante
  // CHARS_PER_EXTRA_CREDIT — se o valor de calibração mudar, a estimativa
  // mostrada ao utilizador acompanha automaticamente, sem precisar de
  // manter dois números sincronizados manualmente em dois ficheiros.
  //
  // É uma ESTIMATIVA, não um valor exacto: o comprimento real gerado pela
  // IA varia por tema/nível/idioma — por isso a UI que consome isto (ver
  // Views.js) mostra sempre "≈" e um aviso de que o valor pode variar.
  static estimateCredits(pages) {
    const p = Math.max(1, parseInt(pages) || 1);
    const totalCharsEstimate = p * CHARS_PER_EXTRA_CREDIT;
    const extraCredits = Math.max(0, Math.ceil((totalCharsEstimate - CHARS_PER_EXTRA_CREDIT) / CHARS_PER_EXTRA_CREDIT));
    return 1 + extraCredits; // 1 crédito inicial + progressão por página
  }

  /** Regista callback de progresso: fn({ phase, step, total, text }) */
  onProgress(fn) { this._onProgress = fn; return this; }

  /** Verifica se deve usar este motor */
  static isLongDoc(serviceType, formData) {
    if (!LONG_DOC_SERVICES.has(serviceType)) return false;
    if (serviceType === 'planonegocio') return true;
    const pages = parseInt(formData?.paginas || 0);
    return pages >= PAGE_THRESHOLD;
  }

  abort() { this._aborted = true; }

  _emit(data) { this._onProgress?.(data); }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── ENTRADA PRINCIPAL ──────────────────────────────────────────
  async generate(serviceType, formData, cost = 1) {
    this._aborted = false;

    // Obter token JWT uma vez — reutilizado em todas as chamadas
    let authToken = null;
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      authToken = await authManager.getValidToken();
      if (!authToken) {
        const e = new Error('AUTH_REQUIRED'); e.status = 401; throw e;
      }
    } catch (e) {
      throw e;
    }

    const chainHeaders = { 'Content-Type': 'application/json' };
    if (authToken) chainHeaders['Authorization'] = `Bearer ${authToken}`;

    // ── FASE 1: Planeamento (SEM debitar crédito ainda) ────────
    // BUG 1: o débito estava aqui em cima (Fase 0) antes do planeamento.
    // Moved aqui: apenas planeamos primeiro; se falhar, zero crédito perdido.
    this._emit({ phase: 'plan', step: 0, text: '📋 A planear estrutura do documento…' });

    let sections;
    let jobId = null;
    try {
      ({ sections, jobId } = await this._planDocument(serviceType, formData, chainHeaders));
    } catch (e) {
      console.warn('[LongDocEngine] Planeamento falhou (1ª tentativa):', e.message);
      // CORRIGIDO (Ago/2026 — bug "Não foi possível planear o documento"):
      // antes, qualquer falha de planeamento (incluindo um JSON mal formado
      // devolvido pela IA, o caso mais comum) ia direto para o erro final ao
      // utilizador, sem tentar de novo. Como nenhum crédito foi debitado
      // ainda nesta fase, uma 2ª tentativa é segura e resolve a maioria dos
      // casos — é normalmente um deslize de formatação pontual do modelo.
      try {
        this._emit({ phase: 'plan', step: 0, text: '📋 A tentar planear novamente…' });
        await this._sleep(1500);
        ({ sections, jobId } = await this._planDocument(serviceType, formData, chainHeaders));
      } catch (e2) {
        console.warn('[LongDocEngine] Planeamento falhou (2ª tentativa):', e2.message);
        throw new Error('Não foi possível planear o documento. Verifique a ligação e tente novamente.');
      }
    }

    if (this._aborted) throw new Error('Abortado pelo utilizador');
    if (!sections?.length) {
      throw new Error('O planeamento não devolveu secções válidas. Tente novamente.');
    }
    // NOVO (P1.1): sem jobId válido, nenhuma secção pode ser gerada — ver
    // validate_generation_job() no servidor (migration_v68).
    if (!jobId) {
      throw new Error('Não foi possível autorizar a geração deste documento. Tente novamente.');
    }

    // ── FASE 1b: Debitar crédito DEPOIS do planeamento ter sucesso ─
    // Agora que sabemos que o planeamento funcionou, debitamos o crédito.
    // Se este débito falhar, lançamos erro sem crédito perdido.
    this._emit({ phase: 'plan', step: 0, text: '💳 A verificar créditos…' });

    let creditsAfterDeduct = null;
    let wasFreeDocument = false;
    try {
      const deductRes = await fetch('/api/deduct-credit', {
        method: 'POST',
        headers: chainHeaders,
        body: JSON.stringify({ cost }),
      });

      if (deductRes.status === 402) {
        const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e;
      }
      if (deductRes.status === 401) {
        const e = new Error('Sessão expirada. Inicie sessão novamente.'); e.status = 401; throw e;
      }
      if (!deductRes.ok) {
        const d = await deductRes.json().catch(() => ({}));
        throw new Error(d.error || 'Erro ao verificar créditos.');
      }
      const deductData = await deductRes.json();
      creditsAfterDeduct = deductData.credits;
      // NOVO (v66): este documento longo foi coberto pelo mecanismo de
      // "documento grátis" — ver comentário equivalente em Services.js
      // (_callBackend) e CreditModel.consumeFreeDocument().
      wasFreeDocument = deductData.free === true;
    } catch (e) {
      throw e; // propaga erro de crédito/auth sem crédito perdido
    }

    // ── FASE 2: Geração sequencial de secções ──────────────────
    // A partir daqui o crédito já foi debitado. Qualquer falha nas Fases 2/3
    // deve tentar reembolsar via refund_credit (igual ao fluxo normal).
    //
    // NOVO v3.0 — custo progressivo: `charsSinceLastCharge` acumula os
    // caracteres gerados desde a última cobrança. Sempre que atinge
    // CHARS_PER_EXTRA_CREDIT, debitamos +1 crédito ANTES de avançar para a
    // secção seguinte. Se o saldo não chegar, paramos com o documento parcial
    // já gerado em vez de continuar a gerar conteúdo não pago.
    const generatedSections = [];
    const summaries         = [];
    const PROVIDERS         = ['groq', 'gemini', 'openrouter'];

    let charsSinceLastCharge = 0;
    let extraCreditsCharged  = 0;
    let wasTruncatedByCredits = false;
    let lastSectionIndexDone  = -1;

    try {
      for (let i = 0; i < sections.length; i++) {
        if (this._aborted) throw new Error('Abortado pelo utilizador');

        const section  = sections[i];
        const provider = PROVIDERS[i % PROVIDERS.length];

        this._emit({
          phase: 'generate',
          step:  i + 1,
          total: sections.length,
          text:  `✍️ Secção ${i + 1}/${sections.length}: ${section.title}…`,
          provider,
        });

        // Delay para não esgotar rate limit (excepto na primeira chamada)
        if (i > 0) await this._sleep(INTER_CALL_DELAY);
        if (this._aborted) throw new Error('Abortado pelo utilizador');

        const content = await this._generateSection(section, summaries, formData, chainHeaders, provider, jobId);
        generatedSections.push(content);
        lastSectionIndexDone = i;

        // Resumo compacto (máx. 80 palavras) para contexto das próximas secções
        const words = content.replace(/#{1,3}[^\n]*/g, '').split(/\s+/).filter(Boolean);
        summaries.push(`[${section.title}]: ${words.slice(0, 80).join(' ')}…`);

        // ── Custo progressivo: somar caracteres e cobrar por faixa atingida ─
        charsSinceLastCharge += content.length;

        if (charsSinceLastCharge >= CHARS_PER_EXTRA_CREDIT && i < sections.length - 1) {
          // Há mais secções a gerar e já passámos da faixa grátis acumulada
          // pelo crédito inicial — cobrar +1 crédito ANTES de continuar.
          this._emit({
            phase: 'generate',
            step:  i + 1,
            total: sections.length,
            text:  `💳 Documento a crescer — a cobrar +1 crédito adicional…`,
            provider,
          });

          const extraResult = await this._chargeExtraCredit(chainHeaders, serviceType, charsSinceLastCharge);

          if (extraResult.insufficientCredits) {
            // Saldo insuficiente para continuar: parar aqui de forma controlada
            // e devolver o documento PARCIAL já gerado (secções pagas).
            wasTruncatedByCredits = true;
            creditsAfterDeduct = extraResult.credits ?? creditsAfterDeduct;
            this._emit({
              phase: 'generate',
              step:  i + 1,
              total: sections.length,
              text:  `⚠️ Créditos esgotados — documento entregue até à secção ${i + 1}/${sections.length}.`,
              provider,
            });
            break;
          }

          extraCreditsCharged += 1;
          creditsAfterDeduct    = extraResult.credits;
          charsSinceLastCharge  = 0; // reiniciar contador da próxima faixa
        }
      }
    } catch (err) {
      // Fases 2/3 falharam após crédito debitado → tentar reembolso automático
      // do crédito INICIAL apenas (créditos extra já cobrados por secções já
      // entregues não são reembolsados — o utilizador já recebeu esse conteúdo
      // em generatedSections, mesmo que a função lance antes do `return`).
      // Se nenhuma secção chegou a ser gerada, reembolsamos tudo (inicial + extra).
      if (err.message !== 'Abortado pelo utilizador') {
        const refundAmount = lastSectionIndexDone === -1 ? (cost + extraCreditsCharged) : cost;
        try {
          await fetch('/api/deduct-credit', {
            method: 'POST',
            headers: chainHeaders,
            body: JSON.stringify({ refund: true, cost: refundAmount, documentType: serviceType }),
          });
          console.warn('[LongDocEngine] Crédito reembolsado após falha na geração.');
        } catch (refundErr) {
          console.warn('[LongDocEngine] Falha no reembolso:', refundErr.message);
        }
      }
      throw err;
    }

    if (this._aborted) throw new Error('Abortado pelo utilizador');

    // ── FASE 3: Montagem final (sem chamada adicional à IA) ────
    this._emit({ phase: 'assemble', text: '🔗 A montar documento final…' });

    // Se o documento ficou parcial (parou por falta de crédito), usar apenas
    // as secções efectivamente geradas e pagas para montar o índice/capa.
    const sectionsUsed = wasTruncatedByCredits
      ? sections.slice(0, lastSectionIndexDone + 1)
      : sections;

    const document = this._assemble(serviceType, formData, sectionsUsed, generatedSections);

    return {
      document,
      model:               'Cadeia de Geração · multi-provider',
      sections:            generatedSections.length,
      creditsRemaining:    creditsAfterDeduct, // valor real do servidor
      // NOVO (v66): só o débito INICIAL pode ser coberto pelo documento
      // grátis — créditos extra por tamanho (custo progressivo, acima)
      // usam sempre o saldo pago normal, nunca o mecanismo grátis.
      freeDocument:        wasFreeDocument,
      extraCreditsCharged,                     // quantos créditos extra foram cobrados pelo tamanho
      totalCreditsCharged: cost + extraCreditsCharged,
      truncatedByCredits:  wasTruncatedByCredits, // true se o documento ficou incompleto por falta de saldo
    };
  }

  // ── Custo progressivo: cobra +1 crédito extra durante a geração ────────
  // Reaproveita /api/deduct-credit (mesmo endpoint do débito inicial) — não
  // foi criada nenhuma function nova. Devolve { credits } em caso de sucesso
  // ou { insufficientCredits: true, credits } se o saldo não for suficiente.
  async _chargeExtraCredit(chainHeaders, serviceType, charsGenerated) {
    try {
      const res = await fetch('/api/deduct-credit', {
        method: 'POST',
        headers: chainHeaders,
        body: JSON.stringify({
          cost: 1,
          documentType: serviceType,
          // NOVO (P20 — Master Hardening): distingue explicitamente esta
          // cobrança incremental (sempre fixa em 1 crédito, por faixa de
          // ~6000 caracteres) da cobrança INICIAL de serviceType, que tem
          // um preço de catálogo diferente (ver api/_lib/pricingRegistry.js).
          // Sem isto, o servidor não teria como saber que este pedido não é
          // "o preço todo de trabalho/planonegocio outra vez".
          chargeType: 'extra_page',
          // Nota informativa — guardada em credit_logs.note no servidor não é
          // suportada directamente neste payload simples, por isso registamos
          // o motivo no console para diagnóstico; a auditoria de créditos via
          // RPC já identifica a acção como 'consume' com o documentType certo.
        }),
      });

      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        return { insufficientCredits: true, credits: typeof d.credits === 'number' ? d.credits : 0 };
      }
      if (!res.ok) {
        // Falha de rede/servidor ao cobrar o extra: por segurança, tratamos
        // como "não foi possível cobrar" e paramos a geração aqui em vez de
        // continuar a gerar conteúdo que pode não conseguir ser cobrado depois.
        console.warn('[LongDocEngine] Falha ao cobrar crédito extra (HTTP', res.status, ') — a parar geração.');
        return { insufficientCredits: true, credits: undefined };
      }

      const data = await res.json();
      console.log(`[LongDocEngine] +1 crédito extra cobrado (${charsGenerated} caracteres gerados desde a última cobrança). Saldo: ${data.credits}`);
      return { insufficientCredits: false, credits: data.credits };
    } catch (e) {
      console.warn('[LongDocEngine] Erro ao cobrar crédito extra:', e.message);
      return { insufficientCredits: true, credits: undefined };
    }
  }

  // ── FASE 1: PLANEAMENTO ────────────────────────────────────────
  async _planDocument(serviceType, formData, chainHeaders) {
    const userId = localStorage.getItem('mz_uid') || 'anon';
    const pages  = parseInt(formData?.paginas || 10);

    let planPrompt;

    if (serviceType === 'trabalho') {
      const numCaps = Math.max(2, Math.round((pages - 3) / 1.5));
      planPrompt = `Crie um índice para um trabalho académico de ${pages} páginas sobre "${formData.tema}" (${formData.disciplina}, ${formData.nivel}).\nResponda APENAS com JSON válido, sem texto antes ou depois:\n{"sections":[\n  {"id":"intro","title":"Introdução","words":${Math.round(pages * 60)},"type":"intro"},\n  ${Array.from({length: numCaps}, (_, i) => `{"id":"cap${i+1}","title":"[Título específico do capítulo ${i+1} sobre ${formData.tema}]","words":${Math.round(pages * 80)},"type":"body"}`).join(',')},\n  {"id":"conc","title":"Conclusão","words":${Math.round(pages * 50)},"type":"conclusion"},\n  {"id":"refs","title":"Referências Bibliográficas","words":300,"type":"references"}\n]}\nIMPORTANTE: Substitua [Título específico do capítulo N] por títulos REAIS e específicos ao tema "${formData.tema}". Não use títulos genéricos.`;

    } else if (serviceType === 'planonegocio') {
      planPrompt = `Crie um índice para Plano de Negócios de "${formData.nomeNegocio}" (${formData.sector}, ${formData.localNeg || formData.local || 'Moçambique'}).\nResponda APENAS com JSON válido, sem texto antes ou depois:\n{"sections":[\n  {"id":"exec","title":"Resumo Executivo","words":700,"type":"intro"},\n  {"id":"neg","title":"Descrição do Negócio","words":900,"type":"body"},\n  {"id":"merc","title":"Análise de Mercado","words":1100,"type":"body"},\n  {"id":"mkt","title":"Plano de Marketing","words":900,"type":"body"},\n  {"id":"op","title":"Plano Operacional","words":800,"type":"body"},\n  {"id":"fin","title":"Projecções Financeiras","words":1000,"type":"body"},\n  {"id":"ris","title":"Riscos e Mitigação","words":500,"type":"body"},\n  {"id":"conc","title":"Conclusão e Pedido de Apoio","words":400,"type":"conclusion"}\n]}`;
    }

    await this._sleep(500);

    // BUG 4 CORRIGIDO: timeout de 55s em _planDocument (era ilimitado)
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 55000);

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method:  'POST',
        headers: chainHeaders,
        signal:  ctrl.signal,
        body: JSON.stringify({
          serviceType: '__plan__',
          prompt:      planPrompt,
          userId,
          _planMode:   true,
          // NOVO (P1.1): nome real do serviço (trabalho/planonegocio) para
          // o job de geração criado no servidor — '__plan__' acima é só o
          // tipo do PROMPT (índice), não o serviço a autorizar.
          _chainService: serviceType,
        }),
      });
    } finally {
      clearTimeout(tid);
    }

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(`Planeamento falhou: ${d.error || res.status}`);
    }

    const data = await res.json();
    const raw  = (data.document || data.content || '').trim();

    // CORRIGIDO (Ago/2026 — bug "Não foi possível planear o documento"):
    // um JSON.parse directo falhava sempre que a IA devolvia JSON quase-
    // válido (aspas por escapar num título, vírgula a mais, ou a resposta
    // cortada a meio por atingir o limite de tokens). Isso lançava a
    // SyntaxError bruta do V8 ("Expected ',' or ']' after array element…"),
    // via console.warn no chamador, sem qualquer tentativa de recuperação.
    // _parseSectionsJson tenta o parse directo e, se falhar, tenta reparar
    // (aspas tipográficas, vírgulas a mais, objectos consecutivos sem
    // vírgula) e, por fim, "salva" as secções já bem formadas antes do
    // ponto onde a resposta se corrompeu/cortou, em vez de rejeitar tudo.
    const plan = this._parseSectionsJson(raw);
    if (!plan || !Array.isArray(plan.sections) || plan.sections.length === 0) {
      throw new Error('Plano sem secções');
    }

    return { sections: plan.sections, jobId: typeof data.jobId === 'string' ? data.jobId : null };
  }

  // ── Parser tolerante do JSON de planeamento ─────────────────────
  // Tenta, por ordem: (1) parse directo; (2) reparos comuns de formatação;
  // (3) salvar apenas as secções completas e bem formadas antes do ponto
  // de corrupção/corte, fechando a estrutura correctamente. Só falha (null)
  // se nenhuma secção válida puder ser recuperada — nesse caso quem chama
  // decide se tenta pedir o plano de novo.
  _parseSectionsJson(raw) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const jsonStr = jsonMatch[0];

    const tryParse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };

    // 1) Parse directo
    let plan = tryParse(jsonStr);
    if (plan) return plan;

    // 2) Reparos comuns: aspas tipográficas, vírgulas a mais antes de ]/},
    //    objectos consecutivos "}{"  sem vírgula entre eles.
    const fixed = jsonStr
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,(\s*[\]}])/g, '$1')
      .replace(/}(\s*){/g, '},$1{');

    plan = tryParse(fixed);
    if (plan) return plan;

    // 3) Salvar as secções completas antes do ponto de corrupção/corte
    return this._salvagePartialSections(jsonStr) || this._salvagePartialSections(fixed);
  }

  // Percorre "sections":[ ... ] carácter a carácter (respeitando strings e
  // escapes, para não contar chavetas dentro de texto) e devolve só os
  // objectos de secção que fecharam correctamente antes de a estrutura se
  // corromper ou a resposta ser cortada a meio.
  _salvagePartialSections(jsonStr) {
    const keyIdx = jsonStr.indexOf('"sections"');
    if (keyIdx === -1) return null;
    const bracketIdx = jsonStr.indexOf('[', keyIdx);
    if (bracketIdx === -1) return null;

    let depth = 0, inStr = false, esc = false, lastGoodEnd = -1;
    for (let i = bracketIdx + 1; i < jsonStr.length; i++) {
      const ch = jsonStr[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) lastGoodEnd = i; // fim de uma secção completa
      } else if (ch === ']' && depth === 0) {
        break; // fim normal do array
      }
    }

    if (lastGoodEnd === -1) return null;
    const sectionsStr = jsonStr.slice(bracketIdx + 1, lastGoodEnd + 1);
    const rebuilt = `{"sections":[${sectionsStr}]}`;
    try {
      const parsed = JSON.parse(rebuilt);
      // Exige pelo menos 2 secções salvas — um plano com 1 secção só
      // (ex.: cortou logo a seguir à introdução) não vale a pena aceitar,
      // é melhor voltar a tentar do zero do que gerar um documento minúsculo.
      if (Array.isArray(parsed.sections) && parsed.sections.length >= 2) return parsed;
    } catch (_) { /* não recuperável */ }
    return null;
  }

  // ── FASE 2: GERAR UMA SECÇÃO ───────────────────────────────────
  async _generateSection(section, previousSummaries, formData, chainHeaders, preferProvider, jobId) {
    const userId  = localStorage.getItem('mz_uid') || 'anon';
    const context = previousSummaries.length > 0
      ? `\n\nCONTEXTO DAS SECÇÕES ANTERIORES (para coerência — não repita):\n${previousSummaries.slice(-2).join('\n')}`
      : '';

    const prompt = this._buildSectionPrompt(section, formData, context);

    // Helper: fetch com timeout de 50s (abaixo do limite 60s do Vercel hobby)
    const fetchWithTimeout = (body) => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 50000);
      return fetch(ENDPOINT, {
        method:  'POST',
        headers: chainHeaders,
        signal:  ctrl.signal,
        body:    JSON.stringify(body),
      }).finally(() => clearTimeout(tid));
    };

    // Tentativa 1: com provider preferido
    try {
      const res = await fetchWithTimeout({
        serviceType:     '__section__',
        prompt,
        userId,
        _preferProvider: preferProvider,
        _sectionMode:    true,
        // NOVO (P1.1): job criado em _planDocument — obrigatório no
        // servidor (validate_generation_job(), migration_v68).
        _jobId:          jobId,
      });

      if (res.status === 429) {
        console.warn('[LongDocEngine] 429 na secção, aguardando 8s…');
        await this._sleep(8000);
        throw new Error('rate_limit');
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data    = await res.json();
      const content = (data.document || data.content || '').trim();
      if (!content) throw new Error('Resposta vazia');
      return content;

    } catch (err) {
      if (err.name === 'AbortError') throw err;

      // Tentativa 2: fallback sem preferência de provider
      console.warn(`[LongDocEngine] Secção "${section.title}" retry:`, err.message);
      await this._sleep(3000);

      const res2 = await fetchWithTimeout({
        serviceType:  '__section__',
        prompt,
        userId,
        _sectionMode: true,
        _jobId:       jobId,
      });

      if (!res2.ok) {
        const d = await res2.json().catch(() => ({}));
        throw new Error(d.error || `Secção "${section.title}" falhou (${res2.status})`);
      }

      const data2    = await res2.json();
      const content2 = (data2.document || data2.content || '').trim();
      if (!content2) throw new Error(`Secção "${section.title}" retornou vazia`);
      return content2;
    }
  }

  _buildSectionPrompt(section, formData, context) {
    const tema  = formData.tema || formData.nomeNegocio || 'documento';
    const words = section.words || 800;

    if (section.type === 'references') {
      return `Gere REFERÊNCIAS BIBLIOGRÁFICAS em formato APA 7.ª edição para um trabalho sobre "${tema}".\nListe exatamente 8 referências reais e verificáveis. Inclua: livros académicos, artigos científicos, relatórios de organizações internacionais (ONU, Banco Mundial, SADC) e fontes moçambicanas (INE, Governo de Moçambique, UEM).\nDevolva APENAS a lista de referências, começando com "## Referências Bibliográficas".\nNÃO inclua texto introdutório.${context}`;
    }

    // Limitar palavras para evitar 504: max 600 por secção em modo cadeia
    const effectiveWords = Math.min(words, 600);
    return `Redija a secção "${section.title}" de um documento profissional sobre "${tema}".\n\nREQUISITOS OBRIGATÓRIOS:\n- Entre ${effectiveWords} e ${effectiveWords + 200} palavras de conteúdo real\n- Linguagem formal em português de Moçambique\n- Use Markdown: ## para título da secção, ### para subsecções\n- Conteúdo específico ao tema "${tema}" — dados reais, exemplos concretos do contexto moçambicano/africano\n- NÃO escreva placeholders como [inserir dados] — escreva conteúdo real\n- Esta secção NÃO é o documento completo — escreva APENAS "${section.title}"\n${section.type === 'body' ? '- Inclua pelo menos 2 subsecções (###)' : ''}\n${context}\n\nCOMECE DIRECTAMENTE com "## ${section.title}" — sem introdução nem comentários.`;
  }

  // ── FASE 3: MONTAGEM FINAL (sem chamadas à IA) ─────────────────
  _assemble(serviceType, formData, sections, contents) {
    const coverPage = this._buildCoverPage(serviceType, formData, sections);
    const body      = contents.join('\n\n---PAGE_BREAK---\n\n');
    return coverPage ? `${coverPage}\n\n---PAGE_BREAK---\n\n${body}` : body;
  }

  _buildCoverPage(serviceType, formData, sections) {
    const ano = new Date().getFullYear();

    const indexLines = sections
      .map((s, i) => `   ${i + 1}. ${s.title} ${'·'.repeat(Math.max(2, 46 - s.title.length))} ${i + 3}`)
      .join('\n');

    if (serviceType === 'trabalho') {
      // CORRIGIDO: esta tabela estava CODIFICADA aqui com placeholders fixos
      // ("[Nome da Instituição de Ensino]", "[Nome Completo do Aluno]",
      // "[Nome do Professor]") em vez dos dados reais que o aluno já tinha
      // preenchido no formulário (formData.instituicao/aluno/docente/turma
      // — os mesmos campos que DocumentController._buildExportMetadata já
      // usa para os exportadores). Como PAGE_THRESHOLD = 6, qualquer
      // trabalho de 6+ páginas passava por aqui e a capa saía sempre errada
      // — não era a IA a ignorar o formato pedido, era este método a nunca
      // ter recebido os dados reais. Substituído por um bloco sem tabela
      // (mais fácil de exportar bem em PDF/Word) e sempre com os dados
      // reais; campos não preenchidos (todos são opcionais) são omitidos em
      // vez de aparecerem como placeholder. Mantido consistente com
      // CoverNormalizer.js (usado no caminho normal — <6 páginas — como
      // rede de segurança adicional caso a IA ainda assim reescreva algo
      // por cima deste bloco).
      const idFields = [
        formData.disciplina && ['Disciplina', formData.disciplina],
        formData.nivel        && ['Nível', formData.nivel],
        (formData.aluno || formData.nome) && ['Estudante', formData.aluno || formData.nome],
        formData.turma        && ['Turma/Classe', formData.turma],
        formData.docente      && ['Docente', formData.docente],
      ].filter(Boolean);
      const instituicao = (formData.instituicao || '').trim();
      const cidade = (formData.local || formData.cidade || 'Maputo').trim();

      const capaLines = [];
      if (instituicao) {
        capaLines.push('---', '', `**${instituicao.toUpperCase()}**`, '');
      }
      if (idFields.length) {
        capaLines.push('---', '', idFields.map(([l, v]) => `**${l}:** ${v}`).join('\n'), '');
      }
      capaLines.push(`${cidade}, ${ano}`);

      return `---PAGE_BREAK---
# ${formData.tema}

${capaLines.join('\n')}

---PAGE_BREAK---

## Índice

${indexLines}`;
    }

    if (serviceType === 'planonegocio') {
      return `---PAGE_BREAK---
# PLANO DE NEGÓCIOS
## ${formData.nomeNegocio}

| | |
|---|---|
| **Negócio / Empresa:** | ${formData.nomeNegocio} |
| **Sector:** | ${formData.sector} |
| **Proprietário(a):** | ${formData.proprietario} |
| **Localização:** | ${formData.localNeg || formData.local || 'Moçambique'} |
| **Investimento Inicial:** | ${Number(formData.investimento || 0).toLocaleString('pt-MZ')} MZN |
| **Data:** | ${new Date().toLocaleDateString('pt-MZ')} |

---PAGE_BREAK---

## Índice

${indexLines}`;
    }

    return '';
  }
}
