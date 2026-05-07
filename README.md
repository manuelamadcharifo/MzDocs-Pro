# MzDocs Pro v3.2 🇲🇿

Plataforma de geração inteligente de documentos para Moçambique — PWA completo com IA gratuita, pagamentos M-Pesa, OCR, editor Markdown, histórico local e painel administrativo.

**Stack:** Arquitectura MVC · Groq + Gemini + OpenRouter (IA em corrida paralela) · Supabase Auth (Phone) + PostgreSQL · Vercel Serverless Functions · Tesseract.js OCR · Workbox PWA

---

## 📁 Estrutura do Projecto

```
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
│       │   └── HistoryController.js    ← NOVO v3.2
│       ├── components/
│       │   ├── DocumentEditor.js
│       │   ├── PDFExporter.js
│       │   ├── WordExporter.js
│       │   ├── ExcelExporter.js        ← Corrigido typo v3.2
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
    └── polices.sql
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
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave privada (reset password, admin) |
| `GROQ_API_KEY` | ✅ (1 de 3) | console.groq.com — gratuito |
| `GEMINI_API_KEY` | ✅ (1 de 3) | aistudio.google.com — gratuito |
| `OPENROUTER_API_KEY` | ✅ (1 de 3) | openrouter.ai — gratuito |
| `SITE_URL` | ✅ | `https://mz-docs-pro.vercel.app` |
| `WHATSAPP_NUMBER` | ✅ | Número de suporte (ex: `258848XXXXXX`) |
| `MPESA_API_KEY` | Opcional | API M-Pesa automático |
| `MPESA_SERVICE_CODE` | Opcional | Código do serviço M-Pesa |

> **Nota:** Basta uma das 3 chaves de IA para o sistema funcionar. Com todas as 3, o documento é gerado pelo provider mais rápido a responder.

### 3. Supabase — aplicar schema

No **Supabase Dashboard → SQL Editor**, execute em ordem:

```sql
-- 1. Tabelas, trigger e funções
-- (conteúdo de supabase/schema.sql)

-- 2. Row Level Security policies
-- (conteúdo de supabase/polices.sql)
```

### 4. Supabase Auth — activar Phone Auth

**Authentication → Providers → Phone → activar.**

> Se não tiver provider SMS, desactive "Enable phone confirmations" para que o registo funcione apenas com password, sem OTP.

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

Todos os documentos gerados são guardados automaticamente em **dois locais em paralelo**:

- **Supabase** (nuvem) — acessível em qualquer dispositivo quando autenticado e online
- **IndexedDB local** — disponível offline, funciona sem internet

O histórico carrega do Supabase quando há ligação, sincroniza para o IndexedDB, e usa apenas o IndexedDB quando offline. Cada documento mostra um badge ☁️ (sincronizado) ou 📴 (apenas local).

- Acessível via botão **📁** no header (visível apenas para utilizadores autenticados)
- Pré-visualização, cópia, reabertura no editor e eliminação individual
- Eliminação apaga tanto do Supabase como do IndexedDB
- Botão "Limpar tudo" remove todos os documentos

---

## 🔒 Segurança

- **RLS activado** em todas as tabelas — utilizadores só acedem aos seus dados
- **Supabase Phone Auth** — autenticação por telemóvel + password (sem email)
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

### v3.9 (actual)

#### Compliance Legal — Termos, Privacidade, Reembolsos, Cookies & Suporte

**Novo ficheiro:** `legal.html` — página legal completa e navegável:

- **Termos de Serviço** — elegibilidade, sistema de créditos, responsabilidades, proibições, lei aplicável (Lei n.º 3/2017)
- **Política de Privacidade** — dados recolhidos, finalidade, partilha com terceiros (Supabase, Vercel, IA), direitos do utilizador conforme **Lei n.º 58/2021** (Protecção de Dados Pessoais de Moçambique)
- **Política de Reembolso** — tabela clara com 8 cenários (falha técnica → crédito automático; insatisfação → nova geração; não utilizado → 50% M-Pesa em 7 dias; Avulso não usado → reembolso total em 48h)
- **Política de Cookies** — distinção entre armazenamento essencial (localStorage/IndexedDB) e análise opcional
- **Canais de Suporte** — WhatsApp, email geral, email privacidade, email bugs · horário de atendimento
- **Identificação da Empresa** — NUIT, contactos, website (campo NUIT marcado como "em processo de registo")

