// assets/js/controllers/OCRController.js
// Versão melhorada: usa SmartOCRService para auto-preenchimento inteligente
//
// CORRIGIDO (bug crítico: "só lê a 1ª foto, o resto é ignorado"): antes,
// seleccionar 9 fotos de uma vez dependia inteiramente do atributo
// `multiple` do <input type="file"> e do selector nativo do telemóvel
// devolver TODOS os ficheiros escolhidos em `e.target.files`. Em muitos
// Android isso falha silenciosamente — o utilizador escolhe 9 fotos, mas
// só a 1ª chega à aplicação, sem qualquer aviso, e o resto é
// simplesmente descartado. O backend (api/misc.js) já sabia transcrever
// várias páginas correctamente, uma a uma — o problema nunca esteve ali.
//
// SOLUÇÃO: para os serviços de várias páginas ("trabalho" e "transcricao"),
// deixámos de processar imediatamente ao escolher ficheiros. Em vez disso,
// cada toque em "Adicionar Foto"/"Adicionar Ficheiro" ACUMULA os ficheiros
// escolhidos numa lista visível (this.stagedFiles) — o utilizador pode
// repetir o toque quantas vezes precisar (uma foto de cada vez, se for o
// que o telemóvel permitir de forma fiável, ou várias juntas quando o
// selector múltiplo funcionar), vendo sempre quantas páginas já tem
// prontas. Só quando carrega em "Transcrever N página(s)" é que a IA é
// chamada, com TODOS os ficheiros acumulados de uma vez — exactamente
// como já acontecia antes, só que agora a lista de ficheiros está
// garantidamente completa antes de seguir para o backend.
import { NotificationView, DocumentView } from '../views/Views.js';
import { SmartOCRService } from '../services/SmartOCRService.js';
import { SERVICES } from '../services/ServiceDefinitions.js';

const MAX_PAGES_BY_SERVICE = { trabalho: 8, transcricao: 25 };
const MULTI_PAGE_SERVICES = new Set(['trabalho', 'transcricao']);

export class OCRController {
  constructor(docModel) {
    this.docModel     = docModel;
    this.smartOCR     = new SmartOCRService();
    // NOVO: acumulador de páginas para os serviços multi-página.
    this.stagedFiles  = [];
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnCam')?.addEventListener('click',    () => this.trigger('cam'));
    document.getElementById('btnFile')?.addEventListener('click',   () => this.trigger('file'));
    document.getElementById('ocrInput')?.addEventListener('change', e => this.onFilesPicked(e));
    document.getElementById('btnUseOcr')?.addEventListener('click',     () => this.use());
    document.getElementById('btnDiscardOcr')?.addEventListener('click', () => this.discard());
    // NOVO: acções da lista de páginas acumuladas.
    document.getElementById('btnOcrClearStaged')?.addEventListener('click', () => this.clearStaged());
    document.getElementById('btnOcrRunTranscribe')?.addEventListener('click', () => this.runStaged());
  }

  // NOVO (P1.7 — Master Hardening, Set/2026): consentimento explícito antes
  // do 1º uso do OCR neste navegador. Contexto do problema (documentado em
  // detalhe no README, secção 7): a imagem fotografada é enviada para um
  // fornecedor externo de IA de visão (Google Gemini / Groq) para ser
  // transcrita — nunca fica guardada no servidor da MzDocs Pro nem em nenhum
  // log (confirmado por leitura de api/_services/ocr.js: só metadados como
  // nº de páginas e duração vão para observabilidade, nunca a imagem nem os
  // valores extraídos). Redacção automática de regiões sensíveis (BI, NUIT,
  // assinatura, foto) DENTRO da imagem antes de a enviar exigiria um motor
  // de visão computacional dedicado — fora do âmbito realista desta ronda de
  // correcções (ver nota "BLOCKED" na tabela de Definition of Done). Em vez
  // disso, mitigação por consentimento informado: avisar explicitamente,
  // uma única vez por navegador, ANTES da primeira fotografia, para que o
  // utilizador possa decidir com conhecimento de causa — nunca a app envia
  // a foto para o fornecedor externo silenciosamente sem este aviso ter
  // aparecido primeiro pelo menos uma vez.
  _ensureOcrConsent() {
    const KEY = 'mz_ocr_consent_v1';
    if (localStorage.getItem(KEY) === '1') return true;
    const proceed = window.confirm(
      '📷 Para preencher automaticamente a partir de uma foto, a imagem é enviada ' +
      'para um serviço externo de IA (Google/Groq) só para ser lida — não fica ' +
      'guardada nos nossos servidores.\n\n' +
      'Evite fotografar documentos de outras pessoas com dados sensíveis (BI, NUIT, ' +
      'dados bancários) quando não for estritamente necessário.\n\n' +
      'Deseja continuar?'
    );
    if (proceed) { try { localStorage.setItem(KEY, '1'); } catch (_) {} }
    return proceed;
  }

