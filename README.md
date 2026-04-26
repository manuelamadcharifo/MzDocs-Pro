# MzDocs Pro v3.0 🇲🇿

Plataforma de geração inteligente de documentos para Moçambique — PWA completo com IA gratuita, pagamentos M-Pesa e editor integrado.

**Stack:** Arquitectura MVC · OpenRouter (IA Gratuita) · Supabase · Vercel Serverless Functions · Tesseract.js OCR

---

## 📁 Estrutura do Projeto

```
MzDocs-Pro/
├── index.html                              ← Entry point / SPA shell
├── manifest.json                           ← PWA manifest
├── sw.js                                   ← Service Worker (cache + offline)
├── vercel.json                             ← Configuração de deploy Vercel
├── api/                                    ← Serverless Functions (Vercel)
│   ├── generate-document.js                ← Proxy seguro OpenRouter + fallback 3 modelos
│   ├── process-payment.js                ← M-Pesa (automático) + Pagamento Manual via WhatsApp
│   └── verify-credits.js                   ← Verificação de saldo Supabase + fallback local
├── assets/
│   ├── css/
│   │   └── styles.css                      ← Estilos globais + temas
│   └── js/
│       ├── app.js                          ← Bootstrap MVC + Service Worker
│       ├── utils/
│       │   ├── Storage.js                  ← localStorage wrapper + userId
│       │   └── Formatter.js                ← Validação telefone, montantes, markdown→HTML
│       ├── models/
│       │   └── Models.js                   ← CreditModel, DocumentModel, QueueModel, UserModel
│       ├── services/
│       │   ├── Services.js                 ← OpenRouterService, MPesaService, SupabaseService
│       │   ├── ServiceDefinitions.js       ← Definição dos 7 serviços disponíveis
│       │   └── PaymentService.js           ← Facade pagamentos (M-Pesa + Manual)
│       ├── views/
│       │   └── Views.js                    ← NotificationView, ModalView, DocumentView
│       ├── controllers/
│       │   └── Controllers.js              ← DocumentController, PaymentController, OCRController
│       └── components/
│           └── DocumentEditor.js           ← Editor Markdown interativo + reedição IA
└── supabase/
    └── schema.sql                          ← Tabelas users/transactions + função atómica deduct_credit()
```

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
3. Ir a **Project Settings → API** → copiar:
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
| `SITE_URL` | URL do site em produção | ❌ Recomendado | Headers OpenRouter |

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

### Configuração `vercel.json` (já incluída)

```json
{
  "version": 2,
  "cleanUrls": true,
  "outputDirectory": ".",
  "headers": [
    {
      "source": "/(.*)\.(js|mjs)",
      "headers": [{ "key": "Content-Type", "value": "application/javascript" }]
    }
  ],
  "routes": [
    { "src": "/api/generate-document", "dest": "/api/generate-document.js" },
    { "src": "/api/process-payment", "dest": "/api/process-payment.js" },
    { "src": "/api/verify-credits", "dest": "/api/verify-credits.js" },
    { "src": "/sw.js", "dest": "/sw.js" },
    { "src": "/(.*)", "dest": "/$1" }
  ]
}
```

---

## 🤖 Modelos IA (OpenRouter — Gratuitos)

| Modelo | Qualidade | Velocidade | Papel |
|--------|-----------|------------|-------|
| `meta-llama/llama-3.3-70b-instruct:free` | ⭐⭐⭐⭐⭐ | Médio | **1º — Principal** |
| `google/gemma-3-27b-it:free` | ⭐⭐⭐⭐ | Rápido | **2º — Fallback automático** |
| `mistralai/mistral-7b-instruct:free` | ⭐⭐⭐ | Muito rápido | **3º — Emergência** |

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
Copiar / Download .md / WhatsApp / Reeditar
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
5. Adiciona créditos via painel Supabase

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

## 🔧 Problemas Resolvidos

### ✅ P1 — Rate Limit OpenRouter → QueueModel
- Fila FIFO com mínimo 3s entre requests
- Retry automático com backoff exponencial (1.5s → 3s → 6s)
- UI mostra posição na fila em tempo real

### ✅ P2 — Custo API → OpenRouter Gratuito
- Custo: **MZN 0** (era ~MZN 3.90/doc com APIs pagas)
- Fallback automático entre 3 modelos gratuitos
- Margem de lucro sobe para **~92%**

### ✅ P3 — Perda de Créditos → Supabase + Operações Atómicas
- `deduct_credit()` usa transação atómica no Supabase
- Conflito local vs servidor: **maior valor vence** (evita perda de compras)
- Auto-sync a cada 30s em background
- Fallback transparente para localStorage se Supabase indisponível

### ✅ P4 — Reedição de Documentos → DocumentEditor
- Editor Markdown interativo no modal de resultado
- Botão "Reeditar com IA" — envia documento atual + instrução
- Consome 1 crédito por reedição
- Preserva formatação e estrutura original

### ✅ P5 — OCR Integrado → Tesseract.js
- Reconhecimento de texto em imagens (português)
- Usa rascunho OCR como base para geração de documentos
- Funciona 100% no browser (sem backend)
- Confiança exibida ao utilizador

### ✅ P6 — PWA Completo
- `manifest.json` + `sw.js` para instalação e funcionamento offline
- Cache de assets essenciais
- Interface responsiva (mobile-first)

---

## 📊 Comparativo v2 → v3

| Métrica | v2 (Monolítico) | v3 (MVC + Vercel) |
|---------|-----------------|-------------------|
| Custo API/doc | MZN ~4 | **MZN 0** |
| Arquitectura | Monolítico | **MVC modular** |
| Rate limiting | Quebra | **Fila inteligente** |
| Persistência | localStorage apenas | **Supabase + local** |
| Fallback IA | Nenhum | **3 modelos** |
| Reedição | Não existia | **Editor + IA** |
| OCR | Não existia | **Tesseract.js** |
| Deploy | Netlify | **Vercel** |
| Margem/doc | ~73% | **~92%** |

---

## 💰 Projecção de Receita

| Volume | Receita bruta | Custo API | **Lucro** |
|--------|---------------|-----------|-----------|
| 50 docs/dia | MZN 2.300/mês | MZN 0 | **MZN 2.300** |
| 100 docs/dia | MZN 4.600/mês | MZN 0 | **MZN 4.600** |
| 300 docs/dia | MZN 13.800/mês | MZN 0 | **MZN 13.800** |

_(Preço médio: MZN 46/doc · Custo OpenRouter: MZN 0 · Pacotes de créditos: MZN 15/crédito)_

---

## 📝 Notas de Configuração

### Número de WhatsApp

Edite em **dois** ficheiros (substitua pelo seu número real):

1. `assets/js/controllers/Controllers.js`:
```js
const WA_NUMBER = '25884XXXXXXX'; // ← ALTERE PARA O TEU NÚMERO
```

2. `assets/js/models/Models.js` (UserModel):
```js
this.WA_SUPPORT = '25884XXXXXXX'; // ← ALTERE PARA O NÚMERO DE SUPORTE
```

3. **Environment Variable** `WHATSAPP_NUMBER` nas Vercel Functions

### Supabase Schema

Execute `supabase/schema.sql` no SQL Editor do Supabase. Inclui:
- Tabela `users` (id, credits, last_sync, created_at)
- Tabela `transactions` (id, user_id, package_id, amount, status, mode, created_at)
- Função `deduct_credit(user_id UUID)` — operação atómica com lock de linha

---

_MzDocs Pro v3.0 © 2025 · MVC · OpenRouter · Supabase · Vercel · Feito para Moçambique 🇲🇿_
