#!/bin/bash
# ============================================
# MzDocs Pro - Diagnóstico e Correção de Layout/Interatividade
# Script para GitHub Copilot / CLI
# ============================================

set -e

echo "🔍 [1/7] Verificando estrutura do projeto..."
echo "=========================================="

# Detectar framework/build tool
if [ -f "package.json" ]; then
    echo "✓ package.json encontrado"
    cat package.json | grep -E '"(name|version|scripts|dependencies|devDependencies)"' | head -20
else
    echo "✗ package.json NÃO encontrado - projeto pode não ser Node.js"
fi

# Detectar framework
FRAMEWORK=""
if [ -f "vite.config.js" ] || [ -f "vite.config.ts" ]; then
    FRAMEWORK="vite"
    echo "✓ Detectado: Vite"
elif [ -f "next.config.js" ] || [ -f "next.config.ts" ] || [ -f "next.config.mjs" ]; then
    FRAMEWORK="next"
    echo "✓ Detectado: Next.js"
elif [ -f "nuxt.config.js" ] || [ -f "nuxt.config.ts" ]; then
    FRAMEWORK="nuxt"
    echo "✓ Detectado: Nuxt"
elif [ -f "angular.json" ]; then
    FRAMEWORK="angular"
    echo "✓ Detectado: Angular"
elif [ -f "vue.config.js" ]; then
    FRAMEWORK="vue-cli"
    echo "✓ Detectado: Vue CLI"
fi

echo ""
echo "🔍 [2/7] Verificando arquivos de entrada HTML..."
echo "================================================"

# Procurar arquivo HTML principal
HTML_FILE=""
for file in "index.html" "public/index.html" "src/index.html" "app/index.html" "pages/index.html"; do
    if [ -f "$file" ]; then
        HTML_FILE="$file"
        echo "✓ HTML encontrado: $file"
        break
    fi
done

if [ -z "$HTML_FILE" ]; then
    echo "✗ Nenhum index.html encontrado nos locais padrão"
    echo "  Buscando em todo o projeto..."
    find . -name "*.html" -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" 2>/dev/null | head -10
fi

echo ""
echo "🔍 [3/7] Verificando tags <link> CSS e <script> JS no HTML..."
echo "==============================================================="

if [ -n "$HTML_FILE" ]; then
    echo "--- Tags <link> para CSS ---"
    grep -n '<link' "$HTML_FILE" | grep -i 'stylesheet\|css' || echo "✗ Nenhum <link rel="stylesheet"> encontrado"

    echo ""
    echo "--- Tags <script> para JS ---"
    grep -n '<script' "$HTML_FILE" | grep -v 'type="module"' || echo "(verificando scripts module...)"
    grep -n '<script' "$HTML_FILE" | grep 'type="module"' || echo "✗ Nenhum <script type="module"> encontrado"

    echo ""
    echo "--- Meta viewport ---"
    grep -n 'viewport' "$HTML_FILE" || echo "✗ Meta viewport NÃO encontrado - ISSO CRÍTICO PARA MOBILE/PWA"

    echo ""
    echo "--- Meta theme-color ---"
    grep -n 'theme-color' "$HTML_FILE" || echo "⚠ Meta theme-color não encontrado"

    echo ""
    echo "--- Link manifest.json ---"
    grep -n 'manifest' "$HTML_FILE" || echo "⚠ Link para manifest.json não encontrado"
fi

echo ""
echo "🔍 [4/7] Verificando arquivos CSS/SCSS no projeto..."
echo "====================================================="

CSS_FILES=$(find . -name "*.css" -o -name "*.scss" -o -name "*.sass" -o -name "*.less" 2>/dev/null | grep -v node_modules | grep -v '.next' | grep -v 'dist' | head -20)
if [ -n "$CSS_FILES" ]; then
    echo "✓ Arquivos de estilo encontrados:"
    echo "$CSS_FILES"
else
    echo "✗ Nenhum arquivo CSS/SCSS encontrado fora de node_modules"
fi

echo ""
echo "🔍 [5/7] Verificando arquivos JS/TS principais..."
echo "==================================================="

# Procurar entry point JS/TS
for file in "src/main.js" "src/main.ts" "src/index.js" "src/index.ts" "src/app.js" "src/app.ts" "main.js" "main.ts" "index.js" "index.ts"; do
    if [ -f "$file" ]; then
        echo "✓ Entry point JS/TS encontrado: $file"
        head -20 "$file"
        break
    fi
done

echo ""
echo "🔍 [6/7] Verificando configuração de build/deploy..."
echo "======================================================"

# Verificar vercel.json
if [ -f "vercel.json" ]; then
    echo "✓ vercel.json encontrado:"
    cat vercel.json
else
    echo "✗ vercel.json NÃO encontrado"
fi

echo ""
# Verificar vite.config
if [ -f "vite.config.js" ]; then
    echo "--- vite.config.js ---"
    cat vite.config.js
elif [ -f "vite.config.ts" ]; then
    echo "--- vite.config.ts ---"
    cat vite.config.ts
fi

echo ""
echo "🔍 [7/7] Verificando pasta dist/build de output..."
echo "===================================================="

if [ -d "dist" ]; then
    echo "✓ Pasta dist/ existe"
    ls -la dist/ | head -20
    echo ""
    echo "--- Arquivos CSS em dist/ ---"
    find dist/ -name "*.css" 2>/dev/null | head -10 || echo "Nenhum CSS em dist/"
    echo ""
    echo "--- Arquivos JS em dist/ ---"
    find dist/ -name "*.js" -o -name "*.mjs" 2>/dev/null | head -10 || echo "Nenhum JS em dist/"
