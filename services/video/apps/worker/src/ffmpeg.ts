import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Env } from './env';
import { Rendition } from './ladder';
import { SpriteLayout } from './playlist';

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface RunOptions {
  /** Tempo máximo deste comando (comandos curtos: probe, poster). Os longos usam só o `signal` do job. */
  timeoutMs?: number;
  /** Cancela o comando (SIGTERM e, se não sair, SIGKILL). A promise rejeita com `signal.reason`. */
  signal?: AbortSignal;
}

/** Tempo que o processo filho tem para sair após SIGTERM antes de levar SIGKILL. */
const KILL_GRACE_MS = 3000;

/**
 * Executa um binário; em erro devolve só o final do stderr (nunca o comando inteiro).
 * Ao cancelar, só resolve/rejeita DEPOIS que o processo filho morreu (a pasta temporária pode ser apagada em seguida).
 */
export function run(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const { timeoutMs, signal } = opts;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let abortReason: unknown;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));

    const terminate = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
    };
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          terminate();
        }, timeoutMs)
      : undefined;
    const onAbort = () => {
      abortReason = signal!.reason;
      terminate();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    child.on('error', (e) => {
      cleanup();
      reject(new Error(`não foi possível executar ${bin}: ${e.message}`));
    });
    child.on('close', (code) => {
      cleanup();
      if (abortReason !== undefined) reject(abortReason);
      else if (timedOut)
        reject(new Error(`${bin} excedeu o tempo limite de ${Math.round(timeoutMs! / 1000)}s`));
      else if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${bin} saiu com código ${code}: ${stderr.trim().split('\n').slice(-5).join(' | ')}`,
          ),
        );
    });
  });
}

/** `-threads N` (opção de saída/codec). Vazio quando 0 = ffmpeg decide. */
function threadArgs(env: Env): string[] {
  return env.FFMPEG_THREADS > 0 ? ['-threads', String(env.FFMPEG_THREADS)] : [];
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

export async function probe(env: Env, file: string, signal?: AbortSignal): Promise<ProbeResult> {
  const { stdout } = await run(
    env.FFPROBE_BIN,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { timeoutMs: 60_000, signal },
  );
  const data = JSON.parse(stdout) as { streams?: FfprobeStream[]; format?: { duration?: string } };
  const video = data.streams?.find((s) => s.codec_type === 'video' && s.width && s.height);
  const duration = Number(data.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('arquivo sem trilha de vídeo válida ou com duração desconhecida');
  }
  // Vídeos de celular vêm com rotação em metadado: o ffmpeg gira sozinho, então inverta as dimensões.
  const rotation = Math.abs(
    Number(
      video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
        video.tags?.rotate ??
        0,
    ),
  );
  const swap = rotation === 90 || rotation === 270;
  return {
    duration,
    width: swap ? video.height! : video.width!,
    height: swap ? video.width! : video.height!,
    hasAudio: data.streams!.some((s) => s.codec_type === 'audio'),
  };
}

/** Gera HLS de uma qualidade, criptografado com AES-128 (a URI da chave é um marcador reescrito no playback). */
export function encodeRendition(
  env: Env,
  src: string,
  dir: string,
  r: Rendition,
  keyInfoFile: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const maxrate = Math.round(r.videoKbps * 1.07);
  return run(
    env.FFMPEG_BIN,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-i',
      src,
      ...threadArgs(env),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      `scale=-2:${r.height}`,
      '-c:v',
      'libx264',
      '-preset',
      env.FFMPEG_PRESET,
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      `${r.videoKbps}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${Math.round(r.videoKbps * 1.5)}k`,
      // Keyframes a cada 6 s em todas as qualidades → troca de qualidade sem soluço.
      '-force_key_frames',
      'expr:gte(t,n_forced*6)',
      '-sc_threshold',
      '0',
      '-c:a',
      'aac',
      '-b:a',
      `${r.audioKbps}k`,
      '-ac',
      '2',
      '-ar',
      '48000',
      '-f',
      'hls',
      '-hls_time',
      '6',
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_filename',
      join(dir, 'seg_%05d.ts'),
      '-hls_key_info_file',
      keyInfoFile,
      join(dir, 'index.m3u8'),
    ],
    { signal }, // sem timeout por comando: o limite é do JOB inteiro (JOB_TIMEOUT_MS)
  );
}

export function extractPoster(
  env: Env,
  src: string,
  out: string,
  duration: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return run(
    env.FFMPEG_BIN,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(Math.min(duration * 0.1, 30)),
      '-i',
      src,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2',
      '-q:v',
      '3',
      out,
    ],
    { timeoutMs: 120_000, signal },
  );
}

export function extractSprite(
  env: Env,
  src: string,
  out: string,
  l: SpriteLayout,
  signal?: AbortSignal,
): Promise<unknown> {
  const vf =
    `fps=1/${l.interval},scale=${l.tileW}:${l.tileH}:force_original_aspect_ratio=decrease,` +
    `pad=${l.tileW}:${l.tileH}:(ow-iw)/2:(oh-ih)/2,tile=${l.cols}x${l.rows}`;
  return run(
    env.FFMPEG_BIN,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      src,
      '-an',
      ...threadArgs(env),
      '-vf',
      vf,
      '-frames:v',
      '1',
      '-q:v',
      '5',
      out,
    ],
    { signal },
  );
}
