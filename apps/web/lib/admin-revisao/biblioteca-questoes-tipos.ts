// Tipos/constantes PUROS (sem server-only) do BANCO DE QUESTÕES dentro da Biblioteca (aba "Questões").
// Taxonomia usada: simulado_questoes.{disciplina_id, assunto_id, banca_id, orgao_id, ano, cargo, nivel_dificuldade, status, tipo}
// + etiquetas (simulado_questao_etiquetas). O assunto específico (assunto_detalhe) é texto livre: coluna/busca, não nó da árvore.

import type { ArvoreBib } from './biblioteca-tipos'

export type AgrupamentoQ = 'disciplina' | 'banca' | 'orgao' | 'ano' | 'cargo' | 'dificuldade' | 'status' | 'tipo' | 'etiqueta'

export const AGRUPAMENTOS_Q: { id: AgrupamentoQ; nome: string; sem: string; raiz: string }[] = [
  { id: 'disciplina', nome: 'Disciplina › Assunto', sem: 'Sem disciplina', raiz: 'Todas as disciplinas' },
  { id: 'banca', nome: 'Banca', sem: 'Sem banca', raiz: 'Todas as bancas' },
  { id: 'orgao', nome: 'Órgão', sem: 'Sem órgão', raiz: 'Todos os órgãos' },
  { id: 'ano', nome: 'Ano', sem: 'Sem ano', raiz: 'Todos os anos' },
  { id: 'cargo', nome: 'Cargo', sem: 'Sem cargo', raiz: 'Todos os cargos' },
  { id: 'dificuldade', nome: 'Dificuldade', sem: 'Sem dificuldade', raiz: 'Todas as dificuldades' },
  { id: 'status', nome: 'Status', sem: 'Sem status', raiz: 'Todos os status' },
  { id: 'tipo', nome: 'Tipo (objetiva/discursiva)', sem: 'Sem tipo', raiz: 'Todos os tipos' },
  { id: 'etiqueta', nome: 'Etiqueta', sem: 'Sem etiqueta', raiz: 'Todas as etiquetas' },
]
export const ehAgrupamentoQ = (v: unknown): v is AgrupamentoQ => AGRUPAMENTOS_Q.some((a) => a.id === v)

export const RAIZ_Q = '__raiz__'
export const PP_Q = [10, 14, 25, 50, 100]

/** Chaves de ordenação aceitas (whitelist também no servidor). */
export const ORDENS_Q = ['atualizado', 'enunciado', 'disciplina', 'assunto', 'banca', 'orgao', 'ano', 'dif', 'tipo', 'status', 'versao', 'alternativas', 'cargo', 'codigo'] as const
export type OrdemQ = (typeof ORDENS_Q)[number]

