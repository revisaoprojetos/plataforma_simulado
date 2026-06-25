export interface User {
  id: string
  email: string
  nome: string
  status: 'ativo' | 'inativo' | 'bloqueado'
  ultimo_login?: string
  criado_em: string
}

export interface TenantAcesso {
  user_id: string
  tenant_id: string
  role: string
  ativo: boolean
}

export interface Estudante {
  id: string
  tenant_id: string
  user_id: string
  nome: string
  cpf?: string
  telefone?: string
  data_nascimento?: string
}

export interface Matricula {
  id: string
  tenant_id: string
  estudante_id: string
  plano: string
  status: 'ativa' | 'expirada' | 'cancelada'
  validade: string
}

export interface Role {
  id: string
  tenant_id?: string
  nome: string
  descricao?: string
  is_sistema: boolean
}

export interface Permission {
  id: string
  resource: string
  action: string
}
