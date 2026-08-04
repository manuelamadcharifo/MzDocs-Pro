# Roadmap de Escala e Rentabilidade — MzDocs Pro
### De 0 MZN / 0 utilizadores a 50.000 utilizadores · Vercel + Supabase + orçamento realista moçambicano

*Versão de Agosto/2026. Esta versão funde três documentos anteriores — o `ROADMAP-ESCALA.md` técnico,
o `MzDocs-Pro-Roadmap-Rentabilidade.md` (negócio/legal/marketing) e o `plano_acao_14_dias_atualizado.txt`
(execução) — num único documento, e corrige vários números de ambos contra três fontes: (1) o código-fonte
real do zip fornecido (migrações até `v51`), (2) preços actuais publicados pelos próprios fornecedores
(Vercel, Supabase, Upstash, PaySuite), e (3) a legislação fiscal moçambicana de 2026 em vigor. Onde os
documentos anteriores divergiam entre si ou de código/mercado, isso está assinalado explicitamente — ver
Anexo no fim.*

---

## 0. Nota de fusão — o que foi verificado e o que mudou

Antes de qualquer número, um resumo do que a investigação directa confirmou, corrigiu ou contradisse nos
três documentos de origem:

| Afirmação nos documentos anteriores | Verificação directa (Ago/2026) | Correcção aplicada |
|---|---|---|
| "Corrida entre 5 providers" (doc. Rentabilidade) / "até 13 providers" (doc. Escala) | `api/_lib/aiProviderRegistry.js`: **9 providers com código funcional** (`PROVIDERS[]`: Groq, Cerebras, Gemini, OpenRouter, NVIDIA, Mistral, SambaNova, Together, Fireworks) + **4 apenas catalogados sem adaptador** (`UNWIRED_RESERVE[]`: Cloudflare, GitHub Models, Hugging Face, Cohere — não entram na corrida real hoje) | Usar **9** como número de corredores possíveis reais, não 5 nem 13 |
| Cerebras: "1.500.000 tokens/dia" (doc. Rentabilidade) | Código: `dailyLimit: 1000000` (linha do registo, Ago/2026 — a Cerebras já alterou este valor mais do que uma vez em 2026) | Usar **1.000.000 tokens/dia**, o valor que está de facto configurado no motor hoje |
| "Pagamento automático via IA de visão como via principal, fallback manual" | Confirmado em `api/process-payment.js` + `api/misc.js`: upload de comprovativo → `verifyReceiptInternal()` → aprovação automática se `confidence ≥ 0.85`, senão `review_needed` (revisão manual). Modo `mpesa` automático devolve **503 "ainda não implementado"** — não existe hoje nenhuma integração de gateway automático (PaySuite ou outro) ligada ao código | Confirmado sem alteração — **não existe atalho de pagamento automático ainda**; é 100% comprovativo + IA de visão + fallback humano |
| Upstash Redis "Free — 10.000 comandos/dia" | O tier gratuito da Upstash mudou em Março/2025: hoje é **500.000 comandos/MÊS** (não 10k/dia), 256 MB, 10 GB bandwidth/mês incluído | Correcção material — o Redis grátis aguenta **muito mais tempo** do que o roadmap anterior assumia antes de custar dinheiro |
| Comissão PaySuite "tipicamente 2–4%" | Página oficial da PaySuite: "platform fee + taxa da operadora, sem mensalidade fixa" — exemplo publicado: **60 MZN de taxa sobre 1.000 MZN ≈ 6%** | Corrigido para **~5–6% da transacção**, mais alto do que o roadmap anterior assumia |
| Vercel Pro "20 USD/mês" | Confirmado, inalterado: **20 USD/seat/mês**, inclui 1 TB de "Fast Data Transfer" + crédito de uso de 20 USD; overage de bandwidth acima de 1 TB a 0,15 USD/GB | Confirmado, sem alteração de valor |
| Supabase Pro "25 USD/mês" | Confirmado: **25 USD/mês**, 8 GB DB, 250 GB egress, 100k MAU, inclui 10 USD de crédito de compute (cobre 1 instância "Micro") | Confirmado, sem alteração de valor |
| ISPC "tecto subiu para 4.000.000 MZN, taxa reduzida a metade no 1º ano" | Confirmado pela Lei n.º 09/2025 (em vigor desde Jan/2026) e pela própria AT: tecto **4.000.000 MZN**, taxa base **3%** (reduzida a **1,5%** no primeiro ano de actividade), escala progressiva **3%–20%** conforme actividade/volume, pagamento **trimestral** (Abr/Jul/Out/Jan), sem pagamento se o valor apurado for **< 500 MZN** | Confirmado, sem alteração |
| Câmbio usado nos docs anteriores (~63,5 MZN/USD) | Taxa de câmbio a 2 de Agosto de 2026: **1 USD ≈ 63,9 MZN** | Usa-se **64 MZN/USD** neste documento (arredondado, para simplificar todas as conversões) |

**O que isto significa na prática:** os fundamentos dos dois roadmaps anteriores estavam correctos — o
código está mesmo bem construído, a Vercel Hobby está mesmo tecnicamente fora dos termos, o ISPC é mesmo
o caminho legal certo para começar. As correcções acima são todas de **grau**, não de direcção: menos
providers reais do que se pensava (9, não 13), mais fôlego grátis no Redis do que se pensava, comissão de
pagamento mais alta do que se pensava. Nenhuma destas correcções muda a prioridade nº 1 deste documento
nem a estratégia central — mas todas mudam os números das tabelas abaixo, por isso foram todas propagadas.

