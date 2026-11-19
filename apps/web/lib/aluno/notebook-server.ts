// Caderno (beta) — lógica de servidor do notebook do aluno. SEM 'server-only' e sem imports estáticos de módulos server-only
// (o supabase client entra por parâmetro; loaders pesados por import dinâmico) para ser testável com vitest (node).
import {
  ANOTACAO_ORIGENS, DOC_VAZIO, LIMITES, MARKS_PERMITIDOS, NOS_ATOMICOS, NOS_PERMITIDOS, type DocJson,
} from '@/lib/aluno/notebook-tipos'
import { criarFolhaVazia, serializarFolha, validarFolha, type Folha } from '@/lib/aluno/notebook-folha'

// ================================================================ erros de banco
/** Tabela/coluna ausente (migração não aplicada): Postgres 42P01 ou PostgREST PGRST205/PGRST204. */
export function tabelaAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204' || e.code === '42703') return true
  const m = String(e.message ?? '')
  return /relation .*simulado_aluno_notebook.* does not exist|could not find the table .*simulado_aluno_notebook/i.test(m)
}

// ================================================================ sanitização do doc (lista branca)
class DocInvalido extends Error {}

const NOS = new Set<string>(NOS_PERMITIDOS)
const MARKS = new Set<string>(MARKS_PERMITIDOS)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[a-z0-9_-]{1,20}$/

function rej(msg: string): never { throw new DocInvalido(msg) }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function inteiro(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined
}
function texto(v: unknown, max: number): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined
}
function uuid(v: unknown): string | undefined { return typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : undefined }

/** URL segura: http(s), mailto ou caminho relativo /aluno/... (javascript:, data:, // e controles => null). */
export function urlSegura(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || s.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(s)) return null
  if (s.startsWith('/aluno/') || s === '/aluno') return s
  if (/^(https?:|mailto:)/i.test(s)) {
    try { new URL(s); return s } catch { return null }
  }
  return null
}

function sanitMarks(marks: unknown): any[] | undefined {
  if (marks === undefined || marks === null) return undefined
  if (!Array.isArray(marks)) rej('marks inválido')
  const out: any[] = []
  const vistos = new Set<string>()
  for (const m of marks) {
    if (!isObj(m) || typeof m.type !== 'string' || !MARKS.has(m.type)) rej(`mark não permitida: ${String((m as any)?.type)}`)
    if (vistos.has(m.type)) continue
    if (m.type === 'link') {
      const href = urlSegura(isObj(m.attrs) ? m.attrs.href : undefined)
      if (!href) continue // link perigoso/ inválido: descarta a mark, mantém o texto
      out.push({ type: 'link', attrs: { href } })
    } else if (m.type === 'highlight') {
      const cor = isObj(m.attrs) && typeof m.attrs.color === 'string' && TOKEN_RE.test(m.attrs.color) ? m.attrs.color : null
      out.push(cor ? { type: 'highlight', attrs: { color: cor } } : { type: 'highlight' })
    } else {
      out.push({ type: m.type })
    }
    vistos.add(m.type)
  }
  return out.length ? out : undefined
}

function sanitRects(v: unknown): { x0: number; y0: number; x1: number; y1: number }[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) return undefined
  if (v.length > LIMITES.rectsMax) rej('rects excede o limite')
  const out: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const r of v) {
    if (!isObj(r)) return undefined
    const { x0, y0, x1, y1 } = r as Record<string, unknown>
    if (![x0, y0, x1, y1].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2)) return undefined
    out.push({ x0: x0 as number, y0: y0 as number, x1: x1 as number, y1: y1 as number })
  }
  return out
}

