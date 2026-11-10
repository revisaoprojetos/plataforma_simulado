// ============================================================
// Motor do cronograma — método Revisão (PORTE FIEL de "Cronograma Adaptativo 2.0")
// Transcrição 1:1 do motor client-side do modelo enviado pelo usuário
// (cronograma/index.html). Módulo PURO: roda igual no servidor e no cliente,
// sem 'server-only' nem acesso a DOM/fetch. NÃO alterar a lógica — só tipar.
//
// · Durações: PDFULL = páginas ÷ ritmo de leitura (padrão interno 17 páginas/hora), em blocos de 30 min
//             PDFlash 1h · Questões 30 min · LegProc 30 min
// · PDFlash 1 semana depois do PDFULL, no mesmo dia — exceto disciplinas AGU sem flash
// · Questões 2 semanas depois do PDFULL, no mesmo dia — nunca são descartadas
// · Semanas de revisão (cfg.revisao = {ativa, cada}): a cada N semanas, sem aulas novas.
//
// ⚠ DESDE A 2.8 a GERAÇÃO do plano vive em ./motor28.ts (fonte ÚNICA, também compilada p/ o iframe).
//   Este módulo mantém os tipos/helpers e delega gerarPlano/horasDia ao motor 2.8. Os "arranjos"
//   (pdf/equilibrado/constância) foram substituídos pelas regras 2.8 (prioridade do dia, limite de
//   PDFull novos, LegProc por disciplina em blocos, concentração ≤18h, histórico prévio).
// ============================================================

import * as M28 from './motor28'
import * as M30 from './motor30'
import { subtipoMeta, rotuloMeta, semanaOrigemDaMeta } from './meta-ids'
export type { ItemLP } from './motor28'

export type DataISO = string // 'YYYY-MM-DD' (local, sem fuso)
/** Linha de catálogo de aula: [disciplina, aula, tema, páginas, nomeQuestões, nomeTEC] */
export type Aula = [string, string, number, string, string] | [string, string, string, number, string, string]
/** Conteúdo: AS = aulas; WLP = lei seca por semana (WLP[semana][j] = texto do bloco) */
// 7º campo (opcional) = id do documento da Biblioteca que origina a aula → o aluno abre o
// conteúdo no leitor v2 (/aluno/biblioteca/<id>). Seed não tem (fica undefined, sem link).
// 8º campo (opcional) = chave estável original da aula quando o admin editou o tema (catalogo-override.ts).
export type AS = Array<[string, string, string, number, string, string, string?, string?]>
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
export const MAX_SEM = 600 // horizonte do motor atual (600 semanas); o legado 2.8.1 usa 200 internamente
export const ARRANJOS = ['pdf', 'equilibrado', 'constancia'] as const

