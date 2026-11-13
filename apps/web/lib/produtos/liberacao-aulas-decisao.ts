// Decisão PURA (sem I/O, sem 'server-only') da liberação de aulas do extensivo por planilha/cronograma.
// Usada por liberacao-aulas-aluno.ts (servidor) e pelos testes (liberacao-aulas-decisao.test.ts).

import { liberaEmTrilha, type TrilhaAulaDatas } from './liberacao-trilhas-calc'

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
  | 'excecao-liberar' | 'bloqueado-admin'

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

/** Exceção já resolvida para a aula (resultado de resolverExcecao); null = nenhuma vigente. */
export type ExcecaoResolvida = { acao: 'liberar' | 'bloquear'; motivo?: string | null } | null

/**
 * NÚCLEO ÚNICO da decisão de UMA aula para UM aluno: exceção manual vigente vence tudo; senão `decidirLiberacao`
 * (planilha/trilha já resolvidas em `linha`, cronograma fixado em `plano`). Usado pelo motor do aluno
 * (liberacao-aulas-aluno.ts) e pela consulta admin "por que este aluno vê esta aula" — mesma função, mesma decisão.
 */
export function decidirAulaComExcecao(a: {
  excecao: ExcecaoResolvida
  cfg: ParamsLiberacao & { ativo?: boolean }
  linha: { data_liberacao: string | null } | null
  plano: PlanoAula
  hoje: string
}): Decisao {
  if (a.excecao) {
    return a.excecao.acao === 'liberar'
      ? { liberada: true, motivo: 'excecao-liberar', liberaEm: null, interfere: true }
      : { liberada: false, motivo: 'bloqueado-admin', liberaEm: null, interfere: true }
  }
  return decidirLiberacao({ cfg: a.cfg, linha: a.linha, plano: a.plano, hoje: a.hoje })
}

/**
 * Regra 'cronograma' que governa um módulo/aula: a própria (segmento tem prioridade sobre a base), ou — se a própria é só a
 * base neutra (sem segmento, vazia ou 'na_matricula') — a do ancestral mais próximo. null = não governado pelo cronograma.
 * `propria(id, base)` devolve a disponibilidade própria e se veio de segmento.
 */
export function regraCronogramaGovernante(
  id: string, base: unknown,
  porId: ReadonlyMap<string, { id: string; pai_id: string | null; disponibilidade?: unknown }>,
  propria: (id: string, base: unknown) => { d: unknown; seg: boolean },
): unknown | null {
  const p = propria(id, base)
  if (ehDispCronograma(p.d)) return p.d
  const baseNeutra = !p.seg && (!p.d || (p.d as { tipo?: string }).tipo === 'na_matricula')
  if (!baseNeutra) return null
  let cur = porId.get(id)?.pai_id ?? null; let g = 0
  while (cur && g++ < 50) {
    const m = porId.get(cur); if (!m) break
    const pa = propria(m.id, m.disponibilidade)
    if (ehDispCronograma(pa.d)) return pa.d
    cur = m.pai_id
  }
  return null
}

// ── Rótulo do cadeado (texto calculado no servidor; a UI só exibe) ─────────────────────────────────
const DIA_CURTO = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']
const DIA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

export interface RotuloEntrada {
  /** planilha = sem cronograma; plano = cronograma fixado libera; concluir = aguarda concluir a meta (previsão). */
  origem: 'planilha' | 'plano' | 'concluir'
  /** Nome da trilha (cronograma) de onde veio a data; só vale com origem 'planilha' (a data-base do aluno = a da trilha). */
  trilha?: string | null
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
  if (i.origem === 'planilha' && i.trilha) {
    if (!data) return null
    // a semana da planilha-base NÃO é a da trilha: só é exibida quando o chamador a informar explicitamente
    return `Libera em ${DIA_CURTO[dow!]}, ${dataBr(data, true)} · cronograma ${i.trilha}${sem ? ` · semana ${sem}` : ''}`
  }
  const de = i.origem === 'plano' ? 'do seu cronograma' : 'do cronograma'
  if (data) return `Libera em ${DIA_CURTO[dow!]}, ${dataBr(data, true)}${sem ? ` · semana ${sem} ${de}` : ''}`
  if (i.origem === 'plano' && dow != null && sem) return `Libera ${dow === 0 || dow === 6 ? 'no' : 'na'} ${DIA_LONGO[dow]} da semana ${sem} ${de}`
  return null
}

