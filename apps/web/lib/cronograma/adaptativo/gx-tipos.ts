// Contrato da FASE 2: metas próprias de tipos personalizados do catálogo ('gx' = família genérica).
// Só tipos/constantes puras (sem imports): usado pelo motor (motor30), pelo conteúdo-banco, pelo espelho (plano-metas),
// pela rota do aluno e pelo iframe. Mudar aqui exige combinar com os 3 consumidores.
//
// Id da meta: `gx:<slugCatalogo>:<d8>` — slugCatalogo = slug do tipo do catálogo ([a-z0-9_-]{2,40}); d8 = 8 primeiros hex do
// uuid do DOCUMENTO (em colisão dentro do tenant, sufixo `-2`, `-3`). Estável quando outro documento some; ≤ 54 chars (ID_META ≤ 60).

/** Item de lista que o motor agenda (como o ItemLP): um documento de um tipo personalizado que 'gera meta'. */
export interface ItemGX {
  /** `gx:<slugCatalogo>:<d8>` */
  id: string
  /** slug do tipo no catálogo */
  slug: string
  /** nome do tipo p/ o aluno (catálogo.nomeAluno) */
  nomeTipo: string
  /** nome da disciplina (pasta-disciplina ancestral) */
  disc: string
  titulo: string
  /** id do documento da Biblioteca (para abrir) */
  doc: string | null
  /** duração em minutos (catálogo.duracaoPadraoMin ?? 30) */
  min: number
  prioridade: number
  ordem: number
}

export const SLUG_GX = 'gx' as const
export const PREFIXO_GX = 'gx:'
export const MIN_PADRAO_GX = 30
export const MAX_ITENS_GX = 500

export const ehIdGx = (id: string): boolean => typeof id === 'string' && id.startsWith(PREFIXO_GX)

/**
 * FASE 3a — regras por tipo personalizado (chave = slug do catálogo) em `RegrasMotor.tiposGx` (padrão `{}`).
 * Todas são restrições de ELEGIBILIDADE: só adiam a meta gx (não criam metas nem mudam metas de outros tipos).
 * Padrão (tudo nulo/vazio) = comportamento atual: a meta entra só na sobra do dia, na ordem de prioridade do catálogo.
 * Duração, prioridade, ordem e ativo continuam no CATÁLOGO (fonte única) — não entram aqui.
 */
export interface RegraTipoGx {
  /** false = o motor ignora o tipo (sem apagar a regra). Padrão true. */
  ativo?: boolean
  /** máximo de metas DESTE tipo no mesmo dia (null = sem limite). */
  maxPorDia: number | null
  /** máximo de metas DESTE tipo na mesma semana (null = sem limite). */
  maxPorSemana: number | null
  /** dias permitidos (0 = segunda … 6 = domingo); vazio = todos. */
  dias: number[]
  /** faixas de carga (1-based) em que o tipo vale; vazio = todas. */
  faixas: number[]
  /** só agenda a partir desta semana do plano (0 = desde o início). */
  aPartirDaSemana: number
}

export const REGRA_TIPO_GX_PADRAO: RegraTipoGx = { ativo: true, maxPorDia: null, maxPorSemana: null, dias: [], faixas: [], aPartirDaSemana: 0 }
export const MAX_TIPOS_GX_REGRAS = 50
export const SLUG_TIPO_GX_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/
