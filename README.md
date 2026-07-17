# MzDocs Pro — v27

Plataforma moçambicana de geração, edição e exportação de documentos profissionais com IA. PWA instalável, construída para o Vercel Hobby (limite: 12 functions), Supabase e pagamento manual por carteira móvel.

> 📌 **Nota de versão:** este documento reflecte o estado real do código até à auditoria de
> 17 de Julho/2026 — Finanças com "Valor Levantável" real (`migration_v37`), Marketplace de
> Templates corrigido e migrado para preço **sempre em créditos** (`migration_v38`/`v39`),
> limites de uso por documento — downloads e edições (`migration_v40`), Kit de Marketing
> dinâmico para afiliados com QR pessoal por peça (`migration_v41`), e a correcção de dois
> bugs de produção que só se manifestavam depois de tudo isto estar em código mas por aplicar
> por inteiro: (1) `/api/admin/templates` respondia sempre 500 porque ainda seleccionava/gravava
> a coluna `price_mzn`, removida pela `migration_v39` — o preço passou a ser só `credit_cost`,
> com o equivalente em MZN calculado ao vivo (`mzn_per_credit`); (2) o Kit de Marketing dos
> Afiliados tinha todo o HTML/SQL prontos mas nenhuma das duas pontas de código a ligá-los —
> `AdminApp.js` não tinha nenhuma das funções de gestão de materiais (`_openMaterialForm` e
> afins), e `api/misc.js` não tinha as rotas `/api/affiliate/materials`/`/api/affiliate/qrcode`
> que `afiliado.html` já chamava — ver secção "Alterações — v27" abaixo. O histórico de
> auditorias anteriores está preservado nas secções abaixo (v12, v13–v16, v17–v24, v25, v26).

> ⚠️ **Acção urgente — plano Vercel:** este projecto processa pagamentos (`api/process-payment.js`,
> tabela `transactions`). Os Termos de Serviço da Vercel definem **qualquer fluxo de cobrança a
> visitantes do site** como uso comercial, que **não é permitido no plano Hobby** — apenas no Pro
> (US$20/mês) ou Enterprise. Um projecto no plano errado pode ser suspenso sem aviso prévio.
> Recomenda-se a migração para o plano Pro **antes** de qualquer campanha de crescimento,
> independentemente do número de utilizadores. Ver análise completa e roteiro em
> [`ROADMAP-ESCALA.md`](./ROADMAP-ESCALA.md).

---

## ✨ Funcionalidades Principais

| Funcionalidade | Descrição |
|---|---|
| **Geração com IA (5 providers)** | Corrida paralela entre Groq, Gemini, OpenRouter, Cerebras e NVIDIA NIM — o primeiro a responder "ganha", garantindo alta disponibilidade a custo zero |
| **Amostra Grátis + Custo Progressivo** | `_previewMode: true` gera um extracto curto sem debitar créditos; documentos longos (trabalhos 6+ páginas) têm custo progressivo gerido pelo `LongDocumentEngine` |
| **70 Templates Visuais** | 5 templates por serviço (14 serviços), com CSS próprio e layout profissional |
| **Editor WYSIWYG** | Edição inline com preservação fiel do template (iframe + designMode) |
| **Export PDF** | Abre janela de impressão com cores e backgrounds preservados (`print-color-adjust: exact`) |
| **Export Word (.docx)** | `HTMLToDocxExporter` (OOXML real via `docx`, para templates HTML) e `WordExporter` (académico: Times 12pt, margens normalizadas, capa automática) |
| **Export Excel** | Tabelas e orçamentos exportados como `.xls` |
| **Assinatura Digital** | Canvas de assinatura inserido directamente no documento |
| **Módulo Académico APA 7** | Citações, bibliography, TOC automático, upload PDF/URL |
| **Extracção de Template por Imagem** | IA de visão extrai estrutura de qualquer imagem de documento |
| **OCR (SmartOCRService v4)** | IA visual (Groq/Gemini) primeiro; Tesseract apenas como complemento; suporta imagem, PDF (pdf.js) e Word (mammoth.js) |
| **Motor Jurídico RAG** | Busca vectorial (pgvector) sobre artigos de lei moçambicanos reais; usado pelos 5 serviços jurídicos (arrendamento, procuração, requerimento, residência, acta) em vez de citações estáticas — ver `docs/legal/VERIFICACAO-LEGAL.md` |
| **Histórico Offline** | Documentos guardados em IndexedDB, sincronizados quando online |
| **Pagamento Manual Multi-Carteira** | M-Pesa, e-Mola ou mKesh — upload do comprovativo com **verificação automática por IA visão** (aprovação imediata se confiança ≥ 85%) e fallback para WhatsApp/revisão manual |
| **Reembolso Automático de Créditos** | Se a geração de IA falhar após o débito, o crédito é devolvido via RPC `refund_credit` |
| **Preços Dinâmicos** | Pacotes de créditos (preços, créditos, validade) lidos de `system_settings` em tempo real via `api/_lib/packages.js` — alterar no admin reflecte imediatamente no checkout |
| **Marketplace de Templates** | Galeria comunitária com preview A4 realista (usando `SampleData.js` + `A4Renderer`); submissão, avaliação (1–5★), partilha por token e aprovação pelo admin |
| **Templates Oficiais Seed** | 70 templates oficiais inseridos na galeria via `migration_v22_seed_official_templates.sql` — galeria deixa de aparecer vazia |
| **Sistema de Afiliados Pro** | Comissões automáticas por pacote, segmentação (papelaria/cyber/universidade/explicação/digitador), níveis (bronze→diamante), ranking, notificações e detecção de fraude |
| **Rede de Parceiros** | Papelarias/cyber cafés parceiros listados perto do utilizador (`parceiros.html`) |
| **Blog / SEO** | CMS de artigos com geração assistida por IA (`blog_posts`, `blog_categories`); publicação automática de HTML estático no GitHub |
| **Painel Admin** | Analytics em tempo real, feedback, utilizadores, pagamentos, parceiros, configurações (incluindo preços dinâmicos), Finanças ("Valor Levantável" — NOVO v37) e Kit de Marketing dos afiliados (NOVO v41) |
| **Página de Conta (`perfil.html`)** | NOVO (v25): dados pessoais, segurança (email/password), avatar, plano/créditos e documentos recentes — Comprar Créditos e Ver Arquivo abrem em modal na própria página, sem navegar para a home |
| **PWA** | Instalável em Android e iOS, funciona offline; precache corrigido (33 ficheiros adicionados em v21) |

---

## 🗂️ Estrutura do Projecto

