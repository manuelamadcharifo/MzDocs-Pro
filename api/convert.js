// api/convert.js — Conversão de ficheiros
// Opção C: CloudConvert API (funciona no Vercel serverless)
// Opção B: LibreOffice headless (apenas em VPS própria — LIBREOFFICE=true)

const { execFile } = require('child_process');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const crypto  = require('crypto');
const https   = require('https');
const http    = require('http');

const USE_LIBRE = process.env.LIBREOFFICE === 'true';
const CC_KEY    = process.env.CLOUDCONVERT_API_KEY || '';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED = {
  'docx-pdf':true,'doc-pdf':true,'pdf-docx':true,
  'xlsx-pdf':true,'xls-pdf':true,'pdf-xlsx':true,
  'pptx-pdf':true,'ppt-pdf':true,
  'jpg-pdf':true,'jpeg-pdf':true,'png-pdf':true,'pdf-jpg':true,
};

const MIME = {
  pdf:'application/pdf',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ── Parse multipart usando busboy (built-in no Vercel Node 20) ──────────
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let Busboy;
    try { Busboy = require('busboy'); } catch {
      // fallback manual se busboy não disponível
      return parseMultipartManual(req).then(resolve).catch(reject);
    }

    const fields = {};
    const files  = {};
    let totalBytes = 0;

    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_BYTES, files: 1, fields: 5 },
    });

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BYTES) { stream.destroy(); return; }
        chunks.push(chunk);
      });
      stream.on('end', () => {
        files[name] = { filename, mimeType, data: Buffer.concat(chunks) };
      });
    });

    bb.on('finish', () => resolve({ ...fields, ...files }));
    bb.on('error',  err => reject(err));

    req.pipe(bb);
  });
}

// ── Fallback manual (sem busboy) ─────────────────────────────────────────
function parseMultipartManual(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const match = ct.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!match) return reject(new Error('Sem boundary no multipart'));
    const boundary = match[1] || match[2];

    const chunks = [];
    req.on('data', c => { chunks.push(c); });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const buf  = Buffer.concat(chunks);
        if (buf.length > MAX_BYTES + 8192) return reject(new Error('Ficheiro demasiado grande'));
        const sep  = Buffer.from('\r\n--' + boundary);
        const end  = Buffer.from('\r\n--' + boundary + '--');
        const result = {};
        let pos = buf.indexOf('--' + boundary + '\r\n');
        if (pos === -1) return reject(new Error('Formato multipart inválido'));
        pos += ('--' + boundary + '\r\n').length;

        while (pos < buf.length) {
          const nextSep = findBuffer(buf, sep, pos);
          const nextEnd = findBuffer(buf, end, pos);
          const partEnd = Math.min(
            nextSep === -1 ? Infinity : nextSep,
            nextEnd === -1 ? Infinity : nextEnd
          );
          if (partEnd === Infinity) break;

          const part = buf.slice(pos, partEnd);
          const hEnd = findBuffer(part, Buffer.from('\r\n\r\n'), 0);
          if (hEnd === -1) break;

          const headers = part.slice(0, hEnd).toString();
          const body    = part.slice(hEnd + 4);
          const nameM   = headers.match(/name="([^"]+)"/);
          const fileM   = headers.match(/filename="([^"]+)"/);

          if (nameM) {
            const name = nameM[1];
            result[name] = fileM
              ? { filename: fileM[1], data: body }
              : body.toString().trim();
          }

          if (nextEnd !== -1 && nextEnd <= (nextSep === -1 ? Infinity : nextSep)) break;
          pos = nextSep + sep.length + 2; // skip \r\n after boundary
        }
        resolve(result);
      } catch (e) { reject(e); }
    });
  });
}

function findBuffer(buf, search, offset) {
  for (let i = offset; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

// ── fetch nativo (Node 18+) ou https fallback ────────────────────────────
function nodeFetch(url, opts = {}) {
  if (typeof fetch !== 'undefined') return fetch(url, opts);
  // https fallback
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const data = opts.body instanceof Buffer ? opts.body : Buffer.from(opts.body || '');
    const reqOpts = {
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: { ...opts.headers, 'Content-Length': data.length },
    };
    const req = mod.request(reqOpts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(body.toString())),
          arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
          text: () => Promise.resolve(body.toString()),
        });
      });
    });
    req.on('error', reject);
    if (data.length) req.write(data);
    req.end();
  });
}

// ── OPÇÃO B: LibreOffice ─────────────────────────────────────────────────
function convertWithLibreOffice(inputPath, outDir, toFmt) {
  return new Promise((resolve, reject) => {
    execFile('soffice',
      ['--headless', '--convert-to', toFmt, '--outdir', outDir, inputPath],
      { timeout: 30000 },
      (err, _stdout, stderr) => {
        if (err) return reject(new Error('LibreOffice: ' + (stderr || err.message)));
        resolve();
      }
    );
  });
}

