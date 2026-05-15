# 📄 MzDocs Pro — v7.1.20260515

> Documentos profissionais gerados por IA, optimizados para Moçambique.
> PWA instalável · Offline-first · Supabase Auth · Vercel Serverless

**URL:** https://mz-docs-pro.vercel.app  
**Repositório:** https://github.com/manuelamadcharifo/MzDocs-Pro

---

## 🚀 Stack Técnico

| Camada | Tecnologia |
|--------|------------|
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
│   │   ├── auth.css                 # Modal de autenticação
│   │   └── editor.css               # Editor de documentos
│   └── js/
│       ├── app.js                    # Bootstrap da aplicação
│       ├── auth/
│       │   ├── AuthManager.js       # Gestão de sessão Supabase
│       │   ├── AuthUI.js            # Modal login/registo/recuperação
│       │   └── AuthGuard.js         # Protecção de rotas
│       ├── models/
│       │   └── Models.js            # CreditModel, DocumentModel, QueueModel, UserModel
│       ├── views/
│       │   └── Views.js             # DocumentView, ModalView, NotificationView
│       ├── controllers/
│       │   ├── DocumentController.js # Orquestra geração e edição de docs
│       │   ├── HistoryController.js  # Histórico de documentos (Supabase)
│       │   └── PaymentController.js # Fluxo de pagamento MPesa/e-Mola
│       ├── services/
│       │   ├── Services.js          # OpenRouterService, MPesaService, SupabaseService
│       │   ├── ServiceDefinitions.js # Catálogo de tipos de documento
│       │   └── LongDocumentEngine.js # Geração de documentos longos
│       ├── components/
│       │   ├── DocumentEditor.js    # Editor Markdown com preview e export
│       │   ├── PDFExporter.js       # Exportação PDF
│       │   ├── WordExporter.js      # Exportação Word
│       │   └── ExcelExporter.js     # Exportação Excel
│       ├── utils/
│       │   ├── Storage.js           # localStorage wrapper
│       │   ├── IndexedDB.js         # Base de dados offline
│       │   ├── Formatter.js         # Validação e formatação
│       │   ├── Sanitizer.js         # Sanitização de HTML (protecção XSS)
│       │   └── ExportManager.js     # Gestão de exportações
│       └── admin/
│           ├── AdminApp.js           # Bootstrap do painel admin
│           └── AdminDashboard.js    # Dashboard de administração
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
|----------|-------------|-----------|
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
- UI redirecciona automaticamente para o ecrã de login e pré-preenche o e-mail

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

### v7.1.20260515 — Correções de Bugs Críticos

#### Fix — Modal de registo ficava suspenso em "⏳ A criar conta..."

**Causa:** após criar a conta, `AuthManager.signUp()` tentava `supabase.auth.signInWithPassword()` sem timeout no `fetch()` inicial. Se o servidor Vercel estivesse em cold-start, o `fetch()` demorava >15s e a UI ficava congelada.

**Solução:** adicionado `Promise.race()` com timeout de 15s no `fetch('/api/auth/signup')`. O `_loadProfile()` agora faz **4 tentativas com backoff** para aguardar o trigger do Supabase criar o perfil.

#### Fix — Conteúdo gerado não aparecia no editor

**Causa:** o `DocumentEditor` criava o modal com HTML vazio e dependia do `index.html` ter o markup. Se o `textarea` não existisse no DOM no momento do `loadDocument()`, o conteúdo não era carregado.

**Solução:** o `_createModal()` agora cria o HTML completo inline como fallback. O `loadDocument()` usa `MutationObserver` para detectar quando o `textarea` fica disponível. Adicionado evento `editor:closed` para guardar edições no `DocumentModel`.

#### Fix — Botão de logout não visível

**Causa:** o logout só existia dentro do dropdown do avatar, que podia não renderizar correctamente se o `userMenu` innerHTML falhasse.

**Solução:** adicionado botão de logout **explícito** no header (`_ensureLogoutButton()`) que aparece sempre que o utilizador está autenticado, independentemente do dropdown.

#### Security — Sanitização de HTML no preview do editor

**Causa:** o preview do editor usava `innerHTML` com conteúdo da IA sem sanitização, expondo a potenciais ataques XSS.

**Solução:** criado `Sanitizer.js` com whitelist de tags e atributos permitidos. O `_renderPreview()` agora sanitiza o HTML antes de inserir no DOM.

---

### v7.0.20260515 — Estabilidade Auth + Segurança Sandbox

#### Fix — Modal de registo ficava suspenso em "⏳ A criar conta..."

**Causa:** após criar a conta, `AuthManager.signUp()` tentava `supabase.auth.signInWithPassword()` sem qualquer timeout. Se o Supabase SDK tentasse estabelecer uma ligação WebSocket em condições de rede instável, a Promise nunca resolvia.

**Solução:** o login automático pós-registo usa agora `Promise.race()` com um timeout de 8 segundos.

#### Fix — Aviso de segurança no iframe (`allow-same-origin` + `allow-scripts`)

**Causa:** os iframes de preview usavam `sandbox="allow-same-origin allow-scripts"`.

**Solução:** removido `allow-same-origin` de todos os iframes.

---

## 🗄️ Base de Dados (Supabase)

### Tabela `profiles`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Igual ao `auth.users.id` |
| `phone` | text | Número normalizado (+258XXXXXXXX) |
| `email` | text | E-mail de registo |
| `full_name` | text | Nome completo |
| `credits` | integer | Créditos disponíveis (padrão: 3) |
| `is_admin` | boolean | Acesso ao painel de administração |
| `updated_at` | timestamptz | Última actualização |

> **Nota:** as contas são criadas no Supabase Auth com **email + password**. O telemóvel é armazenado apenas em `profiles` e é usado para lookup no login.

### Tabela `transactions` (para pagamentos)

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_phone TEXT NOT NULL,
  package_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'mpesa',
  mpesa_receipt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## 📱 PWA

- Instalável em Android e iOS (Add to Home Screen)
- Cache offline via Workbox (NetworkFirst para API, CacheFirst para assets)
- Background Sync para documentos gerados offline (descartado automaticamente em erros de servidor)
- `CACHE_VERSION` actualizado automaticamente a cada deploy

---

## 🧪 Testes

```bash
# Instalar dependências de teste
npm install

# Correr todos os testes
npm test

# Correr testes em watch mode
npm run test:watch

# Correr apenas testes de auth
npm run test:auth
```

---

## 📞 Suporte

**WhatsApp:** +258 85 869 5506  
**E-mail:** suporte@mzdocs.co.mz
