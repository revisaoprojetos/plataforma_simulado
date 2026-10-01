// DRY-RUN (padrão) — NÃO envia. Alunos da Lei Seca que PARARAM de fazer as aulas e ficaram INATIVOS.
// "Fez a aula" = aula COMPLETA (leitura + todas as questões do quiz). Mostra um panorama de inatividade
// e o alvo principal (parou ontem → última aula completa = ANTEONTEM).
// Uso:
//   node scripts/_leiseca-perdeu-sequencia.mjs                → dry-run, alvo = anteontem
//   node scripts/_leiseca-perdeu-sequencia.mjs --dias=3       → dry-run, alvo = inativos há >=3 dias
//   node scripts/_leiseca-perdeu-sequencia.mjs --enviar       → ENVIA (alvo = anteontem)
//   node scripts/_leiseca-perdeu-sequencia.mjs --enviar --dias=3  → ENVIA (inativos há >=N dias)
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import pg from 'pg'
const ENVIAR = process.argv.includes('--enviar')
const DIAS_ARG = (process.argv.find((a) => a.startsWith('--dias=')) || '').split('=')[1]
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const WH_ID = 'b8d8ca78-db7c-446c-b5e9-b09ec8ddd7d3'
const TZ = 'America/Sao_Paulo'
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const menos = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 86_400_000).toISOString().slice(0, 10)
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
const ONTEM = menos(hoje, 1), ANTEONTEM = menos(hoje, 2)
console.log(`hoje=${hoje}  ontem=${ONTEM}  anteontem=${ANTEONTEM}\n`)

const { rows: whr } = await pool.query(`SELECT id, nome, origem, url, secret, eventos, filtro_modulos, engajamento_regras FROM simulado_webhook_saida WHERE id=$1`, [WH_ID])
const wh = whr[0]
const { rows: tnt } = await pool.query(`SELECT nome, slug FROM simulado_tenants WHERE id=$1`, [TID])
const plataforma = { id: TID, nome: tnt[0]?.nome ?? null, slug: tnt[0]?.slug ?? null }
const interp = (t, v) => String(t ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (v[k] != null ? String(v[k]) : ''))

const fm = Array.isArray(wh.filtro_modulos) ? wh.filtro_modulos : []
const mq = `SELECT id, nome FROM simulado_pastas WHERE tenant_id=$1 AND is_folder=true AND folder_area='leitura'`
const modr = fm.length ? await pool.query(mq + ` AND id = ANY($2)`, [TID, fm]) : await pool.query(mq, [TID])
const modulos = modr.rows

const streakEndingAt = (diasSet, ultimo) => { const dias = [...diasSet].sort(); let run = 0, prev = ''; for (const d of dias) { if (d > ultimo) break; run = prev && Date.parse(d+'T00:00:00Z') - Date.parse(prev+'T00:00:00Z') === 86_400_000 ? run+1 : 1; prev = d } return run }

// Global por aluno: último dia com aula completa (máx entre módulos) + streak + módulo desse último dia.
const global = new Map() // estudanteId -> {ultimo, streak, moduloId, moduloNome}
for (const mod of modulos) {
  const { rows: docs } = await pool.query(`SELECT id FROM simulado_documentos WHERE tenant_id=$1 AND deletado=false AND publicado=true AND pasta_id=$2`, [TID, mod.id])
  const aulaIds = docs.map((d) => d.id); if (!aulaIds.length) continue
  const { rows: quiz } = await pool.query(`SELECT documento_id, questao_id FROM simulado_documento_quiz_questoes WHERE tenant_id=$1 AND deletado=false AND documento_id = ANY($2)`, [TID, aulaIds])
  const quizPorDoc = new Map(); for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)).add(q.questao_id)
  const { rows: resp } = await pool.query(`SELECT estudante_id, documento_id, questao_id, respondido_em FROM simulado_leitura_respostas WHERE tenant_id=$1 AND documento_id = ANY($2)`, [TID, aulaIds])
  const porAluno = new Map()
  for (const r of resp) { const q = quizPorDoc.get(r.documento_id); if (!q || !q.has(r.questao_id)) continue; const dmap = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id); const c = dmap.get(r.documento_id) ?? dmap.set(r.documento_id, { ans: new Set(), ult: null }).get(r.documento_id); c.ans.add(r.questao_id); if (r.respondido_em && (!c.ult || r.respondido_em > c.ult)) c.ult = r.respondido_em }
  for (const [alunoId, dmap] of porAluno) {
    const dias = new Set()
    for (const [docId, c] of dmap) { const qs = quizPorDoc.get(docId); if (qs.size > 0 && [...qs].every((qid) => c.ans.has(qid)) && c.ult) dias.add(diaDe(c.ult)) }
    if (!dias.size) continue
    const ultimo = [...dias].sort().pop()
    const prev = global.get(alunoId)
    if (!prev || ultimo > prev.ultimo) global.set(alunoId, { ultimo, streak: streakEndingAt(dias, ultimo), moduloId: mod.id, moduloNome: mod.nome })
  }
}

