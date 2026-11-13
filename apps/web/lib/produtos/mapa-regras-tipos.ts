// Mapa de regras do Produto (Extensivo): tipos + vocabulário ÚNICO. Client-safe (sem I/O).
// O read-model que preenche isto é lib/produtos/mapa-regras.ts (servidor); a UI é a aba "Regras" do Produto no Estúdio.

/** Camadas de regra, da mais externa (acesso ao produto) à mais interna (exceção). */
export type CamadaRegra = 'acesso' | 'venda' | 'visibilidade' | 'segmento' | 'cronograma' | 'excecao' | 'disponibilidade' | 'manutencao'

/** Vocabulário único — as mesmas palavras em toda tela (legenda, tooltips, alertas). */
export const CAMADAS_INFO: Record<CamadaRegra, { rotulo: string; desc: string }> = {
  acesso: { rotulo: 'Acesso ao produto', desc: 'Quem entra no produto: assinatura, grupo de acesso vinculado (com membro vigente), "liberado para todos" ou segmento de acesso. Bloquear por segmento vence tudo.' },
  venda: { rotulo: 'Regra de venda', desc: 'Regra do webhook (Guru/Curseduca/manual) que concede este produto ao comprador. Só vale com a flag de regras de liberação ligada.' },
  visibilidade: { rotulo: 'Visibilidade por segmento', desc: 'Mostrar somente para / ocultar para um segmento em módulo ou aula. Oculto some; com cadeado aparece bloqueado.' },
  segmento: { rotulo: 'Regra de segmento', desc: 'Disponibilidade (data/intervalo/cronograma) própria de um módulo ou aula para quem está no segmento. Substitui a disponibilidade base; vale a menor prioridade.' },
  cronograma: { rotulo: 'Cronograma de referência', desc: 'Data de liberação da aula a partir da planilha e do cronograma de referência (antes chamado "Trilha") em que o aluno se encaixa. SÓ tem efeito onde existe uma regra do tipo Cronograma.' },
  excecao: { rotulo: 'Exceção', desc: 'Liberar ou bloquear manualmente uma aula/módulo para um aluno ou grupo. Vence o cronograma, mas não derruba bloqueio de segmento nem produto bloqueado.' },
  disponibilidade: { rotulo: 'Disponibilidade', desc: 'Regra base do próprio módulo/aula: na matrícula, em uma data, após X dias etc. Vale para todos que não têm regra de segmento.' },
  manutencao: { rotulo: 'Manutenção / estado', desc: 'Produto em atualização (bloqueia todos) ou em rascunho (fora do ar).' },
}

export type EfeitoRegra = 'liberado' | 'cadeado' | 'oculto' | 'bloqueado'
export const EFEITO_ROTULO: Record<EfeitoRegra, string> = { liberado: 'Liberado', cadeado: 'Cadeado', oculto: 'Oculto', bloqueado: 'Bloqueado' }

export interface OrigemRegra { tabela: string; id: string | null; rotulo: string; href: string | null }
export interface QuemRegra { tipo: 'todos' | 'grupo' | 'segmento' | 'aluno' | 'compradores'; id: string | null; nome: string }

export interface LinhaRegra {
  id: string
  alvoTipo: 'produto' | 'modulo' | 'aula'
  alvoId: string | null
  alvoTitulo: string
  /** Disciplina (módulo raiz) quando o alvo é aula. */
  disciplina: string
  camada: CamadaRegra
  origem: OrigemRegra
  efeito: EfeitoRegra
  /** Texto curto da data/condição ("a partir de 16/11/2026", "ao concluir a meta", "sempre"). */
  quandoRotulo: string
  /** Data civil AAAA-MM-DD quando houver (ordenação). */
  quando: string | null
  quem: QuemRegra
  prioridade: number | null
  validade: string | null
  /** Resumo em uma frase do que a regra faz. */
  descricao: string
}

export type SeveridadeAlerta = 'erro' | 'aviso' | 'info'
export type TipoAlerta =
  | 'planilha_sem_regra' | 'empate_prioridade' | 'excecao_anulada' | 'sem_publico' | 'doc_duplicado'
  | 'grupo_sem_membros' | 'validade_vencendo' | 'regra_venda_inativa' | 'produto_bloqueado' | 'trilha_sem_segmento'

export interface AlertaRegra {
  id: string
  tipo: TipoAlerta
  severidade: SeveridadeAlerta
  titulo: string
  detalhe: string
  /** Tela dona da regra (para corrigir). */
  href: string | null
  hrefRotulo: string | null
  alvoId: string | null
}