function sanitAttrs(tipo: string, a: unknown): Record<string, unknown> | undefined {
  const at = isObj(a) ? a : {}
  const out: Record<string, unknown> = {}
  switch (tipo) {
    case 'heading': {
      const level = inteiro(at.level, 1, 3)
      if (!level) rej('heading: level deve ser 1-3')
      out.level = level
      break
    }
    case 'orderedList': { const s = inteiro(at.start, 1, 100000); if (s) out.start = s; break }
    case 'taskItem': out.checked = at.checked === true; break
    case 'codeBlock': { const l = texto(at.language, 30); if (l && /^[\w+#.-]*$/.test(l)) out.language = l; break }
    case 'tableCell':
    case 'tableHeader': {
      const cs = inteiro(at.colspan, 1, 50); if (cs) out.colspan = cs
      const rs = inteiro(at.rowspan, 1, 50); if (rs) out.rowspan = rs
      if (Array.isArray(at.colwidth) && at.colwidth.length <= 50 && at.colwidth.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 5000)) out.colwidth = at.colwidth
      break
    }
    case 'questaoRef': {
      const id = uuid(at.questao_id)
      if (!id) rej('questaoRef: questao_id inválido')
      out.questao_id = id
      break
    }
    case 'grifoSnapshot': {
      const doc = uuid(at.documento_id)
      if (!doc) rej('grifoSnapshot: documento_id inválido')
      out.documento_id = doc
      const pagina = inteiro(at.pagina, 0, 1_000_000)
      if (pagina === undefined) rej('grifoSnapshot: pagina inválida')
      out.pagina = pagina
      out.texto = texto(at.texto, LIMITES.grifoTextoMax) ?? ''
      const ver = inteiro(at.documento_versao, 0, 1_000_000); if (ver !== undefined) out.documento_versao = ver
      const tit = texto(at.documento_titulo, 300); if (tit !== undefined) out.documento_titulo = tit
      const rects = sanitRects(at.rects); if (rects) out.rects = rects
      if (typeof at.cor === 'string' && TOKEN_RE.test(at.cor)) out.cor = at.cor
      if (typeof at.tool === 'string' && TOKEN_RE.test(at.tool)) out.tool = at.tool
      const pre = texto(at.prefix, 300); if (pre !== undefined) out.prefix = pre
      const suf = texto(at.suffix, 300); if (suf !== undefined) out.suffix = suf
      const ini = inteiro(at.inicio, 0, 100_000_000); if (ini !== undefined) out.inicio = ini
      const fim = inteiro(at.fim, 0, 100_000_000); if (fim !== undefined) out.fim = fim
      const link = urlSegura(at.link); if (link) out.link = link
      break
    }
    case 'anotacaoRef': {
      out.texto = texto(at.texto, LIMITES.anotacaoTextoMax) ?? ''
      const html = texto(at.html_legado, LIMITES.htmlLegadoMax); if (html) out.html_legado = html
      if (typeof at.origem_tabela === 'string' && (ANOTACAO_ORIGENS as readonly string[]).includes(at.origem_tabela)) out.origem_tabela = at.origem_tabela
      const oid = uuid(at.origem_id); if (oid) out.origem_id = oid
      break
    }
    default: return undefined
  }
  return Object.keys(out).length ? out : undefined
}

export type SanitResultado = { ok: true; doc: DocJson; nos: number } | { ok: false; erro: string }

/**
 * Valida/limpa o doc TipTap contra a LISTA BRANCA. Nó/mark desconhecido => {ok:false} (rota responde 422).
 * Attrs desconhecidos são descartados; links perigosos removidos; limites de profundidade, nós e 2 MB.
 */
export function sanitizarDoc(entrada: unknown): SanitResultado {
  try {
    if (!isObj(entrada) || entrada.type !== 'doc') rej('raiz deve ser {type:"doc"}')
    // Limite de bytes ANTES de percorrer (evita custo com payload gigante).
    const bruto = JSON.stringify(entrada)
    if (Buffer.byteLength(bruto, 'utf8') > LIMITES.docBytesMax) rej('documento excede 2 MB')
    let nos = 0
    const visita = (n: unknown, prof: number): any => {
      if (prof > LIMITES.docProfundidadeMax) rej('profundidade máxima excedida')
      if (++nos > LIMITES.docNosMax) rej('número máximo de nós excedido')
      if (!isObj(n) || typeof n.type !== 'string' || !NOS.has(n.type) || (n.type === 'doc' && prof > 0)) rej(`nó não permitido: ${String((n as any)?.type)}`)
      const tipo = n.type as string
      const out: any = { type: tipo }
      if (tipo === 'text') {
        if (typeof n.text !== 'string' || n.text.length === 0 || n.text.length > LIMITES.textoNoMax) rej('text inválido')
        out.text = n.text
        const marks = sanitMarks(n.marks); if (marks) out.marks = marks
        return out
      }
      const attrs = sanitAttrs(tipo, n.attrs); if (attrs) out.attrs = attrs
      if (!NOS_ATOMICOS.has(tipo) && n.content !== undefined && n.content !== null) {
        if (!Array.isArray(n.content)) rej('content inválido')
        out.content = n.content.map((c) => visita(c, prof + 1))
      }
      return out
    }
    const raiz = visita(entrada, 0)
    if (!Array.isArray(raiz.content) || raiz.content.length === 0) raiz.content = [{ type: 'paragraph' }]
    return { ok: true, doc: raiz as DocJson, nos }
  } catch (e) {
    if (e instanceof DocInvalido) return { ok: false, erro: e.message }
    return { ok: false, erro: 'documento inválido' }
  }
}

const BLOCOS_QUEBRA = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'codeBlock', 'tableRow', 'blockquote'])

