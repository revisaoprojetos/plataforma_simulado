/*
 * Estimativa de EGRESS por aluno-hora. SOMENTE LEITURA: so faz SELECT no Postgres e ListObjectsV2 no S3.
 * Nunca escreve, apaga nem le o conteudo de objetos (so tamanhos). Nao precisa de segredos alem das
 * credenciais de leitura do bucket e do DATABASE_URL (use um usuario read-only quando possivel).
 *
 *   npx tsx apps/api/scripts/egress-estimate.ts [--days 30] [--tenant <uuid>] [--max-videos 40] [--no-s3] [--json]
 *
 * Entradas (env; .env da raiz do servico e carregado se existir, sem sobrescrever o ambiente):
 *   DATABASE_URL, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE
 *   MUX_OVERHEAD    (padrao 1.08)  sobrecarga do container MPEG-TS + criptografia AES-128 (PKCS7) sobre o bitrate nominal
 *   ASSUME_QUALITY  (padrao 720p)  qualidade assumida para sessoes sem qualities_s
 *   PRECO_EGRESS_POR_TB_BRL / PRECO_EGRESS_POR_TB_USD  preco por TB trafegado — NAO ha padrao (veja o console do provedor)
 *   PRECO_ARMAZENAMENTO_POR_TB_MES_USD                 idem, armazenamento
 *   FRANQUIA_EGRESS_TB                                 franquia de egress incluida no plano (TB/mes), se houver
 *
 * Nenhum preco e inventado aqui: sem as variaveis PRECO_*, o custo sai como "preencher PRECO_*".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Espelho de apps/worker/src/ladder.ts (kbps de video + audio). Se a escada mudar la, mude aqui:
 * o script confere o bitrate MEDIDO no S3 contra estes valores e avisa quando divergirem.
 */
export const LADDER_KBPS: Record<string, number> = {
  '240p': 400 + 64,
  '360p': 800 + 96,
  '480p': 1400 + 128,
  '720p': 2800 + 128,
  '1080p': 5000 + 192,
};

/** GB (decimal, 1e9) por hora de video assistida em uma qualidade, ja com a sobrecarga de container. */
export function gbPerHour(kbps: number, overhead: number): number {
  return (kbps * 1000 * 3600 * overhead) / 8 / 1e9;
}

export interface QualityRow {
  quality: string;
  seconds: number;
}

/** Egress estimado (GB) para um conjunto de segundos assistidos por qualidade. Qualidade desconhecida vira `fallback`. */
export function estimateGb(
  rows: QualityRow[],
  overhead: number,
  fallback: string,
): { gb: number; hours: number; unknown: string[] } {
  let gb = 0;
  let seconds = 0;
  const unknown: string[] = [];
  for (const r of rows) {
    let kbps = LADDER_KBPS[r.quality];
    if (kbps === undefined) {
      unknown.push(r.quality);
      kbps = LADDER_KBPS[fallback] ?? LADDER_KBPS['720p'];
    }
    gb += (r.seconds / 3600) * gbPerHour(kbps, overhead);
    seconds += r.seconds;
  }
  return { gb, hours: seconds / 3600, unknown };
}

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const num = (v: string | undefined, d: number) => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const optNum = (v: string | undefined) => {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

interface RenditionMeasure {
  rendition: string;
  bytes: number;
  seconds: number;
  measuredKbps: number;
  nominalKbps: number | undefined;
}

async function measureS3(
  s3: S3Client,
  bucket: string,
  videos: { id: string; tenantId: string; durationS: number | null }[],
): Promise<{ perRendition: RenditionMeasure[]; storageBytes: number; videosMeasured: number }> {
  const acc = new Map<string, { bytes: number; seconds: number }>();
  let storageBytes = 0;
  let measured = 0;
  for (const v of videos) {
    if (!v.durationS || v.durationS <= 0) continue;
    const prefix = `tenants/${v.tenantId}/videos/${v.id}/hls/`;
    const bytesBy = new Map<string, number>();
    let token: string | undefined;
    do {
      const r = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) {
        const rest = (o.Key ?? '').slice(prefix.length);
        const rendition = rest.split('/')[0];
        storageBytes += o.Size ?? 0;
        if (rest.includes('/') && /\.ts$/.test(rest)) {
          bytesBy.set(rendition, (bytesBy.get(rendition) ?? 0) + (o.Size ?? 0));
        }
      }
      token = r.NextContinuationToken;
    } while (token);
    for (const [rendition, bytes] of bytesBy) {
      const cur = acc.get(rendition) ?? { bytes: 0, seconds: 0 };
      cur.bytes += bytes;
      cur.seconds += v.durationS;
      acc.set(rendition, cur);
    }
    measured += 1;
  }
  const perRendition = [...acc.entries()]
    .map(([rendition, a]) => ({
      rendition,
      bytes: a.bytes,
      seconds: a.seconds,
      measuredKbps: (a.bytes * 8) / a.seconds / 1000,
      nominalKbps: LADDER_KBPS[rendition],
    }))
    .sort((x, y) => (x.nominalKbps ?? 0) - (y.nominalKbps ?? 0));
  return { perRendition, storageBytes, videosMeasured: measured };
}

