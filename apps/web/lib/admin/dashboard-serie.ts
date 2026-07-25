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
 * Série diária para o dashboard, SEMPRE pelo dia em que o aluno FEZ a prova (`iniciado_em`):
 *  - INICIADOS: sessões iniciadas no dia.
 *  - FEITOS: as que foram finalizadas (subconjunto → Feitos ≤ Iniciados sempre).
 *  - ESTUDANTES ATIVOS: alunos distintos que iniciaram algo no dia ("acessos").
 * Exclui teste/deletado. Paginado (fetchAll). Dias sem atividade entram com zero.
 *
 * ⚠️ NÃO usa `created_at` (nulo/importação) nem `finalizado_em` para "feitos": uma re-correção em
 * lote reescreve o `finalizado_em` para o dia da re-correção, o que inflava "feitos" num dia em que
 * ninguém fez prova. Ancorar tudo no `iniciado_em` mantém as séries coerentes com a atividade real.
 */
export async function montarDashboardSerie(svc: any, tenantId: string, modo: 'semana' | 'mes', mes?: string): Promise<DashboardSerie> {
  const { inicio, fim, rotuloFmt, titulo } = intervalo(modo, mes)
  const t = { tenant_id: tenantId }
  const inicioIso = inicio.toISOString(), fimIso = fim.toISOString()

  const sessoes = await fetchAll<{ estudante_id: string; iniciado_em: string; status: string }>(() => svc.from('simulado_sessoes_prova')
    .select('estudante_id, iniciado_em, status').match(t).eq('deletado', false).eq('is_teste', false)
    .gte('iniciado_em', inicioIso).lt('iniciado_em', fimIso).order('iniciado_em', { ascending: true }))

  const ini = new Map<string, number>(), ativos = new Map<string, Set<string>>(), feitos = new Map<string, number>()
  for (const s of sessoes) {
    const k = (s.iniciado_em ?? '').slice(0, 10); if (!k) continue
    ini.set(k, (ini.get(k) ?? 0) + 1)
    if (s.status === 'finalizada') feitos.set(k, (feitos.get(k) ?? 0) + 1)
    if (s.estudante_id) { const set = ativos.get(k) ?? new Set<string>(); set.add(s.estudante_id); ativos.set(k, set) }
  }

  const pontos: PontoSerie[] = []
  for (let d = new Date(inicio); d < fim; d = addDays(d, 1)) {
    const key = format(d, 'yyyy-MM-dd')
    pontos.push({ data: key, rotulo: format(d, rotuloFmt, { locale: ptBR }), iniciados: ini.get(key) ?? 0, feitos: feitos.get(key) ?? 0, ativos: ativos.get(key)?.size ?? 0 })
  }
  const resumo = pontos.reduce((a, p) => ({ iniciados: a.iniciados + p.iniciados, feitos: a.feitos + p.feitos, ativos: a.ativos + p.ativos }), { iniciados: 0, feitos: 0, ativos: 0 })
  return { modo, mes: mes ?? format(inicio, 'yyyy-MM'), titulo, pontos, resumo }
}
