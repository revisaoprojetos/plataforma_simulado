// Normalização/validação/migração da página do extensivo. TS puro (cliente + servidor).
// Regra: NUNCA lança. Dado inválido vira default do catálogo; bloco irreconhecível é descartado.
import { CATALOGO, ehTipoElemento, getElemento } from './catalogo'
import { ehTokenCor } from './tokens'
import {
  VISIB_TODOS, type Alinhamento, type BlocoAny, type BlocoV1, type ConteudoPorTipo, type EstiloBloco, type PaginaV1, type Raio, type Espaco,
  type TemaPagina, type TipoElemento, type Visibilidade, type ItemCarrossel, type TamanhoCarrossel,
} from './tipos'
import {
  completarBlocos, configModulosImplicita, normConfigCronograma, normConfigModulos, TITULO_MODULOS_PADRAO, type LinhaBloco,
} from '../blocos-pagina'

export const MAX_BLOCOS = 120

const str = (v: unknown, max: number, pad = '') => (typeof v === 'string' ? v.slice(0, max) : pad)
const bool = (v: unknown, pad: boolean) => (typeof v === 'boolean' ? v : pad)
const inteiro = (v: unknown, min: number, max: number, pad: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : pad }
const oneOf = <T extends string>(v: unknown, vals: readonly T[]): T | undefined => (vals as readonly string[]).includes(v as string) ? (v as T) : undefined
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})

/** Link seguro: http(s), mailto, caminho interno ('/…') ou âncora ('#…'). Qualquer outro esquema (javascript:, data:) vira ''. */
export function linkSeguro(v: unknown): string {
  const s = str(v, 2000).trim()
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(s) ? s : ''
}
/** URL de imagem: https, caminho interno ou data:image (upload local). */
export function imagemSegura(v: unknown): string {
  const s = str(v, 4000).trim()
  return /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ''
}

const TAGS_OK = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'a', 'span'])
/** Sanitiza HTML do elemento Texto por WHITELIST (sem atributos exceto href seguro em <a>). Defesa em profundidade: o renderer não deve confiar só nisto. */
export function sanitizarHtml(v: unknown): string {
  const s = str(v, 8000)
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (all, tag: string, attrs: string) => {
      const t = tag.toLowerCase()
      if (!TAGS_OK.has(t)) return ''
      if (all.startsWith('</')) return `</${t}>`
      if (t === 'a') {
        const m = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)
        const href = linkSeguro(m?.[2] ?? m?.[3] ?? '')
        return href ? `<a href="${href.replace(/"/g, '&quot;')}" rel="noopener noreferrer" target="_blank">` : '<a>'
      }
      return `<${t}>`
    })
}

const TAMANHOS: readonly TamanhoCarrossel[] = ['vertical_small', 'vertical_large', 'horizontal_small', 'horizontal_large', 'destaque']

function normItens(v: unknown): ItemCarrossel[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>(); const out: ItemCarrossel[] = []
  for (const it of v.slice(0, 200)) {
    const t = str(obj(it).tipo_item, 40), id = str(obj(it).item_id, 80)
    const k = `${t}:${id}`
    if (!t || !id || seen.has(k)) continue
    seen.add(k); out.push({ tipo_item: t, item_id: id })
  }
  return out
}

