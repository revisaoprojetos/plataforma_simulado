import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AS, WLP } from './engine'
import type { Conteudo } from './conteudo'
import { conteudoSeed } from './conteudo'
import type { ItemLP } from './motor28'
import { catalogoLegProc } from './lp-catalogo'
import { carregarPastasCP } from '@/lib/conteudo/capa-pagina-server'
import { mapaPastas, resolverPaginaInicialDoc } from '@/lib/conteudo/capa-pagina'
import { aplicarOverride, type CatalogoOverride } from './catalogo-override'
import { lerOverride } from './catalogo-override-db'
import { lerDiscSemTipo } from './config-metas'
import { CATALOGO_HTML, GRUPOS_HTML, aulaHTML, chaveDisciplina, chaveLeiHTML, disciplinaHTML, disciplinaRetirada, docDaLei, nomeDisciplina, numeroAula } from './catalogo-html'

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
  /** Chave estável de cada aula (paralelo a AS). Liga a aula ao filtro de questões da plataforma. */
  chaves?: string[]
  /** Documentos de lei da Biblioteca (uso interno: migração de planos antigos). Não vai ao cliente. */
  lpDocs?: Array<{ id: string; titulo: string; disc: string; versaoId: string | null }>
  /** Documentos de JURISPRUDÊNCIA (JurisClub): pastas com tipo de material 'jurisclub' (+ subpastas), publicados.
   *  A meta semanal `jp:<semana>` abre o k-ésimo (em ordem natural de título) no leitor. */
  JPdoc?: Array<{ id: string; titulo: string; disc: string }>
  /** índice da aula no catálogo do modelo (catalogo-html) para cada posição de AS (-1 = só da Biblioteca). */
  modeloIdx?: number[]
  /** Catálogo-BASE (antes do overlay do admin) — o editor do Catálogo de metas parte dele. */
  base?: { AS: AS; ordem?: number[]; LP: ItemLP[]; modeloIdx: number[] }
}

const PAG_PADRAO = 40 // páginas assumidas quando o PDF ainda não foi medido
const TIPOS_MATERIAL = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])

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

/** Conteúdo para o motor: catálogo-base (Biblioteca + modelo) + overlay editado no admin (Catálogo de metas). */
export async function carregarConteudoBanco(svc: SupabaseClient, tenantId: string): Promise<ConteudoBanco> {
  const [c, jp] = await Promise.all([montarConteudo(svc, tenantId, await lerOverride(svc, tenantId)), carregarJurisDocs(svc, tenantId).catch(() => [])])
  // Jurisprudência desligada por disciplina (admin › Cronograma › Disciplinas): a pasta-raiz de mesmo nome sai da meta semanal.
  const off = new Set(((await lerDiscSemTipo(svc, tenantId).catch(() => ({}) as Record<string, string[]>)).jp ?? []).map(chaveDisciplina))
  return { ...c, JPdoc: off.size ? jp.filter((x) => !off.has(chaveDisciplina(x.disc))) : jp }
}

/** Docs publicados das pastas JurisClub marcadas com tipo 'jurisclub' (herdado pelas subpastas). `disc` = pasta-raiz. */
async function carregarJurisDocs(svc: SupabaseClient, tenantId: string): Promise<Array<{ id: string; titulo: string; disc: string }>> {
  const { data } = await svc.from('simulado_pastas').select('id, nome, pai_id, cronograma_tipo_material')
    .eq('tenant_id', tenantId).eq('folder_area', 'conteudo_jurisclub').eq('is_folder', true).eq('deletado', false)
  const pastas = (data || []) as Array<{ id: string; nome: string; pai_id: string | null; cronograma_tipo_material: string | null }>
  const porId = new Map(pastas.map((p) => [p.id, p]))
  const marcada = (id: string): boolean => { let cur: string | null = id, g = 0; while (cur && g++ < 20) { const p = porId.get(cur); if (!p) return false; if (p.cronograma_tipo_material === 'jurisclub') return true; cur = p.pai_id } return false }
  const raiz = (id: string): string => { let cur = porId.get(id); let g = 0; while (cur?.pai_id && porId.has(cur.pai_id) && g++ < 20) cur = porId.get(cur.pai_id); return cur?.nome ?? '' }
  const ids = pastas.filter((p) => marcada(p.id)).map((p) => p.id)
  if (!ids.length) return []
  const docs = await selectInChunks<{ id: string; titulo: string; pasta_id: string }>(ids, (chunk) =>
    svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id').eq('tenant_id', tenantId).eq('categoria', 'jurisclub')
      .eq('status', 'publicado').eq('deletado', false).in('pasta_id', chunk))
  const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  return docs.map((d) => ({ id: d.id, titulo: d.titulo, disc: raiz(d.pasta_id) })).sort((a, b) => col.compare(a.titulo, b.titulo))
}
/** Só o catálogo-base (sem overlay) — usado pelo editor do admin. */
export async function carregarConteudoBancoBase(svc: SupabaseClient, tenantId: string): Promise<ConteudoBanco> {
  return montarConteudo(svc, tenantId, null)
}

