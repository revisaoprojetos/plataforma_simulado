// DÚVIDAS — tipos PUROS (sem 'server-only'), usáveis pelo client. I/O fica em ./duvidas.

export type StatusDuvida = 'aberta' | 'respondida' | 'resolvida'
export type AutorTipo = 'aluno' | 'professor'
export type OrigemTipo = 'pdf' | 'aula' | 'questao' | 'geral'

export interface OrigemDuvida {
  tipo: OrigemTipo
  ref?: string | null
  label?: string | null
  pagina?: number | null
}

export interface Duvida {
  id: string
  estudante_id: string
  titulo: string
  categoria: string | null
  disciplina_id: string | null
  origem: OrigemDuvida
  status: StatusDuvida
  ultima_msg_em: string
  criado_em: string
}

export interface DuvidaMensagem {
  id: string
  duvida_id: string
  autor_tipo: AutorTipo
  autor_id: string | null
  autor_nome: string | null
  texto: string
  criado_em: string
}

export const STATUS_DUVIDA_LABEL: Record<StatusDuvida, { label: string; kind: 'gold' | 'green' | 'blue' }> = {
  aberta: { label: 'Aguardando', kind: 'gold' },
  respondida: { label: 'Respondida', kind: 'green' },
  resolvida: { label: 'Resolvida', kind: 'blue' },
}
