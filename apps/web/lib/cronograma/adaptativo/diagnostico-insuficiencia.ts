import { minPdf, VEL_PADRAO, type AulaAS } from './motor28'
import { REGRAS_PADRAO, type RegrasMotor } from './regras'

// DIAGNÓSTICO de plano inviável (módulo PURO, só comunicação). Quando o motor lança ErroInsuficiencia ("ultrapassa N semanas…"), isto
// estima a CAUSA PROVÁVEL com os mesmos números do motor (minPdf, regra divisao.maxDatas, bloco de 30 min, teto de semanas). NÃO roda o
// motor, NÃO altera alocação/ordem/saída: é uma estimativa de leitura (PDFull) usada só para explicar o erro ao aluno e ao suporte.

export type CausaInviavel = 'aula_maior_que_melhores_dias' | 'velocidade_suspeita' | 'carga_acima_do_teto' | 'disponibilidade_insuficiente'

/** Velocidade manual abaixo disto (pg/h) é tratada como suspeita (padrão do motor: 17). */
export const VEL_SUSPEITA = 8

export interface EntradaDiagnostico {
  cfg: { horas: number[]; rotinas?: Array<{ horas: number[] }>; vel?: number; discs: string[] }
  AS: AulaAS[]
  /** teto de semanas efetivo do motor (params.maxSemanas, 20..horizonte). */
  maxSemanas?: number
  velPadrao?: number
  regras?: RegrasMotor
}

export interface DetalhesInviavel {
  vel: number
  velManual: boolean
  aula?: { nome: string; disciplina: string; paginas: number; horas: number }
  melhoresDiasHoras?: number
  maxDatas?: number
  jornadaMinimaHoras?: number
  velMinimaParaCaber?: number
  cargaLeituraHoras?: number
  horasSemana?: number
  semanasNecessarias?: number
  maxSemanas?: number
}
export interface Diagnostico { causa: CausaInviavel; mensagem: string; detalhes: DetalhesInviavel }

/** Erro de domínio levado do servidor à rota (HTTP 422). Mantém a frase do motor ("Nenhuma alteração foi aplicada"). */
export class ErroPlanoInviavel extends Error {
  readonly codigo = 'plano_inviavel' as const
  constructor(public readonly causa: CausaInviavel, mensagem: string, public readonly detalhes: DetalhesInviavel) { super(mensagem); this.name = 'ErroPlanoInviavel' }
}

const h1 = (min: number) => Math.round((min / 60) * 10) / 10
const fh = (min: number) => h1(min).toLocaleString('pt-BR') + ' h'

