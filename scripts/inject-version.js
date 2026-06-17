#!/usr/bin/env node
// scripts/inject-version.js
// Corre antes do deploy (Vercel "build" command).
// Substitui CACHE_VERSION em sw.js pela data actual do deploy (UTC).
// Formato: 'v12-YYYYMMDD' — compatível com a nomenclatura existente.
// Também actualiza a versão no package.json (campo "version").
//
// CORRIGIDO (auditoria B-5): o regex original procurava 'v7-' ou 'v9-' e
// falhava silenciosamente quando a versão era 'v12-*'. Agora usa um padrão
// genérico que funciona independentemente do número de versão.

const fs   = require('fs');
const path = require('path');

// Data do deploy em UTC  →  ex: "20260514"
const now   = new Date();
const pad   = n => String(n).padStart(2, '0');
const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;

// Ler major/minor da versão actual (package.json)
const pkgPath    = path.join(__dirname, '..', 'package.json');
const pkg        = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [maj, min] = (pkg.version || '12.0.0').split('.');
const newVersion = `${maj}.${min}.${stamp}`;   // ex: "12.0.20260617"

// ── Actualizar sw.js ─────────────────────────────────────────────────────────
const swPath = path.join(__dirname, '..', 'sw.js');
let   sw     = fs.readFileSync(swPath, 'utf8');

// CORRIGIDO: regex genérico — captura qualquer CACHE_VERSION independentemente do prefixo vX-
const oldPattern = /const CACHE_VERSION = '[^']+';[^\n]*/;
const newLine    = `const CACHE_VERSION = 'v12-${stamp}'; // auto-gerado pelo build — não editar manualmente`;

if (oldPattern.test(sw)) {
    sw = sw.replace(oldPattern, newLine);
    fs.writeFileSync(swPath, sw);
    console.log(`[inject-version] sw.js CACHE_VERSION → v12-${stamp}`);
} else {
    console.warn('[inject-version] AVISO: padrão CACHE_VERSION não encontrado em sw.js');
}

// ── Actualizar package.json version ──────────────────────────────────────────
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`[inject-version] package.json version → ${newVersion}`);

console.log('[inject-version] ✅ Concluído');

