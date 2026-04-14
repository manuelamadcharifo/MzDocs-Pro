const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const distDir = path.join(root, 'dist');
const safeFiles = ['index.html', 'manifest.json'];
const safeDirs = ['assets'];
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

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('Build failed: dist/index.html missing');
  }

  console.log('Build complete. dist contains:', fs.readdirSync(distDir).join(', '));
}

build();
