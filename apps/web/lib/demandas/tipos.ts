// DEMANDAS (material) — tipos PUROS (sem 'server-only'), usáveis pelo client. I/O em ./demandas.

export type StatusReporte = 'aberto' | 'em_analise' | 'resolvido'
export type TipoReporte = 'erro_conteudo' | 'erro_tecnico' | 'desatualizado' | 'outro'

export interface Reporte {
  id: string
  estudante_id: string
  documento_id: string
  versao_id: string | null
  pagina: number | null
  tipo: TipoReporte
  descricao: string
  status: StatusReporte
  resposta: string | null
  resolvido_em: string | null
  criado_em: string
}

export interface Avaliacao {
  id: string
  estudante_id: string
  documento_id: string
  nota: number
  comentario: string | null
  criado_em: string
}

export const TIPOS_REPORTE: { value: TipoReporte; label: string }[] = [
  { value: 'erro_conteudo', label: 'Erro no conteúdo' },
  { value: 'erro_tecnico', label: 'Problema técnico' },
  { value: 'desatualizado', label: 'Conteúdo desatualizado' },
  { value: 'outro', label: 'Outro' },
]

export const STATUS_REPORTE_LABEL: Record<StatusReporte, { label: string; kind: 'gold' | 'blue' | 'green' }> = {
  aberto: { label: 'Aberto', kind: 'gold' },
  em_analise: { label: 'Em análise', kind: 'blue' },
  resolvido: { label: 'Resolvido', kind: 'green' },
}

/** Avaliação de 1–2 estrelas entra na fila "Precisa de você" (spec §6). */
export function precisaDeVoce(nota: number): boolean {
  return nota >= 1 && nota <= 2
}
