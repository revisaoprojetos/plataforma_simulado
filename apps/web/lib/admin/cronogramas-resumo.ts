// Funções PURAS do resumo unificado de "Cronogramas" (Gerador x Adaptativo). Client-safe, sem I/O.
// Os dois lados exibem os MESMOS rótulos na MESMA ordem; onde o lado não tem o conceito o valor é `null`
// (a tela mostra "não se aplica"/"—"). Os números vêm de SQL agregado no servidor (lib/revisao/*); aqui só se organiza.

export type LadoCronograma = 'gerador' | 'adaptativo'
export const TIPOS_META_RESUMO = ['pdfull', 'pdflash', 'pdfight', 'quest', 'legproc', 'juris'] as const
export type TipoMetaResumo = (typeof TIPOS_META_RESUMO)[number]
export const ROTULO_TIPO_RESUMO: Record<TipoMetaResumo, string> = {
  pdfull: 'PDFull', pdflash: 'PDFlash', pdfight: 'PDFight', quest: 'Questões', legproc: 'LegProc', juris: 'Jurisprudência',
}

export interface ResumoCronograma {
  lado: LadoCronograma
  /** Aulas (Gerador: aulas distintas nos conjuntos · Adaptativo: aulas ativas do catálogo). */
  aulas: number | null
  /** Itens aula x material (só o Gerador: cada linha de conjunto). */
  itensAula?: number | null
  /** Disciplinas (Adaptativo) / conjuntos de conteúdo (Gerador). */
  disciplinas: number | null
  /** Metas por tipo; `null` = o lado não tem esse tipo (não se aplica). */
  metasPorTipo: Record<TipoMetaResumo, number | null>
  /** Links de aula (Gerador) / documentos da Biblioteca (Adaptativo). */
  links: number | null
  /** Cronogramas (Gerador) / planos de alunos (Adaptativo). */
  cronogramas: number | null
  /** Detalhe curto de cronogramas (ex.: "8 liberados"). */
  cronogramasDetalhe?: string
}

export const fmtN = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString('pt-BR'))

