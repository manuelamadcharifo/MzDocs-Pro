# MzDocs Pro

Plataforma moçambicana de geração, edição e exportação de documentos profissionais com IA.
PWA instalável (Android/iOS), construída para o Vercel Hobby (limite: 12 Serverless Functions —
**já esgotado, sem margem**), Supabase (PostgreSQL + pgvector) e pagamento manual por carteira
móvel (M-Pesa, e-Mola, mKesh).

> 📌 **Nota sobre este README:** actualizado em Agosto/2026 a partir de uma leitura directa do
> código-fonte no export mais recente (migrações até `v56`, correcções ao Marketplace de
> Templates e ao motor de pagamentos). A versão anterior deste ficheiro tinha ficado desactualizada
> em relação às migrações `v52`–`v56` e a várias correcções entretanto feitas ao Marketplace de
> Templates, ao CI e às notificações de pagamento. Este documento reflecte o estado do código tal
> como está — não o histórico ronda-a-ronda, que passa a viver apenas na secção "Histórico de
> Versões" no fim.

> ⚠️ **Acção urgente e não resolvida — plano Vercel:** este projecto processa pagamentos
> (`api/process-payment.js`, tabela `transactions`). Os Termos de Serviço da Vercel definem
> **qualquer fluxo de cobrança a visitantes do site** como uso comercial, não permitido no plano
> Hobby — apenas no Pro (US$20/mês) ou Enterprise. Esta recomendação já aparece em, pelo menos,
> três auditorias anteriores e continua sem evidência de ter sido resolvida. Adicionalmente, nos
> Termos da Vercel, projectos em Hobby (ou em trial Pro) concedem à Vercel o direito de usar o
> conteúdo do site para treinar modelos de IA — relevante porque esta plataforma processa dados
> pessoais sensíveis (BI, NUIT, moradas, procurações, contratos).

> ✅ **`ROADMAP-ESCALA.md` existe** (544 linhas, versão de Agosto/2026, secção 12) — fusão dos três
> documentos de roadmap anteriores (técnico + rentabilidade + plano de execução de 14 dias) contra
> o código-fonte, preços actuais dos fornecedores e a legislação fiscal moçambicana de 2026. Existe
> também, à parte, `MzDocs-Pro-Roadmap-Marketing-Gratuito-Mocambique.md` (marketing orgânico — um
> documento diferente, não substitui o de escala técnica).

---

## Índice

