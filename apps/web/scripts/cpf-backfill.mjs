// Backfill do CPF criptografado (ETAPA 1): preenche cpf_enc + cpf_hash a partir da coluna `cpf` (texto aberto).
// NÃO apaga nem altera `cpf`. Idempotente (só linhas com cpf_hash nulo), em lotes por id, com pausa entre lotes.
//
//   Simulação (padrão, não grava):  node scripts/cpf-backfill.mjs
//   Gravar de verdade:              node scripts/cpf-backfill.mjs --aplicar
//   Opções: --lote=500  --tenant=<uuid>  --limite=<n linhas>
//
// Requer no ambiente: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ENCRYPTION_KEY (a MESMA do app).
// FAÇA BACKUP antes (pg_dump da tabela simulado_estudantes) e aplique ANTES a migração 20261113010000.
import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createHmac, createHash, randomBytes } from 'node:crypto'

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d }
const APLICAR = process.argv.includes('--aplicar')
const LOTE = Number(arg('lote', 500)), TENANT = arg('tenant', null), LIMITE = Number(arg('limite', 0))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, raw = process.env.APP_ENCRYPTION_KEY?.trim()
if (!url || !key) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!raw) { console.error('APP_ENCRYPTION_KEY ausente — sem a chave não dá para cifrar. Abortado.'); process.exit(1) }

// Mesma derivação de lib/crypto.ts (64 hex direto; senão SHA-256) e de lib/privacidade/cpf-cripto.ts (chave de HMAC separada).
const kEnc = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : createHash('sha256').update(raw).digest()
const kHash = createHash('sha256').update(`cpf-hash:v1:${raw}`).digest()
const cifrar = (t) => { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', kEnc, iv); const ct = Buffer.concat([c.update(t, 'utf8'), c.final()]); return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}` }
const hash = (d) => createHmac('sha256', kHash).update(d).digest('hex')

const svc = createClient(url, key, { auth: { persistSession: false } })
console.log(APLICAR ? '*** MODO GRAVAR ***' : '(simulação — nada será gravado; use --aplicar)', TENANT ? `tenant=${TENANT}` : 'todos os tenants')

let ultimoId = '00000000-0000-0000-0000-000000000000', lidas = 0, ok = 0, semCpfValido = 0, erros = 0
for (;;) {
  let q = svc.from('simulado_estudantes').select('id, cpf').is('cpf_hash', null).not('cpf', 'is', null).neq('cpf', '').gt('id', ultimoId).order('id', { ascending: true }).limit(LOTE)
  if (TENANT) q = q.eq('tenant_id', TENANT)
  const { data, error } = await q
  if (error) { console.error('Erro ao ler (a migração foi aplicada?):', error.message); process.exit(1) }
  if (!data?.length) break
  for (const r of data) {
    lidas++; ultimoId = r.id
    const d = String(r.cpf).replace(/\D/g, '')
    if (d.length !== 11) { semCpfValido++; continue } // mascarado/incompleto: não cifra lixo
    if (!APLICAR) { ok++; continue }
    const { error: e } = await svc.from('simulado_estudantes').update({ cpf_enc: cifrar(d), cpf_hash: hash(d) }).eq('id', r.id)
    if (e) { erros++; console.error('falha', r.id, e.message) } else ok++
  }
  console.log(`… ${lidas} lidas · ${ok} ${APLICAR ? 'gravadas' : 'a gravar'} · ${semCpfValido} sem CPF de 11 dígitos · ${erros} erros`)
  if (LIMITE && lidas >= LIMITE) break
  await new Promise((r) => setTimeout(r, 150))
}
console.log(`FIM: ${lidas} lidas · ${ok} ${APLICAR ? 'gravadas' : 'seriam gravadas'} · ${semCpfValido} ignoradas (CPF inválido/incompleto) · ${erros} erros`)
