# supabase/seeds/

Esta pasta existe para organizar dados de seed em vários ficheiros, se um
dia isso vier a ser necessário — mas o Supabase CLI só corre automaticamente
`supabase/seed.sql` depois de `supabase db reset`.

Para os dados de seed reais do MzDocs Pro (templates oficiais, pacotes de
créditos, pacotes de parceiros), ver o comentário no topo de
`supabase/seed.sql` — vivem dentro das próprias migrações que os
introduziram, não aqui.

Se no futuro precisares de vários ficheiros de seed organizados, cria-os
aqui (ex.: `seeds/01_templates_extra.sql`) e inclui-os a partir de
`supabase/seed.sql` com `\i seeds/01_templates_extra.sql`.