export function diagnosticarInsuficiencia(e: EntradaDiagnostico): Diagnostico {
  const R = e.regras ?? REGRAS_PADRAO
  const BLK = R.constantes.blocoMin, N = Math.max(1, R.divisao.maxDatas)
  const velPadrao = e.velPadrao && e.velPadrao > 0 ? e.velPadrao : VEL_PADRAO
  const velManual = !!(e.cfg.vel && e.cfg.vel > 0)
  const vel = velManual ? (e.cfg.vel as number) : velPadrao
  const maxSem = Math.max(1, e.maxSemanas ?? R.horizonte.maxSemanas)

  // Melhor rotina entre a base e as rotinas datadas (a leitura mais favorável: nunca culpar a disponibilidade sem necessidade).
  const dias = (horas: number[]) => horas.slice(0, 7).map((h) => Math.max(0, Math.floor(((+h || 0) * 60) / BLK) * BLK))
  const nMelhores = (horas: number[]) => dias(horas).sort((a, b) => b - a).slice(0, N).reduce((s, v) => s + v, 0)
  const rotinas = [e.cfg.horas, ...(e.cfg.rotinas ?? []).map((r) => r.horas)].filter((r) => Array.isArray(r))
  const melhor = rotinas.reduce((m, r) => (nMelhores(r) > nMelhores(m) ? r : m), rotinas[0] ?? [])
  const somaMelhores = nMelhores(melhor)
  const semanalMin = Math.max(...rotinas.map((r) => dias(r).reduce((s, v) => s + v, 0)), 0)

  const ativas = e.AS.filter((a) => a && e.cfg.discs.includes(a[0]))
  let maior = { i: -1, min: 0 }
  let carga = 0
  ativas.forEach((a, i) => { const m = minPdf(a[3], vel, velPadrao); carga += m; if (m > maior.min) maior = { i, min: m } })
  const aulaMaior = maior.i >= 0 ? ativas[maior.i] : null

  const base: DetalhesInviavel = { vel, velManual, maxDatas: N, maxSemanas: maxSem }
  const aulaCabe = !aulaMaior || maior.min <= somaMelhores
  const semanasNec = semanalMin > 0 ? Math.ceil(carga / semanalMin) : Infinity
  const cargaAcima = semanasNec > maxSem
  const fim = ' Nenhuma alteração foi aplicada.'

  const aulaInfo = aulaMaior ? { nome: aulaMaior[2] || aulaMaior[1] || 'Aula', disciplina: aulaMaior[0], paginas: aulaMaior[3], horas: h1(maior.min) } : undefined
  const jornada = h1(Math.ceil(maior.min / N / BLK) * BLK)
  // velocidade com que a maior aula caberia nos N melhores dias (arredonda para cima, em pg/h)
  const velCabe = aulaMaior && somaMelhores > 0 ? Math.ceil((aulaMaior[3] || 60) / (somaMelhores / 60 / 2) / 2) : undefined

  if (velManual && vel < VEL_SUSPEITA && (!aulaCabe || cargaAcima)) {
    return { causa: 'velocidade_suspeita', detalhes: { ...base, aula: aulaInfo, melhoresDiasHoras: h1(somaMelhores), velMinimaParaCaber: velCabe, cargaLeituraHoras: h1(carga), semanasNecessarias: Number.isFinite(semanasNec) ? semanasNec : undefined },
      mensagem: `A velocidade de leitura informada (${vel.toLocaleString('pt-BR')} pg/h) parece baixa — o padrão é ${velPadrao} pg/h — e faz as aulas ficarem enormes${aulaInfo ? ` (a maior, “${aulaInfo.nome}”, levaria ${aulaInfo.horas.toLocaleString('pt-BR')} h)` : ''}. Revise a velocidade em “Configurar” e tente novamente.${fim}` }
  }
  if (!aulaCabe && aulaInfo) {
    return { causa: 'aula_maior_que_melhores_dias', detalhes: { ...base, aula: aulaInfo, melhoresDiasHoras: h1(somaMelhores), jornadaMinimaHoras: jornada, velMinimaParaCaber: velCabe },
      mensagem: `A aula “${aulaInfo.nome}” (${aulaInfo.horas.toLocaleString('pt-BR')} h de leitura) não cabe nos ${N} melhores dias da sua semana (somam ${fh(somaMelhores)}). Concentre horas em até ${N} dias de pelo menos ${jornada.toLocaleString('pt-BR')} h cada, ou aumente a velocidade de leitura${velCabe ? ` (a partir de ~${velCabe} pg/h essa aula passa a caber)` : ''}.${fim}` }
  }
  if (cargaAcima) {
    return { causa: 'carga_acima_do_teto', detalhes: { ...base, cargaLeituraHoras: h1(carga), horasSemana: h1(semanalMin), semanasNecessarias: Number.isFinite(semanasNec) ? semanasNec : undefined },
      mensagem: `A carga de leitura das matérias escolhidas (~${fh(carga)}) ${Number.isFinite(semanasNec) ? `exigiria cerca de ${semanasNec} semanas com ${fh(semanalMin)} por semana` : 'não tem horas disponíveis na semana'}, acima do limite de ${maxSem} semanas. Aumente as horas semanais ou retire matérias.${fim}` }
  }
  return { causa: 'disponibilidade_insuficiente', detalhes: { ...base, cargaLeituraHoras: h1(carga), horasSemana: h1(semanalMin) },
    mensagem: `Não foi possível distribuir todas as metas com a disponibilidade informada. Aumente as horas de estudo ou reduza as matérias e tipos de meta e tente novamente.${fim}` }
}

/** O erro é o ErroInsuficiencia do motor? (por nome/código, sem importar o motor). */
export const ehInsuficiencia = (e: unknown): boolean => !!e && typeof e === 'object' && ((e as { codigo?: string }).codigo === 'insuficiencia' || (e as { name?: string }).name === 'ErroInsuficiencia')

/** teto de semanas efetivo do motor (mesma conta de gerarPlanoCatalogo: min(horizonte, max(20, params.maxSemanas))). */
export const maxSemanasEfetivo = (params: { maxSemanas?: number } | null | undefined, regras?: RegrasMotor): number => {
  const HZ = (regras ?? REGRAS_PADRAO).horizonte.maxSemanas
  return Math.min(HZ, Math.max(20, params?.maxSemanas ?? HZ))
}
