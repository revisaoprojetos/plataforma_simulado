-- Reducao de CPU: pagamentosAlunoSql (engajamento-geral.ts) filtrava payload jsonb por e-mail/CPF sem indice
-- (593 ms medio). Indices de expressao identicos aos usados na query. Idempotente, sem CONCURRENTLY.
CREATE INDEX IF NOT EXISTS ix_integracao_eventos_tenant_contact_email
  ON public.simulado_integracao_eventos (tenant_id, (lower(payload->'contact'->>'email')))
  WHERE payload->'contact' IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_integracao_eventos_tenant_contact_doc
  ON public.simulado_integracao_eventos (tenant_id, (regexp_replace(COALESCE(payload->'contact'->>'doc', ''), '\D', '', 'g')))
  WHERE payload->'contact' IS NOT NULL;

NOTIFY pgrst, 'reload schema';
