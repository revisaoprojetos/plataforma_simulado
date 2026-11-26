/**
 * INVARIANTES DA SAÍDA do Cronograma Adaptativo (seção 13.1 da especificação 3.0) + conferência das restrições declarativas.
 *
 * `verificarInvariantes(plano, regras, ctx)` é PURA: devolve as violações encontradas no plano; não corrige nada.
 * Verificáveis só pelo plano (+ contexto opcional): 1 capacidade do dia, 2 PDFull na semana (≤ N datas), 3 limites por dia,
 * 4 ordem do catálogo, 5 dependência leitura → revisão → questões, e as RESTRIÇÕES ativas.
 * Dependem de contexto que o plano não carrega e por isso NÃO são verificadas aqui: 6 (fluxo de questões até 24h30 — precisa da
 * rotina/reta final), 7 (prioridade de LegProc — decisão do motor), 8 (evidência individual de desempenho), 9 (preservação em recálculo).
 */
import { semDe, type Plano, type AulaAS } from './motor28'
import { normalizarRegras, resolverFaixa, type RegrasMotor, type RestricaoRegra } from './regras'
import { restricaoBloqueia, descreverRestricao, somaDiasISO } from './restricoes'
import { familiaDoTipo } from './tipos-meta'
import { ehIdGx } from './gx-tipos'

export const INVARIANTES_NAO_VERIFICAVEIS: readonly number[] = [6, 7, 8, 9]
export const ROTULO_INVARIANTE: Readonly<Record<number, string>> = {
  1: 'Capacidade do dia', 2: 'PDFull na mesma semana', 3: 'Limites por dia', 4: 'Ordem do catálogo', 5: 'Leitura → revisão → questões',
  6: 'Questões nas semanas obrigatórias', 7: 'LegProc por último', 8: 'Evidência de desempenho', 9: 'Preservação ao recalcular', 0: 'Restrição',
}

export interface Violacao {
  /** 1–5 = invariante da especificação; 0 = restrição declarativa. */
  invariante: number
  mensagem: string
  data?: string
  ids?: string[]
  /** id da restrição violada (invariante 0). */
  restricaoId?: string
}

export interface CtxInvariantes {
  /** início do plano (necessário p/ invariantes por semana: 2 e jp). */
  start?: string
  /** horas de estudo no dia (habilita a invariante 1). */
  horasDia?: (d: string) => number
  /** catálogo (habilita a invariante 4). */
  AS?: AulaAS[]
  /** ordem editorial dos índices de aula (padrão: o próprio índice). */
  ordem?: number[]
  /** chave da lei (LegProc) de uma meta, p/ contar leis distintas por dia. */
  leiDe?: (id: string) => string | undefined
  /** faixa de carga (1/2/3) da semana do dia — p/ restrições com escopo por faixa. Padrão: 3 (vale só p/ restrições sem escopo). */
  faixaDe?: (d: string) => number
  /** detalhes das metas (pai das partes de PDFull). */
  detalhes?: Record<string, { pai?: string }>
}

const REG_PF = /^(?:pf:\d+|pp:\d+:\d+)$/
const idx = (id: string) => Number(id.split(':')[1])
const fam = (id: string) => familiaDoTipo(id.split(':')[0])
const ymd = (d: string) => d.slice(0, 10)