---

## 1. Estratégia ideal para este arranque — resumo executivo

Antes das fases, a tese central que junta os dois documentos anteriores (que, sozinhos, respondiam a
perguntas diferentes — um "como cresce a infraestrutura", o outro "como ganho o primeiro dinheiro"):

1. **O produto e a infraestrutura já não são o gargalo — a distribuição é.** Com ~9 providers de IA
   grátis a correr em paralelo, a capacidade técnica real (ver secção 3) ultrapassa facilmente o volume
   que uma pessoa sozinha consegue gerar organicamente nos primeiros meses em Moçambique. Toda a energia
   das primeiras 4–8 semanas deve ir para vendas/distribuição, não para mais código.
2. **Ficar no Vercel Hobby por 2–4 semanas é uma aposta calculada aceitável, não uma solução permanente.**
   O risco de suspensão é real (viola os termos ao processar pagamentos), mas baixo a curto prazo para um
   projecto pequeno e moçambicano. A prioridade nº 1 de gasto do primeiro dinheiro que entrar é sempre a
   migração para o Pro (1.280 MZN/mês) — isto está definido como gatilho automático na secção 4.1.
3. **A estrutura legal certa é a híbrida, não a "espera" nem a "regista já".** Pessoa singular + ISPC para
   vender a particulares (B2C) desde o dia 1, gratuito e rápido; só regista a Lda quando **um** cliente
   B2B concreto (escola, empresa, cooperativa) estiver pronto para assinar — nunca antes, porque uma
   entidade colectiva não pode pagar legalmente a uma pessoa singular sem NUIT empresarial e factura.
4. **O caminho humano de confirmação de pagamento (WhatsApp) não é um defeito a eliminar — é uma
   vantagem competitiva enquanto for pequeno**, e só se torna um gargalo real a partir de várias dezenas
   de casos/dia em revisão manual (ver secção 3, ponto 2). Automatizar cedo demais (PaySuite) sem volume
   que o justifique é gastar tempo de engenharia num problema que ainda não existe.
5. **Cada fase de crescimento tem, neste documento, tanto o lado do custo (infra) como o lado da receita
   (vendas esperadas)** — porque decidir "quando subir de plano" sem saber "quanto isso já deveria estar
   a gerar de receita" é decidir às cegas. As tabelas de cada fase abaixo mostram os dois lados sempre
   juntos.

---

## PARTE A — Fase 0: Pré-lançamento e primeiras vendas (0 MZN de capital)

Esta fase não existia no roadmap técnico original (que começava em "0 a 1.000 utilizadores" assumindo
infraestrutura já a rodar) nem estava separada no roadmap de rentabilidade. Aqui fica isolada porque é
onde as decisões são diferentes de todas as fases seguintes: **零 capital, foco 100% em distribuição**, e
onde os dois documentos de origem realmente se complementam.

### A.1 — Vercel: ficar no Hobby, migrar já para o Pro, ou fugir para a Netlify?

| Opção | Custo | Risco | Esforço técnico |
|---|---|---|---|
| **A. Ficar no Hobby por agora** | 0 MZN | Suspensão sem aviso é possível (viola ToS ao cobrar pagamentos) — risco real mas estatisticamente baixo a curto prazo para volume pequeno | Zero |
| **B. Migrar já para a Netlify Free** | 0 MZN | Sem risco de ToS; mas timeout de funções de 10s pode cortar gerações mais lentas (Gemini/OpenRouter por vezes demoram mais) | Alto — dezenas de rotas `/api` e o `vercel.json` (crons, rewrites) têm de ser reescritos para `netlify.toml` |
| **C. Vercel Pro já** | 20 USD ≈ **1.280 MZN/mês** | Zero risco, timeout até 300s | Zero |

**Recomendação (reafirmada, agora com números correctos):** ficar na Opção A por 2–4 semanas enquanto
100% da energia vai para vendas, e definir um **gatilho automático**: assim que a conta do negócio
acumular **1.280 MZN de lucro**, esse dinheiro tem prioridade máxima de gasto — vai para o Vercel Pro, não
para o bolso, independentemente de qualquer outra despesa que pareça mais urgente nesse momento. Migrar
para Netlify só compensa se, por alguma razão, o primeiro lucro demorar de forma anómala (6+ semanas) a
aparecer apesar de execução correcta da secção A.4.

### A.2 — Quanto aguenta o motor de IA 100% grátis (número corrigido)

Contando apenas os **9 providers com adaptador de código funcional** hoje (não 5, não 13):

| Provider | Tier | Limite grátis/dia (confirmado no registo) | ≈ Documentos/dia (~2.000 tokens/doc) |
|---|---|---|---|
| Cerebras | Generoso | 1.000.000 tokens/dia | ~500 |
| Groq | Generoso | 100.000 tokens/dia | ~50 |
| Google Gemini | Médio | ~250 pedidos/dia | ~250 |
| OpenRouter | Médio | ~200 pedidos/dia (20/min) | ~200 |
| NVIDIA NIM | Reserva | 40 pedidos/min (sem tecto diário fixo divulgado) | ~300–800 (estimativa) |
| Mistral, SambaNova, Together, Fireworks | Reserva | Tiers grátis variáveis, sem tecto diário fixo | Reserva de emergência — não contar como capacidade planeada |

