-- ÍNDICES DE ROLL dos snapshots por aluno (Fase 7 do backend-first).
-- Os crons *-roll varrem as linhas mais DEFASADAS para recomputá-las fora do caminho do aluno:
--   painel/home/desempenho/perfil:  .lt('dia', hoje).order('atualizado_em' asc).limit(TETO)
--   cursos (sem coluna `dia`):       .order('atualizado_em' asc).limit(TETO)
-- O índice existente (tenant_id, atualizado_em desc) NÃO serve: o roll não filtra por tenant e ordena ASC.
-- Estes índices servem exatamente o predicado+ordem do roll (e o point-read já é coberto por unique(estudante_id)).
-- Tudo `if not exists` e aditivo → zero risco, idempotente. Ver docs/ARQUITETURA-BACKEND-FIRST.md.

create index if not exists idx_painel_snapshot_roll     on simulado_painel_snapshot     (dia, atualizado_em);
create index if not exists idx_home_snapshot_roll       on simulado_home_snapshot       (dia, atualizado_em);
create index if not exists idx_desempenho_snapshot_roll on simulado_desempenho_snapshot (dia, atualizado_em);
create index if not exists idx_perfil_snapshot_roll     on simulado_perfil_snapshot     (dia, atualizado_em);
-- Cursos não tem `dia` (frescura por tempo) → roll puro por atualizado_em asc.
create index if not exists idx_cursos_snapshot_roll     on simulado_cursos_snapshot     (atualizado_em);

notify pgrst, 'reload schema';
