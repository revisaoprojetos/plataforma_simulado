// Mock do Cronograma (spec 05 §3.6). Dado puro, só para o preview das telas internas.
// Portado de `referencia/geradores/cronograma.py` (ROT/BASES/OPTS/SUBJ/ROWS/WK/MEUS/G_*).

export type RtKey = '1h' | '2h' | '3h' | '4h'
export type BsKey = 'pge' | 'reta' | 'lei'
export type GoalType = 'aula' | 'flash' | 'q' | 'lei' | 'pdf' | 'video' | 'rev'
export type Cg = 'gerar' | 'meus' | 'plano'
export type Pv = 'grade' | 'lista'

// ── Passo 1: rotina ─────────────────────────────────────────────────────────
export const STEPS: Array<{ title: string; sub: string }> = [
  { title: 'Rotina', sub: 'Horas e dias' },
  { title: 'Cronograma base', sub: 'O que estudar' },
  { title: 'Início e ajustes', sub: 'Data e opções' },
  { title: 'Prévia e gerar', sub: 'Revise e salve' },
]

export const ROT: Array<{ key: RtKey; big: string; per: string; wk: string; sub: string; popular?: boolean }> = [
  { key: '1h', big: '1 hora', per: 'por dia', wk: '178 semanas', sub: 'Leve · ideal para quem trabalha' },
  { key: '2h', big: '2 horas', per: 'por dia', wk: '89 semanas', sub: 'Equilibrado · mais escolhido', popular: true },
  { key: '3h', big: '3 horas', per: 'por dia', wk: '60 semanas', sub: 'Intenso · ritmo de prova' },
  { key: '4h', big: '4+ horas', per: 'por dia', wk: '45 semanas', sub: 'Dedicação exclusiva' },
]

export const DAYN = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
export const DAY_DEFAULT = [true, true, true, true, true, true, false] // Seg–Sáb

// ── Passo 2: bases liberadas ────────────────────────────────────────────────
export const BASES: Array<{ key: BsKey; title: string; sub: string; via: string; since: string; color: string }> = [
  { key: 'pge', title: 'PGE/PGM Completo', sub: '18 matérias · teoria, questões e lei seca', via: 'Pacote', since: 'desde 21/08/2026', color: '#5B3FD0' },
  { key: 'reta', title: 'Reta final PGE-SP', sub: '9 matérias de maior peso · revisão acelerada', via: 'Assinatura', since: 'desde 02/09/2026', color: '#E5484D' },
  { key: 'lei', title: 'Lei Seca diária', sub: 'CF, CPC e leis especiais · leitura guiada', via: 'Bônus', since: 'desde 15/09/2026', color: '#1FA868' },
]

// ── Passo 3: ajustes ────────────────────────────────────────────────────────
export const OPTS: Array<{ title: string; desc: string }> = [
  { title: 'Revisões periódicas', desc: 'Uma semana de revisão a cada 14 semanas' },
  { title: 'Pular feriados nacionais', desc: 'As metas do feriado vão para o dia seguinte' },
  { title: 'Lei seca diária', desc: '+15 min de leitura de lei em cada dia' },
  { title: 'Questões ao fim de cada aula', desc: '10 a 20 questões para fixar o conteúdo' },
]
export const OPT_DEFAULT = [true, true, false, true]

// ── Passo 4: divisão por matéria ────────────────────────────────────────────
export const SUBJ: Array<{ name: string; pct: number; color: string }> = [
  { name: 'Direito Constitucional', pct: 14, color: '#5B3FD0' },
  { name: 'Direito Administrativo', pct: 13, color: '#3E7FE0' },
  { name: 'Processo Civil', pct: 12, color: '#1FA868' },
  { name: 'Direito Tributário', pct: 11, color: '#D99A1E' },
  { name: 'Direito Civil', pct: 10, color: '#E5484D' },
  { name: 'Direito Financeiro', pct: 7, color: '#0EA5B7' },
  { name: 'Direito do Trabalho', pct: 6, color: '#D9468F' },
  { name: 'Outras 11 matérias', pct: 27, color: '#8A8FA3' },
]

// Tipos de meta (pill): rótulo + cor
export const TYPES: Record<GoalType, { label: string; color: string }> = {
  aula: { label: 'Aula', color: '#5B3FD0' },
  flash: { label: 'Flashcards', color: '#0EA5B7' },
  pdf: { label: 'PDF', color: '#E5484D' },
  video: { label: 'Vídeo', color: '#3E7FE0' },
  q: { label: 'Questões', color: '#1FA868' },
  lei: { label: 'Legproc', color: '#D99A1E' },
  rev: { label: 'Revisão', color: '#8F75FF' },
}
export const TF_LAB = ['Todos', 'Aulas', 'Flashcards', 'Questões', 'Legproc']
export type TfKey = 'all' | 'aula' | 'flash' | 'q' | 'lei'

