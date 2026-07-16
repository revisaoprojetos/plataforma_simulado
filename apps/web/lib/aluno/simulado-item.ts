import type { VisualSim } from '@/lib/aluno/simulado-visual'

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null)

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
      if (ini && now < ini) { statusLabel = 'Agendado'; windowOk = false; quando = `Abre ${fmt(s.data_inicio)}`; tom = 'slate' }
      else if (fim && now > fim) { statusLabel = 'Encerrado'; windowOk = false; quando = `Encerrou ${fmt(s.data_fim)}`; tom = 'rose' }
      else { statusLabel = 'Ao vivo'; aoVivo = true; quando = fim ? `Encerra ${fmt(s.data_fim)}` : null; tom = 'emerald' }
    } else if (modo === 'prazo_relativo') {
      const exp = expiraPorSim.get(s.id)
      if (exp && now > new Date(exp).getTime()) { statusLabel = 'Prazo expirado'; windowOk = false; quando = `Expirou ${fmt(exp)}`; tom = 'rose' }
      else { statusLabel = 'Prazo'; quando = exp ? `Até ${fmt(exp)}` : 'Sem prazo definido'; tom = 'amber' }
    }
    const podeFazer = windowOk && s.status === 'publicado' && !!s.embed_token && (restantes > 0 || emAndamento)
    const refazer = finalizadas > 0 && restantes > 0
    const novo = !!s.created_at && now - new Date(s.created_at).getTime() < UM_DIA_MS
    return { ...s, finalizadas, restantes, emAndamento, statusLabel, aoVivo, windowOk, quando, tom, podeFazer, refazer, novo, vis: visual.get(s.id) ?? null }
  })
}
