import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { tipoDoSimulado, type TipoSimulado } from '@/lib/simulado/tipo'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { resumosSimuladosRows } from '@/lib/data/relatorios.repo'
import { resumosRowsViaApi } from '@/lib/data/relatorios-api'

const TENANT_FALLBACK = '00000000-0000-0000-0000-000000000000'

export type ResumoSimulado = {
  id: string
  titulo: string
  status: string | null
  criadoEm: string | null
  tipo: TipoSimulado | null
  participantes: number   // total de alunos no simulado (matriculados + acessos + com sessão)
  finalizadas: number     // alunos DISTINTOS que finalizaram de verdade
  emAndamento: number
  notaMedia: number | null
  ultimaAtividade: string | null
  cor: string | null
  icone: string | null
  capa: string | null
}

/** Resumo de todos os simulados do tenant, para a listagem de relatórios/ranking. Cacheado por tenant. */
export async function resumosSimulados(svc: SupabaseClient, tenantId: string | null): Promise<ResumoSimulado[]> {
  return remember(chaveRelatorio(tenantId, 'resumos'), TTL_RELATORIO, () => _resumosSimulados(svc, tenantId))
}

async function _resumosSimulados(svc: SupabaseClient, tenantId: string | null): Promise<ResumoSimulado[]> {
  // REPORT_SQL=shadow: roda os DOIS caminhos, loga divergências e SERVE o PostgREST (rollout seguro).
  if (process.env.REPORT_SQL === 'shadow') {
    const [sql, pg] = await Promise.all([resumosViaSql(svc, tenantId), resumosViaPostgrest(svc, tenantId)])
    if (sql) compararResumos(sql, pg)
    return pg
  }
  // Padrão: tenta a agregação por SQL direto (1 query). Se indisponível/erro → PostgREST (fallback).
  const viaSql = await resumosViaSql(svc, tenantId)
  if (viaSql) return viaSql
  return resumosViaPostgrest(svc, tenantId)
}

/** Loga divergências entre o caminho SQL e o PostgREST (usado no modo shadow p/ validar a Fase 1). */
function compararResumos(sql: ResumoSimulado[], pg: ResumoSimulado[]): void {
  const idx = new Map(pg.map((r) => [r.id, r]))
  let diffs = 0
  for (const s of sql) {
    const p = idx.get(s.id)
    if (!p) { diffs++; console.warn(`[shadow resumos] só no SQL: ${s.id}`); continue }
    const nmOk = (s.notaMedia == null && p.notaMedia == null) || (s.notaMedia != null && p.notaMedia != null && Math.abs(s.notaMedia - p.notaMedia) < 0.01)
    if (s.participantes !== p.participantes || s.finalizadas !== p.finalizadas || s.emAndamento !== p.emAndamento || !nmOk) {
      diffs++
      console.warn(`[shadow resumos] DIFF ${s.id.slice(0, 8)} sql=`, { p: s.participantes, f: s.finalizadas, e: s.emAndamento, nm: s.notaMedia }, 'pg=', { p: p.participantes, f: p.finalizadas, e: p.emAndamento, nm: p.notaMedia })
    }
  }
  if (sql.length !== pg.length) { diffs++; console.warn(`[shadow resumos] contagem difere: sql=${sql.length} pg=${pg.length}`) }
  console.log(`[shadow resumos] ${sql.length} simulados, ${diffs} divergência(s)`)
}

/**
 * Caminho SQL: as linhas vêm da API dedicada (se RELATORIOS_API_URL setado — Fase 3) ou do
 * SQL direto local (Fase 1); depois a resolução visual segue em PostgREST. Se nada disso
 * responder, devolve null e o chamador cai no PostgREST completo.
 */
async function resumosViaSql(svc: SupabaseClient, tenantId: string | null): Promise<ResumoSimulado[] | null> {
  const tid = tenantId ?? TENANT_FALLBACK
  // Strangler: tenta a API dedicada primeiro; se ela não responder, o SQL direto local.
  const rows = (await resumosRowsViaApi(tid)) ?? (await resumosSimuladosRows(tid))
  if (!rows) return null // API e SQL indisponíveis → deixa o chamador usar PostgREST
  if (!rows.length) return []
  const visual = await resolverVisualSimulados(svc, rows.map((r) => ({ id: r.id, regras: r.regras })))
  return rows.map((r) => {
    const vis = visual.get(r.id)
    return {
      id: r.id,
      titulo: r.titulo ?? 'Simulado',
      status: r.status ?? null,
      criadoEm: r.created_at ? new Date(r.created_at).toISOString() : null,
      tipo: tipoDoSimulado((r.tipos ?? []) as (string | null)[]),
      participantes: Number(r.participantes) || 0,
      finalizadas: Number(r.finalizadas) || 0,
      emAndamento: Number(r.em_andamento) || 0,
      notaMedia: r.nota_media != null ? Number(r.nota_media) : null,
      ultimaAtividade: r.ultima ? new Date(r.ultima).toISOString() : null,
      cor: vis?.cor ?? null,
      icone: vis?.icone ?? null,
      capa: vis?.capa ?? null,
    }
  }).filter((r) => !OCULTAR_DISCURSIVA || r.tipo !== 'discursiva')
}