Como `raceAllProviders()` faz uma corrida e cada documento só consome quota do provider que responder
primeiro, a capacidade **soma-se** entre os providers dos tiers "generoso" e "médio": estimativa
conservadora de **~1.000 a 1.300 documentos/dia, 100% grátis**, antes de sequer considerar pagar por IA —
ligeiramente abaixo da estimativa anterior (1.200–1.500), por causa da correcção do limite da Cerebras, mas
ainda uma folga enorme face ao volume que se consegue gerar organicamente nos primeiros meses.

**Conclusão prática, inalterada:** não vale a pena um minuto de preocupação com "vou aguentar o tráfego"
nesta fase. O problema é 100% arranjar tráfego, não servi-lo.

### A.3 — Estrutura legal: caminho híbrido em 2 fases

**Fase legal 1 — agora, pessoa singular:**
1. NUIT pessoal (gratuito, dias, na Autoridade Tributária ou num BAÚ), se ainda não existir.
2. Declaração de início de actividade como trabalhador independente, regime **ISPC**:
   - Tecto: **4.000.000 MZN/ano** de volume de negócios (Lei n.º 09/2025, em vigor desde Jan/2026) —
     muitíssimo acima do que este negócio vai gerar nos próximos meses.
   - Taxa base: **3%** sobre o volume de negócios, **reduzida a 1,5% no primeiro ano de actividade**.
   - A taxa exacta varia por actividade dentro da escala 3%–20% introduzida em 2026 — confirmar a taxa
     aplicável a "desenvolvimento de software/serviços digitais" com a AT ou um contabilista antes do
     primeiro pagamento.
   - Pagamento **trimestral** (Abril, Julho, Outubro, Janeiro); sem pagamento se o valor apurado for
     inferior a 500 MZN nesse trimestre.
3. Número M-Pesa dedicado ao negócio, separado do pessoal, desde o dia 1.
4. Cada venda já fica registada automaticamente em **Finanças → Livro de Transacções** no admin — é a
   base de contabilidade. Exportar o relatório de período todo mês.

**Fase legal 2 — gatilho híbrido para formalizar a Charifo Tech, Lda:**
Em vez de um único gatilho de receita, usar o gatilho **duplo** que combina os dois documentos de origem
(que discordavam entre si neste ponto — ver Anexo):
- **Gatilho B2C:** receita mensal estável acima de ~15.000–20.000 MZN/mês durante 2–3 meses seguidos
  (ponto em que o custo de um contabilista certificado, ~3.000 MZN/mês, deixa de comer uma fatia grande
  do lucro).
- **Gatilho B2B (dispara independentemente do valor acima):** assim que **uma** escola, empresa,
  cooperativa ou centro de fotocópias disser "sim, quero contratar o pacote mensal" — porque uma entidade
  colectiva não pode legalmente pagar e receber factura de uma pessoa singular sem NUIT empresarial.
  Registar a Lda **antes** de emitir a primeira factura a esse cliente, não depois.

Custo de registo via BAÚ para uma Lda pequena: **10.000–20.000 MZN**, prazo 5–15 dias úteis (mais o tempo
de publicação no Boletim da República). Capital social mínimo é hoje simbólico (1 MZN), mas um valor
realista (5.000–10.000 MZN) dá mais credibilidade a bancos/parceiros. Objecto social amplo desde já
("desenvolvimento de software; consultoria tecnológica; e no futuro robótica e automação") evita alterar
estatutos ao expandir. A partir da Lda aplica-se IRPC (32%) em vez de ISPC, com contabilidade organizada
obrigatória (~3.000 MZN/mês).

### A.4 — Estratégia de marketing de custo zero (condensada)

Já construído e pronto a usar: 3 panfletos profissionais, blog com SEO automático, sistema de afiliados
completo no admin. O trabalho que falta é **distribuição**, não produto nem conteúdo.

**Canais por prioridade (custo zero):**
1. **Afiliados (já construído)** — recrutar 5–10 estudantes/pessoas com boa rede; ganham só se venderem,
   custo zero até haver venda. Maior alavanca esperada no mês 1–3.
2. **Parcerias com centros de fotocópias/reprografia** perto de universidades e do BAÚ/Conservatória —
   eles recomendam, ganham comissão via o sistema de afiliados já existente.
3. **Distribuição física dos 3 panfletos** nos pontos certos: perto do BAÚ, Conservatórias, campus
   universitário, agências de emprego.
4. **SEO orgânico** (o blog já faz isto sozinho) — resultado só em semanas/meses, não contar com ele no
   mês 1.

**Ajustes obrigatórios aos 3 panfletos antes de distribuir (falta em todos):**
- Prova social: "+X documentos já criados" (número real do dashboard admin).
- Contacto humano visível: número de WhatsApp, não só QR code — em Moçambique é o canal de confiança nº1.
- Urgência: "Oferta de lançamento" ou prazo, para motivar acção imediata em vez de "depois".

**Regra de ouro operacional:** responder a qualquer mensagem de WhatsApp Business em **até 10 minutos**;
nunca vender directamente dentro de grupos (dar valor primeiro, link no fim); B2B (escolas, cybercafés)
vale mais por contrato do que dezenas de vendas avulsas — vale dedicar cerca de metade do tempo de
distribuição a isso desde a semana 1, mesmo que o fecho só aconteça mais tarde.

### A.5 — Cronograma condensado (detalhe hora-a-hora no plano de 14 dias original)

