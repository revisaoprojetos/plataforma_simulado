// Contrato compartilhado da tela "Metas por pasta" (Cronograma › Adaptativo › Conteúdo).
// Só TIPOS e constantes (sem I/O): usado pela action (servidor) e pela vista (cliente).

export type ClasseDisc = 'essencial' | 'complementar' | 'especifica'
/** Slug do tipo (catálogo por tenant: os 6 de sistema + personalizados). Os 6 antigos continuam em TIPOS_MATERIAL. */
export type TipoMaterial = string

export const CLASSES_DISC: { v: ClasseDisc; r: string }[] = [
  { v: 'essencial', r: 'Essencial' }, { v: 'complementar', r: 'Complementar' }, { v: 'especifica', r: 'Específica' },
]
export const TIPOS_MATERIAL: { v: 'pdfull' | 'pdfight' | 'pdflash' | 'legproc' | 'jurisclub' | 'questoes'; r: string; meta: string }[] = [
  { v: 'pdfull', r: 'PDFull', meta: 'Gera a aula (meta de leitura)' },
  { v: 'pdfight', r: 'PDFight', meta: 'Material de apoio da aula' },
  { v: 'pdflash', r: 'PDFlash', meta: 'Material de apoio da aula' },
  { v: 'legproc', r: 'LegProc', meta: 'Gera a lei seca por semana' },
  { v: 'jurisclub', r: 'JurisClub', meta: 'Gera a meta de jurisprudência' },
  { v: 'questoes', r: 'Questões', meta: 'Apoio: questões ligadas à aula (não gera meta nova)' },
]

/** Uma pasta da Biblioteca (categoria "conteudo") com o que ela representa no cronograma. Lista PLANA (use `paiId` p/ montar a árvore). */
export interface NoMetaPasta {
  id: string
  nome: string
  paiId: string | null
  ordem: number
  /** Pasta marcada como DISCIPLINA do cronograma (simulado_pastas.disciplina_id). */
  disciplinaId: string | null
  /** Classe da disciplina (simulado_disciplinas.classificacao); null se a pasta não é disciplina. */
  classe: ClasseDisc | null
  /** Tipo de material marcado NESTA pasta (simulado_pastas.cronograma_tipo_material). */
  tipoMaterial: TipoMaterial | null
  /** Tipo efetivo herdado da subpasta tipada mais próxima acima (ou 'pdfull' por compat quando nada marca). */
  tipoEfetivo: TipoMaterial
  /** Disciplina efetiva (a da própria pasta ou da ancestral mais próxima). */
  disciplinaEfetiva: { id: string; nome: string } | null
  /** Documentos publicados diretamente nesta pasta / na pasta + subpastas. */
  nDocsDiretos: number
  nDocsTotal: number
  /** Planos de alunos ativos que usam documentos desta pasta (para avisar o impacto antes de mudar). */
  planosAtivos: number
}

export interface DocMetaPasta {
  id: string
  titulo: string
  status: string
  tipoEfetivo: TipoMaterial
  /** Planos ativos com meta apontando para este documento. */
  planosAtivos: number
}

/** Flags por disciplina em simulado_revisao_cron_disciplinas que governam um tipo de material. */
export type TipoFlagDisc = 'pdfull' | 'pdfight' | 'pdflash' | 'legproc' | 'juris'

/** Uma disciplina do cronograma (linha da Matriz): flags + pasta(s) vinculada(s) + documentos por tipo efetivo. */
export interface LinhaMatrizDisciplina {
  nome: string
  classe: ClasseDisc | null
  ativa: boolean
  pdfull: boolean; pdfight: boolean; pdflash: boolean; legproc: boolean; juris: boolean
  manual: boolean
  aulas: number
  /** Pastas da Biblioteca marcadas como esta disciplina (vazio = sem pasta vinculada). */
  pastas: { id: string; nome: string }[]
  /** Documentos por slug do tipo de material efetivo (subárvore das pastas vinculadas). */
  docsPorTipo: Record<string, number>
  docsTotal: number
  planosAtivos: number
  /** Flags ligadas sem documentos do tipo, ou desligadas com documentos (só com pasta vinculada e disciplina ativa). */
  divergencias: TipoFlagDisc[]
}

export interface MatrizDisciplinas {
  linhas: LinhaMatrizDisciplina[]
  migrado: boolean
  tiposMigrado: boolean
}

/** Retorno de `salvarConfigPasta`(acrescentado pelo backend; só tipo). */
export interface ResultadoSalvarConfigPasta {
  ok: boolean
  error?: string
  /** true = há planos ativos e faltou `confirmarImpacto`; nada foi gravado. */
  precisaConfirmar?: boolean
  planosAtivos?: number
  /** Nº de pastas efetivamente alteradas (tipo). */
  pastasAlteradas?: number
}

export interface SalvarConfigPastaInput {
  pastaId: string
  /** Marca/desmarca a pasta como disciplina do cronograma e define a classe (null = deixa de ser disciplina). */
  disciplina?: { classe: ClasseDisc } | null
  /** Define o tipo de material da pasta (null = remove a marcação; passa a herdar). */
  tipoMaterial?: TipoMaterial | null
  /** Aplica o tipo de material também a TODAS as subpastas (que não sejam disciplina). */
  aplicarSubpastas?: boolean
  /** Confirma ciente do impacto quando há planos ativos usando documentos da pasta. */
  confirmarImpacto?: boolean
}
