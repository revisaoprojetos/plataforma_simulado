/**
 * FAIXA POR PERÍODO (D3) — resumo por semana de um plano JÁ GERADO: faixa efetiva (rotina vigente da semana), teto de PDFull aplicado,
 * metas por tipo, ocupação (min usados × disponíveis) e violações. PURO (sem I/O); o cálculo roda no servidor (action) e a tela só lê.
 * Não altera o plano nem o motor: consulta `rotina300`/`tetoInfo300`/`horasDia` com a MESMA cfg e regras do plano.
 */
import { semDe, semInicio, dAdd, horasDia, ehRev, type Cfg28, type Plano } from './motor28'
import { rotina300, tetoInfo300, type RegrasMotor } from './motor30'
import type { Violacao } from './invariantes'
import { familiaDoTipo } from './tipos-meta'

export interface LinhaSemana {
  sem: number
  /** segunda-feira da semana (YYYY-MM-DD). */
  inicio: string
  /** faixa de carga efetiva (1/2/3) pela rotina da semana. */
  faixa: 1 | 2 | 3
  /** carga semanal disponível (min) e usada (min). */
  minDisponiveis: number
  minUsados: number
  /** minUsados / minDisponiveis em % (0 quando não há disponibilidade). */
  ocupacaoPct: number
  /** teto de PDFulls NOVOS por semana aplicado e quantos começaram na semana. */
  tetoPdf: number
  pdfNovos: number
  /** metas por tipo (prefixo do id: pf, pp, fl, qu, lp, jp, rf, rq…). */
  metasPorTipo: Record<string, number>
  totalMetas: number
  /** semana de revisão (especial/obrigatória) segundo o motor. */
  revisao: boolean
  /** violações (invariantes/restrições) cujas datas caem na semana. */
  violacoes: number
}

export const LIMITE_SEMANAS_ANALISE = 156

/** Resume o plano por semana (cfg/regras = os do plano). Até `limite` semanas. */
export function resumirPorSemana(
  plano: Plano, cfg: Cfg28, regras: RegrasMotor, violacoes: readonly Violacao[] = [], limite = LIMITE_SEMANAS_ANALISE,
): LinhaSemana[] {
  const linhas = new Map<number, LinhaSemana>()
  const linha = (sem: number): LinhaSemana => {
    let l = linhas.get(sem)
    if (!l) {
      const inicio = semInicio(cfg.start, sem)
      let disp = 0
      for (let k = 0; k < 7; k++) disp += Math.round(horasDia(cfg, dAdd(inicio, k)) * 60)
      const ti = tetoInfo300(cfg, sem, regras)
      l = { sem, inicio, faixa: rotina300(cfg, sem, cfg.start, regras).faixa, minDisponiveis: disp, minUsados: 0, ocupacaoPct: 0, tetoPdf: ti.teto, pdfNovos: 0, metasPorTipo: {}, totalMetas: 0, revisao: !!ehRev(cfg, sem, regras), violacoes: 0 }
      linhas.set(sem, l)
    }
    return l
  }
  const inicioPdf = new Map<string, string>()
  for (const [id, [data]] of Object.entries(plano)) {
    const t = id.split(':')[0]
    const l = linha(semDe(cfg.start, data))
    l.metasPorTipo[t] = (l.metasPorTipo[t] || 0) + 1; l.totalMetas++
    l.minUsados += Math.round(plano[id][1] * 60)
    if ((t === 'pf' || t === 'pp') && !/:(revisao|reforco):/.test(id) && familiaDoTipo(t) === 'pf') {
      const k = id.split(':')[1], a = inicioPdf.get(k)
      if (!a || data < a) inicioPdf.set(k, data)
    }
  }
  for (const data of inicioPdf.values()) linha(semDe(cfg.start, data)).pdfNovos++
  for (const v of violacoes) if (v.data) linha(semDe(cfg.start, v.data)).violacoes++
  return [...linhas.values()].sort((a, b) => a.sem - b.sem).slice(0, limite).map((l) => ({ ...l, ocupacaoPct: l.minDisponiveis ? Math.round((l.minUsados / l.minDisponiveis) * 100) : 0 }))
}
