// api/_services/ocr.js — OCR-ANALYZE, proxy IA de transcrição de documentos
// (extraído de api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Move puro do bloco handleOcrAnalyze + helpers _safeJSON/_hasUsefulOcrResult
// — nenhuma lógica alterada. api/misc.js continua a ser o único entrypoint
// HTTP (rota /api/misc?action=ocr-analyze).
//
// P1-04/P2-03 (golden dataset): ver tests/fixtures/ocr/ e
// tests/ocrGoldenDataset.test.js — a bateria de regressão recomendada na
// auditoria de Ago/2026 para detectar quebras de qualidade quando este
// ficheiro ou o modelo de IA usado mudam.
// ──────────────────────────────────────────────────────────────────────────

const { checkRateLimit } = require('../_lib/rateLimit');
const { ORIGIN, parseBody } = require('../_lib/httpHelpers');
const { logEvent } = require('../_lib/observability');

async function handleOcrAnalyze(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  // CORRIGIDO (auditoria — P1-06, Ago/2026): handleOcrAnalyze processa até
  // 20 imagens por pedido através da IA de visão (custo real por chamada)
  // e nunca teve nenhum rate limit, ao contrário de verify-receipt e
  // legal-search — qualquer pessoa podia esgotar a quota diária dos
  // provedores de IA (Gemini/Groq) só com este endpoint, sem precisar de
  // pagar nada. Mesmo limite/janela do resto do fluxo de digitalização.
  const ocrIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!await checkRateLimit('ocr-analyze', ocrIp, { limit: 6, windowSec: 60 })) {
    return res.status(429).json({ error: 'Demasiados pedidos de digitalização. Aguarde um minuto e tente de novo.', code: 'RATE_LIMITED' });
  }

  const body = parseBody(req);
  const { ocrText = '', schema = [], serviceType = '', imageBase64, imagesBase64, mimeType } = body;
  if (!schema.length) return res.status(400).json({ error: 'schema required' });

  // NOVO: várias páginas do mesmo rascunho manuscrito (Trabalho Escolar) —
  // imagesBase64 é um array; mantém-se compatibilidade total com o fluxo de
  // 1 foto (imageBase64, string única) usado por todos os outros serviços.
  // CORRIGIDO: o limite estava fixo em 8 imagens para TODOS os serviços,
  // mas o frontend (OCRController → MAX_PAGES_BY_SERVICE) já permite até 25
  // páginas para "transcricao" (Digitalizar Documento) — o utilizador podia
  // enviar 9+ fotos e o backend descartava silenciosamente tudo a partir da
  // 9ª, sem avisar ninguém. Agora o limite acompanha o do frontend por
  // serviço (continua conservador nos outros serviços, que normalmente só
  // têm um rascunho pequeno).
  const MAX_IMAGES_BY_SERVICE = { transcricao: 20, trabalho: 8 };
  const maxImages = MAX_IMAGES_BY_SERVICE[serviceType] || 8;
  const images = Array.isArray(imagesBase64) && imagesBase64.length
    ? imagesBase64.slice(0, maxImages)
    : (imageBase64 ? [imageBase64] : []);
  const hasImage = images.length > 0 && !!mimeType?.startsWith('image/');
  const isMultiPage = images.length > 1;

  // CORRIGIDO (bug crítico de "não consegue ler manuscritos"): a transcrição
  // completa ("transcript") só era pedida quando havia MAIS DE 1 página
  // (isMultiPage). No serviço "transcricao" (Digitalizar Documento), o
  // utilizador pode perfeitamente digitalizar UMA única página de cada vez
  // — nesse caso, antes desta correcção, a IA nunca era instruída a
  // transcrever o conteúdo manuscrito, só a preencher o campo opcional
  // "titulo". Agora, sempre que o serviço for "transcricao", pedimos a
  // transcrição completa independentemente do nº de páginas enviadas.
  const wantsTranscript = isMultiPage || serviceType === 'transcricao';
  const _ocrStartedAt = Date.now();
  logEvent('ocr', 'started', { serviceType, pages: images.length, hasImage, wantsTranscript });

  const schemaDesc = schema.map(f => `- ${f.id}: "${f.label}" (${f.type})`).join('\n');

  // NOVO: com várias páginas (ou no serviço de digitalização/transcrição),
  // além de extrair os campos do formulário, pedimos também a TRANSCRIÇÃO
  // integral do texto manuscrito (em ordem de leitura, todas as páginas),
  // para servir de base ao documento final — sem isto, um rascunho só
  // contribuía com os metadados da capa (tema/nível/disciplina), perdendo
  // o conteúdo que o utilizador efectivamente escreveu.
  // CORRIGIDO (bug crítico de "inventa informação falsa" / "páginas
  // desaparecem"): a instrução anterior não dizia explicitamente ao modelo
  // para NÃO inventar conteúdo, nem pedia uma transcrição literal página a
  // página — com várias imagens densas de letra manuscrita, isso levava o
  // modelo, sob pressão do limite de tokens, a "desistir" de transcrever
  // literalmente e a preencher com texto genérico plausível mas inventado
  // (ex.: uma lista de frases soltas sobre a Bíblia que nunca esteve nas
  // fotos). Agora a instrução é explícita: transcrição literal, com
  // marcador por página, proibição clara de gerar conteúdo genérico/não
  // verificável, e uso de [ILEGÍVEL]/[PÁGINA N NÃO LEGÍVEL] em vez de
  // inventar quando a letra não dá para ler.
  const transcriptInstructions = wantsTranscript
    ? `\n- Além dos campos, transcreve TAMBÉM o texto manuscrito de TODAS as ${images.length > 1 ? `${images.length} páginas` : 'páginas'}, pela ordem em que foram fornecidas, para o campo "transcript".\n- REGRA ABSOLUTA: transcreve APENAS o que está literalmente escrito nas imagens. NUNCA acrescentes frases, ideias, listas ou conteúdo que não estejam fisicamente escritos na página — mesmo que o tema pareça religioso, académico ou familiar a um padrão comum, NÃO completes com frases genéricas do teu conhecimento geral. Isto é transcrição, não geração de texto.\n${images.length > 1 ? `- Usa um marcador "--- Página N ---" antes do texto de cada página, para as ${images.length} páginas fornecidas, na ordem em que foram enviadas.\n` : ''}- Se uma palavra, linha ou página inteira estiver ilegível, escreve exactamente [ILEGÍVEL] (ou [PÁGINA NÃO LEGÍVEL] se a página toda estiver impossível de ler) nesse ponto — nunca adivinhes nem substituas por conteúdo plausível.\n- Não resumas nem cortes conteúdo por a resposta estar a ficar longa — a transcrição TEM de cobrir todas as páginas fornecidas.\n`
    : '';
  const transcriptFormat = wantsTranscript ? `,"transcript":"texto completo transcrito de todas as páginas, com marcadores --- Página N --- se houver mais de uma"` : '';

  const userPrompt = `És um digitador/transcritor extremamente rigoroso de documentos moçambicanos, incluindo manuscritos. A tua única tarefa de transcrição é reproduzir fielmente o que está escrito — nunca gerar, resumir ou completar conteúdo por conta própria.\n${ocrText ? `TEXTO EXTRAÍDO DO DOCUMENTO:\n${ocrText.slice(0, 2000)}\n` : ''}\nTIPO DE DOCUMENTO: ${serviceType}\n\nCAMPOS A EXTRAIR:\n${schemaDesc}\n\nINSTRUÇÕES:\n- Analisa ${hasImage ? (isMultiPage ? `as ${images.length} imagens (páginas do mesmo rascunho, nesta ordem) e o texto` : 'a imagem e o texto') : 'o texto'} cuidadosamente, página a página\n- Para cada campo, extrai o valor exacto que aparece no documento\n- Se o campo não existir, inclui-o em "missing" (isto é normal e não é um erro — nem todos os documentos têm todos os campos)${transcriptInstructions}- Responde APENAS com JSON válido, sem markdown, sem explicações\n\nFORMATO OBRIGATÓRIO:\n{"fields":{"id_campo":{"value":"valor encontrado","confidence":0.95,"source":"ocr"}},"missing":["campo_ausente"]${transcriptFormat}}`;

  // CORRIGIDO: o limite de tokens estava fixo em 4000 independentemente do
  // número de páginas. Para 8-9 páginas de letra manuscrita densa, 4000
  // tokens de saída não chegam nem para metade do conteúdo — o modelo corta
  // a transcrição a meio (ou, sob essa pressão, começa a resumir/inventar
  // em vez de continuar a transcrever literalmente, o que explica tanto as
  // "páginas que desaparecem" como o conteúdo genérico/inventado a partir
  // de certo ponto). Agora escala com o nº de páginas.
  const maxTokens = wantsTranscript
    ? Math.min(8000, 1500 + images.length * 700)
    : 1500;

  // CORRIGIDO (causa da mensagem repetida "A imagem foi demasiado escura
  // para ler."): enviar várias páginas manuscritas TODAS JUNTAS numa única
  // chamada ao modelo de visão (como o código fazia até aqui) sobrecarrega
  // a atenção do modelo — com 7-9 imagens no mesmo pedido, modelos de visão
  // gratuitos (Gemini Flash, Groq llama-4-scout) tendem a "desistir" da
  // maioria das páginas e devolver uma desculpa genérica repetida, mesmo
  // quando o conteúdo é perfeitamente legível a olho nu numa imagem sozinha
  // (confirmado manualmente: as mesmas fotos, analisadas uma a uma, dão
  // ~90% de leitura). A correcção: para múltiplas páginas, faz-se AGORA UMA
  // CHAMADA DE IA POR PÁGINA (em vez de uma chamada só com todas as
  // imagens), cada uma com a atenção total do modelo dedicada a essa única
  // imagem, e no fim juntam-se as transcrições com marcadores "--- Página N
  // ---". Isto está também alinhado com o modelo de custo da app, que já
  // cobra por página digitalizada (dynamicCostPerPage) — ou seja, o custo
  // de fazer 1 chamada por página já era o esperado, só a implementação
  // técnica é que ainda ia tudo numa única chamada.
  const _sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));

  // NOVO: orçamento de tempo global para todo o pipeline de transcrição
  // multi-página. api/misc.js tem maxDuration:60s (ver vercel.json) — este
  // orçamento fica com margem de segurança (45s) para sobrar sempre tempo
  // de escrever a resposta antes da função serverless ser abatida a meio,
  // o que produziria um erro de rede genérico no browser em vez de uma
  // resposta (parcial que seja) com o que já foi conseguido transcrever.
  const _ocrDeadline = Date.now() + 45000;
  const _timeLeft = () => _ocrDeadline - Date.now();

  // NOVO (diagnóstico): antes, quando TODOS os fornecedores falhavam, a
  // única pista no cliente era "Não foi possível extrair dados" — sem
  // dizer se foi 429 (limite de pedidos), chave em falta, quota diária
  // esgotada, ou outro erro. Isto tornava impossível distinguir "bug no
  // código" de "quota gratuita esgotada por testes repetidos no mesmo
  // dia" (o cenário mais provável ao fim de várias rondas de teste
  // seguidas). Regista-se aqui um resumo por página/fornecedor, devolvido
  // ao cliente como "_debug" só quando o resultado final falha ou é
  // parcial — nunca visível na UI normal, mas aparece na consola do
  // browser (ver SmartOCRService.js) para diagnóstico rápido.
  const _ocrDebugLog = [];
  function _logOcrAttempt(label, info) { _ocrDebugLog.push(`${label}: ${info}`); }

  // CORRIGIDO (causa raiz das páginas "[ILEGÍVEL]" em cascata, sobretudo a
  // partir da página 3-4): a versão anterior desistia de cada página ao
  // primeiro 429/503 (limite de pedidos-por-minuto dos planos gratuitos do
  // Gemini/Groq), confiando só numa "ronda de recuperação" única e global
  // no fim — nessa altura, com 6-9 páginas a repetir o mesmo erro em maré,
  // muitas ainda caíam no mesmo limite de taxa e ficavam definitivamente
  // por ler. Agora cada página tenta o MESMO fornecedor até 2 vezes, com
  // pausa progressiva (backoff), antes de passar ao fornecedor seguinte —
  // dá tempo à janela de limite de pedidos-por-minuto da API se libertar
  // sem desistir logo da página.
  // NOVO — causa concreta da diferença de qualidade entre a leitura manual
  // (ex.: pedir a um assistente de IA de fronteira para ler as mesmas 9
  // fotos) e o resultado desta função: esta chamada estava presa em
  // `gemini-2.0-flash`, enquanto o resto do projecto (ver
  // `api/_lib/aiProviderRegistry.js`, linha `models: ['gemini-2.5-flash',
  // 'gemini-2.0-flash', 'gemini-1.5-flash']`) já usa `gemini-2.5-flash`
  // como preferido para geração de texto — só esta função de OCR
  // página-a-página, que é justamente a parte mais exigente (letra
  // cursiva/manuscrita), tinha ficado esquecida na versão mais antiga e
  // mais fraca. `gemini-2.5-flash` lê consideravelmente melhor letra
  // manuscrita do que `gemini-2.0-flash`, continua disponível na
  // quota gratuita da API Gemini, e usa a MESMA chave já configurada
  // (`GEMINI_API_KEY`) — não é preciso nenhuma conta nova nem custo
  // adicional. Isto não elimina a diferença de qualidade face a um modelo
  // de fronteira (ver nota mais detalhada no README, secção 12), mas é o
  // maior ganho disponível sem mudar de fornecedor.
  const _GEMINI_OCR_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  async function _callGeminiPage(img, pagePrompt, pageNum) {
    if (!process.env.GEMINI_API_KEY) { _logOcrAttempt(`Gemini p${pageNum}`, 'sem GEMINI_API_KEY configurada'); return null; }
    for (const model of _GEMINI_OCR_MODELS) {
      for (let attempt = 0; attempt < 2 && _timeLeft() > 4000; attempt++) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: img } }, { text: pagePrompt }] }], generationConfig: { maxOutputTokens: 2600, temperature: 0.1 } }) });
          if (r.ok) {
            const d = await r.json();
            const parsed = _safeJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
            if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Gemini p${pageNum} (${model})`, 'ok'); return parsed; }
            _logOcrAttempt(`Gemini p${pageNum} (${model})`, 'HTTP 200 mas sem conteúdo útil (resposta vazia/genérica)');
            break; // resposta válida mas sem conteúdo útil neste modelo — passa ao próximo modelo, não repete o mesmo
          }
          let bodyTxt = '';
          try { bodyTxt = (await r.text()).slice(0, 200); } catch (_) {}
          if (r.status === 429 || r.status === 503) {
            _logOcrAttempt(`Gemini p${pageNum} (${model})`, `HTTP ${r.status} (limite/indisponível) tentativa ${attempt + 1} — ${bodyTxt}`);
            if (attempt === 0 && _timeLeft() > 5000) { await _sleep(1500 + Math.random() * 800); continue; }
          } else {
            _logOcrAttempt(`Gemini p${pageNum} (${model})`, `HTTP ${r.status} — ${bodyTxt}`);
            console.warn(`[ocr-analyze] Gemini página ${pageNum} (${model}) status:`, r.status);
          }
          break; // este modelo falhou de forma não recuperável — tenta o próximo modelo da lista
        } catch (e) { _logOcrAttempt(`Gemini p${pageNum} (${model})`, `excepção: ${e.message}`); console.warn(`[ocr-analyze] Gemini página ${pageNum} (${model}) exception:`, e.message); break; }
      }
    }
    return null;
  }

  async function _callGroqPage(img, pagePrompt, pageNum) {
    if (!process.env.GROQ_API_KEY) { _logOcrAttempt(`Groq p${pageNum}`, 'sem GROQ_API_KEY configurada'); return null; }
    for (let attempt = 0; attempt < 2 && _timeLeft() > 4000; attempt++) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 2600, temperature: 0.1, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${img}` } }, { type: 'text', text: pagePrompt }] }] }),
        });
        if (r.ok) {
          const d = await r.json();
          if (!d.error) {
            const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
            if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Groq p${pageNum}`, 'ok'); return parsed; }
            _logOcrAttempt(`Groq p${pageNum}`, 'HTTP 200 mas sem conteúdo útil');
          } else {
            _logOcrAttempt(`Groq p${pageNum}`, `erro na resposta: ${d.error?.message || JSON.stringify(d.error).slice(0, 150)}`);
          }
          break;
        }
        let bodyTxt = '';
        try { bodyTxt = (await r.text()).slice(0, 200); } catch (_) {}
        if ((r.status === 429 || r.status === 503) && attempt === 0 && _timeLeft() > 5000) {
          _logOcrAttempt(`Groq p${pageNum}`, `HTTP ${r.status} (limite/indisponível) tentativa ${attempt + 1} — ${bodyTxt}`);
          await _sleep(1200 + Math.random() * 600); continue;
        }
        _logOcrAttempt(`Groq p${pageNum}`, `HTTP ${r.status} — ${bodyTxt}`);
        break;
      } catch (e) { _logOcrAttempt(`Groq p${pageNum}`, `excepção: ${e.message}`); console.warn(`[ocr-analyze] Groq página ${pageNum} exception:`, e.message); break; }
    }
    return null;
  }

  async function transcribeSinglePage(img, pageNum, totalPages) {
    const pagePrompt = `És um digitador/transcritor extremamente rigoroso de documentos moçambicanos, incluindo manuscritos. A tua única tarefa é reproduzir fielmente o que está escrito nesta imagem — nunca gerar, resumir ou completar conteúdo por conta própria.\n\nEsta é a página ${pageNum} de ${totalPages} de um mesmo rascunho/caderno manuscrito.\n\nTIPO DE DOCUMENTO: ${serviceType}\n${schema.length ? `\nSe algum destes campos aparecer NESTA página, extrai também:\n${schemaDesc}\n` : ''}\nINSTRUÇÕES:\n- Transcreve TODO o texto manuscrito visível nesta imagem, exactamente como está escrito, mantendo a ordem das linhas e parágrafos.\n- REGRA ABSOLUTA: transcreve APENAS o que está literalmente escrito. NUNCA acrescentes frases, ideias ou conteúdo que não estejam fisicamente na página, mesmo que o tema pareça familiar (religioso, académico, etc.).\n- Roda mentalmente a imagem se o texto estiver de lado ou invertido — o teu trabalho é ler o conteúdo, independentemente da orientação da fotografia.\n- Se uma palavra ou linha estiver ilegível, escreve [ILEGÍVEL] apenas nesse ponto e continua a transcrever o resto normalmente — não desistas da página inteira por causa de uma palavra difícil.\n- Só usa "[PÁGINA NÃO LEGÍVEL]" como transcrição se a imagem estiver GENUINAMENTE em branco, completamente fora de foco, ou sem nenhum texto visível — não uses isto apenas porque a letra é cursiva ou difícil; faz sempre o teu melhor esforço antes de desistir.\n- Responde APENAS com JSON válido, sem markdown, sem explicações.\n\nFORMATO OBRIGATÓRIO:\n{"fields":{"id_campo":{"value":"valor encontrado","confidence":0.95,"source":"ocr"}},"missing":[],"transcript":"texto completo desta página"}`;

    const gemini = await _callGeminiPage(img, pagePrompt, pageNum);
    if (gemini) return gemini;
    return await _callGroqPage(img, pagePrompt, pageNum);
  }

  async function transcribeAllPagesSeparately() {
    // CORRIGIDO: concorrência reduzida de 3 para 2 e desfasamento maior no
    // arranque de cada "trabalhador" (300ms → 700ms) — reduz ainda mais o
    // pico de pedidos/segundo contra os limites gratuitos do Gemini/Groq,
    // já que agora cada página também pode repetir até 2x sozinha.
    const CONCURRENCY = 2;
    const results = new Array(images.length).fill(null);
    let next = 0;
    async function worker(workerIndex) {
      await _sleep(workerIndex * 700); // desfasamento para suavizar o arranque
      while (next < images.length && _timeLeft() > 4000) {
        const i = next++;
        results[i] = await transcribeSinglePage(images[i], i + 1, images.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, (_, w) => worker(w)));

    // CORRIGIDO: em vez de UMA ronda de recuperação, agora são até DUAS,
    // cada uma com uma pausa maior que a anterior — a maioria das falhas
    // observadas eram picos de limite de taxa (429), não páginas realmente
    // ilegíveis, e uma pausa mais longa dá tempo à janela do limite se
    // libertar. Cada ronda respeita o orçamento de tempo global (_timeLeft)
    // para nunca arriscar ultrapassar o limite da função serverless.
    // NOVO: antes, uma página só era repetida nas rondas de recuperação se
    // `transcribeSinglePage` tivesse FALHADO (lançado erro/devolvido null).
    // Se a chamada tivesse sucesso técnico mas devolvesse um transcript
    // vazio/ilegível (ex.: foto desfocada, modelo desistiu à primeira), o
    // resultado ficava marcado como "concluído" e NUNCA tinha uma 2ª
    // chance — mesmo havendo tempo/orçamento de sobra e a causa mais
    // provável ser variação do modelo gratuito, não a imagem em si.
    // Agora tratamos como "ainda por resolver" tanto os `null` como os
    // resultados sem transcript real, para lhes dar a mesma 2ª e 3ª
    // oportunidade que já existia para os erros de rede/limite de taxa.
    const _isPageDone = (r) => !!(r && r.transcript && r.transcript.trim());

    for (const pauseMs of [1200, 2200]) {
      if (results.every(_isPageDone)) break;
      if (_timeLeft() < 6000) break;
      await _sleep(pauseMs);
      for (let i = 0; i < results.length; i++) {
        if (!_isPageDone(results[i]) && _timeLeft() > 4000) {
          results[i] = await transcribeSinglePage(images[i], i + 1, images.length);
        }
      }
    }

    const mergedFields = {};
    const missingSet = new Set(schema.map(f => f.id));
    const transcriptParts = [];
    let anyRealContent = false;
    results.forEach((r, i) => {
      if (r?.fields) {
        for (const [k, v] of Object.entries(r.fields)) {
          if (v?.value && !mergedFields[k]) { mergedFields[k] = v; missingSet.delete(k); }
        }
      }
      const pageText = (r?.transcript && r.transcript.trim()) ? r.transcript.trim() : '[PÁGINA NÃO LEGÍVEL]';
      if (pageText !== '[PÁGINA NÃO LEGÍVEL]') anyRealContent = true;
      transcriptParts.push(`--- Página ${i + 1} ---\n${pageText}`);
    });
    if (!anyRealContent) return null;
    return { fields: mergedFields, missing: Array.from(missingSet), transcript: transcriptParts.join('\n\n') };
  }

  // Para várias páginas com pedido de transcrição, tenta primeiro o
  // caminho página-a-página (mais fiável); só recorre ao pedido único com
  // todas as imagens juntas (código original abaixo) como último recurso.
  if (isMultiPage && wantsTranscript && (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY)) {
    const merged = await transcribeAllPagesSeparately();
    if (merged) {
      logEvent('ocr', 'success', { serviceType, pages: images.length, path: 'per_page', duration_ms: Date.now() - _ocrStartedAt });
      return res.status(200).json({ ...merged, _debug: _ocrDebugLog });
    }
  } else if (isMultiPage && wantsTranscript) {
    _logOcrAttempt('multi-página', 'nem GEMINI_API_KEY nem GROQ_API_KEY configuradas — a saltar directamente para o fallback combinado');
  }

  // ── Tentativas por provider (cada uma devolve o JSON parseado ou null) ──
  async function tryGroq() {
    if (!process.env.GROQ_API_KEY) { _logOcrAttempt('Groq (combinado)', 'sem GROQ_API_KEY configurada'); return null; }
    const visionModels = hasImage
      ? ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview', 'meta-llama/llama-4-maverick-17b-128e-instruct']
      : ['llama-3.3-70b-versatile'];
    for (const model of visionModels) {
      try {
        const content = hasImage
          ? [...images.map(img => ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${img}` } })), { type: 'text', text: userPrompt }]
          : userPrompt;
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.1, messages: [{ role: 'user', content }] }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.error) { _logOcrAttempt(`Groq (combinado, ${model})`, `erro: ${d.error?.message}`); console.warn('[ocr-analyze] Groq model error:', model, d.error?.message); continue; }
          const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
          if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Groq (combinado, ${model})`, 'ok'); return parsed; }
          _logOcrAttempt(`Groq (combinado, ${model})`, 'HTTP 200 mas sem conteúdo útil');
        } else {
          _logOcrAttempt(`Groq (combinado, ${model})`, `HTTP ${r.status}`);
        }
      } catch (e) { _logOcrAttempt(`Groq (combinado, ${model})`, `excepção: ${e.message}`); console.warn('[ocr-analyze] Groq exception:', model, e.message); }
    }
    return null;
  }

  async function tryGemini() {
    if (!process.env.GEMINI_API_KEY) { _logOcrAttempt('Gemini (combinado)', 'sem GEMINI_API_KEY configurada'); return null; }
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']) {
      try {
        const parts = [];
        if (hasImage) images.forEach(img => parts.push({ inline_data: { mime_type: mimeType, data: img } }));
        parts.push({ text: userPrompt });
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 } }) });
        if (r.ok) {
          const d = await r.json();
          const parsed = _safeJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          if (_hasUsefulOcrResult(parsed)) { _logOcrAttempt(`Gemini (combinado, ${model})`, 'ok'); return parsed; }
          _logOcrAttempt(`Gemini (combinado, ${model})`, 'HTTP 200 mas sem conteúdo útil');
        } else {
          _logOcrAttempt(`Gemini (combinado, ${model})`, `HTTP ${r.status}`);
        }
      } catch (e) { _logOcrAttempt(`Gemini (combinado, ${model})`, `excepção: ${e.message}`); console.warn('[ocr-analyze] Gemini exception:', e.message); }
    }
    return null;
  }

  // CORRIGIDO (causa principal do conteúdo inventado/páginas em falta):
  // a ordem anterior tentava sempre Groq primeiro, mesmo para leitura de
  // manuscritos com várias páginas — os modelos de visão gratuitos do Groq
  // (llama-4-scout, llama-3.2-vision) são bons para documentos impressos
  // simples, mas muito menos fiáveis do que o Gemini a interpretar várias
  // imagens de letra manuscrita em simultâneo, tendendo a "compensar" com
  // texto genérico quando não consegue ler bem. Para pedidos com imagem(ns)
  // que precisem de transcrição (manuscritos/"transcricao"), tenta-se agora
  // o Gemini primeiro; para os restantes casos (extracção simples de campos
  // de 1 documento impresso), mantém-se a ordem original (Groq primeiro,
  // que é mais rápido/barato e já funcionava bem para esses casos).
  const preferGeminiFirst = hasImage && wantsTranscript;
  const providers = preferGeminiFirst ? [tryGemini, tryGroq] : [tryGroq, tryGemini];
  for (const tryProvider of providers) {
    const parsed = await tryProvider();
    if (parsed) {
      logEvent('ocr', 'success', { serviceType, pages: images.length, path: 'combined', duration_ms: Date.now() - _ocrStartedAt });
      return res.status(200).json(parsed);
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const content = hasImage
        ? [...images.map(img => ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${img}` } })), { type: 'text', text: userPrompt }]
        : userPrompt;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': SITE_URL },
        body: JSON.stringify({ model: hasImage ? 'meta-llama/llama-4-scout' : 'meta-llama/llama-3.3-70b-instruct', max_tokens: maxTokens, temperature: 0.1, messages: [{ role: 'user', content }] }),
      });
      if (r.ok) {
        const d = await r.json();
        const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
        if (_hasUsefulOcrResult(parsed)) {
          _logOcrAttempt('OpenRouter (combinado)', 'ok');
          logEvent('ocr', 'fallback_model', { serviceType, provider: 'openrouter' });
          logEvent('ocr', 'success', { serviceType, pages: images.length, path: 'openrouter_fallback', duration_ms: Date.now() - _ocrStartedAt });
          return res.status(200).json(parsed);
        }
        _logOcrAttempt('OpenRouter (combinado)', 'HTTP 200 mas sem conteúdo útil');
      } else {
        _logOcrAttempt('OpenRouter (combinado)', `HTTP ${r.status}`);
      }
    } catch (e) { _logOcrAttempt('OpenRouter (combinado)', `excepção: ${e.message}`); console.warn('[ocr-analyze] OpenRouter:', e.message); }
  } else {
    _logOcrAttempt('OpenRouter (combinado)', 'sem OPENROUTER_API_KEY configurada');
  }

  console.error('[ocr-analyze] Todos os providers falharam.', _ocrDebugLog.join(' | '));
  logEvent('ocr', 'failed', {
    serviceType, pages: images.length, duration_ms: Date.now() - _ocrStartedAt,
    debug: _ocrDebugLog.slice(-5), // últimas tentativas só, para não inchar o payload
  });
  return res.status(200).json({ fields: {}, missing: schema.map(f => f.id), _debug: _ocrDebugLog });
}

