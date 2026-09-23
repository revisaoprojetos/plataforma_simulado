-- E3 (impersonation) — blocklist de rotas sensíveis (brief seção 2/4). Tabela GLOBAL (config de
-- sistema, não por tenant). ATENÇÃO: o middleware roda no Edge e NÃO consulta o banco em runtime —
-- a fonte de verdade em runtime é lib/impersonation/blocked-routes.ts; esta tabela espelha a lista
-- p/ visibilidade/painel/contrato (teste 7.2). Mantê-las em sincronia ao adicionar rota sensível.
create table if not exists simulado_impersonation_blocked_routes (
  id           uuid primary key default gen_random_uuid(),
  method       varchar(10) not null,          -- '*' = qualquer método
  path_pattern varchar(255) not null,         -- ex.: '/api/aluno/*', '/aluno/simulado/*'
  reason       text not null,
  criado_em    timestamptz not null default now(),
  unique (method, path_pattern)
);

-- Seed: mutações perigosas do aluno (nota/ranking/XP/perfil/LGPD) + runner de simulado.
-- No MVP (read_only) o middleware já bloqueia TODO não-GET; esta lista serve p/ read_and_act futuro
-- e p/ o teste de contrato front×back.
insert into simulado_impersonation_blocked_routes (method, path_pattern, reason) values
  ('POST',   '/api/aluno/*',      'Mutações do aluno (nota, ranking, XP, perfil, LGPD) durante a visualização.'),
  ('PUT',    '/api/aluno/*',      'Mutações do aluno durante a visualização.'),
  ('PATCH',  '/api/aluno/*',      'Mutações do aluno durante a visualização.'),
  ('DELETE', '/api/aluno/*',      'Mutações do aluno durante a visualização.'),
  ('*',      '/aluno/simulado/*', 'Responder/enviar simulado como o aluno corromperia tentativas, nota e ranking.'),
  ('*',      '/simulado/*',       'Runner de simulado por token.'),
  ('*',      '/embed/*',          'Área embedável de resposta do aluno.')
on conflict (method, path_pattern) do nothing;
