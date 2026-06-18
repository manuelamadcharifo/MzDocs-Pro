# Roadmap de Escala — MzDocs Pro
### De 0 a 50.000 utilizadores · Vercel Hobby/Pro + Supabase + orçamento baixo

*Avaliação técnica baseada no estado real do código (zip de Junho/2026), não no README — que tinha
algumas referências desactualizadas, já corrigidas separadamente.*

---

## 0. Os 3 factos que importam mais do que qualquer roadmap

Antes de falar em "0 a 50.000", há três coisas que mudam a prioridade de tudo o resto.

**1. O projecto já está, tecnicamente, fora dos Termos de Serviço da Vercel.**
`api/process-payment.js` cobra/regista pagamentos de visitantes do site. A Vercel define isso
explicitamente como "uso comercial", proibido no plano Hobby — só permitido a partir do Pro
(20 USD/mês). Não é uma questão de volume de utilizadores; é uma questão contratual. A Vercel
pode suspender um deployment no plano errado sem aviso prévio. **Acção: migrar para o Pro antes de
qualquer campanha de crescimento**, independentemente de estarem em 50 ou 5.000 utilizadores.

**2. O verdadeiro tecto da MzDocs Pro não é técnico — é o WhatsApp.**
Hoje, 100% dos pagamentos (M-Pesa/e-Mola/mKesh) são confirmados manualmente por uma pessoa que
lê o WhatsApp e clica em "confirmar" no painel admin. Isto escala linearmente com horas humanas,
não com servidores. Uma pessoa dedicada confirma de forma sustentável ~40–60 pagamentos/dia. Isso
é o limite real do negócio muito antes de qualquer limite da Vercel ou do Supabase.

