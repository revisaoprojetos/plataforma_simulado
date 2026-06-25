export type ModoAplicacao = 'janela_fixa' | 'prazo_relativo' | 'aberto'
export type StatusSimulado = 'rascunho' | 'publicado' | 'encerrado'
export type StatusSessao = 'aguardando' | 'em_andamento' | 'finalizada'
export type PoliticaNota = 'ultima' | 'melhor' | 'media'
export type LiberacaoGabarito = 'imediato' | 'apos_janela' | 'manual'

export interface SimuladoRegras {
  retentativas: number | 'ilimitado'
  politica_nota: PoliticaNota
  embaralhar_questoes: boolean
  embaralhar_alternativas: boolean
  permitir_iniciar_atrasado: boolean
  tempo_proporcional_atraso: boolean
  liberacao_gabarito: LiberacaoGabarito
  revisao_antes_enviar: boolean
  politica_anulacao: 'pontua_todos' | 'desconsidera'
  bloquear_multiplas_sessoes: boolean
  alertar_mudanca_ip: boolean
  tempo_minimo_resposta_seg: number
}

export interface Simulado {
  id: string
  tenant_id: string
  titulo: string
  descricao?: string
  modo_aplicacao: ModoAplicacao
  status: StatusSimulado
  data_inicio?: string
  data_fim?: string
  tempo_limite_min?: number
  metodo_identificacao?: 'email' | 'email_cpf' | 'email_telefone'
  embed_ativo: boolean
  regras: SimuladoRegras
  criado_por?: string
  criado_em: string
  atualizado_em: string
}

export interface SessaoProva {
  id: string
  tenant_id: string
  simulado_id: string
  estudante_id: string
  tentativa_num: number
  is_teste: boolean
  status: StatusSessao
  iniciado_em?: string
  finalizado_em?: string
  nota?: number
  posicao_ranking?: number
}

export interface RespostaObjetiva {
  id: string
  sessao_id: string
  questao_id: string
  alternativa_id?: string
  correta?: boolean
  pontuacao?: number
  tempo_resposta_seg?: number
  respondido_em: string
}

export interface SimuladoQuestao {
  id: string
  simulado_id: string
  questao_id: string
  ordem: number
  peso: number
  anulada: boolean
}
