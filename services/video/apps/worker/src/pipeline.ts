import { PrismaClient } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { throwIfAborted } from './abort';
import { diskUsage, evaluateDisk } from './disk';
import { Env } from './env';
import { encodeRendition, extractPoster, extractSprite, probe } from './ffmpeg';
import { selectRenditions } from './ladder';
import { buildMasterPlaylist, buildSpriteVtt, spriteLayout } from './playlist';
import { TranscodeJob } from './queue';
import { Storage } from './storage';

/** Marcador que a API troca pela URL real da chave no momento do playback. */
export const KEY_URI_PLACEHOLDER = '__KEY_URI__';

export interface Deps {
  env: Env;
  prisma: PrismaClient;
  storage: Storage;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function inBatches<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    throwIfAborted(signal);
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * Original (S3) → HLS multi-qualidade com AES-128 + poster + sprite → S3.
 * Idempotente: reprocessar apaga a saída anterior e gera tudo de novo.
 */
export async function processVideo(
  deps: Deps,
  job: TranscodeJob,
  signal?: AbortSignal,
): Promise<void> {
  const { env, prisma, storage, log } = deps;
  const video = await prisma.video.findFirst({
    where: { id: job.videoId, tenantId: job.tenantId },
  });
  if (!video)
    throw new UnrecoverableError(`vídeo ${job.videoId} não existe na empresa ${job.tenantId}`);

  const base = env.WORK_DIR ?? tmpdir();

  // Espaço em disco ANTES de baixar o original (GBs): evita encher o volume e derrubar outros jobs.
  const sourceBytes = await storage.size(video.sourceKey);
  const disk = evaluateDisk({
    ...(await diskUsage(base)),
    sourceBytes,
    factor: env.DISK_SPACE_FACTOR,
    minFreeBytes: env.MIN_FREE_DISK_BYTES,
  });
  const mb = (n: number) => Math.round(n / 1024 ** 2);
  if (disk.verdict === 'impossible') {
    throw new UnrecoverableError(
      `original de ${mb(sourceBytes)} MB não cabe na pasta de trabalho (precisa de ${mb(disk.neededBytes)} MB)`,
    );
  }
  if (disk.verdict === 'wait') {
    // Cabe no disco, só não agora: erro comum → o BullMQ tenta de novo com backoff.
    throw new Error(
      `sem espaço livre em ${base} para ${mb(sourceBytes)} MB (precisa de ${mb(disk.neededBytes)} MB)`,
    );
  }

  await prisma.video.update({
    where: { id: video.id },
    data: { status: 'processing', error: null },
  });
  log('processamento iniciado', { videoId: video.id, tenantId: video.tenantId, sourceBytes });

  const work = await mkdtemp(join(base, 'video-'));
  try {
    const src = join(work, `source${extname(video.sourceKey) || '.bin'}`);
    await storage.download(video.sourceKey, src, signal);
    throwIfAborted(signal);

    const info = await probe(env, src, signal).catch((e: Error) => {
      throwIfAborted(signal); // cancelamento não é "arquivo inválido"
      throw new UnrecoverableError(`arquivo inválido: ${e.message}`);
    });
    const renditions = selectRenditions(info.width, info.height);
    log('probe', { videoId: video.id, ...info, renditions: renditions.map((r) => r.name) });

    // Chave AES-128 do vídeo. O key info file diz ao ffmpeg qual URI gravar na playlist e onde está a chave.
    const out = join(work, 'out');
    const hls = join(out, 'hls');
    await mkdir(hls, { recursive: true });
    const keyFile = join(hls, 'key.bin');
    await writeFile(keyFile, randomBytes(16));
    const keyInfo = join(work, 'key.info');
    // IV aleatório por vídeo: sem a terceira linha o ffmpeg fixa IV=0 em todos os vídeos.
    const iv = randomBytes(16).toString('hex');
    await writeFile(keyInfo, `${KEY_URI_PLACEHOLDER}\n${keyFile}\n${iv}\n`);

    for (const r of renditions) {
      const dir = join(hls, r.name);
      await mkdir(dir, { recursive: true });
      throwIfAborted(signal);
      await encodeRendition(env, src, dir, r, keyInfo, signal);
      log('qualidade pronta', { videoId: video.id, rendition: r.name });
    }
    await writeFile(join(hls, 'master.m3u8'), buildMasterPlaylist(renditions, info.hasAudio));

    const thumbs = join(out, 'thumbs');
    await mkdir(thumbs, { recursive: true });
    const layout = spriteLayout(info.duration);
    await extractPoster(env, src, join(thumbs, 'poster.jpg'), info.duration, signal);
    await extractSprite(env, src, join(thumbs, 'sprite.jpg'), layout, signal);
    await writeFile(join(thumbs, 'sprite.vtt'), buildSpriteVtt(info.duration, layout));

    // Publica: limpa a saída anterior e envia tudo sob tenants/{tenantId}/videos/{videoId}/.
    const prefix = `tenants/${video.tenantId}/videos/${video.id}/`;
    throwIfAborted(signal);
    await storage.deletePrefix(prefix);
    const files = await walk(out);
    await inBatches(
      files,
      8,
      (f) => storage.uploadFile(prefix + relative(out, f).split('\\').join('/'), f, signal),
      signal,
    );
    throwIfAborted(signal);

    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'ready',
        durationS: info.duration,
        error: null,
        renditions: renditions.map((r) => ({
          name: r.name,
          width: r.width,
          height: r.height,
          bandwidth: r.bandwidth,
        })),
      },
    });
    log('processamento concluído', { videoId: video.id, files: files.length });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
