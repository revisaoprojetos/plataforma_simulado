// Caderno (beta) — lógica de servidor do notebook do aluno. SEM 'server-only' e sem imports estáticos de módulos server-only
// (o supabase client entra por parâmetro; loaders pesados por import dinâmico) para ser testável com vitest (node).
import {
  ALINHAMENTOS, ANOTACAO_ORIGENS, DOC_VAZIO, ESTILOS_PARAGRAFO, LIMITES, MARCAS_PARAGRAFO, RECUO_MAX, MARKS_PERMITIDOS, NOS_ATOMICOS, NOS_PERMITIDOS, ORDENAR_POR,
  type DocJson, type Lixeira, type OrdenarPor, type PaginaArvore, type SecaoArvore,
} from '@/lib/aluno/notebook-tipos'
import { normalizarNiveis, ordenarArvore } from '@/lib/aluno/notebook-arvore'
import { criarFolhaVazia, serializarFolha, tamanhoBytes, LIMITES_FOLHA, validarFolha, type Folha } from '@/lib/aluno/notebook-folha'
import { htmlParaTexto } from './notebook-texto-html'
import { arquivoAnexoValido, corValida, familiaValida, larguraImagemValida, srcImagemValido, tamanhoFonteValido } from './notebook-texto'

// ================================================================ erros de banco
/** Tabela/coluna ausente (migração não aplicada): Postgres 42P01 ou PostgREST PGRST205/PGRST204. */
export function tabelaAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204' || e.code === '42703') return true
  const m = String(e.message ?? '')
  return /relation .*simulado_aluno_notebook.* does not exist|could not find the table .*simulado_aluno_notebook/i.test(m)
}

/** RPC ausente (migração 20261129020000 não aplicada): PostgREST PGRST202 (não está no schema cache) ou Postgres 42883 (undefined_function). */
export function rpcAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined
  if (!e) return false
  if (e.code === 'PGRST202' || e.code === '42883') return true
  return /could not find the function|function .* does not exist/i.test(String(e.message ?? ''))
}

