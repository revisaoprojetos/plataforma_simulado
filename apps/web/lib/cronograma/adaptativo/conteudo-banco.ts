import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AS, WLP } from './engine'
import type { Conteudo } from './conteudo'
import { conteudoSeed } from './conteudo'
import type { ItemLP } from './motor28'
import { catalogoLegProc } from './lp-catalogo'
import { CATALOGO_HTML, GRUPOS_HTML, aulaHTML, chaveDisciplina, chaveLeiHTML, disciplinaHTML, docDaLei, nomeDisciplina, numeroAula } from './catalogo-html'

// Loader de CONTEÚDO REAL do Cronograma Adaptativo. As aulas e matérias são as da Biblioteca; os dados do
// modelo (catalogo-html.ts: páginas, links de questões, ordem de distribuição, metas de LegProc, grupo e cor
// das disciplinas) enriquecem o que existe — ver os passos 5 e 7.
//
//  · disciplinas  → simulado_disciplinas (nome, classificacao, cor, ordem)
//  · aulas (AS)   → documentos publicados da Biblioteca nas SUBpastas da disciplina marcadas como
//                   PDFull/PDFight (ou docs soltos na pasta-disciplina, sem subpasta-tipada)
//  · lei seca(WLP)→ SUBpastas marcadas como LegProc (1 doc → 1 semana, ordem natural do título);
//                   se não houver, cai no fallback da tabela simulado_cronograma_adaptativo_legproc
//  · questões     → SUBpastas marcadas como "questoes" ficam RESERVADAS (não viram aula; sem meta nova)
//
// TIPO DE MATERIAL por SUBpasta: simulado_pastas.cronograma_tipo_material
//   ('pdfull' | 'pdfight' | 'legproc' | 'questoes' | null).
// HERANÇA: um documento herda o tipo da subpasta-tipada mais próxima subindo a árvore (pai_id);
//          se nenhuma subpasta no caminho tem tipo, o doc é tratado como 'pdfull' (compatibilidade).
// Enquanto o admin não vincular pastas/cadastrar lei seca, cai no SEED (não quebra).

export interface DisciplinaInfo { nome: string; classificacao: string | null; cor: string | null }
export interface ConteudoBanco extends Conteudo {
  disciplinas: DisciplinaInfo[]
  vazio: boolean
  /** Paralelo a WLP: id do documento da Biblioteca de cada bloco de lei seca (LegProc) → abre no leitor.
   *  null quando o bloco vem da tabela de fallback (só texto, sem documento). */
  WLPdoc?: (string | null)[][]
  /** Materiais de APOIO das aulas (PDFight/PDFlash/Questões) — não viram aula nova, mas pertencem ao
   *  cronograma: a liberação por data (liberacao.ts) os casa com a aula pelo nº "Aula NN" + disciplina. */
  materiais?: Array<{ id: string; titulo: string; disc: string }>
  /** LegProc 2.8: metas de ~30 min por lei, vinculadas à disciplina (ver lp-catalogo.ts). */
  LP?: ItemLP[]
  /** Ordem de distribuição das aulas (índices em AS) — a do modelo, + aulas da Biblioteca fora dele no fim. */
  ordem?: number[]
  /** Documentos de lei da Biblioteca (uso interno: migração de planos antigos). Não vai ao cliente. */
  lpDocs?: Array<{ id: string; titulo: string; disc: string; versaoId: string | null }>
}

const PAG_PADRAO = 40 // páginas assumidas quando o PDF ainda não foi medido
const TIPOS_MATERIAL = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'questoes'])

/** `.in()` em lotes (evita hang do proxy com listas grandes); projeção já vem do build. */
async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunk = 150,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunk) {
    const { data } = await run(ids.slice(i, i + chunk))
    if (data) out.push(...data)
  }
  return out
}

