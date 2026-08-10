// Migração V1→V2 (versão FINAL): recria os cadernos-teste com o DIAGNÓSTICO convertido para a
// estrutura NATIVA do V2 (DiagConteudo → edição completa por parte), e as demais modalidades
// (perguntas/completo/folha/discursivo) como doc-backed (docEdit, render idêntico ao v1).
//   DRY-RUN:  node scripts/migrar-cadernos-v2-nativo.mjs
//   APLICAR:  node scripts/migrar-cadernos-v2-nativo.mjs --aplicar
// Apaga os cadernos-teste da migração anterior (backup) e recria.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

async function fetchAll(table, select) {
  const out = []; let from = 0; const step = 1000
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, { headers: { ...H, Range: `${from}-${from + step - 1}` } })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const rows = await r.json(); out.push(...rows); if (rows.length < step) break; from += step
  }
  return out
}
const del = (t, id) => fetch(`${URL}/rest/v1/${t}?id=eq.${id}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
const insert = (t, b) => fetch(`${URL}/rest/v1/${t}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(b) })

const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const totalPilar = (ch) => `{acerto_pilar_${ch}} de {total_pilar_${ch}} questões`
const parseTopicos = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  if (l.startsWith('>>')) return { forte: true, texto: l.replace(/^>>\s*/, '') }
  if (l.startsWith('>')) return { forte: false, texto: l.replace(/^>\s*/, '') }
  return { forte: false, texto: l }
})
const urlDaPagina = (doc, kind) => {
  const pg = (doc?.pages || []).find((p) => p.kind === kind)
  const pf = (pg?.blocks || []).find((b) => (b.type || b.kind) === 'plano-fundo')
  return pf?.attributes?.url || ''
}

/** V1 diagnóstico (blocos) → DiagConteudo nativo do V2. */
function converterDiag(doc, nome) {
  const pg = (doc?.pages || []).find((p) => p.kind === 'conteudo')
  const blocks = pg?.blocks || []
  const nota = blocks.find((b) => b.type === 'diag-nota')?.attributes || {}
  const intro = []; let discIntro = ''; const fechamento = []
  let vistoPil = false, vistoDisc = false, vistoSug = false
  for (const b of blocks) {
    if (b.type === 'diag-pilares') vistoPil = true
    if (b.type === 'diag-disciplina') vistoDisc = true
    if (b.type === 'diag-sugestoes') vistoSug = true
    if (b.type === 'texto-livre') {
      const t = (b.attributes?.texto || '').trim(); if (!t) continue
      if (vistoSug) fechamento.push(t)
      else if (vistoPil && !vistoDisc) discIntro = t
      else if (!vistoPil) intro.push(t)
    }
  }
  const pilB = blocks.find((b) => b.type === 'diag-pilares')?.attributes
  const pilares = (pilB?.pilares || []).map((p) => {
    const ch = p.chave || slug(p.nome)
    const bandas = Array.isArray(p.bandas) && p.bandas.length ? p.bandas
      : [{ faixa: '0-49', texto: p.f1 || '' }, { faixa: '50-80', texto: p.f2 || '' }, { faixa: '81-100', texto: p.f3 || '' }]
    return { nome: p.nome || '', chave: ch, totalTxt: totalPilar(ch), bandas }
  })
  const disciplinas = blocks.filter((b) => b.type === 'diag-disciplina').map((b) => {
    const a = b.attributes || {}; const ch = a.chave || slug(a.nome)
    return { nome: a.nome || '', chave: ch, total: '', categoria: a.assunto || 'Assunto' }
  })
  const sugestoes = blocks.filter((b) => b.type === 'diag-sugestoes').map((b) => {
    const a = b.attributes || {}
    return { titulo: a.titulo || '', prioridade: a.prioridade || '', intro: a.intro || '', corTitulo: a.corTitulo, itens: parseTopicos(a.topicos) }
  })
  return {
    tituloCabecalho: 'Diagnóstico de Desempenho', subtitulo: nome || 'Adicionar Subtítulo',
    notaTotal: `{${nota.varNumero || 'acertos'}}/{${nota.varTotal || 'total_questoes'}}`,
    notaTexto: nota.texto || '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
    intro, pilares,
    disciplinasIntro: discIntro || 'A análise a seguir tem foco nos seus pontos de erros.',
    disciplinas, sugestoes, fechamento,
    partesOcultas: ['gabarito'], gabaritoTitulo: '', gabaritoIntro: [], gabaritoObs: [],
  }
}

const MAP = {
  caderno_perguntas: { modalidade: 'caderno_questoes', modelo: 'agu_perguntas' },
  caderno_completo: { modalidade: 'caderno_questoes', modelo: 'agu_completo' },
  gabarito_discursivo: { modalidade: 'caderno_questoes', modelo: 'agu_discursivo' },
  gabarito_objetivo: { modalidade: 'folha_respostas', modelo: 'agu_folha' },
  diagnostico: { modalidade: 'diagnostico', modelo: 'base_4' }, // NATIVO
}
const ORDEM = ['caderno_perguntas', 'caderno_completo', 'gabarito_objetivo', 'gabarito_discursivo', 'diagnostico']
const AJ = {
  titulo: 'Simulado', corPrimaria: '#2d254f', corSecundaria: '#f6b420',
  mostrarCabecalho: true, mostrarDadosAluno: true, mostrarComentarios: false, mostrarGabarito: false,
  numAlternativas: 5, colunas: 2, compacto: false, capaUrl: '', folhaUrl: '', cabecalhoUrl: '', rodapeUrl: '',
  coresPilar: { lei_seca: '#c9a227', jurisprudencia: '#3b5bdb', doutrina: '#e8850c', lingua_portuguesa: '#1a7a4a' },
  coresDisc: {}, coresParte: {}, alinhamentoParte: {}, coresTextoParte: {}, estiloParte: {}, fonteParte: {}, tamanhoParte: {},
}
const CAPA = { titulo: '', cor: '#ffffff', tamanho: 44, fonte: 'montserrat', negrito: true, italico: false, sublinhado: false, alinhamento: 'center', posV: 68, posH: 50 }
const nid = () => Math.random().toString(36).slice(2, 10)