```
MzDocs-Pro/
├── api/                               # 12 Serverless Functions (Vercel Hobby — limite 12, sem margem)
│   ├── _lib/                          # Helpers partilhados (prefixo "_" — não contam para o limite)
│   │   ├── supabaseAdmin.js           # Cliente Supabase via fetch puro (REST + Auth API),
│   │   │                              #   sem @supabase/supabase-js nem 'ws'
│   │   ├── visionAI.js                # IA visão (Gemini → OpenRouter fallback),
│   │   │                              #   partilhado entre extract-template.js e misc.js
│   │   ├── legalSearch.js             # NOVO (v17): busca vectorial pgvector para o Motor Jurídico RAG
│   │   ├── packages.js                # NOVO: única fonte de verdade dos pacotes de créditos
│   │   │                              #   (lê de system_settings — eliminou duplicação em 5 locais)
│   │   └── rateLimit.js               # NOVO: rate-limit via Upstash Redis (com fallback Map local),
│   │                                  #   partilhado por verify-receipt e legal-search
│   ├── admin/
│   │   └── index.js                   # v2.0 — Dashboard, analytics, feedback, pagamentos,
│   │                                  #   blog/páginas estáticas, gerador de artigos com IA,
│   │                                  #   gestão de templates e afiliados
│   │                                  #   ⚠️ AINDA USA @supabase/supabase-js + require('ws')
│   ├── auth/
│   │   └── index.js                   # v2.1 — Login, registo, reset password
│   ├── generate-document.js           # v2.1 — 5 providers IA + amostra grátis + custo progressivo
│   │                                  #   + reembolso automático em falha total
│   ├── extract-template.js            # v2.0 — Extracção de template via imagem (IA visão)
│   ├── verify-credits.js              # v3.0 — Verificar saldo de créditos
│   ├── deduct-credit.js               # v3.0 — Debitar/reembolsar crédito (fetch puro, sem 'ws')
│   ├── process-payment.js             # v5.0 — Pagamento manual multi-carteira + registo de transação
│   ├── partners.js                    # v2.0 — API da Rede de Parceiros
│   ├── convert.js                     # Conversão de ficheiros (OCR / extracção de texto)
│   ├── delete-temp-account.js         # v9.0 — Limpeza de conta temporária individual
│   ├── cleanup-temp-accounts.js       # v9.0 — Cron diário: limpeza automática de contas expiradas
│   └── misc.js                        # v3.0 — Router auxiliar:
│                                      #   /api/config · /api/ocr-analyze · /api/verify-receipt
│                                      #   /api/legal-search (NOVO — Motor Jurídico RAG)
│                                      #   /api/page-view · sitemap.xml
│                                      #   /api/affiliate/* (register/dashboard/click/withdraw/
│                                      #     check/ranking/notifications)
│                                      #   /api/templates/* (list/gallery/mine/saved/save/submit/
│                                      #     rate/download/use/approve/reject/pending/report/
│                                      #     share-token/by-token/delete)
│                                      #   ⚠️ handleAffiliate e handleTemplates ainda usam
│                                      #   makeSdkClient() interno (SDK + ws)
│
├── assets/
│   ├── js/
│   │   ├── academic/
│   │   │   ├── AcademicEngine.js      # APA 7: citações, bibliography, TOC, PDF/URL
│   │   │   └── AcademicUI.js          # Painel de referências + upload PDF/URL
│   │   ├── admin/
│   │   │   ├── AdminApp.js            # Painel admin completo (utilizadores, pagamentos,
│   │   │   │                          #   afiliados, templates, configurações/preços)
│   │   │   ├── AdminDashboard.js      # Widget de analytics em tempo real
│   │   │   └── AdminTransactions.js   # Gestão de transações/pagamentos
│   │   ├── analytics/
│   │   │   └── Analytics.js           # GA4 + Facebook Pixel + Microsoft Clarity
│   │   ├── auth/
│   │   │   ├── AuthGuard.js           # Protecção de rotas
│   │   │   ├── AuthManager.js         # Autenticação Supabase
│   │   │   └── AuthUI.js              # UI de login/registo
│   │   ├── components/
│   │   │   ├── DocumentEditor.js      # Editor WYSIWYG + iframe designMode p/ templates
│   │   │   ├── DocumentEditorStyles.js# Estilos injectados no iframe do editor
│   │   │   ├── HTMLPDFExporter.js     # PDF via impressão (preserva cores de fundo)
│   │   │   ├── HTMLToDocxExporter.js  # Word real (.docx / OOXML) via biblioteca `docx`
│   │   │   │                          #   (para templates HTML com sidebar/2 colunas)
│   │   │   ├── WordExporter.js        # Word académico real (.docx) via `docx`:
│   │   │   │                          #   Times 12pt, margens normalizadas, capa automática
│   │   │   ├── PDFExporter.js         # PDF via jsPDF (documentos sem template)
│   │   │   ├── ExcelExporter.js       # Export Excel (.xls)
│   │   │   └── pageSimulationScript.js# Script injectado no iframe do preview A4
│   │   ├── controllers/
│   │   │   ├── DocumentController.js  # Orquestra geração + editor + templates + export
│   │   │   ├── TemplateController.js  # Gestão de templates do marketplace
│   │   │   ├── HistoryController.js   # Histórico de documentos (IndexedDB)
│   │   │   ├── OCRController.js       # OCR via SmartOCRService
│   │   │   └── PaymentController.js   # Fluxo de pagamento manual multi-carteira
│   │   ├── convert/
│   │   │   └── FileConverter.js       # Conversão de ficheiros no cliente
│   │   ├── marketplace/
│   │   │   ├── TemplateLibrary.js     # Reexporta o agregado de templates/index.js
│   │   │   ├── TemplatePicker.js      # Modal de escolha com preview A4 em tempo real
│   │   │   ├── SampleData.js          # NOVO: dados de exemplo realistas por categoria,
│   │   │   │                          #   para preview convincente na galeria comunitária
│   │   │   └── templates/             # 1 ficheiro por categoria (cv.js, carta.js, ...)
│   │   │       ├── index.js           # Agregador de todos os 14 ficheiros de categoria
│   │   │       ├── cv.js · carta.js · acta.js · arrendamento.js · licenca.js
│   │   │       ├── orcamento.js · planonegocio.js · prestacao.js · procuracao.js
│   │   │       ├── recibo.js · recomendacao.js · requerimento.js · residencia.js
│   │   │       └── trabalho.js
│   │   ├── models/
│   │   │   └── Models.js
│   │   ├── partners/
│   │   │   └── NearbyPartners.js      # Lista/mapa de parceiros próximos
│   │   ├── services/
│   │   │   ├── ServiceDefinitions.js  # 17 serviços (14 com templates + 3 via WhatsApp)
│   │   │   ├── Services.js            # Orquestra chamadas à API de geração
│   │   │   ├── LegalContext.js        # NOVO (v17): ponte frontend ↔ /api/legal-search (RAG)
│   │   │   ├── LongDocumentEngine.js  # v2.0: motor de geração em cadeia para docs longos;
│   │   │   │                          #   débito APÓS planeamento (fix: crédito perdido em falha)
│   │   │   ├── MPesaService.js        # Detecção de carteira por prefixo de número
│   │   │   ├── PaymentService.js      # Pacotes (lê de /api/config), validação de telefone
│   │   │   └── SmartOCRService.js     # v4.0: IA visual primeiro, Tesseract como complemento
│   │   │   └── prompts/               # 1 ficheiro de prompt por categoria (v17+)
│   │   │       ├── index.js           # Agregador; prompts jurídicos usam LegalContext (RAG)
│   │   │       └── [14 ficheiros: acta.js, arrendamento.js, carta.js, cv.js, licenca.js,
│   │   │           orcamento.js, planonegocio.js, prestacao.js, procuracao.js, recibo.js,
│   │   │           recomendacao.js, requerimento.js, residencia.js, trabalho.js]
│   │   ├── utils/
│   │   │   ├── A4Renderer.js          # Motor de preview A4 (renderA4Pages, _fillTemplate,
│   │   │   │                          #   parser GFM Markdown completo incluindo tabelas)
│   │   │   ├── Formatter.js           # Formatação / moeda / validatePhone / detectWallet
│   │   │   ├── IndexedDB.js           # Persistência offline de documentos
│   │   │   ├── Sanitizer.js           # Sanitização HTML (tags semânticas HTML5)
│   │   │   └── Storage.js             # Abstracção de localStorage
│   │   └── views/
│   │       └── Views.js               # Renderização de resultados + preview iframe
│   │   ├── app.js                     # Ponto de entrada principal
│   │   └── homeController.js          # Controller da página principal
│   └── css/
│       ├── styles.css                 # Estilos globais
│       ├── editor.css                 # Estilos do editor WYSIWYG
│       ├── admin.css                  # Estilos do painel admin
│       └── auth.css                   # Estilos de autenticação
│
├── supabase/
│   ├── schema.sql                     # Schema base (⚠️ desactualizado — usar migrations por ordem)
│   ├── migration_v8_1_blog_pages.sql
│   ├── migration_v8_2_admin_tables.sql
│   ├── migration_v8_pricing_temp_accounts.sql
│   ├── migration_v9_analytics_feedback.sql
│   ├── migration_v10_affiliates.sql
│   ├── migration_v10_online_userid.sql
│   ├── migration_v11_marketplace.sql
│   ├── migration_v12_refund_credit.sql
│   ├── migration_v12_community_templates.sql
│   ├── migration_v13_fix_signup_credits.sql
│   ├── migration_v14_affiliates_pro.sql
│   ├── migration_v15_receipt_verification.sql
│   ├── migration_v16_fix_signup_name_phone.sql
│   ├── migration_v17_legal_rag.sql            # pgvector + tabela legal_articles + busca semântica
│   ├── migration_v20_lei_associacoes_cooperativas.sql  # Seed: leis das associações/cooperativas
│   │                                                   # (gap v18/v19 é real no repositório)
│   ├── migration_v21_dynamic_signup_credits.sql        # Trigger lê free_credits_normal de system_settings
│   ├── migration_v22_seed_official_templates.sql       # Seed: 70 templates oficiais na galeria
│   ├── migration_v23_fix_gallery_view_html_css.sql     # Corrige view v_templates_gallery (faltava
│   │                                                   #   template_html/css → preview genérico)
│   ├── migration_v24_secure_orphan_credit_packages.sql # RLS na tabela credit_packages (estava
│   │                                                   #   sem políticas desde v8 — escrevível por anon)
│   └── supabase-partners-setup.sql            # Tabela `partners` (Rede de Parceiros)
│
├── tests/
│   ├── auth.test.js                   # Testes unitários AuthManager / AuthUI (jsdom)
│   ├── ocrSchemaAlignment.test.js     # Garante alinhamento schema OCR ↔ campos do formulário
│   └── rateLimit.test.js              # Testes para api/_lib/rateLimit.js
│
├── docs/
│   └── legal/
│       ├── VERIFICACAO-LEGAL.md       # Histórico de erros em citações legais corrigidos pelo RAG
│       └── textos-fonte/              # Textos oficiais de leis (ex: lei-associacoes.txt)
│
├── pages/                             # Páginas SEO estáticas (geradas pelo admin via GitHub API)
├── afiliado.html                      # Painel de afiliados
├── admin.html                         # Painel administrativo
├── admin-parceiros.html               # Gestão da Rede de Parceiros (admin)
├── parceiros.html                     # Listagem pública de parceiros
├── templates.html                     # Galeria comunitária de templates — inclui agora os modais
│                                      #   de Resultado/Créditos/Histórico (v25, ver abaixo)
├── perfil.html                        # NOVO (v25): página de conta do utilizador — dados pessoais,
│                                      #   segurança (email/password), avatar, plano/créditos,
│                                      #   documentos recentes clicáveis; Créditos e Arquivo abrem
│                                      #   em modal na própria página (payOverlay/historyOverlay
│                                      #   embutidos), sem navegar para "/"
├── index.html                         # App principal (PWA)
├── offline.html                       # Página offline
├── legal.html                         # Conformidade legal (Lei n.º 58/2021)
├── sw.js                              # Service Worker; CACHE_VERSION é reescrita automaticamente
│                                      #   a cada deploy por scripts/inject-version.js (formato
│                                      #   v<sha-git-7-chars>-<YYYYMMDD>) — o valor no repositório
│                                      #   é só um placeholder, não reflecte a versão em produção
├── manifest.json                      # PWA manifest
├── vercel.json                        # 12 functions + rewrites + crons + CSP (img-src inclui
│                                      #   https://*.supabase.co desde v25 — necessário para os
│                                      #   avatares de perfil carregados do Supabase Storage)
├── package.json                       # v11.0.0
└── scripts/
    └── inject-version.js              # Actualiza CACHE_VERSION automaticamente a cada deploy
```

