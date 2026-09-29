-- Bloquear REFAZER o quiz da leitura (por módulo/pasta): quando TRUE, uma questão já respondida NÃO
-- pode ser re-respondida (o aluno não refaz o quiz depois de concluir). Default FALSE = pode refazer
-- (comportamento atual). O admin liga isso pra "travar" o quiz após a conclusão.
alter table public.simulado_pastas add column if not exists quiz_bloquear_refazer boolean not null default false;
