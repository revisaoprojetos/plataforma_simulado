-- Origem do acesso: distingue o que foi concedido PELA INTEGRAÇÃO (Guru) do que foi dado à MÃO.
-- A revogação automática (reembolso/cancelamento/expiração) passa a apagar SÓ `origem='integracao'`,
-- nunca um acesso manual do admin. Default 'manual' de propósito: linhas ANTIGAS (origem desconhecida)
-- ficam protegidas — a integração só revoga o que ela mesma inserir a partir de agora (direção segura:
-- nunca remove acesso manual). Colunas aditivas, sem impacto no que já existe.
ALTER TABLE simulado_grupo_membros    ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';
ALTER TABLE simulado_matriculas       ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';
ALTER TABLE simulado_pasta_estudantes ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';