/** Coluna ausente (migração fase 2 não aplicada): Postgres 42703 / PostgREST PGRST204 / mensagem "column ... does not exist". */
export function colunaAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined
  if (!e) return false
  if (e.code === '42703' || e.code === 'PGRST204') return true
  return /column .* does not exist|could not find the .* column/i.test(String(e.message ?? ''))
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
      const cor = isObj(m.attrs) ? corValida(m.attrs.color) : null
      out.push(cor ? { type: 'highlight', attrs: { color: cor } } : { type: 'highlight' })
    } else if (m.type === 'textStyle') {
      const at = isObj(m.attrs) ? m.attrs : {}
      const ts: Record<string, string> = {}
      const cor = corValida(at.color); if (cor) ts.color = cor
      const fam = familiaValida(at.fontFamily); if (fam) ts.fontFamily = fam
      const tam = tamanhoFonteValido(at.fontSize); if (tam) ts.fontSize = tam
      if (!Object.keys(ts).length) continue // sem estilo válido: descarta a mark, mantém o texto
      out.push({ type: 'textStyle', attrs: ts })
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

/** Atributos de bloco (parágrafo/título): alinhamento, recuo, marca na margem e estilo especial. */
function bloco(at: Record<string, unknown>, out: Record<string, unknown>) {
  if (typeof at.textAlign === 'string' && (ALINHAMENTOS as readonly string[]).includes(at.textAlign) && at.textAlign !== 'left') out.textAlign = at.textAlign
  const rec = inteiro(at.indent, 1, RECUO_MAX); if (rec) out.indent = rec
  if (typeof at.marca === 'string' && (MARCAS_PARAGRAFO as readonly string[]).includes(at.marca)) out.marca = at.marca
  if (typeof at.estilo === 'string' && (ESTILOS_PARAGRAFO as readonly string[]).includes(at.estilo)) out.estilo = at.estilo
}

function sanitAttrs(tipo: string, a: unknown): Record<string, unknown> | undefined {
  const at = isObj(a) ? a : {}
  const out: Record<string, unknown> = {}
  switch (tipo) {
    case 'paragraph': bloco(at, out); break
    case 'heading': {
      const level = inteiro(at.level, 1, 6)
      if (!level) rej('heading: level deve ser 1-6')
      out.level = level
      bloco(at, out)
      break
    }
    case 'image': {
      const src = srcImagemValido(at.src)
      if (!src) rej('image: src deve apontar para a rota de arquivos do caderno')
      out.src = src
      const alt = texto(at.alt, 300); if (alt) out.alt = alt
      const w = larguraImagemValida(at.width); if (w) out.width = w
      break
    }
    case 'anexo': {
      const arq = arquivoAnexoValido(at.arquivo)
      if (!arq) rej('anexo: arquivo inválido')
      out.arquivo = arq
      out.nome = (texto(at.nome, LIMITES.anexoNomeMax) ?? '').replace(/[\u0000-\u001f\u007f]/g, '') || 'arquivo'
      const t = inteiro(at.tamanho, 0, LIMITES.anexoBytesMax); if (t !== undefined) out.tamanho = t
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
      // documento_id/pagina são OPCIONAIS: o front declara `pagina: null` por padrão e a importação (20261127010000) cria notas
      // sem eles. Ausente/null => omitido; presente porém inválido => rejeita. Attrs desconhecidos (origem_item_id etc.) são descartados.
      if (at.documento_id !== undefined && at.documento_id !== null) {
        const doc = uuid(at.documento_id)
        if (!doc) rej('grifoSnapshot: documento_id inválido')
        out.documento_id = doc
      }
      if (at.pagina !== undefined && at.pagina !== null) {
        const pagina = inteiro(at.pagina, 0, 1_000_000)
        if (pagina === undefined) rej('grifoSnapshot: pagina inválida')
        out.pagina = pagina
      }
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

/**
 * Valida a tinta (folha livre) no servidor: schema + limites + 1 MB. Devolve a folha COMPACTADA/normalizada (v3).
 * O `doc` de cada caixa passa pela MESMA lista branca das páginas de texto (sanitizarDoc: nós/marks/attrs, links, imagens, anexos,
 * profundidade, nº de nós e bytes); doc inválido => recusa a folha inteira (a rota responde 422).
 */
export function sanitizarTinta(entrada: unknown): TintaResultado {
  const r = validarFolha(entrada)
  if (!r.ok) return { ok: false, erro: r.erro }
  let folha: Folha = r.folha
  if (folha.caixas.some((c) => c.doc)) {
    const caixas: Folha['caixas'] = []
    for (const c of folha.caixas) {
      if (!c.doc) { caixas.push(c); continue }
      const d = sanitizarDoc(c.doc)
      if (!d.ok) return { ok: false, erro: `Caixa de texto inválida: ${d.erro}` }
      caixas.push({ ...c, doc: d.doc as unknown as Record<string, unknown> })
    }
    folha = { ...folha, caixas }
  }
  const serial = serializarFolha(folha)
  const bytes = tamanhoBytes(serial)
  if (bytes > LIMITES_FOLHA.bytes) return { ok: false, erro: 'Folha maior que 1 MB.' }
  return { ok: true, folha: JSON.parse(serial) as Folha, bytes }
}

export const tintaVazia = (): Folha => criarFolhaVazia()

/** Texto das caixas de texto da folha (ordem de leitura: y, depois x) para `texto_busca`. */
export function extrairTextoFolha(folha: unknown): string {
  const caixas = (folha as { caixas?: unknown } | null)?.caixas
  if (!Array.isArray(caixas)) return ''
  // v3: o texto sai do `doc` (mesma extração das páginas de texto); caixa legada (v1/v2) usa `texto`.
  const textoCaixa = (c: any): string => (c?.doc && typeof c.doc === 'object' ? extrairTexto(c.doc) : typeof c?.texto === 'string' ? c.texto.trim() : '')
  return caixas
    .filter((c: any) => c && typeof c === 'object')
    .map((c: any) => ({ x: c.x ?? 0, y: c.y ?? 0, t: textoCaixa(c) }))
    .filter((c) => c.t)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((c) => c.t)
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

/** Todas as ocorrências (trechos) dos termos de `q` em `texto`, sem sobreposição, até `max`. Usado na busca com escopo 'pagina'. */
export function ocorrenciasBusca(texto: string, q: string, max: number = LIMITES.ocorrenciasMax, tam = 140): string[] {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  const termos = [...new Set(q.toLowerCase().split(/\s+/).filter((x) => x.length >= 2))]
  if (!t || termos.length === 0) return []
  const baixo = t.toLowerCase()
  const posicoes: number[] = []
  for (const termo of termos) {
    let i = baixo.indexOf(termo)
    while (i >= 0 && posicoes.length < max * 4) { posicoes.push(i); i = baixo.indexOf(termo, i + termo.length) }
  }
  posicoes.sort((a, b) => a - b)
  const out: string[] = []
  let fimAnterior = -1
  for (const pos of posicoes) {
    if (pos < fimAnterior) continue // já coberta pelo trecho anterior
    const ini = Math.max(0, pos - 50)
    const fim = Math.min(t.length, ini + tam)
    out.push((ini > 0 ? '…' : '') + t.slice(ini, fim) + (fim < t.length ? '…' : ''))
    fimAnterior = fim
    if (out.length >= max) break
  }
  return out
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

const CACHE_CONTAGEM_ERROS_MS = 60_000
const cacheContagemErros = new Map<string, { n: number; ate: number }>()

/** Rpc ausente OU função quebrada por coluna ausente => segue no caminho antigo (migração 20261129030000 pendente). */
/**
 * Quantidade de questões em "Meus erros". Preferência: RPC `notebook_contar_erros` (migração 20261129030000; count no banco, sem baixar
 * respostas). Sem a RPC (ou erro) cai no caminho antigo (`idsErrosAluno`: baixa as respostas). Cache de 60 s por tenant+estudante.
 */
export async function contarErrosAluno(svc: any, tenantId: string, estudanteId: string): Promise<number> {
  const k = `${tenantId}:${estudanteId}`
  const agora = Date.now()
  const c = cacheContagemErros.get(k)
  if (c && c.ate > agora) return c.n
  const r = await svc.rpc('notebook_contar_erros', { p_tenant: tenantId, p_estudante: estudanteId })
  let n: number
  if (!r.error && r.data !== null && r.data !== undefined && Number.isFinite(Number(r.data))) n = Number(r.data)
  else n = (await idsErrosAluno(svc, tenantId, estudanteId)).length
  if (cacheContagemErros.size > 500) { for (const [key, v] of cacheContagemErros) if (v.ate <= agora) cacheContagemErros.delete(key); if (cacheContagemErros.size > 500) cacheContagemErros.clear() }
  cacheContagemErros.set(k, { n, ate: agora + CACHE_CONTAGEM_ERROS_MS })
  return n
}

/** Limpa os caches de erros (testes). */
export function limparCacheErros() { cacheErros.clear(); cacheContagemErros.clear() }

/** `enunciado` (pode ser HTML legado) -> texto limpo, espaços colapsados, até 400 caracteres. */
export function enunciadoTexto(enunciado: unknown): string {
  return htmlParaTexto(enunciado).replace(/\s+/g, ' ').trim().slice(0, 400)
}
/** Acrescenta `enunciado_texto` (compatível: o campo `enunciado` original continua no item). */
export function comEnunciadoTexto<T extends { enunciado?: unknown }>(itens: T[]): (T & { enunciado_texto: string })[] {
  return itens.map((q) => ({ ...q, enunciado_texto: enunciadoTexto(q.enunciado) }))
}

export async function listarAutoErros(svc: any, tenantId: string, estudanteId: string, offset: number, limit: number) {
  const { questoesParaAluno } = await import('@/lib/aluno/cadernos-aluno')
  // RPC paginada (ids + total no banco); sem ela, caminho antigo (todas as respostas em memória, cache 60 s)
  const r = await svc.rpc('notebook_listar_erros', { p_tenant: tenantId, p_estudante: estudanteId, p_offset: offset, p_limit: limit })
  if (!r.error && Array.isArray(r.data)) {
    const rows = r.data as { questao_id: string; total: number | string }[]
    const total = rows.length ? Number(rows[0].total) : (offset > 0 ? await contarErrosAluno(svc, tenantId, estudanteId) : 0)
    const itens = await questoesParaAluno(svc, tenantId, estudanteId, rows.map((x) => x.questao_id))
    return { total, itens: comEnunciadoTexto(itens) }
  }
  const ids = await idsErrosAluno(svc, tenantId, estudanteId)
  const fatia = ids.slice(offset, offset + limit)
  return { total: ids.length, itens: comEnunciadoTexto(await questoesParaAluno(svc, tenantId, estudanteId, fatia)) }
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
  return { total: count ?? 0, itens: comEnunciadoTexto(await questoesParaAluno(svc, tenantId, estudanteId, ids, { ocultarGabaritoNaoRespondidas: true })) }
}

// ================================================================ árvore leve (SEM doc)
export interface ArvoreArgs { tenantId: string; estudanteId: string; notebookId: string; secaoId?: string; offset?: number; limit?: number }

const COLS_SEC_BASE = 'id, nome, cor, ordem, tipo'
const COLS_PAG_BASE = 'id, secao_id, titulo, tipo_pagina, ordem, criado_em, atualizado_em'
const COLS_PAG_F2 = `${COLS_PAG_BASE}, nivel, fundo, regua`

/** Garante os campos fase 2 com defaults (linha vinda de select legado ou coluna nula). */
export function completarPagina(p: any): PaginaArvore {
  return {
    ...p,
    nivel: typeof p.nivel === 'number' ? p.nivel : 0,
    criado_em: p.criado_em ?? null,
    fundo: p.fundo ?? null,
    regua: p.regua ?? null,
  }
}
const ordenarPorValido = (v: unknown): OrdenarPor => ((ORDENAR_POR as readonly string[]).includes(v as string) ? (v as OrdenarPor) : 'manual')

/** Páginas vivas e não arquivadas por seção em UMA consulta (RPC `notebook_contar_paginas`, migração 20261129030000). null = RPC ausente/erro. */
async function contarPaginasPorSecao(svc: any, tenantId: string, estudanteId: string): Promise<Map<string, number> | null> {
  try {
    const r = await svc.rpc('notebook_contar_paginas', { p_tenant: tenantId, p_estudante: estudanteId })
    if (r.error || !Array.isArray(r.data)) return null
    return new Map((r.data as { secao_id: string; qtd: number | string }[]).map((x) => [x.secao_id, Number(x.qtd)]))
  } catch { return null }
}

export async function montarArvore(svc: any, a: ArvoreArgs) {
  // Tolerância à migração fase 2: tenta com `ordenar_por`; se a coluna não existe, refaz sem ela e segue em modo legado.
  let fase2 = true
  const lerSecoes = (cols: string) => svc.from('simulado_aluno_notebook_secoes')
    .select(cols).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', a.notebookId)
    .is('deletado_em', null).order('ordem', { ascending: true }).order('id', { ascending: true }).limit(500)
  // seções e contagem agregada por seção em paralelo (a contagem não depende das seções)
  const [rs0, contagens] = await Promise.all([lerSecoes(`${COLS_SEC_BASE}, ordenar_por`), contarPaginasPorSecao(svc, a.tenantId, a.estudanteId)])
  let rs = rs0
  if (rs.error && colunaAusente(rs.error)) { fase2 = false; rs = await lerSecoes(COLS_SEC_BASE) }
  if (rs.error) return { error: rs.error as unknown }
  const secoes: SecaoArvore[] = (rs.data ?? []).map((s: any) => ({ ...s, ordenar_por: ordenarPorValido(s.ordenar_por), qtd_paginas: 0 }))

  const limit = Math.min(Math.max(a.limit ?? LIMITES.paginasPorSecaoArvore, 1), LIMITES.paginasPorSecaoArvore)
  const offset = Math.max(a.offset ?? 0, 0)
  const alvo = a.secaoId ? secoes.filter((s) => s.id === a.secaoId) : secoes
  const porSecao = new Map<string, PaginaArvore[]>()
  let erro: unknown = null

  // contagem das automáticas (somente leitura) corre EM PARALELO com a leitura das páginas
  const autos = Promise.all(alvo.map(async (s) => {
    if (s.tipo === 'auto_erros') s.qtd_paginas = await contarErrosAluno(svc, a.tenantId, a.estudanteId)
    else if (s.tipo === 'auto_favoritos') s.qtd_paginas = await contarFavoritos(svc, a.estudanteId)
  }))

  const manuais = alvo.filter((s) => !s.tipo.startsWith('auto_'))
  for (let i = 0; i < manuais.length && !erro; i += 10) {
    await Promise.all(manuais.slice(i, i + 10).map(async (s) => {
      // ordenação não-manual precisa ver a seção inteira (até ordenarMax) para ordenar; a fatia offset/limit sai DEPOIS.
      const emMemoria = fase2 && s.ordenar_por !== 'manual'
      // com a contagem agregada (RPC) não precisa de `count: exact` por seção
      const ler = (cols: string) => svc.from('simulado_aluno_notebook_paginas')
        .select(cols, contagens ? undefined : { count: 'exact' })
        .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('secao_id', s.id)
        .is('deletado_em', null).eq('arquivada', false)
        .order('ordem', { ascending: true }).order('id', { ascending: true })
        .range(emMemoria ? 0 : offset, emMemoria ? LIMITES.ordenarMax - 1 : offset + limit - 1)
      let r = await ler(fase2 ? COLS_PAG_F2 : COLS_PAG_BASE)
      if (r.error && fase2 && colunaAusente(r.error)) r = await ler(COLS_PAG_BASE)
      if (r.error) { erro = r.error; return }
      s.qtd_paginas = contagens ? (contagens.get(s.id) ?? 0) : (r.count ?? 0)
      let lista = (r.data ?? []).map(completarPagina)
      if (emMemoria) lista = ordenarArvore(lista, s.ordenar_por).slice(offset, offset + limit)
      porSecao.set(s.id, lista)
    }))
  }
  await autos.catch(() => { /* contagem das automáticas é best-effort: mantém 0 */ })
  if (erro) return { error: erro }

  // saída: seções na ordem das seções; páginas já na ordem final de cada seção (manual = ordem; demais = ordenarArvore)
  const paginas: PaginaArvore[] = secoes.flatMap((s) => porSecao.get(s.id) ?? [])
  return { secoes, paginas, pagina_limite: LIMITES.paginasPorSecaoArvore }
}

// ================================================================ normalização de níveis (efeito colateral de nível/mover/copiar)
/**
 * Relê a sequência (ordem, id) das páginas vivas da seção e corrige os níveis para respeitar nivel[i] <= nivel[i-1]+1.
 * Só atualiza as linhas que mudam (e incrementa `versao` delas). Preferência: RPC atômica `notebook_normalizar_niveis`
 * (migração 20261129020000, filtra tenant+estudante dentro da função, trava a seção); sem a RPC cai no caminho por linha.
 * Tolera ausência da coluna (migração fase 2 pendente => não faz nada).
 */
export async function normalizarNiveisSecao(svc: any, ctx: { tenantId: string; estudanteId: string }, secaoId: string): Promise<{ error: unknown } | null> {
  const rpc = await svc.rpc('notebook_normalizar_niveis', { p_tenant: ctx.tenantId, p_estudante: ctx.estudanteId, p_secao: secaoId })
  if (!rpc.error) return null
  if (colunaAusente(rpc.error)) return null
  if (!rpcAusente(rpc.error)) return { error: rpc.error }
  // fallback (RPC não aplicada): UPDATE por linha, com guarda de versão
  const { data, error } = await svc.from('simulado_aluno_notebook_paginas').select('id, nivel, versao')
    .eq('tenant_id', ctx.tenantId).eq('estudante_id', ctx.estudanteId).eq('secao_id', secaoId).is('deletado_em', null)
    .order('ordem', { ascending: true }).order('id', { ascending: true }).limit(2000)
  if (error) return colunaAusente(error) ? null : { error }
  const linhas: { id: string; nivel: number; versao: number }[] = data ?? []
  const novos = normalizarNiveis(linhas.map((l) => l.nivel ?? 0))
  for (let i = 0; i < linhas.length; i++) {
    if (novos[i] === linhas[i].nivel) continue
    const u = await svc.from('simulado_aluno_notebook_paginas').update({ nivel: novos[i], versao: (linhas[i].versao ?? 1) + 1 }).eq('id', linhas[i].id)
      .eq('tenant_id', ctx.tenantId).eq('estudante_id', ctx.estudanteId).eq('versao', linhas[i].versao ?? 1)
    if (u.error) return { error: u.error }
  }
  return null
}

// ================================================================ lixeira (60 dias)
export function limiteLixeiraISO(agora = Date.now()): string {
  return new Date(agora - LIMITES.lixeiraDias * 86_400_000).toISOString()
}

/** Páginas e seções apagadas nos últimos 60 dias (cada lista paginada com .range()+count). Seção de origem resolvida com .in() em chunks de 80. */
export async function montarLixeira(svc: any, a: { tenantId: string; estudanteId: string; offset: number; limit: number }): Promise<{ lixeira: Lixeira } | { error: unknown }> {
  const desde = limiteLixeiraISO()
  const [rp, rsec] = await Promise.all([
    svc.from('simulado_aluno_notebook_paginas').select('id, titulo, secao_id, deletado_em', { count: 'exact' })
      .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).not('deletado_em', 'is', null).gte('deletado_em', desde)
      .order('deletado_em', { ascending: false }).order('id', { ascending: true }).range(a.offset, a.offset + a.limit - 1),
    svc.from('simulado_aluno_notebook_secoes').select('id, nome, cor, deletado_em', { count: 'exact' })
      .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).not('deletado_em', 'is', null).gte('deletado_em', desde)
      .order('deletado_em', { ascending: false }).order('id', { ascending: true }).range(a.offset, a.offset + a.limit - 1),
  ])
  if (rp.error) return { error: rp.error }
  if (rsec.error) return { error: rsec.error }

  const idsSecao = [...new Set((rp.data ?? []).map((p: any) => p.secao_id as string))]
  const nomes = new Map<string, { nome: string; deletada: boolean }>()
  const buscarNomes = async (): Promise<unknown> => {
    for (let i = 0; i < idsSecao.length; i += 80) {
      const r = await svc.from('simulado_aluno_notebook_secoes').select('id, nome, deletado_em')
        .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).in('id', idsSecao.slice(i, i + 80))
      if (r.error) return r.error
      for (const s of r.data ?? []) nomes.set(s.id, { nome: s.nome, deletada: !!s.deletado_em })
    }
    return null
  }
  // quantas páginas foram apagadas junto de cada seção da lista (mesmo instante exato de deletado_em; a exclusão grava o MESMO instante).
  // UMA consulta estreita (secao_id, deletado_em) por chunk de 80 seções; se bater o teto, cai na contagem por seção.
  const qtd = new Map<string, number>()
  const CONTAR_TETO = 5000
  const contarJuntas = async () => {
    const secoesLixo: { id: string; deletado_em: string }[] = rsec.data ?? []
    for (let i = 0; i < secoesLixo.length; i += 80) {
      const chunk = secoesLixo.slice(i, i + 80)
      const r = await svc.from('simulado_aluno_notebook_paginas').select('secao_id, deletado_em')
        .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).in('secao_id', chunk.map((s) => s.id)).not('deletado_em', 'is', null).limit(CONTAR_TETO)
      const linhas: { secao_id: string; deletado_em: string }[] = r.data ?? []
      if (r.error || linhas.length >= CONTAR_TETO) {
        await Promise.all(chunk.map(async (s) => {
          const c = await svc.from('simulado_aluno_notebook_paginas').select('id', { count: 'exact', head: true })
            .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('secao_id', s.id).eq('deletado_em', s.deletado_em)
          qtd.set(s.id, c.count ?? 0)
        }))
        continue
      }
      for (const s of chunk) qtd.set(s.id, linhas.filter((l) => l.secao_id === s.id && l.deletado_em === s.deletado_em).length)
    }
  }
  const [erroNomes] = await Promise.all([buscarNomes(), contarJuntas()])
  if (erroNomes) return { error: erroNomes }
  return {
    lixeira: {
      dias: LIMITES.lixeiraDias,
      total_paginas: rp.count ?? 0,
      total_secoes: rsec.count ?? 0,
      paginas: (rp.data ?? []).map((p: any) => ({
        id: p.id, titulo: p.titulo, secao_id: p.secao_id, deletado_em: p.deletado_em,
        secao_nome: nomes.get(p.secao_id)?.nome ?? null, secao_deletada: nomes.get(p.secao_id)?.deletada ?? true,
      })),
      secoes: (rsec.data ?? []).map((s: any) => ({ id: s.id, nome: s.nome, cor: s.cor ?? null, deletado_em: s.deletado_em, qtd_paginas: qtd.get(s.id) ?? 0 })),
    },
  }
}
