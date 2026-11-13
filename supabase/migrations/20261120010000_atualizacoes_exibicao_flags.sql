-- Registro de atualizações: o admin controla o que o ALUNO enxerga (data, hora e rótulo) por registro.
-- Padrão = tudo visível (comportamento anterior preservado). Idempotente. O app tolera a ausência destas colunas
-- (cai num fallback sem elas e avisa no dialog), então esta migração pode ser aplicada antes ou depois do deploy.

alter table public.simulado_conteudo_atualizacoes add column if not exists exibir_data   boolean not null default true;
alter table public.simulado_conteudo_atualizacoes add column if not exists exibir_hora   boolean not null default true;
alter table public.simulado_conteudo_atualizacoes add column if not exists exibir_rotulo boolean not null default true;

comment on column public.simulado_conteudo_atualizacoes.exibir_data   is 'Mostrar a data (BRT de ocorrida_em) ao aluno.';
comment on column public.simulado_conteudo_atualizacoes.exibir_hora   is 'Mostrar a hora (BRT de ocorrida_em) ao aluno; 00:00 nunca é exibida.';
comment on column public.simulado_conteudo_atualizacoes.exibir_rotulo is 'Mostrar o rótulo/tipo ao aluno.';

notify pgrst, 'reload schema';
