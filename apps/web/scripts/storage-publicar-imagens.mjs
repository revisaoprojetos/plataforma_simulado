// Torna o bucket `revisaopge-imagens` (Hetzner) LEGÍVEL PUBLICAMENTE (só GetObject) — equivalente ao bucket público
// `imagens` do Supabase. Necessário ANTES do SQL docs/sql-aplicar-twdr/18 (URLs absolutas passam a apontar p/ o Hetzner).
// NÃO toca nos outros buckets (pdfs/discursivas/cadernos continuam privados: acesso por URL assinada/proxy).
//
// Uso (de apps/web; lê .env.local):
//   node scripts/storage-publicar-imagens.mjs            → só MOSTRA a policy e o estado atual (nada é gravado)
//   node scripts/storage-publicar-imagens.mjs --aplicar  → grava a bucket policy (PutBucketPolicy)
//   node scripts/storage-publicar-imagens.mjs --remover  → remove a policy (volta a privado)
// Depois confira:  curl -sI https://hel1.your-objectstorage.com/revisaopge-imagens/assets/<arquivo>   → 200
import { readFileSync } from 'node:fs'
import { S3Client, GetBucketPolicyCommand, PutBucketPolicyCommand, DeleteBucketPolicyCommand } from '@aws-sdk/client-s3'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const Bucket = (env.S3_BUCKET_PREFIX ?? '') + 'imagens'
const s3 = new S3Client({
  region: env.S3_REGION || 'us-east-1', endpoint: env.S3_ENDPOINT || undefined, forcePathStyle: true,
  // O Hetzner recusa o checksum CRC32 que o SDK Node envia por padrão em alguns PUTs de config (ex.: PutBucketCors).
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
})
const policy = {
  Version: '2012-10-17',
  Statement: [{ Sid: 'PublicReadImagens', Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${Bucket}/*`] }],
}

console.log('Bucket:', Bucket)
try { console.log('Policy atual:', (await s3.send(new GetBucketPolicyCommand({ Bucket }))).Policy) } catch (e) { console.log('Policy atual: nenhuma (' + e.name + ')') }
console.log('Policy proposta:', JSON.stringify(policy))
if (process.argv.includes('--aplicar')) { await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: JSON.stringify(policy) })); console.log('OK: policy aplicada.') }
else if (process.argv.includes('--remover')) { await s3.send(new DeleteBucketPolicyCommand({ Bucket })); console.log('OK: policy removida.') }
else console.log('(dry-run — use --aplicar para gravar)')
