# Verificação legal das citações em `assets/js/services/prompts/`

Este documento regista, diploma a diploma, o resultado da verificação feita em
Junho/2026 contra textos legais oficiais (Boletim da República) e fontes
académicas/doutrinárias, para as citações de lei usadas nos prompts de IA dos
serviços jurídicos do MzDocs Pro.

**Objectivo:** nenhuma citação de lei/artigo enviada à IA ou mostrada ao
utilizador final deve ser inventada. Quando não foi possível confirmar um
diploma com uma fonte primária, a citação foi removida do prompt em vez de
mantida "por precaução" — citar uma lei errada é pior do que não citar nenhuma.

**Isto não substitui aconselhamento jurídico.** É um registo de due diligence
de engenharia, não um parecer jurídico. Diplomas marcados como "não
verificado" continuam a precisar de confirmação por um jurista antes de
poderem voltar a ser citados no produto.

---

## 1. Erros confirmados e corrigidos

| Ficheiro | Antes | Depois | Evidência |
|---|---|---|---|
| `residencia.js` | "artigo 347.º da Lei n.º 35/2014 (Código Penal)" para falsas declarações | "artigo 271.º do Código Penal" (Falso testemunho em inquirição não contenciosa; falsas declarações perante a autoridade) | Texto extraído de `codigo_penal.pdf` — o artigo 347.º não existe nesse diploma (vai até ao art. 448.º, e o crime de falsas declarações está nos arts. 267.º–271.º e 354.º). O 271.º é o aplicável a declarações administrativas como esta. |
| `requerimento.js` | "Lei n.º 7/2009, de 11 de Março (Regime Jurídico da Segurança Social Obrigatória)" | "Lei n.º 4/2007, de 7 de Fevereiro (Lei da Protecção Social)" | O Boletim da República de 11 de Março de 2009 mostra que a Lei n.º 7/2009 dessa data é o Estatuto dos Magistrados Judiciais, não segurança social. A Lei n.º 4/2007, de 7/2, confirmada por múltiplas fontes (incluindo o PDF dedicado `Lei-4-2007-de-7-de-Fevereiro-Lei-da-Proteccao-Social.pdf`) e pela jurisprudência académica, é a base correcta da Protecção Social/INSS. |
| `arrendamento.js` | "Lei n.º 19/2013, de 23 de Setembro (Lei do Arrendamento Urbano)", citada com 6 artigos específicos (14.º, 22.º, 25.º, 34.º, 35.º, 36.º) | Removida por completo. Base passa a ser o Código Civil (arts. 1022.º–1062.º, Locação) + nota de que o regime do arrendamento urbano em Moçambique é uma área de incerteza doutrinária reconhecida (diploma historicamente aplicado: Lei n.º 8/79, de 3 de Julho) | Nenhuma fonte (oficial, jornalística ou académica) confirma a existência de uma "Lei n.º 19/2013" de arrendamento urbano. Um artigo académico da Universidade de Macau sobre o regime de arrendamento moçambicano confirma que o Tribunal Supremo (1992) considerou a Lei n.º 8/79 como tendo revogado o antigo Decreto n.º 43.525/1961. Os 6 artigos citados (incluindo prazos e multa de 3%) foram, portanto, inventados na íntegra. |
| `procuracao.js` | "art. 80.º do Código do Notariado" para reconhecimento notarial de procurações | "art. 120.º do Código do Notariado (Procurações e substabelecimentos)" | Texto extraído do Decreto-Lei n.º 4/2006, de 23 de Agosto (que altera/republica o Código do Notariado): o art. 80.º é "Petição" (processo de reclamação contra recusa do notário); o art. 120.º é especificamente sobre procurações. |
| `procuracao.js` | "Lei n.º 19/2013, de 23 de Setembro (negócios imobiliários); Lei de Terras n.º 19/1997" para procurações de venda de imóvel | Removida; substituída por referência genérica ao Código Civil + nota de não citar a Lei 19/2013 | Mesma lei inexistente do ponto anterior, reaparecendo noutro contexto. |
| `procuracao.js` | "Lei n.º 4/2013, de 22 de Fevereiro (Lei do Notariado — reconhecimento de assinaturas)" | Removida; reconhecimento passa a referenciar o art. 120.º do Código do Notariado | Não foi possível confirmar com nenhuma fonte que a Lei n.º 4/2013 trata de reconhecimento de assinaturas. |
| `prestacao.js` | "Lei n.º 4/2004 (Trabalho por Conta Própria e Protecção Social Independente)" | Removida | Sem fonte que confirme este diploma. |
| `licenca.js` | 8 decretos regulamentares específicos (Decreto n.º 43/2004, 28/1994, 23/2008, 66/2010, 26/2011, 54/2015; Diploma Ministerial 64/2007; Lei n.º 7/2017, Lei n.º 5/2017) | Todos removidos, substituídos por linguagem genérica "regulamentação aplicável" | Nenhum destes diplomas foi confirmado contra fonte primária. |

