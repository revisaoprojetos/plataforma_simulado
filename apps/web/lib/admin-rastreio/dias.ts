import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'
import { rotuloIp } from '@/lib/acessos/ip'
import { agruparPorDia, fmtDiaBr, fmtTempoSeg, horaBrtStr, janelaDiaBrt, type DiaAgg, type DiaDetalhe } from '@/lib/acessos/dia-tipos'
import { funcaoAusente, type FiltroDias } from '@/lib/acessos/dias'
import { T_SESSOES, T_ATIV } from './registro'
import { COLS_SESSAO, ONLINE_MS, ROTULO_TIPO_ADMIN, aparelhoCurto, desdePeriodoAdmin, sessaoOnline, tabelaIndisponivel, type SessaoRow } from './leitura'

/**
 * ACESSOS DA EQUIPE AGRUPADOS POR DIA (BRT) — mesma ideia do aluno: lista por RPC paginada
 * (`simulado_admin_acessos_por_dia`, migração 20261121130000) com fallback em memória (até 2000 sessões) e
 * detalhe do dia sob demanda. O chamador faz o accessCan('acessos:view'); sempre `.eq('tenant_id', …)`.
 */

const SORT_DIAS = new Set(['dia', 'sessoes', 'tempo'])
type FiltroDiasAdmin = Omit<FiltroDias, 'metodo'>

