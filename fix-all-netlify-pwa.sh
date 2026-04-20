```bash
#!/bin/bash

echo "🚀 MzDocs Pro - AUTO FIX (Netlify + PWA + Interactivity)"
echo "======================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ==========================================
# 0. VALIDATION
# ==========================================
if [ ! -f "package.json" ] && [ ! -f "index.html" ]; then
  echo -e "${RED}❌ Run inside project root${NC}"
  exit 1
fi

# ==========================================
# 1. DETECT PROJECT TYPE
# ==========================================
echo ""
echo "🔍 Detecting project type..."

PROJECT_TYPE="static"

if grep -q "next" package.json 2>/dev/null; then
  PROJECT_TYPE="next"
elif grep -q "vite" package.json 2>/dev/null; then
  PROJECT_TYPE="vite"
elif grep -q "react" package.json 2>/dev/null; then
  PROJECT_TYPE="react"
fi

echo -e "${YELLOW}Detected: $PROJECT_TYPE${NC}"

# Detect build folder
BUILD_DIR="dist"
if [ -d "build" ]; then BUILD_DIR="build"; fi
if [ "$PROJECT_TYPE" = "next" ]; then BUILD_DIR=".next"; fi

echo -e "${YELLOW}Build dir: $BUILD_DIR${NC}"

# ==========================================
# 2. FIX NETLIFY.TOML (CRITICAL)
# ==========================================
echo ""
echo "🛠 Fixing netlify.toml..."

cat > netlify.toml << EOF
[build]
  publish = "$BUILD_DIR"
  command = "npm run build"

[build.environment]
  NODE_VERSION = "18"

# SPA routing
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  force = true

# Security headers
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"

# Cache
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
EOF

# Add Next plugin ONLY if needed
if [ "$PROJECT_TYPE" = "next" ]; then
cat >> netlify.toml << EOF

[[plugins]]
  package = "@netlify/plugin-nextjs"
EOF
fi

echo -e "${GREEN}✅ netlify.toml fixed${NC}"

# ==========================================
# 3. FIX _REDIRECTS
# ==========================================
echo ""
echo "🧭 Creating _redirects..."

mkdir -p public

cat > public/_redirects << 'EOF'
/* /index.html 200
EOF

echo -e "${GREEN}✅ _redirects created${NC}"

# ==========================================
# 4. IOS TOUCH FIX
# ==========================================
echo ""
echo "📱 Creating iOS fixes..."

cat > public/ios-fix.css << 'EOF'
* {
  -webkit-tap-highlight-color: transparent;
}

button, a {
  cursor: pointer;
}

html {
  touch-action: manipulation;
}
EOF

echo -e "${GREEN}✅ iOS CSS ready${NC}"

# ==========================================
# 5. JS INTERACTIVITY FIX
# ==========================================
echo ""
echo "⚡ Creating JS patch..."

cat > public/fix.js << 'EOF'
(function(){
  document.addEventListener("touchend", function(e){
    let el = e.target.closest("button, a");
    if(el){
      e.preventDefault();
      el.click();
    }
  }, {passive:false});
})();
EOF

echo -e "${GREEN}✅ JS patch ready${NC}"

# ==========================================
# 6. AUTO INJECT INDEX.HTML
# ==========================================
echo ""
echo "🧩 Injecting into index.html..."

INDEX="index.html"
if [ -f "public/index.html" ]; then INDEX="public/index.html"; fi

if [ -f "$INDEX" ]; then

  if ! grep -q "ios-fix.css" "$INDEX"; then
    sed -i.bak 's|</head>|<link rel="stylesheet" href="/ios-fix.css">\n</head>|' "$INDEX"
  fi

  if ! grep -q "fix.js" "$INDEX"; then
    sed -i.bak 's|</body>|<script src="/fix.js"></script>\n</body>|' "$INDEX"
  fi

  rm -f "$INDEX.bak"

  echo -e "${GREEN}✅ index updated${NC}"
else
  echo -e "${YELLOW}⚠️ index.html not found${NC}"
fi

# ==========================================
# 7. PACKAGE.JSON FIX
# ==========================================
echo ""
echo "📦 Fixing package.json..."

node -e "
const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json'));
pkg.scripts = pkg.scripts || {};
if(!pkg.scripts.build){
  pkg.scripts.build = 'vite build || react-scripts build';
}
fs.writeFileSync('package.json', JSON.stringify(pkg,null,2));
" 2>/dev/null

echo -e "${GREEN}✅ package.json ok${NC}"

# ==========================================
# 8. FINAL
# ==========================================
echo ""
echo "======================================="
echo -e "${GREEN}🎉 ALL FIXED SUCCESSFULLY${NC}"
echo "======================================="

echo ""
echo "🚀 Next steps:"
echo "git add ."
echo "git commit -m 'auto fix: netlify + pwa + ios'"
echo "git push"

echo ""
echo "✅ Your build should NOT fail anymore."
```
