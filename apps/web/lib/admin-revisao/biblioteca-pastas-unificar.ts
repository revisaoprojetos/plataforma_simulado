import 'server-only'
import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sqlQuery } from '@/lib/data/sql'
import { registrarAudit } from '@/lib/audit'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { unificarDisciplinas, desfazerUnificacao } from '@/app/admin/questoes/disciplinas-actions'
import { arvoreBiblioteca, limparCacheGestao } from './biblioteca-gestao'
import { emTransacao, ErroNegocio, falha, resumosTodosTipos } from './questoes-termos'
import { plano } from './texto-plano'
import { deteccaoCache, invalidarDeteccao } from './cache-deteccao'
import { createAdminClient } from '@/lib/supabase/server'
import { chaveDoGrupo, detectarGrupos, qualidadeEscrita, tidy, type GrupoBruto } from './questoes-termos-deteccao'
import type { ConfTermo, VarianteTermo } from './questoes-termos-tipos'
import {
  TIPO_PU, type CategoriaPU, type FusaoPU, type InicialDisciplinas, type GrupoPasta, type HistoricoPU, type PreviaPU, type RespostaGruposPU, type RespostaPastasPU, type VariantePasta,
} from './biblioteca-pastas-unificar-tipos'

// BIBLIOTECA › UNIFICAR DISCIPLINAS (somente servidor).
// Modelo: "disciplina" na Biblioteca de conteúdos = PASTA RAIZ da árvore (simulado_pastas, folder_area 'conteudo' | 'conteudo_jurisclub'), em geral marcada com
// disciplina_id (taxonomia compartilhada simulado_disciplinas). Dentro dela: SUBPASTAS por tipo de material (cronograma_tipo_material: pdfull/pdflash/pdfight/legproc…)
// e os documentos (simulado_conteudo_documentos.pasta_id). Unificar = levar documentos e subpastas das pastas-variante para a canônica, FUNDINDO subpastas homônimas,
// e arquivar (soft-delete) as variantes. Roda em UMA transação SQL (pool do Unificar de termos), guarda o estado anterior em simulado_termos_mesclagens
// (tipo 'pasta_disciplina') para DESFAZER e audita. Opcional: unificar também a disciplina da taxonomia (RPC existente `unificarDisciplinas`).
// Isolamento: o pool ignora RLS → TODA instrução filtra tenant_id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL = 2 * 60_000
const AREA: Record<CategoriaPU, string> = { conteudo: 'conteudo', jurisclub: 'conteudo_jurisclub' }
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)
const ptbr = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
const pedacos = <T,>(a: T[], n = 500) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const RANK: Record<ConfTermo, number> = { alta: 0, media: 1, baixa: 2 }

export function limparCachePU(tenantId: string) {
  invalidarDeteccao(`pastas:${tenantId}`)
  limparCacheGestao(tenantId)
}

// ───────────────────────── candidatos (pastas-disciplina) ─────────────────────────
async function candidatos(svc: SupabaseClient, tenantId: string, cat: CategoriaPU, fresh: boolean): Promise<{ itens: VariantePasta[]; degradado: boolean }> {
  const arv = await arvoreBiblioteca(svc, tenantId, cat === 'jurisclub' ? 'jurisclub' : 'pdfull', fresh)
  const porId = new Map(arv.nos.map((n) => [n.id, n]))
  const filhos = new Map<string, typeof arv.nos>()
  for (const n of arv.nos) if (n.paiId) (filhos.get(n.paiId) ?? filhos.set(n.paiId, []).get(n.paiId)!).push(n)
  // pasta-disciplina = raiz da árvore OU pasta marcada com disciplina_id; subpastas tipadas (PDFull…) nunca são candidatas
  const cands = arv.nos.filter((n) => (n.paiId === null || !!n.disciplinaId) && !n.tipoMaterial)
  const discIds = [...new Set(cands.map((c) => c.disciplinaId).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (discIds.length) {
    try {
      const ds = (await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }))) ?? []
      for (const d of ds) nomes.set(d.id, d.nome)
    } catch { /* best-effort */ }
  }
  const itens: VariantePasta[] = cands.map((n) => {
    const kids = filhos.get(n.id) ?? []
    return {
      id: n.id, nome: n.nome, questoes: n.total, docs: n.total, proprios: n.proprios, subpastas: kids.length,
      tipos: [...new Set(kids.map((k) => k.tipoMaterial).filter(Boolean))] as string[],
      paiId: n.paiId, paiNome: n.paiId ? porId.get(n.paiId)?.nome ?? null : null,
      disciplinaId: n.disciplinaId, disciplinaNome: n.disciplinaId ? nomes.get(n.disciplinaId) ?? null : null, restrito: n.restrito,
    }
  })
  return { itens, degradado: false }
}

/** Une grupos que compartilham a MESMA disciplina da taxonomia (disciplina_id) — duas pastas apontando p/ a mesma disciplina são sempre candidatas. */
function agrupar(itens: VariantePasta[], brutos: GrupoBruto[]): { variantes: VariantePasta[]; confianca: ConfTermo; score: number; motivo: string }[] {
  const pai = new Map<string, string>(); for (const i of itens) pai.set(i.id, i.id)
  const find = (x: string): string => { let r = x; while (pai.get(r) !== r) { pai.set(r, pai.get(pai.get(r)!)!); r = pai.get(r)! } return r }
  const uniao = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) pai.set(ra, rb) }
  for (const g of brutos) for (let i = 1; i < g.variantes.length; i++) uniao(g.variantes[0].id, g.variantes[i].id)
  const porDisc = new Map<string, VariantePasta[]>()
  for (const i of itens) if (i.disciplinaId) (porDisc.get(i.disciplinaId) ?? porDisc.set(i.disciplinaId, []).get(i.disciplinaId)!).push(i)
  const viaDisc = new Set<string>()
  for (const l of porDisc.values()) for (let i = 1; i < l.length; i++) { uniao(l[0].id, l[i].id); viaDisc.add(l[0].id); viaDisc.add(l[i].id) }
  const comp = new Map<string, VariantePasta[]>(); for (const i of itens) (comp.get(find(i.id)) ?? comp.set(find(i.id), []).get(find(i.id))!).push(i)
  const out: { variantes: VariantePasta[]; confianca: ConfTermo; score: number; motivo: string }[] = []
  for (const vs of comp.values()) {
    if (vs.length < 2) continue
    const ids = new Set(vs.map((v) => v.id))
    const origem = brutos.filter((g) => g.variantes.some((v) => ids.has(v.id)))
    let conf: ConfTermo = 'alta'; let score = 100; const motivos: string[] = []
    for (const g of origem) { if (RANK[g.confianca] > RANK[conf]) conf = g.confianca; score = Math.min(score, g.score); if (!motivos.includes(g.motivo)) motivos.push(g.motivo) }
    if (vs.some((v) => viaDisc.has(v.id))) motivos.unshift('Apontam para a MESMA disciplina da taxonomia')
    if (vs.length > 8) { conf = 'baixa'; motivos.push(`grupo grande: ${vs.length} pastas — revise uma a uma`) }
    const ord = [...vs].sort((a, b) => b.docs - a.docs || qualidadeEscrita(b.nome) - qualidadeEscrita(a.nome) || a.nome.length - b.nome.length || ptbr(a.nome, b.nome))
    out.push({ variantes: ord, confianca: conf, score, motivo: motivos.join(' · ') || 'Mesma disciplina' })
  }
  return out
}