| Período | Foco | Metas |
|---|---|---|
| Dia 1 | NUIT/ISPC + WhatsApp Business + número M-Pesa do negócio | Fundação legal e de contacto pronta |
| Dia 2 | Contas TikTok/Instagram/Facebook + ajuste dos 3 panfletos no Canva (prova social, WhatsApp, urgência) | Panfletos prontos para imprimir e publicar |
| Dia 3 | 7 vídeos curtos gravados + primeiros afiliados activados | 5–10 afiliados no painel |
| Dia 4 | Entrar em grupos (15 Facebook + 20 WhatsApp) + agendar 14 posts | Calendário de conteúdo da semana 1 pronto |
| Dia 5 | **Distribuição física** — imprimir 20–50 de cada panfleto (~300–800 MZN), pontos prioritários: BAÚ, universidades, centros de fotocópia | Este é o dia que mais gera vendas directas |
| Dia 6 | Visitas B2B: 2–3 cybercafés + 1 escola/universidade com proposta de comissão/pacote institucional | Primeiras conversas B2B abertas (fechar não é meta ainda) |
| Dia 7 | Checklist técnico + planilha de métricas (Data/Canal/Vendas/Receita) | Hábito de medir instalado desde a semana 1 |
| Semana 2 | Execução automática: posts agendados, follow-up de afiliados e leads B2B, resposta em 10min | Consolidar o que funcionou na semana 1, cortar o que não funcionou |

### A.6 — Projecção financeira da Fase 0 (0 → ~algumas centenas de contas)

**Custos fixos reais desta fase:**

| Item | Custo mensal |
|---|---|
| Domínio (já pago) | ~217 MZN/mês (2.600 MZN/ano amortizado) |
| Vercel (Hobby → Pro assim que houver lucro) | 0 → 1.280 MZN/mês |
| Impressão de panfletos (única vez, semana 1) | 300–800 MZN |
| IA | 0 MZN (dentro das quotas grátis — ver A.2) |
| **Total antes do gatilho de migração** | **~217 MZN/mês + 300–800 MZN pontuais** |
| **Total depois de migrar para o Pro** | **~1.497 MZN/mês** |

**Preços de venda (dos panfletos actuais):** Avulso 50 MZN/3 créditos · Starter 120 MZN/10 · Básico
280 MZN/25 (mais escolhido) · Pro 600 MZN/60 · Empresa 1.500 MZN/150. Ticket médio assumido para
projecção: **~150 MZN** (mistura realista de Avulso/Starter/Básico).

⚠️ Estes são cenários de planeamento, não garantias — dependem inteiramente da execução das secções A.4–A.5.

| Período | Conservador | Moderado | Optimista |
|---|---|---|---|
| Semana 1 | 5–10 vendas ≈ 750–1.500 MZN | 15–25 vendas ≈ 2.250–3.750 MZN | 40+ vendas ≈ 6.000+ MZN |
| Mês 1 | 40–60 vendas ≈ 6.000–9.000 MZN | 120–180 vendas ≈ 18.000–27.000 MZN | 300+ vendas ≈ 45.000+ MZN |
| Mês 2–3 (run-rate mensal) | ~80 vendas/mês ≈ 12.000 MZN/mês | ~250 vendas/mês ≈ 37.500 MZN/mês | ~500 vendas/mês ≈ 75.000 MZN/mês |

No cenário conservador, o gatilho dos 1.280 MZN de lucro para migrar para o Vercel Pro é atingido durante
a semana 1 ou no início do mês 1. Margem por documento continua ~95%+ enquanto se ficar dentro das quotas
grátis de IA (secção A.2) — quase toda a receita acima dos custos fixos é lucro nesta fase. Mesmo no
cenário optimista, a receita anual projectada fica muito abaixo do tecto de 4.000.000 MZN do ISPC.

---

## PARTE B — Os factos técnicos estruturais (o que continua a determinar tudo o resto)

Estes três pontos mudam a prioridade de qualquer fase posterior, exactamente como no roadmap técnico
original — com os números agora corrigidos.

**1. O projecto está, tecnicamente, fora dos Termos de Serviço da Vercel.**
`api/process-payment.js` cobra/regista pagamentos de visitantes — a Vercel define isso como "uso
comercial", proibido no Hobby. Não é questão de volume, é contratual. Acção: migrar para o Pro assim que
o gatilho de 1.280 MZN (secção A.1) disparar, independentemente da fase técnica em que o projecto esteja.

**2. O verdadeiro tecto de curto/médio prazo não é técnico — é a confirmação humana de pagamentos.**
A via principal é a verificação automática por IA de visão (`confidence ≥ 0.85` → aprovação automática),
com fallback manual via WhatsApp para os casos que a IA não aprova sozinha (confirmado directamente no
código — ver secção 0). Não existe hoje nenhum gateway automático (PaySuite ou outro) ligado — o modo
`mpesa` no código devolve explicitamente "ainda não implementado". Uma pessoa dedicada confirma
manualmente de forma sustentável ~40–60 casos/dia; isto continua a ser o tecto real sobre a fatia que a IA
rejeita, não sobre 100% do volume.

**3. A corrida entre até 9 providers de IA (número corrigido) é óptima para fiabilidade, mas cara em
quota — e `raceAllProviders()` não respeita os tiers já definidos no registo.**
Cada geração dispara `Promise.any()` contra **todos os providers com chave configurada**, sem distinguir
tier "generoso" de tier "reserva_ativa" — confirmado directamente em `api/generate-document.js`
(`raceAllProviders()`, linha ~296): a função monta `avail` com qualquer provider que tenha `apiKeys[id]`
definido e corre todos em paralelo, sem filtrar por `providerCfg.tier`. Se o projecto tiver, hoje, chaves
configuradas para 6 dos 9, cada documento consome quota de 6 serviços, não de 1 — e o problema cresce à
medida que mais chaves gratuitas forem adicionadas para "mais fiabilidade". O disjuntor por modelo
(`modelHealth.js`) e a descoberta ao vivo (`modelDiscovery.js`) resolvem bem "o provider mudou o
catálogo" ou "um modelo específico falha" — mas não resolvem este problema de quota, que é estrutural à
forma como a função está escrita hoje.

