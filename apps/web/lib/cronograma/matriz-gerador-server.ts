import 'server-only'

/**
 * MATRIZ DE AULAS do Gerador (servidor): leitura paginada (1 linha = 1 aula do conjunto; colunas = seções/classificações),
 * seletor de documento/parte da Biblioteca e gravação em lote da seleção (`simulado_conteudo_selecao_meta`, area='gerador').
 * Backend-first: tempo (regra de uso × páginas), sugestão automática, situação e paginação são calculados AQUI.
 * Tolera a tabela de seleção ausente (migration 16): a matriz abre em modo leitura, sem derrubar a tela.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { calcularMinutos, resolverRegras } from '@/lib/conteudo/classificacao/cascata'
import { carregarCatalogoClassificacao, carregarRegrasUsoDaArea, esquecerClassificacao, type ClassificacaoCatalogo } from '@/lib/conteudo/classificacao/carregar'
import { lerRegrasParciais } from '@/lib/conteudo/classificacao/esquema'
import { invalidarCachesPaginas } from '@/lib/conteudo/paginas-sync'
import { paginasEfetivasDocs, type DocParaPaginas } from '@/lib/conteudo/paginas-efetivas'
import { listarPartes } from '@/lib/conteudo/partes-server'
import { listarTiposMeta } from './carregar-tipos'
import { chaveDisc, indexarBiblioteca, normTexto, resolverDocumentoMeta, type DocBiblioteca } from './conteudo-meta'
import { docsBibliotecaCache } from './meta-extras-server'
import {
  AREA_GERADOR, chaveAulaGerador, chaveSelecaoGerador, classificacaoSlugDoTipo, prefixoSelecaoConjunto,
} from './selecao-gerador'
import { CATEGORIAS_VIDEOAULA, TIPO_ORIGEM_VIDEOAULA, colunaVideoaula, ehTipoVideoaula } from './videoaula-gerador'
import { T_SELECAO, esquecerSelecoesGerador, selecaoTabelaAusente } from './selecao-gerador-server'
import {
  MSG_MIGRACAO_SELECAO, situacaoDaLinha, SITUACOES_MATRIZ,
  type CelulaDocumento, type ColunaMatriz, type DocSeletor, type DocsSeletorResposta, type LinhaMatriz, type MatrizDados,
  type ParteSeletor, type PlataformaLinkMatriz, type SelecaoCelula, type SituacaoLinhaMatriz,
} from './matriz-gerador-tipos'

type Erro = { message?: string; code?: string }
const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const norm = (s: string | null | undefined) => normTexto(s)
const SLUGS_FIXOS_URL = new Set(['pdf', 'video'])

export interface ConjuntoMin { id: string; nome: string; disciplina: string; disciplina_id: string | null; descricao: string | null }
interface AulaRow { id: string; tipo: string; aula: string | null; conteudo: string | null; titulo_aula: string | null; ordem: number }
interface SelRow {
  id: string; meta_chave: string; documento_id: string; parte_id: string | null; classificacao_id: string | null
  rotulo_aluno: string | null; visivel_aluno: boolean | null; regras_override: unknown
}

export async function lerConjunto(svc: SupabaseClient, tenantId: string, id: string): Promise<ConjuntoMin | null> {
  const { data } = await svc.from('simulado_cronograma_conjuntos').select('id, nome, disciplina, disciplina_id, descricao')
    .eq('id', id).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
  return (data as ConjuntoMin | null) ?? null
}

async function lerAulasConjunto(svc: SupabaseClient, tenantId: string, conjuntoId: string): Promise<AulaRow[]> {
  const ler = (cols: string) => fetchAll<AulaRow>(() =>
    svc.from('simulado_cronograma_conjunto_aulas').select(cols).eq('tenant_id', tenantId).eq('conjunto_id', conjuntoId).order('ordem').order('id') as never)
  try { return await ler('id, tipo, aula, conteudo, titulo_aula, ordem') } catch {
    return (await ler('id, tipo, aula, conteudo, ordem')).map((a) => ({ ...a, titulo_aula: null }))
  }
}

export interface ParamsMatriz {
  page: number
  pp: number
  q: string
  /** seção (tipo de meta) que a aula precisa ter. */
  tipo: string
  /** classificação (slug) que a aula precisa ter vinculada (selecionada ou automática). */
  cls: string
  sit: SituacaoLinhaMatriz | ''
  sort: 'aula' | 'situacao'
  dir: 'asc' | 'desc'
}

interface GrupoAula { chave: string; num: number; rows: AulaRow[] }

function agruparAulas(aulas: AulaRow[]): GrupoAula[] {
  const mapa = new Map<string, GrupoAula>()
  for (const a of aulas) {
    const k = chaveAulaGerador(a.aula)
    let g = mapa.get(k)
    if (!g) { g = { chave: k, num: k && /^\d+(\.\d+)?$/.test(k) ? Number(k) : Number.POSITIVE_INFINITY, rows: [] }; mapa.set(k, g) }
    g.rows.push(a)
  }
  return [...mapa.values()].sort((a, b) => a.num - b.num || col.compare(a.chave, b.chave))
}