export function verificarInvariantes(plano: Plano, regrasEntrada?: unknown, ctx: CtxInvariantes = {}): Violacao[] {
  const R: RegrasMotor = normalizarRegras(regrasEntrada)
  const v: Violacao[] = []
  const porDia = new Map<string, string[]>()
  for (const [id, [data]] of Object.entries(plano)) { const l = porDia.get(data); if (l) l.push(id); else porDia.set(data, [id]) }
  const paiDe = (id: string) => ctx.detalhes?.[id]?.pai || (id.startsWith('pp:') ? 'pf:' + idx(id) : id)

  // 1 — capacidade
  if (ctx.horasDia) for (const [d, ids] of porDia) {
    const cap = Math.round(ctx.horasDia(d) * 60), usado = Math.round(ids.reduce((n, id) => n + plano[id][1] * 60, 0))
    if (cap <= 0) v.push({ invariante: 1, mensagem: `Dia sem disponibilidade (folga) recebeu ${ids.length} meta(s).`, data: d, ids })
    else if (usado > cap + 1) v.push({ invariante: 1, mensagem: `Dia com ${usado} min planejados para ${cap} min disponíveis.`, data: d, ids })
  }

  // 2 — PDFull termina na semana em que começa, em até N datas
  const partes = new Map<string, string[]>()
  for (const id of Object.keys(plano)) if (REG_PF.test(id)) { const p = 'pf:' + idx(id), l = partes.get(p); if (l) l.push(id); else partes.set(p, [id]) }
  for (const [p, ids] of partes) {
    const datas = [...new Set(ids.map((id) => plano[id][0]))]
    if (datas.length > R.divisao.maxDatas) v.push({ invariante: 2, mensagem: `PDFull ${p} dividido em ${datas.length} datas (máximo ${R.divisao.maxDatas}).`, ids })
    if (ctx.start && new Set(datas.map((d) => semDe(ctx.start as string, d))).size > 1) v.push({ invariante: 2, mensagem: `PDFull ${p} atravessa semanas.`, ids })
  }

  // 3 — limites por dia (+ Jurisprudência 1 por semana)
  for (const [d, ids] of porDia) {
    const pdf = new Set(ids.filter((k) => fam(k) === 'pf').map(paiDe)).size
    const fl = ids.filter((k) => fam(k) === 'fl'), qu = ids.filter((k) => fam(k) === 'qu'), lp = ids.filter((k) => fam(k) === 'lp')
    if (pdf > R.limitesDia.pdfDistintos) v.push({ invariante: 3, mensagem: `${pdf} PDFulls distintos (máximo ${R.limitesDia.pdfDistintos}).`, data: d })
    if (fl.length > R.limitesDia.revisoes) v.push({ invariante: 3, mensagem: `${fl.length} revisões (máximo ${R.limitesDia.revisoes}).`, data: d, ids: fl })
    if (qu.length > R.limitesDia.questoes) v.push({ invariante: 3, mensagem: `${qu.length} metas de questões (máximo ${R.limitesDia.questoes}).`, data: d, ids: qu })
    if (lp.length > R.legproc.metasDiaMax) v.push({ invariante: 3, mensagem: `${lp.length} metas de LegProc (máximo ${R.legproc.metasDiaMax}).`, data: d, ids: lp })
    if (ctx.leiDe) { const leis = new Set(lp.map((k) => ctx.leiDe?.(k)).filter(Boolean)); if (leis.size > R.legproc.leisDistintas) v.push({ invariante: 3, mensagem: `${leis.size} leis distintas no dia (máximo ${R.legproc.leisDistintas}).`, data: d, ids: lp }) }
  }
  if (ctx.start) {
    const jp = new Map<number, string[]>()
    for (const [id, [d]] of Object.entries(plano)) if (id.startsWith('jp:')) { const s = semDe(ctx.start, d), l = jp.get(s); if (l) l.push(id); else jp.set(s, [id]) }
    for (const [s, ids] of jp) if (ids.length > 1) v.push({ invariante: 3, mensagem: `${ids.length} metas de Jurisprudência na semana ${s} (uma por semana).`, ids })
  }

  // 4 — ordem do catálogo dentro de cada disciplina (data de conclusão do PDFull não regride)
  if (ctx.AS) {
    const pos = new Map<number, number>((ctx.ordem ?? ctx.AS.map((_, i) => i)).map((i, k) => [i, k]))
    const porDisc = new Map<string, Array<{ i: number; fim: string }>>()
    for (const [p, ids] of partes) {
      const i = idx(p), disc = ctx.AS[i]?.[0]
      if (!disc || !pos.has(i)) continue
      const fim = ids.map((id) => plano[id][0]).sort().pop() as string
      const l = porDisc.get(disc); if (l) l.push({ i, fim }); else porDisc.set(disc, [{ i, fim }])
    }
    for (const [disc, l] of porDisc) {
      l.sort((a, b) => (pos.get(a.i) as number) - (pos.get(b.i) as number))
      for (let k = 1; k < l.length; k++) if (l[k].fim < l[k - 1].fim) v.push({ invariante: 4, mensagem: `${disc}: a aula ${l[k].i} foi lida antes da aula ${l[k - 1].i}, que vem antes no catálogo.`, ids: ['pf:' + l[k].i, 'pf:' + l[k - 1].i] })
    }
  }

  // 5 — regular: questões depois da leitura e da revisão
  for (const [id, [d]] of Object.entries(plano)) {
    const m = /^(fl|qu):(\d+)$/.exec(id); if (!m) continue
    const ult = [...(partes.get('pf:' + m[2]) ?? [])].map((k) => plano[k][0]).sort().pop()
    if (ult && d < ult) v.push({ invariante: 5, mensagem: `${id} antes da leitura do mesmo tema.`, data: d, ids: [id, 'pf:' + m[2]] })
    if (m[1] === 'qu' && plano['fl:' + m[2]] && d < plano['fl:' + m[2]][0]) v.push({ invariante: 5, mensagem: `${id} antes da revisão do mesmo tema.`, data: d, ids: [id, 'fl:' + m[2]] })
  }

  // FASE 3a — limites por tipo gx (maxPorDia / maxPorSemana por slug do catálogo; só quando há regras do tipo)
  const tg = R.tiposGx ?? {}
  if (Object.keys(tg).length) {
    const slugDe = (id: string) => id.split(':')[1]
    for (const [d, ids] of porDia) {
      const cont = new Map<string, string[]>()
      for (const id of ids) if (ehIdGx(id)) { const s = slugDe(id), l = cont.get(s); if (l) l.push(id); else cont.set(s, [id]) }
      for (const [s, l] of cont) { const max = tg[s]?.maxPorDia; if (max != null && l.length > max) v.push({ invariante: 3, mensagem: `Tipo "${s}": ${l.length} metas no dia (máximo ${max}).`, data: d, ids: l }) }
    }
    if (ctx.start) {
      const sem = new Map<string, string[]>()
      for (const [id, [d]] of Object.entries(plano)) if (ehIdGx(id)) { const k = slugDe(id) + '|' + semDe(ctx.start, d), l = sem.get(k); if (l) l.push(id); else sem.set(k, [id]) }
      for (const [k, l] of sem) { const [s, w] = k.split('|'), max = tg[s]?.maxPorSemana; if (max != null && l.length > max) v.push({ invariante: 3, mensagem: `Tipo "${s}": ${l.length} metas na semana ${w} (máximo ${max}).`, ids: l }) }
    }
  }

  // restrições declarativas ativas
  const ativas = R.restricoes.filter((r) => r.ativa)
  if (ativas.length) v.push(...verificarRestricoes(plano, ativas, porDia, ctx, paiDe, ctx.faixaDe ?? (ctx.horasDia ? faixaPorHoras(ctx.horasDia, R) : () => 3)))
  return v
}

