// Grade do calendário (puro, sem I/O). Semana começa no DOMINGO (como o protótipo). Datas AAAA-MM-DD (Brasília).
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export type DiaGrade = { iso: string; dia: number; fora: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const add = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

export function ymValido(ym: string | undefined, hoje: string): { y: number; m: number } {
  const mm = /^(\d{4})-(\d{2})$/.exec(ym ?? '')
  if (mm && +mm[2] >= 1 && +mm[2] <= 12) return { y: +mm[1], m: +mm[2] - 1 }
  return { y: +hoje.slice(0, 4), m: +hoje.slice(5, 7) - 1 }
}

export function ymMais(y: number, m: number, delta: number): string {
  const t = new Date(Date.UTC(y, m + delta, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 42 dias (6 semanas) do mês, começando no domingo. */
export function gradeMes(y: number, m: number): DiaGrade[] {
  const first = new Date(Date.UTC(y, m, 1))
  const start = add(first, -first.getUTCDay())
  return Array.from({ length: 42 }, (_, i) => { const d = add(start, i); return { iso: iso(d), dia: d.getUTCDate(), fora: d.getUTCMonth() !== m } })
}

/** 7 dias da semana (dom–sáb) que contém `dia`. */
export function gradeSemana(dia: string): DiaGrade[] {
  const d0 = new Date(`${dia}T00:00:00Z`)
  const start = add(d0, -d0.getUTCDay())
  return Array.from({ length: 7 }, (_, i) => { const d = add(start, i); return { iso: iso(d), dia: d.getUTCDate(), fora: false } })
}

export function diaValido(d: string | undefined): string | null {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(+new Date(`${d}T00:00:00Z`)) ? d : null
}

export function semanaMais(dia: string, delta: number): string { return iso(add(new Date(`${dia}T00:00:00Z`), delta * 7)) }
