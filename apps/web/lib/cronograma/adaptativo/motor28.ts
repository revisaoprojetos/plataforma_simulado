/**
 * MOTOR DO CRONOGRAMA ADAPTATIVO — regras da versão 2.8 (doc "Cronograma_Adaptativo_2.8_Documentacao_TI").
 *
 * FONTE ÚNICA: este arquivo é usado no SERVIDOR (engine.ts → gerarPlano) e, compilado por
 * `pnpm --filter web cronograma:motor` (scripts/build-motor28.mjs), no IFRAME do aluno
 * (public/cronograma/adaptativo/motor28.js → window.Motor28). Sem imports: puro, determinístico.
 *
 * Regras (§ do documento 2.8):
 *  · Prioridade p/ ocupar as horas do dia: Revisão → continuidade de PDFull → PDFull novo → Questões →
 *    LegProc → 2º PDFull novo (só na sobra). Exibição (PDFull, Revisão, Questões, LegProc) é da UI. (§4)
 *  · Limite de PDFull NOVOS por dia: 1 (maisPDFull=false) ou 2; continuação não conta. (§3)
 *  · Histórico prévio ("Já estuda pelo Revisão?"): último tema inclusivo por disciplina fica FORA da
 *    nova programação (PDFull, partes, revisão e questões) — sem criar conclusões fictícias. (§3)
 *  · PDFull: max(30, teto(páginas ÷ ritmo × 2) × 30) min; 60 págs se não informado; aula longa vira
 *    partes (pp:i:k … pf:i) e a continuação vai ao PRÓXIMO dia disponível. (§4)
 *  · Revisão 1 semana de conteúdo depois (60 min) e Questões 2 semanas depois (30 min). (§6)
 *  · Até 18 h/semana (com +1 dia disponível): o ÚLTIMO dia concentra Questões e LegProc; PDFull e
 *    Revisão ficam preferencialmente nos demais. Atrasos de semanas anteriores podem ir a qualquer dia. (§6)
 *  · LegProc: metas de 30 min vinculadas à DISCIPLINA; por dia até 2 blocos (cada um até 2 metas
 *    consecutivas da MESMA lei/disciplina), de disciplinas diferentes, máx. 4 metas; rodízio com janela
 *    de até 6 disciplinas na ordem de cfg.discs. Disciplina não selecionada não fornece LegProc. (§5)
 *  · Semanas especiais de revisão: sem aula nova; reservam revisão+questões; sobra p/ pendências/LegProc. (§6)
 *  · Disponibilidade: horas pontuais da data > recesso (zera) > rotina vigente. (§8)
 *  · Sobras (meta interrompida não-PDFull: Revisão/Questões/LegProc): cfg.sobras[id] = minutos restantes
 *    → mesma meta (mesmo id: tempo/notas preservados), com prioridade no próximo dia disponível. (§7)
 *  · PDFull interrompido: cfg.paginasLidas[i] = última página concluída → o restante é recalculado. (§7)
 */

export type DataISO = string
export type Plano = Record<string, [DataISO, number]>
export type AulaAS = [string, string, string, number, string, string, string?]

export interface ItemLP {
  /** id estável da meta (ex.: "lp:3f9a2c1b0d4e:2"). */
  id: string
  /** disciplina (nome) — vínculo obrigatório; '' = geral (catálogo-semente antigo). */
  disc: string
  /** chave da lei (agrupa blocos de até 2 metas consecutivas). */
  lei: string
  /** orientação de leitura exibida ao aluno (ex.: "Lei 9.717/1998 — arts. 1º a 6º"). */
  texto: string
  /** documento da Biblioteca (abre no leitor). */
  doc?: string | null
  /** duração padrão (min). */
  min?: number
}