// Panorama de inatividade (por dias parados). ativo hoje/ontem = NÃO inativo.
const panorama = {}
for (const [, g] of global) { const d = diasEntre(g.ultimo, hoje); const k = d <= 0 ? 'hoje' : d === 1 ? '1 (ativo ontem)' : `${d} dias parado`; panorama[k] = (panorama[k]||0)+1 }
console.log('Panorama (dias desde a última aula completa):')
for (const k of Object.keys(panorama).sort((a,b)=> (parseInt(a)||0)-(parseInt(b)||0))) console.log(`  ${k}: ${panorama[k]}`)

// Alvo = EXATAMENTE a regra do webhook (igual o cron real): inativo.dias do engajamento_regras.
// alvoDia = hoje - dias; dispara p/ quem tem última aula completa == alvoDia. --dias=N sobrescreve.
const cfgDias = Math.max(1, wh.engajamento_regras?.inativo?.dias ?? 1)
const dias = DIAS_ARG ? Math.max(1, parseInt(DIAS_ARG, 10)) : cfgDias
const alvoDia = menos(hoje, dias)
const alvos = [...global.entries()].map(([id, g]) => ({ estudanteId: id, ...g, parado: diasEntre(g.ultimo, hoje) }))
  .filter((a) => a.ultimo === alvoDia)

console.log(`\nWebhook: ${wh.nome} (origem: ${wh.origem}) — evento: leitura.inativo (regra do sistema: dias=${cfgDias})`)
console.log(`ALVO = última aula completa em ${alvoDia} (dias=${dias} sem fazer aula, igual o webhook faria)`)
console.log(`TOTAL alvo: ${alvos.length}`)

if (alvos.length) {
  const ids = alvos.map((a) => a.estudanteId)
  const { rows: ests } = await pool.query(`SELECT id, nome, email, telefone, cpf FROM simulado_estudantes WHERE id = ANY($1)`, [ids])
  const estDe = new Map(ests.map((e) => [e.id, e]))
  console.log('\nAmostra (até 10):')
  for (const a of alvos.slice(0, 10)) { const e = estDe.get(a.estudanteId) || {}; console.log(`  - ${e.nome ?? '?'} <${e.email ?? 'sem email'}> tel=${e.telefone ?? '-'} · parado ${a.parado}d · seq=${a.streak} · ${a.moduloNome}`) }

  if (ENVIAR) {
    console.log(`\n>>> ENVIANDO leitura.inativo para ${alvos.length} aluno(s)...`)
    const reg = wh.engajamento_regras || {}; const msgTpl = reg.inativo?.mensagem ?? ''
    let ok = 0, fail = 0
    for (const a of alvos) {
      const e = estDe.get(a.estudanteId) || {}
      const primeiro = (e.nome ?? '').split(' ')[0] || 'estudante'
      // "dias sem fazer aula" = dias de falta até ONTEM (última aula anteontem → 1 dia faltando).
      const faltando = Math.max(1, diasEntre(a.ultimo, ONTEM))
      const mensagem = interp(msgTpl, { nome: primeiro, dias: faltando, streak: a.streak, maior: a.streak, modulo: a.moduloNome })
      const agora = new Date().toISOString()
      const body = {
        id: null, type: 'estudante', webhook_type: 'progressao_estudante', plataforma,
        webhook: { id: wh.id, nome: wh.nome, origem: wh.origem },
        event: 'leitura.inativo', status: 'inativo', dates: { created_at: agora, occurred_at: agora }, tenant_id: TID,
        contact: { id: a.estudanteId, name: e.nome ?? null, email: e.email ?? null, doc: e.cpf ?? null, phone_number: e.telefone ?? null, phone_local_code: null, plano: null },
        simulado: { id: null, name: null }, modulo: { id: a.moduloId, nome: a.moduloNome },
        resultado: { sessao_id: null, nota: null, acertos: null, total: null, tentativa: null, motivo: null },
        engajamento: { tipo: 'inativo', dias: faltando, marco: null, streak_atual: 0, streak_maior: a.streak, mensagem },
      }
      const s = JSON.stringify(body)
      const headers = { 'Content-Type':'application/json', 'X-Webhook-Evento':'leitura.inativo' }
      if (wh.secret) headers['X-Webhook-Signature'] = 'sha256=' + crypto.createHmac('sha256', wh.secret).update(s).digest('hex')
      try { const r = await fetch(wh.url, { method:'POST', headers, body: s, signal: AbortSignal.timeout(8000) }); r.ok ? ok++ : fail++ } catch { fail++ }
    }
    console.log(`\n✅ enviados=${ok}  ❌ falhas=${fail}`)
  } else {
    console.log('\n(DRY-RUN — nada enviado. Rode com --enviar para disparar; ou --dias=N para outro corte.)')
  }
}
await pool.end()