function comOverride<T extends Conteudo>(c: T, ov: CatalogoOverride | null): T {
  const r = aplicarOverride(c, ov)
  // `chaves` (paralelo a AS) = chave ESTÁVEL de cada aula: é a que liga a aula ao filtro de questões da plataforma.
  return { ...c, AS: r.AS, ordem: r.ordem, LP: r.LP, chaves: r.chaves }
}

async function montarConteudo(svc: SupabaseClient, tenantId: string, ov: CatalogoOverride | null): Promise<ConteudoBanco> {
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
  if (discDaPasta.size === 0) return comOverride({ ...fallbackConteudo(), disciplinas: disciplinasDoCatalogo(), vazio: true, modeloIdx: CATALOGO_HTML.aulas.map((_, i) => i) }, ov)

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
    if (tipo === 'pdfight' || tipo === 'pdflash' || tipo === 'jurisclub' || tipo === 'questoes') { materiais.push({ id: d.id, titulo: d.titulo, disc: disc.nome }); continue }
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

  // PÁGINA INICIAL (Biblioteca): as páginas anteriores (capa em imagem, índice) NÃO contam no esforço da meta. Best-effort:
  // sem a migração (colunas ausentes) nada muda. início efetivo = o do documento ou o da pasta em lote mais próxima.
  const inicioPorDoc = new Map<string, number>()
  try {
    const ids = aulaDocs.map((d) => d.id)
    const [pastasCP, docsCP] = await Promise.all([
      carregarPastasCP(svc, tenantId),
      selectInChunks<{ id: string; pasta_id: string | null; pagina_inicial: number | null }>(ids, (chunk) => svc.from('simulado_conteudo_documentos').select('id, pasta_id, pagina_inicial').eq('tenant_id', tenantId).in('id', chunk)),
    ])
    const porId = mapaPastas(pastasCP)
    for (const d of docsCP) { const v = resolverPaginaInicialDoc(d.pagina_inicial, d.pasta_id, porId).valor; if (v && v > 1) inicioPorDoc.set(d.id, v) }
  } catch { /* sem migração / falha: contagem inteira, como antes */ }

  const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

  // 5) monta AS agrupado por disciplina (ordem alfabética-natural do título).
  //    A POSIÇÃO em AS é o id das metas dos planos (pf:<i>) → a montagem (ordem das disciplinas do banco +
  //    título) NÃO muda. O que vem do modelo (catalogo-html) enriquece cada aula: nome canônico da disciplina,
  //    nº e tema da aula, páginas do PDFull e links de questões; e define a ORDEM de distribuição.
  const porDisc = new Map<string, Array<{ id: string; titulo: string; pags: number | null }>>()
  for (const d of aulaDocs) {
    const pagsTotal = (d.versaoId && pagPorVersao.get(d.versaoId)) || null
    const pags = pagsTotal ? Math.max(1, pagsTotal - ((inicioPorDoc.get(d.id) ?? 1) - 1)) : null // sem a parte anterior à página inicial
    const arr = porDisc.get(d.discNome) || []; arr.push({ id: d.id, titulo: d.titulo, pags }); porDisc.set(d.discNome, arr)
  }
  const ASout: AS = []
  const daPlanilha = new Map<number, number>() // índice da aula no modelo → índice em AS
  const modeloIdx: number[] = [] // paralelo a ASout: índice no modelo (-1 = só da Biblioteca)
  const semPlanilha: number[] = [] // aulas da Biblioteca que o modelo não tem (entram no fim da ordem)
  for (const di of disciplinas) { // segue a ordem das disciplinas (ordem/nome)
    if (disciplinaRetirada(di.nome)) continue // retirada do catálogo autorizado 2.18 (Direitos Humanos)
    const aulas = porDisc.get(di.nome); if (!aulas || !aulas.length) continue
    aulas.sort((a, b) => col.compare(a.titulo, b.titulo))
    const nome = nomeDisciplina(di.nome)
    aulas.forEach((a, k) => {
      const i = ASout.length, h = aulaHTML(di.nome, a.titulo)
      if (h && !daPlanilha.has(h.idx)) {
        daPlanilha.set(h.idx, i)
        ASout.push([nome, h.numero, h.tema, h.paginas || a.pags || PAG_PADRAO, h.qc, h.tec, a.id]); modeloIdx.push(h.idx)
      } else {
        // 7º campo = id do doc da Biblioteca → abre no leitor v2 (/aluno/biblioteca/<id>).
        ASout.push([nome, String(numeroAula(a.titulo) ?? k + 1), a.titulo, a.pags || PAG_PADRAO, '', '', a.id]); modeloIdx.push(-1)
        // material de apoio guardado em pasta sem tipo (ex.: "Aula 01 - PDFIGHT - …") não é aula de PDFull
        if (!/\bPDF(IGHT|LASH)\b/i.test(a.titulo)) semPlanilha.push(i)
      }
    })
  }
  if (!ASout.length) return comOverride({ ...fallbackConteudo(), disciplinas: disciplinasDoCatalogo(), vazio: true, modeloIdx: CATALOGO_HTML.aulas.map((_, i) => i) }, ov)
  const ordem = encaixarSemPlanilha(CATALOGO_HTML.ordem.flatMap((h) => (daPlanilha.has(h) ? [daPlanilha.get(h)!] : [])), semPlanilha, ASout)

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

  // Overlay do admin (Catálogo de metas): edita/ativa/reordena aulas e metas sem mexer nas posições-base de AS.
  const ap = aplicarOverride({ AS: ASout, ordem, LP }, ov)
  return {
    AS: ap.AS, ordem: ap.ordem ?? ordem, chaves: ap.chaves, WLP: WLPout, WLPdoc, materiais: materiais.map((m) => ({ ...m, disc: nomeDisciplina(m.disc) })), LP: ap.LP,
    disciplinas: disciplinasDoConteudo(disciplinas, ap.AS, ap.ordem ?? ordem), lpDocs, vazio: false,
    modeloIdx, base: { AS: ASout, ordem, LP, modeloIdx },
  }
}

