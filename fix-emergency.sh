#!/bin/bash
# MzDocs Pro - SCRIPT DE CORREÇÃO DE EMERGÊNCIA
# Remove alterações problemáticas e aplica apenas fixes seguros
# Execute: chmod +x fix-emergency.sh && ./fix-emergency.sh

echo "🚨 CORREÇÃO DE EMERGÊNCIA - MzDocs Pro"
echo "======================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PUBLIC_DIR="public"
if [ ! -d "$PUBLIC_DIR" ]; then
    PUBLIC_DIR="."
fi

echo -e "${YELLOW}Diretório público: $PUBLIC_DIR${NC}"
echo ""

# ============================================
# 1. REMOVER ARQUIVOS PROBLEMATICOS
# ============================================
echo "🗑️  Removendo arquivos problemáticos..."

# Remover CSS problemático que quebra layout
if [ -f "$PUBLIC_DIR/ios-touch-fix.css" ]; then
    rm "$PUBLIC_DIR/ios-touch-fix.css"
    echo -e "${GREEN}✓ Removido: ios-touch-fix.css${NC}"
fi

# Remover JS problemático que bloqueia cliques
if [ -f "$PUBLIC_DIR/interactivity-patch.js" ]; then
    rm "$PUBLIC_DIR/interactivity-patch.js"
    echo -e "${GREEN}✓ Removido: interactivity-patch.js${NC}"
fi

if [ -f "$PUBLIC_DIR/interactivity-helpers.js" ]; then
    rm "$PUBLIC_DIR/interactivity-helpers.js"
    echo -e "${GREEN}✓ Removido: interactivity-helpers.js${NC}"
fi

# Remover backup do index.html se existir
if [ -f "index.html.bak" ]; then
    rm "index.html.bak"
fi

# ============================================
# 2. CRIAR CSS SEGURO (MINIMALISTA)
# ============================================
echo ""
echo "📝 Criando CSS seguro..."

cat > "$PUBLIC_DIR/touch-fix-minimal.css" << 'EOF'
/* ============================================
   MzDocs Pro - Touch Fix MINIMAL (Seguro)
   Apenas fixes essenciais sem quebrar layout
   ============================================ */

/* Aplicar APENAS em elementos interativos específicos */
button,
a[href],
[role="button"],
input[type="submit"],
input[type="button"],
.clickable,
.btn {
  cursor: pointer;
}

/* Fix iOS: garantir que elementos clicáveis recebam eventos */
@supports (-webkit-touch-callout: none) {
  /* iOS específico: apenas elementos com handlers */
  button,
  a,
  [onclick],
  [ng-click],
  [v-on:click] {
    cursor: pointer;
  }
}

/* Remover 300ms delay em elementos clicáveis (apenas touch) */
button,
a,
[role="button"] {
  touch-action: manipulation;
}

/* Input zoom fix para iOS - apenas em inputs */
@media screen and (max-width: 768px) {
  input[type="text"],
  input[type="email"],
  input[type="number"],
  input[type="tel"],
  textarea,
  select {
    font-size: 16px !important;
  }
}

/* Safe area para iPhone notch (apenas em PWA standalone) */
@supports (padding-top: env(safe-area-inset-top)) {
  @media all and (display-mode: standalone) {
    body {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
}
EOF

echo -e "${GREEN}✓ Criado: touch-fix-minimal.css${NC}"

# ============================================
# 3. CRIAR JS SEGURO (SEM BLOQUEAR EVENTOS)
# ============================================
echo ""
echo "⚡ Criando JavaScript seguro..."

cat > "$PUBLIC_DIR/touch-helper.js" << 'EOF'
/* ============================================
   MzDocs Pro - Touch Helper (Seguro)
   NÃO bloqueia eventos, apenas adiciona suporte
   ============================================ */

(function() {
  'use strict';

  // Só executa se for iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (!isIOS) return;

  console.log('[MzDocs] iOS detectado, aplicando helpers...');

  // Helper 1: Adicionar cursor:pointer dinamicamente (não afeta layout)
  const addPointerCursor = function() {
    const elements = document.querySelectorAll('button, a, [role="button"], .btn, input[type="submit"]');
    elements.forEach(function(el) {
      if (!el.style.cursor) {
        el.style.cursor = 'pointer';
      }
    });
  };

  // Helper 2: Garantir que clicks funcionem em elementos delegados
  // NÃO usa preventDefault ou stopPropagation
  const fixDelegatedClicks = function() {
    // Para iOS Safari: elementos sem cursor:pointer não disparam click
    // Solução: adicionar listener vazio de touchstart (hack conhecido)
    document.addEventListener('touchstart', function() {}, { passive: true });
  };

  // Executar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      addPointerCursor();
      fixDelegatedClicks();
    });
  } else {
    addPointerCursor();
    fixDelegatedClicks();
  }

  // Re-aplicar quando DOM mudar (elementos dinâmicos)
  const observer = new MutationObserver(function() {
    addPointerCursor();
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });

})();
EOF