/** Visões rápidas (filtros salvos) do Banco. Vazio = nenhuma. Todas são calculadas no servidor (montarWhere). */
export const VISOES_Q: { id: string; nome: string; desc: string }[] = [
  { id: 'sem_classificacao', nome: 'Sem classificação', desc: 'Falta disciplina, assunto, banca ou ano' },
  { id: 'sem_disciplina', nome: 'Sem disciplina', desc: 'Questões sem disciplina' },
  { id: 'sem_assunto', nome: 'Sem assunto', desc: 'Questões sem assunto' },
  { id: 'sem_banca', nome: 'Sem banca', desc: 'Questões sem banca' },
  { id: 'sem_orgao', nome: 'Sem órgão', desc: 'Questões sem órgão' },
  { id: 'sem_ano', nome: 'Sem ano', desc: 'Questões sem ano' },
  { id: 'sem_dificuldade', nome: 'Sem dificuldade', desc: 'Questões sem nível de dificuldade' },
  { id: 'sem_cargo', nome: 'Sem cargo', desc: 'Questões sem cargo' },
  { id: 'sem_etiqueta', nome: 'Sem etiqueta', desc: 'Questões sem nenhuma etiqueta' },
  { id: 'assunto_divergente', nome: 'Assunto de outra disciplina', desc: 'O assunto pertence a uma disciplina diferente da questão' },
  { id: 'rascunho', nome: 'Rascunhos', desc: 'Questões em rascunho (invisíveis ao aluno)' },
  { id: 'arquivada', nome: 'Arquivadas', desc: 'Questões arquivadas' },
  { id: 'anulada', nome: 'Anuladas', desc: 'Questões marcadas como anuladas' },
  { id: 'reportada', nome: 'Com erro reportado', desc: 'Há reporte de erro pendente feito por aluno' },
  { id: 'duplicada', nome: 'Duplicadas suspeitas', desc: 'Enunciado repetido, mesmo código externo ou muito semelhante' },
]
export const ehVisaoQ = (v: unknown): v is string => VISOES_Q.some((x) => x.id === v)
/** Campos que a Classificação acompanha (qualidade) — `visao` = visão "sem_<campo>" correspondente. */
export const CAMPOS_CLASSIF: { k: string; rot: string; visao: string }[] = [
  { k: 'disciplina', rot: 'Disciplina', visao: 'sem_disciplina' },
  { k: 'assunto', rot: 'Assunto', visao: 'sem_assunto' },
  { k: 'banca', rot: 'Banca', visao: 'sem_banca' },
  { k: 'orgao', rot: 'Órgão', visao: 'sem_orgao' },
  { k: 'ano', rot: 'Ano', visao: 'sem_ano' },
  { k: 'cargo', rot: 'Cargo', visao: 'sem_cargo' },
  { k: 'dificuldade', rot: 'Dificuldade', visao: 'sem_dificuldade' },
  { k: 'etiqueta', rot: 'Etiqueta', visao: 'sem_etiqueta' },
]

export type SubAbaQ = 'banco' | 'unificar' | 'classificacao' | 'etiquetas'
export const SUBABAS_Q: { id: SubAbaQ; nome: string }[] = [
  { id: 'banco', nome: 'Banco de questões' },
  { id: 'unificar', nome: 'Unificar' },
  { id: 'classificacao', nome: 'Classificação' },
  { id: 'etiquetas', nome: 'Etiquetas' },
]
export const ehSubAbaQ = (v: unknown): v is SubAbaQ => SUBABAS_Q.some((x) => x.id === v)

export interface EstadoQ {
  /** visão rápida (filtro salvo) — '' = nenhuma */
  vis: string
  agrupar: AgrupamentoQ
  /** id do nó escolhido na árvore (`d:<disc>`, `a:<disc>:<assunto>`, `sa:<disc>`, `b:<banca>`, … ou RAIZ_Q = "sem valor"); null = todas. */
  no: string | null
  q: string
  status: string
  dif: string
  tipo: string
  banca: string
  orgao: string
  ano: string
  sort: string
  dir: 'asc' | 'desc'
  page: number
  pp: number
}

export const ESTADO_Q_PADRAO: EstadoQ = {
  vis: '', agrupar: 'disciplina', no: null, q: '', status: '', dif: '', tipo: '', banca: '', orgao: '', ano: '', sort: 'atualizado', dir: 'desc', page: 1, pp: 14,
}

export interface LinhaQuestaoBib {
  id: string
  codigo: string | null
  enunciado: string
  tipo: string | null
  formato: 'certo_errado' | 'multipla'
  status: string | null
  nivel_dificuldade: string | null
  ano: number | null
  cargo: string | null
  assuntoDetalhe: string | null
  disciplina: string | null
  assunto: string | null
  banca: string | null
  orgao: string | null
  nAlternativas: number
  versao: number
  anulada: boolean
  atualizadoEm: string | null
}

export interface OpcoesQ {
  bancas: { id: string; nome: string }[]
  orgaos: { id: string; nome: string }[]
  anos: number[]
  etiquetas: { id: string; nome: string; cor: string | null }[]
  disciplinas: { id: string; nome: string }[]
}

