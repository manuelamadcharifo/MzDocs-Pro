# MzDocs Pro — v12

Plataforma moçambicana de geração, edição e exportação de documentos profissionais com IA. PWA instalável, construída para o Vercel Hobby (limite: 12 functions), Supabase e M-Pesa.

> ⚠️ **Acção urgente — plano Vercel:** este projecto processa pagamentos (`api/process-payment.js`,
> tabela `transactions`). Os Termos de Serviço da Vercel definem **qualquer fluxo de cobrança a
> visitantes do site** como uso comercial, que **não é permitido no plano Hobby** — apenas no Pro
> (US$20/mês) ou Enterprise. Um projecto no plano errado pode ser suspenso sem aviso prévio.
> Recomenda-se a migração para o plano Pro **antes** de qualquer campanha de crescimento, independentemente
> do número de utilizadores. Ver análise completa e roteiro de escala em
> [`ROADMAP-ESCALA.md`](./ROADMAP-ESCALA.md).

---

## ✨ Funcionalidades Principais

| Funcionalidade | Descrição |
|---|---|
| **Geração com IA (5 providers)** | Corrida paralela entre Groq, Gemini, OpenRouter, Cerebras e NVIDIA NIM — o primeiro a responder "ganha", garantindo alta disponibilidade a custo zero |
| **70 Templates Visuais** | 5 templates por serviço, com CSS próprio e layout profissional |
| **Editor WYSIWYG** | Edição inline com preservação fiel do template (iframe + designMode) |
| **Export PDF** | Abre janela de impressão com cores e backgrounds preservados (`print-color-adjust: exact`) |
| **Export Word (.docx)** | Exportação real para OOXML via biblioteca `docx`, e `.doc` via `HTMLWordExporter` para templates HTML |
| **Export Excel** | Tabelas e orçamentos exportados como `.xls` |
| **Assinatura Digital** | Canvas de assinatura inserido directamente no documento |
| **Módulo Académico APA 7** | Citações, bibliography, TOC automático, upload PDF/URL |
| **Extracção de Template por Imagem** | IA de visão extrai estrutura de qualquer imagem de documento |
| **OCR** | Extracção de texto de imagens, PDF (pdf.js) e Word (mammoth.js) |
| **Histórico Offline** | Documentos guardados em IndexedDB, sincronizados quando online |
| **Pagamento Manual Multi-Carteira** | M-Pesa, e-Mola ou mKesh via WhatsApp — confirmação manual em até 24h (ver secção [💳 Pagamentos](#-pagamentos)) |
| **Reembolso Automático de Créditos** | Se a geração de IA falhar após o débito do crédito, o crédito é devolvido automaticamente (RPC `refund_credit`) |
| **Sistema de Afiliados** | Comissões automáticas, levantamento via carteira móvel |
| **Rede de Parceiros** | Papelarias/cyber cafés parceiros listados perto do utilizador (`parceiros.html`) |
| **Blog / SEO** | CMS de artigos com geração assistida por IA (`blog_posts`, `blog_categories`) |
| **Painel Admin** | Analytics em tempo real, feedback, utilizadores, pagamentos, parceiros |
| **PWA** | Instalável em Android e iOS, funciona offline |

---

## 🗂️ Estrutura do Projecto

```
MzDocs-Pro/
├── api/                               # 12 Serverless Functions (Vercel Hobby — limite 12, sem margem)
│   ├── _lib/
│   │   └── supabaseAdmin.js           # NOVO (v12): cliente Supabase via fetch puro (REST + Auth API),
│   │                                  #   sem @supabase/supabase-js nem 'ws'. Não conta como function
│   │                                  #   (prefixo "_"). Todas as funções abaixo devem usar este módulo.
│   ├── admin/
│   │   └── index.js                   # Dashboard, analytics, feedback, pagamentos,
│   │                                  #   blog/páginas estáticas + gerador de artigos com IA
│   │                                  #   (tudo num único ficheiro — conta como 1 das 12 functions)
│   ├── auth/
│   │   └── index.js                   # Login, registo, reset password
│   ├── generate-document.js           # Geração de documentos — 5 providers de IA + reembolso automático (v12)
│   ├── extract-template.js            # Extracção de template via imagem (IA visão)
│   ├── verify-credits.js              # Verificar saldo de créditos
│   ├── deduct-credit.js               # Debitar/reembolsar crédito (v3.0 — fetch puro, sem 'ws')
│   ├── process-payment.js             # Pagamento manual multi-carteira + registo de transação (v3.0)
│   ├── partners.js                    # API da Rede de Parceiros (parceiros.html / admin-parceiros.html)
│   ├── convert.js                     # Conversão de ficheiros (OCR / extracção de texto)
│   ├── delete-temp-account.js         # Limpeza de contas temporárias
│   ├── cleanup-temp-accounts.js       # Cron diário: limpeza automática
│   └── misc.js                        # Router auxiliar:
│                                      #   /api/config · /api/ocr-analyze
│                                      #   /api/page-view · sitemap.xml
│                                      #   /api/affiliate/* · /api/templates/*
│                                      #   /api/admin/stats · /api/admin/pages
│
├── assets/
│   ├── js/
│   │   ├── academic/
│   │   │   ├── AcademicEngine.js      # APA 7: citações, bibliography, TOC, PDF/URL
│   │   │   └── AcademicUI.js          # Painel de referências + upload PDF/URL
│   │   ├── marketplace/
│   │   │   ├── TemplateLibrary.js     # 15 serviços × 5 templates = 70 templates
│   │   │   └── TemplatePicker.js      # Modal de escolha com preview em tempo real
│   │   ├── partners/
│   │   │   └── NearbyPartners.js      # Lista/mapa de parceiros próximos do utilizador
│   │   ├── admin/
│   │   │   └── AdminApp.js            # Painel admin completo
│   │   ├── auth/
│   │   │   └── AuthManager.js         # Autenticação Supabase
│   │   ├── components/
│   │   │   ├── DocumentEditor.js      # Editor WYSIWYG + iframe designMode p/ templates
│   │   │   ├── HTMLPDFExporter.js     # PDF via impressão (preserva cores de fundo)
│   │   │   ├── HTMLWordExporter.js    # Word: converte flexbox → tabelas, preserva cores
│   │   │   ├── HTMLToDocxExporter.js  # Word real (.docx / OOXML) via biblioteca `docx`
│   │   │   ├── WordExporter.js        # Word para documentos sem template HTML
│   │   │   ├── PDFExporter.js         # PDF via jsPDF (documentos sem template)
│   │   │   ├── ExcelExporter.js       # Export Excel (.xls)
│   │   │   └── SignatureCanvas.js     # Canvas de assinatura digital
│   │   ├── controllers/
│   │   │   ├── DocumentController.js  # Orquestra geração + editor + templates + export
│   │   │   ├── TemplateController.js  # Gestão de templates do marketplace
│   │   │   ├── HistoryController.js   # Histórico de documentos (IndexedDB)
│   │   │   ├── OCRController.js       # OCR via IA
│   │   │   └── PaymentController.js   # Fluxo de pagamento manual multi-carteira
│   │   ├── models/
│   │   ├── services/
│   │   │   ├── ServiceDefinitions.js  # Definições dos 15 serviços
│   │   │   └── PaymentService.js      # Pacotes, validação de telefone, WhatsApp
│   │   ├── utils/
│   │   │   ├── Sanitizer.js           # Sanitização HTML (inclui tags semânticas HTML5)
│   │   │   ├── Storage.js             # Abstracção de localStorage
│   │   │   ├── IndexedDB.js           # Persistência offline de documentos
│   │   │   ├── Formatter.js           # Formatação de texto / moeda / validação de telefone
│   │   │   └── ExportManager.js       # Coordenação de exportações
│   │   └── views/
│   │       └── Views.js               # Renderização de resultados + preview iframe
│   └── css/
│       ├── editor.css                 # Estilos do editor WYSIWYG
│       └── ...
│
├── supabase/
│   ├── schema.sql                     # Schema base (⚠️ desactualizado — ver "Áreas não cobertas")
│   ├── migration_v8_1_blog_pages.sql
│   ├── migration_v8_2_admin_tables.sql
│   ├── migration_v8_pricing_temp_accounts.sql
│   ├── migration_v9_analytics_feedback.sql
│   ├── migration_v10_affiliates.sql
│   ├── migration_v10_online_userid.sql
│   ├── migration_v11_marketplace.sql
│   ├── supabase-partners-setup.sql    # Tabela `partners` (Rede de Parceiros)
│   └── migration_v12_refund_credit.sql # NOVO (v12): RPC refund_credit + índice em credit_logs
│
├── afiliado.html                      # Painel de afiliados
├── admin.html                         # Painel administrativo
├── admin-parceiros.html               # Gestão da Rede de Parceiros (admin)
├── parceiros.html                     # Listagem pública de parceiros
├── index.html                         # App principal (PWA)
├── offline.html                       # Página offline
├── sw.js                              # Service Worker (cache v11)
├── manifest.json                      # PWA manifest
├── vercel.json                        # 12 functions + rewrites + crons
└── package.json                       # v11.0.0
```

---

## 🚀 Deploy

### 1. Pré-requisitos
- Conta Vercel Hobby
- Projecto Supabase
- Conta OpenRouter (API key) — modelos gratuitos disponíveis
- Conta Google AI Studio (Gemini API key) — opcional, usado como primário
- Conta M-Pesa API (para pagamentos em Moçambique)

### 2. Variáveis de Ambiente (Vercel)

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
GEMINI_API_KEY=AIza...
MPESA_API_KEY=...
MPESA_PUBLIC_KEY=...
MPESA_SERVICE_PROVIDER_CODE=...
SITE_URL=https://mzdocs.co.mz
ADMIN_EMAILS=email@exemplo.com
```

### 3. Migrações Supabase
Execute por ordem no SQL Editor do Supabase:

```sql
-- 1. Schema base
schema.sql

-- 2. Blog e páginas admin
migration_v8_1_blog_pages.sql
migration_v8_2_admin_tables.sql

-- 3. Planos e contas temporárias
migration_v8_pricing_temp_accounts.sql

-- 4. Analytics e feedback
migration_v9_analytics_feedback.sql

-- 5. Sistema de afiliados
migration_v10_affiliates.sql

-- 6. Online sessions com user_id + Realtime
migration_v10_online_userid.sql

-- 7. Template Marketplace
migration_v11_marketplace.sql

-- 8. Rede de Parceiros
supabase-partners-setup.sql

-- 9. Reembolso automático de créditos (NOVO v12 — auditoria Junho/2026)
migration_v12_refund_credit.sql
```

> ⚠️ **Nota (auditoria v12):** esta lista não está garantidamente completa nem na ordem 100% correcta —
> existem ~10 ficheiros adicionais (`migration_fix_*`, `migration_add_*`, `migration_temp_accounts.sql`,
> `EMERGENCIA_*`, `EXECUTAR_AGORA_*`, `polices.sql`, `transactions.sql`) que foram aplicados directamente
> em produção ao longo do tempo. Ver secção [⚠️ Áreas não cobertas por esta auditoria](#-áreas-não-cobertas-por-esta-auditoria).

### 4. Push para GitHub → Vercel faz deploy automático

---

## 🎨 Template Engine

### Fluxo completo:
```
Seleccionar Serviço → Preencher Formulário → Gerar com IA
  → [Escolher Modelo] → Preview em tempo real
    → [Preview / Editar / Download PDF / Word / Excel / Assinar]
```

### 70 Templates prontos (5 por serviço):

| Serviço | Chave | Templates |
|---------|-------|-----------|
| Trabalho Escolar / Académico | `trabalho` | académico, moderno, UEM, técnico, criativo |
| Currículo (CV) | `cv` | clássico, moderno, executivo, jovem, académia |
| Carta Formal | `carta` | clássica, corporativa, ministerial, moderna, candidatura |
| Orçamento de Obra | `orcamento` | profissional, simples, construtora, engenharia, M-Pesa |
| Contrato de Arrendamento | `arrendamento` | legal, moderno, comercial, simplificado, bilíngue |
| Contrato Prestação de Serviços | `prestacao` | jurídico, freelancer, empresa, construção, TI |
| Procuração / Mandato | `procuracao` | notarial, bancária, geral, imóvel, judicial |
| Requerimento Oficial | `requerimento` | formal, escola, saúde, migração, finanças |
| Declaração de Residência | `residencia` | junta, formal, auto, empresa, bilhetão |
| Plano de Negócios | `planonegocio` | banco, startup, ONG, agricultura, executivo |
| Recibo / Factura | `recibo` | simples, factura, loja, pro-forma, serviço |
| Carta de Recomendação | `recomendacao` | emprego, académica, institucional, pessoal, bolsa |
| Pedido de Licença | `licenca` | comercial, construção, evento, transporte, ambiental |
| Acta de Reunião | `acta` | formal, associação, empresarial, condomínio, escolar |

**Total: 70 templates integrados + marketplace extensível**

### Adicionar novo template:
```js
// Em assets/js/marketplace/TemplateLibrary.js
// Adicionar ao array do serviço pretendido:
TEMPLATE_LIBRARY.cv.push({
  id: 'cv-novo',
  name: 'Meu Template',
  description: 'Descrição curta',
  preview: {
    accent: '#3B82F6', bg: '#fff',
    font: 'sans-serif', headerBg: '#3B82F6', headerColor: '#fff'
  },
  css: `
    .cv-page { font-family: Arial; ... }
    .cv-sidebar { background: #1E3A5F; color: #fff; }
  `,
  // Opcional: layout HTML estruturado para 2 colunas, sidebar, etc.
  htmlTemplate: `
    <div class="cv-page cv-two-col">
      <aside class="cv-sidebar">...</aside>
      <main class="cv-main">...</main>
    </div>
  `,
});
```

---

## 📝 Editor de Documentos

O `DocumentEditor` abre um modal completo após a geração:

### Modos de edição:
- **Preview** — iframe A4 fiel ao template (PDF/Word/Excel)
- **Editar** — para documentos markdown: editor WYSIWYG com toolbar rica; para templates HTML com layout estruturado: iframe com `designMode='on'` que preserva cores, colunas e tipografia

### Toolbar disponível:
Fonte · Tamanho · **B** · *I* · U · S · Alinhamentos · Lista · Lista numerada · Recuo · Parágrafo/Título · Cor de texto · Fundo · Tabela · HR · Undo/Redo

### Export no editor:
| Formato | Motor | Fidelidade |
|---------|-------|-----------|
| PDF | `HTMLPDFExporter` (impressão) | Cores de fundo preservadas (`print-color-adjust: exact`) |
| Word (.doc) | `HTMLWordExporter` | Flexbox → tabelas Word, `bgcolor` e `mso-shading` |
| Excel | `ExcelExporter` | Tabelas e orçamentos |

---

## 📚 Módulo Académico (APA 7)

### API disponível:
```js
import { AcademicEngine } from './assets/js/academic/AcademicEngine.js';

// Referência APA 7 completa
AcademicEngine.generateAPA7({
  type: 'book',
  authors: [{ last: 'Mondlane', first: 'Eduardo' }],
  year: '1969',
  title: 'Lutar por Moçambique',
  publisher: 'Nosso Tempo'
});
// → Mondlane, E. (1969). *Lutar por Moçambique*. Nosso Tempo.

// Citação in-text
AcademicEngine.generateCitation({ authors: [{ last: 'Mondlane' }], year: '1969' }, '45');
// → (Mondlane, 1969, p. 45)

// Extrair referências de texto PDF
AcademicEngine.extractReferencesFromPDF(pdfText);

// Extrair referência de URL
AcademicEngine.extractReferencesFromURL('https://exemplo.com', { title: 'Artigo' });

// Gerar trabalho científico (prompt para IA)
AcademicEngine.generateScientificPaper(
  { tema: '...', nivel: 'Licenciatura', disciplina: '...', paginas: 15 },
  sources
);

// Índice automático
AcademicEngine.generateTableOfContents(markdownContent);

// Secção de referências
AcademicEngine.generateBibliography(sources);
```

---

## 🖼️ Extracção de Template por Imagem

O endpoint `POST /api/extract-template` aceita uma imagem (base64) e usa IA de visão (Gemini 2.5 Flash → OpenRouter fallback) para extrair a estrutura do documento e devolver um template `{ css, htmlTemplate }` pronto a usar.

```js
// No cliente:
const result = await fetch('/api/extract-template', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64: '...', mimeType: 'image/jpeg' })
});
const { css, htmlTemplate } = await result.json();
```

---

## 🏪 Template Marketplace (API)

| Endpoint | Método | Auth | Descrição |
|----------|--------|------|-----------|
| `GET /api/templates/list?service=cv` | GET | Público | Listar templates aprovados |
| `POST /api/templates/submit` | POST | Token | Submeter novo template |
| `POST /api/templates/rate` | POST | Token | Avaliar (1–5 estrelas) |
| `POST /api/templates/download` | POST | Público | Registar download |
| `GET /api/templates/pending` | GET | Admin | Templates pendentes |
| `POST /api/templates/approve` | POST | Admin | Aprovar template |
| `POST /api/templates/reject` | POST | Admin | Rejeitar template |

### Workflow de aprovação:
```
Utilizador submete → status: "pending"
Admin aprova       → status: "approved" + is_public: true → aparece no picker
Admin rejeita      → status: "rejected" + nota de rejeição
```

---

## 📊 Analytics em Tempo Real

- **Online Agora**: Supabase Realtime (`postgres_changes` em `online_sessions`)
- **Visitas**: POST automático a cada carregamento + heartbeat a cada 90s
- **Session ID**: `localStorage` para persistência entre recargas
- **Fallback**: Polling a cada 20s se WebSocket falhar

---

## 🤝 Sistema de Afiliados

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/affiliate/register` | Pedir código de afiliado |
| `GET /api/affiliate/dashboard` | Painel com ganhos e cliques |
| `POST /api/affiliate/click` | Registar clique (deduplicado por hash de IP) |
| `POST /api/affiliate/withdraw` | Pedir levantamento M-Pesa |
| `GET /api/affiliate/check?ref=` | Validar link publicamente |

