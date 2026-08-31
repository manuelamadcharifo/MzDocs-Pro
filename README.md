# MzDocs Pro

Plataforma moçambicana de geração, edição e exportação de documentos profissionais com IA.
PWA instalável (Android/iOS), construída para o Vercel Hobby (limite: 12 Serverless Functions —
**9 em uso, 3 de margem** desde a consolidação de Ago/2026, ver secção 10), Supabase (PostgreSQL +
pgvector) e pagamento manual por carteira móvel (M-Pesa, e-Mola, mKesh).

> 📌 **Nota sobre este README:** actualizado em Agosto/2026 a partir de uma leitura directa do
> código-fonte no export mais recente. A versão anterior deste ficheiro não cobria a ronda de
> correcções mais recente (mesmo mês, depois de tudo o que já está descrito abaixo): **(a)** bug
> real de margem zero no PDF descarregado de "Trabalho Escolar" (`_extractPageMargin()` em
> `HTMLPDFExporter.js` apanhava sempre a primeira regra `body{...padding...}` da CSS partilhada,
> que por acaso é `padding:0` — nunca a regra real de margem mais abaixo); **(b)** nome de
> ficheiro genérico ("Trabalho Escolar") em vez do nome completo ao "Guardar como PDF" (o
> `<title>` da janela de impressão, usado pelo browser para sugerir o nome, estava fixo no título
> do serviço em vez do nome do documento); **(c)** custo em créditos fixo (1) para "Trabalho
> Escolar" independentemente do nº de páginas pedido — passou a dinâmico, 1 crédito a cada 5
> páginas de desenvolvimento; **(d)** reformulação completa do prompt de "Trabalho Escolar"
> (`prompts/trabalho.js`) — "páginas pretendidas" passou a significar só páginas de
> desenvolvimento (antes descontava 3 do valor pedido para capa/índice/etc, produzindo sempre
> menos do que o pedido); estrutura académica completa para níveis universitários (Folha de
> Rosto, Dedicatória/Agradecimentos/Epígrafe opcionais, Resumo e Palavras-chave); números do
> Índice calculados matematicamente a partir da densidade de palavras/página calibrada por nível,
> em vez de adivinhados; tecto de tokens do servidor (`api/generate-document.js`) calculado a
> partir do nº de páginas pedido em vez de um valor fixo; **(e)** capa sem tabela, redesenhada com
> hierarquia tipográfica (`CoverNormalizer.js`); **(f)** numeração de página real impressa em
> cada folha do PDF (`@page { @bottom-center }`); **(g)** alternador Papelarias/Advogados no ecrã
> de resultado (antes só mostrava advogados, e só para 6 tipos de documento jurídicos) — passou a
> aparecer para qualquer documento gerado, com Papelarias como parceiro principal por omissão, e
> ligado também à reabertura de documentos "Do Arquivo" (antes só aparecia logo a seguir a gerar);
> corrigido em conjunto um bug real em que seleccionar uma papelaria no ecrã de resultado não
> tinha nenhum botão para enviar o pedido; **(h)** botão genérico "WhatsApp" do ecrã de resultado
> deixou de (i) abrir sempre uma conversa com o número de suporte da própria plataforma em vez de
> deixar escolher o destinatário, e (ii) despejar um excerto em bruto do conteúdo do documento
> (Markdown mal formatado) — passou a ser uma mensagem curta pensada para conversão, com o link de
> afiliado da pessoa quando tem sessão iniciada — ver secções 1, 4, 8 e 15 para o detalhe completo
> de cada um.
>
> A versão anterior a essa não cobria: **(1)** a
> correcção do bug real "Não foi possível planear o documento" (JSON de planeamento cortado a meio
> por falta de tokens, sem qualquer reparo/retry — ver secção 3.3); **(2)** a auditoria completa
> de Agosto/2026 aos providers de IA — NVIDIA NIM, Together AI e Fireworks AI removidos (deixaram
> de ter tier grátis viável), 4 providers novos ligados (GitHub Models, Cloudflare Workers AI,
> Hugging Face Inference, Cohere), disjuntor corrigido para aceitar descoberta ao vivo, e um novo
> sistema de alertas operacionais por Telegram+WhatsApp com cron diário de vigilância — ver secção
> 3; **(3)** o botão "🔄 Reactivar" no painel admin (IA Providers), que limpa manualmente o
> disjuntor de um provider sem esperar o cooldown automático — ver secção 3.3; **(4)** a
> visibilidade, no painel admin (lista de Utilizadores + Timeline/CRM), do estado do "primeiro
> documento grátis" de cada conta (v66) — antes inexistente, o que tornava impossível saber se uma
> conta com 0 créditos ainda tinha direito a gerar ou já tinha usado o benefício — ver secção 8. A
> versão anterior a essa cobria só até à `v65` — faltava documentar a `v66` (o primeiro
> documento de uma conta é sempre grátis, não um saldo inicial de 1 crédito; 2 para quem se
> regista via link de afiliado; nunca se aplica a templates pagos) — ver secções 9 e 15. A versão
> anterior a essa cobria só até à `v64` — faltava documentar a `v65` (pacotes de créditos
> exclusivos por categoria de parceiro/afiliado, validados sempre no servidor; ponte bidireccional
> entre o painel de afiliado e o Portal da Parceira) — ver secções 9 e 15. A versão anterior a essa
> cobria só até à `v61` — faltavam documentar a `v62` (campo WhatsApp em `profiles` + consentimento
> de marketing), a `v63` (agendamento real com parceiros, tabela `bookings`), a `v64` (compra
> permanente de templates pagos, tabela `template_purchases`) e a unificação de larguras
> `.container`/`.sheet`/`.a4-page` no CSS (secção 15). A versão anterior a essa tinha ficado
> desactualizada em relação às migrações `v57`–`v60`, aos scripts de manutenção em `scripts/`, ao
> CI/lint (`.github/workflows/test.yml`, `eslint.config.mjs`) e à observabilidade estruturada
> (`api/_lib/observability.js`, `docs/observability.md`). Este documento reflecte o estado do
> código tal como está — não o histórico ronda-a-ronda, que passa a viver apenas na secção
> "Histórico de Versões" no fim.
>
> ⚠️ **Nota de nomenclatura que confunde ao ler o histórico:** existem duas coisas diferentes
> chamadas "v57" no projecto — a migração `migration_v57_atomic_payment_confirmation.sql` (base de
> dados) e a "ronda v57" da secção 14 (correcções de OCR multi-página, código de front-end). Não é
> o mesmo v57 e não têm relação directa; é uma coincidência de numeração entre o histórico de
> migrações SQL e o histórico de rondas de correcção descrito em prosa.

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
12. [Scripts de manutenção, CI/CD e Observabilidade](#12-scripts-de-manutenção-cicd-e-observabilidade)
13. [Dívida técnica e problemas conhecidos (honesto, sem filtro)](#13-dívida-técnica-e-problemas-conhecidos-honesto-sem-filtro)
14. [Conformidade legal (Moçambique)](#14-conformidade-legal-moçambique)
15. [Histórico de versões](#15-histórico-de-versões)

---

## 1. Funcionalidades principais

| Funcionalidade | Descrição | Estado verificado |
|---|---|---|
| **Geração com IA — 10 providers com adaptador funcional** (0 catalogados sem adaptador — auditoria Ago/2026) | Corrida por tiers com fallback automático e controlo de custo; ver secção 3 | ✅ Código confirmado — muito além dos "5 providers" descritos em versões antigas deste README |
| **Descoberta de modelos ao vivo** | Antes de confiar numa lista fixa de modelos, o sistema consulta `GET /models` do próprio provider e usa o catálogo real; desde Ago/2026 também pode desbloquear um disjuntor permanente se confirmar, agora mesmo, que o modelo voltou a existir | ✅ `api/_lib/modelDiscovery.js` |
| **Disjuntor (circuit breaker) por modelo e por provider + reactivação manual (NOVO — Ago/2026)** | Desliga automaticamente um modelo específico que esteja a falhar — 7 dias se for descontinuação permanente, com backoff crescente (10min→30min→2h) se for falha transitória; também vigia o provider como um todo (5 esgotamentos totais seguidos dispara alerta); botão "🔄 Reactivar" no admin limpa o disjuntor manualmente, sem esperar o cooldown | ✅ `api/_lib/modelHealth.js`, `POST /api/admin/ai-providers` |
| **Alertas operacionais de IA — Telegram + WhatsApp (NOVO — Ago/2026)** | Alerta em tempo real quando um provider esgota todos os modelos 5× seguidas (cooldown 12h); cron diário (07:00 Maputo) reporta providers offline-hoje ou cronicamente degradados (< 20% sucesso em 3 dias) — só avisa se houver de facto um problema | ✅ `api/_lib/notifyOps.js`, `api/_lib/aiProviderWatchdog.js` |
| **Amostra Grátis + Custo Progressivo** | `_previewMode: true` gera um extracto curto sem debitar créditos; documentos longos (6+ páginas) têm custo progressivo via `LongDocumentEngine` | ✅ |
| **18 serviços** (16 com geração por IA, 2 encaminhados por WhatsApp) | Ver secção 4 — número real supera os "17 serviços / 14 com IA" de versões anteriores deste documento | ✅ `ServiceDefinitions.js` |
| **70+ Templates Visuais** | 5 templates por serviço nos 14 serviços "clássicos", com CSS próprio | ✅ |
| **Editor WYSIWYG** | Edição inline com preservação fiel do template (iframe + `designMode`) | ✅ |
| **Export PDF / Word (.docx real) / Excel (.xls)** | `HTMLToDocxExporter` e `WordExporter` geram OOXML real via biblioteca `docx`, não HTML disfarçado | ✅ |
| **Assinatura Digital (canvas)** | Inserida directamente no documento — **sem validade jurídica plena** sem certificação nos termos da Lei n.º 3/2017 (ver secção 14) | ✅ |
| **Módulo Académico APA 7** | Citações, bibliografia, TOC automático, upload PDF/URL | ✅ |
| **Extracção de Template por Imagem** | IA de visão extrai estrutura de qualquer imagem de documento | ✅ |
| **OCR (SmartOCRService v4)** | IA visual primeiro (Groq/Gemini), Tesseract como complemento; suporta imagem, PDF (`pdf.js`) e Word (`mammoth.js`) | ✅ |
| **Digitalizar Documento (`transcricao`) — acumulador de páginas (NOVO — Ago/2026)** | Fotografar/carregar um documento de várias páginas (manuscrito ou não) e receber o texto digitado e formatado. Cada toque em "Adicionar Foto/Ficheiro" **acumula** a página numa lista visível (`#ocrStagedWrap`, `OCRController.stagedFiles`) em vez de disparar o OCR de imediato — só a transcrição efectiva do lote completo é feita ao carregar em "Transcrever N página(s)". Páginas que falhem a leitura na 1ª tentativa têm agora 2 rondas extra de recuperação (antes só páginas com erro de rede eram repetidas); se mesmo assim ficarem ilegíveis, o documento final mostra um aviso visível nessa página exacta ("⚠️ Não foi possível ler esta página...") em vez de a omitir silenciosamente | ✅ Corrige um bug de produção confirmado (selecção múltipla de fotos no `<input type="file">` perdia silenciosamente todas as páginas menos a 1ª em vários Android) — ver secção 13 |
| **Trabalho Escolar — estrutura académica completa, custo dinâmico e paginação real (NOVO — Ago/2026)** | "Páginas pretendidas" passou a referir-se só às páginas de **desenvolvimento** (capa/folha de rosto/resumo/índice/introdução/conclusão/referências somam-se a esse valor, nunca o descontam); custo em créditos passou de fixo (1) a dinâmico — 1 crédito a cada 5 páginas de desenvolvimento pedidas, com o botão "Gerar com IA" a actualizar o valor ao vivo. Estrutura académica completa para níveis universitários: capa sem tabela (hierarquia tipográfica), Folha de Rosto própria, Dedicatória/Agradecimentos/Epígrafe opcionais (campo "Secções extra"), Resumo e Palavras-chave, e números do Índice calculados matematicamente a partir da densidade de palavras/página calibrada por nível (não adivinhados). Corrigido também: PDF descarregado saía sistematicamente maior do que o pedido (estrutura obrigatória forçava um mínimo de parágrafos independente do tamanho pedido); margem física zero em todas as páginas do PDF (bug de regex em `_extractPageMargin()`); nome de ficheiro genérico ("Trabalho Escolar") em vez do nome completo ao guardar; numeração de página real agora impressa em cada folha (`@page { @bottom-center }`) | ✅ Corrige 4 bugs de produção confirmados por PDF real enviado pelo cliente — ver secções 4, 8 e 15 |
| **Papelarias/Advogados no ecrã de resultado (NOVO — Ago/2026)** | Alternador (mesmo padrão visual dos filtros de categoria da homepage) entre Papelarias — parceiro principal por omissão, para imprimir o documento acabado de gerar — e Advogados — revisão jurídica, com especialidade filtrada por tipo de documento quando aplicável. Antes só existia o bloco de Advogados, e só para 6 tipos de documento jurídicos (procuração, arrendamento, etc.); passou a aparecer para **qualquer** documento gerado, incluindo ao reabrir um documento antigo "Do Arquivo" (antes só aparecia logo a seguir a gerar). Corrigido em conjunto um bug real em que seleccionar uma papelaria no ecrã de resultado não activava nenhum botão de envio | ✅ Ver secções 9 e 15 |
| **Motor Jurídico RAG** | Busca vectorial (pgvector) sobre artigos de lei moçambicanos reais para os serviços jurídicos, em vez de citações estáticas | ✅ |
| **Histórico Offline** | IndexedDB, sincronizado quando online | ✅ |
| **Compra permanente de templates pagos (NOVO — v64)** | Um template pago (créditos) só é cobrado da primeira vez; a partir daí fica desbloqueado por tempo indefinido para quem pagou (`template_purchases`) | ✅ Corrige um bug de fuga de receita confirmado — ver secção 15 |
| **Pacotes exclusivos por categoria + ponte afiliado ↔ parceiro (NOVO — v65)** | Pacotes de créditos com preço/créditos diferentes por categoria (papelaria, cyber, universidade, explicação, digitador, advogado), validados sempre no servidor; convite bidireccional para quem é afiliado de negócio físico se candidatar também à Rede de Parceiros, e vice-versa | ✅ Ver secção 9 |
| **Primeiro documento sempre grátis (NOVO — v66)** | O primeiro documento de uma conta nova é gratuito independentemente do custo real dele (1-10 créditos) — não um saldo inicial de 1 crédito como antes; contas registadas por link de afiliado têm direito a 2. Nunca se aplica à compra de templates pagos do marketplace. Estado (usado/por usar) visível no painel admin — lista de Utilizadores e Timeline/CRM (NOVO — Ago/2026) | ✅ Ver secção 8 |
| **Agendamento com parceiros — foto/impressão (NOVO — v63)** | Pedido de "Foto para Documentos" ou impressão passa a ficar registado (tabela `bookings`), com estado pendente/agendado/em_andamento/concluído/cancelado geridos pela papelaria/gráfica no Portal da Parceira | ✅ `parceiro-portal.html` |
| **WhatsApp como lead + via de recuperação de conta (NOVO — v62)** | Campo opcional `profiles.whatsapp` no registo; recuperação de password aceita e-mail ou WhatsApp (o e-mail associado é resolvido a partir de qualquer um dos dois) | ✅ `api/auth/index.js` |
| **Pagamento Manual Multi-Carteira** | M-Pesa, e-Mola, mKesh — upload de comprovativo com verificação automática por IA de visão (aprovação se confiança ≥ 0.85) e fallback WhatsApp | ✅ |
| **Reembolso Automático de Créditos** | Se a geração falhar após o débito, o crédito é devolvido via RPC `refund_credit` | ✅ |
| **Alertas Telegram para revisão manual (NOVO)** | Quando um comprovativo de pagamento não é aprovado automaticamente (`review_needed`), o admin recebe um alerta Telegram além da notificação já existente no painel — `notifyTelegram.js`, fire-and-forget, nunca bloqueia o fluxo de pagamento se falhar | ✅ `api/_lib/notifyTelegram.js`, ligado em `api/misc.js` |
| **Preços Dinâmicos** | Pacotes lidos de `system_settings` em tempo real (`api/_lib/packages.js`) | ✅ |
| **Marketplace de Templates** | Galeria comunitária, preview A4 realista com dados fictícios preenchidos automaticamente (mesmo para variáveis livres definidas pelo criador), submissão/avaliação/partilha, repartição de receita 60–70% para o criador, preço máximo 10 créditos (alinhado com o tecto de qualquer operação cobrada na plataforma) | ✅ |
| **Venda de templates restrita a afiliados/parceiros (NOVO — v55)** | Um utilizador comum pode submeter e partilhar templates gratuitamente, mas só afiliados aprovados ou parceiros activos podem definir preço (`credit_cost > 0`) — garantido por trigger na base de dados, não só validação no código | ✅ `migration_v55` |
| **Sistema de Afiliados Pro** | Segmentação, níveis, bónus por tier, detecção de fraude — ver secção 9 | ✅ |
| **Rede de Parceiros (incl. advogados)** | Papelarias, cyber cafés e advogados parceiros, com código de acesso próprio | ✅ |
| **Avaliações Públicas** | ⭐ 1–5, com moderação de conteúdo automática (`contentModeration.js`) | ✅ |
| **Créditos Bónus / Promoções (NOVO)** | Admin pode conceder um bónus de créditos (ex.: "+5 este mês") somado aos créditos grátis normais no registo | ✅ Mas ver nota honesta na secção 13 — o prazo de validade do bónus é guardado e nunca aplicado |
| **Painel Admin** | Analytics, feedback, utilizadores, pagamentos, parceiros, preços dinâmicos, Finanças com Identidade Fiscal, Kit de Marketing, recibos de afiliados | ✅ |
| **Blog / SEO** | CMS com geração assistida por IA; publicação automática de HTML estático directamente no GitHub via Contents API | ✅ |
| **PWA** | Instalável, funciona offline, `CACHE_VERSION` auto-gerado a cada deploy | ✅ |

---

## 2. Arquitectura e stack

- **Frontend:** HTML/CSS/JS puro (sem framework pesado), organizado em `assets/js/` por
  domínio (`controllers/`, `services/`, `components/`, `marketplace/`, `academic/`, `auth/`,
  `admin/`, `partners/`, `utils/`, `views/`).
- **Backend:** 9 Serverless Functions na Vercel (plano Hobby permite até 12) — **3 de margem**,
  confirmado em `vercel.json` (`functions: {...}` tem exactamente 9 entradas). Já foram 12/12, sem
  margem nenhuma; consolidados em Ago/2026 (ver secção 10). Ficheiros dentro de `api/_lib/` e
  `api/_services/` são helpers/lógica partilhada e **não contam** para este limite (convenção
  Vercel: qualquer ficheiro/pasta com prefixo `_` dentro de `api/` nunca vira function).
- **Base de dados:** Supabase (PostgreSQL) com extensão `pgvector` para o Motor Jurídico RAG.
- **Cliente Supabase:** 100% via `fetch` nativo (`api/_lib/supabaseAdmin.js`) — **confirmado**
  que não existe nenhum `require()`/`import` activo de `@supabase/supabase-js` nem de `ws` em
  nenhum ficheiro de `api/`; `package.json` também não lista nenhuma das duas dependências.
  (Referências a essas bibliotecas que ainda aparecem em `api/admin/index.js` e `api/misc.js`
  são **comentários históricos**, não código a correr.)
- **Rate limiting:** Upstash Redis, com fallback para `Map` local em memória se as variáveis
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` não estiverem definidas — e tecto degradado mais apertado nos
  namespaces sensíveis (pagamento, login, OCR, geração) quando o Redis está indisponível, para
  reduzir o efeito de um atacante distribuído por várias instâncias serverless; ver secção 7.
- **Migrações:** mais de 50 ficheiros SQL versionados em `supabase/`, de `schema.sql` +
  `migration_v8_*` até `migration_v60_idempotent_credit_operations.sql`, mais um conjunto de
  ficheiros avulsos sem numeração sequencial (`EMERGENCIA_*`, `EXECUTAR_AGORA_*`,
  `migration_fix_*`, `migration_add_*`) aplicados directamente em produção ao longo do tempo —
  ver secção 13.
- **CI:** `.github/workflows/test.yml` corre `npm run lint` (ESLint) e `npm test` (Jest), ambos
  bloqueantes, em cada push/PR ao branch principal — ver secção 12.2.

---

## 3. Motor de IA — geração multi-provider com auto-cura

Este é o subsistema mais sofisticado do projecto. O estado real, confirmado em
`api/_lib/aiProviderRegistry.js` (v2.0, auditoria de Agosto/2026), é:

### 3.1. 10 providers com adaptador (competem de facto) — 0 catalogados sem adaptador

`aiProviderRegistry.js` é a fonte única de verdade. A auditoria de Ago/2026 confirmou, provider a
provider, quais realmente respondiam em produção — três foram removidos por deixarem de ter tier
grátis viável, quatro novos foram ligados para os substituir:

| Provider | Tier | Activação | Nota |
|---|---|---|---|
| Groq | Generoso (grátis) | `GROQ_API_KEY` | ≈100k tokens/dia |
| Cerebras | Generoso (grátis) | `CEREBRAS_API_KEY` | ≈1M tokens/dia, catálogo instável |
| Google Gemini | Médio | `GEMINI_API_KEY` | ≈250 pedidos/dia (Flash) |
| OpenRouter | Médio | `OPENROUTER_API_KEY` | ≈50 pedidos/dia grátis (1000/dia após $10 em créditos) |
| Mistral (La Plateforme) | Reserva activa | `MISTRAL_API_KEY` | timeouts ocasionais no tier grátis |
| SambaNova Cloud | Reserva activa | `SAMBANOVA_API_KEY` | 20 pedidos/dia **por modelo** × 5 modelos |
| GitHub Models | Reserva activa | `GITHUB_MODELS_TOKEN` | Personal Access Token com scope `models:read` |
| Cloudflare Workers AI | Reserva activa | `CLOUDFLARE_AI_TOKEN` **+** `CLOUDFLARE_ACCOUNT_ID` | única com 2 env vars obrigatórias |
| Hugging Face Inference | Reserva activa | `HUGGINGFACE_API_KEY` | via router `hf-inference` |
| Cohere | Reserva activa | `COHERE_API_KEY` | via API de compatibilidade OpenAI da própria Cohere |

**Removidos nesta auditoria** (causa raiz confirmada, não é bug de código):
- **NVIDIA NIM** — contas NGC pessoais/gratuitas devolvem sempre `404 Function not found` em
  `POST /v1/chat/completions` (falta a permissão "Public API Endpoints", só a NVIDIA activa
  manualmente, sem previsão). `GET /v1/models` funciona, o que mascarava o problema.
- **Together AI** — deixou de dar crédito de registo, exige depósito mínimo de $5 antes de
  qualquer chamada funcionar.
- **Fireworks AI** — apenas $1 de crédito único de avaliação, sem tecto diário contínuo, esgota
  em minutos de uso normal.

`UNWIRED_RESERVE` está vazio desde esta ronda — os 4 providers que lá estavam (Cloudflare, GitHub
Models, Hugging Face, Cohere) passaram a ter adaptador completo. Mantido como array vazio (não
removido) para o painel admin continuar a funcionar sem alterações caso volte a ter entradas.

**Princípio de desenho:** assim que a(s) variável(is) de ambiente correspondente(s) existir(em) na
Vercel, esse provider entra automaticamente no registo — não é preciso editar
`generate-document.js`. `isProviderConfigured()` (novo) verifica **todas** as env vars
obrigatórias de um provider (a principal `envVar` + qualquer `extraEnvVars`, ex.: o Cloudflare
precisa de duas) antes de o considerar activo — evita tentar chamadas garantidas a falhar contra
uma URL mal formada. `resolveUrl()` (novo) permite que `chatUrl`/`modelsUrl` sejam uma função
`(env) => string` em vez de uma string fixa, usado só pelo Cloudflare (o URL inclui o ID da conta).

`raceAllProviders()` só corre em paralelo o grupo **generoso + médio** (Groq, Cerebras, Gemini,
OpenRouter) por omissão; o grupo **reserva activa** (os 6 restantes) só entra como **fallback**,
se o grupo primário falhar por completo. Tecto de 9s por provider — se não responder a tempo, é
descartado e a corrida continua com os restantes.

### 3.2. Descoberta de modelos ao vivo (`modelDiscovery.js`)

Em vez de confiar cegamente numa lista curada e estática de modelos por provider, o sistema
consulta o endpoint `GET /models` de cada provider e cruza com a lista curada. Se um modelo
curado já não existir no catálogo real, é saltado automaticamente. Falha de forma totalmente
silenciosa — qualquer problema (timeout, chave inválida, provider sem suporte a `/models`, como o
GitHub Models — ver nota no registo) devolve `null` e o sistema usa a lista curada tal como
estava.

### 3.3. Disjuntor por modelo e por provider (`modelHealth.js`) + reactivação manual

Memoriza falhas recentes de cada combinação `provider + modelo` e diz ao motor de corrida quais
saltar, sem intervenção manual:

- **Falha permanente** (mensagens como "decommissioned", "model not found", "no endpoints
  found") → modelo desactivado por 7 dias.
- **Falha transitória** (timeouts, erros 5xx, respostas vazias) → só desactiva depois de 3
  falhas **seguidas**, com backoff crescente (10 min → 30 min → 2 h).

**Correcção de Ago/2026 — descoberta ao vivo pode desbloquear um disjuntor permanente:** antes,
um modelo marcado como permanentemente indisponível (7 dias) ficava bloqueado mesmo que a
descoberta ao vivo confirmasse, horas depois, que voltou a existir no catálogo do provider — era
isto que produzia "Cerebras: nenhum modelo disponível (todos desactivados ou catálogo vazio)" no
painel admin com o catálogo real a conter modelos válidos. Agora, se `getAvailableModels()`
confirma **agora mesmo** que o modelo existe (`discoveredLive: true`), o disjuntor permanente é
ignorado — falhas transitórias continuam a respeitar o cooldown normal mesmo assim.

**Vigilância a nível de provider (não só de modelo):** `recordProviderSuccess()` /
`recordProviderExhaustion()` respondem a "este provider, no conjunto de todos os seus modelos,
está estruturalmente morto?" — 5 esgotamentos totais seguidos (todos os modelos falharam na mesma
tentativa) disparam **um** alerta por Telegram+WhatsApp (`api/_lib/notifyOps.js`), com cooldown de
12h para não repetir o mesmo aviso a cada pedido de documento. Um cron diário
(`api/_lib/aiProviderWatchdog.js`, 07:00 hora de Moçambique, via
`/api/misc?action=ai-providers-cron`) complementa isto: apanha um provider "silenciosamente" sem
sucesso nenhum (pouco tráfego) ou cronicamente degradado (< 20% de sucesso em 3 dias) — só envia
mensagem se houver de facto um problema, propositadamente sem "está tudo bem" diário.

**Botão "🔄 Reactivar" (painel admin → IA Providers):** limpa manualmente o disjuntor de um
provider (`POST /api/admin/ai-providers { resetCircuitBreaker: <id> | 'all' }`) — útil depois de
resolver a causa real de uma falha (nova chave, créditos repostos), sem esperar o cooldown
automático (até 2h, ou 7 dias em erro permanente). Resolve exactamente os modelos que o motor de
corrida está de facto a saltar (curados **e** descobertos ao vivo, não só a lista curada estática).

### 3.4. Bug corrigido — planeamento de documentos longos cortado a meio (JSON inválido)

Documentos multi-secção ("Trabalho" académico, até 30 páginas / ~21 secções) pedem primeiro à IA
um JSON com a estrutura de capítulos. Bug real reportado e corrigido: o tecto de tokens do
planeamento (`api/generate-document.js`) estava fixo em 1024 — insuficiente para o número real de
secções em documentos grandes, cortando a resposta a meio de uma string/objecto e produzindo
`SyntaxError` directo no cliente ("Não foi possível planear o documento"). Corrigido com três
mudanças: **(1)** `PLAN_SYSTEM_PROMPT` dedicado (JSON estrito, proíbe aspas por escapar dentro de
títulos, pede formato compacto) usado só em `_planMode`, com temperatura 0.3 (mais determinístico);
**(2)** tecto subiu para 4096 (é só um tecto máximo, não gasta mais em planos pequenos); **(3)**
`LongDocumentEngine.js` deixou de fazer `JSON.parse()` directo — `_parseSectionsJson()` tenta parse
directo → reparos comuns (aspas tipográficas, vírgulas a mais, objectos colados) →
`_salvagePartialSections()` (percorre a resposta char-a-char respeitando strings/escapes e salva as
secções já bem formadas antes do ponto de corrupção/corte, em vez de rejeitar o plano inteiro), mais
1 retry automático da fase de planeamento se tudo falhar (seguro — nenhum crédito é debitado antes
do plano ter sucesso).

### 3.5. Protecção de dados pessoais antes de qualquer IA externa (duas camadas)

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
├── api/                                # 9 Serverless Functions (Vercel Hobby, limite 12 — 3 de margem)
│   ├── _lib/                           # Helpers partilhados (prefixo "_" — não contam para o limite)
│   │   ├── supabaseAdmin.js            # Cliente Supabase via fetch puro (REST + Auth API)
│   │   ├── aiProviderRegistry.js       # Fonte única de verdade: 10 providers com adaptador (auditoria Ago/2026)
│   │   ├── aiProvidersCatalog.js       # Alimenta o painel "IA Providers" do admin (mesma fonte)
│   │   ├── modelDiscovery.js           # Descoberta ao vivo de modelos disponíveis por provider
│   │   ├── modelHealth.js              # Disjuntor por modelo/provider + reset manual (resetProviderHealth)
│   │   ├── aiProviderWatchdog.js       # NOVO: cron diário (07:00 Maputo) — reporta providers offline/degradados
│   │   ├── visionAI.js                 # IA de visão (Gemini → OpenRouter fallback)
│   │   ├── legalSearch.js              # Busca vectorial pgvector para o Motor Jurídico RAG
│   │   ├── packages.js                 # Única fonte de verdade dos pacotes de créditos
│   │   ├── piiRedaction.js             # Mascaragem de PII no texto (servidor)
│   │   ├── contentModeration.js        # Filtro de conteúdo abusivo em avaliações públicas
│   │   ├── rateLimit.js                # Rate-limit via Upstash Redis (fallback Map local degradado — secção 7)
│   │   ├── notifyTelegram.js           # Alertas Telegram (pagamento em revisão, rate limit degradado)
│   │   ├── notifyOps.js                # NOVO: alertas operacionais Telegram+WhatsApp (provider de IA esgotado)
│   │   ├── observability.js            # logEvent() estruturado — pagamento/OCR/geração/ledger (secção 12.3)
│   │   └── webpush.js                  # Notificações push via VAPID
│   ├── _services/                      # Lógica de negócio por domínio (prefixo "_" — não conta para o limite)
│   │   ├── account.js                  # NOVO (Ago/2026): verify-credits, deduct-credit, delete-temp-account, cleanup-temp-accounts
│   │   ├── payments.js                 # verify-receipt + verifyReceiptInternal (chamado por process-payment.js)
│   │   ├── ocr.js                      # ocr-analyze (Digitalizar Documento)
│   │   ├── legal.js                    # legal-search (Motor Jurídico RAG)
│   │   ├── blog.js                     # sitemap.xml, blog-list, blog-cron, github-diagnostic
│   │   ├── site.js                     # page-view, marketing, config, public-reviews, push, document-usage
│   │   ├── templates.js                # namespace _ns=templates (Marketplace)
│   │   └── affiliates.js               # namespace _ns=affiliate
│   ├── admin/index.js                  # Dashboard, analytics, feedback, blog, templates, afiliados, finanças
│   ├── auth/index.js                   # Login, registo, reset password
│   ├── generate-document.js            # Corrida por tiers (generoso+médio, reserva como fallback) + amostra grátis + custo progressivo + reembolso
│   ├── extract-template.js             # Extracção de template via imagem (IA visão)
│   ├── account.js                      # NOVO (Ago/2026): router fino → api/_services/account.js (ver nota abaixo)
│   ├── process-payment.js              # Pagamento manual multi-carteira + registo de transacção
│   ├── partners.js                     # API da Rede de Parceiros
│   ├── convert.js                      # Conversão de ficheiros (OCR / extracção de texto)
│   └── misc.js                         # Router fino → api/_services/{payments,ocr,legal,blog,site,templates,affiliates}.js
│                                        #   (era um monólito de ~3.234 linhas; virou router de ~90 — ver secção 13)
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
│   ├── migration_v8_* … migration_v60_idempotent_credit_operations.sql   # Cadeia principal, ver secção 6
│   └── EMERGENCIA_*, EXECUTAR_AGORA_*, migration_fix_*, migration_add_*, polices.sql, transactions.sql
│                                               # ⚠️ Ficheiros avulsos aplicados directamente em
│                                               #   produção, sem numeração sequencial — ver secção 13
│
├── tests/                          # 10 suites Jest, ≈ 1.449 linhas — ver secção 11
│   ├── auth.test.js                     # 120 linhas
│   ├── credit-expiry.test.js            # 104 linhas
│   ├── creditLedgerConcurrency.test.js  # 160 linhas — contrato de idempotência (v57/v60), lock não é testável aqui
│   ├── deduct-credit.test.js            # 150 linhas
│   ├── generate-document.test.js        # 190 linhas
│   ├── notifyTelegram.test.js           #  60 linhas
│   ├── ocrSchemaAlignment.test.js       # 116 linhas
│   ├── process-payment.test.js          # 186 linhas
│   ├── rag.test.js                      # 107 linhas
│   ├── rateLimit.test.js                #  96 linhas
│   └── fixtures/orc/                    # Golden dataset de OCR (não corre em CI — ver secção 12)
│
├── scripts/                        # Ferramentas de manutenção — não contam para o limite de functions
│   ├── inject-version.js           # Executado no build da Vercel: gera CACHE_VERSION do sw.js
│   ├── legal-ingest.js             # Ingestão manual dos textos de lei para o Motor Jurídico RAG
│   ├── ocr-golden-eval.js          # Corre tests/fixtures/orc/ contra a IA real; não é CI (custa $ e chaves)
│   └── test-credit-concurrency.js  # Testa o lock FOR UPDATE contra staging real (não mocável em Jest)
│
├── docs/
│   ├── observability.md            # Taxonomia de eventos + dashboards SQL — ver secção 12
│   └── legal/                      # VERIFICACAO-LEGAL.md + textos-fonte/ (leis usadas no RAG)
│
├── .github/workflows/test.yml      # CI: npm run lint (eslint) + npm test (jest --coverage), em cada push/PR
├── eslint.config.mjs               # Flat config ESLint 9+; falha o CI em bugs reais, avisa em estilo
├── jest.setup.js                   # Polyfill AbortSignal.timeout/.any para jsdom (ambiente de teste)
│
├── pages/                          # 35 páginas SEO estáticas (geradas pelo admin via GitHub Contents API)
├── afiliado.html · admin.html · admin-parceiros.html · parceiro-portal.html · parceiros.html
├── templates.html · perfil.html · index.html · offline.html · legal.html · blog.html
├── sw.js                           # CACHE_VERSION reescrita automaticamente a cada deploy
├── manifest.json · robots.txt · vercel.json · package.json (v11.0.0) · package-lock.json
└── scripts/inject-version.js
```

> 📎 `parceiro-portal.html` é a área de acesso do parceiro (papelaria/cyber café/advogado) já
> aprovado — entra com telefone + código de acesso recebido por WhatsApp (`access_code`, ver
> `migration_v46_partner_access_code.sql`); é diferente de `parceiros.html` (página pública de
> adesão) e de `admin-parceiros.html` (gestão da rede pelo admin). `robots.txt` bloqueia a
> indexação de `admin.html` e `admin-parceiros.html` e permite explicitamente `/pages/`
> (conteúdo SEO) — coerente com a meta tag `noindex,nofollow` já presente em `parceiro-portal.html`.

> 📎 **`api/account.js` (NOVO, Ago/2026):** consolidação de 4 Serverless Functions antigas
> (`api/verify-credits.js`, `api/deduct-credit.js`, `api/delete-temp-account.js`,
> `api/cleanup-temp-accounts.js` — todas apagadas) num único router fino, mesmo padrão já usado em
> `api/misc.js` e `api/admin/index.js`: dispatch por `?_op=` para `api/_services/account.js`, que
> tem a lógica de negócio movida sem nenhuma alteração de comportamento. As rotas públicas
> (`/api/verify-credits`, `/api/deduct-credit`, `/api/delete-temp-account`,
> `/api/cleanup-temp-accounts`) continuam a existir e a funcionar de forma idêntica, via rewrite em
> `vercel.json` — nenhum código do frontend precisou de mudar. Motivo: abrir margem real no tecto
> de 12 functions do plano Hobby (estava em 12/12) para features futuras já desenhadas mas ainda
> não integradas (webhook PaySuite/ClicPay — ver secção 13). Resultado: 12 → 9 functions.

---

## 6. Deploy — passo a passo completo

### 6.1. Pré-requisitos

- Conta Vercel (Hobby ou Pro — ver aviso comercial no topo deste documento).
- Projecto Supabase com extensão `pgvector` activada (Dashboard → Extensions) — necessária para
  o Motor Jurídico RAG.
- Pelo menos **uma** chave de IA (quantas mais, maior a disponibilidade e mais resiliente o
  disjuntor de modelos): Groq, Google AI Studio (Gemini), OpenRouter, Cerebras, Mistral,
  SambaNova, GitHub Models, Cloudflare Workers AI (precisa de 2 variáveis — token + ID da conta),
  Hugging Face, Cohere.
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

# IA — pelo menos 1 obrigatória; até 10 possíveis (ver secção 3.1)
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
CEREBRAS_API_KEY=csk-...
MISTRAL_API_KEY=...
SAMBANOVA_API_KEY=...
GITHUB_MODELS_TOKEN=github_pat_...       # scope models:read
CLOUDFLARE_AI_TOKEN=...                  # + CLOUDFLARE_ACCOUNT_ID (as DUAS são obrigatórias)
CLOUDFLARE_ACCOUNT_ID=...
HUGGINGFACE_API_KEY=hf_...
COHERE_API_KEY=...
#   (nomes exactos confirmados em api/_lib/aiProviderRegistry.js)

SITE_URL=https://mzdocs.co.mz

# Opcionais
MPESA_API_KEY=...
MPESA_SERVICE_CODE=...              # ⚠️ nome real no código (não "MPESA_SERVICE_PROVIDER_CODE")
WA_SUPPORT_NUMBER=258858695506
CLOUDCONVERT_API_KEY=...
LIBREOFFICE=false                   # true apenas em VPS com LibreOffice
CRON_SECRET=...                     # protege todos os crons: cleanup-temp-accounts, blog, ai-providers-cron
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
GITHUB_OWNER=...
GITHUB_REPO=...
GITHUB_TOKEN=...                    # PAT com escrita no repositório — tratar como Service Role Key
TELEGRAM_BOT_TOKEN=...              # alertas de pagamento em revisão + providers de IA offline
TELEGRAM_CHAT_ID=...
WHATSAPP_ALERT_PHONE=258...         # NOVO — 2.º canal de alerta operacional (só providers de IA)
WHATSAPP_CALLMEBOT_APIKEY=...       # via CallMeBot, grátis, sem aprovação da Meta
```

> ⚠️ **Variáveis sem efeito (não usar):** `ADMIN_EMAILS` e `MPESA_PUBLIC_KEY` não são lidas em
> nenhum ficheiro de código. O estado de administrador é controlado pela coluna
> `profiles.is_admin` — ver `supabase/EXECUTAR_promote_admin.sql`.

### 6.3. Migrações Supabase — lista completa e actualizada (v8 → v60)

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
migration_v51_bonus_credits.sql                       -- ver nota honesta na secção 13
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

-- Pagamento atómico, observabilidade, idempotência (v57–v60 — mais recentes)
migration_v57_atomic_payment_confirmation.sql         -- confirm_payment_and_credit(): confirmar
                                                       --   transacção + creditar utilizador numa
                                                       --   ÚNICA transacção PL/pgSQL, em vez de dois
                                                       --   pedidos REST separados; elimina a janela em
                                                       --   que uma transacção ficava 'completed' sem
                                                       --   crédito atribuído se o processo caísse a
                                                       --   meio. Conta com conta ainda por criar
                                                       --   (userId NULL) continua fora da transacção
                                                       --   SQL — ver nota no próprio ficheiro
                                                       --   ⚠️ NÃO confundir com a "ronda v57" da
                                                       --   secção 15 (OCR multi-página) — mesma
                                                       --   numeração, mudanças independentes
                                                       --   (gap v58: não existe ficheiro numerado v58)
migration_v59_observability.sql                       -- tabela metrics_events + views
                                                       --   v_payment_funnel_daily / v_ocr_health_daily
                                                       --   / v_document_generation_daily — ver secção 12
migration_v60_idempotent_credit_operations.sql        -- deduct_credits_idempotent() /
                                                       --   refund_credit_idempotent(): operation_id
                                                       --   gerado pelo cliente evita débito/reembolso
                                                       --   duplicado em retries de rede; 100% aditivo,
                                                       --   não altera as funções antigas (fallback
                                                       --   automático quando operation_id é NULL)
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

> ✅ **Confirmação atómica (v57) e operações de crédito idempotentes (v60):** o passo 4 acima —
> marcar a transacção como `completed` **e** creditar o utilizador — corre agora dentro de uma
> única função PL/pgSQL (`confirm_payment_and_credit`, `migration_v57_atomic_payment_confirmation.sql`),
> em vez de duas chamadas REST separadas ao PostgREST; elimina o cenário em que o processo Node
> falhava exactamente entre marcar `completed` e creditar, deixando uma transacção paga sem
> crédito atribuído. Limitação aceite e documentada: contas "avulsas" ainda por criar (`userId`
> NULL) continuam a usar a API de Admin do Supabase Auth fora dessa transacção SQL, porque é uma
> chamada HTTP externa. Em paralelo, `migration_v60_idempotent_credit_operations.sql` acrescenta
> `deduct_credits_idempotent()`/`refund_credit_idempotent()`: o cliente gera um `operation_id`
> (UUID) uma única vez por tentativa de geração e reenvia-o sem alterar em qualquer retry dessa
> mesma tentativa (`assets/js/services/Services.js`); um segundo pedido com o mesmo `operation_id`
> nunca volta a tocar em `profiles.credits`, devolvendo directamente o saldo já resultante da
> primeira execução (`replayed: true`) — protege contra débito ou reembolso duplicado quando a
> resposta de rede se perde depois do servidor já ter processado o pedido. É 100% aditivo: sem
> `operation_id`, o comportamento é exactamente o de antes (`deduct_credits`/`refund_credit`
> continuam a existir como fallback).

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
`LongDocumentEngine` para documentos longos. Desde a v66, `Services.js` não envia o custo real ao
gerar quando o documento foi concedido gratuitamente (ver subsecção seguinte) — para este
reembolso nunca disparar por engano, devolvendo um crédito nunca gasto.

### Primeiro documento grátis (v66) — e a sua visibilidade no painel admin

Substitui o antigo mecanismo de "1 crédito grátis no registo": 1 crédito de saldo inicial só
cobria um documento que custasse exactamente 1 crédito, mas os custos reais vão de 1 a 10
(`VALID_COSTS`). Desde a `migration_v66_first_document_free.sql`, o **primeiro documento de uma
conta nova é sempre grátis, seja qual for o custo real** — através de um contador dedicado
(`profiles.free_documents_used`) que **nunca toca em `profiles.credits`**. Uma conta registada via
link de afiliado tem direito a **2** documentos grátis em vez de 1. Nunca se aplica a templates
pagos do marketplace (`documentType` a começar por `"template_"`). RPC atómica e idempotente:
`grant_free_document()`, chamada em `handleDeductCredit` (`api/_services/account.js`) antes de
qualquer dedução paga.

**Consequência directa para quem lê o saldo de créditos:** uma conta nova com `credits = 0` **não
significa** que já não pode gerar — pode muito bem ainda ter o documento grátis por usar, já que
este mecanismo não mexe nesse saldo. Por isso o painel admin (lista de Utilizadores + Timeline/CRM
de cada conta) mostra explicitamente um badge com o estado real:

- **🎁 Grátis por usar (0/1)** — ainda tem direito, não gastou créditos ao gerar.
- **🎁 Grátis usado (1/1)** (ou `2/2` se referida) — já usou, os próximos documentos consomem
  créditos normalmente.

Calculado a partir de `free_documents_used` + `referred_by` (`_freeDocState()`/`_freeDocBadge()`
em `AdminApp.js`), com fallback seguro caso a `migration_v66` ainda não tenha corrido nalgum
ambiente (coluna ausente → nenhum badge mostrado, em vez de um estado errado). Filtro dedicado no
dropdown "Utilizadores" ("Doc. grátis por usar" / "Doc. grátis já usado") para listar rapidamente
quem ainda não converteu o benefício.

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
- **Primeiro(s) documento(s) grátis** para quem se regista — ver detalhe completo logo abaixo
  (v66); quem se regista via link de afiliado tem direito a 2 em vez de 1.
- **Anti-fraude:** tabela dedicada com eventos (`self_referral`, `ip_burst`, `fake_clicks`,
  `suspicious_conversion`) e severidade.
- **Kit de Marketing dinâmico:** o admin marca zonas de QR code/texto sobre uma imagem; cada
  afiliado vê a peça composta no seu próprio browser (`<canvas>`) com o SEU QR pessoal — nenhuma
  cópia por afiliado fica gravada na base de dados.
- **Rede de Parceiros:** papelarias, cyber cafés **e advogados** (v47), com código de acesso
  próprio (v46) e protecção anti-abuso nas avaliações (v45).
- **Alternador Papelarias/Advogados no ecrã de resultado (NOVO — Ago/2026):** depois de gerar
  qualquer documento, `injectPartnerToggleIntoModal()` (`NearbyPartners.js`) mostra um alternador
  de duas abas — Papelarias (parceiro principal por omissão, filtro fixo pelo serviço real
  `impressao`, nunca pelo id do tipo de documento, que não existe na lista de serviços de uma
  papelaria) e Advogados (com a especialidade certa quando o tipo de documento está em
  `LEGAL_DOC_TYPES`, `DocumentController.js`; `''` — qualquer área — nos restantes). Antes, este
  bloco só existia para 6 tipos de documento jurídicos e mostrava só advogados; e reabrir um
  documento "Do Arquivo" (`HistoryController.js`) nunca o mostrava, mesmo sendo o mesmo ecrã. O
  envio directo a uma papelaria seleccionada (`#btnWaDirectResult`/`sendDirectForGeneratedDoc()`)
  regista também o pedido em `bookings` (mesma tabela da v63), visível no Portal da Parceira.
- **Primeiro documento sempre grátis, não 1 crédito (NOVO — v66):** o primeiro documento gerado
  por uma conta nova é gratuito **independentemente do custo real dele** (os custos vão de 1 a 10
  créditos, `VALID_COSTS` em `api/_services/account.js`) — diferente do mecanismo antigo, que
  concedia 1 crédito de saldo inicial e por isso só cobria um documento se este custasse
  exactamente 1. Uma conta registada através de um link de afiliado (`profiles.referred_by`
  definido) tem direito a **2** documentos grátis, substituindo o antigo bónus de +1 crédito por
  registo via afiliado. Implementado como um contador próprio
  (`profiles.free_documents_used`, `migration_v66_first_document_free.sql`), nunca como saldo de
  créditos: `grant_free_document()` (RPC atómica, idempotente por `operation_id`) é chamada em
  `handleDeductCredit` **antes** de qualquer dedução paga, e só depois de confirmar que
  `documentType` não começa por `"template_"` — **modelos pagos do marketplace nunca são
  gratuitos**, mesmo para o primeiro documento de uma conta nova, por pedido explícito do cliente.
  Contas já existentes à data desta migração não recebem o benefício retroactivamente. Os
  mecanismos antigos (`free_credits_normal`, `aff_bonus_signup` em `system_settings`) foram
  desligados por configuração, não removidos do código — continuam a existir caso seja preciso
  reverter.
- **Ponte bidireccional afiliado ↔ parceiro (NOVO — v65):** quem se regista como afiliado no
  segmento `papelaria`, `cyber` ou `universidade` vê um convite no seu painel
  (`afiliado.html#partnerBridgeBanner`) para candidatar o mesmo negócio à Rede de Parceiros
  (`/parceiros.html`), com nome e telefone pré-preenchidos. Na direcção inversa, um parceiro do
  tipo `papelaria` já aprovado vê, no Portal da Parceira
  (`parceiro-portal.html#affiliateBridgeBanner`), o convite equivalente para se tornar também
  afiliado — só `papelaria` tem esta ponte inversa, porque `advogado` (o outro tipo de parceiro)
  não é um segmento de afiliado válido (`profiles.aff_segment` não inclui `'advogado'`; ver
  `CHECK` em `migration_v14_affiliates_pro.sql`). Ambas as pontes são dispensáveis
  (`localStorage`) e nunca bloqueiam o resto do fluxo se a verificação de duplicado falhar.
- **Pacotes de créditos exclusivos por categoria (NOVO — v65):** um pacote em `credit_packages`
  pode ser marcado como exclusivo de uma categoria (`partner_segment` —
  `papelaria`/`cyber`/`universidade`/`explicacao`/`digitador`/`individual`/`advogado`), com
  preço/créditos diferentes dos pacotes públicos. A categoria de cada utilizador é sempre
  resolvida no servidor (`resolveUserPricingSegment()` em `api/_lib/packages.js`), nunca aceite
  do cliente: primeiro por `profiles.is_affiliate` + `profiles.aff_segment`, depois por
  `partners.linked_user_id` + `partners.type` (parceiro aprovado e activo). Estes pacotes nunca
  aparecem em `/api/config` (resposta pública, em cache partilhado na CDN — variar por utilizador
  aí contaminaria o cache de todos); só são expostos por um pedido autenticado à parte
  (`GET /api/account?_op=my-packages`). A compra em si é validada de novo, do zero, em
  `api/process-payment.js`: um pacote com `partner_segment` definido exige sempre um token válido
  (nunca só `body.userId`) e recusa com 403 se a categoria resolvida no servidor não corresponder
  — impede que alguém adultere o pedido no browser para comprar créditos de parceiro sem o ser.
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
| Serverless Functions | 12 | **9 — 3 de margem** (consolidação Ago/2026, ver secção 5; `api/_lib/` e `api/_services/` não contam) |
| `generate-document.js` / `extract-template.js` / `convert.js` | 60 s | — |
| `process-payment.js` / `admin/index.js` / `auth/index.js` / `account.js` | 30 s | — |
| `partners.js` | 15 s | — |
| Bandwidth | 100 GB/mês | — |

**Como a margem foi aberta (Ago/2026):** `api/verify-credits.js`, `api/deduct-credit.js`,
`api/delete-temp-account.js` e `api/cleanup-temp-accounts.js` — 4 functions pequenas do mesmo
domínio (conta/crédito) — foram absorvidas por um único `api/account.js` (router, dispatch por
`?_op=`) + `api/_services/account.js` (lógica). Rotas públicas inalteradas, via rewrite em
`vercel.json`. Antes disso, `api/misc.js` já tinha sido reduzido de ~3.234 linhas para um router
fino de ~90 linhas (`api/_services/{payments,ocr,legal,blog,site,templates,affiliates}.js`), o que
resolveu a manutenibilidade mas **não** a contagem de functions — o número de ficheiros em `api/`
é que determina isso, não como o código está organizado internamente.

**Regra prática:** toda nova lógica de API deve ir num router existente (`api/misc.js`,
`api/account.js`, `api/admin/index.js`) ou usar o mesmo padrão router+`_services/` para uma nova
function, só quando o domínio for genuinamente distinto. Helpers partilhados vão em `api/_lib/`,
lógica de negócio por domínio em `api/_services/` — nenhum dos dois conta para o limite. Com 3
slots livres, há margem para integrar o webhook do PaySuite/ClicPay (ver secção 13) sem precisar
do plano Pro — mas confirmar sempre a contagem real em `vercel.json` antes de assumir margem.

---

## 11. Testes

| Suite | Linhas | Cobre |
|---|---|---|
| `tests/auth.test.js` | 120 | AuthManager / AuthUI (jsdom) |
| `tests/ocrSchemaAlignment.test.js` | 100 | Alinhamento schema OCR ↔ campos do formulário |
| `tests/rateLimit.test.js` | 61 | `api/_lib/rateLimit.js` |
| `tests/generate-document.test.js` (NOVO) | 190 | Formato da resposta; corrida por tiers (generoso/médio) vs fallback de reserva activa |
| `tests/deduct-credit.test.js` (NOVO) | 154 | Dedução, créditos insuficientes, optimistic locking, reembolso automático |
| `tests/process-payment.test.js` (NOVO) | 167 | Validação de telefone/pacote, detecção de carteira, duplicados, verificação automática de comprovativo |
| `tests/credit-expiry.test.js` (NOVO) | 109 | Cron de expiração por lote (v52), degradação segura |
| `tests/rag.test.js` (NOVO) | 107 | Motor Jurídico RAG (`legalSearch.js`): citação de fonte, limiar de similaridade, aviso de qualidade |
| `tests/notifyTelegram.test.js` (NOVO) | 60 | Alerta Telegram de pagamento em revisão (`notifyTelegram.js`) |
| `tests/creditLedgerConcurrency.test.js` (NOVO) | 160 | Contrato da aplicação (`payments.js`) quando duas chamadas concorrentes chegam com o mesmo `transactionId` e a RPC atómica (v57) devolve `already_confirmed: true` na 2ª — **não** prova o lock `FOR UPDATE` em si (impossível com mock; ver `scripts/test-credit-concurrency.js` abaixo) |
| **Total** | **≈ 1.458** | — |

CI automático via `.github/workflows/test.yml`, a correr em cada push/PR ao branch principal —
dois passos, ambos bloqueantes: `npm run lint` (ESLint, `eslint.config.mjs`) e depois `npm test`
(Jest com `--coverage`). O job usa `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` fictícios só para os
módulos que verificam a *presença* da variável antes de decidir "não configurado" vs "tentar
ligar" — todos os testes mockam `supabaseAdmin`/`fetch` por completo, nenhum bate numa base de
dados real.

**Honestamente:** ~1.458 linhas de teste para ~11.650 linhas de código só em `api/` continua a ser
uma cobertura fina, mas cresceu de forma dirigida — as áreas de maior exposição financeira e
legal (geração de documentos, dedução/expiração/idempotência de créditos, pagamentos, RAG
jurídico) já têm teste dedicado. Afiliados e o fluxo completo do Marketplace de Templates
continuam sem teste automatizado. Duas verificações importantes ficam **fora do Jest de propósito**
porque precisam de infra-estrutura real — ver secção 12: concorrência real do lock de Postgres
(`scripts/test-credit-concurrency.js`) e qualidade do OCR contra um golden dataset
(`scripts/ocr-golden-eval.js`).

---

## 12. Scripts de manutenção, CI/CD e Observabilidade

### 12.1. Scripts (`scripts/`)

Nenhum destes corre como Serverless Function — não contam para o limite de 12 do Vercel Hobby
(secção 10). Correm manualmente ou como passo de build.

| Script | Quando corre | Função |
|---|---|---|
| `inject-version.js` | Automaticamente, a cada build da Vercel (`buildCommand` em `vercel.json` / `scripts.build` em `package.json`) | Reescreve `CACHE_VERSION` em `sw.js` a partir do commit (`v<sha-git-7-chars>-<YYYYMMDD>`), para os clientes deixarem de servir uma versão em cache desactualizada. Nunca falha o build — qualquer erro é só `console.warn` |
| `legal-ingest.js` | Manual, uma vez por diploma (ou todos) | Lê `docs/legal/textos-fonte/<slug>.txt`, segmenta por artigo, limpa ruído de OCR/Boletim, gera embedding via Gemini API por artigo, insere em `legal_chunks` (Supabase) para o Motor Jurídico RAG |
| `ocr-golden-eval.js` | Manual, antes/depois de mexer no OCR | Corre cada fixture de `tests/fixtures/ocr/` através de `handleOcrAnalyze` real (mesma função de produção, sem HTTP) e compara com `expected.json`. Não corre em CI: custa chamadas de IA reais e precisa de chaves de API secretas — `GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/ocr-golden-eval.js` |
| `test-credit-concurrency.js` | Manual, contra **staging real** (nunca produção) | Verifica que dois pedidos simultâneos com saldo=1 nunca resultam em saldo=-1 nem em dois documentos gerados com 1 crédito só — só tem resposta real testando o lock `SELECT ... FOR UPDATE` do Postgres; um teste Jest mocado nunca exercitaria lock nenhum, teria sempre "sucesso" |

> ⚠️ `tests/fixtures/orc/` contém apenas 2 exemplos (`_example_manuscrito`,
> `_example_texto_impresso`) — úteis como modelo de formato (`meta.json` + `expected.json`), mas
> não substituem um golden dataset real com documentos anonimizados de produção; ver
> `tests/fixtures/orc/readme.md` para o formato exacto a seguir.

### 12.2. CI (`.github/workflows/test.yml`)

Corre em cada `push`/`pull request` ao branch principal, Node 24.x: `npm install` →
`npm run lint` (ESLint, falha o CI em erro) → `npm test` (Jest `--coverage`). Bloqueia o merge se
algo partir em `generate-document.js`, `process-payment.js`, `legalSearch.js` ou
`api/_services/account.js` (dedução/reembolso de crédito e cleanup diário de contas — ver secção 10).

`eslint.config.mjs` (flat config, ESLint 9+, sem plugins externos além de `globals`) trata bugs
reais (variáveis não definidas, chaves duplicadas, código inalcançável, promises esquecidas) como
**erro** — o que falha o lint e por isso o CI — e deixa preferências de estilo como aviso, para não
travar o projecto com centenas de avisos irrelevantes. Ignora `node_modules/`, `coverage/`,
`.vercel/`, `assets/vendor/`, `*.min.js`, `docs/`, `supabase/` (SQL) e trata `sw.js` à parte.

`jest.setup.js` faz polyfill de `AbortSignal.timeout()`/`AbortSignal.any()` — o `testEnvironment:
'jsdom'` usado pelo Jest não implementa esses métodos estáticos mais recentes do standard (ao
contrário do Node 24.x real usado no deploy), o que fazia qualquer teste que exercitasse
`signal: AbortSignal.timeout(...)` falhar por ambiente, não por bug de código. Só corre nos testes,
nunca é servido à aplicação real.

### 12.3. Observabilidade estruturada (`api/_lib/observability.js`, `docs/observability.md`)

`logEvent(categoria, evento, payload)` centraliza eventos para responder a perguntas
operacionais sem grep manual nos logs do Vercel (ex.: "quantos pagamentos foram auto-aprovados
hoje?", "qual a taxa de fallback do OCR esta semana?"). Cada chamada:

1. Emite sempre uma linha JSON em `stdout`, capturada pelos Logs do Vercel e por qualquer log
   drain externo (Axiom, Datadog, Better Stack...) sem mudar código, só configuração;
2. Tenta gravar, *best-effort* (nunca bloqueia, nunca lança excepção), na tabela `metrics_events`
   (`migration_v59_observability.sql`), para dashboards SQL directos no Supabase.

Categorias principais: `payment` (`pending`/`auto_approved`/`credited`/`credit_failed`/
`review_needed`/`duplicate_receipt`), `ocr` (`started`/`success`/`failed`/`fallback_model`),
`document` (`generation_success`/`generation_failed`/`refund_success`/`refund_failed`), `ai`
(chamadas a providers, via `withTiming`), `ledger` (`consumed`/`expired`).

Três views prontas para consulta directa (SQL Editor do Supabase ou qualquer BI ligado por
Postgres): `v_payment_funnel_daily`, `v_ocr_health_daily`, `v_document_generation_daily`.
`cleanup_old_metrics_events()` apaga registos com mais de 90 dias — recomenda-se ligar ao mesmo
cron diário que já limpa contas temporárias.

**Alertas recomendados, ainda não automatizados (P2 futuro):** pagamento auto-aprovado sem crédito
(`SELECT * FROM v_payment_funnel_daily WHERE auto_approved > credited`) e refunds falhados
(`category='document' AND event='refund_failed'`), ambos pensados para notificar por Telegram
reaproveitando `notifyTelegram.js`.

---

## 13. Dívida técnica e problemas conhecidos (honesto, sem filtro)

- ~~**Plano Vercel Hobby sem margem de functions para crescer**~~ — **parcialmente resolvido
  (Ago/2026):** 12/12 → 9/12 (3 de margem) via consolidação de 4 functions pequenas em
  `api/account.js` — ver secção 10. **Continua por resolver** o outro risco desta mesma nota: este
  projecto processa pagamentos, e os Termos de Serviço da Vercel definem qualquer fluxo de
  cobrança a visitantes do site como uso comercial, não permitido no plano Hobby — isso exige o
  plano Pro independentemente de quantas functions sobrem. Ver aviso no topo.
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
  IA de visão, secção 8). Desde a consolidação de Ago/2026 (secção 10) já **há margem** (3
  functions livres) para integrar o webhook do PaySuite sem precisar do plano Pro — antes disto
  não havia nenhum slot livre.
- **Templates visuais continuam em 70** (14 serviços × 5) apesar do número total de serviços já
  ter crescido para 18 — `transcricao` e `conversao` ainda não têm galeria de templates própria.
- ~~Seleccionar várias fotos de uma vez no OCR (`transcricao`/`trabalho`) perdia silenciosamente
  todas menos a 1ª em vários telemóveis Android~~ — **resolvido (Ago/2026):** o `<input
  type="file" id="ocrInput">` já tinha o atributo `multiple` ligado dinamicamente, mas o selector
  nativo de muitos Android não devolve de forma fiável mais do que 1 ficheiro em `e.target.files`
  mesmo assim, sem qualquer erro. Solução aplicada em `OCRController.js`: cada toque em "Adicionar
  Foto/Ficheiro" passou a **acumular** os ficheiros numa lista visível (`stagedFiles`,
  `#ocrStagedWrap` em `index.html`) em vez de processar de imediato — o utilizador pode repetir o
  toque quantas vezes precisar (uma página de cada vez, se for o que o telemóvel permitir de
  forma fiável) até ter todas as páginas, e só depois carrega em "Transcrever N página(s)". Corrigido
  também, na mesma função: um único ficheiro grande demais no lote fazia `return` e descartava
  **todo** o lote em silêncio — agora só esse ficheiro é ignorado, com aviso claro, os restantes
  continuam.
- ~~Deploys de correcções de UI/JS não chegavam aos telemóveis mesmo depois de feitos~~ — **causa
  identificada e documentada (Ago/2026):** `sw.js` faz precache explícito de `index.html`,
  `OCRController.js`, `DocumentController.js` e `styles.css` com `revision: CACHE_VERSION`; o
  projecto já tinha `scripts/inject-version.js` (chamado pelo `"build"` do `package.json`) para
  gerar esse valor automaticamente a partir de `VERCEL_GIT_COMMIT_SHA` em cada deploy — mecanismo
  correcto e já existente, não foi preciso criar nada de novo. O sintoma reportado foi, muito
  provavelmente, o ciclo de vida normal do Service Worker (uma aba já aberta continua controlada
  pela versão antiga até ser fechada/recarregada — o botão `mzUpdateNow` em `app.js` já trata
  disto) e não uma falha do `inject-version.js`. Fica documentado aqui para o caso de o sintoma se
  repetir: confirmar primeiro se `CACHE_VERSION` no `sw.js` publicado corresponde ao commit mais
  recente antes de suspeitar do build.
- **Páginas que continuam ilegíveis mesmo após as rondas de recuperação são uma limitação física
  da fotografia (desfoque, inclinação, pouca luz), não um bug de código** — `api/misc.js` agora dá
  a essas páginas o mesmo número de tentativas que a páginas com erro de rede (antes só tinham 1),
  e `prompts/transcricao.js` (regra 8) já não as omite silenciosamente do documento final, mas não
  há (ainda) nenhum pré-processamento de imagem (correcção de rotação/contraste antes do envio à
  IA de visão) que aumente a taxa de sucesso da própria leitura.
- **Sem teste automatizado para o fluxo de acumulação de páginas do OCR** — `OCRController.js`
  (staged pages, validação por ficheiro, `runStaged()`) não tem nenhuma suite dedicada; a suite
  mais próxima, `tests/ocrSchemaAlignment.test.js`, cobre apenas o alinhamento schema↔formulário,
  não a lógica de acumulação/retry introduzida nesta ronda.

---

## 14. Conformidade legal (Moçambique)

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

## 15. Histórico de versões

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
| v57 (Ago/2026) — fiabilidade do OCR multi-página (`transcricao`) | Reportado em produção: fotografar 9 páginas de um documento manuscrito resultava num documento final com o conteúdo de apenas 1 página. Três correcções em cadeia, cada uma isolando a causa seguinte: **(1)** `OCRController.js` — o `<input type="file">` perdia silenciosamente todas as fotos menos a 1ª em vários Android; solução: acumulador de páginas (`stagedFiles`) com lista visível e botão "Transcrever N página(s)", em vez de processar de imediato ao escolher ficheiros; corrigido também um bug em que 1 ficheiro grande demais no lote descartava o lote inteiro. **(2)** Confirmado que `scripts/inject-version.js` (build da Vercel) já gera `CACHE_VERSION` automaticamente a partir do commit — não foi preciso criar mecanismo novo, apenas documentar para diagnóstico futuro. **(3)** `api/misc.js` — páginas que "liam" mas devolviam transcript vazio nunca tinham 2ª tentativa (só páginas com erro de rede eram repetidas); `prompts/transcricao.js` (nova regra 8) — páginas que continuam ilegíveis após as tentativas deixam de desaparecer silenciosamente do documento final, passando a mostrar um aviso visível a pedir nova fotografia dessa página específica |
| v57 (Ago/2026) — migração `migration_v57_atomic_payment_confirmation.sql` (P0/P1-02, auditoria Ago/2026) | Confirmação de pagamento + crédito ao utilizador passam a correr dentro de uma única função `confirm_payment_and_credit()` (transacção PL/pgSQL atómica), em vez de dois pedidos REST separados ao PostgREST — elimina a janela entre marcar `completed` e creditar em que uma falha de rede/processo deixava a transacção paga sem crédito atribuído. Ver secção 8 — **numeração coincide, mas é independente da ronda de OCR acima** |
| v58 | Não existe ficheiro de migração numerado `v58` no repositório — gap real, tal como o gap v18/v19 já documentado na secção 6.3 |
| v59 (Ago/2026) — `migration_v59_observability.sql` (P2-04) | Observabilidade estruturada: tabela `metrics_events` + três views de dashboard (`v_payment_funnel_daily`, `v_ocr_health_daily`, `v_document_generation_daily`) + `api/_lib/observability.js` (`logEvent()`) chamado a partir dos fluxos de pagamento/OCR/geração/ledger. Ver secção 12.3 |
| v60 (Ago/2026) — `migration_v60_idempotent_credit_operations.sql` (P1-08) | `deduct_credits_idempotent()`/`refund_credit_idempotent()`: `operation_id` gerado pelo cliente por tentativa de geração evita débito/reembolso duplicado em retries de rede; 100% aditivo, funções antigas continuam como fallback. `tests/creditLedgerConcurrency.test.js` cobre o contrato do lado da aplicação; `scripts/test-credit-concurrency.js` cobre o lock real contra staging. Ver secções 8, 11 e 12.1 |
| Ago/2026 (mesma ronda) — CI, lint e scripts de manutenção | `eslint.config.mjs` liga lint real ao CI pela primeira vez (antes: `"lint": "echo 'Linting not configured yet'"`, não apanhava nada); `jest.setup.js` corrige falhas de `AbortSignal.timeout`/`.any` no ambiente jsdom dos testes (bug do ambiente de simulação, não do código); `scripts/ocr-golden-eval.js` e `tests/fixtures/orc/` criam o primeiro golden dataset (ainda pequeno — 2 exemplos) para medir regressões de OCR em vez de avaliar só "a olho" |
| Ago/2026 (ronda actual) — consolidação de Serverless Functions (P1-07, parte 2) | `api/misc.js` já tinha sido reduzido a router fino (ronda anterior); esta ronda resolveu a contagem real de functions, que é independente disso: `api/verify-credits.js`, `api/deduct-credit.js`, `api/delete-temp-account.js` e `api/cleanup-temp-accounts.js` (4 functions pequenas do mesmo domínio) foram absorvidas por `api/account.js` (router, dispatch `?_op=`) + `api/_services/account.js` (lógica movida sem alteração de comportamento); `vercel.json` actualizado (`functions`, `rewrites` para as 3 rotas chamadas pelo frontend, `crons` para o cron diário); `tests/deduct-credit.test.js` e `tests/credit-expiry.test.js` actualizados para importar do novo local. Resultado: **12 → 9 Serverless Functions**, 3 de margem — ver secção 10 |
| v61 (Ago/2026) — `migration_v61_dynamic_packages_and_bonus_schedule.sql` | Duas funcionalidades novas do admin: **(1)** Pacotes de créditos dinâmicos — a tabela `credit_packages` (criada na v8, fechada por RLS na v24 por estar órfã) passa a ser a fonte de verdade em `api/_lib/packages.js`, com fallback para o sistema antigo de chaves fixas em `system_settings` (compat, zero regressão se a migração ainda não tiver corrido) e para os valores hard-coded como última rede de segurança; CRUD completo em `api/admin/index.js` (`handlePackages`, acção `packages`); admin.html/AdminApp.js ganham um gestor de pacotes (criar/editar/desactivar/apagar, id/nome/descrição/créditos/preço/bónus/destaque "Popular"); `index.html`, `perfil.html` e `templates.html` deixaram de ter 4 cartões de pacote fixos no HTML — `renderPackageCards()` (`PaymentController.js`) constrói o grid a partir da resposta real de `/api/config`, suportando qualquer número de pacotes. **(2)** Agendamento da promoção de créditos bónus — `bonus_promo_starts_at`/`bonus_promo_ends_at` (opcionais) em `system_settings`, aplicados dentro de `handle_new_user()`: a promoção só é concedida a novos registos dentro da janela definida, mesmo com o interruptor manual em "Sim". A validade de cada crédito bónus concedido (`bonus_credits_expiry_days`) já era aplicada de facto desde a v52 via `credit_ledger` — a nota do admin.html que dizia o contrário (escrita antes de eu confirmar a v52 no código) foi corrigida |
| v62 (Ago/2026) — `migration_v62_whatsapp_leads_and_marketing_consent.sql` | **(1)** Novo campo opcional `profiles.whatsapp` (índice não-único): torna o lead mais accionável (taxa de resposta muito maior em Moçambique do que e-mail) e passa a ser uma via alternativa no ecrã "Esqueceu a password?" — `api/auth/index.js` (`handleResetPassword`) resolve o e-mail associado via este campo ou via `phone` como fallback; o envio continua a ser feito por e-mail via Supabase (não existe gateway de OTP/mensagens WhatsApp configurado). **(2)** Novo toggle de consentimento de marketing no registo (visualmente igual ao de Termos, mas nunca bloqueia a criação de conta) — guardado como `profiles.marketing_consent`/`marketing_consent_at` (segmentação rápida) e como registo formal em `consent_logs` (mesma tabela da v48, novo valor `'marketing'` aceite pelo `CHECK`). Wiring confirmado em `AuthUI.js`/`AuthManager.js` (`regWhatsapp`, `consentMarketing`) |
| v63 (Ago/2026) — `migration_v63_partner_bookings.sql` | Agendamento real com a papelaria/gráfica parceira: nova tabela `bookings` (`type` foto/documento, `service`, dados do cliente, cópia `details` em JSONB do formulário no momento do pedido, `status` pendente/agendado/em_andamento/concluído/cancelado). O envio por WhatsApp continua a ser o canal de entrega do ficheiro/foto — esta tabela é o que permite à parceira, no Portal (`parceiro-portal.html`), ver a lista de pedidos recebidos e actualizar o estado de cada um, em vez do fluxo antigo em que o pedido só existia dentro de uma conversa de WhatsApp sem nenhum registo no sistema. Wiring em `api/partners.js`, `DocumentController.js`, `NearbyPartners.js`, `ServiceDefinitions.js` |
| v64 (Ago/2026) — `migration_v64_template_purchases.sql` | Dois bugs reais confirmados por captura de ecrã, corrigidos juntos: **(1)** fuga de receita — o SELECT do modal de detalhe de um template (`tplList` em `api/_services/templates.js`) não incluía `credit_cost` (só o cartão da grelha, via `v_templates_gallery`, mostrava o preço correcto); um template pago aparecia no modal como "✓ Gratuito" e o botão "Usar este Template" nunca debitava créditos. **(2)** não existia registo de "este utilizador já pagou por este template" — cada reutilização cobrava créditos e pagava royalties ao autor outra vez pela mesma compra. Nova tabela `template_purchases` (UNIQUE por `template_id`+`user_id`, RLS só leitura própria, inserção apenas via service_role) é a memória permanente de posse; `tplList` devolve `already_purchased` quando há sessão válida, e `tplUse` só chama `process_template_sale`/regista a compra quando `!alreadyOwned` — desbloqueio, uma vez pago, por tempo indefinido. Wiring confirmado em `TemplatePicker.js` (`serverTpl?.already_purchased`) |
| Correcções de código (Ago/2026, mesma ronda da v64) | O selector "Escolher Modelo" dentro do resultado do documento (`assets/js/marketplace/TemplatePicker.js`) carrega templates directamente do Supabase (chave pública), um caminho **separado** de `templates.html` — tinha o mesmo bug de fuga de receita da v64 (badge "💰 N créd." correcto, mas "Usar este Modelo" aplicava sem cobrar), corrigido em separado com o mesmo padrão (confirmação de preço/posse no servidor antes de debitar, via `/api/deduct-credit` + `/api/templates?action=use`). Aproveitado para dar suporte real a fotos de perfil nos templates: qualquer template (próprio ou da Galeria) que declare um placeholder `{{FOTO}}` no `htmlTemplate` passa a mostrar uma opção de carregar foto no selector — recorte quadrado + compressão no browser antes de guardar, com fallback automático para o monograma de iniciais quando não há foto; `cv-executivo` (`templates/cv.js`) é o primeiro a usar isto. Também corrigidos, na mesma ronda: `_fillTemplate()` deixou de exigir correspondência exacta de maiúsculas/acentos entre o nome do placeholder no HTML e a chave de dados (`{{nome_completo}}`, `{{Telefone}}`, etc. de templates de terceiros ficavam sempre em branco/visíveis em bruto); secções duplicadas no preview de um template com layout HTML próprio (o preview mostrava a secção "Experiência" duas vezes quando o documento tinha mais texto do que uma página); e um bug de paginação do editor (WYSIWYG) em que sair e voltar ao modo "Preview" sem qualquer edição real já reconvertia e corrompia o conteúdo, unindo páginas que deviam continuar separadas |
| v65 (Ago/2026) — `migration_v65_partner_category_packages.sql` | **(1)** Pacotes de créditos exclusivos por categoria de parceiro/afiliado — nova coluna `credit_packages.partner_segment`; a categoria de cada utilizador é sempre resolvida no servidor (`resolveUserPricingSegment()`, novo em `api/_lib/packages.js`), nunca aceite do cliente, com validação real (401/403) em `api/process-payment.js` no momento da compra — não só no que é mostrado no ecrã. Novo endpoint autenticado `GET /api/account?_op=my-packages` expõe os pacotes exclusivos de cada um, à parte de `/api/config` (que nunca os pode incluir — é uma resposta pública em cache partilhado na CDN). **(2)** Ponte bidireccional entre o painel de afiliado e o Portal da Parceira: quem se regista como afiliado `papelaria`/`cyber`/`universidade` vê um convite para candidatar o mesmo negócio à Rede de Parceiros (já existia, agora com pré-preenchimento também no sentido inverso); um parceiro `papelaria` já aprovado vê, pela primeira vez, o convite equivalente para se tornar também afiliado (`parceiro-portal.html`), com nome/telefone pré-preenchidos em `afiliado.html` — só `papelaria` tem esta direcção, `advogado` não é um segmento de afiliado válido. **(3)** Corrigido de caminho, na mesma ronda: `resolveUserPricingSegment()` (função nova desta versão) tinha sido escrita a consultar uma tabela `affiliates` com coluna `user_id` que nunca existiu no projecto — os dados de afiliado vivem em colunas de `profiles` (`aff_segment`, `is_affiliate`, desde a `migration_v14`); o ramo de segmento de afiliado da função nunca teria funcionado sem esta correcção, só o ramo de parceiro (`partners.linked_user_id`) |
| v66 (Ago/2026) — `migration_v66_first_document_free.sql` | Substituído o mecanismo de "1 crédito grátis no registo" por "o primeiro documento é sempre grátis", por pedido explícito do cliente — diferença real, não só de nome: 1 crédito de saldo inicial só cobre um documento que custe exactamente 1 crédito, mas os custos vão de 1 a 10 (`VALID_COSTS`); o novo mecanismo cobre sempre o custo real do primeiro documento, através de um contador dedicado (`profiles.free_documents_used`) que nunca toca em `profiles.credits`. Uma conta registada via link de afiliado tem direito a 2 documentos grátis em vez de 1 (substitui o antigo bónus de +1 crédito por referência). Nova RPC atómica e idempotente `grant_free_document()`, chamada em `handleDeductCredit` (`api/_services/account.js`) antes de qualquer dedução paga, e sempre que `documentType` **não** comece por `"template_"` — modelos pagos do marketplace permanecem sempre pagos, nunca beneficiam disto, mesmo no primeiro documento de uma conta nova. Os dois mecanismos antigos (`free_credits_normal`, `aff_bonus_signup` em `system_settings`) foram desligados por configuração (posto a `'0'`), sem tocar nas funções/triggers que os liam — reversível sem deploy, se preciso. Corrigido de caminho um efeito colateral real: o reembolso automático em `api/generate-document.js` (dispara quando a geração falha depois de créditos terem sido debitados) enviaria um crédito nunca gasto para uma conta cujo documento tinha sido concedido gratuitamente; `Services.js` deixou de enviar o custo real ao gerar quando o documento foi grátis, para esse reembolso nunca disparar por engano. Todas as mensagens de interface que mencionavam "1 crédito grátis" (`AuthUI.js`, `homeController.js`, `afiliado.html`, `index.html`) foram actualizadas para reflectir o novo mecanismo |
| Ago/2026 (mesma ronda, sem migração — CSS/layout) | Alerta "⚠️ Créditos insuficientes" e notificações semelhantes escapavam do ecrã em telas estreitas — `.notif` em `styles.css` tinha `white-space:nowrap` sem largura máxima; corrigido para `white-space:normal`+`word-break`+`max-width:100%` dentro de `.notif-stack`. Nova classe reutilizável `.container{max-width:1024px;margin:0 auto;padding:0 16px}` substitui, por composição (classe extra no HTML, ex. `class="hdr-inner container"`), as várias classes `.wrap`/`.hero-inner`/`.section` com larguras inconsistentes (480–760px) espalhadas por `index.html`, `templates.html`, `parceiros.html`, `perfil.html`, `admin-parceiros.html` e `parceiro-portal.html` (páginas que carregam `assets/css/styles.css`; as páginas 100% standalone — `/pages/*`, `legal.html`, `blog.html`, `afiliado.html`, `admin.html` — foram deliberadamente deixadas de fora para não introduzir regressão fora do âmbito pedido). Consequência em cadeia detectada e corrigida na mesma ronda: `.sheet` (modal/bottom-sheet partilhado por todos os formulários) subiu de 560px para 720px para acompanhar a nova largura — mas `.a4-page` (folha branca do preview A4, `A4Renderer.js`, usado por `Views.js`/`DocumentEditor.js`) continuou com 560px hardcoded, fazendo `scalePage()` escalar o iframe do preview maior do que a caixa que devia contê-lo, transbordando texto para fora da folha no preview não-maximizado; corrigido para 720px em `A4Renderer.js` e no modal equivalente de `HistoryController.js`. **Nota para manutenção futura:** `.sheet` (`styles.css`) e `.a4-page` (`A4Renderer.js`) têm sempre de ser alterados juntos. Inconsistência pré-existente sinalizada mas não corrigida (fora do âmbito pedido): `TemplatePicker.js` tem o seu próprio `#tplPickerSheet` a 700px com um `.a4-page` local ainda a 560px |
| Ago/2026 (ronda seguinte) — bug real "Não foi possível planear o documento" | Geração de "Trabalho" (documentos multi-secção) falhava sempre com este erro em documentos com várias páginas. Causa raiz confirmada por leitura do código: `_planMode` em `api/generate-document.js` tinha o tecto de tokens fixo em 1024 — insuficiente para o número real de secções em documentos grandes (até ~21 secções em 30 páginas), cortando a resposta da IA a meio de uma string/objecto; o cliente (`LongDocumentEngine.js`) fazia `JSON.parse()` directo sobre essa resposta truncada, sem qualquer reparo nem nova tentativa. Corrigido com três mudanças, sem regressões (`diff` confirmado linha a linha antes de entregar): **(1)** `PLAN_SYSTEM_PROMPT` dedicado (JSON estrito, proíbe aspas por escapar dentro de títulos, formato compacto), usado só em `_planMode`, com temperatura 0.3; **(2)** tecto subiu de 1024 para 4096 (é só um tecto máximo — não gasta mais em planos pequenos); **(3)** `_parseSectionsJson()`/`_salvagePartialSections()` (novos em `LongDocumentEngine.js`) tentam parse directo → reparos comuns (aspas tipográficas, vírgulas a mais, objectos colados sem vírgula) → salvamento das secções já bem formadas antes do ponto de corte/corrupção (percorrendo a resposta char-a-char, respeitando strings/escapes), em vez de rejeitar o plano inteiro por um único carácter fora do sítio; mais 1 retry automático da fase de planeamento se tudo o resto falhar (seguro — nenhum crédito é debitado antes do plano ter sucesso) |
| Ago/2026 (mesma ronda) — auditoria completa aos providers de IA + sistema de alertas operacionais | Investigação dos logs reais da Vercel + painel admin (IA Providers) depois da correcção acima revelou que múltiplos providers estavam simultaneamente degradados/offline por razões todas diferentes, confirmadas uma a uma: **NVIDIA NIM removida** (contas NGC pessoais devolvem sempre `404 Function not found` em `/v1/chat/completions` — restrição do lado da conta NVIDIA, sem solução por código, `GET /v1/models` funcionava e mascarava o problema); **Together AI e Fireworks AI removidas** (deixaram de ter tier grátis contínuo — exigem depósito mínimo ou esgotam em minutos); **Cerebras corrigida** (llama-3.3-70b/qwen-3-32b descontinuados a 16/Fev/2026, lista reordenada); **Google Gemini corrigida** (gemini-1.5-flash e gemini-2.0-flash ambos desligados pela Google, trocado para os aliases `-latest`); **SambaNova corrigida** (tier real é 20 pedidos/dia **por modelo**, não 20/minuto — lista expandida para 5 modelos grátis reais, quintuplicando o tecto efectivo). **4 providers novos ligados** para substituir os removidos: GitHub Models, Cloudflare Workers AI (única com 2 env vars obrigatórias — `extraEnvVars`/`isProviderConfigured()`/`resolveUrl()` novos em `aiProviderRegistry.js`), Hugging Face Inference, Cohere — `UNWIRED_RESERVE` fica vazio pela primeira vez. **Disjuntor corrigido**: um bloqueio permanente (7 dias) antigo deixa de ser respeitado quando a descoberta ao vivo confirma, agora mesmo, que o modelo voltou a existir (`discoveredLive`, ver `modelHealth.js`/`aiRace.js`) — antes disto, um modelo continuava bloqueado mesmo depois do provider repor o catálogo. **Botão "🔄 Reactivar"** (por provider e "Reactivar todos") no painel admin → IA Providers, que limpa manualmente o disjuntor sem esperar o cooldown automático — `resetProviderHealth()` (`modelHealth.js`) + `POST /api/admin/ai-providers { resetCircuitBreaker }` (`api/admin/index.js`). **Novo sistema de alertas operacionais**: `api/_lib/notifyOps.js` acrescenta um segundo canal (WhatsApp via CallMeBot, gratuito, sem processo de aprovação da Meta) ao Telegram já existente; alerta em tempo real quando um provider esgota todos os modelos 5 vezes seguidas (cooldown de 12h contra spam, `recordProviderSuccess()`/`recordProviderExhaustion()` novos em `modelHealth.js`); cron diário novo (`api/_lib/aiProviderWatchdog.js`, 07:00 hora de Moçambique, via `/api/misc?action=ai-providers-cron`, sem consumir uma Serverless Function nova) que reporta providers offline-hoje ou cronicamente degradados (< 20% sucesso em 3 dias) — só envia mensagem se houver de facto um problema |
| Ago/2026 (mesma ronda) — visibilidade do "documento grátis" (v66) no painel admin | Bug de visibilidade real, sem código para diagnosticar: o admin via contas novas com `0 créditos` sem forma de saber se ainda tinham direito ao documento grátis da v66 (que não mexe em `profiles.credits`) ou se já o tinham usado. Corrigido em `AdminApp.js`/`admin.html`/`api/admin/index.js`, sem regressões: badge "🎁 Grátis por usar (n/allowance)" ou "🎁 Grátis usado" na lista de Utilizadores (mobile e desktop), calculado a partir de `free_documents_used`+`referred_by` (allowance 1, ou 2 se referida) via `_freeDocState()`/`_freeDocBadge()`; novo filtro no dropdown de tipo de utilizador ("Doc. grátis por usar"/"Doc. grátis já usado"); mesma informação exposta no topo do modal Timeline/CRM de cada conta. Selecção com fallback de 4 níveis no Supabase client (`_loadUsers()`) e try/catch no backend (`handleUserTimeline`) para nunca quebrar o painel caso a `migration_v66` ainda não tenha corrido nalgum ambiente — nesse caso simplesmente não mostra o badge, em vez de arriscar um estado errado |

| Ago/2026 (ronda actual) — "Trabalho Escolar": margem, nome de ficheiro e excesso de páginas | Reportado com PDF real anexado: (1) margem física zero em **todas** as páginas do PDF descarregado (preview e "Documento completo" continuavam correctos) — causa: `_extractPageMargin()` (`HTMLPDFExporter.js`) procurava a primeira ocorrência de `body{...padding...}` na CSS; `DEFAULT_PAGE_CSS` (`A4Renderer.js`) tem DUAS regras que batem com esse padrão — `html,body{margin:0;padding:0;...}` (adicionada depois, para um fix de sidebar) aparece primeiro e já tem `padding:0`, por isso era essa a apanhada, nunca a regra real mais abaixo (`padding:30mm 25mm 25mm 30mm`); corrigido para percorrer todas as ocorrências e ficar com a ÚLTIMA que define padding, replicando a cascata real do CSS. (2) nome de ficheiro só mostrava "Trabalho Escolar" ao "Guardar como PDF" — o `<title>` da janela de impressão (usado pelo browser para sugerir o nome) estava fixo em `svc.title`, nunca no nome completo já construído por `_buildFilename()`; corrigido em 3 pontos de `DocumentController.js` e 4 de `DocumentEditor.js`. (3) PDF pedido com N páginas saía sistematicamente 50-60% maior (10 pedidas → 16 no PDF) — a estrutura obrigatória do prompt (`trabalho.js`) exigia um mínimo FIXO de 9 parágrafos por capítulo, independente do tamanho pedido; para 10 páginas isto dava 5 capítulos × 9 + intro(5) + conclusão(4) = 54 parágrafos mínimos; corrigido com menos capítulos por página disponível (~2.2 em vez de ~1.5) e mínimos de parágrafo escalados ao tamanho do pedido (só pedidos genuinamente extensos, >16 páginas, mantêm a exigência mais rica) |
| Ago/2026 (ronda seguinte) — custo dinâmico + cálculo matemático de tokens para "Trabalho Escolar" | Custo em créditos era fixo (1) independentemente do nº de páginas pedido — pedido explícito: 1 crédito a cada 5 páginas. `trabalho` ganhou `dynamicCostPerPage: 5`/`dynamicCostSource: 'paginas'` em `ServiceDefinitions.js`; `DocumentController.generate()` lê `data.paginas` do formulário (não `docModel.ocrPageCount`, usado por `transcricao`); botão "Gerar com IA" actualiza o custo ao vivo enquanto o campo é editado (`_computeDynamicCost()`/`updateGenCostLabel()`, `Views.js`). Na mesma ronda, o tecto de tokens enviado à IA (`maxTokens`, `api/generate-document.js`) deixou de ser sempre um valor fixo de 8192 para "trabalho": nova `estimateWordBudget()` (`trabalho.js`) calcula as palavras esperadas a partir do nº de páginas pedido + a composição real das secções fixas (capa/folha de rosto/resumo/índice/introdução/conclusão/referências, à mesma densidade de palavras/página calibrada por nível); o valor viaja como `_maxTokensHint` (`Services.js` → corpo do pedido a `/api/generate-document`) e é sempre validado/limitado no servidor ([1024, 16000]) antes de usado — nunca confia cegamente no que o browser envia |
| Ago/2026 (mesma ronda) — estrutura académica completa + numeração de página real | Pedido explícito, com referência a um guia externo de normas académicas: capa deixou de ter tabela (`| Campo | Detalhe |`, criticada por parecer uma grelha de formulário) e passou a hierarquia tipográfica pura (instituição em H2, blocos separados por `---`, nome do estudante em negrito isolado) — `CoverNormalizer.js`. Nova **Folha de Rosto** como página própria a seguir à capa, só para níveis universitários (Pré-Universitário/Licenciatura/Mestrado-Doutoramento), com a frase formal de enquadramento do trabalho, construída no código (nunca pedida à IA, pelo mesmo raciocínio de fiabilidade já aplicado à capa desde a ronda anterior). Estrutura académica completa em `trabalho.js`: **Resumo e Palavras-chave** (sempre, para níveis universitários) e **Dedicatória/Agradecimentos/Epígrafe** (opcionais, novo campo "Secções extra" em `ServiceDefinitions.js`) inseridos entre a capa e o Índice. "Páginas pretendidas" redefinido para significar só páginas de **desenvolvimento** — capa/folha de rosto/resumo/índice/introdução/conclusão/referências somam-se a esse valor, nunca o descontam (antes, `devPags = pags - 3` fazia o oposto). Números do Índice deixaram de ser adivinhados (`i + 4`) e passaram a calculados matematicamente: nº de parágrafos × linhas por parágrafo (ponto médio do intervalo do perfil) × palavras por linha (13, estimativa para texto académico justificado em português) ÷ densidade de palavras/página calibrada por nível — mesma matemática reutilizada em `estimateWordBudget()`. Numeração de página real (`1, 2, 3...`) impressa pelo motor de impressão do browser em cada folha via `@page { @bottom-center { content: counter(page) } }` (`HTMLPDFExporter.js`, novo parâmetro `pageNumbers`), activada só no caminho sem template de marketplace para não sobrepor rodapés de templates reais. Corrigido em conjunto: `tests/ocrSchemaAlignment.test.js` falhava no CI porque o novo campo `extras` não estava na lista de lacunas conhecidas do schema OCR (`KNOWN_OCR_GAPS.trabalho`) — não é informação extraível de uma foto, é uma escolha de estrutura do documento final. **Limite assumido, não resolvido:** os números do Índice continuam a ser uma estimativa matemática, não uma medição real — só um segundo passo depois da paginação real (gerar → paginar → medir → reescrever o índice → repaginar) garantiria exactidão a 100%, e isso é uma mudança de arquitectura maior, deliberadamente não feita nesta ronda |
| Ago/2026 (mesma ronda) — alternador Papelarias/Advogados no ecrã de resultado | Pedido explícito: no bloco onde antes só apareciam advogados (e só para tipos de documento jurídicos), passou a haver um alternador de duas abas — Papelarias (parceiro principal por omissão) e Advogados — mesmo padrão visual dos filtros de categoria da homepage (`.cat-filters`/`.cat-btn`). Nova `injectPartnerToggleIntoModal()` (`NearbyPartners.js`), que delega sempre nas funções já existentes (`injectPartnersIntoModal`/`injectLawyersIntoModal`) em vez de reimplementar a busca; ligada em `DocumentController._showLawyerReferral()`, com a aba Papelarias a filtrar sempre pelo serviço real `impressao` (nunca pelo id do tipo de documento — esses ids não existem na lista de serviços de uma papelaria, o que faria a busca achar sempre "nenhuma papelaria faz este serviço"). Estendido, a pedido, de 6 tipos de documento jurídicos para **qualquer** documento gerado (`LEGAL_DOC_TYPES` passou a decidir só a especialidade do filtro de advogados, não se o bloco aparece); e ligado também à reabertura de um documento "Do Arquivo" (`HistoryController._viewDoc()`), que usa um caminho de código diferente do da geração e nunca tinha chamado esta função — **limite assumido:** o visualizador leve `_viewDocLite` (páginas sem o editor completo, ex. `/perfil.html`) não tem acesso ao `docController` de onde isto é injectado, por isso continua sem o alternador. Corrigido em conjunto um bug real: seleccionar uma papelaria no ecrã de resultado mostrava "✅ Papelaria seleccionada" mas não activava nenhum botão de envio — o botão real (`#btnWaDirect`) só existia no formulário de ANTES de gerar; novo botão próprio (`#btnWaDirectResult`) e nova `sendDirectForGeneratedDoc()` (constrói a mensagem a partir do documento já gerado, não de um formulário fechado); `selectPartner()`/`resetPartnerSelection()` (`NearbyPartners.js`) passaram de `getElementById` por id único para `querySelectorAll('.btn-wa-direct')`/`.mz-wa-hint` por classe, para activar os dois botões possíveis (form + resultado) consoante o que existir no DOM |
| Ago/2026 (mesma ronda) — botão "WhatsApp" genérico do ecrã de resultado | Reportado com duas capturas de ecrã: o botão verde "WhatsApp" (barra Download/Copiar/WhatsApp) abria sempre uma conversa com `WA_NUMBER()` — o número de **suporte da própria plataforma** — em vez de deixar a pessoa escolher o destinatário; e despejava os primeiros 1000 caracteres do conteúdo do documento como texto solto, com a formatação Markdown mal traduzida (títulos a virar `*` a meio de palavras) e o literal `---PAGE_BREAK---` à mistura. Corrigido em duas partes: `https://wa.me/?text=...` sem número (em vez de `wa.me/${WA_NUMBER()}`) abre o selector de contactos do WhatsApp, mesmo padrão já usado correctamente em `_showReferralCTA()`; `WA_NUMBER()` removida de `DocumentController.js` por ter ficado morta (`PaymentService.js` mantém a sua própria, correcta nesse contexto — confirmações de pagamento devem mesmo ir para o suporte). A mensagem deixou de tentar reproduzir o conteúdo do documento — passou a avisar claramente que o PDF vem a seguir (nunca finge que o texto É o documento) e a ser uma cópia curta pensada para **conversão**: quem recebe fica a saber o que é o MzDocs Pro e como experimentar grátis, com o link de afiliado da pessoa quando tem sessão iniciada (mesmo formato de link de `_showReferralCTA`) — quem se registar a partir daí também conta para os créditos de afiliado de quem enviou. **Limite técnico assumido, não contornável por código:** um link `wa.me` só consegue pré-preencher texto — nunca anexa um ficheiro automaticamente (o WhatsApp não expõe essa possibilidade a sites); a pessoa é agora avisada por notificação a lembrar de descarregar e anexar o PDF manualmente |

| Componente | Versão |
|---|---|
| `package.json` | `11.0.0` |
| `sw.js` (CACHE_VERSION) | auto-gerado a cada deploy (`v<sha-git-7-chars>-<YYYYMMDD>`) |
| Migrações Supabase | até `migration_v66_first_document_free.sql` (gaps reais em `v18`/`v19` e `v58`), mais ficheiros avulsos não numerados |
| Serviços | 18 (16 com IA + 2 via WhatsApp) |
| Templates visuais integrados | 70 (14 serviços × 5) |
| Providers de IA — com adaptador (competem) / catalogados sem adaptador | 10 / 0 (10 no total) — auditoria Ago/2026 |
| Alertas operacionais | Telegram + WhatsApp (CallMeBot) — tempo real (provider esgota tudo 5× seguidas) + resumo diário 07:00 (Maputo) |
| Preço máximo de um template no Marketplace | 10 créditos (`migration_v56`) |
| Compra de template pago | desbloqueio permanente desde a v64 (`template_purchases`) — paga-se uma vez, usa-se para sempre |
| Primeiro documento grátis | desde a v66 (`free_documents_used`) — 1 conta normal / 2 via afiliado, nunca em `profiles.credits`, visível no painel admin |
| Agendamento com parceiros (foto/impressão) | desde a v63 (`bookings`) — pendente/agendado/em_andamento/concluído/cancelado, gerido no Portal da Parceira |
| Testes (Jest, CI) | 10 suites, ≈ 1.458 linhas |
| Scripts de manutenção (fora do CI) | 4 (`inject-version`, `legal-ingest`, `ocr-golden-eval`, `test-credit-concurrency`) |
| Observabilidade | `metrics_events` + 3 views SQL (`migration_v59`), retenção de 90 dias |
| Serverless Functions (Vercel Hobby) | 9 de 12 — 3 de margem (era 12/12 até Ago/2026); cron diário de vigilância de providers reaproveita `/api/misc`, sem consumir função nova |
| Pacotes de créditos | dinâmicos desde a v61 (`credit_packages`) — 5 pré-migrados (avulso/starter/basico/pro/empresa), sem limite de quantos o admin pode criar |

---

*MzDocs Pro — Desenvolvido por Manuel Amad Charifo · [mzdocs.co.mz](https://mzdocs.co.mz)*