/** Texto plano do doc para `texto_busca` (text + grifoSnapshot.texto + anotacaoRef.texto; questaoRef ignorado). */
export function extrairTexto(doc: unknown): string {
  const partes: string[] = []
  let total = 0
  const visita = (n: any, prof: number) => {
    if (!n || typeof n !== 'object' || prof > 60 || total > LIMITES.textoBuscaMax) return
    const push = (s: string) => { partes.push(s); total += s.length }
    switch (n.type) {
      case 'text': if (typeof n.text === 'string') push(n.text); return
      case 'hardBreak': push('\n'); return
      case 'grifoSnapshot': if (typeof n.attrs?.texto === 'string' && n.attrs.texto) push(n.attrs.texto + '\n'); return
      case 'anotacaoRef': if (typeof n.attrs?.texto === 'string' && n.attrs.texto) push(n.attrs.texto + '\n'); return
      case 'questaoRef': return
    }
    if (Array.isArray(n.content)) for (const c of n.content) visita(c, prof + 1)
    if (n.type === 'tableCell' || n.type === 'tableHeader') push(' ')
    else if (BLOCOS_QUEBRA.has(n.type)) push('\n')
  }
  visita(doc, 0)
  return partes.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITES.textoBuscaMax)
}

// ================================================================ folha livre (tinta)
export type TintaResultado = { ok: true; folha: Folha; bytes: number } | { ok: false; erro: string }

/** Valida a tinta (folha livre) no servidor: schema + limites + 1 MB. Devolve a folha COMPACTADA/normalizada. */
export function sanitizarTinta(entrada: unknown): TintaResultado {
  const r = validarFolha(entrada)
  if (!r.ok) return { ok: false, erro: r.erro }
  return { ok: true, folha: JSON.parse(serializarFolha(r.folha)) as Folha, bytes: r.bytes }
}

export const tintaVazia = (): Folha => criarFolhaVazia()

/** Texto das caixas de texto da folha (ordem de leitura: y, depois x) para `texto_busca`. */
export function extrairTextoFolha(folha: unknown): string {
  const caixas = (folha as { caixas?: unknown } | null)?.caixas
  if (!Array.isArray(caixas)) return ''
  return caixas
    .filter((c: any) => c && typeof c.texto === 'string' && c.texto.trim())
    .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
    .map((c: any) => (c.texto as string).trim())
    .join('\n')
    .slice(0, LIMITES.textoBuscaMax)
}

