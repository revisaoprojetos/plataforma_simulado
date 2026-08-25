/**
 * Mede o TAMANHO do que cada tela do cronograma manda para o navegador.
 *
 * "A plataforma está lenta" costuma ser payload, não CPU: a grade de um cronograma longo é
 * serializada inteira no RSC. Este script monta a grade do mesmo jeito que o app monta e
 * pesa cada parte, para a otimização atacar o que pesa e não o que parece pesar.
 *
 *   pnpm --filter api exec tsx ../../scripts/medir-payload-cronograma.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAIZ = resolve(__dirname, '..')

function env(chave: string): string {
  for (const arq of [`${RAIZ}/apps/web/.env.local`, `${RAIZ}/.env`]) {
    try {
      const l = readFileSync(arq, 'utf8').split(/\r?\n/).find((x) => x.startsWith(`${chave}=`))
      const v = l?.slice(chave.length + 1).replace(/^"|"$/g, '').trim()
      if (v) return v
    } catch {
      /* segue */
    }
  }
  throw new Error(`${chave} não encontrado`)
}

const U = env('NEXT_PUBLIC_SUPABASE_URL')
const K = env('SUPABASE_SERVICE_ROLE_KEY')
const TENANT = env('NEXT_PUBLIC_DEFAULT_TENANT_SLUG')

async function rest<T>(caminho: string): Promise<T> {
  const r = await fetch(`${U}/rest/v1/${caminho}`, {
    headers: { apikey: K, Authorization: `Bearer ${K}` },
  })
  return (await r.json()) as T
}

async function tudo<T>(tabela: string, qs: string): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${U}/rest/v1/${tabela}?${qs}`, {
      headers: { apikey: K, Authorization: `Bearer ${K}`, 'Range-Unit': 'items', Range: `${de}-${de + 999}` },
    })
    const p = (await r.json()) as T[]
    out.push(...p)
    if (p.length < 1000) break
  }
  return out
}

const kb = (x: unknown) => `${(JSON.stringify(x).length / 1024).toFixed(0)} KB`

async function main() {
  const tenants = await rest<{ id: string; slug: string }[]>(`simulado_tenants?select=id,slug&slug=eq.${TENANT}`)
  const tid = tenants[0].id

  const crons = await rest<{ id: string; nome: string; total_semanas: number }[]>(
    `simulado_cronogramas?select=id,nome,total_semanas&tenant_id=eq.${tid}&deletado=eq.false&order=nome`,
  )

  // O maior cronograma é o pior caso, e é o que define a experiência de quem o escolheu.
  const contagens = await rest<{ cronograma_id: string; total: number }[]>(
    `rpc/simulado_cronograma_contar_metas?p_tenant=${tid}`,
  ).catch(() => [] as { cronograma_id: string; total: number }[])

  let maior = crons[0]
  let maiorN = 0
  for (const c of contagens) {
    if (Number(c.total) > maiorN) {
      maiorN = Number(c.total)
      maior = crons.find((x) => x.id === c.cronograma_id) ?? maior
    }
  }
  console.log(`pior caso: "${maior.nome}" — ${maiorN.toLocaleString('pt-BR')} metas, ${maior.total_semanas} semanas\n`)

  // ── O que a tela do ADMIN manda hoje: todas as metas do cronograma
  const metas = await tudo<Record<string, unknown>>(
    'simulado_cronograma_metas',
    `select=id,semana,dia,tipo,disciplina,disciplina_id,aula,conteudo,duracao,ordem,simulado_id,simulado_externo_nome,simulado_externo_url&tenant_id=eq.${tid}&cronograma_id=eq.${maior.id}&order=id`,
  )
  console.log('═'.repeat(70))
  console.log('ADMIN — /admin/cronogramas/[id]')
  console.log('═'.repeat(70))
  console.log(`  metas enviadas ao navegador ...... ${metas.length.toLocaleString('pt-BR')}`)
  console.log(`  peso do array de metas ........... ${kb(metas)}`)
  console.log(`  a tela mostra por vez ............ 1 semana (~${Math.round(metas.length / maior.total_semanas)} metas)`)

  // Quanto pesa o campo mais gordo
  const porCampo = new Map<string, number>()
  for (const m of metas) {
    for (const [k, v] of Object.entries(m)) {
      porCampo.set(k, (porCampo.get(k) ?? 0) + JSON.stringify(v ?? null).length)
    }
  }
  console.log('  peso por campo:')
  for (const [k, v] of [...porCampo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`      ${k.padEnd(22)} ${(v / 1024).toFixed(0)} KB`)
  }

  // ── O que a tela do ALUNO manda: a GRADE, com tipoDef e links em cada meta
  const tipos = await rest<Record<string, unknown>[]>(`simulado_cronograma_tipos_meta?select=*&tenant_id=eq.${tid}`)
  const umTipo = tipos[0] ?? {}
  const pesoTipoDef = JSON.stringify(umTipo).length

  console.log()
  console.log('═'.repeat(70))
  console.log('ALUNO — a grade montada (o que vai no RSC)')
  console.log('═'.repeat(70))
  console.log(`  cada meta carrega um tipoDef inteiro: ${pesoTipoDef} bytes`)
  console.log(`  x ${metas.length.toLocaleString('pt-BR')} metas = ${((pesoTipoDef * metas.length) / 1024).toFixed(0)} KB só de tipoDef repetido`)
  console.log(`  tipos DISTINTOS no tenant: ${tipos.length} (${((pesoTipoDef * tipos.length) / 1024).toFixed(1)} KB se enviados uma vez)`)
  const economia = (pesoTipoDef * (metas.length - tipos.length)) / 1024
  console.log(`  desperdício ...................... ${economia.toFixed(0)} KB`)

  // Links por meta
  const links = await tudo<{ id: string }>('simulado_cronograma_links', `select=id&tenant_id=eq.${tid}&order=id`)
  const urls = await tudo<Record<string, unknown>>('simulado_cronograma_aula_links', `select=link_id,plataforma_id,url&tenant_id=eq.${tid}&order=id`)
  const plats = await rest<Record<string, unknown>[]>(`simulado_cronograma_plataformas?select=*&tenant_id=eq.${tid}`)
  console.log()
  console.log(`  links de aula: ${links.length} · urls: ${urls.length} · plataformas: ${plats.length}`)
  console.log(`  cada meta 'quest' embute o objeto da plataforma inteiro: ${JSON.stringify(plats[0] ?? {}).length} bytes`)

  console.log()
  console.log('═'.repeat(70))
  console.log('OUTRAS TELAS')
  console.log('═'.repeat(70))
  const todasMetas = await rest<{ count: string }[]>(`simulado_cronograma_metas?select=count&tenant_id=eq.${tid}`)
  console.log(`  metas do tenant inteiro .......... ${Number(todasMetas[0]?.count ?? 0).toLocaleString('pt-BR')}`)
  console.log(`  links (tela /links) .............. ${links.length} linhas + ${urls.length} urls`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
