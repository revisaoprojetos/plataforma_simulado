-- Estúdio de Conteúdo · Acesso & Comercial
-- Validade POR MEMBRO de grupo (`expira_em`) — base da ação "Mudar validade (em lote)" da tela
-- GrupoMembros. NULL = sem expiração (vitalício no grupo). Idempotente e tolerante: só mexe se a
-- tabela existir (não falha em ambiente onde o schema de grupos ainda não rodou).
--
-- NÃO aplicar automaticamente: rodar pelo usuário + NOTIFY pgrst (mudança de schema).
DO $$
BEGIN
  IF to_regclass('public.simulado_grupo_membros') IS NOT NULL THEN
    ALTER TABLE public.simulado_grupo_membros
      ADD COLUMN IF NOT EXISTS expira_em timestamptz;

    COMMENT ON COLUMN public.simulado_grupo_membros.expira_em IS
      'Validade do vínculo do membro no grupo (NULL = sem expiração). Editável em lote na tela GrupoMembros do Estúdio.';

    -- Consultas por "quem expira" (relatórios/limpeza). Parcial: só linhas com validade.
    CREATE INDEX IF NOT EXISTS idx_grupo_membros_expira
      ON public.simulado_grupo_membros (grupo_id, expira_em)
      WHERE expira_em IS NOT NULL;
  END IF;
END $$;
