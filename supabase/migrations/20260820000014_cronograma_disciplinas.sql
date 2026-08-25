-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — reusa o cadastro de disciplinas dos simulados
--
-- `disciplina` era texto livre nas metas e nos links de aula. A própria
-- especificação relata o estrago que isso causa: os dados de origem já tiveram
-- "Consitucional", "Direito Intrenacional" e "Prev. Púb.", corrigidos em tempo
-- de exibição — e o casamento (disciplina, aula) com os links é EXATO, então
-- cada variação de grafia derruba os links daquela aula.
--
-- A plataforma já tem `simulado_disciplinas`, usado por banco de questões e
-- cadernos. Reusar em vez de criar outro cadastro dá um vocabulário só para o
-- produto inteiro.
--
-- Efeito colateral valioso: a chave dos links passa a ser (disciplina_id, aula),
-- então grafia deixa de importar — o risco nº 2 do módulo desaparece na origem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Referência nas metas e nos links. Fica NULLABLE: `Atividade` (R13) não é
-- disciplina, e metas dela continuam sem referência.
ALTER TABLE public.simulado_cronograma_metas
  ADD COLUMN IF NOT EXISTS disciplina_id uuid REFERENCES public.simulado_disciplinas(id) ON DELETE SET NULL;

ALTER TABLE public.simulado_cronograma_links
  ADD COLUMN IF NOT EXISTS disciplina_id uuid REFERENCES public.simulado_disciplinas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cron_metas_disciplina
  ON public.simulado_cronograma_metas (tenant_id, disciplina_id) WHERE disciplina_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Casa o texto existente com o cadastro, sem diferenciar caixa nem acento — é o
-- ponto do exercício: "Consitucional" não casa, e é isso que queremos descobrir.
UPDATE public.simulado_cronograma_metas m
SET disciplina_id = d.id
FROM public.simulado_disciplinas d
WHERE d.tenant_id = m.tenant_id
  AND public.simulado_cronograma_slugificar(d.nome) = public.simulado_cronograma_slugificar(m.disciplina)
  AND m.disciplina_id IS NULL;

UPDATE public.simulado_cronograma_links l
SET disciplina_id = d.id
FROM public.simulado_disciplinas d
WHERE d.tenant_id = l.tenant_id
  AND public.simulado_cronograma_slugificar(d.nome) = public.simulado_cronograma_slugificar(l.disciplina)
  AND l.disciplina_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- A coluna de TEXTO permanece, de propósito — e esta é a diferença em relação a
-- categoria e tipo, onde ela foi removida:
--
--   · `Atividade` (R13) é um pseudo-valor que não existe no cadastro de
--     disciplinas e não deveria poluí-lo;
--   · a importação traz o nome em texto, e guardar o que veio no arquivo mantém
--     rastro do que a origem dizia quando o casamento falha;
--   · o motor exibe `disciplina` (texto) — remover exigiria join em toda leitura
--     de 16.697 metas, para ganhar nada na tela.
--
-- O texto vira, então, o rótulo de exibição; `disciplina_id` é a CHAVE. Quando os
-- dois existem, o id manda.
--
-- A tela mostra quais metas não casaram com o cadastro, para a equipe corrigir a
-- grafia ou cadastrar a disciplina que falta.

NOTIFY pgrst, 'reload schema';
