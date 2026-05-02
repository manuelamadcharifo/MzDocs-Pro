# MzDocs Pro v3.1 🇲🇿

Plataforma de geração inteligente de documentos para Moçambique — PWA completo com IA gratuita, pagamentos M-Pesa, OCR, editor Markdown e painel administrativo.

**Stack:** Arquitectura MVC · OpenRouter (IA Gratuita) · Supabase Auth (Phone) + PostgreSQL · Vercel Serverless Functions · Tesseract.js OCR · Chart.js · Workbox PWA

---

## 📁 Estrutura do Projecto

```
MzDocs-Pro/
├── index.html                          ← SPA principal (PWA shell)
├── admin.html                          ← Painel administrativo (requer is_admin=true)
├── offline.html                        ← Página de fallback sem internet
├── manifest.json                       ← PWA manifest (ícones PNG + screenshots)
├── sw.js                               ← Service Worker (Workbox + idb + offline fallback)
├── vercel.json                         ← Configuração de deploy Vercel + rotas API
├── package.json                        ← Dependências e scripts
│
├── api/                                ← Serverless Functions (Vercel)
│   ├── config.js                       ← Expõe supabaseUrl + supabaseAnonKey ao frontend
│   ├── generate-document.js            ← Proxy OpenRouter + fallback 3 modelos + rate limit
│   ├── process-payment.js              ← M-Pesa automático + pagamento manual WhatsApp
│   ├── verify-credits.js               ← Verificação/sincronização de créditos (tabela profiles)
│   ├── auth/
│   │   ├── signup.js                   ← Registo por TELEMÓVEL (+258) + password
│   │   ├── signin.js                   ← Login por telemóvel + password
│   │   ├── reset-password.js           ← Redefine password via número de telemóvel
│   │   └── verify-otp.js               ← Deprecado (retorna 410) — OTP não usado
│   └── admin/
│       ├── confirm-payment.js          ← Confirma pagamento pendente + adiciona créditos (admin)
│       ├── transactions.js             ← Lista transações com filtros (admin)
│       └── stats.js                    ← Estatísticas agregadas para dashboard (admin)
│
├── assets/
│   ├── css/
│   │   ├── styles.css                  ← Estilos globais + loader steps + temas
│   │   ├── editor.css                  ← Estilos do Editor Markdown interactivo
│   │   └── auth.css                    ← Estilos do modal de autenticação (AuthUI)
│   ├── icons/
│   │   ├── icon.svg                    ← Ícone SVG (fallback)
│   │   ├── icon-192x192.png            ← Ícone PNG obrigatório Android/Chrome
│   │   ├── icon-512x512.png            ← Ícone PNG splash screen
│   │   └── apple-touch-icon.png        ← Ícone 180x180 para iOS
│   ├── screenshots/
│   │   ├── screen-mobile.png           ← Screenshot para prompt de instalação PWA (mobile)
│   │   └── screen-desktop.png          ← Screenshot para prompt de instalação PWA (desktop)
│   └── js/
│       ├── app.js                      ← Bootstrap MVC: aguarda auth, conecta todos os módulos
│       ├── auth/
│       │   ├── AuthManager.js          ← Gestão Supabase Auth (phone+password, anonymous, ready())
│       │   ├── AuthUI.js               ← Modal de auth: login, registo, recuperação, modo visitante
│       │   └── AuthGuard.js            ← Protecção de rotas + applyVisibility() por data-auth
│       ├── admin/
│       │   ├── AdminApp.js             ← Painel admin completo (dashboard, transações, users, docs, settings)
│       │   ├── AdminDashboard.js       ← Módulo de dashboard com Chart.js (não importado pelo AdminApp — standalone)
│       │   └── AdminTransactions.js    ← Módulo de transações (não importado pelo AdminApp — standalone)
│       ├── components/
│       │   ├── DocumentEditor.js       ← Editor Markdown interactivo com reedição IA
│       │   ├── PDFExporter.js          ← Exportador PDF (jsPDF)
│       │   ├── WordExporter.js         ← Exportador Word (.doc)
│       │   └── ExelExporter.js         ← Exportador Excel para orçamentos (SheetJS)
│       ├── controllers/
│       │   ├── DocumentController.js   ← Abre formulários, gera documentos, download, WhatsApp
│       │   ├── PaymentController.js    ← Selecção de pacote, pagamento M-Pesa/manual
│       │   └── OCRController.js        ← Digitalização de rascunhos (Tesseract.js)
│       ├── models/
│       │   └── Models.js               ← CreditModel, DocumentModel, QueueModel, UserModel
│       ├── services/
│       │   ├── Services.js             ← OpenRouterService, MPesaService, SupabaseService
│       │   ├── ServiceDefinitions.js   ← Definição dos 7 serviços (campos, ícones, buildWA)
│       │   ├── PaymentService.js       ← Facade de pagamentos (M-Pesa + Manual)
│       │   └── MPesaService.js         ← Módulo standalone M-Pesa (standalone, não usado pelo PaymentController)
│       ├── utils/
│       │   ├── Storage.js              ← localStorage wrapper com namespace + getUserId()
│       │   ├── Formatter.js            ← Validator (phone, amount, required) + markdownToHTML
│       │   └── IndexedDB.js            ← OfflineDB: pending, documents, drafts (usado pelo app)
│       └── views/
│           └── Views.js                ← NotificationView, ModalView, DocumentView (renderForm, showLoader)
│
└── supabase/
    ├── schema.sql                      ← Tabelas + funções RPC + trigger handle_new_user
    └── polices.sql                     ← RLS policies adicionais
```

