// FOLHA LIVRE + CANETA (Caderno beta, fase 3) — núcleo PURO (sem React, sem I/O).
// Formato persistido em `simulado_aluno_notebook_paginas.tinta` (jsonb) quando tipo_pagina='folha_livre'.
// Cores: NUNCA hex livre — o traço guarda um NOME da paleta fixa (PALETA_FOLHA) e a UI resolve por CSS var.
import { z } from 'zod'

export const FOLHA_VERSAO = 1 as const
export const LIMITES_FOLHA = {
  tracos: 5000,
  pontosPorTraco: 20000,
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

/** Nome da paleta -> CSS var (definidas no root da folha; ver folha-livre.tsx). */
export const corParaVar = (c: CorFolha): string => `var(--folha-cor-${c})`

export type Ponto = [number, number, number] // x, y, pressão (0..1)

export interface TracoFolha {
  id: string
  ferramenta: FerramentaTraco
  cor: CorFolha
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
  texto?: string
  doc?: Record<string, unknown>
}
export interface FundoFolha {
  tipo: 'pdf' | 'nenhum'
  documento_id?: string
  pagina?: number
}
export interface Folha {
  versao: 1
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
  cor: z.enum(PALETA_FOLHA),
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
  versao: z.literal(1),
  largura: z.number().finite().min(LIMITES_FOLHA.larguraMin).max(LIMITES_FOLHA.larguraMax),
  altura: z.number().finite().min(LIMITES_FOLHA.larguraMin).max(LIMITES_FOLHA.alturaMax),
  caixas: z.array(caixaSchema).max(LIMITES_FOLHA.caixas),
  tracos: z.array(tracoSchema).max(LIMITES_FOLHA.tracos),
  fundo: fundoSchema.optional(),
})

export function criarFolhaVazia(largura = 1200, altura = 1600): Folha {
  return { versao: 1, largura, altura, caixas: [], tracos: [] }
}

export function gerarId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

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

/** Valida (zod + limites + 1 MB). Aceita objeto ou string JSON. */
export function validarFolha(entrada: unknown): ResultadoFolha {
  let obj = entrada
  if (typeof entrada === 'string') {
    if (tamanhoBytes(entrada) > LIMITES_FOLHA.bytes) return { ok: false, erro: 'Folha maior que 1 MB.' }
    try { obj = JSON.parse(entrada) } catch { return { ok: false, erro: 'JSON inválido.' } }
  }
  const r = folhaSchema.safeParse(obj)
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Folha inválida.' }
  const bytes = tamanhoBytes(serializarFolha(r.data as Folha))
  if (bytes > LIMITES_FOLHA.bytes) return { ok: false, erro: 'Folha maior que 1 MB.' }
  return { ok: true, folha: r.data as Folha, bytes }
}

/** Pode adicionar este traço sem estourar limites? (usado antes de commitar na UI) */
export function podeAdicionarTraco(f: Folha, t: TracoFolha): boolean {
  if (f.tracos.length >= LIMITES_FOLHA.tracos) return false
  if (t.pontos.length > LIMITES_FOLHA.pontosPorTraco) return false
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

export function proximoZ(f: Folha): number {
  return f.caixas.reduce((m, c) => Math.max(m, c.z), 0) + 1
}
export function adicionarCaixa(f: Folha, c: { id: string; x: number; y: number; w?: number; h?: number; texto?: string }): Folha {
  if (f.caixas.length >= LIMITES_FOLHA.caixas) return f
  const nova: CaixaFolha = {
    id: c.id,
    x: limitar(c.x, 0, Math.max(0, f.largura - 40)),
    y: Math.max(0, c.y),
    w: limitar(c.w ?? 260, 40, f.largura),
    h: Math.max(40, c.h ?? 100),
    z: proximoZ(f),
    texto: c.texto ?? '',
  }
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
export function moverCaixa(f: Folha, id: string, x: number, y: number): Folha {
  return mapCaixa(f, id, (c) => {
    const nx = limitar(x, 0, Math.max(0, f.largura - c.w)), ny = Math.max(0, y)
    return nx === c.x && ny === c.y ? c : { ...c, x: nx, y: ny }
  })
}
export function redimensionarCaixa(f: Folha, id: string, w: number, h: number): Folha {
  return mapCaixa(f, id, (c) => {
    const nw = limitar(w, 40, Math.max(40, f.largura - c.x)), nh = Math.max(40, h)
    return nw === c.w && nh === c.h ? c : { ...c, w: nw, h: nh }
  })
}
export function atualizarTextoCaixa(f: Folha, id: string, texto: string): Folha {
  const t = texto.slice(0, LIMITES_FOLHA.textoCaixa)
  return mapCaixa(f, id, (c) => (c.texto === t ? c : { ...c, texto: t }))
}
export function trazerParaFrente(f: Folha, id: string): Folha {
  const topo = f.caixas.reduce((m, c) => Math.max(m, c.z), 0)
  return mapCaixa(f, id, (c) => (c.z === topo && f.caixas.filter((o) => o.z === topo).length === 1 ? c : { ...c, z: topo + 1 }))
}
export function removerCaixa(f: Folha, id: string): Folha {
  const caixas = f.caixas.filter((c) => c.id !== id)
  return caixas.length === f.caixas.length ? f : { ...f, caixas }
}
/** Folha cresce para baixo conforme o conteúdo se aproxima do fim (rolagem “infinita”). */
export function expandirSeNecessario(f: Folha, margem = 400, passo = 800): Folha {
  let maxY = 0
  for (const c of f.caixas) maxY = Math.max(maxY, c.y + c.h)
  for (const t of f.tracos) for (const p of t.pontos) if (p[1] > maxY) maxY = p[1]
  if (maxY + margem <= f.altura) return f
  const altura = Math.min(LIMITES_FOLHA.alturaMax, Math.ceil((maxY + margem) / passo) * passo)
  return altura === f.altura ? f : { ...f, altura }
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
