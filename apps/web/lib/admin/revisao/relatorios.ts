import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { sqlQuery } from '@/lib/data/sql'
import { TIPOS_REPORTE } from '@/lib/demandas/tipos'
import { hojeBrt, somaDias, diaSemana, MESES } from './datas'

// RELATÓRIOS (Plataforma Revisão) — Leitura · Desempenho · Cronograma · Feedbacks, filtráveis por GRUPO de
// alunos e PERÍODO. Backend-first: cada aba é UMA rodada de agregações SQL (nunca puxa linhas p/ o JS) e o
// resultado pronto é memoizado (TTL do relatório). A página só LÊ `RelatorioRevisao`.
// Sem DATABASE_URL (sqlQuery → null) a aba devolve `indisponivel=true` (a tela avisa; nada é inventado).
// Tenant SEMPRE explícito e parametrizado. Testes/deletados sempre excluídos.

export type AbaRel = 'leitura' | 'desemp' | 'crono' | 'feed'
export type PeriodoRel = '7' | '30' | 'tudo'
export const PERIODOS: { id: PeriodoRel; rotulo: string }[] = [{ id: '7', rotulo: '7 dias' }, { id: '30', rotulo: '30 dias' }, { id: 'tudo', rotulo: 'Desde o início' }]
export const ABAS_REL: { id: AbaRel; titulo: string }[] = [
  { id: 'leitura', titulo: 'Leitura' }, { id: 'desemp', titulo: 'Desempenho' }, { id: 'crono', titulo: 'Cronograma' }, { id: 'feed', titulo: 'Feedbacks' },
]

export type KpiRel = { valor: string; rotulo: string; alerta?: boolean }
export type BarrasRel = {
  titulo: string
  sub?: string
  linhas: { nome: string; valor: number }[]
  max: number
  /** pct: %, estrela: nota 0–5 (★), num: inteiro. */
  fmt: 'pct' | 'estrela' | 'num'
  /** semaforo: verde ≥60, âmbar ≥30, vermelho; primary/gold: cor única. */
  cor: 'semaforo' | 'primary' | 'gold'
}
export type RelatorioRevisao = {
  aba: AbaRel
  periodo: PeriodoRel
  grupoId: string | null
  indisponivel: boolean
  kpis: KpiRel[]
  barras: BarrasRel[]
  serie: { rotulo: string; pct: number }[] | null
  serieTitulo?: string
  serieSub?: string
  linkCompleto?: { href: string; rotulo: string }
  linkComentarios?: boolean
}

export type GrupoOpcao = { id: string; nome: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const nf = (n: number) => n.toLocaleString('pt-BR')
const dec = (n: number, c = 1) => n.toFixed(c).replace('.', ',')

export function normalizarPeriodo(v: string | undefined): PeriodoRel {
  return v === '7' || v === 'tudo' ? v : '30'
}
export function normalizarAba(v: string | undefined): AbaRel {
  return v === 'desemp' || v === 'crono' || v === 'feed' ? v : 'leitura'
}

/** Grupos para o filtro (não excluídos/arquivados). */
export async function listarGruposFiltro(tenantId: string): Promise<GrupoOpcao[]> {
  return remember(chaveRelatorio(tenantId, 'revisao-rel-grupos'), 600, async () => {
    try {
      const svc = createAdminClient()
      const rows = await fetchAll<GrupoOpcao>(() => svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).eq('deletado', false).eq('arquivado', false).order('nome').order('id'))
      return rows
    } catch { return [] }
  })
}

type Ctx = { t: string; ini: string; hoje: string; grupo: string | null; params: unknown[] }

/** Fragmento "aluno ∈ grupo" (parâmetro $N anexado ao `params`). Vazio = sem filtro de grupo. */
function fg(c: Ctx, col: string): string {
  if (!c.grupo) return ''
  c.params.push(c.grupo)
  return ` AND ${col} IN (SELECT estudante_id FROM simulado_grupo_membros WHERE grupo_id = $${c.params.length}::uuid AND tenant_id = $1)`
}
/** Query com params base [t] + os que `fg` adicionar; @INI/@HOY = início do período / hoje (BRT). */
async function q<T>(c: Ctx, montar: (c: Ctx) => string): Promise<T[] | null> {
  const local: Ctx = { ...c, params: [c.t] }
  // Datas calculadas aqui (AAAA-MM-DD, nunca vêm do cliente) entram como literal: evita parâmetro não referenciado.
  const sql = montar(local).replaceAll('@INI', `'${c.ini}'::date`).replaceAll('@HOY', `'${c.hoje}'::date`)
  return sqlQuery<T>(sql, local.params)
}

