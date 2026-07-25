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
  heatmap: number[][]                 // [dia 0-6 (Dom..Sáb)][hora 0-23] = sessões iniciadas (BRT)
  heatmapMax: number
  porDiaSemana: { dia: string; valor: number }[]
  faixasNota: { faixa: string; valor: number; cor: string }[]
  topSimulados: { id: string; titulo: string; feitos: number; media: number | null }[]
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Partes em horário de Brasília (UTC-3, sem DST) de um ISO — para hora/dia-da-semana corretos. */
function brt(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
  return { dia: d.getUTCDay(), hora: d.getUTCHours() }
}

/** Intervalo [inicio, fim) + rótulo do eixo conforme o modo. Nunca passa do dia de hoje (evita
 *  cauda achatada de dias futuros no mês corrente). */
function intervalo(modo: 'semana' | 'mes', mes?: string) {
  const amanha = startOfDay(addDays(new Date(), 1)) // fim exclusivo = início de amanhã → inclui hoje
  if (modo === 'mes') {
    const base = mes ? parseISO(`${mes}-01T00:00:00`) : new Date()
    const inicio = startOfMonth(base)
    const fimMes = startOfMonth(addMonths(inicio, 1))
    return { inicio, fim: fimMes < amanha ? fimMes : amanha, rotuloFmt: 'd', titulo: format(inicio, "MMMM 'de' yyyy", { locale: ptBR }) }
  }
  return { inicio: startOfDay(subDays(new Date(), 6)), fim: amanha, rotuloFmt: 'EEE', titulo: 'Últimos 7 dias' }
}

/**
 * Agregações do dashboard, SEMPRE pelo dia em que o aluno FEZ a prova (`iniciado_em`):
 *  - série diária (iniciados/feitos/ativos), heatmap dia×hora, sessões por dia da semana,
 *    distribuição de notas (faixas) e simulados mais feitos. Exclui teste/deletado. Paginado.
 *
 * ⚠️ NÃO usa `created_at` (nulo/importação) nem `finalizado_em` para "feitos": uma re-correção em
 * lote reescreve o `finalizado_em`, inflando "feitos" num dia sem provas. Tudo ancorado no `iniciado_em`.
 */
export async function montarDashboardSerie(svc: any, tenantId: string, modo: 'semana' | 'mes', mes?: string): Promise<DashboardSerie> {
  const { inicio, fim, rotuloFmt, titulo } = intervalo(modo, mes)
  const t = { tenant_id: tenantId }
  const inicioIso = inicio.toISOString(), fimIso = fim.toISOString()

  const sessoes = await fetchAll<{ estudante_id: string; iniciado_em: string; status: string; nota: number | string | null; simulado_id: string }>(() =>
    svc.from('simulado_sessoes_prova').select('estudante_id, iniciado_em, status, nota, simulado_id').match(t)
      .eq('deletado', false).eq('is_teste', false)
      .gte('iniciado_em', inicioIso).lt('iniciado_em', fimIso).order('iniciado_em', { ascending: true }))

  // Série diária + acumuladores.
  const ini = new Map<string, number>(), ativos = new Map<string, Set<string>>(), feitos = new Map<string, number>()
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const porDia = Array(7).fill(0)
  const faixas = { baixa: 0, media: 0, alta: 0 } // <50, 50-69, 70-100
  const porSim = new Map<string, { feitos: number; soma: number; nComNota: number }>()

  for (const s of sessoes) {
    const k = (s.iniciado_em ?? '').slice(0, 10); if (!k) continue
    ini.set(k, (ini.get(k) ?? 0) + 1)
    if (s.estudante_id) { const set = ativos.get(k) ?? new Set<string>(); set.add(s.estudante_id); ativos.set(k, set) }
    // Heatmap + dia da semana (BRT).
    if (s.iniciado_em) { const b = brt(s.iniciado_em); heatmap[b.dia][b.hora] += 1; porDia[b.dia] += 1 }
    if (s.status === 'finalizada') {
      feitos.set(k, (feitos.get(k) ?? 0) + 1)
      const n = s.nota == null ? null : Number(s.nota)
      if (n != null && !Number.isNaN(n)) { if (n < 50) faixas.baixa++; else if (n < 70) faixas.media++; else faixas.alta++ }
      if (s.simulado_id) {
        const agg = porSim.get(s.simulado_id) ?? { feitos: 0, soma: 0, nComNota: 0 }
        agg.feitos++
        if (n != null && !Number.isNaN(n)) { agg.soma += n; agg.nComNota++ }
        porSim.set(s.simulado_id, agg)
      }
    }
  }

  const pontos: PontoSerie[] = []
  for (let d = new Date(inicio); d < fim; d = addDays(d, 1)) {
    const key = format(d, 'yyyy-MM-dd')
    pontos.push({ data: key, rotulo: format(d, rotuloFmt, { locale: ptBR }), iniciados: ini.get(key) ?? 0, feitos: feitos.get(key) ?? 0, ativos: ativos.get(key)?.size ?? 0 })
  }
  const resumo = pontos.reduce((a, p) => ({ iniciados: a.iniciados + p.iniciados, feitos: a.feitos + p.feitos, ativos: a.ativos + p.ativos }), { iniciados: 0, feitos: 0, ativos: 0 })

  const heatmapMax = Math.max(1, ...heatmap.flat())
  const porDiaSemana = DIAS.map((dia, i) => ({ dia, valor: porDia[i] }))
  const faixasNota = [
    { faixa: 'Abaixo de 50', valor: faixas.baixa, cor: '#f43f5e' },
    { faixa: '50 a 69', valor: faixas.media, cor: '#f59e0b' },
    { faixa: '70 ou mais', valor: faixas.alta, cor: '#10b981' },
  ].filter((f) => f.valor > 0)

  // Simulados mais feitos (top 8) + título.
  const topIds = [...porSim.entries()].sort((a, b) => b[1].feitos - a[1].feitos).slice(0, 8)
  let titulos = new Map<string, string>()
  if (topIds.length) {
    const { data } = await svc.from('simulado_simulados').select('id, titulo').in('id', topIds.map(([id]) => id))
    titulos = new Map((data ?? []).map((r: any) => [r.id, r.titulo]))
  }
  const topSimulados = topIds.map(([id, agg]) => ({
    id, titulo: titulos.get(id) ?? 'Simulado', feitos: agg.feitos, media: agg.nComNota ? agg.soma / agg.nComNota : null,
  }))

  return { modo, mes: mes ?? format(inicio, 'yyyy-MM'), titulo, pontos, resumo, heatmap, heatmapMax, porDiaSemana, faixasNota, topSimulados }
}