/** Faixa (1/2/3) da semana de `d` pela soma das horas dos 7 dias (segunda a domingo). Aproximação da rotina vigente. */
export function faixaPorHoras(horasDia: (d: string) => number, R: RegrasMotor): (d: string) => number {
  const cache = new Map<string, number>()
  return (d: string) => {
    const dow = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7, seg = somaDiasISO(d, -dow)
    let f = cache.get(seg)
    if (f === undefined) { let min = 0; for (let k = 0; k < 7; k++) min += Math.round(horasDia(somaDiasISO(seg, k)) * 60); f = resolverFaixa(min, R); cache.set(seg, f) }
    return f
  }
}

function verificarRestricoes(plano: Plano, ativas: RestricaoRegra[], porDia: Map<string, string[]>, ctx: CtxInvariantes, paiDe: (id: string) => string, faixaDe: (d: string) => number): Violacao[] {
  const out: Violacao[] = [], vistos = new Set<string>()
  const idsDoDia = (d: string) => porDia.get(d) ?? []
  for (const r of ativas) for (const [d, ids] of porDia) {
    const dia = ymd(d)
    for (const id of ids) {
      const f = fam(id)
      if (f !== r.tipoA && !(r.tipoB && f === r.tipoB)) continue
      const bloq = restricaoBloqueia([r], id, d, {
        idsDoDia, dataDe: (k) => plano[k]?.[0], faixa: faixaDe(d), pai: paiDe,
        // "só na sobra": o dia só tem A e há meta de outro tipo (≠ LegProc) planejada em data posterior
        haOutrosPendentes: (fa) => Object.entries(plano).some(([k, [dk]]) => dk > d && fam(k) !== fa && fam(k) !== 'lp' && fam(k) !== 'gx'),
      })
      if (!bloq) continue
      const chave = `${r.id}|${dia}|${r.tipo === 'depois_de' ? id : ''}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      out.push({ invariante: 0, restricaoId: r.id, data: dia, ids: [id], mensagem: `Restrição "${r.rotulo || descreverRestricao(r)}" violada em ${dia.split('-').reverse().join('/')} (${id}).` })
    }
  }
  return out
}
