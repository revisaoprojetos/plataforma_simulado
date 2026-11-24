/**
 * RESTRIÇÕES DECLARATIVAS POR PERSONAGEM (tipo de meta) — vocabulário, aplicação no motor, conflitos e exemplos.
 *
 * Módulo PURO (sem zod, sem 'server-only'): é compilado junto do motor para o iframe. Sem restrições ativas, `restricaoBloqueia`
 * devolve `false` na 1ª linha — a saída do motor é idêntica à de antes (provado pelo golden 125/125).
 * A validação (zod) fica em `regras-validacao.ts`; as invariantes da saída ficam em `invariantes.ts`.
 */
import { familiaDoTipo } from './tipos-meta'
import type { FamiliaRestricao, RestricaoRegra, TipoRestricao } from './regras'

export const ROTULO_FAMILIA: Readonly<Record<FamiliaRestricao, string>> = { pf: 'PDFull', fl: 'PDFlash', qu: 'Questões', lp: 'LegProc', jp: 'Jurisprudência' }
export const ROTULO_TIPO_RESTRICAO: Readonly<Record<TipoRestricao, string>> = {
  max_por_dia: 'Máximo por dia',
  nao_mesmo_dia: 'Não no mesmo dia que',
  nao_dias_seguidos: 'Não em dias seguidos',
  so_na_sobra: 'Só na sobra do dia',
  depois_de: 'Depois de',
}

/** Contexto que o motor entrega a cada consulta. Tudo é leitura. */
export interface CtxRestricao {
  /** ids de metas já alocadas no dia. */
  idsDoDia: (d: string) => string[]
  /** data (ISO) em que o id está alocado, se estiver. */
  dataDe: (id: string) => string | undefined
  /** faixa de carga (1/2/3) da semana do dia consultado. */
  faixa: number
  /** chave de contagem do PDFull (partes da mesma leitura contam 1). */
  pai: (id: string) => string
  /** Existe meta pendente de família diferente de `familia` (excluindo LegProc, que é a "sobra")? */
  haOutrosPendentes: (familia: FamiliaRestricao) => boolean
}

const famDe = (id: string): string => familiaDoTipo(id.split(':')[0])
const ehVariante = (id: string): boolean => /:(revisao|reforco|hist):/.test(id)
/** Dia da semana de uma data ISO: 0 = segunda … 6 = domingo. */
export function diaSemanaISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}
export function somaDiasISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * A meta `id` NÃO pode ser alocada em `d` por alguma restrição ativa? (consulta pura; não altera nada)
 * `restricoes` vazio → `false` imediatamente.
 */
export function restricaoQueBloqueia(restricoes: readonly RestricaoRegra[], id: string, d: string, ctx: CtxRestricao): RestricaoRegra | null {
  if (!restricoes.length) return null
  const F = famDe(id)
  const minha = F === 'pf' ? ctx.pai(id) : id
  const chave = (k: string) => (famDe(k) === 'pf' ? ctx.pai(k) : k)
  for (const r of restricoes) {
    if (!r.ativa) continue
    if (r.faixas.length && !r.faixas.includes(ctx.faixa)) continue
    if (r.dias && r.dias.length && !r.dias.includes(diaSemanaISO(d))) continue
    switch (r.tipo) {
      case 'max_por_dia': {
        if (F !== r.tipoA) break
        const n = new Set(ctx.idsDoDia(d).filter((k) => famDe(k) === F).map(chave))
        n.delete(minha)
        if (n.size >= r.valor) return r
        break
      }
      case 'nao_mesmo_dia': {
        const outro = F === r.tipoA ? r.tipoB : F === r.tipoB ? r.tipoA : null
        if (!outro || outro === F) break
        if (ctx.idsDoDia(d).some((k) => famDe(k) === outro)) return r
        break
      }
      case 'nao_dias_seguidos': {
        if (F !== r.tipoA) break
        for (const v of [somaDiasISO(d, -1), somaDiasISO(d, 1)]) if (ctx.idsDoDia(v).some((k) => famDe(k) === F && chave(k) !== minha)) return r
        break
      }
      case 'so_na_sobra': {
        if (F !== r.tipoA) break
        if (!ctx.idsDoDia(d).some((k) => famDe(k) !== F) && ctx.haOutrosPendentes(r.tipoA)) return r
        break
      }
      case 'depois_de': {
        if (F !== r.tipoA || !r.tipoB || ehVariante(id)) break
        if (r.tipoB === 'lp' || r.tipoB === 'jp' || r.tipoA === 'lp' || r.tipoA === 'jp') break
        const i = id.split(':')[1]
        const dataB = ctx.dataDe(`${r.tipoB}:${i}`)
        if (dataB && d < somaDiasISO(dataB, r.valor)) return r
        break
      }
    }
  }
  return null
}
/** Booleano (a consulta usada pelo motor). */
export const restricaoBloqueia = (restricoes: readonly RestricaoRegra[], id: string, d: string, ctx: CtxRestricao): boolean => restricaoQueBloqueia(restricoes, id, d, ctx) !== null