// Prévia da semana 1 (passo 4): day, type, title, dur
export const FIRST_WEEK: Array<{ day: string; type: GoalType; title: string; dur: string }> = [
  { day: 'Seg', type: 'pdf', title: 'Direito Constitucional: Aula 01 – Constitucionalismo e Constituição', dur: '1:30' },
  { day: 'Ter', type: 'pdf', title: 'Continuação Aula 01 · Direito Constitucional', dur: '1:30' },
  { day: 'Qua', type: 'pdf', title: 'Direito Administrativo: Aula 01 – Introdução ao Direito Administrativo', dur: '1:30' },
  { day: 'Qui', type: 'video', title: 'Direito Administrativo: videoaula 01 – Regime jurídico-administrativo', dur: '1:30' },
  { day: 'Sex', type: 'pdf', title: 'Processo Civil: Aula 01 – Introdução e Normas Fundamentais', dur: '1:30' },
  { day: 'Sáb', type: 'q', title: 'Questões da semana · 40 questões (Const., Adm. e Proc. Civil)', dur: '1:30' },
]

// ── Meus cronogramas ────────────────────────────────────────────────────────
export type MeuStatus = 'ativo' | 'arq'
export const MEUS: Array<{ name: string; base: string; sub: string; date: string; hour: string; done: number; total: number; status: MeuStatus }> = [
  { name: '2H', base: 'PGE/PGM Completo · 2h/dia · Seg–Sáb', sub: 'começa 07/09/2026 · 83 semanas + 6 rev.', date: '02/09/2026', hour: '15:12', done: 2, total: 743, status: 'ativo' },
  { name: 'novo2 2h', base: 'PGE/PGM Completo · 2h/dia · Seg–Sáb', sub: 'começa 31/08/2026 · 83 semanas + 6 rev.', date: '26/08/2026', hour: '18:45', done: 0, total: 743, status: 'ativo' },
  { name: 'novo 2HR', base: 'Reta final PGE-SP · 2h/dia · Seg–Sex', sub: 'começa 31/08/2026 · 52 semanas + 4 rev.', date: '26/08/2026', hour: '18:26', done: 0, total: 412, status: 'ativo' },
  { name: '2H - JOAO', base: 'PGE/PGM Completo · 2h/dia · Seg–Sáb', sub: 'começa 31/08/2026 · 83 semanas + 6 rev.', date: '26/08/2026', hour: '11:02', done: 0, total: 743, status: 'arq' },
]
export const MEUS_FILTER_LAB: Record<'todos' | 'ativos' | 'arq', string> = {
  todos: 'Todos · 4',
  ativos: 'Ativos · 3',
  arq: 'Arquivados · 1',
}

// ── Plano aberto: acordeões (lista) por semana ─────────────────────────────
export const WK: Array<{ n: number; range: string; total: number }> = [
  { n: 1, range: '07/09 – 12/09', total: 12 },
  { n: 2, range: '14/09 – 19/09', total: 24 },
  { n: 3, range: '21/09 – 26/09', total: 24 },
  { n: 4, range: '28/09 – 03/10', total: 24 },
  { n: 5, range: '05/10 – 10/10', total: 24 },
  { n: 6, range: '12/10 – 17/10', total: 24 },
]

