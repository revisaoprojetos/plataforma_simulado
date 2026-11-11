// Datas "Plataforma Revisão" (admin) — SEMPRE no fuso de Brasília (UTC-3, sem horário de verão).
// Puro (sem server-only): usado por loaders do servidor e por componentes.

const MS_H = 3600e3

/** Hoje (AAAA-MM-DD) em Brasília. */
export function hojeBrt(): string {
  return new Date(Date.now() - 3 * MS_H).toISOString().slice(0, 10)
}

/** Data civil (AAAA-MM-DD) em Brasília de um instante ISO. */
export function diaBrt(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Date(d.getTime() - 3 * MS_H).toISOString().slice(0, 10)
}

/** AAAA-MM-DD + n dias (aritmética em UTC, sem efeito de fuso). */
export function somaDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Dia da semana (0=dom … 6=sáb) de uma data civil. */
export function diaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

export function diffDias(a: string, b: string): number {
  return Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 864e5)
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** DD/MM/AAAA a partir de AAAA-MM-DD. */
export function dataBr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "há 2 h" / "ontem" / "há 3 dias" (relativo a agora, em Brasília). */
export function quandoRel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  const h = Math.floor((Date.now() - t) / MS_H)
  if (h < 1) return 'agora há pouco'
  if (h < 24 && diaBrt(iso) === hojeBrt()) return `há ${h} h`
  const dd = diffDias(hojeBrt(), diaBrt(iso))
  if (dd <= 1) return 'ontem'
  return `há ${dd} dias`
}

/** "ontem" / "hoje" / "há N dias" para um dia civil. */
export function diaRel(isoDia: string): string {
  const dd = diffDias(hojeBrt(), isoDia)
  if (dd <= 0) return 'hoje'
  if (dd === 1) return 'ontem'
  return `há ${dd} dias`
}

/** "Rafael T." — primeiro nome + inicial do último sobrenome (terceiros no admin). */
export function nomeCurto(nome: string | null | undefined): string {
  const p = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return 'Aluno'
  if (p.length === 1) return p[0]
  return `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`
}

/** "hoje 11:42" / "ontem 18:30" / "05/11 09:10" (Brasília). */
export function quandoHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const hora = new Date(new Date(iso).getTime() - 3 * MS_H).toISOString().slice(11, 16)
  const dd = diffDias(hojeBrt(), diaBrt(iso))
  if (dd <= 0) return `hoje ${hora}`
  if (dd === 1) return `ontem ${hora}`
  const d = diaBrt(iso)
  return `${d.slice(8)}/${d.slice(5, 7)} ${hora}`
}
