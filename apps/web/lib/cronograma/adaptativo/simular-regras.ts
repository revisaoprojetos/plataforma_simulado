/**
 * SIMULAÇÃO de regras do motor: gera o MESMO plano de exemplo com as regras propostas × as vigentes e devolve o DIFF resumido.
 * PURO (sem I/O): quem chama entrega o conteúdo (AS/LP/ordem), os params e a cfg de exemplo. Usado pela action `simularRegras`
 * (tela de simulação) e testável com o catálogo de referência. Não grava nada.
 */
import { gerarPlano as gerarPlanoMotor, horasDia, VERSAO_MOTOR } from './motor30'
import { verificarInvariantes, type Violacao } from './invariantes'
import type { Cfg28, AulaAS, ItemLP, Plano } from './motor28'
import { normalizarRegras, type RegrasMotor } from './regras'
import type { ItemGX } from './gx-tipos'
import { ColetorRastro, resultadoRastro, type RastroPlano } from './rastro'
import { resumirPorSemana, type LinhaSemana } from './analise-periodo'

/** `gx` = metas de tipos personalizados do catálogo (FASE 3a): sem elas as regras `tiposGx` dariam diff zero. Ausente/[] = como antes. */
export interface ConteudoSimulacao { AS: AulaAS[]; LP: ItemLP[]; ordem?: number[] | null; params?: unknown; gx?: ItemGX[] }
export interface ResumoSim {
  semanas: number; fim: number; totalMetas: number; metasPorTipo: Record<string, number>
  primeiraData: string | null; ultimaData: string | null; horasTotais: number; erro?: string
  /** violações das invariantes da especificação (1–5) e das restrições ativas (0) no plano gerado. Até 40; o total em `totalViolacoes`. */
  violacoes?: Violacao[]; totalViolacoes?: number
  /** só com `detalhar`: faixa por período (D3) e rastro de decisão (D2). Nunca gravado nem enviado ao aluno. */
  porSemana?: LinhaSemana[]; rastro?: RastroPlano
}
/** Opções da simulação: `detalhar` anexa porSemana + rastro ao resumo do plano PROPOSTO. */
export interface OpcoesSim { detalhar?: boolean }
export interface DiffSim {
  vigente: ResumoSim; proposto: ResumoSim
  deltaFimSemanas: number; deltaMetas: number; deltaPorTipo: Record<string, number>
  idsApenasProposto: number; idsApenasVigente: number; idsComDataDiferente: number
}

const vazio = (erro: string): ResumoSim => ({ semanas: 0, fim: 0, totalMetas: 0, metasPorTipo: {}, primeiraData: null, ultimaData: null, horasTotais: 0, erro })

export function resumirPlano(plano: Plano, fim: number): ResumoSim {
  const metasPorTipo: Record<string, number> = {}
  let primeira: string | null = null, ultima: string | null = null, horas = 0
  for (const [id, [data, h]] of Object.entries(plano)) {
    const t = id.split(':')[0]
    metasPorTipo[t] = (metasPorTipo[t] || 0) + 1
    if (primeira === null || data < primeira) primeira = data
    if (ultima === null || data > ultima) ultima = data
    horas += h
  }
  return { semanas: fim, fim, totalMetas: Object.keys(plano).length, metasPorTipo, primeiraData: primeira, ultimaData: ultima, horasTotais: Math.round(horas * 100) / 100 }
}

function rodar(cfg: Cfg28, c: ConteudoSimulacao, regras: RegrasMotor, hoje: string, detalhar = false): { resumo: ResumoSim; plano: Plano | null } {
  try {
    const coletor = detalhar ? new ColetorRastro() : null
    const r = gerarPlanoMotor(cfg, c.AS, c.LP, {}, null, { ordem: c.ordem ?? undefined, params: (c.params ?? null) as never, regras, hoje, rastro: coletor, ...(c.gx?.length ? { gx: c.gx } : {}) })
    const resumo = resumirPlano(r.plano, r.fim)
    const v = verificarInvariantes(r.plano, regras, { start: cfg.start, horasDia: (d) => horasDia(cfg, d), AS: c.AS, ordem: c.ordem ?? undefined })
    resumo.violacoes = v.slice(0, 40); resumo.totalViolacoes = v.length
    if (detalhar) { resumo.porSemana = resumirPorSemana(r.plano, { ...cfg, motor: VERSAO_MOTOR } as Cfg28, regras, v); const rt = resultadoRastro(coletor)!; resumo.rastro = rt.eventos.length > 500 ? { eventos: rt.eventos.slice(0, 500), descartados: rt.descartados + rt.eventos.length - 500 } : rt }
    return { resumo, plano: r.plano }
  } catch (e) {
    return { resumo: vazio((e as Error)?.message || 'Falha ao gerar o plano.'), plano: null }
  }
}

/** Gera o plano de exemplo com `proposta` e `vigente` e compara. `hoje` explícito (sem relógio implícito). */
export function simularRegrasPuro(cfg: Cfg28, conteudo: ConteudoSimulacao, proposta: unknown, vigente: unknown, hoje: string, opcoes: OpcoesSim = {}): DiffSim {
  const a = rodar(cfg, conteudo, normalizarRegras(vigente), hoje), b = rodar(cfg, conteudo, normalizarRegras(proposta), hoje, !!opcoes.detalhar)
  const deltaPorTipo: Record<string, number> = {}
  for (const t of new Set([...Object.keys(a.resumo.metasPorTipo), ...Object.keys(b.resumo.metasPorTipo)])) {
    const d = (b.resumo.metasPorTipo[t] || 0) - (a.resumo.metasPorTipo[t] || 0)
    if (d) deltaPorTipo[t] = d
  }
  let apenasProp = 0, apenasVig = 0, dataDif = 0
  if (a.plano && b.plano) {
    for (const id of Object.keys(b.plano)) { if (!a.plano[id]) apenasProp++; else if (a.plano[id][0] !== b.plano[id][0]) dataDif++ }
    for (const id of Object.keys(a.plano)) if (!b.plano[id]) apenasVig++
  }
  return { vigente: a.resumo, proposto: b.resumo, deltaFimSemanas: b.resumo.fim - a.resumo.fim, deltaMetas: b.resumo.totalMetas - a.resumo.totalMetas, deltaPorTipo, idsApenasProposto: apenasProp, idsApenasVigente: apenasVig, idsComDataDiferente: dataDif }
}
