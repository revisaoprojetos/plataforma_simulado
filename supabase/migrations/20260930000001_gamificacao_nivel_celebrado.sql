-- Persiste o MAIOR nível já celebrado por aluno, no servidor — a animação de "subiu de nível" passa
-- a depender do banco, não só do localStorage. Sem isto, no iframe da Curseduca (storage particionado)
-- ou em outro device o modal reaparecia toda vez (fallback "1º acesso = nível 1" → catch-up infinito).
ALTER TABLE simulado_gamificacao_estudante
  ADD COLUMN IF NOT EXISTS nivel_celebrado integer;