export async function carregarConteudoBanco(svc: SupabaseClient, tenantId: string): Promise<ConteudoBanco> {
  // 1) disciplinas
  const { data: discRows } = await svc.from('simulado_disciplinas')
    .select('id, nome, classificacao, cor, ordem').eq('tenant_id', tenantId)
    .order('ordem', { ascending: true }).order('nome', { ascending: true })
  const disciplinas: DisciplinaInfo[] = (discRows || []).map((d: Record<string, unknown>) => ({ nome: String(d.nome), classificacao: (d.classificacao as string) ?? null, cor: (d.cor as string) ?? null }))
  const discById = new Map<string, { nome: string }>((discRows || []).map((d: Record<string, unknown>) => [String(d.id), { nome: String(d.nome) }]))

  // 2) pastas de conteúdo (p/ montar subárvore por disciplina + tipo de material por subpasta)
  const { data: pastaRows } = await svc.from('simulado_pastas')
    .select('id, pai_id, disciplina_id, ordem, cronograma_tipo_material').eq('tenant_id', tenantId).eq('folder_area', 'conteudo')
  const pastas = (pastaRows || []) as Array<{ id: string; pai_id: string | null; disciplina_id: string | null; ordem: number | null; cronograma_tipo_material: string | null }>
  const filhos = new Map<string, string[]>()
  const paiPorPasta = new Map<string, string | null>()
  const tipoPorPasta = new Map<string, string | null>()
  for (const p of pastas) {
    paiPorPasta.set(p.id, p.pai_id)
    tipoPorPasta.set(p.id, p.cronograma_tipo_material)
    if (p.pai_id) { const arr = filhos.get(p.pai_id) || []; arr.push(p.id); filhos.set(p.pai_id, arr) }
  }
  // pasta_id -> disciplina_id (herdado da pasta-raiz marcada com disciplina_id)
  const discDaPasta = new Map<string, string>()
  for (const p of pastas) if (p.disciplina_id) {
    const pilha = [p.id]
    while (pilha.length) { const cur = pilha.pop()!; if (!discDaPasta.has(cur)) { discDaPasta.set(cur, p.disciplina_id); (filhos.get(cur) || []).forEach((f) => pilha.push(f)) } }
  }
  if (discDaPasta.size === 0) return { ...fallbackConteudo(), disciplinas: disciplinasDoCatalogo(), vazio: true }

  // tipo de material herdado: subpasta-tipada mais próxima subindo a árvore (com memoização + anti-ciclo)
  const tipoCache = new Map<string, string | null>()
  const tipoHerdado = (pastaId: string): string | null => {
    const caminho: string[] = []
    let cur: string | null = pastaId
    let achado: string | null = null
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      if (tipoCache.has(cur)) { achado = tipoCache.get(cur)!; break }
      caminho.push(cur)
      const t = tipoPorPasta.get(cur)
      if (t && TIPOS_MATERIAL.has(t)) { achado = t; break }
      cur = paiPorPasta.get(cur) ?? null
    }
    for (const c of caminho) tipoCache.set(c, achado)
    return achado
  }

  // 3) documentos publicados dessas pastas (projeção mínima; .in() em lotes)
  const pastaIds = [...discDaPasta.keys()]
  const docs = await selectInChunks<{ id: string; titulo: string; pasta_id: string; versao_atual_id: string | null }>(
    pastaIds,
    (chunk) => svc.from('simulado_conteudo_documentos')
      .select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', tenantId)
      .eq('status', 'publicado').eq('deletado', false).in('pasta_id', chunk),
  )

  // 4) classifica cada doc pelo tipo herdado da sua subpasta
  //    pdfull | pdfight | null -> aula (PDFull) · legproc -> lei seca · questoes -> reservado (ignora)
  const aulaDocs: Array<{ id: string; titulo: string; versaoId: string | null; discNome: string }> = []
  const legprocDocs: Array<{ id: string; titulo: string; disc: string; versaoId: string | null }> = []
  const materiais: Array<{ id: string; titulo: string; disc: string }> = []
  for (const d of docs) {
    const discId = discDaPasta.get(d.pasta_id); if (!discId) continue
    const disc = discById.get(discId); if (!disc) continue
    const tipo = tipoHerdado(d.pasta_id)
    if (tipo === 'legproc') { legprocDocs.push({ id: d.id, titulo: d.titulo, disc: disc.nome, versaoId: d.versao_atual_id }); continue } // lei seca → WLP (+ id p/ abrir no leitor)
    // AULAS = só PDFull (ou docs sem subpasta tipada, p/ compat). PDFight (questões), PDFlash (revisão)
    // e Questões são MATERIAIS ligados às metas que o engine JÁ gera (qu/fl) — não contam como aula nova.
    if (tipo === 'pdfight' || tipo === 'pdflash' || tipo === 'questoes') { materiais.push({ id: d.id, titulo: d.titulo, disc: disc.nome }); continue }
    aulaDocs.push({ id: d.id, titulo: d.titulo, versaoId: d.versao_atual_id, discNome: disc.nome }) // pdfull | null
  }

  // páginas da versão atual — só das aulas (legproc/questões não precisam de páginas)
  const verIds = aulaDocs.map((d) => d.versaoId).filter(Boolean) as string[]
  const pagPorVersao = new Map<string, number>()
  if (verIds.length) {
    const verRows = await selectInChunks<{ id: string; paginas: number | null }>(
      verIds,
      (chunk) => svc.from('simulado_conteudo_versoes').select('id, paginas').in('id', chunk),
    )
    for (const v of verRows) if (v.paginas) pagPorVersao.set(v.id, v.paginas)
  }

  const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

  // 5) monta AS agrupado por disciplina (ordem alfabética-natural do título).
  //    A POSIÇÃO em AS é o id das metas dos planos (pf:<i>) → a montagem (ordem das disciplinas do banco +
  //    título) NÃO muda. O que vem do modelo (catalogo-html) enriquece cada aula: nome canônico da disciplina,
  //    nº e tema da aula, páginas do PDFull e links de questões; e define a ORDEM de distribuição.
  const porDisc = new Map<string, Array<{ id: string; titulo: string; pags: number | null }>>()
  for (const d of aulaDocs) {
    const pags = (d.versaoId && pagPorVersao.get(d.versaoId)) || null
    const arr = porDisc.get(d.discNome) || []; arr.push({ id: d.id, titulo: d.titulo, pags }); porDisc.set(d.discNome, arr)
  }
  const ASout: AS = []
  const daPlanilha = new Map<number, number>() // índice da aula no modelo → índice em AS
  const semPlanilha: number[] = [] // aulas da Biblioteca que o modelo não tem (entram no fim da ordem)
  for (const di of disciplinas) { // segue a ordem das disciplinas (ordem/nome)
    const aulas = porDisc.get(di.nome); if (!aulas || !aulas.length) continue
    aulas.sort((a, b) => col.compare(a.titulo, b.titulo))
    const nome = nomeDisciplina(di.nome)
    aulas.forEach((a, k) => {
      const i = ASout.length, h = aulaHTML(di.nome, a.titulo)
      if (h && !daPlanilha.has(h.idx)) {
        daPlanilha.set(h.idx, i)
        ASout.push([nome, h.numero, h.tema, h.paginas || a.pags || PAG_PADRAO, h.qc, h.tec, a.id])
      } else {
        // 7º campo = id do doc da Biblioteca → abre no leitor v2 (/aluno/biblioteca/<id>).
        ASout.push([nome, String(numeroAula(a.titulo) ?? k + 1), a.titulo, a.pags || PAG_PADRAO, '', '', a.id])
        // material de apoio guardado em pasta sem tipo (ex.: "Aula 01 - PDFIGHT - …") não é aula de PDFull
        if (!/\bPDF(IGHT|LASH)\b/i.test(a.titulo)) semPlanilha.push(i)
      }
    })
  }
  if (!ASout.length) return { ...fallbackConteudo(), disciplinas: disciplinasDoCatalogo(), vazio: true }
  const ordem = [...CATALOGO_HTML.ordem.flatMap((h) => (daPlanilha.has(h) ? [daPlanilha.get(h)!] : [])), ...semPlanilha]

  // 6) WLP (lei seca por semana)
  //    Heurística doc→semana: todos os docs das subpastas LegProc (de qualquer disciplina) são
  //    achatados numa lista única, ordenados por título (natural) e mapeados em sequência →
  //    doc nº k (1-based) = semana k, 1 bloco por semana (texto = título do documento).
  //    Sem subpastas LegProc com docs → fallback da tabela (comportamento anterior preservado).
  let WLPout: WLP
  let WLPdoc: (string | null)[][] = []
  if (legprocDocs.length) {
    legprocDocs.sort((a, b) => col.compare(a.titulo, b.titulo))
    WLPout = Array.from({ length: legprocDocs.length + 1 }, () => [] as string[])
    WLPdoc = Array.from({ length: legprocDocs.length + 1 }, () => [] as (string | null)[])
    // id do doc junto do título: sem ele a meta LegProc do cronograma não tinha link e não abria.
    legprocDocs.forEach((ld, i) => { WLPout[i + 1] = [ld.titulo]; WLPdoc[i + 1] = [ld.id] })
  } else {
    const { data: lpRows } = await svc.from('simulado_cronograma_adaptativo_legproc')
      .select('semana, ordem, texto').eq('tenant_id', tenantId).order('semana').order('ordem')
    const lp = (lpRows || []) as Array<{ semana: number; ordem: number; texto: string }>
    const maxSem = lp.reduce((m, r) => Math.max(m, r.semana), 0)
    WLPout = Array.from({ length: maxSem + 1 }, () => [] as string[])
    for (const r of lp) (WLPout[r.semana] ||= []).push(r.texto)
  }

  // 7) LegProc: metas do MODELO (lei + trecho, 30 min, na ordem das planilhas) nas disciplinas que ele cobre,
  //    ligadas ao documento da lei na Biblioteca (mesmo nº de lei); nas demais disciplinas com leis na
  //    Biblioteca, o corte automático por artigos (lp-catalogo.ts) continua valendo.
  const ordemDisc = new Map(disciplinas.map((d, k) => [d.nome, k]))
  const lpDocs = [...legprocDocs].sort((a, b) => ((ordemDisc.get(a.disc) ?? 999) - (ordemDisc.get(b.disc) ?? 999)) || col.compare(a.titulo, b.titulo))
  const presentes = new Set([...ASout.map((a) => chaveDisciplina(a[0])), ...lpDocs.map((d) => chaveDisciplina(d.disc))])
  const LP = lpDoModelo(presentes, lpDocs)
  const cobertas = new Set(CATALOGO_HTML.legprocs.map((x) => chaveDisciplina(x.disc)))
  const lpAuto = lpDocs.filter((d) => !cobertas.has(chaveDisciplina(d.disc)))
  if (lpAuto.length) {
    const auto = await catalogoLegProc(svc, tenantId, lpAuto).catch(() => [] as ItemLP[])
    LP.push(...auto.map((x) => ({ ...x, disc: nomeDisciplina(x.disc) })))
  }

  return {
    AS: ASout, ordem, WLP: WLPout, WLPdoc, materiais: materiais.map((m) => ({ ...m, disc: nomeDisciplina(m.disc) })), LP,
    disciplinas: disciplinasDoConteudo(disciplinas, ASout, ordem), lpDocs, vazio: false,
  }
}

