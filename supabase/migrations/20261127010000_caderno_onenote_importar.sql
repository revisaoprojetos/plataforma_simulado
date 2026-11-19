-- MEUS CADERNOS — IMPORTAÇÃO (fase 1): cadernos/itens/questões/anotações ANTIGOS -> seções/páginas do modelo OneNote.
-- Depende de 20261127000000_caderno_onenote_fase1.sql. SOMENTE LÊ as tabelas antigas (nenhum UPDATE/DELETE nelas).
-- IDEMPOTENTE: cada linha criada carrega origem_tipo/origem_id (UNIQUE por notebook) + ON CONFLICT DO NOTHING;
-- re-rodar não duplica e importa só o que for novo desde a última execução. Roda numa transação (tudo ou nada).
--
-- MAPEAMENTO
--   simulado_aluno_cadernos               -> seção   (tipo 'importada', origem 'caderno')
--   simulado_aluno_caderno_questoes
--     + itens tipo 'questao' (questao_id) -> 1 página "Questões" por caderno, nós questaoRef (origem 'caderno_questoes')
--   simulado_aluno_caderno_itens (grifo/comentario/anotacao) -> 1 página por item (origem 'caderno_item')
--   simulado_conteudo_anotacoes tipo 'nota' -> seção "Anotações do material" + 1 página por nota (origem 'conteudo_anotacao')
--   simulado_conteudo_grifos_pdf com nota   -> idem (origem 'grifo_pdf_nota'). Grifos SEM nota ficam só no leitor.
--   Favoritos e caderno de erros NÃO são importados: viram seções automáticas calculadas no servidor.
-- PREMISSA A CONFERIR: simulado_conteudo_anotacoes.aluno_id e simulado_conteudo_grifos_pdf.aluno_id == estudante_id.
--
-- ============ CONFERÊNCIA (rodar ANTES e DEPOIS; cole os resultados) ============
-- select 'cadernos' k, count(*) from simulado_aluno_cadernos
-- union all select 'caderno_questoes', count(*) from simulado_aluno_caderno_questoes
-- union all select 'itens_nao_questao', count(*) from simulado_aluno_caderno_itens where tipo <> 'questao'
-- union all select 'itens_questao', count(*) from simulado_aluno_caderno_itens where tipo = 'questao' and questao_id is not null
-- union all select 'anotacoes_nota', count(*) from simulado_conteudo_anotacoes where tipo = 'nota'
-- union all select 'grifos_pdf_com_nota', count(*) from simulado_conteudo_grifos_pdf where nullif(btrim(nota),'') is not null;
-- select 'secoes_caderno' k, count(*) from simulado_aluno_notebook_secoes where origem_tipo = 'caderno'
-- union all select 'questoes_em_paginas', coalesce(sum(jsonb_array_length(doc->'content') - 1),0)
--           from simulado_aluno_notebook_paginas where origem_tipo = 'caderno_questoes'
-- union all select 'paginas_item', count(*) from simulado_aluno_notebook_paginas where origem_tipo = 'caderno_item'
-- union all select 'paginas_anotacao', count(*) from simulado_aluno_notebook_paginas where origem_tipo = 'conteudo_anotacao'
-- union all select 'paginas_grifo_nota', count(*) from simulado_aluno_notebook_paginas where origem_tipo = 'grifo_pdf_nota';
-- EXIGIR (todas devem dar 0 depois):
-- select count(*) faltam_cadernos from simulado_aluno_cadernos c where not exists
--   (select 1 from simulado_aluno_notebook_secoes s where s.origem_tipo='caderno' and s.origem_id=c.id);
-- select count(*) faltam_itens from simulado_aluno_caderno_itens i where i.tipo <> 'questao' and not exists
--   (select 1 from simulado_aluno_notebook_paginas p where p.origem_tipo='caderno_item' and p.origem_id=i.id);
-- select count(*) faltam_questoes from (
--   select caderno_id, questao_id from simulado_aluno_caderno_questoes
--   union select caderno_id, questao_id from simulado_aluno_caderno_itens where tipo='questao' and questao_id is not null) q
--   where not exists (select 1 from simulado_aluno_notebook_paginas p, jsonb_array_elements(p.doc->'content') n
--     where p.origem_tipo='caderno_questoes' and p.origem_id=q.caderno_id and n->'attrs'->>'questao_id' = q.questao_id::text);
-- (cada cadernos_questoes distinto == questoes_em_paginas.)

