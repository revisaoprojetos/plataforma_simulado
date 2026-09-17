-- Aparência da trilha POR MÓDULO (LegProc/Leitura): { simbolos, formato } em jsonb, editada pelo admin
-- na aba "Editar trilha" do módulo. Tolerante: o código cai nos defaults se a coluna ainda não existir.
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS trilha_aparencia jsonb;
