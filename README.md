# MzDocs Pro v3.3 🇲🇿

Plataforma de geração inteligente de documentos para Moçambique — PWA completo com IA gratuita, pagamentos M-Pesa, OCR, editor Markdown, histórico local e painel administrativo.

**Stack:** Arquitectura MVC · Groq + Gemini + OpenRouter (IA em corrida paralela) · Supabase Auth (Email + Phone) + PostgreSQL · Vercel Serverless Functions · Tesseract.js OCR · Workbox PWA

---

## 📁 Estrutura do Projecto

MzDocs-Pro/
├── index.html
├── admin.html
├── offline.html
├── manifest.json
├── sw.js
├── vercel.json
├── package.json
│
├── api/
│   ├── config.js
│   ├── generate-document.js
│   ├── process-payment.js
│   ├── verify-credits.js
│   ├── auth/
│   │   ├── signup.js
│   │   ├── signin.js
│   │   ├── reset-password.js
│   │   └── verify-otp.js               ← Deprecado (retorna 410)
│   └── admin/
│       ├── confirm-payment.js
│       ├── transactions.js
│       └── stats.js
│
├── assets/
│   ├── css/
│   │   ├── styles.css
│   │   ├── editor.css
│   │   └── auth.css
│   ├── icons/
│   │   ├── icon.svg
│   │   ├── icon-192x192.png
│   │   ├── icon-512x512.png
│   │   └── apple-touch-icon.png
│   └── js/
│       ├── app.js                      ← Bootstrap MVC
│       ├── models/Models.js
│       ├── views/Views.js
│       ├── controllers/
│       │   ├── DocumentController.js
│       │   ├── PaymentController.js
│       │   ├── OCRController.js
│       │   └── HistoryController.js
│       ├── components/
│       │   ├── DocumentEditor.js
│       │   ├── PDFExporter.js
│       │   ├── WordExporter.js
│       │   ├── ExcelExporter.js
│       │   └── SignatureCanvas.js
│       ├── services/
│       │   ├── Services.js
│       │   ├── ServiceDefinitions.js
│       │   ├── PaymentService.js
│       │   └── MPesaService.js
│       ├── auth/
│       │   ├── AuthManager.js
│       │   ├── AuthUI.js
│       │   └── AuthGuard.js
│       └── utils/
│           ├── Storage.js
│           ├── Formatter.js
│           └── IndexedDB.js
│
└── supabase/
    ├── schema.sql
    ├── polices.sql
    └── migration_add_email.sql         ← NOVO v3.3
```

---

## 🚀 Deploy Rápido (Vercel)

### 1. Clonar e fazer deploy

```bash
git clone https://github.com/manuelamadcharifo/MzDocs-Pro
cd MzDocs-Pro
vercel --prod
```

### 2. Variáveis de ambiente obrigatórias

Configure no **Vercel Dashboard → Settings → Environment Variables**:

| Variável | Obrigatório | Descrição |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL do projecto Supabase |
| `SUPABASE_ANON_KEY` | ✅ | Chave anónima pública |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave privada (admin) |
| `GROQ_API_KEY` | ✅ (1 de 3) | console.groq.com — gratuito |
| `GEMINI_API_KEY` | ✅ (1 de 3) | aistudio.google.com — gratuito |
| `OPENROUTER_API_KEY` | ✅ (1 de 3) | openrouter.ai — gratuito |
| `SITE_URL` | ✅ | `https://mz-docs-pro.vercel.app` |
| `WHATSAPP_NUMBER` | ✅ | Número de suporte (ex: `258848XXXXXX`) |
| `MPESA_API_KEY` | Opcional | API M-Pesa automático |
| `MPESA_SERVICE_CODE` | Opcional | Código do serviço M-Pesa |

> **Nota:** Basta uma das 3 chaves de IA para o sistema funcionar. Com todas as 3, o documento é gerado pelo provider mais rápido a responder.

> **Nota v3.3:** `SUPABASE_SERVICE_ROLE_KEY` já não é necessária para reset de password — o reset usa o método nativo do Supabase (gratuito, sem SMS). Continua necessária apenas para o painel admin.

### 3. Supabase — aplicar schema

No **Supabase Dashboard → SQL Editor**, execute em ordem:

```sql
-- 1. Tabelas, trigger e funções
-- (conteúdo de supabase/schema.sql)

-- 2. Row Level Security policies
-- (conteúdo de supabase/polices.sql)
```

**Se já tens o schema aplicado da v3.2**, execute apenas a migração:

```sql
-- (conteúdo de supabase/migration_add_email.sql)
```

### 4. Supabase Auth — configurar Email Auth

**Authentication → Providers → Email → activar.**

Desactivar "Confirm email" se não quiser verificação por email no registo (recomendado para começar).

> **Nota:** Phone Auth continua suportado para login, mas o identificador principal passou a ser o email.

---

## 👤 Modelos de Acesso

### Visitante (sem conta)
- Header mostra apenas **🔐 Entrar** — sem ruído visual
- Banner de boas-vindas com botão directo **Comprar acesso avulso · 50 MZN**
- Ao tentar gerar um documento, o modal de pagamento abre em modo visitante
- Após pagar 50 MZN: acesso a 1 documento gerado por IA + 2 revisões

### Utilizador Registado
- Header: avatar · 📁 Arquivo · ⚡ créditos · + Comprar
- Recebe **3 créditos grátis** ao criar conta (trigger Supabase)
- Compra pacotes de créditos e acompanha saldo em tempo real
- Arquivo de documentos guardados localmente (IndexedDB)

