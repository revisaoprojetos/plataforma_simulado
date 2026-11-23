// FOLHA LIVRE + CANETA (Caderno beta, fase 3) — núcleo PURO (sem React, sem I/O).
// Formato persistido em `simulado_aluno_notebook_paginas.tinta` (jsonb) quando tipo_pagina='folha_livre'.
// Cores: o traço guarda um NOME da paleta fixa (PALETA_FOLHA, resolvido por CSS var) OU, desde a v2, uma cor-DADO escolhida
// pelo aluno na caneta (`#rrggbb`, validado por regex estrita no servidor).
// VERSÕES: v1 = só paleta nomeada; v2 = + cor hex por traço (caneta/marca-texto do ribbon) e tela que cresce também na largura.
// v3 = caixas de texto com RICH TEXT: cada caixa guarda `doc` (JSON TipTap, mesma lista branca das páginas de texto) no lugar do
// `texto` (string). Leitura é retrocompatível: v1/v2/v3 são aceitas e normalizadas para v3 EM MEMÓRIA (caixa com `texto` vira `doc`
// de parágrafos); o banco só é reescrito quando o aluno salva.
import { z } from 'zod'
import { novoUuid } from './notebook-uuid'

export const FOLHA_VERSAO = 3 as const
export const LIMITES_FOLHA = {
  tracos: 5000,
  pontosPorTraco: 20000,
  pontosTotal: 150_000, // soma de pontos de todos os traços (1 MB serializado já limita a ~125k; contagem barata ANTES do zod)
  caixas: 300,
  bytes: 1_000_000, // 1 MB serializado
  textoCaixa: 20000,
  historico: 50,
  larguraMin: 200,
  larguraMax: 20000,
  alturaMax: 100000,
  coordMax: 200000,
} as const

export const PALETA_FOLHA = ['tinta', 'primaria', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'rosa'] as const
export type CorFolha = (typeof PALETA_FOLHA)[number]
export const FERRAMENTAS_TRACO = ['caneta', 'marca-texto', 'borracha'] as const
export type FerramentaTraco = (typeof FERRAMENTAS_TRACO)[number]
/** Cor de um traço: nome da paleta ou `#rrggbb` (v2). */
export type CorTraco = CorFolha | `#${string}`
export const REGEX_COR_HEX = /^#[0-9a-fA-F]{6}$/
export const ehCorHex = (c: string): boolean => REGEX_COR_HEX.test(c)

/** Cor do traço -> valor CSS: nome da paleta vira CSS var (definidas no root da folha); hex válido passa direto; o resto cai na tinta padrão. */
export const corParaVar = (c: string): string =>
  ehCorHex(c) ? c : (PALETA_FOLHA as readonly string[]).includes(c) ? `var(--folha-cor-${c})` : 'var(--folha-cor-tinta)'

/** `#rrggbb` -> [r,g,b] em 0..1 (exportação PDF). null se inválida. */
export function rgbDeHex(c: string): [number, number, number] | null {
  if (!ehCorHex(c)) return null
  return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]
}

export type Ponto = [number, number, number] // x, y, pressão (0..1)

export interface TracoFolha {
  id: string
  ferramenta: FerramentaTraco
  cor: CorTraco
  largura: number
  pontos: Ponto[]
}
export interface CaixaFolha {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  /** LEGADO (v1/v2): texto simples. Só existe antes da normalização; `migrarFolha` converte em `doc`. */
  texto?: string
  /** Rich text (v3): doc TipTap. Ausente = caixa ainda sem conteúdo. */
  doc?: Record<string, unknown>
}
export interface FundoFolha {
  tipo: 'pdf' | 'nenhum'
  documento_id?: string
  pagina?: number
}
export interface Folha {
  versao: 1 | 2 | 3
  largura: number
  altura: number
  caixas: CaixaFolha[]
  tracos: TracoFolha[]
  fundo?: FundoFolha
}

const num = z.number().finite().min(-LIMITES_FOLHA.coordMax).max(LIMITES_FOLHA.coordMax)
const idZ = z.string().min(1).max(64)

