import { fetchAll } from '@/lib/supabase/fetch-all'
import { startOfDay, subDays, startOfMonth, addDays, addMonths, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export type PontoSerie = { data: string; rotulo: string; iniciados: number; feitos: number; ativos: number }
export type DashboardSerie = {
  modo: 'semana' | 'mes'
  mes: string   // YYYY-MM do período (para o seletor de mês)
  titulo: string
  pontos: PontoSerie[]
  resumo: { iniciados: number; feitos: number; ativos: number }
}

/** Intervalo [inicio, fim) + rótulo do eixo conforme o modo. */
function intervalo(modo: 'semana' | 'mes', mes?: string) {
  if (modo === 'mes') {
    const base = mes ? parseISO(`${mes}-01T00:00:00`) : new Date()
    const inicio = startOfMonth(base)
    return { inicio, fim: startOfMonth(addMonths(inicio, 1)), rotuloFmt: 'd', titulo: format(inicio, "MMMM 'de' yyyy", { locale: ptBR }) }
  }
  return { inicio: startOfDay(subDays(new Date(), 6)), fim: startOfDay(addDays(new Date(), 1)), rotuloFmt: 'EEE', titulo: 'Últimos 7 dias' }
}

/**
 * Série diária para o dashboard: simulados INICIADOS (created_at) e FEITOS (finalizado_em, status
 * finalizada) por dia, + ESTUDANTES ATIVOS (distintos que iniciaram algo no dia = "acessos"). Exclui
 * teste/deletado. Paginado (fetchAll). Dias sem atividade entram com zero (série sempre completa).
 */
export async function montarDashboardSerie(svc: any, tenantId: string, modo: 'semana' | 'mes', mes?: string): Promise<DashboardSerie> {
  const { inicio, fim, rotuloFmt, titulo } = intervalo(modo, mes)
  const t = { tenant_id: tenantId }
  const inicioIso = inicio.toISOString(), fimIso = fim.toISOString()

  const [iniciadas, finalizadas] = await Promise.all([
    fetchAll<{ estudante_id: string; created_at: string }>(() => svc.from('simulado_sessoes_prova')
      .select('estudante_id, created_at').match(t).eq('deletado', false).eq('is_teste', false)
      .gte('created_at', inicioIso).lt('created_at', fimIso).order('created_at', { ascending: true })),
    fetchAll<{ finalizado_em: string }>(() => svc.from('simulado_sessoes_prova')
      .select('finalizado_em').match(t).eq('deletado', false).eq('is_teste', false).eq('status', 'finalizada')
      .gte('finalizado_em', inicioIso).lt('finalizado_em', fimIso).order('finalizado_em', { ascending: true })),
  ])

  const ini = new Map<string, number>(), ativos = new Map<string, Set<string>>(), feitos = new Map<string, number>()
  for (const s of iniciadas) {
    const k = (s.created_at ?? '').slice(0, 10); if (!k) continue
    ini.set(k, (ini.get(k) ?? 0) + 1)
    if (s.estudante_id) { const set = ativos.get(k) ?? new Set<string>(); set.add(s.estudante_id); ativos.set(k, set) }
  }
  for (const s of finalizadas) { const k = (s.finalizado_em ?? '').slice(0, 10); if (k) feitos.set(k, (feitos.get(k) ?? 0) + 1) }

  const pontos: PontoSerie[] = []
  for (let d = new Date(inicio); d < fim; d = addDays(d, 1)) {
    const key = format(d, 'yyyy-MM-dd')
    pontos.push({ data: key, rotulo: format(d, rotuloFmt, { locale: ptBR }), iniciados: ini.get(key) ?? 0, feitos: feitos.get(key) ?? 0, ativos: ativos.get(key)?.size ?? 0 })
  }
  const resumo = pontos.reduce((a, p) => ({ iniciados: a.iniciados + p.iniciados, feitos: a.feitos + p.feitos, ativos: a.ativos + p.ativos }), { iniciados: 0, feitos: 0, ativos: 0 })
  return { modo, mes: mes ?? format(inicio, 'yyyy-MM'), titulo, pontos, resumo }
}
