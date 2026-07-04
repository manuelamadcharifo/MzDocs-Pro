#!/usr/bin/env node
// scripts/inject-version.js — v2.0 (CORRIGIDO)
// ──────────────────────────────────────────────────────────────────────────
// CORRIGIDO: este ficheiro continha, por engano, o conteúdo do script de
// ingestão jurídica (RAG). Esse script foi movido para o nome certo:
// scripts/legal-ingest.js (continua a poder ser corrido manualmente,
// exactamente como antes: `node scripts/legal-ingest.js`).
//
// Este ficheiro é o que o build da Vercel realmente executa
// (ver "buildCommand" em vercel.json e "scripts.build" em package.json).
// Função: actualizar automaticamente o CACHE_VERSION do Service Worker
// (sw.js) a cada deploy, para que os clientes recebam sempre os ficheiros
// novos em vez de servirem uma versão antiga em cache.
//
// Antes disto, o CACHE_VERSION tinha de ser mudado manualmente em sw.js a
// cada deploy (ver comentário original em sw.js) — fácil de esquecer.
//
// IMPORTANTE: nunca deve fazer o build falhar. Qualquer erro é apenas
// registado (console.warn) e o script termina com sucesso (exit 0), para
// não repetir o problema em que um script acessório partia o deploy inteiro.
// ──────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const SW_PATH = path.join(__dirname, '..', 'sw.js');

function buildVersionString() {
    const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm   = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(now.getUTCDate()).padStart(2, '0');
    const datePart = `${yyyy}${mm}${dd}`;
    return sha ? `v${sha}-${datePart}` : `v${Date.now()}-${datePart}`;
}

function main() {
    try {
        if (!fs.existsSync(SW_PATH)) {
            console.warn('[inject-version] sw.js não encontrado — nada a fazer.');
            return;
        }

        const original = fs.readFileSync(SW_PATH, 'utf8');
        const newVersion = buildVersionString();

        // Substitui apenas o valor de CACHE_VERSION, preservando o resto da linha
        // (incluindo o comentário à direita, se existir).
        const pattern = /const CACHE_VERSION = '[^']*';/;
        if (!pattern.test(original)) {
            console.warn('[inject-version] Linha CACHE_VERSION não encontrada em sw.js — nada a fazer.');
            return;
        }

        const updated = original.replace(pattern, `const CACHE_VERSION = '${newVersion}';`);
        if (updated === original) {
            console.log('[inject-version] CACHE_VERSION já está actualizado — nada a fazer.');
            return;
        }

        fs.writeFileSync(SW_PATH, updated, 'utf8');
        console.log(`[inject-version] sw.js actualizado: CACHE_VERSION = '${newVersion}'`);
    } catch (err) {
        // Nunca deixar isto partir o build.
        console.warn('[inject-version] Aviso (não bloqueante):', err.message);
    }
}

main();
