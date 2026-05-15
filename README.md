# 📄 MzDocs Pro — v7.0.20260515

> Documentos profissionais gerados por IA, optimizados para Moçambique.  
> PWA installável · Offline-first · Supabase Auth · Vercel Serverless

**URL:** https://mz-docs-pro.vercel.app  
**Repositório:** https://github.com/manuelamadcharifo/MzDocs-Pro

---

## 🚀 Stack Técnico

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 · CSS3 · JavaScript ES Modules (sem framework) |
| PWA | Service Worker (Workbox 7) · Web App Manifest · Offline cache |
| Auth | Supabase Auth (email + password) · Supabase JS SDK via CDN |
| Base de dados | Supabase (PostgreSQL) — tabela `profiles` |
| Backend | Vercel Serverless Functions (Node.js 20) |
| IA | Claude (Anthropic) via API · multi-provider com fallback |
| Pagamentos | MPesa / e-Mola (simulado) |

---

## 📁 Estrutura do Projecto

```
MzDocs-Pro/
├── index.html                        # SPA principal
├── sw.js                             # Service Worker (Workbox 7, cache offline)
├── manifest.json                     # PWA manifest
├── vercel.json                       # Config Vercel (rotas, timeouts, buildCommand)
├── package.json                      # Dependências e scripts de build
├── scripts/
│   └── inject-version.js             # Auto-gera CACHE_VERSION no sw.js a cada deploy
├── assets/
│   ├── css/
│   │   ├── styles.css                # Estilos globais
│   │   ├── auth.css                  # Modal de autenticação
│   │   └── editor.css                # Editor de documentos
│   └── js/
│       ├── app.js                    # Bootstrap da aplicação
│       ├── auth/
│       │   ├── AuthManager.js        # Gestão de sessão Supabase
│       │   ├── AuthUI.js             # Modal login/registo/recuperação
│       │   └── AuthGuard.js          # Protecção de rotas
│       ├── models/
│       │   └── Models.js             # CreditModel, DocumentModel
│       ├── views/
│       │   └── Views.js              # DocumentView, ModalView, NotificationView
│       ├── controllers/
│       │   ├── DocumentController.js # Orquestra geração e edição de docs
│       │   ├── HistoryController.js  # Histórico de documentos (Supabase)
│       │   └── PaymentController.js  # Fluxo de pagamento MPesa/e-Mola
│       ├── services/
│       │   └── Services.js           # Catálogo de tipos de documento e preços
│       ├── components/
│       │   └── DocumentEditor.js     # Editor WYSIWYG A4 com preview e export
│       └── admin/
│           ├── AdminApp.js           # Bootstrap do painel admin
│           └── AdminDashboard.js     # Dashboard de administração
└── api/
    ├── auth/
    │   └── index.js                  # Router auth: signup · signin · reset-password
    ├── config.js                     # Expõe env vars públicas ao frontend
    ├── generate-document.js          # Geração de documento via IA (Claude)
    ├── deduct-credit.js              # Debita crédito após geração
    ├── verify-credits.js             # Consulta saldo de créditos (auth obrigatória)
    ├── process-payment.js            # Processa pagamento MPesa/e-Mola
    └── delete-temp-account.js        # Remove contas temporárias
```

---

## 🔑 Variáveis de Ambiente (Vercel)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL do projecto Supabase |
| `SUPABASE_ANON_KEY` | ✅ | Chave anónima pública |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ Recomendada | Chave de service role (gravar perfis, verificar créditos) |
| `ANTHROPIC_API_KEY` | ✅ | Chave da API Claude (Anthropic) |
| `SITE_URL` | ✅ | URL do site (ex: `https://mz-docs-pro.vercel.app`) |

---

## 🔐 Fluxo de Autenticação

### Registo
1. Utilizador preenche nome, telemóvel, e-mail e password
2. `AuthUI._handleRegister()` valida os campos e chama `authManager.signUp()`
3. `POST /api/auth/signup` valida duplicados em `profiles` e cria conta no Supabase Auth com **email + password**
4. Servidor responde `201` imediatamente; gravação do perfil em `profiles` corre em **background** (não bloqueia o cliente)
5. `AuthManager.signUp()` tenta login automático:
   - Se o servidor devolveu `session` → usa `setSession()` directamente
   - Se não há sessão → aguarda 800 ms e tenta `signInWithPassword({ email, password })` com **timeout de 8 s**
   - Se ambos falham (ex: confirmação de email activa) → mostra ecrã de sucesso informativo
6. Login bem-sucedido → modal fecha e aparece toast de boas-vindas

### Login
- Aceita **e-mail** ou **número de telemóvel**
- Com telemóvel: tenta `signInWithPassword({ phone })` primeiro; se falhar, procura `email` em `profiles` e tenta `signInWithPassword({ email })`
- Protegido com flag `_loginSubmitting` para evitar submissões duplas