export const pontoSchema = z.tuple([num, num, z.number().finite().min(0).max(1)])
export const tracoSchema = z.object({
  id: idZ,
  ferramenta: z.enum(FERRAMENTAS_TRACO),
  cor: z.union([z.enum(PALETA_FOLHA), z.string().regex(REGEX_COR_HEX)]),
  largura: z.number().finite().min(0.5).max(80),
  pontos: z.array(pontoSchema).min(1).max(LIMITES_FOLHA.pontosPorTraco),
})
export const caixaSchema = z.object({
  id: idZ,
  x: num,
  y: num,
  w: z.number().finite().min(20).max(LIMITES_FOLHA.larguraMax),
  h: z.number().finite().min(20).max(LIMITES_FOLHA.alturaMax),
  z: z.number().int().min(0).max(1_000_000),
  texto: z.string().max(LIMITES_FOLHA.textoCaixa).optional(),
  doc: z.record(z.string(), z.unknown()).optional(),
})
export const fundoSchema = z.object({
  tipo: z.enum(['pdf', 'nenhum']),
  documento_id: z.string().uuid().optional(),
  pagina: z.number().int().min(0).max(100000).optional(),
})
export const folhaSchema = z.object({
  versao: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  largura: z.number().finite().min(LIMITES_FOLHA.larguraMin).max(LIMITES_FOLHA.larguraMax),
  altura: z.number().finite().min(LIMITES_FOLHA.larguraMin).max(LIMITES_FOLHA.alturaMax),
  caixas: z.array(caixaSchema).max(LIMITES_FOLHA.caixas),
  tracos: z.array(tracoSchema).max(LIMITES_FOLHA.tracos),
  fundo: fundoSchema.optional(),
})

export function criarFolhaVazia(largura = 1200, altura = 1600): Folha {
  return { versao: FOLHA_VERSAO, largura, altura, caixas: [], tracos: [] }
}

export const gerarId = novoUuid

// ---------- serialização compacta ----------
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** Arredonda coordenadas (0,1 px) e pressão (0,01) — reduz bastante o JSON. Não muta a entrada. */
export function compactarFolha(f: Folha): Folha {
  return {
    ...f,
    tracos: f.tracos.map((t) => ({ ...t, pontos: t.pontos.map(([x, y, p]) => [r1(x), r1(y), r2(p)] as Ponto) })),
    caixas: f.caixas.map((c) => ({ ...c, x: r1(c.x), y: r1(c.y), w: r1(c.w), h: r1(c.h) })),
  }
}
export const serializarFolha = (f: Folha): string => JSON.stringify(compactarFolha(f))
export function tamanhoBytes(s: string): number {
  return new TextEncoder().encode(s).length
}

export type ResultadoFolha = { ok: true; folha: Folha; bytes: number } | { ok: false; erro: string }

// ---------- texto das caixas (string <-> doc TipTap) ----------
type NoDoc = { type?: string; text?: string; content?: NoDoc[] }
const NOS_BLOCO_TEXTO = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'codeBlock', 'tableRow', 'blockquote'])
const NOS_COM_CONTEUDO = new Set(['image', 'anexo', 'horizontalRule', 'table', 'grifoSnapshot', 'questaoRef', 'anotacaoRef'])

/** Texto simples -> doc TipTap (1 parágrafo por linha; linha vazia = parágrafo vazio). Trunca em `textoCaixa`. */
export function docDeTexto(texto: string): Record<string, unknown> {
  const linhas = (texto ?? '').slice(0, LIMITES_FOLHA.textoCaixa).replace(/\r\n?/g, '\n').split('\n')
  return { type: 'doc', content: linhas.map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) }
}

