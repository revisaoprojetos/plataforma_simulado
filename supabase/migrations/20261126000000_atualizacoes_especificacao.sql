-- CENTRAL DE ATUALIZAÇÕES — especificação de cada atualização + "quem registrou". ADITIVA e IDEMPOTENTE.
-- NÃO aplicar automaticamente: revisar e rodar no SQL Editor (termina com NOTIFY pgrst).
-- A tabela já tem RLS (20261112010000); nada de política nova. O código tolera a ausência destas colunas.
--
--   fonte_origem       lei/julgado de origem (texto livre, ex.: "Lei 15.000/2026" / "STF, RE 1.234.567")
--   fonte_url          link opcional da fonte (http/https)
--   trecho_afetado     artigos/páginas afetados (texto livre, ex.: "arts. 5º e 37; pp. 12-14")
--   avisar_ja_baixou   intenção de avisar quem JÁ baixou o material (apenas registro; sem envio novo)
--   registrado_por     usuário (auth.users.id) que registrou — filtro "quem registrou" do Histórico

alter table public.simulado_conteudo_atualizacoes add column if not exists fonte_origem     text;
alter table public.simulado_conteudo_atualizacoes add column if not exists fonte_url        text;
alter table public.simulado_conteudo_atualizacoes add column if not exists trecho_afetado   text;
alter table public.simulado_conteudo_atualizacoes add column if not exists avisar_ja_baixou boolean not null default false;
alter table public.simulado_conteudo_atualizacoes add column if not exists registrado_por   uuid;

create index if not exists idx_cont_atualiz_registrado_por
  on public.simulado_conteudo_atualizacoes (tenant_id, registrado_por, ocorrida_em desc) where registrado_por is not null;

notify pgrst, 'reload schema';
