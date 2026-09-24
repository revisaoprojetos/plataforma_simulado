-- Medalhas do módulo de Leitura: conquistas PRÓPRIAS do módulo (ícone + condição de progresso),
-- irmãs dos carimbos (imagem). Ficam no jsonb da pasta; o desbloqueio reaproveita a tabela global
-- simulado_conquista_desbloqueios (a conquista tem id único no tenant), então aparecem na mesma
-- coleção de conquistas do aluno e na área de gamificação (com etiqueta de origem).
alter table simulado_pastas add column if not exists conquistas_def jsonb;
