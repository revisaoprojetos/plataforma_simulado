export interface LadderStep {
  name: string;
  height: number;
  videoKbps: number;
  audioKbps: number;
}

export interface Rendition extends LadderStep {
  width: number;
  /** BANDWIDTH do master playlist, em bits/s */
  bandwidth: number;
}

/** Escada de qualidades; só entram degraus com altura <= origem (nunca faz upscale). */
export const LADDER: LadderStep[] = [
  { name: '240p', height: 240, videoKbps: 400, audioKbps: 64 },
  { name: '360p', height: 360, videoKbps: 800, audioKbps: 96 },
  { name: '480p', height: 480, videoKbps: 1400, audioKbps: 128 },
  { name: '720p', height: 720, videoKbps: 2800, audioKbps: 128 },
  { name: '1080p', height: 1080, videoKbps: 5000, audioKbps: 192 },
];

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function selectRenditions(srcWidth: number, srcHeight: number): Rendition[] {
  let steps = LADDER.filter((s) => s.height <= srcHeight);
  if (steps.length === 0) {
    // Origem menor que 240p: uma única qualidade na altura original.
    const h = even(srcHeight);
    steps = [{ name: `${h}p`, height: h, videoKbps: 300, audioKbps: 64 }];
  }
  return steps.map((s) => ({
    ...s,
    width: even((s.height * srcWidth) / srcHeight),
    bandwidth: Math.round((s.videoKbps + s.audioKbps) * 1000 * 1.1),
  }));
}

export function codecsFor(height: number, hasAudio: boolean): string {
  const video = height > 720 ? 'avc1.4d4028' : 'avc1.4d401f'; // Main 4.0 / 3.1
  return hasAudio ? `${video},mp4a.40.2` : video;
}
