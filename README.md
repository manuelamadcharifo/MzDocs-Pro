# MzDocs Pro v3.0 🇲🇿
### Arquitectura MVC · OpenRouter Gratuito · Supabase · M-Pesa

---

## 📁 Estrutura MVC Completa

```
mzdocs-v3/
├── index.html                              ← Entry point HTML
├── manifest.json                           ← PWA manifest
├── sw.js                                   ← Service Worker
├── netlify.toml                            ← Deploy + headers
├── assets/
│   ├── css/
│   │   └── styles.css                      ← Estilos globais
│   └── js/
│       ├── app.js                          ← Bootstrap MVC
│       ├── utils/
│       │   ├── Storage.js                  ← localStorage wrapper
│       │   └── Formatter.js               ← markdown→HTML, phone
│       ├── models/
│       │   └── Models.js                   ← CreditModel, DocumentModel, QueueModel, UserModel
│       ├── services/
│       │   ├── Services.js                 ← OpenRouterService, MPesaService, SupabaseService
│       │   └── ServiceDefinitions.js       ← Definição dos 7 serviços
│       ├── views/
│       │   └── Views.js                    ← NotificationView, ModalView, DocumentView
│       └── controllers/
│           └── Controllers.js              ← DocumentController, PaymentController, OCRController
├── netlify/
│   └── functions/
│       ├── generate-document.js            ← Proxy OpenRouter (chave segura)
│       ├── process-payment.js              ← M-Pesa C2B + Supabase
│       └── verify-credits.js              ← Verificação de saldo
└── supabase/
    └── schema.sql                          ← Tabelas + funções atómicas
```

---

## ⚙️ Configuração — 3 passos

### Passo 1 — OpenRouter (IA Gratuita)
1. Criar conta em [openrouter.ai](https://openrouter.ai)
2. Ir a **Keys → Create Key**
3. Copiar a chave `sk-or-v1-...`

### Passo 2 — Supabase (Base de dados gratuita)
1. Criar projecto em [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** → colar o conteúdo de `supabase/schema.sql` → executar
3. Ir a **Settings → API** → copiar `Project URL` e `anon public key`
4. Copiar também a `service_role key` (para as Netlify Functions)

### Número de WhatsApp
Em `assets/js/controllers/Controllers.js`, linha 1:
```javascript
const WA_NUMBER = '258840000000'; // ← O SEU NÚMERO
```
Em `assets/js/models/Models.js` (UserModel):
```javascript
this.WA_SUPPORT = '258840000000'; // ← Número de suporte
```

---

## 🚀 Deploy Netlify (5 minutos)

### Opção A — Drag & Drop
1. Aceda a [netlify.com](https://netlify.com) → "Add new site" → "Deploy manually"
2. Arraste a pasta `mzdocs-v3/` completa
3. Configure as Environment Variables
4. "Trigger deploy" para aplicar as variáveis

### Opção B — CLI
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set OPENROUTER_API_KEY "sk-or-v1-..."
netlify env:set SUPABASE_URL "https://xxx.supabase.co"
netlify env:set SUPABASE_SERVICE_KEY "eyJ..."
netlify env:set MPESA_ENV "sandbox"
netlify deploy --prod
```

---

## 🤖 Modelos IA (OpenRouter — Gratuitos)

| Modelo | Qualidade | Velocidade | Fallback |
|--------|-----------|-----------|---------|
| `meta-llama/llama-3.3-70b-instruct:free` | ⭐⭐⭐⭐⭐ | Médio | 1º (principal) |
| `google/gemma-3-27b-it:free` | ⭐⭐⭐⭐ | Rápido | 2º automático |
| `mistralai/mistral-7b-instruct:free` | ⭐⭐⭐ | Muito rápido | 3º emergência |

O sistema tenta os modelos em cascata automaticamente se um falhar.

---

## 🏗️ Arquitectura MVC — Fluxo completo

```
Utilizador clica serviço
        ↓
DocumentController.open(key)
        ↓
CreditModel.canConsume(1)  → se não: PaymentController.showPricing()
        ↓
DocumentView.renderForm(svc)
        ↓
OCRController (opcional — fotografa rascunho)
        ↓
DocumentController.generate()
        ↓
QueueModel.add(job)  ← Fila inteligente (resolve rate limit)
        ↓
OpenRouterService.generate()  → Netlify Function → OpenRouter API
        ↓
CreditModel.consume(1)  → SupabaseService.deductCredit() (atómico)
        ↓
DocumentView.renderResult()
        ↓
WhatsApp / Copiar / Download
```

---

## 🔧 Problemas Resolvidos

### ✅ P1 — Rate Limit → QueueModel
- Fila FIFO com min. 3s entre requests
- Retry automático com backoff exponencial (1.5s → 3s → 6s)
- UI mostra posição na fila em tempo real

### ✅ P2 — M-Pesa Sandbox → Validação de Ambiente
- `MPesaService._detectEnv()` detecta localhost/produção automaticamente
- Backend valida se `environment === MPESA_ENV`
- Sandbox simula pagamento bem-sucedido sem credenciais
- Banner visual avisa utilizador quando está em modo teste

### ✅ P3 — Perda de Créditos → Supabase + operações atómicas
- `deduct_credit()` usa `FOR UPDATE` (lock de linha) — sem race conditions
- Conflito local vs servidor: maior valor vence (evita perda de compras)
- Auto-sync a cada 30s em background
- Fallback transparente para localStorage se Supabase indisponível

### ✅ P4 — Custo API → OpenRouter Gratuito
- Custo: **MZN 0** (era ~MZN 3.90/doc com Claude)
- Fallback automático entre 3 modelos gratuitos
- Margem de lucro sobe de 73% para **~92%**

### ✅ P5 — Concorrência → Diferenciação
- OCR integrado (único no mercado moçambicano)
- Fila inteligente (não trava sob carga)
- Suporte WhatsApp com contexto automático
- Funciona offline (PWA + Service Worker)

---

## 📊 Comparativo v2 → v3

| Métrica | v2 (Claude) | v3 (OpenRouter+MVC) |
|---|---|---|
| Custo API/doc | MZN ~4 | **MZN 0** |
| Arquitectura | Monolítico | **MVC modular** |
| Rate limiting | Quebra | **Fila inteligente** |
| Persistência | localStorage | **Supabase + local** |
| Fallback IA | Nenhum | **3 modelos** |
| Margem/doc | ~73% | **~92%** |

---

## 💰 Projecção de Receita

| Volume | Receita bruta | Custo API | **Lucro** |
|--------|--------------|-----------|-----------|
| 50 docs/dia | MZN 2.300/mês | MZN 0 | **MZN 2.300** |
| 100 docs/dia | MZN 4.600/mês | MZN 0 | **MZN 4.600** |
| 300 docs/dia | MZN 13.800/mês | MZN 0 | **MZN 13.800** |

*(Preço médio: MZN 46/doc · Custo OpenRouter: MZN 0)*

---

*MzDocs Pro v3.0 © 2025 · MVC · OpenRouter · Supabase · Feito para Moçambique 🇲🇿*
