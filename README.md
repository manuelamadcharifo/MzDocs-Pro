# MzDocs Pro v3.1 🇲🇿

Plataforma de geração inteligente de documentos para Moçambique — PWA completo com IA gratuita, pagamentos M-Pesa, OCR, editor Markdown e painel administrativo.

**Stack:** Arquitetura MVC · OpenRouter (IA Gratuita) · Supabase Auth + PostgreSQL · Vercel Serverless Functions · Tesseract.js OCR · Chart.js

---

## 📁 Estrutura do Projeto (v3.1)

```
MzDocs-Pro/
├── index.html                              ← Entry point / SPA shell
├── validar.html                            ← Página de validação de documentos/transações
├── manifest.json                           ← PWA manifest
├── sw.js                                   ← Service Worker (Workbox)
├── vercel.json                             ← Configuração de deploy Vercel + rotas API
├── README.md                               ← Este ficheiro
├── api/                                    ← Serverless Functions (Vercel)
│   ├── generate-document.js                ← Proxy seguro OpenRouter + fallback 3 modelos
│   ├── process-payment.js                  ← M-Pesa (automático) + Pagamento Manual via WhatsApp
│   ├── verify-credits.js                 ← Verificação de saldo Supabase (tabela profiles)
│   ├── auth/
│   │   ├── signup.js                       ← Registo de utilizadores (Supabase Admin SDK)
│   │   ├── signin.js                       ← Login de utilizadores
│   │   ├── verify-otp.js                   ← Verificação de token OTP/magic link
│   │   └── reset-password.js             ← Envio de email de recuperação de password
│   └── admin/
│       ├── transactions.js                 ← Listar transações (requer admin)
│       ├── confirm-payment.js            ← Confirmar pagamento pendente + adicionar créditos
│       └── stats.js                        ← Estatísticas agregadas para dashboard
├── assets/
│   ├── css/
│   │   ├── styles.css                      ← Estilos globais + temas
│   │   └── editor.css                      ← Estilos do Editor Markdown
│   └── js/
│       ├── app.js                          ← Bootstrap MVC + Service Worker
│       ├── auth/
│       │   ├── AuthManager.js              ← Gestão de autenticação Supabase Auth
│       │   └── AuthGuard.js                ← Proteção de rotas (auth/admin/guest)
│       ├── admin/
│       │   ├── AdminDashboard.js           ← Dashboard com gráficos (Chart.js)
│       │   └── AdminTransactions.js        ← Gestão de transações pendentes
│       ├── components/
│       │   ├── DocumentEditor.js           ← Editor Markdown interativo + reedição IA
│       │   ├── PDFExporter.js              ← Exportador dedicado PDF (jsPDF)
│       │   ├── WordExporter.js             ← Exportador dedicado Word (.doc)
│       │   └── ExelExporter.js             ← Exportador Excel para orçamentos (SheetJS)
│       ├── controllers/
│       │   ├── DocumentController.js         ← Controller de documentos
│       │   ├── PaymentController.js        ← Controller de pagamentos
│       │   └── OCRController.js            ← Controller de OCR (Tesseract.js)
│       ├── models/
│       │   └── Models.js                   ← CreditModel, DocumentModel, QueueModel, UserModel
│       ├── services/
│       │   ├── Services.js                 ← OpenRouterService, SupabaseService
│       │   ├── ServiceDefinitions.js       ← Definição dos 7 serviços disponíveis
│       │   ├── PaymentService.js           ← Facade pagamentos (M-Pesa + Manual)
│       │   ├── MPesaService.js             ← Módulo standalone M-Pesa
│       │   └── SupabaseService.js          ← Módulo standalone Supabase
│       ├── utils/
│       │   ├── Storage.js                  ← localStorage wrapper + userId
│       │   └── Formatter.js                ← Validação telefone, montantes, markdown→HTML
│       └── views/
│           └── Views.js                    ← NotificationView, ModalView, DocumentView
└── supabase/
    ├── schema.sql                          ← Tabelas profiles/documents/transactions + funções RPC
    └── policies.sql                        ← Row Level Security (RLS) + triggers
```

> **NOTA:** O ficheiro `assets/js/controllers/Controllers.js` foi **removido** na v3.1. Era um monolito com 3 classes que causava erros de importação. Agora cada controller tem o seu próprio ficheiro.