/** Texto simples de um doc TipTap (blocos separados por \n; células por espaço). Profundidade limitada (60). */
export function textoDeDoc(doc: unknown): string {
  const partes: string[] = []
  const visita = (n: NoDoc | null | undefined, prof: number) => {
    if (!n || typeof n !== 'object' || prof > 60) return
    if (n.type === 'text') { if (typeof n.text === 'string') partes.push(n.text); return }
    if (n.type === 'hardBreak') { partes.push('\n'); return }
    if (Array.isArray(n.content)) for (const c of n.content) visita(c, prof + 1)
    if (n.type === 'tableCell' || n.type === 'tableHeader') partes.push(' ')
    else if (n.type && NOS_BLOCO_TEXTO.has(n.type)) partes.push('\n')
  }
  visita(doc as NoDoc, 0)
  return partes.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** O doc tem algo a guardar? (texto não vazio OU imagem/anexo/tabela/linha/ref). Caixa sem conteúdo é descartada ao perder o foco. */
export function docTemConteudo(doc: unknown): boolean {
  const visita = (n: NoDoc | null | undefined, prof: number): boolean => {
    if (!n || typeof n !== 'object' || prof > 60) return false
    if (n.type === 'text') return typeof n.text === 'string' && n.text.trim().length > 0
    if (n.type && NOS_COM_CONTEUDO.has(n.type)) return true
    return Array.isArray(n.content) && n.content.some((c) => visita(c, prof + 1))
  }
  return visita(doc as NoDoc, 0)
}

/** Texto simples da caixa (doc tem prioridade; cai no `texto` legado). */
export const textoDeCaixa = (c: Pick<CaixaFolha, 'texto' | 'doc'>): string => (c.doc ? textoDeDoc(c.doc) : (c.texto ?? ''))
export const caixaTemConteudo = (c: Pick<CaixaFolha, 'texto' | 'doc'>): boolean => (c.doc ? docTemConteudo(c.doc) : (c.texto ?? '').trim().length > 0)

/**
 * v1/v2 -> v3 (idempotente; mesma referência se já é v3 sem `texto` legado). Caixa com `texto` vira `doc` de parágrafos
 * (se já tem `doc`, o doc vence); caixa sem texto nem doc fica sem `doc`. Só mexe nas caixas e na versão.
 */
export function migrarFolha(f: Folha): Folha {
  const legado = f.caixas.some((c) => c.texto !== undefined)
  if (f.versao === FOLHA_VERSAO && !legado) return f
  const caixas = legado
    ? f.caixas.map((c): CaixaFolha => {
        if (c.texto === undefined) return c
        const { texto, ...resto } = c
        return resto.doc ? resto : texto.trim() ? { ...resto, doc: docDeTexto(texto) } : resto
      })
    : f.caixas
  return { ...f, versao: FOLHA_VERSAO, caixas }
}

/** Contagem BARATA (sem zod) de traços/caixas/pontos de uma folha ainda não validada. Devolve o motivo da recusa ou null. */
export function excedeLimitesBaratos(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null
  const f = obj as { tracos?: unknown; caixas?: unknown }
  if (Array.isArray(f.caixas) && f.caixas.length > LIMITES_FOLHA.caixas) return 'Caixas demais na folha.'
  if (Array.isArray(f.tracos)) {
    if (f.tracos.length > LIMITES_FOLHA.tracos) return 'Traços demais na folha.'
    let total = 0
    for (const t of f.tracos) {
      const pts = (t as { pontos?: unknown } | null)?.pontos
      if (Array.isArray(pts)) {
        if (pts.length > LIMITES_FOLHA.pontosPorTraco) return 'Traço com pontos demais.'
        total += pts.length
        if (total > LIMITES_FOLHA.pontosTotal) return 'Folha com pontos demais.'
      }
    }
  }
  return null
}

/** Valida (zod + limites + 1 MB). Aceita objeto ou string JSON. */
export function validarFolha(entrada: unknown): ResultadoFolha {
  let obj = entrada
  if (typeof entrada === 'string') {
    if (tamanhoBytes(entrada) > LIMITES_FOLHA.bytes) return { ok: false, erro: 'Folha maior que 1 MB.' }
    try { obj = JSON.parse(entrada) } catch { return { ok: false, erro: 'JSON inválido.' } }
  }
  const barato = excedeLimitesBaratos(obj)
  if (barato) return { ok: false, erro: barato }
  const r = folhaSchema.safeParse(obj)
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Folha inválida.' }
  const folha = migrarFolha(r.data as Folha)
  for (const c of folha.caixas) {
    if (c.doc && (c.doc as { type?: unknown }).type !== 'doc') return { ok: false, erro: 'Caixa de texto inválida.' }
    if (c.doc && textoDeDoc(c.doc).length > LIMITES_FOLHA.textoCaixa) return { ok: false, erro: 'Texto da caixa grande demais.' }
  }
  const bytes = tamanhoBytes(serializarFolha(folha))
  if (bytes > LIMITES_FOLHA.bytes) return { ok: false, erro: 'Folha maior que 1 MB.' }
  return { ok: true, folha, bytes }
}

// Estimativa INCREMENTAL de tamanho: cada traço/caixa tem o seu tamanho medido UMA vez (WeakMap por identidade do objeto; as
// atualizações da folha são imutáveis, então os objetos inalterados reaproveitam a medida). A soma é O(n) em lookups — sem
// serializar a folha inteira a cada traço. A medida do traço usa o JSON SEM arredondar (>= o serializado compacto): a estimativa
// nunca subestima. Só perto do limite (> LIMIAR_EXATO) cai na serialização exata de antes.
const LIMIAR_EXATO = 0.85
const MARGEM_CABECALHO = 512
const tamObj = new WeakMap<object, number>()
function tamanhoDe(o: object, bytes = false): number {
  let n = tamObj.get(o)
  if (n === undefined) { const j = JSON.stringify(o); n = bytes ? tamanhoBytes(j) : j.length; tamObj.set(o, n) }
  return n
}
/** Estimativa (limite superior) do JSON serializado da folha, sem stringify global. */
export function estimarBytesFolha(f: Folha): number {
  let n = MARGEM_CABECALHO
  for (const t of f.tracos) n += tamanhoDe(t) + 1
  for (const c of f.caixas) n += tamanhoDe(c, true) + 1
  return n
}

/** Pode adicionar este traço sem estourar limites? (usado antes de commitar na UI) */
export function podeAdicionarTraco(f: Folha, t: TracoFolha): boolean {
  if (f.tracos.length >= LIMITES_FOLHA.tracos) return false
  if (t.pontos.length > LIMITES_FOLHA.pontosPorTraco) return false
  if (estimarBytesFolha(f) + tamanhoDe(t) + 1 <= LIMITES_FOLHA.bytes * LIMIAR_EXATO) return true
  return tamanhoBytes(serializarFolha({ ...f, tracos: [...f.tracos, t] })) <= LIMITES_FOLHA.bytes
}

// ---------- geometria ----------
export function distPontoSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Ramer–Douglas–Peucker (iterativo, sem recursão — traços longos). Preserva extremos e a pressão do ponto mantido. */
export function simplificarPontos(pontos: Ponto[], epsilon = 0.6): Ponto[] {
  const n = pontos.length
  if (n <= 2 || epsilon <= 0) return pontos.slice()
  const manter = new Uint8Array(n)
  manter[0] = 1
  manter[n - 1] = 1
  const pilha: Array<[number, number]> = [[0, n - 1]]
  while (pilha.length) {
    const [i, j] = pilha.pop()!
    let maxD = 0, idx = -1
    for (let k = i + 1; k < j; k++) {
      const d = distPontoSegmento(pontos[k][0], pontos[k][1], pontos[i][0], pontos[i][1], pontos[j][0], pontos[j][1])
      if (d > maxD) { maxD = d; idx = k }
    }
    if (idx !== -1 && maxD > epsilon) {
      manter[idx] = 1
      pilha.push([i, idx], [idx, j])
    }
  }
  const out: Ponto[] = []
  for (let k = 0; k < n; k++) if (manter[k]) out.push(pontos[k])
  return out
}

/** Hit-test da borracha: o traço é atingido se algum SEGMENTO fica a <= raio + largura/2 de (x,y). */
export function tracoAtingido(t: TracoFolha, x: number, y: number, raio: number): boolean {
  const lim = raio + t.largura / 2
  const p = t.pontos
  if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= lim
  for (let i = 0; i < p.length - 1; i++) {
    if (distPontoSegmento(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) <= lim) return true
  }
  return false
}
export function tracosAtingidos(f: Folha, x: number, y: number, raio: number): string[] {
  const out: string[] = []
  for (const t of f.tracos) if (tracoAtingido(t, x, y, raio)) out.push(t.id)
  return out
}

// ---------- caixa envolvente (com cache por traço: os traços são imutáveis) ----------
export interface BBox { x0: number; y0: number; x1: number; y1: number }
const bboxCache = new WeakMap<TracoFolha, BBox>()
/** Caixa envolvente dos PONTOS do traço (sem a espessura). Cacheada pela referência do traço. */
export function bboxTraco(t: TracoFolha): BBox {
  let b = bboxCache.get(t)
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of t.pontos) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
    b = { x0, y0, x1, y1 }
    bboxCache.set(t, b)
  }
  return b
}
/** União das caixas (acrescida da meia espessura de cada traço). null se vazio. */
export function bboxTracos(ts: TracoFolha[]): BBox | null {
  if (!ts.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const t of ts) {
    const b = bboxTraco(t), m = t.largura / 2
    if (b.x0 - m < x0) x0 = b.x0 - m
    if (b.y0 - m < y0) y0 = b.y0 - m
    if (b.x1 + m > x1) x1 = b.x1 + m
    if (b.y1 + m > y1) y1 = b.y1 + m
  }
  return { x0, y0, x1, y1 }
}
export const bboxCruza = (a: BBox, b: BBox): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0

