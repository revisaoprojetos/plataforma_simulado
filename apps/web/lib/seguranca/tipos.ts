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

/**
 * Registro de uma CORREÇÃO aplicada (fonte: lib/seguranca/correcoes-data.ts).
 * Casa com achados do scanner pelo `fingerprints` (ver AchadoScan.fingerprint): valor exato
 * ('http:csp-ausente') ou prefixo terminado em '*' ('banco:sem-rls:*').
 */
export interface Correcao {
  /** Estável e único (kebab-case), nunca reutilizar. */
  id: string
  titulo: string
  severidadeOriginal: Severidade
  categoria: Categoria
  /** Fingerprints/prefixos ('*' no fim) dos achados que esta correção elimina. Vazio = só registro manual (sem verificação automática). */
  fingerprints: string[]
  /** ISO. Preferir data+hora (ex.: '2026-11-13T15:30:00-03:00'); só data = fim do dia (BRT). */
  data: string
  descricao: string
  arquivos: string[]
  comoValidar: string
  riscoDeRegressao?: string
  /** Ação pendente do usuário (configurar segredo, aplicar migration, deploy…). */
  acaoDoUsuario?: string
  versaoApp?: string
  /** Apenas para testar a UI; fica oculto quando houver ≥1 correção real. */
  exemplo?: boolean
}

export type StatusCorrecao = 'verificada' | 'aguardando' | 'validar' | 'reapareceu' | 'manual'
export const ROTULO_STATUS_CORRECAO: Record<StatusCorrecao, string> = {
  verificada: 'Verificada pela varredura', aguardando: 'Aguardando varredura', validar: 'Aplicada — validar e resolver o achado',
  reapareceu: 'Reapareceu / incompleta', manual: 'Sem verificação automática',
}

export interface CorrecaoVerificada extends Correcao {
  status: StatusCorrecao
  /** ISO da última varredura considerada (verificada/reapareceu). */
  verificadaEm: string | null
  /** Achados abertos ainda casando (reapareceu). */
  abertos: { titulo: string; fingerprint: string }[]
}

export interface ResultadoChecagem {
  nome: string
  achados: AchadoScan[]
  /** Falha da própria checagem (não vira achado; vai para resumo.erros). */
  erro?: string
}
