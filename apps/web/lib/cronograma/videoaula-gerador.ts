/**
 * VIDEOAULA como classificação do Gerador (puro, sem I/O — roda em node/vitest).
 *
 * A coluna "Videoaula" da matriz de aulas grava, como as demais, em `simulado_conteudo_selecao_meta` (area='gerador') com a chave
 * `cj:<conjunto>|<aula>|videoaula`. A videoaula NÃO é uma seção (meta) da aula: ela fica LIGADA à aula e é exposta no aluno por UMA
 * meta âncora da aula (a de leitura/PDFull; senão a primeira), junto do PDFull, de outro PDF de meta ou das questões.
 * O tempo do vídeo NÃO entra nas horas do cronograma (não é meta; a duração segue a das metas da aula).
 * Regra de ouro (compat): sem seleção 'videoaula' → mapa vazio → comportamento IDÊNTICO ao de antes.
 */

import { chaveDisc, materialDaMeta, urlLeitorRevisao, type MetaParaConteudo } from './conteudo-meta'
import { chaveAulaGerador, selecaoDaMeta, type IndiceSelecoes, type SelecaoGerador } from './selecao-gerador'
import { SLUG_VIDEOAULA, ehTipoVideoaula, type ColunaMatriz } from './matriz-gerador-tipos'

export { SLUG_VIDEOAULA, ehTipoVideoaula }

/** Documento da Biblioteca que pode ser videoaula. */
export const TIPO_ORIGEM_VIDEOAULA = 'video'
export const CATEGORIAS_VIDEOAULA: readonly string[] = ['conteudo', 'jurisclub']

/** Coluna "Videoaula" da matriz (sintética: não depende de seção/tipo de meta). null = classificação ausente ou inativa no tenant. */
export function colunaVideoaula(
  catalogo: { id: string; slug: string; nome: string; cor: string | null; papel: string | null; ativo: boolean }[],
): ColunaMatriz | null {
  const c = catalogo.find((x) => x.slug === SLUG_VIDEOAULA && x.ativo)
  if (!c) return null
  return { tipo: SLUG_VIDEOAULA, nome: c.nome || 'Videoaula', cor: c.cor, classificacaoId: c.id, classificacaoSlug: SLUG_VIDEOAULA, papel: c.papel }
}

/** O índice tem alguma seleção de videoaula? (atalho barato: sem isso nada mais é consultado) */
export function temSelecaoVideoaula(idx: IndiceSelecoes): boolean {
  for (const k of idx.keys()) if (k.endsWith(`|${SLUG_VIDEOAULA}`)) return true
  return false
}

/** Seleção de videoaula que vale para a aula da meta (disciplinas candidatas × aula), ou null. */
export function selecaoVideoaulaDaMeta(meta: Pick<MetaParaConteudo, 'disciplinas' | 'aula'>, idx: IndiceSelecoes): SelecaoGerador | null {
  return selecaoDaMeta({ ...meta, tipo: SLUG_VIDEOAULA }, idx)
}

type MetaAncora = Pick<MetaParaConteudo, 'id' | 'tipo' | 'disciplinas' | 'aula'>

/** Prioridade da âncora: leitura (PDFull) 0 · PDFlash/LegProc 1 · demais (questões, fight…) 2. */
function rankAncora(tipo: string): number {
  const m = materialDaMeta(tipo)
  return m === 'pdfull' ? 0 : m ? 1 : 2
}

/**
 * Para cada aula (disciplina × aula) com seleção de videoaula VISÍVEL ao aluno, a meta âncora que a exibe.
 * Retorna metaId → seleção. Seleção oculta (`visivelAluno=false`) não gera nada. Empate = primeira meta na ordem recebida.
 */
export function videoaulasPorMeta(metas: MetaAncora[], idx: IndiceSelecoes): Map<string, SelecaoGerador> {
  const out = new Map<string, SelecaoGerador>()
  if (!idx.size || !temSelecaoVideoaula(idx)) return out
  const melhor = new Map<string, { id: string; rank: number; sel: SelecaoGerador }>()
  for (const m of metas) {
    const aula = chaveAulaGerador(m.aula)
    if (!aula) continue
    const sel = selecaoVideoaulaDaMeta(m, idx)
    if (!sel || !sel.visivelAluno) continue
    const k = `${chaveDisc(m.disciplinas[0] ?? '')}|${aula}`
    const rank = rankAncora(m.tipo)
    const atual = melhor.get(k)
    if (!atual || rank < atual.rank) melhor.set(k, { id: m.id, rank, sel })
  }
  for (const { id, sel } of melhor.values()) out.set(id, sel)
  return out
}

export interface VideoaulaMeta { id: string; titulo: string; url: string }

/**
 * Monta o que o aluno recebe: só vídeos EXISTENTES e permitidos (`validos`: id → título; já filtrados no servidor por publicado,
 * não apagado, tipo_origem 'video' e categoria conteudo/jurisclub) e não bloqueados pela liberação do aluno.
 * O rótulo escolhido pelo admin (rotulo_aluno) vence o título do documento. Documento despublicado/apagado → ignora.
 */
export function montarVideoaulas(
  porMeta: Map<string, SelecaoGerador>, validos: ReadonlyMap<string, string>, emissaoId: string,
  bloqueados?: Readonly<Record<string, string>>,
): Map<string, VideoaulaMeta> {
  const out = new Map<string, VideoaulaMeta>()
  for (const [metaId, sel] of porMeta) {
    const titulo = validos.get(sel.documentoId)
    if (titulo === undefined) continue
    if (bloqueados && bloqueados[sel.documentoId] !== undefined) continue
    out.set(metaId, { id: sel.documentoId, titulo: sel.rotuloAluno?.trim() || titulo, url: urlLeitorRevisao(sel.documentoId, emissaoId, null) })
  }
  return out
}
