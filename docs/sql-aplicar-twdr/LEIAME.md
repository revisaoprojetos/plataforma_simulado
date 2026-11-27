# Pacote SQL para o projeto twdrtlxkjvunkdobudev (produção)

Gerado em 2026-11-25 por comparação de `supabase/migrations/` (>= 20261001000000) com o banco (somente leitura).
Cada arquivo: cole numa ABA NOVA do SQL Editor, rode inteiro, confira com o SELECT da tabela abaixo. Todos idempotentes, sem CONCURRENTLY/VACUUM, terminam com `NOTIFY pgrst, 'reload schema'`.

## Ordem, risco e verificação

| # | Arquivo | Origem | O que faz | Risco / lock | Conferir (deve retornar) |
|---|---|---|---|---|---|
| 01 | 01-linhagem-cross-tenant | 20261003000000 | `linhagem_id`/`origem_tenant_id` em simulados, pastas, documentos, cadernos_designer + índices | Baixo (tabelas < 400 linhas) | `select count(*) from information_schema.columns where column_name='linhagem_id' and table_name in ('simulado_simulados','simulado_pastas','simulado_documentos','simulado_cadernos_designer');` = 4 |
| 02 | 02-unificar-disciplinas-aliases | 20261105020000 | tabela `simulado_disciplina_aliases` + RPCs `simulado_unificar_disciplinas`/`desfazer` novas | Baixo | `select to_regclass('public.simulado_disciplina_aliases');` não nulo |
| 03 | 03-download-log | 20261112010000 | tabela `simulado_download_log` + 4 índices + RLS | Baixo (nova) | `select to_regclass('public.simulado_download_log');` |
| 04 | 04-rastreio-aluno-metricas | 20261120010000 | `duracao_seg`/`rota` em aluno_atividades, `simulado_aluno_metricas_dia`, funções rollup/painel/registro_purgar | Baixo-médio: 2 índices em aluno_atividades (375k linhas/172 MB), segundos | `select count(*) from pg_proc where proname in ('simulado_aluno_metricas_rollup','simulado_aluno_metricas_painel');` = 2 |
| 05 | 05-video-proprio-OPCIONAL | 20261110010000 | tabelas `video_*` (empresas, cursos, aulas, matriculas_sync) | Baixo (novas). Só se usar o serviço de vídeo próprio (`video_config` já existe) | `select count(*) from pg_tables where tablename like 'video_%';` = 5 |
| 06 | 06-meta-documento-snapshot | 20261125020000 (SEM função, SEM backfill de plano_meta) | colunas `doc_titulo/doc_titulo_norm/doc_pasta_id` em plano_meta e meta_def, 3 índices parciais, backfill só de meta_def (996 linhas) | MÉDIO: 2 índices em plano_meta (1,5 mi/1,4 GB) bloqueiam escrita por segundos a ~1 min. Fora do pico | `select count(*) from information_schema.columns where column_name='doc_titulo' and table_name like 'simulado_cronograma_adaptativo_%';` = 2 |
| 07 | 07-funcao-espelhar-grade-FINAL | 20261125020000 + 20261203000001 | versão final de `cron_adapt_espelhar_grade`: campos doc_* + diff `IS DISTINCT FROM` + `statement_timeout 30s` | Baixo. RODAR DEPOIS do 06 | `select prosrc like '%IS DISTINCT%' and prosrc like '%doc_titulo_norm%' d, proconfig from pg_proc where proname='cron_adapt_espelhar_grade';` = true, {statement_timeout=30s} |
| 08 | 08-contagens-e-grupos | 20261203000000 + 20261204000000 | funções `contagens_bancos_wizard`, `pastas_com_estudantes`, `simulado_grupos_contagem` | Baixo | `select count(*) from pg_proc where proname in ('contagens_bancos_wizard','pastas_com_estudantes','simulado_grupos_contagem');` = 3 |
| 09 | 09-manutencao-retencao-indices | 20261204000100 | 5 índices de FK (trechos 1,19 mi, grifos_pdf 300k, notebook_paginas, anotações), DROP do índice duplicado `idx_cron_adapt_pm_plano_meta`, autovacuum agressivo, funções `purgar_*` (NÃO agendadas/executadas) | MÉDIO: índices em trechos/grifos_pdf bloqueiam escrita por segundos a ~1 min; `lock_timeout 10s` falha rápido (basta reexecutar). Fora do pico | `select count(*) from pg_indexes where indexname in ('ix_conteudo_trechos_uid','ix_conteudo_trechos_pai_uid','ix_conteudo_grifos_pdf_documento','ix_nb_paginas_secao_id','ix_leitura_anotacoes_documento');` = 5 |
| 10 | 10-audit-logs-indices-SEM-CONCURRENTLY | 20261124000000 (versão sem concurrently) | 3 índices de listagem em `simulado_audit_logs` + ANALYZE | ALTO: 1,09 mi linhas/1,2 GB; ~30-120 s por índice, BLOQUEIA INSERT (login/auditoria) durante a criação. RODAR DE MADRUGADA, com o app quieto. `statement_timeout` 10 min e `lock_timeout` 30 s já no arquivo. Se estourar o limite do Editor, rode um CREATE INDEX por vez | `select indexname from pg_indexes where indexname like 'ix_simulado_audit_logs_tenant%';` = 3 |