echo -e "${GREEN}✓ Criado: touch-helper.js${NC}"

# ============================================
# 4. LIMPAR INDEX.HTML (REMOVER SCRIPTS PROBLEMATICOS)
# ============================================
echo ""
echo "🧹 Limpando index.html..."

INDEX_FILE=""
if [ -f "index.html" ]; then
    INDEX_FILE="index.html"
elif [ -f "$PUBLIC_DIR/index.html" ]; then
    INDEX_FILE="$PUBLIC_DIR/index.html"
fi

if [ -n "$INDEX_FILE" ]; then
    # Criar backup
    cp "$INDEX_FILE" "$INDEX_FILE.backup.$(date +%s)"

    # Remover linhas problemáticas (ios-touch-fix.css, interactivity-patch.js)
    sed -i '/ios-touch-fix.css/d' "$INDEX_FILE"
    sed -i '/interactivity-patch.js/d' "$INDEX_FILE"
    sed -i '/interactivity-helpers.js/d' "$INDEX_FILE"

    # Verificar se já tem os arquivos novos
    if ! grep -q "touch-fix-minimal.css" "$INDEX_FILE"; then
        # Adicionar CSS seguro antes de </head>
        sed -i 's|</head>|<link rel="stylesheet" href="/touch-fix-minimal.css">\n</head>|' "$INDEX_FILE"
    fi

    if ! grep -q "touch-helper.js" "$INDEX_FILE"; then
        # Adicionar JS seguro antes de </body>
        if grep -q "</body>" "$INDEX_FILE"; then
            sed -i 's|</body>|<script src="/touch-helper.js"></script>\n</body>|' "$INDEX_FILE"
        else
            echo '<script src="/touch-helper.js"></script>' >> "$INDEX_FILE"
        fi
    fi

    echo -e "${GREEN}✓ Index.html limpo e atualizado${NC}"
else
    echo -e "${YELLOW}⚠️ index.html não encontrado${NC}"
fi

# ============================================
# 5. VERIFICAR _REDIRECTS (SPA FIX)
# ============================================
echo ""
echo "🔗 Verificando _redirects..."

if [ ! -f "$PUBLIC_DIR/_redirects" ]; then
    echo "/*    /index.html   200" > "$PUBLIC_DIR/_redirects"
    echo -e "${GREEN}✓ Criado: _redirects${NC}"
else
    echo -e "${YELLOW}⚠️ _redirects já existe${NC}"
fi

# ============================================
# 6. INSTRUÇÕES FINAIS
# ============================================
echo ""
echo "======================================"
echo -e "${GREEN}✅ CORREÇÃO APLICADA!${NC}"
echo "======================================"
echo ""
echo "📝 O que foi feito:"
echo "   • Removido CSS/JS que quebravam o layout"
echo "   • Criado CSS minimalista (apenas elementos interativos)"
echo "   • Criado JS seguro (sem bloquear eventos)"
echo "   • Mantido _redirects para SPA routing"
echo ""
echo "🚀 Próximos passos:"
echo "   1. git add ."
echo "   2. git commit -m 'Fix: Corrige interatividade sem quebrar layout'"
echo "   3. git push"
echo "   4. Testar em: https://mzdocs-pro.netlify.app/"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   Se ainda houver problemas, verifique:"
echo "   • Console do navegador (F12 → Console)"
echo "   • Se há erros de JavaScript no seu código original"
echo "   • Se o CSS original não foi sobrescrito"
echo ""
echo -e "${GREEN}Feito!${NC}"
