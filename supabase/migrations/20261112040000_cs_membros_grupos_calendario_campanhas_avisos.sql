-- ─────────────────────────────────────────────────────────────────────────────
-- CS (Plataforma Revisão): Membros · Grupos de acesso · Calendário de eventos · Disparo de Campanha · Avisos.
-- Aditiva e idempotente. NÃO aplicar automaticamente: rodar no SQL Editor + `NOTIFY pgrst, 'reload schema';`.
-- Padrão do projeto: RLS por simulado_tenant_acessos (o app usa service role, que bypassa).
-- ─────────────────────────────────────────────────────────────────────────────

-- A) MEMBROS: bloqueio de acesso + último acesso denormalizado ----------------------------------
-- `acesso_bloqueado`: bloqueia o login do aluno (progresso fica guardado). Lido em /api/aluno/login.
-- `ultimo_acesso_em`: carimbado no login (evita varrer simulado_audit_logs para listar/filtrar 20 mil alunos).
ALTER TABLE public.simulado_estudantes ADD COLUMN IF NOT EXISTS acesso_bloqueado boolean NOT NULL DEFAULT false;
ALTER TABLE public.simulado_estudantes ADD COLUMN IF NOT EXISTS bloqueado_em timestamptz;
ALTER TABLE public.simulado_estudantes ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_estudantes_ultimo_acesso ON public.simulado_estudantes (tenant_id, ultimo_acesso_em) WHERE deletado = false;
CREATE INDEX IF NOT EXISTS idx_estudantes_bloqueado ON public.simulado_estudantes (tenant_id) WHERE acesso_bloqueado = true AND deletado = false;

-- Backfill do último acesso a partir da auditoria de login do portal (uma vez).
UPDATE public.simulado_estudantes e
   SET ultimo_acesso_em = l.ult
  FROM (
    SELECT entidade_id, max(criado_em) AS ult
      FROM public.simulado_audit_logs
     WHERE entidade = 'aluno_portal' AND operacao = 'LOGIN' AND entidade_id IS NOT NULL
     GROUP BY entidade_id
  ) l
 WHERE e.id = l.entidade_id AND e.ultimo_acesso_em IS NULL;

-- B) GRUPOS: política de validade padrão do grupo (o vínculo por membro continua em simulado_grupo_membros.expira_em)
ALTER TABLE public.simulado_grupos ADD COLUMN IF NOT EXISTS validade_tipo text;      -- meses_apos_compra | ate_data | vitalicio (NULL = definido por membro)
ALTER TABLE public.simulado_grupos ADD COLUMN IF NOT EXISTS validade_meses integer;  -- quando meses_apos_compra
ALTER TABLE public.simulado_grupos ADD COLUMN IF NOT EXISTS validade_ate date;       -- quando ate_data

-- C) CALENDÁRIO DE EVENTOS (aparece no calendário do Início de quem está no grupo) -----------------
CREATE TABLE IF NOT EXISTS public.simulado_eventos_calendario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  titulo        text NOT NULL,
  tipo          text NOT NULL DEFAULT 'live' CHECK (tipo IN ('live','aula','sim','mentoria','prazo')),
  data          date NOT NULL,                 -- dia (Brasília)
  hora          time NOT NULL DEFAULT '19:00',  -- horário (Brasília)
  grupo_id      uuid REFERENCES public.simulado_grupos(id) ON DELETE CASCADE,  -- NULL = todos os alunos
  link          text,
  lembrete_1h   boolean NOT NULL DEFAULT true,
  lembrete_enviado_em timestamptz,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_cal_tenant_data ON public.simulado_eventos_calendario (tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_eventos_cal_grupo ON public.simulado_eventos_calendario (grupo_id) WHERE grupo_id IS NOT NULL;

-- D) DISPARO DE CAMPANHA (e-mail e mensagem por API/WhatsApp) -----------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_campanhas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  canal         text NOT NULL CHECK (canal IN ('email','api')),
  assunto       text,                          -- e-mail: assunto | api: nome do modelo
  mensagem      text NOT NULL,                 -- com {nome} (e {link} na API)
  cta           text,                          -- e-mail: texto do botão
  modelo        text,                          -- modelo escolhido (opcional)
  publico       jsonb NOT NULL DEFAULT '[]',   -- [{tipo:'todos'|'sem_acesso_7d'|'grupo'|'membro', id?, nome}]
  estimativa    integer NOT NULL DEFAULT 0,    -- alunos que devem receber (calculado ao criar)
  agendado_para timestamptz,                   -- NULL = enviar agora
  status        text NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','agendada','na_fila','enviando','enviada','erro','cancelada')),
  enviados      integer NOT NULL DEFAULT 0,
  entregues_pct numeric(5,2),                  -- API
  abriram_pct   numeric(5,2),                  -- e-mail: abertura | API: leitura
  clicaram_pct  numeric(5,2),
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  enviado_em    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_campanhas_tenant ON public.simulado_campanhas (tenant_id, canal, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_campanhas_pendentes ON public.simulado_campanhas (status, agendado_para) WHERE status IN ('agendada','na_fila');

-- Conexão da API de mensagens (1 por plataforma). A CHAVE nunca é guardada aqui — fica no servidor (env).
CREATE TABLE IF NOT EXISTS public.simulado_campanha_api_config (
  tenant_id     uuid PRIMARY KEY,
  provedor      text NOT NULL DEFAULT 'WhatsApp Business (API oficial da Meta)',
  numero        text,
  conectada     boolean NOT NULL DEFAULT false,
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- E) AVISOS E POP-UPS: onde aparece, para quem e até quando (estende simulado_banners) -----------
ALTER TABLE public.simulado_banners ADD COLUMN IF NOT EXISTS local text;      -- faixa | banner | destaques | popup (NULL = legado, deduz do tipo)
ALTER TABLE public.simulado_banners ADD COLUMN IF NOT EXISTS grupo_id uuid;   -- NULL = todos
ALTER TABLE public.simulado_banners ADD COLUMN IF NOT EXISTS ate timestamptz;  -- sai do ar em (NULL = sem data)

-- RLS por tenant ------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_eventos_calendario','simulado_campanhas','simulado_campanha_api_config'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))$p$, t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
