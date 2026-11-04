-- Formato "Trilha com imagem" (trilha_imagem) além da "Trilha simples" (trilha).
-- Alarga a constraint criada em 20261104000000_produto_vitrine_layout.sql. Idempotente.
-- Aplicar manualmente (SQL editor). Inclui NOTIFY pgrst.

alter table public.simulado_produtos
  drop constraint if exists simulado_produtos_vitrine_layout_chk;
alter table public.simulado_produtos
  add constraint simulado_produtos_vitrine_layout_chk
  check (vitrine_layout in ('netflix','grade','trilha','trilha_imagem','lista'));

notify pgrst, 'reload schema';