// ---------- laço (seleção de tinta) ----------
export type Poligono = Array<[number, number]>
/** Ray casting (par-ímpar). */
export function pontoNoPoligono(x: number, y: number, poly: Poligono): boolean {
  let dentro = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}
/** Traços cujo laço contém >= `fracao` dos pontos (padrão: metade). Laço com < 3 pontos não seleciona nada. */
export function tracosNoLaco(tracos: TracoFolha[], poly: Poligono, fracao = 0.5): string[] {
  if (poly.length < 3) return []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const caixa: BBox = { x0, y0, x1, y1 }
  const out: string[] = []
  for (const t of tracos) {
    if (!bboxCruza(bboxTraco(t), caixa)) continue
    let dentro = 0
    for (const p of t.pontos) if (pontoNoPoligono(p[0], p[1], poly)) dentro++
    if (dentro / t.pontos.length >= fracao) out.push(t.id)
  }
  return out
}

// ---------- operações imutáveis ----------
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function adicionarTraco(f: Folha, t: TracoFolha): Folha {
  if (!podeAdicionarTraco(f, t)) return f
  return { ...f, tracos: [...f.tracos, t] }
}
export function removerTracos(f: Folha, ids: string[]): Folha {
  if (!ids.length) return f
  const s = new Set(ids)
  const tracos = f.tracos.filter((t) => !s.has(t.id))
  return tracos.length === f.tracos.length ? f : { ...f, tracos }
}
export function apagarEm(f: Folha, x: number, y: number, raio: number): Folha {
  return removerTracos(f, tracosAtingidos(f, x, y, raio))
}

