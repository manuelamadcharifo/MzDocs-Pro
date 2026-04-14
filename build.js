const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname);
const distDir = path.join(root, 'dist');
const safeFiles = ['index.html', 'manifest.json', 'sw.js'];
const safeDirs = ['assets'];

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
  const r = color[0], g = color[1], b = color[2];
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }

  const scanlines = [];
  for (let y = 0; y < height; y++) {
    const scanline = Buffer.alloc(width * 3 + 1);
    scanline[0] = 0; // filter type
    pixels.copy(scanline, 1, y * width * 3, (y + 1) * width * 3);
    scanlines.push(scanline);
  }
  const idat = zlib.deflateSync(Buffer.concat(scanlines));

  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16); // bit depth
  ihdr.writeUInt8(2, 17); // color type RGB
  ihdr.writeUInt8(0, 18); // compression
  ihdr.writeUInt8(0, 19); // filter
  ihdr.writeUInt8(0, 20); // interlace
  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdr.writeUInt32BE(ihdrCrc, 21);

  const idatLenBuf = Buffer.alloc(4);
  idatLenBuf.writeUInt32BE(idat.length, 0);
  const idatChunk = Buffer.concat([Buffer.from('IDAT'), idat]);
  const idatCrc = crc32(idatChunk);
  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(idatCrc, 0);
  const idatFull = Buffer.concat([idatLenBuf, idatChunk, idatCrcBuf]);

  const iendLenBuf = Buffer.alloc(4);
  iendLenBuf.writeUInt32BE(0, 0);
  const iendChunk = Buffer.from('IEND');
  const iendCrc = crc32(iendChunk);
  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(iendCrc, 0);
  const iend = Buffer.concat([iendLenBuf, iendChunk, iendCrcBuf]);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ihdr,
    idatFull,
    iend
  ]);

  fs.writeFileSync(outputPath, png);
}

function ensureIcons() {
  const iconsDir = path.join(root, 'assets', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const icon192 = path.join(iconsDir, 'icon-192.png');
  const icon512 = path.join(iconsDir, 'icon-512.png');

  if (!fs.existsSync(icon192)) {
    createPNG(192, 192, [16, 106, 255], icon192); // Blue color
  }
  if (!fs.existsSync(icon512)) {
    createPNG(512, 512, [16, 106, 255], icon512);
  }
}

function removeDist() {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
}

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

function build() {
  ensureIcons();
  removeDist();
  fs.mkdirSync(distDir, { recursive: true });

  safeFiles.forEach((file) => {
    const source = path.join(root, file);
    if (fs.existsSync(source)) {
      copyFile(source, path.join(distDir, file));
    }
  });

  safeDirs.forEach((dir) => {
    const source = path.join(root, dir);
    if (fs.existsSync(source)) {
      copyDir(source, path.join(distDir, dir));
    }
  });

  // Validation
  const requiredFiles = [
    'index.html',
    'manifest.json',
    'sw.js',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png'
  ];

  requiredFiles.forEach((file) => {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Build failed: ${file} missing in dist`);
    }
  });

  console.log('Build complete. dist contains:', fs.readdirSync(distDir).join(', '));
}

build();