/** Metas de LegProc do modelo nas disciplinas presentes, com o documento da lei na Biblioteca (quando houver). */
function lpDoModelo(presentes: Set<string>, lpDocs: Array<{ id: string; titulo: string; disc: string }>): ItemLP[] {
  const docsPorDisc = new Map<string, typeof lpDocs>()
  for (const d of lpDocs) { const k = chaveDisciplina(d.disc); docsPorDisc.set(k, [...(docsPorDisc.get(k) || []), d]) }
  const nPorLei = new Map<string, number>(), docPorLei = new Map<string, string | null>()
  const out: ItemLP[] = []
  for (const k of CATALOGO_HTML.ordemLP) {
    const m = CATALOGO_HTML.legprocs[k]; if (!m) continue
    const kd = chaveDisciplina(m.disc); if (!presentes.has(kd)) continue
    const chave = chaveLeiHTML(m.disc, m.lei)
    if (!docPorLei.has(chave)) docPorLei.set(chave, docDaLei(m.lei, docsPorDisc.get(kd) || [])?.id ?? null)
    const n = (nPorLei.get(chave) || 0) + 1; nPorLei.set(chave, n)
    out.push({ id: `lp:${chave}:${n}`, disc: nomeDisciplina(m.disc), lei: m.lei, texto: `${m.lei} — ${m.texto}`, doc: docPorLei.get(chave), min: m.minutos || 30 })
  }
  return out
}

