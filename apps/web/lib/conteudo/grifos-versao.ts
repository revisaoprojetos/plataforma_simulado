// Integridade dos grifos GEOMÉTRICOS do PDF (simulado_conteudo_grifos_pdf): o rect é normalizado (0..1) POR PÁGINA
// e só faz sentido sobre o MESMO layout em que foi desenhado. Funções PURAS (sem I/O) — testáveis.
// REGRA: nunca apagar grifo. Incompatível ≠ descartado: vira "desatualizado" (listado ao aluno, que decide).

export interface VersaoInfo { id: string; hash: string | null; paginas: number | null }
export type CompatGrifo = 'atual' | 'compativel' | 'desatualizado'

/**
 * Decide se um grifo (gravado com `grifoVersaoId`) pode ser pintado sobre a versão ATUAL.
 *  - sem versao_id (legado, anterior à coluna) → 'atual' (não há como provar o contrário; mantém o comportamento antigo);
 *  - mesma versão → 'atual';
 *  - versão diferente, mas MESMO arquivo (hash não vazio igual) e, quando ambas as contagens existem, MESMO nº de páginas
 *    → 'compativel' (mesmo arquivo ⇒ mesma conversão ⇒ mesmo layout);
 *  - qualquer outra coisa (hash diferente/vazio/versão desconhecida) → 'desatualizado'.
 */
export function compatibilidadeGrifo(grifoVersaoId: string | null | undefined, atual: VersaoInfo, versoes: Map<string, VersaoInfo>): CompatGrifo {
  if (!grifoVersaoId) return 'atual'
  if (grifoVersaoId === atual.id) return 'atual'
  const v = versoes.get(grifoVersaoId)
  if (!v) return 'desatualizado'
  const h1 = (v.hash ?? '').trim(); const h2 = (atual.hash ?? '').trim()
  if (!h1 || !h2 || h1 !== h2) return 'desatualizado'
  if (v.paginas != null && atual.paginas != null && v.paginas !== atual.paginas) return 'desatualizado'
  return 'compativel'
}

export interface AncoraGravada { /** trecho exato na espinha (ancora_texto); null = usar `texto` */ exact?: string | null; ancora_hash?: string | null; rotulo?: string | null; contexto?: string | null; tipo_trecho?: string | null; prefix: string | null; suffix: string | null; char_inicio: number | null; char_fim: number | null }
export interface GrifoBruto extends Partial<AncoraGravada> { ancora_texto?: string | null; id: string; versao_id?: string | null; pagina: number; rects: any; cor?: string | null; tool?: string | null; nota?: string | null; texto?: string | null }
export interface GrifoPdfLite { id: string; pagina: number; rects: { x0: number; y0: number; x1: number; y1: number }[]; cor: string; tool: string; nota: string | null; texto: string | null; /** âncora de TEXTO (se gravada) — o vínculo real do grifo; rects são cache */ ancora?: AncoraGravada }
export interface GrifoDesatualizado extends GrifoPdfLite { versaoId: string | null }

const norm = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Separa os grifos do aluno em (a) pintáveis na versão atual e (b) desatualizados (versão anterior incompatível).
 * Um desatualizado cujo texto JÁ foi reaplicado na versão atual (mesmo texto + tool + cor entre os pintáveis que
 * foram gravados na versão atual) é omitido da lista (já resolvido) — mas continua no banco, intacto.
 */
export function separarGrifosPorVersao(rows: GrifoBruto[], atual: VersaoInfo, versoes: Map<string, VersaoInfo>): { pintar: GrifoPdfLite[]; desatualizados: GrifoDesatualizado[] } {
  const pintar: GrifoPdfLite[] = []; const bruto: GrifoDesatualizado[] = []
  for (const g of rows) {
    const rects = Array.isArray(g.rects) ? g.rects : []
    const base: GrifoPdfLite = { id: g.id, pagina: g.pagina, rects, cor: g.cor || 'y', tool: g.tool || 'hl', nota: g.nota ?? null, texto: g.texto ?? null }
    if (g.char_inicio != null && g.char_fim != null) base.ancora = { exact: g.ancora_texto ?? null, ancora_hash: g.ancora_hash ?? null, rotulo: g.rotulo ?? null, contexto: g.contexto ?? null, tipo_trecho: g.tipo_trecho ?? null, prefix: g.prefix ?? null, suffix: g.suffix ?? null, char_inicio: g.char_inicio, char_fim: g.char_fim }
    const c = compatibilidadeGrifo(g.versao_id, atual, versoes)
    if (c === 'desatualizado') bruto.push({ ...base, versaoId: g.versao_id ?? null })
    else if (rects.length) pintar.push(base)
  }
  const jaNaAtual = new Set(pintar.filter((g) => g.texto).map((g) => `${norm(g.texto)}|${g.tool}|${g.cor}`))
  const desatualizados = bruto.filter((g) => !(g.texto && jaNaAtual.has(`${norm(g.texto)}|${g.tool}|${g.cor}`)))
  return { pintar, desatualizados }
}

// ───────────── Reancoragem por texto ─────────────
import { espinhaDoPdf, ancoraDeTexto, rectsDoTrecho } from './pdf-texto-ancora'
export interface ItemTexto { str: string; x0: number; y0: number; x1: number; y1: number } // normalizado 0..1 na página
export interface PaginaTexto { pagina: number; itens: ItemTexto[] }
export interface Reancora { pagina: number; rects: { x0: number; y0: number; x1: number; y1: number }[] }

/**
 * Procura `texto` (o do grifo) no texto das páginas do PDF ATUAL. Só aceita se a sequência for ÚNICA no documento (ou única
 * na página original, se `paginaOriginal` dada); ambíguo/inexistente → null (o grifo segue desatualizado, nunca é adivinhado).
 * UNIFICADO com lib/conteudo/pdf-texto-ancora.ts (espinha + busca por chave compacta, tolera espaçamento/acentos).
 * Os rects são por item de texto tocado (largura proporcional aos caracteres, nas pontas), SEM mesclar linhas.
 */
export function reancorarPorTexto(texto: string, paginas: PaginaTexto[], paginaOriginal?: number): Reancora | null {
  const e = espinhaDoPdf(paginas)
  const r = ancoraDeTexto(e, String(texto ?? ''), paginaOriginal ?? null)
  if (!r) return null
  const rects = rectsDoTrecho(e, r.resolucao.inicio, r.resolucao.fim, false).find((x) => x.pagina === r.resolucao.pagina)?.rects ?? []
  return rects.length ? { pagina: r.resolucao.pagina, rects } : null
}
