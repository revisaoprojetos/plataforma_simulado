-- Banners e pop-ups do PORTAL DO ALUNO, por tenant. Editáveis no admin/console e exibidos no portal.
CREATE TABLE IF NOT EXISTS public.simulado_banners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  tipo          text NOT NULL DEFAULT 'banner',  -- 'banner' (faixa) | 'popup' (modal 1x)
  titulo        text,
  mensagem      text,
  imagem_url    text,
  link          text,
  cor           text,
  ativo         boolean NOT NULL DEFAULT true,
  ordem         int NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banners_tenant ON public.simulado_banners (tenant_id, ativo, ordem);
ALTER TABLE public.simulado_banners ENABLE ROW LEVEL SECURITY;