const META = `simulado_cronograma_adaptativo_plano_meta pm
  LEFT JOIN simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id`

// ── LEITURA ─────────────────────────────────────────────────────────────────────────────────────
async function leitura(c: Ctx): Promise<Pick<RelatorioRevisao, 'kpis' | 'barras' | 'indisponivel'>> {
  const segunda = somaDias(c.hoje, -((diaSemana(c.hoje) + 6) % 7))
  const domingo = somaDias(segunda, 6)
  const mesIni = `${c.hoje.slice(0, 7)}-01`

  // % dos alunos que concluíram TODAS as metas do tipo previstas na semana atual
  const semana = (tipos: string) => q<{ tot: string; ok: string }>(c, (x) => `
    WITH s AS (
      SELECT pm.estudante_id, bool_and(coalesce(m.estado, '') = 'done') AS feito
        FROM ${META}
       WHERE pm.tenant_id = $1 AND pm.tipo IN (${tipos}) AND pm.data_prevista BETWEEN '${segunda}'::date AND '${domingo}'::date${fg(x, 'pm.estudante_id')}
       GROUP BY pm.estudante_id)
    SELECT count(*)::text AS tot, count(*) FILTER (WHERE feito)::text AS ok FROM s`)

  const [pdf, lp, juris, alunos, ritmo, porDisc, porLei] = await Promise.all([
    semana(`'pf','pp'`),
    semana(`'lp'`),
    q<{ n: string }>(c, (x) => `SELECT count(DISTINCT l.aluno_id)::text AS n FROM simulado_conteudo_leitura_progresso l
       JOIN simulado_conteudo_documentos d ON d.id = l.documento_id AND d.tenant_id = $1 AND d.categoria = 'jurisclub' AND d.deletado = false
       WHERE l.tenant_id = $1 AND (l.ultima_leitura_em AT TIME ZONE 'America/Sao_Paulo')::date >= '${mesIni}'::date${fg(x, 'l.aluno_id')}`),
    q<{ n: string }>(c, (x) => `SELECT count(DISTINCT a.estudante_id)::text AS n FROM simulado_assinaturas a
       JOIN simulado_estudantes e ON e.id = a.estudante_id AND e.tenant_id = $1 AND e.deletado = false
       WHERE a.tenant_id = $1 AND a.status = 'ativo' AND (a.expira_em IS NULL OR a.expira_em > now())${fg(x, 'a.estudante_id')}`),
    q<{ pag: string | null; seg: string | null }>(c, (x) => `SELECT sum(paginas)::text AS pag, sum(segundos)::text AS seg FROM simulado_tempo_estudo
       WHERE tenant_id = $1 AND paginas > 0 AND dia BETWEEN @INI AND @HOY${fg(x, 'estudante_id')}`),
    q<{ nome: string; tot: string; ok: string }>(c, (x) => `
      WITH s AS (
        SELECT coalesce(nullif(btrim(pm.disciplina), ''), 'Sem disciplina') AS nome, pm.estudante_id, bool_and(coalesce(m.estado, '') = 'done') AS feito
          FROM ${META}
         WHERE pm.tenant_id = $1 AND pm.tipo IN ('pf','pp') AND pm.data_prevista BETWEEN @INI AND @HOY${fg(x, 'pm.estudante_id')}
         GROUP BY 1, 2)
      SELECT nome, count(*)::text AS tot, count(*) FILTER (WHERE feito)::text AS ok FROM s GROUP BY nome ORDER BY nome`),
    q<{ nome: string; tot: string; ok: string }>(c, (x) => `
      SELECT coalesce(nullif(btrim(pm.titulo), ''), 'Sem título') AS nome, count(*)::text AS tot, count(*) FILTER (WHERE m.estado = 'done')::text AS ok
        FROM ${META}
       WHERE pm.tenant_id = $1 AND pm.tipo = 'lp' AND pm.data_prevista BETWEEN @INI AND @HOY${fg(x, 'pm.estudante_id')}
       GROUP BY 1 ORDER BY 1`),
  ])
  if (!pdf || !lp || !juris || !alunos || !ritmo || !porDisc || !porLei) return { kpis: [], barras: [], indisponivel: true }

  const pct = (ok: number, tot: number) => (tot ? Math.round((ok / tot) * 100) : 0)
  // % com 1 casa abaixo de 10% (evita "0%" quando é 0,3%).
  const pctK = (ok: number, tot: number) => { if (!tot) return '0%'; const v = (ok / tot) * 100; return v >= 10 || v === 0 ? `${Math.round(v)}%` : `${v.toFixed(1).replace('.', ',')}%` }
  const totAlunos = Number(alunos[0]?.n ?? 0)
  const pag = Number(ritmo[0]?.pag ?? 0), seg = Number(ritmo[0]?.seg ?? 0)
  // amostra mínima: evita "100%" de uma disciplina com 1 aluno (disciplinas: 5 alunos; leis: 20 metas)
  const ordenar = (rows: { nome: string; tot: string; ok: string }[], min: number) =>
    rows.filter((r) => Number(r.tot) >= min).map((r) => ({ nome: r.nome, valor: pct(Number(r.ok), Number(r.tot)) })).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 12)

  return {
    indisponivel: false,
    kpis: [
      { valor: pctK(Number(pdf[0]?.ok ?? 0), Number(pdf[0]?.tot ?? 0)), rotulo: 'dos alunos leram o PDF da semana' },
      { valor: pctK(Number(lp[0]?.ok ?? 0), Number(lp[0]?.tot ?? 0)), rotulo: 'leram o LegProc da semana' },
      { valor: pctK(Number(juris[0]?.n ?? 0), totAlunos), rotulo: `abriram o JurisClub de ${MESES[Number(c.hoje.slice(5, 7)) - 1].toLowerCase()}` },
      { valor: seg > 0 ? dec(pag / (seg / 3600)) : '—', rotulo: 'páginas por hora, em média' },
    ],
    barras: [
      { titulo: 'PDFs lidos por disciplina', sub: '% dos alunos que concluíram (mín. 5 alunos)', linhas: ordenar(porDisc, 5), max: 100, fmt: 'pct', cor: 'semaforo' },
      { titulo: 'LegProc por lei', sub: '% das metas de LegProc do cronograma concluídas (mín. 20 metas)', linhas: ordenar(porLei, 20), max: 100, fmt: 'pct', cor: 'semaforo' },
    ],
  }
}