type BasePU = { grupos: GrupoPasta[]; itens: VariantePasta[]; degradado: boolean }
async function todosOsGrupos(svc: SupabaseClient, tenantId: string, cat: CategoriaPU, limiar: number, fresh: boolean): Promise<BasePU> {
  // single-flight + stale-while-revalidate (cache-deteccao): UMA computação por (tenant, categoria, limiar) mesmo com chamadas simultâneas
  return deteccaoCache<BasePU>(`pastas:${tenantId}|${cat}|${limiar}`, async () => {
    const { itens, degradado } = await candidatos(svc, tenantId, cat, fresh)
    const brutos = detectarGrupos(itens as VarianteTermo[], { tipo: 'disciplina', limiar, escopo: (v) => v.paiId ?? '' })
    const grupos: GrupoPasta[] = agrupar(itens, brutos).map((g) => ({
      id: hash(`${cat}|${chaveDoGrupo('disciplina', g.variantes)}`), categoria: cat, confianca: g.confianca, score: g.score, motivo: g.motivo, variantes: g.variantes,
      canonicaId: g.variantes[0].id, nomeSugerido: tidy(g.variantes[0].nome), docs: g.variantes.reduce((s, x) => s + x.docs, 0),
    })).sort((a, b) => RANK[a.confianca] - RANK[b.confianca] || b.docs - a.docs || ptbr(a.variantes[0].nome, b.variantes[0].nome))
    return { grupos, itens, degradado }
  }, { fresh })
}

async function ignorados(svc: SupabaseClient, tenantId: string, fresh: boolean): Promise<Set<string> | null> {
  return deteccaoCache<Set<string> | null>(`pastas:${tenantId}|ign`, async () => {
    const { data, error } = await svc.from('simulado_termos_ignorados').select('chave').eq('tenant_id', tenantId).eq('tipo', TIPO_PU).order('chave', { ascending: true }).range(0, 4999)
    return error ? null : new Set(((data ?? []) as any[]).map((x) => String(x.chave)))
  }, { ttl: 60_000, stale: 0, fresh })
}

export interface OpcPU { categoria: CategoriaPU; limiar?: number; confianca?: string; q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; pp?: number; verIgnorados?: boolean; ign?: string[]; fresh?: boolean }
export async function listarGruposPU(svc: SupabaseClient, tenantId: string, o: OpcPU): Promise<RespostaGruposPU> {
  const limiar = Math.min(0.98, Math.max(0.6, o.limiar ?? 0.85))
  const [base, ignBanco] = await Promise.all([todosOsGrupos(svc, tenantId, o.categoria, limiar, !!o.fresh), ignorados(svc, tenantId, !!o.fresh)])
  const ign = new Set<string>([...(ignBanco ?? []), ...(o.ign ?? [])])
  const porConfianca: Record<ConfTermo, number> = { alta: 0, media: 0, baixa: 0 }
  for (const g of base.grupos) if (!ign.has(g.id)) porConfianca[g.confianca]++
  const termo = plano(o.q ?? '')
  let l = base.grupos.filter((g) => (o.verIgnorados ? ign.has(g.id) : !ign.has(g.id)) && (!o.confianca || g.confianca === o.confianca) &&
    (!termo || g.variantes.some((v) => plano(v.nome).includes(termo) || plano(v.disciplinaNome ?? '').includes(termo))))
  const dir = o.dir === 'asc' ? 1 : -1
  const sort = o.sort ?? 'docs'
  l = [...l].sort((a, b) => {
    const c = sort === 'score' ? a.score - b.score : sort === 'variantes' ? a.variantes.length - b.variantes.length : sort === 'nome' ? ptbr(a.variantes[0].nome, b.variantes[0].nome) : a.docs - b.docs
    return (c * dir) || (a.id < b.id ? -1 : 1)
  })
  const pp = Math.min(100, Math.max(5, o.pp ?? 20)), page = Math.max(1, o.page ?? 1)
  const ativos = base.grupos.filter((g) => !ign.has(g.id))
  return {
    ok: true, categoria: o.categoria, grupos: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp, porConfianca, limiar,
    resumo: { pastas: base.itens.length, docs: base.itens.reduce((s, i) => s + i.proprios, 0), grupos: ativos.length, variantesEmGrupos: ativos.reduce((s, g) => s + g.variantes.length, 0), docsEmGrupos: ativos.reduce((s, g) => s + g.docs, 0) },
    ignorados: base.grupos.filter((g) => ign.has(g.id)).length, ignoradoPersistente: ignBanco !== null, geradoEm: Date.now(), degradado: base.degradado,
  }
}

/** SSR: 1ª página dos grupos de pastas repetidas (parâmetros padrão do cliente) + nº de grupos de disciplinas da taxonomia (aba "Disciplinas da taxonomia"). Uma carga só. */
export async function carregarInicialUnificarDisciplinas(tenantId: string, categoria: CategoriaPU = 'conteudo', comTaxonomia = true): Promise<InicialDisciplinas | null> {
  try {
    const svc = createAdminClient()
    const [grupos, nTax] = await Promise.all([
      listarGruposPU(svc, tenantId, { categoria, limiar: 0.85, sort: 'docs', dir: 'desc', page: 1, pp: 20, ign: [] }),
      comTaxonomia ? resumosTodosTipos(svc, tenantId, 0.85, {}, false).then((r) => r.resumos.find((x) => x.tipo === 'disciplina')?.grupos ?? null).catch(() => null) : Promise.resolve(null),
    ])
    return { categoria, grupos, nTax }
  } catch { return null }
}

/** Todas as pastas-disciplina (busca + página): alimenta "Escolher manualmente" quando a detecção não achou o par. */
export async function listarPastasPU(svc: SupabaseClient, tenantId: string, o: { categoria: CategoriaPU; q?: string; page?: number; pp?: number; fresh?: boolean }): Promise<RespostaPastasPU> {
  const { itens } = await candidatos(svc, tenantId, o.categoria, !!o.fresh)
  const termo = plano(o.q ?? '')
  const l = itens.filter((i) => !termo || plano(i.nome).includes(termo) || plano(i.disciplinaNome ?? '').includes(termo)).sort((a, b) => ptbr(a.nome, b.nome) || (a.id < b.id ? -1 : 1))
  const pp = Math.min(100, Math.max(5, o.pp ?? 30)), page = Math.max(1, o.page ?? 1)
  return { ok: true, itens: l.slice((page - 1) * pp, page * pp), total: l.length, page, pp }
}

// ───────────────────────── plano (PURO: o mesmo na prévia e na transação) ─────────────────────────
interface PastaRow { id: string; nome: string; paiId: string | null; tipo: string | null; disciplinaId: string | null; deletado: boolean; raw: any }
type Q = (sql: string, p: any[]) => Promise<any[] | null>
const CAMPOS_PREENCHER = ['cor', 'icone', 'cronograma_tipo_material'] as const
const CAMPOS_CAPA = ['capa_url', 'capa_card_url', 'capa_modo', 'capa_meta'] as const

