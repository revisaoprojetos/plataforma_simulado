-- ═══════════════════════════════════════════════════════════════════════════
-- DISCIPLINAS — classificação + cor (regulável no admin, visível no banco)
--
-- O Cronograma Adaptativo agrupa disciplinas em "essenciais / complementares /
-- específicas" (até aqui hard-coded por NOME em lib/cronograma/adaptativo/conteudo.ts).
-- Esta migração move isso para o banco: cada disciplina ganha `classificacao` e `cor`,
-- editáveis no painel. Backfill aplica a classificação conhecida pelos nomes atuais.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_disciplinas
  ADD COLUMN IF NOT EXISTS classificacao text,
  ADD COLUMN IF NOT EXISTS cor text;

-- Valor sugerido (sem CHECK rígido: o tenant pode criar outras classificações).
-- Convenção: 'essencial' | 'complementar' | 'especifica'.

-- Backfill por NOME (case-insensitive), todos os tenants.
UPDATE public.simulado_disciplinas SET classificacao = 'essencial'
 WHERE classificacao IS NULL AND lower(nome) = ANY (ARRAY[
   'direito administrativo','direito constitucional','direito civil','direito financeiro',
   'processo civil','direito tributário','direito ambiental','direito do trabalho','processo do trabalho'
 ]);

UPDATE public.simulado_disciplinas SET classificacao = 'complementar'
 WHERE classificacao IS NULL AND lower(nome) = ANY (ARRAY[
   'direito agrário','direito do consumidor','direito econômico','direito empresarial',
   'direito penal','processo penal','legislação penal especial','direito previdenciário',
   'direito previdenciário público','direito urbanístico'
 ]);

UPDATE public.simulado_disciplinas SET classificacao = 'especifica'
 WHERE classificacao IS NULL AND lower(nome) = ANY (ARRAY[
   'direito eleitoral','direito internacional','direito internacional privado',
   'legislação de ensino','legislação da agu'
 ]);

-- Cores conhecidas (hex do modelo) por nome, onde ainda não houver cor.
UPDATE public.simulado_disciplinas d SET cor = c.cor FROM (VALUES
  ('direito administrativo','#2f6fe0'),('direito agrário','#2f9e4f'),('direito ambiental','#1f7a44'),
  ('direito civil','#7c4ae0'),('direito econômico','#c27c0e'),('direito empresarial','#0f84b8'),
  ('direito financeiro','#13958a'),('direito penal','#c4264f'),('direito previdenciário','#6a9a18'),
  ('direito previdenciário público','#4c7316'),('direito tributário','#b5651d'),('direito urbanístico','#3b5f9a'),
  ('direito do consumidor','#d23f8a'),('direito do trabalho','#8a4fd8'),('legislação penal especial','#b52c2c'),
  ('processo civil','#3d57d8'),('processo penal','#a3264a'),('processo do trabalho','#6c3fc4'),
  ('direito eleitoral','#a8552b'),('direito internacional','#2a5c9e'),('direito internacional privado','#3d72b8'),
  ('legislação de ensino','#6b4fa8'),('legislação da agu','#9c3a6f'),('direito constitucional','#5e3ab8')
) AS c(nome, cor)
 WHERE d.cor IS NULL AND lower(d.nome) = c.nome;

CREATE INDEX IF NOT EXISTS idx_disciplinas_classificacao
  ON public.simulado_disciplinas (tenant_id, classificacao);

NOTIFY pgrst, 'reload schema';
