-- Modo "em edição / manutenção" do PRODUTO: bloqueio TOTAL de acesso.
-- acesso_bloqueado=true → NENHUM aluno acessa o produto (inclusive matriculados/assinantes/pagantes);
-- todos veem uma mensagem de "produto em atualização". Volta a false = libera de novo.
-- É DIFERENTE do "Listado/Não listado" (ativo), que é só catálogo e NÃO bloqueia acesso.
-- Default false = comportamento atual inalterado para todos os produtos existentes.
-- Leitura tolerante no código: sem a coluna, nada é bloqueado. Aplicar manualmente (SQL editor).

alter table simulado_produtos add column if not exists acesso_bloqueado boolean not null default false;

-- PostgREST: recarregar o schema cache para a coluna nova ficar visível de imediato.
notify pgrst, 'reload schema';