// ── Grade semanal: conteúdo por célula ──────────────────────────────────────
export const G_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const LDAY = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const LDUR = ['3–4h', '30min–1h', '40min–1h30', '40min–1h30']
export const G_SUBJ = ['Direito Constitucional', 'Direito Administrativo', 'Processo Civil', 'Direito Tributário', 'Direito Civil', 'Direito Financeiro']
export const G_TOP: string[][] = [
  ['Constitucionalismo e Constituição', 'Introdução ao Direito Administrativo', 'Introdução e Normas Fundamentais do Processo Civil', 'Tributos em Geral e Espécies Tributárias', 'LINDB e Direito Civil Constitucional', 'Introdução ao Direito Financeiro'],
  ['Poder Constituinte', 'Princípios da Administração', 'Jurisdição e Ação', 'Competência Tributária', 'Pessoa Natural', 'Orçamento Público'],
  ['Direitos Fundamentais I', 'Organização Administrativa', 'Competência', 'Limitações ao Poder de Tributar', 'Pessoa Jurídica', 'Receita Pública'],
  ['Direitos Fundamentais II', 'Agentes Públicos', 'Sujeitos do Processo', 'Obrigação Tributária', 'Bens', 'Despesa Pública'],
  ['Direitos Sociais e Nacionalidade', 'Poderes Administrativos', 'Atos Processuais', 'Crédito Tributário', 'Fatos e Negócios Jurídicos', 'Lei de Responsabilidade Fiscal'],
  ['Organização do Estado', 'Atos Administrativos', 'Tutela Provisória', 'Suspensão e Extinção do Crédito', 'Prescrição e Decadência', 'Dívida Pública'],
]
export const G_LEG: string[][] = [
  ['CF · Preâmbulo ao art. 5º, XXVI', 'CPC · Arts. 1º a 15', 'Lei nº 8.112/90 · Arts. 1º a 32', 'LINDB · leitura completa', 'CF · Art. 5º, XXVII ao art. 5º, §4º', 'CPC · Arts. 16 a 69'],
  ['CF · Arts. 6º a 17', 'CPC · Arts. 70 a 118', 'Lei nº 8.112/90 · Arts. 33 a 115', 'CTN · Arts. 1º a 15', 'CC · Arts. 1º a 39', 'Lei nº 4.320/64 · Arts. 1º a 21'],
  ['CF · Arts. 18 a 36', 'CPC · Arts. 119 a 138', 'Lei nº 9.784/99 · Arts. 1º a 30', 'CTN · Arts. 16 a 80', 'CC · Arts. 40 a 69', 'LRF · Arts. 1º a 17'],
  ['CF · Arts. 37 a 43', 'CPC · Arts. 139 a 187', 'Lei nº 9.784/99 · Arts. 31 a 70', 'CTN · Arts. 113 a 138', 'CC · Arts. 79 a 103', 'LRF · Arts. 18 a 42'],
  ['CF · Arts. 44 a 75', 'CPC · Arts. 188 a 293', 'Lei nº 8.429/92 · Arts. 1º a 13', 'CTN · Arts. 139 a 155', 'CC · Arts. 104 a 184', 'Lei nº 4.320/64 · Arts. 22 a 58'],
  ['CF · Arts. 76 a 103', 'CPC · Arts. 294 a 311', 'Lei nº 14.133/21 · Arts. 1º a 25', 'CTN · Arts. 156 a 182', 'CC · Arts. 185 a 232', 'LRF · Arts. 43 a 75'],
]
export const G_RANGE = ['07/09 a 12/09', '14/09 a 19/09', '21/09 a 26/09', '28/09 a 03/10', '05/10 a 10/10', '12/10 a 17/10']
// linhas da grade: [carga, rótulo, tipo da pill]
export const G_ROWS: Array<{ hrs: string; label: string; type: GoalType }> = [
  { hrs: '3 – 4h', label: 'PDFULL + Videoaula', type: 'aula' },
  { hrs: '30 min – 1h', label: 'PDFLASH ou Flashcards', type: 'flash' },
  { hrs: '40 min – 1h30', label: 'Resolução de questões', type: 'q' },
  { hrs: '40 min – 1h30', label: 'LEGPROC', type: 'lei' },
]

// Plano fixo (números do mock)
export const PLAN_TOTAL_GOALS = 743
export const PLAN_WEEKS = 89
export const PLAN_CURRENT_WEEK = 5

// MEQ: linha do tempo das matérias (gantt)
export const GANTT: Array<{ name: string; segments: Array<[number, number]>; color: string }> = [
  { name: 'Constitucional', segments: [[0, 10], [30, 8], [62, 8]], color: '#3E7FE0' },
  { name: 'Administrativo', segments: [[0, 12], [28, 10], [60, 8]], color: '#5ECEF0' },
  { name: 'Processo Civil', segments: [[2, 12], [36, 10], [70, 8]], color: '#2EC77A' },
  { name: 'Tributário', segments: [[14, 12], [48, 10]], color: '#F2A93B' },
  { name: 'Civil', segments: [[18, 12], [52, 10]], color: '#E5484D' },
  { name: 'Financeiro', segments: [[26, 8], [76, 6]], color: '#8F75FF' },
  { name: 'Revisões', segments: [[13, 1], [27, 1], [41, 1], [55, 1], [69, 1], [83, 1]], color: '#171E3B' },
]
export const GANTT_AXIS = [1, 15, 30, 45, 60, 75, 89]

// ── Chave de célula/meta: `${week}${row}${day}` (row 0..3, day 0..5) ─────────
export function cellKey(week: number, row: number, day: number) {
  return `${week}${row}${day}`
}
// Célula marcável? (semana 1 não tem flashcards/questões)
export function isMarkable(week: number, row: number) {
  return !(week === 1 && (row === 1 || row === 2))
}
// Estado inicial "concluído" (semana 1, aula, seg/ter = feito por padrão)
export function initialDone(week: number, row: number, day: number) {
  return week === 1 && row === 0 && day < 2
}

