-- Biblioteca de Conteúdos — Fase 2 (sidebar do documento): permissões do aluno por documento,
-- janelas de liberação + "pode baixar" por atribuição (grupo/aluno), e vínculo CONTEÚDO↔CONTEÚDO
-- que aparece pro aluno ao lado do texto no leitor. Tudo aditivo (defaults preservam o comportamento).

-- 1) "O que o aluno pode fazer" por DOCUMENTO (toggles da aba Detalhes) + janela de liberação global.
--    Defaults = mockup: ler na plataforma / baixar / grifar / marca d'água ligados; imprimir desligado.
ALTER TABLE public.simulado_conteudo_documentos
  ADD COLUMN IF NOT EXISTS pode_ler_plataforma boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pode_baixar         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pode_grifar         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marca_dagua         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pode_imprimir       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liberado_de         timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_ate        timestamptz;

-- 2) Por ATRIBUIÇÃO (as 4 tabelas pasta/doc × grupos/estudantes): "Ler + baixar" x "Só leitura"
--    (pode_baixar) e janela de liberação específica daquele grupo/aluno (liberado_de/ate).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_pasta_grupos','simulado_pasta_estudantes',
    'simulado_conteudo_documento_grupos','simulado_conteudo_documento_estudantes'
  ] LOOP
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pode_baixar boolean NOT NULL DEFAULT true$f$, t);
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS liberado_de timestamptz$f$, t);
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS liberado_ate timestamptz$f$, t);
  END LOOP;
END $$;

-- 3) Vínculo CONTEÚDO↔CONTEÚDO (aparece pro aluno no leitor, ao lado do texto). Diferente de
--    simulado_conteudo_vinculos (doc→PRODUTO): aqui o documento "dono" aponta para outro conteúdo /
--    desafio / trilha, com um rótulo, uma âncora textual (ex.: "a partir de 08:20", "arts. 184–186")
--    e um modo de liberação ('sempre' | 'ao_concluir' = libera ao concluir a leitura).
CREATE TABLE IF NOT EXISTS public.simulado_conteudo_vinculos_leitor (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_conteudo_documentos(id) ON DELETE CASCADE,
  alvo_tipo    text NOT NULL CHECK (alvo_tipo IN ('conteudo','desafio','trilha','videoaula','externo')),
  alvo_ref_id  uuid,                 -- id do conteúdo/desafio/trilha (null quando alvo_tipo='externo')
  rotulo       text NOT NULL,        -- texto exibido (ex.: "Videoaula — Reforma agrária na CF/88")
  detalhe      text,                 -- âncora/descrição (ex.: "a partir de 08:20 · arts. 184 a 186")
  url          text,                 -- usado quando alvo_tipo='externo'
  modo         text NOT NULL DEFAULT 'sempre' CHECK (modo IN ('sempre','ao_concluir')),
  ordem        int  NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conteudo_vinc_leitor_doc ON public.simulado_conteudo_vinculos_leitor(documento_id, ordem);

-- RLS por tenant (mesmo padrão simulado_*)
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.simulado_conteudo_vinculos_leitor ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation_simulado_conteudo_vinculos_leitor" ON public.simulado_conteudo_vinculos_leitor';
  EXECUTE 'CREATE POLICY "tenant_isolation_simulado_conteudo_vinculos_leitor" ON public.simulado_conteudo_vinculos_leitor FOR ALL TO authenticated
    USING (tenant_id IN (SELECT public.user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))';
  EXECUTE 'GRANT ALL ON public.simulado_conteudo_vinculos_leitor TO authenticated';
  EXECUTE 'GRANT ALL ON public.simulado_conteudo_vinculos_leitor TO service_role';
END $$;

NOTIFY pgrst, 'reload schema';