Ordem recomendada: 01, 02, 03, 04, 08 (sem risco) -> 06 -> 07 -> 09 -> 05 (opcional) -> 10 (madrugada).
Não aplicar a 20261125020000 original nem a 20261124000000 original: a primeira regride a otimização; a segunda usa CONCURRENTLY.

Decisões: o backfill de `plano_meta` da 20261125020000 foi OMITIDO (1,38 mi linhas com documento_id: reescrever ~1,4 GB de heap, piora o disco a 84%). O snapshot é preenchido gradualmente pelo espelho; a função final compara o valor pós-COALESCE para só regravar o que muda de fato. Se quiser o backfill completo, faça fora do pico e em lotes por plano_id (via psql, com commits).

Limitação do levantamento: detectei ausência por objetos criados (tabelas, colunas, funções, índices, policies, triggers). Migrações que só redefinem função existente (CREATE OR REPLACE) não são detectáveis por existência; as pendentes acima cobrem as detectadas. 20261127000000 foi marcada falsa-positiva (triggers dinâmicos `trg_%` existem).

## (a) Logs Explorer: erros do Postgres agrupados por mensagem

```sql
select
  regexp_replace(event_message, '[0-9]+', 'N', 'g') as mensagem,
  parsed.error_severity as severidade,
  count(*) as ocorrencias
from postgres_logs
cross join unnest(metadata) as m
cross join unnest(m.parsed) as parsed
where parsed.error_severity in ('ERROR', 'FATAL')
group by mensagem, severidade
order by ocorrencias desc
limit 50
```

Rode com o intervalo de 24 h. Compare antes e depois do pacote: erros do tipo `relation ... does not exist`, `column ... does not exist` e `function ... does not exist` devem sumir.

## (c) Disco: VACUUM FULL do bloat

`VACUUM (FULL, ANALYZE) simulado_conteudo_versoes;` recupera ~3,2 GB de bloat. Tente SOZINHO numa aba nova do SQL Editor (nunca junto de outro comando). Se falhar com 25001 (VACUUM não roda em transação), use psql direto na connection string. Atenção: VACUUM FULL toma ACCESS EXCLUSIVE na tabela durante toda a execução (leituras e escritas travam); rode fora do pico e exige espaço livre temporário igual ao tamanho real da tabela (~tamanho útil, sem o bloat).

## Storage: desvínculo do Supabase (2026-11-27)

| # | Arquivo | O que faz | Pré-requisito | Reverter |
|---|---|---|---|---|
| 18 | 18-storage-urls-imagens-hetzner | Reescreve ~260 URLs absolutas do bucket público `imagens` (questões, capas de pasta, banners, tema) para `https://hel1.your-objectstorage.com/revisaopge-imagens/`. Backup em `storage_url_backup_20261127`. | `node apps/web/scripts/storage-publicar-imagens.mjs --aplicar` (bucket imagens do Hetzner é privado hoje) e `curl -sI` da imagem = 200 | 19 |
| 20 | 20-storage-arquivos-provider-s3 | `simulado_arquivos.provider` 'supabase' → 's3' (15.736 linhas, todas com objeto no Hetzner). Só rótulo. | nenhum | 21 |

Ordem: policy pública das imagens → 18 → 20. URLs do bucket `pdfs` não são reescritas (privado; resolvidas pelo proxy).
