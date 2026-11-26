// Contrato do CATÁLOGO DE TIPOS DE CONTEÚDO (por tenant). Só tipos/constantes puras (sem I/O, sem imports de servidor):
// usado pelo servidor (loader/actions), pelo motor (fase 2) e pelas telas admin.
//
// Modelo: registro ESTÁTICO de tipos de sistema (os 6 de hoje, não apagáveis, editáveis em rótulo/cor/duração/ordem)
// + tipos PERSONALIZADOS criados pelo admin (tabela `simulado_conteudo_tipos`). O slug é a chave estável usada pelas
// pastas (`simulado_pastas.cronograma_tipo_material`), pelas metas e pelas regras.

/** Papel do tipo no cronograma = O QUE o tipo faz. Define o comportamento (fase 1: leitura/apoio; fases 2-3: gera meta). */
export type PapelTipo =
  | 'leitura'         // gera a aula/meta de leitura (como PDFull)
  | 'apoio'           // material de apoio casado com a aula (como PDFight/PDFlash): não gera meta nova
  | 'lei_seca'        // lei seca por semana (como LegProc)
  | 'jurisprudencia'  // meta de jurisprudência (como JurisClub)
  | 'questoes'        // questões ligadas à aula (como "Questões"): apoio, não gera meta nova
  | 'generico'        // tipo livre criado pelo admin: entra como apoio (fase 1); a meta própria vem na fase 2

export const PAPEIS_TIPO: { v: PapelTipo; r: string; desc: string }[] = [
  { v: 'leitura', r: 'Leitura (gera a aula)', desc: 'Cada documento vira a meta de leitura da aula, como o PDFull.' },
  { v: 'apoio', r: 'Apoio da aula', desc: 'Material casado com a aula pelo nome/número; não cria meta nova, como PDFight e PDFlash.' },
  { v: 'lei_seca', r: 'Lei seca', desc: 'Gera a leitura da lei por semana, como o LegProc.' },
  { v: 'jurisprudencia', r: 'Jurisprudência', desc: 'Gera a meta de jurisprudência, como o JurisClub.' },
  { v: 'questoes', r: 'Questões', desc: 'Questões ligadas à aula (links); não cria meta nova.' },
  { v: 'generico', r: 'Genérico (personalizado)', desc: 'Tipo livre. Entra como apoio, ou gera meta própria no cronograma se a opção for ligada.' },
]

export interface TipoConteudo {
  /** Chave estável (minúsculas, a-z0-9_-, 2–40). Tipos de sistema: pdfull, pdfight, pdflash, legproc, jurisclub, questoes. */
  slug: string
  nome: string
  /** Como o aluno vê (cai em `nome` se vazio). */
  nomeAluno: string
  /** Token de cor (ex.: 'brand', 'ok', 'warn') ou hex do tenant; nunca obrigatório. */
  cor: string | null
  papel: PapelTipo
  /** Duração padrão da meta, em minutos (null = usa o padrão do motor para o papel). */
  duracaoPadraoMin: number | null
  prioridade: number
  ordem: number
  ativo: boolean
  /** true = tipo de sistema (não apaga, não muda slug/papel). */
  sistema: boolean
  descricao: string | null
  /** true = documentos do tipo viram metas próprias (gx) nos planos gerados dali em diante. Só vale p/ papel 'generico' personalizado. */
  geraMeta?: boolean
  /** Versão da linha no banco (concorrência otimista); ausente = tipo de sistema sem override gravado. */
  versao?: number
}

/** Tipos de sistema: papel fixo (não editável) + defaults. Fonte única do vocabulário antigo `TipoMaterial`. */
export const TIPOS_SISTEMA: readonly TipoConteudo[] = [
  { slug: 'pdfull', nome: 'PDFull', nomeAluno: 'PDFull', cor: null, papel: 'leitura', duracaoPadraoMin: null, prioridade: 10, ordem: 1, ativo: true, sistema: true, descricao: 'Gera a aula (meta de leitura).' },
  { slug: 'pdfight', nome: 'PDFight', nomeAluno: 'PDFight', cor: null, papel: 'apoio', duracaoPadraoMin: null, prioridade: 20, ordem: 2, ativo: true, sistema: true, descricao: 'Material de apoio da aula.' },
  { slug: 'pdflash', nome: 'PDFlash', nomeAluno: 'PDFlash', cor: null, papel: 'apoio', duracaoPadraoMin: null, prioridade: 20, ordem: 3, ativo: true, sistema: true, descricao: 'Material de apoio da aula.' },
  { slug: 'legproc', nome: 'LegProc', nomeAluno: 'LegProc', cor: null, papel: 'lei_seca', duracaoPadraoMin: null, prioridade: 30, ordem: 4, ativo: true, sistema: true, descricao: 'Gera a lei seca por semana.' },
  { slug: 'jurisclub', nome: 'JurisClub', nomeAluno: 'JurisClub', cor: null, papel: 'jurisprudencia', duracaoPadraoMin: null, prioridade: 40, ordem: 5, ativo: true, sistema: true, descricao: 'Gera a meta de jurisprudência.' },
  { slug: 'questoes', nome: 'Questões', nomeAluno: 'Questões', cor: null, papel: 'questoes', duracaoPadraoMin: null, prioridade: 50, ordem: 6, ativo: true, sistema: true, descricao: 'Questões ligadas à aula (não gera meta nova).' },
]

export const SLUGS_SISTEMA: readonly string[] = TIPOS_SISTEMA.map((t) => t.slug)
export const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/

/** Resultado padrão das actions do catálogo. */
export interface ResultadoTipoConteudo {
  ok: boolean
  error?: string
  /** true = há pastas/documentos usando o tipo e faltou `confirmarImpacto`; nada foi gravado. */
  precisaConfirmar?: boolean
  pastasUsando?: number
  planosAtivos?: number
  tipo?: TipoConteudo
}

/** Uso de um tipo (para a ficha e para os avisos antes de apagar/desativar/mudar papel). */
export interface UsoTipoConteudo { slug: string; pastas: number; documentos: number; planosAtivos: number }
