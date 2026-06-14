// api/convert.js — Conversão de ficheiros no servidor
//
// OPÇÃO B: LibreOffice headless (recomendado para Word↔PDF, Excel→PDF)
//   Instalar na VPS: sudo apt-get install -y libreoffice-headless
//   No Vercel (serverless) NÃO funciona — use apenas Opção C
//
// OPÇÃO C: CloudConvert API (fallback / Vercel)
//   1. Criar conta em cloudconvert.com
//   2. Gerar API Key (sandbox gratuito: 25 conversões/dia)
//   3. Definir CLOUDCONVERT_API_KEY no .env / Vercel env vars
//
// O handler detecta automaticamente qual opção usar:
//   - Se LIBREOFFICE=true na env e libreoffice instalado → Opção B
//   - Caso contrário → Opção C (CloudConvert)

const { execFile } = require('child_process');
const path     = require('path');
const os       = require('os');
const fs       = require('fs');
const crypto   = require('crypto');

const USE_LIBRE  = process.env.LIBREOFFICE === 'true';
const CC_KEY     = process.env.CLOUDCONVERT_API_KEY || '';
const MAX_BYTES  = 10 * 1024 * 1024; // 10 MB

// Mapeamento de conversões permitidas
const ALLOWED = {
  'docx-pdf':  { from:'docx', to:'pdf'  },
  'doc-pdf':   { from:'doc',  to:'pdf'  },
  'pdf-docx':  { from:'pdf',  to:'docx' },
  'xlsx-pdf':  { from:'xlsx', to:'pdf'  },
  'xls-pdf':   { from:'xls',  to:'pdf'  },
  'pdf-xlsx':  { from:'pdf',  to:'xlsx' },
  'pptx-pdf':  { from:'pptx', to:'pdf'  },
  'ppt-pdf':   { from:'ppt',  to:'pdf'  },
  'jpg-pdf':   { from:'jpg',  to:'pdf'  },
  'jpeg-pdf':  { from:'jpeg', to:'pdf'  },
  'png-pdf':   { from:'png',  to:'pdf'  },
  'pdf-jpg':   { from:'pdf',  to:'jpg'  },
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ── Parse multipart/form-data sem dependências externas ──────────────────
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const boundary = ct.split('boundary=')[1];
    if (!boundary) return reject(new Error('Sem boundary no multipart'));

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        if (buf.length > MAX_BYTES + 4096) return reject(new Error(`Ficheiro demasiado grande (máx. 10MB)`));
        const result = {};
        const sep = Buffer.from(`--${boundary}`);
        const parts = [];
        let start = 0;
        let pos = buf.indexOf(sep, start);
        while (pos !== -1) {
          const next = buf.indexOf(sep, pos + sep.length);
          if (next === -1) break;
          parts.push(buf.slice(pos + sep.length + 2, next - 2));
          pos = next;
        }
        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const headers = part.slice(0, headerEnd).toString();
          const body    = part.slice(headerEnd + 4);
          const nameMatch = headers.match(/name="([^"]+)"/);
          const fileMatch = headers.match(/filename="([^"]+)"/);
          if (!nameMatch) continue;
          const name = nameMatch[1];
          if (fileMatch) {
            result[name] = { filename: fileMatch[1], data: body, headers };
          } else {
            result[name] = body.toString().trim();
          }
        }
        resolve(result);
      } catch (e) { reject(e); }
    });
  });
}

// ── OPÇÃO B: LibreOffice headless ────────────────────────────────────────
async function convertWithLibreOffice(inputPath, outDir, toFmt) {
  return new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', toFmt, '--outdir', outDir, inputPath];
    execFile('soffice', args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`LibreOffice: ${stderr || err.message}`));
      resolve();
    });
  });
}

