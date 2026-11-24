/**
 * CAMADA DO USUÁRIO (overlay) SOBRE O GRAFO BASE DO EDITOR DE FLUXO. Puro, client-safe, sem I/O.
 *
 * O grafo base continua vindo do código/regras do domínio (adaptador). O usuário só acrescenta/ajusta por cima:
 *  - nós e arestas próprios (`u.*`), em qualquer diagrama (base ou criado por ele);
 *  - ajustes de nós base (ocultar, rotular, reposicionar) — o nó base nunca é apagado;
 *  - arestas base ocultas;
 *  - diagramas inteiros novos.
 * `mesclar(base, overlay)` devolve os diagramas finais (com posição em px) que o canvas desenha. Overlay vazio ⇒ diagramas base idênticos.
 * Nós `condicao`/`acao` podem carregar uma REGRA EXECUTÁVEL (catálogo fechado, ver `lib/cronograma/adaptativo/regras-usuario.ts`).
 */
import type { ArestaFluxo, DiagramaFluxo, NoFluxo, TipoNo } from './adaptador'
import { GEO } from './geometria'

export const VERSAO_OVERLAY = 1
export const LIMITES_OVERLAY = { nos: 200, arestas: 400, diagramas: 20, gruposOu: 8, comparacoes: 8, texto: 4000, titulo: 120 } as const

export const TIPOS_NO_USUARIO: readonly TipoNo[] = ['inicio', 'etapa', 'decisao', 'condicao', 'acao', 'aviso', 'resultado', 'nota']

// ── regras executáveis (dados puros; o catálogo fechado e o avaliador ficam no domínio) ─────────────
export type OpCond = 'igual' | 'diferente' | 'menor' | 'menor_igual' | 'maior' | 'maior_igual' | 'em' | 'fora_de'
export const OPS_COND: readonly OpCond[] = ['igual', 'diferente', 'menor', 'menor_igual', 'maior', 'maior_igual', 'em', 'fora_de']
export const ROTULO_OP: Readonly<Record<OpCond, string>> = { igual: 'é', diferente: 'não é', menor: '<', menor_igual: '≤', maior: '>', maior_igual: '≥', em: 'está em', fora_de: 'não está em' }
export interface Comparacao { variavel: string; op: OpCond; valor: Array<number | string> }
/** OU de grupos; cada grupo é um E de comparações. `{ou: []}` = nó sem condição própria (verdadeiro). */
export interface Condicao { ou: Comparacao[][] }
export interface AcaoUsuario { tipo: string; tipoA?: string; tipoB?: string; valor?: number; campo?: string; texto?: string }

export interface NoUsuario {
  id: string
  diagrama: string
  tipo: TipoNo
  titulo: string
  descricao: string
  x: number
  y: number
  condicao?: Condicao
  acao?: AcaoUsuario
}
export interface ArestaUsuario { id: string; diagrama: string; de: string; para: string; rotulo?: string }
export interface AjusteNoBase { oculto?: boolean; titulo?: string; descricao?: string; x?: number; y?: number }
export interface DiagramaUsuario { id: string; titulo: string; resumo: string }
export interface OverlayFluxo {
  v: number
  nos: NoUsuario[]
  arestas: ArestaUsuario[]
  ajustes: Record<string, AjusteNoBase>
  /** chaves `${de}>${para}` de arestas BASE ocultas. */
  arestasOcultas: string[]
  diagramas: DiagramaUsuario[]
}

// ── catálogo (dado serializável fornecido pelo adaptador executável) ────────────────────────────────
export interface OpcaoCat { valor: string; rotulo: string }
export interface VariavelDef { chave: string; rotulo: string; tipo: 'numero' | 'opcao'; opcoes?: OpcaoCat[]; ops: OpCond[]; disponivel: boolean; motivo?: string; dica?: string }
export interface ParamDef { chave: 'tipoA' | 'tipoB' | 'valor' | 'campo' | 'texto'; rotulo: string; tipo: 'opcao' | 'int' | 'texto'; opcoes?: OpcaoCat[]; min?: number; max?: number; padrao?: string | number }
export interface AcaoDef { tipo: string; rotulo: string; descricao: string; params: ParamDef[]; /** true = só informa (não altera o cronograma). */ informativa?: boolean }
export interface CatalogoExecutavel { variaveis: VariavelDef[]; acoes: AcaoDef[]; naoSuportado: string[] }

