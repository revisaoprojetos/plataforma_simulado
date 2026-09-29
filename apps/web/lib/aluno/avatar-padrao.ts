// Avatar PADRÃO do aluno sem foto escolhida: uma capivara VARIADA, escolhida de forma
// DETERMINÍSTICA pelo nome — cada aluno tem sempre a MESMA capivara (não muda a cada carregamento
// nem entre telas), mas há variedade entre alunos. Quem já escolheu foto tem `avatar` próprio e NÃO
// passa por aqui. Pool = poses positivas/neutras da capivara (public/mascote/*.png).

const POOL = [
  'feliz', 'joinha', 'satisfeita', 'ideia', 'concluido', 'estudante',
  'coracao', 'cafe', 'escrevendo', 'pensando', 'meditando', 'procurando',
].map((id) => `/mascote/${id}.png`)

/** Hash estável (FNV-1a) de uma string → uint32. Mesmo seed = mesmo número, em qualquer runtime. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Capivara padrão determinística para um aluno. `seed` = nome (ou id) do aluno. */
export function avatarPadraoDe(seed?: string | null): string {
  const s = (seed ?? '').trim() || 'aluno'
  return POOL[hash(s) % POOL.length]
}
