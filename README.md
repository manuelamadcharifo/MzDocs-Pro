# 📄 MzDocs Pro — v8.0

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
| Base de dados | Supabase (PostgreSQL) — tabela `profiles` + `credit_packages` + `credit_usage_log` |
| Backend | Vercel Serverless Functions (Node.js 20) + Cron Jobs |
| IA | Multi-provider com corrida paralela: Groq · Gemini · OpenRouter · Cerebras · NVIDIA NIM |
| Pagamentos | MPesa (manual via WhatsApp) |

---

## 📁 Estrutura do Projecto

```
MzDocs-Pro/
├── index.html
├── sw.js                             # Service Worker (Workbox 7, cache offline)
├── manifest.json
├── vercel.json                       # Rotas, timeouts, cron jobs, buildCommand
├── package.json
├── scripts/
│   └── inject-version.js             # Auto-gera CACHE_VERSION no sw.js a cada deploy
├── assets/
│   ├── css/
│   │   ├── styles.css
│   │   ├── auth.css
│   │   └── editor.css
│   └── js/
│       ├── app.js
│       ├── auth/
│       │   ├── AuthManager.js        # Sessão Supabase + expõe profile.account_type
│       │   ├── AuthUI.js
│       │   └── AuthGuard.js
│       ├── models/
│       │   └── Models.js             # CreditModel, DocumentModel, QueueModel, UserModel
│       ├── views/
│       │   └── Views.js
│       ├── controllers/
│       │   ├── DocumentController.js # Geração + aviso de último crédito
│       │   ├── HistoryController.js
│       │   └── PaymentController.js  # Pacotes v8.0 + modal showAfterLastCredit()
│       ├── services/
│       │   ├── Services.js
│       │   ├── ServiceDefinitions.js
│       │   ├── PaymentService.js     # Preços v8.0: Avulso/Starter/Básico/Pro/Empresa
│       │   └── LongDocumentEngine.js
│       ├── components/
│       │   ├── DocumentEditor.js
│       │   ├── PDFExporter.js
│       │   ├── WordExporter.js
│       │   └── ExcelExporter.js
│       ├── utils/
│       │   ├── Storage.js
│       │   ├── IndexedDB.js
│       │   ├── Formatter.js
│       │   ├── Sanitizer.js
│       │   └── ExportManager.js
│       └── admin/
│           ├── AdminApp.js
│           └── AdminDashboard.js
├── api/
│   ├── auth/
│   │   └── index.js                  # signup (1 crédito grátis) · signin · reset-password
│   ├── config.js
│   ├── generate-document.js          # Geração via IA (5 providers em corrida paralela)
│   ├── deduct-credit.js              # Debita crédito + auto-elimina conta avulso a 0
│   ├── verify-credits.js
│   ├── process-payment.js
│   ├── delete-temp-account.js        # Elimina contas avulso expiradas (fallback manual)
│   └── cleanup-temp-accounts.js      # Cron diário 00:00 UTC — limpa contas expiradas
└── supabase/
    ├── schema.sql
    ├── migration_v8_pricing_temp_accounts.sql  ← NOVO: migração v8.0
    └── ...outros ficheiros de migração
```

---

## 💳 Pacotes de Créditos (v8.0)

| Pacote | Créditos | Preço (MZN) | MZN/crédito | Destaque |
|--------|----------|-------------|-------------|---------|
| Avulso | 3 | 50 | 16,67 | Sem conta permanente, expira em 7 dias |
| Starter | 10 | 120 | 12,00 | Economia 28% |
| **Básico** | **25** | **280** | **11,20** | **Mais Popular** |
| Pro | 60 | 600 | 10,00 | Economia 40% |
| Empresa | 150 | 1.500 | 10,00 | Multi-utilizador |

### Tipos de conta

| Tipo | Créditos iniciais | Expiração | Eliminação automática |
|------|-------------------|-----------|----------------------|
| `normal` | 1 crédito grátis | 1 mês | ❌ (créditos zerados, conta mantida) |
| `avulso` | 3 créditos | 7 dias | ✅ (24h após créditos = 0, ou após 7 dias) |

---