// ── utilidades ──────────────────────────────────────────────────────────────────────────────────────
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v : '').slice(0, max)
const num = (v: unknown, def: number, min: number, max: number): number => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def }
const idOk = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,60}$/.test(v) && v !== '__proto__' ? v : null)

export const overlayVazio = (): OverlayFluxo => ({ v: VERSAO_OVERLAY, nos: [], arestas: [], ajustes: {}, arestasOcultas: [], diagramas: [] })
export function overlayEhVazio(o: OverlayFluxo): boolean {
  return !o.nos.length && !o.arestas.length && !Object.keys(o.ajustes).length && !o.arestasOcultas.length && !o.diagramas.length
}

function normComparacao(raw: unknown): Comparacao | null {
  const o = obj(raw)
  const variavel = idOk(o.variavel), op = OPS_COND.find((x) => x === o.op)
  if (!variavel || !op || !Array.isArray(o.valor)) return null
  const valor = (o.valor as unknown[]).slice(0, 12).flatMap((x): Array<number | string> => (typeof x === 'number' && Number.isFinite(x) ? [x] : typeof x === 'string' ? [x.slice(0, 40)] : []))
  return { variavel, op, valor }
}
function normCondicao(raw: unknown): Condicao | undefined {
  const o = obj(raw)
  if (!Array.isArray(o.ou)) return undefined
  const ou = o.ou.slice(0, LIMITES_OVERLAY.gruposOu).map((g) => (Array.isArray(g) ? g.slice(0, LIMITES_OVERLAY.comparacoes).flatMap((c) => { const x = normComparacao(c); return x ? [x] : [] }) : [])).filter((g) => g.length > 0)
  return { ou }
}
function normAcao(raw: unknown): AcaoUsuario | undefined {
  const o = obj(raw), tipo = idOk(o.tipo)
  if (!tipo) return undefined
  const a: AcaoUsuario = { tipo }
  if (typeof o.tipoA === 'string') a.tipoA = o.tipoA.slice(0, 20)
  if (typeof o.tipoB === 'string') a.tipoB = o.tipoB.slice(0, 20)
  if (o.valor != null && Number.isFinite(Number(o.valor))) a.valor = Math.trunc(Number(o.valor))
  if (typeof o.campo === 'string') a.campo = o.campo.slice(0, 30)
  if (typeof o.texto === 'string') a.texto = o.texto.slice(0, 300)
  return a
}