export function totalMetas(m: Record<TipoMetaResumo, number | null>): number | null {
  const vals = TIPOS_META_RESUMO.map((t) => m[t]).filter((v): v is number => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

export interface CardResumo { id: string; rotulo: string; valor: string; dica?: string; naoSeAplica?: boolean }

/** Cards principais — MESMOS rótulos e ordem nos dois lados: Aulas, Disciplinas/conjuntos, Metas, Links/materiais, Cronogramas/planos. */
export function cardsPrincipais(r: ResumoCronograma): CardResumo[] {
  const g = r.lado === 'gerador'
  return [
    { id: 'aulas', rotulo: 'Aulas', valor: fmtN(r.aulas), dica: g && r.itensAula != null ? `${fmtN(r.itensAula)} itens aula × material` : undefined },
    { id: 'disciplinas', rotulo: 'Disciplinas / conjuntos', valor: fmtN(r.disciplinas), dica: g ? 'conjuntos de conteúdo' : 'disciplinas com aula ativa' },
    { id: 'metas', rotulo: 'Metas', valor: fmtN(totalMetas(r.metasPorTipo)), dica: g ? 'metas dos cronogramas' : 'materiais que geram metas' },
    { id: 'links', rotulo: 'Links / materiais', valor: fmtN(r.links), dica: g ? 'links de aula cadastrados' : 'documentos publicados na Biblioteca' },
    { id: 'cronogramas', rotulo: 'Cronogramas / planos', valor: fmtN(r.cronogramas), dica: r.cronogramasDetalhe },
  ]
}

/** Cards por tipo de meta (mesma ordem; `null` vira "não se aplica"). */
export function cardsPorTipo(r: ResumoCronograma): CardResumo[] {
  return TIPOS_META_RESUMO.map((t) => {
    const v = r.metasPorTipo[t]
    return { id: t, rotulo: ROTULO_TIPO_RESUMO[t], valor: v == null ? 'não se aplica' : fmtN(v), naoSeAplica: v == null }
  })
}

export const NOTA_CONTAGEM_AULAS: Record<LadoCronograma, string> = {
  gerador: 'Aulas distintas dentro dos conjuntos de conteúdo. Cada aula pode ter vários itens (PDFull, PDFlash, questões, LegProc): por isso o total de itens é maior que o de aulas. Metas = linhas já distribuídas nos cronogramas prontos.',
  adaptativo: 'Aulas ativas do catálogo que geram metas para cada aluno (uma por PDFull). Metas = materiais da Biblioteca que alimentam o plano de cada aluno, não metas já distribuídas.',
}
export const NOTA_RECONCILIACAO =
  'Por que Gerador e Adaptativo não batem: o Gerador conta ITENS de aula (uma aula com PDFull + PDFlash + questões = 3 itens) e metas já distribuídas em cronogramas prontos; o Adaptativo conta aulas do catálogo e documentos da Biblioteca, e monta as metas de cada aluno na hora. São contagens diferentes, por isso não são forçadas a ficar iguais. PDFight só existe no Adaptativo.'

// ── Painel de totais por disciplina (Gerador) ─────────────────────────────────────────────────

export interface LinhaDisciplinaGerador {
  disciplina: string
  aulas: number          // aulas distintas nos conjuntos da disciplina
  itens: number          // itens aula x material nos conjuntos
  pdfull: number; pdflash: number; quest: number; legproc: number; juris: number; outros: number
  metas: number          // total de metas nos cronogramas
  links: number          // links de aula
}

export type SituacaoCobertura = 'completa' | 'parcial' | 'sem-metas' | 'sem-aulas'

/** Cobertura de uma disciplina: aulas do conjunto x metas x links. */
export function situacaoCobertura(l: Pick<LinhaDisciplinaGerador, 'aulas' | 'metas' | 'links'>): SituacaoCobertura {
  if (l.aulas === 0) return 'sem-aulas'
  if (l.metas === 0) return 'sem-metas'
  return l.links >= l.aulas ? 'completa' : 'parcial'
}

export const ROTULO_COBERTURA: Record<SituacaoCobertura, string> = {
  completa: 'Completa', parcial: 'Faltam links', 'sem-metas': 'Sem metas', 'sem-aulas': 'Sem aulas no conjunto',
}

export const COLUNAS_DISC = ['disciplina', 'aulas', 'pdfull', 'pdflash', 'quest', 'legproc', 'juris', 'metas', 'links'] as const
export type ColunaDisc = (typeof COLUNAS_DISC)[number]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export interface PaginaDisciplinasGerador {
  itens: LinhaDisciplinaGerador[]; total: number; pagina: number; porPagina: number; totalPaginas: number
}

/** Busca + situação + ordenação + paginação (server-side, sobre o agregado já cacheado). */
export function paginarDisciplinasGerador(
  base: LinhaDisciplinaGerador[],
  f: { q?: string; situ?: string; ord?: string; dir?: 'asc' | 'desc'; pagina?: number; porPagina?: number },
): PaginaDisciplinasGerador {
  const q = norm(f.q ?? '')
  let l = base.filter((x) => (!q || norm(x.disciplina).includes(q)) && (!f.situ || situacaoCobertura(x) === f.situ))
  const col: ColunaDisc = (COLUNAS_DISC as readonly string[]).includes(f.ord ?? '') ? (f.ord as ColunaDisc) : 'disciplina'
  const sinal = f.dir === 'desc' ? -1 : 1
  const nome = (a: LinhaDisciplinaGerador, b: LinhaDisciplinaGerador) => a.disciplina.localeCompare(b.disciplina, 'pt-BR')
  l = [...l].sort((a, b) => {
    if (col === 'disciplina') return nome(a, b) * sinal
    const c = (a[col] as number) - (b[col] as number)
    return c ? c * sinal : nome(a, b)
  })
  const porPagina = Math.max(1, f.porPagina ?? 14)
  const totalPaginas = Math.max(1, Math.ceil(l.length / porPagina))
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), totalPaginas)
  return { itens: l.slice((pagina - 1) * porPagina, pagina * porPagina), total: l.length, pagina, porPagina, totalPaginas }
}

/** Agrega as linhas SQL cruas (disciplina, tipo, n) em linhas por disciplina. Chave = nome normalizado. */
export function agregarPorDisciplina(
  aulas: Array<{ disciplina: string; aulas: number; itens: number }>,
  metas: Array<{ disciplina: string; tipo: string; n: number }>,
  links: Array<{ disciplina: string; n: number }>,
): LinhaDisciplinaGerador[] {
  const mapa = new Map<string, LinhaDisciplinaGerador>()
  const get = (nome: string) => {
    const k = norm(nome || 'Sem disciplina')
    let e = mapa.get(k)
    if (!e) { e = { disciplina: nome || 'Sem disciplina', aulas: 0, itens: 0, pdfull: 0, pdflash: 0, quest: 0, legproc: 0, juris: 0, outros: 0, metas: 0, links: 0 }; mapa.set(k, e) }
    return e
  }
  for (const a of aulas) { const e = get(a.disciplina); e.aulas += a.aulas; e.itens += a.itens }
  for (const m of metas) {
    const e = get(m.disciplina)
    const t = m.tipo === 'flash' ? 'pdflash' : m.tipo
    if (t === 'pdfull' || t === 'pdflash' || t === 'quest' || t === 'legproc' || t === 'juris') e[t] += m.n; else e.outros += m.n
    e.metas += m.n
  }
  for (const l of links) get(l.disciplina).links += l.n
  return [...mapa.values()].sort((a, b) => a.disciplina.localeCompare(b.disciplina, 'pt-BR'))
}
