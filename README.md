# MzDocs Pro — v10

Plataforma moçambicana de geração de documentos com IA. Construída para o Vercel Hobby (limite: 12 functions), Supabase e PWA.
a
---

## 🗂️ Estrutura do Projecto

```
MzDocs-Pro/
├── api/                          # 12 Serverless Functions (limite Hobby)
│   ├── admin/
│   │   ├── index.js              # Dashboard, analytics, feedback, pagamentos
│   │   ├── pages.js              # Blog / páginas estáticas
│   │   └── generate-page.js      # Gerador de páginas com IA
│   ├── auth/
│   │   └── index.js              # Login, registo, reset password
│   ├── generate-document.js      # Geração de documentos (OpenRouter)
│   ├── verify-credits.js         # Verificar saldo de créditos
│   ├── deduct-credit.js          # Debitar crédito após geração
│   ├── process-payment.js        # M-Pesa + comissões afiliados
│   ├── delete-temp-account.js    # Limpeza de contas temporárias
│   ├── cleanup-temp-accounts.js  # Cron: limpeza automática
│   ├── config.js                 # Configuração pública (Supabase URL + anon key)
│   └── misc.js                   # Router auxiliar: page-view · sitemap ·
│                                 #   afiliados (/api/affiliate/*) ·
│                                 #   marketplace (/api/templates/*)
│
├── assets/
│   ├── js/
│   │   ├── academic/
│   │   │   ├── AcademicEngine.js # APA 7, citações, bibliografia, TOC
│   │   │   └── AcademicUI.js     # Painel de referências + upload PDF/URL
│   │   ├── marketplace/
│   │   │   ├── TemplateLibrary.js  # 15 serviços × 5 templates = 75 templates
│   │   │   └── TemplatePicker.js   # Modal de escolha com preview em tempo real
│   │   ├── admin/
│   │   │   └── AdminApp.js       # Painel admin completo
│   │   ├── auth/
│   │   │   └── AuthManager.js
│   │   ├── components/
│   │   │   ├── PDFExporter.js    # Export PDF profissional (jsPDF)
│   │   │   └── WordExporter.js   # Export DOCX
│   │   ├── controllers/
│   │   │   ├── DocumentController.js  # Orquestra geração + TemplatePicker + AcademicUI
│   │   │   └── TemplateController.js
│   │   ├── models/
│   │   ├── services/
│   │   │   └── ServiceDefinitions.js
│   │   └── views/
│   └── css/
│
├── supabase/
│   ├── migration_v9_analytics_feedback.sql
│   ├── migration_v10_affiliates.sql
│   ├── migration_v10_online_userid.sql
│   └── migration_v11_marketplace.sql   ← NOVO
│
├── afiliado.html                 # Painel de afiliados
├── admin.html                    # Painel administrativo
├── index.html                    # App principal (PWA)
├── sw.js                         # Service Worker
├── manifest.json
├── vercel.json                   # 12 functions + 16 rewrites
└── package.json
```

---

## 🚀 Deploy

### 1. Pré-requisitos
- Conta Vercel Hobby
- Projecto Supabase
- Conta OpenRouter (API key)
- Conta M-Pesa (para pagamentos)

### 2. Variáveis de Ambiente (Vercel)

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
MPESA_API_KEY=...
MPESA_PUBLIC_KEY=...
MPESA_SERVICE_PROVIDER_CODE=...
SITE_URL=https://mzdocs.co.mz
ADMIN_EMAILS=email@exemplo.com
```

### 3. Migrações Supabase
Execute por ordem no SQL Editor do Supabase:

```sql
-- 1. Analytics e feedback
migration_v9_analytics_feedback.sql

-- 2. Sistema de afiliados
migration_v10_affiliates.sql

-- 3. Online sessions com user_id + Realtime
migration_v10_online_userid.sql

