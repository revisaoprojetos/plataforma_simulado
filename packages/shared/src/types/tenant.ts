export interface Tenant {
  id: string
  nome: string
  dominio: string
  plano: 'basico' | 'pro' | 'enterprise'
  ativo: boolean
  tema: TenantTema
  fuso_horario: string
  criado_em: string
  atualizado_em: string
}

export interface TenantTema {
  logo_url?: string
  logo_dark_url?: string
  favicon?: string
  cor_primaria: string
  cor_secundaria: string
  cor_accent?: string
  fonte?: string
}

export interface TenantContato {
  id: string
  tenant_id: string
  whatsapp?: string
  email_suporte?: string
  telefone?: string
  link_ajuda?: string
  horario_atendimento?: string
}

export type MensagemChave =
  | 'bloqueio_sem_matricula'
  | 'bloqueio_fora_janela'
  | 'bloqueio_prazo_expirado'
  | 'bloqueio_tentativas'
  | 'bloqueio_identidade'
  | 'liberacao_disponivel'
  | 'liberacao_gabarito'
  | 'liberacao_nota'
  | 'alerta_tempo'
  | 'alerta_prazo'
