/**
 * Regras de liberação de acesso (webhooks de venda) — TIPOS PUROS.
 *
 * Ver PROMPT_REGRAS_LIBERACAO_ACESSO.md. Estes tipos descrevem o PEDIDO normalizado,
 * os FILTROS/condições de uma regra e o resultado do casamento. São TIPOS-ONLY, sem
 * nenhuma dependência (DB/server) — o motor (`motor.ts`) é função pura e determinística,
 * importável por client, server e teste.
 *
 * Decisões de escopo (confirmadas com o usuário):
 *  - A regra LIBERA um "produto" do catálogo (`simulado_produtos`); o produto mapeia
 *    para grupos/bancos/simulados/etc. via `simulado_produto_itens` (catálogo unificado).
 *  - Regra casou → manda (AND estrito). Nada casou → fallback auto-map do engine atual.
 */

/** Pedido/compra já normalizado — subconjunto usado pelo CASAMENTO de regras. */
export interface PedidoNormalizado {
  /** slug da plataforma: 'hotmart' | 'guru' | 'kiwify' | 'hubla' | ... */
  plataforma: string
  produtoId: string | null
  produtoNome: string | null
  ofertaId: string | null
  ofertaNome: string | null
  /** ISO da DATA DA COMPRA (nunca a data de recebimento do webhook). Comparada em America/Sao_Paulo. */
  dataCompra: string | null
}

/** Modo de comparação por NOME (sem diferenciar maiúsculas/acentos). */
export type ModoNome = 'igual' | 'contem' | 'comeca'

/** Um valor de filtro de produto/oferta. `id` compara só com o ID; `nome` só com o nome. SEM fallback. */
export interface CriterioValor {
  tipo: 'id' | 'nome'
  valor: string
  /** só para `tipo='nome'`; default 'igual'. */
  modo?: ModoNome
}

/** Condições (filtros) de uma regra. Dimensão vazia = CURINGA; dimensão preenchida nunca é curinga. */
export interface RegraFiltros {
  /** uma, várias ou [] (qualquer plataforma). */
  plataformas: string[]
  /** critérios de produto (OR entre itens); [] = curinga. */
  produtos: CriterioValor[]
  /** critérios de oferta (OR entre itens); [] = curinga. */
  ofertas: CriterioValor[]
  /** janela da DATA DA COMPRA — 'YYYY-MM-DD' (dia inteiro BRT) ou ISO. Inclusivo. null = sem limite. */
  periodoDe: string | null
  periodoAte: string | null
  /** flag explícita para permitir regra sem nenhum filtro de produto/oferta ("aplicar a tudo"). */
  aplicarATudo?: boolean
}

export type StatusRegra = 'active' | 'paused' | 'canceled'

/** Como começa o acesso concedido pela regra. */
export type InicioConfig =
  | { tipo: 'immediate' }
  | { tipo: 'after_days'; dias: number }
  | { tipo: 'fixed_date'; data: string } // 'YYYY-MM-DD'

/** Como termina o acesso concedido pela regra. */
export type FimConfig =
  | { tipo: 'lifetime' }
  | { tipo: 'after_days'; dias: number }
  | { tipo: 'fixed_date'; data: string } // 'YYYY-MM-DD'

/** Regra de liberação (parte de CASAMENTO + agendamento). Features/produtos ficam à parte. */
export interface Regra {
  id: string
  nome: string
  status: StatusRegra
  /** desempate quando várias casam (menor = mais prioritária); informativo — TODAS que casam aplicam. */
  prioridade: number
  filtros: RegraFiltros
  inicio: InicioConfig
  fim: FimConfig
}

export type Dimensao = 'plataforma' | 'produto' | 'oferta' | 'periodo'

/** Avaliação de UMA dimensão — base da auditoria "por que casou/falhou". */
export interface AvaliacaoDimensao {
  dimensao: Dimensao
  /** a regra configurou essa dimensão? (false = curinga, sempre passa) */
  configurada: boolean
  casou: boolean
  /** legível: 'ok (hotmart)' | 'FALHOU (pedido=abc, regra=[xyz])'. */
  detalhe: string
}

/** Resultado do casamento regra × pedido (determinístico). */
export interface ResultadoMatch {
  casou: boolean
  dimensoes: AvaliacaoDimensao[]
  /** razão resumida da 1ª falha (vazio se casou). */
  motivo: string
}

export type ClassificacaoStatus = 'positive' | 'negative' | 'neutral'

/** Resultado da classificação de um status bruto do provedor. */
export interface ResultadoStatus {
  classificacao: ClassificacaoStatus
  /** false = status NUNCA visto (neutro por segurança) → sinalizar p/ revisão. */
  mapeado: boolean
  /** forma normalizada comparada (útil p/ cadastrar no status_mappings). */
  normalizado: string
}

/** Resultado da validação de uma regra no CADASTRO. */
export interface ResultadoValidacao {
  ok: boolean
  erros: string[]
}

/** Simulação (dry-run) de uma regra contra um pedido — item do resultado do simulador. */
export interface SimulacaoRegra {
  regraId: string
  nome: string
  status: StatusRegra
  casou: boolean
  motivo: string
  dimensoes: AvaliacaoDimensao[]
  produtoIds: string[]
}

/** Resultado completo do simulador (§8). */
export interface ResultadoSimulacao {
  regras: SimulacaoRegra[]
  concederiaProdutos: { id: string; nome: string }[]
}
