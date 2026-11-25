import 'server-only'
import { sqlLeitura, sqlConexaoInfo } from 'data'
import { extrairRef, seloBloat } from '@/lib/admin/banco-puro'

type Lin = Record<string, any>
const n = (v: unknown) => Number(v ?? 0) || 0

const CANDIDATOS = [
  { id: 'audit', rotulo: 'Auditoria > 180 dias', tabela: 'simulado_audit_logs', where: "criado_em < now() - interval '180 days'", fn: 'purgar_audit_logs_antigos' },
  { id: 'webhook', rotulo: 'Webhook inbox processado > 60 dias', tabela: 'simulado_webhook_inbox', where: "recebido_em < now() - interval '60 days' and status_resp between 200 and 299", fn: 'purgar_webhook_inbox_processado' },
  { id: 'eventos', rotulo: 'Eventos de integração processados > 60 dias', tabela: 'simulado_integracao_eventos', where: "status in ('processado','ignorado') and processado_em is not null and processado_em < now() - interval '60 days'", fn: 'purgar_integracao_eventos_processados' },
  { id: 'outbox', rotulo: 'Outbox de conteúdo pendente', tabela: 'simulado_conteudo_outbox', where: 'processado_em is null', fn: null },
] as const

// `existe=false` → o objeto NÃO deve existir.
const MIGRACOES: { id: string; migracao: string; descricao: string; expr: string; existe: boolean }[] = [
  { id: 'm1', migracao: '20261105020000', descricao: 'tabela simulado_disciplina_aliases', expr: "to_regclass('public.simulado_disciplina_aliases') is not null", existe: true },
  { id: 'm2', migracao: '20261110010000', descricao: 'tabela video_aulas', expr: "to_regclass('public.video_aulas') is not null", existe: true },
  { id: 'm3', migracao: '20261112010000', descricao: 'tabela simulado_download_log', expr: "to_regclass('public.simulado_download_log') is not null", existe: true },
  { id: 'm4', migracao: '20261120010000', descricao: 'tabela simulado_aluno_metricas_dia', expr: "to_regclass('public.simulado_aluno_metricas_dia') is not null", existe: true },
  { id: 'm5', migracao: '20261120010000', descricao: 'função simulado_aluno_metricas_painel', expr: "exists(select 1 from pg_proc where proname='simulado_aluno_metricas_painel')", existe: true },
  { id: 'm6', migracao: '20261124000000', descricao: 'índice ix_simulado_audit_logs_tenant_criado', expr: "exists(select 1 from pg_indexes where indexname='ix_simulado_audit_logs_tenant_criado')", existe: true },
  { id: 'm7', migracao: '20261125020000', descricao: 'coluna doc_titulo em plano_meta', expr: "exists(select 1 from information_schema.columns where table_name='simulado_cronograma_adaptativo_plano_meta' and column_name='doc_titulo')", existe: true },
  { id: 'm8', migracao: '20261203000000', descricao: 'função contagens_bancos_wizard', expr: "exists(select 1 from pg_proc where proname='contagens_bancos_wizard')", existe: true },
  { id: 'm9', migracao: '20261203000000', descricao: 'função pastas_com_estudantes', expr: "exists(select 1 from pg_proc where proname='pastas_com_estudantes')", existe: true },
  { id: 'm10', migracao: '20261204000000', descricao: 'função simulado_grupos_contagem', expr: "exists(select 1 from pg_proc where proname='simulado_grupos_contagem')", existe: true },
  { id: 'm11', migracao: '20261204000100', descricao: 'função purgar_audit_logs_antigos', expr: "exists(select 1 from pg_proc where proname='purgar_audit_logs_antigos')", existe: true },
  { id: 'm12', migracao: '20261204000100', descricao: 'índice idx_cron_adapt_pm_plano_meta removido (não deve existir)', expr: "exists(select 1 from pg_indexes where indexname='idx_cron_adapt_pm_plano_meta')", existe: false },
]

