// assets/js/convert/FileConverter.js
// Módulo de conversão de ficheiros no próprio MzDocs
// Usado pelo DocumentController ao abrir o serviço "conversao"

const MAX_MB   = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const CONVERSIONS = [
  { label:'Word → PDF',    from:['docx','doc'],       to:'pdf',  accept:'.doc,.docx' },
  { label:'PDF → Word',    from:['pdf'],              to:'docx', accept:'.pdf' },
  { label:'Excel → PDF',   from:['xlsx','xls'],       to:'pdf',  accept:'.xls,.xlsx' },
  { label:'PDF → Excel',   from:['pdf'],              to:'xlsx', accept:'.pdf' },
  { label:'PowerPoint → PDF', from:['pptx','ppt'],   to:'pdf',  accept:'.ppt,.pptx' },
  { label:'Imagem → PDF',  from:['jpg','jpeg','png'], to:'pdf',  accept:'.jpg,.jpeg,.png' },
  { label:'PDF → JPG',     from:['pdf'],              to:'jpg',  accept:'.pdf' },
];

const EXT_ICON = { pdf:'📄', docx:'📝', doc:'📝', xlsx:'📊', xls:'📊', pptx:'📑', ppt:'📑', jpg:'🖼️', jpeg:'🖼️', png:'🖼️' };

// ── HTML do conversor ─────────────────────────────────────────────────────
export function buildConverterHTML() {
  const opts = CONVERSIONS.map((c, i) => `<option value="${i}">${c.label}</option>`).join('');
  return `
    <div class="conv-wrap" id="convWrap">
      <div class="conv-format-row">
        <span class="conv-fmt-label">Converter</span>
        <select class="conv-fmt-sel" id="convType" onchange="window._mzConvTypeChange()">
          ${opts}
        </select>
      </div>

      <div class="conv-drop" id="convDrop" onclick="document.getElementById('convFile').click()">
        <div class="conv-drop-ico">☁️</div>
        <div class="conv-drop-title">Clique ou arraste o ficheiro aqui</div>
        <div class="conv-drop-sub" id="convDropSub">Formatos aceites: .doc, .docx · Máx. ${MAX_MB}MB</div>
        <input type="file" id="convFile" accept=".doc,.docx" onchange="window._mzConvFileChange(this)"/>
      </div>

      <div class="conv-file-info" id="convFileInfo">
        <div class="conv-file-icon" id="convFileIcon">📄</div>
        <div>
          <div class="conv-file-name" id="convFileName">ficheiro.docx</div>
          <div class="conv-file-size" id="convFileSize">0 KB</div>
        </div>
      </div>

      <div class="conv-prog" id="convProg">
        <div class="conv-prog-bar"><div class="conv-prog-fill" id="convFill"></div></div>
        <div class="conv-prog-label" id="convProgLabel">A converter…</div>
      </div>

      <button class="conv-btn-convert" id="convBtn" onclick="window._mzConvStart()">
        ⚡ Converter agora
      </button>

      <div class="conv-result" id="convResult">
        <div class="conv-result-name" id="convResultName">documento.pdf</div>
        <a class="conv-btn-dl" id="convDlLink" href="#" download>
          ⬇️ Descarregar ficheiro
        </a>
      </div>

      <div class="conv-error" id="convErr"></div>
      <div class="conv-limit">Limite: ${MAX_MB}MB por ficheiro · Ficheiros eliminados após 10 minutos</div>
    </div>`;
}

