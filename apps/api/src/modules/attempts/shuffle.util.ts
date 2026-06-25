/**
 * Deterministic Fisher-Yates shuffle seeded by a UUID string.
 * The same sessao_id always produces the same ordering (P5).
 *
 * LCG parameters: same as glibc (multiplier 1103515245, increment 12345, modulus 2^31).
 */
function lcgSeed(uuidStr: string): () => number {
  // Derive a 32-bit seed from the UUID by summing char codes of hex digits
  const hex = uuidStr.replace(/-/g, '')
  let seed = 0
  for (let i = 0; i < hex.length; i++) {
    seed = ((seed * 31) + hex.charCodeAt(i)) >>> 0
  }

  return function next(): number {
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff) >>> 0
    return seed / 0x7fffffff
  }
}

export function deterministicShuffle<T>(items: T[], sessaoId: string): T[] {
  const arr = [...items]
  const rand = lcgSeed(sessaoId)

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr
}