async function lerPastas(q: Q, tenantId: string, cat: CategoriaPU): Promise<Map<string, PastaRow> | null> {
  const rows = await q('select to_jsonb(t) as r from public.simulado_pastas t where t.tenant_id = $1 and t.folder_area = $2 and t.is_folder = true', [tenantId, AREA[cat]])
  if (!rows) return null
  const m = new Map<string, PastaRow>()
  for (const x of rows) { const r = x.r; m.set(r.id, { id: r.id, nome: r.nome ?? '', paiId: r.pai_id ?? null, tipo: r.cronograma_tipo_material ?? null, disciplinaId: r.disciplina_id ?? null, deletado: !!r.deletado, raw: r }) }
  return m
}

interface Plano {
  docs: { de: string; para: string }[]
  fusoes: { origem: PastaRow; destino: PastaRow; motivo: 'tipo' | 'nome' }[]
  movidas: { pasta: PastaRow; paraPai: string; paraNome: string }[]
  arquivar: PastaRow[]
}
function ehDescendente(pastas: Map<string, PastaRow>, id: string, ancestral: string): boolean {
  let cur = pastas.get(id)?.paiId ?? null; let g = 0
  while (cur && g++ < 60) { if (cur === ancestral) return true; cur = pastas.get(cur)?.paiId ?? null }
  return false
}
/** Ids da pasta e de todas as subpastas ativas (descendentes). */
function subtreeIds(pastas: Map<string, PastaRow>, id: string): string[] {
  const out = [id]
  for (let i = 0; i < out.length && out.length < 5000; i++) for (const p of pastas.values()) if (p.paiId === out[i] && !p.deletado) out.push(p.id)
  return out
}
function montarPlano(pastas: Map<string, PastaRow>, canonId: string, dupIds: string[]): Plano {
  const kids = new Map<string, PastaRow[]>()
  for (const p of pastas.values()) if (p.paiId && !p.deletado) (kids.get(p.paiId) ?? kids.set(p.paiId, []).get(p.paiId)!).push(p)
  for (const l of kids.values()) l.sort((a, b) => (a.id < b.id ? -1 : 1))
  const pl: Plano = { docs: [], fusoes: [], movidas: [], arquivar: [] }
  const visto = new Set<string>()
  const proc = (src: PastaRow, dst: PastaRow, prof: number) => {
    if (prof > 30 || visto.has(src.id)) return
    visto.add(src.id)
    pl.docs.push({ de: src.id, para: dst.id }); pl.arquivar.push(src)
    for (const s of [...(kids.get(src.id) ?? [])]) {
      // casa por TIPO de material (iguais e não nulos) ou, se um deles não tem tipo, pelo NOME normalizado; tipos diferentes nunca se fundem
      const alvo = (kids.get(dst.id) ?? []).find((t) => t.id !== s.id && (s.tipo && t.tipo ? s.tipo === t.tipo : plano(t.nome) === plano(s.nome)))
      if (alvo) { pl.fusoes.push({ origem: s, destino: alvo, motivo: s.tipo && alvo.tipo ? 'tipo' : 'nome' }); proc(s, alvo, prof + 1) }
      else { pl.movidas.push({ pasta: s, paraPai: dst.id, paraNome: dst.nome }); (kids.get(dst.id) ?? kids.set(dst.id, []).get(dst.id)!).push(s) }
    }
  }
  const canon = pastas.get(canonId)!
  for (const d of dupIds) proc(pastas.get(d)!, canon, 0)
  return pl
}

// ───────────────────────── validação ─────────────────────────
interface Entrada { categoria: CategoriaPU; canonicaId: string; dupIds: string[]; nomeFinal: string; unificarTaxonomia: boolean; aceitarAcesso: boolean }
function validar(b: { categoria: unknown; canonicaId: unknown; dupIds: unknown; nomeFinal: unknown; unificarTaxonomia?: unknown; aceitarAcesso?: unknown }): Entrada {
  const categoria: CategoriaPU = b.categoria === 'jurisclub' ? 'jurisclub' : 'conteudo'
  const canon = String(b.canonicaId ?? '')
  const dups = [...new Set((Array.isArray(b.dupIds) ? b.dupIds : []).map((x) => String(x)).filter((x) => x && x !== canon))]
  if (!canon || !dups.length) falha('Escolha a disciplina a manter e ao menos uma variante.')
  if (dups.length > 30) falha('Máximo de 30 pastas por mesclagem.')
  if (![canon, ...dups].every((x) => UUID.test(x))) falha('Identificador inválido.')
  const nome = tidy(String(b.nomeFinal ?? ''))
  if (!nome) falha('Informe o nome final da disciplina.')
  if (nome.length > 200) falha('Nome muito longo (máx. 200).')
  return { categoria, canonicaId: canon, dupIds: dups, nomeFinal: nome, unificarTaxonomia: b.unificarTaxonomia === true, aceitarAcesso: b.aceitarAcesso === true }
}
function validarPastas(pastas: Map<string, PastaRow>, e: Entrada) {
  const todos = [e.canonicaId, ...e.dupIds]
  for (const id of todos) { const p = pastas.get(id); if (!p) return falha('Alguma pasta não foi encontrada nesta área (já mesclada, removida ou de outra aba). Recarregue a lista.'); if (p.deletado) falha(`A pasta “${p.nome}” está na lixeira.`) }
  for (const a of todos) for (const b of todos) if (a !== b && ehDescendente(pastas, a, b)) falha(`“${pastas.get(a)!.nome}” está dentro de “${pastas.get(b)!.nome}” — não dá para mesclar uma pasta com a que a contém.`)
}

// ───────────────────────── acesso (assinatura efetiva) ─────────────────────────
interface Acesso { sig: string; descr: string }
async function acessos(q: Q, tenantId: string, pastas: PastaRow[]): Promise<Map<string, Acesso>> {
  const ids = pastas.map((p) => p.id)
  const [g, e] = await Promise.all([
    q('select pasta_id::text as id, array_agg(grupo_id::text order by grupo_id::text) as ids from public.simulado_pasta_grupos where tenant_id = $1 and pasta_id = any($2::uuid[]) group by 1', [tenantId, ids]),
    q('select pasta_id::text as id, array_agg(estudante_id::text order by estudante_id::text) as ids from public.simulado_pasta_estudantes where tenant_id = $1 and pasta_id = any($2::uuid[]) group by 1', [tenantId, ids]),
  ])
  const gm = new Map<string, string[]>((g ?? []).map((x) => [x.id, x.ids])), em = new Map<string, string[]>((e ?? []).map((x) => [x.id, x.ids]))
  const out = new Map<string, Acesso>()
  for (const p of pastas) {
    const gs = gm.get(p.id) ?? [], es = em.get(p.id) ?? []
    const modo = p.raw.modo_acesso ?? 'herdar'; const geral = p.raw.acesso_geral ?? ''; const oculto = !!p.raw.oculto
    const aberto = (modo === 'principal' || modo === 'herdar') && !geral && !gs.length && !es.length && !oculto
    const partes = [oculto ? 'oculta ao aluno' : '', geral ? `acesso geral ${geral}` : '', modo !== 'principal' && modo !== 'herdar' ? `modo ${modo}` : '', gs.length ? `${gs.length} grupo(s)` : '', es.length ? `${es.length} aluno(s)` : ''].filter(Boolean)
    out.set(p.id, { sig: aberto ? 'aberto' : [modo, geral, oculto ? 1 : 0, gs.join(','), es.join(',')].join('|'), descr: aberto ? 'sem restrição' : partes.join(', ') })
  }
  return out
}
function conflitosDeAcesso(ac: Map<string, Acesso>, pares: { origem: PastaRow; destino: PastaRow }[], pastas: Map<string, PastaRow>): string[] {
  const out: string[] = []
  const rot = (p: PastaRow) => { const pai = p.paiId ? pastas.get(p.paiId) : null; return pai ? `${pai.nome} › ${p.nome}` : p.nome }
  for (const { origem, destino } of pares) {
    const a = ac.get(origem.id), b = ac.get(destino.id)
    if (a && b && a.sig !== b.sig) out.push(`“${rot(origem)}” (${a.descr}) → “${rot(destino)}” (${b.descr})`)
  }
  return out
}

