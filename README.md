# 📄 MzDocs Pro — v8.2

> Documentos profissionais gerados por IA, optimizados para Moçambique.  
> PWA instalável · Offline-first · Supabase Auth · Vercel Serverless · Blog CMS

**URL:** https://mz-docs-pro.vercel.app  
**Repositório:** https://github.com/manuelamadcharifo/MzDocs-Pro

---

## 🚀 Stack Técnico

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 · CSS3 · JavaScript ES Modules (sem framework) |
| PWA | Service Worker (Workbox 7) · Web App Manifest · Offline cache |
| Auth | Supabase Auth (email + password) |
| Base de dados | Supabase (PostgreSQL) |
| Backend | Vercel Serverless Functions (Node.js 20) + Cron Jobs |
| IA | Multi-provider em corrida paralela: Groq · Gemini · OpenRouter · Cerebras · NVIDIA NIM |
| Pagamentos | MPesa (manual via WhatsApp) |

---

## 📁 Estrutura do Projecto

```
MzDocs-Pro/
├── index.html
├── admin.html
├── sw.js                               # Service Worker (Workbox 7)
├── manifest.json
├── robots.txt                          # Allow /pages/, Disallow /admin, /api
├── sitemap.xml                         # Fallback estático (dinâmico via API)
├── vercel.json                         # Rotas, timeouts, cron jobs
├── scripts/
│   └── inject-version.js
├── pages/                              # Blog — páginas estáticas SEO
│   ├── index.html                      # Índice do blog
│   ├── _template.html                  # Template base com schema.org + CTA
│   ├── como-fazer-cv-mocambique.html
│   ├── carta-formal-mocambique.html
│   ├── requerimento-emprego-mocambique.html
│   ├── declaracao-residencia-mocambique.html
│   ├── contrato-arrendamento-mocambique.html
│   ├── recibo-pagamento-mocambique.html
│   ├── procuracao-mocambique.html
│   ├── plano-negocios-mocambique.html
│   ├── trabalho-escolar-mocambique.html
│   └── carta-recomendacao-mocambique.html
├── assets/
│   ├── css/
│   │   ├── styles.css
│   │   ├── auth.css
│   │   ├── editor.css
│   │   └── admin.css
│   └── js/
│       ├── app.js
│       ├── auth/
│       │   ├── AuthManager.js          # profile getter (account_type, credits_expires_at)
│       │   ├── AuthUI.js               # 1 crédito grátis no registo
│       │   └── AuthGuard.js
│       ├── models/
│       │   └── Models.js               # CreditModel (avulso auto-delete)
│       ├── views/Views.js
│       ├── controllers/
│       │   ├── DocumentController.js   # Last-credit warning
│       │   ├── HistoryController.js
│       │   └── PaymentController.js    # 5 pacotes v8.0 + showAfterLastCredit()
│       ├── services/
│       │   ├── PaymentService.js       # Preços v8.0
│       │   ├── ServiceDefinitions.js
│       │   ├── Services.js
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
│           ├── AdminApp.js             # Dashboard + Blog CMS + Settings (live DB)
│           └── AdminDashboard.js
└── api/
    ├── auth/
    │   └── index.js                    # signup (1 crédito) · signin · reset-password
    ├── generate-document.js            # IA multi-provider
    ├── deduct-credit.js                # Debita + auto-elimina conta avulso
    ├── verify-credits.js
    ├── process-payment.js              # Preços v8.0 (5 pacotes)
    ├── delete-temp-account.js          # Elimina contas avulso expiradas
    ├── cleanup-temp-accounts.js        # Cron 00:00 UTC
    ├── page-view.js                    # Contador de visitas do blog
    ├── sitemap.xml.js                  # Sitemap dinâmico
    └── admin/
        ├── index.js                    # stats · users · transactions · settings · audit-log
        ├── pages.js                    # CRUD páginas do blog
        └── generate-page.js           # Gerador de artigos com IA
```

---

## 💳 Pacotes de Créditos (v8.0)

| Pacote | Créditos | Preço (MZN) | MZN/crédito | Notas |
|--------|----------|-------------|-------------|-------|
| Avulso | 3 | 50 | 16,67 | Sem conta permanente, expira em 7 dias |
| Starter | 10 | 120 | 12,00 | Economia 28% |
| **Básico** | **25** | **280** | **11,20** | **Mais Popular** |
| Pro | 60 | 600 | 10,00 | Economia 40% |
| Empresa | 150 | 1.500 | 10,00 | Multi-utilizador |

### Tipos de Conta

