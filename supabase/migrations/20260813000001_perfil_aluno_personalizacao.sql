-- Personalização do perfil do aluno: avatar (imagem escolhida) + capa do card de perfil.
-- As OPÇÕES liberadas (quais avatares/fundos) ficam em simulado_tenants.tema->'personalizacao_aluno'.
-- Aqui guardamos só a ESCOLHA de cada estudante.
ALTER TABLE public.simulado_estudantes
  ADD COLUMN IF NOT EXISTS avatar text,
  ADD COLUMN IF NOT EXISTS perfil_capa text,       -- fundo do CARD: URL de imagem OU cor (#hex)
  ADD COLUMN IF NOT EXISTS perfil_texto text,      -- cor de destaque (texto + barra de XP + anel do nível)
  ADD COLUMN IF NOT EXISTS perfil_avatar_cor text; -- cor ATRÁS da capivara (círculo do avatar)