**3. A "corrida paralela" entre 5 provedores de IA é óptima para fiabilidade, mas cara em quota.**
Cada geração de documento dispara `Promise.any()` contra **5 provedores simultaneamente** (Groq,
Gemini, OpenRouter, Cerebras, NVIDIA NIM) — código confirmado em `api/generate-document.js:305`.
Isto dá altíssima disponibilidade a custo zero hoje, mas significa que cada documento gerado
consome quota gratuita de **5** serviços, não de 1. Os tiers gratuitos esgotam-se ~5× mais rápido
do que se houvesse um provedor principal com fallback sequencial. Isto não é um problema agora —
é um problema que aparece de repente quando o volume cresce, e a correcção (passar de "corrida de
5" para "principal + 1 fallback, com os outros 3 em reserva") é simples de fazer com antecedência.

O resto deste documento assume que estes três pontos já foram resolvidos ou estão a ser resolvidos
em paralelo às fases abaixo.

---

## 1. O que já está bem construído (não tocar sem motivo forte)

Vale registar isto porque um roadmap de escala mal informado tende a recomendar reescrever coisas
que já estão correctas:

| Decisão já tomada | Porque já é a escolha certa |
|---|---|
| `api/_lib/supabaseAdmin.js` — REST puro em vez do SDK `@supabase/supabase-js` | Elimina `ws`, reduz cold start, evita o bug documentado de "crédito debitado sem documento gerado" |
| Dedução de crédito via RPC atómica + *optimistic locking* de reserva + reembolso automático | Resolve a corrida (*race condition*) clássica de sistemas de crédito sem precisar de uma fila externa |
| Consolidação em 12 funções (`misc.js`, `admin/index.js` como roteadores internos) | Respeita o limite real e actual do Vercel Hobby/Pro (12 functions por deployment) |
| Rate limiting com Upstash Redis + fallback em `Map` local | Padrão correcto; só falta tornar o Redis obrigatório (ver Fase 1) |
| Índices em praticamente todas as tabelas de alto tráfego (`transactions`, `documents`, `credit_logs`, `page_views`, `templates_custom`, afiliados) | A maior parte dos projectos só pensa nisto depois de já ter lentidão em produção — aqui já está feito |
| `page_views` agregada por `(página, dia)` em vez de 1 linha por visita | Evita uma tabela que cresceria sem limite |
| PWA com Service Worker — visitas repetidas quase não consomem bandwidth da Vercel | Isto poupa dinheiro real à medida que a base de utilizadores cresce |

---

## 2. Premissas assumidas neste roadmap

Não há dados reais de produção partilhados, por isso os números de cada fase usam suposições
explícitas e conservadoras, típicas de um produto de documentos B2C em Moçambique:

- "Utilizadores" = contas registadas acumuladas (não MAU).
- Taxa de conversão para pelo menos 1 compra: 5–8% dos registados, ao longo da vida da conta.
- Documento médio gerado: ~5 KB de markdown guardado em `documents.content`.
- Pacote mais comprado: "Básico" (280 MZN / 25 créditos) — usado como referência de ticket médio.
- Pico de concorrência simultânea: 2–5% da base registada (ex.: campanha em horário de explosão escolar/universitária).

Onde os números forem incertos, isso é dito explicitamente — o objectivo é dar limiares de decisão
("isto torna-se um problema a partir de X"), não previsões financeiras exactas.

---

## Fase 1 — 0 a 1.000 utilizadores

**Objectivo da fase:** validar produto e canal de aquisição sem se preocupar com infraestrutura.

### Gargalos
- Conformidade contratual da Vercel (ponto 0.1) — único bloqueador real desta fase.
- Confirmação manual de pagamentos: a 5–8% de conversão, são ~50–80 pagamentos *no total*, não por
  dia. Zero problema operacional ainda.
- Rate limiting em `Map` local deixa de ser fiável assim que a Vercel decide correr 2+ instâncias
  simultâneas da mesma function sob qualquer pico de tráfego (mesmo pequeno) — o limite "por
  utilizador" passa a ser, na prática, "por instância".

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel | **Pro** (obrigatório — ver ponto 0.1) | 20 USD |
| Supabase | Free (500 MB DB, 50k MAU, 5 GB egress) | 0 USD |
| Upstash Redis | Free (10k comandos/dia) | 0 USD |
| Provedores de IA | Tiers gratuitos (Groq/Gemini/OpenRouter/Cerebras/NVIDIA) | 0 USD |
| Domínio | já existente | — |
| **Total** | | **~20 USD/mês** |

### Arquitetura
Nenhuma mudança estrutural. Continua: PWA estático + 12 functions consolidadas + Supabase Free +
corrida de 5 provedores de IA + pagamento manual via WhatsApp.

### Métricas a observar desde já (mesmo sem dashboard sofisticado)
- Tempo médio entre "pedido de pagamento" e "confirmação" (objectivo: <24h, idealmente <6h).
- Taxa de geração de documentos que cai para os providers "de reserva" (Cerebras/NVIDIA) — se isto
  sobe, é sinal de que Groq/Gemini estão a aproximar-se do limite diário.
- Tamanho da base de dados Supabase (Dashboard → Database) — só para ter uma curva de referência.
- Erros 429 (`RATE_LIMIT`) nos logs da Vercel.

### Mudanças necessárias nesta fase
1. **Migrar para Vercel Pro agora.** Não é uma optimização, é conformidade.
2. **Configurar Upstash Redis em produção** (já suportado no código, só falta activar as env vars
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Grátis até 10k comandos/dia, suficiente
   nesta fase.
3. Definir e comunicar um SLA simples de confirmação de pagamento (ex.: "confirmamos em até 6
   horas") — gere expectativa e reduz mensagens de suporte repetidas.
4. Activar alertas básicos de erro (Vercel já envia email aos 80%/100% de uso — confirmar que o
   email de alerta está configurado para a conta certa).

### O que **não** fazer ainda
Gateway de pagamento automático, fila de mensagens, CDN adicional, separar em microsserviços,
mover para Kubernetes, optimizar bundle de JS. Nada disto se justifica com algumas centenas de
utilizadores — seria tempo de engenharia trocado por um problema que ainda não existe.

---

## Fase 2 — 1.000 a 5.000 utilizadores

**Objectivo da fase:** primeira fricção operacional real aparece — é aqui que se começa a
construir a "fila" para os problemas da Fase 3, antes de eles se tornarem urgentes.

### Gargalos
- **Confirmação manual de pagamentos passa a ser um trabalho, não uma tarefa.** A 6% de conversão
  com reposição mensal (créditos não são vitalícios para todos os planos), pode chegar a
  150–300 transacções/mês. Ainda gerível por 1 pessoa, mas já com filas visíveis em dias de pico
  (ex.: início de semestre, época de candidaturas a emprego).
- **`documents.content` (texto puro em Postgres) começa a pesar.** Com ~5.000 utilizadores e uma
  média de 5–8 documentos cada, isso são 25.000–40.000 linhas × ~5 KB ≈ 125–200 MB só nesta tabela
  — ainda dentro dos 500 MB do Supabase Free, mas a trajectória já é visível.
- **Quota gratuita de IA começa a ter dias "vermelhos".** Com a corrida de 5 provedores por
  geração, o volume de chamadas cresce 5× mais rápido do que o número de documentos gerados.
- **`online_sessions` via Supabase Realtime** (200 ligações simultâneas grátis) começa a ser
  testado em picos de marketing, ainda que improvável de esgotar nesta fase.

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel Pro | inclui 1TB bandwidth, 1000 GB-h functions | 20 USD |
| Supabase | ainda Free, ou Pro se DB/egress aproximar do limite | 0–25 USD |
| Upstash Redis | provavelmente ainda dentro do Free | 0 USD |
| IA — algum provedor pago como reforço (opcional) | ex.: chave paga do Groq/Gemini só para horas de pico | 0–15 USD |
| **Total** | | **~20–60 USD/mês** |

### Arquitetura — mudanças
- Nenhuma reescrita. A mudança principal é **operacional**: começar o processo (não o código
  ainda, o processo de negócio) de avaliar um agregador de pagamentos moçambicano — **PaySuite**
  é o mais relevante hoje, por integrar M-Pesa + e-Mola + mKesh + cartões numa única API, em vez de
  negociar directamente com a Vodacom (que tem uma API aberta de M-Pesa, mas com onboarding mais
  pesado, mais adequado a quem já tem volume).
- Mudar a ordem de chamada de IA de "5 em corrida sempre" para "2 principais em corrida + os
  outros 3 só como fallback se as 2 primeiras falharem". Mantém a fiabilidade, reduz o consumo de
  quota em ~60%.

### Métricas a observar
- Nº de transacções pendentes >12h no painel admin (sinal de atraso na confirmação manual).
- MB usados na tabela `documents` (Supabase → Database → Table sizes).
- % de gerações servidas por cada um dos 5 provedores — perceber qual está mais perto do limite.
- Erros 503 "Nenhuma API key configurada" / falhas totais nos 5 providers em simultâneo (sinal de
  que é hora de adicionar uma chave paga).

### Mudanças necessárias nesta fase
1. Começar o processo de integração com a **PaySuite** (ou equivalente) — registo, sandbox, testes
   — mesmo que o lançamento só aconteça na Fase 3. A integração e a aprovação como comerciante
   demoram semanas, não dias; começar tarde é o erro mais caro desta fase.
2. Reordenar a corrida de IA (principal + fallback, não 5 em paralelo sempre).
3. Rever se `documents.content` precisa de todos os campos guardados indefinidamente, ou se faz
   sentido um plano de retenção (ex.: arquivar/comprimir documentos com +12 meses) — ainda não
   urgente, mas bom já ter a política escrita.
4. Confirmar que o `cleanup_old_sessions()` e a limpeza de contas temporárias (cron diário) estão
   de facto a correr — são baratos e evitam que tabelas auxiliares cresçam sem necessidade.

### O que **não** fazer ainda
Não trocar o Supabase por outra base de dados. Não construir uma fila própria (SQS/RabbitMQ) — o
volume não justifica. Não migrar para Next.js/SSR só por "parecer mais profissional" — o site
estático actual com PWA é, na verdade, mais barato de servir do que um framework com renderização
no servidor.

---

## Fase 3 — 5.000 a 10.000 utilizadores

**Objectivo da fase:** transformar os dois maiores riscos identificados nas fases anteriores
(pagamento manual e tectos do Supabase Free) em sistemas que não dependem de uma pessoa nem de um
tier grátis.

### Gargalos
- **Pagamento manual deixa de ser sustentável para uma pessoa só.** A 6–8% de conversão, isto são
  300–800 transacções/mês, ou seja, 10–27/dia — ainda fazível, mas qualquer pico (campanha, época
  de exames) cria uma fila visível e atrasos que geram reclamações e perda de confiança.
- **Supabase Free deixa de ser viável.** Com `documents` a aproximar-se de 250–400 MB e o egress a
  aproximar-se dos 5 GB/mês (PDFs, exportações Word, chamadas de API), a margem de segurança
  desaparece. Esta é a fase em que o Supabase Pro (25 USD/mês) passa de "opcional" a "necessário".
- **`online_sessions` via Realtime aproxima-se do limite de 200 (Free) / 500 (Pro) ligações
  simultâneas** em picos reais de tráfego — a funcionalidade "Online Agora" do painel admin precisa
  de depender do *fallback* de polling já existente, em vez do WebSocket, sob carga.
- **Function única `api/admin/index.js` (1.330 linhas) continua a usar o SDK `@supabase/supabase-js`
  + `ws`**, ao contrário das funções críticas já migradas para REST puro — não é um problema de
  correcção, mas é a função mais lenta a arrancar (*cold start*) e a mais arriscada de manter à
  medida que mais administradores a usam ao mesmo tempo.

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel Pro | dentro do incluído, salvo picos | 20 USD |
| Supabase | **Pro** (8 GB DB, 250 GB egress, 500 ligações Realtime) | 25 USD + compute (~10 USD incluídos) |
| Upstash Redis | tier pago básico se ultrapassar 10k comandos/dia | 0–10 USD |
| PaySuite / agregador de pagamentos | comissão por transacção (tipicamente 2–4%, a confirmar no contrato) | variável, pago pela receita |
| IA — 1 chave paga como provedor principal | reduz dependência de tiers grátis instáveis | 10–30 USD |
| Apoio humano para pagamentos/suporte | meio-período, se o volume já justificar | 100–200 USD (opcional) |
| **Total infraestrutura (sem mão-de-obra)** | | **~55–85 USD/mês** |

### Arquitetura — mudanças concretas
1. **Lançar o pagamento automático via PaySuite (ou equivalente) como caminho principal**, mantendo
   o fluxo manual via WhatsApp como *fallback* explícito (não removê-lo — é a rede de segurança
   para falhas do gateway e para utilizadores sem acesso a cartão/registo digital completo).
2. **Subir para Supabase Pro.**
3. Migrar `api/admin/index.js` para o padrão de `api/_lib/supabaseAdmin.js` (REST puro), seguindo o
   mesmo caminho já usado em `deduct-credit.js` e `process-payment.js` — é a maior função e a que
   mais beneficia da redução de *cold start*. Fazer isto com testes manuais cuidadosos antes de
   publicar, já que é o painel que os administradores usam todos os dias.
4. Desactivar (ou reduzir a frequência de) o WebSocket de "Online Agora" sob carga alta, confiando
   no polling de 20s já implementado como mecanismo principal a partir desta fase.

### Métricas a observar
- Tempo médio de confirmação de pagamento, separado por canal (PaySuite automático vs. manual).
- % de transacções que falham no gateway automático e caem para o fluxo manual (saudável: <10%).
- Uso de armazenamento e egress do Supabase (Dashboard → Usage) — definir alerta a 80%.
- Ligações Realtime simultâneas (Supabase → Realtime → Inspector).
- Latência p95 de `generate-document.js` — se subir, é sinal de que o provedor principal pago está
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
- **Tiers gratuitos de IA tornam-se irrelevantes para o volume principal** — passam a ser
  reserva de emergência, não a espinha dorsal. Nesta escala, mesmo com a corrida reduzida a
  "principal + 1 fallback", o volume de gerações diárias provavelmente ultrapassa qualquer tier
  gratuito disponível em todos os 5 provedores somados.
- **MAU do Supabase aproxima-se do limite de 100k incluído no Pro** — ainda confortável a 50.000
  utilizadores totais (a não ser que MAU ≈ utilizadores totais, o que seria um sinal positivo de
  retenção, mas também aproxima o limite mais rápido).
- **Confirmação manual de pagamentos deixa de ser viável mesmo como *fallback* a tempo parcial** —
  precisa de pelo menos 1 pessoa dedicada a suporte/pagamentos, ou de o fluxo manual ser reduzido a
  uma excepção rara (<2% das transacções), não a um caminho regular.
- **`api/generate-document.js` e `api/extract-template.js` continuam limitados a 60s no Hobby /
  até 300s no Pro** — para a maioria dos documentos isto é suficiente, mas documentos académicos
  longos com múltiplas secções (`_sectionMode`) podem começar a aproximar-se do limite em geração
  em cadeia; vale rever os tempos reais p95/p99 desta fase em diante.
- **Bandwidth e Active CPU da Vercel deixam de ser triviais** — com dezenas de milhares de
  primeiras visitas/mês (o cache do Service Worker só ajuda a partir da 2ª visita), o consumo de
  "Fast Data Transfer" cresce de forma proporcional a aquisição de novos utilizadores, não à base
  total.

### Custos mensais estimados
| Item | Plano | Custo |
|---|---|---|
| Vercel Pro | provável overage de bandwidth/CPU em meses de campanha forte | 20–80 USD |
| Supabase Pro | com overage de DB/egress conforme o volume real | 35–80 USD |
| Upstash Redis | tier pago, conforme nº de pedidos/dia | 10–25 USD |
| IA — provedor(es) pago(s) como principal | já é o maior custo variável da infraestrutura nesta fase | 50–200 USD (depende fortemente do volume real) |
| PaySuite / agregador | comissão percentual sobre receita processada | variável |
| Equipa de suporte/pagamentos (mínimo 1 pessoa) | full-time ou contratado local | custo de pessoal, fora do "orçamento de infraestrutura" |
| **Total infraestrutura (sem pessoal)** | | **~115–385 USD/mês**, dependendo sobretudo do consumo de IA |

A maior incerteza desta fase **não é Vercel nem Supabase — é o custo de IA**, porque depende
directamente de quantos documentos são gerados por dia, algo que só se sabe com dados reais das
fases anteriores. É por isso que vale a pena já estar a medir "custo de IA por documento gerado"
desde a Fase 2.

### Arquitetura — mudanças concretas
1. **Tratar a IA como uma linha de orçamento, não como um recurso gratuito.** Definir 1–2 provedores
   pagos como principais (os que historicamente tiveram melhor taxa de sucesso/latência nas fases
   anteriores), manter os gratuitos como reserva de emergência apenas.
2. **Substituir definitivamente o fluxo manual de pagamento como caminho principal** — manter
   apenas como mecanismo de recuperação de falhas do gateway, com alerta automático quando o nº de
   transacções manuais sobe acima de um limiar (sinal de que o gateway está com problemas).
3. Rever a função `api/admin/index.js` quanto a tempo de execução sob concorrência de múltiplos
   administradores — se a equipa de suporte crescer, vale considerar separar analytics/relatórios
   (leitura pesada) de acções administrativas (escrita), ainda dentro do limite de 12 functions,
   por exemplo via parâmetros de rota dentro do mesmo ficheiro, como já é feito hoje.
4. Configurar *spend management* da Vercel (alertas e tecto de gasto configurável) e do Supabase
   (*spend cap*) — a esta escala, um erro de configuração (ex.: um loop a chamar a API de IA) pode
   gerar uma factura inesperada em horas, não em dias.
5. Considerar colocar uma CDN gratuita adicional (ex.: Cloudflare) na frente dos `assets/` estáticos
   para reduzir ainda mais o bandwidth cobrado pela Vercel — simples de fazer, baixo risco, ganho
   real nesta escala.

### Métricas a observar
- Custo de IA por documento gerado (USD/documento) — a métrica financeira mais importante desta fase.
- % de transacções resolvidas automaticamente vs. manualmente — alvo: >95% automático.
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
| 1 | 0–1.000 | Pro — 20 USD | Free — 0 | Free — 0 | Free — 0 | Manual | **~20 USD** |
| 2 | 1.000–5.000 | Pro — 20 USD | Free/Pro — 0–25 | Free — 0 | Free + reforço pago opcional — 0–15 | Manual + início de integração | **~20–60 USD** |
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
- **Manter o fluxo manual de pagamento como rede de segurança, mesmo depois de automatizar.**
  Remover por completo seria frágil — gateways de pagamento em Moçambique falham, e ter um caminho
  humano de recuperação é uma vantagem competitiva real face a concorrentes 100% automatizados e
  sem plano B.
- **Resistir à tentação de reescrever o frontend num framework (React/Next.js) "para escalar".**
  O bloqueador desta aplicação nunca foi o frontend — é pagamentos e custo de IA. Reescrever o
  frontend agora seria meses de trabalho a resolver um problema que não existe.
- **Medir antes de migrar.** Em particular: medir custo real de IA por documento e tempo real de
  confirmação de pagamento desde a Fase 1, mesmo informalmente (uma folha de cálculo já chega),
  para que as decisões de Fase 3/4 sejam baseadas em dados próprios, não nas suposições deste
  documento.

---

## 5. Plano de acção imediato (próximas 2 semanas, independente da fase actual)

1. Migrar o projecto Vercel para o plano **Pro** (conformidade contratual — ver secção 0).
2. Activar `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` em produção (o código já suporta;
   falta só a configuração).
3. Começar, em paralelo, o processo de registo/sandbox com a **PaySuite** (ou agregador equivalente
   de pagamentos moçambicano) — mesmo sem lançar já, por causa do tempo de aprovação.
4. Criar uma folha simples (mesmo que seja uma tabela no Supabase ou um Google Sheet) para registar,
   por semana: nº de documentos gerados, qual provedor de IA respondeu em cada caso, e tempo de
   confirmação de cada pagamento manual. Estes três números vão guiar todas as decisões das fases
   seguintes muito melhor do que qualquer suposição deste documento.
5. Definir e publicar um SLA simples de confirmação de pagamento para os utilizadores (reduz
   ansiedade e mensagens de suporte repetidas, mesmo sem mudar nada técnico).