  trigger(mode) {
    if (!this._ensureOcrConsent()) return;
    const input = document.getElementById('ocrInput');
    if (!input) return;
    if (mode === 'cam') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  _isMultiPageService() {
    return MULTI_PAGE_SERVICES.has(this.docModel?.service || '');
  }

  _maxPages() {
    return MAX_PAGES_BY_SERVICE[this.docModel?.service || ''] || 8;
  }

  // NOVO: validação isolada da execução do OCR. CORRIGIDO: antes, se UM
  // único ficheiro do lote excedesse o tamanho máximo, a função inteira
  // fazia `return` e descartava TODOS os ficheiros em silêncio (incluindo
  // os válidos) — agora só o ficheiro problemático é ignorado, com aviso
  // claro, e os restantes continuam normalmente.
  _validateFiles(files) {
    const maxSize = 10 * 1024 * 1024; // 10 MB para PDF/Word; 5 MB para imagens
    const valid = [];
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const limit = isImage ? 5 * 1024 * 1024 : maxSize;
      if (file.size > limit) {
        NotificationView.error(`Ficheiro "${file.name}" muito grande (máx. ${isImage ? '5' : '10'}MB) — ignorado.`);
        continue;
      }
      valid.push(file);
    }
    return valid;
  }

  // NOVO: chamado sempre que o <input type="file"> muda.
  // - Serviços multi-página (trabalho/transcricao): os ficheiros são
  //   ACUMULADOS na lista visível — nada é processado ainda.
  // - Restantes serviços (1 única foto): mantém-se o comportamento de
  //   sempre, processa imediatamente.
  onFilesPicked(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // permite escolher o mesmo ficheiro outra vez, se preciso
    const files = this._validateFiles(picked);
    if (!files.length) return;

    if (this._isMultiPageService()) {
      const maxPages = this._maxPages();
      const room = maxPages - this.stagedFiles.length;
      if (room <= 0) {
        NotificationView.warn(`⚠️ Já tem o máximo de ${maxPages} páginas prontas. Carregue em "Transcrever" ou "Limpar" antes de adicionar mais.`);
        return;
      }
      const toAdd = files.slice(0, room);
      if (files.length > toAdd.length) {
        NotificationView.warn(`⚠️ Só foi possível adicionar ${toAdd.length} página(s) — limite de ${maxPages} atingido.`);
      }
      this.stagedFiles.push(...toAdd);
      this._renderStagedList();
      NotificationView.info(
        this.stagedFiles.length === 1
          ? '📄 1 página pronta — adicione mais ou carregue em "Transcrever" para continuar.'
          : `📄 ${this.stagedFiles.length} páginas prontas — adicione mais ou carregue em "Transcrever" para continuar.`
      );
    } else {
      // fluxo de sempre: 1 ficheiro, processa já
      this.processFiles(files);
    }
  }