export interface Cfg28 {
  start: DataISO
  horas: number[]
  rotinas?: Array<{ desde: DataISO; horas: number[] }>
  recessos?: Array<{ ini: DataISO; fim: DataISO; motivo?: string }>
  horasPontuais?: Record<DataISO, number>
  discs: string[]
  metas: { pf?: boolean; fl?: boolean; qu?: boolean; lp?: boolean }
  revisao?: { ativa?: boolean; cada?: number }
  vel?: number
  maisPDFull?: boolean
  jaEstudaRevisao?: boolean
  /** disciplina → posição (0-based, inclusiva) da última aula estudada na ordem do catálogo; -1 = nenhuma. */
  ultimosTemas?: Record<string, number>
  paginasLidas?: Record<string, number>
  sobras?: Record<string, number>
  /** ids de LegProc que contam como já lidos (equivalência de metas do formato antigo). */
  lpIgnorar?: string[]
  [k: string]: unknown
}

export const VERSAO_MOTOR = '2.8'
export const SEM_FLASH = new Set(['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU'])
export const MAX_SEM = 200
export const VEL_PADRAO = 17
export const DUR: Record<string, number> = { fl: 60, qu: 30, lp: 30 }
export const DUR_REVISAO: Record<string, number> = { rf: 60, rq: 30 }
export const LP_MAX_DIA = 4
export const LP_JANELA = 6
export const LIMITE_18H = 18

