// REQUERIMENTOS — tipos + constantes PUROS (sem 'server-only'), usáveis pelo client. I/O fica em ./requerimentos.

export type StatusRequerimento = 'em_analise' | 'concluido' | 'indeferido'

// Tipos fixos do formulário (fiéis ao mock). Mantidos como constante compartilhada aluno/admin.
export const TIPOS_REQUERIMENTO = [
  'Declaração de matrícula',
  'Certificado de conclusão',
  'Prorrogação de acesso',
  'Troca de curso ou turma',
  'Segunda via de boleto ou nota fiscal',
  'Cancelamento',
  'Outro',
] as const
export type TipoRequerimento = (typeof TIPOS_REQUERIMENTO)[number]

export interface Requerimento {
  id: string
  estudante_id: string
  protocolo: string
  tipo: string
  descricao: string
  contexto: string | null
  status: StatusRequerimento
  resposta: string | null
  respondido_em: string | null
  criado_em: string
}

export const STATUS_REQ_LABEL: Record<StatusRequerimento, { label: string; kind: 'gold' | 'green' | 'red' }> = {
  em_analise: { label: 'Em análise', kind: 'gold' },
  concluido: { label: 'Concluído', kind: 'green' },
  indeferido: { label: 'Indeferido', kind: 'red' },
}
