export type Range = [from: number, to: number];

/** Aula concluída quando ao menos 90% dos segundos únicos foram realmente assistidos. */
export const COMPLETION_THRESHOLD = 0.9;

/** Heartbeats chegam a cada ~10 s: lacunas menores que isto entre trechos são ruído, não "pulo". */
export const MERGE_GAP_S = 1;

/**
 * Une trechos sobrepostos ou quase colados, limitando-os a [0, duration].
 * Entrada em qualquer ordem; saída ordenada e disjunta.
 */
export function mergeRanges(ranges: Range[], duration: number, gap = MERGE_GAP_S): Range[] {
  const clamped = ranges
    .map(([a, b]): Range => [
      Math.max(0, Math.min(a, duration)),
      Math.max(0, Math.min(b, duration)),
    ])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  const out: Range[] = [];
  for (const [a, b] of clamped) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Segundos únicos cobertos por trechos já mesclados. */
export function coveredSeconds(merged: Range[]): number {
  return merged.reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** Percentual (0–100) assistido; duração desconhecida conta como 0. */
export function percentWatched(merged: Range[], duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(100, (coveredSeconds(merged) / duration) * 100);
}

/**
 * Concluir exige cobertura (não basta pular para o fim). Considera a duração com uma pequena
 * folga, pois o último heartbeat raramente cai exatamente no final.
 */
export function isCompleted(merged: Range[], duration: number): boolean {
  return duration > 0 && coveredSeconds(merged) >= duration * COMPLETION_THRESHOLD;
}
