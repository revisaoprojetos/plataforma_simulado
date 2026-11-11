/**
 * Visão derivada de uma emissão do cronograma Revisão (plano FIXO do admin) — módulo PURO.
 *
 * Backend-first: "hoje", "semana atual", metas do dia, atrasadas, próximos dias e o índice das
 * semanas saem prontos do SERVIDOR, a partir da grade com o calendário congelado. O cliente só
 * exibe. Não há reajuste/recálculo: o plano não muda, só as marcações do aluno.
 *
 * Datas civis ('YYYY-MM-DD'); "hoje" vem de `hojeBrtISO()` (Brasília), nunca de `new Date()` local.
 */

import { fmtFaixa, somarDuracoes } from './duracao'
import type { DataISO } from './datas'
import type { BlocoRevisao, Grade, MetaDatada, SemanaGrade } from './tipos'

export type DiaVisao = {
  data: DataISO
  diaNome: string
  metas: MetaDatada[]
  /** Carga prevista do dia ("3h – 4h"); null quando alguma duração não é reconhecível. */
  carga: string | null
}

export type SemanaVisao = {
  numero: number
  kind: SemanaGrade['kind']
  inicio: DataISO
  fim: DataISO
  dias: DiaVisao[]
  blocos: BlocoRevisao[]
  total: number
  feitas: number
  carga: string | null
}

/** Índice leve de todas as semanas (régua de navegação) — sem as metas. */
export type SemanaIndex = {
  numero: number
  kind: SemanaGrade['kind']
  inicio: DataISO
  fim: DataISO
  total: number
  feitas: number
}

export type ProximoDia = {
  data: DataISO
  diaNome: string
  qtd: number
  itens: { id: string; titulo: string; tipo: string }[]
}

export type SituacaoPlano = 'antes' | 'andamento' | 'depois' | 'sem_datas'

export type ConfigVisao = {
  nomeModelo: string
  titulo: string | null
  inicio: DataISO | null
  conclusao: DataISO | null
  semDatas: boolean
  totalSemanas: number
  semanasConteudo: number
  semanasRevisao: number
  semanasRecesso: number
  diasPorSemana: number
  atividades: number
  diasEstudo: string[]
  recessos: { numero: number; inicio: DataISO; fim: DataISO }[]
  semanasRevisaoNumeros: number[]
  revisaoAtiva: boolean | null
  revisaoCada: number | null
  recessoModo: string | null
  recessoDe: DataISO | null
  recessoAte: DataISO | null
  geradoEm: string
  subtitulo: string
}

export type VisaoEmissao = {
  hoje: DataISO
  situacao: SituacaoPlano
  semanaAtual: number | null
  semanas: SemanaIndex[]
  /** Dia de hoje (ou, antes do início, o primeiro dia de estudo). */
  dia: DiaVisao | null
  /** Natureza da semana de hoje: revisão/recesso mudam o texto da aba Hoje. */
  semanaAtualKind: SemanaGrade['kind'] | null
  atrasadas: { total: number; itens: MetaDatada[] }
  proximos: ProximoDia[]
  /** Metas de `dia` + `atrasadas.itens` + `proximos`: o que a página precisa de checks/notas. */
  idsVisiveis: string[]
}

const LIMITE_ATRASADAS = 6
const LIMITE_PROXIMOS = 3

function rotuloCarga(metas: MetaDatada[]): string | null {
  const f = somarDuracoes(metas.map((m) => m.duracao))
  return f ? fmtFaixa(f) : null
}

function agruparDias(metas: MetaDatada[]): DiaVisao[] {
  const mapa = new Map<DataISO, MetaDatada[]>()
  for (const m of metas) {
    const l = mapa.get(m.data)
    if (l) l.push(m)
    else mapa.set(m.data, [m])
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([data, ms]) => ({ data, diaNome: ms[0].diaNome, metas: ms, carga: rotuloCarga(ms) }))
}

function contarFeitas(metas: MetaDatada[], checks: Record<string, string>): number {
  let n = 0
  for (const m of metas) if (checks[m.id]) n++
  return n
}

/** Uma semana inteira, com os dias agrupados — para a rota GET /semana. */
export function semanaVisao(grade: Grade, numero: number, checks: Record<string, string>): SemanaVisao | null {
  const s = grade.semanas.find((x) => x.numero === numero)
  if (!s) return null
  if (s.kind !== 'conteudo') {
    return { numero: s.numero, kind: s.kind, inicio: s.inicio, fim: s.fim, dias: [], blocos: s.kind === 'revisao' ? s.blocos : [], total: 0, feitas: 0, carga: null }
  }
  return {
    numero: s.numero,
    kind: s.kind,
    inicio: s.inicio,
    fim: s.fim,
    dias: agruparDias(s.metas),
    blocos: [],
    total: s.metas.length,
    feitas: contarFeitas(s.metas, checks),
    carga: rotuloCarga(s.metas),
  }
}

export function indiceSemanas(grade: Grade, checks: Record<string, string>): SemanaIndex[] {
  return grade.semanas.map((s) => ({
    numero: s.numero,
    kind: s.kind,
    inicio: s.inicio,
    fim: s.fim,
    total: s.kind === 'conteudo' ? s.metas.length : 0,
    feitas: s.kind === 'conteudo' ? contarFeitas(s.metas, checks) : 0,
  }))
}