### Conflito (conta existente)
- Servidor devolve `409` com mensagem portuguesa
- UI redireciona automaticamente para o ecrã de login e pré-preenche o e-mail

---

## 🏗️ Build e Deploy

```bash
# Instalar dependências
npm install

# Desenvolvimento local
vercel dev

# Deploy (Vercel corre automaticamente o buildCommand)
vercel --prod
```

O `vercel.json` define `"buildCommand": "node scripts/inject-version.js"`, que:
- Substitui `CACHE_VERSION` em `sw.js` pela data UTC do deploy (formato `v7-YYYYMMDD`)
- Actualiza o campo `version` em `package.json`

**Não é necessário editar `sw.js` manualmente antes de cada deploy.**

---

## 🖥️ Editor de Documentos

- Preview A4 fiel (PDF / Word / Excel) via **Blob URL** em `<iframe sandbox="allow-scripts">`
- Edição rich text com toolbar estilo Word (execCommand + contenteditable)
- Export: PDF (jsPDF), Word (.doc), Excel (.xls)
- `---PAGE_BREAK---` convertido correctamente para quebra de página CSS
- Blob URL revogado automaticamente ao fechar (sem fugas de memória)

---

## 📋 Changelog

### v7.0.20260515 — Estabilidade Auth + Segurança Sandbox

#### Fix — Modal de registo ficava suspenso em "⏳ A criar conta..."

**Causa:** após criar a conta, `AuthManager.signUp()` tentava `supabase.auth.signInWithPassword()` sem qualquer timeout. Se o Supabase SDK tentasse estabelecer uma ligação WebSocket (Realtime) em condições de rede instável, a Promise nunca resolvia — a UI ficava congelada indefinidamente.

**Solução:** o login automático pós-registo usa agora `Promise.race()` com um timeout de 8 segundos. Se o login não responder a tempo, a UI avança para o ecrã de sucesso informativo em vez de ficar suspensa.

```js
const loginResult = await Promise.race([
    this.supabase.auth.signInWithPassword({ email, password }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
]);
```

#### Fix — Aviso de segurança no iframe (`allow-same-origin` + `allow-scripts`)

**Causa:** os iframes de preview usavam `sandbox="allow-same-origin allow-scripts"`. O Chrome avisa que esta combinação permite ao documento dentro do iframe escapar do sandboxing. Com Blob URLs (já implementados), `allow-same-origin` não é necessário.

**Solução:** removido `allow-same-origin` de todos os iframes. Apenas `sandbox="allow-scripts"` mantido.

**Ficheiros:** `assets/js/components/DocumentEditor.js`, `assets/js/views/Views.js`

---

### v7.0.20260514 — Série de Correcções Auth + Editor

| Versão interna | Fix |
|---|---|
| v7.1 | Múltiplos pedidos duplicados a `/api/auth/signup` (guard `_mzdocsBound` + flags `_registerSubmitting`/`_loginSubmitting`) |
| v7.1 | `verify-credits.js` aceitava GET sem autenticação → apenas POST com `Authorization` obrigatório |
| v7.1 | Service Worker re-tentava documentos com erros 402/500 via BackgroundSync |
| v7.2 | `CACHE_VERSION` em `sw.js` agora gerado automaticamente a cada deploy via `scripts/inject-version.js` |
| v7.2 | Erro 409 no registo redireciona automaticamente para login com e-mail pré-preenchido |
| v7.3 | Servidor responde `201` imediatamente; gravação do perfil em background (elimina latência de 2,6 s) |
| v7.3 | Login automático pós-registo com `signInWithPassword` + modal fecha ao autenticar |
| v7.4 | Preview do editor e do resultado usa Blob URL em vez de `srcdoc` (resolve bloqueio de scripts em `about:srcdoc`) |
| v7.4 | `---PAGE_BREAK---` convertido correctamente (placeholder antes do escape HTML) |
| v7.4 | Login por telemóvel faz fallback para lookup de email em `profiles` |

---

## 🗄️ Base de Dados (Supabase)

### Tabela `profiles`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Igual ao `auth.users.id` |
| `phone` | text | Número normalizado (+258XXXXXXXX) |
| `email` | text | E-mail de registo |
| `full_name` | text | Nome completo |
| `credits` | integer | Créditos disponíveis (padrão: 3) |
| `is_admin` | boolean | Acesso ao painel de administração |
| `updated_at` | timestamptz | Última actualização |

> **Nota:** as contas são criadas no Supabase Auth com **email + password**. O telemóvel é armazenado apenas em `profiles` e é usado para lookup no login.

---

## 📱 PWA

- Installável em Android e iOS (Add to Home Screen)
- Cache offline via Workbox (NetworkFirst para API, CacheFirst para assets)
- Background Sync para documentos gerados offline (descartado automaticamente em erros de servidor)
- `CACHE_VERSION` actualizado automaticamente a cada deploy

---

## 📞 Suporte

**WhatsApp:** +258 85 869 5506  
**E-mail:** suporte@mzdocs.co.mz