### Administrador
- `is_admin: true` em `app_metadata` (editável via `SUPABASE_SERVICE_ROLE_KEY`)
- Acesso ao painel `/admin.html`
- Confirma pagamentos manuais e atribui créditos
- Dashboard com estatísticas e gráficos

---

## 💳 Pacotes de Créditos

| Pacote | Preço | Créditos | Preço/doc | Conta necessária |
|---|---|---|---|---|
| **Avulso** | MZN 50 | 3 | MZN 16.7 | ❌ Não |
| Starter | MZN 150 | 10 | MZN 15.0 | ✅ Sim |
| Básico ⭐ | MZN 350 | 25 | MZN 14.0 | ✅ Sim |
| Pro | MZN 750 | 60 | MZN 12.5 | ✅ Sim |

**Fluxo de pagamento manual (quando M-Pesa automático não está configurado):**
1. Utilizador escolhe pacote → introduz número → clica "Confirmar e Abrir WhatsApp"
2. Sistema cria transação `pending` com referência única e abre WhatsApp
3. Utilizador faz M-Pesa para o número indicado e envia comprovativo pelo WhatsApp
4. Admin confirma no painel `/admin.html` → créditos adicionados automaticamente

---

## 🤖 Geração de Documentos com IA

O sistema usa **corrida paralela entre 3 providers** — o mais rápido a responder ganha, os outros são cancelados via `AbortController`:

```
Groq   (llama-3.3-70b-versatile)    ─┐
Gemini (gemini-1.5-flash)            ├─ Promise.any() → resposta ao utilizador
OpenRouter (llama / gemma / mistral) ─┘
```

Após gerar, o utilizador pode clicar em **✏️ Editar** para modificar o documento com instruções em linguagem natural, usando a mesma corrida paralela.

---

## 📱 PWA — Funcionalidades Offline

- **Precache completo:** 33 ficheiros (HTML, CSS, todos os módulos JS, ícones)
- **Estratégias de cache:** CacheFirst para assets estáticos, NetworkFirst para API
- **Background sync:** documentos pendentes são enviados quando a ligação volta
- **Instalável:** manifesto com screenshots, shortcuts e ícones maskable conformes (W3C)

---

## 📁 Arquivo de Documentos

Todos os documentos gerados são guardados automaticamente no **IndexedDB local**.

- Acessível via botão **📁** no header (visível apenas para utilizadores autenticados)
- Pré-visualização, cópia para clipboard, download e eliminação individual
- Botão "Limpar tudo" para apagar o arquivo completo
- Funciona offline — documentos disponíveis sem internet

---

## 🔒 Segurança

- **RLS activado** em todas as tabelas — utilizadores só acedem aos seus dados
- **Supabase Email Auth** — autenticação por email + password; telemóvel guardado em `profiles`
- **Reset de password** — via email nativo do Supabase (gratuito, sem SMS, sem custo)
- **CORS restrito** — API aceita pedidos apenas de `SITE_URL`
- **Rate limiting** — 10 req/min por IP no endpoint de geração (em memória)
- **Chaves separadas** — `anon key` no frontend; `service_role key` apenas em serverless

---

## 🛠️ Desenvolvimento Local

```bash
npm install
vercel dev   # Frontend + funções serverless em localhost
```

---

## 📋 Changelog

### v3.3 (actual)

#### Autenticação — email obrigatório + login duplo

- **Registo** agora requer 5 campos: Nome · Telemóvel · E-mail · Password · Confirmar password
- Email validado no frontend e verificado como único antes de criar a conta
- **Login** aceita telemóvel ou email indistintamente no mesmo campo — `AuthManager.signIn()` detecta automaticamente
- Identificador principal no Supabase Auth passou de telemóvel para email (mais estável no plano gratuito)

#### Recuperação de password — 100% gratuita via email

- Substituído o fluxo anterior (redefinição directa, inseguro) por `supabase.auth.resetPasswordForEmail()`
- O Supabase envia o link de reset pelo seu próprio sistema de email — sem custo, funciona no plano free
- Formulário "Esqueceu a password?" pede apenas o email (antes pedia telemóvel + nova password)
- Nova vista `forgotSent` com mensagem clara a instruir o utilizador a verificar o spam
- Resposta sempre genérica (sucesso) — não revela se o email está ou não registado
- `api/auth/reset-password.js` simplificado: usa apenas `SUPABASE_ANON_KEY`, sem `listUsers()`

#### Schema e migração

- Tabela `profiles` ganhou coluna `email` com índice único
- Trigger `handle_new_user` actualizado para guardar o email
- `supabase/migration_add_email.sql` — para quem já tem a base criada na v3.2: adiciona coluna, cria índices, popula a partir de `auth.users`

#### Header

- Quando autenticado, o header mostra nome + email ou telemóvel por baixo — o utilizador sabe com que conta está a trabalhar

### v3.2
- `HistoryController.js` — arquivo de documentos em IndexedDB
- Header limpo para visitantes (apenas 🔐 Entrar)
- Pacote avulso 50 MZN sem conta obrigatória
- Precache expandido para 33 ficheiros
- Aviso de processo manual no modal de pagamento
- Feedback visual no botão de download
- Correcção typo `ExcelExporter.js`

### v3.1
- Arquitectura MVC completa
- Corrida paralela Groq + Gemini + OpenRouter com AbortController
- Autenticação por telemóvel (Supabase Phone Auth + password)
- Editor Markdown com re-edição por IA
- Exportação PDF, Word e Excel
- OCR com Tesseract.js
- Painel administrativo com Chart.js
- Background Sync + Push Notifications
- Pagamento manual via WhatsApp + M-Pesa automático