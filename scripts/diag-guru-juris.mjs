// DIAGNÓSTICO (SOMENTE LEITURA): alunos com Guru ATIVO que "vão fazer" o Desafio de Jurisprudência
// estão de fato com ACESSO ao desafio? (ou seja: a sincronização Guru → grupo → pasta juris funcionou)
//
// Regra de acesso à pasta (folder_area='jurisprudencia'): SEM atribuição = todos; COM atribuição =
// estudantes diretos (simulado_pasta_estudantes) + membros de grupos atribuídos (simulado_pasta_grupos
// → simulado_grupo_membros). "Vão fazer via Guru" = assinatura Guru ATIVA cujo produto, pelo mapeamento
// (simulado_integracao_mapeamentos), aponta p/ um grupo atribuído à pasta (ou p/ a própria pasta).
//
// NÃO escreve nada. Para CORRIGIR dessincronizados: POST /api/cron/guru-reconcile (reaplica, só concede).
//
// Uso:  node scripts/diag-guru-juris.mjs
import { readFileSync } from 'node:fs'

const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !KEY) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local'); process.exit(1) }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }

const rest = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); const j = await r.json(); return Array.isArray(j) ? j : [] }
async function fetchAll(base) { let out = [], from = 0; for (;;) { const r = await fetch(`${URL}/rest/v1/${base}`, { headers: { ...H, Range: `${from}-${from + 999}` } }); const j = await r.json(); if (!Array.isArray(j)) break; out.push(...j); if (j.length < 1000) break; from += 1000 } return out }
// .in() em lotes p/ não estourar a URL
async function inChunks(base, col, ids, extra = '') { const out = []; for (let i = 0; i < ids.length; i += 80) { const c = ids.slice(i, i + 80); out.push(...await rest(`${base}?${col}=in.(${c.join(',')})${extra}`)) } return out }

// 1) Pastas de desafio de jurisprudência
const pastas = await rest(`simulado_pastas?folder_area=eq.jurisprudencia&is_folder=eq.true&deletado=eq.false&select=id,tenant_id,nome`)
if (!pastas.length) { console.log('Nenhum desafio de jurisprudência encontrado.'); process.exit(0) }

// 2) Assinaturas Guru ATIVAS + mapeamentos (produto → grupo/pasta)
const assin = await fetchAll(`simulado_assinaturas?provider=eq.guru&status=eq.ativo&select=estudante_id,tenant_id,produto_ref`)
const maps = await rest(`simulado_integracao_mapeamentos?provider=eq.guru&select=fonte_ref,fonte_nome,grupo_id,pasta_id,classificacao&limit=5000`)
const mapByRef = new Map(maps.map((m) => [String(m.fonte_ref), m]))

console.log(`Desafios de jurisprudência: ${pastas.length} · Assinaturas Guru ativas: ${assin.length} · Mapeamentos Guru: ${maps.length}\n`)

for (const p of pastas) {
  const assinTenant = assin.filter((a) => a.tenant_id === p.tenant_id)
  // Atribuição da pasta
  const [est, grp] = await Promise.all([
    rest(`simulado_pasta_estudantes?pasta_id=eq.${p.id}&select=estudante_id`),
    rest(`simulado_pasta_grupos?pasta_id=eq.${p.id}&select=grupo_id`),
  ])
  const attrEst = new Set(est.map((x) => x.estudante_id))
  const attrGrp = new Set(grp.map((x) => x.grupo_id))
  console.log(`── Desafio "${p.nome}" (${p.id}) · tenant ${p.tenant_id}`)

  if (attrEst.size === 0 && attrGrp.size === 0) {
    console.log(`   ABERTO A TODOS (sem atribuição) → todos os alunos do tenant têm acesso, inclusive Guru.`)
    console.log(`   Guru ativos no tenant: ${new Set(assinTenant.map((a) => a.estudante_id)).size}\n`)
    continue
  }

  // Quem TEM acesso = estudantes diretos ∪ membros dos grupos atribuídos
  const grpIds = [...attrGrp]
  const membros = grpIds.length ? await inChunks('simulado_grupo_membros', 'grupo_id', grpIds, '&select=estudante_id') : []
  const acesso = new Set([...attrEst, ...membros.map((m) => m.estudante_id)])

  // Guru ativos que DEVERIAM ter acesso: produto mapeia p/ um grupo atribuído OU p/ esta pasta
  const guruAlvo = new Map() // estudante_id → produto(s)
  for (const a of assinTenant) {
    const m = mapByRef.get(String(a.produto_ref))
    if (!m) continue
    const apontaGrupo = m.grupo_id && attrGrp.has(m.grupo_id)
    const apontaPasta = m.pasta_id && m.pasta_id === p.id
    if (apontaGrupo || apontaPasta) {
      if (!guruAlvo.has(a.estudante_id)) guruAlvo.set(a.estudante_id, new Set())
      guruAlvo.get(a.estudante_id).add(m.fonte_nome || a.produto_ref)
    }
  }

  const alvoIds = [...guruAlvo.keys()]
  const comAcesso = alvoIds.filter((id) => acesso.has(id))
  const semAcesso = alvoIds.filter((id) => !acesso.has(id))

  console.log(`   Atribuição: ${attrEst.size} estudante(s) direto(s) + ${attrGrp.size} grupo(s). Com acesso (total): ${acesso.size}`)
  console.log(`   Guru ATIVO mapeado p/ este desafio: ${alvoIds.length}  →  ✓ sincronizados: ${comAcesso.length}  ·  ✗ SEM acesso: ${semAcesso.length}`)

  if (semAcesso.length) {
    // Detalhe dos dessincronizados (email p/ identificar)
    const ests = await inChunks('simulado_estudantes', 'id', semAcesso, '&select=id,nome,email')
    const byId = new Map(ests.map((e) => [e.id, e]))
    console.log(`   ── DESSINCRONIZADOS (Guru ativo, sem acesso ao desafio) ──`)
    for (const id of semAcesso) {
      const e = byId.get(id)
      const prods = [...(guruAlvo.get(id) || [])].join(', ')
      console.log(`     • ${e?.nome ?? '?'} <${e?.email ?? '?'}>  (${id})  produto: ${prods}`)
    }
  }
  console.log('')
}

console.log('FIM. Para corrigir os dessincronizados: POST /api/cron/guru-reconcile (reaplica assinaturas ativas — só concede, idempotente).')