O resto deste documento assume que estes três pontos estão a ser resolvidos em paralelo às fases abaixo.

---

## PARTE C — O que já está bem construído (não tocar sem motivo forte)

| Decisão já tomada | Porque já é a escolha certa |
|---|---|
| `api/_lib/supabaseAdmin.js` — REST puro em vez do SDK `@supabase/supabase-js` | Elimina `ws`, reduz cold start, evita o bug de "crédito debitado sem documento gerado". Confirmado: nenhum `require('@supabase/supabase-js')` nem `require('ws')` activo restante em `api/` — apenas comentários históricos a documentar a remoção |
| Registo central de providers de IA (`aiProviderRegistry.js`) com descoberta de modelos ao vivo e disjuntor por modelo | Um provider novo entra na corrida só por a env var existir; um modelo descontinuado é saltado automaticamente; um modelo com falhas transitórias é posto de lado com backoff crescente sem intervenção manual |
| Dedução de crédito via RPC atómica + reembolso automático em falha total | Resolve a corrida clássica de sistemas de crédito sem fila externa |
| Consolidação em 12 funções (`vercel.json` confirma: exactamente 12 entradas em `functions`) | Respeita o limite do Vercel Hobby/Pro (12 functions por deployment) — **já está fisicamente no limite, sem margem** |
| Rate limiting com Upstash Redis + fallback em `Map` local | Padrão correcto; falta só tornar o Redis obrigatório em produção (ver Fase 1) |
| Mascaragem de dados pessoais em duas camadas (`piiRedaction.js` servidor + `piiShield.js` browser) antes de qualquer prompt sair para os providers | Reduz o que fica exposto a até 9 fornecedores externos possíveis |
| Verificação de pagamento por IA de visão + fallback humano (`confidence ≥ 0.85`) | Já é mais escalável do que "100% manual" sem depender de um gateway externo ainda não integrado |
| Conformidade LPD implementada antes de ser legalmente obrigatória (`consent_logs`, direito ao esquecimento, `migration_v48`) | Moçambique ainda não tem lei de protecção de dados autónoma em vigor — reduz risco de retrabalho futuro |
| Índices nas tabelas de alto tráfego + `page_views` agregada por (página, dia) | Evita lentidão e tabelas sem limite de crescimento antes de serem um problema real |
| PWA com Service Worker | Visitas repetidas quase não consomem bandwidth da Vercel — poupa dinheiro real à medida que a base cresce |

---

## PARTE D — Premissas assumidas neste roadmap (actualizadas)

- "Utilizadores" = contas registadas acumuladas (não MAU).
- Taxa de conversão para pelo menos 1 compra: 5–8% dos registados, ao longo da vida da conta.
- Ticket médio: ~150 MZN (mistura realista de Avulso/Starter/Básico).
- Documento médio gerado: ~5 KB de markdown em `documents.content`.
- Pico de concorrência simultânea: 2–5% da base registada.
- **Número médio de providers de IA com chave activa em produção: 5–7 de 9 possíveis com adaptador
  funcional** (corrigido de "5–8 de 13").
- Câmbio de referência: **1 USD ≈ 64 MZN**.
- Comissão de gateway de pagamento (quando/se PaySuite ou equivalente for integrado): **~5–6% da
  transacção**, sem mensalidade fixa (corrigido de "2–4%").

---

## PARTE E — Fases de escala (1 a 4), com custo e receita lado a lado

### Fase 1 — 0 a 1.000 utilizadores

**Objectivo:** validar produto e canal de aquisição sem se preocupar com infraestrutura.

**Gargalos:** conformidade Vercel (já deve estar resolvida se a Fase 0 foi seguida); fallback manual de
pagamentos ainda irrelevante (~50–80 pagamentos *no total* da fase); rate limiting em `Map` local deixa de
ser fiável assim que a Vercel correr 2+ instâncias simultâneas sob qualquer pico, por pequeno que seja.

**Custos mensais de infraestrutura:**

| Item | Plano | Custo USD | Custo MZN |
|---|---|---|---|
| Vercel | Pro (obrigatório) | 20 USD | 1.280 MZN |
| Supabase | Free (500 MB DB, 50k MAU, 5 GB egress) | 0 | 0 |
| Upstash Redis | Free — **500.000 comandos/mês** (corrigido de 10k/dia) | 0 | 0 |
| Providers de IA | Tiers grátis (Groq/Cerebras + Gemini/OpenRouter chegam) | 0 | 0 |
| **Total infra** | | **~20 USD** | **~1.280 MZN/mês** |

**Receita estimada nesta fase** (5–8% de conversão sobre até 1.000 contas, ticket ~150 MZN):
50–80 vendas ao longo da fase ≈ **7.500–12.000 MZN acumulados** — coerente com o run-rate mensal
conservador/moderado da Fase 0 (secção A.6) se a fase demorar 1–3 meses a completar-se.

**Mudanças necessárias:** migrar para Vercel Pro (se ainda não feito); activar
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (grátis, código já suporta); SLA simples de
confirmação manual ("até 6 horas"); confirmar alertas de uso a 80%/100% na conta certa.

**O que não fazer ainda:** gateway de pagamento automático, fila de mensagens, CDN adicional,
microsserviços, Kubernetes, optimizar bundle de JS.