/** Monta as colunas (seções com documento) a partir dos tipos de meta ativos × catálogo de classificações. */
function montarColunas(
  tipos: Awaited<ReturnType<typeof listarTiposMeta>>, catalogo: ClassificacaoCatalogo[],
): { colunas: ColunaMatriz[]; tipoLinks: { tipo: string; nome: string } | null } {
  const ativos = catalogo.filter((c) => c.ativo)
  const slugs = new Set(ativos.map((c) => c.slug))
  const porSlug = new Map(ativos.map((c) => [c.slug, c] as const))
  const colunas: ColunaMatriz[] = []
  for (const t of tipos) {
    if (t.mostra_links) continue
    const cs = classificacaoSlugDoTipo(t.slug, slugs)
    if (!cs || cs === 'questoes') continue
    const c = porSlug.get(cs)
    colunas.push({ tipo: t.slug, nome: t.nome, cor: t.cor, classificacaoId: c?.id ?? null, classificacaoSlug: cs, papel: c?.papel ?? null })
  }
  // Videoaula: coluna SINTÉTICA (não é seção/meta da aula) — existe quando a classificação de sistema está ativa no tenant.
  const cv = colunaVideoaula(catalogo)
  if (cv && !colunas.some((c) => c.tipo === cv.tipo)) colunas.push(cv)
  const tl = tipos.find((t) => t.mostra_links) ?? tipos.find((t) => t.slug === 'quest') ?? null
  return { colunas, tipoLinks: tl ? { tipo: tl.slug, nome: tl.nome } : null }
}

