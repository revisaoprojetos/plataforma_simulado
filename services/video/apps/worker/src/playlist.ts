import { codecsFor, Rendition } from './ladder';

/** Playlist mestre. Os caminhos são relativos; a API reescreve para URLs assinadas no playback. */
export function buildMasterPlaylist(renditions: Rendition[], hasAudio: boolean): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const r of [...renditions].sort((a, b) => a.bandwidth - b.bandwidth)) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height},CODECS="${codecsFor(r.height, hasAudio)}"`,
      `${r.name}/index.m3u8`,
    );
  }
  return lines.join('\n') + '\n';
}

export interface SpriteLayout {
  interval: number;
  count: number;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
}

/** Uma miniatura a cada `interval` s, no máximo ~100, em grade de até 10 colunas. */
export function spriteLayout(duration: number): SpriteLayout {
  const interval = Math.max(5, Math.ceil(duration / 100));
  const count = Math.max(1, Math.ceil(duration / interval));
  const cols = Math.min(10, count);
  return { interval, count, cols, rows: Math.ceil(count / cols), tileW: 160, tileH: 90 };
}

export function formatVttTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** WebVTT que mapeia cada trecho do vídeo para um recorte do sprite (preview na timeline). */
export function buildSpriteVtt(
  duration: number,
  layout: SpriteLayout,
  file = 'sprite.jpg',
): string {
  const lines = ['WEBVTT', ''];
  for (let i = 0; i < layout.count; i++) {
    const start = i * layout.interval;
    const end = Math.min((i + 1) * layout.interval, duration);
    const x = (i % layout.cols) * layout.tileW;
    const y = Math.floor(i / layout.cols) * layout.tileH;
    lines.push(
      `${formatVttTime(start)} --> ${formatVttTime(end)}`,
      `${file}#xywh=${x},${y},${layout.tileW},${layout.tileH}`,
      '',
    );
  }
  return lines.join('\n');
}