/** Tudo que as abas Hoje/Semana precisam no 1º carregamento — derivado no servidor. */
export function derivarVisao(grade: Grade, checks: Record<string, string>, hoje: DataISO, semDatas: boolean): VisaoEmissao {
  const semanas = indiceSemanas(grade, checks)
  const gs = grade.semanas
  const todasMetas = gs.flatMap((s) => (s.kind === 'conteudo' ? s.metas : []))

  let situacao: SituacaoPlano = 'andamento'
  let semanaAtual: number | null = null
  let semanaAtualKind: SemanaGrade['kind'] | null = null

  if (!gs.length) {
    situacao = 'andamento'
  } else if (semDatas) {
    // Sem calendário: "atual" = primeira semana de conteúdo ainda com meta pendente (ou a última).
    situacao = 'sem_datas'
    const pend = semanas.find((s) => s.kind === 'conteudo' && s.feitas < s.total)
    semanaAtual = (pend ?? semanas[semanas.length - 1]).numero
  } else {
    const primeira = gs[0]
    const ultima = gs[gs.length - 1]
    const dentro = gs.find((s) => s.inicio <= hoje && hoje <= s.fim)
    if (dentro) {
      semanaAtual = dentro.numero
    } else if (hoje < primeira.inicio) {
      situacao = 'antes'
      semanaAtual = primeira.numero
    } else if (hoje > ultima.fim) {
      situacao = 'depois'
      semanaAtual = ultima.numero
    } else {
      // buraco entre semanas: a próxima que começa
      semanaAtual = (gs.find((s) => s.inicio > hoje) ?? ultima).numero
    }
  }
  semanaAtualKind = gs.find((s) => s.numero === semanaAtual)?.kind ?? null

  // Dia exibido na aba Hoje
  let dia: DiaVisao | null = null
  if (situacao === 'antes') {
    const primeiroDia = agruparDias(todasMetas)[0]
    dia = primeiroDia ?? null
  } else if (situacao === 'andamento') {
    const doDia = todasMetas.filter((m) => m.data === hoje)
    dia = doDia.length ? agruparDias(doDia)[0] : null
  }

  // Atrasadas (só com calendário e depois do início)
  const atrasadasTodas =
    situacao === 'andamento' || situacao === 'depois' ? todasMetas.filter((m) => m.data < hoje && !checks[m.id]) : []
  atrasadasTodas.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.ordem - b.ordem))
  const atrasadas = { total: atrasadasTodas.length, itens: atrasadasTodas.slice(0, LIMITE_ATRASADAS) }

  // Próximos dias com meta (depois de hoje; antes do início, depois do 1º dia)
  const base = situacao === 'antes' ? (dia?.data ?? hoje) : hoje
  const proximos: ProximoDia[] =
    situacao === 'andamento' || situacao === 'antes'
      ? agruparDias(todasMetas.filter((m) => m.data > base))
          .slice(0, LIMITE_PROXIMOS)
          .map((d) => ({
            data: d.data,
            diaNome: d.diaNome,
            qtd: d.metas.length,
            itens: d.metas.slice(0, 5).map((m) => ({ id: m.id, titulo: m.titulo, tipo: m.tipoDef.nome })),
          }))
      : []

  const idsVisiveis = [...(dia?.metas ?? []).map((m) => m.id), ...atrasadas.itens.map((m) => m.id)]

  return { hoje, situacao, semanaAtual, semanas, dia, semanaAtualKind, atrasadas, proximos, idsVisiveis }
}

/** Informações SOMENTE LEITURA da aba Configuração — nada de metas. */
export function montarConfig(
  grade: Grade,
  emissao: { cronograma_nome: string; titulo: string | null; formulario: Record<string, unknown> | null },
  geradoEmFormatado: string,
  semDatas: boolean,
): ConfigVisao {
  const f = (emissao.formulario ?? {}) as Record<string, any>
  const diasEstudo: string[] = []
  for (const s of grade.semanas) {
    if (s.kind !== 'conteudo') continue
    for (const m of s.metas) if (!diasEstudo.includes(m.diaNome)) diasEstudo.push(m.diaNome)
    if (diasEstudo.length >= 7) break
  }
  const dataOuNull = (x: unknown): DataISO | null => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null)
  return {
    nomeModelo: emissao.cronograma_nome,
    titulo: emissao.titulo,
    inicio: semDatas ? null : dataOuNull(f.inicio) ?? grade.semanas[0]?.inicio ?? null,
    conclusao: semDatas ? null : grade.resumo.conclusao || null,
    semDatas,
    totalSemanas: grade.resumo.totalSemanas,
    semanasConteudo: grade.resumo.semanasConteudo,
    semanasRevisao: grade.resumo.semanasRevisao,
    semanasRecesso: grade.resumo.semanasRecesso,
    diasPorSemana: grade.resumo.diasPorSemana,
    atividades: grade.resumo.atividades,
    diasEstudo,
    recessos: grade.semanas.filter((s) => s.kind === 'recesso').map((s) => ({ numero: s.numero, inicio: s.inicio, fim: s.fim })),
    semanasRevisaoNumeros: grade.semanas.filter((s) => s.kind === 'revisao').map((s) => s.numero),
    revisaoAtiva: typeof f.revisao?.ativo === 'boolean' ? f.revisao.ativo : null,
    revisaoCada: Number.isFinite(f.revisao?.cada) ? Number(f.revisao.cada) : null,
    recessoModo: typeof f.recesso?.modo === 'string' ? f.recesso.modo : null,
    recessoDe: dataOuNull(f.recesso?.de),
    recessoAte: dataOuNull(f.recesso?.ate),
    geradoEm: geradoEmFormatado,
    subtitulo: grade.resumo.subtitulo,
  }
}
