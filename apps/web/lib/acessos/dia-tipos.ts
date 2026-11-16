/** Tipos e formatação PUROS (cliente+servidor) do agrupamento de acessos por dia (fuso BRT). */
import { rotuloIp } from './ip'

export const TZ_BRT = 'America/Sao_Paulo'

/** Agregado de UM dia (vem da RPC ou do fallback em memória). */
export interface DiaAgg {
  dia: string // YYYY-MM-DD (BRT)
  sessoes: number
  primeiro: string
  ultimo: string
  tempo_seg: number
  ips: string[]
  aparelhos: string[]
  paginas: number | null
  ativa: boolean
}

/** Linha JÁ formatada pelo servidor para a tabela por dia. */
export interface DiaLinha {
  dia: string
  data: string
  semana: string
  sessoes: number
  faixa: string
  tempo: string
  ipPrincipal: string
  ipsExtra: number
  ips: string[]
  aparelhoPrincipal: string
  aparelhosExtra: number
  aparelhos: string[]
  paginas: string
  ativa: boolean
}

export interface DiaDetalheSessao {
  id: string; inicio: string; fim: string; duracao: string; ip: string; aparelho: string; metodo: string; origem: string
  status: 'ativa' | 'inativa' | 'encerrada'; motivo: string | null
}
export interface DiaDetalhe {
  dia: string
  titulo: string
  tempoTotal: string
  sessoes: DiaDetalheSessao[]
  ips: { valor: string; sessoes: number }[]
  aparelhos: { valor: string; sessoes: number }[]
  paginas: { rota: string; vistas: number; tempo: string; seg: number }[]
  eventosResumo: { rotulo: string; total: number }[]
  eventos: { hora: string; rotulo: string; item: string }[]
  truncado: boolean
  semDetalhesDeAtividade: boolean
}

export const diaBrtDe = (iso: string): string => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ_BRT })
export const horaBrtStr = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ_BRT }) : '—'

/** Janela [início, fim) UTC do dia BRT (UTC−3, sem horário de verão). */
export function janelaDiaBrt(dia: string): { ini: string; fim: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const ini = new Date(`${dia}T03:00:00.000Z`)
  if (isNaN(ini.getTime())) return null
  return { ini: ini.toISOString(), fim: new Date(ini.getTime() + 86_400_000).toISOString() }
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function fmtDiaBr(dia: string): { data: string; semana: string } {
  const [y, m, d] = dia.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  return { data: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`, semana: SEMANA[dt.getUTCDay()] ?? '' }
}

/** "42s", "5 min", "2 h 10 min". Nunca vazio. */
export function fmtTempoSeg(seg: number | null | undefined): string {
  const s = Math.max(0, Math.round(seg ?? 0))
  if (s <= 0) return '< 1 min'
  if (s < 60) return `${s}s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), r = min % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

export function linhaDoDia(a: DiaAgg): DiaLinha {
  const { data, semana } = fmtDiaBr(a.dia)
  const ips = a.ips.map((x) => rotuloIp(x))
  const ipsUnicos = [...new Set(ips)]
  return {
    dia: a.dia, data, semana, sessoes: a.sessoes,
    faixa: a.sessoes > 0 ? `${horaBrtStr(a.primeiro)} – ${horaBrtStr(a.ultimo)}` : '—',
    tempo: fmtTempoSeg(a.tempo_seg),
    ipPrincipal: ipsUnicos[0] ?? '—', ipsExtra: Math.max(0, ipsUnicos.length - 1), ips: ipsUnicos,
    aparelhoPrincipal: a.aparelhos[0] ?? '—', aparelhosExtra: Math.max(0, a.aparelhos.length - 1), aparelhos: a.aparelhos,
    paginas: a.paginas == null ? '—' : String(a.paginas), ativa: a.ativa,
  }
}

/** Agrupa linhas de sessão em dias (fallback em memória quando a RPC não existe). */
export function agruparPorDia(
  sessoes: { iniciado_em: string; ultimo_visto_em: string; encerrado_em: string | null; ip: string | null; aparelho: string | null; seg: number }[],
  janelaAtivaMs: number, agora = Date.now(),
): DiaAgg[] {
  const por = new Map<string, DiaAgg & { _ip: Map<string, number>; _ap: Map<string, number> }>()
  for (const s of sessoes) {
    const dia = diaBrtDe(s.iniciado_em)
    let d = por.get(dia)
    if (!d) { d = { dia, sessoes: 0, primeiro: s.iniciado_em, ultimo: s.ultimo_visto_em, tempo_seg: 0, ips: [], aparelhos: [], paginas: null, ativa: false, _ip: new Map(), _ap: new Map() }; por.set(dia, d) }
    d.sessoes++
    if (s.iniciado_em < d.primeiro) d.primeiro = s.iniciado_em
    if (s.ultimo_visto_em > d.ultimo) d.ultimo = s.ultimo_visto_em
    d.tempo_seg += Math.min(s.seg, 43_200)
    if (!s.encerrado_em && agora - new Date(s.ultimo_visto_em).getTime() <= janelaAtivaMs) d.ativa = true
    if (s.ip) d._ip.set(s.ip, (d._ip.get(s.ip) ?? 0) + 1)
    if (s.aparelho) d._ap.set(s.aparelho, (d._ap.get(s.aparelho) ?? 0) + 1)
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map((x) => x[0])
  return [...por.values()].map(({ _ip, _ap, ...d }) => ({ ...d, ips: top(_ip), aparelhos: top(_ap) }))
}
