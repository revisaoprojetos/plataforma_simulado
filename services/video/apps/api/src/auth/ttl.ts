const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Converte "15m", "7d", "30s", "2h" em segundos. */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) throw new Error(`TTL inválido: "${ttl}" (use ex.: 15m, 7d)`);
  return Number(m[1]) * UNIT_SECONDS[m[2]];
}