// ── DESEMPENHO ──────────────────────────────────────────────────────────────────────────────────
async function desempenho(c: Ctx): Promise<Pick<RelatorioRevisao, 'kpis' | 'barras' | 'indisponivel' | 'linkCompleto'>> {
  const SESS = `s.tenant_id = $1 AND s.is_teste = false AND s.deletado = false AND s.status = 'finalizada' AND s.finalizado_em >= @INI`
  const [tot, disc] = await Promise.all([
    q<{ n: string; media: string | null }>(c, (x) => `SELECT count(*)::text AS n, avg(s.nota)::text AS media FROM simulado_sessoes_prova s WHERE ${SESS}${fg(x, 's.estudante_id')}`),
    q<{ nome: string; tt: string; ac: string }>(c, (x) => `
      SELECT d.nome, count(*)::text AS tt, count(*) FILTER (WHERE r.correta)::text AS ac
        FROM simulado_respostas_objetivas r
        JOIN simulado_sessoes_prova s ON s.id = r.sessao_id AND ${SESS}${fg(x, 's.estudante_id')}
        JOIN simulado_questoes qq ON qq.id = r.questao_id
        JOIN simulado_disciplinas d ON d.id = qq.disciplina_id AND d.tenant_id = $1
       GROUP BY d.nome HAVING count(*) >= 20`),
  ])
  if (!tot || !disc) return { kpis: [], barras: [], indisponivel: true }

  const linhas = disc.map((r) => ({ nome: r.nome, valor: Math.round((Number(r.ac) / Number(r.tt)) * 100) })).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
  const pior = linhas.length ? linhas[linhas.length - 1] : null
  const media = tot[0]?.media != null ? Number(tot[0].media) : null
  return {
    indisponivel: false,
    kpis: [
      { valor: media != null ? dec(media) : '—', rotulo: 'nota média nos simulados' },
      { valor: nf(Number(tot[0]?.n ?? 0)), rotulo: c.ini <= '1900-01-02' ? 'simulados feitos' : `simulados feitos no período` },
      { valor: pior ? pior.nome : '—', rotulo: 'disciplina com menor acerto' },
      { valor: pior ? `${pior.valor}%` : '—', rotulo: pior ? `acerto em ${pior.nome}` : 'acerto' },
    ],
    barras: [{ titulo: 'Acerto por disciplina', sub: 'As 15 disciplinas com menor acerto (20+ respostas no período)', linhas: linhas.slice(-15), max: 100, fmt: 'pct', cor: 'semaforo' }],
    linkCompleto: { href: '/admin/relatorios/disciplinas', rotulo: 'Relatório completo' },
  }
}