// ── conflitos detectáveis (aviso/erro ao salvar) ─────────────────────────────────────────────────────
export interface ConflitosRestricoes { erros: string[]; avisos: string[] }
const nome = (f: string) => ROTULO_FAMILIA[f as FamiliaRestricao] ?? f

/** Conflitos ENTRE restrições ativas (e de cada uma com o motor). `erros` bloqueiam o salvamento; `avisos` apenas informam. */
export function detectarConflitosRestricoes(restricoes: readonly RestricaoRegra[]): ConflitosRestricoes {
  const erros: string[] = [], avisos: string[] = []
  const at = restricoes.filter((r) => r.ativa)
  const cobre = (a: RestricaoRegra, b: RestricaoRegra) => !a.faixas.length || !b.faixas.length || a.faixas.some((f) => b.faixas.includes(f))
  for (const r of at) {
    if (r.tipo === 'nao_mesmo_dia' && r.tipoA === r.tipoB) erros.push(`${nome(r.tipoA)} não pode ser "não no mesmo dia" dele mesmo (use "Máximo por dia").`)
    if (r.tipo === 'depois_de' && r.tipoA === r.tipoB) erros.push(`${nome(r.tipoA)} não pode vir "depois de" ele mesmo.`)
    if (r.tipo === 'depois_de' && [r.tipoA, r.tipoB].some((f) => f === 'lp' || f === 'jp')) erros.push('"Depois de" só vale entre PDFull, PDFlash e Questões (LegProc e Jurisprudência não têm ordem por conteúdo).')
    if (r.tipo === 'so_na_sobra' && r.tipoA === 'pf') erros.push('PDFull não pode ser "só na sobra do dia": a leitura é o que abre o dia e o plano não fecharia.')
    if (r.tipo === 'nao_dias_seguidos' && r.tipoA === 'pf') avisos.push('PDFull "não em dias seguidos" pode impedir que a leitura caiba na semana (o motor então não gera o plano).')
    if (r.tipo === 'max_por_dia' && r.valor === 0 && r.tipoA === 'pf' && !(r.dias && r.dias.length && r.dias.length < 7)) erros.push('PDFull "no máximo 0 por dia" em todos os dias impede qualquer leitura: o plano não seria gerado.')
    if (r.tipo === 'max_por_dia' && r.tipoA === 'jp') avisos.push('Jurisprudência já é no máximo 1 por semana; o limite por dia não muda o plano.')
  }
  for (let x = 0; x < at.length; x++) for (let y = x + 1; y < at.length; y++) {
    const a = at[x], b = at[y]
    if (!cobre(a, b)) continue
    // "A não com B" × "B depois de A (0 dia)": um não pode coexistir no mesmo dia, o outro admite o mesmo dia — redundância ambígua.
    for (const [n, d] of [[a, b], [b, a]] as const) {
      if (n.tipo === 'nao_mesmo_dia' && d.tipo === 'depois_de' && d.valor === 0 && ((n.tipoA === d.tipoA && n.tipoB === d.tipoB) || (n.tipoA === d.tipoB && n.tipoB === d.tipoA)))
        avisos.push(`"${nome(n.tipoA)} não no mesmo dia que ${nome(n.tipoB as string)}" e "${nome(d.tipoA)} depois de ${nome(d.tipoB as string)} (0 dia)" juntas obrigam o dia seguinte: use "depois de" com 1 dia ou remova uma.`)
    }
    // ciclo de dependência: A depois de B e B depois de A.
    if (a.tipo === 'depois_de' && b.tipo === 'depois_de' && a.tipoA === b.tipoB && a.tipoB === b.tipoA) erros.push(`Dependência circular: ${nome(a.tipoA)} depois de ${nome(a.tipoB as string)} e ${nome(b.tipoA)} depois de ${nome(b.tipoB as string)}.`)
    // "A não com B" + "B só na sobra" + nada mais além de A e B: o dia de B nunca terá outro tipo senão A.
    if (a.tipo === 'nao_mesmo_dia' && b.tipo === 'so_na_sobra' && (b.tipoA === a.tipoA || b.tipoA === a.tipoB)) {
      const outro = b.tipoA === a.tipoA ? a.tipoB : a.tipoA
      avisos.push(`${nome(b.tipoA)} "só na sobra" depende de outra meta no dia, mas está proibido de dividir o dia com ${nome(outro as string)}; ele só entrará em dias com os demais tipos.`)
    }
    if (b.tipo === 'nao_mesmo_dia' && a.tipo === 'so_na_sobra' && (a.tipoA === b.tipoA || a.tipoA === b.tipoB)) {
      const outro = a.tipoA === b.tipoA ? b.tipoB : b.tipoA
      avisos.push(`${nome(a.tipoA)} "só na sobra" depende de outra meta no dia, mas está proibido de dividir o dia com ${nome(outro as string)}; ele só entrará em dias com os demais tipos.`)
    }
    // duplicadas
    if (a.tipo === b.tipo && a.tipoA === b.tipoA && a.tipoB === b.tipoB && a.valor === b.valor) avisos.push(`Há duas restrições iguais ("${ROTULO_TIPO_RESTRICAO[a.tipo]}" — ${nome(a.tipoA)}); remova uma.`)
  }
  return { erros: [...new Set(erros)], avisos: [...new Set(avisos)] }
}