begin;

-- 1) notebooks (1 por tenant+estudante que tem qualquer coisa a importar)
insert into simulado_aluno_notebook (tenant_id, estudante_id)
select distinct tenant_id, estudante_id from simulado_aluno_cadernos
on conflict (tenant_id, estudante_id) do nothing;

insert into simulado_aluno_notebook (tenant_id, estudante_id)
select distinct tenant_id, aluno_id from simulado_conteudo_anotacoes where tipo = 'nota'
on conflict (tenant_id, estudante_id) do nothing;

insert into simulado_aluno_notebook (tenant_id, estudante_id)
select distinct tenant_id, aluno_id from simulado_conteudo_grifos_pdf where nullif(btrim(nota), '') is not null
on conflict (tenant_id, estudante_id) do nothing;

-- 2) uma seção por caderno antigo
insert into simulado_aluno_notebook_secoes (tenant_id, notebook_id, estudante_id, nome, ordem, tipo, origem_tipo, origem_id, criado_em)
select c.tenant_id, nb.id, c.estudante_id, left(coalesce(nullif(btrim(c.nome), ''), 'Caderno'), 120),
       row_number() over (partition by c.tenant_id, c.estudante_id order by c.criado_em, c.id) * 1024.0,
       'importada', 'caderno', c.id, coalesce(c.criado_em, now())
from simulado_aluno_cadernos c
join simulado_aluno_notebook nb on nb.tenant_id = c.tenant_id and nb.estudante_id = c.estudante_id
on conflict (notebook_id, origem_tipo, origem_id) where origem_id is not null do nothing;

-- 3) página "Questões" por caderno (união de caderno_questoes + itens tipo 'questao', sem repetir questão)
insert into simulado_aluno_notebook_paginas
  (tenant_id, notebook_id, secao_id, estudante_id, titulo, doc, texto_busca, ordem, origem_tipo, origem_id)
select s.tenant_id, s.notebook_id, s.id, s.estudante_id, 'Questões salvas',
       jsonb_build_object('type', 'doc', 'content',
         jsonb_build_array(jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2),
                           'content', jsonb_build_array(jsonb_build_object('type','text','text','Questões salvas')))) ||
         jsonb_agg(jsonb_build_object('type','questaoRef','attrs',jsonb_build_object('questao_id', q.questao_id)) order by q.questao_id)),
       'Questões salvas', 0, 'caderno_questoes', q.caderno_id
from (
  select caderno_id, questao_id from simulado_aluno_caderno_questoes where questao_id is not null
  union
  select caderno_id, questao_id from simulado_aluno_caderno_itens where tipo = 'questao' and questao_id is not null
) q
join simulado_aluno_notebook_secoes s on s.origem_tipo = 'caderno' and s.origem_id = q.caderno_id
group by s.tenant_id, s.notebook_id, s.id, s.estudante_id, q.caderno_id
on conflict (notebook_id, origem_tipo, origem_id) where origem_id is not null do nothing;

-- 4) uma página por item (grifo / comentario / anotacao). Nenhum campo antigo é descartado:
--    grifoSnapshot carrega documento/pagina/rects/trecho/cor/tool; anotacaoRef carrega o html legado integral.
insert into simulado_aluno_notebook_paginas
  (tenant_id, notebook_id, secao_id, estudante_id, titulo, doc, texto_busca, ordem, origem_tipo, origem_id, criado_em)