/** Conteúdo normalizado por tipo (campos desconhecidos são descartados; ausentes recebem o default do catálogo). */
export function normalizarConteudo<T extends TipoElemento>(tipo: T, raw: unknown): ConteudoPorTipo[T] {
  const x = obj(raw)
  const pad: any = getElemento(tipo).defaults().conteudo
  let out: any
  switch (tipo as TipoElemento) {
    case 'hero':
      out = { mostrar_voltar: bool(x.mostrar_voltar, pad.mostrar_voltar), mostrar_logo: bool(x.mostrar_logo, pad.mostrar_logo), mostrar_descricao: bool(x.mostrar_descricao, pad.mostrar_descricao),
        mostrar_validade: bool(x.mostrar_validade, pad.mostrar_validade), titulo: str(x.titulo, 120), descricao: str(x.descricao, 300), imagem: imagemSegura(x.imagem) }; break
    case 'avisos': out = { max: inteiro(x.max, 1, 10, 10) }; break
    case 'progresso': out = {}; break
    case 'continuar': out = { titulo: str(x.titulo, 120), mostrar_barra: bool(x.mostrar_barra, true), mostrar_proximo: bool(x.mostrar_proximo, true) }; break
    case 'modulos': {
      const c = normConfigModulos(x) // reaproveita a regra v0 (ids únicos/strings)
      out = { modulo_ids: c.modulo_ids, restantes: c.restantes, recolhivel: c.recolhivel, recolhida: c.recolhivel && c.recolhida, agrupar_prefixo: c.agrupar_prefixo }; break
    }
    case 'cronograma': {
      const c = normConfigCronograma(x)
      const { variacao: _v, ...resto } = c
      out = resto; break
    }
    case 'carrossel': out = { itens: normItens(x.itens), tamanho: oneOf(x.tamanho, TAMANHOS) ?? 'vertical_small', ordenacao: oneOf(x.ordenacao, ['manual', 'alfabetica', 'recentes'] as const) ?? 'manual' }; break
    case 'banner': out = { imagem: imagemSegura(x.imagem), imagem_mobile: imagemSegura(x.imagem_mobile), link: linkSeguro(x.link), alt: str(x.alt, 200) }; break
    case 'texto': out = { titulo: str(x.titulo, 120), html: sanitizarHtml(x.html) }; break
    case 'botao': out = { rotulo: str(x.rotulo, 40, pad.rotulo), link: linkSeguro(x.link), nova_aba: bool(x.nova_aba, false) }; break
    case 'divisor': out = { rotulo: str(x.rotulo, 60) }; break
    case 'instrutores': out = { titulo: str(x.titulo, 120), ids: Array.isArray(x.ids) ? [...new Set<string>(x.ids.filter((i: unknown) => typeof i === 'string'))].slice(0, 50) : [] }; break
    default: out = {}
  }
  return out
}

export function normalizarEstilo(raw: unknown): EstiloBloco {
  const x = obj(raw); const e: EstiloBloco = {}
  if (ehTokenCor(x.cor)) e.cor = x.cor
  if (ehTokenCor(x.fundo)) e.fundo = x.fundo
  const esp = oneOf<Espaco>(x.espaco, ['sm', 'md', 'lg']); if (esp) e.espaco = esp
  const r = oneOf<Raio>(x.raio, ['none', 'sm', 'md', 'lg', 'full']); if (r) e.raio = r
  const a = oneOf<Alinhamento>(x.alinhamento, ['left', 'center', 'right']); if (a) e.alinhamento = a
  return e
}
export function normalizarVisib(raw: unknown): Visibilidade {
  const x = obj(raw)
  return { desktop: bool(x.desktop, true), tablet: bool(x.tablet, true), mobile: bool(x.mobile, true) }
}

export const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)

/** Cria um bloco NOVO do tipo (defaults do catálogo) — usado pelo "Adicionar elemento". */
export function criarBloco<T extends TipoElemento>(tipo: T, over: Partial<Pick<BlocoV1<T>, 'id' | 'variacao' | 'nome' | 'ativo'>> & { conteudo?: Partial<ConteudoPorTipo[T]> } = {}): BlocoV1<T> {
  const d = getElemento(tipo).defaults()
  return {
    id: over.id ?? novoId(), v: 1, tipo, variacao: over.variacao ?? d.variacao, ativo: over.ativo ?? true,
    ...(over.nome ?? d.nome ? { nome: over.nome ?? d.nome } : {}),
    conteudo: { ...(d.conteudo as object), ...(over.conteudo ?? {}) } as ConteudoPorTipo[T],
    estilo: d.estilo ?? {}, visib: d.visib ?? { ...VISIB_TODOS },
  }
}

