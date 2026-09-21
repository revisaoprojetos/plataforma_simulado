-- Descoberta AUTOMÁTICA de canais na sincronização da Curseduca.
-- Com `descobrir_canais=true` (e `agrupar_por_nome=true`), o cron deixa de usar apenas a lista manual
-- em `grupos` e passa a considerar TODOS os canais existentes na Curseduca: os que tiverem grupo de
-- mesmo id (codigo_externo) ou nome no sistema entram; o resto é reportado como `sem_grupo`. Assim um
-- canal novo passa a sincronizar sozinho, sem precisar editar a lista na tela. Default false = comportamento atual.
ALTER TABLE simulado_curseduca_sync ADD COLUMN IF NOT EXISTS descobrir_canais boolean NOT NULL DEFAULT false;
