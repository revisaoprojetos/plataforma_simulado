// Semeia a PALETA dos modelos padrão do MEQ (origem=paleta_padroes) a partir do modelo de teste já
// colorido ("MEQ (blocos + contagem) teste (cópia)"). Idempotente: se já houver paleta, não duplica.
// DRY-RUN por padrão; use --apply para gravar.
import { readFileSync } from 'node:fs'
import pg from 'pg'
const APPLY = process.argv.includes('--apply')
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const q = (t, p) => pool.query(t, p).then((r) => r.rows)

const TENANT = '737ed838-ba07-49e3-a34f-f7d25c3cf53c'           // MEQ Concursos
const FONTE = '87020c13-99b0-4ebc-84f6-ae49f705d8c1'           // "MEQ (blocos + contagem) teste (cópia)"
const TAB = 'simulado_caderno_modelos'

try {
  const existe = await q(`SELECT id FROM ${TAB} WHERE tenant_id=$1 AND origem='paleta_padroes' AND deletado=false LIMIT 1`, [TENANT])
  if (existe.length) { console.log('✓ Paleta já existe para o MEQ:', existe[0].id, '— nada a fazer.'); process.exit(0) }

  const fonte = (await q(`SELECT config FROM ${TAB} WHERE id=$1 AND tenant_id=$2`, [FONTE, TENANT]))[0]
  if (!fonte?.config) { console.error('✗ Modelo-fonte não encontrado:', FONTE); process.exit(1) }
  const aj = fonte.config?.item?.ajustes ?? {}
  console.log('Cores que serão a paleta MEQ:')
  console.log(JSON.stringify({ corPrimaria: aj.corPrimaria, corSecundaria: aj.corSecundaria, coresParte: aj.coresParte, coresTextoParte: aj.coresTextoParte, coresFundoParte: aj.coresFundoParte, coresPilar: aj.coresPilar }, null, 2))

  // novo config = cópia do config-fonte, mas marcado como origem paleta_padroes
  const config = { ...fonte.config, origem: 'paleta_padroes' }
  if (!APPLY) { console.log('\n[DRY-RUN] Rode com --apply para inserir a linha de paleta.'); process.exit(0) }
  const ins = await q(
    `INSERT INTO ${TAB} (tenant_id, nome, config, modalidade, origem, criado_em, atualizado_em)
     VALUES ($1, 'Cores dos modelos padrão', $2::jsonb, 'diagnostico', 'paleta_padroes', now(), now()) RETURNING id`,
    [TENANT, JSON.stringify(config)])
  console.log('✓ Paleta MEQ criada:', ins[0].id)
} finally { await pool.end() }