// ── exemplos prontos (DESLIGADOS; o admin ativa na UI) ───────────────────────────────────────────────
export const EXEMPLOS_RESTRICOES: readonly RestricaoRegra[] = [
  { id: 'ex-pdfull-sem-questoes', tipo: 'nao_mesmo_dia', ativa: false, rotulo: 'PDFull não no mesmo dia que as Questões', tipoA: 'pf', tipoB: 'qu', valor: 0, faixas: [] },
  { id: 'ex-pdfull-sem-flash', tipo: 'nao_mesmo_dia', ativa: false, rotulo: 'PDFull não no mesmo dia que o PDFlash', tipoA: 'pf', tipoB: 'fl', valor: 0, faixas: [] },
  { id: 'ex-pdflash-sem-seguidos', tipo: 'nao_dias_seguidos', ativa: false, rotulo: 'Sem 2 dias seguidos de PDFlash', tipoA: 'fl', tipoB: null, valor: 0, faixas: [] },
  { id: 'ex-questoes-1-dia', tipo: 'max_por_dia', ativa: false, rotulo: 'No máximo 1 meta de Questões por dia', tipoA: 'qu', tipoB: null, valor: 1, faixas: [] },
  { id: 'ex-legproc-sobra', tipo: 'so_na_sobra', ativa: false, rotulo: 'LegProc só na sobra do dia', tipoA: 'lp', tipoB: null, valor: 0, faixas: [] },
  { id: 'ex-questoes-depois-flash', tipo: 'depois_de', ativa: false, rotulo: 'Questões ao menos 1 dia depois do PDFlash', tipoA: 'qu', tipoB: 'fl', valor: 1, faixas: [] },
]

/** Descrição legível de uma restrição (UI, avisos, relatórios). */
export function descreverRestricao(r: RestricaoRegra): string {
  const NOMES_DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
  const esc = (r.faixas.length ? ` (faixa ${r.faixas.join(', ')})` : '') + (r.dias && r.dias.length ? ` (${r.dias.map((d) => NOMES_DIA[d]).join(', ')})` : '')
  const A = nome(r.tipoA), B = r.tipoB ? nome(r.tipoB) : ''
  switch (r.tipo) {
    case 'max_por_dia': return r.valor === 0 ? `${A}: bloqueado${esc}` : `${A}: no máximo ${r.valor} por dia${esc}`
    case 'nao_mesmo_dia': return `${A} não no mesmo dia que ${B}${esc}`
    case 'nao_dias_seguidos': return `${A} não em dias seguidos${esc}`
    case 'so_na_sobra': return `${A} só na sobra do dia${esc}`
    case 'depois_de': return `${A} ao menos ${r.valor} dia(s) depois de ${B}${esc}`
  }
}