  // NOVO: desenha a lista de páginas já acumuladas, com opção de remover
  // cada uma individualmente antes de transcrever.
  _renderStagedList() {
    const wrap  = document.getElementById('ocrStagedWrap');
    const list  = document.getElementById('ocrStagedList');
    const count = document.getElementById('ocrStagedCount');
    if (!wrap || !list) return;

    if (!this.stagedFiles.length) {
      wrap.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    wrap.style.display = 'block';
    if (count) count.textContent = String(this.stagedFiles.length);

    list.innerHTML = this.stagedFiles.map((f, i) => {
      const label = (f.name || `Página ${i + 1}`)
        .replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
      return `
        <div class="ocr-staged-item">
          <span class="ocr-staged-num">${i + 1}</span>
          <span class="ocr-staged-name">${label}</span>
          <button type="button" class="ocr-staged-remove" data-idx="${i}" title="Remover esta página">✕</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.ocr-staged-remove').forEach(btn => {
      btn.addEventListener('click', () => this._removeStaged(Number(btn.dataset.idx)));
    });
  }

  _removeStaged(idx) {
    this.stagedFiles.splice(idx, 1);
    this._renderStagedList();
  }

  clearStaged() {
    this.stagedFiles = [];
    this._renderStagedList();
  }

  // NOVO: chamado pelo botão "Transcrever N página(s)" — processa TODAS as
  // páginas acumuladas até agora, de uma só vez (o backend já as trata
  // página a página internamente — ver api/misc.js → transcribeAllPagesSeparately).
  async runStaged() {
    if (!this.stagedFiles.length) {
      NotificationView.warn('⚠️ Adicione pelo menos uma página antes de transcrever.');
      return;
    }
    await this.processFiles(this.stagedFiles.slice());
  }

  // Antes chamava-se processFile(e) e recebia o evento do <input>
  // directamente. Agora recebe sempre um array de File já validado —
  // tanto o fluxo de 1 foto (onFilesPicked) como o fluxo acumulado
  // (runStaged) chamam esta função da mesma forma.
  async processFiles(files) {
    if (!files || !files.length) return;

    const ocrBar       = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    const ocrFill      = document.getElementById('ocrFill');
    const ocrStatusTxt = document.getElementById('ocrStatusTxt');

    if (ocrBar) ocrBar.style.display = 'block';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    if (ocrFill) ocrFill.style.width = '0%';
    if (ocrStatusTxt) ocrStatusTxt.textContent = files.length > 1 ? `A inicializar OCR de ${files.length} páginas…` : 'A inicializar OCR…';

    try {
      const serviceType = this.docModel?.service || '';

      const progress = (pct, msg) => {
        if (ocrFill) ocrFill.style.width = pct + '%';
        if (ocrStatusTxt) ocrStatusTxt.textContent = msg || `A reconhecer… ${pct}%`;
      };

      // Uma só foto → caminho de sempre (extractFields). Várias páginas →
      // extractFieldsMulti, que envia todas as imagens ao backend, que por
      // sua vez transcreve página a página (não é 1 chamada gigante — ver
      // api/misc.js → transcribeAllPagesSeparately).
      const result = files.length > 1
        ? await this.smartOCR.extractFieldsMulti(files, serviceType, progress)
        : await this.smartOCR.extractFields(files[0], serviceType, progress);

      if (ocrBar) ocrBar.style.display = 'none';

      const text     = result.rawText || '';
      const conf     = result.confidence || 0;
      const fields   = result.fields   || {};
      const missing  = result.missing  || [];
      const fieldCount = Object.keys(fields).length;

      // Calcular confiança real: se a IA preencheu campos, usar a média das confianças
      // em vez do valor 0% do Tesseract (que pode ter falhado mas a IA funcionou)
      let displayConf = conf;
      if (fieldCount > 0) {
        const confs = Object.values(fields)
          .map(f => f.confidence || 0)
          .filter(c => c > 0);
        if (confs.length) {
          displayConf = Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100);
        }
      }

      if (this.docModel) {
        this.docModel.ocrText = text;
        // guarda quantas páginas entraram neste OCR — usado por
        // DocumentController.generate() para calcular o custo em créditos
        // do serviço "transcricao" (Digitalizar Documento), que cobra por
        // página em vez de custo fixo (ver ServiceDefinitions.js).
        this.docModel.ocrPageCount = files.length;

        // se este serviço tiver custo dinâmico, mostra já o custo real no
        // botão "Gerar com IA" — antes disto o utilizador só via "1
        // crédito" (o valor por omissão) até carregar em gerar.
        const svcDef = SERVICES[serviceType];
        if (svcDef?.dynamicCostPerPage) {
          const realCost = Math.min(10, Math.max(1, Math.ceil(files.length / svcDef.dynamicCostPerPage)));
          DocumentView.updateGenCostLabel(realCost);
        }
      }

      const ocrTxt  = document.getElementById('ocrTxt');
      const ocrConf = document.getElementById('ocrConf');

      // Se a IA preencheu campos mas Tesseract não extraiu texto,
      // mostrar resumo dos campos extraídos em vez de caixa vazia
      if (ocrTxt) {
        if (!text && fieldCount > 0) {
          const summary = Object.entries(fields)
            .map(([id, d]) => `${id}: ${d.value}`)
            .join('\n');
          ocrTxt.value = summary;
        } else {
          ocrTxt.value = text;
        }
      }
      if (ocrConf) {
        ocrConf.textContent = fieldCount > 0
          ? `IA: ${displayConf}% confiança`
          : `Confiança: ${conf}%`;
        ocrConf.style.color = displayConf >= 70 ? '#16a34a'
                            : displayConf >= 40 ? '#d97706'
                            : '#dc2626';
      }

      if (fieldCount > 0) {
        const formBody = document.getElementById('formBody');
        if (formBody) {
          const applied = this.smartOCR.applyToForm(fields, formBody);
          this._showSmartFillBanner(applied, missing.length);
        }
      }

      if (ocrResultBox) ocrResultBox.style.display = 'block';

      // Notificação correcta: basear no sucesso real da IA, não no Tesseract.
      // Serviços como "transcricao" (Digitalizar Documento) têm poucos ou
      // nenhum campo de formulário para preencher (fieldCount pode
      // legitimamente ser 0 mesmo quando a transcrição funcionou muito bem —
      // o objectivo desse serviço é o texto transcrito em si, não campos).
      if (fieldCount > 0) {
        NotificationView.success(`✅ ${fieldCount} campo(s) preenchido(s) pela IA!`);
      } else if (text && displayConf >= 60) {
        NotificationView.success('✅ Documento lido com sucesso! Reveja o texto abaixo.');
      } else if (!text || conf < 30) {
        NotificationView.warn('⚠️ Não foi possível extrair dados. Preencha manualmente.');
      } else {
        NotificationView.warn('⚠️ Reconhecimento com baixa confiança. Revise o texto.');
      }

    } catch (err) {
      if (ocrBar) ocrBar.style.display = 'none';
      NotificationView.error('❌ Erro no OCR: ' + err.message);
    }
  }

  _showSmartFillBanner(applied, missing) {
    document.getElementById('smartFillBanner')?.remove();
    if (!applied) return;

    const banner = document.createElement('div');
    banner.id = 'smartFillBanner';
    banner.style.cssText = [
      'margin:12px 0 4px',
      'padding:10px 14px',
      'background:linear-gradient(135deg,#ecfdf5,#d1fae5)',
      'border:1.5px solid #6ee7b7',
      'border-radius:10px',
      'font-size:13px',
      'color:#065f46',
      'font-weight:600',
      'display:flex',
      'align-items:center',
      'gap:8px'
    ].join(';');

    let msg = `✨ ${applied} campo(s) preenchido(s) automaticamente pela IA`;
    if (missing > 0) msg += ` · ${missing} campo(s) precisam revisão`;

    banner.innerHTML = `
      <span>${msg}</span>
      <div style="margin-left:auto;display:flex;gap:10px;font-size:11px;opacity:0.85;">
        <span><span style="display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:4px;"></span>Do doc.</span>
        <span><span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;margin-right:4px;"></span>Inferido</span>
      </div>
    `;

    const ocrZone = document.getElementById('ocrZone');
    if (ocrZone) ocrZone.insertAdjacentElement('afterend', banner);
  }

  use() {
    const text = document.getElementById('ocrTxt')?.value.trim();
    if (text && this.docModel) this.docModel.ocrText = text;
    document.getElementById('ocrResultBox').style.display = 'none';
    NotificationView.info('✅ Texto OCR incorporado');
  }

  discard() {
    if (this.docModel) { this.docModel.ocrText = null; this.docModel.ocrPageCount = 0; }
    DocumentView.updateGenCostLabel(1);
    document.getElementById('smartFillBanner')?.remove();
    document.querySelectorAll('#formBody input, #formBody textarea, #formBody select').forEach(el => {
      el.style.borderColor = '';
      el.title = '';
    });
    this.reset();
  }

  reset() {
    const ocrBar = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    if (ocrBar) ocrBar.style.display = 'none';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    document.getElementById('smartFillBanner')?.remove();
    const input = document.getElementById('ocrInput');
    if (input) input.value = '';
    const txt = document.getElementById('ocrTxt');
    if (txt) txt.value = '';
    const fill = document.getElementById('ocrFill');
    if (fill) fill.style.width = '0%';
    // NOVO: limpa também a lista de páginas acumuladas ao trocar de
    // serviço / descartar — evita misturar páginas de documentos diferentes.
    this.clearStaged();
  }
}