/** Árvore COMPACTA (só o necessário, em tuplas): [id, nome, paiId, proprios, total, cor?, disciplinaId?, classificacao?] — ~40% menor que o objeto completo. */
export interface ArvoreCompacta { nos: (string | number | null)[][]; semPasta: number; categoria: ArvoreBib['categoria'] }
export function compactarArvore(a: ArvoreBib): ArvoreCompacta {
  return { semPasta: a.semPasta, categoria: a.categoria, nos: a.nos.map((n) => {
    const t: (string | number | null)[] = [n.id, n.nome, n.paiId, n.proprios, n.total, n.cor, n.disciplinaId, n.classificacao]
    while (t.length > 5 && t[t.length - 1] === null) t.pop()
    return t
  }) }
}
export function hidratarArvore(c: ArvoreCompacta): ArvoreBib {
  return { semPasta: c.semPasta, categoria: c.categoria, nos: c.nos.map((t) => ({
    id: t[0] as string, nome: t[1] as string, paiId: (t[2] as string | null) ?? null, proprios: t[3] as number, total: t[4] as number,
    cor: (t[5] as string | null) ?? null, disciplinaId: (t[6] as string | null) ?? null, classificacao: (t[7] as string | null) ?? null, tipoMaterial: null, restrito: false,
  })) }
}
/** Converte `arvoreC` (rede/SSR) em `arvore` (uso na UI). Idempotente. */
export function hidratarResposta(j: RespostaQ | null): RespostaQ | null {
  if (!j || !j.arvoreC) return j
  const { arvoreC, ...resto } = j
  return { ...resto, arvore: hidratarArvore(arvoreC) }
}

export interface RespostaQ {
  total: number
  page: number
  pp: number
  rows: LinhaQuestaoBib[]
  /** total real do banco (sem filtros) — contador da aba. */
  totalBanco: number
  /** árvore já hidratada (cliente). O servidor envia `arvoreC` (compacta) para reduzir o payload. */
  arvore?: ArvoreBib
  arvoreC?: ArvoreCompacta
  opcoes?: OpcoesQ
  degradado?: boolean
}

/** Parâmetros ↔ estado (compartilhado: página, rota de API e cliente). */
export function estadoQDeParams(sp: URLSearchParams): EstadoQ {
  const ag = sp.get('ag')
  const sort = sp.get('sort') ?? ESTADO_Q_PADRAO.sort
  return {
    vis: ehVisaoQ(sp.get('vis')) ? sp.get('vis')! : '',
    agrupar: ehAgrupamentoQ(ag) ? ag : 'disciplina',
    no: sp.get('no') || null,
    q: (sp.get('q') ?? '').trim().slice(0, 80),
    status: ['publicada', 'rascunho', 'arquivada'].includes(sp.get('status') ?? '') ? sp.get('status')! : '',
    dif: ['facil', 'medio', 'dificil'].includes(sp.get('dif') ?? '') ? sp.get('dif')! : '',
    tipo: ['objetiva', 'discursiva'].includes(sp.get('tipo') ?? '') ? sp.get('tipo')! : '',
    banca: sp.get('banca') ?? '',
    orgao: sp.get('orgao') ?? '',
    ano: /^\d{4}$/.test(sp.get('ano') ?? '') ? sp.get('ano')! : '',
    sort: (ORDENS_Q as readonly string[]).includes(sort) ? sort : 'atualizado',
    dir: sp.get('dir') === 'asc' ? 'asc' : sp.get('dir') === 'desc' ? 'desc' : (sort === 'atualizado' || !sp.get('sort') ? 'desc' : 'asc'),
    page: Math.max(1, Number(sp.get('page')) || 1),
    pp: PP_Q.includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 14,
  }
}

export function paramsDeEstadoQ(s: EstadoQ): URLSearchParams {
  const p = new URLSearchParams()
  if (s.vis) p.set('vis', s.vis)
  if (s.agrupar !== 'disciplina') p.set('ag', s.agrupar)
  if (s.no) p.set('no', s.no)
  if (s.q) p.set('q', s.q)
  if (s.status) p.set('status', s.status)
  if (s.dif) p.set('dif', s.dif)
  if (s.tipo) p.set('tipo', s.tipo)
  if (s.banca) p.set('banca', s.banca)
  if (s.orgao) p.set('orgao', s.orgao)
  if (s.ano) p.set('ano', s.ano)
  if (s.sort !== 'atualizado' || s.dir !== 'desc') { p.set('sort', s.sort); p.set('dir', s.dir) }
  if (s.page > 1) p.set('page', String(s.page))
  if (s.pp !== 14) p.set('pp', String(s.pp))
  return p
}
