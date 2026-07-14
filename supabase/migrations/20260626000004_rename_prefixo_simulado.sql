-- Renomeia as tabelas do app (sem prefixo) para o namespace simulado_*.
-- - NÃO toca em mentoria_* nem em nada do outro produto.
-- - Remove os esqueletos simulado_* VAZIOS que colidem com os nomes-alvo.
-- - Preserva os dados (rename mantém FKs/triggers/políticas por OID).
-- - Recria user_tenant_ids() (única função que referencia minhas tabelas por nome).

BEGIN;

-- 0) Tira minha tabela de junção (hoje 'simulado_questoes') do caminho,
--    liberando o nome 'simulado_questoes' para a tabela de QUESTÕES.
ALTER TABLE IF EXISTS public.simulado_questoes RENAME TO simulado_prova_questoes;

-- 1) Para cada tabela minha: remove o esqueleto vazio homônimo e renomeia a minha.
DROP TABLE IF EXISTS public.simulado_tenants CASCADE;
ALTER TABLE IF EXISTS public.tenants RENAME TO simulado_tenants;

DROP TABLE IF EXISTS public.simulado_tenant_acessos CASCADE;
ALTER TABLE IF EXISTS public.tenant_acessos RENAME TO simulado_tenant_acessos;

DROP TABLE IF EXISTS public.simulado_roles CASCADE;
ALTER TABLE IF EXISTS public.roles RENAME TO simulado_roles;

DROP TABLE IF EXISTS public.simulado_permissions CASCADE;
ALTER TABLE IF EXISTS public.permissions RENAME TO simulado_permissions;

DROP TABLE IF EXISTS public.simulado_role_permissions CASCADE;
ALTER TABLE IF EXISTS public.role_permissions RENAME TO simulado_role_permissions;

DROP TABLE IF EXISTS public.simulado_user_roles CASCADE;
ALTER TABLE IF EXISTS public.user_roles RENAME TO simulado_user_roles;

DROP TABLE IF EXISTS public.simulado_estudantes CASCADE;
ALTER TABLE IF EXISTS public.estudantes RENAME TO simulado_estudantes;

DROP TABLE IF EXISTS public.simulado_matriculas CASCADE;
ALTER TABLE IF EXISTS public.matriculas RENAME TO simulado_matriculas;

DROP TABLE IF EXISTS public.simulado_bancas CASCADE;
ALTER TABLE IF EXISTS public.bancas RENAME TO simulado_bancas;

DROP TABLE IF EXISTS public.simulado_orgaos CASCADE;
ALTER TABLE IF EXISTS public.orgaos RENAME TO simulado_orgaos;

DROP TABLE IF EXISTS public.simulado_cargos CASCADE;
ALTER TABLE IF EXISTS public.cargos RENAME TO simulado_cargos;

DROP TABLE IF EXISTS public.simulado_disciplinas CASCADE;
ALTER TABLE IF EXISTS public.disciplinas RENAME TO simulado_disciplinas;

DROP TABLE IF EXISTS public.simulado_assuntos CASCADE;
ALTER TABLE IF EXISTS public.assuntos RENAME TO simulado_assuntos;

DROP TABLE IF EXISTS public.simulado_etiquetas CASCADE;
ALTER TABLE IF EXISTS public.etiquetas RENAME TO simulado_etiquetas;

DROP TABLE IF EXISTS public.simulado_pastas CASCADE;
ALTER TABLE IF EXISTS public.pastas RENAME TO simulado_pastas;

DROP TABLE IF EXISTS public.simulado_alternativas CASCADE;
ALTER TABLE IF EXISTS public.alternativas RENAME TO simulado_alternativas;

DROP TABLE IF EXISTS public.simulado_questao_cargos CASCADE;
ALTER TABLE IF EXISTS public.questao_cargos RENAME TO simulado_questao_cargos;

DROP TABLE IF EXISTS public.simulado_questao_etiquetas CASCADE;
ALTER TABLE IF EXISTS public.questao_etiquetas RENAME TO simulado_questao_etiquetas;

DROP TABLE IF EXISTS public.simulado_questao_pasta CASCADE;
ALTER TABLE IF EXISTS public.questao_pasta RENAME TO simulado_questao_pasta;

DROP TABLE IF EXISTS public.simulado_simulados CASCADE;
ALTER TABLE IF EXISTS public.simulados RENAME TO simulado_simulados;

DROP TABLE IF EXISTS public.simulado_sessoes_prova CASCADE;
ALTER TABLE IF EXISTS public.sessoes_prova RENAME TO simulado_sessoes_prova;

DROP TABLE IF EXISTS public.simulado_sessao_questao_ordem CASCADE;
ALTER TABLE IF EXISTS public.sessao_questao_ordem RENAME TO simulado_sessao_questao_ordem;

DROP TABLE IF EXISTS public.simulado_sessao_eventos CASCADE;
ALTER TABLE IF EXISTS public.sessao_eventos RENAME TO simulado_sessao_eventos;

DROP TABLE IF EXISTS public.simulado_respostas_objetivas CASCADE;
ALTER TABLE IF EXISTS public.respostas_objetivas RENAME TO simulado_respostas_objetivas;

DROP TABLE IF EXISTS public.simulado_tenant_mensagens CASCADE;
ALTER TABLE IF EXISTS public.tenant_mensagens RENAME TO simulado_tenant_mensagens;

DROP TABLE IF EXISTS public.simulado_tenant_contatos CASCADE;
ALTER TABLE IF EXISTS public.tenant_contatos RENAME TO simulado_tenant_contatos;

DROP TABLE IF EXISTS public.simulado_embed_config CASCADE;
ALTER TABLE IF EXISTS public.embed_config RENAME TO simulado_embed_config;

-- 2) Por último, a tabela de QUESTÕES ocupa o nome liberado em (0).
ALTER TABLE IF EXISTS public.questoes RENAME TO simulado_questoes;

-- 3) Recria a única função que referencia minha tabela pelo nome.
CREATE OR REPLACE FUNCTION public.user_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true
$function$;

COMMIT;