/** Matriz paginada. Só as células/linhas da PÁGINA pedida são enriquecidas (documentos, partes, tempo, links). */
export async function carregarMatriz(svc: SupabaseClient, tenantId: string, conjunto: ConjuntoMin, p: ParamsMatriz): Promise<MatrizDados> {
  const [aulas, tipos, catalogo, docsBib, regrasUso] = await Promise.all([
    lerAulasConjunto(svc, tenantId, conjunto.id),
    listarTiposMeta(tenantId),
    carregarCatalogoClassificacao(svc, tenantId).catch(() => [] as ClassificacaoCatalogo[]),
    docsBibliotecaCache(svc, tenantId).catch(() => [] as DocBiblioteca[]),
    carregarRegrasUsoDaArea(svc, tenantId, AREA_GERADOR).catch(() => new Map()),
  ])
  const { colunas, tipoLinks } = montarColunas(tipos, catalogo)
  const nomeTipo = new Map(tipos.map((t) => [t.slug, t.nome] as const))

  // seleções do conjunto
  let semTabelaSelecao = false
  let sels: SelRow[] = []
  try {
    sels = await fetchAll<SelRow>(() =>
      svc.from(T_SELECAO).select('id, meta_chave, documento_id, parte_id, classificacao_id, rotulo_aluno, visivel_aluno, regras_override')
        .eq('tenant_id', tenantId).eq('area', AREA_GERADOR).like('meta_chave', `${prefixoSelecaoConjunto(conjunto.id)}%`).order('id', { ascending: true }) as never)
  } catch (e) {
    if (selecaoTabelaAusente(e as Erro)) semTabelaSelecao = true
    else throw e
  }
  const selPorChave = new Map(sels.map((s) => [s.meta_chave, s] as const))

  // sugestão automática (resolvedor atual) por aula × coluna — barato (em memória, índice cacheado)
  const indice = indexarBiblioteca(docsBib)
  const docBib = new Map(docsBib.map((d) => [d.id, d] as const))
  const grupos = agruparAulas(aulas)
  const autoDe = (g: GrupoAula, c: ColunaMatriz): string | null => {
    if (ehTipoVideoaula(c.tipo)) return null // videoaula não tem sugestão automática: só escolha explícita
    const secao = g.rows.find((r) => r.tipo === c.tipo)
    const r = resolverDocumentoMeta({ id: 'x', tipo: c.tipo, disciplinas: [conjunto.disciplina], aula: g.chave || null, conteudo: secao?.conteudo ?? null }, indice, null)
    return r?.docId ?? null
  }

  // situação de TODAS as aulas (filtro/ordenação/resumo precisam disso; só em memória)
  interface Pre { g: GrupoAula; situacao: SituacaoLinhaMatriz; temCls: Set<string> }
  const pre: Pre[] = grupos.map((g) => {
    const cels = colunas
      .map((c) => {
        const s = g.chave ? selPorChave.get(chaveSelecaoGerador(conjunto.id, g.chave, c.tipo)) : undefined
        const existe = g.rows.some((r) => r.tipo === c.tipo)
        return { c, existe, temSelecao: !!s, temAuto: !!autoDe(g, c), s }
      })
      .filter((x) => x.existe || x.s)
    const temCls = new Set<string>()
    for (const x of cels) if ((x.temSelecao || x.temAuto) && x.c.classificacaoSlug) temCls.add(x.c.classificacaoSlug)
    return { g, situacao: situacaoDaLinha(cels), temCls }
  })
  const resumo = {
    aulas: pre.length,
    semConteudo: pre.filter((x) => x.situacao === 'sem_conteudo').length,
    automatico: pre.filter((x) => x.situacao === 'automatico').length,
    selecionado: pre.filter((x) => x.situacao === 'selecionado').length,
  }

  // filtros + ordenação + paginação (em memória: o conjunto tem dezenas de aulas; a leitura pesada é só a da página)
  const t = norm(p.q)
  let lista = pre.filter((x) => {
    if (p.tipo && !x.g.rows.some((r) => r.tipo === p.tipo)) return false
    if (p.cls && !x.temCls.has(p.cls)) return false
    if (p.sit && x.situacao !== p.sit) return false
    if (!t) return true
    const texto = `${x.g.chave} ${x.g.rows.map((r) => `${r.titulo_aula ?? ''} ${r.conteudo ?? ''} ${nomeTipo.get(r.tipo) ?? r.tipo}`).join(' ')}`
    return norm(texto).includes(t)
  })
  const ordSit = (s: SituacaoLinhaMatriz) => SITUACOES_MATRIZ.indexOf(s)
  lista = [...lista].sort((a, b) => {
    const c = p.sort === 'situacao' ? ordSit(a.situacao) - ordSit(b.situacao) : 0
    const base = c || a.g.num - b.g.num || col.compare(a.g.chave, b.g.chave)
    return p.dir === 'desc' ? -base : base
  })
  const total = lista.length
  const pp = p.pp
  const page = Math.min(Math.max(1, p.page), Math.max(1, Math.ceil(total / pp)))
  const pagina = lista.slice((page - 1) * pp, page * pp)

  // ── enriquecimento da PÁGINA ──
  const selDaPagina = pagina.flatMap((x) => colunas.map((c) => (x.g.chave ? selPorChave.get(chaveSelecaoGerador(conjunto.id, x.g.chave, c.tipo)) : undefined)).filter(Boolean) as SelRow[])
  const autoPorCelula = new Map<string, string | null>()
  for (const x of pagina) for (const c of colunas) autoPorCelula.set(`${x.g.chave}|${c.tipo}`, autoDe(x.g, c))
  const docIds = [...new Set([...selDaPagina.map((s) => s.documento_id), ...[...autoPorCelula.values()].filter(Boolean) as string[]])]
  const parteIds = [...new Set(selDaPagina.map((s) => s.parte_id).filter(Boolean) as string[])]

  const [docsInfo, partes] = await Promise.all([
    fetchAllByIn<{ id: string; titulo: string; pasta_id: string | null; versao_atual_id: string | null; status: string | null; deletado: boolean | null }>(docIds, (chunk) =>
      svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id, status, deletado').eq('tenant_id', tenantId).in('id', chunk).order('id') as never, { concorrencia: 4 }).catch(() => []),
    parteIds.length
      ? fetchAllByIn<{ id: string; nome: string }>(parteIds, (chunk) =>
        svc.from('simulado_conteudo_partes').select('id, nome').eq('tenant_id', tenantId).in('id', chunk).order('id') as never).catch(() => [])
      : Promise.resolve([] as { id: string; nome: string }[]),
  ])
  const infoDoc = new Map(docsInfo.map((d) => [d.id, d] as const))
  const pastaIds = [...new Set(docsInfo.map((d) => d.pasta_id).filter(Boolean) as string[])]
  const pastas = pastaIds.length
    ? await fetchAllByIn<{ id: string; nome: string }>(pastaIds, (chunk) => svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tenantId).in('id', chunk).order('id') as never).catch(() => [])
    : []
  const nomePasta = new Map(pastas.map((x) => [x.id, x.nome] as const))
  const nomeParte = new Map(partes.map((x) => [x.id, x.nome] as const))
  const pags = await paginasEfetivasDocs(svc, tenantId, docsInfo.map((d): DocParaPaginas => ({ id: d.id, pasta_id: d.pasta_id, versao_atual_id: d.versao_atual_id }))).catch(() => new Map())
  const slugDaClass = new Map(catalogo.map((c) => [c.id, c.slug] as const))

  // links por aula (linha da seção "links")
  const plataformas = await fetchAll<PlataformaLinkMatriz & { ativo: boolean | null }>(() =>
    svc.from('simulado_cronograma_plataformas').select('id, nome, slug, ativo').eq('tenant_id', tenantId).order('ordem').order('nome').order('id') as never).catch(() => [])
  const plataformasLinks = plataformas.filter((x) => x.ativo !== false && !SLUGS_FIXOS_URL.has(x.slug)).map(({ id, nome, slug }) => ({ id, nome, slug }))
  const idLinkPlat = new Set(plataformasLinks.map((x) => x.id))
  const aulaLinkIds = pagina.map((x) => x.g.rows.find((r) => r.tipo === tipoLinks?.tipo)?.id).filter(Boolean) as string[]
  const urls = aulaLinkIds.length
    ? await fetchAllByIn<{ aula_id: string; plataforma_id: string; url: string }>(aulaLinkIds, (chunk) =>
      svc.from('simulado_cronograma_conjunto_aula_urls').select('aula_id, plataforma_id, url').eq('tenant_id', tenantId).in('aula_id', chunk).order('id') as never).catch(() => [])
    : []

  const linhas: LinhaMatriz[] = pagina.map((x) => {
    const g = x.g
    const celulas: Record<string, CelulaDocumento> = {}
    for (const c of colunas) {
      const secao = g.rows.find((r) => r.tipo === c.tipo)
      const s = g.chave ? selPorChave.get(chaveSelecaoGerador(conjunto.id, g.chave, c.tipo)) : undefined
      let selecao: SelecaoCelula | null = null
      if (s) {
        const d = infoDoc.get(s.documento_id)
        selecao = {
          documentoId: s.documento_id,
          titulo: d?.titulo ?? 'Documento indisponível',
          pasta: d?.pasta_id ? nomePasta.get(d.pasta_id) ?? null : null,
          parteId: s.parte_id,
          parteNome: s.parte_id ? nomeParte.get(s.parte_id) ?? null : null,
          classificacaoSlug: (s.classificacao_id ? slugDaClass.get(s.classificacao_id) : null) ?? docBib.get(s.documento_id)?.tipo ?? c.classificacaoSlug,
          rotuloAluno: s.rotulo_aluno,
          visivelAluno: s.visivel_aluno !== false,
          regrasOverride: (s.regras_override && typeof s.regras_override === 'object' ? s.regras_override : {}) as Record<string, unknown>,
          indisponivel: !d || d.deletado === true || d.status !== 'publicado',
        }
      }
      const autoId = autoPorCelula.get(`${g.chave}|${c.tipo}`) ?? null
      const auto = autoId ? { documentoId: autoId, titulo: docBib.get(autoId)?.titulo ?? infoDoc.get(autoId)?.titulo ?? 'Documento' } : null
      // regra de uso EFETIVA (meta > área×classificação > padrão) + minutos calculados aqui
      let regra: CelulaDocumento['regra'] = null
      const docRef = selecao && !selecao.indisponivel && selecao.visivelAluno ? selecao.documentoId : autoId
      if (docRef && !ehTipoVideoaula(c.tipo)) { // videoaula não entra nas horas: sem regra de tempo/minutos
        const clsId = (s?.classificacao_id ?? c.classificacaoId) ?? null
        const rr = resolverRegras({ override: selecao?.regrasOverride, usoAreaClassificacao: clsId ? regrasUso.get(clsId)?.regras : undefined })
        const paginas = pags.get(docRef)?.efetivas ?? null
        regra = { minutos: calcularMinutos(rr.regras, { paginas }), modo: rr.regras.tempo.modo, origem: rr.origem['tempo.modo'], paginas }
      }
      celulas[c.tipo] = { tipo: c.tipo, existeSecao: !!secao, selecao, auto, regra }
    }
    const linkRow = g.rows.find((r) => r.tipo === tipoLinks?.tipo)
    return {
      chave: g.chave,
      aula: g.rows[0]?.aula ?? '',
      titulo: g.rows.find((r) => r.titulo_aula?.trim())?.titulo_aula?.trim() ?? '',
      conteudos: g.rows.map((r) => r.conteudo?.trim()).filter(Boolean) as string[],
      celulas,
      links: { aulaId: linkRow?.id ?? null, itens: urls.filter((u) => u.aula_id === linkRow?.id && idLinkPlat.has(u.plataforma_id)).map((u) => ({ plataformaId: u.plataforma_id, url: u.url })) },
      situacao: x.situacao,
    }
  })

  return {
    conjunto, colunas, tipoLinks, plataformas: plataformasLinks, linhas, total, chavesFiltradas: lista.slice(0, 300).map((x) => x.g.chave), page, pp, resumo, semTabelaSelecao,
    tiposFiltro: tipos.filter((tp) => aulas.some((a) => a.tipo === tp.slug)).map((tp) => ({ tipo: tp.slug, nome: tp.nome })),
    classificacoesFiltro: [...new Map(colunas.filter((c) => c.classificacaoSlug).map((c) => [c.classificacaoSlug!, { slug: c.classificacaoSlug!, nome: catalogo.find((k) => k.slug === c.classificacaoSlug)?.nome ?? c.nome }])).values()],
  }
}

