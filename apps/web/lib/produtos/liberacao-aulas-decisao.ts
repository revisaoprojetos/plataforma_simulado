// Decisão PURA (sem I/O, sem 'server-only') da liberação de aulas do extensivo por planilha/cronograma.
// Usada por liberacao-aulas-aluno.ts (servidor) e pelos testes (liberacao-aulas-decisao.test.ts).

export type SemPlano = 'planilha' | 'liberado' | 'atual'
export type ComPlano = 'concluir_meta' | 'plano' | 'mais_cedo'

/** Disponibilidade do tipo 'cronograma' (jsonb de simulado_produto_disponibilidade_seg ou disponibilidade base do item). */
export interface DispCronograma {
  tipo: 'cronograma'
  sem_plano?: SemPlano
  com_plano?: ComPlano
  dias_antes?: number
  antes?: 'bloqueado_cadeado' | 'oculto'
}

export function ehDispCronograma(d: unknown): d is DispCronograma {
  return !!d && typeof d === 'object' && (d as { tipo?: unknown }).tipo === 'cronograma'
}

export interface ParamsLiberacao { sem_plano: SemPlano; com_plano: ComPlano; dias_antes: number }
export const PARAMS_PADRAO: ParamsLiberacao = { sem_plano: 'planilha', com_plano: 'concluir_meta', dias_antes: 0 }

/** Params efetivos: o que a regra traz; senão o padrão da cfg do produto; senão o padrão fixo. */
export function paramsEfetivos(regra: unknown, cfg?: Partial<ParamsLiberacao> | null): ParamsLiberacao {
  const r = (regra && typeof regra === 'object' ? regra : {}) as Record<string, unknown>
  const c = cfg ?? {}
  const sp = (v: unknown): v is SemPlano => v === 'planilha' || v === 'liberado' || v === 'atual'
  const cp = (v: unknown): v is ComPlano => v === 'concluir_meta' || v === 'plano' || v === 'mais_cedo'
  const dias = Math.trunc(Number(r.dias_antes ?? c.dias_antes))
  return {
    sem_plano: sp(r.sem_plano) ? r.sem_plano : sp(c.sem_plano) ? c.sem_plano : PARAMS_PADRAO.sem_plano,
    com_plano: cp(r.com_plano) ? r.com_plano : cp(c.com_plano) ? c.com_plano : PARAMS_PADRAO.com_plano,
    dias_antes: Number.isFinite(dias) ? Math.max(0, Math.min(365, dias)) : 0,
  }
}

/** Situação da aula no plano fixado do aluno. */
export interface PlanoAula {
  /** O aluno tem cronograma fixado? */
  tem: boolean
  /** A aula tem meta (PDFull) no plano dele? */
  noPlano: boolean
  /** Data (AAAA-MM-DD) da meta da aula no plano (a mais cedo). */
  dataMeta: string | null
  /** Meta já concluída. */
  concluida: boolean
  /** Semana do plano (nº) e dia da semana (0=dom…6=sáb) da meta, quando conhecidos. */
  semana?: number | null
  diaSemana?: number | null
}
export const SEM_PLANO: PlanoAula = { tem: false, noPlano: false, dataMeta: null, concluida: false }

export type MotivoDecisao =
  | 'desligado' | 'planilha' | 'liberado' | 'atual' | 'concluida'
  | 'concluir-meta' | 'plano' | 'mais-cedo' | 'fora-do-plano'

export interface Decisao {
  liberada: boolean
  motivo: MotivoDecisao
  /** AAAA-MM-DD quando bloqueada por DATA; null quando aguarda conclusão de meta (ou já liberada). */
  liberaEm: string | null
  /** false = a regra "não interfere" (sem_plano='atual'): vale a disponibilidade base do item. */
  interfere: boolean
}

export function somarDias(iso: string, d: number): string {
  const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10)
}

const porData = (data: string | null, hoje: string, motivo: MotivoDecisao): Decisao =>
  !data ? { liberada: true, motivo, liberaEm: null, interfere: true } : { liberada: data <= hoje, motivo, liberaEm: data <= hoje ? null : data, interfere: true }

