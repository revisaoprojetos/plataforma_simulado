// Limpa a gamificação do "Webhook Entrega de Eventos Simulado": remove os eventos gamificacao.*
// e deixa só os eventos de SIMULADO (entrega). Backup antes. Os gatilhos de engajamento agora são
// webhooks próprios (config por webhook em engajamento_regras).
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const ENTREGA = ['estudante.iniciou', 'estudante.finalizou', 'estudante.visualizou_relatorio', 'estudante.baixou_relatorio', 'estudante.nao_finalizou']

// 1) BACKUP de todos os webhooks do tenant.
const { rows: antes } = await pool.query(`SELECT id, nome, eventos, ativo FROM simulado_webhook_saida WHERE tenant_id=$1 ORDER BY criado_em`, [TID])
writeFileSync('scripts/_backup-webhooks-gamif.json', JSON.stringify({ tenant: TID, geradoEm: new Date().toISOString(), webhooks: antes }, null, 2))
console.log(`Backup salvo: scripts/_backup-webhooks-gamif.json (${antes.length} webhooks)`)

// 2) Para o webhook "Entrega de Eventos Simulado": remove gamificacao.*; se não sobrar nada, coloca os de entrega.
for (const w of antes) {
  const temGamif = Array.isArray(w.eventos) && w.eventos.some((e) => String(e).startsWith('gamificacao.'))
  const ehEntrega = /entrega\s+de\s+eventos\s+simulado/i.test(w.nome || '')
  if (!ehEntrega || !temGamif) continue
  const semGamif = (w.eventos || []).filter((e) => !String(e).startsWith('gamificacao.'))
  const novos = semGamif.length ? semGamif : ENTREGA
  await pool.query(`UPDATE simulado_webhook_saida SET eventos=$1 WHERE id=$2 AND tenant_id=$3`, [JSON.stringify(novos), w.id, TID])
  console.log(`✅ "${w.nome}": ${JSON.stringify(w.eventos)} -> ${JSON.stringify(novos)}`)
}
await pool.end()