/** Linha v0 (simulado_produto_secoes) → BlocoV1. `tamanho` é a coluna da linha (carrossel). */
export type LinhaV0 = LinhaBloco & { id: string; tamanho?: string | null }
export function blocoDeLinhaV0(l: LinhaV0): BlocoAny | null {
  if (!ehTipoElemento(l.tipo) || !['banner', 'carrossel', 'progresso', 'cronograma', 'modulos'].includes(l.tipo)) return null
  const cfg = obj(l.config)
  const tipo = l.tipo as 'banner' | 'carrossel' | 'progresso' | 'cronograma' | 'modulos'
  let variacao = getElemento(tipo).defaults().variacao
  let conteudoRaw: any = cfg
  if (tipo === 'modulos') variacao = normConfigModulos(cfg).formato
  else if (tipo === 'cronograma') variacao = normConfigCronograma(cfg).variacao
  else if (tipo === 'carrossel') { variacao = oneOf(l.tamanho, TAMANHOS) ?? 'vertical_small'; conteudoRaw = { ...cfg, tamanho: variacao } }
  const nome = l.nome?.trim() ? l.nome.trim().slice(0, 120) : undefined
  return {
    id: l.id, v: 1, tipo, variacao, ativo: l.ativo !== false, ...(nome ? { nome } : {}),
    conteudo: normalizarConteudo(tipo, conteudoRaw), estilo: {}, visib: { ...VISIB_TODOS },
  } as BlocoAny
}

/** Qualquer bloco (V1 ou v0 cru {tipo,nome,ativo,config}) → BlocoV1 válido, ou null. */
export function normalizarBloco(raw: unknown): BlocoAny | null {
  const x = obj(raw)
  if (!ehTipoElemento(x.tipo)) return null
  const tipo = x.tipo
  if (x.v !== 1 && 'config' in x) return blocoDeLinhaV0({ id: str(x.id, 80) || novoId(), tipo, nome: x.nome ?? null, ativo: x.ativo !== false, config: x.config, tamanho: x.tamanho })
  const def = getElemento(tipo)
  const variacao = def.variacoes.some((v) => v.id === x.variacao) ? (x.variacao as string) : def.defaults().variacao
  const nome = typeof x.nome === 'string' && x.nome.trim() ? x.nome.trim().slice(0, 120) : undefined
  const ancora = typeof x.ancora === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x.ancora) ? x.ancora : undefined
  return {
    id: str(x.id, 80) || novoId(), v: 1, tipo, variacao, ativo: x.ativo !== false, ...(nome ? { nome } : {}),
    conteudo: normalizarConteudo(tipo, x.conteudo), estilo: normalizarEstilo(x.estilo), visib: normalizarVisib(x.visib), ...(ancora ? { ancora } : {}),
  } as BlocoAny
}

export function normalizarTema(raw: unknown): TemaPagina | undefined {
  const x = obj(raw); const t: TemaPagina = {}
  if (ehTokenCor(x.cor)) t.cor = x.cor
  if (ehTokenCor(x.fundo)) t.fundo = x.fundo
  const r = oneOf<Raio>(x.raio, ['none', 'sm', 'md', 'lg', 'full']); if (r) t.raio = r
  const e = oneOf<Espaco>(x.espaco, ['sm', 'md', 'lg']); if (e) t.espaco = e
  return Object.keys(t).length ? t : undefined
}

