# MzDocs Pro v2.0 🇲🇿
### Plataforma de automação documental com IA para Moçambique

---

## 📦 Estrutura do Projecto

```
mzdocs-v2/
├── index.html                          ← Frontend principal
├── styles.css                          ← Estilos
├── app.js                              ← Lógica do frontend
├── sw.js                               ← Service Worker (PWA offline)
├── manifest.json                       ← PWA manifest
├── netlify.toml                        ← Configuração Netlify + headers
└── netlify/
    └── functions/
        ├── generate-document.js        ← Proxy Claude API (SEGURO)
        ├── process-payment.js          ← Integração M-Pesa
        └── verify-credits.js           ← Verificação de saldo
```

---

## ⚙️ Configuração Obrigatória

### 1. Netlify — Environment Variables

No **Netlify Dashboard → Site Settings → Environment Variables**, adicione:

| Variável | Valor | Obrigatório |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | ✅ Sim |
| `MPESA_API_KEY` | Chave da API M-Pesa | ✅ Para pagamentos |
| `MPESA_PUBLIC_KEY` | Chave pública RSA M-Pesa | ✅ Para pagamentos |
| `MPESA_SERVICE_CODE` | Código do serviço (ex: 171717) | ✅ Para pagamentos |
| `MPESA_ENV` | `sandbox` ou `production` | ✅ Para pagamentos |
| `MPESA_ORIGIN` | URL autorizada no portal M-Pesa | ✅ Para pagamentos |

> ⚠️ **NUNCA** adicione estas variáveis ao `index.html`, `app.js` ou qualquer ficheiro frontend.
> Só existem nas Netlify Functions (servidor).

### 2. Número de WhatsApp

Em `app.js`, linha ~13:
```javascript
const CFG = {
  WA_NUMBER: '258840000000',  // ← O SEU NÚMERO (sem + e sem espaços)
  ...
};
```

---

## 🚀 Deploy no Netlify (5 minutos)

### Opção A — Interface Web (Mais fácil)
1. Aceda a **[netlify.com](https://netlify.com)** → "Add new site"
2. Escolha "Deploy manually"
3. Arraste a pasta `mzdocs-v2/` completa
4. Vá a **Site Settings → Environment Variables** e adicione as variáveis acima
5. Clique em "Trigger deploy" para re-fazer o deploy com as variáveis

### Opção B — Git + CI/CD (Recomendado)
```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Na pasta do projecto
netlify login
netlify init
netlify env:set ANTHROPIC_API_KEY "sk-ant-api03-..."
netlify env:set MPESA_API_KEY "..."
netlify deploy --prod
```

---

## 📱 Instalar como App Android

1. Abra o URL no **Chrome para Android**
2. Aparece banner "Adicionar ao ecrã inicial" — clique
3. Ou: Menu ⋮ → "Instalar aplicação"
4. A app fica instalada como app nativa (sem barra do browser)

---

## 💳 Configurar M-Pesa

### Passo 1 — Criar conta no portal Developer
→ [developer.mpesa.vm.co.mz](https://developer.mpesa.vm.co.mz)

### Passo 2 — Criar uma aplicação
- Tipo: **C2B (Customer to Business)**
- Obtenha: API Key, Public Key, Service Provider Code

### Passo 3 — Teste em Sandbox
- `MPESA_ENV=sandbox`
- Use números de teste fornecidos pela M-Pesa

### Passo 4 — Produção
- `MPESA_ENV=production`
- Submeta a aplicação para aprovação da Vodacom Moçambique

---

## 🤖 Adicionar Base de Dados (Produção)

Para um sistema de créditos robusto, use **Supabase** (gratuito):

```bash
npm install @supabase/supabase-js
```

Tabela SQL:
```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  paid_credits INTEGER DEFAULT 0,
  free_used_this_month INTEGER DEFAULT 0,
  last_reset_month TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  transaction_ref TEXT UNIQUE,
  mpesa_transaction_id TEXT,
  amount INTEGER,
  credits_added INTEGER,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Adicione ao Netlify:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

---

## 📊 Modelo de Negócio

| Plano | Créditos | Preço | Custo API | Margem |
|-------|----------|-------|-----------|--------|
| Grátis | 3/mês | MZN 0 | ~MZN 12 | - |
| Starter | 10 | MZN 150 | ~MZN 40 | **73%** |
| Básico | 25 | MZN 350 | ~MZN 100 | **71%** |
| Pro | 60/mês | MZN 750 | ~MZN 240 | **68%** |

**Receita estimada (100 docs/dia):**
→ 100 × MZN ~46 (lucro médio) = **~MZN 138.000/mês**

---

## ✅ Checklist de Lançamento

- [ ] Deploy no Netlify feito
- [ ] `ANTHROPIC_API_KEY` configurada e testada
- [ ] Número de WhatsApp actualizado em `app.js`
- [ ] Conta M-Pesa Developer criada
- [ ] Variáveis M-Pesa configuradas
- [ ] Teste de pagamento em sandbox OK
- [ ] Aprovação M-Pesa para produção
- [ ] Domínio customizado (opcional)
- [ ] Google Analytics ou Plausible configurado

---

*MzDocs Pro v2.0 © 2025 · Feito para Moçambique 🇲🇿*
