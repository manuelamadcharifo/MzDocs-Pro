const fs = require('fs');
const path = require('path');

const root = __dirname;

// ----------------------------
// FIX REDIRECTS
// ----------------------------
function fixRedirects() {
  const content = `
/api/*    /.netlify/functions/:splat    200
/assets/* /assets/:splat                200
/*        /index.html                  200
`.trim();

  fs.writeFileSync(path.join(root, '_redirects'), content);
  console.log('✅ _redirects corrigido');
}

// ----------------------------
// REMOVE SECRETS DO PROJETO
// ----------------------------
function cleanSecrets(filePath) {
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf-8');

  content = content
    .replace(/MPESA_ENV\s*=\s*["'`].*?["'`]/g, 'MPESA_ENV=""')
    .replace(/MPESA_API_KEY\s*=\s*["'`].*?["'`]/g, 'MPESA_API_KEY=""')
    .replace(/SUPABASE_SERVICE_KEY\s*=\s*["'`].*?["'`]/g, 'SUPABASE_SERVICE_KEY=""')
    .replace(/OPENROUTER_API_KEY\s*=\s*["'`].*?["'`]/g, 'OPENROUTER_API_KEY=""')
    .replace(/SITE_URL\s*=\s*["'`].*?["'`]/g, 'SITE_URL=""');

  fs.writeFileSync(filePath, content);
}

// ----------------------------
// SCAN PROJECT FILES
// ----------------------------
function scanDir(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      if (file === 'node_modules' || file === '.git') continue;
      scanDir(fullPath);
    } else {
      if (file.endsWith('.js') || file.endsWith('.toml') || file.endsWith('.md')) {
        cleanSecrets(fullPath);
      }
    }
  }
}

// ----------------------------
// CLEAN DIST (remove vazamento)
// ----------------------------
function cleanDist() {
  const dist = path.join(root, 'dist');
  if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true, force: true });
    console.log('🧹 dist limpo');
  }
}

// ----------------------------
// RUN ALL FIXES
// ----------------------------
function run() {
  fixRedirects();
  scanDir(root);
  cleanDist();

  console.log('🚀 Projeto corrigido para deploy no Netlify');
}

run();