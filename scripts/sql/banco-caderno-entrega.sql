-- Montagem/entrega do Caderno (teste) por banco: qual peça (grupo do editor) ou PDF vai em cada
-- slot (diagnóstico / folha de resposta / caderno de enunciado / gabarito comentado).
alter table public.simulado_pastas add column if not exists caderno_entrega jsonb;
