// Controle de migrações (supabase/migrations/*.sql) — registro em public.migracoes_aplicadas.
//
//   node scripts/migracoes.mjs status                  -> lista aplicadas x PENDENTES (só leitura)
//   node scripts/migracoes.mjs baseline <ate>          -> marca como aplicadas (sem executar) todas com versão <= <ate>
//   node scripts/migracoes.mjs marcar <versao...>      -> marca como aplicada(s) (sem executar)
//   node scripts/migracoes.mjs aplicar [versao...]     -> executa as PENDENTES (ou só as indicadas), em ordem, 1 transação cada
//   node scripts/migracoes.mjs aplicar --dry           -> só mostra o que seria executado
//
// Versão = nome do arquivo sem ".sql". Detecta arquivo editado depois de aplicado (checksum).
// DATABASE_URL vem de apps/web/.env.local (ou da env). Nunca imprime a URL.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const dir = path.join(raiz, 'supabase', 'migrations')
const [cmd = 'status', ...args] = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const pos = args.filter((a) => !a.startsWith('--'))

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const f = path.join(raiz, 'apps', 'web', '.env.local')
  const m = fs.readFileSync(f, 'utf8').match(/^DATABASE_URL=(.+)$/m)
  if (!m) throw new Error('DATABASE_URL não encontrado')
  return m[1].trim().replace(/^["']|["']$/g, '')
}

const arquivos = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    return { versao: f.slice(0, -4), sql, sha: crypto.createHash('sha1').update(sql).digest('hex') }
  })

const c = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  if (cmd !== 'status') await c.query(`create table if not exists public.migracoes_aplicadas (
    versao text primary key,
    checksum text not null,
    aplicada_em timestamptz not null default now(),
    origem text not null default 'script'  -- script | baseline | manual
  )`)
  if (cmd !== 'status') await c.query('alter table public.migracoes_aplicadas enable row level security') // só service/postgres acessa

  const existe = (await c.query(`select to_regclass('public.migracoes_aplicadas') t`)).rows[0].t
  const rows = existe ? (await c.query('select versao, checksum, origem, aplicada_em from public.migracoes_aplicadas')).rows : []
  const reg = new Map(rows.map((r) => [r.versao, r]))
  const pendentes = arquivos.filter((a) => !reg.has(a.versao))
  const alteradas = arquivos.filter((a) => reg.has(a.versao) && reg.get(a.versao).checksum !== a.sha && reg.get(a.versao).origem === 'script')
  const orfas = [...reg.keys()].filter((v) => !arquivos.some((a) => a.versao === v))

  const marcar = async (lista, origem) => {
    for (const a of lista) {
      await c.query('insert into public.migracoes_aplicadas (versao, checksum, origem) values ($1,$2,$3) on conflict (versao) do nothing', [a.versao, a.sha, origem])
    }
  }

  if (cmd === 'status') {
    console.log(`Arquivos: ${arquivos.length} | Aplicadas (registradas): ${arquivos.length - pendentes.length} | PENDENTES: ${pendentes.length}`)
    if (pendentes.length) {
      console.log('\nPENDENTES (ordem de execução):')
      pendentes.forEach((a) => console.log('  ⏳', a.versao))
    }
    if (alteradas.length) {
      console.log('\n⚠️ Arquivo ALTERADO depois de aplicado (crie migração nova, não edite a antiga):')
      alteradas.forEach((a) => console.log('  ✏️', a.versao))
    }
    if (orfas.length) {
      console.log('\n⚠️ Registradas no banco sem arquivo no repo:')
      orfas.forEach((v) => console.log('  ?', v))
    }
    const fora = arquivos.filter((a) => !/^\d{14}_/.test(a.versao))
    if (fora.length) console.log('\nℹ️ Nome fora do padrão AAAAMMDDHHMMSS_nome:', fora.map((a) => a.versao).join(', '))
    if (reg.size === 0) console.log('\nℹ️ Registro vazio: rode "baseline <ultima-versao-ja-aplicada>" para iniciar o controle.')
  } else if (cmd === 'baseline') {
    const ate = pos[0]
    if (!ate) throw new Error('Informe a versão limite (ex.: 20261106060000_cronograma_adaptativo_qf ou só 20261106060000)')
    const lista = pendentes.filter((a) => a.versao.slice(0, ate.length) <= ate)
    await marcar(lista, 'baseline')
    console.log(`Marcadas como aplicadas (baseline): ${lista.length}. Restam pendentes: ${pendentes.length - lista.length}`)
  } else if (cmd === 'marcar') {
    const lista = pos.map((v) => arquivos.find((a) => a.versao === v || a.versao.startsWith(v))).filter(Boolean)
    if (!lista.length) throw new Error('Nenhuma versão encontrada')
    await marcar(lista, 'manual')
    lista.forEach((a) => console.log('✅ marcada', a.versao))
  } else if (cmd === 'aplicar') {
    const alvo = pos.length ? pendentes.filter((a) => pos.some((v) => a.versao === v || a.versao.startsWith(v))) : pendentes
    if (!alvo.length) console.log('Nada pendente.')
    for (const a of alvo) {
      if (flags.has('--dry')) { console.log('[dry] aplicaria', a.versao); continue }
      process.stdout.write(`Aplicando ${a.versao} … `)
      try {
        await c.query('begin')
        await c.query(a.sql)
        await c.query('insert into public.migracoes_aplicadas (versao, checksum, origem) values ($1,$2,$3)', [a.versao, a.sha, 'script'])
        await c.query('commit')
        console.log('ok')
      } catch (e) {
        await c.query('rollback').catch(() => {})
        console.log('ERRO →', e.message)
        console.log('Parado: as seguintes ficam pendentes (ordem importa).')
        process.exitCode = 1
        break
      }
    }
  } else {
    throw new Error(`Comando desconhecido: ${cmd}`)
  }
} finally {
  await c.end()
}