/** Página inteira: ids únicos, elementos `unico` sem duplicata, no máx. MAX_BLOCOS. Aceita `blocos` V1 ou v0. */
export function normalizarPagina(raw: unknown, temaRaw?: unknown): PaginaV1 {
  const x = obj(raw)
  const lista: unknown[] = Array.isArray(raw) ? raw : Array.isArray(x.blocos) ? x.blocos : []
  const ids = new Set<string>(); const unicos = new Set<string>(); const blocos: BlocoAny[] = []
  for (const r of lista.slice(0, MAX_BLOCOS)) {
    const b = normalizarBloco(r); if (!b) continue
    if (CATALOGO[b.tipo].unico) { if (unicos.has(b.tipo)) continue; unicos.add(b.tipo) }
    if (ids.has(b.id)) b.id = novoId()
    ids.add(b.id); blocos.push(b)
  }
  const tema = normalizarTema(temaRaw !== undefined ? temaRaw : x.tema)
  return { v: 1, blocos, ...(tema ? { tema } : {}) }
}

/**
 * SEED: a derivação ATUAL da página do aluno como blocos V1 =
 *   hero → avisos → continuar → (progresso implícito) → …linhas v0 (módulos implícitos antes do 1º banner/carrossel).
 * `estrutura` = linhas de simulado_produto_secoes na ordem (inclusive inativas). Sem linhas ⇒ página padrão.
 * Banner/carrossel INATIVOS entram com ativo=false (fora do cálculo de posição dos implícitos, como no legado).
 */
export function blocosIniciais(produto: { estrutura?: LinhaV0[] } = {}): PaginaV1 {
  const linhas = (produto.estrutura ?? []) as LinhaV0[]
  const inativaVitrine = (l: LinhaV0) => l.ativo === false && (l.tipo === 'banner' || l.tipo === 'carrossel')
  const completas = completarBlocos<LinhaV0>(linhas.filter((l) => !inativaVitrine(l)),
    (t) => t === 'progresso'
      ? { id: 'implicito:progresso', tipo: 'progresso', nome: null, ativo: true, config: {} }
      : { id: 'implicito:modulos', tipo: 'modulos', nome: TITULO_MODULOS_PADRAO, ativo: true, config: configModulosImplicita() })
  // Reinsere os banners/carrosséis inativos logo após o vizinho que os antecedia (para o editor mostrá-los ocultos).
  linhas.forEach((l, i) => {
    if (!inativaVitrine(l)) return
    let pos = 0
    for (let j = i - 1; j >= 0; j--) { const k = completas.findIndex((c) => c.id === linhas[j].id); if (k >= 0) { pos = k + 1; break } }
    completas.splice(pos, 0, l)
  })
  const topo: BlocoAny[] = [
    { ...criarBloco('hero', { id: 'hero' }) }, { ...criarBloco('avisos', { id: 'avisos' }) }, { ...criarBloco('continuar', { id: 'continuar' }) },
  ]
  const corpo = completas.map(blocoDeLinhaV0).filter(Boolean) as BlocoAny[]
  return { v: 1, blocos: [...topo, ...corpo] }
}

/** BlocoV1 (corpo) → linha v0 compatível com montarPaginaExtensivo (que continua sendo a fonte de resolução dos módulos). */
export function linhaV0DeBloco(b: BlocoAny): (LinhaBloco & { id: string }) | null {
  const c: any = b.conteudo
  switch (b.tipo) {
    case 'progresso': return { id: b.id, tipo: 'progresso', nome: null, ativo: b.ativo, config: {} }
    case 'modulos': return { id: b.id, tipo: 'modulos', nome: b.nome ?? null, ativo: b.ativo, config: { ...c, formato: b.variacao === 'poster' ? 'grade' : b.variacao } }
    case 'cronograma': return { id: b.id, tipo: 'cronograma', nome: b.nome ?? null, ativo: b.ativo, config: { ...c, variacao: b.variacao } }
    case 'carrossel': return { id: b.id, tipo: 'carrossel', nome: b.nome ?? null, ativo: b.ativo, config: c }
    case 'banner': return { id: b.id, tipo: 'banner', nome: b.nome ?? null, ativo: b.ativo, config: c }
    default: return null
  }
}
