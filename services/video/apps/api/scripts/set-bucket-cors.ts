/*
 * Define o CORS do bucket do projeto para as origens informadas (upload direto do navegador).
 *   npm run s3:cors -w apps/api -- https://cursos.suaempresa.com http://localhost:5173 [--dry-run]
 *
 * Substitui as regras atuais. Com --dry-run só mostra o que seria aplicado.
 */
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export function buildRules(origins: string[]) {
  return [
    {
      AllowedOrigins: origins,
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'], // o multipart precisa ler o ETag de cada parte
      MaxAgeSeconds: 3600,
    },
  ];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const origins = args.filter((a) => !a.startsWith('--'));
  if (origins.length === 0)
    throw new Error('Informe ao menos uma origem (ex.: https://cursos.exemplo.com)');
  for (const o of origins) {
    if (!/^https?:\/\/[^/\s]+$/.test(o))
      throw new Error(`Origem inválida: "${o}" (use esquema://host[:porta], sem barra final)`);
  }

  loadDotenv(resolve(__dirname, '../../../.env'));
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw new Error('Defina S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY e S3_SECRET_KEY');
  }

  const rules = buildRules(origins);
  console.log(`Bucket ${S3_BUCKET} — regras ${dry ? '(simulação)' : 'a aplicar'}:`);
  console.log(JSON.stringify(rules, null, 2));
  if (dry) return;

  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(
    new PutBucketCorsCommand({ Bucket: S3_BUCKET, CORSConfiguration: { CORSRules: rules } }),
  );
  const applied = await s3.send(new GetBucketCorsCommand({ Bucket: S3_BUCKET }));
  console.log(
    `Aplicado. Origens agora: ${applied.CORSRules?.flatMap((r) => r.AllowedOrigins).join(', ')}`,
  );
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