**Comissões**: Avulso 10% · Starter 15% · Pro / Empresa 20%

---

## ⚙️ Limites Vercel Hobby

> ⚠️ Ver aviso sobre uso comercial no topo deste documento — este projecto processa pagamentos,
> o que tecnicamente exige o plano Pro. As linhas abaixo descrevem os limites técnicos do Hobby
> tal como o código foi desenhado para respeitar (12 functions), mas isso não substitui a
> necessidade de migrar o plano por razões contratuais.

| Recurso | Limite | Usado |
|---------|--------|-------|
| Serverless Functions | 12 | **12** ✅ (sem margem — `api/_lib/` não conta, prefixo `_`) |
| `generate-document.js` | 60s | — |
| `extract-template.js` | 60s | — |
| `process-payment.js` | 30s | — |
| Restantes | 10–30s | — |
| Bandwidth | 100 GB/mês | — |

> **Regra:** Toda nova lógica de API deve ser adicionada a `api/misc.js` ou a functions existentes. Não criar novos ficheiros `.js` em `api/` sem verificar o limite de 12. Helpers partilhados (sem `module.exports = async function handler`) devem ir em `api/_lib/`.

---

## 📱 PWA

- Service Worker com cache estratégico (`CACHE_VERSION` actualizada automaticamente a cada deploy por `scripts/inject-version.js`, ex.: `v12-20260531`)
- Funciona offline — documentos pendentes sincronizam quando a internet volta
- Instalável em Android e iOS (atalhos para CV, Carta, Trabalho, Orçamento)
- Background sync para documentos gerados offline

