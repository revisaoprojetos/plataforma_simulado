/**
 * PARCIAL / NÃO REALIZADA do cronograma Revisão (plano FIXO). Módulo PURO (sem I/O) — a rota
 * /api/aluno/cronograma/meta-progresso valida com isto e o iframe só exibe o resultado.
 *
 * Mesmas perguntas do adaptativo (public/cronograma/adaptativo/index.html › abrirSobra), SEM redistribuir datas:
 *   · PDFull  -> última página concluída; saldo = páginas restantes (na última página, a meta é concluída);
 *   · LegProc -> artigo de parada; saldo = bloco de 20 min;
 *   · demais  -> ponto de parada + minutos restantes (1..duração planejada).
 */

export type FamiliaParcial = 'pdf' | 'lp' | 'outro'

export function familiaParcial(slug: string): FamiliaParcial {
  const s = String(slug || '').toLowerCase()
  if (s === 'pdfull' || s === 'pdf') return 'pdf'
  if (s === 'legproc') return 'lp'
  return 'outro'
}

export type EntradaParcial = {
  familia: FamiliaParcial
  totalPaginas?: number | null
  pagina?: number | null
  artigo?: string | null
  ponto?: string | null
  /** Duração planejada da meta, em minutos (ponto médio da faixa). */
  minutosPlanejados: number
  minutos?: number | null
}

export type ResultadoParcial =
  | {
      ok: true
      /** true = chegou à última página: o chamador marca a meta como concluída. */
      concluida: boolean
      paginaAte: number | null
      totalPaginas: number | null
      paginasRestantes: number | null
      artigo: string | null
      ponto: string | null
      minutosRestantes: number | null
      /** Valor curto exibido como "ponto de parada" (página, artigo ou texto). */
      rotulo: string
    }
  | { ok: false; erro: string }

const MAX_PAGINAS = 5000
export const BLOCO_LEGPROC_MIN = 20

const inteiro = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}
const texto = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function calcularParcial(e: EntradaParcial): ResultadoParcial {
  const plan = Math.max(1, Math.round(e.minutosPlanejados || 0) || 30)

  if (e.familia === 'pdf') {
    const total = inteiro(e.totalPaginas)
    if (total === null || total < 1 || total > MAX_PAGINAS) return { ok: false, erro: 'Informe o total de páginas da aula.' }
    const pag = inteiro(e.pagina)
    if (pag === null || pag < 0 || pag > total) return { ok: false, erro: `Informe uma página inteira entre 0 e ${total}.` }
    const restantes = total - pag
    return {
      ok: true,
      concluida: restantes === 0,
      paginaAte: pag,
      totalPaginas: total,
      paginasRestantes: restantes,
      artigo: null,
      ponto: null,
      minutosRestantes: restantes === 0 ? 0 : Math.max(1, Math.round((plan * restantes) / total)),
      rotulo: String(pag),
    }
  }

  if (e.familia === 'lp') {
    const artigo = texto(e.artigo, 60)
    if (!artigo) return { ok: false, erro: 'Informe até qual artigo você leu.' }
    return {
      ok: true, concluida: false, paginaAte: null, totalPaginas: null, paginasRestantes: null,
      artigo, ponto: null, minutosRestantes: Math.min(BLOCO_LEGPROC_MIN, plan), rotulo: artigo,
    }
  }

  const ponto = texto(e.ponto, 60)
  if (!ponto) return { ok: false, erro: 'Informe até onde você avançou.' }
  const min = inteiro(e.minutos)
  if (min === null || min < 1 || min > plan) return { ok: false, erro: `Informe os minutos restantes (1 a ${plan}).` }
  return {
    ok: true, concluida: false, paginaAte: null, totalPaginas: null, paginasRestantes: null,
    artigo: null, ponto, minutosRestantes: min, rotulo: ponto,
  }
}

/** Resumo de uma linha para o aluno (ex.: "Parou na p. 12 de 40 · faltam 28 páginas"). */
export function textoParada(familia: FamiliaParcial, r: { paginaAte?: number | null; totalPaginas?: number | null; artigo?: string | null; ponto?: string | null; minutosRestantes?: number | null }): string {
  if (familia === 'pdf' && r.paginaAte != null) {
    const resto = r.totalPaginas != null ? r.totalPaginas - r.paginaAte : null
    return `Parou na p. ${r.paginaAte}${r.totalPaginas ? ` de ${r.totalPaginas}` : ''}${resto ? ` · faltam ${resto} ${resto === 1 ? 'página' : 'páginas'}` : ''}`
  }
  if (familia === 'lp' && r.artigo) return `Parou em ${r.artigo}`
  if (r.ponto) return `Parou em: ${r.ponto}${r.minutosRestantes ? ` · faltam ${r.minutosRestantes} min` : ''}`
  return ''
}

/** Página para onde o leitor reabre (retoma na página seguinte à última concluída). */
export function paginaRetomada(paginaAte: number | null | undefined, total: number | null | undefined): number | null {
  if (paginaAte == null || paginaAte < 1) return null
  const p = paginaAte + 1
  return total && p > total ? total : p
}
