// UUID v4 único do cliente do Caderno (puro, sem server-only). Usa crypto.randomUUID quando existe; senão getRandomValues;
// por último Math.random — sempre no formato v4 válido (versão 4, variante 8..b), aceito pelos esquemas zod `.uuid()`.
export function novoUuid(): string {
  const c = (globalThis as { crypto?: Partial<Crypto> }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}
