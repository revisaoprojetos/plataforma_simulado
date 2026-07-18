/**
 * Contrato genérico do sistema de Integrações (Curseduca, Guru, futuros).
 * Ver PLANO-INTEGRACOES.md. Cada provedor implementa `ProviderAdapter`; o núcleo
 * (`engine.ts`) aplica o resultado no domínio local sem conhecer o provedor.
 *
 * Tipos-only (sem 'server-only') para poder ser importado por client e server.
 */

export type Provider = 'curseduca' | 'guru'

/** Config de um provedor por tenant (credenciais já DESCRIPTOGRAFADAS ao usar). */
export interface ProviderCfg {
  provider: Provider
  baseUrl: string
  credenciais: Record<string, string> // ex.: { api_key, usuario, senha } | { api_token }
  /** Mapa dinâmico do JSON recebido (campo normalizado → dot-path no payload). */
  mapa?: Record<string, string>
}

/** Pessoa normalizada vinda de um provedor (comprador/membro). */
export interface PessoaNormalizada {
  nome: string
  email: string | null
  cpf?: string | null
  telefone?: string | null
  /** id da pessoa no provedor (member id / contact id / buyer id). */
  externalId: string
}

export type StatusEntitlement = 'ativo' | 'cancelado' | 'reembolsado' | 'expirado'

/** Direito de acesso (assinatura/compra/matrícula) normalizado. */
export interface Entitlement {
  /** id da assinatura/transação no provedor (idempotência + dedupe). */
  externalId: string
  /** produto/oferta (Guru) ou grupo (Curseduca) de origem — casa com o mapeamento. */
  produtoRef: string
  produtoNome?: string | null
  status: StatusEntitlement
  inicioEm?: string | null
  expiraEm?: string | null
}

/** Evento normalizado a partir de um webhook (Guru). */
export interface EventoNormalizado {
  /** id único do evento no provedor (idempotência). */
  eventId: string
  tipo: string
  ocorridoEm?: string | null
  pessoa: PessoaNormalizada
  entitlement: Entitlement
}

/** Uma "fonte" selecionável para importação (grupo na Curseduca, produto na Guru). */
export interface FonteImport {
  ref: string
  nome: string
  total?: number
}

/** Par pessoa+direito coletado por pull. */
export interface PessoaEntitlement {
  pessoa: PessoaNormalizada
  entitlement: Entitlement
}

/** Contrato que cada provedor implementa. Métodos push (webhook) são opcionais. */
export interface ProviderAdapter {
  provider: Provider

  /** Valida credenciais (login/ping). */
  testarCredenciais(cfg: ProviderCfg): Promise<{ ok: boolean; error?: string }>

  /** Fontes selecionáveis: grupos (Curseduca) ou produtos (Guru). */
  listarFontes(cfg: ProviderCfg): Promise<FonteImport[]>

  /** Coleta pessoas+direitos das fontes (pull). Usado por importação e reconciliação. */
  listarPessoas(cfg: ProviderCfg, refs: string[]): Promise<PessoaEntitlement[]>

  /** (push) Valida a assinatura/segredo do webhook. */
  validarWebhook?(rawBody: string, headers: Record<string, string>, segredo: string): boolean

  /** (push) Normaliza um payload de webhook em evento. Retorna null se irrelevante. */
  parseWebhook?(payload: unknown, headers: Record<string, string>, cfg: ProviderCfg): Promise<EventoNormalizado | null>
}

/** Destino de importação (para onde vincular no sistema). */
export type DestinoImport =
  | { tipo: 'nenhum' }
  | { tipo: 'existente'; grupoId: string }
  | { tipo: 'novo'; nome: string }

/** Resolução de um mapeamento produto/grupo → destino (linha de simulado_integracao_mapeamentos). */
export interface Mapeamento {
  fonteRef: string
  classificacao: string | null
  grupoId: string | null
  pastaId: string | null
  simuladoId: string | null
}

/** Resultado da aplicação de um entitlement no domínio local. */
export interface ResultadoEntitlement {
  ok: boolean
  estudanteId?: string
  acao?: 'concedido' | 'revogado' | 'atualizado' | 'ignorado'
  motivo?: string
  error?: string
}
