# Roadmap de Escala — MzDocs Pro
### De 0 a 50.000 utilizadores · Vercel Hobby/Pro + Supabase + orçamento baixo

*Avaliação técnica baseada no estado real do código (zip de Agosto/2026, migrações até `v51`),
não no README — que já teve o seu próprio saneamento em separado. Esta é uma reescrita da versão
anterior deste roadmap (baseada no zip de Junho/2026): duas das suas afirmações técnicas centrais
já não correspondem ao código actual — ver nota de reescrita no fim do documento.*

---

## 0. Os 3 factos que importam mais do que qualquer roadmap

Antes de falar em "0 a 50.000", há três coisas que mudam a prioridade de tudo o resto.

**1. O projecto já está, tecnicamente, fora dos Termos de Serviço da Vercel.**
`api/process-payment.js` cobra/regista pagamentos de visitantes do site. A Vercel define isso
explicitamente como "uso comercial", proibido no plano Hobby — só permitido a partir do Pro
(20 USD/mês). Não é uma questão de volume de utilizadores; é uma questão contratual. A Vercel
pode suspender um deployment no plano errado sem aviso prévio. **Este ponto já foi assinalado em,
pelo menos, quatro auditorias sucessivas do projecto e continua sem evidência de ter sido
resolvido.** Acção: migrar para o Pro antes de qualquer campanha de crescimento, independentemente
de estarem em 50 ou 5.000 utilizadores.

**2. O verdadeiro tecto da MzDocs Pro não é técnico — é o WhatsApp.**
Hoje, a via principal de confirmação de pagamentos (M-Pesa/e-Mola/mKesh) é a verificação
automática por IA de visão (`api/_lib/visionAI.js`, aprovação se confiança ≥ 0.85), com fallback
manual via WhatsApp para os casos que a IA não aprova sozinha. Isto já é mais escalável do que
"100% manual" — mas o fallback continua a depender de uma pessoa a ler WhatsApp e a clicar
"confirmar" no admin, e é esse fallback que não escala com servidores, só com horas humanas. Uma
pessoa dedicada confirma manualmente de forma sustentável ~40–60 casos/dia. Isso continua a ser
um tecto real do negócio, só que agora é sobre a **fatia que a IA rejeita**, não sobre 100% do
volume.

**3. A corrida entre até 13 provedores de IA é óptima para fiabilidade, mas cara em quota — e o
número real de "corredores" já não é fixo em 5.**
Cada geração de documento dispara `Promise.any()` (`raceAllProviders()` em
`api/generate-document.js`) contra **todos os providers que tiverem chave configurada** — hoje,
o registo central (`api/_lib/aiProviderRegistry.js`) suporta até **13 providers**: Groq e Cerebras
(tier "generoso", grátis e generoso), Gemini e OpenRouter (tier "médio"), e NVIDIA NIM, Mistral,
SambaNova, Together AI e Fireworks AI (tier "reserva activa"), além de Cloudflare Workers AI,
GitHub Models, Hugging Face e Cohere (sem tier atribuído, adições mais recentes). Se o projecto
tiver, hoje, chaves configuradas para 8 desses 13, cada documento gerado consome quota de **8**
serviços simultaneamente, não de 1 — e o problema cresce, não diminui, à medida que mais chaves
gratuitas forem adicionadas para "mais fiabilidade". O sistema já tem descoberta de modelos ao
vivo (`modelDiscovery.js`) e um disjuntor por modelo (`modelHealth.js`) — isto resolve bem o
problema de "o provider mudou o catálogo" ou "um modelo específico está a falhar", mas **não**
resolve o problema de quota descrito aqui, que é estrutural à forma como `raceAllProviders()`
está escrita hoje (todos os disponíveis, sempre, sem respeitar os tiers já definidos no registo).

O resto deste documento assume que estes três pontos já foram resolvidos ou estão a ser resolvidos
em paralelo às fases abaixo.

---

## 1. O que já está bem construído (não tocar sem motivo forte)