---

### Fase 2 — 1.000 a 5.000 utilizadores

**Objectivo:** primeira fricção operacional real — começar a construir a "fila" para os problemas da Fase
3 antes de serem urgentes.

**Gargalos:** fallback manual de pagamentos torna-se um trabalho visível em dias de pico;
`documents.content` começa a pesar (~125–200 MB com 5.000 contas × 5–8 documentos cada, ainda dentro dos
500 MB do Supabase Free mas a trajectória é visível); quota gratuita de IA tem dias "vermelhos" mais cedo
do que o esperado, precisamente porque `raceAllProviders()` não respeita tiers (ver Parte B, ponto 3).

**Custos mensais de infraestrutura:**

| Item | Plano | Custo USD | Custo MZN |
|---|---|---|---|
| Vercel Pro | inclui 1 TB bandwidth, 1.000 GB-h functions | 20 | 1.280 |
| Supabase | Free, ou Pro se DB/egress aproximar do limite | 0–25 | 0–1.600 |
| Upstash Redis | ainda provavelmente dentro do Free (500k/mês) | 0 | 0 |
| IA — reforço pago opcional | ex.: chave paga só para horas de pico | 0–15 | 0–960 |
| **Total infra** | | **~20–60 USD** | **~1.280–3.840 MZN/mês** |

**Receita estimada nesta fase** (5–8% de conversão sobre 1.000–5.000 contas, ticket ~150 MZN):
~200–400 vendas *novas* ao longo da fase (diferença entre os 50–80 já contados na Fase 1 e o total
esperado a 5.000 contas) ≈ **30.000–60.000 MZN acumulados** nesta fase — ou, em run-rate mensal se a fase
demorar ~3–4 meses, algo entre **8.000 e 20.000 MZN/mês** ao longo da fase, aproximando-se do gatilho de
formalização da Lda descrito na secção A.3 perto do fim desta fase.

**Mudanças necessárias:** iniciar processo (registo/sandbox) com PaySuite ou equivalente — a aprovação
como comerciante demora semanas, começar tarde é o erro mais caro; **corrigir `raceAllProviders()` para
respeitar tiers** (por omissão "generoso"+"médio", "reserva_ativa" só como fallback); política de
retenção de `documents.content` para contas muito antigas (ainda não urgente, mas escrever a política já);
confirmar que `cleanup-temp-accounts.js` (cron diário) corre de facto em produção.

**O que não fazer ainda:** trocar o Supabase, construir fila própria (SQS/RabbitMQ), migrar para
Next.js/SSR "para parecer mais profissional".

---

### Fase 3 — 5.000 a 10.000 utilizadores

**Objectivo:** transformar os dois maiores riscos (fallback manual de pagamento, tectos do Supabase Free)
em sistemas que não dependem de uma pessoa nem de um tier grátis.

**Gargalos:** fallback manual deixa de ser sustentável para uma pessoa só (dezenas de casos/dia em picos);
Supabase Free deixa de ser viável (DB a aproximar-se de 250–400 MB, egress a aproximar-se de 5 GB/mês);
`online_sessions` via Realtime aproxima-se do limite de 200 (Free)/500 (Pro) ligações simultâneas em picos
reais.

> ✅ Confirmado, não é gargalo: `api/admin/index.js` já não usa `@supabase/supabase-js` nem `ws` — a
> migração para REST puro já está feita em todo o projecto (ver Parte C).

**Custos mensais de infraestrutura:**

| Item | Plano | Custo USD | Custo MZN |
|---|---|---|---|
| Vercel Pro | dentro do incluído, salvo picos | 20 | 1.280 |
| Supabase Pro | 8 GB DB, 250 GB egress, 500 ligações Realtime | 25 (+compute ~10 incluído) | 1.600 |
| Upstash Redis | pago se ultrapassar 500k comandos/mês (mais raro do que se pensava) | 0–10 | 0–640 |
| PaySuite / agregador | comissão ~5–6% por transacção — variável, sobre receita | variável | variável |
| IA — 1 chave paga como reforço principal | reduz dependência de tiers grátis instáveis | 10–30 | 640–1.920 |
| Apoio humano p/ pagamentos/suporte (opcional) | meio-período, se o volume já justificar | 100–200 | 6.400–12.800 |
| **Total infra (sem mão-de-obra)** | | **~55–85 USD** | **~3.520–5.440 MZN/mês** |

**Receita estimada nesta fase** (5–8% conversão sobre 5.000–10.000 contas, ticket ~150 MZN, **menos a
comissão de ~5–6% sobre a parcela processada via gateway automático**):
~375–800 vendas *novas* ao longo da fase, receita bruta ≈ **56.000–120.000 MZN acumulados** na fase; com
o gateway automático já a processar a maioria (>90% do volume, meta desta fase), subtrair ~5–6% de
comissão sobre essa parcela ≈ **líquido de ~53.000–113.000 MZN acumulados**. Em run-rate mensal (fase de
~4–6 meses): aproximadamente **10.000–20.000 MZN/mês líquidos**, já claramente acima do gatilho de
formalização da Lda descrito na secção A.3.

**Mudanças concretas:** lançar pagamento automático via PaySuite (ou equivalente) como caminho principal,
**mantendo** a IA de visão + fallback manual como rede de segurança, não removê-la; subir para Supabase
Pro; rever se algum provider "reserva_ativa" deve subir a "médio" permanente com base nas métricas reais da
Fase 2; desactivar/reduzir o WebSocket de "Online Agora" sob carga alta, confiar no polling de 20s já
implementado.

