/**
 * Auditoria de integridade do bucket: compara o que existe no S3 com o que o banco conhece.
 * O Hetzner não oferece log de acesso nem eventos, então isto só enxerga objetos que não
 * deveriam existir (escrita externa), não leituras. Lógica pura; o script faz a E/S.
 */

export type FindingKind =
  'unexpected-prefix' | 'unknown-tenant' | 'orphan-video' | 'orphan-subtitle' | 'missing-hls';

export interface Finding {
  kind: FindingKind;
  key: string;
  detail?: string;
}

export interface KnownState {
  tenantIds: ReadonlySet<string>;
  /** `${tenantId}/${videoId}` de todos os vídeos do banco */
  videos: ReadonlySet<string>;
  /** `${tenantId}/${videoId}` dos vídeos com status `ready` */
  readyVideos: ReadonlySet<string>;
  /** s3Key de todas as legendas do banco */
  subtitleKeys: ReadonlySet<string>;
}

/** Prefixos de nível 1 tolerados fora de `tenants/` (scripts de verificação). */
const TOLERATED_ROOTS = ['_smoke/'];

const VIDEO_KEY = /^tenants\/([^/]+)\/(?:originals|videos)\/([^/]+)\//;
const SUBTITLE_KEY = /^tenants\/([^/]+)\/subtitles\//;

export function auditKeys(keys: readonly string[], known: KnownState): Finding[] {
  const findings: Finding[] = [];
  const hlsSeen = new Map<string, { master: boolean; key: boolean }>();

  for (const key of keys) {
    if (!key.startsWith('tenants/')) {
      if (!TOLERATED_ROOTS.some((r) => key.startsWith(r))) {
        findings.push({ kind: 'unexpected-prefix', key });
      }
      continue;
    }
    const tenantId = key.split('/')[1];
    if (!known.tenantIds.has(tenantId)) {
      findings.push({ kind: 'unknown-tenant', key, detail: tenantId });
      continue;
    }
    const video = VIDEO_KEY.exec(key);
    if (video) {
      const id = `${video[1]}/${video[2]}`;
      if (!known.videos.has(id)) {
        findings.push({ kind: 'orphan-video', key, detail: video[2] });
        continue;
      }
      const seen = hlsSeen.get(id) ?? { master: false, key: false };
      if (key.endsWith('/hls/master.m3u8')) seen.master = true;
      if (key.endsWith('/hls/key.bin')) seen.key = true;
      hlsSeen.set(id, seen);
      continue;
    }
    if (SUBTITLE_KEY.test(key)) {
      if (!known.subtitleKeys.has(key)) findings.push({ kind: 'orphan-subtitle', key });
      continue;
    }
    findings.push({ kind: 'unexpected-prefix', key });
  }

  for (const id of known.readyVideos) {
    const seen = hlsSeen.get(id);
    const [tenantId, videoId] = id.split('/');
    const base = `tenants/${tenantId}/videos/${videoId}/hls/`;
    if (!seen?.master) findings.push({ kind: 'missing-hls', key: `${base}master.m3u8` });
    if (!seen?.key) findings.push({ kind: 'missing-hls', key: `${base}key.bin` });
  }
  return findings;
}

export interface BucketPosture {
  /** o bucket concede acesso a "todos" ou a "qualquer usuário autenticado" */
  publicGrants: string[];
  hasPolicy: boolean;
  /** quantos buckets a mesma credencial enxerga (>1 = chave sem isolamento) */
  visibleBuckets: number;
}

export function postureWarnings(p: BucketPosture): string[] {
  const out: string[] = [];
  if (p.publicGrants.length > 0) out.push(`ACL pública: ${p.publicGrants.join(', ')}`);
  if (p.visibleBuckets > 1) {
    out.push(
      `a credencial enxerga ${p.visibleBuckets} buckets (chave de projeto compartilhado): ` +
        'quem a tiver lê os vídeos e as chaves AES',
    );
  }
  return out;
}
