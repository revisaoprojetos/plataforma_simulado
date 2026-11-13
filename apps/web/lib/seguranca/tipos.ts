export const CATEGORIAS = ['xss', 'sqli', 'rotas_expostas', 'chaves', 'banco_rls', 'rate_limit', 'prompt_injection', 'headers', 'dependencias', 'config', 'outro'] as const
export type Categoria = (typeof CATEGORIAS)[number]
export const SEVERIDADES = ['critico', 'alto', 'medio', 'baixo'] as const
export type Severidade = (typeof SEVERIDADES)[number]
export const STATUS_ACHADO = ['aberto', 'resolvido', 'ignorado', 'aceito'] as const
export type StatusAchado = (typeof STATUS_ACHADO)[number]
export type OrigemVarredura = 'cron' | 'manual' | 'ci'

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  xss: 'XSS', sqli: 'Injeção (SQL/filtro)', rotas_expostas: 'Rotas expostas', chaves: 'Chaves e segredos', banco_rls: 'Banco / RLS',
  rate_limit: 'Rate limit', prompt_injection: 'Prompt injection', headers: 'Headers', dependencias: 'Dependências', config: 'Configuração', outro: 'Outro',
}
export const ROTULO_SEVERIDADE: Record<Severidade, string> = { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }
export const PESO_SEVERIDADE: Record<Severidade, number> = { critico: 4, alto: 3, medio: 2, baixo: 1 }

/** Resultado puro de uma checagem. `fingerprint` deve ser ESTÁVEL entre execuções (sem datas/valores voláteis). */
export interface AchadoScan {
  categoria: Categoria
  severidade: Severidade
  titulo: string
  detalhe?: string
  arquivo?: string
  recomendacao?: string
  fingerprint: string
}

export interface AtualizacaoScan {
  pacote: string
  versao_atual?: string | null
  versao_alvo?: string | null
  tipo: 'patch' | 'minor' | 'major'
  cve_ids?: string[]
  severidade: Severidade
}

export interface ResultadoChecagem {
  nome: string
  achados: AchadoScan[]
  /** Falha da própria checagem (não vira achado; vai para resumo.erros). */
  erro?: string
}
