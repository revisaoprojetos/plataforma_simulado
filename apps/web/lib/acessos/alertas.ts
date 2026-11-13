/**
 * Regras de ALERTA do registro de acessos (puras, calculadas no servidor). Heurísticas de triagem:
 * indicam que vale investigar — NÃO provam invasão (IP muda em rede móvel, VPN, Wi-Fi/4G…).
 */
export interface AcessoMin {
  id: string
  ip: string | null
  navegador: string | null
  so: string | null
  dispositivo: string | null
  iniciado_em: string
  ultimo_visto_em: string
  encerrado_em: string | null
  impersonado_por?: string | null
}
export interface AtividadeMin { tipo: string; criado_em: string; meta?: Record<string, unknown> | null }

export type NivelAlerta = 'alto' | 'medio' | 'baixo'
export interface Alerta { codigo: string; nivel: NivelAlerta; titulo: string; explicacao: string }

const H = 3_600_000
const MIN = 60_000
/** Sessão sem sinal de vida há mais que isto é considerada inativa (heartbeat é a cada ~5 min). */
export const JANELA_ATIVA_MS = 30 * MIN

export const chaveAparelho = (a: { so?: string | null; dispositivo?: string | null; navegador?: string | null }) =>
  `${a.so ?? '?'}|${a.dispositivo ?? '?'}|${a.navegador ?? '?'}`

export function sessaoAtiva(a: { encerrado_em: string | null; ultimo_visto_em: string }, agora: number): boolean {
  return !a.encerrado_em && agora - new Date(a.ultimo_visto_em).getTime() <= JANELA_ATIVA_MS
}

/** Hora do dia em BRT (UTC-3, sem horário de verão desde 2019). */
export function horaBrt(iso: string): number {
  return (new Date(iso).getUTCHours() + 21) % 24
}

export function calcularAlertas(acessosTodos: AcessoMin[], atividades: AtividadeMin[], agora: number = Date.now()): Alerta[] {
  // Visualização de admin (impersonação) é auditada à parte e não conta como comportamento do aluno.
  const acessos = acessosTodos.filter((a) => !a.impersonado_por)
  const out: Alerta[] = []

  // 1) >= 3 IPs distintos em 24 h.
  const rec24 = acessos.filter((a) => agora - new Date(a.iniciado_em).getTime() <= 24 * H && a.ip)
  const ips24 = new Set(rec24.map((a) => a.ip))
  if (ips24.size >= 3) {
    out.push({
      codigo: 'ips_24h', nivel: ips24.size >= 5 ? 'alto' : 'medio',
      titulo: `${ips24.size} IPs diferentes em 24 horas`,
      explicacao: `A conta iniciou sessões a partir de ${ips24.size} endereços IP distintos nas últimas 24 horas. Pode ser a mesma pessoa trocando de rede (Wi-Fi/4G/VPN), mas também pode indicar compartilhamento da conta.`,
    })
  }

  // 2) Sessões simultâneas com IPs ou aparelhos diferentes.
  const ativas = acessos.filter((a) => sessaoAtiva(a, agora))
  if (ativas.length >= 2) {
    const ips = new Set(ativas.map((a) => a.ip ?? '?'))
    const aps = new Set(ativas.map(chaveAparelho))
    if (ips.size >= 2 || aps.size >= 2) {
      out.push({
        codigo: 'simultaneas', nivel: ips.size >= 2 && aps.size >= 2 ? 'alto' : 'medio',
        titulo: `${ativas.length} sessões ativas ao mesmo tempo`,
        explicacao: `Há ${ativas.length} sessões com atividade nos últimos 30 minutos, com ${ips.size} IP(s) e ${aps.size} aparelho(s) diferentes. Duas pessoas usando a conta ao mesmo tempo é o sinal mais forte de compartilhamento.`,
      })
    }
  }

  // 3) Rajada anormal de grifos (marcada na gravação: mais de 30 grifos em menos de 10 s).
  const rajadas = atividades.filter((x) => x.tipo === 'grifo_criado' && x.meta && (x.meta as Record<string, unknown>).rajada === true)
  if (rajadas.length) {
    out.push({
      codigo: 'rajada_grifos', nivel: 'medio',
      titulo: `Rajada anormal de grifos (${rajadas.length} ocorrência${rajadas.length > 1 ? 's' : ''})`,
      explicacao: 'Foram criados mais de 30 grifos em menos de 10 segundos. Humanos não grifam nesse ritmo: pode ser script/automação, importação de anotações ou uso anormal da conta.',
    })
  }

  // 4) Horário fora do padrão: baseline = sessões iniciadas há mais de 7 dias (mínimo 6). Alerta se uma
  //    sessão dos últimos 7 dias começou entre 0h e 6h (BRT) numa faixa sem histórico (±2 h).
  const base = acessos.filter((a) => agora - new Date(a.iniciado_em).getTime() > 7 * 24 * H)
  if (base.length >= 6) {
    const horas = new Set(base.map((a) => horaBrt(a.iniciado_em)))
    const proximo = (h: number) => [-2, -1, 0, 1, 2].some((d) => horas.has((h + d + 24) % 24))
    const fora = acessos.filter((a) => {
      if (agora - new Date(a.iniciado_em).getTime() > 7 * 24 * H) return false
      const h = horaBrt(a.iniciado_em)
      return h < 6 && !proximo(h)
    })
    if (fora.length) {
      out.push({
        codigo: 'horario_incomum', nivel: 'baixo',
        titulo: 'Acesso em horário fora do padrão',
        explicacao: `${fora.length} sessão(ões) na madrugada (0h–6h, Brasília) numa faixa de horário em que a conta nunca costumava acessar nos últimos meses.`,
      })
    }
  }

  // 5) Troca brusca de aparelho: sessão nova com SO/tipo de aparelho E IP diferentes, iniciada em até 2 h
  //    do último sinal da sessão anterior (últimos 7 dias).
  const ord = [...acessos].sort((a, b) => new Date(a.iniciado_em).getTime() - new Date(b.iniciado_em).getTime())
  let trocas = 0
  for (let i = 1; i < ord.length; i++) {
    const p = ord[i - 1], c = ord[i]
    if (agora - new Date(c.iniciado_em).getTime() > 7 * 24 * H) continue
    const gap = new Date(c.iniciado_em).getTime() - new Date(p.ultimo_visto_em).getTime()
    if (gap > 2 * H) continue
    const difAp = (p.so ?? '?') !== (c.so ?? '?') || (p.dispositivo ?? '?') !== (c.dispositivo ?? '?')
    if (difAp && p.ip && c.ip && p.ip !== c.ip) trocas++
  }
  if (trocas) {
    out.push({
      codigo: 'troca_aparelho', nivel: 'medio',
      titulo: `Troca brusca de aparelho (${trocas}x em 7 dias)`,
      explicacao: 'Uma sessão começou em outro tipo de aparelho/sistema e outro IP poucas horas (ou minutos) depois da anterior. Pode ser a aluna mudando de celular para computador, mas vale conferir os horários.',
    })
  }

  const peso = { alto: 0, medio: 1, baixo: 2 }
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel])
}

/** Detecta rajada: mais de `limite` eventos dentro de `janelaMs`. `ts` em epoch ms (qualquer ordem). */
export function detectarRajada(ts: number[], limite = 30, janelaMs = 10_000): { rajada: boolean; max: number } {
  const o = [...ts].sort((a, b) => a - b)
  let max = 0, j = 0
  for (let i = 0; i < o.length; i++) {
    while (o[i] - o[j] >= janelaMs) j++
    max = Math.max(max, i - j + 1)
  }
  return { rajada: max > limite, max }
}
