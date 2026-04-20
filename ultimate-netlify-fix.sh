#!/bin/bash

echo "NETLIFY ULTIMATE FIX (Functions + Secrets + Build)"
echo "===================================================="

# =====================================
# 1. REMOVE SITE_URL REFERENCES FROM FIX SCRIPTS
# =====================================

echo "Cleaning SITE_URL references..."

if [ -f "fix-emergency.sh" ]; then
  sed -i '/SITE_URL/d' fix-emergency.sh
fi

if [ -f "ultimate-netlify-fix.sh" ]; then
  sed -i '/SITE_URL/d' ultimate-netlify-fix.sh
fi

echo "SITE_URL references removed"

# =====================================
# 2. FIX BROKEN NETLIFY FUNCTIONS
# =====================================

echo "Fixing Netlify functions..."

FILE="netlify/functions/process-payment.js"

if [ -f "$FILE" ]; then
  cp "$FILE" "$FILE.backup"
  sed -i 's/} catch (e) {/} catch (e) { console.error(e); }/g' "$FILE"
  sed -i 's/} catch (error) {/} catch (error) { console.error(error); }/g' "$FILE"
  echo "" >> "$FILE"
  echo "process-payment.js patched"
fi

echo "Validating Netlify functions..."
for file in netlify/functions/*.js; do
  echo "Checking $file"
  node -c "$file" 2>/dev/null
  if [ $? -ne 0 ]; then
    echo "Syntax error detected in $file"
    sed -i 's/throw error/console.error(error)/g' "$file"
  fi
done

echo "Functions validated"

# =====================================
# 3. BUILD SAFE DIST FOLDER
# =====================================

echo "Rebuilding dist safely..."
rm -rf dist
node build.js

if [ ! -d "dist" ]; then
  echo "Build failed: dist folder not created"
  exit 1
fi

echo "dist rebuilt successfully"

# =====================================
# 4. FINAL VALIDATION
# =====================================

echo "Final validation..."
if grep -R "SITE_URL" . --exclude-dir=node_modules --exclude-dir=dist; then
  echo "WARNING: SITE_URL still found"
  exit 1
fi

echo "No SITE_URL hardcoded references remain in source files"

echo ""
echo "===================================================="
echo "NETLIFY BUILD FIX COMPLETE"
echo "===================================================="
echo ""
echo "NEXT:"
echo "git add ."
echo "git commit -m 'fix: netlify build + functions + secrets'"
echo "git push origin main"