---

## 🚀 Deploy

### 1. Pré-requisitos
- Conta Vercel (Hobby ou Pro — ver aviso comercial no topo)
- Projecto Supabase com extensão `pgvector` activada (necessária para o Motor Jurídico RAG — v17)
- Pelo menos uma conta de IA (quanto mais, maior a disponibilidade):
  Groq, Google AI Studio (Gemini), OpenRouter, Cerebras e/ou NVIDIA NIM — todas têm tier gratuito
- ~~Conta M-Pesa API~~ — **não é necessária.** Os pagamentos são confirmados por upload de
  comprovativo com verificação por IA ou manualmente. `MPESA_API_KEY`/`MPESA_SERVICE_CODE` são
  opcionais (apenas alteram a etiqueta "sandbox"/"produção" na interface).
- Opcional: conta CloudConvert (conversão de ficheiros), Upstash Redis (rate-limit persistente),
  Personal Access Token do GitHub (publicação automática de páginas SEO)

### 2. Variáveis de Ambiente (Vercel)

```
# Obrigatórias
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# IA — pelo menos 1 chave é obrigatória; quantas mais, maior a disponibilidade
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
CEREBRAS_API_KEY=csk-...
NVIDIA_API_KEY=nvapi-...

SITE_URL=https://mzdocs.co.mz

# Opcionais
MPESA_API_KEY=...                  # apenas para detectar modo sandbox/produção
MPESA_SERVICE_CODE=...             # ⚠️ nome real no código (não "MPESA_SERVICE_PROVIDER_CODE")
WA_SUPPORT_NUMBER=258858695506     # WhatsApp de suporte (tem este valor por defeito)
CLOUDCONVERT_API_KEY=...           # necessário para api/convert.js em modo cloud
LIBREOFFICE=false                  # true apenas em VPS com LibreOffice (não aplicável no Vercel)
CRON_SECRET=...                    # protege /api/cleanup-temp-accounts contra invocação externa
UPSTASH_REDIS_REST_URL=...         # rate-limit persistente entre instâncias serverless
UPSTASH_REDIS_REST_TOKEN=...       #   (sem isto, cai num Map local por instância — menos seguro)
GITHUB_OWNER=...                   # publicação automática de páginas SEO
GITHUB_REPO=...
GITHUB_TOKEN=...                   # Personal Access Token com escrita no repositório
```

> ⚠️ **Variáveis sem efeito (não usar):** `ADMIN_EMAILS` e `MPESA_PUBLIC_KEY` aparecem em versões
> antigas deste README mas **não são lidas em nenhum ficheiro do código**. O estado de administrador
> é controlado pela coluna `profiles.is_admin` — ver `supabase/EXECUTAR_promote_admin.sql`.

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

-- 5. Sistema de afiliados (base)
migration_v10_affiliates.sql

-- 6. Online sessions com user_id + Realtime
migration_v10_online_userid.sql

-- 7. Template Marketplace (schema base)
migration_v11_marketplace.sql

-- 8. Rede de Parceiros
supabase-partners-setup.sql

-- 9. Reembolso automático de créditos + tabela credit_logs
migration_v12_refund_credit.sql

-- 10. Marketplace comunitário (submissão, avaliação, destaque, partilha, template_uses)
migration_v12_community_templates.sql

-- 11. Corrige bónus de registo: 1 crédito / 30 dias
migration_v13_fix_signup_credits.sql

-- 12. Sistema de Afiliados Pro (segmentação, níveis, metas, anti-fraude)
migration_v14_affiliates_pro.sql

-- 13. Verificação automática de comprovativos (colunas novas em `transactions`)
migration_v15_receipt_verification.sql

-- 14. Corrige perfis criados sem nome/telefone
migration_v16_fix_signup_name_phone.sql

-- 15. Motor Jurídico RAG: pgvector, tabela legal_articles, função search_legal_articles
--     ⚠️ Requer extensão pgvector activada no Supabase (Dashboard → Extensions)
migration_v17_legal_rag.sql

-- 16. Seed: textos da Lei das Associações e Cooperativas (dados para o RAG)
migration_v20_lei_associacoes_cooperativas.sql

-- 17. Créditos de registo dinâmicos (trigger lê de system_settings em vez de valor fixo)
migration_v21_dynamic_signup_credits.sql

-- 18. Seed: 70 templates oficiais na galeria comunitária (galeria deixa de aparecer vazia)
migration_v22_seed_official_templates.sql

-- 19. Corrige view v_templates_gallery (faltavam colunas template_html/css → preview genérico)
migration_v23_fix_gallery_view_html_css.sql

-- 20. RLS na tabela credit_packages (estava sem políticas — escrevível por anon desde v8)
migration_v24_secure_orphan_credit_packages.sql

-- 21. Corrige estados de transacção inconsistentes
migration_v25_fix_transaction_status.sql

-- 22. Agendamento de publicação do blog
migration_v26_blog_scheduling.sql

-- 23. Monitorização dos providers de IA (uptime/latência por provider)
migration_v27_ai_provider_monitoring.sql

-- 24. Coluna published_at em blog_pages
migration_v28_blog_pages_published_at.sql

-- 25. Página de perfil público do utilizador
migration_v29_user_profile_page.sql

-- 26. Marketing Analytics — Fase 1: visitas, eventos, fontes
migration_v30_marketing_analytics.sql

-- 27. Marketing Analytics — Fase 2: atribuição de compras à fonte de marketing
--     ⚠️ Ficheiro corrompido/vazio no export usado na auditoria de 11/Jul/2026 — confirmar
--     no Supabase se já foi aplicado antes de tentar correr novamente
migration_v31_marketing_purchase_attribution.sql

-- 28. Marketing Analytics — Fase 3: QR codes geridos no admin
migration_v32_marketing_qrcodes.sql

-- 29. Marketing Analytics — Fase 4: funil de conversão + timeline/CRM por utilizador
migration_v33_funnel_crm.sql

-- 30. Marketing Analytics — Fase 5: campanhas, metas e notificações administrativas
migration_v34_campaigns_goals_notifications.sql

-- 31. Notificações push reais (VAPID)
migration_v35_push_notifications.sql

-- 32. Bónus de comissão por tier + crédito de boas-vindas por registo via afiliado
migration_v36_tier_bonus_and_referral_signup.sql

-- 33. Finanças: despesas operacionais + "Valor Levantável"
migration_v37_finance_expenses.sql

-- 34. Templates: corrige aprovação/rejeição + repartição de vendas com o criador
migration_v38_template_marketplace_split.sql

-- 35. Templates: preço sempre em créditos (remove price_mzn)
--     ⚠️ Executar SÓ depois da v38
migration_v39_template_credits_only.sql

-- 36. Limites de uso por documento (downloads + edições)
--     ⚠️ Executar depois das v37/v38/v39
migration_v40_document_usage_limits.sql

