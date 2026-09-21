-- Agrupamento AUTOMÁTICO por nome na sincronização da Curseduca.
-- Com `agrupar_por_nome=true`, o cron passa a VINCULAR cada canal da Curseduca ao grupo do sistema
-- de MESMO NOME (como o "Sincronizar agora"), em lotes por tick — em vez de só importar os cadastros
-- (destino='nenhum'). `sync_cursor` guarda por onde parou (round-robin) p/ cada tick ser curto.
ALTER TABLE simulado_curseduca_sync ADD COLUMN IF NOT EXISTS agrupar_por_nome boolean NOT NULL DEFAULT false;
ALTER TABLE simulado_curseduca_sync ADD COLUMN IF NOT EXISTS sync_cursor integer NOT NULL DEFAULT 0;
