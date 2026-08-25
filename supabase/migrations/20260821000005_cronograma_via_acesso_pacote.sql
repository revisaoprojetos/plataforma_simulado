-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — `via_acesso` aceita 'pacote'
--
-- Nenhuma emissão estava sendo salva. O aluno gerava, via a grade, e o registro não
-- existia: a tabela ficou com ZERO linhas mesmo depois de gerações bem-sucedidas.
--
-- A causa: quando os pacotes passaram a ser a forma de liberar, `verificarAcessoCronograma`
-- passou a devolver via='pacote' — mas o CHECK desta coluna nasceu com a lista antiga
-- ('matricula','avulso','gratuito','testador','equipe'). Todo INSERT de aluno que recebe
-- por pacote — ou seja, praticamente todos — era recusado com 23514.
--
-- O erro não aparecia em lugar nenhum porque o INSERT está num try/catch: o cliente do
-- Supabase NÃO lança, devolve { data: null, error }, então o catch nunca rodava e o
-- `error` não era lido. A geração seguia como se tivesse dado certo.
--
-- Aqui a lista passa a incluir 'pacote'. Os valores antigos continuam aceitos: 'gratuito'
-- some das emissões NOVAS (a liberação para todos virou do pacote), mas linhas históricas
-- de outro ambiente não podem ser invalidadas por uma migração.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_cronograma_emissoes
  DROP CONSTRAINT IF EXISTS simulado_cronograma_emissoes_via_acesso_check;

ALTER TABLE public.simulado_cronograma_emissoes
  ADD CONSTRAINT simulado_cronograma_emissoes_via_acesso_check
  CHECK (via_acesso IN ('matricula','avulso','pacote','gratuito','testador','equipe'));

COMMENT ON COLUMN public.simulado_cronograma_emissoes.via_acesso IS
  'Por onde o aluno tinha acesso no momento da emissão. Espelha ViaAcesso de lib/cronograma/acesso.ts — mexer lá exige mexer neste CHECK.';

NOTIFY pgrst, 'reload schema';
