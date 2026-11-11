// Tipos PUROS (cliente + servidor) de Biblioteca › Unificar disciplinas (pastas-disciplina dos conteúdos).
import type { ConfTermo, VarianteTermo } from './questoes-termos-tipos'

export type CategoriaPU = 'conteudo' | 'jurisclub'
/** Valor gravado em simulado_termos_mesclagens.tipo / simulado_termos_ignorados.tipo para esta frente. */
export const TIPO_PU = 'pasta_disciplina'

/** Uma pasta-disciplina (raiz da árvore de conteúdos, ou pasta marcada com disciplina_id). `questoes` = nº de documentos (mantido p/ reuso da detecção). */
export interface VariantePasta extends VarianteTermo {
  /** documentos vivos da pasta e de todas as subpastas (exclui lixeira) */
  docs: number
  /** documentos diretamente na pasta */
  proprios: number
  /** subpastas (filhos diretos) */
  subpastas: number
  /** tipos de material das subpastas (pdfull, pdflash…) */
  tipos: string[]
  disciplinaId: string | null
  disciplinaNome: string | null
  restrito: boolean
}
export interface GrupoPasta {
  id: string
  categoria: CategoriaPU
  confianca: ConfTermo
  score: number
  motivo: string
  variantes: VariantePasta[]
  canonicaId: string
  nomeSugerido: string
  docs: number
}
export interface ResumoPU { pastas: number; docs: number; grupos: number; variantesEmGrupos: number; docsEmGrupos: number }
export interface RespostaGruposPU {
  ok: boolean; error?: string
  categoria: CategoriaPU
  grupos: GrupoPasta[]
  total: number; page: number; pp: number
  porConfianca: Record<ConfTermo, number>
  limiar: number
  resumo: ResumoPU
  ignorados: number
  /** false = tabela de "ignorados" ausente: o cliente guarda no localStorage */
  ignoradoPersistente: boolean
  geradoEm: number
  degradado?: boolean
}
export interface RespostaPastasPU { ok: boolean; error?: string; itens: VariantePasta[]; total: number; page: number; pp: number }

export interface FusaoPU { origem: string; destino: string; motivo: 'tipo' | 'nome' }
export interface PreviaPU {
  ok: boolean; error?: string
  canonica: { id: string; nome: string }
  nomeFinal: string
  variantes: { id: string; nome: string; docs: number; subpastas: number }[]
  impacto: {
    documentos: number; lixeira: number; subpastasMovidas: number; subpastasFundidas: number; pastasArquivadas: number
    metadadosDisciplina: number; produtos: number; integracoes: number; acessos: number
  }
  fusoes: FusaoPU[]
  movidas: { nome: string; para: string }[]
  /** conflitos de acesso (a pasta mantida passa a valer p/ o que for movido) — exige confirmação explícita */
  conflitosAcesso: string[]
  taxonomia: {
    situacao: 'nenhuma' | 'mesma' | 'herda' | 'diferentes'
    canonicaDisciplina: { id: string; nome: string } | null
    variantes: { id: string; nome: string; questoes: number; metas: number; links: number; conjuntos: number; duvidas: number; respostas: number; outrasPastas: number }[]
    /** o usuário tem permissão de editar questões (necessária p/ unificar a taxonomia) */
    podeUnificar: boolean
  }
  avisos: string[]
  podeDesfazer: boolean
}
export interface HistoricoPU {
  id: string; canonicaNome: string; nomeFinal: string | null; variantes: { nome: string; docs: number }[]; documentos: number
  criadoEm: string; desfeita: boolean; podeDesfazer: boolean; taxonomia: boolean
}

/** Dados iniciais (SSR) de Unificar disciplinas: grupos (parâmetros padrão) + nº de grupos de disciplinas da taxonomia. */
export interface InicialDisciplinas { categoria: CategoriaPU; grupos: RespostaGruposPU; nTax: number | null }