/** ids únicos de questaoRef no doc (para hidratar `refs.questoes`). */
export function extrairQuestaoIds(doc: unknown, max = 200): string[] {
  const ids = new Set<string>()
  const visita = (n: any, prof: number) => {
    if (!n || typeof n !== 'object' || prof > 60 || ids.size >= max) return
    if (n.type === 'questaoRef' && typeof n.attrs?.questao_id === 'string') ids.add(n.attrs.questao_id)
    if (Array.isArray(n.content)) for (const c of n.content) visita(c, prof + 1)
  }
  visita(doc, 0)
  return [...ids]
}

export function docVazio(): DocJson { return JSON.parse(JSON.stringify(DOC_VAZIO)) }

// ================================================================ ordem (ponto médio)
export interface OrdemCalculada { ordem: number; renumerar: boolean }

/** Ordem entre dois vizinhos. `prev`=vizinho acima (menor), `next`=abaixo (maior); null = não existe. */
export function calcularOrdem(prev: number | null | undefined, next: number | null | undefined): OrdemCalculada {
  const p = typeof prev === 'number' && Number.isFinite(prev) ? prev : null
  const n = typeof next === 'number' && Number.isFinite(next) ? next : null
  if (p === null && n === null) return { ordem: LIMITES.passoOrdem, renumerar: false }
  if (n === null) return { ordem: (p as number) + LIMITES.passoOrdem, renumerar: false }
  if (p === null) return { ordem: n - LIMITES.passoOrdem, renumerar: false }
  const gap = n - p
  return { ordem: p + gap / 2, renumerar: !(gap >= LIMITES.gapMinOrdem) }
}

/** Próxima ordem ao final (max + passo). */
export function ordemAoFinal(max: number | null | undefined): number {
  return typeof max === 'number' && Number.isFinite(max) ? max + LIMITES.passoOrdem : LIMITES.passoOrdem
}

/** Ordens renumeradas 1024*n (n a partir de 1) para `qtd` itens. */
export function renumerarOrdens(qtd: number): number[] {
  return Array.from({ length: qtd }, (_, i) => LIMITES.passoOrdem * (i + 1))
}

// ================================================================ trecho da busca
export function trechoBusca(texto: string, q: string, tam = 180): string {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const termos = q.toLowerCase().split(/\s+/).filter((x) => x.length >= 2)
  const baixo = t.toLowerCase()
  let pos = -1
  for (const termo of termos) { const i = baixo.indexOf(termo); if (i >= 0 && (pos < 0 || i < pos)) pos = i }
  const ini = pos < 0 ? 0 : Math.max(0, pos - 50)
  return (ini > 0 ? '…' : '') + t.slice(ini, ini + tam) + (ini + tam < t.length ? '…' : '')
}

// ================================================================ seções automáticas (somente leitura)
const CACHE_ERROS_MS = 60_000
const cacheErros = new Map<string, { ids: string[]; ate: number }>()

/** ids das questões com última resposta errada, cache curto (60 s) por tenant+estudante. */
export async function idsErrosAluno(svc: any, tenantId: string, estudanteId: string): Promise<string[]> {
  const k = `${tenantId}:${estudanteId}`
  const agora = Date.now()
  const c = cacheErros.get(k)
  if (c && c.ate > agora) return c.ids
  const { cadernoDeErros } = await import('@/lib/aluno/cadernos-aluno')
  const { ids } = await cadernoDeErros(svc, tenantId, estudanteId)
  if (cacheErros.size > 500) { for (const [key, v] of cacheErros) if (v.ate <= agora) cacheErros.delete(key); if (cacheErros.size > 500) cacheErros.clear() }
  cacheErros.set(k, { ids, ate: agora + CACHE_ERROS_MS })
  return ids
}