/** Caminho PostgREST original (fallback): 4 fetchAllByIn + agregação em memória. */
async function resumosViaPostgrest(svc: SupabaseClient, tenantId: string | null): Promise<ResumoSimulado[]> {
  const { data: sims } = await svc
    .from('simulado_simulados')
    .select('id, titulo, status, created_at, regras')
    .eq('deletado', false)
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
  const simulados = (sims ?? []) as any[]
  if (!simulados.length) return []
  const simIds = simulados.map((s) => s.id)

  // Visual (cor/ícone/capa) do banco vinculado — mesma resolução dos cards de simulado.
  const visual = await resolverVisualSimulados(svc, simulados.map((s) => ({ id: s.id, regras: s.regras })))

  // Tipo, sessões, matrículas e acessos por simulado.
  // fetchAllByIn: o `.limit(20000)` truncava em ~1000 (teto do PostgREST) → alunos/feitos/nota errados.
  const [pq, sess, mats, acs] = await Promise.all([
    fetchAllByIn<any>(simIds, (chunk) => svc.from('simulado_prova_questoes').select('simulado_id, questoes:simulado_questoes(tipo)').in('simulado_id', chunk)),
    fetchAllByIn<any>(simIds, (chunk) => svc.from('simulado_sessoes_prova').select('simulado_id, estudante_id, status, nota, iniciado_em').in('simulado_id', chunk).eq('is_teste', false).eq('deletado', false).order('id')),
    fetchAllByIn<any>(simIds, (chunk) => svc.from('simulado_matriculas').select('simulado_id, estudante_id').in('simulado_id', chunk)),
    fetchAllByIn<any>(simIds, (chunk) => svc.from('simulado_acessos').select('simulado_id, estudante_id').in('simulado_id', chunk)),
  ])

  const tiposPorSim = new Map<string, (string | null)[]>()
  for (const r of pq) {
    const arr = tiposPorSim.get(r.simulado_id) ?? []
    arr.push(r.questoes?.tipo ?? null)
    tiposPorSim.set(r.simulado_id, arr)
  }

  // Agregados por simulado: alunos atribuídos (total), quem FINALIZOU de verdade (distintos), notas.
  type Ag = { assign: Set<string>; finStud: Set<string>; andStud: Set<string>; notas: number[]; ult: string | null }
  const agg = new Map<string, Ag>()
  const ag = (id: string): Ag => { let a = agg.get(id); if (!a) { a = { assign: new Set(), finStud: new Set(), andStud: new Set(), notas: [], ult: null }; agg.set(id, a) } return a }
  for (const s of sess) {
    const a = ag(s.simulado_id)
    if (s.estudante_id) a.assign.add(s.estudante_id)
    if (s.status === 'finalizada') { if (s.estudante_id) a.finStud.add(s.estudante_id); if (s.nota != null) a.notas.push(Number(s.nota)) }
    else if (s.status === 'em_andamento' && s.estudante_id) a.andStud.add(s.estudante_id)
    if (s.iniciado_em && (!a.ult || s.iniciado_em > a.ult)) a.ult = s.iniciado_em
  }
  for (const m of mats) if (m.simulado_id && m.estudante_id) ag(m.simulado_id).assign.add(m.estudante_id)
  for (const x of acs) if (x.simulado_id && x.estudante_id) ag(x.simulado_id).assign.add(x.estudante_id)

  return simulados.map((s) => {
    const a = agg.get(s.id)
    const notas = a?.notas ?? []
    const vis = visual.get(s.id)
    return {
      id: s.id,
      titulo: s.titulo ?? 'Simulado',
      status: s.status ?? null,
      criadoEm: s.created_at ?? null,
      tipo: tipoDoSimulado(tiposPorSim.get(s.id) ?? []),
      participantes: a ? a.assign.size : 0,   // total de alunos no simulado (matriculados + acessos + com sessão)
      finalizadas: a ? a.finStud.size : 0,      // alunos que finalizaram de verdade (distintos)
      emAndamento: a ? a.andStud.size : 0,
      notaMedia: notas.length ? notas.reduce((x, y) => x + y, 0) / notas.length : null,
      ultimaAtividade: a?.ult ?? null,
      cor: vis?.cor ?? null,
      icone: vis?.icone ?? null,
      capa: vis?.capa ?? null,
    }
  }).filter((r) => !OCULTAR_DISCURSIVA || r.tipo !== 'discursiva')
}
