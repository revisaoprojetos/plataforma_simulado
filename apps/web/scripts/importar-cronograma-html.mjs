// Importa o BANCO DE DADOS do Cronograma Adaptativo a partir do HTML do modelo (ex.: Cronograma_Adaptativo_2.8.html)
// e grava lib/cronograma/adaptativo/catalogo-html.json — a fonte das aulas (ordem de distribuição das matérias,
// páginas dos PDFulls, links de questões QC/TEC) e das metas de LegProc usadas pelo motor (motor28.ts).
//
//   node scripts/importar-cronograma-html.mjs "C:/caminho/Cronograma_Adaptativo_2.8.html"
//
// Lê do HTML: DADOS (catálogo-base), CATALOGO_PLANILHAS (planilhas de materiais e de LegProc), ESSENCIAIS,
// COMPLEMENTARES, AGU, COR e SEM_FLASH. A mesclagem é a MESMA do modelo (`mesclarPlanilhas`): cada aula/meta já
// conhecida mantém seu índice (o id das metas do aluno é `pf:<índice>` / `lp:c:<índice>`), as novas entram no fim.
// Por isso, ao importar uma versão nova do HTML, a base é o catalogo-html.json atual (não o DADOS do zero).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'lib/cronograma/adaptativo/catalogo-html.json')
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: node scripts/importar-cronograma-html.mjs <arquivo.html>'); process.exit(1) }
const html = readFileSync(arquivo, 'utf8')

/** Valor literal (JSON) atribuído a `const NOME =` no HTML. */
function literal(nome) {
  const m = new RegExp(`(?:const|let|var)\\s+${nome}\\s*=\\s*`).exec(html)
  if (!m) throw new Error(`não achei ${nome} no HTML`)
  let i = m.index + m[0].length
  if (html.startsWith('new Set(', i)) i += 'new Set('.length
  const abre = html[i], fecha = abre === '{' ? '}' : ']'
  let prof = 0, str = false, esc = false
  for (let k = i; k < html.length; k++) {
    const c = html[k]
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
    if (c === '"') str = true
    else if (c === abre) prof++
    else if (c === fecha && --prof === 0) return JSON.parse(html.slice(i, k + 1))
  }
  throw new Error(`literal de ${nome} não terminou`)
}

const DADOS = literal('DADOS')
const CATALOGO_PLANILHAS = literal('CATALOGO_PLANILHAS')
const ESSENCIAIS = literal('ESSENCIAIS')
const COMPLEMENTARES = literal('COMPLEMENTARES')
const AGU = literal('AGU')
const COR = literal('COR')
const SEM_FLASH = literal('SEM_FLASH')

// ── mesclagem: transcrição de mesclarPlanilhas() do modelo ───────────────────────────────────────────
const copiar = (x) => JSON.parse(JSON.stringify(x ?? {}))
const chaveCatalogo = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function mesclarPlanilhas(anterior) {
  const cat = copiar(anterior), novasPorDisc = {}, usados = new Set(), material = { ...(cat.materiais || {}) }
  cat.aulas ||= []; cat.ordem ||= cat.aulas.map((_, i) => i); cat.legprocs ||= []; cat.ordemLP ||= cat.legprocs.map((_, i) => i)
  const cobertas = new Set(CATALOGO_PLANILHAS.aulas.map((a) => a.disc))
  for (const a of CATALOGO_PLANILHAS.aulas) {
    const candidatos = cat.aulas.map((x, i) => ({ x, i })).filter(({ x, i }) => x[0] === a.disc && !usados.has(i))
    const mesmoNumero = ({ x }) => chaveCatalogo(x[1]) === chaveCatalogo(a.numero), mesmoTema = ({ x }) => chaveCatalogo(x[2]) === chaveCatalogo(a.tema)
    const match = candidatos.find((x) => mesmoNumero(x) && mesmoTema(x)) || candidatos.find(mesmoTema) || candidatos.find(mesmoNumero)
    const i = match ? match.i : cat.aulas.length; usados.add(i)
    cat.aulas[i] = [a.disc, a.numero, a.tema, a.paginas ?? 0, a.qc, a.tec]; material[i] = copiar(a.materiais)
    ;(novasPorDisc[a.disc] ||= []).push(i)
  }
  const montarOrdem = (antiga, grupos, discDe, cobertura) => {
    const filas = Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, [...v]])), ordem = []
    for (const i of antiga) { const d = discDe(i); if (cobertura.has(d)) { if (filas[d]?.length) ordem.push(filas[d].shift()) } else ordem.push(i) }
    for (const lista of Object.values(filas)) ordem.push(...lista)
    return [...new Set(ordem)]
  }
  cat.ordem = montarOrdem(cat.ordem, novasPorDisc, (i) => cat.aulas[i]?.[0], cobertas)
  cat.materiais = material
  const lpCobertas = new Set(CATALOGO_PLANILHAS.legprocs.map((x) => x.disc)), lpPorDisc = {}, usadosLP = new Set()
  for (const a of CATALOGO_PLANILHAS.legprocs) {
    const k = chaveCatalogo(a.disc + '|' + a.lei + '|' + a.texto)
    const i = cat.legprocs.findIndex((x, j) => !usadosLP.has(j) && chaveCatalogo(x.disc + '|' + x.lei + '|' + x.texto) === k)
    const id = i >= 0 ? i : cat.legprocs.length; usadosLP.add(id); cat.legprocs[id] = copiar(a); (lpPorDisc[a.disc] ||= []).push(id)
  }
  cat.ordemLP = montarOrdem(cat.ordemLP, lpPorDisc, (i) => cat.legprocs[i]?.disc, lpCobertas)
  cat.pdfights = CATALOGO_PLANILHAS.apoio.map(copiar)
  cat.versaoFontes = CATALOGO_PLANILHAS.id
  return cat
}