// ───────────────────────── taxonomia (disciplina_id) ─────────────────────────
interface SitTax { situacao: PreviaPU['taxonomia']['situacao']; efetiva: string | null; herdada: string | null; diferentes: string[] }
function situacaoTaxonomia(pastas: Map<string, PastaRow>, e: Entrada): SitTax {
  const canon = pastas.get(e.canonicaId)!
  let efetiva = canon.disciplinaId; let herdada: string | null = null; const diferentes: string[] = []; let mesma = false
  for (const id of e.dupIds) {
    const d = pastas.get(id)!.disciplinaId
    if (!d) continue
    if (!efetiva) { efetiva = d; herdada = d } else if (d === efetiva) mesma = true
    else if (!diferentes.includes(d)) diferentes.push(d)
  }
  return { situacao: diferentes.length ? 'diferentes' : herdada ? 'herda' : mesma ? 'mesma' : 'nenhuma', efetiva, herdada, diferentes }
}

const OUTRAS: [string, keyof PreviaPU['taxonomia']['variantes'][number]][] = [
  ['simulado_cronograma_metas', 'metas'], ['simulado_cronograma_links', 'links'], ['simulado_cronograma_conjuntos', 'conjuntos'], ['simulado_duvidas', 'duvidas'], ['simulado_respostas_avulsas', 'respostas'],
]

// ───────────────────────── prévia do impacto ─────────────────────────
export async function previaPU(svc: SupabaseClient, tenantId: string, b: Record<string, unknown>, podeUnificarTaxonomia: boolean): Promise<PreviaPU> {
  const vaz = (error: string): PreviaPU => ({ ok: false, error, canonica: { id: '', nome: '' }, nomeFinal: '', variantes: [], impacto: { documentos: 0, lixeira: 0, subpastasMovidas: 0, subpastasFundidas: 0, pastasArquivadas: 0, metadadosDisciplina: 0, produtos: 0, integracoes: 0, acessos: 0 }, fusoes: [], movidas: [], conflitosAcesso: [], taxonomia: { situacao: 'nenhuma', canonicaDisciplina: null, variantes: [], podeUnificar: podeUnificarTaxonomia }, avisos: [], podeDesfazer: false })
  let e: Entrada
  try { e = validar({ categoria: b.categoria, canonicaId: b.canonicaId, dupIds: b.dupIds, nomeFinal: b.nomeFinal || 'x' }) } catch (x: any) { return vaz(x.message) }
  e.nomeFinal = tidy(String(b.nomeFinal ?? '')) || ''
  const q: Q = (s, p) => sqlQuery<any>(s, p)
  const pastas = await lerPastas(q, tenantId, e.categoria)
  if (!pastas) return vaz('Não foi possível consultar o banco agora.')
  try { validarPastas(pastas, e) } catch (x: any) { return vaz(x.message) }
  const canon = pastas.get(e.canonicaId)!
  const pl = montarPlano(pastas, e.canonicaId, e.dupIds)
  const avisos: string[] = []
  const origens = pl.docs.map((d) => d.de)
  const arv = new Map(e.dupIds.map((id) => [id, subtreeIds(pastas, id)] as const))
  const todosIds = [...new Set([...arv.values()].flat())]
  const [dc, ac, md, pr, ig] = await Promise.all([
    q('select pasta_id::text as id, count(*) filter (where not deletado)::int as vivos, count(*) filter (where deletado)::int as lixeira from public.simulado_conteudo_documentos where tenant_id = $1 and pasta_id = any($2::uuid[]) group by 1', [tenantId, todosIds]),
    acessos(q, tenantId, [...new Set([canon, ...e.dupIds.map((id) => pastas.get(id)!), ...pl.fusoes.flatMap((f) => [f.origem, f.destino])])]),
    q(`select count(*)::int as n from public.simulado_conteudo_documentos d where d.tenant_id = $1 and d.pasta_id = any($2::uuid[]) and d.metadados ? 'disciplina'`, [tenantId, todosIds]),
    q(`select count(*)::int as n from public.simulado_produto_itens where tenant_id = $1 and tipo_item = 'biblioteca_pasta' and item_id = any($2::uuid[])`, [tenantId, origens]),
    q('select count(*)::int as n from public.simulado_integracao_mapeamentos where tenant_id = $1 and pasta_id = any($2::uuid[])', [tenantId, origens]),
  ])
  const porPasta = new Map<string, { vivos: number; lixeira: number }>((dc ?? []).map((x) => [x.id, { vivos: x.vivos, lixeira: x.lixeira }]))
  // documentos da variante = os da pasta e de toda a sua subárvore (todos acabam sob a pasta mantida)
  const docsDe = (id: string) => (arv.get(id) ?? []).reduce((t, x) => t + (porPasta.get(x)?.vivos ?? 0), 0)
  const lixDe = (id: string) => (arv.get(id) ?? []).reduce((t, x) => t + (porPasta.get(x)?.lixeira ?? 0), 0)
  const nSub = (id: string) => [...pastas.values()].filter((p) => p.paiId === id && !p.deletado).length
  const conflitos = conflitosDeAcesso(ac, [...e.dupIds.map((id) => ({ origem: pastas.get(id)!, destino: canon })), ...pl.fusoes], pastas)
  const docsTotal = e.dupIds.reduce((t, id) => t + docsDe(id), 0)
  const lixeira = e.dupIds.reduce((t, id) => t + lixDe(id), 0)

  // taxonomia
  const sit = situacaoTaxonomia(pastas, e)
  const nomesDisc = new Map<string, string>()
  const todosDisc = [...new Set([canon.disciplinaId, ...e.dupIds.map((id) => pastas.get(id)!.disciplinaId), sit.efetiva].filter(Boolean))] as string[]
  if (todosDisc.length) {
    const r = await q('select id::text as id, nome from public.simulado_disciplinas where tenant_id = $1 and id = any($2::uuid[])', [tenantId, todosDisc])
    for (const x of r ?? []) nomesDisc.set(x.id, x.nome)
  }
  const variantesTax: PreviaPU['taxonomia']['variantes'] = []
  for (const x of sit.diferentes) {
    const linha: any = { id: x, nome: nomesDisc.get(x) ?? x, questoes: 0, metas: 0, links: 0, conjuntos: 0, duvidas: 0, respostas: 0, outrasPastas: 0 }
    const [qs, outras, ...resto] = await Promise.all([
      q('select count(*)::int as n from public.simulado_questoes where tenant_id = $1 and deletado = false and disciplina_id = $2', [tenantId, x]),
      q('select count(*)::int as n from public.simulado_pastas where tenant_id = $1 and deletado = false and disciplina_id = $2 and id <> all($3::uuid[])', [tenantId, x, [e.canonicaId, ...e.dupIds]]),
      ...OUTRAS.map(([t]) => q(`select count(*)::int as n from public.${t} where tenant_id = $1 and disciplina_id = $2`, [tenantId, x])),
    ])
    linha.questoes = qs?.[0]?.n ?? 0; linha.outrasPastas = outras?.[0]?.n ?? 0
    OUTRAS.forEach(([, k], i) => { linha[k] = resto[i]?.[0]?.n ?? 0 })
    variantesTax.push(linha)
  }

  if (sit.situacao === 'diferentes') {
    const sem = variantesTax.filter((v) => v.outrasPastas === 0 && (v.metas || v.links || v.conjuntos))
    for (const v of sem) avisos.push(`A disciplina da taxonomia “${v.nome}” (${v.metas} meta(s), ${v.links} link(s) e ${v.conjuntos} conjunto(s) do cronograma) ficaria SEM pasta de conteúdo se você não unificá-la também com “${nomesDisc.get(sit.efetiva ?? '') ?? 'a mantida'}”.`)
    for (const v of variantesTax.filter((x) => x.outrasPastas > 0)) avisos.push(`“${v.nome}” também é usada por ${v.outrasPastas} outra(s) pasta(s): unificar a taxonomia repontará essas pastas também.`)
  }
  if (sit.situacao === 'herda') avisos.push(`A pasta mantida não tinha disciplina da taxonomia: ela passa a usar “${nomesDisc.get(sit.herdada ?? '') ?? '—'}”, vinda da variante.`)
  if (lixeira) avisos.push(`${lixeira} documento(s) na Lixeira dessas pastas também vão para “${e.nomeFinal || canon.nome}” (se forem restaurados, voltam lá).`)
  if ((ig?.[0]?.n ?? 0) || (pr?.[0]?.n ?? 0)) avisos.push('Produtos e integrações que apontavam para as variantes passam a apontar para a pasta mantida.')
  avisos.push('As pastas-variante vão para a Lixeira (30 dias) já sem documentos nem subpastas; os vínculos de acesso delas ficam guardados para o “Desfazer”.')
  const canDesfazer = !!(await q("select to_regclass('public.simulado_termos_mesclagens') is not null as ok", []))?.[0]?.ok
  if (!canDesfazer) avisos.push('Desfazer indisponível: falta a tabela simulado_termos_mesclagens (migration 20261113060000).')
  const nomeFinal = e.nomeFinal || canon.nome
  return {
    ok: true, canonica: { id: canon.id, nome: canon.nome }, nomeFinal,
    variantes: e.dupIds.map((id) => ({ id, nome: pastas.get(id)!.nome, docs: docsDe(id), subpastas: nSub(id) })),
    impacto: {
      documentos: docsTotal, lixeira, subpastasMovidas: pl.movidas.length, subpastasFundidas: pl.fusoes.length, pastasArquivadas: pl.arquivar.length,
      metadadosDisciplina: md?.[0]?.n ?? 0, produtos: pr?.[0]?.n ?? 0, integracoes: ig?.[0]?.n ?? 0,
      acessos: [...ac.values()].filter((a) => a.sig !== 'aberto').length,
    },
    fusoes: pl.fusoes.slice(0, 80).map((f) => ({ origem: `${pastas.get(f.origem.paiId ?? '')?.nome ?? ''} › ${f.origem.nome}`.replace(/^ › /, ''), destino: `${pastas.get(f.destino.paiId ?? '')?.nome ?? ''} › ${f.destino.nome}`.replace(/^ › /, ''), motivo: f.motivo })) as FusaoPU[],
    movidas: pl.movidas.slice(0, 80).map((m) => ({ nome: m.pasta.nome, para: m.paraNome })),
    conflitosAcesso: conflitos,
    taxonomia: { situacao: sit.situacao, canonicaDisciplina: sit.efetiva ? { id: sit.efetiva, nome: nomesDisc.get(sit.efetiva) ?? sit.efetiva } : null, variantes: variantesTax, podeUnificar: podeUnificarTaxonomia },
    avisos, podeDesfazer: canDesfazer,
  }
}