/** Coluna da matriz (público). */
export interface PublicoCol { chave: string; tipo: 'todos' | 'grupo' | 'segmento'; id: string | null; nome: string; membros?: number | null; /** Segmento: já tem regra neste produto. */ comRegra?: boolean }

export interface CelulaMatriz {
  efeito: EfeitoRegra
  /** O que aparece na célula: "Liberado", "16/11", "Oculto"… */
  rotulo: string
  /** Camada vencedora ("base" = nenhuma regra específica; vale o padrão aberto). */
  camada: CamadaRegra | 'base'
  origem: string
  porque: string
  href: string | null
}

export interface LinhaMatriz {
  alvoId: string
  alvoTipo: 'modulo' | 'aula'
  titulo: string
  disciplina: string
  /** Quantas regras (qualquer camada) tocam este alvo. */
  regras: number
  /** Árvore: pai (null = módulo raiz), raiz e profundidade (0 = módulo). */
  paiId: string | null
  raizId: string
  nivel: number
  celulas: Record<string, CelulaMatriz>
}

export interface KpisMapa {
  alvos: number
  publicos: number
  regrasAtivas: number
  semRegra: number
  alertasErro: number
  alertasAviso: number
}

export interface ProdutoRegrasResumo {
  id: string
  nome: string
  ativo: boolean
  acessoBloqueado: boolean
  acessoGratuito: boolean
  gateCronograma: boolean
  regrasVendaFlag: boolean
}

export interface FiltroMapa {
  q?: string
  /** 'todos' | 'modulo' | 'aula' */
  alvo?: string
  camada?: CamadaRegra | ''
  efeito?: EfeitoRegra | ''
  /** grupo:<id> | segmento:<id> | todos */
  publico?: string
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pp?: number
}

export interface MapaRegras {
  produto: ProdutoRegrasResumo
  publicos: PublicoCol[]
  kpis: KpisMapa
  alertas: AlertaRegra[]
  /** Matriz paginada no servidor (alvos). */
  matriz: { rows: LinhaMatriz[]; total: number; colunas: PublicoCol[] }
  /** Lista de regras paginada no servidor. */
  lista: { rows: LinhaRegra[]; total: number }
  /** Tabelas ausentes (migração não aplicada) — a UI avisa em vez de quebrar. */
  tabelasAusentes: string[]
  geradoEm: string
}

/** Nó leve da árvore módulo > aula (sempre completo: numeração, seleção em bloco e contagens). */
export interface NoArvore { id: string; titulo: string; paiId: string | null; raizId: string; nivel: number; filhos: number; regras: number }

export interface FiltroMatriz {
  /** Chaves dos públicos (colunas) — máx. 40. */
  cols: string[]
  /** Módulos raiz expandidos (as aulas só são enviadas para eles). */
  expandir: string[]
  q?: string
  modulo?: string
  efeito?: EfeitoRegra | ''
  /** Só linhas com alguma regra específica (esconde "sem regra/padrão"). */
  soDiferencas?: boolean
}

export interface ResumoModulo { total: number; liberado: number; cadeado: number; oculto: number; bloqueado: number; diferentes: number }

export interface DadosMatriz {
  produto: ProdutoRegrasResumo
  publicos: PublicoCol[]
  colunas: PublicoCol[]
  arvore: NoArvore[]
  /** Módulos raiz (com células) que passam nos filtros. */
  raizes: LinhaMatriz[]
  /** Aulas dos módulos expandidos (com células). */
  filhos: Record<string, LinhaMatriz[]>
  /** Raízes que o servidor expandiu sozinho (busca/filtro). */
  autoExpandidos: string[]
  resumo: Record<string, ResumoModulo>
  totalAlvos: number
  geradoEm: string
}


export interface ItemHistorico {
  id: string
  camada: string
  acao: string
  alvo: string
  antes: unknown
  depois: unknown
  ator: string
  criadoEm: string
}

export const hrefProduto = (produtoId: string, aba: string) => `/admin/conteudos/produtos/${produtoId}?aba=${aba}`
export const hrefLiberacaoAulas = (produtoId: string, vis?: 'aulas' | 'cronogramas' | 'regras' | 'alunos' | 'excecoes' | 'log') =>
  `/admin/revisao/cronograma?aba=gerador&sub=liberacao-aulas&produto=${produtoId}${vis && vis !== 'aulas' ? `&vis=${vis}` : ''}`
export const hrefMapaRegras = (produtoId: string) => `/admin/conteudos/produtos/${produtoId}?aba=regras`