const segDe = (s: SessaoRow, segEventos = 0) =>
  Math.min(12 * 3600, Math.max(0, Math.round((new Date(s.ultimo_visto_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000), s.tempo_ativo_seg ?? 0, segEventos))

export async function listarDiasMembro(tenantId: string, userId: string, f: FiltroDiasAdmin): Promise<{ indisponivel: boolean; rows: DiaAgg[]; total: number; fonte: 'rpc' | 'memoria'; truncado: boolean }> {
  const svc = createAdminClient()
  const sort = SORT_DIAS.has(f.sort) ? f.sort : 'dia'
  const desde = desdePeriodoAdmin(f.periodo, '30d')
  const q = sanearBusca(f.q).trim()

  const r = await svc.rpc('simulado_admin_acessos_por_dia', {
    p_tenant: tenantId, p_user: userId, p_desde: desde, p_q: q || null, p_sort: sort, p_dir: f.dir, p_limit: f.pp, p_offset: (f.page - 1) * f.pp,
  })
  if (!r.error && r.data) {
    const j = r.data as { total: number; rows: DiaAgg[] }
    return { indisponivel: false, rows: (j.rows ?? []).map((x) => ({ ...x, ips: x.ips ?? [], aparelhos: x.aparelhos ?? [] })), total: Number(j.total ?? 0), fonte: 'rpc', truncado: false }
  }
  if (r.error && !funcaoAusente(r.error) && tabelaIndisponivel(r.error)) return { indisponivel: true, rows: [], total: 0, fonte: 'rpc', truncado: false }

  const sessoes: SessaoRow[] = []
  let truncado = false
  for (let i = 0; i < 2; i++) {
    let qq = svc.from(T_SESSOES).select(COLS_SESSAO).eq('tenant_id', tenantId).eq('user_id', userId).gte('iniciado_em', desde)
    if (q) qq = qq.or(`ip.ilike.%${q}%,navegador.ilike.%${q}%,so.ilike.%${q}%`)
    const { data, error } = await qq.order('iniciado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [], total: 0, fonte: 'memoria', truncado: false }
    sessoes.push(...((data ?? []) as unknown as SessaoRow[]))
    if ((data ?? []).length < 1000) break
    if (i === 1) truncado = true
  }
  const dias = agruparPorDia(sessoes.map((s) => ({
    iniciado_em: s.iniciado_em, ultimo_visto_em: s.ultimo_visto_em, encerrado_em: s.encerrado_em,
    ip: rotuloIp(s.ip) === '—' ? null : rotuloIp(s.ip), aparelho: [s.navegador, s.so].filter(Boolean).join(' · ') || null, seg: segDe(s),
  })), ONLINE_MS)
  const dir = f.dir === 'asc' ? 1 : -1
  dias.sort((a, b) => {
    const c = sort === 'sessoes' ? a.sessoes - b.sessoes : sort === 'tempo' ? a.tempo_seg - b.tempo_seg : a.dia.localeCompare(b.dia)
    return (c || a.dia.localeCompare(b.dia)) * dir
  })
  return { indisponivel: false, rows: dias.slice((f.page - 1) * f.pp, f.page * f.pp), total: dias.length, fonte: 'memoria', truncado }
}

interface AtivRow { id: string; sessao_id: string | null; tipo: string; rota: string | null; rota_api: string | null; metodo: string | null; status: number | null; duracao_seg: number | null; meta: Record<string, unknown> | null; criado_em: string }

/** Relatório resumido de UM dia (BRT) de um admin — até 200 sessões e 2000 eventos do dia. */
export async function detalheDiaMembro(tenantId: string, userId: string, dia: string): Promise<DiaDetalhe | null | 'indisponivel'> {
  const jan = janelaDiaBrt(dia)
  if (!jan) return null
  const svc = createAdminClient()
  const agora = Date.now()
  const [rs, ra] = await Promise.all([
    svc.from(T_SESSOES).select(COLS_SESSAO).eq('tenant_id', tenantId).eq('user_id', userId).gte('iniciado_em', jan.ini).lt('iniciado_em', jan.fim).order('iniciado_em').order('id').range(0, 199),
    svc.from(T_ATIV).select('id, sessao_id, tipo, rota, rota_api, metodo, status, duracao_seg, meta, criado_em').eq('tenant_id', tenantId).eq('user_id', userId)
      .gte('criado_em', jan.ini).lt('criado_em', jan.fim).order('criado_em').order('id').range(0, 1999),
  ])
  if (tabelaIndisponivel(rs.error)) return 'indisponivel'
  const sessoes = (rs.data ?? []) as unknown as SessaoRow[]
  const ativ = (ra.error ? [] : (ra.data ?? [])) as unknown as AtivRow[]

  const segPorSessao = new Map<string, number>()
  const pag = new Map<string, { vistas: number; seg: number }>()
  const resumo = new Map<string, number>()
  const outros: AtivRow[] = []
  for (const a of ativ) {
    if (a.tipo === 'tempo_pagina') {
      const sg = a.duracao_seg ?? 0
      if (a.sessao_id) segPorSessao.set(a.sessao_id, (segPorSessao.get(a.sessao_id) ?? 0) + sg)
      if (a.rota) { const p = pag.get(a.rota) ?? { vistas: 0, seg: 0 }; p.seg += sg; pag.set(a.rota, p) }
    } else if (a.tipo === 'pagina_vista') {
      if (a.rota) { const p = pag.get(a.rota) ?? { vistas: 0, seg: 0 }; p.vistas++; pag.set(a.rota, p) }
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
  const linhas = sessoes.map((s) => ({ s, seg: segDe(s, segPorSessao.get(s.id) ?? 0) }))
  const d = fmtDiaBr(dia)
  return {
    dia,
    titulo: `${d.data} (${d.semana})`,
    tempoTotal: fmtTempoSeg(linhas.reduce((t, x) => t + x.seg, 0)),
    sessoes: linhas.map(({ s, seg }) => ({
      id: s.id, inicio: horaBrtStr(s.iniciado_em), fim: horaBrtStr(s.ultimo_visto_em), duracao: fmtTempoSeg(seg),
      ip: rotuloIp(s.ip), aparelho: aparelhoCurto(s), metodo: 'Painel admin', origem: s.rota_atual ?? '—',
      status: (s.encerrado_em ? 'encerrada' : sessaoOnline(s, agora) ? 'ativa' : 'inativa') as 'ativa' | 'inativa' | 'encerrada', motivo: s.motivo,
    })),
    ips: contar(sessoes.map((s) => rotuloIp(s.ip))),
    aparelhos: contar(sessoes.map((s) => aparelhoCurto(s))),
    paginas: [...pag.entries()].map(([rota, v]) => ({ rota, vistas: v.vistas, seg: v.seg, tempo: v.seg > 0 ? fmtTempoSeg(v.seg) : '—' }))
      .sort((a, b) => b.seg - a.seg || b.vistas - a.vistas).slice(0, 15),
    eventosResumo: [...resumo.entries()].map(([t, total]) => ({ rotulo: ROTULO_TIPO_ADMIN[t] ?? t, total })).sort((a, b) => b.total - a.total),
    eventos: outros.slice(0, 40).map((a) => ({
      hora: horaBrtStr(a.criado_em), rotulo: ROTULO_TIPO_ADMIN[a.tipo] ?? a.tipo,
      item: a.rota_api ? `${a.metodo ? a.metodo + ' ' : ''}${a.rota_api}` : a.rota ?? '—',
    })),
    truncado: ativ.length >= 2000 || sessoes.length >= 200,
    semDetalhesDeAtividade: !!ra.error,
  }
}