**Alterações em `index.html`:**
- Footer com links para Termos, Reembolsos, Suporte e email
- Banner de consentimento de cookies (aparece 1,5s após carregamento, guardado em localStorage `mz_cookie_ok`)
- Modal de pagamento: links "Política de Reembolso" e "Suporte" no aviso de pagamento manual

**Sem alterações** em JS de negócio, base de dados ou fluxos existentes — apenas HTML/CSS puro.

---

### v3.8

#### Funcionalidade — 10 Novos Tipos de Documento + Custo Dinâmico por Serviço

**Novos serviços adicionados** (`ServiceDefinitions.js` + `Services.js` + `index.html`):

| Serviço | Ícone | Créditos |
|---|---|---|
| Contrato de Arrendamento | 🏠 | 1 |
| Procuração / Mandato | 📜 | 1 |
| Requerimento Oficial | 📄 | 1 |
| Declaração de Residência | 🏡 | 1 |
| Contrato de Prestação de Serviços | 🤝 | 1 |
| Recibo / Factura | 🧾 | 1 |
| Carta de Recomendação | ✍️ | 1 |
| Plano de Negócios | 📊 | **2** |
| Pedido de Licença | 📋 | 1 |
| Acta de Reunião | 📑 | 1 |

**Custo dinâmico por serviço:**
- Campo `cost` adicionado em `ServiceDefinitions.js` (default: 1 se omitido)
- `DocumentController.js` — `canConsume()` e `consume()` passam a usar `svc.cost || 1`
- `Views.js` — botão "Gerar com IA" mostra "1 crédito" ou "2 créditos" conforme o serviço
- Plano de Negócios é o único serviço com `cost: 2` (documento mais extenso e complexo)

**Prompts IA:** cada serviço tem prompt optimizado para o contexto moçambicano com estrutura detalhada, referências legais locais e linguagem formal adequada.

---

### v3.7

#### Funcionalidade — Contas Temporárias para Pagamento Avulso

**Problema anterior:** o pacote Avulso era comprado por visitantes sem conta (`user_id: null`), tornando impossível atribuir os créditos a alguém.

**Solução implementada — fluxo completo:**

1. **Visitante** escolhe Avulso (50 MZN), insere o número e clica em "Confirmar e Abrir WhatsApp"
2. `process-payment.js` grava a transacção com `status: pending` e `user_id: null`
3. **Admin** recebe o comprovativo pelo WhatsApp, vai ao painel admin (`/admin.html`), vê a transacção com botão roxo **"🎫 Criar Conta"**
4. Admin clica → `/api/admin/confirm-avulso` é chamado:
   - Cria utilizador no Supabase Auth com email `temp_MANxxxxxx@mzdocs.temp` e password aleatória (ex: `KpRx4821`)
   - Marca o perfil como `is_temp: true`, `temp_ref: MANxxxxxx`, `credits: 3`
   - Liga a transacção ao novo `user_id`
   - Devolve link WhatsApp com as credenciais para o admin enviar ao cliente
5. **Painel admin** mostra popup com email, password, botão "📱 Enviar pelo WhatsApp" e "📋 Copiar"
6. **Cliente** recebe as credenciais, faz login com email+password temporários
7. Quando usa o último crédito, a função `deduct_credit()` detecta `is_temp = TRUE` e `credits = 0` → **elimina automaticamente** o utilizador do Supabase Auth (CASCADE apaga perfil e documentos)

**Novos ficheiros:**
- `api/admin/confirm-avulso.js` — endpoint exclusivo para pagamentos avulsos
- `supabase/migration_temp_accounts.sql` — colunas `is_temp`, `temp_ref`, `temp_password` + função `deduct_credit` actualizada com auto-delete