---

## 🔒 Segurança

- RLS activado em todas as tabelas Supabase
- Tokens JWT validados em todos os endpoints privados via `api/_lib/supabaseAdmin.js` (REST/Auth API, sem SDK)
- IPs hasheados (SHA-256) para tracking de cliques — sem dados pessoais
- `sanitizeHtml()` com lista explícita de tags permitidas (inclui tags semânticas HTML5)
- Service Role Key nunca exposta ao cliente
- Erros internos do Supabase (mensagens, códigos, hints) nunca devolvidos ao cliente — apenas em logs do servidor
- Contas temporárias limpas automaticamente via cron diário

---

## 💳 Pagamentos

O pagamento de pacotes de créditos é **sempre processado manualmente**, via WhatsApp:

1. O utilizador escolhe um pacote e introduz **qualquer número de telemóvel moçambicano válido**
   (M-Pesa/Vodacom, e-Mola/Movitel ou mKesh/mCel — prefixos `82–87`).
2. `api/process-payment.js` regista o pedido em `transactions` (status `pending`) e gera uma
   referência única (`MZ-...`).
3. O utilizador é encaminhado para o WhatsApp com uma mensagem pré-formatada (inclui a referência,
   o pacote, o valor e a carteira detectada pelo prefixo do número) e envia o comprovativo.