async function main(): Promise<void> {
  loadDotenv(resolve(__dirname, '../../../.env'));
  const days = num(arg('days'), 30);
  const tenant = arg('tenant');
  const maxVideos = Math.floor(num(arg('max-videos'), 40));
  const overhead = num(process.env.MUX_OVERHEAD, 1.08);
  const fallback = process.env.ASSUME_QUALITY || '720p';
  const asJson = flag('json');
  const since = new Date(Date.now() - days * 86_400_000);

  const prisma = new PrismaClient();
  const out: Record<string, unknown> = { readOnly: true, days, tenant: tenant ?? 'todos', overhead };

  try {
    const tenantSql = tenant ? Prisma.sql`AND ws.tenant_id = ${tenant}` : Prisma.empty;

    // 1) Uso real: segundos assistidos por qualidade (jsonb_each_text sobre qualities_s)
    const byQuality = await prisma.$queryRaw<{ quality: string; seconds: number }[]>(Prisma.sql`
      SELECT q.key AS quality, SUM(q.value::float8) AS seconds
        FROM watch_sessions ws, LATERAL jsonb_each_text(ws.qualities_s) q
       WHERE ws.started_at >= ${since} ${tenantSql} AND ws.qualities_s IS NOT NULL
       GROUP BY q.key`);
    const totals = await prisma.$queryRaw<
      { sessions: bigint; students: bigint; watched: number | null; no_quality: number | null }[]
    >(Prisma.sql`
      SELECT COUNT(*) AS sessions, COUNT(DISTINCT ws.user_id) AS students,
             SUM(ws.watched_s)::float8 AS watched,
             SUM(ws.watched_s) FILTER (WHERE ws.qualities_s IS NULL)::float8 AS no_quality
        FROM watch_sessions ws
       WHERE ws.started_at >= ${since} ${tenantSql}`);
    const t = totals[0];
    const rows: QualityRow[] = byQuality.map((r) => ({ quality: r.quality, seconds: r.seconds }));
    if (t?.no_quality) rows.push({ quality: fallback, seconds: t.no_quality });
    const est = estimateGb(rows, overhead, fallback);
    const students = Number(t?.students ?? 0);
    const sessions = Number(t?.sessions ?? 0);
    const watchedH = (t?.watched ?? 0) / 3600;
    const gbPerStudentHour = est.hours > 0 ? est.gb / est.hours : 0;
    const monthly = days > 0 ? { gb: (est.gb / days) * 30, hours: (est.hours / days) * 30 } : null;
    const mix = rows
      .map((r) => ({ quality: r.quality, pct: est.hours > 0 ? (r.seconds / 3600 / est.hours) * 100 : 0 }))
      .sort((a, b) => (LADDER_KBPS[a.quality] ?? 0) - (LADDER_KBPS[b.quality] ?? 0));
    out.real = {
      sessions,
      distinctStudents: students,
      watchedHours: watchedH,
      estimatedEgressGb: est.gb,
      gbPerStudentHour,
      projection30d: monthly,
      qualityMixPct: mix,
      unknownQualities: est.unknown,
      note: 'Estimativa a partir de watch_sessions; segmentos buferizados e nao assistidos (seek, abandono) ficam de fora — meca no console do provedor e compare.',
    };

    // 2) Medicao no S3 (somente tamanhos): bitrate real por qualidade e armazenamento
    if (!flag('no-s3')) {
      const need = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'].filter(
        (k) => !process.env[k],
      );
      if (need.length) {
        out.s3 = { skipped: `faltam variaveis: ${need.join(', ')}` };
      } else {
        const s3 = new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          region: process.env.S3_REGION || 'auto',
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY as string,
            secretAccessKey: process.env.S3_SECRET_KEY as string,
          },
        });
        const videos = await prisma.video.findMany({
          where: { status: 'ready', ...(tenant ? { tenantId: tenant } : {}) },
          select: { id: true, tenantId: true, durationS: true },
          orderBy: { createdAt: 'desc' },
          take: maxVideos,
        });
        const m = await measureS3(s3, process.env.S3_BUCKET as string, videos);
        out.s3 = {
          videosMeasured: m.videosMeasured,
          storageBytesSampled: m.storageBytes,
          perRendition: m.perRendition.map((r) => ({
            ...r,
            gbPerHourMeasured: (r.measuredKbps * 1000 * 3600) / 8 / 1e9,
            driftVsNominalPct:
              r.nominalKbps === undefined
                ? null
                : ((r.measuredKbps - r.nominalKbps) / r.nominalKbps) * 100,
          })),
          note: 'Bitrate medido = bytes dos .ts / duracao. Se divergir muito do nominal, ajuste MUX_OVERHEAD ou revise ladder.ts.',
        };
      }
    }

    // 3) Custo — somente com precos informados pelo operador (sem padroes)
    const pTbBrl = optNum(process.env.PRECO_EGRESS_POR_TB_BRL);
    const pTbUsd = optNum(process.env.PRECO_EGRESS_POR_TB_USD);
    const franquia = optNum(process.env.FRANQUIA_EGRESS_TB) ?? 0;
    const tbMes = monthly ? monthly.gb / 1000 : 0;
    const billableTb = Math.max(0, tbMes - franquia);
    out.cost = {
      egressTbPerMonth: tbMes,
      franchiseTb: franquia,
      billableTb,
      brl: pTbBrl === undefined ? 'preencher PRECO_EGRESS_POR_TB_BRL' : billableTb * pTbBrl,
      usd: pTbUsd === undefined ? 'preencher PRECO_EGRESS_POR_TB_USD' : billableTb * pTbUsd,
      note: 'Precos e franquia devem ser conferidos no console/tabela vigente do provedor antes de decidir.',
    };

    if (asJson) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    const f = (n: number, d = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });
    console.log(`[SOMENTE LEITURA] janela: ${days} dias | tenant: ${tenant ?? 'todos'} | overhead ${overhead}`);
    console.log(
      `uso real: ${sessions} sessoes, ${students} alunos, ${f(watchedH)} h assistidas -> ~${f(est.gb)} GB (${f(gbPerStudentHour, 3)} GB por aluno-hora)`,
    );
    if (monthly) console.log(`projecao 30 d: ${f(monthly.hours)} h, ~${f(monthly.gb)} GB (${f(monthly.gb / 1000, 3)} TB)`);
    console.log(`mix de qualidade: ${mix.map((m) => `${m.quality} ${f(m.pct, 1)}%`).join(' | ') || 'sem dados'}`);
    if (est.unknown.length) console.log(`AVISO qualidades fora da escada (tratadas como ${fallback}): ${est.unknown.join(', ')}`);
    const s3out = out.s3 as { skipped?: string; perRendition?: { rendition: string; measuredKbps: number; nominalKbps?: number; driftVsNominalPct: number | null }[]; videosMeasured?: number };
    if (s3out?.skipped) console.log(`S3: pulado (${s3out.skipped})`);
    else if (s3out?.perRendition) {
      console.log(`S3: ${s3out.videosMeasured} videos amostrados`);
      for (const r of s3out.perRendition)
        console.log(
          `  ${r.rendition}: ${f(r.measuredKbps, 0)} kbps medido vs ${r.nominalKbps ?? '?'} nominal (${r.driftVsNominalPct === null ? 'n/d' : f(r.driftVsNominalPct, 1) + '%'})`,
        );
    }
    const c = out.cost as { egressTbPerMonth: number; brl: unknown; usd: unknown };
    console.log(`custo/mes (egress ${f(c.egressTbPerMonth, 3)} TB): BRL=${String(c.brl)} | USD=${String(c.usd)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(2);
  });
}