---

## ⚙️ Configuração — 4 Passos

### Passo 1 — Activar Phone Auth no Supabase (OBRIGATÓRIO)

> ⚠️ **Este passo é crítico.** Sem ele, o registo e login falham com erro 422.

1. Aceder ao projecto Supabase → **Authentication → Providers**
2. Clicar em **Phone**
3. Activar o toggle **Enable Phone provider**
4. Em **SMS Provider**, seleccionar **Twilio** (ou outro) **OU** deixar em modo teste
5. Para testes locais: activar **"Disable phone confirmations"** em Authentication → Settings

> **Modo de produção:** Configure um provider SMS (Twilio, MessageBird, Vonage) para enviar OTPs.  
> **Modo sem SMS:** Use `phone_confirm: true` via Admin SDK (já configurado no `signup.js`) — não requer SMS, o número é confirmado directamente.

### Passo 2 — OpenRouter (IA Gratuita)

1. Criar conta em [openrouter.ai](https://openrouter.ai)
2. **Keys → Create Key**
3. Copiar a chave `sk-or-v1-…`

> Custo: **MZN 0** — usa 3 modelos gratuitos com fallback automático.

### Passo 3 — Supabase (Base de dados + Auth)

1. Criar projecto em [supabase.com](https://supabase.com)
2. **SQL Editor** → colar `supabase/schema.sql` → executar
3. **SQL Editor** → colar `supabase/polices.sql` → executar
4. **Project Settings → API** → copiar:
   - `Project URL`
   - `anon public key`
   - `service_role key`

### Passo 4 — Variáveis de Ambiente (Vercel)

**Vercel Dashboard → Settings → Environment Variables:**

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `OPENROUTER_API_KEY` | Chave OpenRouter (`sk-or-v1-…`) | ✅ SIM |
| `SUPABASE_URL` | URL do projecto Supabase | ✅ SIM |
| `SUPABASE_ANON_KEY` | Chave anon pública | ✅ SIM |
| `SUPABASE_SERVICE_KEY` | Chave service_role (nunca exposta ao frontend) | ✅ SIM |
| `WHATSAPP_NUMBER` | Número WhatsApp suporte/pagamentos (`258XXXXXXXXX`) | ✅ SIM |
| `SITE_URL` | URL de produção (`https://mz-docs-pro.vercel.app`) | ✅ SIM |
| `MPESA_API_KEY` | Chave API M-Pesa (portal developer) | ❌ Opcional |
| `MPESA_SERVICE_CODE` | Código de serviço M-Pesa | ❌ Opcional |

> Sem `MPESA_*`: o sistema funciona em **modo manual** — WhatsApp com comprovativo.

---

## 🚀 Deploy na Vercel

### Via CLI

```bash
npm install -g vercel
vercel login
vercel          # desenvolvimento
vercel --prod   # produção
```

### Via Dashboard

1. [vercel.com](https://vercel.com) → **Add New Project** → importar repositório GitHub
2. Configurar as variáveis de ambiente
3. **Deploy**

---

## 🔐 Autenticação por Telemóvel

### Como funciona

O MzDocs Pro usa **número de telemóvel moçambicano + password** como método de autenticação principal — sem email obrigatório.

| Operação | Endpoint | Descrição |
|----------|----------|-----------|
| Registo | `POST /api/auth/signup` | Número (+258), password, nome opcional |
| Login | `POST /api/auth/signin` | Número + password → session token |
| Recuperar | `POST /api/auth/reset-password` | Número + nova password (via Admin SDK) |
| Anónimo | `authManager.signInAnonymous()` | 3 créditos locais, sem conta |

### Números suportados

- **Vodacom Moçambique:** 84, 85
- **Tmcel:** 86, 87
- **Movitel:** 84 (partilhado)

Formato aceite: `84 XXX XXXX`, `258841234567`, `+258841234567`

### Alterar o número WhatsApp de suporte/pagamentos

Substituir em **3 locais**:

```javascript
// assets/js/controllers/DocumentController.js (linha ~5)
const WA_NUMBER = '258858695506';

// assets/js/services/PaymentService.js (linha ~3)
const WA_NUMBER = '258858695506';

// assets/js/models/Models.js — UserModel (linha ~5)
this.WA_SUPPORT = '258858695506';
```

E na variável de ambiente `WHATSAPP_NUMBER` no Vercel.

---

## 🏗️ Fluxo MVC Completo

```
Utilizador clica serviço
        ↓
DocumentController.open(key)
        ↓
CreditModel.canConsume(1) → se não: PaymentController.showPricing()
        ↓
DocumentView.renderForm(svc) + OCRController (opcional)
        ↓
DocumentController.generate()
        ↓
QueueModel.add(job) ← fila inteligente (resolve rate limit OpenRouter)
        ↓
OpenRouterService.generate() → /api/generate-document → OpenRouter API
        ↓
DocumentView.showLoader(steps) ← progresso animado em 4 passos
        ↓
CreditModel.consume(1) → SupabaseService.deductCredit() (atómico) + fallback localStorage
        ↓
DocumentEditor.render(result.document) ← Editor Markdown com reedição IA
        ↓
Copiar / Download .md / PDF / Word / WhatsApp / Reeditar
```

---

## 💳 Sistema de Pagamentos

### Modo Manual (padrão — sem M-Pesa configurado)

1. Utilizador escolhe pacote → introduz número M-Pesa → clica "Confirmar"
2. Sistema gera referência única (`MANxxxxxxx`) e guarda transação com `status: pending`
3. Abre WhatsApp com mensagem pré-preenchida (valor, referência, número destino)
4. Utilizador faz transferência M-Pesa e envia comprovativo
5. Admin confirma no painel → RPC `add_credits()` adiciona créditos atomicamente

> ⚠️ **Créditos só são adicionados após confirmação do admin.** Nunca antes.

### Modo M-Pesa Automático (requer `MPESA_API_KEY` + `MPESA_SERVICE_CODE`)

1. Sistema inicia transação C2B via API M-Pesa
2. Utilizador confirma push notification no telemóvel
3. Créditos adicionados automaticamente

### Pacotes

| Pacote | Preço | Créditos | Custo/doc |
|--------|-------|----------|-----------|
| Starter | 150 MZN | 10 | 15 MZN |
| Básico | 350 MZN | 25 | 14 MZN |
| Pro | 750 MZN | 60 | 12.5 MZN |

Serviços gratuitos (impressão, foto, conversão) não consomem créditos.

---

## 🤖 Modelos IA (OpenRouter — Gratuitos)

| Ordem | Modelo | Papel |
|-------|--------|-------|
| 1º | `meta-llama/llama-3.3-70b-instruct:free` | Principal |
| 2º | `google/gemma-3-27b-it:free` | Fallback automático |
| 3º | `mistralai/mistral-7b-instruct:free` | Emergência |

Fallback automático em cascata em caso de rate limit (429) ou indisponibilidade (503).

---

## 🛡️ Segurança

- **CORS restrito** ao domínio de produção (`SITE_URL`) em todos os endpoints
- **Rate limiting** no `generate-document` (20 req/min por IP, em memória)
- **RLS (Row Level Security)** activo em todas as tabelas Supabase
- **Operações atómicas** via PostgreSQL functions com `SECURITY DEFINER`
- **Tokens JWT** verificados em todos os endpoints `/api/admin/*`
- **service_role key** nunca exposta ao frontend — apenas em Serverless Functions
- **Créditos manuais** só adicionados após confirmação do admin via `confirm-payment`

---

## 🔧 Changelog

### v3.1 (2026-05) — Auth por Telemóvel + Correcções Críticas

**Autenticação**
- ✅ Registo e login por **número de telemóvel moçambicano** (+258) + password — sem email
- ✅ `AuthUI.js` criado: modal completo (login, registo, recuperação, modo visitante)
- ✅ `AuthManager.js` reescrito: método `ready()` async, `signInAnonymous()` implementado
- ✅ `AuthGuard.js` agora é chamado em `app.js` via `authGuard.applyVisibility()`
- ✅ `api/auth/signup.js` — registo por phone via Supabase Admin SDK
- ✅ `api/auth/signin.js` — login `signInWithPassword({ phone, password })`
- ✅ `api/auth/reset-password.js` — redefine password via Admin SDK por telemóvel

**Bugs Críticos Corrigidos**
- ✅ `AdminApp`: race condition eliminado — `await authManager.ready()` antes de tudo
- ✅ `AdminApp`: `viewDocument()` implementado com modal inline
- ✅ `AdminApp`: settings forms agora guardam (`addEventListener submit`)
- ✅ `AdminApp`: `addCredits` substituiu `prompt()` por modal HTML nativo
- ✅ `AdminApp`: pesquisa de utilizadores (`searchUsers`) agora funciona
- ✅ `Services.js`: `SupabaseService` usa tabela `profiles` (não `users`)
- ✅ `Services.js`: lê config do `authManager` (não de `window.__SUPABASE_URL__`)
- ✅ `sw.js`: `idb` importado via `importScripts` — background sync funciona
- ✅ `PaymentController`: créditos só adicionados após confirmação (não em modo manual)
- ✅ `loaderWrap` + `loaderSteps` adicionados ao `index.html` — loader de geração funciona
- ✅ CSS `.lstep` / `.lnum` adicionado ao `styles.css`

**PWA**
- ✅ `offline.html` criado + `NavigationRoute` no Service Worker
- ✅ Ícones PNG gerados: `icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon.png`
- ✅ `manifest.json` com `screenshots`, `prefer_related_applications: false`
- ✅ Open Graph + Twitter Card + `apple-touch-icon` no `index.html`

**Segurança**
- ✅ CORS restrito ao `SITE_URL` em todos os endpoints (incluindo `/api/admin/*`)
- ✅ Rate limiting em `generate-document` (20 req/min por IP)

**Limpeza**
- ✅ `SupabaseService.js` standalone removido (duplicado com `Services.js`)
- ✅ `ExportManager.js` e `ExportService.js` removidos (código morto)
- ✅ `api/functions/config.js` removido (duplicado sem rota)
- ✅ `package.json` versão actualizada para `3.1.0`

### v3.0 (2025) — Lançamento Inicial

- Arquitectura MVC modular com ES Modules
- OpenRouter com fallback de 3 modelos gratuitos
- Supabase + operações atómicas de créditos
- Editor Markdown com reedição IA
- OCR com Tesseract.js
- PWA básico com Workbox

---

MzDocs Pro v3.1 © 2026 · MVC · OpenRouter · Supabase · Vercel · Feito para Moçambique 🇲🇿
