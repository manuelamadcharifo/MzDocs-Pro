const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname);
const distDir = path.join(root, 'dist');

const safeFiles = ['index.html', 'manifest.json', 'sw.js'];
const safeDirs = ['assets'];

// -------------------------
// CLEAN DIST
// -------------------------
function removeDist() {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
}

// -------------------------
// COPY HELPERS
// -------------------------
function copyFile(source, target) {
  const targetDir = path.dirname(target);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.copyFileSync(source, target);
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true, errorOnExist: false });
}

function copyPublicAssets() {
  const publicAssetsSrc = path.join(root, 'public', 'assets');
  const publicAssetsTarget = path.join(distDir, 'assets');
  if (fs.existsSync(publicAssetsSrc)) {
    copyDir(publicAssetsSrc, publicAssetsTarget);
  }
}

// -------------------------
// PNG ICON GENERATOR (PWA SAFE)
// -------------------------
function crc32(data) {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, color, outputPath) {
  const [r, g, b] = color;
  const pixels = Buffer.alloc(width * height * 3);

  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }

  const scanlines = [];
  for (let y = 0; y < height; y++) {
    const scanline = Buffer.alloc(width * 3 + 1);
    scanline[0] = 0;
    pixels.copy(scanline, 1, y * width * 3, (y + 1) * width * 3);
    scanlines.push(scanline);
  }

  const idat = zlib.deflateSync(Buffer.concat(scanlines));

  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16);
  ihdr.writeUInt8(2, 17);
  ihdr.writeUInt8(0, 18);
  ihdr.writeUInt8(0, 19);
  ihdr.writeUInt8(0, 20);

  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdr.writeUInt32BE(ihdrCrc, 21);

  const idatLenBuf = Buffer.alloc(4);
  idatLenBuf.writeUInt32BE(idat.length, 0);

  const idatChunk = Buffer.concat([Buffer.from('IDAT'), idat]);
  const idatCrc = crc32(idatChunk);

  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(idatCrc, 0);

  const iendLenBuf = Buffer.alloc(4);
  iendLenBuf.writeUInt32BE(0, 0);

  const iendChunk = Buffer.from('IEND');
  const iendCrc = crc32(iendChunk);

  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(iendCrc, 0);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ihdr,
    idatLenBuf,
    idatChunk,
    idatCrcBuf,
    iendLenBuf,
    iendChunk,
    iendCrcBuf
  ]);

  fs.writeFileSync(outputPath, png);
}

// -------------------------
// ENSURE PWA ICONS
// -------------------------
function ensureIcons() {
  const iconsDir = path.join(root, 'assets', 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const icon192 = path.join(iconsDir, 'icon-192.png');
  const icon512 = path.join(iconsDir, 'icon-512.png');

  if (!fs.existsSync(icon192)) {
    createPNG(192, 192, [16, 106, 255], icon192);
  }

  if (!fs.existsSync(icon512)) {
    createPNG(512, 512, [16, 106, 255], icon512);
  }
}

// -------------------------
// VALIDATE JS FILES (ANTI HTML ERROR)
// -------------------------
function validateJS(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const trimmed = content.trim();

  if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html')) {
    throw new Error(`INVALID JS (HTML detected): ${filePath}`);
  }
}

function validateJsFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return;

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      validateJsFiles(fullPath);
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      validateJS(fullPath);
    }
  }
}

// -------------------------
// MANIFEST FIXER
// -------------------------
function fixManifest(distDir) {
  const manifestPath = path.join(distDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) return;

  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  if (manifest.icons) {
    manifest.icons = manifest.icons.map(icon => {
      const file = path.basename(icon.src);
      icon.src = `/dist/assets/icons/${file}`;
      return icon;
    });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// -------------------------
// BUILD PROCESS
// -------------------------
function build() {
  ensureIcons();
  removeDist();
  fs.mkdirSync(distDir, { recursive: true });

  // copy core files
  safeFiles.forEach(file => {
    const src = path.join(root, file);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(distDir, file));
    }
  });

  // copy assets
  safeDirs.forEach(dir => {
    const src = path.join(root, dir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(distDir, dir));
    }
  });

  // copy any static public assets into the deployed assets tree
  copyPublicAssets();

  // validate critical JS files for HTML fallback responses
  validateJsFiles(distDir);

  // fix manifest paths so icons always resolve from deployed public root
  fixManifest(distDir);

  // final checks
  const required = [
    'index.html',
    'manifest.json',
    'sw.js',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png'
  ];

  required.forEach(file => {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`BUILD ERROR: missing ${file}`);
    }
  });

  console.log('✅ BUILD COMPLETO: dist pronto para Netlify');
  console.log('📦 Conteúdo:', fs.readdirSync(distDir).join(', '));
}

// run
build();