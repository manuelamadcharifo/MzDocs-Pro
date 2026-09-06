# supabase/ — estrutura e como usar

Reorganizado em Set/2026 (dívida técnica P2 — ver secção 13 do README
principal). Antes disto, esta pasta tinha 81 ficheiros `.sql` soltos, sem
nenhuma convenção, todos corridos manualmente no SQL Editor do Supabase.
Isto tornava impossível a um developer novo (ou a um ambiente de CI) criar
uma base de dados igual à de produção a partir do zero.

## Como criar a base de dados do zero

```bash
supabase start        # sobe Postgres local (Docker)
supabase db reset      # aplica TODAS as migrações, por ordem, + seed.sql
```

Isto deve produzir uma estrutura equivalente à de produção. Se notares
alguma diferença, ver "Limitações conhecidas" abaixo antes de assumir bug.

## Estrutura

```
supabase/
├── config.toml           # config do Supabase CLI (novo — nunca existiu antes)
├── migrations/            # as 81 migrações antigas, RENOMEADAS (não reescritas)
│                           # para a convenção <timestamp>_<nome>.sql do CLI,
│                           # na ordem em que tudo indica terem corrido em produção
├── seed.sql               # corre automaticamente a seguir às migrações
├── ops/                    # scripts operacionais (NÃO fazem parte do db reset)
│   └── promote_admin.sql
├── tests/database/         # testes pgTAP (`supabase test db`)
│   └── 00_schema_smoke_test.sql
└── _legacy_archive/        # os 81 ficheiros ORIGINAIS, intocados — histórico
```

## O que mudou, e o que NÃO mudou

- **Nenhuma instrução SQL foi reescrita.** Cada migração em `migrations/`
  é uma cópia byte-a-byte do ficheiro original em `_legacy_archive/` —
  verificado programaticamente (0 diferenças). Só o NOME e a PASTA
  mudaram. Isto elimina praticamente todo o risco de eu ter introduzido
  um bug ao "limpar" SQL de outra pessoa.
- **Duas excepções, ambas documentadas no próprio ficheiro:**
  1. `EXECUTAR_promote_admin.sql` foi **dividido**: a parte estrutural
     (função `is_admin_jwt()` + policies) ficou numa migração normal; a
     parte que promovia UMA conta específica (com e-mail pessoal
     gravado no ficheiro) foi movida para `ops/promote_admin.sql`,
     com o e-mail/telemóvel substituídos por um placeholder. Promover um
     admin é uma operação, não uma migração de schema.
  2. `migration_v31_marketing_purchase_attribution.sql` estava **corrompido no export** (100% bytes nulos, não é SQL válido — confirma a suspeita já registada na secção 13 do README principal). Substituído por um placeholder que não faz nada, com instruções para recuperar o schema real via `supabase db pull` contra produção, caso ainda precises da funcionalidade. Não encontrei nenhuma referência a isto no código da app (`api/`, `assets/`), por isso não deve estar a causar problemas visíveis hoje.

## Ordem das migrações "legado" (pré-`v8`)

Os primeiros 13 ficheiros (`schema.sql` até `EXECUTAR_AGORA_completo.sql`)
nunca tiveram numeração de versão — foram ordenados por mim com base no
conteúdo (dependências explícitas mencionadas nos comentários, e a
sequência lógica dos 4 sucessivos fixes ao mesmo bug de recursão de RLS:
`EMERGENCIA_fix_recursion` → `migration_fix_rls_admin` →
`EXECUTAR_promote_admin` → `EXECUTAR_AGORA_completo`, cada um
sobrepondo-se ao anterior de forma idempotente). A partir de `v8`, a
ordem é a própria numeração do ficheiro.

**Isto é uma reconstrução, não uma certeza absoluta** — não tenho acesso
à base de dados de produção real para confirmar a ordem histórica exacta
em que cada ficheiro foi colado no SQL Editor. Onde havia ambiguidade
genuína (duas migrações com o mesmo número, sem dependência declarada
entre elas — `v10`, `v12`, `v29`, `v46`), usei ordem alfabética por não
haver evidência de que a ordem entre esse par específico importe.

**Recomendação forte:** depois de fazeres `supabase db reset` localmente,
corre `supabase db diff` (ou compara manualmente as tabelas) contra o
projecto de produção real. Se houver qualquer diferença, é o sinal mais
fiável de que uma das minhas suposições de ordem estava errada nalgum
ponto — e nesse caso o mais seguro é gerar a verdade a partir da própria
produção com `supabase db pull`, e usar esta reorganização só como o
ponto de partida legível, não como fonte de verdade absoluta.

## Um caso a verificar manualmente: `deduct_credit()`

`migration_fix_credits.sql` (posição 9) remove deliberadamente o `DELETE
FROM auth.users` de dentro de `deduct_credit()`, com o comentário
explícito "a eliminação de contas temp é agora feita no Node.js, mais
fiável". Mas `EXECUTAR_AGORA_completo.sql` (posição 13, mais recente)
**volta a acrescentar** esse `DELETE FROM auth.users` dentro da mesma
função. Preservei a ordem tal como está (o `CREATE OR REPLACE` mais
recente vence, como sempre acontece em produção) — mas isto pode
significar que a intenção arquitectural documentada num comentário já não
reflecte o comportamento real há algum tempo. Vale a pena confirmar no
Supabase Dashboard qual é a definição *actual* de `deduct_credit()` em
produção, e alinhar o comentário (ou o código) com a realidade.

## `seeds/` vs `seed.sql`

O CLI do Supabase só corre automaticamente um ficheiro chamado
`supabase/seed.sql` depois do `db reset`. A maior parte dos dados de
seed reais do MzDocs Pro (templates oficiais, pacotes de créditos,
pacotes de parceiros) já vive dentro das próprias migrações que os
introduziram — decisão deliberada, para não separar dados da versão de
schema que os criou. `seed.sql` fica como o único ponto de entrada,
documentando onde encontrar cada coisa.

## Testes

`supabase/tests/database/00_schema_smoke_test.sql` usa pgTAP para
verificar, depois de um `db reset` do zero, que as estruturas que **já
causaram pelo menos um incidente real em produção** continuam a existir
(colunas de `profiles`, RLS activo, `is_admin_jwt()` sem recursão,
trigger de signup, etc.). Corre com `supabase test db`. Não é uma suite
exaustiva das 81 migrações — é uma rede de segurança mínima focada no
histórico real de problemas, não em cobertura teórica.