---

## ⚠️ Problemas Resolvidos na v3.1

| Problema | Estado | Detalhes |
|----------|--------|----------|
| `Controllers.js` monolito | ✅ RESOLVIDO | Separado em 3 ficheiros individuais |
| `PaymentService.js` não usado | ✅ RESOLVIDO | Agora é a única fonte de verdade para pagamentos |
| `MPesaService` duplicado | ✅ RESOLVIDO | Extraído para módulo standalone próprio |
| HTML vazio no `DocumentEditor.js` | ✅ RESOLVIDO | Modal completo com todos os botões |
| HTML vazio nos botões do formulário | ✅ RESOLVIDO | Botões "Gerar com IA" e "Enviar WhatsApp" renderizam |
| Schema Supabase inconsistente | ✅ RESOLVIDO | `verify-credits.js` usa tabela `profiles` |
| `sw.js` usava `openDB` sem importar | ✅ RESOLVIDO | Removido IndexedDB, usa Workbox puro |
| Número WhatsApp inconsistente | ✅ RESOLVIDO | Unificado em todos os ficheiros |
| `AuthManager.js` inexistente | ✅ RESOLVIDO | Criado módulo completo de autenticação |
| `editor.css` inexistente | ✅ RESOLVIDO | Criado ficheiro de estilos do editor |
| `policies.sql` inexistente | ✅ RESOLVIDO | Criado RLS policies + trigger handle_new_user |
| `validar.html` inexistente | ✅ RESOLVIDO | Criada página de validação de documentos |
| `vercel.json` sem rotas auth/admin | ✅ RESOLVIDO | Adicionadas todas as rotas necessárias |
| `PaymentController.js` sem import Storage | ✅ RESOLVIDO | Adicionado `import { Storage }` |
| `AdminDashboard.js` import Chart.js errado | ✅ RESOLVIDO | Corrigido para `.default` |
| `AdminTransactions.js` HTML tabela inválido | ✅ RESOLVIDO | Corrigido para HTML de tabela válido |

---

## ⚙️ Configuração — 3 Passos

### Passo 1 — OpenRouter (IA Gratuita)

