# ADR 0003 — Analytics calculado sob demanda

**Status:** aceito · 2026-10-26

## Contexto
O plano previa tabelas agregadas (`analytics_daily`, `retention_buckets`) alimentadas por um job. Com 4 empresas e consultas feitas por professores e admins (não por cada aluno a cada play), o volume de leitura é baixo, e os dados-fonte já estão normalizados e indexados: `watch_sessions`, `watch_ranges` e `lesson_progress`.

## Decisão
- **Calcular tudo na hora, com SQL escopado por `tenant_id`**, a partir das tabelas-fonte. Sem job, sem agregados, sem dados defasados: o relatório esvazia a fila de heartbeats (`ProgressConsolidator.flush()`) antes de consultar.
- Remover `analytics_daily` e `retention_buckets` (nunca tiveram dados).
- Guardar em cada sessão os **segundos assistidos por velocidade e por qualidade** (`rates_s`, `qualities_s`, JSONB), porque a média (`avg_rate`) não responde "qual velocidade a turma mais usa".
- Índice novo `watch_ranges(tenant_id, lesson_id)` para a curva de retenção.
- A curva de retenção é `COUNT(DISTINCT aluno)` cobrindo cada trecho de 5 s, via `generate_series` + junção com os trechos já mesclados.

## Definições (valem para API, CSV e MCP)
- **Visualização** = sessão com ≥ 5 s realmente assistidos. **Únicos** = alunos distintos com visualização.
- **Taxa de conclusão** = concluídas ÷ alunos que começaram (`percent > 0`).
- Métricas de sessão (visualizações, tempo, série diária, velocidade, qualidade, dispositivo) obedecem ao **período**; retenção, conclusão e progresso são do **histórico inteiro** (os trechos assistidos não guardam data).
- **Aluno inativo** = matriculado sem nenhuma sessão há N dias (ou que nunca começou).

## Quando reavaliar
Se uma consulta de aula passar de ~300 ms com o volume real (centenas de milhares de trechos por aula) ou se surgir relatório comparativo entre todas as empresas: materializar a retenção por aula (tabela ou `MATERIALIZED VIEW` atualizada por job) e/ou cachear no Redis por 60 s.

## Consequências
+ Números sempre atuais e uma fonte de verdade só; menos código e menos tabelas.
− Cada consulta paga o SQL; sessões anteriores ao Marco 6 não têm detalhe de velocidade/qualidade (aparecem vazias).
