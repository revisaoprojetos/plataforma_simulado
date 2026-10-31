import 'server-only'
import { getManutencaoAluno } from '@/lib/sistema/manutencao-areas-server'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'

/** Chave da sub-área (manutenção por área do aluno) que controla a Central de Estudos dentro de Cursos. */
export const CHAVE_CENTRAL_ESTUDOS = 'nova_cursos_central'

/**
 * A Central de Estudos (sub-área DENTRO de Cursos) está liberada para ESTE aluno?
 * Regra: testador global → sempre; sub-área não bloqueada → todos; bloqueada (padrão) → só o allowlist.
 * Quando false, a página de Cursos esconde o botão "Ir para a Central de Estudos" e os atalhos da Central
 * (o layout já bloqueia a rota /aluno/nova/cursos/central). Fail-open: erro de leitura → liberada.
 */
export async function centralEstudosLiberada(
  tenantId: string, estudanteId: string, email?: string | null,
): Promise<boolean> {
  try {
    const [testador, { ativos, liberados }] = await Promise.all([
      ehTestadorGlobal({ tenantId, email, estudanteId }),
      getManutencaoAluno(),
    ])
    if (testador) return true
    if (!ativos[CHAVE_CENTRAL_ESTUDOS]) return true // sub-área não está bloqueada → Central p/ todos
    return (liberados[CHAVE_CENTRAL_ESTUDOS] ?? []).includes(estudanteId) // bloqueada → só quem está no allowlist
  } catch {
    return true
  }
}