1. Criar conta em [openrouter.ai](https://openrouter.ai)
2. Ir a **Keys → Create Key**
3. Copiar a chave `sk-or-v1-...`

> **Custo:** MZN 0 — usa modelos gratuitos com fallback automático entre 3 modelos.

### Passo 2 — Supabase (Base de dados + Auth)

1. Criar projecto em [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** → colar o conteúdo de `supabase/schema.sql` → executar
3. Ir a **SQL Editor** → colar o conteúdo de `supabase/policies.sql` → executar
4. Ir a **Project Settings → API** → copiar:
   - `Project URL` (`https://xxx.supabase.co`)
   - `anon public key`
   - `service_role key` (necessário para as Serverless Functions)

### Passo 3 — Vercel Environment Variables

No **Vercel Dashboard** → Seu projeto → **Settings → Environment Variables**:

| Variável | Descrição | Obrigatório | Onde usar |
|----------|-----------|-------------|-----------|
| `OPENROUTER_API_KEY` | Chave da API OpenRouter (`sk-or-v1-...`) | ✅ **SIM** | `api/generate-document.js` |
| `SUPABASE_URL` | URL do projecto Supabase | ✅ **SIM** | Todas as functions + frontend |
| `SUPABASE_SERVICE_KEY` | `service_role key` do Supabase | ✅ **SIM** | `api/` functions (escrita segura) |
| `SUPABASE_ANON_KEY` | `anon public key` do Supabase | ✅ **SIM** | Frontend (leitura segura) |
| `WHATSAPP_NUMBER` | Número de WhatsApp para suporte/pagamentos (formato: `25884XXXXXXX`) | ✅ **SIM** | Suporte + pagamentos manuais |
| `MPESA_ENV` | `sandbox` ou `production` | ❌ Opcional | `api/process-payment.js` |
| `MPESA_API_KEY` | Chave do portal M-Pesa | ❌ Opcional | Modo M-Pesa automático |
| `MPESA_PUBLIC_KEY` | Chave pública RSA do M-Pesa | ❌ Opcional | Modo M-Pesa automático |
| `MPESA_SERVICE_CODE` | Código de serviço M-Pesa | ❌ Opcional | Modo M-Pesa automático |
| `SITE_URL` | URL do site em produção | ❌ Recomendado | Headers OpenRouter + reset password |

> **Nota:** Sem `MPESA_*` configurado, o sistema funciona em **modo manual** — o utilizador faz M-Pesa para o número de WhatsApp e envia comprovativo.

---

## 🚀 Deploy na Vercel

### Opção A — Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
# Configure as Environment Variables no prompt
vercel --prod
```

### Opção B — Dashboard

1. Aceda [vercel.com](https://vercel.com) → **Add New Project**
2. Importe o repositório GitHub
3. Configure as **Environment Variables** (tabela acima)
4. Clique **Deploy**

---

## 🤖 Modelos IA (OpenRouter — Gratuitos)

| Modelo | Qualidade | Velocidade | Papel |
|--------|-----------|------------|-------|
| `meta-llama/llama-3.3-70b-instruct:free` | ⭐⭐⭐⭐⭐ | Médio | **1º — Principal** |
| `google/gemma-3-27b-it:free` | ⭐⭐⭐⭐ | Rápido | **2º — Fallback automático** |
| `nvidia/nemotron-3-nano-30b-a3b:free` | ⭐⭐⭐ | Muito rápido | **3º — Emergência** |

O sistema tenta os modelos em cascata automaticamente se um falhar (rate limit, indisponibilidade).

---

## 🏗️ Arquitectura MVC — Fluxo Completo

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
QueueModel.add(job) ← Fila inteligente (resolve rate limit OpenRouter)
        ↓
OpenRouterService.generate() → /api/generate-document → OpenRouter API
        ↓
CreditModel.consume(1) → SupabaseService.deductCredit() (atómico) + fallback localStorage
        ↓
DocumentEditor.render(result.document) ← Editor Markdown com reedição IA
        ↓
Copiar / Download .md / PDF / Word / WhatsApp / Reeditar
```

---

## 💳 Sistema de Pagamentos

### Modo Manual (Padrão — sem credenciais M-Pesa)

1. Utilizador escolhe pacote → clica "Confirmar Pagamento"
2. Sistema gera ID único (`MANxxxxxxx`)
3. Abre WhatsApp com mensagem pré-preenchida:
   - Número destino: configurado em `WHATSAPP_NUMBER`
   - Valor: conforme pacote
   - Referência: ID da transação
4. Administrador verifica comprovativo manualmente
5. Adiciona créditos via painel admin (RPC `add_credits`)

### Modo M-Pesa Automático (requer credenciais)

1. Configurar `MPESA_ENV=production` + `MPESA_API_KEY` + `MPESA_PUBLIC_KEY` + `MPESA_SERVICE_CODE`
2. Sistema valida número `25884XXXXXXX`
3. Inicia transação C2B
4. Utilizador confirma no telemóvel
5. Webhook confirma → créditos adicionados automaticamente

### Pacotes de Créditos

| Pacote | Preço (MZN) | Créditos |
|--------|-------------|----------|
| Starter | 150 | 10 |
| Básico | 350 | 25 |
| Pro | 750 | 60 |

> Cada documento IA custa **1 crédito**. Serviços gratuitos (impressão, foto documentos, conversão) não consomem créditos.

---

## 🔐 Autenticação e Admin

### Registo de Utilizadores

- POST `/api/auth/signup` → cria conta com 3 créditos grátis
- Trigger `handle_new_user` cria perfil automaticamente
- RLS policies garantem isolamento de dados

### Login

- POST `/api/auth/signin` → retorna session token
- Token usado em todas as chamadas autenticadas
- `AuthManager.js` gere sessão no frontend

### Painel Administrativo

- Acesso restrito a utilizadores com `is_admin = true`
- Endpoints `/api/admin/*` verificam token JWT + flag admin
- Funcionalidades:
  - Dashboard com estatísticas e gráficos
  - Lista de transações com filtros
  - Confirmação manual de pagamentos pendentes

---

## 📝 Notas de Configuração

### Número de WhatsApp

Edite em **todos** estes ficheiros (substitua pelo seu número real):

1. `assets/js/controllers/DocumentController.js`:
   ```javascript
   const WA_NUMBER = '25884XXXXXXX'; // ← ALTERE PARA O TEU NÚMERO
   ```

2. `assets/js/services/PaymentService.js`:
   ```javascript
   const WA_NUMBER = '25884XXXXXXX'; // ← ALTERE PARA O TEU NÚMERO
   ```

3. `assets/js/models/Models.js` (UserModel):
   ```javascript
   this.WA_SUPPORT = '25884XXXXXXX'; // ← ALTERE PARA O NÚMERO DE SUPORTE
   ```

4. **Environment Variable** `WHATSAPP_NUMBER` nas Vercel Functions

### Supabase Schema

Execute **por ordem** no SQL Editor do Supabase:

1. `supabase/schema.sql` — cria tabelas e funções RPC
2. `supabase/policies.sql` — ativa RLS e cria policies

Tabelas criadas:
- `profiles` (id, full_name, phone, credits, is_admin, created_at, updated_at)
- `documents` (id, user_id, service_type, title, content, model_used, format, is_favorite, tags, created_at, updated_at)
- `transactions` (id, user_id, package_id, amount, credits, status, payment_method, mpesa_receipt, phone_number, reference_id, confirmed_by, confirmed_at, created_at)

Funções RPC:
- `deduct_credit(user_id UUID)` — operação atómica, retorna créditos restantes ou -1
- `add_credits(user_id UUID, amount INTEGER)` — adiciona créditos (admin only)

---

## 🔧 Changelog

### v3.1 (2026-04-27) — Correções Críticas
- **Fix:** Separado `Controllers.js` monolito em 3 ficheiros individuais
- **Fix:** Criado `AuthManager.js` — gestão completa de autenticação Supabase
- **Fix:** Criado `AuthGuard.js` — proteção de rotas por auth/admin/guest
- **Fix:** Criado `editor.css` — estilos completos do Editor Markdown
- **Fix:** Criado `policies.sql` — RLS policies + trigger handle_new_user
- **Fix:** Criado `validar.html` — página de validação de documentos
- **Fix:** Criado `PDFExporter.js` — exportador PDF dedicado (jsPDF)
- **Fix:** Criado `WordExporter.js` — exportador Word dedicado
- **Fix:** Criado `ExelExporter.js` — exportador Excel para orçamentos
- **Fix:** Criado `AdminDashboard.js` — dashboard com gráficos Chart.js
- **Fix:** Criado `AdminTransactions.js` — gestão de transações pendentes
- **Fix:** Criado `api/auth/*` — signup, signin, verify-otp, reset-password
- **Fix:** Criado `api/admin/*` — transactions, confirm-payment, stats
- **Fix:** Unificada lógica de pagamentos no `PaymentService.js`
- **Fix:** Extraído `MPesaService.js` e `SupabaseService.js` para módulos standalone
- **Fix:** Corrigido schema Supabase — usa tabela `profiles` em vez de `users`
- **Fix:** Corrigido `PaymentController.js` — adicionado import Storage
- **Fix:** Corrigido `AdminDashboard.js` — import Chart.js via `.default`
- **Fix:** Corrigido `AdminTransactions.js` — HTML de tabela vazia válido
- **Fix:** Corrigido `vercel.json` — todas as rotas API mapeadas
- **Fix:** Atualizado modelo de emergência OpenRouter para `nvidia/nemotron-3-nano-30b-a3b:free`

### v3.0 (2025) — Lançamento Inicial
- Arquitectura MVC modular com ES Modules
- OpenRouter com fallback de 3 modelos gratuitos
- Supabase + operações atómicas de créditos
- Editor Markdown com reedição IA
- OCR com Tesseract.js
- PWA completo com Workbox

---

## 🛡️ Segurança

- **RLS (Row Level Security)** ativado em todas as tabelas
- **Operações atómicas** via PostgreSQL functions com `SECURITY DEFINER`
- **Tokens JWT** para autenticação em todas as API functions
- **Verificação de admin** em endpoints sensíveis
- **CORS** configurado em todas as serverless functions
- **Não revelação** de existência de email no reset de password

---

MzDocs Pro v3.1 © 2025 · MVC · OpenRouter · Supabase · Vercel · Feito para Moçambique 🇲🇿