1. [Funcionalidades principais](#1-funcionalidades-principais)
2. [Arquitectura e stack](#2-arquitectura-e-stack)
3. [Motor de IA — geração multi-provider com auto-cura](#3-motor-de-ia--geração-multi-provider-com-auto-cura)
4. [Serviços e templates](#4-serviços-e-templates)
5. [Estrutura do projecto](#5-estrutura-do-projecto)
6. [Deploy — passo a passo completo](#6-deploy--passo-a-passo-completo)
7. [Segurança](#7-segurança)
8. [Pagamentos e créditos](#8-pagamentos-e-créditos)
9. [Sistema de afiliados e rede de parceiros](#9-sistema-de-afiliados-e-rede-de-parceiros)
10. [Limites do Vercel Hobby](#10-limites-do-vercel-hobby)
11. [Testes](#11-testes)
12. [Dívida técnica e problemas conhecidos (honesto, sem filtro)](#12-dívida-técnica-e-problemas-conhecidos-honesto-sem-filtro)
13. [Conformidade legal (Moçambique)](#13-conformidade-legal-moçambique)
14. [Histórico de versões](#14-histórico-de-versões)

---

## 1. Funcionalidades principais

| Funcionalidade | Descrição | Estado verificado |
|---|---|---|
| **Geração com IA — 9 providers com adaptador funcional** (+ 4 catalogados sem adaptador, apenas referência) | Corrida por tiers com fallback automático e controlo de custo; ver secção 3 | ✅ Código confirmado — muito além dos "5 providers" descritos em versões antigas deste README |
| **Descoberta de modelos ao vivo** | Antes de confiar numa lista fixa de modelos, o sistema consulta `GET /models` do próprio provider e usa o catálogo real | ✅ `api/_lib/modelDiscovery.js` |
| **Disjuntor (circuit breaker) por modelo** | Desliga automaticamente um modelo específico que esteja a falhar — 7 dias se for descontinuação permanente, com backoff crescente (10min→30min→2h) se for falha transitória | ✅ `api/_lib/modelHealth.js` |
| **Amostra Grátis + Custo Progressivo** | `_previewMode: true` gera um extracto curto sem debitar créditos; documentos longos (6+ páginas) têm custo progressivo via `LongDocumentEngine` | ✅ |
| **18 serviços** (16 com geração por IA, 2 encaminhados por WhatsApp) | Ver secção 4 — número real supera os "17 serviços / 14 com IA" de versões anteriores deste documento | ✅ `ServiceDefinitions.js` |
| **70+ Templates Visuais** | 5 templates por serviço nos 14 serviços "clássicos", com CSS próprio | ✅ |
| **Editor WYSIWYG** | Edição inline com preservação fiel do template (iframe + `designMode`) | ✅ |
| **Export PDF / Word (.docx real) / Excel (.xls)** | `HTMLToDocxExporter` e `WordExporter` geram OOXML real via biblioteca `docx`, não HTML disfarçado | ✅ |
| **Assinatura Digital (canvas)** | Inserida directamente no documento — **sem validade jurídica plena** sem certificação nos termos da Lei n.º 3/2017 (ver secção 13) | ✅ |
| **Módulo Académico APA 7** | Citações, bibliografia, TOC automático, upload PDF/URL | ✅ |
| **Extracção de Template por Imagem** | IA de visão extrai estrutura de qualquer imagem de documento | ✅ |
| **OCR (SmartOCRService v4)** | IA visual primeiro (Groq/Gemini), Tesseract como complemento; suporta imagem, PDF (`pdf.js`) e Word (`mammoth.js`) | ✅ |
| **Digitalizar Documento (`transcricao`)** | Serviço dedicado a fotografar um trabalho manuscrito/vários ficheiros e devolver texto digitado e formatado | ✅ Novo serviço, não documentado em versões anteriores deste README |
| **Motor Jurídico RAG** | Busca vectorial (pgvector) sobre artigos de lei moçambicanos reais para os serviços jurídicos, em vez de citações estáticas | ✅ |
| **Histórico Offline** | IndexedDB, sincronizado quando online | ✅ |
| **Pagamento Manual Multi-Carteira** | M-Pesa, e-Mola, mKesh — upload de comprovativo com verificação automática por IA de visão (aprovação se confiança ≥ 0.85) e fallback WhatsApp | ✅ |
| **Reembolso Automático de Créditos** | Se a geração falhar após o débito, o crédito é devolvido via RPC `refund_credit` | ✅ |
| **Alertas Telegram para revisão manual (NOVO)** | Quando um comprovativo de pagamento não é aprovado automaticamente (`review_needed`), o admin recebe um alerta Telegram além da notificação já existente no painel — `notifyTelegram.js`, fire-and-forget, nunca bloqueia o fluxo de pagamento se falhar | ✅ `api/_lib/notifyTelegram.js`, ligado em `api/misc.js` |
| **Preços Dinâmicos** | Pacotes lidos de `system_settings` em tempo real (`api/_lib/packages.js`) | ✅ |
| **Marketplace de Templates** | Galeria comunitária, preview A4 realista com dados fictícios preenchidos automaticamente (mesmo para variáveis livres definidas pelo criador), submissão/avaliação/partilha, repartição de receita 60–70% para o criador, preço máximo 10 créditos (alinhado com o tecto de qualquer operação cobrada na plataforma) | ✅ |
| **Venda de templates restrita a afiliados/parceiros (NOVO — v55)** | Um utilizador comum pode submeter e partilhar templates gratuitamente, mas só afiliados aprovados ou parceiros activos podem definir preço (`credit_cost > 0`) — garantido por trigger na base de dados, não só validação no código | ✅ `migration_v55` |
| **Sistema de Afiliados Pro** | Segmentação, níveis, bónus por tier, detecção de fraude — ver secção 9 | ✅ |
| **Rede de Parceiros (incl. advogados)** | Papelarias, cyber cafés e advogados parceiros, com código de acesso próprio | ✅ |
| **Avaliações Públicas** | ⭐ 1–5, com moderação de conteúdo automática (`contentModeration.js`) | ✅ |
| **Créditos Bónus / Promoções (NOVO)** | Admin pode conceder um bónus de créditos (ex.: "+5 este mês") somado aos créditos grátis normais no registo | ✅ Mas ver nota honesta na secção 12 — o prazo de validade do bónus é guardado e nunca aplicado |
| **Painel Admin** | Analytics, feedback, utilizadores, pagamentos, parceiros, preços dinâmicos, Finanças com Identidade Fiscal, Kit de Marketing, recibos de afiliados | ✅ |
| **Blog / SEO** | CMS com geração assistida por IA; publicação automática de HTML estático directamente no GitHub via Contents API | ✅ |
| **PWA** | Instalável, funciona offline, `CACHE_VERSION` auto-gerado a cada deploy | ✅ |

---

## 2. Arquitectura e stack

- **Frontend:** HTML/CSS/JS puro (sem framework pesado), organizado em `assets/js/` por
  domínio (`controllers/`, `services/`, `components/`, `marketplace/`, `academic/`, `auth/`,
  `admin/`, `partners/`, `utils/`, `views/`).
- **Backend:** 12 Serverless Functions na Vercel — o número exacto e físico permitido pelo plano
  Hobby, confirmado em `vercel.json` (`functions: {...}` tem exactamente 12 entradas). Ficheiros
  dentro de `api/_lib/` são helpers partilhados e **não contam** para este limite.
- **Base de dados:** Supabase (PostgreSQL) com extensão `pgvector` para o Motor Jurídico RAG.
- **Cliente Supabase:** 100% via `fetch` nativo (`api/_lib/supabaseAdmin.js`) — **confirmado**
  que não existe nenhum `require()`/`import` activo de `@supabase/supabase-js` nem de `ws` em
  nenhum ficheiro de `api/`; `package.json` também não lista nenhuma das duas dependências.
  (Referências a essas bibliotecas que ainda aparecem em `api/admin/index.js` e `api/misc.js`
  são **comentários históricos**, não código a correr.)
- **Rate limiting:** Upstash Redis, com fallback para `Map` local em memória se as variáveis
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` não estiverem definidas.
- **Migrações:** mais de 50 ficheiros SQL versionados em `supabase/`, de `schema.sql` +
  `migration_v8_*` até `migration_v56_max_credit_cost_10.sql`, mais um conjunto de ficheiros
  avulsos sem numeração sequencial (`EMERGENCIA_*`, `EXECUTAR_AGORA_*`, `migration_fix_*`,
  `migration_add_*`) aplicados directamente em produção ao longo do tempo — ver secção 12.
- **CI:** `.github/workflows/test.yml` corre `npm test` em cada push/PR ao branch principal.

---

## 3. Motor de IA — geração multi-provider com auto-cura

Este é o subsistema mais sofisticado do projecto e o que mais mudou desde as descrições
anteriores deste README ("5 providers em corrida paralela"). O estado real, confirmado em
`api/_lib/aiProviderRegistry.js`, é:

### 3.1. 9 providers com adaptador (competem de facto) + 4 catalogados sem adaptador

`aiProviderRegistry.js` é a fonte única de verdade, mas divide-se em dois grupos bem distintos —
**13 no total, mas só 9 alguma vez chamam um modelo**:

| Provider | Tier | Activação |
|---|---|---|
| Groq | Generoso (grátis) | `GROQ_API_KEY` |
| Cerebras | Generoso (grátis) | `CEREBRAS_API_KEY` |
| Google Gemini | Médio | `GEMINI_API_KEY` |
| OpenRouter | Médio | `OPENROUTER_API_KEY` |
| NVIDIA NIM | Reserva activa (fallback) | `NVIDIA_API_KEY` |
| Mistral | Reserva activa (fallback) | `MISTRAL_API_KEY` |
| SambaNova Cloud | Reserva activa (fallback) | `SAMBANOVA_API_KEY` |
| Together AI | Reserva activa (fallback) | `TOGETHER_API_KEY` |
| Fireworks AI | Reserva activa (fallback) | `FIREWORKS_API_KEY` |

Os 4 seguintes estão só em `UNWIRED_RESERVE`, catalogados para planeamento e para o painel admin,
**mas sem adaptador de chamada** (a API deles não fala o formato OpenAI `chat/completions` que
`tryOpenAIModel()` sabe chamar) — definir a env var sugerida **não** os liga à corrida:

| Provider | Estado |
|---|---|
| Cloudflare Workers AI | Sem adaptador — precisa de mapeamento dedicado antes de poder competir |
| GitHub Models | Sem adaptador |
| Hugging Face Inference | Sem adaptador |
| Cohere | Sem adaptador |

**Princípio de desenho (dos 9 com adaptador):** assim que a variável de ambiente correspondente
existir na Vercel, esse provider entra automaticamente no registo — não é preciso editar
`generate-document.js` para "ligar" uma chave nova. Mas **desde a v2.4 (correcção de custo,
Agosto/2026) nem todos correm sempre**: por omissão, `raceAllProviders()` só corre em paralelo o
grupo **generoso + médio** (Groq, Cerebras, Gemini, OpenRouter — até 4 chamadas, tipicamente 2-3
com chave configurada). O grupo **reserva activa** (NVIDIA, Mistral, SambaNova, Together,
Fireworks) só entra como **fallback**, e só se o grupo primário falhar por completo. Cada provider
tem também um tecto de 9s — se não responder a tempo, é descartado e a corrida continua com os
restantes. Antes da v2.4, o motor corria os 9 em paralelo em todo o pedido, o que esgotava a
quota grátis 3-4,5× mais depressa e inflacionava o custo por documento; isto já não acontece.

### 3.2. Descoberta de modelos ao vivo (`modelDiscovery.js`)

Em vez de confiar cegamente numa lista curada e estática de modelos por provider, o sistema
consulta o endpoint `GET /models` de cada provider e cruza com a lista curada. Se um modelo
curado já não existir no catálogo real (ex.: a Cerebras já reduziu o seu catálogo público a
apenas 2 modelos de um dia para o outro, sem aviso, várias vezes em 2026), é saltado
automaticamente. Falha de forma totalmente silenciosa — qualquer problema (timeout, chave
inválida, provider sem suporte a `/models`) devolve `null` e o sistema usa a lista curada tal
como estava.

### 3.3. Disjuntor por modelo (`modelHealth.js`)

Memoriza falhas recentes de cada combinação `provider + modelo` e diz ao motor de corrida quais
saltar, sem intervenção manual:

- **Falha permanente** (mensagens como "decommissioned", "model not found", "no endpoints
  found") → modelo desactivado por 7 dias.
- **Falha transitória** (timeouts, erros 5xx, respostas vazias) → só desactiva depois de 3
  falhas **seguidas**, com backoff crescente (10 min → 30 min → 2 h), para não penalizar um
  modelo por um azar pontual.

### 3.4. Protecção de dados pessoais antes de qualquer IA externa (duas camadas)

1. **`api/_lib/piiRedaction.js`** (servidor) — actua sobre o texto já montado, por **padrão**
   (regex): apanha BI/NUIT/telefone/e-mail mesmo dentro de texto livre.
2. **`assets/js/services/prompts/piiShield.js`** (browser) — actua sobre **campos estruturados
   do formulário**, por nome do campo (`nome`, `bi*`, `nuit`, `telefone`, `morada`, papéis como
   `outorgante`/`procurador`/`senhorio`), substituindo por marcadores opacos antes do prompt sair
   do browser; só é reposto no documento final, também no browser.

Nenhuma das duas camadas cobre dados pessoais escritos à mão dentro de um campo de texto livre
não reconhecido como sensível (ex.: um nome mencionado dentro do campo "Finalidade" de uma
procuração) — isto exigiria reconhecimento de entidades nomeadas (NER), fora do âmbito actual.

---

## 4. Serviços e templates

Confirmado directamente em `assets/js/services/ServiceDefinitions.js` — **18 serviços no
total**, dos quais **16 geram documento por IA** (`hasAI: true`) e **2 são encaminhados por
WhatsApp** (`hasAI: false`):

| Serviço (chave) | Título | Gera por IA? |
|---|---|---|
| `cv` | Currículo (CV) | ✅ |
| `trabalho` | Trabalho Escolar/Académico | ✅ |
| `transcricao` | Digitalizar Documento (manuscrito → digitado) | ✅ |
| `carta` | Carta Formal | ✅ |
| `arrendamento` | Contrato de Arrendamento | ✅ |
| `requerimento` | Requerimento Oficial | ✅ |
| `recibo` | Recibo / Factura | ✅ |
| `procuracao` | Procuração / Mandato | ✅ |
| `orcamento` | Orçamento de Obra | ✅ |
| `residencia` | Declaração de Residência | ✅ |
| `prestacao` | Contrato de Prestação de Serviços | ✅ |
| `recomendacao` | Carta de Recomendação | ✅ |
| `planonegocio` | Plano de Negócios | ✅ |
| `licenca` | Pedido de Licença | ✅ |
| `acta` | Acta de Reunião | ✅ |
| `conversao` | Conversão de ficheiro (consome 1 crédito) | ✅ |
| `impressao` | Pedido de impressão | ❌ (WhatsApp) |
| `foto` | Foto tipo passe / documento | ❌ (WhatsApp) |

Os **14 serviços "clássicos"** (todos acima excepto `transcricao` e `conversao`, que são mais
recentes e não têm galeria de 5 templates visuais próprios) têm 5 templates cada, com CSS e
layout próprios, num ficheiro dedicado em `assets/js/marketplace/templates/<categoria>.js`,
agregados por `templates/index.js`.

### Adicionar um novo template

```js
// Em assets/js/marketplace/templates/cv.js
// Adicionar ao array TEMPLATES exportado por esse ficheiro
// (NÃO editar TemplateLibrary.js directamente — é só um reexport)
export const TEMPLATES = [
  // ...templates existentes...
  {
    id: 'cv-novo',
    name: 'Meu Template',
    description: 'Descrição curta',
    preview: { accent: '#3B82F6', bg: '#fff', font: 'sans-serif', headerBg: '#3B82F6', headerColor: '#fff' },
    htmlTemplate: `<div class="cv-page cv-two-col">...</div>`,
  },
];
```

---

## 5. Estrutura do projecto

```
MzDocs-Pro/
├── api/                                # 12 Serverless Functions (Vercel Hobby — limite físico atingido)
│   ├── _lib/                           # Helpers partilhados (prefixo "_" — não contam para o limite)
│   │   ├── supabaseAdmin.js            # Cliente Supabase via fetch puro (REST + Auth API)
│   │   ├── aiProviderRegistry.js       # Fonte única de verdade: 9 providers com adaptador + 4 catalogados sem adaptador
│   │   ├── aiProvidersCatalog.js       # Alimenta o painel "IA Providers" do admin (mesma fonte)
│   │   ├── modelDiscovery.js           # Descoberta ao vivo de modelos disponíveis por provider
│   │   ├── modelHealth.js              # Disjuntor por modelo (falhas permanentes/transitórias)
│   │   ├── visionAI.js                 # IA de visão (Gemini → OpenRouter fallback)
│   │   ├── legalSearch.js              # Busca vectorial pgvector para o Motor Jurídico RAG
│   │   ├── packages.js                 # Única fonte de verdade dos pacotes de créditos
│   │   ├── piiRedaction.js             # Mascaragem de PII no texto (servidor)
│   │   ├── contentModeration.js        # Filtro de conteúdo abusivo em avaliações públicas
│   │   ├── rateLimit.js                # Rate-limit via Upstash Redis (fallback Map local)
│   │   └── webpush.js                  # Notificações push via VAPID
│   ├── admin/index.js                  # Dashboard, analytics, feedback, blog, templates, afiliados, finanças
│   ├── auth/index.js                   # Login, registo, reset password
│   ├── generate-document.js            # Corrida por tiers (generoso+médio, reserva como fallback) + amostra grátis + custo progressivo + reembolso
│   ├── extract-template.js             # Extracção de template via imagem (IA visão)
│   ├── verify-credits.js               # Verificar saldo de créditos
│   ├── deduct-credit.js                # Debitar/reembolsar crédito
│   ├── process-payment.js              # Pagamento manual multi-carteira + registo de transacção
│   ├── partners.js                     # API da Rede de Parceiros
│   ├── convert.js                      # Conversão de ficheiros (OCR / extracção de texto)
│   ├── delete-temp-account.js          # Direito ao esquecimento / limpeza de conta
│   ├── cleanup-temp-accounts.js        # Cron diário: limpeza automática de contas expiradas
│   └── misc.js                         # Router auxiliar: config, ocr-analyze, verify-receipt,
│                                        #   legal-search, page-view, sitemap.xml, /api/affiliate/*,
│                                        #   /api/templates/*
│
├── assets/
│   ├── js/
│   │   ├── academic/          # APA 7 (AcademicEngine, AcademicUI)
│   │   ├── admin/              # AdminApp, AdminDashboard, AdminTransactions
│   │   ├── analytics/          # GA4 + Facebook Pixel + Microsoft Clarity
│   │   ├── auth/                # AuthGuard, AuthManager, AuthUI
│   │   ├── components/         # Editor WYSIWYG + exportadores PDF/Word/Excel
│   │   ├── controllers/        # Document/Template/History/OCR/Payment controllers
│   │   ├── convert/            # FileConverter (conversão no cliente)
│   │   ├── marketplace/        # TemplateLibrary, TemplatePicker, SampleData, templates/ (14 ficheiros)
│   │   ├── models/              # Models.js
│   │   ├── partners/           # NearbyPartners.js
│   │   ├── services/
│   │   │   ├── ServiceDefinitions.js   # 18 serviços (16 com IA + 2 via WhatsApp)
│   │   │   ├── Services.js              # Orquestra chamadas à API de geração; aplica piiShield
│   │   │   ├── LegalContext.js          # Ponte frontend ↔ /api/legal-search
│   │   │   ├── LongDocumentEngine.js    # Documentos longos, débito após planeamento
│   │   │   ├── MPesaService.js          # Detecção de carteira por prefixo de número
│   │   │   ├── PaymentService.js
│   │   │   ├── SmartOCRService.js
│   │   │   └── prompts/                 # 1 ficheiro de prompt por categoria + piiShield.js
│   │   ├── utils/               # A4Renderer, Formatter, IndexedDB, Sanitizer, Storage
│   │   └── views/               # Views.js
│   │   ├── app.js               # Ponto de entrada principal
│   │   └── homeController.js
│   └── css/
│
├── supabase/
│   ├── schema.sql                              # ⚠️ Desactualizado — usar migrations por ordem
│   ├── migration_v8_* … migration_v51_bonus_credits.sql   # Cadeia principal, ver secção 6
│   └── EMERGENCIA_*, EXECUTAR_AGORA_*, migration_fix_*, migration_add_*, polices.sql, transactions.sql
│                                               # ⚠️ Ficheiros avulsos aplicados directamente em
│                                               #   produção, sem numeração sequencial — ver secção 12
│
├── tests/
│   ├── auth.test.js                # 120 linhas
│   ├── ocrSchemaAlignment.test.js  # 100 linhas
│   └── rateLimit.test.js           # 61 linhas
│                                   # Total: 281 linhas de teste para ~11.650 linhas de código em api/
│
├── docs/legal/                     # VERIFICACAO-LEGAL.md + textos-fonte das leis usadas no RAG
├── pages/                          # Páginas SEO estáticas (geradas pelo admin via GitHub API)
├── afiliado.html · admin.html · admin-parceiros.html · parceiros.html · templates.html
├── perfil.html · index.html · offline.html · legal.html · blog.html
├── sw.js                           # CACHE_VERSION reescrita automaticamente a cada deploy
├── manifest.json · vercel.json · package.json (v11.0.0) · package-lock.json
└── scripts/inject-version.js
```

---

## 6. Deploy — passo a passo completo

### 6.1. Pré-requisitos

- Conta Vercel (Hobby ou Pro — ver aviso comercial no topo deste documento).
- Projecto Supabase com extensão `pgvector` activada (Dashboard → Extensions) — necessária para
  o Motor Jurídico RAG.
- Pelo menos **uma** chave de IA (quantas mais, maior a disponibilidade e mais resiliente o
  disjuntor de modelos): Groq, Google AI Studio (Gemini), OpenRouter, Cerebras, NVIDIA NIM,
  Mistral, SambaNova, Together AI, Fireworks AI, Cloudflare Workers AI, GitHub Models, Hugging
  Face, Cohere.
- **Não é necessária** conta M-Pesa API — os pagamentos são confirmados por upload de
  comprovativo (IA ou manual). `MPESA_API_KEY`/`MPESA_SERVICE_CODE` são opcionais, apenas
  alteram a etiqueta "sandbox"/"produção" na interface.
- Opcional: CloudConvert (conversão de ficheiros), Upstash Redis (rate-limit persistente),
  Personal Access Token do GitHub (publicação automática de páginas SEO).

### 6.2. Variáveis de ambiente (Vercel)

```
# Obrigatórias
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# IA — pelo menos 1 obrigatória; até 13 possíveis (ver secção 3.1)
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
CEREBRAS_API_KEY=csk-...
NVIDIA_API_KEY=nvapi-...
# + Mistral / SambaNova / Together / Fireworks / Cloudflare / GitHub Models / Hugging Face / Cohere
#   (ver nomes exactos das env vars em api/_lib/aiProviderRegistry.js)

SITE_URL=https://mzdocs.co.mz

# Opcionais
MPESA_API_KEY=...
MPESA_SERVICE_CODE=...              # ⚠️ nome real no código (não "MPESA_SERVICE_PROVIDER_CODE")
WA_SUPPORT_NUMBER=258858695506
CLOUDCONVERT_API_KEY=...
LIBREOFFICE=false                   # true apenas em VPS com LibreOffice
CRON_SECRET=...                     # protege /api/cleanup-temp-accounts
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
GITHUB_OWNER=...
GITHUB_REPO=...
GITHUB_TOKEN=...                    # PAT com escrita no repositório — tratar como Service Role Key
```

> ⚠️ **Variáveis sem efeito (não usar):** `ADMIN_EMAILS` e `MPESA_PUBLIC_KEY` não são lidas em
> nenhum ficheiro de código. O estado de administrador é controlado pela coluna
> `profiles.is_admin` — ver `supabase/EXECUTAR_promote_admin.sql`.

### 6.3. Migrações Supabase — lista completa e actualizada (v8 → v51)

Execute por ordem no SQL Editor do Supabase:

```
-- Base
schema.sql                                          -- ⚠️ desactualizado; use-o só como ponto de partida

-- Fundação (v8–v16)
migration_v8_1_blog_pages.sql
migration_v8_2_admin_tables.sql
migration_v8_pricing_temp_accounts.sql
migration_v9_analytics_feedback.sql
migration_v10_affiliates.sql
migration_v10_online_userid.sql
migration_v11_marketplace.sql
supabase-partners-setup.sql
migration_v12_refund_credit.sql
migration_v12_community_templates.sql
migration_v13_fix_signup_credits.sql
migration_v14_affiliates_pro.sql
migration_v15_receipt_verification.sql
migration_v16_fix_signup_name_phone.sql

-- Motor Jurídico RAG + consolidação (v17–v24)
migration_v17_legal_rag.sql                          -- requer pgvector activo
migration_v20_lei_associacoes_cooperativas.sql        -- gap v18/v19 é real no repositório
migration_v21_dynamic_signup_credits.sql
migration_v22_seed_official_templates.sql
migration_v23_fix_gallery_view_html_css.sql
migration_v24_secure_orphan_credit_packages.sql

-- Correcções e agendamento (v25–v29)
migration_v25_fix_transaction_status.sql
migration_v26_blog_scheduling.sql
migration_v27_ai_provider_monitoring.sql
migration_v28_blog_pages_published_at.sql
migration_v29_user_profile_page.sql

-- Marketing Analytics (v30–v34)
migration_v30_marketing_analytics.sql
migration_v31_marketing_purchase_attribution.sql      -- ⚠️ confirmar no Supabase se já foi aplicada;
                                                       --   auditorias anteriores assinalaram risco de
                                                       --   export corrompido/vazio deste ficheiro
migration_v32_marketing_qrcodes.sql
migration_v33_funnel_crm.sql
migration_v34_campaigns_goals_notifications.sql

-- Push, afiliados avançados, finanças, templates, limites (v35–v41)
migration_v35_push_notifications.sql
migration_v36_tier_bonus_and_referral_signup.sql
migration_v37_finance_expenses.sql
migration_v38_template_marketplace_split.sql
migration_v39_template_credits_only.sql               -- executar SÓ depois da v38
migration_v40_document_usage_limits.sql               -- depois das v37/v38/v39
migration_v41_marketing_materials.sql

-- Identidade fiscal, recibos, avaliações, parceiros (v42–v47)
migration_v42_finance_fiscal_identity.sql
migration_v43_affiliate_payout_receipts.sql
migration_v44_public_reviews.sql
migration_v45_partner_ratings_antiabuso.sql
migration_v46_partner_access_code.sql
migration_v46_fix_document_insert_fk_violation.sql    -- ⚠️ SEGUNDO ficheiro "v46" — nome duplicado
                                                       --   por lapso, não é a mesma migração repetida;
                                                       --   ambos podem ser corridos sem conflito, mas
                                                       --   recomenda-se renomear um deles
migration_v47_partners_advogados.sql

-- Protecção de dados pessoais e segurança (v48–v50)
migration_v48_lpd_compliance.sql                      -- consent_logs, direito ao esquecimento,
                                                       --   deprecia profiles.temp_password
migration_v49_secure_affiliate_receipts.sql           -- bucket privado + signed URL 5min
migration_v50_protect_sensitive_profile_columns.sql   -- RLS reforçada em BI/NUIT/morada

-- Créditos bónus, expiração real, Marketplace, limite de preço (v51–v56 — mais recentes)
migration_v51_bonus_credits.sql                       -- ver nota honesta na secção 12
migration_v52_credit_ledger.sql                       -- expiração real por LOTE (30 dias da
                                                       --   aquisição), substitui a data única
                                                       --   por conta que a v51 deixou por aplicar
migration_v53_fix_official_template_previews.sql      -- preenche template_html das 4 variantes
                                                       --   de estilo por categoria que a v22 só
                                                       --   tinha deixado com CSS (preview caía no
                                                       --   texto genérico em vez do documento real)
migration_v54_fix_template_gallery_visibility.sql     -- corrige templates aprovados com
                                                       --   is_public=false que nunca apareciam na
                                                       --   Galeria pública apesar do "✅ Aprovado"
migration_v55_affiliate_partner_only_selling.sql      -- só afiliados/parceiros aprovados podem
                                                       --   definir credit_cost > 0 — trigger na BD
migration_v56_max_credit_cost_10.sql                  -- tecto de 10 créditos em credit_cost,
                                                       --   alinhado com VALID_COSTS do débito
```

> ⚠️ Existem ainda vários ficheiros avulsos em `supabase/` (`EMERGENCIA_*`, `EXECUTAR_AGORA_*`,
> `migration_fix_*`, `migration_add_*`, `polices.sql`, `transactions.sql`) aplicados directamente
> em produção ao longo do tempo, fora desta cadeia numerada. Para uma instalação limpa, siga
> apenas a lista acima. Recomenda-se gerar um `schema_CURRENT.sql` a partir do Supabase Dashboard
> (Database → Schema) como referência canónica única.

### 6.4. Deploy

Push para o branch principal no GitHub → a Vercel faz deploy automático. Publicações de páginas
SEO feitas pelo admin (blog) também fazem commit directo no repositório e disparam um novo
deploy.

---

## 7. Segurança

- RLS activo em todas as tabelas Supabase, incluindo `credit_packages` (corrigido em v24) e
  colunas sensíveis de `profiles` (BI, NUIT, morada — reforçado em v50).
- Tokens JWT validados em todos os endpoints privados via `api/_lib/supabaseAdmin.js`.
- IPs hasheados (SHA-256) para tracking de cliques — sem dados pessoais em claro.
- `Sanitizer.js` com lista explícita de tags HTML5 permitidas.
- Service Role Key nunca exposta ao cliente; erros internos do Supabase nunca devolvidos ao
  cliente (apenas em logs do servidor).
- Rate limiting via Upstash Redis, com fallback gracioso para `Map` local.
- Contas temporárias limpas automaticamente via cron diário.
- Mascaragem de PII em duas camadas antes de qualquer envio a fornecedores de IA externos (ver
  secção 3.4).
- `profiles.temp_password` deixou de ser gravado em texto simples (v48) — nova acção
  `regenerate-temp-password` gera password nova, actualiza-a de facto no Supabase Auth, e
  devolve-a **uma única vez** na resposta.
- Bucket de comprovativos de pagamento a afiliados (`affiliate-receipts`) é privado, sem URLs
  públicas — acesso só via signed URL de 5 minutos (v49).
- Registo exige consentimento explícito aos Termos de Serviço, gravado em `consent_logs` com IP,
  hora e versão dos termos (v48).
- Filtro de conteúdo abusivo (`contentModeration.js`) em avaliações públicas: `clean` (aprovação
  automática) / `flagged` (revisão humana) / `blocked` (rejeitado de imediato).

**O que uma auditoria de código não consegue confirmar sozinha** (precisa de acesso à
infra-estrutura real): se todas as migrações foram de facto aplicadas em produção, cabeçalhos
HTTP reais servidos pelo site (CSP efectivo, HSTS), e o resultado de um `npm audit` real sobre as
dependências do `package-lock.json`.

---

## 8. Pagamentos e créditos

### Pacotes (valores de seed, editáveis no admin sem redeploy)

| Pacote | Créditos | Preço | MZN/crédito | Notas |
|---|---|---|---|---|
| Avulso | 3 | 50 MZN | 16.67 | Conta temporária, válida 7 dias |
| Starter | 10 | 120 MZN | 12.00 | — |
| Básico | 25 | 280 MZN | 11.20 | Pacote mais popular |
| Pro | 60 | 600 MZN | 10.00 | — |
| Empresa | 150 | 1500 MZN | 10.00 | Multi-utilizador |

Não existe integração automática com a API de cobrança M-Pesa — confirmado tanto na ausência de
qualquer chamada a uma API de cobrança no código como na documentação.

### Fluxo de confirmação — duas vias

**1. Verificação automática por IA de visão (caminho principal)**
1. Utilizador escolhe pacote, introduz número moçambicano válido (prefixos 82–87);
   `process-payment.js` regista em `transactions` (status `pending`).
2. Upload do comprovativo → `POST /api/verify-receipt`.
3. `visionAI.js` (Gemini → OpenRouter fallback) extrai valor, referência, estado e confiança.
4. **Aprovação automática** se confiança ≥ 0.85 *e* valor correcto (±1 MZN) *e* data ≤ 60 min
   *e* hash do comprovativo nunca reutilizado. Créditos creditados na hora via RPC `add_credits`.
5. Caso contrário → `review_needed` para confirmação manual no admin, com alerta Telegram
   enviado ao admin em paralelo (`notifyTelegram.js` — falha a enviar nunca bloqueia o pagamento).
6. Anti-abuso: máximo 3 uploads por IP por minuto.

**2. Fallback manual via WhatsApp** — link pré-formatado, confirmação manual pelo admin.

> ℹ️ **Confirmação por SMS real da Vodacom (preparado, ainda não ligado):** existe
> `api/_lib/parseMpesaSms.js`, que interpreta o SMS de confirmação M-Pesa real ("Confirmado
> \<REF\>. Recebeste \<VALOR\>MT de..."), pensado para ser alimentado por uma app grátis de
> encaminhamento de SMS por webhook (ex.: httpSMS) instalada no telemóvel que já recebe os
> pagamentos — uma camada anti-burla mais forte que o OCR de comprovativo, sem custo adicional.
> O ficheiro e o seu teste (`tests/parseMpesaSms.test.js`) existem e passam, mas **não está ligado
> a nenhuma rota `api/`** — nem `process-payment.js` nem `misc.js` o chamam hoje. Falta o
> despacho `?webhook=sms-mpesa` dentro de `api/process-payment.js` (reaproveitando a mesma
> function, sem consumir um dos 12 slots) para a funcionalidade ficar activa.

### Expiração de créditos (NOVO — v52, ledger por lote)

Corrige a limitação que a v51 deixava documentada mas não resolvida (ver secção 12 da versão
anterior deste README): créditos normais (grátis, comprados, referência/afiliado, reembolsados)
passam a expirar **30 dias a contar da data de aquisição de CADA lote**, não de uma única data por
conta gravada só no registo. Créditos "bónus"/promocionais continuam a usar o prazo configurável
no admin (`bonus_credits_expiry_days`, 30 dias de fallback). Testado em `tests/credit-expiry.test.js`.

### Reembolso automático

Se a geração de IA falhar completamente (todos os providers indisponíveis), o crédito é devolvido
automaticamente via RPC `refund_credit`, tanto em `generate-document.js` como no
`LongDocumentEngine` para documentos longos.

### Limites de uso por documento (por download/edição, não por qualidade)

| Origem do crédito | Downloads | Edições |
|---|---|---|
| Plano Grátis (1.º crédito) | 3 | 2 |
| Planos pagos | 5 | 5 |
| Plano Empresa | ilimitado | ilimitado |

Calculado inteiramente no servidor (trigger + funções `SECURITY DEFINER`); nunca a partir de
valores enviados pelo browser.

### Finanças ("Valor Levantável")

```
Valor Levantável = Receita Total Confirmada
                  − Saldo reservado para Afiliados
                  − Despesas Operacionais registadas
                  − Já Levantado pelo dono
```

Inclui Identidade Fiscal (v42) e recibos formais de pagamento a afiliados a cada levantamento
confirmado (v43).

---

## 9. Sistema de afiliados e rede de parceiros

- **Comissões por pacote** (configurável): Avulso 10% · Starter 15% · Básico 15% · Pro 20% ·
  Empresa 20%.
- **Segmentos:** papelaria · cyber · universidade · explicação · digitador · individual — cada
  um com bónus próprio.
- **Níveis:** 🥉 bronze → 🥈 prata (5+ conversões) → 🥇 ouro (20+) → 💎 diamante (50+); diamante
  reduz o mínimo de levantamento para metade.
- **Bónus de comissão por tier:** Bronze +0% · Prata +2% · Ouro +5% · Diamante +8%.
- **Crédito de boas-vindas** para quem se regista via link de afiliado.
- **Anti-fraude:** tabela dedicada com eventos (`self_referral`, `ip_burst`, `fake_clicks`,
  `suspicious_conversion`) e severidade.
- **Kit de Marketing dinâmico:** o admin marca zonas de QR code/texto sobre uma imagem; cada
  afiliado vê a peça composta no seu próprio browser (`<canvas>`) com o SEU QR pessoal — nenhuma
  cópia por afiliado fica gravada na base de dados.
- **Rede de Parceiros:** papelarias, cyber cafés **e advogados** (v47), com código de acesso
  próprio (v46) e protecção anti-abuso nas avaliações (v45).
- **Venda de templates restrita (NOVO — v55):** só afiliados aprovados (`profiles.is_affiliate`)
  ou parceiros activos ligados à sua conta (`partners.linked_user_id`) podem definir preço num
  template submetido por eles; um utilizador comum continua a poder submeter templates (privados
  ou públicos gratuitos), mas nunca lhes pode atribuir `credit_cost > 0` — regra imposta por
  trigger na base de dados, não apenas validação no código, para que nenhum caminho de código
  futuro consiga contornar a repartição de receita a quem não está associado ao projecto.

---

## 10. Limites do Vercel Hobby

| Recurso | Limite | Usado |
|---|---|---|
| Serverless Functions | 12 | **12 — sem margem** (`api/_lib/` não conta) |
| `generate-document.js` / `extract-template.js` / `convert.js` | 60 s | — |
| `process-payment.js` | 30 s | — |
| Restantes | 10–30 s | — |
| Bandwidth | 100 GB/mês | — |

**Regra prática:** toda nova lógica de API deve ir em `api/misc.js` ou numa function já
existente. Helpers partilhados vão em `api/_lib/`. Não criar novos ficheiros `.js` directamente
em `api/` sem confirmar este limite primeiro.

---

## 11. Testes

| Suite | Linhas | Cobre |
|---|---|---|
| `tests/auth.test.js` | 120 | AuthManager / AuthUI (jsdom) |
| `tests/ocrSchemaAlignment.test.js` | 100 | Alinhamento schema OCR ↔ campos do formulário |
| `tests/rateLimit.test.js` | 61 | `api/_lib/rateLimit.js` |
| `tests/generate-document.test.js` (NOVO) | 190 | Formato da resposta; corrida por tiers (generoso/médio) vs fallback de reserva activa |
| `tests/deduct-credit.test.js` (NOVO) | 150 | Dedução, créditos insuficientes, optimistic locking, reembolso automático |
| `tests/process-payment.test.js` (NOVO) | 167 | Validação de telefone/pacote, detecção de carteira, duplicados, verificação automática de comprovativo |
| `tests/credit-expiry.test.js` (NOVO) | 104 | Cron de expiração por lote (v52), degradação segura |
| `tests/rag.test.js` (NOVO) | 107 | Motor Jurídico RAG (`legalSearch.js`): citação de fonte, limiar de similaridade, aviso de qualidade |
| `tests/notifyTelegram.test.js` (NOVO) | 60 | Alerta Telegram de pagamento em revisão (`notifyTelegram.js`) |
| **Total** | **≈ 1.059** | — |

CI automático via `.github/workflows/test.yml`, a correr em cada push/PR ao branch principal.

**Honestamente:** ~1.059 linhas de teste para ~11.650 linhas de código só em `api/` continua a ser
uma cobertura fina, mas cresceu de forma dirigida — as áreas de maior exposição financeira e
legal (geração de documentos, dedução/expiração de créditos, pagamentos, RAG jurídico) já têm
teste dedicado. Afiliados e o fluxo completo do Marketplace de Templates continuam sem teste
automatizado.

---

## 12. Dívida técnica e problemas conhecidos (honesto, sem filtro)

- **Plano Vercel Hobby** a processar pagamentos comerciais — não permitido pelos Termos da
  Vercel; sem margem de functions para crescer. Ver aviso no topo.
- **`schema.sql` central desactualizado** — a única fonte fiável do schema real é a cadeia
  completa de migrações; recomenda-se gerar `schema_CURRENT.sql` a partir do Supabase Dashboard.
- **Ficheiros de migração avulsos** (`EMERGENCIA_*`, `EXECUTAR_AGORA_*`, `migration_fix_*`,
  `migration_add_*`) aplicados directamente em produção, sem posição clara na cadeia numerada
  principal.
- **Duas migrações chamadas "v46"** coexistem no repositório por lapso de nomenclatura — não é a
  mesma migração corrida duas vezes, são dois ficheiros distintos; recomenda-se renomear um.
- **`migration_v31_marketing_purchase_attribution.sql`** foi assinalada em auditorias anteriores
  como possivelmente corrompida/vazia no export usado nessa altura — confirmar directamente no
  Supabase Dashboard se já foi aplicada antes de a tentar correr de novo.
- **Cobertura de testes mais robusta, mas ainda parcial** face ao volume de código (ver secção 11).
- ~~`bonus_credits_expiry_days` (v51) é guardado mas nunca aplicado~~ — **resolvido pela v52**
  (`credit_ledger`): créditos normais agora expiram por lote, 30 dias da aquisição de cada um.
- ~~`.github/workflows/test.yml` com erro de sintaxe~~ — **corrigido**: a linha "Instalar
  dependências" tinha "run:" duplicado (`run: run: npm install...`), o que fazia o passo falhar
  antes de correr qualquer teste; agora é `run: npm install --no-audit --no-fund`.
- ~~Ficheiros de teste duplicados dentro de `.github/workflows/`~~ — **corrigido**: removidas as
  8 cópias de `tests/*.test.js` que tinham ficado acidentalmente dentro da pasta de workflows;
  ficou lá só `test.yml`, que é o único ficheiro com função nesse local.
- **`api/_lib/parseMpesaSms.js` existe mas não está ligado a nenhuma rota** — ver nota na
  secção 8 (Confirmação por SMS real da Vodacom). Falta o despacho `?webhook=sms-mpesa` dentro de
  `api/process-payment.js`.
- **Gateway de pagamento automático (PaySuite/ClicPay) ainda não integrado no repositório** — foi
  desenhado e testado à parte (`paymentGateway.js`, adaptadores PaySuite/ClicPay, webhook PaySuite
  reaproveitando a lógica de `verifyReceiptInternal`), mas por decisão do autor ainda não foi
  merged; o fluxo de pagamento em produção continua 100% manual (comprovativo + verificação por
  IA de visão, secção 8). Quando for integrado, o webhook do PaySuite vai precisar de outro slot
  de function (Vercel Pro, ou o mesmo truque de despacho por query usado no SMS M-Pesa).
- **Templates visuais continuam em 70** (14 serviços × 5) apesar do número total de serviços já
  ter crescido para 18 — `transcricao` e `conversao` ainda não têm galeria de templates própria.

---

## 13. Conformidade legal (Moçambique)

Confirmado directamente em `legal.html`: a plataforma cita a **Lei n.º 3/2017, de 9 de Janeiro
(Lei das Transacções Electrónicas)** e reconhece explicitamente que **Moçambique ainda não tem
lei de protecção de dados pessoais autónoma em vigor** — existe uma proposta aprovada pelo
Conselho de Ministros em Março/2026, pendente de votação final na Assembleia da República.
Entretanto, adopta boas práticas alinhadas com essa proposta e com a Convenção de Malabo
(ratificada por Moçambique).

Nota fiscal (`legal.html`): desde 1 de Janeiro de 2026 (Lei n.º 9/2025, de 29 de Dezembro), o
ISPC deixou de ter taxa única de 3% — passou a taxas progressivas (3–20%), com permanência
máxima de 5 anos no regime e isenção quando o imposto apurado for inferior a 500 MT. O
enquadramento fiscal exacto desta plataforma ainda está a ser confirmado com um contabilista.

**Assinatura digital em canvas** não tem validade jurídica plena sem certificação nos termos da
Lei n.º 3/2017 — recomenda-se tornar isto explícito no momento em que o utilizador assina, não
apenas nos Termos de Serviço.

**Alinhamento marketing ↔ produto:** os materiais impressos (panfletos, cartazes) usam a
expressão "100% Legal" de forma mais absoluta do que a cautela que o próprio `legal.html`
demonstra. Recomenda-se suavizar essa linguagem no material impresso para reflectir a mesma
cautela.

---

## 14. Histórico de versões

O histórico detalhado ronda-a-ronda (v12 até v31) descrevia, ficheiro a ficheiro, cada correcção
desde Junho/2026. Esse histórico longo foi **retirado deste README** porque a versão anterior do
documento tinha ficado literalmente cortada a meio dessa secção, sem nunca chegar às rondas mais
recentes — o que causava mais confusão do que valor. Um resumo das rondas mais significativas:

| Ronda | Foco |
|---|---|
| v12 (Jun/2026) | Cliente Supabase via fetch puro; reembolso automático de créditos |
| v13–v16 | Correcções de bugs pós-auditoria (créditos de registo, templates comunitários) |
| v17–v24 | Motor Jurídico RAG; seed de 70 templates oficiais; RLS em `credit_packages` |
| v25 | Self-service de conta (`perfil.html`); vários bugs de produção corrigidos |
| v26 | Marketing Analytics (fundação); push notifications reais; bug crítico de `referred_by` corrigido |
| v27 | Finanças ("Valor Levantável"); templates sempre em créditos; limites de uso por documento; Kit de Marketing |
| v28–v29 | Sincronização do README; eliminação total do SDK `@supabase/supabase-js`/`ws` |
| v30–v31 | Auditoria de segurança dedicada; mascaragem de PII em duas camadas; LPD/consentimento; correcção do `temp_password` em texto simples |
| v32–v33 (mencionadas no cabeçalho da versão anterior deste documento, mas nunca documentadas em detalhe) | CSP hardening (remoção de handlers inline); correcção de 3 bugs de produção — não foi possível reconstruir o detalhe exacto a partir do ficheiro cortado; recomenda-se ao autor original completar esta linha manualmente se o detalhe ainda for relevante |
| v34–v47 (via migrações) | Marketing Analytics completo; Finanças com Identidade Fiscal; recibos de afiliados; avaliações públicas; anti-abuso; parceiros advogados |
| v48–v51 | Conformidade LPD (consentimento, direito ao esquecimento); protecção reforçada de dados sensíveis; recibos seguros; créditos bónus/promoções |
| v52 (código) | Corrida de IA por tiers com controlo de custo (generoso+médio por omissão, reserva activa só como fallback) e timeout de 9s por provider — corrige o esgotamento de quota e o custo por documento |
| v52–v56 (Ago/2026) | Expiração real de créditos por lote (`credit_ledger`); preview de templates "Oficiais" corrigido na origem (4 variantes de estilo sem `template_html`); templates aprovados que não apareciam na Galeria pública (`is_public` dessincronizado de `status`); venda de templates restrita a afiliados/parceiros aprovados (trigger na BD); tecto de 10 créditos em `credit_cost`, alinhado com o limite de qualquer operação cobrada |
| Correcções de código (Ago/2026, mesma ronda) | Preview de templates da comunidade com variáveis em minúsculas (`{{nome_completo}}`, `{{destinatario}}`...) deixava de preencher com dados fictícios e mostrava as chaves `{{...}}` literais — bug na regex de `fillTemplate()` (`SampleData.js`), que só reconhecia MAIÚSCULAS; corrigido, e reaproveitado no preview do admin (antes escrevia o HTML cru, sem preencher nada); formulário "Submeter Template" passou a mostrar o equivalente em MZN ao lado dos créditos (criador/plataforma), como o admin já mostrava; `TemplateLibrary.js` pedia a coluna `price_mzn` — removida da tabela pela v39 — o que fazia as duas queries de carregamento de templates do marketplace falharem sempre em silêncio (nenhum template do marketplace aparecia no selector "Escolher Modelo"); `notifyTelegram.js` ligado a `misc.js` para alertar o admin de pagamentos em revisão manual |

| Componente | Versão |
|---|---|
| `package.json` | `11.0.0` |
| `sw.js` (CACHE_VERSION) | auto-gerado a cada deploy (`v<sha-git-7-chars>-<YYYYMMDD>`) |
| Migrações Supabase | até `migration_v56_max_credit_cost_10.sql`, mais ficheiros avulsos não numerados |
| Serviços | 18 (16 com IA + 2 via WhatsApp) |
| Templates visuais integrados | 70 (14 serviços × 5) |
| Providers de IA — com adaptador (competem) / catalogados sem adaptador | 9 / 4 (13 no total) |
| Preço máximo de um template no Marketplace | 10 créditos (`migration_v56`) |
| Testes | 9 suites, ≈ 1.059 linhas |

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · [mzdocs.co.mz](https://mzdocs.co.mz)*
