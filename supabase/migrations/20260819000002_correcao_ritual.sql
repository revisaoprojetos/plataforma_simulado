-- ═══════════════════════════════════════════════════════════════════════════
-- Simulados Discursivos — Fase 2 (Fatia 2): RITUAL de auditoria por quesito.
--
-- Estende simulado_correcao_competencias (auditoria por competência) com:
--  · audit_state    — pending | review | approved (estado do quesito na mesa)
--  · mensagem_aluno — devolutiva do quesito ao aluno (editável só após aprovar)
--  · atualizado_em  — carimbo
-- e um UNIQUE(resposta_id, competencia_id) para o save passar a fazer UPSERT
-- (preservando audit_state/mensagem em vez de apagar+reinserir a cada gravação).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_correcao_competencias
  ADD COLUMN IF NOT EXISTS audit_state    text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS mensagem_aluno text,
  ADD COLUMN IF NOT EXISTS atualizado_em  timestamptz DEFAULT now();

-- Dedup defensivo antes do índice único (mantém 1 linha por par resposta×competência).
DELETE FROM public.simulado_correcao_competencias a
USING public.simulado_correcao_competencias b
WHERE a.ctid < b.ctid
  AND a.resposta_id = b.resposta_id
  AND a.competencia_id = b.competencia_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_correcao_competencias_resp_comp
  ON public.simulado_correcao_competencias(resposta_id, competencia_id);