// ───────────────────────── mesclar ─────────────────────────
type Ator = { tenantId: string; userId: string | null }
/** Executa um passo opcional dentro da transação sem abortá-la se falhar (tabela/coluna ausente neste banco). */
async function seguro<T>(c: PoolClient, fn: () => Promise<T>): Promise<T | null> {
  await c.query('SAVEPOINT passo_opcional')
  try { const r = await fn(); await c.query('RELEASE SAVEPOINT passo_opcional'); return r } catch { await c.query('ROLLBACK TO SAVEPOINT passo_opcional'); return null }
}
type R = { ok: boolean; error?: string; [k: string]: any }
const setSql = (campos: string[], base: number) => campos.map((c, i) => `${c} = $${base + i}${c === 'capa_meta' ? '::jsonb' : ''}`).join(', ')
const vazioV = (v: unknown) => v === null || v === undefined || v === ''
const valorSql = (c: string, v: unknown) => (c === 'capa_meta' && v !== null && v !== undefined ? JSON.stringify(v) : v ?? null)

export async function mesclarPU(svc: SupabaseClient, a: Ator, b: Record<string, unknown>, podeTaxonomia: boolean): Promise<R> {
  try {
    const e = validar(b as any)
    const t0 = new Date().toISOString()
    const res = await emTransacao(async (c) => {
      const q: Q = async (s, p) => (await c.query(s, p)).rows
      // trava as pastas envolvidas (evita duas mesclagens/edições simultâneas) e relê o estado DENTRO da transação
      const lock = await c.query('select id from public.simulado_pastas where tenant_id = $1 and id = any($2::uuid[]) order by id for update', [a.tenantId, [e.canonicaId, ...e.dupIds]])
      if (lock.rowCount !== e.dupIds.length + 1) falha('Alguma pasta não foi encontrada. Recarregue a lista.')
      const pastas = (await lerPastas(q, a.tenantId, e.categoria))!
      validarPastas(pastas, e)
      const canon = pastas.get(e.canonicaId)!
      const pl = montarPlano(pastas, e.canonicaId, e.dupIds)
      const ac = await acessos(q, a.tenantId, [...new Set([canon, ...e.dupIds.map((id) => pastas.get(id)!), ...pl.fusoes.flatMap((f) => [f.origem, f.destino])])])
      const conflitos = conflitosDeAcesso(ac, [...e.dupIds.map((id) => ({ origem: pastas.get(id)!, destino: canon })), ...pl.fusoes], pastas)
      if (conflitos.length && !e.aceitarAcesso) falha('As pastas têm regras de acesso diferentes. Confirme que o acesso da pasta mantida passa a valer para os conteúdos movidos.')
      const sit = situacaoTaxonomia(pastas, e)

      const payload: any = {
        categoria: e.categoria, canonica: { id: canon.id, nome: canon.nome, disciplinaId: canon.disciplinaId },
        variantes: e.dupIds.map((id) => ({ id, nome: pastas.get(id)!.nome, disciplinaId: pastas.get(id)!.disciplinaId, docs: 0 })),
        arquivadas: pl.arquivar.map((p) => ({ id: p.id, nome: p.nome })), movidas: pl.movidas.map((m) => ({ id: m.pasta.id, nome: m.pasta.nome, paiAntes: m.pasta.paiId, paraPai: m.paraPai })),
        docs: [] as any[], fills: [] as any[], nome: null as any, disciplina: null as any, metadados: [] as any[], repontos: [] as any[], apagados: [] as any[], acessoAceito: conflitos,
      }
      // 1) documentos (TODOS os da pasta, inclusive lixeira, p/ que restaurar caia na pasta certa)
      let nDocs = 0
      for (const id of e.dupIds) {
        const sub = subtreeIds(pastas, id)
        const r = await c.query('select count(*)::int as n from public.simulado_conteudo_documentos where tenant_id = $1 and pasta_id = any($2::uuid[]) and deletado = false', [a.tenantId, sub])
        const v = payload.variantes.find((x: any) => x.id === id); if (v) v.docs = r.rows[0]?.n ?? 0
        nDocs += r.rows[0]?.n ?? 0
      }
      for (const d of pl.docs) {
        const r = await c.query('select id::text as id, deletado from public.simulado_conteudo_documentos where tenant_id = $1 and pasta_id = $2 order by id', [a.tenantId, d.de])
        if (r.rowCount) {
          payload.docs.push({ de: d.de, para: d.para, ids: r.rows.map((x: any) => x.id) })
          for (const ch of pedacos(r.rows.map((x: any) => x.id), 1000)) await c.query('update public.simulado_conteudo_documentos set pasta_id = $3 where tenant_id = $1 and id = any($2::uuid[])', [a.tenantId, ch, d.para])
        }
      }
      // 2) subpastas sem par: mudam de pai
      for (const m of pl.movidas) await c.query('update public.simulado_pastas set pai_id = $3 where tenant_id = $1 and id = $2', [a.tenantId, m.pasta.id, m.paraPai])
      // 3) destino herda o que está vazio (cor, ícone, tipo de material e CAPA em bloco); o destino nunca perde nada
      const destinos = new Map<string, PastaRow>(); destinos.set(canon.id, canon); for (const f of pl.fusoes) destinos.set(f.destino.id, f.destino)
      const origensPorDestino = new Map<string, PastaRow[]>()
      for (const d of pl.docs) (origensPorDestino.get(d.para) ?? origensPorDestino.set(d.para, []).get(d.para)!).push(pastas.get(d.de)!)
      for (const [destId, orig] of origensPorDestino) {
        const dest = destinos.get(destId) ?? pastas.get(destId)!
        const antes: Record<string, unknown> = {}, depois: Record<string, unknown> = {}
        for (const o of orig) {
          for (const k of CAMPOS_PREENCHER) if (vazioV(dest.raw[k]) && vazioV(depois[k]) && !vazioV(o.raw[k])) { antes[k] = dest.raw[k] ?? null; depois[k] = o.raw[k] }
          if (vazioV(dest.raw.capa_url) && vazioV(depois.capa_url) && !vazioV(o.raw.capa_url)) for (const k of CAMPOS_CAPA) { antes[k] = dest.raw[k] ?? null; depois[k] = o.raw[k] ?? null }
        }
        const cols = Object.keys(depois).filter((k) => [...CAMPOS_PREENCHER, ...CAMPOS_CAPA].includes(k as any))
        if (cols.length) {
          const okFill = await seguro(c, () => c.query(`update public.simulado_pastas set ${setSql(cols, 3)} where tenant_id = $1 and id = $2`, [a.tenantId, destId, ...cols.map((k) => valorSql(k, depois[k]))])) // coluna ausente neste banco: segue sem herdar
          if (okFill) payload.fills.push({ id: destId, antes, depois })
        }
      }
      // 4) disciplina da taxonomia herdada + nome final
      if (sit.herdada && !canon.disciplinaId) { await c.query('update public.simulado_pastas set disciplina_id = $3 where tenant_id = $1 and id = $2', [a.tenantId, canon.id, sit.herdada]); payload.disciplina = { de: null, para: sit.herdada } }
      if (e.nomeFinal !== canon.nome) { await c.query('update public.simulado_pastas set nome = $3 where tenant_id = $1 and id = $2', [a.tenantId, canon.id, e.nomeFinal]); payload.nome = { de: canon.nome, para: e.nomeFinal } }
      // 5) metadado de texto "disciplina" dos documentos movidos que ainda traz o nome da variante → nome final
      const nomesVar = new Set(e.dupIds.map((id) => plano(pastas.get(id)!.nome))); nomesVar.delete(plano(e.nomeFinal))
      if (nomesVar.size) {
        const todosDocs = payload.docs.flatMap((d: any) => d.ids as string[])
        const subMovidas = [...new Set(pl.movidas.flatMap((m) => subtreeIds(pastas, m.pasta.id)))] // documentos que viajam dentro de subpastas movidas
        if (subMovidas.length) { const r = await c.query('select id::text as id from public.simulado_conteudo_documentos where tenant_id = $1 and pasta_id = any($2::uuid[])', [a.tenantId, subMovidas]); for (const x of r.rows) todosDocs.push(x.id) }
        const md: { id: string; de: string }[] = []
        for (const ch of pedacos(todosDocs, 1000)) {
          const r = await c.query(`select id::text as id, metadados->>'disciplina' as de from public.simulado_conteudo_documentos where tenant_id = $1 and id = any($2::uuid[]) and metadados ? 'disciplina'`, [a.tenantId, ch])
          for (const x of r.rows) if (x.de && nomesVar.has(plano(x.de))) md.push(x)
        }
        for (const ch of pedacos(md, 1000)) await c.query(`update public.simulado_conteudo_documentos set metadados = jsonb_set(metadados, '{disciplina}', to_jsonb($3::text)) where tenant_id = $1 and id = any($2::uuid[])`, [a.tenantId, ch.map((x) => x.id), e.nomeFinal])
        payload.metadados = md.map((x) => ({ id: x.id, de: x.de, para: e.nomeFinal }))
      }
      // 6) produtos (item biblioteca_pasta) e mapeamentos de integração que apontavam para as pastas arquivadas → destino
      for (const d of pl.docs) {
        const it = await seguro(c, () => c.query(`select id::text as id, to_jsonb(t) as row, exists(select 1 from public.simulado_produto_itens x where x.tenant_id = t.tenant_id and x.produto_id = t.produto_id and x.tipo_item = t.tipo_item and x.item_id = $3) as dup from public.simulado_produto_itens t where t.tenant_id = $1 and t.tipo_item = 'biblioteca_pasta' and t.item_id = $2`, [a.tenantId, d.de, d.para]))
        for (const r of it?.rows ?? []) {
          if (r.dup) { await c.query('delete from public.simulado_produto_itens where tenant_id = $1 and id = $2', [a.tenantId, r.id]); payload.apagados.push({ tabela: 'simulado_produto_itens', row: r.row }) }
          else { await c.query('update public.simulado_produto_itens set item_id = $3 where tenant_id = $1 and id = $2', [a.tenantId, r.id, d.para]); payload.repontos.push({ tabela: 'simulado_produto_itens', col: 'item_id', ids: [r.id], de: d.de, para: d.para }) }
        }
        const mp = await seguro(c, () => c.query('select id::text as id from public.simulado_integracao_mapeamentos where tenant_id = $1 and pasta_id = $2', [a.tenantId, d.de]))
        if (mp?.rowCount) { await c.query('update public.simulado_integracao_mapeamentos set pasta_id = $3 where tenant_id = $1 and pasta_id = $2', [a.tenantId, d.de, d.para]); payload.repontos.push({ tabela: 'simulado_integracao_mapeamentos', col: 'pasta_id', ids: mp.rows.map((x: any) => x.id), de: d.de, para: d.para }) }
      }
      // 7) arquiva (soft-delete) as pastas esvaziadas — só depois de mover tudo
      const arq = pl.arquivar.map((p) => p.id)
      await c.query('update public.simulado_pastas set deletado = true, deletado_em = now(), deletado_por = $3 where tenant_id = $1 and id = any($2::uuid[])', [a.tenantId, arq, a.userId])
      // 8) o que ainda aponta p/ elas? (só avisa: nada é apagado em definitivo)
      const resto = await c.query('select count(*)::int as n from public.simulado_conteudo_documentos where tenant_id = $1 and pasta_id = any($2::uuid[])', [a.tenantId, arq])
      if ((resto.rows[0]?.n ?? 0) > 0) falha('Algum documento continuou na pasta de origem (concorrência). Nada foi alterado — tente de novo.')
      const logId = await inserirLog(c, a, { canonicaId: canon.id, canonicaNome: canon.nome, nomeFinal: e.nomeFinal, payload, documentos: nDocs })
      return { nDocs, payload, comLog: !!logId, logId, canon, sit, pl, conflitos }
    })

    // taxonomia (opcional, fora da transação: RPC própria com log/desfazer próprios)
    let taxonomia: { unificada: boolean; erro?: string; mantida?: string; questoes?: number } = { unificada: false }
    if (e.unificarTaxonomia && res.sit.situacao === 'diferentes') {
      if (!podeTaxonomia) taxonomia = { unificada: false, erro: 'Você não tem permissão para unificar disciplinas da taxonomia (questoes:update).' }
      else if (!res.sit.efetiva) taxonomia = { unificada: false, erro: 'Sem disciplina de destino.' }
      else {
        const r = await unificarDisciplinas(res.sit.efetiva, res.sit.diferentes)
        taxonomia = r.ok ? { unificada: true, mantida: r.mantida, questoes: r.questoes } : { unificada: false, erro: r.error }
        if (r.ok) {
          const u = await svc.from('simulado_disciplina_unificacoes').select('id').eq('tenant_id', a.tenantId).eq('canonica_id', res.sit.efetiva).eq('desfeita', false).gte('criado_em', new Date(Date.parse(t0) - 2000).toISOString()).order('criado_em', { ascending: false }).limit(1)
          const uid = ((u.data ?? []) as any[])[0]?.id ?? null
          if (res.logId) {
            const lg = await svc.from('simulado_termos_mesclagens').select('payload').eq('tenant_id', a.tenantId).eq('id', res.logId).maybeSingle()
            if (lg.data) await svc.from('simulado_termos_mesclagens').update({ payload: { ...(lg.data as any).payload, taxonomia: { canonicaDisciplinaId: res.sit.efetiva, dups: res.sit.diferentes, unificacaoId: uid } } }).eq('tenant_id', a.tenantId).eq('id', res.logId)
          }
        }
      }
    }
    await registrarAudit({
      operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: res.canon.id, atorId: a.userId, tenantId: a.tenantId,
      antes: { acao: 'unificar_disciplinas_biblioteca', variantes: res.payload.variantes, movidas: res.payload.movidas.slice(0, 300), arquivadas: res.payload.arquivadas, docs_por_pasta: res.payload.docs.map((d: any) => ({ de: d.de, para: d.para, n: d.ids.length, ...(res.comLog ? {} : { ids: d.ids.slice(0, 3000) }) })), acesso_aceito: res.conflitos },
      depois: { mantida: e.nomeFinal, documentos: res.nDocs, subpastas_movidas: res.pl.movidas.length, fusoes: res.pl.fusoes.length, pastas_arquivadas: res.pl.arquivar.length, taxonomia, desfazer: res.comLog },
    }).catch(() => {})
    limparCachePU(a.tenantId)
    try { revalidatePath('/admin/biblioteca'); revalidatePath('/admin/revisao/biblioteca') } catch { /* fora de request */ }
    return { ok: true, documentos: res.nDocs, subpastasMovidas: res.pl.movidas.length, fusoes: res.pl.fusoes.length, arquivadas: res.pl.arquivar.length, mantida: e.nomeFinal, taxonomia, podeDesfazer: res.comLog }
  } catch (x: any) { return { ok: false, error: x instanceof ErroNegocio ? x.message : `Falha ao unificar (nada foi alterado): ${x?.message ?? 'erro'}` } }
}