## 🔑 Variáveis de Ambiente (Vercel)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | ✅ | URL do projecto Supabase |
| `SUPABASE_ANON_KEY` | ✅ | Chave anónima pública |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave de service role (perfis, créditos, deleção) |
| `SITE_URL` | ✅ | URL do site (ex: `https://mz-docs-pro.vercel.app`) |
| `CRON_SECRET` | ✅ | Segredo para autenticar o cron job de limpeza |
| `GROQ_API_KEY` | ⚠️ | Provider IA principal |
| `GEMINI_API_KEY` | ⚠️ | Provider IA fallback |
| `OPENROUTER_API_KEY` | ⚠️ | Provider IA fallback |
| `CEREBRAS_API_KEY` | ⚠️ | Provider IA fallback |
| `NVIDIA_API_KEY` | ⚠️ | Provider IA fallback |
| `UPSTASH_REDIS_REST_URL` | Opcional | Rate limiting persistente entre instâncias |
| `UPSTASH_REDIS_REST_TOKEN` | Opcional | Token Upstash Redis |

> ⚠️ Pelo menos um provider de IA deve estar configurado.

---

## 🗄️ Base de Dados (Supabase)

### Migração v8.0

Execute `supabase/migration_v8_pricing_temp_accounts.sql` no SQL Editor do Supabase antes de fazer deploy.

### Tabela `profiles` (colunas adicionadas em v8.0)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Igual ao `auth.users.id` |
| `phone` | text | Número normalizado (+258XXXXXXXX) |
| `email` | text | E-mail de registo |
| `full_name` | text | Nome completo |
| `credits` | integer | Créditos disponíveis |
| `account_type` | varchar(20) | `'normal'` ou `'avulso'` |
| `credits_expires_at` | timestamptz | Expiração dos créditos |
| `last_credit_used_at` | timestamptz | Última utilização (para cron de limpeza) |
| `free_credit_used` | boolean | Regista se o crédito grátis foi usado |
| `is_admin` | boolean | Acesso ao painel admin |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última actualização (trigger automático) |

### Tabela `credit_packages`

Populada automaticamente pela migração com os 5 pacotes v8.0.

### Tabela `credit_usage_log`

Auditoria de todos os créditos debitados (user_id, document_type, credits_used, remaining, timestamp).

### Funções SQL principais

| Função | Descrição |
|--------|-----------|
| `deduct_credits(uuid, int)` | Debita N créditos atomicamente (compatível com deduct-credit.js) |
| `deduct_credit_atomic(uuid, text, int)` | Debita com log de auditoria e verificação de expiração |
| `create_temp_account(text, text)` | Cria conta avulso com 3 créditos / 7 dias |
| `create_normal_account(uuid, text, text, text)` | Cria conta normal com 1 crédito / 1 mês |
| `cleanup_expired_temp_accounts()` | Limpeza manual (chamada pelo cron) |
| `normalize_phone(text)` | Remove caracteres não numéricos |

---

## 🔐 Fluxo de Autenticação

### Registo (v8.0)

1. Utilizador preenche nome, telemóvel, e-mail e password
2. `POST /api/auth/signup` valida duplicados e cria conta no Supabase Auth
3. Servidor responde `201` com mensagem **"1 crédito grátis atribuído (válido 1 mês)"**
4. Perfil é gravado em background com `account_type = 'normal'` e `credits_expires_at = NOW() + 1 mês`
5. Login automático → modal fecha e aparece toast de boas-vindas

> **v7.x → v8.0:** contas novas recebem **1 crédito** (não 3). O crédito expira ao fim de 1 mês se não comprar pacote.

### Conta Avulso

- Utilizador não autenticado que usa o sistema recebe uma conta temporária com 3 créditos
- Válida por 7 dias
- **Eliminada automaticamente** pelo cron diário após:
  - Créditos = 0 há mais de 24h, OU
  - Conta criada há mais de 7 dias

---

## ⏰ Cron Job — Limpeza de Contas

`api/cleanup-temp-accounts.js` executa diariamente à **00:00 UTC** (configurado em `vercel.json`).