export async function listarAutoErros(svc: any, tenantId: string, estudanteId: string, offset: number, limit: number) {
  const ids = await idsErrosAluno(svc, tenantId, estudanteId)
  const fatia = ids.slice(offset, offset + limit)
  const { questoesParaAluno } = await import('@/lib/aluno/cadernos-aluno')
  return { total: ids.length, itens: await questoesParaAluno(svc, tenantId, estudanteId, fatia) }
}

export async function contarFavoritos(svc: any, estudanteId: string): Promise<number> {
  const { count } = await svc.from('simulado_favoritos').select('id', { count: 'exact', head: true }).eq('estudante_id', estudanteId)
  return count ?? 0
}

/** Favoritos paginados no servidor (.range + count). simulado_favoritos não tem tenant_id: escopo = estudante. */
export async function listarAutoFavoritos(svc: any, tenantId: string, estudanteId: string, offset: number, limit: number) {
  const { data, count } = await svc.from('simulado_favoritos').select('questao_id', { count: 'exact' })
    .eq('estudante_id', estudanteId).order('criado_em', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limit - 1)
  const ids: string[] = (data ?? []).map((f: any) => f.questao_id)
  const { questoesParaAluno } = await import('@/lib/aluno/cadernos-aluno')
  return { total: count ?? 0, itens: await questoesParaAluno(svc, tenantId, estudanteId, ids) }
}

// ================================================================ árvore leve (SEM doc)
export interface ArvoreArgs { tenantId: string; estudanteId: string; notebookId: string; secaoId?: string; offset?: number; limit?: number }

export async function montarArvore(svc: any, a: ArvoreArgs) {
  const { data: secs, error: eS } = await svc.from('simulado_aluno_notebook_secoes')
    .select('id, nome, cor, ordem, tipo').eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', a.notebookId)
    .is('deletado_em', null).order('ordem', { ascending: true }).order('id', { ascending: true }).limit(500)
  if (eS) return { error: eS as unknown }
  const secoes: { id: string; nome: string; cor: string | null; ordem: number; tipo: string; qtd_paginas: number }[] =
    (secs ?? []).map((s: any) => ({ ...s, qtd_paginas: 0 }))

  const limit = Math.min(Math.max(a.limit ?? LIMITES.paginasPorSecaoArvore, 1), LIMITES.paginasPorSecaoArvore)
  const offset = Math.max(a.offset ?? 0, 0)
  const alvo = a.secaoId ? secoes.filter((s) => s.id === a.secaoId) : secoes
  const paginas: { id: string; secao_id: string; titulo: string; tipo_pagina: string; ordem: number; atualizado_em: string }[] = []
  let erro: unknown = null

  const manuais = alvo.filter((s) => !s.tipo.startsWith('auto_'))
  for (let i = 0; i < manuais.length && !erro; i += 10) {
    await Promise.all(manuais.slice(i, i + 10).map(async (s) => {
      const { data, count, error } = await svc.from('simulado_aluno_notebook_paginas')
        .select('id, secao_id, titulo, tipo_pagina, ordem, atualizado_em', { count: 'exact' })
        .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('secao_id', s.id)
        .is('deletado_em', null).eq('arquivada', false)
        .order('ordem', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1)
      if (error) { erro = error; return }
      s.qtd_paginas = count ?? 0
      for (const p of data ?? []) paginas.push(p)
    }))
  }
  if (erro) return { error: erro }

  // contagem das automáticas (somente leitura)
  for (const s of alvo) {
    if (s.tipo === 'auto_erros') s.qtd_paginas = (await idsErrosAluno(svc, a.tenantId, a.estudanteId)).length
    else if (s.tipo === 'auto_favoritos') s.qtd_paginas = await contarFavoritos(svc, a.estudanteId)
  }
  const idx = new Map(secoes.map((s, i) => [s.id, i]))
  paginas.sort((x, y) => ((idx.get(x.secao_id) ?? 0) - (idx.get(y.secao_id) ?? 0)) || x.ordem - y.ordem)
  return { secoes, paginas, pagina_limite: LIMITES.paginasPorSecaoArvore }
}
