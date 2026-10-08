-- Preferências do perfil do aluno: Meta diária de questões + toggles (lembrete, resumo semanal,
-- aparecer no ranking, modo foco). jsonb único por estudante — sem tabela nova.
-- Forma: { metaDiaria: int, lembrete: bool, resumoSemanal: bool, aparecerRanking: bool, modoFoco: bool }
-- "aparecerRanking=false" é espelhado no gating de ranking (ranking_ocultos) pelo app.
alter table simulado_estudantes add column if not exists perfil_prefs jsonb;

-- PostgREST: recarregar o schema cache para a coluna nova ficar visível de imediato.
notify pgrst, 'reload schema';
