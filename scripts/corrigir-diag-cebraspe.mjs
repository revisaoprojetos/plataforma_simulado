// Garante que TODO caderno-teste (foco CEBRASPE) tenha um item de Diagnóstico nativo, convertendo do
// V1 docsV2.diagnostico de mesmo nome que TENHA conteúdo.
//   DRY-RUN:  node scripts/corrigir-diag-cebraspe.mjs
//   APLICAR:  node scripts/corrigir-diag-cebraspe.mjs --aplicar   (--todos p/ além de CEBRASPE)
import { readFileSync, writeFileSync } from 'node:fs'
const APLICAR = process.argv.includes('--aplicar')
const SOMENTE_CEBRASPE = !process.argv.includes('--todos')
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const A4_H = 1123
async function all(t, s) { const o = []; let f = 0; for (;;) { const r = await fetch(`${URL}/rest/v1/${t}?select=${encodeURIComponent(s)}`, { headers: { ...H, Range: `${f}-${f + 999}` } }); const rows = await r.json(); o.push(...rows); if (rows.length < 1000) break; f += 1000 } return o }
const patch = (t, id, b) => fetch(`${URL}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(b) })

const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const totalPilar = (ch) => `{acerto_pilar_${ch}} de {total_pilar_${ch}} questões`
const parseTop = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.startsWith('>>') ? { forte: true, texto: l.replace(/^>>\s*/, '') } : l.startsWith('>') ? { forte: false, texto: l.replace(/^>\s*/, '') } : { forte: false, texto: l })
const urlPagina = (doc, kind) => { const pg = (doc?.pages || []).find((p) => p.kind === kind); const pf = (pg?.blocks || []).find((b) => (b.type || b.kind) === 'plano-fundo'); return pf?.attributes?.url || '' }

function converterDiag(doc, nome) {
  const pg = (doc?.pages || []).find((p) => p.kind === 'conteudo'); const blocks = pg?.blocks || []
  const nota = blocks.find((b) => b.type === 'diag-nota')?.attributes || {}
  const intro = []; let discIntro = ''; const fechamento = []; let vP = false, vD = false, vS = false
  for (const b of blocks) { if (b.type === 'diag-pilares') vP = true; if (b.type === 'diag-disciplina') vD = true; if (b.type === 'diag-sugestoes') vS = true
    if (b.type === 'texto-livre') { const t = (b.attributes?.texto || '').trim(); if (!t) continue; if (vS) fechamento.push(t); else if (vP && !vD) discIntro = t; else if (!vP) intro.push(t) } }
  const pilB = blocks.find((b) => b.type === 'diag-pilares')?.attributes
  const pilares = (pilB?.pilares || []).map((p) => { const ch = p.chave || slug(p.nome); const bandas = Array.isArray(p.bandas) && p.bandas.length ? p.bandas : [{ faixa: '0-49', texto: p.f1 || '' }, { faixa: '50-80', texto: p.f2 || '' }, { faixa: '81-100', texto: p.f3 || '' }]; return { nome: p.nome || '', chave: ch, totalTxt: totalPilar(ch), bandas } })
  const disciplinas = blocks.filter((b) => b.type === 'diag-disciplina').map((b) => { const a = b.attributes || {}; return { nome: a.nome || '', chave: a.chave || slug(a.nome), total: '', categoria: a.assunto || 'Assunto' } })
  const sugestoes = blocks.filter((b) => b.type === 'diag-sugestoes').map((b) => { const a = b.attributes || {}; return { titulo: a.titulo || '', prioridade: a.prioridade || '', intro: a.intro || '', corTitulo: a.corTitulo, itens: parseTop(a.topicos) } })
  return { tituloCabecalho: 'Diagnóstico de Desempenho', subtitulo: nome || 'Adicionar Subtítulo',
    notaTotal: `{${nota.varNumero || 'acertos'}}/{${nota.varTotal || 'total_questoes'}}`, notaTexto: nota.texto || '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
    intro, pilares, disciplinasIntro: discIntro || 'A análise a seguir tem foco nos seus pontos de erros.', disciplinas, sugestoes, fechamento,
    partesOcultas: ['gabarito'], gabaritoTitulo: '', gabaritoIntro: [], gabaritoObs: [] }
}
function capaDoDoc(doc) {
  const capa = (doc?.pages || []).find((p) => p.kind === 'capa'); if (!capa) return null
  const esp = (capa.blocks || []).find((b) => (b.type || b.kind) === 'espacador'); const espH = Number(esp?.attributes?.altura ?? 0) || 0
  const txts = []; const walk = (bs) => { for (const b of (bs || [])) { if ((b.type || b.kind) === 'texto-livre') txts.push(b.attributes || {}); if (b.innerBlocks) walk(b.innerBlocks) } }; walk(capa.blocks)
  const tit = txts.filter((a) => (a.texto || '').trim()).sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))[0]; const size = Number(tit?.size) || 44
  return { titulo: (tit?.texto || '').trim(), cor: tit?.color || '#ffffff', tamanho: size, fonte: tit?.fonte || 'montserrat', negrito: tit?.bold !== false, italico: !!tit?.italico, sublinhado: !!tit?.sublinhado, alinhamento: (tit?.align === 'left' || tit?.align === 'right') ? tit.align : 'center', posV: Math.max(8, Math.min(92, Math.round(((espH + size * 1.3) / A4_H) * 100))), posH: 50 }
}
const AJ = { titulo: 'Simulado', corPrimaria: '#2d254f', corSecundaria: '#f6b420', mostrarCabecalho: true, mostrarDadosAluno: true, mostrarComentarios: false, mostrarGabarito: false, numAlternativas: 5, colunas: 2, compacto: false, capaUrl: '', folhaUrl: '', cabecalhoUrl: '', rodapeUrl: '', coresPilar: { lei_seca: '#c9a227', jurisprudencia: '#3b5bdb', doutrina: '#e8850c', lingua_portuguesa: '#1a7a4a' }, coresDisc: {}, coresParte: {}, alinhamentoParte: {}, coresTextoParte: {}, estiloParte: {}, fonteParte: {}, tamanhoParte: {} }
const nid = () => Math.random().toString(36).slice(2, 10)
const temConteudo = (dg) => { const c = dg?.conteudo; return c && ((c.pilares?.length || 0) > 0 || (c.disciplinas?.length || 0) > 0) }

console.log(`MODO: ${APLICAR ? 'APLICAR' : 'DRY-RUN'} | escopo: ${SOMENTE_CEBRASPE ? 'CEBRASPE' : 'TODOS'}\n`)
const v1 = await all('simulado_cadernos_designer', 'id,nome,config')
const melhorPorNome = new Map()
for (const k of v1) { const doc = k.config?.docsV2?.diagnostico; const pg = (doc?.pages || []).find((p) => p.kind === 'conteudo'); const n = (pg?.blocks || []).filter((b) => /^diag-/.test(b.type)).length; if (n === 0) continue; const key = (k.nome || '').trim().toLowerCase(); const cur = melhorPorNome.get(key); if (!cur || n > cur.n) melhorPorNome.set(key, { doc, n, nome: k.nome }) }

const ct = await all('simulado_cadernos_teste', 'id,nome,config')
const backup = []; let corrigidos = 0
for (const c of ct) {
  if (SOMENTE_CEBRASPE && !/cebraspe/i.test(c.nome || '')) continue
  const b = c.config?.builderV3; if (!b?.itens) continue
  const dgItem = b.itens.find((i) => i.modalidade === 'diagnostico')
  if (dgItem && temConteudo(dgItem)) continue
  const fonte = melhorPorNome.get((c.nome || '').trim().toLowerCase())
  if (!fonte) { console.log(` ! ${c.nome}: sem diagnóstico V1 de mesmo nome com conteúdo — pulado`); continue }
  const conteudo = converterDiag(fonte.doc, c.nome)
  const capaUrl = urlPagina(fonte.doc, 'capa'); const folhaUrl = urlPagina(fonte.doc, 'conteudo'); const capa = capaDoDoc(fonte.doc)
  const novoDg = { id: nid(), modalidade: 'diagnostico', modelo: 'base_4', ajustes: { ...AJ, titulo: c.nome, capaUrl, folhaUrl }, capa: capa || undefined, conteudo }
  const itens = dgItem ? b.itens.map((i) => i === dgItem ? novoDg : i) : [...b.itens, novoDg]
  backup.push({ id: c.id, config_antes: c.config }); corrigidos++
  console.log(` • ${c.nome}: ${dgItem ? 'substitui' : 'adiciona'} diagnóstico (${conteudo.pilares.length} pilares, ${conteudo.disciplinas.length} disc, ${conteudo.sugestoes.length} sug) de "${fonte.nome}"`)
  if (APLICAR) { const r = await patch('simulado_cadernos_teste', c.id, { config: { ...c.config, builderV3: { ...b, itens } } }); if (!r.ok) console.error('   ERRO', await r.text()) }
}
console.log(`\n${APLICAR ? 'Corrigidos' : 'A corrigir'}: ${corrigidos}.`)
if (APLICAR) { writeFileSync('scripts/_backup-corrigir-diag-cebraspe.json', JSON.stringify(backup, null, 2)); console.log('Backup: scripts/_backup-corrigir-diag-cebraspe.json') }
