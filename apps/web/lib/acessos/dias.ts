import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'
import { JANELA_ATIVA_MS } from './alertas'
import { rotuloAparelho } from './user-agent'
import { rotuloIp } from './ip'
import {
  T_ACESSOS, T_ATIV, COLS_ACESSO, METODOS, ROTULO_METODO, ROTULO_ORIGEM, ROTULO_ATIVIDADE, tabelaIndisponivel, desdePeriodo,
  segSessao, tempoPorAcesso, statusSessao, resolverTitulos, type AcessoRow, type AtividadeRow,
} from './leitura'
import { agruparPorDia, diaBrtDe, fmtDiaBr, fmtTempoSeg, horaBrtStr, janelaDiaBrt, type DiaAgg, type DiaDetalhe } from './dia-tipos'

/**
 * ACESSOS DO ALUNO AGRUPADOS POR DIA (BRT). Lista = agregação no banco (RPC `simulado_aluno_acessos_por_dia`, paginada);
 * sem a migração 20261121130000 cai no agrupamento em memória (até 2000 sessões). Detalhe do dia = sob demanda (≤ 1 dia).
 * O chamador faz o checkPermission('acessos:view'); aqui sempre `.eq('tenant_id', …)` com service role.
 */

export interface FiltroDias { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; periodo?: string; metodo?: string }
const SORT_DIAS = new Set(['dia', 'sessoes', 'tempo'])

export const funcaoAusente = (err: { code?: string; message?: string } | null | undefined): boolean =>
  !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|function .* does not exist/i.test(String(err.message ?? '')))

