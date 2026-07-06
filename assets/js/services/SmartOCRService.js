// assets/js/services/SmartOCRService.js — v4.0
// Abordagem: IA visual primeiro (Groq/Gemini), Tesseract apenas como complemento
// Sem dependência de download de modelos de língua — funciona offline e com rede lenta

export class SmartOCRService {
  constructor() {
    this._tesseractLoaded = false;
    this._worker = null;
  }

  // ── Tipo de ficheiro ───────────────────────────────────────────
  _getFileCategory(file) {
    const mime = file.type.toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (mime.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return 'word';
    return 'unknown';
  }

  // ── Pipeline principal ─────────────────────────────────────────
  async extractFields(file, serviceType, onProgress) {
    const category = this._getFileCategory(file);
    let text = '', confidence = 0, base64 = null;

    try {
      if (category === 'pdf') {
        if (onProgress) onProgress(20, 'A ler PDF…');
        const r = await this._extractPdfText(file, onProgress);
        text = r.text; confidence = r.confidence;

      } else if (category === 'word') {
        if (onProgress) onProgress(20, 'A ler Word…');
        const r = await this._extractWordText(file, onProgress);
        text = r.text; confidence = r.confidence;

      } else {
        // IMAGEM: comprimir + enviar à IA visual directamente
        // Tesseract é opcional e corre em paralelo — não bloqueia
        if (onProgress) onProgress(15, 'A preparar imagem…');
        base64 = await this._compressImage(file);

        // Tentar Tesseract em paralelo (não esperar se demorar > 8s)
        const tesseractPromise = this._runTesseract(file, onProgress)
          .then(r => { text = r.text; confidence = r.confidence; })
          .catch(() => {}); // silencioso — IA visual substitui

        const timeout = new Promise(r => setTimeout(r, 8000));
        await Promise.race([tesseractPromise, timeout]);
        if (onProgress) onProgress(80, 'A analisar com IA…');
      }
    } catch (err) {
      console.warn('[SmartOCR] Extracção falhou:', err.message);
      if (category === 'image') {
        base64 = await this._compressImage(file).catch(() => null);
      }
    }

    if (onProgress) onProgress(88, 'A preencher campos com IA…');

    const schema = this._getFieldSchema(serviceType);
    if (!schema.length) return { rawText: text, confidence, fields: {}, missing: [] };

    try {
      const mimeType = base64?.startsWith('data:')
        ? base64.split(';')[0].replace('data:', '')
        : 'image/jpeg';
      const result = await this._analyzeWithAI(base64, mimeType, text, schema, serviceType);
      if (onProgress) onProgress(100, 'Concluído!');
      return { rawText: text, confidence, ...result };
    } catch (err) {
      console.warn('[SmartOCR] IA falhou:', err.message);
      return { rawText: text, confidence, fields: {}, missing: schema.map(f => f.id) };
    }
  }

  // ── Pipeline para VÁRIAS páginas do mesmo rascunho (só Trabalho Escolar) ──
  // NOVO: em vez de N chamadas separadas (N× custo de IA), comprime todas as
  // imagens e envia-as TODAS numa única chamada de visão — o modelo lê as
  // páginas na ordem em que foram tiradas/seleccionadas e trata-as como um
  // documento contínuo. Sem Tesseract aqui (só complementa uma imagem única
  // e tornaria N páginas lento sem benefício real — a IA visual já é o
  // caminho principal mesmo no fluxo de 1 foto).
  async extractFieldsMulti(files, serviceType, onProgress) {
    if (onProgress) onProgress(10, `A preparar ${files.length} páginas…`);
    const images = [];
    for (let i = 0; i < files.length; i++) {
      const base64 = await this._compressImage(files[i]).catch(() => null);
      if (base64) images.push(base64);
      if (onProgress) onProgress(10 + Math.round(((i + 1) / files.length) * 40), `A preparar página ${i + 1}/${files.length}…`);
    }
    if (!images.length) return { rawText: '', confidence: 0, fields: {}, missing: [] };

    if (onProgress) onProgress(60, 'A analisar todas as páginas com IA…');
    const schema = this._getFieldSchema(serviceType);
    if (!schema.length) return { rawText: '', confidence: 0, fields: {}, missing: [] };

    try {
      const result = await this._analyzeWithAI(images, 'image/jpeg', '', schema, serviceType);
      if (onProgress) onProgress(100, 'Concluído!');
      const { transcript, ...rest } = result || {};
      return { rawText: transcript || '', confidence: transcript ? 70 : 0, ...rest };
    } catch (err) {
      console.warn('[SmartOCR] IA (multi-página) falhou:', err.message);
      return { rawText: '', confidence: 0, fields: {}, missing: schema.map(f => f.id) };
    }
  }


  _compressImage(file, maxPx = 1200, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        // fallback: FileReader
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      };
      img.src = url;
    });
  }

  // ── Tesseract (opcional, complementar) ────────────────────────
  async _runTesseract(file, onProgress) {
    await this._loadTesseract();
    if (this._worker) {
      try { await this._worker.terminate(); } catch (_) {}
      this._worker = null;
    }

    // Tentar com Português, fallback Inglês
    let worker;
    try {
      worker = await Tesseract.createWorker('por', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress)
            onProgress(15 + Math.round(m.progress * 50), `OCR ${Math.round(m.progress * 100)}%…`);
        }
      });
    } catch (_) {
      worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress)
            onProgress(15 + Math.round(m.progress * 50), `OCR ${Math.round(m.progress * 100)}%…`);
        }
      });
    }
    this._worker = worker;

    // Testar 4 rotações — documentos de lado são comuns em mobile
    const rotations = [0, 90, 270, 180];
    let bestText = '', bestConf = 0;

    for (const deg of rotations) {
      const blob = await this._rotateAndResize(file, deg, 1600);
      const url = URL.createObjectURL(blob);
      try {
        const res = await this._worker.recognize(url);
        const conf = Math.round(res.data.confidence);
        const txt  = res.data.text.trim();
        if (conf > bestConf && txt.length > 5) {
          bestConf = conf; bestText = txt;
        }
        if (bestConf >= 65) break; // rotação boa encontrada
      } finally { URL.revokeObjectURL(url); }
    }

    return { text: bestText, confidence: bestConf };
  }

  // ── Rodar + redimensionar imagem no canvas ────────────────────
  _rotateAndResize(file, degrees, maxPx = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(typeof file === 'string' ? null : file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const rad  = (degrees * Math.PI) / 180;
        const swap = degrees === 90 || degrees === 270;
        const W = swap ? img.height : img.width;
        const H = swap ? img.width  : img.height;
        const scale = Math.min(1, maxPx / Math.max(W, H));
        const cw = Math.round(W * scale), ch = Math.round(H * scale);
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(rad);
        ctx.scale(scale, scale);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load error')); };
      img.src = URL.createObjectURL(file);
    });
  }

  // ── Carregar Tesseract.js do CDN ──────────────────────────────
  async _loadTesseract() {
    if (this._tesseractLoaded || window.Tesseract) { this._tesseractLoaded = true; return; }
    for (const src of [
      'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.2/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@5.0.2/dist/tesseract.min.js',
    ]) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = src; s.onload = () => { this._tesseractLoaded = true; res(); };
          s.onerror = () => rej(new Error('CDN falhou: ' + src));
          document.head.appendChild(s);
        });
        return;
      } catch (_) {}
    }
    throw new Error('Tesseract indisponível');
  }

  // ── Extracção de PDF ──────────────────────────────────────────
  async _extractPdfText(file, onProgress) {
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    if (onProgress) onProgress(30, 'A ler páginas do PDF…');
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let fullText = '';
    // CORRIGIDO: limite era de 5 páginas — insuficiente para apontamentos/
    // rascunhos de Trabalho Escolar mais extensos, que podiam ficar truncados
    // antes mesmo de chegar ao conteúdo central. Aumentado para 15 páginas,
    // mantendo um tecto razoável de tempo/memória para os demais serviços.
    for (let i = 1; i <= Math.min(pdf.numPages, 15); i++) {
      const page = await pdf.getPage(i);
      const ct = await page.getTextContent();
      fullText += ct.items.map(s => s.str).join(' ') + '\n';
      if (onProgress) onProgress(30 + Math.round((i / pdf.numPages) * 50), `Página ${i}/${pdf.numPages}…`);
    }
    return { text: fullText.trim(), confidence: 90 };
  }

  // ── Extracção de Word ─────────────────────────────────────────
  async _extractWordText(file, onProgress) {
    if (!window.mammoth) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    if (onProgress) onProgress(50, 'A extrair texto do Word…');
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value.trim(), confidence: 95 };
  }

  // ── Chamada ao backend IA ─────────────────────────────────────
  // `base64OrArray`: uma única string base64 (fluxo normal, 1 foto) ou um
  // array de strings base64 (NOVO: várias páginas do mesmo rascunho).
  async _analyzeWithAI(base64OrArray, mimeType, ocrText, schema, serviceType) {
    const body = { ocrText: ocrText || '', schema, serviceType };
    const isMulti = Array.isArray(base64OrArray);
    if (isMulti && base64OrArray.length && mimeType?.startsWith('image/')) {
      body.imagesBase64 = base64OrArray.map(b => b.includes(',') ? b.split(',')[1] : b);
      body.mimeType      = mimeType;
    } else if (!isMulti && base64OrArray && mimeType?.startsWith('image/')) {
      body.imageBase64 = base64OrArray.includes(',') ? base64OrArray.split(',')[1] : base64OrArray;
      body.mimeType    = mimeType;
    }
    const res = await fetch('/api/ocr-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[SmartOCR] /api/ocr-analyze:', res.status);
      return { fields: {}, missing: schema.map(f => f.id) };
    }
    return res.json();
  }

  // ── Aplicar campos ao formulário ──────────────────────────────
  applyToForm(fields, formElement) {
    if (!fields || !formElement) return 0;
    let applied = 0;
    Object.entries(fields).forEach(([id, data]) => {
      if (!data?.value) return;
      const el = formElement.querySelector(`[name="${id}"]`)
               || formElement.querySelector(`#${id}`)
               || formElement.querySelector(`[data-field="${id}"]`);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        const val = data.value.toLowerCase();
        const opt = [...el.options].find(o =>
          o.value.toLowerCase().includes(val) || o.text.toLowerCase().includes(val));
        if (opt) el.value = opt.value;
      } else {
        el.value = data.value;
      }
      el.style.borderColor = data.source === 'ocr' ? '#22c55e' : '#f59e0b';
      el.title = data.source === 'ocr'
        ? `✓ Extraído (${Math.round((data.confidence||0)*100)}%)`
        : `⚠ Sugerido IA (${Math.round((data.confidence||0)*100)}%)`;
      applied++;
    });
    return applied;
  }

  // ── Schemas de campos por serviço ─────────────────────────────
  _getFieldSchema(serviceType) {
    const S = {
      // CORRIGIDO: faltavam 'perfilCV' e 'exemplo' — existem no formulário
      // mas nunca eram extraídos, mesmo sendo inferíveis do conteúdo do CV
      // (ex.: perfil pode ser inferido pela quantidade de experiência
      // listada; exemplo é frequentemente mencionado em CVs reais).
      cv:          [
        { id:'nome',        label:'Nome Completo',            type:'text' },
        { id:'cargo',       label:'Cargo / Vaga pretendida',  type:'text' },
        { id:'perfilCV',    label:'Perfil do Candidato',      type:'select' },
        { id:'contacto',    label:'Telefone',                 type:'tel' },
        { id:'email',       label:'Email',                    type:'email' },
        { id:'nascimento',  label:'Data de Nascimento',       type:'text' },
        { id:'localizacao', label:'Cidade / Bairro',          type:'text' },
        { id:'formacao',    label:'Formação Académica',       type:'textarea' },
        { id:'experiencia', label:'Experiência Profissional', type:'textarea' },
        { id:'linguas',     label:'Línguas',                  type:'text' },
        { id:'habilidades', label:'Habilidades',              type:'textarea' },
        { id:'exemplo',     label:'Realização ou Projecto que se destaca', type:'textarea' },
        { id:'objectivo',   label:'Objectivo Profissional',   type:'text' },
      ],
      // CORRIGIDO: faltava 'tipo' (Tipo de Carta — select), e os campos
      // condicionais 'refReclamacao', 'dataSaida' e 'avisoPrevio', que só
      // aparecem no formulário dependendo do tipo escolhido mas podem
      // estar presentes no documento original (ex.: uma carta de demissão
      // já enviada antes costuma indicar a data de saída).
      carta:       [
        { id:'tipo',             label:'Tipo de Carta',        type:'select' },
        { id:'remetenteNome',    label:'Nome do Remetente',    type:'text' },
        { id:'remetenteLocal',   label:'Localidade / Data',    type:'text' },
        { id:'destinatarioNome', label:'Nome do Destinatário', type:'text' },
        { id:'destinatarioEnti', label:'Entidade / Empresa',   type:'text' },
        { id:'assunto',          label:'Assunto',              type:'text' },
        { id:'pontos',           label:'O que pretende comunicar', type:'textarea' },
        { id:'refReclamacao',    label:'N.º de referência / encomenda (se for reclamação)', type:'text' },
        { id:'dataSaida',        label:'Data de saída pretendida (se for demissão)', type:'text' },
        { id:'avisoPrevio',      label:'Aviso prévio cumprido? (se for demissão)', type:'select' },
      ],
      // CORRIGIDO: ids alinhados com ServiceDefinitions.js → residencia.fields
      // (requerente/bairro/rua/cidade/tempoCasas/chefeBairro), que são os ids
      // realmente presentes no DOM do formulário. Antes este schema usava
      // declarante/nascimento/naturalidade/endereco — ids que NUNCA existiram
      // no formulário — por isso applyToForm() não encontrava os elementos
      // (document.querySelector(`#declarante`) etc. retornava null) e só os
      // 3 campos coincidentes por acaso (bi/finalidade/local) eram preenchidos.
      residencia:  [
        { id:'requerente',  label:'Nome do Requerente',                       type:'text' },
        { id:'bi',          label:'Nº do BI',                                 type:'text' },
        { id:'bairro',      label:'Nome do Bairro',                           type:'text' },
        { id:'rua',         label:'Rua / Avenida',                            type:'text' },
        { id:'cidade',      label:'Cidade / Distrito',                        type:'text' },
        { id:'tempoCasas',  label:'Há quanto tempo reside no local',          type:'select' },
        { id:'finalidade',  label:'Finalidade da Declaração',                 type:'text' },
        { id:'chefeBairro', label:'Nome do Chefe de Quarteirão / Secretário', type:'text' },
        { id:'local',       label:'Local e Data',                             type:'text' },
      ],
      // CORRIGIDO: faltavam 'tipoImovel', 'metodoPagamento', 'duracao' e
      // 'quemPagaServicos' — existem no formulário (todos select) mas
      // nunca eram extraídos, mesmo sendo frequentemente mencionados num
      // contrato de arrendamento já existente que o utilizador fotografe.
      arrendamento:[
        { id:'tipoImovel',      label:'Tipo de Imóvel',        type:'select' },
        { id:'proprietario',    label:'Nome do Proprietário',  type:'text' },
        { id:'locatario',       label:'Nome do Locatário',     type:'text' },
        { id:'biProprietario',  label:'BI do Proprietário',    type:'text' },
        { id:'biLocatario',     label:'BI do Locatário',       type:'text' },
        { id:'local',           label:'Localização do Imóvel', type:'text' },
        { id:'valor',           label:'Valor Mensal (MZN)',    type:'number' },
        { id:'metodoPagamento', label:'Método de Pagamento da Renda', type:'select' },
        { id:'duracao',         label:'Duração do Contrato',   type:'select' },
        { id:'caucao',          label:'Caução / Depósito',     type:'text' },
        { id:'quemPagaServicos',label:'Água e Electricidade pagas por', type:'select' },
        { id:'condicoes',       label:'Condições Especiais',   type:'textarea' },
      ],
      // CORRIGIDO: faltavam 'tipoProc', 'tipoDocIdent', 'subMandato' e
      // 'validade' — todos campos select que existem no formulário e são
      // frequentemente explícitos no texto de uma procuração já existente.
      procuracao:  [
        { id:'tipoProc',         label:'Tipo de Procuração',      type:'select' },
        { id:'outorgante',       label:'Nome do Outorgante',      type:'text' },
        { id:'biOutorgante',     label:'BI do Outorgante',        type:'text' },
        { id:'moradaOutorgante', label:'Morada do Outorgante',    type:'textarea' },
        { id:'procurador',       label:'Nome do Procurador',      type:'text' },
        { id:'biProcurador',     label:'BI do Procurador',        type:'text' },
        { id:'moradaProcurador', label:'Morada do Procurador',    type:'textarea' },
        { id:'tipoDocIdent',     label:'Tipo de documento de identidade', type:'select' },
        { id:'acto',             label:'Acto / Finalidade',       type:'textarea' },
        { id:'subMandato',       label:'Pode substabelecer?',     type:'select' },
        { id:'validade',         label:'Validade',                type:'select' },
        { id:'local',            label:'Local e Data',            type:'text' },
      ],
      // CORRIGIDO: id 'fundamento' não existia no formulário (o campo real
      // chama-se 'justificacao' — ver ServiceDefinitions.js → requerimento.
      // fields). Também faltavam 'tipo' e 'contacto', que existem no
      // formulário mas nunca eram preenchidos pelo OCR.
      requerimento:[
        { id:'tipo',        label:'Tipo de Requerimento', type:'select' },
        { id:'requerente',  label:'Nome do Requerente', type:'text' },
        { id:'bi',          label:'BI do Requerente',   type:'text' },
        { id:'entidade',    label:'Entidade',           type:'text' },
        { id:'assunto',     label:'Assunto',            type:'text' },
        { id:'justificacao',label:'Justificação / Motivo', type:'textarea' },
        { id:'contacto',    label:'Contacto (telemóvel)', type:'tel' },
        { id:'local',       label:'Local e Data',       type:'text' },
      ],
      // CORRIGIDO: 'nuitPrestador', 'moradaPrestador' e 'localExecucao' não
      // existiam no formulário (os campos reais são 'biPrest' e 'local' —
      // não há campo de morada). Adicionados 'biCliente', 'pagamento',
      // 'inicio' e 'penalidades', que existem no formulário mas nunca
      // eram preenchidos.
      prestacao:   [
        { id:'prestador',  label:'Nome do Prestador',     type:'text' },
        { id:'biPrest',    label:'BI do Prestador',       type:'text' },
        { id:'cliente',    label:'Nome do Cliente',       type:'text' },
        { id:'biCliente',  label:'BI / NUIT do Cliente',  type:'text' },
        { id:'servico',    label:'Descrição dos Serviços a Prestar', type:'textarea' },
        { id:'valor',      label:'Valor Total (MZN)',     type:'number' },
        { id:'pagamento',  label:'Forma de Pagamento',    type:'select' },
        { id:'inicio',     label:'Data de Início',        type:'text' },
        { id:'prazo',      label:'Prazo / Duração',       type:'text' },
        { id:'penalidades',label:'Penalidades por incumprimento', type:'textarea' },
        { id:'local',      label:'Local e Data',          type:'text' },
      ],
      // CORRIGIDO: 'nuitEmitente', 'enderecoEmitente', 'valor' e 'data' não
      // existiam no formulário (os campos reais são 'nuit', 'total' e
      // 'local' — não há campo de endereço separado). Adicionados
      // 'tipoDoc' e 'pagamento', que existem no formulário.
      recibo:      [
        { id:'tipoDoc',   label:'Tipo de Documento',       type:'select' },
        { id:'emitente',  label:'Nome / Empresa Emitente', type:'text' },
        { id:'nuit',      label:'NUIT (opcional)',         type:'text' },
        { id:'cliente',   label:'Nome do Cliente',         type:'text' },
        { id:'descricao', label:'Descrição dos Serviços / Produtos', type:'textarea' },
        { id:'total',     label:'Valor Total (MZN)',       type:'number' },
        { id:'pagamento', label:'Forma de Pagamento',      type:'select' },
        { id:'local',     label:'Local e Data',            type:'text' },
      ],
      // CORRIGIDO: este é o caso relatado pelo utilizador — só 'recomendador'
      // e 'cargoRec' batiam com o formulário (por coincidência), por isso
      // só esses preenchiam. 'entidadeRec', 'recomendado', 'qualidades' e
      // 'exemploConcreto' não existem; os campos reais são 'candidato',
      // 'relacao', 'periodo', 'pontos', 'finalidade', 'contactoRec' e 'local'.
      recomendacao:[
        { id:'candidato',   label:'Nome do Candidato',        type:'text' },
        { id:'recomendador',label:'Nome de quem recomenda',   type:'text' },
        { id:'cargoRec',    label:'Cargo / Função (recomendador)', type:'text' },
        { id:'relacao',     label:'Relação com o candidato',  type:'select' },
        { id:'periodo',     label:'Período de convivência',   type:'text' },
        { id:'pontos',      label:'Qualidades a destacar',    type:'textarea' },
        { id:'finalidade',  label:'Finalidade da carta',      type:'text' },
        { id:'contactoRec', label:'Contacto do recomendador',  type:'tel' },
        { id:'local',       label:'Local e Data',             type:'text' },
      ],
      // CORRIGIDO: quase todos os ids estavam errados — 'formaJuridica',
      // 'sector' (era 'setor'), 'clientes' (era 'mercadoAlvo'),
      // 'concorrencia' (era 'concorrentes'), 'local' e 'nTrabalhadores' não
      // existem no formulário. Alinhado com os campos reais, incluindo
      // 'modelo', 'previsaoRec', 'equipa' e 'finalidade' que nunca eram
      // preenchidos.
      planonegocio:[
        { id:'nomeNegocio', label:'Nome do Negócio / Empresa', type:'text' },
        { id:'setor',       label:'Sector de Actividade',      type:'select' },
        { id:'descricao',   label:'Descrição do Negócio',      type:'textarea' },
        { id:'mercadoAlvo', label:'Mercado-Alvo / Clientes',   type:'textarea' },
        { id:'concorrentes',label:'Principais Concorrentes',   type:'textarea' },
        { id:'modelo',      label:'Como ganha dinheiro (modelo de receita)', type:'textarea' },
        { id:'investimento',label:'Investimento Inicial (MZN)', type:'number' },
        { id:'previsaoRec', label:'Previsão de Receita Mensal (MZN)', type:'number' },
        { id:'equipa',      label:'Equipa / Promotores',       type:'textarea' },
        { id:'finalidade',  label:'Finalidade do Plano',       type:'select' },
      ],
      // CORRIGIDO: 'bi' não existe neste formulário (não há campo de BI em
      // licenca — apenas NUIT), 'nomeNegocio' e 'assunto' também não
      // existem (o tipo de licença é 'tipoLicenca', e não há nome de
      // negócio dedicado). Alinhado com os campos reais, incluindo
      // 'tipoEstabelec', 'areaM2', 'horario', 'nPostosTrabalho' e
      // 'documentos' que nunca eram preenchidos.
      licenca:     [
        { id:'tipoLicenca',    label:'Tipo de Licença',          type:'select' },
        { id:'requerente',     label:'Nome do Requerente',       type:'text' },
        { id:'nuit',           label:'NUIT',                     type:'text' },
        { id:'contacto',       label:'Telefone',                 type:'tel' },
        { id:'entidade',       label:'Entidade Destinatária',    type:'text' },
        { id:'objecto',        label:'Objecto do Pedido',        type:'textarea' },
        { id:'tipoEstabelec',  label:'Tipo de estabelecimento',  type:'select' },
        { id:'areaM2',         label:'Área do estabelecimento (m²)', type:'number' },
        { id:'horario',        label:'Horário de funcionamento', type:'text' },
        { id:'nPostosTrabalho',label:'Nº de postos de trabalho previstos', type:'number' },
        { id:'local',          label:'Local Exacto',             type:'textarea' },
        { id:'documentos',     label:'Documentos Anexos',        type:'textarea' },
      ],
      // CORRIGIDO: faltavam 'tipoReuniao' (select), 'hora' (campo separado
      // de 'data' no formulário), 'totalMembros', 'quorumMinimo' e 'pauta'
      // — todos presentes no formulário mas nunca extraídos, mesmo sendo
      // dados típicos do cabeçalho de uma acta já redigida.
      acta:        [
        { id:'organizacao',  label:'Nome da Organização',  type:'text' },
        { id:'tipoReuniao',  label:'Tipo de Reunião',      type:'select' },
        { id:'data',         label:'Data',                 type:'text' },
        { id:'hora',         label:'Hora',                 type:'text' },
        { id:'presidente',   label:'Presidente da Mesa',   type:'text' },
        { id:'secretario',   label:'Secretário',           type:'text' },
        { id:'totalMembros', label:'Total de membros da organização', type:'number' },
        { id:'quorumMinimo', label:'Quórum mínimo estatutário (%)',   type:'number' },
        { id:'local',        label:'Local da Reunião',     type:'text' },
        { id:'presentes',    label:'Membros Presentes',    type:'textarea' },
        { id:'pauta',        label:'Pontos da Pauta',      type:'textarea' },
        { id:'deliberacoes', label:'Deliberações/Assuntos',type:'textarea' },
      ],
      // CORRIGIDO: faltavam 'nPisos', 'acabamento', 'fase', 'cobertura' e
      // 'infraestrutura' — todos campos select que existem no formulário e
      // são tipicamente especificados num orçamento de obra já redigido
      // (ex.: "2 pisos", "acabamento de alto padrão", "laje de betão"...).
      orcamento:   [
        { id:'tipoObra',      label:'Tipo de Obra',             type:'text' },
        { id:'area',          label:'Área (m²)',                type:'number' },
        { id:'nPisos',        label:'Nº de Pisos',              type:'select' },
        { id:'local',         label:'Localização',              type:'text' },
        { id:'acabamento',    label:'Tipo de Acabamento',       type:'select' },
        { id:'fase',          label:'Fase do Projecto',         type:'select' },
        { id:'cobertura',     label:'Tipo de Cobertura',        type:'select' },
        { id:'infraestrutura',label:'Infraestrutura disponível',type:'select' },
        { id:'prazo',         label:'Prazo desejado (dias)',    type:'number' },
        { id:'extra',         label:'Detalhes adicionais',      type:'textarea' },
      ],
      // CORRIGIDO: faltavam 'nivel' (select), 'aluno', 'turma', 'docente' e
      // 'instituicao' — adicionados ao formulário numa correcção anterior
      // (perfis de linguagem por nível de ensino + capa do trabalho), mas
      // nunca tinham sido ligados ao OCR. São dados frequentemente visíveis
      // na capa de um enunciado ou trabalho já existente fotografado.
      trabalho:    [
        { id:'tema',        label:'Tema / Título',            type:'text' },
        { id:'nivel',       label:'Nível de Ensino',          type:'select' },
        { id:'disciplina',  label:'Disciplina',               type:'text' },
        { id:'aluno',       label:'Nome do Aluno/Estudante',  type:'text' },
        { id:'turma',       label:'Turma / Classe',           type:'text' },
        { id:'docente',     label:'Nome do Professor/Docente',type:'text' },
        { id:'instituicao', label:'Escola / Instituição',     type:'text' },
        { id:'paginas',     label:'Páginas pretendidas',      type:'number' },
        { id:'requisitos',  label:'Instruções do professor',  type:'textarea' },
      ],
    };
    return S[serviceType] || [];
  }

  destroy() {
    if (this._worker) { this._worker.terminate().catch(() => {}); this._worker = null; }
  }
}
