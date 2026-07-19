import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tipoDoSimulado, type TipoSimulado } from '@/lib/simulado/tipo'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'

export type ResumoSimulado = {
  id: string
  titulo: string
  status: string | null
  criadoEm: string | null
  tipo: TipoSimulado | null
  participantes: number   // estudantes distintos com sessão real
  finalizadas: number
  emAndamento: number
  notaMedia: number | null
  ultimaAtividade: string | null
  cor: string | null
  icone: string | null
  capa: string | null
}

/** Resumo de todos os simulados do tenant, para a listagem de relatórios/ranking. */
export async function resumosSimulados(svc: SupabaseClient, tenantId: string | null): Promise<ResumoSimulado[]> {
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

  // Tipo de cada simulado (a partir dos tipos das questões).
  const tiposPorSim = new Map<string, (string | null)[]>()
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('simulado_id, questoes:simulado_questoes(tipo)')
    .in('simulado_id', simIds)
  for (const r of (pq ?? []) as any[]) {
    const arr = tiposPorSim.get(r.simulado_id) ?? []
    arr.push(r.questoes?.tipo ?? null)
    tiposPorSim.set(r.simulado_id, arr)
  }

  // Sessões reais → agregados por simulado.
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('simulado_id, estudante_id, status, nota, iniciado_em')
    .in('simulado_id', simIds)
    .eq('is_teste', false)
    .eq('deletado', false)
    .limit(20000)
  const agg = new Map<string, { est: Set<string>; fin: number; and: number; notas: number[]; ult: string | null }>()
  for (const s of (sess ?? []) as any[]) {
    const a = agg.get(s.simulado_id) ?? { est: new Set<string>(), fin: 0, and: 0, notas: [], ult: null }
    if (s.estudante_id) a.est.add(s.estudante_id)
    if (s.status === 'finalizada') { a.fin++; if (s.nota != null) a.notas.push(Number(s.nota)) }
    else if (s.status === 'em_andamento') a.and++
    if (s.iniciado_em && (!a.ult || s.iniciado_em > a.ult)) a.ult = s.iniciado_em
    agg.set(s.simulado_id, a)
  }

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
      participantes: a ? a.est.size : 0,
      finalizadas: a?.fin ?? 0,
      emAndamento: a?.and ?? 0,
      notaMedia: notas.length ? notas.reduce((x, y) => x + y, 0) / notas.length : null,
      ultimaAtividade: a?.ult ?? null,
      cor: vis?.cor ?? null,
      icone: vis?.icone ?? null,
      capa: vis?.capa ?? null,
    }
  }).filter((r) => !OCULTAR_DISCURSIVA || r.tipo !== 'discursiva')
}
