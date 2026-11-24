/**
 * FRAMEWORK DE FLUXO (canvas estilo React Flow) — contratos genéricos. Sem I/O, client-safe.
 *
 * O canvas/painel (`components/admin/fluxo/*`) NÃO conhece nenhum domínio. Cada domínio pluga um `FluxoAdaptador`
 * (registrado em `registro.ts`): ele devolve diagramas (nós/arestas como DADO), o schema dos campos editáveis de cada nó
 * e uma função `salvar` que delega à server action JÁ EXISTENTE do domínio (versão otimista, auditoria, permissão).
 * Como criar um adaptador: docs/fluxo-adaptadores.md.
 */

export type TipoNo = 'inicio' | 'etapa' | 'decisao' | 'resultado' | 'rejeicao' | 'aberto' | 'condicao' | 'acao' | 'aviso' | 'nota'
export interface NoFluxo {
  id: string
  tipo: TipoNo
  titulo: string
  descricao: string
  /** valor vigente da regra editável que governa o nó. */
  valor?: string
  link?: { href: string; rotulo: string }
  /** true = texto inferido (não vem do motor nem do mapa). */
  inferido?: boolean
  col: number
  row: number
  /** posição em px (preenchida por `mesclar`; ausente = derivar de col/row). */
  x?: number
  y?: number
  /** preenchido por `mesclar`: nó do grafo base ou criado pelo usuário. */
  origem?: 'base' | 'usuario'
  /** true = título/descrição ajustados pelo usuário sobre um nó base. */
  editado?: boolean
}
export interface ArestaFluxo { de: string; para: string; rotulo?: string; /** preenchidos por `mesclar`. */ id?: string; origem?: 'base' | 'usuario' }
export interface DiagramaFluxo { id: string; titulo: string; resumo: string; nos: NoFluxo[]; arestas: ArestaFluxo[]; origem?: 'base' | 'usuario'; /** agrupamento no seletor lateral (ex.: 'Árvores de decisão'). */ grupo?: string }

import type { CatalogoExecutavel, OverlayFluxo } from './overlay'
import type { ItemVerificacao } from './verificacao'

export type TipoCampoFluxo = 'int' | 'real' | 'bool' | 'lista' | 'texto' | 'opcao' | 'cor'
export interface OpcaoCampo { valor: string; rotulo: string }
/** Schema + valor vigente de UM campo editável. `chave` é opaca para o framework (o adaptador a interpreta ao salvar). */
export interface CampoSchema {
  chave: string
  rotulo: string
  tipo: TipoCampoFluxo
  valor: unknown
  /** int/real: limites do número; lista: limites de CADA item; texto: min/max de caracteres. */
  min?: number
  max?: number
  sufixo?: string
  dica?: string
  opcoes?: OpcaoCampo[]
  /** rótulo do agrupamento exibido no painel. */
  grupo?: string
}
/** Edição de um nó. `alvo` identifica a entidade quando o domínio salva por linha (ex.: id do tipo de meta). */
export interface EdicaoNo { alvo?: string; campos: CampoSchema[]; aviso?: string }

export interface DadosFluxo {
  diagramas: DiagramaFluxo[]
  /** nó (id) → edição. Nó ausente = sem campo editável (painel mostra só descrição/link). */
  edicao: Record<string, EdicaoNo>
  /** versão otimista vigente (0 quando o domínio não versiona). */
  versao: number
  rotuloVersao: string
  podeEditar: boolean
  /** 'obrigatorio' = o domínio exige motivo (vai p/ histórico); 'opcional'; 'nenhum' = não há onde gravar. */
  motivo: 'obrigatorio' | 'opcional' | 'nenhum'
  /** complementos de UI registrados em `components/admin/fluxo/extras` (ex.: 'simulador-faixa'). */
  extras?: string[]
  /** construtor (overlay do usuário); ausente = adaptador sem construtor. */
  construtor?: DadosConstrutor
}

export interface VersaoOverlay { versao: number; hash: string; motivo: string | null; atualizadoEm: string | null; atualizadoPor: string | null }
export interface DadosConstrutor {
  habilitado: boolean
  /** true = nós condição/ação podem carregar regras que afetam o domínio. */
  executavel: boolean
  tiposNo: TipoNo[]
  overlay: OverlayFluxo
  versao: number
  hash: string
  historico: VersaoOverlay[]
  /** false = tabela do overlay ainda não existe (migração pendente): o construtor fica só-leitura. */
  tabelaOk: boolean
  catalogo: CatalogoExecutavel | null
  /** texto de escopo exibido no construtor (o que os nós do usuário fazem neste domínio). */
  escopo: string
}

export interface PatchFluxo { alvo?: string; valores: Record<string, unknown> }
export type ResultadoSalvarFluxo =
  | { ok: true; versao: number; avisos?: string[] }
  | { ok: false; error: string; conflito?: boolean; erros?: string[]; confirmar?: { titulo: string; mensagem: string } }

export interface ContextoFluxo { tenantId: string; userId: string | null; podeEditar: boolean }

export interface ResultadoAvaliacao { erros: string[]; avisos: string[]; diagnosticos: string[] }
export interface ConstrutorAdaptador {
  executavel: boolean
  tiposNo: TipoNo[]
  escopo: string
  catalogo?: CatalogoExecutavel
  /** Valida as regras executáveis do overlay (sem gravar). Ausente em adaptadores só-anotação. */
  avaliar?(ctx: ContextoFluxo, overlay: OverlayFluxo): Promise<ResultadoAvaliacao>
  /** Checagens do DOMÍNIO para o painel 'Verificação' (regras vigentes + efeito do overlay). Determinístico, sem gravar. */
  verificar?(ctx: ContextoFluxo, overlay: OverlayFluxo): Promise<ItemVerificacao[]>
  /** Última checagem antes de gravar (ex.: trava de risco por amostra de planos). `confirmar` pede confirmação ao usuário. */
  antesDeSalvar?(ctx: ContextoFluxo, anterior: OverlayFluxo, novo: OverlayFluxo, confirmarRisco: boolean): Promise<{ ok: true } | { ok: false; error: string; confirmar?: { titulo: string; mensagem: string } }>
}

export interface FluxoAdaptador {
  id: string
  titulo: string
  descricao: string
  /** permissão para ver / para editar (checadas no servidor, na page e na action). */
  permVer: string
  permEditar: string
  /** rota "natural" do adaptador dentro do seu módulo (link do diagrama genérico). */
  href: string
  /** Habilita o construtor (nós/arestas/diagramas do usuário em camada própria). */
  construtor?: ConstrutorAdaptador
  carregar(ctx: ContextoFluxo): Promise<DadosFluxo>
  /** Delegue a uma server action EXISTENTE (nunca grave direto). `confirmarRisco` reenvia após o aviso de impacto. */
  salvar(ctx: ContextoFluxo, patch: PatchFluxo, versaoEsperada: number, motivo: string, confirmarRisco: boolean): Promise<ResultadoSalvarFluxo>
}