**O que não fazer ainda:** trocar Vercel por AWS/GCP "para ter mais controlo"; fila distribuída para a
geração de documentos — 60s de timeout por function ainda chega para texto, não vídeo/imagem pesada.

---

### Fase 4 — 10.000 a 50.000 utilizadores

**Objectivo:** deixar de depender de qualquer recurso "grátis" como caminho crítico; preparar a equipa
(não só o código) para o volume.

**Gargalos:** tiers gratuitos de IA tornam-se reserva de emergência, não espinha dorsal, mesmo com a
corrida já reduzida por tiers; MAU do Supabase aproxima-se do limite de 100k incluído no Pro; fallback
manual precisa de pelo menos 1 pessoa dedicada ou de ser reduzido a excepção rara (<2%); timeouts de 60s
(Hobby)/300s (Pro) começam a ser relevantes para documentos académicos longos multi-secção
(`LongDocumentEngine`); bandwidth/CPU da Vercel deixam de ser triviais à medida que novas primeiras
visitas crescem (cache do Service Worker só ajuda a partir da 2ª visita).

**Custos mensais de infraestrutura:**

| Item | Plano | Custo USD | Custo MZN |
|---|---|---|---|
| Vercel Pro | overage provável de bandwidth/CPU em meses de campanha forte | 20–80 | 1.280–5.120 |
| Supabase Pro | com overage de DB/egress conforme o volume real | 35–80 | 2.240–5.120 |
| Upstash Redis | tier pago conforme nº de comandos/dia | 10–25 | 640–1.600 |
| IA — provider(es) pago(s) como principal | maior custo variável da infra nesta fase | 50–200 | 3.200–12.800 |
| PaySuite / agregador | comissão ~5–6% sobre receita processada | variável | variável |
| Equipa de suporte/pagamentos (mínimo 1 pessoa) | full-time ou contratado local | — | custo de pessoal à parte |
| **Total infra (sem pessoal)** | | **~115–385 USD** | **~7.360–24.640 MZN/mês** |

A maior incerteza continua a ser o custo de IA, não Vercel nem Supabase — depende directamente de quantos
documentos são gerados por dia e de quantos providers correm por documento.

**Receita estimada nesta fase** (5–8% conversão sobre 10.000–50.000 contas, ticket ~150 MZN, líquido de
comissão ~5–6%):
~1.500–4.000 vendas *novas* ao longo da fase, receita bruta ≈ **225.000–600.000 MZN acumulados**; líquido
de comissão de gateway ≈ **~215.000–570.000 MZN acumulados** na fase completa. Em run-rate mensal, à
medida que a fase avança: de ~20.000 MZN/mês no início da fase (perto de 10.000 contas) até
**~75.000–150.000 MZN/mês líquidos** perto do fim da fase (perto de 50.000 contas), dependendo fortemente
da execução de marketing contínua — o produto e a infraestrutura já não são o limitador nesta escala,
tal como na Fase 0.

**Arquitectura — mudanças concretas:**
1. Tratar a IA como linha de orçamento, não recurso grátis — 1–2 providers pagos como principais (os que
   historicamente tiveram melhor sucesso/latência), tiers grátis como reserva de emergência apenas.
2. Substituir definitivamente o fluxo manual de pagamento como caminho principal — manter só como
   recuperação de falhas do gateway, com alerta automático se o nº de transacções manuais subir acima de
   um limiar.
3. Rever `api/admin/index.js` quanto a concorrência de múltiplos administradores, se a equipa de suporte
   crescer — dentro do limite de 12 functions, via parâmetros de rota, como já é feito hoje.
4. Configurar *spend management* da Vercel e *spend cap* do Supabase — a esta escala, um erro (ex.: loop a
   chamar a API de IA) pode gerar factura inesperada em horas.
5. CDN gratuita adicional (ex.: Cloudflare) à frente dos `assets/` estáticos.

**O que não fazer ainda, mesmo a 50.000 utilizadores:** microsserviços ou Kubernetes só por causa do
número de utilizadores — o gargalo real continua a ser custo variável de IA e operação de pagamentos, não
arquitectura de deployment. Um monólito bem indexado em Postgres + functions serverless continua capaz de
servir 50.000 utilizadores de um produto de geração ocasional de documentos.

---

## PARTE F — Tabela-resumo consolidada: custo e receita por fase

| Fase | Utilizadores | Custo infra (MZN/mês) | Receita líquida estimada (MZN/mês, run-rate) | Cenário |
|---|---|---|---|---|
| 0 | 0 → algumas centenas | ~217 → 1.497 | 1.500 (semana 1, conservador) → 27.000 (mês 1, moderado) | Ver secção A.6 |
| 1 | 0–1.000 | ~1.280 | ~2.500–4.000 (extrapolado do fim da Fase 0) | Conservador/moderado |
| 2 | 1.000–5.000 | ~1.280–3.840 | ~8.000–20.000 | Moderado |
| 3 | 5.000–10.000 | ~3.520–5.440 | ~10.000–20.000 | Moderado, líquido de comissão |
| 4 | 10.000–50.000 | ~7.360–24.640 | ~20.000 → 75.000–150.000 | Moderado a optimista |

Excluído desta tabela, de propósito: salários/horas humanas (à excepção do apoio a pagamentos opcional já
listado por fase) e marketing pago (este roadmap assume, deliberadamente, marketing 100% orgânico/custo
zero em todas as fases — ver secção A.4). Se em algum momento se decidir investir em marketing pago, isso
é uma decisão separada, com o seu próprio orçamento e ROI a medir à parte desta tabela.