// ── CRONOGRAMA ──────────────────────────────────────────────────────────────────────────────────
async function cronograma(c: Ctx): Promise<Pick<RelatorioRevisao, 'kpis' | 'barras' | 'indisponivel' | 'serie'>> {
  const PL = `pl.tenant_id = $1 AND pl.arquivada = false AND pl.exemplo = false`
  const semIni = somaDias(somaDias(c.hoje, -((diaSemana(c.hoje) + 6) % 7)), -49)
  const [planos, metas, atras, extras, semanas] = await Promise.all([
    q<{ n: string }>(c, (x) => `SELECT count(*)::text AS n FROM simulado_cronograma_adaptativo_plano pl WHERE ${PL}${fg(x, 'pl.estudante_id')}`),
    q<{ tot: string; ok: string }>(c, (x) => `SELECT count(*)::text AS tot, count(*) FILTER (WHERE m.estado = 'done')::text AS ok
       FROM ${META} JOIN simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND ${PL}
      WHERE pm.tenant_id = $1 AND pm.data_prevista BETWEEN @INI AND @HOY${fg(x, 'pm.estudante_id')}`),
    q<{ n: string }>(c, (x) => `SELECT count(*)::text AS n FROM (
       SELECT pm.estudante_id FROM ${META} JOIN simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND ${PL}
        WHERE pm.tenant_id = $1 AND pm.data_prevista < @HOY AND coalesce(m.estado, '') <> 'done'${fg(x, 'pm.estudante_id')}
        GROUP BY pm.estudante_id HAVING count(*) >= 5) z`),
    q<{ n: string | null }>(c, (x) => `SELECT count(*)::text AS n FROM simulado_cronograma_adaptativo_plano pl,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(pl.extras) = 'array' THEN pl.extras ELSE '[]'::jsonb END) e
       WHERE ${PL} AND e->>'data' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND (e->>'data')::date BETWEEN @INI AND @HOY${fg(x, 'pl.estudante_id')}`),
    q<{ sem: string; tot: string; ok: string }>(c, (x) => `SELECT date_trunc('week', pm.data_prevista)::date::text AS sem, count(*)::text AS tot, count(*) FILTER (WHERE m.estado = 'done')::text AS ok
       FROM ${META} JOIN simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND ${PL}
      WHERE pm.tenant_id = $1 AND pm.data_prevista BETWEEN '${semIni}'::date AND @HOY${fg(x, 'pm.estudante_id')}
      GROUP BY 1`),
  ])
  if (!planos || !metas || !atras || !extras || !semanas) return { kpis: [], barras: [], indisponivel: true, serie: null }

  const porSem = new Map(semanas.map((s) => [s.sem, Number(s.tot) ? Math.round((Number(s.ok) / Number(s.tot)) * 100) : 0]))
  const serie = Array.from({ length: 8 }, (_, i) => ({ rotulo: `S${i + 1}`, pct: porSem.get(somaDias(semIni, i * 7)) ?? 0 }))
  const tot = Number(metas[0]?.tot ?? 0)
  return {
    indisponivel: false,
    serie,
    barras: [],
    kpis: [
      { valor: nf(Number(planos[0]?.n ?? 0)), rotulo: 'cronogramas montados' },
      { valor: tot ? `${Math.round((Number(metas[0]?.ok ?? 0) / tot) * 100)}%` : '—', rotulo: 'das metas cumpridas' },
      { valor: nf(Number(atras[0]?.n ?? 0)), rotulo: 'alunos com 5+ metas atrasadas', alerta: Number(atras[0]?.n ?? 0) > 0 },
      { valor: nf(Number(extras[0]?.n ?? 0)), rotulo: 'sessões fora do cronograma' },
    ],
  }
}