-- 37. Kit de Marketing dinâmico para afiliados (QR pessoal por peça)
migration_v41_marketing_materials.sql
```

> ⚠️ Existem ainda vários ficheiros avulsos na pasta `supabase/` (`EMERGENCIA_*`,
> `EXECUTAR_AGORA_*`, `migration_fix_*`, `migration_add_*`, `polices.sql`, `transactions.sql`)
> aplicados directamente em produção ao longo do tempo. Para uma instalação limpa, execute apenas
> a lista acima por ordem. Recomenda-se gerar um `schema_CURRENT.sql` a partir do Dashboard do
> Supabase (Database → Schema) como referência canónica.

### 4. Push para GitHub → Vercel faz deploy automático

---

## 🎨 Template Engine

### Fluxo completo:
```
Seleccionar Serviço → Preencher Formulário → [Amostra Grátis] → Gerar com IA
  → [Escolher Modelo] → Preview A4 em tempo real
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

**Total: 70 templates integrados (14 serviços × 5) + galeria comunitária extensível.**

> Existem **17 serviços** ao todo — os 14 acima têm templates visuais e geração por IA; mais 3
> (`impressao`, `foto`, `conversao`) não geram documento por IA — são pedidos encaminhados via
> WhatsApp (ver `ServiceDefinitions.js`).
>
> Cada categoria vive no seu próprio ficheiro em
> `assets/js/marketplace/templates/<categoria>.js`, agregados por `templates/index.js`.
> `TemplateLibrary.js` apenas reexporta esse agregado.

### Adicionar novo template:
```js
// Em assets/js/marketplace/templates/cv.js
// Adicionar ao array TEMPLATES exportado por esse ficheiro
// (NÃO editar TemplateLibrary.js directamente)
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
    htmlTemplate: `<div class="cv-page cv-two-col">...</div>`,
  },
];
```

---

## 📝 Editor de Documentos

O `DocumentEditor` abre um modal completo após a geração:

### Modos de edição:
- **Preview** — iframe A4 fiel ao template (motor `A4Renderer` — mesmo usado no TemplatePicker e na galeria)
- **Editar** — para documentos markdown: editor WYSIWYG com toolbar rica; para templates HTML com layout estruturado: iframe com `designMode='on'` que preserva cores, colunas e tipografia

### Toolbar disponível:
Fonte · Tamanho · **B** · *I* · U · S · Alinhamentos · Lista · Lista numerada · Recuo · Parágrafo/Título · Cor de texto · Fundo · Tabela · HR · Undo/Redo

### Export no editor:
| Formato | Motor | Fidelidade |
|---------|-------|-----------|
| PDF | `HTMLPDFExporter` (impressão) | Cores de fundo preservadas (`print-color-adjust: exact`) |
| Word (.docx) — template HTML | `HTMLToDocxExporter` | OOXML real, sidebar/2 colunas preservadas |
| Word (.docx) — documento académico | `WordExporter` | Times 12pt, margens normalizadas, capa automática |
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

## ⚖️ Motor Jurídico RAG (v17)

O Motor Jurídico substitui citações de lei estáticas (que continham erros — ver `docs/legal/VERIFICACAO-LEGAL.md`) por artigos de lei moçambicanos **reais**, recuperados via busca vectorial.

### Arquitectura:
```
Prompt builder (arrendamento/procuracao/requerimento/residencia/acta)
  → LegalContext.js (frontend) → POST /api/legal-search
    → api/_lib/legalSearch.js → pgvector (tabela legal_articles, embeddings de 768 dim)
      → artigos relevantes com score de confiança
        → incluídos no prompt com indicação "ARTIGO REAL"
        → se confiança < threshold → modelo avisado para não inventar citação
```

### Tabelas Supabase (migration_v17):
- `legal_articles` — artigos indexados com embedding vectorial
- `legal_sources` — diplomas legais (lei, decreto, portaria) com metadados
- `search_legal_articles(query_embedding, match_threshold, match_count)` — função RPC de busca

### Comportamento em falha:
`LegalContext.js` **nunca bloqueia** a geração. Se `/api/legal-search` falhar ou demorar mais que o timeout, devolve `null` e o prompt usa o texto base sem citações — o documento é sempre gerado.

---

## 🖼️ Extracção de Template por Imagem

O endpoint `POST /api/extract-template` aceita uma imagem (base64) e usa IA de visão (Gemini 2.5 Flash → OpenRouter fallback) para extrair a estrutura do documento e devolver um template `{ css, htmlTemplate }` pronto a usar.

```js
const result = await fetch('/api/extract-template', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64: '...', mimeType: 'image/jpeg' })
});
const { css, htmlTemplate } = await result.json();
```

---

## 🏪 Template Marketplace (API)

A galeria comunitária (`templates.html`) mostra preview A4 realista usando `SampleData.js` (dados de exemplo por categoria) renderizado pelo mesmo motor `A4Renderer` + `_fillTemplate` já usado no TemplatePicker — não é uma simulação separada.

### Endpoints disponíveis (todos via `/api/templates/<action>`):

| Action | Método | Auth | Descrição |
|--------|--------|------|-----------|
| `list` | GET | Público | Listar templates aprovados (legado) |
| `gallery` | GET | Público | Galeria paginada com filtros (usa `v_templates_gallery`) |
| `mine` | GET | Token | Templates submetidos pelo utilizador autenticado |
| `saved` | GET | Token | Templates guardados pelo utilizador |
| `save` | POST | Token | Guardar/desguardar template |
| `submit` | POST | Token | Submeter novo template |
| `rate` | POST | Token | Avaliar (1–5 estrelas) |
| `download` | POST | Público | Registar download |
| `use` | POST | Token | Registar uso de template (tabela `template_uses`) |
| `approve` | POST | Admin | Aprovar template |
| `reject` | POST | Admin | Rejeitar template com nota |
| `pending` | GET | Admin | Templates pendentes de aprovação |
| `report` | POST | Token | Reportar template |
| `share-token` | POST | Token | Gerar token de partilha por link |
| `by-token` | GET | Público | Obter template via share token |
| `delete` | POST | Token/Admin | Remover template |

### Workflow de aprovação:
```
Utilizador submete → status: "pending"
Admin aprova       → status: "approved" + is_public: true → aparece na galeria
Admin rejeita      → status: "rejected" + nota de rejeição
```

### Templates Oficiais:
`migration_v22_seed_official_templates.sql` insere os 70 templates oficiais na tabela `templates_custom` com `template_type = 'official'` e `status = 'approved'`, para que a galeria nunca apareça vazia numa instalação nova.

### Preço sempre em créditos (v38/v39)

A tabela acima cobre o consumo público/do utilizador (`/api/templates/<action>`). A **moderação e o preço** são geridos à parte, pelo admin, via `/api/admin/templates` (GET lista com filtro `status`, POST/PUT actualiza um ou vários):

- **v38** — corrigiu o Aprovar/Rejeitar (faltavam as colunas `approved_at`/`rejected_at`) e introduziu a repartição de receita: quando um template de outro utilizador é usado, **60%–70% da venda vai para o criador** e o resto para a plataforma (`author_share_percent`, sempre validado por `CHECK` na base de dados, nunca só no servidor).
- **v39** — o preço passou a ser **sempre em créditos** (`credit_cost`, a mesma moeda usada em toda a plataforma), nunca um valor MZN fixo definido pelo criador/admin. A coluna `price_mzn` foi **removida** de `templates_custom`; o equivalente em MZN mostrado no painel admin (`≈ X MZN`) é só informativo, calculado ao vivo a partir da taxa média dos pacotes de créditos activos (`estimateMznPerCredit()` em `api/_lib/packages.js` — a mesma fonte de verdade usada no checkout). `/api/admin/templates` devolve esse valor como `mzn_per_credit` (taxa) e `mzn_equivalent` (por template).
  > 🐛 Corrigido nesta auditoria: o handler de `/api/admin/templates` tinha ficado a meio desta migração — continuava a fazer `SELECT`/`UPDATE` de `price_mzn`, causando **500 "column templates_custom.price_mzn does not exist"** em toda a secção "Templates do Marketplace" do admin, e nunca devolvia `mzn_per_credit`/`mzn_equivalent` (que `AdminApp.js` já esperava).

---

## 📊 Analytics em Tempo Real

- **Online Agora**: Supabase Realtime (`postgres_changes` em `online_sessions`)
- **Visitas**: POST automático a cada carregamento + heartbeat a cada 90s
- **Session ID**: `localStorage` para persistência entre recargas
- **Fallback**: Polling a cada 20s se WebSocket falhar
- **Tracking externo**: GA4, Facebook Pixel, Microsoft Clarity via `Analytics.js`

---

## 📰 Blog / CMS + Publicação Automática de Páginas SEO

O admin (`admin.html`) tem um CMS de artigos (tabela `blog_pages`) com geração de conteúdo assistida por IA. Quando uma página é publicada com `published: true`, `api/admin/index.js` (função `_generateStaticPage`) **gera um HTML estático e publica-o directamente no repositório GitHub** via GitHub Contents API:

1. Gera `pages/<slug>/index.html` com `title`, `meta_description` e `content_html`.
2. Faz `PUT /repos/<owner>/<repo>/contents/pages/<slug>/index.html` — cria ou actualiza o ficheiro com commit directo no branch por omissão.
3. O push ao GitHub despoleta automaticamente um novo deploy no Vercel.