Vale registar isto porque um roadmap de escala mal informado tende a recomendar reescrever coisas
que já estão correctas — e, desde a última versão deste documento, esta lista cresceu:

| Decisão já tomada | Porque já é a escolha certa |
|---|---|
| `api/_lib/supabaseAdmin.js` — REST puro em vez do SDK `@supabase/supabase-js` | Elimina `ws`, reduz cold start, evita o bug documentado de "crédito debitado sem documento gerado". **Confirmado: já cobre o projecto inteiro**, incluindo `api/admin/index.js` e `api/misc.js` — nenhum `require('@supabase/supabase-js')` nem `require('ws')` activo restante em `api/` |
| Registo central de providers de IA (`aiProviderRegistry.js`) com descoberta de modelos ao vivo (`modelDiscovery.js`) e disjuntor por modelo (`modelHealth.js`) | Um provider novo entra na corrida só por a env var existir; um modelo descontinuado é saltado automaticamente; um modelo com falhas transitórias é posto de lado com backoff crescente sem intervenção manual. Isto é infra-estrutura de auto-cura que a maioria dos projectos deste porte não tem |
| Dedução de crédito via RPC atómica + reembolso automático em falha total | Resolve a corrida (*race condition*) clássica de sistemas de crédito sem precisar de uma fila externa |
| Consolidação em 12 funções (`misc.js`, `admin/index.js` como roteadores internos) | Respeita o limite real e actual do Vercel Hobby/Pro (12 functions por deployment) — **e já está fisicamente no limite, sem margem** |
| Rate limiting com Upstash Redis + fallback em `Map` local | Padrão correcto; só falta tornar o Redis obrigatório em produção (ver Fase 1) |
| Mascaragem de dados pessoais em duas camadas (`piiRedaction.js` no servidor + `piiShield.js` no browser) antes de qualquer prompt sair para os providers de IA | Reduz materialmente o que fica exposto a 13 fornecedores externos possíveis — relevante precisamente porque o ponto 0.3 acima significa que mais fornecedores veem o texto, não menos |
| Conformidade LPD já implementada antes de ser legalmente obrigatória (`consent_logs`, direito ao esquecimento, `migration_v48`) | Moçambique ainda não tem lei de protecção de dados autónoma em vigor — o projecto já está à frente da obrigação legal actual, o que reduz risco de retrabalho quando a lei for aprovada |
| Índices em praticamente todas as tabelas de alto tráfego (`transactions`, `documents`, `credit_logs`, `page_views`, `templates_custom`, afiliados) | A maior parte dos projectos só pensa nisto depois de já ter lentidão em produção — aqui já está feito |
| `page_views` agregada por (página, dia) em vez de 1 linha por visita | Evita uma tabela que cresceria sem limite |
| PWA com Service Worker — visitas repetidas quase não consomem bandwidth da Vercel | Isto poupa dinheiro real à medida que a base de utilizadores cresce |

---

## 2. Premissas assumidas neste roadmap

Não há dados reais de produção partilhados, por isso os números de cada fase usam suposições
explícitas e conservadoras, típicas de um produto de documentos B2C em Moçambique:

- "Utilizadores" = contas registadas acumuladas (não MAU).
- Taxa de conversão para pelo menos 1 compra: 5–8% dos registados, ao longo da vida da conta.
- Documento médio gerado: ~5 KB de markdown guardado em `documents.content`.
- Pacote mais comprado: "Básico" (280 MZN / 25 créditos) — usado como referência de ticket médio.
- Pico de concorrência simultânea: 2–5% da base registada (ex.: campanha em horário de explosão
  escolar/universitária).
- **Número médio de providers de IA com chave activa configurada em produção: 5–8 de 13
  possíveis** — as fases abaixo usam este intervalo em vez de um número fixo, precisamente porque
  o registo central torna esse número uma decisão operacional, não uma constante de código.

Onde os números forem incertos, isso é dito explicitamente — o objectivo é dar limiares de decisão
("isto torna-se um problema a partir de X"), não previsões financeiras exactas.