// base = catálogo já importado (índices estáveis) ou, na 1ª vez, o catálogo-base do HTML (DADOS.AS)
const anterior = existsSync(destino) ? JSON.parse(readFileSync(destino, 'utf8')) : null
const base = anterior
  ? { aulas: anterior.aulas.map((a) => [...a]), ordem: [...anterior.ordem], legprocs: anterior.legprocs.map((x) => ({ ...x })), ordemLP: [...anterior.ordemLP], materiais: { ...(anterior.materiais || {}) } }
  : { aulas: DADOS.AS.map((a) => [...a]), ordem: DADOS.AS.map((_, i) => i), legprocs: [], ordemLP: [], materiais: {} }
const cat = mesclarPlanilhas(base)

// ── saída compacta (sem a origem das planilhas nem os links repetidos dos materiais) ──────────────────
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v)
const materiais = {}
for (const [i, m] of Object.entries(cat.materiais || {})) {
  const x = { pdflashPaginas: num(m?.pdflashPaginas), pdfightPaginas: num(m?.pdfightPaginas), videoaula: m?.videoaula ?? null, atualizacao: m?.atualizacao ?? null }
  if (x.pdflashPaginas != null || x.pdfightPaginas != null || x.videoaula || x.atualizacao) materiais[i] = x
}
const saida = {
  id: cat.versaoFontes,
  fonte: basename(arquivo),
  importadoEm: new Date().toISOString(),
  grupos: { essenciais: ESSENCIAIS, complementares: COMPLEMENTARES, agu: AGU },
  cores: COR,
  semFlash: SEM_FLASH,
  // [disciplina, nº da aula, tema, páginas do PDFull, link QConcursos, link TEC]
  aulas: cat.aulas.map((a) => [a[0], String(a[1] ?? ''), String(a[2] ?? ''), Number(a[3]) || 0, a[4] || '', a[5] || '']),
  /** ordem de distribuição das aulas (índices em `aulas`); aula fora daqui = inativa */
  ordem: cat.ordem,
  materiais,
  legprocs: cat.legprocs.map((x) => ({ disc: x.disc, lei: x.lei || '', texto: x.texto || '', minutos: Number(x.minutos) || 30 })),
  ordemLP: cat.ordemLP,
  apoio: (cat.pdfights || []).map((x) => ({ disc: x.disc, tipo: x.tipo, numero: String(x.numero ?? ''), tema: x.tema || '', paginas: num(x.paginas) })),
  pendentesLegProc: CATALOGO_PLANILHAS.pendentesLegProc || [],
  semPlanilhaPdfull: CATALOGO_PLANILHAS.semPlanilhaPdfull || [],
}
writeFileSync(destino, JSON.stringify(saida) + '\n')
const ativas = new Set(saida.ordem)
console.log(`✓ ${destino}`)
console.log(`  fontes ${saida.id}${anterior ? ` (antes: ${anterior.id})` : ''} · ${saida.aulas.length} aulas (${ativas.size} ativas) · ${saida.legprocs.length} metas de LegProc · ${saida.apoio.length} materiais de apoio`)
if (anterior) {
  const mud = saida.aulas.filter((a, i) => anterior.aulas[i] && JSON.stringify(anterior.aulas[i]) !== JSON.stringify(a)).length
  console.log(`  ${saida.aulas.length - anterior.aulas.length} aulas novas · ${mud} aulas alteradas · ${saida.legprocs.length - anterior.legprocs.length} metas de LegProc novas`)
}