// ───────────────────────── seletor de documento / partes ─────────────────────────

export interface ParamsSeletor {
  tipo: string
  aula: string
  q: string
  /** 'conjunto' = só a disciplina do conjunto; 'todas' = qualquer disciplina da Biblioteca. */
  disciplina: 'conjunto' | 'todas'
  /** 'coluna' = só a classificação da coluna; 'todas'. */
  classificacao: 'coluna' | 'todas'
  page: number
  pp: number
}

/** Seletor da coluna Videoaula: documentos de VÍDEO da Biblioteca (tipo_origem='video'; categoria conteudo/jurisclub), paginado no servidor. */
async function listarVideosSeletor(svc: SupabaseClient, tenantId: string, p: ParamsSeletor): Promise<DocsSeletorResposta> {
  const pp = Math.min(Math.max(1, p.pp), 100)
  const q = (p.q ?? '').replace(/[,()%*\_]/g, ' ').trim().slice(0, 80)
  let qb = svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).eq('tipo_origem', TIPO_ORIGEM_VIDEOAULA).in('categoria', [...CATEGORIAS_VIDEOAULA])
  if (q) qb = qb.ilike('titulo', `%${q}%`)
  const page0 = Math.max(1, p.page)
  const { data, count, error } = await qb.order('titulo', { ascending: true }).order('id', { ascending: true }).range((page0 - 1) * pp, page0 * pp - 1)
  if (error) throw error
  const rows = (data ?? []) as { id: string; titulo: string; pasta_id: string | null }[]
  const pids = [...new Set(rows.map((r) => r.pasta_id).filter(Boolean) as string[])]
  const pastas = pids.length ? await fetchAllByIn<{ id: string; nome: string }>(pids, (chunk) => svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tenantId).in('id', chunk).order('id') as never).catch(() => []) : []
  const nomePasta = new Map(pastas.map((x) => [x.id, x.nome] as const))
  const docs: DocSeletor[] = rows.map((r) => ({ id: r.id, titulo: r.titulo, disciplina: '', classificacaoSlug: 'videoaula', sugerido: false, pasta: r.pasta_id ? nomePasta.get(r.pasta_id) ?? null : null }))
  return { docs, total: count ?? docs.length, page: page0, pp, sugestao: null }
}

