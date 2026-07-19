import type { VisualSim } from '@/lib/aluno/simulado-visual'
import { formatBrt } from '@/lib/brt'

// Sempre no horário de Brasília, para casar com o admin.
const fmt = (d?: string | null) => formatBrt(d)

/** Janela do simulado: início e fim; só o início quando não há fim. */
function janelaTexto(inicio?: string | null, fim?: string | null): string | null {
  const i = fmt(inicio)
  const f = fmt(fim)
  if (i && f) return `Início ${i} · Encerra ${f}`
  if (i) return `Início ${i}`
  if (f) return `Encerra ${f}`
  return null
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

export type ItemSimulado = {
  id: string
  titulo: string
  modo_aplicacao: string
  status: string
  data_inicio: string | null
  data_fim: string | null
  embed_token: string | null
  regras: any
  created_at?: string | null
  finalizadas: number
  restantes: number
  emAndamento: boolean
  statusLabel: string
  aoVivo: boolean
  windowOk: boolean
  quando: string | null
  tom: string
  podeFazer: boolean
  refazer: boolean
  /** aberto (criado) há menos de 1 dia → mostra a fita "novo". */
  novo: boolean
  vis: VisualSim | null
}

/**
 * Deriva o estado de cada simulado para o aluno (status, janela, tentativas, "novo"…).
 * Compartilhado entre a home do aluno e a página "Simulados", para os cards ficarem iguais.
 */
export function montarItensSimulado(
  sims: any[],
  sessoesPorSim: Map<string, any[]>,
  expiraPorSim: Map<string, string | null>,
  visual: Map<string, VisualSim>,
  now: number = Date.now(),
): ItemSimulado[] {
  return sims.map((s) => {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x: any) => x.status === 'finalizada').length
    const emAndamento = sess.some((x: any) => x.status !== 'finalizada')
    const regras = (s.regras as any) ?? {}
    const max = Number(regras.max_tentativas ?? regras.retentativas ?? 0)
    const ilimitado = s.modo_aplicacao === 'aberto' || !(max > 0)
    const restantes = ilimitado ? Infinity : Math.max(0, max - finalizadas)
    let statusLabel = 'Aberto', aoVivo = false, windowOk = true, quando: string | null = 'Sempre disponível', tom = 'sky'
    const modo = s.modo_aplicacao
    if (modo === 'janela_fixa') {
      const ini = s.data_inicio ? new Date(s.data_inicio).getTime() : null
      const fim = s.data_fim ? new Date(s.data_fim).getTime() : null
      // Card sempre mostra a janela completa (início e fim; só início se não houver fim).
      quando = janelaTexto(s.data_inicio, s.data_fim)
      if (ini && now < ini) { statusLabel = 'Agendado'; windowOk = false; tom = 'slate' }
      else if (fim && now > fim) { statusLabel = 'Encerrado'; windowOk = false; tom = 'rose' }
      else { statusLabel = 'Ao vivo'; aoVivo = true; tom = 'emerald' }
    } else if (modo === 'prazo_relativo') {
      const exp = expiraPorSim.get(s.id)
      if (exp && now > new Date(exp).getTime()) { statusLabel = 'Prazo expirado'; windowOk = false; quando = `Expirou ${fmt(exp)}`; tom = 'rose' }
      else { statusLabel = 'Prazo'; quando = exp ? `Até ${fmt(exp)}` : 'Sem prazo definido'; tom = 'amber' }
    }
    const podeFazer = windowOk && s.status === 'publicado' && !!s.embed_token && (restantes > 0 || emAndamento)
    const refazer = finalizadas > 0 && restantes > 0
    // "Novo" = aberto há < 1 dia: prioriza quando foi publicado; cai no created_at.
    const abertoEm = regras.publicado_em ?? s.created_at
    const novo = !!abertoEm && now - new Date(abertoEm).getTime() < UM_DIA_MS
    return { ...s, finalizadas, restantes, emAndamento, statusLabel, aoVivo, windowOk, quando, tom, podeFazer, refazer, novo, vis: visual.get(s.id) ?? null }
  })
}