elif [ -d ".next" ]; then
    echo "✓ Pasta .next/ existe (Next.js)"
    ls -la .next/ | head -10
elif [ -d "build" ]; then
    echo "✓ Pasta build/ existe"
    ls -la build/ | head -20
else
    echo "✗ Nenhuma pasta de build (dist/, .next/, build/) encontrada"
    echo "  O projeto pode não ter sido buildado ainda"
fi

echo ""
echo "=========================================="
echo "📋 RESUMO DO DIAGNÓSTICO"
echo "=========================================="

# Resumo automático de problemas encontrados
PROBLEMAS=0

if ! grep -q 'viewport' "$HTML_FILE" 2>/dev/null; then
    echo "❌ PROBLEMA: Meta viewport ausente - causa quebra em mobile"
    PROBLEMAS=$((PROBLEMAS + 1))
fi

if ! grep -q 'stylesheet' "$HTML_FILE" 2>/dev/null; then
    echo "❌ PROBLEMA: Nenhum CSS linkado no HTML"
    PROBLEMAS=$((PROBLEMAS + 1))
fi

if ! grep -q '<script' "$HTML_FILE" 2>/dev/null; then
    echo "❌ PROBLEMA: Nenhum JS linkado no HTML"
    PROBLEMAS=$((PROBLEMAS + 1))
fi

if [ "$PROBLEMAS" -eq 0 ]; then
    echo "✅ Nenhum problema óbvio encontrado no HTML"
fi

echo ""
echo "=========================================="
echo "🔧 CORREÇÕES AUTOMÁTICAS"
echo "=========================================="

# Função para corrigir index.html
corrigir_html() {
    local html_file="$1"
    local backup="${html_file}.backup.$(date +%s)"

    echo "Criando backup: $backup"
    cp "$html_file" "$backup"

    # Verificar se é um HTML mínimo/quebrado e reconstruir se necessário
    if ! grep -q '<html' "$html_file"; then
        echo "⚠ HTML parece estar incompleto. Reconstruindo estrutura base..."

        cat > "$html_file" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1a1a2e" />
  <meta name="description" content="MzDocs Pro - Documentos por IA, sem custo" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>MzDocs Pro</title>
HTMLEOF

        # Adicionar CSS base inline para garantir que algo renderize
        cat >> "$html_file" << 'CSSEOF'
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16px; -webkit-font-smoothing: antialiased; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      line-height: 1.6;
    }
    #root, #app {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    button, a {
      cursor: pointer;
      transition: all 0.2s ease;
    }
    button:hover, a:hover {
      transform: translateY(-1px);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
  </style>
CSSEOF

        # Fechar head e abrir body
        cat >> "$html_file" << 'BODYEOF'
</head>
<body>
  <div id="root"></div>
  <noscript>
    <div style="padding: 2rem; text-align: center;">
      <h1>JavaScript necessário</h1>
      <p>Por favor, active o JavaScript no seu navegador para usar o MzDocs Pro.</p>
    </div>
  </noscript>
BODYEOF

        # Adicionar script principal
        cat >> "$html_file" << 'SCRIPTEOF'
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
SCRIPTEOF

        echo "✅ HTML reconstruído com estrutura base, viewport, CSS fallback e script module"
    else
        # HTML existe mas pode estar incompleto - adicionar meta tags faltantes

        # Adicionar viewport se não existir
        if ! grep -q 'viewport' "$html_file"; then
            echo "Adicionando meta viewport..."
            sed -i 's|<head>|<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />|' "$html_file"
        fi

        # Adicionar theme-color se não existir
        if ! grep -q 'theme-color' "$html_file"; then
            echo "Adicionando meta theme-color..."
            sed -i 's|<head>|<head>\n  <meta name="theme-color" content="#1a1a2e" />|' "$html_file"
        fi

        # Adicionar manifest se não existir
        if ! grep -q 'manifest.json' "$html_file"; then
            echo "Adicionando link manifest..."
            sed -i 's|</head>|<link rel="manifest" href="/manifest.json" />\n</head>|' "$html_file"
        fi

        echo "✅ Meta tags verificadas/adicionadas"
    fi
}

# Aplicar correções
if [ -n "$HTML_FILE" ]; then
    corrigir_html "$HTML_FILE"
else
    echo "✗ Não foi possível aplicar correções automáticas - nenhum HTML encontrado"
fi

echo ""
echo "=========================================="
echo "📦 VERIFICAÇÃO PÓS-CORREÇÃO"
echo "=========================================="

# Re-verificar HTML após correções
if [ -n "$HTML_FILE" ]; then
    echo "--- Conteúdo atual do $HTML_FILE (primeiras 50 linhas) ---"
    head -50 "$HTML_FILE"
fi

echo ""
echo "=========================================="
echo "🚀 PRÓXIMOS PASSOS RECOMENDADOS"
echo "=========================================="
echo "1. Execute: npm install (se node_modules não existir)"
echo "2. Execute: npm run build"
echo "3. Verifique se a pasta dist/ contém CSS e JS compilados"
echo "4. Execute: npm run preview (para testar localmente)"
echo "5. Faça deploy na Vercel: vercel --prod"
echo ""
echo "Se usar Vite, verifique se vite.config.js tem:"
echo '  base: "/",'
echo "Se usar caminhos relativos, pode ser necessário:"
echo '  base: "./",'
echo "=========================================="