const lerp = (a: Ponto, b: Ponto, t: number): Ponto => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
/** Trecho [t0,t1] ⊂ [0,1] do segmento a→b que fica dentro do círculo (c, r); null se não toca. */
export function intervaloNoCirculo(a: Ponto, b: Ponto, cx: number, cy: number, r: number): [number, number] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - cx, fy = a[1] - cy
  const A = dx * dx + dy * dy
  if (A === 0) return fx * fx + fy * fy <= r * r ? [0, 1] : null
  const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C
  if (disc < 0) return null
  const s = Math.sqrt(disc), t0 = (-B - s) / (2 * A), t1 = (-B + s) / (2 * A)
  if (t1 < 0 || t0 > 1) return null
  return [Math.max(0, t0), Math.min(1, t1)]
}
/**
 * BORRACHA POR ÁREA: remove do traço o trecho dentro do círculo (x,y,raio + meia espessura), dividindo-o em pedaços.
 * null = não tocou; [] = apagou tudo. O 1º pedaço mantém o id do traço; os demais ganham ids novos.
 */
export function dividirTraco(t: TracoFolha, x: number, y: number, raio: number, novoId: () => string = gerarId): TracoFolha[] | null {
  const r = raio + t.largura / 2
  const p = t.pontos
  if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) <= r ? [] : null
  const pedacos: Ponto[][] = []
  let cur: Ponto[] = []
  let tocou = false
  const fechar = () => { if (cur.length >= 2) pedacos.push(cur); cur = [] }
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1]
    const iv = intervaloNoCirculo(a, b, x, y, r)
    if (!iv) { if (!cur.length) cur.push(a); cur.push(b); continue }
    tocou = true
    const [t0, t1] = iv
    if (t0 > 0) { if (!cur.length) cur.push(a); cur.push(lerp(a, b, t0)) }
    fechar()
    if (t1 < 1) cur = [lerp(a, b, t1), b]
  }
  fechar()
  if (!tocou) return null
  return pedacos.map((pontos, i) => ({ ...t, id: i === 0 ? t.id : novoId(), pontos }))
}
/** Borracha por área aplicada à folha toda (pré-filtra pela caixa do traço). Mesma referência se nada mudou ou se estouraria o limite de traços. */
export function apagarArea(f: Folha, x: number, y: number, raio: number, novoId: () => string = gerarId): Folha {
  let mudou = false
  const out: TracoFolha[] = []
  for (const t of f.tracos) {
    const b = bboxTraco(t), m = raio + t.largura / 2
    if (x < b.x0 - m || x > b.x1 + m || y < b.y0 - m || y > b.y1 + m) { out.push(t); continue }
    const r = dividirTraco(t, x, y, raio, novoId)
    if (!r) { out.push(t); continue }
    mudou = true
    out.push(...r)
  }
  if (!mudou || out.length > LIMITES_FOLHA.tracos) return f
  return { ...f, tracos: out }
}

