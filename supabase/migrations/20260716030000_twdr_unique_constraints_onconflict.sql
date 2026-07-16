-- O banco twdr (migrado) está SEM várias constraints UNIQUE que o código novo usa em
-- upsert(onConflict) → erro "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Isso quebrava: vincular grupo ao banco (pasta_grupos), salvar respostas de
-- prova (respostas_objetivas — CRÍTICO p/ o aluno fazer prova!), config de integrações, etc.
-- Dados verificados SEM duplicatas. Idempotente: pula constraint/tabela/coluna já existente ou ausente.
DO $$
DECLARE
  cons text[][] := ARRAY[
    ['uq_pasta_grupos','simulado_pasta_grupos','pasta_id, grupo_id'],
    ['uq_resp_obj_sessao_questao','simulado_respostas_objetivas','sessao_id, questao_id'],
    ['uq_resp_disc_sessao_questao','simulado_respostas_discursivas','sessao_id, questao_id'],
    ['uq_tenant_mensagens','simulado_tenant_mensagens','tenant_id, chave'],
    ['uq_curseduca_config_tenant','simulado_curseduca_config','tenant_id'],
    ['uq_integracao_config','simulado_integracao_config','tenant_id, provider'],
    ['uq_integracao_map','simulado_integracao_mapeamentos','tenant_id, provider, fonte_ref'],
    ['uq_integracao_pessoas','simulado_integracao_pessoas','tenant_id, provider, external_id'],
    ['uq_tenant_acessos','simulado_tenant_acessos','user_id, tenant_id'],
    ['uq_caderno_bloco_questoes','simulado_caderno_bloco_questoes','caderno_id, questao_id'],
    ['uq_lgpd_consentimentos','simulado_lgpd_consentimentos','user_id, versao_politica']
  ];
  c text[];
BEGIN
  FOREACH c SLICE 1 IN ARRAY cons LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%s)', c[2], c[1], c[3]);
      RAISE NOTICE 'UNIQUE criada: % em %(%)', c[1], c[2], c[3];
    EXCEPTION
      WHEN duplicate_object THEN RAISE NOTICE 'UNIQUE já existe: %', c[1];
      WHEN undefined_table THEN RAISE NOTICE 'tabela ausente, pulei: %', c[2];
      WHEN undefined_column THEN RAISE NOTICE 'coluna ausente, pulei: %', c[1];
      WHEN unique_violation THEN RAISE NOTICE 'HA DUPLICATAS, nao criou: % (%)', c[1], c[2];
      WHEN others THEN RAISE NOTICE 'pulei % -> %', c[1], SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