// Itens da lista de metas por semana (ordenado por dia)
export function listItems(week: number): Array<{ key: string; day: string; type: GoalType; title: string; dur: string }> {
  const i = week - 1
  const out: Array<{ key: string; day: string; type: GoalType; title: string; dur: string }> = []
  const pad = (n: number) => String(n).padStart(2, '0')
  for (let d = 0; d < 6; d++) {
    const rows: GoalType[] = ['aula', 'flash', 'q', 'lei']
    for (let r = 0; r < 4; r++) {
      if (week === 1 && (r === 1 || r === 2)) continue
      let title: string
      if (r === 0) title = `${G_SUBJ[d]}: Aula ${pad(week)} – ${G_TOP[i][d]} (PDFULL + videoaula)`
      else if (r === 1) title = `Flashcards · Aula ${pad(week - 1)} · ${G_SUBJ[d]}`
      else if (r === 2) title = `${15 + 5 * (d % 2)} questões · ${G_TOP[i - 1][d]}`
      else title = 'Legproc · ' + G_LEG[i][d]
      out.push({ key: cellKey(week, r, d), day: LDAY[d], type: rows[r], title, dur: LDUR[r] })
    }
  }
  return out
}

// Conteúdo de célula da grade por (row,day)
export function gridCellContent(week: number, row: number, day: number): { aula?: { subject: string; topic: string }; text?: string; dash?: boolean; leg?: { a: string; b: string } } {
  const i = week - 1
  if (row === 0) return { aula: { subject: G_SUBJ[day], topic: G_TOP[i][day] } }
  if (row === 1) return week === 1 ? { dash: true } : { text: `Flashcards · Aula ${String(week - 1).padStart(2, '0')}\n${G_SUBJ[day].replace('Direito ', '')}` }
  if (row === 2) return week === 1 ? { dash: true } : { text: `${15 + 5 * (day % 2)} questões\n${G_TOP[i - 1][day]}` }
  const [a, b] = G_LEG[i][day].split(' · ')
  return { leg: { a, b } }
}

// ── Cálculo da prévia (spec §3.2; mover para o backend no futuro) ────────────
const HOURS: Record<RtKey, number> = { '1h': 1, '2h': 2, '3h': 3, '4h': 4 }
const BASE_WEEKS: Record<RtKey, number> = { '1h': 178, '2h': 89, '3h': 60, '4h': 45 }
const BASE_FACTOR: Record<BsKey, number> = { pge: 1, reta: 0.58, lei: 0.35 }
const BASE_NAME: Record<BsKey, string> = { pge: 'PGE/PGM Completo', reta: 'Reta final PGE-SP', lei: 'Lei Seca diária' }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export interface Previa {
  weeks: number
  contentWeeks: number
  reviewWeeks: number
  activities: string
  xp: string
  days: number
  daysTxt: string
  start: string
  end: string
  hours: string
  totalH: string
  perWeek: string
  base: string
  name: string
  startDay: string
  warn: boolean
}

export function calcPrevia(rt: RtKey, bs: BsKey, weekdays: boolean[], sd: number, opts: boolean[]): Previa {
  const hrs = HOURS[rt]
  let bw = BASE_WEEKS[rt]
  const selDays = weekdays.map((v, d) => (v ? DAYN[d] : null)).filter(Boolean) as string[]
  const nd = selDays.length
  bw = Math.round(bw * BASE_FACTOR[bs])
  const ndx = Math.max(1, nd)
  const weeks = Math.round((bw * 6) / ndx)
  const rev = opts[0] ? Math.max(1, Math.round(weeks / 14)) : 0
  const acts = Math.round(weeks * ndx * 1.39 * (opts[2] ? 1.25 : 1) * (opts[3] ? 1 : 0.82))
  const st = new Date(2026, 9, sd)
  const en = new Date(st.getTime() + weeks * 7 * 864e5)
  const f2 = (n: number) => String(n).padStart(2, '0')
  const fmt = (x: Date) => `${f2(x.getDate())}/${f2(x.getMonth() + 1)}/${x.getFullYear()}`
  const base = BASE_NAME[bs]
  return {
    weeks,
    contentWeeks: weeks - rev,
    reviewWeeks: rev,
    activities: acts.toLocaleString('pt-BR'),
    xp: (acts * 5).toLocaleString('pt-BR'),
    days: nd,
    daysTxt: nd ? selDays.join(' · ') : 'nenhum dia',
    start: fmt(st),
    end: fmt(en),
    hours: hrs + 'h',
    totalH: Math.round(weeks * ndx * hrs).toLocaleString('pt-BR') + ' h',
    perWeek: ndx * hrs + ' h por semana',
    base,
    name: base.split(' ')[0] + ' ' + hrs + 'H',
    startDay: DOW[st.getDay()] + ', ' + sd + ' de outubro',
    warn: nd < 3,
  }
}