// ── datas (ISO local, sem fuso) ──
export function dParse(s: DataISO): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export function dISO(d: Date): DataISO { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
export function dAdd(s: DataISO, n: number): DataISO { const d = dParse(s); d.setDate(d.getDate() + n); return dISO(d) }
export function dDow(s: DataISO): number { return (dParse(s).getDay() + 6) % 7 }
export function dMon(s: DataISO): DataISO { return dAdd(s, -dDow(s)) }
export function semDe(start: DataISO, s: DataISO): number { return Math.round((+dParse(dMon(s)) - +dParse(dMon(start))) / 864e5 / 7) + 1 }
export function semInicio(start: DataISO, sem: number): DataISO { return dAdd(dMon(start), (sem - 1) * 7) }

// ── disponibilidade ──
export function horasEm(cfg: Cfg28, d: DataISO): number[] {
  let h = cfg.horas
  for (const r of [...(cfg.rotinas || [])].sort((a, b) => (a.desde < b.desde ? -1 : 1))) if (r.desde <= d) h = r.horas
  return h
}
export function recessoEm(cfg: Cfg28, d: DataISO) { return (cfg.recessos || []).find((r) => r.ini <= d && d <= r.fim) || null }
/** Horas do dia: pontual da data > recesso (0) > rotina vigente. */
export function horasDia(cfg: Cfg28, d: DataISO): number {
  const p = cfg.horasPontuais && cfg.horasPontuais[d]
  if (p != null && Number.isFinite(+p)) return Math.max(0, Math.min(24, +p))
  return recessoEm(cfg, d) ? 0 : (horasEm(cfg, d)[dDow(d)] || 0)
}
export function ehRev(cfg: Cfg28, sem: number): boolean {
  const r = cfg.revisao
  return !!(r && r.ativa && r.cada && r.cada > 0 && sem > 0 && sem % r.cada === 0)
}
export function proxSemConteudo(cfg: Cfg28, s: DataISO, n: number): DataISO {
  let sem = semDe(cfg.start, s), k = 0
  while (k < n) { sem++; if (!ehRev(cfg, sem)) k++ }
  return dAdd(semInicio(cfg.start, sem), dDow(s))
}
export function minPdf(p: number, vel?: number): number { const v = vel && vel > 0 ? vel : VEL_PADRAO; return Math.max(30, Math.ceil((p || 60) / v * 2 - 1e-9) * 30) }

/** Semana de revisão: PDFlash/Flashcard (60) + questões (30) por tema, preenchendo as horas de cada dia. */
export function planoRevisao(capDias: number[], temas: number): Array<{ itens: Array<{ t: string; n: number }>; usado: number }> {
  const fila: Array<{ t: string; n: number }> = []
  for (let n = 0; n < temas; n++) fila.push({ t: 'rf', n }, { t: 'rq', n })
  let q = 0
  return capDias.map((c) => {
    const itens: Array<{ t: string; n: number }> = []; let usado = 0
    while (q < fila.length && usado + DUR_REVISAO[fila[q].t] <= c) { itens.push(fila[q]); usado += DUR_REVISAO[fila[q].t]; q++ }
    return { itens, usado }
  })
}

/** Índices de AS declarados como estudados anteriormente (prefixo inclusivo por disciplina selecionada). */
export function indicesAnteriores(cfg: Cfg28, AS: AulaAS[]): Set<number> {
  const out = new Set<number>()
  if (!cfg.jaEstudaRevisao || !cfg.ultimosTemas) return out
  const ativas = new Set(cfg.discs)
  const pos: Record<string, number> = {}
  AS.forEach((a, i) => {
    const disc = a[0]; const k = pos[disc] = (pos[disc] ?? -1) + 1
    const lim = cfg.ultimosTemas![disc]
    if (ativas.has(disc) && typeof lim === 'number' && lim >= 0 && k <= lim) out.add(i)
  })
  return out
}

export interface ResultadoPlano { plano: Plano; fim: number }

/**
 * Gera o plano 2.8. fixos = {id: [data, horas]} — metas que NÃO se movem (concluídas, passadas, com
 * progresso registrado). ancora = data a partir da qual o resto é (re)distribuído.
 */
export function gerarPlano(cfg: Cfg28, AS: AulaAS[], LP: ItemLP[], fixos: Plano, ancora: DataISO | null): ResultadoPlano {
  const start = cfg.start
  const A = ancora && ancora > start ? ancora : start
  const ativas = new Set(cfg.discs || [])
  const metas = cfg.metas || {}
  const plano: Plano = {}
  const carga: Record<string, number> = {}
  for (const [id, v] of Object.entries(fixos || {})) {
    if (/^r[fqv]:/.test(id)) continue
    plano[id] = v
    if (v[0] >= A) carga[v[0]] = (carga[v[0]] || 0) + Math.round(v[1] * 60)
  }
  const fixo = (id: string) => !!(fixos && fixos[id])
  const algumDia = [cfg.horas, ...(cfg.rotinas || []).map((r) => r.horas)].some((h) => (h || []).some((x) => x > 0)) ||
    Object.values(cfg.horasPontuais || {}).some((x) => +x > 0)
  if (!algumDia) return { plano, fim: semDe(start, A) }

  const maxNovos = cfg.maisPDFull === false ? 1 : 2
  const anteriores = indicesAnteriores(cfg, AS)
  const sobras = cfg.sobras || {}
  const lidas = cfg.paginasLidas || {}

  // ── fila de PDFull (ordem ativa do catálogo, só disciplinas selecionadas, fora o histórico prévio) ──
  const pdfQ: number[] = []
  AS.forEach((a, i) => { if (ativas.has(a[0]) && !anteriores.has(i) && !fixo('pf:' + i)) pdfQ.push(i) })
  let qi = 0
  const feitoParte: Record<string, number> = {}, maxParte: Record<string, number> = {}
  for (const [id, v] of Object.entries(fixos || {})) if (id.startsWith('pp:')) { const [, i, k] = id.split(':'); feitoParte[i] = (feitoParte[i] || 0) + Math.round(v[1] * 60); maxParte[i] = Math.max(maxParte[i] || 0, +k) }
  const restante = (i: number) => {
    const pags = +AS[i][3] || 0, lida = +lidas[i] || 0
    if (lida > 0 && pags > lida) return Math.max(30, minPdf(pags - lida, cfg.vel))
    return Math.max(30, minPdf(pags, cfg.vel) - (feitoParte[i] || 0))
  }
  let emCurso: { i: number; resta: number; k: number; ultima: DataISO } | null = null
  // aula que já tinha partes concluídas antes da âncora → é CONTINUAÇÃO (prioridade, não conta como nova)
  for (let p = 0; p < pdfQ.length && !emCurso; p++) {
    const i = pdfQ[p]
    if ((feitoParte[i] || 0) > 0 || (+lidas[i] || 0) > 0) { pdfQ.splice(p, 1); emCurso = { i, resta: restante(i), k: maxParte[i] || 0, ultima: dAdd(A, -1) } }
  }

  // ── revisões e questões devidas ──
  type Devido = { id: string; due: DataISO; tipo: string; ord: number }
  const devidos: Devido[] = []
  let ord = 0
  const registrar = (i: number, dataPdf: DataISO) => {
    const disc = AS[i][0]
    if (metas.fl && !SEM_FLASH.has(disc) && !fixo('fl:' + i)) devidos.push({ id: 'fl:' + i, due: proxSemConteudo(cfg, dataPdf, 1), tipo: 'fl', ord: ord++ })
    if (metas.qu && !fixo('qu:' + i)) devidos.push({ id: 'qu:' + i, due: proxSemConteudo(cfg, dataPdf, 2), tipo: 'qu', ord: ord++ })
  }
  AS.forEach((a, i) => { if (ativas.has(a[0]) && !anteriores.has(i) && fixos && fixos['pf:' + i]) registrar(i, fixos['pf:' + i][0]) })
  const porData = (a: Devido, b: Devido) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ord - b.ord)

  // ── LegProc: fila por disciplina (selecionada) + rodízio com janela de 6 ──
  const ignorar = new Set(cfg.lpIgnorar || [])
  const lpPorDisc = new Map<string, ItemLP[]>()
  if (metas.lp) for (const it of LP || []) {
    if (!it || !it.id || fixo(it.id) || ignorar.has(it.id)) continue
    if (it.disc && !ativas.has(it.disc)) continue
    const k = it.disc || ''
    const arr = lpPorDisc.get(k) || []; arr.push(it); lpPorDisc.set(k, arr)
  }
  const ordemDisc = [...(cfg.discs || []).filter((d) => lpPorDisc.has(d)), ...(lpPorDisc.has('') ? [''] : [])]
  const espera = ordemDisc.slice(LP_JANELA)
  const janela = ordemDisc.slice(0, LP_JANELA)
  let rr = 0
  const lpPendente = () => janela.length > 0
  const tirarDiscSeVazia = (d: string) => {
    if ((lpPorDisc.get(d) || []).length) return
    const p = janela.indexOf(d); if (p < 0) return
    janela.splice(p, 1); if (rr > p) rr--
    const prox = espera.shift(); if (prox != null) janela.push(prox)
    if (rr >= janela.length) rr = 0
  }

  // ── sobras (Revisão/Questões/LegProc interrompidas): mesma meta, minutos restantes, 1º dia disponível ──
  const sobraFila: Array<{ id: string; min: number }> = []
  for (const [id, m] of Object.entries(sobras)) {
    if (fixo(id) || !(+m > 0)) continue
    const t = id.split(':')[0]
    if (t !== 'fl' && t !== 'qu' && t !== 'lp') continue
    sobraFila.push({ id, min: Math.max(10, Math.round(+m)) })
    // tira da fila normal (não duplica)
    for (let k = devidos.length - 1; k >= 0; k--) if (devidos[k].id === id) devidos.splice(k, 1)
    for (const [d, arr] of lpPorDisc) { const p = arr.findIndex((x) => x.id === id); if (p >= 0) { arr.splice(p, 1); tirarDiscSeVazia(d) } }
  }

  let fim = semDe(start, A)
  const semA = semDe(start, A)
  for (let sem = semA; sem <= MAX_SEM; sem++) {
    const ini = semInicio(start, sem), fimSem = dAdd(ini, 6)
    const diasSem = [0, 1, 2, 3, 4, 5, 6].map((d) => dAdd(ini, d)).filter((dt) => dt >= A && horasDia(cfg, dt) > 0)
    if (!diasSem.length) {
      if (qi >= pdfQ.length && !emCurso && !devidos.length && !lpPendente() && !sobraFila.length) break
      continue
    }
    const livre = (dt: DataISO) => horasDia(cfg, dt) * 60 - (carga[dt] || 0)
    const por = (dt: DataISO, id: string, m: number) => { plano[id] = [dt, m / 60]; carga[dt] = (carga[dt] || 0) + m }
    const semRev = ehRev(cfg, sem)
    // §6: até 18 h na semana (rotina vigente) e +1 dia disponível → último dia concentra Questões + LegProc
    const hSem = horasEm(cfg, ini).reduce((a, b) => a + (+b || 0), 0)
    const diaConc = !semRev && hSem <= LIMITE_18H && diasSem.length > 1 ? diasSem[diasSem.length - 1] : null

    if (semRev) {
      const temas = Object.entries(plano).filter(([id, [d]]) => id.startsWith('pf:') && d < ini).length
      const reserva = planoRevisao(diasSem.map((dt) => Math.max(0, livre(dt))), temas)
      diasSem.forEach((dt, k) => { if (reserva[k].usado) carga[dt] = (carga[dt] || 0) + reserva[k].usado })
    }

    const colocarDevidos = (dt: DataISO, tipo: string, filtro?: (x: Devido) => boolean) => {
      for (const x of devidos.filter((y) => y.tipo === tipo && y.due <= dt && (!filtro || filtro(y))).sort(porData)) {
        const m = DUR[tipo]
        if (livre(dt) < m) break
        por(dt, x.id, m); devidos.splice(devidos.indexOf(x), 1)
      }
    }
    // PDFull: continuação OU aula nova (limite de novas por dia)
    const pdf = (dt: DataISO, estado: { novos: number }, permitirNova: boolean): boolean => {
      if (semRev) return false
      if (emCurso) {
        if (emCurso.ultima >= dt) return false // a continuação nunca no mesmo dia (nem antes) da parte que a originou
        const m = Math.min(emCurso.resta, Math.floor(livre(dt) / 30) * 30)
        if (m < 30) return false
        const { i } = emCurso
        if (m >= emCurso.resta) { if (metas.pf !== false) por(dt, 'pf:' + i, m); registrar(i, dt); emCurso = null }
        else { if (metas.pf !== false) por(dt, `pp:${i}:${++emCurso.k}`, m); emCurso.resta -= m; emCurso.ultima = dt }
        return true
      }
      if (!permitirNova || estado.novos >= maxNovos || qi >= pdfQ.length) return false
      const i = pdfQ[qi], rest = restante(i)
      const m = Math.min(rest, Math.floor(livre(dt) / 30) * 30)
      if (m < 30) return false
      qi++; estado.novos++
      if (m >= rest) { if (metas.pf !== false) por(dt, 'pf:' + i, m); registrar(i, dt) }
      else { const k = (maxParte[i] || 0) + 1; if (metas.pf !== false) por(dt, `pp:${i}:${k}`, m); emCurso = { i, resta: rest - m, k, ultima: dt } }
      return true
    }
    // LegProc do dia: até 2 blocos (≤2 metas da mesma lei cada) de disciplinas diferentes, máx. 4 metas
    const legproc = (dt: DataISO) => {
      if (!lpPendente()) return
      let feitas = 0; const usadas = new Set<string>()
      for (let bloco = 0; bloco < 2 && janela.length; bloco++) {
        let disc: string | null = null
        for (let t = 0; t < janela.length; t++) { const d = janela[(rr + t) % janela.length]; if (!usadas.has(d)) { disc = d; rr = (rr + t) % janela.length; break } }
        if (disc == null) break
        const fila = lpPorDisc.get(disc) || []
        if (!fila.length) { tirarDiscSeVazia(disc); continue }
        const primeira = fila[0]
        let n = 0
        while (n < 2 && feitas < LP_MAX_DIA && fila.length && fila[0].lei === primeira.lei) {
          const it = fila[0], m = it.min || DUR.lp
          if (livre(dt) < m) break
          por(dt, it.id, m); fila.shift(); n++; feitas++
        }
        if (!n) break // sem espaço p/ o bloco: encerra o LegProc do dia
        usadas.add(disc)
        rr = (rr + 1) % Math.max(1, janela.length)
        tirarDiscSeVazia(disc)
      }
    }

    for (const dt of diasSem) {
      const est = { novos: 0 }
      // 0) sobras de metas interrompidas: prioridade máxima no 1º dia disponível
      for (let k = 0; k < sobraFila.length;) { const s = sobraFila[k]; if (livre(dt) >= s.min) { por(dt, s.id, s.min); sobraFila.splice(k, 1); const t = s.id.split(':')[0]; if (t === 'fl' || t === 'qu') { /* revisão/questões remanescentes já não estão em `devidos` */ } } else k++ }
      const atrasoDeAntes = (x: Devido) => x.due < ini // transbordo de semanas anteriores: vai a qualquer dia
      if (semRev) {
        colocarDevidos(dt, 'fl'); colocarDevidos(dt, 'qu'); legproc(dt)
        continue
      }
      if (diaConc && dt === diaConc) {
        // dia de concentração (≤18h): Questões + LegProc; Revisão/PDFull só na sobra
        colocarDevidos(dt, 'qu'); legproc(dt); colocarDevidos(dt, 'fl')
        pdf(dt, est, true); pdf(dt, est, true)
        continue
      }
      const restrito = !!diaConc
      colocarDevidos(dt, 'fl')                       // 1) Revisão
      pdf(dt, est, false)                            // 2) continuidade de PDFull já assumida
      pdf(dt, est, true)                             // 3) PDFull novo (1º)
      colocarDevidos(dt, 'qu', restrito ? atrasoDeAntes : undefined) // 4) Questões
      if (!restrito) legproc(dt)                     // 5) LegProc
      if (maxNovos > 1) pdf(dt, est, true)           // 6) 2º PDFull novo, só na sobra
    }
    if (diasSem.some((dt) => carga[dt])) fim = sem
    if (qi >= pdfQ.length && !emCurso && !devidos.length && !lpPendente() && !sobraFila.length && sem >= semDe(start, A)) {
      // ainda pode haver revisões devidas além do horizonte? já foram todas colocadas (devidos vazio) → fim
      break
    }
  }
  return { plano, fim }
}

/** Saúde do plano: atraso das revisões e questões em relação ao ideal (7 e 14 dias). */
export function saudePlano(plano: Plano, cfg: Cfg28) {
  const out: Record<string, { n: number; atraso: number; max: number; media?: number }> = { fl: { n: 0, atraso: 0, max: 0 }, qu: { n: 0, atraso: 0, max: 0 } }
  for (const [id, [d]] of Object.entries(plano)) {
    const [t, i] = id.split(':')
    if (t !== 'fl' && t !== 'qu') continue
    const pf = plano['pf:' + i]; if (!pf) continue
    const ideal = proxSemConteudo(cfg, pf[0], t === 'fl' ? 1 : 2)
    const atraso = Math.max(0, Math.round((+dParse(d) - +dParse(ideal)) / 864e5))
    out[t].n++; out[t].atraso += atraso; out[t].max = Math.max(out[t].max, atraso)
  }
  for (const k of Object.keys(out)) out[k].media = out[k].n ? out[k].atraso / out[k].n : 0
  return out
}
