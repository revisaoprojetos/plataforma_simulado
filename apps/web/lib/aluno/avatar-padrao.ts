// Avatar PADRÃO do aluno sem foto escolhida.
//
// A CAPI (capivara) é mascote do REVISÃO — por padrão só o Revisão a usa. Outros tenants (VND, MEQ…)
// recebem um avatar NEUTRO de iniciais (até terem o próprio mascote). A escolha da capivara é
// DETERMINÍSTICA pelo nome (mesmo aluno = mesma capivara, não muda entre telas/carregamentos).
// Quem já escolheu foto tem `avatar` próprio e NÃO passa por aqui.
// Pool = poses positivas/neutras da capivara (public/mascote/*.png).

const POOL = [
  'feliz', 'joinha', 'satisfeita', 'ideia', 'concluido', 'estudante',
  'coracao', 'cafe', 'escrevendo', 'pensando', 'meditando', 'procurando',
].map((id) => `/mascote/${id}.png`)

// Cores do círculo de iniciais (neutras, boa legibilidade do texto branco).
const CORES_INICIAIS = ['#5B3FD0', '#0F7A44', '#2A6FB0', '#B3651E', '#9A2D76', '#1E8A64', '#C0392B', '#2C3E50']

/** Hash estável (FNV-1a) de uma string → uint32. Mesmo seed = mesmo número, em qualquer runtime. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Cor de fundo PADRÃO (determinística) do círculo do avatar, p/ quem não escolheu uma cor própria.
 *  Padroniza o visual: todo perfil tem uma cor de fundo (mesmo seed = mesma cor). */
export function corAvatarPadrao(seed?: string | null): string {
  const s = (seed ?? '').trim() || 'aluno'
  return CORES_INICIAIS[hash(s) % CORES_INICIAIS.length]
}

/** Iniciais a partir do nome (1ª + última palavra). */
function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  const a = p[0][0] ?? ''
  const b = p.length > 1 ? (p[p.length - 1][0] ?? '') : ''
  return (a + b).toUpperCase() || '?'
}

/** Avatar NEUTRO de iniciais (SVG data URI) — default de tenants sem mascote próprio. */
export function avatarIniciaisDataUri(nome?: string | null): string {
  const n = (nome ?? '').trim() || 'Aluno'
  const ini = iniciaisDe(n)
  const cor = CORES_INICIAIS[hash(n) % CORES_INICIAIS.length]
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>` +
    `<rect width='120' height='120' rx='60' fill='${cor}'/>` +
    `<text x='60' y='62' font-family='system-ui,-apple-system,sans-serif' font-size='50' font-weight='700' fill='#ffffff' text-anchor='middle' dominant-baseline='central'>${ini}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Avatar padrão determinístico para um aluno.
 * @param seed  nome (ou id) do aluno — base da escolha determinística.
 * @param brand marca do tenant. 'revisao' (ou ausente, p/ compat) → capivara (Capi). Qualquer outra
 *              marca → avatar neutro de iniciais (a Capi NÃO vaza para outros tenants).
 */
export function avatarPadraoDe(seed?: string | null, brand?: string | null): string {
  if (brand && brand !== 'revisao') return avatarIniciaisDataUri(seed)
  const s = (seed ?? '').trim() || 'aluno'
  return POOL[hash(s) % POOL.length]
}