async function inserirLog(c: PoolClient, a: Ator, l: { canonicaId: string; canonicaNome: string; nomeFinal: string; payload: unknown; documentos: number }): Promise<string | null> {
  const ok = (await c.query("select to_regclass('public.simulado_termos_mesclagens') is not null as ok")).rows[0]?.ok
  if (!ok) return null
  const r = await c.query(
    `insert into public.simulado_termos_mesclagens (tenant_id, tipo, origem, canonica_id, canonica_nome, nome_final, payload, questoes, criado_por) values ($1,$2,'mesclagem',$3,$4,$5,$6::jsonb,$7,$8) returning id::text as id`,
    [a.tenantId, TIPO_PU, l.canonicaId, l.canonicaNome, l.nomeFinal, JSON.stringify(l.payload), l.documentos, a.userId],
  )
  return r.rows[0]?.id ?? null
}

// ───────────────────────── ignorar ("São disciplinas diferentes") ─────────────────────────
export async function ignorarPU(svc: SupabaseClient, a: Ator, grupoId: string, nomes: string[], desfazer: boolean): Promise<R> {
  if (!/^[0-9a-f]{16}$/.test(grupoId)) return { ok: false, error: 'Grupo inválido.' }
  const falhaTab = { ok: false, error: 'Tabela de ignorados ausente (migration 20261113060000 pendente).', semTabela: true }
  if (desfazer) { const r = await svc.from('simulado_termos_ignorados').delete().eq('tenant_id', a.tenantId).eq('tipo', TIPO_PU).eq('chave', grupoId); if (r.error) return falhaTab }
  else { const r = await svc.from('simulado_termos_ignorados').upsert({ tenant_id: a.tenantId, tipo: TIPO_PU, chave: grupoId, nomes: nomes.slice(0, 40).map((n) => String(n).slice(0, 200)), criado_por: a.userId }, { onConflict: 'tenant_id,tipo,chave' }); if (r.error) return falhaTab }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_termos_ignorados', entidadeId: a.tenantId, atorId: a.userId, tenantId: a.tenantId, depois: { acao: desfazer ? 'voltar_a_sugerir' : 'sao_disciplinas_diferentes', tipo: TIPO_PU, grupo: grupoId, nomes: nomes.slice(0, 20) } }).catch(() => {})
  limparCachePU(a.tenantId)
  return { ok: true }
}

