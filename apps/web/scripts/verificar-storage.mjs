// Verificação do STORAGE ativo (supabase | s3/Hetzner). Mostra o provider, lista os buckets e faz um
// round-trip REAL (upload → leitura → remoção) no bucket `pdfs` para provar que está escrevendo/lendo no
// lugar certo. Use para confirmar a migração.
//
// Como rodar (precisa das MESMAS envs do runtime — rode no VPS ou com --env-file):
//   node --env-file=apps/web/.env apps/web/scripts/verificar-storage.mjs
//   (ou exporte STORAGE_PROVIDER, S3_* / SUPABASE_* antes)
//
// Sai com código 0 se o round-trip passou; 1 caso contrário.

const PROVIDER = (process.env.STORAGE_PROVIDER ?? 'supabase').toLowerCase()
const BUCKETS_LOGICOS = ['conteudos', 'imagens', 'pdfs', 'discursivas', 'cadernos']
const mask = (v) => (v ? v.slice(0, 4) + '…' + v.slice(-3) : '(vazio)')
const bucketFisico = (logico) => { const p = process.env.S3_BUCKET_PREFIX ?? ''; return p && !logico.startsWith(p) ? p + logico : logico }

function linha(t) { console.log(t) }

async function verificarS3() {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, ListBucketsCommand } = await import('@aws-sdk/client-s3')
  linha('Provider: s3')
  linha(`  endpoint       = ${process.env.S3_ENDPOINT || '(AWS padrão)'}`)
  linha(`  region         = ${process.env.S3_REGION ?? 'us-east-1'}`)
  linha(`  bucket prefix  = ${process.env.S3_BUCKET_PREFIX ?? '(nenhum)'}`)
  linha(`  public base    = ${process.env.S3_PUBLIC_BASE_URL || '(deriva do endpoint)'}`)
  linha(`  access key     = ${mask(process.env.S3_ACCESS_KEY_ID)}`)
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) { linha('  ✗ credenciais S3 ausentes'); return false }

  const client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  })

  // 1) buckets existentes
  try {
    const out = await client.send(new ListBucketsCommand({}))
    const nomes = (out.Buckets ?? []).map((b) => b.Name)
    linha(`\nBuckets no S3 (${nomes.length}): ${nomes.join(', ') || '(nenhum)'}`)
    for (const l of BUCKETS_LOGICOS) {
      const f = bucketFisico(l)
      let ok = false
      try { await client.send(new HeadBucketCommand({ Bucket: f })); ok = true } catch { ok = false }
      linha(`  ${ok ? '✓' : '✗'} ${l} → ${f}`)
    }
  } catch (e) { linha(`\n✗ ListBuckets falhou: ${e?.message || e}`) }

  // 2) round-trip no bucket pdfs
  const fisico = bucketFisico('pdfs')
  const key = `__verificacao/health-${Date.now()}.txt`
  const corpo = `ok ${new Date().toISOString()}`
  try {
    const t0 = Date.now()
    await client.send(new PutObjectCommand({ Bucket: fisico, Key: key, Body: corpo, ContentType: 'text/plain' }))
    const tPut = Date.now() - t0
    const got = await client.send(new GetObjectCommand({ Bucket: fisico, Key: key }))
    const lido = await got.Body.transformToString()
    await client.send(new DeleteObjectCommand({ Bucket: fisico, Key: key }))
    const ok = lido === corpo
    linha(`\nRound-trip em ${fisico}: ${ok ? '✓ OK' : '✗ bytes divergem'} (put ${tPut}ms)`)
    return ok
  } catch (e) { linha(`\n✗ Round-trip S3 falhou: ${e?.message || e}`); return false }
}

async function verificarSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  linha('Provider: supabase')
  linha(`  url        = ${process.env.SUPABASE_URL || '(vazio)'}`)
  linha(`  service key= ${mask(process.env.SUPABASE_SERVICE_ROLE_KEY)}`)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { linha('  ✗ credenciais Supabase ausentes'); return false }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data: buckets } = await sb.storage.listBuckets()
    linha(`\nBuckets no Supabase: ${(buckets ?? []).map((b) => b.name).join(', ') || '(nenhum)'}`)
  } catch (e) { linha(`\n✗ listBuckets falhou: ${e?.message || e}`) }

  const key = `__verificacao/health-${Date.now()}.txt`
  const corpo = `ok ${new Date().toISOString()}`
  try {
    const t0 = Date.now()
    const upr = await sb.storage.from('pdfs').upload(key, new Blob([corpo], { type: 'text/plain' }), { upsert: true })
    if (upr.error) throw upr.error
    const tPut = Date.now() - t0
    const dl = await sb.storage.from('pdfs').download(key)
    const lido = dl.data ? await dl.data.text() : ''
    await sb.storage.from('pdfs').remove([key])
    const ok = lido === corpo
    linha(`\nRound-trip em pdfs: ${ok ? '✓ OK' : '✗ bytes divergem'} (put ${tPut}ms)`)
    return ok
  } catch (e) { linha(`\n✗ Round-trip Supabase falhou: ${e?.message || e}`); return false }
}

const ok = await (PROVIDER === 's3' ? verificarS3() : verificarSupabase())
linha(`\n${ok ? '✅ Storage OK — escrevendo/lendo no provider ativo.' : '❌ Storage com problema — ver mensagens acima.'}`)
process.exit(ok ? 0 : 1)