select s.tenant_id, s.notebook_id, s.id, s.estudante_id,
       left(coalesce(nullif(btrim(i.titulo_documento), ''), nullif(btrim(i.trecho), ''), nullif(btrim(i.comentario), ''),
                     case i.tipo when 'grifo' then 'Grifo' when 'anotacao' then 'Anotação' else 'Comentário' end), 120),
       jsonb_build_object('type','doc','content',
         (case when i.tipo = 'grifo' or nullif(btrim(i.trecho),'') is not null then
            jsonb_build_array(jsonb_build_object('type','grifoSnapshot','attrs', jsonb_strip_nulls(jsonb_build_object(
              'documento_id', i.documento_id, 'documento_versao', i.documento_versao,
              'documento_titulo', i.titulo_documento, 'pagina', i.pagina, 'texto', i.trecho,
              'rects', i.rects, 'cor', i.cor, 'prefix', i.prefix, 'suffix', i.suffix,
              'inicio', i.inicio, 'fim', i.fim, 'link', null, 'origem_item_id', i.id))))
          else '[]'::jsonb end)
         ||
         (case when nullif(btrim(i.comentario),'') is not null then
            jsonb_build_array(jsonb_build_object('type','paragraph','content',
              jsonb_build_array(jsonb_build_object('type','text','text', left(i.comentario, 20000)))))
          else '[]'::jsonb end)
         ||
         (case when nullif(btrim(i.html),'') is not null then
            jsonb_build_array(jsonb_build_object('type','anotacaoRef','attrs',
              jsonb_build_object('origem_tabela','simulado_aluno_caderno_itens','origem_id', i.id, 'html_legado', left(i.html, 100000))),
              jsonb_build_object('type','paragraph','content',
              jsonb_build_array(jsonb_build_object('type','text','text',
                left(coalesce(nullif(btrim(regexp_replace(regexp_replace(i.html,'<[^>]*>',' ','g'),'\s+',' ','g')),''),' '), 20000)))))
          else '[]'::jsonb end)
         ||
         jsonb_build_array(jsonb_build_object('type','paragraph'))),   -- parágrafo final vazio p/ o aluno continuar escrevendo
       left(concat_ws(' ', i.titulo_documento, i.trecho, i.comentario,
                      regexp_replace(coalesce(i.html,''), '<[^>]*>', ' ', 'g')), 200000),
       row_number() over (partition by s.id order by i.criado_em, i.id) * 1024.0,
       'caderno_item', i.id, coalesce(i.criado_em, now())
from simulado_aluno_caderno_itens i
join simulado_aluno_notebook_secoes s on s.origem_tipo = 'caderno' and s.origem_id = i.caderno_id
where i.tipo <> 'questao'
on conflict (notebook_id, origem_tipo, origem_id) where origem_id is not null do nothing;

-- 5) seção "Anotações do material" por aluno (anotações/notas do leitor que ficam fora de qualquer caderno)
insert into simulado_aluno_notebook_secoes (tenant_id, notebook_id, estudante_id, nome, ordem, tipo, origem_tipo, origem_id)
select nb.tenant_id, nb.id, nb.estudante_id, 'Anotações do material', 999000, 'importada', 'secao_anotacoes', nb.estudante_id
from simulado_aluno_notebook nb
where exists (select 1 from simulado_conteudo_anotacoes a where a.tenant_id = nb.tenant_id and a.aluno_id = nb.estudante_id and a.tipo = 'nota')
   or exists (select 1 from simulado_conteudo_grifos_pdf g where g.tenant_id = nb.tenant_id and g.aluno_id = nb.estudante_id and nullif(btrim(g.nota),'') is not null)
on conflict (notebook_id, origem_tipo, origem_id) where origem_id is not null do nothing;

-- 5a) notas do leitor HTML (simulado_conteudo_anotacoes tipo 'nota'); texto da nota em conteudo->>'texto'|'nota'
insert into simulado_aluno_notebook_paginas
  (tenant_id, notebook_id, secao_id, estudante_id, titulo, doc, texto_busca, ordem, origem_tipo, origem_id, criado_em)