export async function listarDocsSeletor(svc: SupabaseClient, tenantId: string, conjunto: ConjuntoMin, p: ParamsSeletor): Promise<DocsSeletorResposta> {
  if (ehTipoVideoaula(p.tipo)) return listarVideosSeletor(svc, tenantId, p)
  const [docs, catalogo] = await Promise.all([
    docsBibliotecaCache(svc, tenantId).catch(() => [] as DocBiblioteca[]),
    carregarCatalogoClassificacao(svc, tenantId).catch(() => [] as ClassificacaoCatalogo[]),
  ])
  const slugs = new Set(catalogo.filter((c) => c.ativo).map((c) => c.slug))
  const clsColuna = classificacaoSlugDoTipo(p.tipo, slugs)
  const indice = indexarBiblioteca(docs)
  const aulaChave = chaveAulaGerador(p.aula)
  const secao = (await lerAulasConjunto(svc, tenantId, conjunto.id)).find((r) => r.tipo === p.tipo && chaveAulaGerador(r.aula) === aulaChave)
  const sug = resolverDocumentoMeta({ id: 'x', tipo: p.tipo, disciplinas: [conjunto.disciplina], aula: p.aula || null, conteudo: secao?.conteudo ?? null }, indice, null)
  const chaveConj = chaveDisc(conjunto.disciplina)
  const t = norm(p.q)
  let lista = docs.filter((d) => {
    if (p.disciplina === 'conjunto' && chaveDisc(d.disc) !== chaveConj) return false
    if (p.classificacao === 'coluna' && clsColuna && d.tipo !== clsColuna) return false
    return !t || norm(`${d.titulo} ${d.disc}`).includes(t)
  })
  lista = [...lista].sort((a, b) => (a.id === sug?.docId ? -1 : b.id === sug?.docId ? 1 : 0) || col.compare(a.titulo, b.titulo))
  const total = lista.length
  const page = Math.min(Math.max(1, p.page), Math.max(1, Math.ceil(total / p.pp)))
  const fatia = lista.slice((page - 1) * p.pp, page * p.pp)
  const meta = await fetchAllByIn<{ id: string; pasta_id: string | null }>(fatia.map((d) => d.id), (chunk) =>
    svc.from('simulado_conteudo_documentos').select('id, pasta_id').eq('tenant_id', tenantId).in('id', chunk).order('id') as never).catch(() => [])
  const pastaDoc = new Map(meta.map((m) => [m.id, m.pasta_id] as const))
  const pids = [...new Set(meta.map((m) => m.pasta_id).filter(Boolean) as string[])]
  const pastas = pids.length ? await fetchAllByIn<{ id: string; nome: string }>(pids, (chunk) => svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tenantId).in('id', chunk).order('id') as never).catch(() => []) : []
  const nomePasta = new Map(pastas.map((x) => [x.id, x.nome] as const))
  const out: DocSeletor[] = fatia.map((d) => ({
    id: d.id, titulo: d.titulo, disciplina: d.disc, classificacaoSlug: d.tipo, sugerido: d.id === sug?.docId,
    pasta: pastaDoc.get(d.id) ? nomePasta.get(pastaDoc.get(d.id)!) ?? null : null,
  }))
  const sd = sug ? docs.find((d) => d.id === sug.docId) : null
  return { docs: out, total, page, pp: p.pp, sugestao: sug ? { documentoId: sug.docId, titulo: sd?.titulo ?? 'Documento' } : null }
}

export async function listarPartesSeletor(tenantId: string, documentoId: string): Promise<{ ok: true; partes: ParteSeletor[] } | { ok: false; error: string }> {
  const r = await listarPartes(tenantId, documentoId, { comStatus: false })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, partes: r.partes.map((x) => ({ id: x.id, nome: x.nome, rotuloIni: x.rotulo_ini, rotuloFim: x.rotulo_fim, metasEmUso: x.metasEmUso })) }
}

// ───────────────────────── gravação ─────────────────────────

export type ResultadoGravacao = { ok: true; afetadas: number; ignoradas?: number } | { ok: false; status: number; error: string }