4. Um administrador confirma manualmente no painel `admin.html`, normalmente em até 24h.

> Não existe (ainda) integração automática com a API M-Pesa. A interface deixa isto explícito
> ("Pagamento processado manualmente") para não criar a expectativa de um pedido push automático
> no telemóvel — ver changelog v12 abaixo.

### Reembolso automático de créditos (v12)

Antes da v12, se `/api/deduct-credit` debitasse um crédito e a geração de IA falhasse
completamente a seguir (todos os 5 providers indisponíveis), **o crédito era perdido sem
qualquer compensação** — o pior cenário possível para um novo utilizador a usar o seu único
crédito grátis.

Agora:
1. `api/generate-document.js` chama a RPC `refund_credit(p_user_id, p_amount)` automaticamente
   quando `Promise.any` rejeita (todos os providers falharam).
2. A RPC incrementa `profiles.credits` e regista a operação em `credit_logs` com
   `action = 'refund'`.
3. O cliente recebe `{ refunded: true, creditsRemaining }` e mostra uma notificação clara:
   *"O crédito foi devolvido automaticamente — tente novamente."*
4. `api/deduct-credit.js` também aceita `{ refund: true, cost, documentType }` como modo de
   reembolso de reserva (caso a RPC não exista ainda — fallback manual).