| Tipo | Créditos iniciais | Expiração | Auto-eliminação |
|------|-------------------|-----------|-----------------|
| `normal` | 1 crédito grátis | 1 mês | ❌ (créditos zerados, conta mantida) |
| `avulso` | 3 créditos | 7 dias | ✅ (24h após créditos = 0, ou após 7 dias) |

---

## 🗄️ Base de Dados — Tabelas (v8.2)

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Utilizadores (account_type, credits, credits_expires_at…) |
| `transactions` | Pagamentos MPesa |
| `credit_usage_log` | Auditoria de uso de créditos (document_type, user_id, timestamp) |
| `credit_packages` | Pacotes de preços (5 pacotes v8.0) |
| `blog_pages` | Páginas do blog (slug, title, content_html, published) |
| `blog_posts` | Artigos completos (status draft/published/archived, SEO fields) |
| `blog_categories` | Categorias do blog (6 categorias pré-definidas) |
| `system_settings` | Configurações do sistema (key-value, editáveis pelo admin) |
| `admin_users` | Administradores (role: superadmin/admin/editor/viewer) |
| `admin_logs` | Registo de auditoria de acções administrativas |
| `analytics_metrics` | Métricas diárias agregadas |

### Migrações (executar por ordem no Supabase SQL Editor)

```
supabase/migration_v8_pricing_temp_accounts.sql   # v8.0
supabase/migration_v8_1_blog_pages.sql             # v8.1
supabase/migration_v8_2_admin_tables.sql           # v8.2 ← NOVA
```

### Funções SQL Principais

| Função | Descrição |
|--------|-----------|
| `deduct_credits(uuid, int)` | Debita N créditos atomicamente |
| `deduct_credit_atomic(uuid, text, int)` | Debita com log de auditoria |
| `create_temp_account(text, text)` | Conta avulso: 3 créditos / 7 dias |
| `create_normal_account(uuid, text, text, text)` | Conta normal: 1 crédito / 1 mês |
| `cleanup_expired_temp_accounts()` | Limpeza (chamada pelo cron) |
| `promote_to_admin(uuid, role)` | Promove utilizador a admin |
| `increment_page_views(slug)` | Incrementa views do blog atomicamente |
| `normalize_phone(text)` | Remove caracteres não numéricos |

---

## 🔑 Variáveis de Ambiente (Vercel)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | ✅ | URL do projecto Supabase |
| `SUPABASE_ANON_KEY` | ✅ | Chave anónima pública |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role (admin, créditos, deleção) |
| `SITE_URL` | ✅ | URL do site (`https://mz-docs-pro.vercel.app`) |
| `CRON_SECRET` | ✅ | Segredo para o cron job de limpeza |
| `GROQ_API_KEY` | ⚠️ | Provider IA principal |
| `GEMINI_API_KEY` | ⚠️ | Provider IA fallback |
| `OPENROUTER_API_KEY` | ⚠️ | Provider IA fallback |
| `CEREBRAS_API_KEY` | ⚠️ | Provider IA fallback |
| `NVIDIA_API_KEY` | ⚠️ | Provider IA fallback |
| `UPSTASH_REDIS_REST_URL` | Opcional | Rate limiting persistente |
| `UPSTASH_REDIS_REST_TOKEN` | Opcional | Token Upstash Redis |

> ⚠️ Pelo menos um provider de IA deve estar configurado.

---

## ⚙️ Painel Admin (v8.2)

### Secções

| Secção | Funcionalidades |
|--------|----------------|
| **Dashboard** | KPIs em tempo real: utilizadores (normal/avulso), documentos (hoje/7d/total), receita (30d), pagamentos pendentes, novos utilizadores 24h, artigos publicados · Gráficos de 7 dias (receita + docs/dia) |
| **Utilizadores** | Lista com filtro por tipo (normal/avulso/admin/bloqueado) · Badges de account_type e créditos expirados · Adicionar/editar/remover créditos · Bloquear/desbloquear |
| **Transações** | Aprovação/rejeição de pagamentos MPesa · Log de transações |
| **Documentos** | Histórico de documentos gerados por utilizador |
| **Blog / Páginas** | CRUD de páginas estáticas · Editor HTML com preview live · Gerador de artigos com IA (Groq/Gemini/OpenRouter) · Filtro publicadas/rascunhos · Contador de visitas |
| **Configurações** | Settings do sistema via BD (não hardcoded) · Preços dos pacotes live · Configuração M-Pesa · Registo de auditoria das últimas 30 acções |