/** Sanitiza o jsonb vindo do banco/cliente (tolerante a lixo → overlay vazio). `tiposPermitidos` descarta tipos de nó que o adaptador não suporta. */
export function normalizarOverlay(raw: unknown, tiposPermitidos: readonly TipoNo[] = TIPOS_NO_USUARIO): OverlayFluxo {
  const r = obj(raw)
  const diagramas: DiagramaUsuario[] = [], dIds = new Set<string>()
  for (const x of Array.isArray(r.diagramas) ? r.diagramas : []) {
    const o = obj(x), id = idOk(o.id)
    if (!id || dIds.has(id) || diagramas.length >= LIMITES_OVERLAY.diagramas) continue
    dIds.add(id); diagramas.push({ id, titulo: str(o.titulo, LIMITES_OVERLAY.titulo) || 'Novo diagrama', resumo: str(o.resumo, 400) })
  }
  const nos: NoUsuario[] = [], nIds = new Set<string>()
  for (const x of Array.isArray(r.nos) ? r.nos : []) {
    const o = obj(x), id = idOk(o.id), tipo = tiposPermitidos.find((t) => t === o.tipo), diagrama = idOk(o.diagrama)
    if (!id || !tipo || !diagrama || nIds.has(id) || nos.length >= LIMITES_OVERLAY.nos) continue
    nIds.add(id)
    const n: NoUsuario = { id, diagrama, tipo, titulo: str(o.titulo, LIMITES_OVERLAY.titulo) || 'Sem título', descricao: str(o.descricao, LIMITES_OVERLAY.texto), x: num(o.x, 0, -20000, 20000), y: num(o.y, 0, -20000, 20000) }
    if (tipo === 'condicao') { const c = normCondicao(o.condicao); if (c) n.condicao = c }
    if (tipo === 'acao') { const a = normAcao(o.acao); if (a) n.acao = a }
    nos.push(n)
  }
  const arestas: ArestaUsuario[] = [], aIds = new Set<string>()
  for (const x of Array.isArray(r.arestas) ? r.arestas : []) {
    const o = obj(x), id = idOk(o.id), de = idOk(o.de), para = idOk(o.para), diagrama = idOk(o.diagrama)
    if (!id || !de || !para || !diagrama || de === para || aIds.has(id) || arestas.length >= LIMITES_OVERLAY.arestas) continue
    aIds.add(id)
    const rotulo = str(o.rotulo, 40)
    arestas.push({ id, diagrama, de, para, ...(rotulo ? { rotulo } : {}) })
  }
  const ajustes: Record<string, AjusteNoBase> = {}
  for (const [k, v] of Object.entries(obj(r.ajustes)).slice(0, 400)) {
    const id = idOk(k); if (!id) continue
    const o = obj(v), a: AjusteNoBase = {}
    if (o.oculto === true) a.oculto = true
    if (typeof o.titulo === 'string' && o.titulo.trim()) a.titulo = o.titulo.slice(0, LIMITES_OVERLAY.titulo)
    if (typeof o.descricao === 'string' && o.descricao.trim()) a.descricao = o.descricao.slice(0, LIMITES_OVERLAY.texto)
    if (Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y)) && o.x != null && o.y != null) { a.x = num(o.x, 0, -20000, 20000); a.y = num(o.y, 0, -20000, 20000) }
    if (Object.keys(a).length) ajustes[id] = a
  }
  const arestasOcultas = [...new Set((Array.isArray(r.arestasOcultas) ? r.arestasOcultas : []).filter((s): s is string => typeof s === 'string' && s.length <= 130))].slice(0, 400)
  // integridade: nós de diagramas inexistentes ficam (o diagrama pode ser base); arestas só entre nós conhecidos do overlay OU base (checado em `mesclar`).
  return { v: VERSAO_OVERLAY, nos, arestas, ajustes, arestasOcultas, diagramas }
}