**Acção necessária:** executar `supabase/migration_v12_refund_credit.sql` no SQL Editor do
Supabase para criar a função `refund_credit`.

---

## 🛠️ Alterações — Auditoria Junho 2026 (v12)

| Ficheiro | Alteração |
|---|---|
| `api/_lib/supabaseAdmin.js` | **Novo.** Cliente Supabase via fetch puro (REST + Auth API), sem SDK/`ws`. |
| `api/deduct-credit.js` | Reescrito (v3.0) para usar `_lib/supabaseAdmin.js`; novo modo `refund`. |
| `api/generate-document.js` | Removido `require('ws')`; reembolso automático em falha total dos providers. |
| `api/process-payment.js` | Reescrito (v3.0); erros do Supabase já não são expostos ao cliente; aceita M-Pesa/e-Mola/mKesh. |
| `assets/js/services/Services.js` | Envia `cost` a `/api/generate-document`; propaga `refunded`/`creditsRemaining` em erro. |
| `assets/js/controllers/DocumentController.js` | Trata `err.refunded` — actualiza saldo local e avisa o utilizador. |
| `assets/js/utils/Formatter.js`, `PaymentService.js` | `validatePhone` aceita `8[2-7]` (todos os operadores); novo `detectWallet()`. |
| `assets/js/controllers/PaymentController.js` | Texto "Recebedor M-Pesa" → "Recebedor (M-Pesa / e-Mola / mKesh)"; subtítulos clarificam pagamento manual. |
| `index.html` | `viewport` deixa de bloquear zoom (`maximum-scale=1.0` removido); secção de pagamento reescrita para "Pagamento por Carteira Móvel" com aviso explícito de processo manual. |
| `supabase/migration_v12_refund_credit.sql` | **Novo.** RPC `refund_credit` + índice em `credit_logs`. |