---

## Fase 1 — 0 a 1.000 utilizadores

**Objectivo da fase:** validar produto e canal de aquisição sem se preocupar com infraestrutura.

### Gargalos
- Conformidade contratual da Vercel (ponto 0.1) — único bloqueador real desta fase.
- Confirmação manual de pagamentos (o que sobra depois da aprovação automática por IA de visão):
  a 5–8% de conversão, são ~50–80 pagamentos *no total* nesta fase, e uma fatia menor ainda cai no
  fallback manual. Zero problema operacional ainda.
- Rate limiting em `Map` local deixa de ser fiável assim que a Vercel decide correr 2+ instâncias
  simultâneas da mesma function sob qualquer pico de tráfego (mesmo pequeno) — o limite "por
  utilizador" passa a ser, na prática, "por instância".

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel | **Pro** (obrigatório — ver ponto 0.1) | 20 USD |
| Supabase | Free (500 MB DB, 50k MAU, 5 GB egress) | 0 USD |
| Upstash Redis | Free (10k comandos/dia) | 0 USD |
| Providers de IA | Tiers gratuitos (Groq/Cerebras "generoso" + Gemini/OpenRouter "médio" chegam para esta fase) | 0 USD |
| Domínio | já existente | — |
| **Total** | | **~20 USD/mês** |

### Arquitectura
Nenhuma mudança estrutural. Continua: PWA estático + 12 functions consolidadas + Supabase Free +
corrida de providers de IA (tantos quantos tiverem chave activa) + pagamento por IA de visão com
fallback manual via WhatsApp.

### Métricas a observar desde já (mesmo sem dashboard sofisticado)
- Tempo médio entre "pedido de pagamento" e "confirmação" — separado por via automática (IA de
  visão) vs. manual (objectivo no manual: <24h, idealmente <6h).
- **Quantos dos providers configurados respondem primeiro, em média** — se os de tier "generoso"
  (Groq/Cerebras) ganham quase sempre, os restantes estão a consumir quota sem retorno real de
  fiabilidade; é o primeiro sinal de que vale a pena reduzir o número de corredores (ver Fase 2).
- Tamanho da base de dados Supabase (Dashboard → Database) — só para ter uma curva de referência.
- Erros 429 (`RATE_LIMIT`) nos logs da Vercel.