/** Diagnóstico completo do banco (só SELECT, read-only, timeout 10s). Cada bloco falha isoladamente. */
export async function diagnosticoBanco() {
  const info = sqlConexaoInfo()
  const [geral, conexoes, tabelas, mig, stmts] = await Promise.all([
    sqlLeitura<Lin>(`select pg_database_size(current_database()) as tamanho,
      current_setting('max_connections')::int as max_conn,
      (select round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) from pg_stat_database where datname = current_database()) as hit`),
    sqlLeitura<Lin>(`select count(*) filter (where state = 'active') as ativas, count(*) filter (where state = 'idle') as idle, count(*) as total,
      coalesce(max(extract(epoch from now() - query_start)) filter (where state = 'active' and pid <> pg_backend_pid()), 0) as mais_longa
      from pg_stat_activity where datname = current_database()`),
    sqlLeitura<Lin>(`select c.relname as tabela, pg_total_relation_size(c.oid) as total, pg_relation_size(c.oid) as dados,
      case when c.reltoastrelid <> 0 then pg_total_relation_size(c.reltoastrelid) else 0 end as toast, pg_indexes_size(c.oid) as indices,
      s.n_live_tup as vivas, s.n_dead_tup as mortas, s.last_autovacuum, s.last_autoanalyze
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace left join pg_stat_user_tables s on s.relid = c.oid
      where ns.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 15`),
    sqlLeitura<Lin>(MIGRACOES.map((m) => `select '${m.id}' as id, (${m.expr}) as ok`).join(' union all ')),
    sqlLeitura<Lin>(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 120) as consulta, calls, round(mean_exec_time::numeric, 1) as media_ms,
      round((total_exec_time / 1000)::numeric, 1) as total_s from pg_stat_statements order by total_exec_time desc limit 8`),
  ])

  const g = geral.rows?.[0]
  const c = conexoes.rows?.[0]
  const tabs = (tabelas.rows ?? []).map((t) => {
    const vivas = n(t.vivas)
    const mortas = n(t.mortas)
    const base = {
      tabela: String(t.tabela), totalBytes: n(t.total), dadosBytes: n(t.dados), toastBytes: n(t.toast), indicesBytes: n(t.indices), vivas, mortas,
      pctMortas: vivas + mortas > 0 ? Math.round((mortas / (vivas + mortas)) * 1000) / 10 : 0,
      ultimoAutovacuum: t.last_autovacuum ? new Date(t.last_autovacuum).toISOString() : null,
      ultimoAnalyze: t.last_autoanalyze ? new Date(t.last_autoanalyze).toISOString() : null,
    }
    const bloat = seloBloat(base)
    return { ...base, bloat, comando: bloat ? `VACUUM (FULL, ANALYZE) ${base.tabela};` : null }
  })

  const candidatos = await Promise.all(CANDIDATOS.map(async (k) => {
    const [q, t] = await Promise.all([
      sqlLeitura<Lin>(`select count(*) as n from (select 1 from public.${k.tabela} where ${k.where} limit 100001) x`),
      sqlLeitura<Lin>(`select pg_total_relation_size(to_regclass('public.${k.tabela}')) as bytes`),
    ])
    const cont = q.rows ? n(q.rows[0]?.n) : null
    return {
      id: k.id, rotulo: k.rotulo, tabela: k.tabela, funcao: k.fn as string | null, contagem: cont, maisDe: cont != null && cont > 100000,
      tamanhoBytes: t.rows ? n(t.rows[0]?.bytes) : null, erro: q.rows ? null : (q.erro ?? 'indisponível'),
    }
  }))

  const okMap = new Map((mig.rows ?? []).map((r) => [String(r.id), r.ok === true]))
  const migracoes = MIGRACOES.map((m) => {
    const achou = okMap.get(m.id)
    return { migracao: m.migracao, descricao: m.descricao, status: achou == null ? 'DESCONHECIDO' : achou === m.existe ? 'OK' : 'FALTA' }
  })

  return {
    conexao: { host: info.host, ref: extrairRef(info.usuario), banco: info.banco },
    erro: geral.rows ? null : (geral.erro ?? 'sem dados'),
    geral: g ? { tamanhoBytes: n(g.tamanho), maxConexoes: n(g.max_conn), hitRatio: g.hit == null ? null : Number(g.hit) } : null,
    conexoes: c ? { ativas: n(c.ativas), idle: n(c.idle), total: n(c.total), maisLongaSeg: Math.round(n(c.mais_longa)) } : null,
    tabelas: tabs, candidatos, migracoes,
    consultas: stmts.rows ? stmts.rows.map((r) => ({ consulta: String(r.consulta), chamadas: n(r.calls), mediaMs: n(r.media_ms), totalS: n(r.total_s) })) : null,
    consultasErro: stmts.rows ? null : 'pg_stat_statements indisponível (extensão ou permissão ausente).',
  }
}