**Ficheiros modificados:**
- `assets/js/admin/AdminTransactions.js` — botão "Confirmar" diferenciado por tipo (roxo "🎫 Criar Conta" para avulso, verde "✅ Confirmar" para os restantes); popup de credenciais após criação

**⚠️ Passo obrigatório:** executar `supabase/migration_temp_accounts.sql` no SQL Editor do Supabase

---

### v3.6

#### Correcção — Header quebrado em mobile (utilizador autenticado)

**Problema:** com sessão iniciada, o header mostrava: nome + email + avatar + botão "Sair" + 📁 + ⚡ créditos + "+ Comprar" — demasiados elementos para uma linha de ~375px, causando overflow e compressão visível (conforme screenshot).

**Solução — `assets/js/app.js` + `assets/css/styles.css`:**
- `userMenu` redesenhado: passa a mostrar apenas o **avatar (inicial do nome)** em vez de nome + email + botão Sair separados
- Ao clicar no avatar abre um **dropdown** elegante com: nome completo, email/telefone, e botão "Terminar sessão"
- Dropdown fecha ao clicar fora; abre animado; em mobile posiciona-se para a esquerda para não sair do ecrã
- Media queries revistas: `.ver-tag` ("v3 MVC") ocultada globalmente; gap e padding compactados em ≤ 520px; "+ Comprar" oculto em ≤ 380px
- Header fica com exactamente **4 elementos** em mobile autenticado: logo · avatar · 📁 · ⚡ créditos

---

### v3.5

#### Correcção Crítica — Créditos reiniciavam a cada limpeza de cache

**Causa raiz (3 bugs combinados):**

1. `Models.js init()` lia `localStorage.get('credits')` antes de ir ao servidor — se o utilizador nunca tivesse apagado o localStorage, tinha lá `3` (valor inicial), e isso era usado como valor de arranque
2. `Services.js syncUser()` fazia `Math.max(serverCredits, localCredits)` — se o localStorage tivesse `3` e o servidor tivesse `0`, repunha os 3 no Supabase, voltando sempre ao início
3. Não existia lógica de créditos mensais por plano nem marcação de "bónus inicial já dado"

**Ficheiros corrigidos:**
- `assets/js/models/Models.js` — `init()` já não lê créditos do localStorage; mostra `0` enquanto carrega e usa sempre o valor do Supabase; visitantes ficam com `0`
- `assets/js/models/Models.js` — `_syncFromServer()` chama `syncUser()` sem passar `localCredits`
- `assets/js/services/Services.js` — `syncUser()` removido o `Math.max`; Supabase é sempre a fonte de verdade; verifica e atribui créditos mensais via RPC `grant_monthly_credits`

**Nova migração SQL:** `supabase/migration_monthly_credits.sql`
- Adiciona colunas `welcome_bonus_given`, `plan`, `plan_expires_at`, `monthly_renewal_at` à tabela `profiles`
- Trigger `handle_new_user` actualizado: marca `welcome_bonus_given = TRUE` no registo (bónus dado uma única vez)
- Função `grant_monthly_credits(user_id)`: atribui créditos mensais por plano (idempotente — ignora se já atribuiu no mês corrente)
  - `starter` → 1 crédito/mês
  - `basico`  → 3 créditos/mês  
  - `pro`     → 8 créditos/mês
- Função `confirm_payment_and_set_plan(transaction_id, admin_id)`: ao confirmar pagamento, grava o plano + validade (30 dias) no perfil
- Utilizadores existentes: marcados como `welcome_bonus_given = TRUE` (não recebem o bónus novamente)

**Regra de negócio implementada:**
- 3 créditos grátis: dados **uma única vez** no registo (trigger SQL)
- Créditos mensais: apenas para utilizadores com plano activo (starter/basico/pro), no 1.º login de cada mês
- Plano expira 30 dias após confirmação do pagamento
- Cache limpa / reabrir browser → créditos vêm sempre do Supabase, nunca do localStorage

---

### v3.4