export const ROTULO_BLOQUEADO_ADMIN = 'Bloqueado pelo administrador'

// ── Trilhas (cronogramas por Segmento) ────────────────────────────────────────────────────────────
export interface TrilhaDaAula { nome: string; datas: TrilhaAulaDatas }

/**
 * Data-base efetiva de UMA aula para o aluno. `trilhas` = só as trilhas em que o aluno CASA (na ordem de exibição),
 * cada uma com as datas da aula nela (null/sem data = a trilha não traz a aula e NÃO contribui).
 * Várias trilhas trazendo a aula → MENOR liberaEmTrilha (empate: a 1ª). Nenhuma traz → data da planilha (origem 'planilha').
 */
export function dataBaseDaAula(trilhas: TrilhaDaAula[], planilha: string | null): { data: string | null; trilha: string | null } {
  let best: { data: string; trilha: string } | null = null
  for (const t of trilhas) {
    const d = liberaEmTrilha(t.datas)
    if (d && (!best || d < best.data)) best = { data: d, trilha: t.nome }
  }
  return best ?? { data: planilha, trilha: null }
}

// ── Exceções manuais (liberar/bloquear aula ou módulo para aluno OU grupo) ─────────────────────────
export interface ExcecaoLib {
  alvo_tipo: 'aula' | 'modulo'
  alvo_id: string
  estudante_id: string | null
  grupo_id: string | null
  acao: 'liberar' | 'bloquear'
  motivo?: string | null
  expira_em?: string | null
  ativo?: boolean
}

/** Exceções que valem para o aluno agora: ativas, não expiradas, do próprio aluno ou de grupo do qual ele é membro (ativo). */
export function excecoesAplicaveis(excs: ExcecaoLib[], aluno: { estudanteId: string; grupos: ReadonlySet<string> }, agoraIso: string): ExcecaoLib[] {
  return excs.filter((e) => {
    if (e.ativo === false) return false
    if (e.expira_em && e.expira_em <= agoraIso) return false
    if (e.estudante_id) return e.estudante_id === aluno.estudanteId
    return !!e.grupo_id && aluno.grupos.has(e.grupo_id)
  })
}

/**
 * Exceção vigente para um alvo. `cadeia` = [alvo, pai, avô…] (exceção em módulo vale para tudo dentro).
 * PRECEDÊNCIA: bloquear (em qualquer nível da cadeia, de qualquer origem aluno/grupo) > liberar > null.
 * Entre várias do mesmo tipo, vale a do alvo mais próximo (só afeta o motivo exibido).
 */
export function resolverExcecao(cadeia: string[], aplicaveis: ExcecaoLib[]): { acao: 'liberar' | 'bloquear'; motivo: string | null; alvoId: string } | null {
  if (!aplicaveis.length) return null
  const set = new Set(cadeia)
  let lib: ExcecaoLib | null = null
  for (const alvo of cadeia) {
    for (const e of aplicaveis) {
      if (e.alvo_id !== alvo || !set.has(e.alvo_id)) continue
      if (e.acao === 'bloquear') return { acao: 'bloquear', motivo: e.motivo ?? null, alvoId: e.alvo_id }
      if (!lib) lib = e
    }
  }
  return lib ? { acao: 'liberar', motivo: lib.motivo ?? null, alvoId: lib.alvo_id } : null
}