// ── Inicializar handlers após injecção no DOM ─────────────────────────────
export function initConverter() {
  let selectedFile = null;

  function getConv() { return CONVERSIONS[parseInt(document.getElementById('convType')?.value || '0')]; }

  function updateAccept() {
    const c = getConv();
    const inp = document.getElementById('convFile');
    const sub = document.getElementById('convDropSub');
    if (inp) inp.accept = c.accept;
    if (sub) sub.textContent = `Formatos aceites: ${c.accept.replace(/\./g,'')} · Máx. ${MAX_MB}MB`;
    // Reset ficheiro se não compatível
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      if (!c.from.includes(ext)) resetFile();
    }
  }

  function resetFile() {
    selectedFile = null;
    const fi = document.getElementById('convFileInfo');
    const btn = document.getElementById('convBtn');
    if (fi)  fi.style.display = 'none';
    if (btn) btn.style.display = 'none';
    const inp = document.getElementById('convFile');
    if (inp) inp.value = '';
    hideResults();
  }

  function hideResults() {
    ['convResult','convErr','convProg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1024/1024).toFixed(1) + ' MB';
  }

  window._mzConvTypeChange = updateAccept;

  window._mzConvFileChange = (inp) => {
    hideResults();
    const file = inp.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      const errEl = document.getElementById('convErr');
      if (errEl) { errEl.textContent = `❌ Ficheiro demasiado grande (${fmtSize(file.size)}). Máximo ${MAX_MB}MB.`; errEl.style.display = 'block'; }
      inp.value = '';
      return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    const conv = getConv();
    if (!conv.from.includes(ext)) {
      const errEl = document.getElementById('convErr');
      if (errEl) { errEl.textContent = `❌ Formato .${ext} não é compatível com "${conv.label}". Escolha outro tipo de conversão.`; errEl.style.display = 'block'; }
      inp.value = '';
      return;
    }
    selectedFile = file;
    const icon = document.getElementById('convFileIcon');
    const name = document.getElementById('convFileName');
    const size = document.getElementById('convFileSize');
    const fi   = document.getElementById('convFileInfo');
    const btn  = document.getElementById('convBtn');
    if (icon) icon.textContent = EXT_ICON[ext] || '📄';
    if (name) name.textContent = file.name;
    if (size) size.textContent = fmtSize(file.size);
    if (fi)   fi.style.display = 'flex';
    if (btn)  btn.style.display = 'block';
  };

  window._mzConvStart = async () => {
    if (!selectedFile) return;
    const conv  = getConv();
    const btn   = document.getElementById('convBtn');
    const prog  = document.getElementById('convProg');
    const fill  = document.getElementById('convFill');
    const label = document.getElementById('convProgLabel');
    const res   = document.getElementById('convResult');
    const err   = document.getElementById('convErr');
    const dlLink= document.getElementById('convDlLink');
    const dlName= document.getElementById('convResultName');

    hideResults();
    if (btn)  { btn.disabled = true; btn.textContent = '⏳ A converter…'; }
    if (prog) prog.style.display = 'block';
    if (fill) fill.style.width = '15%';
    if (label) label.textContent = 'A enviar ficheiro…';

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('to', conv.to);

      // Simular progresso durante upload
      let p = 15;
      const iv = setInterval(() => {
        p = Math.min(p + 8, 85);
        if (fill) fill.style.width = p + '%';
        if (label) label.textContent = p < 50 ? 'A enviar ficheiro…' : 'A converter…';
      }, 400);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      clearInterval(iv);
      if (fill) fill.style.width = '100%';
      if (label) label.textContent = 'Conversão concluída!';

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Erro HTTP ${response.status}`);
      }

      // A resposta é o ficheiro binário directamente
      const blob = await response.blob();
      const outName = selectedFile.name.replace(/\.[^.]+$/, '') + '.' + conv.to;
      const url = URL.createObjectURL(blob);

      if (dlLink) { dlLink.href = url; dlLink.download = outName; }
      if (dlName) dlName.textContent = outName;
      if (res)    res.style.display = 'block';

      // Auto-revoke após 10 min
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);

    } catch (e) {
      if (err) {
        err.textContent = '❌ ' + (e.message || 'Erro desconhecido. Tente novamente.');
        err.style.display = 'block';
      }
      if (fill) fill.style.width = '0';
    } finally {
      if (btn)  { btn.disabled = false; btn.textContent = '⚡ Converter novamente'; btn.style.display = 'block'; }
      setTimeout(() => { if (prog) prog.style.display = 'none'; }, 1500);
    }
  };

  // Drag & drop
  const drop = document.getElementById('convDrop');
  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const inp = document.getElementById('convFile');
      // Simular seleção via DataTransfer
      const dt = new DataTransfer();
      dt.items.add(file);
      inp.files = dt.files;
      window._mzConvFileChange(inp);
    });
  }
}