#### Correcção — Header quebrado em mobile
- **Bug:** o header não tinha media queries, quebrando em ecrãs ≤ 480 px (elementos sobrepostos ou empurrados para fora da linha)
- **Solução:** adicionadas regras CSS responsivas em  para dois breakpoints:
  -  — logo e botões compactados,  oculta,  ("cr") oculta, espaçamentos reduzidos
  -  — "+ Comprar" oculto (o pill de créditos fica clicável para abrir a compra)
- Sem alterações de HTML ou JS — apenas CSS puro

---

### v3.3

#### Correcção Crítica — UUID inválido no Supabase
- **Bug:** ao guardar um documento, o Supabase retornava erro 400 `invalid input syntax for type uuid` porque o campo `id` era gerado como `doc-<timestamp>-<random>` (string livre), incompatível com o tipo `UUID PRIMARY KEY` definido no schema da tabela `documents`
- **Ficheiros corrigidos:**
  - `assets/js/controllers/DocumentController.js` — `id` passa a ser gerado com `crypto.randomUUID()` (UUID v4 nativo do browser, disponível em todos os browsers modernos e em contexto HTTPS)
  - `assets/js/utils/IndexedDB.js` — idem para o ID gerado durante o `syncWhenOnline()` (fila offline → Supabase)
- **Impacto:** documentos gerados após esta versão são guardados correctamente no Supabase e ficam disponíveis na sincronização multi-dispositivo; documentos guardados offline com o ID antigo continuam acessíveis localmente via IndexedDB mas não serão enviados ao Supabase (ID incompatível)

---

### v3.2 (anterior)

#### Header e UX de Autenticação
- **Visitantes** vêem apenas o botão 🔐 Entrar — interface limpa, sem ruído
- **Após login**, header apresenta: avatar · 📁 · ⚡ créditos · + Comprar
- Banner de boas-vindas para visitantes com acesso directo ao pacote avulso
- Botão "Continuar sem conta" no modal de login redirige para compra avulso (sem dar créditos grátis)

#### Modelo de Acesso Avulso
- Removidos os 3 créditos grátis automáticos para visitantes anónimos
- Novo pacote **Avulso — 50 MZN** (1 documento + 2 revisões, sem conta)
- Modal de pagamento detecta se o utilizador está autenticado e ajusta o modo automaticamente
- Mensagem de erro ao gerar sem créditos diferencia visitantes de utilizadores com saldo esgotado

#### Arquivo de Documentos (novo)
- `HistoryController.js` — guarda todos os documentos gerados no IndexedDB após cada geração
- Modal 📁 com lista de documentos: ícone do serviço, título, data, pré-visualização de texto
- Acções por documento: 👁️ Ver · 📋 Copiar · 🗑️ Apagar
- "Ver" reabre o modal de resultado com o documento carregado (inclui download e envio por WhatsApp)
- Funciona offline — documentos disponíveis sem internet após geração

#### Service Worker
- Precache expandido de 8 → 33 ficheiros (todos os módulos JS, auth, utils, components)
- `HistoryController.js` adicionado ao precache
- Revisão `3.1` → `3.2` para forçar actualização do SW em browsers existentes

#### Pagamento Manual
- Aviso claro (banner amarelo) após seleccionar pacote: processo manual, prazo 24h, referência
- Botão muda de "Pagar com M-Pesa" → "Confirmar e Abrir WhatsApp"
- Aviso e texto do botão resetam ao fechar o modal

#### Feedback Visual no Download
- Botão ⬇️ Download muda para ⏳ A preparar… durante geração de PDF/Word/Excel
- Botão desactivado durante o processo e restaurado ao terminar (sucesso ou erro)

#### Correcções
- `ExcelExporter.js` — corrigido typo no nome do ficheiro (`ExelExporter.js` → `ExcelExporter.js`)
- `manifest.json` — ícones `maskable` declarados em entradas separadas dos ícones `any` (W3C)
- `CreditModel.consume()` — simplificado, sem dependência da chave de créditos grátis mensais

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
