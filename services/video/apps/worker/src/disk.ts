import { readdir, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';

export type DiskVerdict = 'ok' | 'wait' | 'impossible';

/**
 * Decide se dá para processar um original de `sourceBytes` nesta pasta de trabalho.
 * Precisa do original + a saída HLS (≈ tamanho do original) + folga: `sourceBytes * factor + minFree`.
 * - `impossible`: nem com o disco vazio caberia (falha definitiva, sem retry);
 * - `wait`: cabe no disco, mas não agora (outro job/lixo ocupa) → o BullMQ tenta de novo depois.
 */
export function evaluateDisk(p: {
  freeBytes: number;
  totalBytes: number;
  sourceBytes: number;
  factor: number;
  minFreeBytes: number;
}): { verdict: DiskVerdict; neededBytes: number } {
  const neededBytes = Math.ceil(p.sourceBytes * p.factor) + p.minFreeBytes;
  if (neededBytes > p.totalBytes) return { verdict: 'impossible', neededBytes };
  if (neededBytes > p.freeBytes) return { verdict: 'wait', neededBytes };
  return { verdict: 'ok', neededBytes };
}

export async function diskUsage(dir: string): Promise<{ freeBytes: number; totalBytes: number }> {
  const s = await statfs(dir);
  return {
    freeBytes: Number(s.bavail) * Number(s.bsize),
    totalBytes: Number(s.blocks) * Number(s.bsize),
  };
}

/**
 * Remove pastas `video-*` abandonadas (processo morto por SIGKILL/OOM no meio de um job).
 * `olderThanMs` deve ser MAIOR que o tempo máximo de um job, para nunca apagar um job vivo
 * (várias réplicas podem dividir o mesmo volume no mesmo nó).
 */
export async function cleanStaleWorkDirs(
  base: string,
  olderThanMs: number,
  now = Date.now(),
): Promise<string[]> {
  const removed: string[] = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('video-')) continue;
    const full = join(base, entry.name);
    const info = await stat(full).catch(() => null);
    if (!info || now - info.mtimeMs < olderThanMs) continue;
    await rm(full, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}