// ── OPÇÃO C: CloudConvert ─────────────────────────────────────────────────
async function convertWithCloudConvert(fileBuffer, filename, fromFmt, toFmt) {
  if (!CC_KEY) throw new Error('CLOUDCONVERT_API_KEY não configurada. Configure a variável de ambiente.');

  const fetch = (...a) => import('node-fetch').then(m => m.default(...a)).catch(() => {
    const https = require('https');
    // fallback com https nativo
    return null;
  });

  // 1. Criar job
  const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        'upload-file': { operation: 'import/upload' },
        'convert-file': { operation: 'convert', input: 'upload-file', output_format: toFmt },
        'export-file': { operation: 'export/url', input: 'convert-file' },
      },
    }),
  });
  const job = await jobRes.json();
  if (!job.data?.id) throw new Error('CloudConvert: erro ao criar job');

  const uploadTask = job.data.tasks.find(t => t.name === 'upload-file');
  if (!uploadTask) throw new Error('CloudConvert: sem task de upload');

  // 2. Upload do ficheiro
  const form = new FormData();
  Object.entries(uploadTask.result?.form?.parameters || {}).forEach(([k, v]) => form.append(k, v));
  form.append('file', new Blob([fileBuffer]), filename);
  const upRes = await fetch(uploadTask.result.form.url, { method: 'POST', body: form });
  if (!upRes.ok) throw new Error('CloudConvert: erro no upload');

  // 3. Aguardar conclusão (polling até 30s)
  let result = null;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
      headers: { Authorization: `Bearer ${CC_KEY}` },
    });
    const status = await statusRes.json();
    const exportTask = status.data?.tasks?.find(t => t.name === 'export-file');
    if (exportTask?.status === 'finished') {
      result = exportTask.result?.files?.[0];
      break;
    }
    if (status.data?.status === 'error') throw new Error('CloudConvert: erro na conversão');
  }
  if (!result?.url) throw new Error('CloudConvert: timeout ou ficheiro não disponível');

  // 4. Descarregar ficheiro convertido
  const dlRes = await fetch(result.url);
  return Buffer.from(await dlRes.arrayBuffer());
}

// ── Handler principal ─────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  let tmpInput = null;
  let tmpDir   = null;

  try {
    const fields = await parseMultipart(req);
    const fileField = fields.file;
    const toFmt     = (fields.to || '').toLowerCase().replace(/[^a-z]/g, '');

    if (!fileField || !fileField.data) return res.status(400).json({ error: 'Ficheiro em falta' });
    if (!toFmt)                        return res.status(400).json({ error: 'Formato de destino em falta' });

    const origName = fileField.filename || 'ficheiro';
    const fromFmt  = origName.split('.').pop().toLowerCase();
    const key      = `${fromFmt}-${toFmt}`;

    if (!ALLOWED[key]) {
      return res.status(400).json({ error: `Conversão ${fromFmt}→${toFmt} não suportada` });
    }

    if (fileField.data.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Ficheiro demasiado grande (máx. 10MB)' });
    }

    const outName = origName.replace(/\.[^.]+$/, '') + '.' + toFmt;
    let outBuffer;

    if (USE_LIBRE) {
      // ── OPÇÃO B ──────────────────────────────────────────────────────────
      tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'mzdocs-'));
      tmpInput = path.join(tmpDir, crypto.randomUUID() + '.' + fromFmt);
      fs.writeFileSync(tmpInput, fileField.data);
      await convertWithLibreOffice(tmpInput, tmpDir, toFmt);
      const outPath = path.join(tmpDir, path.basename(tmpInput, '.' + fromFmt) + '.' + toFmt);
      outBuffer = fs.readFileSync(outPath);
    } else {
      // ── OPÇÃO C ──────────────────────────────────────────────────────────
      outBuffer = await convertWithCloudConvert(fileField.data, origName, fromFmt, toFmt);
    }

    const mimeMap = {
      pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
    };
    const mime = mimeMap[toFmt] || 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);
    res.setHeader('Content-Length', outBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(outBuffer);

  } catch (err) {
    console.error('[convert]', err.message);
    return res.status(500).json({ error: err.message || 'Erro na conversão' });
  } finally {
    // Limpar ficheiros temporários
    try { if (tmpInput && fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput); } catch {}
    try { if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
};
