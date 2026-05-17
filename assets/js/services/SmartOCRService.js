// assets/js/services/SmartOCRService.js
// OCR com auto-preenchimento inteligente via IA (Claude Vision)
// Integra-se com OCRController sem quebrar a API existente

export class SmartOCRService {
  constructor() {
    this._worker = null;
    this._tesseractLoaded = false;
  }

  // ── Carrega Tesseract ──────────────────────────────────────────
  async _loadTesseract() {
    if (this._tesseractLoaded) return;
    if (window.Tesseract) { this._tesseractLoaded = true; return; }

    // Usa cdn.jsdelivr.net (permitido pela CSP) com fallback para unpkg.com
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
        console.log('[SmartOCR] Tesseract carregado de:', src);
        return;
      } catch (err) {
        console.warn('[SmartOCR] CDN falhou, tentando próximo…', err.message);
      }
    }
    throw new Error('Não foi possível carregar o motor OCR. Verifique a sua ligação à internet.');
  }

  // ── OCR simples (texto bruto) ─────────────────────────────────
  async extractText(imageFile, onProgress) {
    await this._loadTesseract();

    // Tesseract.js v5 não aceita File directamente — precisa de URL de objecto.
    const objectUrl = URL.createObjectURL(imageFile);

    try {
      // Recria worker a cada chamada para o logger de progresso funcionar correctamente
      if (this._worker) {
        try { await this._worker.terminate(); } catch (_) {}
        this._worker = null;
      }

      this._worker = await Tesseract.createWorker('por', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        }
      });

      const result = await this._worker.recognize(objectUrl);
      return {
        text: result.data.text.trim(),
        confidence: Math.round(result.data.confidence)
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // ── Pipeline inteligente: OCR + IA → campos do formulário ─────
  async extractFields(imageFile, serviceType, onProgress) {
    // Passo 1: OCR bruto
    const { text, confidence } = await this.extractText(imageFile, pct => {
      if (onProgress) onProgress(pct, 'A reconhecer texto…');
    });

    if (onProgress) onProgress(90, 'A analisar campos com IA…');

    // Passo 2: Converter imagem para base64
    const base64 = await this._fileToBase64(imageFile);

    // Passo 3: Enviar para Claude Vision via Anthropic API
    const schema = this._getFieldSchema(serviceType);
    if (!schema.length) {
      // Serviço sem schema definido — retorna só texto bruto
      return { rawText: text, confidence, fields: {}, missing: [] };
    }

    try {
      const fields = await this._analyzeWithAI(base64, imageFile.type, text, schema, serviceType);
      return { rawText: text, confidence, ...fields };
    } catch (err) {
      console.warn('SmartOCR: IA indisponível, usando texto bruto.', err);
      return { rawText: text, confidence, fields: {}, missing: [] };
    }
  }

  // ── Análise via Claude Vision ──────────────────────────────────
  async _analyzeWithAI(base64, mimeType, ocrText, schema, serviceType) {
    const schemaDesc = schema.map(f => `- ${f.id}: "${f.label}" (${f.type})`).join('\n');

    const prompt = `Analise esta imagem de um documento e o texto OCR extraído.

TEXTO OCR:
${ocrText.slice(0, 2000)}

TIPO DE DOCUMENTO: ${serviceType}

CAMPOS A PREENCHER:
${schemaDesc}

TAREFA:
1. Para cada campo, encontre o valor correspondente no documento
2. Se não encontrar, tente inferir pelo contexto
3. Indique confiança 0-1 e se veio do documento ("ocr") ou foi inferido ("inferred")

Responda APENAS em JSON válido, sem markdown, sem explicações:
{
  "fields": {
    "nome_campo": {"value": "valor encontrado", "confidence": 0.9, "source": "ocr"}
  },
  "missing": ["campo_nao_encontrado"]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64.split(',')[1] }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    const raw = data.content?.find(b => b.type === 'text')?.text || '{}';

    // Limpar possíveis backticks de markdown
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }

  // ── Aplica campos extraídos ao formulário HTML ─────────────────
  applyToForm(fields, formElement) {
    if (!fields || !formElement) return;
    let applied = 0;

    Object.entries(fields).forEach(([fieldId, data]) => {
      // Tenta por name, id, e data-field
      const input =
        formElement.querySelector(`[name="${fieldId}"]`) ||
        formElement.querySelector(`#${fieldId}`) ||
        formElement.querySelector(`[data-field="${fieldId}"]`);

      if (!input || !data.value) return;

      // Para select, tenta encontrar opção mais próxima
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

      // Feedback visual
      input.style.borderColor = data.source === 'ocr' ? '#22c55e' : '#f59e0b';
      input.style.transition = 'border-color 0.3s';
      input.title = data.source === 'ocr'
        ? `✓ Extraído do documento (${Math.round((data.confidence || 0) * 100)}% confiança)`
        : `⚠ Sugerido pela IA (${Math.round((data.confidence || 0) * 100)}% confiança)`;

      applied++;
    });

    return applied;
  }

  // ── Schemas por tipo de serviço ────────────────────────────────
  _getFieldSchema(serviceType) {
    const schemas = {
      cv: [
        { id: 'nome',        label: 'Nome Completo',        type: 'text' },
        { id: 'email',       label: 'Email',                type: 'email' },
        { id: 'telefone',    label: 'Telefone',             type: 'tel' },
        { id: 'formacao',    label: 'Formação Académica',   type: 'textarea' },
        { id: 'experiencia', label: 'Experiência',          type: 'textarea' },
        { id: 'habilidades', label: 'Habilidades',          type: 'textarea' },
        { id: 'objetivo',    label: 'Objetivo Profissional', type: 'textarea' }
      ],
      carta: [
        { id: 'remetente',   label: 'Nome do Remetente',   type: 'text' },
        { id: 'destinatario',label: 'Destinatário',        type: 'text' },
        { id: 'assunto',     label: 'Assunto',             type: 'text' },
        { id: 'corpo',       label: 'Corpo da Carta',      type: 'textarea' }
      ],
      orcamento: [
        { id: 'empresa',     label: 'Empresa',             type: 'text' },
        { id: 'cliente',     label: 'Cliente',             type: 'text' },
        { id: 'descricao',   label: 'Descrição dos Serviços', type: 'textarea' },
        { id: 'valor',       label: 'Valor Total',         type: 'text' }
      ],
      trabalho: [
        { id: 'titulo',      label: 'Título do Trabalho',  type: 'text' },
        { id: 'aluno',       label: 'Nome do Aluno',       type: 'text' },
        { id: 'disciplina',  label: 'Disciplina',          type: 'text' },
        { id: 'instituicao', label: 'Instituição',         type: 'text' },
        { id: 'tema',        label: 'Tema / Assunto',      type: 'textarea' }
      ]
    };

    return schemas[serviceType] || [];
  }

  // ── Utilidades ─────────────────────────────────────────────────
  _fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  destroy() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }
}
