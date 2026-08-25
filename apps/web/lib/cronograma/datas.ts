/**
 * Aritmética de DATA CIVIL para o cronograma.
 *
 * Um cronograma não trabalha com instantes, e sim com dias do calendário: "a semana 7
 * começa em 24/09/2026". Misturar os dois modelos desloca a grade inteira em um dia —
 * `new Date('2026-09-24')` é meia-noite UTC, `new Date(2026, 8, 24)` é meia-noite local,
 * e no BRT (UTC−3) a primeira volta como 23/09 ao ser formatada localmente.
 *
 * Por isso tudo aqui é `'YYYY-MM-DD'` + `Date.UTC`, e a formatação lê os componentes UTC.
 * NÃO use `toLocaleDateString` nem `lib/brt.ts` (que é para `timestamptz`) neste módulo.
 *
 * Convenção de dia da semana: 0=domingo … 6=sábado (igual a `getUTCDay`), que é a mesma
 * usada em `dias_curso` no banco.
 */

export type DataISO = string // 'YYYY-MM-DD'

const DIA_MS = 86_400_000

/** 'YYYY-MM-DD' → milissegundos UTC. Lança em formato inválido (erro de dado, não de usuário). */
export function parseISO(d: DataISO): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) throw new Error(`Data inválida: ${d}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function toISO(ms: number): DataISO {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDias(d: DataISO, n: number): DataISO {
  return toISO(parseISO(d) + n * DIA_MS)
}

/** 0=domingo … 6=sábado. */
export function dow(d: DataISO): number {
  return new Date(parseISO(d)).getUTCDay()
}

/**
 * R1 — todo cronograma começa numa segunda-feira. Empurra para a segunda SEGUINTE,
 * nunca para trás; se já for segunda, fica onde está.
 */
export function proximaSegunda(d: DataISO): DataISO {
  const atual = dow(d)
  return atual === 1 ? d : addDias(d, (8 - atual) % 7)
}

/** Segunda da semana que contém `d` (ou o próprio `d`, se já for segunda). */
export function segundaAnteriorOuIgual(d: DataISO): DataISO {
  return addDias(d, -((dow(d) + 6) % 7))
}

/** Domingo que fecha a semana de `d` (ou o próprio `d`, se já for domingo). */
export function domingoSeguinteOuIgual(d: DataISO): DataISO {
  const atual = dow(d)
  return atual === 0 ? d : addDias(d, 7 - atual)
}

/**
 * Quantos dias após a segunda-feira cai um dia da semana — a peça que faz R3 funcionar.
 * Domingo (0) vira 6: num cronograma `[1,2,3,4,5,6,0]` o domingo é o ÚLTIMO dia da
 * semana de estudo, não o primeiro.
 */
export function offsetDesdeSegunda(diaSemana: number): number {
  return (diaSemana + 6) % 7
}

/** dd/mm/aaaa a partir dos componentes UTC (nunca do fuso da máquina). */
export function fmtBr(d: DataISO): string {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

/** "dd/mm/aaaa a dd/mm/aaaa" — a faixa que abre cada semana na tabela. */
export function fmtIntervalo(inicio: DataISO, fim: DataISO): string {
  return `${fmtBr(inicio)} a ${fmtBr(fim)}`
}

/** Hoje em data civil UTC — usado como piso do seletor de data no formulário. */
export function hojeISO(): DataISO {
  return new Date().toISOString().slice(0, 10)
}
