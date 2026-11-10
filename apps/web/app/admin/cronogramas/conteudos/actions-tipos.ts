export type ConjuntoLista = {
  id: string
  nome: string
  disciplina: string
  disciplina_id: string | null
  descricao: string | null
  cor: string | null
  pasta_id: string | null
  ordem: number
  aulas: number
  questoes: number
  /** Aulas de tipo 'legproc' deste conjunto — alimenta a aba LegProc (o resto é da disciplina). */
  aulasLegproc: number
  /** 'disciplina' (padrão) | 'legproc' — reservado; hoje LegProc vem das aulas, não do conjunto. */
  tipo: string
}

export type PastaLista = { id: string; nome: string; pai_id: string | null }

export type AulaBanco = {
  id: string
  tipo: string
  aula: string | null
  conteudo: string | null
  duracao: string | null
  video_url: string | null
  tema: string | null
  ordem: number
  urls: { plataforma_id: string; url: string }[]
  questoes: { id: string; external_id: string | null; enunciado: string }[]
}

export type ConjuntoDetalhe = {
  conjunto: { id: string; nome: string; disciplina: string; disciplina_id: string | null; descricao: string | null; cor: string | null; pasta_id: string | null }
  aulas: AulaBanco[]
  plataformas: { id: string; nome: string; slug: string }[]
}

export type ConjuntoParaCompor = {
  id: string
  nome: string
  disciplina: string
  disciplina_id: string | null
  aulas: number
  aulasLegproc: number
  questoes: number
}

export type AulaConteudoBanco = {
  chave: string
  tipo: string
  aulaReal: string
  conteudo: string | null
  tema: string | null
  urls: Record<string, string>
  questaoIds: string[]
  videoUrl: string | null
}

export type ConteudoBanco = {
  id: string
  disciplina: string
  disciplina_id: string | null
  nome: string
  aulas: AulaConteudoBanco[]
}

export type EntradaAula = {
  tipo: string
  aula?: string | null
  conteudo?: string | null
  duracao?: string | null
  video_url?: string | null
  tema?: string | null
}

export type PropagacaoAlvo = { cronograma_id: string; nome: string; status: string; metas: number }

export type BancoAulaRef = { aula_id: string; conjunto_id: string; conjunto_nome: string; conteudo: string | null }