**Requer** `GITHUB_OWNER`, `GITHUB_REPO` e `GITHUB_TOKEN`. Sem elas, a publicação no `blog_pages` funciona normalmente, apenas sem gerar o HTML estático.

> ⚠️ É um commit directo (sem revisão). Trate o `GITHUB_TOKEN` com o mesmo cuidado que a `SUPABASE_SERVICE_ROLE_KEY`.

---

## 🤝 Sistema de Afiliados

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/affiliate/register` | Pedir código de afiliado |
| `GET /api/affiliate/dashboard` | Painel com ganhos e cliques |
| `POST /api/affiliate/click` | Registar clique (deduplicado por hash de IP) |
| `POST /api/affiliate/withdraw` | Pedir levantamento M-Pesa |
| `GET /api/affiliate/check?ref=` | Validar link publicamente |
| `GET /api/affiliate/ranking` | Ranking de afiliados do mês |
| `GET /api/affiliate/notifications` | Notificações do afiliado |
| `GET /api/affiliate/materials` | **NOVO (v41)** — Lista os materiais de marketing activos enviados pelo admin |
| `GET /api/affiliate/qrcode` | **NOVO (v41)** — Gera (em memória) o PNG do QR code pessoal do afiliado |

**Comissões por pacote** (configurável em `system_settings`, chave `aff_rate_<pacote>`):
Avulso 10% · Starter 15% · Básico 15% · Pro 20% · Empresa 20%.

### Kit de Marketing dinâmico (v41)

O admin envia materiais de marketing (panfletos/banners, com vídeo/áudio/PDF já previstos no esquema) a partir do painel (`admin.html` → "Kit de Marketing"), marcando visualmente sobre a imagem uma **zona de QR Code** (obrigatória) e, opcionalmente, uma **zona de texto** — ambas gravadas em percentagem (0–100) da imagem original, para funcionarem em qualquer resolução.

Quando um afiliado abre a sua área de Marketing (`afiliado.html`), cada peça é **composta no seu próprio browser** (via `<canvas>`) com o SEU QR code pessoal (e opcionalmente o seu código/nome) colado exactamente nessa zona — nenhuma cópia por afiliado fica gravada na base de dados; a composição acontece em tempo real a partir do material original + `/api/affiliate/qrcode`.

- **Tabela:** `marketing_materials` (`migration_v41_marketing_materials.sql`).
- **Gestão (admin):** `/api/admin/marketing-materials` — GET lista tudo, POST cria, PUT actualiza (incluindo activar/desactivar), DELETE remove. Implementado em `AdminApp.js` (`_loadMaterials`, `_openMaterialForm`, editor de arrastar/redimensionar as zonas de QR/texto, `_saveMaterial`, `_deleteMaterial`).
- **Consumo (afiliado):** `/api/affiliate/materials` (lista o que está activo) + `/api/affiliate/qrcode` (QR pessoal via biblioteca `qrcode`, já usada no projecto para os QR codes gerais do admin).
  > 🐛 Corrigido nesta auditoria: o botão "➕ Novo Material" já existia em `admin.html` mas chamava uma função (`adminApp._openMaterialForm`) que nunca tinha sido escrita — e `afiliado.html` já chamava as duas rotas de afiliado acima, que caíam sempre no `default` de `handleAffiliate` (404 "Acção não encontrada"). O Kit de Marketing tinha o desenho completo (SQL + HTML) mas nenhuma das duas pontas de código a servi-lo.

### Afiliados Pro (v14)

- **Segmentos** (`aff_segment`): `papelaria` · `cyber` · `universidade` · `explicacao` · `digitador` · `individual` — bónus configurável por segmento (`aff_bonus_papelaria` = +5%, `aff_bonus_cyber` = +3%, `aff_bonus_universidade` = +5%).
- **Níveis** (`aff_tier`): 🥉 bronze → 🥈 prata (5+ conversões) → 🥇 ouro (20+) → 💎 diamante (50+), calculados por `update_affiliate_tier()`. Diamante reduz o mínimo de levantamento para metade.
- **Bónus de comissão por tier (NOVO — v36)**: soma-se à taxa base + bónus de segmento — Bronze +0% · Prata +2% · Ouro +5% · Diamante +8% (`aff_tier_bonus_<tier>`). Antes da v36, `afiliado.html` já prometia isto ao utilizador mas `process_affiliate_commission_v2` nunca lia o tier — um afiliado Diamante ganhava sempre a mesma % que um Bronze do mesmo segmento.
- **Crédito de boas-vindas por registo via link (NOVO — v36)**: `aff_bonus_signup` concede créditos extra a quem se regista com `?ref=<código>`, via `grant_referral_signup_bonus()`. A chave já existia desde a v10 mas nunca era lida em lado nenhum — configuração morta até agora.
- **🐛 Bug crítico corrigido (v36):** `profiles.referred_by` nunca era gravado no caminho normal do signup em `api/auth/index.js` — só era incluído no PATCH de *fallback*, que praticamente nunca corre. Ou seja, comissões de afiliado por compras de utilizadores registados via link podiam estar a falhar silenciosamente para **todos** os registos normais desde que o programa de afiliados existe. Corrigido em paralelo em `api/auth/index.js` e na migration `v36`. Recomenda-se conferir manualmente na Supabase se há afiliados com cliques/registos aparentes mas sem comissões correspondentes, para compensar casos afectados.
- **Anti-fraude**: tabela `affiliate_fraud_flags` com eventos (`self_referral`, `ip_burst`, `fake_clicks`, `suspicious_conversion`) e severidade.

---

## ⚙️ Limites Vercel Hobby

> ⚠️ Ver aviso sobre uso comercial no topo deste documento.

| Recurso | Limite | Usado |
|---------|--------|-------|
| Serverless Functions | 12 | **12** ✅ (sem margem — `api/_lib/` não conta, prefixo `_`) |
| `generate-document.js` | 60s | — |
| `extract-template.js` | 60s | — |
| `convert.js` | 60s | — |
| `process-payment.js` | 30s | — |
| Restantes | 10–30s | — |
| Bandwidth | 100 GB/mês | — |

> **Regra:** Toda nova lógica de API deve ir em `api/misc.js` ou em functions existentes. Helpers partilhados vão em `api/_lib/`. Não criar novos ficheiros `.js` em `api/` sem verificar o limite de 12.

---

## 📱 PWA

- Service Worker com cache estratégico (`CACHE_VERSION` actualizada automaticamente a cada deploy por `scripts/inject-version.js`, ex.: `v21-20260629`)
- **Correcção v21 (20260629):** 33 ficheiros estavam ausentes do precache — ficheiros de prompts (`services/prompts/*.js`), templates do marketplace (`marketplace/templates/*.js`), `SampleData.js` e `LegalContext.js` — o que quebrava a geração de documentos em modo offline. Todos adicionados ao precache nesta versão.
- Funciona offline — documentos pendentes sincronizam quando a internet volta
- Instalável em Android e iOS (atalhos para CV, Carta, Trabalho, Orçamento)
- Background sync para documentos gerados offline

---

## 🔒 Segurança

- RLS activado em todas as tabelas Supabase (incluindo `credit_packages` — corrigido em v24)
- Tokens JWT validados em todos os endpoints privados via `api/_lib/supabaseAdmin.js`
- IPs hasheados (SHA-256) para tracking de cliques — sem dados pessoais
- `sanitizeHtml()` com lista explícita de tags permitidas
- Service Role Key nunca exposta ao cliente
- Erros internos do Supabase nunca devolvidos ao cliente — apenas em logs do servidor
- Rate limiting via Upstash Redis (com fallback gracioso para Map local)
- Contas temporárias limpas automaticamente via cron diário

---

## 💳 Pagamentos

### Pacotes de créditos

> **Nota (v24):** os preços abaixo são os valores de seed. Podem ser alterados pelo admin em Configurações → Preços, e reflectem-se imediatamente no checkout via `api/_lib/packages.js` (sem redeploy).

| Pacote | Créditos | Preço | MZN/crédito | Notas |
|--------|----------|-------|--------------|-------|
| Avulso | 3 | 50 MZN | 16.67 | Conta temporária, válida 7 dias |
| Starter | 10 | 120 MZN | 12.00 | — |
| Básico | 25 | 280 MZN | 11.20 | Pacote mais popular |
| Pro | 60 | 600 MZN | 10.00 | — |
| Empresa | 150 | 1500 MZN | 10.00 | Multi-utilizador |

> Não existe integração automática com a API de cobrança M-Pesa. `MPESA_API_KEY`/`MPESA_SERVICE_CODE` (se definidas) apenas alteram a etiqueta "sandbox"/"produção" na interface.

### Fluxo de confirmação — duas vias

**1. Verificação automática por IA visão (caminho principal)**
1. Utilizador escolhe pacote, introduz número moçambicano válido (prefixos `82–87`); `api/process-payment.js` regista em `transactions` (status `pending`) com referência única.
2. Upload do screenshot do comprovativo → `POST /api/verify-receipt`.
3. `api/_lib/visionAI.js` (Gemini → OpenRouter fallback) analisa: extrai valor, referência, estado e pontuação de confiança (0.0–1.0).
4. **Aprovação automática** se: confiança ≥ **0.85** *e* valor correcto (±1 MZN) *e* data ≤ 60 min *e* status de sucesso *e* hash do comprovativo não reutilizado. Créditos adicionados na hora via RPC `add_credits`.
5. Se falhar qualquer verificação ou confiança < 0.85 → status `review_needed` para o admin confirmar no painel.
6. Anti-abuso: máximo 3 uploads por IP por minuto (via `api/_lib/rateLimit.js`).

**2. Fallback manual via WhatsApp (sempre disponível)**
- Link pré-formatado (referência, pacote, valor, carteira detectada pelo prefixo) visível abaixo da área de upload.
- Admin confirma manualmente em `admin.html`.

### Reembolso automático de créditos

Se a geração de IA falhar completamente (todos os providers indisponíveis), **o crédito é devolvido automaticamente**:
1. `api/generate-document.js` chama `refund_credit(p_user_id, p_amount)` quando `Promise.any` rejeita.
2. A RPC incrementa `profiles.credits` e regista em `credit_logs` com `action = 'refund'`.
3. O cliente recebe `{ refunded: true, creditsRemaining }` e mostra notificação clara.

O mesmo mecanismo existe no `LongDocumentEngine` — se as fases 2/3 falharem após o débito, o crédito é reembolsado automaticamente.

---

## 📄 Limites de Uso por Documento (v40)

Cada documento gerado — grátis ou pago — passa a ter um número limitado de "tentativas": downloads do ficheiro final (PDF/Word/Excel) e edições manuais guardadas no editor integrado. O documento em si continua completo e sem marca de água desde o primeiro momento; o que é limitado é quantas vezes se pode voltar a mexer **naquele documento** depois de gerado, não a qualidade da primeira entrega.

| Origem do crédito | Downloads | Edições |
|---|---|---|
| Plano Grátis (1º crédito, oferecido no registo) | 3 | 2 |
| Planos pagos (starter/básico/pro/avulso) | 5 | 5 |
| Plano Empresa | ilimitado | ilimitado |

Quando os limites de um documento se esgotam, o utilizador pode gastar 1 crédito da sua conta para desbloquear mais tentativas **naquele documento específico** (+3 downloads ou +2 edições — o mesmo valor-base do plano grátis, independentemente do plano original).

Os limites são calculados e aplicados inteiramente no servidor (trigger + funções `SECURITY DEFINER` a partir do histórico real em `credit_logs`) — nunca a partir de valores enviados pelo browser. Um `UPDATE` directo à tabela `documents` feito pelo cliente (ex: ao gravar o conteúdo editado) nunca consegue alterar os contadores de uso; só as funções da `migration_v40_document_usage_limits.sql` o conseguem fazer.

---

## 💰 Finanças (v37)

Separador "Finanças" do painel admin (`admin.html` → `AdminApp.js:_loadFinance`, `api/admin/index.js` acção `finance`), que mostra quanto dinheiro pode realmente ser levantado da plataforma:

```
Valor Levantável = Receita Total Confirmada
                  − Saldo reservado para Afiliados (profiles.aff_balance)
                  − Despesas Operacionais registadas (finance_expenses)
                  − Já Levantado pelo dono (finance_withdrawals)
```

- **Despesas operacionais** (`finance_expenses`): domínio, hosting, providers de IA pagos ou outras, com opção de marcação como recorrente.
- **Custos recorrentes configuráveis** em `system_settings` (chaves `finance_*`) — domínio anual, plano Vercel, orçamento de providers de IA — amortizados automaticamente por mês.
- A taxa de câmbio USD→MZN usada para converter custos em dólar é sempre obtida em tempo real, nunca fixa no código ou na migração.

---

## 🛠️ Alterações — Auditoria Junho 2026 (v12)

| Ficheiro | Alteração |
|---|---|
| `api/_lib/supabaseAdmin.js` | **Novo.** Cliente Supabase via fetch puro, sem SDK/`ws`. |
| `api/deduct-credit.js` | Reescrito (v3.0); novo modo `refund`. |
| `api/generate-document.js` | Removido `require('ws')`; reembolso automático em falha total. |
| `api/process-payment.js` | Reescrito (v3.0); erros do Supabase não expostos; aceita M-Pesa/e-Mola/mKesh. |
| `assets/js/services/Services.js` | Envia `cost`; propaga `refunded`/`creditsRemaining` em erro. |
| `assets/js/controllers/DocumentController.js` | Trata `err.refunded` — actualiza saldo e avisa utilizador. |
| `supabase/migration_v12_refund_credit.sql` | **Novo.** RPC `refund_credit` + índice em `credit_logs`. |

---

## 🛠️ Alterações — v13 a v16 (pós-auditoria)

| Migração / Ficheiro | Alteração |
|---|---|
| `migration_v12_community_templates.sql` | Estende `templates_custom` (template_type, featured, share_token, template_uses...). |
| `migration_v13_fix_signup_credits.sql` | Fix bug: trigger `handle_new_user()` atribuía 3 créditos em vez de 1 / 30 dias. |
| `migration_v14_affiliates_pro.sql` | Afiliados Pro: segmentação, níveis, metas, `affiliate_fraud_flags`. |
| `migration_v15_receipt_verification.sql` | Colunas de verificação em `transactions` + status `review_needed`. |
| `migration_v16_fix_signup_name_phone.sql` | Fix: trigger `ON CONFLICT DO NOTHING` impedia salvar nome/telefone. |
| `api/misc.js` → v3.0 | Nova rota `POST /api/verify-receipt`; rate-limit; hash SHA-256 anti-reutilização. |
| `api/_lib/visionAI.js` | **Novo.** Helper de IA visão partilhado. |
| `assets/js/marketplace/templates/*.js` | `TemplateLibrary.js` (~1600 linhas) dividido em 14 ficheiros + `templates/index.js`. |

---

## 🛠️ Alterações — v17 a v24 (Fase 2 + auditoria de consistência)

| Migração / Ficheiro | Alteração |
|---|---|
| `migration_v17_legal_rag.sql` | **Motor Jurídico RAG:** pgvector, `legal_articles`, `legal_sources`, `search_legal_articles()`. |
| `migration_v20_lei_associacoes_cooperativas.sql` | Seed de artigos da Lei das Associações e Cooperativas (corrige dois diplomas inexistentes que estavam nos prompts). |
| `migration_v21_dynamic_signup_credits.sql` | Trigger `handle_new_user()` passou a ler `free_credits_normal`/`free_credits_expiry_days` de `system_settings`. |
| `migration_v22_seed_official_templates.sql` | Insere 70 templates oficiais na galeria comunitária (`template_type = 'official'`). |
| `migration_v23_fix_gallery_view_html_css.sql` | Corrige `v_templates_gallery` que omitia `template_html`/`template_css` → preview sempre genérico. |
| `migration_v24_secure_orphan_credit_packages.sql` | Activa RLS em `credit_packages` (estava sem políticas desde v8 — legível e escrevível por anon). |
| `api/_lib/legalSearch.js` | **Novo.** Busca vectorial pgvector para o Motor Jurídico. |
| `api/_lib/packages.js` | **Novo.** Única fonte de verdade dos pacotes (eliminou duplicação em 5 locais). |
| `api/_lib/rateLimit.js` | **Novo.** Rate-limit via Upstash Redis extraído para módulo partilhado. |
| `assets/js/services/LegalContext.js` | **Novo.** Ponte frontend ↔ `/api/legal-search`. |
| `assets/js/services/LongDocumentEngine.js` | v2.0: débito de crédito movido para DEPOIS do planeamento (fix: crédito perdido em falha de planeamento). |
| `assets/js/marketplace/SampleData.js` | **Novo.** Dados de exemplo realistas por categoria para preview da galeria. |
| `assets/js/services/SmartOCRService.js` | v4.0: IA visual primeiro; Tesseract apenas como complemento. |
| `api/generate-document.js` | v2.1: modo amostra grátis (`_previewMode`); custo progressivo para docs longos. |
| `sw.js` | CACHE_VERSION `v21-20260629`: 33 ficheiros adicionados ao precache (prompts, templates, SampleData, LegalContext). |
| `tests/auth.test.js` | **Novo.** Testes unitários AuthManager/AuthUI. |
| `tests/ocrSchemaAlignment.test.js` | **Novo.** Garante alinhamento schema OCR ↔ campos do formulário. |
| `tests/rateLimit.test.js` | **Novo.** Testes para `api/_lib/rateLimit.js`. |

---

## 🛠️ Alterações — v25 (auditoria Julho 2026 — self-service de conta + bugs de produção)

Esta ronda partiu de reports directos de utilização em produção (não uma auditoria de código a frio), pelo que cada linha abaixo corresponde a um sintoma real observado no telemóvel.

| Ficheiro | Alteração |
|---|---|
| `perfil.html` | **Praticamente reescrito.** Antes, os botões "Comprar Créditos" e "Ver arquivo completo" apenas faziam `href="/"` — largavam o utilizador na home sem completar a acção. Agora incluem a marcação dos modais `payOverlay`/`historyOverlay` (mesmos IDs que `index.html`) e instanciam `PaymentController`/`HistoryController` directamente na página — Créditos e Arquivo abrem **sem sair do perfil**. Também: avatar com melhor feedback de erro (mensagens de erro deixam de desaparecer sozinhas ao fim de 6s), lista de "Documentos Recentes" tornada clicável (reutiliza o visualizador "lite" do `HistoryController`), select do Supabase passou a trazer `content` (antes só trazia metadados). |
| `assets/js/app.js` | Removido o botão 👤 redundante no header (duplicava a função do avatar/"M", que já abre o dropdown). Dropdown do utilizador corrigido: "O Meu Perfil" e "Painel de Controlo" apontavam praticamente para o mesmo scroll (`/perfil.html` vs `/perfil.html#painel`, sendo `#painel` uma marca vazia colada ao topo) — agora "O Meu Perfil" vai à secção de Dados Pessoais (`#dados`) e "Painel de Controlo" fica no topo (KPIs + acções rápidas). Adicionado suporte a deep-links `?topup=1`/`?history=1` para abrir modais a partir de outras páginas. |
| `assets/js/controllers/HistoryController.js` | O fallback para o visualizador "lite" (usado em páginas sem o editor A4 completo) confiava só em `window.docController` estar definido. Como `app.js` define essa variável em **qualquer** página onde é incluído — mesmo sem a marcação completa (caso de `templates.html`) — isso causava `TypeError: Cannot set properties of null` ao tentar escrever em `#resModel`/`#resMeta`, que não existiam nessa página. Guard reforçado: agora também confirma que `#resultOverlay`/`#resModel` existem mesmo no DOM antes de usar o editor completo. |
| `assets/js/views/Views.js` | `_renderResultInner` escrevia directamente em `document.getElementById('resModel')`/`resMeta` sem verificar se existiam — blindado com verificação de nulidade, para nunca mais interromper a função a meio (o que deixava o modal com o título do documento anterior em vez do actual). |
| `templates.html` | Três bugs distintos, todos reais: **(1)** a página carrega `app.js` completo (liga os botões 📁/⚡ do header) mas nunca tinha a marcação dos modais — cliques nesses botões não faziam nada; adicionada a marcação de `resultOverlay`/`payOverlay`/`historyOverlay`. **(2)** `openDetail(id)` chamava `renderTemplatePreview(t)` **antes** de preencher título/descrição, sem try/catch — se o preview de um template específico falhasse, a função parava a meio e o modal ficava a mostrar o título do último template aberto com sucesso (parecia que "todos os cards abrem o mesmo template"). Corrigido: texto preenchido primeiro, preview isolado num try/catch. **(3)** os cliques nos cards eram religados a cada "carregar mais"/filtro (`querySelectorAll(...).forEach(...)` sem limpar os anteriores), acumulando listeners duplicados nos cards mais antigos — substituído por um único listener delegado no grid. |
| `api/misc.js` (`tplList`) | **Bug crítico, causa raiz real do ponto (2) acima.** A função ignorava por completo `req.query.id`. `templates.html` chama `/api/templates/list?id=eq.<uuid>&limit=1` para abrir um template específico, mas sem o filtro de `id` a query executada era sempre "ORDER BY downloads DESC LIMIT 1" — devolvia sempre o template mais descarregado do catálogo inteiro, fosse qual fosse o `id` pedido. Corrigido com validação estrita de formato UUID (evita injecção de filtros extra via query string) antes de aplicar `&id=eq.<uuid>` ao pedido ao Supabase. |
| `vercel.json` (CSP) | A directiva `img-src` nunca incluiu `https://*.supabase.co` — os avatares (guardados no Supabase Storage) eram bloqueados pelo browser mesmo com o upload a funcionar correctamente (o erro só aparecia na consola: "Refused to load the image ... violates CSP"). Adicionado `https://*.supabase.co` ao `img-src`. |
| `sw.js` (`CACHE_VERSION`) | Confirmado que já é auto-gerido por `scripts/inject-version.js` a cada deploy (`v<sha>-<data>`) — o bump manual feito durante o diagnóstico desta ronda era redundante mas inofensivo, dado que o build sempre sobrescreve o valor. |



- **Migração para `api/_lib/supabaseAdmin.js` (estado actual):**
  - ✅ Já migradas (sem `@supabase/supabase-js` nem `require('ws')`): `deduct-credit.js`, `process-payment.js`, `generate-document.js`, `auth/index.js`, `verify-credits.js`, `partners.js`, `delete-temp-account.js`, `cleanup-temp-accounts.js`.
  - ✅ Nunca precisaram do SDK: `extract-template.js`, `convert.js`.
  - 🟡 **Parcialmente migrado:** `misc.js` — usa `supabaseAdmin.js` na maioria das rotas, mas mantém `makeSdkClient()` interno (SDK + `ws`) para `handleAffiliate` e `handleTemplates`.
  - ❌ **Ainda não migrado:** `api/admin/index.js` — usa `@supabase/supabase-js` + `require('ws')` integralmente (75 KB, o maior ficheiro de API; migrar requer mais cuidado).

- **Blog / CMS** (`api/admin/index.js`, `blog_pages`) — geração de artigos por IA e fluxo de publicação automática para GitHub não foram revistos a fundo.

- **Painel Admin completo** (`admin.html`, `AdminApp.js`) — gestão de utilizadores, confirmação manual de pagamentos, analytics, feedback e logs testados superficialmente.

- **Sistema de Afiliados** — apenas a integridade do débito/reembolso de créditos foi verificada; o cálculo de comissões, níveis e levantamentos não foi auditado a fundo.

- **Rede de Parceiros** (`api/partners.js`, `parceiros.html`, `admin-parceiros.html`) — fluxo de cadastro, geolocalização e exibição no mapa não foram testados.

- **Conteúdo do Motor Jurídico RAG** — apenas a Lei das Associações/Cooperativas tem seed nos ficheiros de migração. Os restantes diplomas jurídicos (Lei do Arrendamento, Código Civil, etc.) precisam de ser adicionados à tabela `legal_articles` manualmente ou via script.

- **Consolidação do schema SQL** — a pasta `supabase/` tem vários ficheiros avulsos (`EMERGENCIA_*`, `EXECUTAR_*`, `migration_fix_*`, etc.) aplicados directamente em produção. Recomenda-se gerar um `schema_CURRENT.sql` a partir do Dashboard do Supabase como referência canónica.

---

## 🛠️ Alterações — v26 (Marketing Analytics, Push real, correcções de afiliados)

Ronda de trabalho de 10–11 de Julho/2026, cobrindo três frentes: o sistema de Marketing
Analytics completo (5 fases), notificações push reais, e uma auditoria dedicada ao sistema de
afiliados que encontrou uma falha silenciosa a afectar comissões desde sempre.

| Ficheiro / Migração | Alteração |
|---|---|
| `migration_v30_marketing_analytics.sql` | Fase 1 — fundação: tabelas `marketing_visits`, `marketing_events`, `marketing_sources`, agregação diária, sem duplicar `page_views`/`online_sessions` (v9) nem `ai_provider_daily_usage` (v27) já existentes. |
| `migration_v31_marketing_purchase_attribution.sql` | Fase 2 — liga compras confirmadas à fonte de marketing que originou a visita. |
| `migration_v32_marketing_qrcodes.sql` | Fase 3 — QR codes geridos no admin, registados como `marketing_sources` (`type='qr'`), reaproveitando a agregação já construída nas fases 1–2. |
| `migration_v33_funnel_crm.sql` | Fase 4 — dashboard de funil (visita → registo → documento gerado → compra, com taxa de conversão por passo) e timeline/CRM por utilizador, incluindo actividade anónima pré-registo. |
| `migration_v34_campaigns_goals_notifications.sql` | Fase 5 — campanhas, metas e notificações administrativas. |
| `assets/js/services/MarketingTracker.js` | **NOVO.** Módulo cliente que alimenta as 5 fases acima. |
| `migration_v35_push_notifications.sql` + `api/_lib/webpush.js` | **NOVO.** Notificações push reais (Android/Chrome) via infraestrutura VAPID — tabela `push_subscriptions` para subscrições de clientes e admins. Funciona com a app fechada, uma vez instalada como PWA. |
| `migration_v36_tier_bonus_and_referral_signup.sql` | Ver detalhe completo na secção "Sistema de Afiliados" acima — bónus de comissão por tier, crédito de boas-vindas por registo via link, e correcção do bug crítico de `referred_by` nunca gravado no signup normal. |
| `admin.html` / `AdminApp.js` | Correcção de incompatibilidade de classes CSS que deixava modais do admin sem estilo (apareciam "nus", sem layout). |
| `afiliado.html` | Removidas promessas de marketing sem implementação correspondente no código (a página tinha texto a anunciar funcionalidades que não existiam ainda — corrigido para reflectir só o que está realmente activo). |
| `index.html` / `assets/js/app.js` | Removido por completo o banner morto `#sandboxBar` ("Modo Sandbox — Pagamentos M-Pesa não são reais") e o código JS que o mantinha forçosamente oculto. Resquício do antigo modo M-Pesa automático (nunca usado em produção — o projecto é 100% pagamento manual via WhatsApp); já estava sempre oculto por CSS + JS, mas mantinha-se como marcação morta e um pequeno risco caso a linha que o oculta fosse alguma vez removida por engano. |

> ⚠️ **Nota sobre `migration_v31_marketing_purchase_attribution.sql`:** o ficheiro tal como está
> neste repositório contém apenas bytes nulos (ficheiro corrompido/vazio no export usado para
> esta auditoria). Confirmar no Supabase se a migração já foi aplicada em produção antes de a
> tentar correr novamente; se não tiver o SQL original, recriar a partir do histórico do
> Supabase Dashboard ou do commit correspondente no GitHub.

---

## 🛠️ Alterações — v27 (Finanças, Templates em créditos, Limites de uso, Kit de Marketing)

Ronda de trabalho de 17 de Julho/2026. Cobre as migrações `v37` a `v41` (já existentes no
repositório mas nunca antes documentadas neste README) e uma auditoria dedicada aos dois
pontos que ainda estavam incompletos entre o código e essas migrações — a secção "Templates
do Marketplace" e o Kit de Marketing dos afiliados, ambos rebentando em produção.

| Ficheiro / Migração | Alteração |
|---|---|
| `migration_v37_finance_expenses.sql` | **NOVO.** Despesas operacionais (`finance_expenses`) e cálculo de "Valor Levantável" — ver secção "Finanças" acima. |
| `migration_v38_template_marketplace_split.sql` | **NOVO.** Colunas `approved_at`/`rejected_at` em `templates_custom` (faltavam desde sempre) e repartição de vendas 60%–70% para o criador do template (`author_share_percent`). |
| `migration_v39_template_credits_only.sql` | **NOVO.** Remove `templates_custom.price_mzn` — o preço passa a ser sempre `credit_cost`; `process_template_sale` passa a receber o valor em MZN já calculado pela API (`credit_cost × taxa MZN/crédito do momento`) em vez de o ler de `price_mzn`. |
| `migration_v40_document_usage_limits.sql` | **NOVO.** Limites de downloads/edições por documento gerado — ver secção "Limites de Uso por Documento" acima. |
| `migration_v41_marketing_materials.sql` | **NOVO.** Tabela `marketing_materials` para o Kit de Marketing dos afiliados — ver secção "Kit de Marketing dinâmico" acima. |
| `api/admin/index.js` | 🐛 **Corrigido:** `handleTemplates` (rota `/api/admin/templates`) ainda seleccionava e gravava `price_mzn`, coluna removida pela `migration_v39` — causava 500 ("column templates_custom.price_mzn does not exist") em toda a secção "Templates do Marketplace" do admin. Passa a calcular `mzn_per_credit`/`mzn_equivalent` ao vivo via `api/_lib/packages.js`, como o `AdminApp.js` já esperava. · **Novo:** rota `/api/admin/marketing-materials` (GET/POST/PUT/DELETE) para o CRUD dos materiais do Kit de Marketing. |
| `api/misc.js` | **Novo:** rotas `materials` e `qrcode` em `handleAffiliate` (`/api/affiliate/materials`, `/api/affiliate/qrcode`) — antes inexistentes; `afiliado.html` já as chamava, mas caíam sempre no `default` (404 "Acção não encontrada"). |
| `assets/js/admin/AdminApp.js` | **Novo:** gestão completa do Kit de Marketing — `_loadMaterials`, `_openMaterialForm`/`_closeMaterialForm`, upload e pré-visualização de imagem, editor visual de arrastar/redimensionar as zonas de QR e de texto (`_setupMatZoneDragging`), `_saveMaterial`, `_toggleMaterialActive`, `_deleteMaterial`. O botão "➕ Novo Material" já existia em `admin.html` desde a `v41`, mas chamava `adminApp._openMaterialForm()`, uma função que nunca tinha sido escrita. |

> ✅ **Acção necessária:** se ainda não foram corridas em produção, executar no SQL Editor do
> Supabase, por esta ordem: `migration_v37_finance_expenses.sql` → `migration_v38_template_
> marketplace_split.sql` → `migration_v39_template_credits_only.sql` → `migration_v40_
> document_usage_limits.sql` → `migration_v41_marketing_materials.sql`. Sem elas, os erros 500
> descritos acima voltam a acontecer mesmo com o código já corrigido.

---

## 📦 Versões

| Componente | Versão | Nota |
|------------|--------|------|
| `package.json` | `11.0.0` | — |
| `sw.js` (CACHE_VERSION) | auto-gerado a cada deploy | formato `v<sha-git-7-chars>-<YYYYMMDD>`, escrito por `scripts/inject-version.js` — o valor no repositório é só um placeholder |
| `README.md` | `v27` (esta edição) | — |
| `assets/js/admin/AdminApp.js` | **v27** | **NOVO:** gestão completa do Kit de Marketing (materiais dos afiliados) — ver "Alterações — v27" |
| `assets/js/services/MarketingTracker.js` | v26 | cliente do Marketing Analytics (Fases 1–5) |
| `api/_lib/webpush.js` | v26 | envio de notificações push via VAPID |
| `index.html` | v26 | banner `#sandboxBar` removido (código morto) |
| `perfil.html` | v25 | página de conta com Créditos/Arquivo em modal embutido (sem navegar para "/") |
| `templates.html` | v25 | modais Resultado/Créditos/Histórico adicionados; `openDetail()` corrigido (texto antes do preview); listener de clique delegado |
| `api/misc.js` | `v3.1` | 🟡 parcialmente migrado · v25: `tplList` corrigido para filtrar por `id` · **v27: NOVO** `handleAffiliate` ganhou as acções `materials`/`qrcode` (Kit de Marketing) |
| `vercel.json` (CSP) | v25 | `img-src` agora inclui `https://*.supabase.co` (avatares) |
| `assets/js/controllers/HistoryController.js` | v25 | guard do visualizador "lite" reforçado (confirma DOM, não só `window.docController`) |
| `assets/js/views/Views.js` | v25 | `_renderResultInner` blindado contra elementos ausentes |
| `assets/js/app.js` | v26 | v25: dropdown do utilizador corrigido; ícone duplicado removido; deep-links `?topup=1`/`?history=1` · v26: removida referência ao banner morto `#sandboxBar` |
| `api/_lib/supabaseAdmin.js` | — | helper sem versão explícita |
| `api/_lib/visionAI.js` | `v1.0` | — |
| `api/_lib/legalSearch.js` | — | NOVO (v17) |
| `api/_lib/packages.js` | — | preços dinâmicos · v27: `estimateMznPerCredit()` passou a ser usado também por `/api/admin/templates` |
| `api/_lib/rateLimit.js` | — | NOVO (rate-limit partilhado) |
| `api/auth/index.js` | `v2.1` | — |
| `api/admin/index.js` | `v2.1` | ⚠️ ainda usa SDK legacy · **v27:** `handleTemplates` corrigido (removida referência a `price_mzn`, adicionado `mzn_per_credit`/`mzn_equivalent`); **NOVO** `handleMarketingMaterials` (`/api/admin/marketing-materials`) |
| `api/process-payment.js` | `v5.0` | — |
| `api/deduct-credit.js` | `v3.0` | — |
| `api/generate-document.js` | `v2.1` | amostra grátis + custo progressivo |
| `api/verify-credits.js` | `v3.0` | — |
| `api/extract-template.js` | `v2.0` | — |
| `api/partners.js` | `v2.0` | — |
| `api/delete-temp-account.js` | `v9.0` | — |
| `api/cleanup-temp-accounts.js` | `v9.0` | — |
| `api/convert.js` | sem versão | — |
| `assets/js/services/SmartOCRService.js` | `v4.0` | — |
| `assets/js/services/LongDocumentEngine.js` | `v2.0` | — |
| Migrações Supabase | até `migration_v41` | ver secção "Alterações — v27"; `v31` corrompida no export desta auditoria (ver aviso acima) |
| Templates integrados | 70 (14 serviços × 5) | 17 serviços no total |

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · [mzdocs.co.mz](https://mzdocs.co.mz)*
