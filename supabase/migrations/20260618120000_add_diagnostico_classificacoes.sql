-- Diagnóstico configurável por classificação
-- Antes: liberação de diagnóstico era fixa para alunos "passaporte".
-- Agora: admin escolhe quais classificações têm acesso e qual mensagem/link
-- aparece para as classificações sem acesso.

ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS diagnostico_classificacoes text[] NOT NULL DEFAULT ARRAY['passaporte']::text[],
  ADD COLUMN IF NOT EXISTS diagnostico_bloqueado_link text
    DEFAULT 'https://links.revisaoensinojuridico.com.br/atend-simulado-agu-diagnostico',
  ADD COLUMN IF NOT EXISTS diagnostico_bloqueado_mensagem text
    DEFAULT 'O diagnóstico detalhado é exclusivo para determinadas classificações. Solicite o seu diagnóstico individual pelo atendimento.';