/** Disciplinas que o cronograma mostra: uma por matéria (grafias juntas), só com aulas ativas; grupo/cor do modelo. */
function disciplinasDoConteudo(banco: DisciplinaInfo[], AS: AS, ordem: number[]): DisciplinaInfo[] {
  const comAulas = new Set(ordem.map((i) => AS[i][0]))
  const out = new Map<string, DisciplinaInfo & { _o: number }>()
  banco.forEach((d, k) => {
    const nome = nomeDisciplina(d.nome); if (!comAulas.has(nome) || out.has(nome)) return
    const h = disciplinaHTML(d.nome)
    out.set(nome, { nome, classificacao: h?.grupo || d.classificacao || 'complementar', cor: h?.cor || d.cor, _o: h ? h.ordem : 1000 + k })
  })
  return [...out.values()].sort((a, b) => a._o - b._o).map(({ _o, ...d }) => d)
}
/** Sem conteúdo na Biblioteca: disciplinas do próprio modelo. */
function disciplinasDoCatalogo(): DisciplinaInfo[] {
  const g = GRUPOS_HTML
  return [...g.essenciais.map((n) => [n, 'essencial']), ...g.complementares.map((n) => [n, 'complementar']), ...g.agu.flat().map((n) => [n, 'especifica'])]
    .map(([nome, classificacao]) => ({ nome, classificacao, cor: CATALOGO_HTML.cores[nome] || null }))
}

