// Corrige o diagnóstico do "Concurso Simulado AGU": remove o bloco "GABARITO OFICIAL DESATUALIZADO"
// (Q39/42/63 não correspondem a este simulado) e neutraliza a introdução (não é a prova literal de 2023).
// Backup em scripts/_backup-diag-agu-conteudo.json. --apply para gravar.
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
const APPLY = process.argv.includes('--apply')
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const CAD = '8eaf18c1-e844-4b45-be4a-78c8abd24c3e', ITEM = 'ecos9z1u'
const q = (t, p) => pool.query(t, p).then((r) => r.rows)

const INTRO_NEUTRA = [
  'Este é o seu simulado no estilo CEBRASPE, no padrão da AGU. Ele não foi pensado para medir se você "está pronto(a)" — isso pouco importa aqui —, mas sim para colocar você diante da forma como a banca costuma cobrar e mostrar, com precisão, onde direcionar as próximas semanas de estudo.',
  'O número de acertos é a parte menos importante deste relatório. O que importa de verdade está no que vem a seguir: o desempenho por pilar (lei seca, jurisprudência e doutrina) e por disciplina, que revela exatamente que tipo de erro você está cometendo. Errar por não ter visto o assunto é diferente de errar por não dominar o texto de lei, que é diferente de errar por não acompanhar jurisprudência. Cada uma dessas lacunas se resolve de um jeito, com material e prioridade diferentes.',
  'Treinar no estilo real da CEBRASPE na AGU é justamente o que torna este simulado valioso: você se testa contra o padrão da banca, entende como ela costuma explorar cada tema e usa isso para calibrar seu preparo. Ao final da leitura, você vai saber exatamente qual pilar merece reforço imediato, quais disciplinas concentram os pontos perdidos e quais assuntos precisa revisar.',
  'Guarde este diagnóstico. Ele é o ponto de partida e o comparativo que você vai usar para medir sua evolução até o próximo simulado.',
]

try {
  const cadRow = (await q(`SELECT config FROM simulado_cadernos_teste WHERE id=$1 AND tenant_id=$2`, [CAD, TID]))[0]
  const config = cadRow.config
  const itens = config?.builderV3?.itens ?? []
  const idx = itens.findIndex((it) => it.id === ITEM)
  if (idx < 0) throw new Error('item diagnóstico não encontrado')
  const c = itens[idx].conteudo

  writeFileSync('scripts/_backup-diag-agu-conteudo.json', JSON.stringify({ quando: new Date().toISOString(), cadernoId: CAD, itemId: ITEM, conteudo: c }, null, 2))
  console.log('✓ backup do conteúdo em scripts/_backup-diag-agu-conteudo.json')
  console.log('ANTES → intro[0]:', (c.intro?.[0] ?? '').slice(0, 70), '…')
  console.log('ANTES → gabaritoTitulo:', JSON.stringify(c.gabaritoTitulo), '| gabaritoObs:', (c.gabaritoObs ?? []).length, 'itens | partesOcultas:', JSON.stringify(c.partesOcultas ?? []))

  // 1) neutralizar introdução
  c.intro = INTRO_NEUTRA
  // 2) remover bloco de gabarito desatualizado (oculta a seção + limpa os campos)
  const po = new Set(c.partesOcultas ?? [])
  po.add('gabarito'); po.add('sec_gabarito')
  c.partesOcultas = [...po]
  c.gabaritoTitulo = ''
  c.gabaritoIntro = []
  c.gabaritoObs = []

  console.log('\nDEPOIS → intro[0]:', c.intro[0].slice(0, 70), '…')
  console.log('DEPOIS → gabarito: oculto (partesOcultas:', JSON.stringify(c.partesOcultas), ', campos limpos)')

  if (!APPLY) { console.log('\nDRY-RUN. --apply para gravar.'); await pool.end(); process.exit(0) }
  itens[idx] = { ...itens[idx], conteudo: c }
  await q(`UPDATE simulado_cadernos_teste SET config=$1, atualizado_em=now() WHERE id=$2 AND tenant_id=$3`, [config, CAD, TID])
  console.log('\n✓ GRAVADO.')
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