// ───────────────────────── histórico + desfazer ─────────────────────────
export async function historicoPU(svc: SupabaseClient, tenantId: string): Promise<{ ok: boolean; itens: HistoricoPU[]; semTabela: boolean }> {
  const { data, error } = await svc.from('simulado_termos_mesclagens').select('id, canonica_nome, nome_final, payload, questoes, criado_em, desfeita').eq('tenant_id', tenantId).eq('tipo', TIPO_PU).order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(60)
  const itens: HistoricoPU[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id, canonicaNome: r.canonica_nome ?? '—', nomeFinal: r.nome_final ?? null,
    variantes: (Array.isArray(r.payload?.variantes) ? r.payload.variantes : []).map((v: any) => ({ nome: v.nome, docs: Number(v.docs) || 0 })),
    documentos: r.questoes ?? 0, criadoEm: r.criado_em, desfeita: !!r.desfeita, podeDesfazer: !r.desfeita, taxonomia: !!r.payload?.taxonomia?.unificacaoId,
  }))
  return { ok: true, itens, semTabela: !!error }
}

export async function desfazerPU(svc: SupabaseClient, a: Ator, id: string): Promise<R> {
  try {
    if (!UUID.test(id)) falha('Registro inválido.')
    const res = await emTransacao(async (c) => {
      const { rows } = await c.query('select * from public.simulado_termos_mesclagens where tenant_id = $1 and id = $2 and tipo = $3 for update', [a.tenantId, id, TIPO_PU])
      const log = rows[0]; if (!log) falha('Registro não encontrado.'); if (log.desfeita) falha('Esta unificação já foi desfeita.')
      const p = log.payload ?? {}
      const canonId: string = p.canonica?.id
      const ex = await c.query('select 1 from public.simulado_pastas where tenant_id = $1 and id = $2 and deletado = false', [a.tenantId, canonId])
      if (!ex.rowCount) falha('A pasta mantida não existe mais (ou está na Lixeira) — não dá para desfazer.')
      let nDocs = 0
      // 1) pastas arquivadas voltam (só as que ainda estão na lixeira)
      const arq: string[] = (p.arquivadas ?? []).map((x: any) => x.id)
      if (arq.length) await c.query('update public.simulado_pastas set deletado = false, deletado_em = null, deletado_por = null where tenant_id = $1 and id = any($2::uuid[]) and deletado = true', [a.tenantId, arq])
      // 2) subpastas movidas voltam ao pai de origem (só se ainda estiverem onde a unificação as pôs)
      for (const m of p.movidas ?? []) await c.query('update public.simulado_pastas set pai_id = $3 where tenant_id = $1 and id = $2 and pai_id = $4', [a.tenantId, m.id, m.paiAntes, m.paraPai])
      // 3) documentos de volta (só os que ainda estão no destino — não desfaz o que foi movido depois)
      for (const d of p.docs ?? []) for (const ch of pedacos<string>(d.ids ?? [], 1000)) { const r = await c.query('update public.simulado_conteudo_documentos set pasta_id = $3 where tenant_id = $1 and id = any($2::uuid[]) and pasta_id = $4', [a.tenantId, ch, d.de, d.para]); nDocs += r.rowCount ?? 0 }
      // 4) campos herdados / nome / disciplina: só se ainda têm o valor que a unificação pôs
      for (const f of p.fills ?? []) for (const k of Object.keys(f.antes ?? {})) {
        if (!(CAMPOS_PREENCHER as readonly string[]).includes(k) && !(CAMPOS_CAPA as readonly string[]).includes(k)) continue // só colunas conhecidas (o payload vem do banco)
        await seguro(c, () => c.query(`update public.simulado_pastas set ${k} = $3${k === 'capa_meta' ? '::jsonb' : ''} where tenant_id = $1 and id = $2 and ${k}${k === 'capa_meta' ? '::text' : ''} is not distinct from $4${k === 'capa_meta' ? '::jsonb::text' : ''}`, [a.tenantId, f.id, valorSql(k, f.antes[k]), valorSql(k, f.depois[k])]))
      }
      if (p.nome) await c.query('update public.simulado_pastas set nome = $3 where tenant_id = $1 and id = $2 and nome = $4', [a.tenantId, canonId, p.nome.de, p.nome.para])
      if (p.disciplina) await c.query('update public.simulado_pastas set disciplina_id = $3 where tenant_id = $1 and id = $2 and disciplina_id is not distinct from $4', [a.tenantId, canonId, p.disciplina.de, p.disciplina.para])
      // 5) metadado de disciplina dos documentos
      const porDe = new Map<string, string[]>(); for (const m of p.metadados ?? []) (porDe.get(m.de) ?? porDe.set(m.de, []).get(m.de)!).push(m.id)
      for (const [de, ids] of porDe) for (const ch of pedacos(ids, 1000)) await c.query(`update public.simulado_conteudo_documentos set metadados = jsonb_set(metadados, '{disciplina}', to_jsonb($3::text)) where tenant_id = $1 and id = any($2::uuid[]) and metadados->>'disciplina' = $4`, [a.tenantId, ch, de, p.nome?.para ?? p.canonica?.nome])
      // 6) produtos / integrações
      for (const r of p.repontos ?? []) if (['simulado_produto_itens', 'simulado_integracao_mapeamentos'].includes(r.tabela) && ['item_id', 'pasta_id'].includes(r.col)) await seguro(c, () => c.query(`update public.${r.tabela} set ${r.col} = $3 where tenant_id = $1 and id = any($2::uuid[]) and ${r.col} = $4`, [a.tenantId, r.ids, r.de, r.para]))
      for (const r of p.apagados ?? []) if (r.tabela === 'simulado_produto_itens') { const j = await c.query('select 1 from public.simulado_produto_itens where id = $1', [r.row.id]); if (!j.rowCount) await c.query('insert into public.simulado_produto_itens select * from jsonb_populate_record(null::public.simulado_produto_itens, $1::jsonb)', [JSON.stringify(r.row)]) }
      await c.query('update public.simulado_termos_mesclagens set desfeita = true, desfeita_em = now(), desfeita_por = $3 where tenant_id = $1 and id = $2', [a.tenantId, id, a.userId])
      return { nDocs, tax: p.taxonomia?.unificacaoId ? String(p.taxonomia.unificacaoId) : null }
    })
    let aviso: string | undefined
    if (res.tax) { const r = await desfazerUnificacao(res.tax); if (!r.ok) aviso = `Pastas restauradas, mas a disciplina da taxonomia não foi restaurada: ${r.error}` }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_termos_mesclagens', entidadeId: id, atorId: a.userId, tenantId: a.tenantId, depois: { acao: 'desfazer_unificar_disciplinas_biblioteca', documentos: res.nDocs, taxonomia_restaurada: !!res.tax && !aviso } }).catch(() => {})
    limparCachePU(a.tenantId)
    try { revalidatePath('/admin/biblioteca'); revalidatePath('/admin/revisao/biblioteca') } catch { /* fora de request */ }
    return { ok: true, documentos: res.nDocs, aviso }
  } catch (x: any) { return { ok: false, error: x instanceof ErroNegocio ? x.message : `Falha ao desfazer (nada foi alterado): ${x?.message ?? 'erro'}` } }
}