// ── OPÇÃO C: CloudConvert ────────────────────────────────────────────────
async function convertWithCloudConvert(fileBuffer, filename, fromFmt, toFmt) {
  if (!CC_KEY) throw new Error(
    'Conversão não configurada. Contacte o suporte ou adicione CLOUDCONVERT_API_KEY nas variáveis de ambiente.'
  );

  const BASE = 'https://api.cloudconvert.com/v2';
  const auth = { Authorization: `Bearer ${CC_KEY}`, 'Content-Type': 'application/json' };

  // 1. Criar job
  const jobBody = JSON.stringify({
    tasks: {
      'upload':  { operation: 'import/upload' },
      'convert': { operation: 'convert', input: 'upload', input_format: fromFmt, output_format: toFmt },
      'export':  { operation: 'export/url', input: 'convert' },
    },
  });
  const jobRes  = await nodeFetch(`${BASE}/jobs`, { method:'POST', headers: auth, body: jobBody });
  const jobData = await jobRes.json();

  if (!jobData?.data?.id) {
    const msg = jobData?.message || JSON.stringify(jobData).slice(0, 200);
    throw new Error('CloudConvert erro ao criar job: ' + msg);
  }

  const uploadTask = jobData.data.tasks.find(t => t.name === 'upload');
  if (!uploadTask?.result?.form) throw new Error('CloudConvert: sem form de upload');

  // 2. Upload com multipart/form-data manual (evitar depender de FormData no Node)
  const formParams = uploadTask.result.form.parameters || {};
  const boundary   = '----mzdocs' + Date.now();
  const parts = [];

  for (const [k, v] of Object.entries(formParams)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
    );
  }
  parts.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );
  const uploadBody = Buffer.concat(parts);

  const upRes = await nodeFetch(uploadTask.result.form.url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': uploadBody.length },
    body: uploadBody,
  });
  if (!upRes.ok) throw new Error('CloudConvert: upload falhou (' + upRes.status + ')');

  // 3. Polling até o job terminar (máx 45s)
  let exportTask = null;
  for (let i = 0; i < 22; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sRes  = await nodeFetch(`${BASE}/jobs/${jobData.data.id}`, { headers: { Authorization: `Bearer ${CC_KEY}` } });
    const sData = await sRes.json();
    if (sData?.data?.status === 'error') {
      const failedTask = sData.data.tasks?.find(t => t.status === 'error');
      throw new Error('CloudConvert: ' + (failedTask?.message || 'Erro na conversão'));
    }
    exportTask = sData?.data?.tasks?.find(t => t.name === 'export' && t.status === 'finished');
    if (exportTask) break;
  }

  if (!exportTask?.result?.files?.[0]?.url) throw new Error('CloudConvert: timeout — tente um ficheiro mais pequeno');

  // 4. Download do resultado
  const dlRes = await nodeFetch(exportTask.result.files[0].url);
  if (!dlRes.ok) throw new Error('CloudConvert: erro ao descarregar resultado');
  const ab = await dlRes.arrayBuffer();
  return Buffer.from(ab);
}

// ── Handler principal ─────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método não permitido' });

  let tmpInput = null;
  let tmpDir   = null;

  try {
    const fields    = await parseMultipart(req);
    const fileField = fields.file;
    const toFmt     = (typeof fields.to === 'string' ? fields.to : '').toLowerCase().replace(/[^a-z]/g, '');

    if (!fileField || !fileField.data || !fileField.data.length)
      return res.status(400).json({ error: 'Ficheiro em falta ou vazio' });
    if (!toFmt)
      return res.status(400).json({ error: 'Formato de destino em falta (campo "to")' });

    const origName = fileField.filename || 'ficheiro';
    const fromFmt  = origName.split('.').pop().toLowerCase().replace(/[^a-z]/g, '');
    const key      = `${fromFmt}-${toFmt}`;

    if (!ALLOWED[key])
      return res.status(400).json({ error: `Conversão .${fromFmt} → .${toFmt} não suportada` });

    if (fileField.data.length > MAX_BYTES)
      return res.status(413).json({ error: `Ficheiro demasiado grande (${(fileField.data.length/1024/1024).toFixed(1)}MB). Máximo 10MB.` });

    const outName = origName.replace(/\.[^.]+$/, '') + '.' + toFmt;
    let   outBuffer;

    if (USE_LIBRE) {
      tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'mzdocs-'));
      tmpInput = path.join(tmpDir, crypto.randomUUID() + '.' + fromFmt);
      fs.writeFileSync(tmpInput, fileField.data);
      await convertWithLibreOffice(tmpInput, tmpDir, toFmt);
      const outPath = path.join(tmpDir, path.basename(tmpInput, '.' + fromFmt) + '.' + toFmt);
      if (!fs.existsSync(outPath))
        throw new Error('LibreOffice não gerou o ficheiro de saída. Verifique se o LibreOffice está instalado.');
      outBuffer = fs.readFileSync(outPath);
    } else {
      outBuffer = await convertWithCloudConvert(fileField.data, origName, fromFmt, toFmt);
    }

    res.setHeader('Content-Type', MIME[toFmt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);
    res.setHeader('Content-Length', outBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).end(outBuffer);

  } catch (err) {
    console.error('[convert] ERRO:', err.message);
    // Garantir que a resposta é sempre JSON em caso de erro
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ error: err.message || 'Erro interno na conversão' });
    }
  } finally {
    try { if (tmpInput && fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput); } catch {}
    try { if (tmpDir   && fs.existsSync(tmpDir))   fs.rmSync(tmpDir, { recursive:true, force:true }); } catch {}
  }
};