### Mudanças necessárias nesta fase
1. **Migrar para Vercel Pro agora.** Não é uma optimização, é conformidade.
2. **Configurar Upstash Redis em produção** (já suportado no código, só falta activar as env vars
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Grátis até 10k comandos/dia, suficiente
   nesta fase.
3. Definir e comunicar um SLA simples de confirmação de pagamento manual (ex.: "confirmamos em até
   6 horas") — gere expectativa e reduz mensagens de suporte repetidas.
4. Activar alertas básicos de erro (Vercel já envia email aos 80%/100% de uso — confirmar que o
   email de alerta está configurado para a conta certa).

### O que **não** fazer ainda
Gateway de pagamento automático adicional, fila de mensagens, CDN adicional, separar em
microsserviços, mover para Kubernetes, optimizar bundle de JS. Nada disto se justifica com algumas
centenas de utilizadores — seria tempo de engenharia trocado por um problema que ainda não existe.

---

## Fase 2 — 1.000 a 5.000 utilizadores

**Objectivo da fase:** a primeira fricção operacional real aparece — é aqui que se começa a
construir a "fila" para os problemas da Fase 3, antes de eles se tornarem urgentes.

### Gargalos
- **O fallback manual de pagamentos passa a ser um trabalho, não uma tarefa.** Mesmo com a
  aprovação automática por IA de visão a tratar a maioria dos casos, a fatia que cai em
  `review_needed` cresce com o volume absoluto — em dias de pico (início de semestre, época de
  candidaturas a emprego), já é visível como fila no admin.
- **`documents.content` (texto puro em Postgres) começa a pesar.** Com ~5.000 utilizadores e uma
  média de 5–8 documentos cada, isso são 25.000–40.000 linhas × ~5 KB ≈ 125–200 MB só nesta tabela
  — ainda dentro dos 500 MB do Supabase Free, mas a trajectória já é visível. Some-se a isto o
  crescimento de tabelas mais recentes (`consent_logs`, `marketing_materials`,
  `finance_expenses`, `affiliate_payout_receipts`, avaliações públicas) — nenhuma delas é grande
  individualmente, mas o número total de tabelas a monitorizar já não é o mesmo de há uma versão
  atrás deste roadmap.
- **Quota gratuita de IA começa a ter dias "vermelhos" mais cedo do que o esperado**, precisamente
  porque o número de providers em corrida simultânea (potencialmente até 13, ver ponto 0.3) faz o
  volume de chamadas crescer muito mais depressa do que o número de documentos gerados.
- **`online_sessions` via Supabase Realtime** (200 ligações simultâneas grátis) começa a ser
  testado em picos de marketing, ainda que improvável de esgotar nesta fase.

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel Pro | inclui 1TB bandwidth, 1000 GB-h functions | 20 USD |
| Supabase | ainda Free, ou Pro se DB/egress aproximar do limite | 0–25 USD |
| Upstash Redis | provavelmente ainda dentro do Free | 0 USD |
| IA — algum provider pago como reforço (opcional) | ex.: chave paga do Groq/Gemini só para horas de pico | 0–15 USD |
| **Total** | | **~20–60 USD/mês** |

### Arquitectura — mudanças
- Nenhuma reescrita. A mudança principal é **operacional**: começar o processo (não o código
  ainda, o processo de negócio) de avaliar um agregador de pagamentos moçambicano — **PaySuite**
  é o mais relevante hoje, por integrar M-Pesa + e-Mola + mKesh + cartões numa única API, em vez de
  negociar directamente com a Vodacom (que tem uma API aberta de M-Pesa, mas com onboarding mais
  pesado, mais adequado a quem já tem volume).
- **Limitar `raceAllProviders()` a respeitar os tiers já definidos no registo**, em vez de correr
  contra todos os providers configurados sempre: por omissão, correr apenas os de tier "generoso"
  + "médio" (até 4 providers hoje: Groq, Cerebras, Gemini, OpenRouter), e só cair para
  "reserva_ativa" (NVIDIA, Mistral, SambaNova, Together, Fireworks) se os primeiros falharem todos
  dentro de um pequeno timeout. Isto é uma mudança pequena e localizada em `raceAllProviders()` —
  os tiers já existem no registo, só não são respeitados na chamada actual. Mantém a fiabilidade
  (o disjuntor por modelo continua a proteger contra descontinuações), reduz o consumo de quota
  proporcionalmente ao número de providers que deixam de correr sempre.

### Métricas a observar
- Nº de transacções em `review_needed` há mais de 12h no painel admin.
- MB usados na tabela `documents` (Supabase → Database → Table sizes).
- % de gerações servidas por cada tier de provider — perceber se "reserva_ativa" está de facto a
  ser usada raramente (sinal de que a redução de corredores é segura) ou com frequência (sinal de
  que os tiers "generoso"/"médio" já não bastam sozinhos).
- Erros 503 "Nenhuma API key configurada" / falhas totais em simultâneo (sinal de que é hora de
  adicionar uma chave paga).

### Mudanças necessárias nesta fase
1. Começar o processo de integração com a **PaySuite** (ou equivalente) — registo, sandbox, testes
   — mesmo que o lançamento só aconteça na Fase 3. A integração e a aprovação como comerciante
   demoram semanas, não dias; começar tarde é o erro mais caro desta fase.
2. Alterar `raceAllProviders()` para respeitar tiers (generoso+médio por omissão, reserva_ativa só
   como fallback), reduzindo o número de corredores simultâneos sem perder o disjuntor de modelos.
3. Rever se `documents.content` precisa de todos os campos guardados indefinidamente, ou se faz
   sentido um plano de retenção (ex.: arquivar/comprimir documentos com +12 meses) — ainda não
   urgente, mas bom já ter a política escrita.
4. Confirmar que `cleanup-temp-accounts.js` (cron diário) está de facto a correr em produção — é
   barato e evita que tabelas auxiliares cresçam sem necessidade.

### O que **não** fazer ainda
Não trocar o Supabase por outra base de dados. Não construir uma fila própria (SQS/RabbitMQ) — o
volume não justifica. Não migrar para Next.js/SSR só por "parecer mais profissional" — o site
estático actual com PWA é, na verdade, mais barato de servir do que um framework com renderização
no servidor.

---

## Fase 3 — 5.000 a 10.000 utilizadores

**Objectivo da fase:** transformar os dois maiores riscos identificados nas fases anteriores
(fallback de pagamento manual e tectos do Supabase Free) em sistemas que não dependem de uma
pessoa nem de um tier grátis.

### Gargalos
- **O fallback manual de pagamento deixa de ser sustentável para uma pessoa só**, mesmo sendo já
  só a fatia que a IA de visão não aprova sozinha. A 6–8% de conversão sobre 5.000–10.000
  utilizadores, mesmo que só 20–30% caia em revisão manual, isso já são dezenas de casos por dia
  em picos — suficiente para criar filas visíveis e reclamações.
- **Supabase Free deixa de ser viável.** Com `documents` a aproximar-se de 250–400 MB e o egress a
  aproximar-se dos 5 GB/mês (PDFs, exportações Word, chamadas de API), a margem de segurança
  desaparece. Esta é a fase em que o Supabase Pro (25 USD/mês) passa de "opcional" a "necessário".
- **`online_sessions` via Realtime aproxima-se do limite de 200 (Free) / 500 (Pro) ligações
  simultâneas** em picos reais de tráfego — a funcionalidade "Online Agora" do painel admin precisa
  de depender do *fallback* de polling já existente, em vez do WebSocket, sob carga.
- **A corrida de IA por tiers (implementada na Fase 2) precisa de revisão dos limiares de
  timeout** — a esta escala, vale medir se o fallback para "reserva_ativa" está a disparar com
  frequência suficiente para justificar promover um desses providers a "médio" permanente.

> ✅ **Já não é gargalo desta fase (era, na versão anterior deste roadmap):** `api/admin/index.js`
> já não usa o SDK `@supabase/supabase-js` nem `ws` — confirmado directamente no código. A
> migração para REST puro, que esta fase previa fazer, já está feita em todo o projecto.

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel Pro | dentro do incluído, salvo picos | 20 USD |
| Supabase | **Pro** (8 GB DB, 250 GB egress, 500 ligações Realtime) | 25 USD + compute (~10 USD incluídos) |
| Upstash Redis | tier pago básico se ultrapassar 10k comandos/dia | 0–10 USD |
| PaySuite / agregador de pagamentos | comissão por transacção (tipicamente 2–4%, a confirmar no contrato) | variável, pago pela receita |
| IA — 1 chave paga como provider principal | reduz dependência de tiers grátis instáveis | 10–30 USD |
| Apoio humano para pagamentos/suporte | meio-período, se o volume já justificar | 100–200 USD (opcional) |
| **Total infraestrutura (sem mão-de-obra)** | | **~55–85 USD/mês** |

### Arquitectura — mudanças concretas
1. **Lançar o pagamento automático via PaySuite (ou equivalente) como caminho principal**, mantendo
   a IA de visão + fallback manual via WhatsApp como rede de segurança para casos que o gateway não
   resolva — não removê-lo.
2. **Subir para Supabase Pro.**
3. Rever se algum provider do tier "reserva_ativa" deve subir a "médio" permanente, com base nas
   métricas reais de fallback observadas na Fase 2.
4. Desactivar (ou reduzir a frequência de) o WebSocket de "Online Agora" sob carga alta, confiando
   no polling de 20s já implementado como mecanismo principal a partir desta fase.

### Métricas a observar
- Tempo médio de confirmação de pagamento, separado por via (IA de visão automática / PaySuite
  automático / manual).
- % de transacções que caem no fallback manual (saudável: <10% do total).
- Uso de armazenamento e egress do Supabase (Dashboard → Usage) — definir alerta a 80%.
- Ligações Realtime simultâneas (Supabase → Realtime → Inspector).
- Latência p95 de `generate-document.js` — se subir, é sinal de que o provider principal pago está
  sob mais carga do que esperado.

### O que **não** fazer ainda
Não trocar o Vercel por AWS/GCP "para ter mais controlo" — a complexidade operacional acrescentada
não compensa nesta fase. Não construir um sistema de filas distribuído para a geração de
documentos — 60 segundos de *timeout* por function ainda é suficiente para o tipo de documento
gerado aqui (texto, não vídeo/imagem pesada).

---

## Fase 4 — 10.000 a 50.000 utilizadores

**Objectivo da fase:** deixar de depender de qualquer recurso "grátis" como caminho crítico, e
preparar a equipa (não só o código) para o volume.

### Gargalos
- **Tiers gratuitos de IA tornam-se irrelevantes para o volume principal** — passam a ser reserva
  de emergência, não a espinha dorsal. Nesta escala, mesmo com a corrida já reduzida por tiers
  (Fase 2), o volume de gerações diárias provavelmente ultrapassa qualquer combinação de tiers
  gratuitos disponível nos 13 providers do registo.
- **MAU do Supabase aproxima-se do limite de 100k incluído no Pro** — ainda confortável a 50.000
  utilizadores totais (a não ser que MAU ≈ utilizadores totais, o que seria um sinal positivo de
  retenção, mas também aproxima o limite mais rápido).
- **O fallback manual deixa de ser viável mesmo a tempo parcial** — precisa de pelo menos 1 pessoa
  dedicada a suporte/pagamentos, ou de o fluxo manual ser reduzido a uma excepção rara (<2% das
  transacções), não a um caminho regular.
- **`api/generate-document.js` e `api/extract-template.js` continuam limitados a 60s no Hobby /
  até 300s no Pro** — para a maioria dos documentos isto é suficiente, mas documentos académicos
  longos com múltiplas secções (`_sectionMode`, via `LongDocumentEngine`) podem começar a
  aproximar-se do limite; vale rever os tempos reais p95/p99 desta fase em diante.
- **Bandwidth e Active CPU da Vercel deixam de ser triviais** — com dezenas de milhares de
  primeiras visitas/mês (o cache do Service Worker só ajuda a partir da 2ª visita), o consumo de
  "Fast Data Transfer" cresce de forma proporcional à aquisição de novos utilizadores, não à base
  total.

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel Pro | provável overage de bandwidth/CPU em meses de campanha forte | 20–80 USD |
| Supabase Pro | com overage de DB/egress conforme o volume real | 35–80 USD |
| Upstash Redis | tier pago, conforme nº de pedidos/dia | 10–25 USD |
| IA — provider(es) pago(s) como principal | já é o maior custo variável da infraestrutura nesta fase | 50–200 USD (depende fortemente do volume real) |
| PaySuite / agregador | comissão percentual sobre receita processada | variável |
| Equipa de suporte/pagamentos (mínimo 1 pessoa) | full-time ou contratado local | custo de pessoal, fora do "orçamento de infraestrutura" |
| **Total infraestrutura (sem pessoal)** | | **~115–385 USD/mês**, dependendo sobretudo do consumo de IA |

A maior incerteza desta fase **não é Vercel nem Supabase — é o custo de IA**, porque depende
directamente de quantos documentos são gerados por dia e de quantos providers correm por
documento, algo que só se sabe com dados reais das fases anteriores. É por isso que vale a pena já
estar a medir "custo de IA por documento gerado" desde a Fase 2.

### Arquitectura — mudanças concretas
1. **Tratar a IA como uma linha de orçamento, não como um recurso gratuito.** Definir 1–2 providers
   pagos como principais (os que historicamente tiveram melhor taxa de sucesso/latência nas fases
   anteriores — o registo central e o disjuntor por modelo já dão esses dados), manter os
   gratuitos como reserva de emergência apenas.
2. **Substituir definitivamente o fluxo manual de pagamento como caminho principal** — manter
   apenas como mecanismo de recuperação de falhas do gateway, com alerta automático quando o nº de
   transacções manuais sobe acima de um limiar (sinal de que o gateway está com problemas).
3. Rever `api/admin/index.js` quanto a tempo de execução sob concorrência de múltiplos
   administradores — se a equipa de suporte crescer, vale considerar separar analytics/relatórios
   (leitura pesada) de acções administrativas (escrita), ainda dentro do limite de 12 functions,
   por exemplo via parâmetros de rota dentro do mesmo ficheiro, como já é feito hoje.
4. Configurar *spend management* da Vercel (alertas e tecto de gasto configurável) e do Supabase
   (*spend cap*) — a esta escala, um erro de configuração (ex.: um loop a chamar a API de IA) pode
   gerar uma factura inesperada em horas, não em dias.
5. Considerar colocar uma CDN gratuita adicional (ex.: Cloudflare) na frente dos `assets/`
   estáticos para reduzir ainda mais o bandwidth cobrado pela Vercel — simples de fazer, baixo
   risco, ganho real nesta escala.

### Métricas a observar
- Custo de IA por documento gerado (USD/documento) — a métrica financeira mais importante desta
  fase.
- % de transacções resolvidas automaticamente (IA de visão + PaySuite) vs. manualmente — alvo:
  >95% automático.
- MAU real vs. limite do plano Supabase contratado.
- p95/p99 de latência e taxa de *timeout* em `generate-document.js` e `extract-template.js`.
- Bandwidth mensal da Vercel como % do incluído no plano.

### O que **não** fazer ainda, mesmo a 50.000 utilizadores
Não migrar para microsserviços nem para Kubernetes só por causa do número de utilizadores — o
gargalo real a esta escala continua a ser o **custo variável de IA e a operação de pagamentos**,
não a arquitectura de deployment. Um monólito bem indexado em Postgres + functions serverless
continua perfeitamente capaz de servir 50.000 utilizadores de um produto de geração de documentos
(que não é um produto de tráfego constante tipo rede social — é maioritariamente leitura/escrita
pontual por utilizador). Trocar a arquitectura agora seria o exemplo clássico de over-engineering:
resolver um problema de custo de API externa com uma reescrita de infraestrutura interna que não o
resolve.

---

## 3. Tabela-resumo: custo mensal de infraestrutura por fase

| Fase | Utilizadores | Vercel | Supabase | Redis | IA | Pagamentos | Total infra (aprox.) |
|---|---|---|---|---|---|---|---|
| 1 | 0–1.000 | Pro — 20 USD | Free — 0 | Free — 0 | Free — 0 | IA de visão + manual | **~20 USD** |
| 2 | 1.000–5.000 | Pro — 20 USD | Free/Pro — 0–25 | Free — 0 | Free (por tiers) + reforço pago opcional — 0–15 | IA de visão + manual + início de integração | **~20–60 USD** |
| 3 | 5.000–10.000 | Pro — 20 USD | Pro — 25–35 | 0–10 | 1 chave paga — 10–30 | Automático (PaySuite) + manual fallback | **~55–85 USD** |
| 4 | 10.000–50.000 | Pro — 20–80 | Pro — 35–80 | 10–25 | Principal pago — 50–200 | Automático, manual <5% | **~115–385 USD** |

Excluído desta tabela, de propósito: salários/horas humanas, marketing, e comissões percentuais de
pagamento (variam com a receita, não com o número de utilizadores).

---

## 4. Princípios anti-overengineering para esta equipa, nesta escala

- **Cada mudança de arquitectura precisa de uma métrica real que a justifique**, não "porque é o
  que startups maiores fazem". As tabelas de métricas acima existem exactamente para isso.
- **O Supabase + Postgres + RLS aguenta as 50.000 utilizadores deste roadmap sem precisar de
  sharding, read-replicas ou bases de dados especializadas.** Isso só voltaria a ser tema acima de
  algumas centenas de milhares de utilizadores activos, ou com padrões de escrita muito mais
  intensos do que "gerar um documento de texto ocasionalmente".
- **Manter um caminho humano de recuperação de pagamentos, mesmo depois de automatizar.**
  Remover por completo seria frágil — gateways de pagamento em Moçambique falham, e ter um caminho
  humano de recuperação é uma vantagem competitiva real face a concorrentes 100% automatizados e
  sem plano B.
- **Resistir à tentação de reescrever o frontend num framework (React/Next.js) "para escalar".**
  O bloqueador desta aplicação nunca foi o frontend — é pagamentos e custo de IA. Reescrever o
  frontend agora seria meses de trabalho a resolver um problema que não existe.
- **Medir antes de migrar.** Em particular: medir custo real de IA por documento (e por quantos
  providers correram nesse documento) e tempo real de confirmação de pagamento desde a Fase 1,
  mesmo informalmente (uma folha de cálculo já chega), para que as decisões de Fase 3/4 sejam
  baseadas em dados próprios, não nas suposições deste documento.

---

## 5. Plano de acção imediato (próximas 2 semanas, independente da fase actual)

1. Migrar o projecto Vercel para o plano **Pro** (conformidade contratual — ver secção 0). Este
   continua a ser o único item deste roadmap repetido, sem alteração, desde a versão anterior.
2. Activar `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` em produção (o código já suporta;
   falta só a configuração).
3. Alterar `raceAllProviders()` (`api/generate-document.js`) para respeitar os tiers já definidos
   em `aiProviderRegistry.js` — correr por omissão só "generoso" + "médio", com "reserva_ativa"
   como fallback — em vez de correr sempre contra todos os providers com chave configurada. Esta é
   a mudança de código mais barata e com maior impacto directo em custo de quota de todo este
   documento.
4. Começar, em paralelo, o processo de registo/sandbox com a **PaySuite** (ou agregador
   equivalente de pagamentos moçambicano) — mesmo sem lançar já, por causa do tempo de aprovação.
5. Criar uma folha simples (mesmo que seja uma tabela no Supabase ou um Google Sheet) para
   registar, por semana: nº de documentos gerados, qual provider de IA respondeu em cada caso
   (e quantos corredores estavam activos nesse pedido), e tempo de confirmação de cada pagamento —
   separado por via automática e manual. Estes números vão guiar todas as decisões das fases
   seguintes muito melhor do que qualquer suposição deste documento.
6. Definir e publicar um SLA simples de confirmação de pagamento para os utilizadores (reduz
   ansiedade e mensagens de suporte repetidas, mesmo sem mudar nada técnico).

---

## Nota sobre esta reescrita

A versão anterior deste roadmap (baseada no zip de Junho/2026) tinha duas afirmações que a
verificação directa do código, em Agosto/2026, já não confirma:

1. Descrevia uma "corrida entre 5 providers fixos" — o código já evoluiu para um registo central
   de até 13 providers, organizados em tiers, activados dinamicamente por variável de ambiente.
   O problema de fundo (quota gasta proporcionalmente ao número de corredores, não ao número de
   documentos) continua a existir e continua a ser a recomendação mais importante deste
   documento — só que a solução certa hoje é "respeitar os tiers já definidos no registo", não
   "reduzir de 5 para 2".
2. Listava `api/admin/index.js` a usar ainda o SDK `@supabase/supabase-js` + `ws` como gargalo da
   Fase 3 — confirmado em código que isso **já foi corrigido**; já não é um item deste roadmap.

Estas duas correcções não mudam a prioridade nº 1 deste documento (migrar para o Vercel Pro), que
continua exactamente igual à de todas as versões anteriores — e continua por resolver.
