-- FORMATO da PÁGINA DO MÓDULO do extensivo (aluno), por produto.
-- modulo_layout ∈ cards_lista (padrão: cards por tipo + lista) | colunas (uma coluna por tipo) | abas (abas por tipo).
-- Leitura/gravação TOLERANTES no código: sem a coluna, tudo cai em 'cards_lista' (nada quebra).
-- Aplicar com `pnpm migracoes aplicar`. Idempotente. Inclui NOTIFY pgrst.

alter table public.simulado_produtos
  add column if not exists modulo_layout text not null default 'cards_lista';

alter table public.simulado_produtos
  drop constraint if exists simulado_produtos_modulo_layout_chk;
alter table public.simulado_produtos
  add constraint simulado_produtos_modulo_layout_chk
  check (modulo_layout in ('cards_lista','colunas','abas'));

notify pgrst, 'reload schema';