function _safeJSON(raw) {
  const cleaned = (raw || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  // CORRIGIDO: com transcrições longas (várias páginas), a resposta do
  // modelo por vezes é cortada mesmo com maxTokens generoso (ex.: o modelo
  // ainda estava a meio da última página quando atingiu o limite), o que
  // deixa o JSON tecnicamente inválido (aspas/chavetas por fechar) — antes
  // isto fazia o parse falhar por completo e perdia-se TUDO, incluindo as
  // páginas anteriores já bem transcritas. Este salvamento tenta recuperar
  // pelo menos o conteúdo de "transcript" já gerado antes do corte, em vez
  // de descartar a resposta inteira.
  const tMatch = cleaned.match(/"transcript"\s*:\s*"/);
  if (tMatch) {
    const start = tMatch.index + tMatch[0].length;
    let text = '', i = start, closed = false;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (ch === '\\' && i + 1 < cleaned.length) { text += cleaned[i + 1]; i += 2; continue; }
      if (ch === '"') { closed = true; break; }
      text += ch; i++;
    }
    if (text.trim()) {
      return { fields: {}, missing: [], transcript: text + (closed ? '' : ' [TEXTO CORTADO — tente com menos páginas de cada vez]') };
    }
  }
  return null;
}

// CORRIGIDO (bug crítico): antes, uma resposta só era aceite como válida se
// `fields` tivesse pelo menos 1 campo preenchido — `if (parsed?.fields &&
// Object.keys(parsed.fields).length > 0)`. Isto DESCARTAVA respostas
// perfeitamente válidas sempre que a IA não encontrava nenhum dos campos do
// formulário (ex.: notas manuscritas sem um "título" claro, para o serviço
// "transcricao"/Digitalizar Documento), MESMO QUE a IA tivesse conseguido
// transcrever todo o texto manuscrito no campo "transcript". O resultado:
// o texto transcrito era deitado fora, o pipeline caía no fallback final
// ({fields:{}, missing:[...]}, sem "transcript"), e o utilizador via
// "Não foi possível extrair dados. Preencha manualmente" mesmo quando a
// leitura do manuscrito tinha, na realidade, funcionado.
//
// Agora uma resposta é considerada válida (e devolvida) se tiver PELO MENOS
// UM dos dois: campos preenchidos OU uma transcrição não-vazia.
function _hasUsefulOcrResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const hasFields     = !!parsed.fields && Object.keys(parsed.fields).length > 0;
  const hasTranscript = typeof parsed.transcript === 'string' && parsed.transcript.trim().length > 0;
  return hasFields || hasTranscript;
}

// ════════════════════════════════════════════════════════════════════════════
// LEGAL-SEARCH — busca semântica de artigos de lei (Fase 2: Motor Jurídico)
// POST /api/legal-search
//
// Substitui as citações estáticas (hard-coded) nos prompts de
// assets/js/services/prompts/{arrendamento,requerimento,residencia,
// procuracao,acta}.js por artigos REAIS recuperados da base vectorial —
// ver docs/legal/VERIFICACAO-LEGAL.md para o histórico de erros que esta
// mudança visa evitar (citações de leis inexistentes, artigos trocados).
//
// O frontend chama isto ANTES de montar o prompt final para
// generate-document.js, e injecta o resultado na secção "BASE LEGAL" —
// ver assets/js/services/LegalContext.js.
// ════════════════════════════════════════════════════════════════════════════

// CORRIGIDO (auditoria, ponto 5): mesmo problema do checkReceiptRateLimit
// — Map local não confiável em ambiente serverless. Ver api/_lib/rateLimit.js.

module.exports = { handleOcrAnalyze, _safeJSON, _hasUsefulOcrResult };
