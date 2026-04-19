const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname);
const distDir = path.join(root, 'dist');

const safeFiles = ['index.html', 'manifest.json', 'sw.js', 'public.js'];
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

// -------------------------
// COPY PUBLIC (CRÍTICO PARA PWA)
// -------------------------
function copyPublicRoot() {
  const publicDir = path.join(root, 'public');
  const ignoredFiles = new Set(['sw.js']);

  if (!fs.existsSync(publicDir)) return;

  const files = fs.readdirSync(publicDir);
  files.forEach(file => {
    if (ignoredFiles.has(file)) return;

    const src = path.join(publicDir, file);
    const dest = path.join(distDir, file);

    if (fs.lstatSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFile(src, dest);
    }
  });
}

// -------------------------
// PNG ICON GENERATOR
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

  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdr.writeUInt32BE(ihdrCrc, 21);

  const idatChunk = Buffer.concat([Buffer.from('IDAT'), idat]);
  const idatCrc = crc32(idatChunk);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ihdr,
    Buffer.from([0, 0, 0, idat.length]),
    idatChunk,
    Buffer.from([(idatCrc >> 24) & 255, (idatCrc >> 16) & 255, (idatCrc >> 8) & 255, idatCrc & 255]),
    Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
  ]);

  fs.writeFileSync(outputPath, png);
}

// -------------------------
// ENSURE ICONS
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
// VALIDAR JS (ANTI HTML)
// -------------------------
function validateJS(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8').trim();

  if (content.startsWith('<!DOCTYPE html>') || content.startsWith('<html')) {
    throw new Error(`❌ HTML SERVIDO COMO JS: ${filePath}`);
  }
}

// -------------------------
// FIX MANIFEST
// -------------------------
function fixManifest() {
  const manifestPath = path.join(distDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath));

  manifest.icons = [
    {
      src: "/assets/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png"
    },
    {
      src: "/assets/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png"
    }
  ];

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// -------------------------
// BUILD
// -------------------------
function build() {
  ensureIcons();
  removeDist();
  fs.mkdirSync(distDir, { recursive: true });

  // core
  safeFiles.forEach(file => {
    const src = path.join(root, file);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(distDir, file));
    }
  });

  // assets
  safeDirs.forEach(dir => {
    const src = path.join(root, dir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(distDir, dir));
    }
  });

  // PUBLIC (CRUCIAL)
  copyPublicRoot();

  // VALIDAR SW
  validateJS(path.join(distDir, 'sw.js'));

  // FIX MANIFEST
  fixManifest();

  console.log('✅ BUILD OK');
  console.log('📦 dist:', fs.readdirSync(distDir));
}

build();