| `requerimento.js`, `residencia.js` | "Lei n.º 8/2004, de 21 de Julho (Lei dos Registos e Identificação Civil)" + "Decreto n.º 10/2006, de 12 de Abril" | "Lei n.º 12/2004, de 8 de Dezembro (Código do Registo Civil)" | **Encontrado durante a Fase 2 (ingestão para RAG), Junho/2026.** O PDF usado para confirmar este diploma na primeira ronda de auditoria era, na realidade, o Boletim da República que aprova a **Lei das Telecomunicações** — o próprio sumário do Boletim diz "Lei n.º 8/2004: Aprova a lei das Telecomunicações, e revoga a Lei n.º 14/99, de 1 de Novembro". A confusão só foi detectada ao processar o texto completo para gerar embeddings (o conteúdo do artigo 6.º, sobre "serviços de telecomunicações", não correspondia ao esperado). A lei correcta do Código do Registo Civil é a Lei n.º 12/2004, de 8/12, confirmada por fonte académica (civil.registos.gov.mz). O "Decreto n.º 10/2006" não foi confirmado e foi removido. A mesma citação errada existia em DOIS ficheiros (`requerimento.js` e `residencia.js`) — a correcção inicial só tinha coberto o primeiro. |

| `acta.js` | "Lei n.º 8/2008, de 15 de Julho (Lei das Associações)" | "Lei n.º 8/91, de 18 de Julho (Lei das Associações)" | **Encontrado durante a Fase 2, Junho/2026, ao adicionar suporte de RAG a `acta.js` — este ficheiro nunca tinha sido coberto pela auditoria da Fase 1** (não tinha sido detectado como "categoria jurídico" na primeira passagem). "Lei n.º 8/2008" é, na realidade, a Lei da Organização Tutelar de Menores — confirmado por múltiplas fontes independentes (incluindo o Boletim da República de 15/7/2008) de que a Lei das Associações é a Lei n.º 8/91, de 18 de Julho. ✅ Texto integral obtido (joint.org.mz), limpo, 20 artigos, já ingerido no RAG (migration_v20, diploma `lei-associacoes`). |
| `acta.js` | "Lei n.º 23/1992, de 31 de Dezembro (Lei das Cooperativas)" | "Lei n.º 23/2009, de 8 de Setembro (Lei Geral sobre as Cooperativas)" | Mesmo achado. Número e data confirmados por **múltiplas fontes independentes** (Tribunal Supremo de Moçambique, artigo académico sobre cooperativismo em Marracuene, reportagem do jornal O País sobre os 14 anos de vigência da lei) — não existe confirmação de uma "Lei n.º 23/1992". ⚠️ **Texto integral ainda NÃO obtido**: a única cópia encontrada (ampcm.coop) é um PDF escaneado sem OCR, e o domínio não está acessível pelas ferramentas desta sessão (fora da allowlist de rede; `web_fetch` só devolve a marca de água "Pandora Box Lda.", não o conteúdo da imagem). Diploma `lei-cooperativas` está em `legal_diplomas` marcado `nao_usar` — fica pendente até alguém com acesso normal à internet baixar o PDF e enviá-lo para processamento OCR. **Decisão (24/6/2026): deixado pendente deliberadamente — não bloqueia o resto da Fase 2.** O serviço `acta` continua a citar o número/data correctos no texto estático (sem RAG) enquanto isto não for resolvido.

## 1.1 Nota sobre este próprio processo de verificação

O erro acima é um recordatório importante: **mesmo citações que passaram por verificação anterior podem estar erradas** se a verificação não tiver ido até ao conteúdo completo do PDF — bastou confiar no título/número do diploma sem ler o articulado completo para este erro passar. A ingestão para RAG (que processa o texto integral, artigo a artigo) acabou por ser, ela própria, uma camada adicional de verificação. Isto reforça por que o sistema de citação final não deve depender só de revisão humana pontual — daí o valor do RAG: cada citação gerada passa a vir de texto efectivamente lido, não de memória ou de confirmação superficial.