---

## ⚠️ Áreas Não Cobertas por Esta Auditoria

Esta ronda focou-se no fluxo crítico **crédito → geração de documento → pagamento**. As áreas
abaixo **não foram revistas** e podem precisar de atenção numa próxima ronda:

- **Outras 8 funções de API ainda usam `@supabase/supabase-js` + `require('ws')`**
  (`api/admin/index.js`, `api/auth/index.js`, `api/verify-credits.js`, `api/misc.js`,
  `api/partners.js`, `api/delete-temp-account.js`, `api/cleanup-temp-accounts.js`,
  `api/convert.js`/`api/extract-template.js`). Recomenda-se migrar gradualmente cada uma para
  `api/_lib/supabaseAdmin.js`, seguindo o padrão usado em `deduct-credit.js` e
  `process-payment.js`.
- **Rede de Parceiros** (`api/partners.js`, `parceiros.html`, `admin-parceiros.html`,
  `assets/js/partners/NearbyPartners.js`, `supabase/supabase-partners-setup.sql`) — fluxo de
  cadastro/aprovação de parceiros, geolocalização e exibição no mapa não foram testados.
- **Blog / CMS** (`api/admin/pages.js`, tabelas `blog_pages`, `blog_posts`, `blog_categories`) —
  geração de artigos por IA, SEO score e fluxo de publicação não foram revistos.
