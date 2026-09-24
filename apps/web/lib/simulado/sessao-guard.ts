import 'server-only'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getCurrentTenantId } from '@/lib/tenant'

/**
 * Fecha o IDOR CROSS-TENANT das rotas /api/sessoes/*: confirma que a sessão já carregada pertence ao
 * tenant do requisitante. Sem isto, quem tiver o UUID de uma sessão de OUTRO tenant poderia agir nela
 * (marcar resposta, finalizar a prova, enviar foto…).
 *
 * Prioriza o cookie do aluno (JWT — sem hit no banco), que cobre o runner logado; se não houver cookie
 * (ex.: widget embed), cai no tenant do HOST. Falha fechada (retorna false se não conseguir provar).
 * Passe a sessão já lida (precisa ao menos de `tenant_id`).
 */
export async function sessaoNoTenantDoRequisitante(sessao: { tenant_id?: string | null } | null | undefined): Promise<boolean> {
  const st = sessao?.tenant_id
  if (!st) return false
  const aluno = await getSessaoAluno().catch(() => null)
  if (aluno?.tenantId) return st === aluno.tenantId
  const tid = await getCurrentTenantId().catch(() => null)
  return !!tid && st === tid
}
