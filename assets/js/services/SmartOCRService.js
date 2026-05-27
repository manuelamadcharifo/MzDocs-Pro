// assets/js/services/SmartOCRService.js
// OCR com auto-preenchimento inteligente via IA (Claude Vision)
// v2: suporte a PDF e Word; schemas completos para todos os 17 tipos

export class SmartOCRService {
  constructor() {
    this._worker = null;
    this._tesseractLoaded = false;
  }

  // ── Carrega Tesseract ──────────────────────────────────────────
  async _loadTesseract() {
    if (this._tesseractLoaded) return;
    if (window.Tesseract) { this._tesseractLoaded = true; return; }

    const cdns = [
      'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.2/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@5.0.2/dist/tesseract.min.js',
    ];

    for (const src of cdns) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = () => { this._tesseractLoaded = true; res(); };
          s.onerror = () => rej(new Error('Falha: ' + src));
          document.head.appendChild(s);
        });
        return;
      } catch (err) {
        console.warn('[SmartOCR] CDN falhou, tentando próximo…', err.message);
      }
    }
    throw new Error('Não foi possível carregar o motor OCR. Verifique a sua ligação à internet.');
  }

  // ── Determina se o ficheiro é imagem, PDF ou Word ──────────────
  _getFileCategory(file) {
    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword' ||
      name.endsWith('.docx') ||
      name.endsWith('.doc')
    ) return 'word';
    return 'unknown';
  }

  // ── Extrai texto de PDF via pdf.js ─────────────────────────────
  async _extractPdfText(file, onProgress) {
    if (onProgress) onProgress(10, 'A carregar PDF…');

    // Carrega pdf.js dinamicamente
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = res;
        s.onerror = () => rej(new Error('Não foi possível carregar pdf.js'));
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }

    if (onProgress) onProgress(30, 'A ler páginas do PDF…');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(s => s.str).join(' ') + '\n';
      if (onProgress) onProgress(30 + Math.round((i / pdf.numPages) * 50), `A ler página ${i}/${pdf.numPages}…`);
    }

    return { text: fullText.trim(), confidence: 90 };
  }

  // ── Extrai texto de Word via mammoth.js ────────────────────────
  async _extractWordText(file, onProgress) {
    if (onProgress) onProgress(10, 'A carregar documento Word…');

    if (!window.mammoth) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js';
        s.onload = res;
        s.onerror = () => rej(new Error('Não foi possível carregar mammoth.js'));
        document.head.appendChild(s);
      });
    }

    if (onProgress) onProgress(50, 'A extrair texto do Word…');
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return { text: result.value.trim(), confidence: 95 };
  }

  // ── OCR simples (texto bruto de imagem) ───────────────────────
  async extractText(imageFile, onProgress) {
    await this._loadTesseract();

    try {
      if (this._worker) {
        try { await this._worker.terminate(); } catch (_) {}
        this._worker = null;
      }

      // Tentar Português; se falhar (CDN lento/offline), tentar Inglês como fallback
      let worker = null;
      try {
        worker = await Tesseract.createWorker('por', 1, {
          logger: m => {
            if (m.status === 'recognizing text' && onProgress) {
              onProgress(Math.round(m.progress * 100));
            }
          }
        });
      } catch (_langErr) {
        try {
          worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
              if (m.status === 'recognizing text' && onProgress) {
                onProgress(Math.round(m.progress * 100));
              }
            }
          });
        } catch (_) {
          throw new Error('Não foi possível inicializar o motor OCR.');
        }
      }
      this._worker = worker;

      // Tentar as 4 rotações e escolher a que dá mais confiança
      // Documentos fotografados de lado (passaportes, BIs) são comuns em mobile
      const rotations = [0, 90, 270, 180];
      let bestText = '';
      let bestConf = 0;

      for (let i = 0; i < rotations.length; i++) {
        const deg = rotations[i];
        if (onProgress && i > 0) onProgress(20 + i * 15, `A tentar rotação ${deg}°…`);

        const rotatedBlob = await this._rotateImage(imageFile, deg);
        const url = URL.createObjectURL(rotatedBlob);
        try {
          const result = await this._worker.recognize(url);
          const conf = Math.round(result.data.confidence);
          const txt  = result.data.text.trim();
          if (conf > bestConf && txt.length > 10) {
            bestConf = conf;
            bestText = txt;
          }
          // Se confiança boa (>60%), não testar mais rotações
          if (bestConf >= 60) { URL.revokeObjectURL(url); break; }
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      return { text: bestText, confidence: bestConf };
    } finally {
      // worker terminado quando o serviço é destruído
    }
  }

  // Roda a imagem num canvas e devolve Blob
  _rotateImage(file, degrees) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const rad = (degrees * Math.PI) / 180;
        const swap = degrees === 90 || degrees === 270;
        const W = swap ? img.height : img.width;
        const H = swap ? img.width  : img.height;

        // Escalar para max 1600px mantendo proporção
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(W, H));
        const cw = Math.round(W * scale);
        const ch = Math.round(H * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(rad);
        ctx.scale(scale, scale);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
      img.src = url;
    });
  }

  // ── Pipeline inteligente: extracção + IA → campos do formulário ─
  async extractFields(file, serviceType, onProgress) {
    const category = this._getFileCategory(file);
    let text = '', confidence = 0, base64 = null;

    if (category === 'pdf') {
      const r = await this._extractPdfText(file, onProgress);
      text = r.text; confidence = r.confidence;
      // Para PDF, não enviamos imagem — só texto
    } else if (category === 'word') {
      const r = await this._extractWordText(file, onProgress);
      text = r.text; confidence = r.confidence;
    } else {
      // imagem — OCR com detecção automática de rotação (0°/90°/270°/180°)
      try {
        const r = await this.extractText(file, pct => {
          if (onProgress) onProgress(Math.round(pct * 0.8), 'A reconhecer texto…');
        });
        text = r.text; confidence = r.confidence;
      } catch (ocrErr) {
        console.warn('[SmartOCR] Tesseract falhou, a usar só visão IA:', ocrErr.message);
        if (onProgress) onProgress(50, 'OCR indisponível, a usar IA visual…');
      }
      // Comprimir imagem para enviar à IA (Groq/Gemini lidam com qualquer orientação)
      base64 = await this._fileToBase64(file);
    }

    if (onProgress) onProgress(90, 'A analisar campos com IA…');

    const schema = this._getFieldSchema(serviceType);
    if (!schema.length) {
      return { rawText: text, confidence, fields: {}, missing: [] };
    }

    try {
      // Após compressão canvas, o base64 é sempre JPEG independente do ficheiro original
      const compressedMime = base64?.startsWith('data:') ? base64.split(';')[0].replace('data:', '') : file.type;
      const fields = await this._analyzeWithAI(base64, compressedMime, text, schema, serviceType);
      return { rawText: text, confidence, ...fields };
    } catch (err) {
      console.warn('SmartOCR: IA indisponível, usando texto bruto.', err);
      return { rawText: text, confidence, fields: {}, missing: [] };
    }
  }

  // ── Análise via Claude Vision / texto ─────────────────────────
  async _analyzeWithAI(base64, mimeType, ocrText, schema, serviceType) {
    // Chama proxy backend — nunca expõe chaves de API no cliente
    const body = { ocrText, schema, serviceType };
    if (base64 && mimeType?.startsWith('image/')) {
      // Enviar apenas dados puros (sem prefixo data:...)
      body.imageBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
      body.mimeType    = mimeType;
    }

    const response = await fetch('/api/ocr-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn('[SmartOCR] /api/ocr-analyze returned', response.status);
      return { fields: {}, missing: schema.map(f => f.id) };
    }

    return response.json();
  }

  // ── Aplica campos extraídos ao formulário HTML ─────────────────
  applyToForm(fields, formElement) {
    if (!fields || !formElement) return;
    let applied = 0;

    Object.entries(fields).forEach(([fieldId, data]) => {
      const input =
        formElement.querySelector(`[name="${fieldId}"]`) ||
        formElement.querySelector(`#${fieldId}`) ||
        formElement.querySelector(`[data-field="${fieldId}"]`);

      if (!input || !data.value) return;

      if (input.tagName === 'SELECT') {
        const val = data.value.toLowerCase();
        const opt = [...input.options].find(o =>
          o.value.toLowerCase().includes(val) ||
          o.text.toLowerCase().includes(val)
        );
        if (opt) input.value = opt.value;
      } else {
        input.value = data.value;
      }

      input.style.borderColor = data.source === 'ocr' ? '#22c55e' : '#f59e0b';
      input.style.transition = 'border-color 0.3s';
      input.title = data.source === 'ocr'
        ? `✓ Extraído do documento (${Math.round((data.confidence || 0) * 100)}% confiança)`
        : `⚠ Sugerido pela IA (${Math.round((data.confidence || 0) * 100)}% confiança)`;

      applied++;
    });

    return applied;
  }

  // ── Schemas por tipo de serviço (IDs correspondem aos formulários) ──
  _getFieldSchema(serviceType) {
    const schemas = {

      cv: [
        { id: 'nome',        label: 'Nome Completo',           type: 'text' },
        { id: 'cargo',       label: 'Cargo / Vaga pretendida', type: 'text' },
        { id: 'contacto',    label: 'Telefone',                type: 'tel' },
        { id: 'email',       label: 'Email',                   type: 'email' },
        { id: 'nascimento',  label: 'Data de Nascimento',      type: 'text' },
        { id: 'localizacao', label: 'Cidade / Bairro',         type: 'text' },
        { id: 'formacao',    label: 'Formação Académica',      type: 'textarea' },
        { id: 'experiencia', label: 'Experiência Profissional',type: 'textarea' },
        { id: 'linguas',     label: 'Línguas',                 type: 'text' },
        { id: 'habilidades', label: 'Habilidades',             type: 'textarea' },
        { id: 'objectivo',   label: 'Objectivo Profissional',  type: 'text' },
      ],

      carta: [
        { id: 'remetenteNome',   label: 'Nome do Remetente',   type: 'text' },
        { id: 'remetenteLocal',  label: 'Localidade / Data',   type: 'text' },
        { id: 'destinatarioNome',label: 'Nome do Destinatário',type: 'text' },
        { id: 'destinatarioEnti',label: 'Entidade / Empresa',  type: 'text' },
        { id: 'assunto',         label: 'Assunto da Carta',    type: 'text' },
        { id: 'pontos',          label: 'O que pretende comunicar', type: 'textarea' },
      ],

      orcamento: [
        { id: 'tipoObra',    label: 'Tipo de Obra',     type: 'text' },
        { id: 'area',        label: 'Área (m²)',         type: 'number' },
        { id: 'local',       label: 'Localização',       type: 'text' },
        { id: 'prazo',       label: 'Prazo (dias)',       type: 'number' },
        { id: 'extra',       label: 'Detalhes adicionais', type: 'textarea' },
      ],

      trabalho: [
        { id: 'tema',        label: 'Tema / Título',          type: 'text' },
        { id: 'disciplina',  label: 'Disciplina',             type: 'text' },
        { id: 'paginas',     label: 'Páginas pretendidas',    type: 'number' },
        { id: 'requisitos',  label: 'Instruções do professor',type: 'textarea' },
      ],

      arrendamento: [
        { id: 'proprietario',   label: 'Nome do Proprietário', type: 'text' },
        { id: 'locatario',      label: 'Nome do Locatário',    type: 'text' },
        { id: 'biProprietario', label: 'BI do Proprietário',   type: 'text' },
        { id: 'biLocatario',    label: 'BI do Locatário',      type: 'text' },
        { id: 'local',          label: 'Localização do Imóvel',type: 'text' },
        { id: 'valor',          label: 'Valor Mensal (MZN)',   type: 'number' },
        { id: 'caucao',         label: 'Caução / Depósito',   type: 'text' },
        { id: 'condicoes',      label: 'Condições Especiais', type: 'textarea' },
      ],

      procuracao: [
        { id: 'outorgante',     label: 'Nome do Outorgante',  type: 'text' },
        { id: 'biOutorgante',   label: 'BI do Outorgante',    type: 'text' },
        { id: 'moradaOutorgante', label: 'Morada do Outorgante', type: 'textarea' },
        { id: 'procurador',     label: 'Nome do Procurador',  type: 'text' },
        { id: 'biProcurador',   label: 'BI do Procurador',    type: 'text' },
        { id: 'moradaProcurador', label: 'Morada do Procurador', type: 'textarea' },
        { id: 'acto',           label: 'Acto / Finalidade',   type: 'textarea' },
        { id: 'local',          label: 'Local e Data',        type: 'text' },
      ],

      requerimento: [
        { id: 'requerente',  label: 'Nome do Requerente',  type: 'text' },
        { id: 'bi',          label: 'BI do Requerente',    type: 'text' },
        { id: 'entidade',    label: 'Entidade',            type: 'text' },
        { id: 'assunto',     label: 'Assunto',             type: 'text' },
        { id: 'fundamento',  label: 'Fundamentação',       type: 'textarea' },
        { id: 'local',       label: 'Local e Data',        type: 'text' },
      ],

      residencia: [
        { id: 'declarante',  label: 'Nome do Declarante',  type: 'text' },
        { id: 'bi',          label: 'BI',                  type: 'text' },
        { id: 'endereco',    label: 'Endereço Completo',   type: 'textarea' },
        { id: 'finalidade',  label: 'Finalidade',          type: 'text' },
        { id: 'local',       label: 'Local e Data',        type: 'text' },
      ],

      prestacao: [
        { id: 'prestador',       label: 'Nome do Prestador',    type: 'text' },
        { id: 'nuitPrestador',   label: 'NUIT do Prestador',    type: 'text' },
        { id: 'moradaPrestador', label: 'Morada do Prestador',  type: 'textarea' },
        { id: 'cliente',         label: 'Nome do Cliente',      type: 'text' },
        { id: 'servico',         label: 'Serviço a Prestar',    type: 'textarea' },
        { id: 'valor',           label: 'Valor Total (MZN)',    type: 'number' },
        { id: 'prazo',           label: 'Prazo de Execução',    type: 'text' },
        { id: 'localExecucao',   label: 'Local de Execução',    type: 'text' },
      ],

      recibo: [
        { id: 'emitente',        label: 'Emitente (quem recebe)', type: 'text' },
        { id: 'nuitEmitente',    label: 'NUIT do Emitente',       type: 'text' },
        { id: 'enderecoEmitente',label: 'Endereço do Emitente',   type: 'text' },
        { id: 'cliente',         label: 'Nome do Cliente',        type: 'text' },
        { id: 'descricao',       label: 'Descrição do Serviço',   type: 'textarea' },
        { id: 'valor',           label: 'Valor (MZN)',            type: 'number' },
        { id: 'data',            label: 'Data',                   type: 'text' },
      ],

      recomendacao: [
        { id: 'recomendador',  label: 'Nome do Recomendador',   type: 'text' },
        { id: 'cargoRec',      label: 'Cargo do Recomendador',  type: 'text' },
        { id: 'entidadeRec',   label: 'Entidade/Empresa',       type: 'text' },
        { id: 'recomendado',   label: 'Nome do Recomendado',    type: 'text' },
        { id: 'relacao',       label: 'Relação profissional',   type: 'textarea' },
        { id: 'qualidades',    label: 'Qualidades destacadas',  type: 'textarea' },
        { id: 'exemploConcreto', label: 'Exemplo concreto',     type: 'textarea' },
      ],

      planonegocio: [
        { id: 'nomeNegocio',  label: 'Nome do Negócio',         type: 'text' },
        { id: 'formaJuridica',label: 'Forma Jurídica',          type: 'text' },
        { id: 'sector',       label: 'Sector de Actividade',    type: 'text' },
        { id: 'investimento',  label: 'Investimento inicial',   type: 'number' },
        { id: 'clientes',     label: 'Clientes-alvo',           type: 'textarea' },
        { id: 'concorrencia', label: 'Concorrência',            type: 'textarea' },
        { id: 'local',        label: 'Localização',             type: 'text' },
        { id: 'nTrabalhadores', label: 'N.º de colaboradores', type: 'number' },
      ],

      licenca: [
        { id: 'requerente',    label: 'Nome do Requerente',     type: 'text' },
        { id: 'bi',            label: 'BI',                     type: 'text' },
        { id: 'nuit',          label: 'NUIT',                   type: 'text' },
        { id: 'nomeNegocio',   label: 'Nome do Estabelecimento',type: 'text' },
        { id: 'tipoEstabelec', label: 'Tipo de Estabelecimento',type: 'text' },
        { id: 'local',         label: 'Localização',            type: 'text' },
        { id: 'assunto',       label: 'Tipo de Licença',        type: 'text' },
      ],

      acta: [
        { id: 'organizacao',  label: 'Nome da Organização',     type: 'text' },
        { id: 'presidente',   label: 'Presidente da Mesa',      type: 'text' },
        { id: 'secretario',   label: 'Secretário',              type: 'text' },
        { id: 'data',         label: 'Data e Hora',             type: 'text' },
        { id: 'local',        label: 'Local da Reunião',        type: 'text' },
        { id: 'presentes',    label: 'Membros Presentes',       type: 'textarea' },
        { id: 'deliberacoes', label: 'Deliberações/Assuntos',   type: 'textarea' },
      ],
    };

    return schemas[serviceType] || [];
  }

  // ── Utilidades ─────────────────────────────────────────────────
  // Redimensiona e comprime imagem antes de enviar para o backend
  // Evita "Failed to fetch" causado pelo limite de 4.5MB do Vercel
  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1024; // px máximo em qualquer dimensão
        let { width, height } = img;

        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else                { width = Math.round(width * MAX / height); height = MAX; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        // JPEG a 75% de qualidade → tipicamente 80-250KB
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback: enviar ficheiro original sem comprimir
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      };

      img.src = objectUrl;
    });
  }

  destroy() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }
}