- **Painel Admin completo** (`admin.html`, `AdminApp.js`) — gestão de utilizadores, confirmação
  manual de pagamentos, analytics (`analytics_metrics`, `page_views`, `online_sessions`),
  feedback (`user_feedback`) e logs (`admin_logs`).
- **Sistema de Afiliados** (`afiliado.html`, `affiliate_clicks`, `affiliate_commissions`,
  `affiliate_withdrawals`) — apenas a integridade da dedução/reembolso de créditos foi
  verificada; o cálculo de comissões e levantamentos não foi auditado.
- **Consolidação do schema SQL** — a pasta `supabase/` tem 21 ficheiros (`EMERGENCIA_*`,
  `EXECUTAR_AGORA_*`, `migration_fix_*`, `migration_add_*`, etc.). Recomenda-se gerar um
  `schema_v12_CURRENT.sql` a partir do estado real da base de dados (Dashboard → Database →
  Schema) e arquivar os ficheiros antigos.
- **Sistema de templates personalizados** (`templates_custom`, `template_ratings`,
  `template_downloads`) e **contas temporárias/avulso** (`is_temp`, `temp_ref`,
  `temp_password`) — lógica de expiração e limpeza não foi revista nesta ronda.

---

## 📦 Versões

| Componente | Versão |
|------------|--------|
| `package.json` | `11.0.0` |
| `sw.js` (CACHE_VERSION) | `v12-20260531` (auto-actualizado pelo build) |
| `README.md` | `v12` |
| `api/deduct-credit.js` | `v3.0` |
| `api/generate-document.js` | `v2.0` |
| `api/process-payment.js` | `v3.0` |
| Migrações Supabase | até `v12_refund_credit` (+ migrações soltas, ver secção de áreas não cobertas) |
| Templates | 70 (15 serviços × 5) |

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · [mzdocs.co.mz](https://mzdocs.co.mz)*
