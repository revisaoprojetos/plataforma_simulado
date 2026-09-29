-- Regra SEQUENCIAL da trilha de leitura (por módulo/pasta): quando TRUE, o aluno só abre o próximo
-- dia depois de concluir o anterior (leitura + quiz). Default FALSE = liberdade total (o aluno faz
-- os dias em qualquer ordem; só continua limitado a dias não liberados/publicados/agendados).
alter table public.simulado_pastas add column if not exists regra_sequencial boolean not null default false;