export function decidirLiberacao(a: {
  cfg: ParamsLiberacao & { ativo?: boolean }
  /** Data da planilha (AAAA-MM-DD) da aula; null = a aula não tem linha. */
  linha: { data_liberacao: string | null } | null
  plano: PlanoAula
  /** Hoje em Brasília (AAAA-MM-DD). */
  hoje: string
}): Decisao {
  const { cfg, linha, plano, hoje } = a
  if (cfg.ativo === false) return { liberada: true, motivo: 'desligado', liberaEm: null, interfere: false }
  const planilha = linha?.data_liberacao ?? null

  if (!plano.tem) {
    if (cfg.sem_plano === 'liberado') return { liberada: true, motivo: 'liberado', liberaEm: null, interfere: true }
    if (cfg.sem_plano === 'atual') return { liberada: true, motivo: 'atual', liberaEm: null, interfere: false }
    if (!planilha) return { liberada: true, motivo: 'desligado', liberaEm: null, interfere: false } // sem linha: nada a aplicar
    return porData(planilha, hoje, 'planilha')
  }

  // COM cronograma fixado
  if (!plano.noPlano) {
    // aula fora do plano (disciplina não escolhida): na dúvida, data da planilha
    if (!planilha) return { liberada: true, motivo: 'desligado', liberaEm: null, interfere: false }
    return porData(planilha, hoje, 'fora-do-plano')
  }
  if (plano.concluida) return { liberada: true, motivo: 'concluida', liberaEm: null, interfere: true }
  const dataPlano = plano.dataMeta ? somarDias(plano.dataMeta, -cfg.dias_antes) : null
  switch (cfg.com_plano) {
    case 'plano':
      return dataPlano ? porData(dataPlano, hoje, 'plano') : porData(planilha, hoje, 'fora-do-plano')
    case 'mais_cedo': {
      const cand = [planilha, dataPlano].filter((x): x is string => !!x).sort()[0] ?? null
      return porData(cand, hoje, 'mais-cedo')
    }
    default:
      return { liberada: false, motivo: 'concluir-meta', liberaEm: null, interfere: true }
  }
}

// ── Rótulo do cadeado (texto calculado no servidor; a UI só exibe) ─────────────────────────────────
const DIA_CURTO = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']
const DIA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

export interface RotuloEntrada {
  /** planilha = sem cronograma; plano = cronograma fixado libera; concluir = aguarda concluir a meta (previsão). */
  origem: 'planilha' | 'plano' | 'concluir'
  /** AAAA-MM-DD (data civil, sem fuso). */
  data?: string | null
  semana?: number | null
  /** 0=domingo … 6=sábado; usado só quando não há data. */
  diaSemana?: number | null
}

const dowDe = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay()
const dataBr = (iso: string, ano: boolean) => { const [a, m, d] = iso.split('-'); return ano ? `${d}/${m}/${a}` : `${d}/${m}` }
const okDow = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6
const okSem = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** null = sem informação suficiente (o chamador usa a mensagem/“libera em” padrão). */
export function formatarRotuloLiberacao(i: RotuloEntrada): string | null {
  const data = i.data && /^\d{4}-\d{2}-\d{2}$/.test(i.data) ? i.data : null
  const sem = okSem(i.semana) ? i.semana : null
  const dow = data ? dowDe(data) : okDow(i.diaSemana) ? i.diaSemana : null
  if (i.origem === 'concluir') {
    if (!data && (dow == null || !sem)) return null
    const quando = data ? `${DIA_CURTO[dow!]}, ${dataBr(data, false)}` : DIA_LONGO[dow!]
    return `Libera ao concluir a meta (prevista para ${quando}${sem ? ` · semana ${sem}` : ''})`
  }
  const de = i.origem === 'plano' ? 'do seu cronograma' : 'do cronograma'
  if (data) return `Libera em ${DIA_CURTO[dow!]}, ${dataBr(data, true)}${sem ? ` · semana ${sem} ${de}` : ''}`
  if (i.origem === 'plano' && dow != null && sem) return `Libera ${dow === 0 || dow === 6 ? 'no' : 'na'} ${DIA_LONGO[dow]} da semana ${sem} ${de}`
  return null
}
