// Tipos PUROS (cliente + servidor) de Unificar › Termos da taxonomia.

export type TipoTermo = 'disciplina' | 'assunto' | 'banca' | 'orgao' | 'cargo' | 'assunto_detalhe' | 'ano'
export interface MetaTipoTermo { id: TipoTermo; nome: string; singular: string; /** tem tabela própria (FK na questão) */ entidade: boolean; /** pode ser mesclado */ mesclavel: boolean }
export const TIPOS_TERMO: MetaTipoTermo[] = [
  { id: 'disciplina', nome: 'Disciplina', singular: 'disciplina', entidade: true, mesclavel: true },
  { id: 'assunto', nome: 'Assunto', singular: 'assunto', entidade: true, mesclavel: true },
  { id: 'banca', nome: 'Banca', singular: 'banca', entidade: true, mesclavel: true },
  { id: 'orgao', nome: 'Órgão', singular: 'órgão', entidade: true, mesclavel: true },
  { id: 'cargo', nome: 'Cargo', singular: 'cargo', entidade: false, mesclavel: true },
  { id: 'assunto_detalhe', nome: 'Assunto específico', singular: 'assunto específico', entidade: false, mesclavel: true },
  { id: 'ano', nome: 'Ano', singular: 'ano', entidade: false, mesclavel: false },
]
export const ehTipoTermo = (v: unknown): v is TipoTermo => TIPOS_TERMO.some((t) => t.id === v)

export type ConfTermo = 'alta' | 'media' | 'baixa'
export const ROTULO_CONF_TERMO: Record<ConfTermo, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa (revisar)' }

export interface VarianteTermo {
  id: string; nome: string; questoes: number
  /** disciplina: nº de assuntos */
  assuntos?: number
  /** assunto: disciplina pai */
  paiId?: string | null; paiNome?: string | null
}
export interface GrupoTermo {
  /** chave estável (hash dos nomes normalizados) — identifica o grupo p/ "São termos diferentes" */
  id: string
  tipo: TipoTermo
  confianca: ConfTermo
  /** 0–100: menor similaridade entre as ligações do grupo */
  score: number
  motivo: string
  variantes: VarianteTermo[]
  canonicaId: string
  nomeSugerido: string
  questoes: number
}
export interface ResumoTipoTermo { tipo: TipoTermo; termos: number; questoes: number; grupos: number; variantesEmGrupos: number; questoesEmGrupos: number }

export interface RespostaGruposTermos {
  ok: boolean; error?: string
  tipo: TipoTermo
  grupos: GrupoTermo[]
  total: number; page: number; pp: number
  porConfianca: Record<ConfTermo, number>
  limiar: number
  resumo: ResumoTipoTermo
  ignorados: number
  /** false = tabela de "ignorados" ausente (migration pendente): o cliente guarda no localStorage */
  ignoradoPersistente: boolean
  geradoEm: number
  degradado?: boolean
}
export interface RespostaResumosTermos { ok: boolean; error?: string; resumos: ResumoTipoTermo[]; geradoEm: number }

export interface PreviaMescla {
  ok: boolean; error?: string
  tipo: TipoTermo
  canonica: { id: string; nome: string }
  nomeFinal: string
  variantes: { id: string; nome: string; questoes: number; assuntos?: number }[]
  impacto: {
    questoes: number
    /** disciplina: assuntos movidos · assunto: subassuntos movidos */
    assuntos: number
    /** assuntos que ficariam com o mesmo nome dentro da disciplina canônica (serão unidos) */
    assuntosColididos: number
    simulados: number
    bancos: number
    respostas: number
    /** outras tabelas que apontam p/ a disciplina (Biblioteca/cronograma/dúvidas…) */
    conteudos: { tabela: string; rotulo: string; n: number }[]
    removidas: number
    mantidas: number
  }
  avisos: string[]
  podeDesfazer: boolean
}

export interface MesclagemLog {
  id: string; tipo: TipoTermo | 'normalizacao'; tipoTermo: TipoTermo; canonicaNome: string; nomeFinal: string | null
  variantes: { nome: string; questoes: number }[]; questoes: number
  criadoEm: string; desfeita: boolean; podeDesfazer: boolean; origem: 'mesclagem' | 'normalizacao' | 'disciplina'
}

export interface ProporNorm { de: string; para: string; questoes: number; motivo: string }
export interface RespostaNorm { ok: boolean; error?: string; tipo: TipoTermo; itens: ProporNorm[]; total: number; page: number; pp: number; questoes: number; geradoEm: number }

export interface ExemploQuestao { id: string; codigo: string | null; enunciado: string }

/** Dados iniciais (SSR) de Unificar › Termos: contagens das abas + grupos do tipo padrão (banca), com os parâmetros padrão do cliente. */
export interface InicialTermos { resumos: RespostaResumosTermos; grupos: RespostaGruposTermos }
