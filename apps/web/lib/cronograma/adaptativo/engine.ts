// ============================================================
// Motor do cronograma — método Revisão (PORTE FIEL de "Cronograma Adaptativo 2.0")
// Transcrição 1:1 do motor client-side do modelo enviado pelo usuário
// (cronograma/index.html). Módulo PURO: roda igual no servidor e no cliente,
// sem 'server-only' nem acesso a DOM/fetch. NÃO alterar a lógica — só tipar.
//
// · Durações: PDFULL = páginas ÷ ritmo de leitura (padrão interno 17 páginas/hora), em blocos de 30 min
//             PDFlash 1h · Questões 30 min · LegProc 45 min
// · PDFlash 1 semana depois do PDFULL, no mesmo dia — exceto disciplinas AGU sem flash
// · Questões 2 semanas depois do PDFULL, no mesmo dia — nunca são descartadas
// · Arranjo (cfg.arranjo): 'pdf' | 'equilibrado' | 'constancia'
// · Semanas de revisão (cfg.revisao = {ativa, cada}): a cada N semanas, sem aulas novas.
// ============================================================

export type DataISO = string // 'YYYY-MM-DD' (local, sem fuso)
/** Linha de catálogo de aula: [disciplina, aula, tema, páginas, nomeQuestões, nomeTEC] */
export type Aula = [string, string, number, string, string] | [string, string, string, number, string, string]
/** Conteúdo: AS = aulas; WLP = lei seca por semana (WLP[semana][j] = texto do bloco) */
// 7º campo (opcional) = id do documento da Biblioteca que origina a aula → o aluno abre o
// conteúdo no leitor v2 (/aluno/biblioteca/<id>). Seed não tem (fica undefined, sem link).
export type AS = Array<[string, string, string, number, string, string, string?]>
export type WLP = string[][]

export interface Rotina { desde: DataISO; horas: number[] }
export interface Recesso { ini: DataISO; fim: DataISO; motivo?: string }
export interface RevisaoCfg { ativa?: boolean; cada?: number }
export interface MetasCfg { pf?: boolean; fl?: boolean; qu?: boolean; lp?: boolean; vd?: boolean }

export interface Cfg {
  start: DataISO
  horas: number[] // 7 posições; índice 0 = segunda
  rotinas?: Rotina[]
  recessos?: Recesso[]
  discs: string[]
  metas: MetasCfg
  arranjo?: 'pdf' | 'equilibrado' | 'constancia'
  revisao?: RevisaoCfg
  vel?: number
  revModelo?: string
  [k: string]: unknown
}

/** id da meta -> [data, horas] */
export type Plano = Record<string, [DataISO, number]>
export type Fixos = Record<string, [DataISO, number]>

export const SEM_FLASH = new Set<string>([
  'Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU',
])
export const MAX_SEM = 200
export const ARRANJOS = ['pdf', 'equilibrado', 'constancia'] as const

export function horasEm(cfg: Cfg, d: DataISO): number[] {
  let h = cfg.horas
  for (const r of [...(cfg.rotinas || [])].sort((a, b) => (a.desde < b.desde ? -1 : 1))) if (r.desde <= d) h = r.horas
  return h
}
export function recessoEm(cfg: Cfg, d: DataISO): Recesso | null {
  return (cfg.recessos || []).find((r) => r.ini <= d && d <= r.fim) || null
}
export function horasDia(cfg: Cfg, d: DataISO): number {
  return recessoEm(cfg, d) ? 0 : horasEm(cfg, d)[dDow(d)]
}
export function ehRev(cfg: Cfg, sem: number): boolean {
  const r = cfg.revisao
  return !!(r && r.ativa && r.cada && r.cada > 0 && sem > 0 && sem % r.cada === 0)
}

/** Ritmo padrão de leitura (uso interno): 17 páginas por hora. */
export const VEL_PADRAO = 17
/** Videoaula: tempo máximo por aula, descontado do dia. */
export const VID_MIN = 60

