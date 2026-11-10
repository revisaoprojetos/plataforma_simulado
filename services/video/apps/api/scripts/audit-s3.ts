/*
 * Auditoria SOMENTE LEITURA do bucket de vídeos: objetos que o banco não conhece, HLS faltando
 * e postura do bucket (ACL pública, credencial que enxerga outros buckets).
 *
 *   npm run s3:audit -w apps/api            # sai com código 1 se houver achados (use em cron/alerta)
 *
 * Não lê o conteúdo dos objetos e não toca em outros buckets (só os lista para contar).
 * Limite: o Hetzner não tem log de acesso, então leituras externas não aparecem aqui.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GetBucketAclCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { parseEnv } from '../src/config/env';
import { auditKeys, postureWarnings } from '../src/storage/audit';

function loadDotenv(path: string): void {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sem .env: usa o ambiente */
  }
}

async function main(): Promise<void> {
  loadDotenv(resolve(__dirname, '../../../.env'));
  const env = parseEnv(process.env);
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const prisma = new PrismaClient();

  try {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const r = await s3.send(
        new ListObjectsV2Command({ Bucket: env.S3_BUCKET, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = r.NextContinuationToken;
    } while (token);

    const [tenants, videos, subtitles] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true } }),
      prisma.video.findMany({ select: { id: true, tenantId: true, status: true } }),
      prisma.subtitle.findMany({ select: { s3Key: true } }),
    ]);
    const findings = auditKeys(keys, {
      tenantIds: new Set(tenants.map((t) => t.id)),
      videos: new Set(videos.map((v) => `${v.tenantId}/${v.id}`)),
      readyVideos: new Set(
        videos.filter((v) => v.status === 'ready').map((v) => `${v.tenantId}/${v.id}`),
      ),
      subtitleKeys: new Set(subtitles.map((s) => s.s3Key)),
    });

    const acl = await s3.send(new GetBucketAclCommand({ Bucket: env.S3_BUCKET }));
    const publicGrants = (acl.Grants ?? [])
      .filter((g) => /AllUsers|AuthenticatedUsers/.test(g.Grantee?.URI ?? ''))
      .map((g) => `${g.Grantee?.URI?.split('/').pop()}:${g.Permission}`);
    const { Buckets } = await s3.send(new ListBucketsCommand({}));
    const warnings = postureWarnings({
      publicGrants,
      hasPolicy: false,
      visibleBuckets: Buckets?.length ?? 0,
    });

    console.log(
      `bucket ${env.S3_BUCKET}: ${keys.length} objetos, ${videos.length} vídeos no banco`,
    );
    for (const f of findings)
      console.log(`ACHADO ${f.kind}: ${f.key}${f.detail ? ` (${f.detail})` : ''}`);
    for (const w of warnings) console.log(`AVISO ${w}`);
    console.log(
      findings.length === 0 ? 'integridade: OK' : `integridade: ${findings.length} achado(s)`,
    );
    process.exitCode = findings.length === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(2);
});