**Leitura importante desta tabela:** a receita cresce muito mais depressa do que o custo de infraestrutura
em todas as fases — a margem por documento continua acima de 90% enquanto a maioria da IA ficar dentro dos
tiers grátis (Partes B/D). O risco financeiro real deste negócio nunca foi "os custos de infraestrutura
vão explodir"; foi sempre "a receita pode demorar a aparecer se a distribuição não for executada" — daí a
Fase 0 estar isolada e detalhada no topo deste documento, e não escondida dentro da Fase 1.

---

## PARTE G — Princípios anti-overengineering para esta equipa, nesta escala

- Cada mudança de arquitectura precisa de uma métrica real que a justifique, não "porque é o que startups
  maiores fazem".
- Supabase + Postgres + RLS aguenta as 50.000 utilizadores deste roadmap sem sharding, read-replicas ou
  bases de dados especializadas.
- Manter um caminho humano de recuperação de pagamentos, mesmo depois de automatizar — gateways de
  pagamento em Moçambique falham, e ter um caminho humano é vantagem competitiva real face a concorrentes
  100% automatizados sem plano B.
- Resistir à tentação de reescrever o frontend num framework "para escalar" — o bloqueador nunca foi o
  frontend, é pagamentos, distribuição e custo de IA.
- Medir antes de migrar: custo real de IA por documento (e por quantos providers correram nesse
  documento), tempo real de confirmação de pagamento, e — novidade desta versão — **receita real por
  semana desde a Fase 0**, mesmo informalmente (a planilha da secção A.5 já chega), para que as decisões
  de fase sejam baseadas em dados próprios, não nas suposições deste documento.

---

## PARTE H — Plano de acção imediato (próximas 2 semanas, fundido)

**Técnico:**
1. Corrigir `raceAllProviders()` (`api/generate-document.js`) para respeitar os tiers já definidos em
   `aiProviderRegistry.js` — correr por omissão só "generoso"+"médio", "reserva_ativa" como fallback. É a
   mudança de código mais barata e com maior impacto directo em custo de quota de todo este documento.
2. Activar `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` em produção (grátis, código já suporta).
3. Definir e publicar um SLA simples de confirmação de pagamento manual para os utilizadores.

**Negócio/legal:**
4. NUIT pessoal + declaração de início de actividade (ISPC), se ainda não feito.
5. Número M-Pesa do negócio separado do pessoal.
6. Ajustar os 3 panfletos (prova social + WhatsApp visível + urgência) e distribuí-los nos pontos
   prioritários (secção A.4–A.5).
7. Activar os primeiros 5 afiliados.
8. Começar, em paralelo (não lançar já), o processo de registo/sandbox com a PaySuite — a aprovação demora
   semanas.
9. Criar a planilha simples (Data | Canal | Vendas | Receita | nº documentos | provider de IA que
   respondeu) — vai guiar todas as decisões de fase muito melhor do que qualquer suposição deste
   documento.
10. Definir mentalmente o gatilho de 1.280 MZN de lucro → migração imediata para Vercel Pro.

---

## Anexo — Nota de correções e divergências entre os documentos de origem

Os três documentos fundidos aqui divergiam entre si em alguns pontos, além de terem alguns números
desactualizados face ao código/mercado actual (ver secção 0). Registo explícito das divergências
*internas* entre os documentos, para transparência:

1. **Número de providers de IA:** o doc. Rentabilidade falava em "5 providers"; o doc. Escala em "até 13".
   Nenhum dos dois estava errado por acaso — o doc. Rentabilidade descrevia um estado anterior do código, o
   doc. Escala contava tanto os 9 providers com adaptador (`PROVIDERS[]`) como os 4 apenas catalogados sem
   código (`UNWIRED_RESERVE[]`) como se fossem igualmente "providers". A verificação directa do código
   confirma **9** como o número correcto de corredores reais possíveis hoje.
2. **Gatilho de formalização da Lda:** o doc. Rentabilidade defendia esperar por 15.000–20.000 MZN/mês
   estáveis; o plano de 14 dias defendia um gatilho híbrido que regista a Lda assim que **qualquer**
   cliente B2B concreto aparecer, independentemente da receita B2C acumulada até esse ponto — porque uma
   escola/empresa não pode legalmente pagar a uma pessoa singular sem NUIT empresarial. Este documento usa
   o gatilho híbrido (secção A.3), por ser estritamente mais completo: cobre tanto o caso B2C-primeiro
   como o caso em que uma oportunidade B2B aparece cedo, antes do gatilho de receita B2C ser atingido.
3. **Comissão de gateway de pagamento:** nenhum dos dois documentos de origem tinha este número verificado
   directamente na fonte — o doc. Escala assumia "2–4%, a confirmar no contrato". A verificação directa na
   página da PaySuite aponta para **~5–6%** (exemplo publicado: 60 MZN de taxa sobre 1.000 MZN). Este
   valor mais alto foi propagado a todas as projecções de receita líquida das Fases 3 e 4.
4. **Upstash Redis:** ambos os documentos assumiam "10.000 comandos/dia" — este era o tier gratuito antes
   de Março/2025. O tier actual (500.000 comandos/**mês**) é significativamente mais generoso; isto atrasa
   materialmente o ponto em que o Redis pago se torna necessário, face ao que ambos os documentos
   assumiam.

Nenhuma destas correcções muda a conclusão central de nenhum dos dois documentos originais — muda apenas a
precisão dos números usados para lá chegar, que é exactamente o que foi pedido nesta revisão.
