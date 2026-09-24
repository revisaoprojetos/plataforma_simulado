-- Adesivos (carimbos) posicionados como DECORAÇÃO no header do perfil do aluno.
-- jsonb: [{ carimboId, url, x, y, tamanho, rotacao }] — x/y em %, tamanho em px, rotacao em graus.
-- Só pode conter adesivos que o próprio aluno já GANHOU (validado no server ao salvar).
alter table simulado_estudantes add column if not exists perfil_adesivos jsonb;
