-- Remove os alunos criados pelo teste de carga e todo o histórico deles (cascata).
--   docker exec -i gerenciador_video-postgres-1 psql -U video -d video < load/cleanup.sql
DELETE FROM users WHERE email LIKE 'load-%@empresa-a.local';