**Regras aplicadas:**
1. Elimina contas `avulso` com `credits = 0` e `last_credit_used_at > 24h`
2. Elimina contas `avulso` criadas há mais de 7 dias
3. Zera créditos de contas `normal` com `credits_expires_at` vencido (conta mantida)

**Protecção:** o endpoint exige o header `x-cron-secret` igual a `CRON_SECRET`.

---

## 💡 Aviso de Último Crédito (v8.0)

Após a geração bem-sucedida de um documento, se `creditModel.value === 0`:
- Aparece um toast flutuante 2 segundos depois (não bloqueia a visualização do documento)
- Para contas `avulso`: avisa que a conta será removida em 24h
- Para contas `normal`: convida a comprar créditos
- Botão "Comprar Créditos" abre o modal de pagamento directamente

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
- Substitui `CACHE_VERSION` em `sw.js` pela data UTC do deploy
- Actualiza o campo `version` em `package.json`

---

## 🖥️ Editor de Documentos

- Preview A4 fiel (PDF / Word / Excel) via Blob URL em `<iframe sandbox="allow-scripts">`
- Edição rich text com toolbar estilo Word (execCommand + contenteditable)
- Export: PDF (jsPDF), Word (.docx), Excel (.xlsx)
- `---PAGE_BREAK---` convertido correctamente para quebra de página CSS
- Blob URL revogado automaticamente ao fechar (sem fugas de memória)

---

## 📋 Changelog

### v8.0 — Pricing & Temp Accounts

#### Novos pacotes de preços (optimizados para Moçambique)

| Antes (v7.x) | Depois (v8.0) |
|---|---|
| Starter: 10 cr / 150 MZN | Starter: 10 cr / 120 MZN |
| Básico: 25 cr / 350 MZN | Básico: 25 cr / 280 MZN |
| Pro: 60 cr / 750 MZN | Pro: 60 cr / 600 MZN |
| — | Empresa: 150 cr / 1.500 MZN (NOVO) |

#### Registo: 3 créditos → 1 crédito grátis

Contas novas recebem 1 crédito grátis válido por 1 mês (`credits_expires_at`). Incentiva a compra de pacotes desde o início.

#### Contas Avulso (`account_type = 'avulso'`)

- 3 créditos por 50 MZN, sem conta permanente
- Eliminação automática após uso total (24h de graça) ou após 7 dias
- Campo `account_type` adicionado à tabela `profiles`

#### Cron job diário de limpeza

`api/cleanup-temp-accounts.js` + entrada `crons` em `vercel.json`. Protegido por `CRON_SECRET`.

#### Aviso de último crédito

Após usar o último crédito, um toast informativo aparece 2s depois da geração, sem bloquear a visualização do documento. Para contas avulso, avisa sobre eliminação automática em 24h.

#### `AuthManager.profile` getter

`window.authManager.profile` expõe agora `account_type`, `credits_expires_at` e `free_credit_used` para uso nos controllers.

#### Migração SQL

`supabase/migration_v8_pricing_temp_accounts.sql` — execute antes do primeiro deploy v8.0.

---

### v7.1 — Correções de Bugs Críticos

- Fix: modal de registo ficava suspenso em "⏳ A criar conta..." (timeout adicionado)
- Fix: conteúdo gerado não aparecia no editor (MutationObserver + fallback HTML)
- Fix: botão de logout não visível (botão explícito no header)
- Security: sanitização de HTML no preview do editor (Sanitizer.js com whitelist)

---

### v7.0 — Estabilidade Auth + Segurança Sandbox

- Fix: login automático pós-registo usa `Promise.race()` com timeout de 8s
- Fix: removido `allow-same-origin` dos iframes de preview

---

## 📱 PWA

- Instalável em Android e iOS (Add to Home Screen)
- Cache offline via Workbox (NetworkFirst para API, CacheFirst para assets)
- Background Sync para documentos gerados offline
- `CACHE_VERSION` actualizado automaticamente a cada deploy

---

## 🧪 Testes

```bash
npm install
npm test
npm run test:watch
npm run test:auth
```

---

## 📞 Suporte

**WhatsApp:** +258 85 869 5506  
**E-mail:** suporte@mzdocs.co.mz
