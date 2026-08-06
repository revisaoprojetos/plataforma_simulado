// Converte os marcadores de SUBLINHADO que estão salvos como **negrito** para <u>…</u>
// nas 4 questões de Língua Portuguesa do PGE/RS que dependem de sublinhado (nº 5, 6, 8, 9).
// DRY-RUN por padrão; escreve só com  --apply . Faz BACKUP dos textos originais.
// Uso: node scripts/patch-sublinhado-pge.mjs [--apply]
import { readFileSync, writeFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = (p, opt) => fetch(`${URL}/rest/v1/${p}`, { headers: H, ...opt })
const restJ = (p) => rest(p).then((r) => r.json())

// Só ** que representa sublinhado → <u>. (Aplicado apenas às questões abaixo, que só têm marcadores de sublinhado.)
const conv = (s) => (s || '').replace(/\*\*([\s\S]+?)\*\*/g, '<u>$1</u>')

// Questões-alvo (Português, dependem de sublinhado). enun=converter enunciado; alts=converter alternativas.
const ALVOS = [
  { nº: 5, id: '31023af2-e167-4285-bf64-d7c1d6557608', enun: true, alts: false },
  { nº: 6, id: 'a5e28f47-fa7f-4b09-b4b4-03813895b428', enun: true, alts: false },
  { nº: 8, id: '3f1d1298-a723-455c-bac3-39660b2c5a26', enun: false, alts: true },
  { nº: 9, id: 'caac6470-a89b-40e7-9028-80313c6a97c2', enun: true, alts: false },
]

;(async () => {
  const backup = { quando: 'pre-patch', questoes: [], alternativas: [] }
  for (const a of ALVOS) {
    const [q] = await restJ(`simulado_questoes?id=eq.${a.id}&select=id,numero,enunciado`)
    console.log(`\n===== nº ${a.nº} (id ${a.id}) =====`)
    if (a.enun) {
      const novo = conv(q.enunciado)
      backup.questoes.push({ id: q.id, enunciado: q.enunciado })
      console.log('ENUN antes:', (q.enunciado || '').replace(/\n/g, ' ').slice(0, 220))
      console.log('ENUN depois:', novo.replace(/\n/g, ' ').slice(0, 220))
      if (APPLY && novo !== q.enunciado) {
        const r = await rest(`simulado_questoes?id=eq.${q.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ enunciado: novo }) })
        console.log('  PATCH enunciado:', r.status)
      }
    }
    if (a.alts) {
      const alts = await restJ(`simulado_alternativas?questao_id=eq.${a.id}&select=id,texto,ordem&order=ordem`)
      for (const alt of alts) {
        const novo = conv(alt.texto)
        if (novo === alt.texto) continue
        backup.alternativas.push({ id: alt.id, texto: alt.texto })
        console.log(`  ALT ${alt.ordem}: "${(alt.texto||'').replace(/\n/g,' ').slice(0,80)}" -> "${novo.replace(/\n/g,' ').slice(0,80)}"`)
        if (APPLY) {
          const r = await rest(`simulado_alternativas?id=eq.${alt.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ texto: novo }) })
          console.log('    PATCH alt:', r.status)
        }
      }
    }
  }
  if (APPLY) {
    writeFileSync('scripts/_backup-sublinhado.json', JSON.stringify(backup, null, 2))
    console.log('\n✔ Aplicado. Backup salvo em scripts/_backup-sublinhado.json')
  } else {
    console.log('\n(DRY-RUN — nada foi gravado. Rode com --apply para aplicar.)')
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
