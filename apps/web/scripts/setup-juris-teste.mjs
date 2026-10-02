/**
 * Setup do "Juris Teste" — aplica a migração (aditiva/idempotente) e cria/atualiza a pasta do desafio
 * de Jurisprudência JÁ configurada com o conteúdo do pacote (CONFIG + MATERIAS + FINAL + DIAS).
 *
 * Uso (em apps/web, após garantir .env.local com DATABASE_URL + SUPABASE_URL + SERVICE_ROLE):
 *   node scripts/setup-juris-teste.mjs
 * Idempotente: pode rodar de novo (atualiza o conteúdo sem duplicar a pasta).
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const PKG = 'C:/Users/joooa/Downloads/desafio-jurisprudencia-pacote(1)/versao-separada/js/dados.js'
const TENANT_SLUG = 'simulado' // Revisão
const NOME = 'Juris Teste'

// 1) Extrai window.DESAFIO do dados.js do pacote (IIFE que seta window.DESAFIO).
const window = {}
// eslint-disable-next-line no-eval
eval(fs.readFileSync(PKG, 'utf8'))
const D = window.DESAFIO
if (!D?.DIAS) { console.error('Não consegui extrair o DESAFIO do pacote.'); process.exit(1) }
const conteudo = { config: D.CONFIG, materias: D.MATERIAS, final: D.FINAL, dias: D.DIAS, imagens: {} }
console.log(`Conteúdo do pacote: ${Object.keys(D.DIAS).length} dias, ${D.MATERIAS.length} matérias.`)

// 2) (A migração 20260929000005 é aplicada MANUALMENTE no SQL Editor — convenção do projeto.)
//    Este script faz só o SEED (dados). Se a coluna desafio_jogo não existir, avisa e sai.

// 3) Cria/atualiza a pasta "Juris Teste" (folder_area='jurisprudencia') com o conteúdo.
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: ten } = await sb.from('simulado_tenants').select('id,nome').eq('slug', TENANT_SLUG).maybeSingle()
if (!ten) { console.error(`Tenant ${TENANT_SLUG} não encontrado.`); process.exit(1) }

const { data: existente } = await sb.from('simulado_pastas').select('id').eq('tenant_id', ten.id).eq('folder_area', 'jurisprudencia').eq('is_folder', true).eq('nome', NOME).maybeSingle()
let desafioId = existente?.id
if (desafioId) {
  await sb.from('simulado_pastas').update({ desafio_jogo: conteudo }).eq('id', desafioId)
  console.log(`Atualizado desafio existente "${NOME}" (${desafioId}).`)
} else {
  const { data: novo, error } = await sb.from('simulado_pastas').insert({ tenant_id: ten.id, nome: NOME, is_folder: true, folder_area: 'jurisprudencia', pai_id: null, desafio_jogo: conteudo }).select('id').single()
  if (error) { console.error('Erro ao criar a pasta:', error.message); process.exit(1) }
  desafioId = novo.id
  console.log(`✅ Criado desafio "${NOME}" (${desafioId}) no tenant ${ten.nome}.`)
}
console.log(`\nDESAFIO_ID = ${desafioId}`)
process.exit(0)