// datas em ISO local (YYYY-MM-DD), sem fuso
export function dParse(s: DataISO): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export function dISO(d: Date): DataISO { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
export function dAdd(s: DataISO, n: number): DataISO { const d = dParse(s); d.setDate(d.getDate() + n); return dISO(d) }
export function dDow(s: DataISO): number { return (dParse(s).getDay() + 6) % 7 } // 0 = segunda
export function dMon(s: DataISO): DataISO { return dAdd(s, -dDow(s)) }
export function semDe(start: DataISO, s: DataISO): number { return Math.round((+dParse(dMon(s)) - +dParse(dMon(start))) / 864e5 / 7) + 1 }
export function semInicio(start: DataISO, sem: number): DataISO { return dAdd(dMon(start), (sem - 1) * 7) }
// mesma posição na semana, n semanas "de conteúdo" depois (pula as de revisão)
export function proxSemConteudo(cfg: Cfg, s: DataISO, n: number): DataISO {
  let sem = semDe(cfg.start, s), k = 0
  while (k < n) { sem++; if (!ehRev(cfg, sem)) k++ }
  return dAdd(semInicio(cfg.start, sem), dDow(s))
}

/* Duração das metas, em minutos. PDFULL: páginas ÷ ritmo, em blocos de 30 min. */
export const DUR: Record<string, number> = { fl: 60, qu: 30, lp: 45 }
export const DIA_CURTO = 120 // Priorizar PDFulls: dias com menos de 2h não recebem PDFULL
export function minPdf(p: number, vel?: number): number { const v = vel && vel > 0 ? vel : VEL_PADRAO; return Math.max(30, Math.ceil((p || 60) / v * 2 - 1e-9) * 30) }
export function horasPdf(p: number, vel?: number): number { return minPdf(p, vel) / 60 }

/**
 * Semana de revisão: distribui, em ordem, PDFlash/Flashcard (60 min) e questões (30 min) de cada tema pelos dias.
 */
export const DUR_REVISAO: Record<string, number> = { rf: 60, rq: 30 }
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
/** Dias da semana dedicados a PDFlash + questões, conforme o arranjo e os dias de estudo disponíveis. */
export function diasDeRevisao(arranjo: string, dias: DataISO[]): DataISO[] {
  const n = dias.length
  if (arranjo === 'equilibrado') return n >= 3 ? [dias[n - 1]] : []
  if (arranjo === 'constancia') {
    if (n >= 6) return [dias[4], dias[5]]
    if (n >= 3) return [dias[n - 1]]
  }
  return []
}

export interface ResultadoPlano { plano: Plano; fim: number }

/**
 * Gera o plano. cfg = {start, horas[7], rotinas[], recessos[], discs[], metas{pf,fl,qu,lp}, arranjo, revisao{ativa,cada}, vel}
 * fixos = {id: [data, horas]} — metas concluídas, que não se movem.
 * ancora = data a partir da qual tudo que não foi concluído é (re)distribuído.
 */
export function gerarPlano(cfg: Cfg, AS: AS, WLP: WLP, fixos: Fixos, ancora: DataISO | null): ResultadoPlano {
  const start = cfg.start
  const arranjo = (ARRANJOS as readonly string[]).includes(cfg.arranjo as string) ? (cfg.arranjo as string) : 'pdf'
  const A = ancora && ancora > start ? ancora : start
  const ativas = new Set(cfg.discs)
  const plano: Plano = {}
  const carga: Record<string, number> = {} // data -> minutos ocupados
  for (const [id, v] of Object.entries(fixos)) {
    if (/^r[fqv]:/.test(id)) continue
    plano[id] = v
    if (v[0] >= A) carga[v[0]] = (carga[v[0]] || 0) + Math.round(v[1] * 60)
  }
  const fixo = (id: string) => !!fixos[id]
  const algumDia = [cfg.horas, ...(cfg.rotinas || []).map((r) => r.horas)].some((h) => h.some((x) => x > 0))
  if (!algumDia) return { plano, fim: semDe(start, A) }

  const pdfQ: number[] = []
  AS.forEach((a, i) => { if (ativas.has(a[0]) && !fixo('pf:' + i)) pdfQ.push(i) })
  let qi = 0
  // PDFULL dividido em partes ('pp:i:k'): partes já concluídas descontam do tempo que falta ler
  const feitoParte: Record<string, number> = {}, maxParte: Record<string, number> = {}
  for (const [id, v] of Object.entries(fixos)) if (id.startsWith('pp:')) { const [, i, k] = id.split(':'); feitoParte[i] = (feitoParte[i] || 0) + Math.round(v[1] * 60); maxParte[i] = Math.max(maxParte[i] || 0, +k) }
  const restante = (i: number) => Math.max(30, minPdf(AS[i][3], cfg.vel) + (cfg.metas && cfg.metas.vd ? VID_MIN : 0) - (feitoParte[i] || 0))
  let emCurso: { i: number; resta: number; k: number; ultima?: DataISO } | null = null
  const devidos: Array<{ id: string; due: DataISO; tipo: string; ord: number }> = []
  let ord = 0
  const registrar = (i: number, dataPdf: DataISO) => {
    const disc = AS[i][0]
    if (cfg.metas.fl && !SEM_FLASH.has(disc) && !fixo('fl:' + i)) devidos.push({ id: 'fl:' + i, due: proxSemConteudo(cfg, dataPdf, 1), tipo: 'fl', ord: ord++ })
    if (cfg.metas.qu && !fixo('qu:' + i)) devidos.push({ id: 'qu:' + i, due: proxSemConteudo(cfg, dataPdf, 2), tipo: 'qu', ord: ord++ })
  }
  // dívidas: PDFs já concluídos cujas revisões/questões ainda não foram feitas
  AS.forEach((a, i) => { if (ativas.has(a[0]) && fixos['pf:' + i]) registrar(i, fixos['pf:' + i][0]) })

  const semA = semDe(start, A)
  let lpCarry: string[] = []
  if (cfg.metas.lp) for (let s = 1; s < semA && s < WLP.length; s++) (WLP[s] || []).forEach((t, j) => { if (t && t.trim() && !fixo(`lp:${s}:${j}`)) lpCarry.push(`lp:${s}:${j}`) })
  const lpPuxado = new Set<string>()
  const lpDaSemana = (sem: number) => cfg.metas.lp ? (WLP[sem] || []).map((t, j) => (t && t.trim() && !fixo(`lp:${sem}:${j}`) && !lpPuxado.has(`lp:${sem}:${j}`)) ? `lp:${sem}:${j}` : null).filter(Boolean) as string[] : []
  const ultimaLP = (() => { let u = 0; WLP.forEach((w, s) => { if (w && w.some((t) => t && t.trim())) u = s }); return u })()
  const porData = (a: { due: DataISO; ord: number }, b: { due: DataISO; ord: number }) => a.due < b.due ? -1 : a.due > b.due ? 1 : a.ord - b.ord

  let fim = semA
  for (let sem = semA; sem <= MAX_SEM; sem++) {
    const ini = semInicio(start, sem), fimSem = dAdd(ini, 6)
    const diasSem = [0, 1, 2, 3, 4, 5, 6].map((d) => dAdd(ini, d)).filter((dt) => dt >= A && horasDia(cfg, dt) > 0)
    const semRev = ehRev(cfg, sem)
    const capf = (dt: DataISO) => horasDia(cfg, dt) * 60
    const livre = (dt: DataISO) => capf(dt) - (carga[dt] || 0)
    const por = (dt: DataISO, id: string, m: number) => { plano[id] = [dt, m / 60]; carga[dt] = (carga[dt] || 0) + m }
    const maisLivre = (lista: DataISO[], m: number) => { let b: DataISO | null = null, r = -1; for (const dt of lista) { const x = livre(dt); if (x >= m && x > r) { r = x; b = dt } } return b }
    const vencidos = (tipo?: string) => devidos.filter((x) => x.due <= fimSem && (!tipo || x.tipo === tipo)).sort(porData)
    const tirar = (x: { id: string }) => devidos.splice(devidos.findIndex((y) => y === x), 1)
    const encaixar = (x: { id: string; due: DataISO; tipo: string; ord: number }, dias: DataISO[], soNoDia?: boolean) => {
      const m = DUR[x.tipo]
      let dt: DataISO | null = dias.includes(x.due) && livre(x.due) >= m ? x.due : null
      if (!dt && !soNoDia) dt = maisLivre(dias.filter((d) => d >= x.due), m) || maisLivre(dias, m)
      if (dt) { por(dt, x.id, m); tirar(x); return true }
      return false
    }
    const encaixarTipo = (tipo: string, dias: DataISO[], soNoDia?: boolean) => { for (const x of vencidos(tipo)) encaixar(x, dias, soNoDia) }
    const encaixarLP = (dias: DataISO[], umPorDia = true) => {
      let k = 0
      if (umPorDia) for (const dt of [...dias].sort((a, b) => livre(b) - livre(a))) { if (k >= lpCarry.length) break; if (livre(dt) >= DUR.lp) por(dt, lpCarry[k++], DUR.lp) }
      while (k < lpCarry.length) { const dt = maisLivre(dias, DUR.lp); if (!dt) break; por(dt, lpCarry[k++], DUR.lp) }
      lpCarry = lpCarry.slice(k)
    }
    const lerPdf = (dt: DataISO, limite: number) => {
      if (!emCurso) { if (qi >= pdfQ.length) return false; const i = pdfQ[qi++]; emCurso = { i, resta: restante(i), k: maxParte[i] || 0 } }
      if (emCurso.ultima && dt < emCurso.ultima) return false
      const m = Math.min(emCurso.resta, Math.floor(limite / 30) * 30)
      if (m < 30) return false
      const { i } = emCurso
      if (m >= emCurso.resta) { if (cfg.metas.pf) por(dt, 'pf:' + i, m); registrar(i, dt); emCurso = null }
      else { if (cfg.metas.pf) por(dt, `pp:${i}:${++emCurso.k}`, m); emCurso.resta -= m; emCurso.ultima = dt }
      return true
    }
    const pdfEm = (dias: DataISO[]) => { for (const dt of dias) lerPdf(dt, livre(dt)) }
    lpCarry.push(...lpDaSemana(sem))
    const preencher = (dias: DataISO[], comPdf: DataISO[] | null) => {
      for (const x of vencidos()) encaixar(x, dias)
      encaixarLP(dias, false)
      for (let volta = 0; volta < 40; volta++) {
        let pos = false
        if (comPdf && !emCurso) {
          while (qi < pdfQ.length) {
            const i = pdfQ[qi], m = restante(i)
            const dt = maisLivre(comPdf, m); if (!dt) break
            qi++; if (cfg.metas.pf) por(dt, 'pf:' + i, m); registrar(i, dt); pos = true
          }
        }
        if (cfg.metas.lp) {
          for (let s2 = sem + 1; s2 < WLP.length && s2 <= sem + 8; s2++) {
            for (const id of lpDaSemana(s2)) { const dt = maisLivre(dias, DUR.lp); if (!dt) break; por(dt, id, DUR.lp); lpPuxado.add(id); pos = true }
            if (!maisLivre(dias, DUR.lp)) break
          }
        }
        if (!pos && comPdf) {
          for (const dt of [...comPdf].sort()) while (livre(dt) >= 30 && lerPdf(dt, livre(dt))) pos = true
        }
        if (!pos && qi >= pdfQ.length && !emCurso && !lpCarry.length) {
          for (const x of [...devidos].sort(porData)) {
            const i = x.id.split(':')[1], antes = x.tipo === 'qu' && plano['fl:' + i] ? plano['fl:' + i][0] : plano['pf:' + i]?.[0]
            const m = DUR[x.tipo], dt = maisLivre(dias.filter((d) => !antes || d > antes), m)
            if (dt) { por(dt, x.id, m); tirar(x); pos = true }
          }
        }
        if (!pos) break
      }
    }
    if (semRev) {
      const temas = Object.entries(plano).filter(([id, [d]]) => id.startsWith('pf:') && d < ini).length
      const reserva = planoRevisao(diasSem.map((dt) => livre(dt)), temas)
      diasSem.forEach((dt, k) => { if (reserva[k].usado) carga[dt] = (carga[dt] || 0) + reserva[k].usado })
      preencher(diasSem, null)
      fim = sem; continue
    }

    if (arranjo === 'pdf') {
      const curtos = diasSem.filter((d) => capf(d) < DIA_CURTO), longos = diasSem.filter((d) => capf(d) >= DIA_CURTO)
      pdfEm(longos)
      for (const x of vencidos('qu').filter((x) => x.due < ini)) encaixar(x, curtos)
      encaixarTipo('qu', curtos)
      encaixarLP(diasSem)
      encaixarTipo('fl', diasSem)
      encaixarTipo('qu', diasSem)
    } else if (arranjo === 'equilibrado') {
      const revDias = diasDeRevisao(arranjo, diasSem), aula = diasSem.filter((d) => !revDias.includes(d))
      pdfEm(aula)
      encaixarLP(aula)
      for (const x of vencidos()) encaixar(x, aula, true)
      for (const x of vencidos()) encaixar(x, revDias)
      encaixarLP(revDias, false)
      for (const x of vencidos()) encaixar(x, aula)
    } else {
      const revDias = diasDeRevisao(arranjo, diasSem), aula = diasSem.filter((d) => !revDias.includes(d))
      pdfEm(aula)
      encaixarLP(aula)
      for (const dt of revDias) for (const tipo of ['fl', 'qu']) {
        let n = 0
        for (const x of vencidos(tipo)) { if (n >= 2) break; if (livre(dt) >= DUR[tipo]) { por(dt, x.id, DUR[tipo]); tirar(x); n++ } }
      }
      for (const x of vencidos()) encaixar(x, revDias)
      if (!revDias.length) for (const x of vencidos()) encaixar(x, aula)
    }
    preencher(diasSem, arranjo === 'pdf' ? diasSem.filter((d) => capf(d) >= DIA_CURTO) : diasSem)
    if (diasSem.some((dt) => carga[dt])) fim = sem
    const acabou = qi >= pdfQ.length && !emCurso && !devidos.length && !lpCarry.length && (!cfg.metas.lp || sem >= ultimaLP)
    if (acabou) break
  }
  return { plano, fim }
}

export interface Notas { [id: string]: { grau?: number; res?: number; err?: number; diff?: number } }

/** Desempenho nas questões de um tema: soma as questões da aula e as das semanas de revisão. */
export function acertoTema(notas: Notas, i: number): { res: number; err: number; pct: number } | null {
  let res = 0, err = 0
  for (const [id, n] of Object.entries(notas)) {
    if (id === 'qu:' + i || (id.startsWith('rq:') && +id.split(':')[2] === i)) { res += +(n.res || 0); err += +(n.err || 0) }
  }
  return res ? { res, err, pct: Math.max(0, (res - err) / res * 100) } : null
}

export const ACERTO_MIN = 60
export function rankingRevisao(plano: Plano, notas: Notas, ateData: DataISO, jaRevisados: Set<number>) {
  const cand: Array<{ i: number; d: DataISO; grau: number | null; acerto: number | null; prioritario: boolean; pontos: number }> = []
  for (const [id, [d]] of Object.entries(plano)) {
    if (!id.startsWith('pf:') || d >= ateData) continue
    const i = +id.split(':')[1]
    const grau = notas['pf:' + i]?.grau ?? null
    const ac = acertoTema(notas, i)
    const baixo = !!(ac && ac.pct < ACERTO_MIN)
    const prioritario = (grau != null && grau > 0) || baixo
    let pontos = (grau || 0) + (baixo && ac ? 2 + (ACERTO_MIN - ac.pct) / ACERTO_MIN * 8 : 0)
    if (jaRevisados.has(i)) pontos -= 4
    cand.push({ i, d, grau, acerto: ac ? ac.pct : null, prioritario, pontos })
  }
  return cand.sort((a, b) => (Number(b.prioritario) - Number(a.prioritario)) || (b.pontos - a.pontos) || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
}

export interface MetaDescrita {
  tipo: string; disc?: string; aula?: string; tema?: string; pags?: number; qc?: string; tec?: string
  idx?: number; semRev?: number | null; parte?: number | null; texto?: string; sem?: number
}
/** Descreve uma meta a partir do id. */
export function descrever(id: string, AS: AS, WLP: WLP): MetaDescrita {
  const [t, a, b] = id.split(':')
  if (t === 'lp') return { tipo: 'lp', texto: WLP[+a]?.[+b], sem: +a }
  const rev = t === 'rf' || t === 'rq'
  const i = rev ? +b : +a
  const e = AS[i]
  return { tipo: t, disc: e?.[0], aula: e?.[1], tema: e?.[2], pags: e?.[3], qc: e?.[4], tec: e?.[5], idx: i, semRev: rev ? +a : null, parte: t === 'pp' ? +b : null }
}

/** Saúde do plano: atraso das revisões e questões em relação ao ideal (7 e 14 dias). */
export function saudePlano(plano: Plano, cfg: Cfg) {
  const out: Record<string, { n: number; atraso: number; max: number; media?: number }> = { fl: { n: 0, atraso: 0, max: 0 }, qu: { n: 0, atraso: 0, max: 0 } }
  for (const [id, [d]] of Object.entries(plano)) {
    const [t, i] = id.split(':')
    if (t !== 'fl' && t !== 'qu') continue
    const pf = plano['pf:' + i]
    if (!pf) continue
    const ideal = proxSemConteudo(cfg, pf[0], t === 'fl' ? 1 : 2)
    if (recessoEm(cfg, ideal)) continue
    const a = Math.max(0, Math.round((+dParse(d) - +dParse(ideal)) / 864e5))
    out[t].n++; out[t].atraso += a; out[t].max = Math.max(out[t].max, a)
  }
  for (const t of ['fl', 'qu']) out[t].media = out[t].n ? out[t].atraso / out[t].n : 0
  return out
}

export const ORDEM: Record<string, number> = { pp: 0, pf: 0, fl: 1, qu: 2, lp: 3, rf: 4, rq: 4 }