// ── FEEDBACKS ───────────────────────────────────────────────────────────────────────────────────
async function feedbacks(c: Ctx): Promise<Pick<RelatorioRevisao, 'kpis' | 'barras' | 'indisponivel' | 'linkComentarios'>> {
  const [aval, rep, nps, piores, tipos] = await Promise.all([
    q<{ media: string | null }>(c, (x) => `SELECT avg(a.nota)::text AS media FROM simulado_material_avaliacoes a WHERE a.tenant_id = $1 AND a.criado_em >= @INI${fg(x, 'a.estudante_id')}`),
    q<{ tot: string; ok: string }>(c, (x) => `SELECT count(*)::text AS tot, count(*) FILTER (WHERE r.status = 'resolvido')::text AS ok FROM simulado_material_reportes r
       WHERE r.tenant_id = $1 AND r.criado_em >= @INI${fg(x, 'r.estudante_id')}`),
    q<{ tot: string; prom: string; det: string }>(c, (x) => `SELECT count(*)::text AS tot, count(*) FILTER (WHERE a.nps >= 9)::text AS prom, count(*) FILTER (WHERE a.nps <= 6)::text AS det
       FROM simulado_avaliacoes a WHERE a.tenant_id = $1 AND a.criado_em >= @INI${fg(x, 'a.estudante_id')}`),
    q<{ titulo: string | null; media: string; n: string }>(c, (x) => `SELECT d.titulo, avg(a.nota)::text AS media, count(*)::text AS n
       FROM simulado_material_avaliacoes a JOIN simulado_conteudo_documentos d ON d.id = a.documento_id AND d.tenant_id = $1
      WHERE a.tenant_id = $1 AND a.criado_em >= @INI${fg(x, 'a.estudante_id')}
      GROUP BY d.id, d.titulo HAVING count(*) >= 3 ORDER BY avg(a.nota) ASC, d.titulo LIMIT 5`),
    q<{ tipo: string; n: string }>(c, (x) => `SELECT r.tipo, count(*)::text AS n FROM simulado_material_reportes r
       WHERE r.tenant_id = $1 AND r.criado_em >= @INI${fg(x, 'r.estudante_id')} GROUP BY r.tipo ORDER BY count(*) DESC`),
  ])
  if (!aval || !rep || !nps || !piores || !tipos) return { kpis: [], barras: [], indisponivel: true }

  const nt = Number(nps[0]?.tot ?? 0)
  const npsVal = nt ? Math.round(((Number(nps[0].prom) - Number(nps[0].det)) / nt) * 100) : null
  const rotuloTipo = new Map(TIPOS_REPORTE.map((t) => [t.value as string, t.label]))
  const maxTipo = Math.max(...tipos.map((t) => Number(t.n)), 1)
  return {
    indisponivel: false,
    linkComentarios: true,
    kpis: [
      { valor: aval[0]?.media != null ? `${dec(Number(aval[0].media))} ★` : '—', rotulo: 'média das avaliações' },
      { valor: nf(Number(rep[0]?.tot ?? 0)), rotulo: c.ini <= '1900-01-02' ? 'problemas reportados' : 'problemas reportados no período' },
      { valor: nf(Number(rep[0]?.ok ?? 0)), rotulo: 'já corrigidos' },
      { valor: npsVal != null ? String(npsVal) : '—', rotulo: 'NPS da plataforma' },
    ],
    barras: [
      { titulo: 'Materiais com pior nota', sub: 'Mínimo de 3 avaliações', linhas: piores.map((p) => ({ nome: p.titulo ?? 'Material', valor: Number(Number(p.media).toFixed(1)) })), max: 5, fmt: 'estrela', cor: 'gold' },
      { titulo: 'Problemas por tipo', sub: 'No período', linhas: tipos.map((t) => ({ nome: rotuloTipo.get(t.tipo) ?? t.tipo, valor: Number(t.n) })), max: maxTipo, fmt: 'num', cor: 'primary' },
    ],
  }
}

export async function carregarRelatorioRevisao(tenantId: string, aba: AbaRel, periodo: PeriodoRel, grupoId: string | null): Promise<RelatorioRevisao> {
  const grupo = grupoId && UUID.test(grupoId) ? grupoId : null
  const hoje = hojeBrt()
  const ini = periodo === '7' ? somaDias(hoje, -6) : periodo === '30' ? somaDias(hoje, -29) : '1900-01-01'
  const base: RelatorioRevisao = { aba, periodo, grupoId: grupo, indisponivel: false, kpis: [], barras: [], serie: null }
  return remember(chaveRelatorio(tenantId, 'revisao-rel', aba, periodo, grupo ?? 'todos', hoje), TTL_RELATORIO, async () => {
    const c: Ctx = { t: tenantId, ini, hoje, grupo, params: [] }
    try {
      const r = aba === 'leitura' ? await leitura(c) : aba === 'desemp' ? await desempenho(c) : aba === 'crono' ? await cronograma(c) : await feedbacks(c)
      return { ...base, ...r }
    } catch (e) {
      console.error('[revisao/relatorios]', aba, e)
      return { ...base, indisponivel: true }
    }
  })
}