/** Sem pastas/aulas na Biblioteca: o catálogo do modelo puro (aulas, ordem e LegProc, sem documentos). */
function fallbackConteudo(): Conteudo {
  const presentes = new Set(CATALOGO_HTML.aulas.map((a) => chaveDisciplina(a[0])))
  return { AS: CATALOGO_HTML.aulas.map((a) => [...a] as AS[number]), ordem: [...CATALOGO_HTML.ordem], WLP: conteudoSeed().WLP, LP: lpDoModelo(presentes, []) }
}

/** {AS, ordem, LP} prontos p/ o motor — banco quando houver, senão o catálogo do modelo. */
export async function carregarConteudo(svc: SupabaseClient, tenantId: string): Promise<Conteudo> {
  const b = await carregarConteudoBanco(svc, tenantId)
  return { AS: b.AS, ordem: b.ordem, WLP: b.WLP, LP: b.LP }
}

/** LegProc ANTIGO (corte automático de todas as leis) — só p/ descrever metas de planos criados antes. */
export async function lpAutomaticoTodas(svc: SupabaseClient, tenantId: string, lpDocs: Array<{ id: string; titulo: string; disc: string; versaoId: string | null }>): Promise<ItemLP[]> {
  return catalogoLegProc(svc, tenantId, lpDocs).catch(() => [] as ItemLP[])
}