const coord = (v: number) => limitar(v, 0, LIMITES_FOLHA.coordMax)
/** Deslocamento permitido: a seleção nunca passa do canto superior esquerdo (coordenadas >= 0). */
export function limitarMovimento(sel: TracoFolha[], dx: number, dy: number): [number, number] {
  let minX = Infinity, minY = Infinity
  for (const t of sel) { const b = bboxTraco(t); if (b.x0 < minX) minX = b.x0; if (b.y0 < minY) minY = b.y0 }
  if (!sel.length) return [0, 0]
  return [Math.max(dx, -minX), Math.max(dy, -minY)]
}
/** Move os traços `ids` por (dx,dy) (limitado por `limitarMovimento`). */
export function moverTracos(f: Folha, ids: string[], dx: number, dy: number): Folha {
  const s = new Set(ids)
  const sel = f.tracos.filter((t) => s.has(t.id))
  if (!sel.length) return f
  const [mx, my] = limitarMovimento(sel, dx, dy)
  if (mx === 0 && my === 0) return f
  return { ...f, tracos: f.tracos.map((t) => (s.has(t.id) ? { ...t, pontos: t.pontos.map(([x, y, p]) => [coord(x + mx), coord(y + my), p] as Ponto) } : t)) }
}
/** Redimensiona os traços `ids` em torno da âncora (ax,ay) por (sx,sy) (>0). A espessura acompanha a escala média. */
export function escalarTracos(f: Folha, ids: string[], ax: number, ay: number, sx: number, sy: number): Folha {
  if (!(sx > 0) || !(sy > 0) || (sx === 1 && sy === 1)) return f
  const kx = limitar(sx, 0.05, 50), ky = limitar(sy, 0.05, 50), kl = Math.sqrt(kx * ky)
  const s = new Set(ids)
  let mudou = false
  const tracos = f.tracos.map((t) => {
    if (!s.has(t.id)) return t
    mudou = true
    return {
      ...t, largura: limitar(t.largura * kl, 0.5, 80),
      pontos: t.pontos.map(([x, y, p]) => [coord(ax + (x - ax) * kx), coord(ay + (y - ay) * ky), p] as Ponto),
    }
  })
  return mudou ? { ...f, tracos } : f
}

