// Tipos do diff de versões (antes/depois) da Leitura. Ficam FORA do módulo server-only
// (diff.ts) para poderem ser importados pelo cliente sem arrastar node-html-parser.

/** Pedaço de texto no diff de palavras: igual, adicionado ou removido. */
export type Token = { t: 'ig' | 'add' | 'rem'; s: string }

/** Âncora do dispositivo no HTML (para marcar/rolar até ele na prévia). */
export type AncoraBloco = { tipo: 'disp' | 'art'; id: string }

/** Um bloco (artigo/§/parágrafo) que mudou entre duas versões. */
export type BlocoDiff =
  | { estado: 'add'; rotulo: string | null; html: string; anchor?: AncoraBloco }
  | { estado: 'rem'; rotulo: string | null; html: string; anchor?: AncoraBloco }
  // mod: quando `antes`/`depois` têm tokens → mudança de TEXTO (diff palavra a palavra). Quando estão
  // vazios mas há `htmlAntes`/`htmlDepois` → só mudou GRIFO/formatação (renderiza o HTML dos 2 lados).
  | { estado: 'mod'; rotulo: string | null; antes: Token[]; depois: Token[]; anchor?: AncoraBloco; htmlAntes?: string; htmlDepois?: string }

export type DiffDoc = {
  blocos: BlocoDiff[]
  resumo: { mod: number; add: number; rem: number; igual: number }
}

/** Uma versão do conteúdo do documento (linha em simulado_documento_conteudos). */
export type VersaoInfo = {
  versao: number
  estado: string
  publicadoEm: string | null
  /** É a versão publicada vigente (a que o aluno vê). */
  atual: boolean
  /** É o rascunho ainda não publicado. */
  rascunho: boolean
  /** Nome/resumo dado pelo autor (senão mostra "vN"). */
  nome?: string | null
}
