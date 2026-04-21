# 🚀 COPILOT MASTER SCRIPT — MIGRAÇÃO PWA (NETLIFY → VERCEL)

## 🧠 MODO DE OPERAÇÃO

Você (GitHub Copilot) deve:

- Ler TODO o projeto antes de fazer qualquer alteração
- Entender a arquitetura atual (frontend + backend + PWA)
- NÃO recriar o projeto do zero
- NÃO alterar a lógica existente sem necessidade
- Trabalhar de forma incremental e segura

---

## 🎯 OBJETIVO PRINCIPAL

Migrar o projeto PWA de Netlify para Vercel garantindo:

- ✅ Zero quebra de funcionalidade
- ✅ Zero erros de sintaxe (JS, CSS, HTML)
- ✅ UI/UX intacta ou melhorada (sem alterar design base)
- ✅ Todos eventos (click, submit, etc.) funcionando
- ✅ Service Worker funcionando corretamente
- ✅ APIs funcionando corretamente

---

## 🔍 ETAPA 1 — ANÁLISE COMPLETA (OBRIGATÓRIO)

Antes de qualquer modificação:

1. Mapear estrutura do projeto
2. Identificar:
   - Arquivos principais (index.html, main.js, app.js)
   - Service Worker (sw.js)
   - manifest.json
   - Funções backend (netlify/functions)
3. Identificar dependências de:
   - Netlify (netlify.toml, _redirects)
4. Identificar:
   - Erros de console
   - Funções quebradas
   - Elementos não clicáveis

🚨 NÃO MODIFICAR NADA nesta etapa

---

## ⚙️ ETAPA 2 — MIGRAÇÃO DE BUILD

### Validar package.json

Garantir que exista:

```json
"scripts": {
  "dev": "...",
  "build": "...",
  "start": "..."
}