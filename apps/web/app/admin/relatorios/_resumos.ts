import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { tipoDoSimulado, type TipoSimulado } from '@/lib/simulado/tipo'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'

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
