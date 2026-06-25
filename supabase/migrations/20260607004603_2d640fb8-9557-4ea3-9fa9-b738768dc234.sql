
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'reportar_erro';
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'duplicada';
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'desatualizada';
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'gabarito_incorreto';
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'enunciado_confuso';
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'alternativa_incorreta';
ALTER TYPE public.feedback_tipo ADD VALUE IF NOT EXISTS 'comentario_incorreto';

ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS mostrar_feedbacks boolean NOT NULL DEFAULT true;
