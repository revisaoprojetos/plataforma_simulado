-- Adiciona as FKs que o PostgREST precisa para os EMBEDS (select "disciplinas:simulado_disciplinas(nome)" etc.)
-- No banco twdr (migrado) essas FKs não existiam → embeds falhavam com PGRST200 e as telas (Questões,
-- perfil do estudante, relatórios, ranking) vinham VAZIAS. Dados já verificados sem órfãos.
-- Idempotente: pula constraint que já existe ou tabela/coluna ausente (RAISE NOTICE).
DO $$
DECLARE
  fks text[][] := ARRAY[
    ['fk_q_disciplina','simulado_questoes','disciplina_id','simulado_disciplinas'],
    ['fk_q_banca','simulado_questoes','banca_id','simulado_bancas'],
    ['fk_q_assunto','simulado_questoes','assunto_id','simulado_assuntos'],
    ['fk_q_orgao','simulado_questoes','orgao_id','simulado_orgaos'],
    ['fk_alt_questao','simulado_alternativas','questao_id','simulado_questoes'],
    ['fk_sess_simulado','simulado_sessoes_prova','simulado_id','simulado_simulados'],
    ['fk_sess_estudante','simulado_sessoes_prova','estudante_id','simulado_estudantes'],
    ['fk_resp_questao','simulado_respostas_objetivas','questao_id','simulado_questoes'],
    ['fk_resp_sessao','simulado_respostas_objetivas','sessao_id','simulado_sessoes_prova'],
    ['fk_resp_alt','simulado_respostas_objetivas','alternativa_id','simulado_alternativas'],
    ['fk_pq_questao','simulado_prova_questoes','questao_id','simulado_questoes'],
    ['fk_pq_simulado','simulado_prova_questoes','simulado_id','simulado_simulados']
  ];
  f text[];
BEGIN
  FOREACH f SLICE 1 IN ARRAY fks LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) NOT VALID',
        f[2], f[1], f[3], f[4]);
      RAISE NOTICE 'FK criada: % (%.%)', f[1], f[2], f[3];
    EXCEPTION
      WHEN duplicate_object THEN RAISE NOTICE 'FK já existe: %', f[1];
      WHEN undefined_table THEN RAISE NOTICE 'tabela ausente, pulei: %', f[1];
      WHEN undefined_column THEN RAISE NOTICE 'coluna ausente, pulei: %', f[1];
      WHEN others THEN RAISE NOTICE 'pulei % -> %', f[1], SQLERRM;
    END;
  END LOOP;
END $$;

-- Recarrega o cache de schema do PostgREST para os embeds passarem a funcionar na hora.
NOTIFY pgrst, 'reload schema';