export function proximoZ(f: Folha): number {
  return f.caixas.reduce((m, c) => Math.max(m, c.z), 0) + 1
}
export function adicionarCaixa(f: Folha, c: { id: string; x: number; y: number; w?: number; h?: number; texto?: string; doc?: Record<string, unknown>; livre?: boolean }): Folha {
  if (f.caixas.length >= LIMITES_FOLHA.caixas) return f
  const limL = c.livre ? LIMITES_FOLHA.larguraMax : f.largura
  const nova: CaixaFolha = {
    id: c.id,
    x: limitar(c.x, 0, Math.max(0, limL - 40)),
    y: Math.max(0, c.y),
    w: limitar(c.w ?? 260, 40, limL),
    h: Math.max(40, c.h ?? 100),
    z: proximoZ(f),
  }
  const doc = c.doc ?? (c.texto?.trim() ? docDeTexto(c.texto) : undefined)
  if (doc) nova.doc = doc
  return { ...f, caixas: [...f.caixas, nova] }
}
function mapCaixa(f: Folha, id: string, fn: (c: CaixaFolha) => CaixaFolha): Folha {
  let mudou = false
  const caixas = f.caixas.map((c) => {
    if (c.id !== id) return c
    const n = fn(c)
    if (n !== c) mudou = true
    return n
  })
  return mudou ? { ...f, caixas } : f
}
/** `livre` (tela infinita): o limite direito é o máximo absoluto, não a largura atual (quem chama depois usa expandirSeNecessario). */
export function moverCaixa(f: Folha, id: string, x: number, y: number, livre = false): Folha {
  return mapCaixa(f, id, (c) => {
    const nx = limitar(x, 0, Math.max(0, (livre ? LIMITES_FOLHA.larguraMax : f.largura) - c.w)), ny = Math.max(0, y)
    return nx === c.x && ny === c.y ? c : { ...c, x: nx, y: ny }
  })
}
export function redimensionarCaixa(f: Folha, id: string, w: number, h: number, livre = false): Folha {
  return mapCaixa(f, id, (c) => {
    const nw = limitar(w, 40, Math.max(40, (livre ? LIMITES_FOLHA.larguraMax : f.largura) - c.x)), nh = Math.max(40, h)
    return nw === c.w && nh === c.h ? c : { ...c, w: nw, h: nh }
  })
}
/** Texto simples (compat): grava como doc de parágrafos. */
export function atualizarTextoCaixa(f: Folha, id: string, texto: string): Folha {
  return atualizarDocCaixa(f, id, docDeTexto(texto))
}
/** Grava o doc TipTap da caixa. Mesma referência de `doc` = no-op. Doc com texto acima de `textoCaixa` é recusado (mantém o anterior). */
export function atualizarDocCaixa(f: Folha, id: string, doc: Record<string, unknown>): Folha {
  if (textoDeDoc(doc).length > LIMITES_FOLHA.textoCaixa) return f
  return mapCaixa(f, id, (c) => {
    if (c.doc === doc && c.texto === undefined) return c
    const { texto: _t, ...resto } = c
    return { ...resto, doc }
  })
}
/** Altura medida do conteúdo da caixa (px). Só muda se a diferença passa de 1px. */
export function ajustarAlturaCaixa(f: Folha, id: string, h: number): Folha {
  const nh = Math.min(LIMITES_FOLHA.alturaMax, Math.max(28, Math.round(h)))
  return mapCaixa(f, id, (c) => (Math.abs(c.h - nh) <= 1 ? c : { ...c, h: nh }))
}
export function trazerParaFrente(f: Folha, id: string): Folha {
  const topo = f.caixas.reduce((m, c) => Math.max(m, c.z), 0)
  return mapCaixa(f, id, (c) => (c.z === topo && f.caixas.filter((o) => o.z === topo).length === 1 ? c : { ...c, z: topo + 1 }))
}
export function removerCaixa(f: Folha, id: string): Folha {
  const caixas = f.caixas.filter((c) => c.id !== id)
  return caixas.length === f.caixas.length ? f : { ...f, caixas }
}
/**
 * Folha cresce (para baixo e para a direita) conforme o conteúdo se aproxima das bordas (tela “infinita”).
 * Margem horizontal = metade da vertical. Nunca encolhe.
 */
