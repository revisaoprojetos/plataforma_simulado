-- Módulo do extensivo: permite ocultar o título/disciplina sobreposto na capa (quando a imagem já traz o texto).
alter table public.simulado_produto_modulos add column if not exists ocultar_titulo boolean not null default false;
-- Padrão: os módulos que JÁ têm imagem ficam sem o título sobreposto.
update public.simulado_produto_modulos set ocultar_titulo = true where coalesce(imagem_url, '') <> '' and ocultar_titulo = false;