console.log(`URL: ${URL}\nMODO: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}\n`)

let cadernos
try { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,cor,icone,capa_url,config') }
catch { cadernos = await fetchAll('simulado_cadernos_designer', 'id,tenant_id,nome,config') }
let pastas; try { pastas = await fetchAll('simulado_pastas', 'id,tenant_id,nome,is_folder') } catch { pastas = [] }
const pastaById = new Map(pastas.map((p) => [p.id, p]))
const cadTeste = await fetchAll('simulado_cadernos_teste', 'id,tenant_id,nome,config')

let idsAntigos = []
for (const f of ['scripts/_backup-migracao-cadernos-completo-criados.json', 'scripts/_backup-migracao-v1v2-criados.json']) {
  if (existsSync(f)) { try { idsAntigos.push(...(JSON.parse(readFileSync(f, 'utf8')).cadernos_teste_criados || [])) } catch {} }
}
const idsAntigosSet = new Set(idsAntigos.filter(Boolean))

const existentes = new Set()
for (const t of cadTeste) {
  if (idsAntigosSet.has(t.id)) continue
  const b = t.config?.builderV3?.bancoId || t.config?.bancoId
  if (b) existentes.add(`${t.tenant_id}|${b}|${(t.nome || '').trim().toLowerCase()}`)
}

const plano = []
for (const k of cadernos) {
  const cfg = k.config || {}; const bid = cfg.bancoId; const docs = cfg.docsV2 || {}
  const modKeys = ORDEM.filter((key) => MAP[key] && docs[key] && Array.isArray(docs[key].pages) && docs[key].pages.length > 0)
  if (!bid || !modKeys.length) continue
  const chave = `${k.tenant_id}|${bid}|${(k.nome || '').trim().toLowerCase()}`
  if (existentes.has(chave)) continue
  existentes.add(chave)
  const itens = modKeys.map((key) => {
    const doc = docs[key]; const capaUrl = urlDaPagina(doc, 'capa'); const folhaUrl = urlDaPagina(doc, 'conteudo')
    if (key === 'diagnostico') {
      return { id: nid(), modalidade: 'diagnostico', modelo: 'base_4', ajustes: { ...AJ, titulo: k.nome, capaUrl, folhaUrl }, capa: { ...CAPA }, conteudo: converterDiag(doc, k.nome) }
    }
    return { id: nid(), modalidade: MAP[key].modalidade, modelo: MAP[key].modelo, ajustes: { ...AJ, titulo: k.nome, capaUrl, folhaUrl }, docEdit: doc }
  })
  plano.push({
    tenant_id: k.tenant_id, nome: k.nome, banco: pastaById.get(bid)?.nome ?? bid, modalidades: modKeys,
    config: { bancoId: bid, builderV3: { v: 3, bancoId: bid, itens, ativo: itens[0].id },
      ...(cfg.material ? { material: cfg.material } : {}), ...(cfg.material_enunciado ? { material_enunciado: cfg.material_enunciado } : {}) },
    cor: k.cor ?? null, icone: k.icone ?? null, capa_url: k.capa_url ?? null,
  })
}

console.log(`Apagar (migrações anteriores): ${idsAntigosSet.size}`)
console.log(`Criar (diagnóstico NATIVO): ${plano.length}\n`)
for (const x of plano) {
  const d = x.config.builderV3.itens.find((i) => i.modalidade === 'diagnostico')
  console.log(`  • "${x.nome}" [${x.banco}] — ${x.modalidades.join(', ')}` + (d ? `  (diag: ${d.conteudo.pilares.length} pilares, ${d.conteudo.disciplinas.length} disc, ${d.conteudo.sugestoes.length} sug, intro ${d.conteudo.intro.length}, fech ${d.conteudo.fechamento.length})` : ''))
}

if (!APLICAR) { console.log('\nDRY-RUN: nada gravado.'); process.exit(0) }

let apagados = 0
for (const id of idsAntigosSet) { const r = await del('simulado_cadernos_teste', id); if (r.ok) apagados++; else console.error(`  ERRO del ${id}: ${r.status}`) }
const criados = []
for (const x of plano) {
  const r = await insert('simulado_cadernos_teste', { tenant_id: x.tenant_id, nome: x.nome, config: x.config, cor: x.cor, icone: x.icone, capa_url: x.capa_url })
  if (r.ok) { const rows = await r.json(); criados.push(rows[0]?.id) } else console.error(`  ERRO "${x.nome}": ${r.status} ${await r.text()}`)
}
writeFileSync('scripts/_backup-migracao-cadernos-completo-criados.json', JSON.stringify({ cadernos_teste_criados: criados }, null, 2))
console.log(`\nCONCLUÍDO. Apagados: ${apagados}. Criados: ${criados.length}/${plano.length}.`)