export function expandirSeNecessario(f: Folha, margem = 400, passo = 800): Folha {
  let maxX = 0, maxY = 0
  for (const c of f.caixas) { maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h) }
  for (const t of f.tracos) { const b = bboxTraco(t); if (b.x1 > maxX) maxX = b.x1; if (b.y1 > maxY) maxY = b.y1 }
  return crescerPara(f, maxX, maxY, margem / 2, margem, passo)
}
/** Garante que a folha cubra (maxX+margemX, maxY+margemY), em múltiplos de `passo`, respeitando os limites. */
export function crescerPara(f: Folha, maxX: number, maxY: number, margemX = 200, margemY = 400, passo = 800): Folha {
  const largura = maxX + margemX > f.largura ? Math.min(LIMITES_FOLHA.larguraMax, Math.ceil((maxX + margemX) / passo) * passo) : f.largura
  const altura = maxY + margemY > f.altura ? Math.min(LIMITES_FOLHA.alturaMax, Math.ceil((maxY + margemY) / passo) * passo) : f.altura
  return largura === f.largura && altura === f.altura ? f : { ...f, largura: Math.max(f.largura, largura), altura: Math.max(f.altura, altura) }
}

// ---------- desfazer / refazer (pilha limitada; compartilha estrutura, barato) ----------
export interface Historico {
  passado: Folha[]
  presente: Folha
  futuro: Folha[]
}
export const criarHistorico = (f: Folha): Historico => ({ passado: [], presente: f, futuro: [] })
/** Registra nova versão (descarta o “refazer”). Mesma referência = no-op. */
export function registrar(h: Historico, nova: Folha, limite = LIMITES_FOLHA.historico): Historico {
  if (nova === h.presente) return h
  const passado = [...h.passado, h.presente]
  if (passado.length > limite) passado.splice(0, passado.length - limite)
  return { passado, presente: nova, futuro: [] }
}
/** Altera o presente SEM criar ponto de desfazer (ex.: arrasto em andamento). */
export const substituirPresente = (h: Historico, nova: Folha): Historico => (nova === h.presente ? h : { ...h, presente: nova })
/** Fecha uma edição contínua (arrasto/digitação): `antes` vira UM ponto de desfazer. */
export function confirmarDesde(h: Historico, antes: Folha, limite = LIMITES_FOLHA.historico): Historico {
  if (antes === h.presente) return h
  return registrar({ ...h, presente: antes }, h.presente, limite)
}
export const podeDesfazer =(h: Historico) => h.passado.length > 0
export const podeRefazer = (h: Historico) => h.futuro.length > 0
export function desfazer(h: Historico): Historico {
  if (!h.passado.length) return h
  const passado = h.passado.slice(0, -1)
  return { passado, presente: h.passado[h.passado.length - 1], futuro: [h.presente, ...h.futuro] }
}
export function refazer(h: Historico): Historico {
  if (!h.futuro.length) return h
  const [prox, ...resto] = h.futuro
  return { passado: [...h.passado, h.presente], presente: prox, futuro: resto }
}