export async function listarDiasAluno(tenantId: string, estudanteId: string, f: FiltroDias): Promise<{ indisponivel: boolean; rows: DiaAgg[]; total: number; fonte: 'rpc' | 'memoria'; truncado: boolean }> {
  const svc = createAdminClient()
  const sort = SORT_DIAS.has(f.sort) ? f.sort : 'dia'
  const desde = desdePeriodo(f.periodo, '180d')
  const metodo = f.metodo && (METODOS as readonly string[]).includes(f.metodo) ? f.metodo : ''
  const q = sanearBusca(f.q).trim()

  const r = await svc.rpc('simulado_aluno_acessos_por_dia', {
    p_tenant: tenantId, p_estudante: estudanteId, p_desde: desde, p_metodo: metodo || null, p_q: q || null,
    p_sort: sort, p_dir: f.dir, p_limit: f.pp, p_offset: (f.page - 1) * f.pp,
  })
  if (!r.error && r.data) {
    const j = r.data as { total: number; rows: DiaAgg[] }
    return { indisponivel: false, rows: (j.rows ?? []).map((x) => ({ ...x, ips: x.ips ?? [], aparelhos: x.aparelhos ?? [] })), total: Number(j.total ?? 0), fonte: 'rpc', truncado: false }
  }
  if (r.error && !funcaoAusente(r.error)) {
    if (tabelaIndisponivel(r.error)) return { indisponivel: true, rows: [], total: 0, fonte: 'rpc', truncado: false }
  }

  // ── Fallback em memória (até 2000 sessões) ──
  const sessoes: AcessoRow[] = []
  let truncado = false
  for (let i = 0; i < 2; i++) {
    let qq = svc.from(T_ACESSOS).select(COLS_ACESSO).eq('tenant_id', tenantId).eq('estudante_id', estudanteId).is('impersonado_por', null).gte('iniciado_em', desde)
    if (metodo) qq = qq.eq('metodo', metodo)
    if (q) qq = qq.or(`ip.ilike.%${q}%,navegador.ilike.%${q}%,so.ilike.%${q}%`)
    const { data, error } = await qq.order('iniciado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [], total: 0, fonte: 'memoria', truncado: false }
    sessoes.push(...((data ?? []) as unknown as AcessoRow[]))
    if ((data ?? []).length < 1000) break
    if (i === 1) truncado = true
  }
  const tempos = await tempoPorAcesso(tenantId, estudanteId, desde).catch(() => new Map<string, number>())
  const dias = agruparPorDia(sessoes.map((s) => ({
    iniciado_em: s.iniciado_em, ultimo_visto_em: s.ultimo_visto_em, encerrado_em: s.encerrado_em,
    ip: rotuloIp(s.ip) === '—' ? null : rotuloIp(s.ip), aparelho: [s.navegador, s.so].filter(Boolean).join(' · ') || null, seg: segSessao(s, tempos.get(s.id) ?? 0),
  })), JANELA_ATIVA_MS)
  const dir = f.dir === 'asc' ? 1 : -1
  dias.sort((a, b) => {
    const c = sort === 'sessoes' ? a.sessoes - b.sessoes : sort === 'tempo' ? a.tempo_seg - b.tempo_seg : a.dia.localeCompare(b.dia)
    return (c || a.dia.localeCompare(b.dia)) * dir
  })
  return { indisponivel: false, rows: dias.slice((f.page - 1) * f.pp, f.page * f.pp), total: dias.length, fonte: 'memoria', truncado }
}

const COLS_ATIV = 'id, estudante_id, acesso_id, tipo, ref_tipo, ref_id, titulo, meta, ip, criado_em, rota, duracao_seg'
const COLS_ATIV_BASE = 'id, estudante_id, acesso_id, tipo, ref_tipo, ref_id, titulo, meta, ip, criado_em'

/** Relatório resumido de UM dia (BRT) do aluno — ≤ 200 sessões e ≤ 2000 eventos do dia. */
export async function detalheDiaAluno(tenantId: string, estudanteId: string, dia: string): Promise<DiaDetalhe | null | 'indisponivel'> {
  const jan = janelaDiaBrt(dia)
  if (!jan) return null
  const svc = createAdminClient()
  const agora = Date.now()

  const buscaAtiv = async (cols: string) => svc.from(T_ATIV).select(cols).eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .gte('criado_em', jan.ini).lt('criado_em', jan.fim).order('criado_em').order('id').range(0, 1999)
  const [rs, ra0] = await Promise.all([
    svc.from(T_ACESSOS).select(COLS_ACESSO).eq('tenant_id', tenantId).eq('estudante_id', estudanteId).is('impersonado_por', null)
      .gte('iniciado_em', jan.ini).lt('iniciado_em', jan.fim).order('iniciado_em').order('id').range(0, 199),
    buscaAtiv(COLS_ATIV),
  ])
  if (tabelaIndisponivel(rs.error)) return 'indisponivel'
  let ra = ra0
  if (ra.error && /rota|duracao_seg/.test(String(ra.error.message ?? ''))) ra = await buscaAtiv(COLS_ATIV_BASE)
  const semAtiv = !!ra.error
  const sessoes = (rs.data ?? []) as unknown as AcessoRow[]
  const ativ = (semAtiv ? [] : (ra.data ?? [])) as unknown as AtividadeRow[]

  const rotaDe = (a: AtividadeRow) => a.rota ?? (a.meta as { rota?: string } | null)?.rota ?? null
  const segDe = (a: AtividadeRow) => a.duracao_seg ?? Number((a.meta as { duracao_seg?: number } | null)?.duracao_seg ?? 0)

  const segPorAcesso = new Map<string, number>()
  const pag = new Map<string, { vistas: number; seg: number }>()
  const resumo = new Map<string, number>()
  const outros: AtividadeRow[] = []
  for (const a of ativ) {
    if (a.tipo === 'tempo_pagina') {
      const sg = segDe(a)
      if (a.acesso_id) segPorAcesso.set(a.acesso_id, (segPorAcesso.get(a.acesso_id) ?? 0) + sg)
      const r = rotaDe(a)
      if (r) { const p = pag.get(r) ?? { vistas: 0, seg: 0 }; p.seg += sg; pag.set(r, p) }
    } else if (a.tipo === 'pagina_vista') {
      const r = rotaDe(a)
      if (r) { const p = pag.get(r) ?? { vistas: 0, seg: 0 }; p.vistas++; pag.set(r, p) }
    } else {
      resumo.set(a.tipo, (resumo.get(a.tipo) ?? 0) + 1)
      outros.push(a)
    }
  }

  const contar = (vals: string[]) => {
    const m = new Map<string, number>()
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([valor, n]) => ({ valor, sessoes: n }))
  }
  const linhasSessao = sessoes.map((s) => {
    const seg = segSessao(s, segPorAcesso.get(s.id) ?? 0)
    return { s, seg }
  })
  const titulos = await resolverTitulos(tenantId, outros.slice(0, 60)).catch(() => new Map<string, string>())
  const d = fmtDiaBr(dia)
  return {
    dia,
    titulo: `${d.data} (${d.semana})`,
    tempoTotal: fmtTempoSeg(linhasSessao.reduce((t, x) => t + x.seg, 0)),
    sessoes: linhasSessao.map(({ s, seg }) => ({
      id: s.id, inicio: horaBrtStr(s.iniciado_em), fim: horaBrtStr(s.ultimo_visto_em), duracao: fmtTempoSeg(seg),
      ip: rotuloIp(s.ip), aparelho: rotuloAparelho(s), metodo: ROTULO_METODO[s.metodo] ?? s.metodo ?? '—', origem: ROTULO_ORIGEM[s.origem] ?? s.origem ?? '—',
      status: statusSessao(s, agora), motivo: s.motivo_encerramento,
    })),
    ips: contar(sessoes.map((s) => rotuloIp(s.ip))),
    aparelhos: contar(sessoes.map((s) => rotuloAparelho(s))),
    paginas: [...pag.entries()].map(([rota, v]) => ({ rota, vistas: v.vistas, seg: v.seg, tempo: v.seg > 0 ? fmtTempoSeg(v.seg) : '—' }))
      .sort((a, b) => b.seg - a.seg || b.vistas - a.vistas).slice(0, 15),
    eventosResumo: [...resumo.entries()].map(([t, total]) => ({ rotulo: ROTULO_ATIVIDADE[t] ?? t, total })).sort((a, b) => b.total - a.total),
    eventos: outros.slice(0, 40).map((a) => ({
      hora: horaBrtStr(a.criado_em), rotulo: ROTULO_ATIVIDADE[a.tipo] ?? a.tipo,
      item: a.titulo ?? titulos.get(`${a.ref_tipo}:${a.ref_id}`) ?? rotaDe(a) ?? '—',
    })),
    truncado: ativ.length >= 2000 || sessoes.length >= 200,
    semDetalhesDeAtividade: semAtiv,
  }
}

export { diaBrtDe }