| Diploma | Onde é citado | Evidência |
|---|---|---|
| Código Civil de Moçambique — Decreto-Lei n.º 47.344, de 25/11/1966, posto em vigor pela Portaria n.º 22.869, de 4/9/1967 | `procuracao`, `arrendamento`, `prestacao`, `residencia`, `acta` | Confirmado com o texto genuíno moçambicano (distinto da versão portuguesa actualizada, que **não** deve ser usada — ver secção 3). Artigos verificados individualmente: 82.º (domicílio), 262.º–294.º (procuração), 1022.º–1062.º (locação), 1143.º (mútuo, com nota de alteração pelo DL 3/2006), 1154.º–1230.º (prestação de serviços/empreitada). |
| Código Penal de Moçambique | `residencia.js`, `requerimento.js` | Confirmado contra `codigo_penal.pdf` (140 artigos, "Revisto e Renumerado"). |
| Código do Notariado de Moçambique — Decreto-Lei n.º 4/2006, de 23 de Agosto | `procuracao.js` | Confirmado contra o Boletim da República de 23/8/2006 (213 artigos). |
| Lei n.º 5/93, de 28 de Dezembro (regime jurídico do cidadão estrangeiro) | `requerimento.js` | Confirmado contra `MOZ_..._Lei-No-5-93...pdf`. |
| Lei n.º 2/97, de 18 de Fevereiro (Órgãos Locais do Estado) | `requerimento.js` | Confirmado via OCR de `lei 02-97.pdf` (PDF escaneado sem texto nativo — OCR feito em Português). |
| Lei n.º 20/97, de 1 de Outubro (Lei do Ambiente) | `licenca.js` | Confirmado via OCR — PDF disponível está incompleto (só Capítulo 1); o restante articulado não foi verificado. |
| Lei n.º 3/93, de 24 de Junho (Actividades Comerciais) | `prestacao.js`, `licenca.js` | Confirmado contra `14_15_tb1_pt_lei_nr_03_93_24_de_junho.pdf`. |
| Lei n.º 15/2002, de 26 de Junho (Bases do Sistema Tributário) | `requerimento.js`, `recibo.js` | Confirmado, versão consolidada com alteração pela Lei n.º 21/2022. |
| Lei n.º 32/2007, de 31 de Dezembro (Código do IVA) — taxa actual 16% | `recibo.js` | Confirmado contra versão consolidada com alterações até 2025 (Lei n.º 22/2022 baixou a taxa de 17% para 16%). |
| Lei n.º 19/2007, de 18 de Julho (Ordenamento do Território) | `licenca.js` | Confirmado contra `Lei_19_2007 (Ordenamento Territorio).pdf`. |
| Estatuto da Ordem dos Advogados — Lei n.º 7/94, de 14 de Setembro | `procuracao.js` | Confirmado (corrigida a data de "Lei n.º 7/1994" sem dia para "14 de Setembro"). |

## 3. Armadilha confirmada: fontes com nome moçambicano mas conteúdo de outro país

Durante a verificação, dois ficheiros enviados como sendo legislação
moçambicana revelaram-se, após inspecção do texto, ser de **outras
jurisdições**:

- Um PDF nomeado como Código Civil moçambicano de 1966 continha, na
  realidade, o **Código Civil Português** na sua versão consolidada/alterada
  até 2001 (referências a "Lei n.º 16/2001", "Actualizado em 2001-06-26",
  zero ocorrências da palavra "Moçambique" em 309 páginas). **Não foi usado.**
- Um ficheiro nomeado "Código do Notariado" continha o **Código do Notariado
  de Macau** (Decreto-Lei n.º 62/99/M — a sigla "/M" identifica diplomas de
  Macau; fonte: `bo.dsaj.gov.mo`, o Boletim Oficial de Macau). **Não foi
  usado.**

Isto confirma que o nome do ficheiro não é garantia de proveniência — qualquer
ingestão futura para um sistema de RAG jurídico (Fase 2) precisa de validar o
conteúdo, não só o nome do ficheiro.

## 4. Diplomas ainda não verificados (pendentes de fonte)

Os diplomas abaixo aparecem nos prompts mas não foi possível confirmá-los com
nenhuma fonte disponível até agora. Não foram removidos do código por serem
referências mais genéricas e de menor risco, mas devem ser tratados como
**não confirmados**:

- Lei n.º 7/2015, de 6 de Outubro (Mediação, Conciliação e Arbitragem) — `arrendamento.js`
- Lei n.º 6/92 (Sistema Nacional de Educação) — `requerimento.js`
- Lei n.º 14/2014 (Lei de Saúde) — `requerimento.js`
- Diversos decretos regulamentares de licenciamento (construção, transporte, eventos, ambiente) — `licenca.js`, já neutralizados no texto do prompt (ver secção 1)
- **Lei n.º 23/2009, de 8 de Setembro (Lei Geral sobre as Cooperativas)** — `acta.js`. Diferente dos restantes desta lista: o número/data **estão confirmados** (múltiplas fontes independentes), só falta o **texto integral** para ingestão no RAG. Diploma `lei-cooperativas` em `legal_diplomas` está `nao_usar`. Para resolver: obter o PDF de `ampcm.coop` (fora da allowlist de rede das ferramentas desta sessão) e processá-lo por OCR.

## 5. Como manter isto actualizado

Sempre que um novo diploma for confirmado (com PDF oficial ou fonte
equivalente), actualizar este ficheiro antes de voltar a citá-lo num prompt.
Sempre que um prompt jurídico for editado, verificar se a citação que está a
ser adicionada já está nesta tabela — se não estiver, não adicionar a citação
sem confirmação.
