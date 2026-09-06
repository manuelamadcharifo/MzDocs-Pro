-- supabase/tests/database/00_schema_smoke_test.sql
--
-- NOVO (dívida técnica P2, Set/2026). Corre com: supabase test db
-- (requer a extensão pgTAP — o `supabase start` já a disponibiliza).
--
-- Isto NÃO é uma suite de testes exaustiva de 81 migrações — é um teste
-- de FUMO ("será que o essencial existe depois de um `db reset` do
-- zero?"), focado sobretudo nas coisas que JÁ partiram em produção pelo
-- menos uma vez, a avaliar pelo histórico em supabase/_legacy_archive/
-- (recursão infinita de RLS em profiles, colunas em falta, etc.) — para
-- que a próxima regressão destas seja apanhada aqui, não em produção.

BEGIN;
SELECT plan(23);

-- ── Tabelas essenciais existem ──────────────────────────────────────────
SELECT has_table('public', 'profiles',      'tabela profiles existe');
SELECT has_table('public', 'transactions',  'tabela transactions existe');
SELECT has_table('public', 'partners',      'tabela partners existe');
SELECT has_table('public', 'blog_pages',    'tabela blog_pages existe');

-- ── Colunas críticas de profiles existem (cada uma já foi, no passado,
--    um ficheiro de "EMERGÊNCIA"/"EXECUTAR AGORA" separado) ─────────────
SELECT has_column('public', 'profiles', 'id',            'profiles.id existe');
SELECT has_column('public', 'profiles', 'email',          'profiles.email existe');
SELECT has_column('public', 'profiles', 'phone',          'profiles.phone existe');
SELECT has_column('public', 'profiles', 'credits',        'profiles.credits existe');
SELECT has_column('public', 'profiles', 'is_admin',       'profiles.is_admin existe');
SELECT has_column('public', 'profiles', 'is_blocked',     'profiles.is_blocked existe');
SELECT has_column('public', 'profiles', 'is_temp',        'profiles.is_temp existe');
SELECT has_column('public', 'profiles', 'temp_ref',       'profiles.temp_ref existe');
SELECT has_column('public', 'profiles', 'plan',           'profiles.plan existe');

-- ── RLS está mesmo activo (a causa-raiz de TODOS os incidentes de
--    recursão documentados em EMERGENCIA_fix_recursion.sql) ─────────────
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'RLS está activo em profiles'
);

-- ── Funções críticas existem, com a assinatura esperada ─────────────────
SELECT has_function('public', 'is_admin_jwt', ARRAY[]::text[],
  'is_admin_jwt() existe (leitura do JWT, zero recursão)');
SELECT has_function('public', 'deduct_credit', ARRAY['uuid'],
  'deduct_credit(uuid) existe');
SELECT has_function('public', 'deduct_credits', ARRAY['uuid','integer'],
  'deduct_credits(uuid, integer) existe');
SELECT has_function('public', 'handle_new_user', ARRAY[]::text[],
  'handle_new_user() (trigger de signup) existe');

-- ── is_admin_jwt() nunca deve consultar 'profiles' na sua definição —
--    foi exactamente essa subquery que causou o erro 42P17 (recursão
--    infinita). Este teste falha se alguém a reintroduzir no futuro. ────
SELECT ok(
  position('profiles' in pg_get_functiondef('public.is_admin_jwt()'::regprocedure)) = 0,
  'is_admin_jwt() não faz referência a "profiles" (evita recursão de RLS)'
);

-- ── Trigger de criação de perfil no signup está ligado a auth.users ─────
SELECT has_trigger('auth', 'users', 'on_auth_user_created',
  'trigger on_auth_user_created existe em auth.users');

-- ── Índices únicos que impedem duplicados silenciosos ───────────────────
SELECT has_index('public', 'profiles', 'idx_profiles_email',
  'índice único em profiles.email existe');

-- ── Extensões necessárias estão activas ──────────────────────────────────
SELECT ok(
  (SELECT count(*) FROM pg_extension WHERE extname = 'uuid-ossp') = 1,
  'extensão uuid-ossp está activa'
);

-- ── Um perfil novo, por omissão, começa com 3 créditos grátis (contrato
--    de negócio documentado em vários sítios do código e da app) ────────
SELECT col_default_is('public', 'profiles', 'credits', '3',
  'profiles.credits tem omissão de 3 (créditos grátis no registo)');

SELECT * FROM finish();
ROLLBACK;