select s.tenant_id, s.notebook_id, s.id, s.estudante_id,
       left(coalesce(nullif(btrim(a.texto_ancora),''), 'Nota'), 120),
       jsonb_build_object('type','doc','content', jsonb_build_array(
         jsonb_build_object('type','grifoSnapshot','attrs', jsonb_strip_nulls(jsonb_build_object(
           'documento_id', a.documento_id, 'texto', a.texto_ancora, 'prefix', a.contexto_antes, 'suffix', a.contexto_depois,
           'inicio', a.inicio_offset, 'fim', a.fim_offset, 'link', null, 'origem_anotacao_id', a.id))),
         jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text',
           left(coalesce(nullif(btrim(a.conteudo->>'texto'),''), nullif(btrim(a.conteudo->>'nota'),''), nullif(btrim(a.conteudo #>> '{}'),''), ' '), 20000)))),
         jsonb_build_object('type','paragraph'))),
       left(concat_ws(' ', a.texto_ancora, a.conteudo->>'texto', a.conteudo->>'nota'), 200000),
       row_number() over (partition by s.id order by a.criada_em, a.id) * 1024.0,
       'conteudo_anotacao', a.id, coalesce(a.criada_em, now())
from simulado_conteudo_anotacoes a
join simulado_aluno_notebook nb on nb.tenant_id = a.tenant_id and nb.estudante_id = a.aluno_id
join simulado_aluno_notebook_secoes s on s.notebook_id = nb.id and s.origem_tipo = 'secao_anotacoes'
where a.tipo = 'nota'
on conflict (notebook_id, origem_tipo, origem_id) where origem_id is not null do nothing;

-- 5b) grifos de PDF que têm nota
insert into simulado_aluno_notebook_paginas
  (tenant_id, notebook_id, secao_id, estudante_id, titulo, doc, texto_busca, ordem, origem_tipo, origem_id, criado_em)
select s.tenant_id, s.notebook_id, s.id, s.estudante_id,
       left(coalesce(nullif(btrim(g.nota),''), 'Nota de grifo'), 120),
       jsonb_build_object('type','doc','content', jsonb_build_array(
         jsonb_build_object('type','grifoSnapshot','attrs', jsonb_strip_nulls(jsonb_build_object(
           'documento_id', g.documento_id, 'pagina', g.pagina, 'texto', g.texto, 'rects', g.rects,
           'cor', g.cor, 'tool', g.tool, 'link', null, 'origem_grifo_id', g.id))),
         jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text', left(g.nota, 20000)))),
         jsonb_build_object('type','paragraph'))),
       left(concat_ws(' ', g.texto, g.nota), 200000),
       row_number() over (partition by s.id order by g.criado_em, g.id) * 1024.0 + 500000,
       'grifo_pdf_nota', g.id, coalesce(g.criado_em, now())
from simulado_conteudo_grifos_pdf g
join simulado_aluno_notebook nb on nb.tenant_id = g.tenant_id and nb.estudante_id = g.aluno_id
join simulado_aluno_notebook_secoes s on s.notebook_id = nb.id and s.origem_tipo = 'secao_anotacoes'
where nullif(btrim(g.nota),'') is not null
on conflict (notebook_id, origem_tipo, origem_id) where origem_id is not null do nothing;

-- Trava de segurança: aborta (rollback) se algum caderno/item antigo ficou sem correspondente.
-- Só confere o que existia quando o script começou (now() = início da transação): alunos continuam criando itens durante a execução.
do $$
declare f1 int; f2 int;
begin
  select count(*) into f1 from simulado_aluno_cadernos c where coalesce(c.criado_em, '-infinity'::timestamptz) < now() and not exists
    (select 1 from simulado_aluno_notebook_secoes s where s.origem_tipo = 'caderno' and s.origem_id = c.id);
  select count(*) into f2 from simulado_aluno_caderno_itens i where i.tipo <> 'questao' and coalesce(i.criado_em, '-infinity'::timestamptz) < now() and not exists
    (select 1 from simulado_aluno_notebook_paginas p where p.origem_tipo = 'caderno_item' and p.origem_id = i.id);
  if f1 > 0 or f2 > 0 then
    raise exception 'Importação incompleta: % cadernos e % itens sem correspondente — rollback', f1, f2;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