function jsonEstavel(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(jsonEstavel).join(',') + ']'
  if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + jsonEstavel(o[k])).join(',') + '}' }
  return JSON.stringify(v) ?? 'null'
}
/** Hash curto estável (cyrb53) do overlay normalizado. */
export function hashOverlay(o: OverlayFluxo): string {
  const s = jsonEstavel(o)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

// ── mesclagem base + overlay ────────────────────────────────────────────────────────────────────────
export const posicaoBase = (n: Pick<NoFluxo, 'col' | 'row'>): { x: number; y: number } => ({ x: GEO.PAD + n.col * GEO.COLW, y: GEO.PAD + n.row * GEO.ROWH })
export const chaveAresta = (a: Pick<ArestaFluxo, 'de' | 'para'>): string => `${a.de}>${a.para}`

/** Diagramas finais: base (menos ocultos/ajustados) + nós/arestas do usuário + diagramas novos. Todo nó sai com `x`,`y` (px) e `origem`. */
export function mesclar(base: readonly DiagramaFluxo[], o: OverlayFluxo): DiagramaFluxo[] {
  const ocultasA = new Set(o.arestasOcultas)
  const doUsuario = (d: { id: string; titulo: string; resumo: string; grupo?: string }, baseNos: NoFluxo[], baseAr: ArestaFluxo[], origem: 'base' | 'usuario'): DiagramaFluxo => {
    const nos: NoFluxo[] = []
    for (const n of baseNos) {
      const aj = o.ajustes[n.id]
      if (aj?.oculto) continue
      const p = aj?.x != null && aj?.y != null ? { x: aj.x, y: aj.y } : posicaoBase(n)
      nos.push({ ...n, titulo: aj?.titulo ?? n.titulo, descricao: aj?.descricao ?? n.descricao, x: p.x, y: p.y, origem: 'base', ...(aj?.titulo || aj?.descricao ? { editado: true } : {}) })
    }
    for (const u of o.nos) if (u.diagrama === d.id) nos.push({ id: u.id, tipo: u.tipo, titulo: u.titulo, descricao: u.descricao, col: Math.round(u.x / GEO.COLW), row: Math.round(u.y / GEO.ROWH), x: u.x, y: u.y, origem: 'usuario' })
    const ids = new Set(nos.map((n) => n.id))
    const arestas: ArestaFluxo[] = []
    for (const a of baseAr) { if (ocultasA.has(chaveAresta(a)) || !ids.has(a.de) || !ids.has(a.para)) continue; arestas.push({ ...a, id: chaveAresta(a), origem: 'base' }) }
    for (const a of o.arestas) if (a.diagrama === d.id && ids.has(a.de) && ids.has(a.para)) arestas.push({ de: a.de, para: a.para, ...(a.rotulo ? { rotulo: a.rotulo } : {}), id: a.id, origem: 'usuario' })
    return { id: d.id, titulo: d.titulo, resumo: d.resumo, nos, arestas, origem, ...(d.grupo ? { grupo: d.grupo } : {}) }
  }
  const out = base.map((d) => doUsuario(d, d.nos, d.arestas, 'base'))
  for (const d of o.diagramas) if (!base.some((b) => b.id === d.id)) out.push(doUsuario(d, [], [], 'usuario'))
  return out
}

/** Nós base ocultos (para a lista "restaurar"). */
export function nosOcultos(base: readonly DiagramaFluxo[], o: OverlayFluxo): Array<{ id: string; titulo: string; diagrama: string }> {
  return base.flatMap((d) => d.nos.filter((n) => o.ajustes[n.id]?.oculto).map((n) => ({ id: n.id, titulo: n.titulo, diagrama: d.id })))
}

// ── mutações imutáveis ──────────────────────────────────────────────────────────────────────────────
let contador = 0
export function novoId(prefixo: string): string {
  contador += 1
  const al = Math.random().toString(36).slice(2, 8)
  return `${prefixo}${Date.now().toString(36).slice(-4)}${al}${contador.toString(36)}`.slice(0, 40)
}
export const ehNoUsuario = (id: string): boolean => id.startsWith('u.')
const TITULO_PADRAO: Record<TipoNo, string> = { inicio: 'Início', etapa: 'Nova etapa', decisao: 'Nova decisão', resultado: 'Resultado', rejeicao: 'Rejeição', aberto: 'Em aberto', condicao: 'Nova condição', acao: 'Nova ação', aviso: 'Aviso', nota: 'Nota' }

export function adicionarNo(o: OverlayFluxo, tipo: TipoNo, diagrama: string, x: number, y: number): { overlay: OverlayFluxo; id: string } {
  if (o.nos.length >= LIMITES_OVERLAY.nos) return { overlay: o, id: '' }
  const id = novoId('u.')
  const n: NoUsuario = { id, diagrama, tipo, titulo: TITULO_PADRAO[tipo], descricao: '', x: Math.round(x), y: Math.round(y), ...(tipo === 'condicao' ? { condicao: { ou: [] } } : {}), ...(tipo === 'acao' ? { acao: { tipo: 'aviso', texto: '' } } : {}) }
  return { overlay: { ...o, nos: [...o.nos, n] }, id }
}
export function moverNo(o: OverlayFluxo, id: string, x: number, y: number): OverlayFluxo {
  const px = Math.round(x), py = Math.round(y)
  if (ehNoUsuario(id)) return { ...o, nos: o.nos.map((n) => (n.id === id ? { ...n, x: px, y: py } : n)) }
  return { ...o, ajustes: { ...o.ajustes, [id]: { ...o.ajustes[id], x: px, y: py } } }
}
export type PatchNo = Partial<Pick<NoUsuario, 'tipo' | 'titulo' | 'descricao' | 'condicao' | 'acao'>>
export function editarNoUsuario(o: OverlayFluxo, id: string, p: PatchNo): OverlayFluxo {
  return { ...o, nos: o.nos.map((n) => {
    if (n.id !== id) return n
    const m = { ...n, ...p }
    if (m.tipo !== 'condicao') delete m.condicao
    if (m.tipo !== 'acao') delete m.acao
    if (m.tipo === 'condicao' && !m.condicao) m.condicao = { ou: [] }
    if (m.tipo === 'acao' && !m.acao) m.acao = { tipo: 'aviso', texto: '' }
    return m
  }) }
}
export function ajustarNoBase(o: OverlayFluxo, id: string, p: Partial<AjusteNoBase>): OverlayFluxo {
  const a = { ...o.ajustes[id], ...p }
  for (const k of Object.keys(a) as Array<keyof AjusteNoBase>) if (a[k] === undefined || a[k] === '' || a[k] === false) delete a[k]
  const ajustes = { ...o.ajustes }
  if (Object.keys(a).length) ajustes[id] = a; else delete ajustes[id]
  return { ...o, ajustes }
}
/** Nó do usuário: apaga (com suas arestas). Nó base: oculta (reversível). */
export function removerNo(o: OverlayFluxo, id: string): OverlayFluxo {
  if (ehNoUsuario(id)) return { ...o, nos: o.nos.filter((n) => n.id !== id), arestas: o.arestas.filter((a) => a.de !== id && a.para !== id) }
  return ajustarNoBase(o, id, { oculto: true })
}
export const restaurarNoBase = (o: OverlayFluxo, id: string): OverlayFluxo => ajustarNoBase(o, id, { oculto: false })
/** Duplica qualquer nó (base ou do usuário) como nó do usuário, levemente deslocado. Sem arestas. */
export function duplicarNo(o: OverlayFluxo, no: NoFluxo & { x?: number; y?: number }, diagrama: string): { overlay: OverlayFluxo; id: string } {
  if (o.nos.length >= LIMITES_OVERLAY.nos) return { overlay: o, id: '' }
  const orig = o.nos.find((n) => n.id === no.id)
  const tipo: TipoNo = no.tipo === 'rejeicao' || no.tipo === 'aberto' ? 'etapa' : no.tipo
  const id = novoId('u.')
  const copia: NoUsuario = { ...(orig ? JSON.parse(JSON.stringify(orig)) as NoUsuario : { tipo, descricao: no.descricao, condicao: undefined, acao: undefined }), id, diagrama, titulo: `${no.titulo} (cópia)`.slice(0, LIMITES_OVERLAY.titulo), x: Math.round((no.x ?? 0) + 40), y: Math.round((no.y ?? 0) + 40) } as NoUsuario
  if (!copia.condicao) delete copia.condicao
  if (!copia.acao) delete copia.acao
  return { overlay: { ...o, nos: [...o.nos, copia] }, id }
}
export function conectar(o: OverlayFluxo, diagrama: string, de: string, para: string, rotulo?: string): { overlay: OverlayFluxo; id: string } {
  if (de === para || o.arestas.length >= LIMITES_OVERLAY.arestas) return { overlay: o, id: '' }
  if (o.arestas.some((a) => a.de === de && a.para === para)) return { overlay: o, id: '' }
  const id = novoId('e.')
  return { overlay: { ...o, arestas: [...o.arestas, { id, diagrama, de, para, ...(rotulo ? { rotulo: rotulo.slice(0, 40) } : {}) }] }, id }
}
export function editarAresta(o: OverlayFluxo, id: string, rotulo: string): OverlayFluxo {
  return { ...o, arestas: o.arestas.map((a) => { if (a.id !== id) return a; const { rotulo: _r, ...resto } = a; return rotulo.trim() ? { ...resto, rotulo: rotulo.trim().slice(0, 40) } : resto }) }
}
/** Aresta do usuário: apaga. Aresta base (id `de>para`): oculta. */
export function removerAresta(o: OverlayFluxo, id: string): OverlayFluxo {
  if (o.arestas.some((a) => a.id === id)) return { ...o, arestas: o.arestas.filter((a) => a.id !== id) }
  return o.arestasOcultas.includes(id) ? o : { ...o, arestasOcultas: [...o.arestasOcultas, id] }
}
export const restaurarAresta = (o: OverlayFluxo, id: string): OverlayFluxo => ({ ...o, arestasOcultas: o.arestasOcultas.filter((x) => x !== id) })
export function criarDiagrama(o: OverlayFluxo, titulo: string): { overlay: OverlayFluxo; id: string } {
  if (o.diagramas.length >= LIMITES_OVERLAY.diagramas) return { overlay: o, id: '' }
  const id = novoId('d.')
  return { overlay: { ...o, diagramas: [...o.diagramas, { id, titulo: titulo.trim().slice(0, LIMITES_OVERLAY.titulo) || 'Novo diagrama', resumo: '' }] }, id }
}
export function renomearDiagrama(o: OverlayFluxo, id: string, titulo: string, resumo?: string): OverlayFluxo {
  return { ...o, diagramas: o.diagramas.map((d) => (d.id === id ? { ...d, titulo: titulo.trim().slice(0, LIMITES_OVERLAY.titulo) || d.titulo, ...(resumo != null ? { resumo: resumo.slice(0, 400) } : {}) } : d)) }
}
/** Só diagramas criados pelo usuário podem ser excluídos (levam seus nós/arestas). */
export function excluirDiagrama(o: OverlayFluxo, id: string): OverlayFluxo {
  return { ...o, diagramas: o.diagramas.filter((d) => d.id !== id), nos: o.nos.filter((n) => n.diagrama !== id), arestas: o.arestas.filter((a) => a.diagrama !== id) }
}
/** Próxima posição livre (à direita do último nó) para "adicionar" sem arrastar. */
export function posicaoLivre(d: DiagramaFluxo | undefined): { x: number; y: number } {
  if (!d || !d.nos.length) return { x: GEO.PAD, y: GEO.PAD }
  const ult = d.nos.reduce((m, n) => ((n.x ?? 0) > (m.x ?? 0) ? n : m), d.nos[0])
  return { x: (ult.x ?? 0) + GEO.COLW, y: ult.y ?? GEO.PAD }
}

// ── desfazer / refazer (pilha local) ────────────────────────────────────────────────────────────────
export interface Historico { passado: OverlayFluxo[]; futuro: OverlayFluxo[] }
export const LIMITE_HISTORICO = 80
export const historicoVazio = (): Historico => ({ passado: [], futuro: [] })
export function empurrar(h: Historico, atual: OverlayFluxo): Historico { return { passado: [...h.passado, atual].slice(-LIMITE_HISTORICO), futuro: [] } }
export function desfazer(h: Historico, atual: OverlayFluxo): { h: Historico; overlay: OverlayFluxo } | null {
  const p = h.passado[h.passado.length - 1]
  return p ? { h: { passado: h.passado.slice(0, -1), futuro: [atual, ...h.futuro] }, overlay: p } : null
}
export function refazer(h: Historico, atual: OverlayFluxo): { h: Historico; overlay: OverlayFluxo } | null {
  const f = h.futuro[0]
  return f ? { h: { passado: [...h.passado, atual], futuro: h.futuro.slice(1) }, overlay: f } : null
}

/** Remove referências órfãs (nós/arestas de diagramas ou nós inexistentes, ajustes de nós base que não existem mais). Usado antes de gravar. */
export function podarOverlay(base: readonly DiagramaFluxo[], o: OverlayFluxo): OverlayFluxo {
  const diag = new Set([...base.map((d) => d.id), ...o.diagramas.map((d) => d.id)])
  const nos = o.nos.filter((n) => diag.has(n.diagrama))
  const idsBase = new Set(base.flatMap((d) => d.nos.map((n) => n.id)))
  const idsTodos = new Set([...idsBase, ...nos.map((n) => n.id)])
  const arestas = o.arestas.filter((a) => diag.has(a.diagrama) && idsTodos.has(a.de) && idsTodos.has(a.para))
  const ajustes = Object.fromEntries(Object.entries(o.ajustes).filter(([id]) => idsBase.has(id)))
  const chavesBase = new Set(base.flatMap((d) => d.arestas.map(chaveAresta)))
  return { ...o, nos, arestas, ajustes, arestasOcultas: o.arestasOcultas.filter((k) => chavesBase.has(k)) }
}