### Rotas API Admin

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/admin/stats` | GET | KPIs do dashboard |
| `/api/admin/users` | GET/POST | Lista e gestão de utilizadores |
| `/api/admin/transactions` | GET/POST | Transações e aprovações |
| `/api/admin/settings` | GET/PUT | Configurações do sistema (BD) |
| `/api/admin/audit-log` | GET | Últimas acções administrativas |
| `/api/admin/pages` | GET/POST/PUT/DELETE | CRUD do blog |
| `/api/admin/generate-page` | POST | Gerador de artigos com IA |

---

## 📝 Blog / SEO

### Páginas Estáticas Incluídas (10)

| URL | Tema |
|-----|------|
| `/pages/como-fazer-cv-mocambique.html` | CV profissional |
| `/pages/carta-formal-mocambique.html` | Cartas formais |
| `/pages/requerimento-emprego-mocambique.html` | Requerimentos |
| `/pages/declaracao-residencia-mocambique.html` | Declaração de residência |
| `/pages/contrato-arrendamento-mocambique.html` | Contratos de arrendamento |
| `/pages/recibo-pagamento-mocambique.html` | Recibos |
| `/pages/procuracao-mocambique.html` | Procurações |
| `/pages/plano-negocios-mocambique.html` | Planos de negócio |
| `/pages/trabalho-escolar-mocambique.html` | Trabalhos académicos |
| `/pages/carta-recomendacao-mocambique.html` | Cartas de recomendação |

### Características SEO de Cada Página
- Meta title + description optimizados
- `<link rel="canonical">`
- Open Graph tags
- Schema.org `Article` (JSON-LD)
- Contador de visitas via `/api/page-view`
- CTA integrado para o MzDocs Pro
- Cache CDN: `s-maxage=86400`

### Sitemap Dinâmico
`/sitemap.xml` → `/api/sitemap.xml.js` — lê páginas publicadas do Supabase em tempo real, com cache de 1h.

---

## ⏰ Cron Job — Limpeza de Contas

`api/cleanup-temp-accounts.js` executa diariamente à **00:00 UTC**.

**Regras:**
1. Elimina contas `avulso` com `credits = 0` há mais de 24h
2. Elimina contas `avulso` criadas há mais de 7 dias
3. Zera créditos de contas `normal` com `credits_expires_at` vencido (conta mantida)

Protegido por `x-cron-secret` = `CRON_SECRET`.

---

## 🏗️ Build e Deploy

```bash
npm install
vercel dev        # desenvolvimento local
vercel --prod     # deploy
```

O `vercel.json` define `"buildCommand": "node scripts/inject-version.js"` que actualiza `CACHE_VERSION` no `sw.js`.

---

## 📋 Changelog

### v8.2 — Admin Tables, Analytics, Settings Live

- **SQL:** tabelas `admin_users`, `admin_logs`, `system_settings`, `analytics_metrics`, `blog_posts`, `blog_categories`; VIEW `dashboard_summary`; função `promote_to_admin`
- **Dashboard:** 8 KPIs em tempo real (normal vs avulso, docs hoje/7d, novos 24h, blog publicados); gráfico de docs por dia (bar chart)
- **Utilizadores:** filtro por `account_type` (avulso/normal/admin/bloqueado); badge de créditos expirados
- **Settings:** configurações lidas e escritas na BD (`system_settings`) em vez de `localStorage`; registo de auditoria das últimas 30 acções
- **API:** endpoints `/api/admin/settings` e `/api/admin/audit-log`; `handleStats` reescrito com `credit_usage_log`

### v8.1 — Blog CMS + SEO

- Blog CMS no admin: criar, editar, publicar, eliminar páginas
- Gerador de artigos com IA (Groq → Gemini → OpenRouter)
- 10 páginas SEO estáticas para o mercado moçambicano
- Sitemap dinâmico (`/api/sitemap.xml.js`)
- Contador de visitas por página (`/api/page-view.js`)
- `robots.txt` actualizado para indexar `/pages/`

### v8.0 — Pricing & Temp Accounts

- 5 pacotes de preços optimizados (Avulso 50 MZN → Empresa 1.500 MZN)
- Contas normais: **1 crédito grátis** (era 3) · expira em 1 mês
- Contas avulso: `account_type = 'avulso'` · 3 créditos · 7 dias · auto-eliminação
- Cron job diário de limpeza (`cleanup-temp-accounts.js`)
- Aviso de último crédito (toast não-bloqueante, 2s de delay)
- `AuthManager.profile` getter com `account_type` e `credits_expires_at`

---

## 📞 Suporte

**WhatsApp:** +258 85 869 5506
