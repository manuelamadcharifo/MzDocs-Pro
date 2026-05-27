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

  // ── Comprimir imagem para < 1MB (evita limite 4.5MB Vercel) ───
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
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
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
  async _analyzeWithAI(base64, mimeType, ocrText, schema, serviceType) {
    const body = { ocrText: ocrText || '', schema, serviceType };
    if (base64 && mimeType?.startsWith('image/')) {
      body.imageBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
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
      cv:          [
        { id:'nome',        label:'Nome Completo',            type:'text' },
        { id:'cargo',       label:'Cargo / Vaga pretendida',  type:'text' },
        { id:'contacto',    label:'Telefone',                 type:'tel' },
        { id:'email',       label:'Email',                    type:'email' },
        { id:'nascimento',  label:'Data de Nascimento',       type:'text' },
        { id:'localizacao', label:'Cidade / Bairro',          type:'text' },
        { id:'formacao',    label:'Formação Académica',       type:'textarea' },
        { id:'experiencia', label:'Experiência Profissional', type:'textarea' },
        { id:'linguas',     label:'Línguas',                  type:'text' },
        { id:'habilidades', label:'Habilidades',              type:'textarea' },
        { id:'objectivo',   label:'Objectivo Profissional',   type:'text' },
      ],
      carta:       [
        { id:'remetenteNome',    label:'Nome do Remetente',    type:'text' },
        { id:'remetenteLocal',   label:'Localidade / Data',    type:'text' },
        { id:'destinatarioNome', label:'Nome do Destinatário', type:'text' },
        { id:'destinatarioEnti', label:'Entidade / Empresa',   type:'text' },
        { id:'assunto',          label:'Assunto',              type:'text' },
        { id:'pontos',           label:'O que pretende comunicar', type:'textarea' },
      ],
      residencia:  [
        { id:'declarante', label:'Nome do Declarante',  type:'text' },
        { id:'bi',         label:'Nº do BI',            type:'text' },
        { id:'nascimento', label:'Data de Nascimento',  type:'text' },
        { id:'naturalidade',label:'Naturalidade',       type:'text' },
        { id:'endereco',   label:'Endereço Completo',   type:'textarea' },
        { id:'finalidade', label:'Finalidade',          type:'text' },
        { id:'local',      label:'Local e Data',        type:'text' },
      ],
      arrendamento:[
        { id:'proprietario',    label:'Nome do Proprietário',  type:'text' },
        { id:'locatario',       label:'Nome do Locatário',     type:'text' },
        { id:'biProprietario',  label:'BI do Proprietário',    type:'text' },
        { id:'biLocatario',     label:'BI do Locatário',       type:'text' },
        { id:'local',           label:'Localização do Imóvel', type:'text' },
        { id:'valor',           label:'Valor Mensal (MZN)',    type:'number' },
        { id:'caucao',          label:'Caução / Depósito',     type:'text' },
        { id:'condicoes',       label:'Condições Especiais',   type:'textarea' },
      ],
      procuracao:  [
        { id:'outorgante',       label:'Nome do Outorgante',      type:'text' },
        { id:'biOutorgante',     label:'BI do Outorgante',        type:'text' },
        { id:'moradaOutorgante', label:'Morada do Outorgante',    type:'textarea' },
        { id:'procurador',       label:'Nome do Procurador',      type:'text' },
        { id:'biProcurador',     label:'BI do Procurador',        type:'text' },
        { id:'moradaProcurador', label:'Morada do Procurador',    type:'textarea' },
        { id:'acto',             label:'Acto / Finalidade',       type:'textarea' },
        { id:'local',            label:'Local e Data',            type:'text' },
      ],
      requerimento:[
        { id:'requerente', label:'Nome do Requerente', type:'text' },
        { id:'bi',         label:'BI do Requerente',   type:'text' },
        { id:'entidade',   label:'Entidade',           type:'text' },
        { id:'assunto',    label:'Assunto',            type:'text' },
        { id:'fundamento', label:'Fundamentação',      type:'textarea' },
        { id:'local',      label:'Local e Data',       type:'text' },
      ],
      prestacao:   [
        { id:'prestador',        label:'Nome do Prestador',     type:'text' },
        { id:'nuitPrestador',    label:'NUIT do Prestador',     type:'text' },
        { id:'moradaPrestador',  label:'Morada do Prestador',   type:'textarea' },
        { id:'cliente',          label:'Nome do Cliente',       type:'text' },
        { id:'servico',          label:'Serviço a Prestar',     type:'textarea' },
        { id:'valor',            label:'Valor Total (MZN)',     type:'number' },
        { id:'prazo',            label:'Prazo de Execução',     type:'text' },
        { id:'localExecucao',    label:'Local de Execução',     type:'text' },
      ],
      recibo:      [
        { id:'emitente',         label:'Emitente (quem recebe)',  type:'text' },
        { id:'nuitEmitente',     label:'NUIT do Emitente',        type:'text' },
        { id:'enderecoEmitente', label:'Endereço do Emitente',    type:'text' },
        { id:'cliente',          label:'Nome do Cliente',         type:'text' },
        { id:'descricao',        label:'Descrição do Serviço',    type:'textarea' },
        { id:'valor',            label:'Valor (MZN)',             type:'number' },
        { id:'data',             label:'Data',                    type:'text' },
      ],
      recomendacao:[
        { id:'recomendador',   label:'Nome do Recomendador',   type:'text' },
        { id:'cargoRec',       label:'Cargo do Recomendador',  type:'text' },
        { id:'entidadeRec',    label:'Entidade/Empresa',       type:'text' },
        { id:'recomendado',    label:'Nome do Recomendado',    type:'text' },
        { id:'relacao',        label:'Relação profissional',   type:'textarea' },
        { id:'qualidades',     label:'Qualidades destacadas',  type:'textarea' },
        { id:'exemploConcreto',label:'Exemplo concreto',       type:'textarea' },
      ],
      planonegocio:[
        { id:'nomeNegocio',    label:'Nome do Negócio',          type:'text' },
        { id:'formaJuridica',  label:'Forma Jurídica',           type:'text' },
        { id:'sector',         label:'Sector de Actividade',     type:'text' },
        { id:'investimento',   label:'Investimento inicial',     type:'number' },
        { id:'clientes',       label:'Clientes-alvo',            type:'textarea' },
        { id:'concorrencia',   label:'Concorrência',             type:'textarea' },
        { id:'local',          label:'Localização',              type:'text' },
        { id:'nTrabalhadores', label:'Nº de colaboradores',      type:'number' },
      ],
      licenca:     [
        { id:'requerente',    label:'Nome do Requerente',       type:'text' },
        { id:'bi',            label:'BI',                       type:'text' },
        { id:'nuit',          label:'NUIT',                     type:'text' },
        { id:'nomeNegocio',   label:'Nome do Estabelecimento',  type:'text' },
        { id:'tipoEstabelec', label:'Tipo de Estabelecimento',  type:'text' },
        { id:'local',         label:'Localização',              type:'text' },
        { id:'assunto',       label:'Tipo de Licença',          type:'text' },
      ],
      acta:        [
        { id:'organizacao',  label:'Nome da Organização',  type:'text' },
        { id:'presidente',   label:'Presidente da Mesa',   type:'text' },
        { id:'secretario',   label:'Secretário',           type:'text' },
        { id:'data',         label:'Data e Hora',          type:'text' },
        { id:'local',        label:'Local da Reunião',     type:'text' },
        { id:'presentes',    label:'Membros Presentes',    type:'textarea' },
        { id:'deliberacoes', label:'Deliberações/Assuntos',type:'textarea' },
      ],
      orcamento:   [
        { id:'tipoObra', label:'Tipo de Obra',        type:'text' },
        { id:'area',     label:'Área (m²)',            type:'number' },
        { id:'local',    label:'Localização',          type:'text' },
        { id:'prazo',    label:'Prazo (dias)',          type:'number' },
        { id:'extra',    label:'Detalhes adicionais',  type:'textarea' },
      ],
      trabalho:    [
        { id:'tema',       label:'Tema / Título',            type:'text' },
        { id:'disciplina', label:'Disciplina',               type:'text' },
        { id:'paginas',    label:'Páginas pretendidas',      type:'number' },
        { id:'requisitos', label:'Instruções do professor',  type:'textarea' },
      ],
    };
    return S[serviceType] || [];
  }

  destroy() {
    if (this._worker) { this._worker.terminate().catch(() => {}); this._worker = null; }
  }
}
