-- ============================================================
-- MIGRAÇÃO v10 — Adicionar user_id a online_sessions
--               + Activar Realtime na tabela
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar coluna user_id (nullable — visitantes anónimos não têm)
ALTER TABLE online_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Índice para consultar quem está online rapidamente
CREATE INDEX IF NOT EXISTS idx_online_sessions_user ON online_sessions(user_id)
  WHERE user_id IS NOT NULL;

-- 3. Activar Realtime na tabela online_sessions
-- (necessário para o painel admin receber actualizações em tempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE online_sessions;

-- 4. Confirmar
SELECT 'Migração v10 concluída — online_sessions tem user_id e Realtime activo' AS status;
