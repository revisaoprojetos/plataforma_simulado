
-- Remove duplicatas pré-existentes mantendo o vínculo mais antigo
DELETE FROM public.questao_simulado a
USING public.questao_simulado b
WHERE a.ctid > b.ctid
  AND a.simulado_id = b.simulado_id
  AND a.questao_id = b.questao_id;

ALTER TABLE public.questao_simulado
  ADD CONSTRAINT questao_simulado_unique_par UNIQUE (simulado_id, questao_id);

ALTER TABLE public.questao_simulado
  ADD CONSTRAINT questao_simulado_peso_positivo CHECK (peso > 0);

ALTER TABLE public.questao_simulado
  ADD CONSTRAINT questao_simulado_ordem_positiva CHECK (ordem > 0);
