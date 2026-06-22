# MzDocs Pro — v16

Plataforma moçambicana de geração, edição e exportação de documentos profissionais com IA. PWA instalável, construída para o Vercel Hobby (limite: 12 functions), Supabase e pagamento manual por carteira móvel.

> 📌 **Nota de versão:** este documento foi actualizado para reflectir o estado real do código até à
> migração `migration_v16_fix_signup_name_phone.sql` (Junho/2026). A secção
> [🛠️ Alterações — Auditoria Junho 2026 (v12)](#️-alterações--auditoria-junho-2026-v12) abaixo é mantida
> como registo histórico dessa ronda específica; as alterações posteriores (v13–v16) estão descritas em
> [🛠️ Alterações — v13 a v16](#️-alterações--v13-a-v16-pós-auditoria).

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
| **Pagamento Manual Multi-Carteira** | M-Pesa, e-Mola ou mKesh — upload do comprovativo com **verificação automática por IA visão** (aprovação imediata se confiança ≥ 85%) e fallback para WhatsApp/revisão manual em até 24h (ver secção [💳 Pagamentos](#-pagamentos)) |
| **Reembolso Automático de Créditos** | Se a geração de IA falhar após o débito do crédito, o crédito é devolvido automaticamente (RPC `refund_credit`) |
| **Marketplace de Templates da Comunidade** | Utilizadores submetem, avaliam (1–5★) e descarregam templates de outros utilizadores, com aprovação pelo admin (ver [🏪 Template Marketplace](#-template-marketplace-api)) |
| **Sistema de Afiliados Pro** | Comissões automáticas por pacote, segmentação (papelaria/cyber/universidade/explicação/digitador), níveis (bronze→diamante), metas mensais e detecção de fraude |
| **Rede de Parceiros** | Papelarias/cyber cafés parceiros listados perto do utilizador (`parceiros.html`) |
| **Blog / SEO** | CMS de artigos com geração assistida por IA (`blog_posts`, `blog_categories`) |
| **Publicação Automática de Páginas SEO** | O admin pode publicar uma página estática directamente no repositório GitHub via API (commit automático em `pages/<slug>/index.html`) |
| **Painel Admin** | Analytics em tempo real, feedback, utilizadores, pagamentos, parceiros |
| **PWA** | Instalável em Android e iOS, funciona offline |

---

## 🗂️ Estrutura do Projecto

```
MzDocs-Pro/
├── api/                               # 12 Serverless Functions (Vercel Hobby — limite 12, sem margem)
│   ├── _lib/
│   │   ├── supabaseAdmin.js           # Cliente Supabase via fetch puro (REST + Auth API),
│   │   │                              #   sem @supabase/supabase-js nem 'ws'. Não conta como function
│   │   │                              #   (prefixo "_"). A maioria das functions usa este módulo
│   │   │                              #   (ver estado real da migração em "Áreas não cobertas").
│   │   └── visionAI.js                # NOVO: helper de IA visão (Gemini → OpenRouter fallback),
│   │                                  #   partilhado entre extract-template.js e misc.js (verify-receipt)
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
│                                      #   /api/config · /api/ocr-analyze · /api/verify-receipt
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
│   │   │   ├── TemplateLibrary.js     # Agrega os templates de 14 serviços (5 cada = 70) a partir de ./templates/*.js
│   │   │   ├── templates/             # 1 ficheiro por categoria (cv.js, carta.js, acta.js, ...) + index.js agregador
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
│   │   │   ├── ServiceDefinitions.js  # Definições dos 17 serviços (14 com templates visuais + 3 sem
│   │   │   │                         #   templates/IA — impressao, foto, conversao — usam WhatsApp)
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
│   ├── migration_v12_refund_credit.sql       # RPC refund_credit + tabela/índice credit_logs
│   │                                          #   ⚠️ RECONSTRUÍDO nesta ronda — ver nota no topo do ficheiro
│   ├── migration_v12_community_templates.sql # Marketplace comunitário (template_type, featured, share_token...)
│   ├── migration_v13_fix_signup_credits.sql  # Corrige bónus de registo: 1 crédito (não 3), válido 30 dias
│   ├── migration_v14_affiliates_pro.sql      # Afiliados Pro: segmentação, níveis, metas, anti-fraude
│   ├── migration_v15_receipt_verification.sql # Colunas de verificação automática em `transactions`
│   └── migration_v16_fix_signup_name_phone.sql # Corrige perfis criados sem nome/telefone
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
- Pelo menos uma conta de IA (quanto mais, maior a disponibilidade — ver [Geração com IA](#-funcionalidades-principais)):
  Groq, Google AI Studio (Gemini), OpenRouter, Cerebras e/ou NVIDIA NIM — todas têm tier gratuito
- ~~Conta M-Pesa API~~ — **não é necessária.** Não existe integração automática com a API M-Pesa (ver
  secção [💳 Pagamentos](#-pagamentos)); os pagamentos são confirmados manualmente ou por upload de
  comprovativo com verificação por IA. `MPESA_API_KEY`/`MPESA_SERVICE_CODE` são opcionais e servem apenas
  para a interface mostrar "modo sandbox" quando ausentes.
- Opcional: conta CloudConvert (conversão de ficheiros), Upstash Redis (rate-limit persistente),
  Personal Access Token do GitHub (publicação automática de páginas SEO)

### 2. Variáveis de Ambiente (Vercel)

```
# Obrigatórias
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# IA — pelo menos 1 chave é obrigatória; quantas mais, maior a disponibilidade
# (os 5 providers correm em paralelo, ver "Geração com IA" acima)
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
CEREBRAS_API_KEY=csk-...
NVIDIA_API_KEY=nvapi-...

SITE_URL=https://mzdocs.co.mz

# Opcionais
MPESA_API_KEY=...                  # usado apenas para detectar modo sandbox/produção (ver secção Pagamentos)
MPESA_SERVICE_CODE=...             # ⚠️ nome real usado no código — não "MPESA_SERVICE_PROVIDER_CODE"
WA_SUPPORT_NUMBER=258858695506     # número de WhatsApp do fallback de suporte (tem este valor por defeito)
CLOUDCONVERT_API_KEY=...           # necessário para api/convert.js (conversão de ficheiros) em modo cloud
LIBREOFFICE=false                  # true apenas em VPS própria com LibreOffice instalado (não aplicável no Vercel)
CRON_SECRET=...                    # protege /api/cleanup-temp-accounts contra invocação externa
UPSTASH_REDIS_REST_URL=...         # rate-limit persistente entre instâncias (sem isto, cai num Map local por instância)
UPSTASH_REDIS_REST_TOKEN=...
GITHUB_OWNER=...                   # publicação automática de páginas SEO — ver secção dedicada abaixo
GITHUB_REPO=...
GITHUB_TOKEN=...
```

> ⚠️ **Variáveis desactualizadas removidas desta lista:** `ADMIN_EMAILS` e `MPESA_PUBLIC_KEY` apareciam
> aqui em versões anteriores deste README mas **não são lidas em nenhum ficheiro do código** — não têm
> efeito nenhum se definidas. O estado de administrador é controlado pela coluna `profiles.is_admin`
> (ver `supabase/EXECUTAR_promote_admin.sql`), não por uma lista de emails em variável de ambiente.

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

-- 9. Reembolso automático de créditos + tabela credit_logs
--    (⚠️ ficheiro reconstruído nesta ronda — não existia no repositório, ver nota no topo do ficheiro)
migration_v12_refund_credit.sql

-- 10. Marketplace comunitário de templates (submissão, avaliação, destaque, partilha)
migration_v12_community_templates.sql

-- 11. Corrige bónus de registo para 1 crédito / 30 dias (substitui qualquer versão anterior do trigger)
migration_v13_fix_signup_credits.sql

-- 12. Sistema de Afiliados Pro (segmentação, níveis, metas, anti-fraude)
migration_v14_affiliates_pro.sql

-- 13. Verificação automática de comprovativos (colunas novas em `transactions`)
migration_v15_receipt_verification.sql

-- 14. Corrige perfis criados sem nome/telefone (substitui o trigger da migração 11)
migration_v16_fix_signup_name_phone.sql
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

**Total: 70 templates integrados (14 serviços × 5) + marketplace extensível.**

> Existem **17 serviços** ao todo — os 14 acima têm templates visuais e geração por IA; mais 3
> (`impressao`, `foto`, `conversao`) não geram documento por IA nem têm template — são pedidos
> encaminhados directamente por WhatsApp (ver `ServiceDefinitions.js`).
>
> Desde a reorganização do código, cada categoria vive no seu próprio ficheiro em
> `assets/js/marketplace/templates/<categoria>.js` (ex.: `cv.js`, `carta.js`), agregados por
> `templates/index.js`. `TemplateLibrary.js` apenas reexporta esse agregado — nenhum template foi
> alterado na reorganização.

### Adicionar novo template:
```js
// Em assets/js/marketplace/templates/cv.js
// Adicionar ao array TEMPLATES exportado por esse ficheiro
// (NÃO editar TEMPLATE_LIBRARY directamente em TemplateLibrary.js — esse
// ficheiro hoje apenas reexporta o agregado de templates/index.js):
export const TEMPLATES = [
  // ...templates existentes...
  {
    id: 'cv-novo',
    name: 'Meu Template',
    description: 'Descrição curta',
    preview: {
      accent: '#3B82F6', bg: '#fff',
      font: 'sans-serif', headerBg: '#3B82F6', headerColor: '#fff'
    },
    // Opcional: layout HTML estruturado para 2 colunas, sidebar, etc.
    htmlTemplate: `
      <div class="cv-page cv-two-col">
        <aside class="cv-sidebar">...</aside>
        <main class="cv-main">...</main>
      </div>
    `,
  },
];
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

> ⚠️ **Schema à frente do código:** `migration_v12_community_templates.sql` acrescenta colunas
> (`template_type`, `is_featured`, `credit_cost`, `share_token`, `tags`, `use_count`, `version`...) e
> a tabela `template_uses` a `templates_custom`, mas **nenhum ficheiro em `api/` ou `assets/js/` lê ou
> escreve estas colunas ainda** — a API e a UI de marketplace continuam a usar apenas os campos da
> migração v11 (`status`, `is_public`, `downloads`, `likes`, `rating_sum`, `rating_count`). Em termos
> práticos, isto significa que executar a migração v12 é seguro (não quebra nada), mas não activa
> sozinha nenhuma funcionalidade nova visível — falta o trabalho de API/frontend para expor
> templates premium/destacados/partilháveis por link.

---

## 📊 Analytics em Tempo Real

- **Online Agora**: Supabase Realtime (`postgres_changes` em `online_sessions`)
- **Visitas**: POST automático a cada carregamento + heartbeat a cada 90s
- **Session ID**: `localStorage` para persistência entre recargas
- **Fallback**: Polling a cada 20s se WebSocket falhar

---

## 📰 Blog / CMS + Publicação Automática de Páginas SEO

O admin (`admin.html`) tem um CMS de artigos (tabela `blog_pages`) com geração de conteúdo assistida
por IA. Esta secção documenta uma funcionalidade que **não tinha nenhuma menção neste README**:

Quando uma página de `blog_pages` é criada/actualizada com `published: true`, `api/admin/index.js`
(função `_generateStaticPage`) **gera um HTML estático e publica-o directamente no repositório
GitHub** via GitHub Contents API:

1. Gera `pages/<slug>/index.html` com `title`, `meta_description` e `content_html` da página.
2. Faz `PUT /repos/<owner>/<repo>/contents/pages/<slug>/index.html` — cria o ficheiro se não existir,
   ou actualiza-o (lê o `sha` actual primeiro) se já existir. **É um commit directo no branch
   por omissão do repositório — não passa por pull request.**
3. O push para o GitHub despoleta automaticamente um novo deploy no Vercel.

Isto explica a existência de páginas como `pages/como-fazer-um-cv-de-um-licenciado-em-mocambique/index.html`
no repositório — não foram escritas à mão, foram publicadas pelo admin através deste mecanismo.

**Requer** as variáveis de ambiente `GITHUB_OWNER`, `GITHUB_REPO` e `GITHUB_TOKEN` (Personal Access
Token com permissão de escrita no repositório). Sem elas, a função regista um aviso e não faz nada —
a publicação no `blog_pages` continua a funcionar normalmente, só não gera o HTML estático.

> ⚠️ Por ser um commit directo (sem revisão), trate o `GITHUB_TOKEN` com o mesmo cuidado que a
> `SUPABASE_SERVICE_ROLE_KEY` — qualquer conta admin com acesso ao painel pode, na prática, escrever
> ficheiros no repositório.

---

## 🤝 Sistema de Afiliados

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/affiliate/register` | Pedir código de afiliado |
| `GET /api/affiliate/dashboard` | Painel com ganhos e cliques |
| `POST /api/affiliate/click` | Registar clique (deduplicado por hash de IP) |
| `POST /api/affiliate/withdraw` | Pedir levantamento M-Pesa |
| `GET /api/affiliate/check?ref=` | Validar link publicamente |

**Comissões por pacote** (configurável em `system_settings`, chave `aff_rate_<pacote>`):
Avulso 10% · Starter 15% · Básico 15% · Pro 20% · Empresa 20%.

### Afiliados Pro (v14)

Acrescenta segmentação e gamificação ao sistema base de afiliados — totalmente implementado em
`api/misc.js` (namespace `affiliate`), `api/admin/index.js` e `assets/js/admin/AdminApp.js`:

- **Segmentos** (`aff_segment`): `papelaria` · `cyber` · `universidade` · `explicacao` · `digitador` ·
  `individual` — alguns segmentos têm um bónus de comissão extra configurável
  (`aff_bonus_papelaria` = +5%, `aff_bonus_cyber` = +3%, `aff_bonus_universidade` = +5%).
- **Níveis** (`aff_tier`): 🥉 bronze → 🥈 prata (5+ conversões) → 🥇 ouro (20+) → 💎 diamante (50+),
  calculados pela função `update_affiliate_tier()`. O nível diamante reduz o levantamento mínimo
  para metade (mínimo absoluto de 50 MZN).
- **Anti-fraude**: tabela `affiliate_fraud_flags` regista eventos (`self_referral`, `ip_burst`,
  `fake_clicks`, `suspicious_conversion`) com severidade, revistos no painel admin.
- **Metas mensais e bloqueio de conta** (`aff_is_blocked`, `aff_block_reason`) geridos pelo admin.

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
| `convert.js` | 60s | — |
| `process-payment.js` | 30s | — |
| Restantes (auth, admin, misc, verify-credits, deduct-credit, delete-temp-account, cleanup-temp-accounts, partners) | 10–30s | — |
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

### Pacotes de créditos

| Pacote | Créditos | Preço | MZN/crédito | Notas |
|--------|----------|-------|--------------|-------|
| Avulso | 3 | 50 MZN | 16.67 | Conta temporária, válida 7 dias, sem registo permanente |
| Starter | 10 | 120 MZN | 12.00 | — |
| Básico | 25 | 280 MZN | 11.20 | Pacote mais popular |
| Pro | 60 | 600 MZN | 10.00 | — |
| Empresa | 150 | 1500 MZN | 10.00 | Multi-utilizador |

> Não existe (e nunca existiu) integração automática com a API de cobrança M-Pesa — não há pedido
> push automático no telemóvel do utilizador. `MPESA_API_KEY`/`MPESA_SERVICE_CODE` (se definidas)
> apenas alteram a etiqueta "sandbox"/"produção" mostrada na interface.

### Fluxo de confirmação — duas vias

Desde a introdução da verificação automática de comprovativos (`migration_v15_receipt_verification.sql`),
existem **duas formas** de um pagamento ser confirmado — a app tenta sempre a primeira, com a segunda
como rede de segurança:

**1. Verificação automática por IA visão (caminho principal)**
1. O utilizador escolhe um pacote, introduz **qualquer número de telemóvel moçambicano válido**
   (M-Pesa/Vodacom, e-Mola/Movitel ou mKesh/mCel — prefixos `82–87`) e `api/process-payment.js`
   regista o pedido em `transactions` (status `pending`) com referência única.
2. Em vez do botão "Enviar por WhatsApp", o utilizador faz **upload do screenshot do comprovativo**
   (drag & drop ou ficheiro), que é enviado para `POST /api/verify-receipt`.
3. `api/_lib/visionAI.js` (Gemini → OpenRouter fallback) analisa a imagem e extrai valor, referência,
   estado e uma pontuação de confiança (0.0–1.0).
4. **Aprovação automática** se: confiança ≥ **0.85** *e* valor bate certo com o pacote (±1 MZN) *e*
   data da transacção ≤ 60 min *e* status reconhecido como sucesso *e* referência/hash do comprovativo
   ainda não usados noutra transacção (anti-fraude/anti-reutilização). Os créditos são adicionados
   na hora via RPC `add_credits` e a transacção fica `confirmed`.
5. Se qualquer verificação falhar ou a confiança for `< 0.85`, a transacção fica `review_needed` para
   um admin confirmar manualmente no painel `admin.html` — normalmente em poucos minutos, anunciado
   como "até 15 min" na interface.
6. Anti-abuso: máximo 3 uploads de comprovativo por IP por minuto.

**2. Fallback manual via WhatsApp (sempre disponível)**
- Um link de WhatsApp pré-formatado (referência, pacote, valor, carteira detectada pelo prefixo do
  número) fica sempre visível abaixo da área de upload, para quem preferir confirmar por essa via
  ou caso o upload falhe.
- Um administrador confirma manualmente no painel `admin.html`, normalmente em até 24h.

### Reembolso automático de créditos

Se `/api/deduct-credit` debitar um crédito e a geração de IA falhar completamente a seguir (todos os
5 providers indisponíveis), **o crédito é devolvido automaticamente**:

1. `api/generate-document.js` chama a RPC `refund_credit(p_user_id, p_amount)` automaticamente
   quando `Promise.any` rejeita (todos os providers falharam).
2. A RPC incrementa `profiles.credits` e regista a operação em `credit_logs` com
   `action = 'refund'`.
3. O cliente recebe `{ refunded: true, creditsRemaining }` e mostra uma notificação clara:
   *"O crédito foi devolvido automaticamente — tente novamente."*
4. `api/deduct-credit.js` também aceita `{ refund: true, cost, documentType }` como modo de
   reembolso de reserva (caso a RPC falhe — fallback manual não-atómico).

> ⚠️ **Acção necessária:** `supabase/migration_v12_refund_credit.sql` — incluindo a própria tabela
> `credit_logs` — **não existia no repositório** até esta ronda de correcções (a função `refund_credit`
> era chamada pelo código mas nunca tinha sido definida em nenhum ficheiro `.sql` versionado). O
> ficheiro foi reconstruído a partir do uso real no código — reveja-o antes de executar em produção,
> especialmente se já tiver uma tabela `credit_logs` criada manualmente. Ver nota no topo do próprio
> ficheiro.

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

## 🛠️ Alterações — v13 a v16 (pós-auditoria)

Mudanças aplicadas em rondas posteriores à auditoria v12, nunca antes resumidas neste README:

| Migração / Ficheiro | Alteração |
|---|---|
| `migration_v12_community_templates.sql` | Estende `templates_custom` para suportar templates `official`/`community`/`premium`/`private`, destaque pelo admin, partilha por link e contagem de uso (`template_uses`). **Schema apenas — sem ligação à API/UI ainda**, ver [🏪 Template Marketplace](#-template-marketplace-api). |
| `migration_v13_fix_signup_credits.sql` | **Corrige bug de produção:** o trigger `handle_new_user()` tinha sido redefinido em 5 ficheiros diferentes ao longo do tempo, todos atribuindo **3 créditos** a novas contas, apesar do código da app dizer "1 crédito grátis". Esta migração redefine o trigger de forma definitiva com `credits = 1` e `credits_expires_at = NOW() + 30 dias`. **É a mesma inconsistência corrigida em `legal.html` nesta auditoria de texto.** |
| `migration_v14_affiliates_pro.sql` | Sistema de Afiliados Pro completo: segmentação, níveis (bronze→diamante), metas mensais, tabela `affiliate_fraud_flags`. Ver secção [🤝 Sistema de Afiliados](#-sistema-de-afiliados). |
| `migration_v15_receipt_verification.sql` | Novas colunas em `transactions` (`receipt_hash`, `receipt_verified`, `receipt_confidence`, `verification_method`, `review_reason`) + status `review_needed`. Suporta a verificação automática de comprovativos por IA — ver [💳 Pagamentos](#-pagamentos). |
| `migration_v16_fix_signup_name_phone.sql` | **Corrige bug de produção:** novos utilizadores ficavam sem `full_name`/`phone` porque o trigger usava `ON CONFLICT DO NOTHING`, impedindo o PATCH posterior de `api/auth/index.js` de preencher esses campos. Trigger passou a usar `DO UPDATE SET`. |
| `api/misc.js` → v3.0 | Nova rota `POST /api/verify-receipt`; rate-limit de 3 uploads/IP/min; hash SHA-256 anti-reutilização de comprovativos. |
| `api/process-payment.js` → v5.0 | Chama `verifyReceiptInternal()` directamente quando o pedido já inclui o comprovativo (upload único, sem 2º pedido do cliente). |
| `api/_lib/visionAI.js` | **Novo.** Helper de IA visão partilhado entre `extract-template.js` e `misc.js` (verify-receipt). |
| `assets/js/marketplace/templates/*.js` | `TemplateLibrary.js` (~1600 linhas, todos os templates inline) foi dividido em 14 ficheiros por categoria + `templates/index.js` agregador. Nenhum template foi alterado no processo. |
| `api/admin/index.js` — `_generateStaticPage()` | **Não documentado até esta ronda:** publica páginas de `blog_pages` directamente no GitHub via API quando marcadas como publicadas. Ver [📰 Blog / CMS](#-blog--cms--publicação-automática-de-páginas-seo). |

### Correcções desta auditoria de consistência (texto e documentação)

| Ficheiro | Problema | Correcção |
|---|---|---|
| `legal.html` | Secção "Sistema de Créditos" dizia **3 créditos de boas-vindas, válidos por 60 dias** — desactualizado desde a `migration_v13`, que corrigiu o valor real para 1 crédito / 30 dias em todo o código (`api/auth/index.js`, `AuthUI.js`, `homeController.js` já diziam "1 crédito" correctamente). | Texto corrigido para **1 crédito de boas-vindas, válido por 30 dias**, alinhado com o resto da aplicação. |
| `supabase/migration_v12_refund_credit.sql` | Ficheiro referenciado pelo README e chamado pelo código (`rpc('refund_credit', ...)`) **não existia no repositório** — nem a tabela `credit_logs` tinha `CREATE TABLE` em lado nenhum. | Ficheiro reconstruído a partir do uso real no código — reveja antes de aplicar em produção. |
| `README.md` — variáveis de ambiente | Faltavam `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `NVIDIA_API_KEY` (3 dos 5 providers de IA), `CLOUDCONVERT_API_KEY`, `CRON_SECRET`, `UPSTASH_REDIS_REST_*`, `WA_SUPPORT_NUMBER`, `GITHUB_OWNER/REPO/TOKEN`. `MPESA_SERVICE_PROVIDER_CODE` tinha o nome errado (código usa `MPESA_SERVICE_CODE`). `ADMIN_EMAILS` e `MPESA_PUBLIC_KEY` estavam documentadas mas não são lidas em nenhum ficheiro. | Lista de variáveis actualizada para reflectir exactamente o que o código lê. |
| `README.md` — contagem de serviços | "15 serviços" (3 ocorrências) — contagem real é **17** (14 com templates × 5 + 3 sem templates/IA: `impressao`, `foto`, `conversao`, usados apenas via WhatsApp). | Corrigido nas 3 ocorrências. |
| `README.md` — migrações | Lista de migrações parava em `migration_v12_refund_credit.sql`; não mencionava `migration_v12_community_templates.sql` nem v13–v16. | Lista actualizada com as 5 migrações em falta. |
| `README.md` — estado de migração SDK | Dizia "8 funções ainda usam o SDK antigo"; na realidade 6 dessas 8 já tinham sido migradas em rondas posteriores (só `admin/index.js` não migrou; `misc.js` está parcialmente migrado). | Lista corrigida por ficheiro com o estado real. |
| `README.md` — pagamentos | Não mencionava a verificação automática de comprovativos por IA (`/api/verify-receipt`, v15) — descrevia apenas o fluxo manual por WhatsApp, que hoje é o *fallback*, não o caminho principal. | Secção reescrita para descrever as duas vias (automática + manual). |

---

## ⚠️ Áreas Não Cobertas / Pontos em Aberto

A auditoria original (v12) focou-se no fluxo crítico **crédito → geração de documento → pagamento**.
Esta lista foi actualizada (Junho/2026) para reflectir o estado real do código — várias das funções
listadas como "por migrar" na ronda v12 já foram migradas entretanto:

- **Migração para `api/_lib/supabaseAdmin.js` (estado actual):**
  - ✅ Já migradas (sem `@supabase/supabase-js` nem `require('ws')`): `deduct-credit.js`,
    `process-payment.js`, `generate-document.js`, `auth/index.js`, `verify-credits.js`,
    `partners.js`, `delete-temp-account.js`, `cleanup-temp-accounts.js`.
  - ✅ Nunca precisaram do SDK: `extract-template.js` e `convert.js` (não acedem ao Supabase
    directamente / usam apenas `api/_lib/visionAI.js` ou ferramentas externas de conversão).
  - 🟡 **Parcialmente migrado:** `misc.js` usa `supabaseAdmin.js` na maior parte das rotas, mas mantém
    um `makeSdkClient()` interno (SDK + `ws`) só para as rotas de **afiliados e templates**
    (`handleAffiliate`, `handleTemplates`) — ver comentário no próprio ficheiro para o motivo
    (opção `realtime.transport: ws` necessária no Node 20).
  - ❌ **Ainda não migrado:** `api/admin/index.js` — continua a usar `@supabase/supabase-js` +
    `require('ws')` integralmente. É o maior ficheiro de API do projecto (75 KB); migrar precisa de
    mais cuidado e testes.
- **Rede de Parceiros** (`api/partners.js`, `parceiros.html`, `admin-parceiros.html`,
  `assets/js/partners/NearbyPartners.js`, `supabase/supabase-partners-setup.sql`) — fluxo de
  cadastro/aprovação de parceiros, geolocalização e exibição no mapa não foram testados.
- **Blog / CMS** (rotas dentro de `api/admin/index.js`, tabela `blog_pages`) — geração de artigos
  por IA, SEO score e fluxo de publicação automática para o GitHub (ver
  [📰 Blog / CMS](#-blog--cms--publicação-automática-de-páginas-seo)) não foram revistos a fundo.
- **Painel Admin completo** (`admin.html`, `AdminApp.js`) — gestão de utilizadores, confirmação
  manual de pagamentos, analytics (`analytics_metrics`, `page_views`, `online_sessions`),
  feedback (`user_feedback`) e logs (`admin_logs`).
- **Sistema de Afiliados** (`afiliado.html`, `affiliate_clicks`, `affiliate_commissions`,
  `affiliate_withdrawals`, `affiliate_fraud_flags`) — apenas a integridade da dedução/reembolso de
  créditos foi verificada; o cálculo de comissões, níveis e levantamentos não foi auditado.
- **Marketplace comunitário de templates (v12)** — o schema (`template_type`, `credit_cost`,
  `share_token`, `is_featured`, tabela `template_uses`) está criado mas **não está ligado a nenhum
  endpoint nem à UI** ainda — ver nota na secção [🏪 Template Marketplace](#-template-marketplace-api).
- **Consolidação do schema SQL** — a pasta `supabase/` tem **26 ficheiros** (`EMERGENCIA_*`,
  `EXECUTAR_AGORA_*`, `migration_fix_*`, `migration_add_*`, etc.), com pelo menos um caso confirmado
  de migração referenciada no código mas ausente do repositório (`migration_v12_refund_credit.sql`,
  reconstruída nesta ronda — ver secção [💳 Pagamentos](#-pagamentos)). Recomenda-se gerar um
  `schema_CURRENT.sql` a partir do estado real da base de dados (Dashboard → Database → Schema) e
  arquivar os ficheiros antigos/sobrepostos.
- **Sistema de templates personalizados** (`templates_custom`, `template_ratings`,
  `template_downloads`) e **contas temporárias/avulso** (`is_temp`, `temp_ref`,
  `temp_password`) — lógica de expiração e limpeza não foi revista nesta ronda.

---

## 📦 Versões

| Componente | Versão | Nota |
|------------|--------|------|
| `package.json` | `11.0.0` | — |
| `sw.js` (CACHE_VERSION) | `v20-20260621e` | auto-actualizado pelo build |
| `README.md` | `v16` (esta edição) | — |
| `api/_lib/supabaseAdmin.js` | — | helper sem versão explícita |
| `api/_lib/visionAI.js` | `v1.0` | — |
| `api/auth/index.js` | `v2.1` | — |
| `api/admin/index.js` | `v2.0` | — |
| `api/misc.js` | `v3.0` | — |
| `api/process-payment.js` | `v5.0` | — |
| `api/deduct-credit.js` | `v3.0` | — |
| `api/generate-document.js` | `v2.0` | — |
| `api/verify-credits.js` | `v3.0` | — |
| `api/extract-template.js` | `v2.0` | — |
| `api/partners.js` | `v2.0` | — |
| `api/convert.js` | sem versão | — |
| Migrações Supabase | até `migration_v16_fix_signup_name_phone` | ver secção de deploy |
| Templates integrados | 70 (14 serviços × 5) | 17 serviços no total; 3 sem templates visuais |

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · [mzdocs.co.mz](https://mzdocs.co.mz)*