export function horasEm(cfg: Cfg, d: DataISO): number[] {
  let h = cfg.horas
  for (const r of [...(cfg.rotinas || [])].sort((a, b) => (a.desde < b.desde ? -1 : 1))) if (r.desde <= d) h = r.horas
  return h
}
export function recessoEm(cfg: Cfg, d: DataISO): Recesso | null {
  return (cfg.recessos || []).find((r) => r.ini <= d && d <= r.fim) || null
}
/** Horas do dia: pontual da data > recesso (0) > rotina vigente (regra 2.8, §8). */
export function horasDia(cfg: Cfg, d: DataISO): number {
  return M28.horasDia(cfg as unknown as M28.Cfg28, d)
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
export const DUR: Record<string, number> = { fl: 60, qu: 30, lp: 30 } // LegProc 30 min (2.8)
export const DIA_CURTO = 120 // Priorizar PDFulls: dias com menos de 2h não recebem PDFULL
export function minPdf(p: number, vel?: number): number { const v = vel && vel > 0 ? vel : VEL_PADRAO; return Math.max(30, Math.ceil((p || 60) / v * 2 - 1e-9) * 30) }
export function horasPdf(p: number, vel?: number): number { return minPdf(p, vel) / 60 }

/**
 * Semana de revisão: distribui, em ordem, PDFlash/Flashcard (60 min) e questões (30 min) de cada tema pelos dias.
 */
export const DUR_REVISAO: Record<string, number> = { rf: 60, rq: 30 }
/** Semana de revisão (modelo): apenasQuestoes[k] = dia que concentra as questões (≤18 h) — recebe só questões. */
export function planoRevisao(capDias: number[], temas: number, apenasQuestoes: boolean[] = [], dur: Record<string, number> = DUR_REVISAO): Array<{ itens: Array<{ t: string; n: number }>; usado: number }> {
  return M28.planoRevisao(capDias, temas, apenasQuestoes, dur)
}
export const resolverParams = M28.resolverParams
export const rankingRevisao218 = M28.rankingRevisao218
/** Dia da semana que concentra as questões (semana de até 18 h com mais de 1 dia disponível) ou null. */
export function diaConcentrado(cfg: Cfg, sem: number): DataISO | null { return M28.perfilSemana(cfg as unknown as M28.Cfg28, sem).concentrado }
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

/** Catálogo-semente antigo (WLP por semana) → itens de LegProc "gerais" (sem disciplina), ids lp:s:j. */
export function lpDeWLP(WLP: WLP): M28.ItemLP[] {
  const out: M28.ItemLP[] = []
  ;(WLP || []).forEach((linha, s) => (linha || []).forEach((t, j) => {
    if (t && String(t).trim()) out.push({ id: `lp:${s}:${j}`, disc: '', lei: String(t).split(' - ')[0].trim(), texto: String(t), doc: null })
  }))
  return out
}

/**
 * Gera o plano (lógica do modelo 2.8, motor28.ts). LP = metas de LegProc por disciplina (conteudo-banco);
 * sem ele, usa a lei seca semanal do seed. fixos = metas que não se movem; ancora = início da redistribuição;
 * ctx.ordem = ordem de distribuição das aulas; ctx.feitas = metas concluídas; ctx.usados = ids com registro.
 */
/** Motor ATUAL (dia a dia, ./motor30.ts) — plano novo ou recalculado pelo aluno. Pode lançar M30.ErroInsuficiencia (horizonte de 600 semanas). */
export function gerarPlano(cfg: Cfg, AS: AS, WLP: WLP, fixos: Fixos, ancora: DataISO | null, LP?: M28.ItemLP[] | null, ctx?: M30.Contexto30 & { legado?: boolean }): ResultadoPlano & { detalhes?: Record<string, M28.Detalhe> } {
  const lp = LP && LP.length ? LP : lpDeWLP(WLP)
  // legado = SÓ para migrações automáticas de planos gravados com o motor 2.8.1 (nunca regenera com o motor atual).
  if (ctx?.legado) return M28.gerarPlano(cfg as unknown as M28.Cfg28, AS as M28.AulaAS[], lp, fixos, ancora, ctx)
  return M30.gerarPlano(cfg as unknown as M28.Cfg28, AS as M28.AulaAS[], lp, fixos, ancora, ctx)
}
/** O plano foi gerado pelo motor atual? (cfg.motor é carimbo técnico, nunca exibido). */
export const planoUsaMotorAtual = (motor: unknown): boolean => typeof motor === 'string' && motor.startsWith('3.')

export interface Notas { [id: string]: { grau?: number; res?: number; err?: number; diff?: number; cert?: number } }

/** Desempenho nas questões de um tema: soma as questões da aula e as das semanas de revisão. */
export function acertoTema(notas: Notas, i: number): { res: number; err: number; pct: number } | null {
  let res = 0, err = 0
  for (const [id, n] of Object.entries(notas)) {
    if (id === 'qu:' + i || (id.startsWith('rq:') && +id.split(':')[2] === i)) { res += +(n.res || 0); err += +(n.err || 0) }
  }
  return res ? { res, err, pct: Math.max(0, (res - err) / res * 100) } : null
}

export const ACERTO_MIN = 60
export function rankingRevisao(plano: Plano, notas: Notas, ateData: DataISO, jaRevisados: Set<number>, acertoMin: number = ACERTO_MIN) {
  const cand: Array<{ i: number; d: DataISO; grau: number | null; acerto: number | null; prioritario: boolean; pontos: number }> = []
  for (const [id, [d]] of Object.entries(plano)) {
    if (!/^pf:[0-9]+$/.test(id) || d >= ateData) continue // blindagem: pf:i:revisao:s / pf:i:reforco:s não são PDFull regular
    const i = +id.split(':')[1]
    const grau = notas['pf:' + i]?.grau ?? null
    const ac = acertoTema(notas, i)
    const baixo = !!(ac && ac.pct < acertoMin)
    const prioritario = (grau != null && grau > 0) || baixo
    let pontos = (grau || 0) + (baixo && ac ? 2 + (acertoMin - ac.pct) / (acertoMin || 1) * 8 : 0)
    if (jaRevisados.has(i)) pontos -= 4
    cand.push({ i, d, grau, acerto: ac ? ac.pct : null, prioritario, pontos })
  }
  return cand.sort((a, b) => (Number(b.prioritario) - Number(a.prioritario)) || (b.pontos - a.pontos) || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
}

export interface MetaDescrita {
  tipo: string; disc?: string; aula?: string; tema?: string; pags?: number; qc?: string; tec?: string
  idx?: number; semRev?: number | null; parte?: number | null; texto?: string; sem?: number
  lei?: string; doc?: string | null
  /** revisão adaptativa / reforço / diagnóstico (ids pf|fl:i:revisao:s, pf|fl:i:reforco:s, qu:i:hist:s) + rótulo p/ exibição */
  subtipo?: 'revisao' | 'reforco' | 'historico'; rotulo?: string
}
/** Descreve uma meta a partir do id. */
export function descrever(id: string, AS: AS, WLP: WLP, LPMAP?: Record<string, M28.ItemLP> | null): MetaDescrita {
  const [t, a, b] = id.split(':')
  // 2.19: Jurisprudência semanal — `jp:<semana de origem>`; não é aula (não consulta o catálogo).
  if (t === 'jp') return { tipo: 'jp', texto: 'Jurisprudência', disc: 'Jurisprudência', sem: +a || undefined }
  if (t === 'lp') {
    const it = LPMAP && LPMAP[id]
    if (it) return { tipo: 'lp', texto: it.texto, disc: it.disc || undefined, lei: it.lei, doc: it.doc ?? null }
    return { tipo: 'lp', texto: WLP[+a]?.[+b] ?? 'LegProc', sem: +a }
  }
  const rev = t === 'rf' || t === 'rq'
  const i = rev ? +b : +a
  const e = AS[i]
  const sub = subtipoMeta(id) // pf|fl:i:revisao:s · pf|fl:i:reforco:s · qu:i:hist:s → rótulo próprio (aula = i)
  return { ...(sub ? { subtipo: sub, rotulo: rotuloMeta(id) ?? undefined, sem: semanaOrigemDaMeta(id) ?? undefined } : {}), tipo: t, disc: e?.[0], aula: e?.[1], tema: e?.[2], pags: e?.[3], qc: e?.[4], tec: e?.[5], idx: i, semRev: rev ? +a : null, parte: t === 'pp' ? +b : null }
}

/** Saúde do plano: atraso das revisões e questões em relação ao ideal (7 e 14 dias). */
export function saudePlano(plano: Plano, cfg: Cfg) {
  const out: Record<string, { n: number; atraso: number; max: number; media?: number }> = { fl: { n: 0, atraso: 0, max: 0 }, qu: { n: 0, atraso: 0, max: 0 } }
  for (const [id, [d]] of Object.entries(plano)) {
    const [t, i] = id.split(':')
    if (t !== 'fl' && t !== 'qu') continue
    if (!/^(fl|qu):\d+$/.test(id)) continue // fl|qu:i:revisao|reforco|hist:s (revisão adaptativa/diagnóstico) não entram no atraso do ciclo regular
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

export const ORDEM: Record<string, number> = { pp: 0, pf: 0, fl: 1, qu: 2, lp: 3, rf: 4, rq: 4, jp: 4 }
