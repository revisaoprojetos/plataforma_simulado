-- FORMATO DE EXIBIÇÃO do conteúdo (currículo "Netflix") do produto/extensivo, por produto.
-- vitrine_layout ∈ netflix (carrosséis, atual) | grade (cards) | trilha (jornada) | lista (acordeão).
-- Leitura tolerante no código: sem a coluna, tudo cai no 'netflix' (nada muda pro aluno).
-- Aplicar manualmente (SQL editor). Inclui NOTIFY pgrst.

alter table public.simulado_produtos
  add column if not exists vitrine_layout text not null default 'netflix';

alter table public.simulado_produtos
  drop constraint if exists simulado_produtos_vitrine_layout_chk;
alter table public.simulado_produtos
  add constraint simulado_produtos_vitrine_layout_chk
  check (vitrine_layout in ('netflix','grade','trilha','lista'));

notify pgrst, 'reload schema';
