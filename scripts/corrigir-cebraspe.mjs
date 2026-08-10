// Corrige o conjunto CEBRASPE 2023 (AGU/PGF/PGFN) por CONTEÚDO (banco_base_id = autoritativo) —
// marca NÃO discrimina aqui (os 3 cadernos usam o mesmo fundo pgf-2023-cebraspe).
// Bugs: (1) caderno do AGU aponta config.bancoId pro banco do PGFN (questões disjuntas);
//       (2) PGF e PGFN usam o gabarito do AGU (agu-2023-cebraspe.pdf).
// Backup + DRY-RUN por padrão (--apply para aplicar). NÃO toca respostas/sessões/prova_questoes.
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = (p, init) => fetch(`${URL}/rest/v1/${p}`, { headers: H, ...init })
const j = async (p) => (await rest(p)).json()
const APPLY = process.argv.includes('--apply')
const TEN = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const GAB = (arq) => `${URL}/storage/v1/object/public/pdfs/materiais/${TEN}/gabarito/${arq}`

// IDs confirmados na verificação
const CAD_AGU = 'b9aa9ece', BANCO_AGU = '5f4747ac-9b2f-4430-b4a6-d2f90ebb70ad'
const CAD_PGF = 'ab4330d3', CAD_PGFN = '308eacb4'

const todos = await j(`simulado_cadernos_designer?tenant_id=eq.${TEN}&nome=ilike.*CEBRASPE*&select=id,nome,config`)
const cad = (prefix) => todos.find((c) => c.id.startsWith(prefix))
const cAgu = cad(CAD_AGU)
if (!cAgu) { console.log('✗ caderno AGU não resolvido'); process.exit(1) }

const backup = {
  AGU: { id: cAgu.id, bancoId: cAgu.config?.bancoId, material: cAgu.config?.material },
}

// Escopo reduzido: PGF/PGFN já tiveram os gabaritos trocados manualmente pelo usuário.
// Aqui só corrigimos o caderno de questões do AGU (config.bancoId → banco AGU/constitucional).
const planos = [
  { c: cAgu, label: 'AGU', config: { ...cAgu.config, bancoId: BANCO_AGU } },
]

console.log('=== PLANO CEBRASPE (só AGU — questões do caderno) ===')
console.log(`AGU  caderno ${cAgu.id.slice(0,8)}: config.bancoId ${(cAgu.config?.bancoId||'—').slice(0,8)} → ${BANCO_AGU.slice(0,8)} (banco AGU/constitucional)`)

if (!APPLY) { console.log('\n[DRY-RUN] rode com --apply para aplicar.'); process.exit(0) }
writeFileSync('scripts/_backup-cebraspe.json', JSON.stringify(backup, null, 2))
console.log('\n✔ Backup em scripts/_backup-cebraspe.json\n')
for (const p of planos) {
  const r = await rest(`simulado_cadernos_designer?id=eq.${p.c.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ config: p.config }) })
  console.log(`  ${p.label} → ${r.status}`)
}
console.log('\n✔ Concluído.')
