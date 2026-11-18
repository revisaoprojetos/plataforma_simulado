-- Idempotência da criação de grifos do leitor: o cliente envia um client id (cid) em cada POST.
-- Retry/reenvio com o mesmo cid devolve a MESMA linha (sem duplicar). O código funciona sem esta migração
-- (detecta a ausência da coluna e cai no comportamento antigo).
alter table public.simulado_leitura_anotacoes
  add column if not exists client_id text;

create unique index if not exists simulado_leitura_anotacoes_estudante_client_id_uq
  on public.simulado_leitura_anotacoes (estudante_id, client_id)
  where client_id is not null;
