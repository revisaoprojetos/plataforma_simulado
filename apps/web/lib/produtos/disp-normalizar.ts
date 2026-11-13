// Normalização/validação de uma Disponibilidade vinda do cliente (mesmo contrato do configurador de disponibilidade e das regras
// por segmento). Pura (testável). Devolve null se inválida.
import type { Disponibilidade } from './curriculo'

const TIPOS = ['na_matricula', 'data', 'intervalo', 'data_e_intervalo', 'dia_semana_e_intervalo', 'cronograma']

export function normalizarDisponibilidade(v: unknown): Disponibilidade | null {
  const d = v as any
  if (!d || typeof d !== 'object' || !TIPOS.includes(d.tipo)) return null
  if (d.tipo === 'cronograma') {
    if (!['planilha', 'liberado', 'atual'].includes(d.sem_plano) || !['concluir_meta', 'plano', 'mais_cedo'].includes(d.com_plano)) return null
    const n = Number(d.dias_antes ?? 0)
    if (!Number.isFinite(n) || n < 0 || n > 365) return null
    return { tipo: 'cronograma', sem_plano: d.sem_plano, com_plano: d.com_plano, dias_antes: Math.floor(n), antes: 'bloqueado_cadeado' }
  }
  const data = d.data ? new Date(d.data) : null
  if (d.data && (!data || Number.isNaN(+data))) return null
  const comData = d.tipo === 'data' || d.tipo === 'data_e_intervalo'
  if (comData && !data) return null
  const comDias = ['intervalo', 'data_e_intervalo', 'dia_semana_e_intervalo'].includes(d.tipo)
  return {
    tipo: d.tipo, antes: d.antes === 'oculto' ? 'oculto' : 'bloqueado_cadeado',
    data: comData && data ? data.toISOString() : null,
    dias: comDias ? Math.max(0, Math.min(3650, Math.floor(Number(d.dias) || 0))) : null,
    diaSemana: d.tipo === 'dia_semana_e_intervalo' ? Math.max(0, Math.min(6, Math.floor(Number(d.diaSemana) || 0))) : null,
  }
}
