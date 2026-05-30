# MzDocs Pro — v11

Plataforma moçambicana de geração, edição e exportação de documentos profissionais com IA. PWA instalável, construída para o Vercel Hobby (limite: 12 functions), Supabase e M-Pesa.

---

## ✨ Funcionalidades Principais

| Funcionalidade | Descrição |
|---|---|
| **Geração com IA** | 15 tipos de documento gerados por Gemini / OpenRouter |
| **70 Templates Visuais** | 5 templates por serviço, com CSS próprio e layout profissional |
| **Editor WYSIWYG** | Edição inline com preservação fiel do template (iframe + designMode) |
| **Export PDF** | Abre janela de impressão com cores e backgrounds preservados (`print-color-adjust: exact`) |
| **Export Word (.doc)** | Conversão inteligente de layouts flexbox → tabelas Word com `HTMLWordExporter` |
| **Export Excel** | Tabelas e orçamentos exportados como `.xls` |
| **Assinatura Digital** | Canvas de assinatura inserido directamente no documento |
| **Módulo Académico APA 7** | Citações, bibliography, TOC automático, upload PDF/URL |
| **Extracção de Template por Imagem** | IA de visão extrai estrutura de qualquer imagem de documento |
| **OCR** | Extracção de texto de imagens via IA |
| **Histórico Offline** | Documentos guardados em IndexedDB, sincronizados quando online |
| **Sistema de Afiliados** | Comissões automáticas via M-Pesa |
| **Painel Admin** | Analytics em tempo real, feedback, utilizadores, pagamentos |
| **PWA** | Instalável em Android e iOS, funciona offline |

---

## 🗂️ Estrutura do Projecto

```
MzDocs-Pro/
├── api/                               # 10 Serverless Functions (Vercel Hobby)
│   ├── admin/
│   │   ├── index.js                   # Dashboard, analytics, feedback, pagamentos
│   │   └── pages.js                   # Blog / páginas estáticas + gerador com IA
│   ├── auth/
│   │   └── index.js                   # Login, registo, reset password
│   ├── generate-document.js           # Geração de documentos (Gemini + OpenRouter)
│   ├── extract-template.js            # Extracção de template via imagem (IA visão)
│   ├── verify-credits.js              # Verificar saldo de créditos
│   ├── deduct-credit.js               # Debitar crédito após geração
│   ├── process-payment.js             # M-Pesa + comissões afiliados
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
│   │   ├── admin/
│   │   │   └── AdminApp.js            # Painel admin completo
│   │   ├── auth/
│   │   │   └── AuthManager.js         # Autenticação Supabase
│   │   ├── components/
│   │   │   ├── DocumentEditor.js      # Editor WYSIWYG + iframe designMode p/ templates
│   │   │   ├── HTMLPDFExporter.js     # PDF via impressão (preserva cores de fundo)
│   │   │   ├── HTMLWordExporter.js    # Word: converte flexbox → tabelas, preserva cores
│   │   │   ├── WordExporter.js        # Word para documentos sem template HTML
│   │   │   ├── PDFExporter.js         # PDF via jsPDF (documentos sem template)
│   │   │   ├── ExcelExporter.js       # Export Excel (.xls)
│   │   │   └── SignatureCanvas.js     # Canvas de assinatura digital
│   │   ├── controllers/
│   │   │   ├── DocumentController.js  # Orquestra geração + editor + templates + export
│   │   │   ├── TemplateController.js  # Gestão de templates do marketplace
│   │   │   ├── HistoryController.js   # Histórico de documentos (IndexedDB)
│   │   │   ├── OCRController.js       # OCR via IA
│   │   │   └── PaymentController.js   # Fluxo de pagamento M-Pesa
│   │   ├── models/
│   │   ├── services/
│   │   │   └── ServiceDefinitions.js  # Definições dos 15 serviços
│   │   ├── utils/
│   │   │   ├── Sanitizer.js           # Sanitização HTML (inclui tags semânticas HTML5)
│   │   │   ├── Storage.js             # Abstracção de localStorage
│   │   │   ├── IndexedDB.js           # Persistência offline de documentos
│   │   │   ├── Formatter.js           # Formatação de texto / moeda
│   │   │   └── ExportManager.js       # Coordenação de exportações
│   │   └── views/
│   │       └── Views.js               # Renderização de resultados + preview iframe
│   └── css/
│       ├── editor.css                 # Estilos do editor WYSIWYG
│       └── ...
│
├── supabase/
│   ├── schema.sql                     # Schema base completo
│   ├── migration_v8_1_blog_pages.sql
│   ├── migration_v8_2_admin_tables.sql
│   ├── migration_v8_pricing_temp_accounts.sql
│   ├── migration_v9_analytics_feedback.sql
│   ├── migration_v10_affiliates.sql
│   ├── migration_v10_online_userid.sql
│   └── migration_v11_marketplace.sql
│
├── afiliado.html                      # Painel de afiliados
├── admin.html                         # Painel administrativo
├── index.html                         # App principal (PWA)
├── offline.html                       # Página offline
├── sw.js                              # Service Worker (cache v11)
├── manifest.json                      # PWA manifest
├── vercel.json                        # 10 functions + rewrites + crons
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
```

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

| Recurso | Limite | Usado |
|---------|--------|-------|
| Serverless Functions | 12 | **10** ✅ (2 de margem) |
| `generate-document.js` | 60s | — |
| `extract-template.js` | 60s | — |
| `process-payment.js` | 30s | — |
| Restantes | 10–30s | — |
| Bandwidth | 100 GB/mês | — |

> **Regra:** Toda nova lógica de API deve ser adicionada a `api/misc.js` ou a functions existentes. Não criar novos ficheiros `.js` em `api/` sem verificar o limite de 12.

---

## 📱 PWA

- Service Worker com cache estratégico (versão `v11`)
- Funciona offline — documentos pendentes sincronizam quando a internet volta
- Instalável em Android e iOS (atalhos para CV, Carta, Trabalho, Orçamento)
- Background sync para documentos gerados offline

---

## 🔒 Segurança

- RLS activado em todas as tabelas Supabase
- Tokens JWT validados em todos os endpoints privados
- IPs hasheados (SHA-256) para tracking de cliques — sem dados pessoais
- `sanitizeHtml()` com lista explícita de tags permitidas (inclui tags semânticas HTML5)
- Service Role Key nunca exposta ao cliente
- Contas temporárias limpas automaticamente via cron diário

---

## 📦 Versões

| Componente | Versão |
|------------|--------|
| `package.json` | `11.0.0` |
| `sw.js` (CACHE_VERSION) | `v11` |
| `README.md` | `v11` |
| Migrações Supabase | até `v11_marketplace` |
| Templates | 70 (15 serviços × 5) |

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · [mzdocs.co.mz](https://mzdocs.co.mz)*