/**
 * Aulas da Biblioteca que o modelo não reconheceu (título diferente do da planilha) NÃO vão mais para o fim de toda a ordem:
 * isso fazia "Parte 3" de um assunto aparecer no 1º dia enquanto as partes 1 e 2 (sem match) ficavam para o final.
 * Cada uma entra logo DEPOIS da aula reconhecida anterior da mesma disciplina (ordem natural dos títulos em AS) ou, se não houver,
 * logo ANTES da primeira reconhecida seguinte; disciplina sem nenhuma reconhecida: vai ao fim (como antes), em ordem.
 */
function encaixarSemPlanilha(base: number[], sem: number[], AS: AS): number[] {
  if (!sem.length) return base
  const semSet = new Set(sem), baseSet = new Set(base)
  const depois = new Map<number, number[]>() // âncora (aula reconhecida) → aulas sem match logo após ela
  const antes = new Map<number, number[]>() // aula reconhecida → aulas sem match logo antes dela
  const fim: number[] = []
  for (const i of sem) {
    let ant = -1, seg = -1
    for (let j = i - 1; j >= 0; j--) if (AS[j][0] === AS[i][0] && baseSet.has(j)) { ant = j; break }
    if (ant < 0) for (let j = i + 1; j < AS.length; j++) if (AS[j][0] === AS[i][0] && baseSet.has(j)) { seg = j; break }
    if (ant >= 0) depois.set(ant, [...(depois.get(ant) || []), i])
    else if (seg >= 0) antes.set(seg, [...(antes.get(seg) || []), i])
    else fim.push(i)
  }
  const out: number[] = []
  for (const i of base) { out.push(...(antes.get(i) || []), i, ...(depois.get(i) || [])) }
  return [...out, ...fim.filter((i) => semSet.has(i))]
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
