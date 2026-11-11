-- BIBLIOTECA > QUESTOES > CLASSIFICACAO: indices para as sugestoes em lote (consulta unica por pagina da fila).
--  * (tenant_id, md5(btrim(enunciado))): acha a "mesma questao" (enunciado identico) sem varrer todos os enunciados.
--  * (tenant_id, lower(btrim(assunto_detalhe))): pares pelo mesmo assunto especifico (so questoes ja com disciplina).
--  * (tenant_id, external_id): mesmo codigo de origem.
-- Idempotente. NAO aplicado automaticamente; o codigo funciona sem eles (so mais devagar).
create index if not exists idx_questoes_tenant_md5_enun on simulado_questoes (tenant_id, md5(btrim(enunciado))) where deletado = false;
create index if not exists idx_questoes_tenant_assunto_det on simulado_questoes (tenant_id, lower(btrim(assunto_detalhe))) where deletado = false and disciplina_id is not null and assunto_detalhe is not null;
create index if not exists idx_questoes_tenant_external on simulado_questoes (tenant_id, external_id) where external_id is not null;