-- 4. Template Marketplace ← NOVO
migration_v11_marketplace.sql
```

### 4. Push para GitHub → Vercel faz deploy automático

---

## 🎨 Template Engine

### Serviços com templates visuais (5 por serviço):

| Serviço | Chave | Nº Templates |
|---------|-------|--------------|
| Trabalho Escolar | `trabalho` | 5 |
| Currículo | `cv` | 5 |
| Carta Formal | `carta` | 5 |
| Orçamento de Obra | `orcamento` | 5 |
| Contrato de Arrendamento | `arrendamento` | 5 |
| Contrato Prestação de Serviços | `prestacao` | 5 |
| Procuração / Mandato | `procuracao` | 5 |
| Requerimento Oficial | `requerimento` | 5 |
| Declaração de Residência | `residencia` | 5 |
| Plano de Negócios | `planonegocio` | 5 |
| Recibo / Factura | `recibo` | 5 |
| Carta de Recomendação | `recomendacao` | 5 |
| Pedido de Licença | `licenca` | 5 |
| Acta de Reunião | `acta` | 5 |

**Total: 70 templates prontos + marketplace extensível**

### Fluxo obrigatório:
```
Seleccionar Serviço → Preencher Formulário → Gerar com IA
→ [Botão "Escolher Modelo"] → Preview tempo real → Download PDF/DOCX
```

### Adicionar novo template (sem alterar código principal):
```js
// Em assets/js/marketplace/TemplateLibrary.js
// Adicionar ao array do serviço pretendido:
TEMPLATE_LIBRARY.cv.push({
  id: 'cv-novo',
  name: 'Meu Template',
  description: 'Descrição',
  preview: { accent: '#3B82F6', bg: '#fff', font: 'sans-serif', headerBg: '#3B82F6', headerColor: '#fff' },
  css: `body { font-family: Arial; ... }`,
});
```

---

## 📚 Módulo Académico (APA 7)

### Funções disponíveis:
```js
import { AcademicEngine } from './assets/js/academic/AcademicEngine.js';

// Gerar referência APA 7
AcademicEngine.generateAPA7({ type: 'book', authors: [{last:'Mondlane', first:'Eduardo'}], year: '1969', title: 'Lutar por Moçambique', publisher: 'Nosso Tempo' });
// → Mondlane, E. (1969). *Lutar por Moçambique*. Nosso Tempo.

// Citação in-text
AcademicEngine.generateCitation({ authors: [{last:'Mondlane'}], year: '1969' }, '45');
// → (Mondlane, 1969, p. 45)

// Extrair referências de texto PDF
AcademicEngine.extractReferencesFromPDF(pdfText);

// Extrair referência de URL
AcademicEngine.extractReferencesFromURL('https://exemplo.com', { title: 'Artigo' });

// Gerar trabalho científico (prompt para IA)
AcademicEngine.generateScientificPaper({ tema: '...', nivel: 'Licenciatura', disciplina: '...', paginas: 15 }, sources);

// Índice automático
AcademicEngine.generateTableOfContents(markdownContent);

// Gerar secção de referências
AcademicEngine.generateBibliography(sources);
```

---

## 🏪 Template Marketplace (API)

| Endpoint | Método | Auth | Descrição |
|----------|--------|------|-----------|
| `GET /api/templates/list?service=cv` | GET | Público | Listar templates aprovados |
| `POST /api/templates/submit` | POST | Token | Submeter novo template |
| `POST /api/templates/rate` | POST | Token | Avaliar (1-5 estrelas) |
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
- **Visitas**: POST automático a cada carregamento + heartbeat 90s
- **Session ID**: `localStorage` para persistência entre recargas
- **Fallback**: Polling a cada 20s se WebSocket falhar

---

## 🤝 Sistema de Afiliados

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/affiliate/register` | Pedir código de afiliado |
| `GET /api/affiliate/dashboard` | Painel com ganhos e cliques |
| `POST /api/affiliate/click` | Registar clique (deduplicado por IP hash) |
| `POST /api/affiliate/withdraw` | Pedir levantamento M-Pesa |
| `GET /api/affiliate/check?ref=` | Validar link publicamente |

**Comissões**: Avulso 10% · Starter 15% · Pro/Empresa 20%

---

## ⚙️ Limites Vercel Hobby

| Recurso | Limite | Usado |
|---------|--------|-------|
| Serverless Functions | 12 | **12** ✅ |
| Execução por request | 10s (15s para misc/admin) | — |
| Bandwidth | 100 GB/mês | — |

> **Regra:** Toda nova lógica de API deve ser adicionada a `api/misc.js` ou a functions existentes. Não criar novos ficheiros `.js` em `api/`.

---

## 📱 PWA

- Service Worker com cache estratégico
- Funciona offline (documentos pendentes sincronizam quando a internet volta)
- Instalável em Android e iOS
- Notificações push (se configurado)

---

## 🔒 Segurança

- RLS activado em todas as tabelas Supabase
- Tokens JWT validados em todos os endpoints privados
- IPs hasheados (SHA-256) para tracking de cliques — sem dados pessoais
- Sanitização de inputs em todos os endpoints
- Service Role Key nunca exposta ao cliente

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · mzdocs.co.mz*