export interface EntradaSelecao {
  aula: string
  tipo: string
  documentoId: string
  parteId?: string | null
  rotuloAluno?: string | null
  visivelAluno?: boolean
  regrasOverride?: unknown
}

export async function invalidarMatriz(tenantId: string): Promise<void> {
  await Promise.all([esquecerSelecoesGerador(tenantId), invalidarCachesPaginas(tenantId), esquecerClassificacao(tenantId)].map((p) => p.catch(() => {})))
}

const erroEscrita = (e: unknown): ResultadoGravacao => {
  const er = (e ?? {}) as Erro
  if (selecaoTabelaAusente(er)) return { ok: false, status: 503, error: MSG_MIGRACAO_SELECAO }
  return { ok: false, status: 500, error: er.message || 'Falha ao gravar.' }
}

interface CtxEscrita { svc: SupabaseClient; tenantId: string; atorId: string | null; conjunto: ConjuntoMin }

async function colunasDoTenant(svc: SupabaseClient, tenantId: string) {
  const [tipos, catalogo] = await Promise.all([listarTiposMeta(tenantId), carregarCatalogoClassificacao(svc, tenantId).catch(() => [] as ClassificacaoCatalogo[])])
  return montarColunas(tipos, catalogo)
}

/** Seleciona (documento + parte + rótulo + visibilidade + override) para N células. Valida tudo no servidor. */
export async function gravarSelecoes(c: CtxEscrita, itens: EntradaSelecao[]): Promise<ResultadoGravacao> {
  if (!itens.length) return { ok: true, afetadas: 0 }
  const [{ colunas }, aulas] = await Promise.all([colunasDoTenant(c.svc, c.tenantId), lerAulasConjunto(c.svc, c.tenantId, c.conjunto.id)])
  const colPorTipo = new Map(colunas.map((x) => [x.tipo, x] as const))
  const aulasValidas = new Set(aulas.map((a) => chaveAulaGerador(a.aula)).filter(Boolean))
  const docIds = [...new Set(itens.map((i) => i.documentoId))]
  const docs = await fetchAllByIn<{ id: string; titulo: string; pasta_id: string | null }>(docIds, (chunk) =>
    c.svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id').eq('tenant_id', c.tenantId).eq('deletado', false).in('id', chunk).order('id') as never)
  const docPorId = new Map(docs.map((d) => [d.id, d] as const))
  const idsVideoaula = [...new Set(itens.filter((i) => ehTipoVideoaula(i.tipo)).map((i) => i.documentoId))]
  const videosOk = new Set<string>()
  if (idsVideoaula.length) {
    const vs = await fetchAllByIn<{ id: string; tipo_origem: string | null; categoria: string | null }>(idsVideoaula, (chunk) =>
      c.svc.from('simulado_conteudo_documentos').select('id, tipo_origem, categoria').eq('tenant_id', c.tenantId).eq('deletado', false).in('id', chunk).order('id') as never)
    for (const v of vs) if (v.tipo_origem === TIPO_ORIGEM_VIDEOAULA && CATEGORIAS_VIDEOAULA.includes(String(v.categoria ?? 'conteudo'))) videosOk.add(v.id)
  }
  const parteIds = [...new Set(itens.map((i) => i.parteId).filter(Boolean) as string[])]
  const partes = parteIds.length
    ? await fetchAllByIn<{ id: string; documento_id: string; arquivada: boolean }>(parteIds, (chunk) =>
      c.svc.from('simulado_conteudo_partes').select('id, documento_id, arquivada').eq('tenant_id', c.tenantId).in('id', chunk).order('id') as never)
    : []
  const parteOk = new Map(partes.map((x) => [x.id, x] as const))

  const chaves = itens.map((i) => chaveSelecaoGerador(c.conjunto.id, i.aula, i.tipo))
  const antes = await lerSelecoesPorChave(c, chaves)
  const linhas: Record<string, unknown>[] = []
  for (const i of itens) {
    const col = colPorTipo.get(i.tipo)
    const chave = chaveSelecaoGerador(c.conjunto.id, i.aula, i.tipo)
    const d = docPorId.get(i.documentoId)
    if (!col) return { ok: false, status: 400, error: `Seção "${i.tipo}" não aceita documento da Biblioteca.` }
    if (!chaveAulaGerador(i.aula) || !aulasValidas.has(chaveAulaGerador(i.aula))) return { ok: false, status: 400, error: `Aula "${i.aula}" não existe neste conjunto.` }
    if (!d) return { ok: false, status: 400, error: 'Documento não encontrado neste tenant.' }
    if (ehTipoVideoaula(i.tipo)) {
      if (i.parteId) return { ok: false, status: 400, error: 'Videoaula não tem parte: escolha o documento de vídeo inteiro.' }
      if (!videosOk.has(d.id)) return { ok: false, status: 400, error: 'Escolha um documento de vídeo da Biblioteca (tipo vídeo, categoria Conteúdo ou JurisClub).' }
    }
    if (i.parteId) {
      const pr = parteOk.get(i.parteId)
      if (!pr || pr.documento_id !== i.documentoId || pr.arquivada) return { ok: false, status: 400, error: 'A parte não pertence ao documento escolhido (ou está arquivada).' }
    }
    const anterior = antes.get(chave)
    const override = i.regrasOverride === undefined ? (anterior?.regras_override ?? {}) : lerRegrasParciais(i.regrasOverride)
    linhas.push({
      tenant_id: c.tenantId, area: AREA_GERADOR, meta_chave: chave,
      documento_id: d.id, parte_id: i.parteId ?? null, classificacao_id: col.classificacaoId,
      rotulo_aluno: i.rotuloAluno === undefined ? (anterior?.rotulo_aluno ?? null) : (i.rotuloAluno?.trim() || null),
      visivel_aluno: i.visivelAluno === undefined ? (anterior?.visivel_aluno ?? true) : i.visivelAluno,
      regras_override: override,
      doc_titulo: d.titulo, doc_titulo_norm: norm(d.titulo), doc_pasta_id: d.pasta_id,
      criado_por: c.atorId,
    })
  }
  const { error } = await c.svc.from(T_SELECAO).upsert(linhas, { onConflict: 'tenant_id,area,meta_chave' })
  if (error) return erroEscrita(error)
  await Promise.all(linhas.map((l) => registrarAudit({
    operacao: antes.has(l.meta_chave as string) ? 'UPDATE' : 'INSERT', entidade: T_SELECAO, entidadeId: l.meta_chave as string, tenantId: c.tenantId, atorId: c.atorId,
    antes: (antes.get(l.meta_chave as string) ?? null) as never,
    depois: { area: AREA_GERADOR, documento_id: l.documento_id, parte_id: l.parte_id, visivel_aluno: l.visivel_aluno, rotulo_aluno: l.rotulo_aluno } as never,
  }).catch(() => {})))
  await invalidarMatriz(c.tenantId)
  return { ok: true, afetadas: linhas.length }
}

async function lerSelecoesPorChave(c: CtxEscrita, chaves: string[]): Promise<Map<string, SelRow>> {
  const out = new Map<string, SelRow>()
  if (!chaves.length) return out
  try {
    const rows = await fetchAllByIn<SelRow>([...new Set(chaves)], (chunk) =>
      c.svc.from(T_SELECAO).select('id, meta_chave, documento_id, parte_id, classificacao_id, rotulo_aluno, visivel_aluno, regras_override')
        .eq('tenant_id', c.tenantId).eq('area', AREA_GERADOR).in('meta_chave', chunk).order('id') as never)
    for (const r of rows) out.set(r.meta_chave, r)
  } catch { /* tabela ausente: o upsert devolve o erro certo */ }
  return out
}

/** Todas as chaves (aula × coluna) de um conjunto de aulas pedidas. */
async function celulasDeAulas(c: CtxEscrita, aulas: string[], tipos?: string[]): Promise<{ aula: string; tipo: string }[]> {
  const { colunas } = await colunasDoTenant(c.svc, c.tenantId)
  const validas = new Set((await lerAulasConjunto(c.svc, c.tenantId, c.conjunto.id)).map((a) => chaveAulaGerador(a.aula)).filter(Boolean))
  const alvoTipos = colunas.map((x) => x.tipo).filter((t) => !tipos?.length || tipos.includes(t))
  const out: { aula: string; tipo: string }[] = []
  for (const a of [...new Set(aulas.map(chaveAulaGerador))]) if (a && validas.has(a)) for (const t of alvoTipos) out.push({ aula: a, tipo: t })
  return out
}

/** Remove o vínculo (a célula volta a usar o resolvedor atual). */
export async function limparSelecoes(c: CtxEscrita, aulas: string[], tipos?: string[]): Promise<ResultadoGravacao> {
  const cels = await celulasDeAulas(c, aulas, tipos)
  const chaves = cels.map((x) => chaveSelecaoGerador(c.conjunto.id, x.aula, x.tipo))
  const antes = await lerSelecoesPorChave(c, chaves)
  if (!antes.size) return { ok: true, afetadas: 0 }
  const ids = [...antes.values()].map((s) => s.id)
  for (let i = 0; i < ids.length; i += 80) {
    const { error } = await c.svc.from(T_SELECAO).delete().eq('tenant_id', c.tenantId).eq('area', AREA_GERADOR).in('id', ids.slice(i, i + 80))
    if (error) return erroEscrita(error)
  }
  await Promise.all([...antes.values()].map((s) => registrarAudit({
    operacao: 'DELETE', entidade: T_SELECAO, entidadeId: s.meta_chave, tenantId: c.tenantId, atorId: c.atorId, antes: { documento_id: s.documento_id, parte_id: s.parte_id } as never, depois: null,
  }).catch(() => {})))
  await invalidarMatriz(c.tenantId)
  return { ok: true, afetadas: ids.length }
}

/** Marca visível/oculto ao aluno nas seleções existentes (células sem seleção são ignoradas). */
export async function definirVisibilidade(c: CtxEscrita, aulas: string[], visivel: boolean, tipos?: string[]): Promise<ResultadoGravacao> {
  const cels = await celulasDeAulas(c, aulas, tipos)
  const antes = await lerSelecoesPorChave(c, cels.map((x) => chaveSelecaoGerador(c.conjunto.id, x.aula, x.tipo)))
  const alvo = [...antes.values()].filter((s) => (s.visivel_aluno !== false) !== visivel)
  for (let i = 0; i < alvo.length; i += 80) {
    const { error } = await c.svc.from(T_SELECAO).update({ visivel_aluno: visivel }).eq('tenant_id', c.tenantId).eq('area', AREA_GERADOR).in('id', alvo.slice(i, i + 80).map((s) => s.id))
    if (error) return erroEscrita(error)
  }
  await Promise.all(alvo.map((s) => registrarAudit({
    operacao: 'UPDATE', entidade: T_SELECAO, entidadeId: s.meta_chave, tenantId: c.tenantId, atorId: c.atorId, antes: { visivel_aluno: !visivel } as never, depois: { visivel_aluno: visivel } as never,
  }).catch(() => {})))
  if (alvo.length) await invalidarMatriz(c.tenantId)
  return { ok: true, afetadas: alvo.length, ignoradas: cels.length - alvo.length }
}

/** Vincula pela SUGESTÃO automática (o mesmo resolvedor do Gerador) as células ainda sem seleção. */
export async function vincularPelaSugestao(c: CtxEscrita, aulas: string[], tipos?: string[]): Promise<ResultadoGravacao> {
  const [cels, docsBib] = await Promise.all([celulasDeAulas(c, aulas, tipos), docsBibliotecaCache(c.svc, c.tenantId).catch(() => [] as DocBiblioteca[])])
  const aulasRows = await lerAulasConjunto(c.svc, c.tenantId, c.conjunto.id)
  const antes = await lerSelecoesPorChave(c, cels.map((x) => chaveSelecaoGerador(c.conjunto.id, x.aula, x.tipo)))
  const indice = indexarBiblioteca(docsBib)
  const itens: EntradaSelecao[] = []
  for (const x of cels) {
    if (antes.has(chaveSelecaoGerador(c.conjunto.id, x.aula, x.tipo))) continue
    if (ehTipoVideoaula(x.tipo)) continue // sem sugestão automática para videoaula
    const secao = aulasRows.find((r) => chaveAulaGerador(r.aula) === x.aula && r.tipo === x.tipo)
    const r = resolverDocumentoMeta({ id: 'x', tipo: x.tipo, disciplinas: [c.conjunto.disciplina], aula: x.aula, conteudo: secao?.conteudo ?? null }, indice, null)
    if (r) itens.push({ aula: x.aula, tipo: x.tipo, documentoId: r.docId })
  }
  const r = await gravarSelecoes(c, itens)
  return r.ok ? { ...r, ignoradas: cels.length - itens.length } : r
}

// ───────────────────────── links de questões ─────────────────────────

/** Regrava os links (por plataforma) da seção de links da aula; PDF/Vídeo não são tocados. url vazia = remove. */
export async function gravarLinks(
  c: CtxEscrita, aulaId: string, itens: { plataformaId: string; url: string }[],
): Promise<ResultadoGravacao> {
  const { data: aula } = await c.svc.from('simulado_cronograma_conjunto_aulas').select('id').eq('id', aulaId).eq('tenant_id', c.tenantId).eq('conjunto_id', c.conjunto.id).maybeSingle()
  if (!aula) return { ok: false, status: 404, error: 'Aula não encontrada neste conjunto.' }
  const plats = await fetchAll<{ id: string; slug: string }>(() => c.svc.from('simulado_cronograma_plataformas').select('id, slug').eq('tenant_id', c.tenantId).order('id') as never)
  const validas = new Map(plats.filter((p) => !SLUGS_FIXOS_URL.has(p.slug)).map((p) => [p.id, p.slug] as const))
  const mapa = new Map<string, string>()
  for (const i of itens) {
    if (!validas.has(i.plataformaId)) return { ok: false, status: 400, error: 'Plataforma inválida para links de questões.' }
    const u = i.url.trim()
    if (u && !/^https?:\/\//i.test(u)) return { ok: false, status: 400, error: 'Use um link completo (http:// ou https://).' }
    mapa.set(i.plataformaId, u)
  }
  const ids = [...mapa.keys()]
  if (!ids.length) return { ok: true, afetadas: 0 }
  const { error: e1 } = await c.svc.from('simulado_cronograma_conjunto_aula_urls').delete().eq('tenant_id', c.tenantId).eq('aula_id', aulaId).in('plataforma_id', ids)
  if (e1) return { ok: false, status: 500, error: e1.message }
  const novas = [...mapa.entries()].filter(([, u]) => u).map(([plataforma_id, url]) => ({ tenant_id: c.tenantId, aula_id: aulaId, plataforma_id, url }))
  if (novas.length) {
    const { error: e2 } = await c.svc.from('simulado_cronograma_conjunto_aula_urls').insert(novas)
    if (e2) return { ok: false, status: 500, error: e2.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cronograma_conjunto_aula_urls', entidadeId: aulaId, tenantId: c.tenantId, atorId: c.atorId, depois: { links: novas.length, removidos: ids.length - novas.length } as never }).catch(() => {})
  await invalidarMatriz(c.tenantId)
  return { ok: true, afetadas: ids.length }
}
