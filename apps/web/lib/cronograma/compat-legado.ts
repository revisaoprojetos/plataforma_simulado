import 'server-only'

/**
 * Compatibilidade com a migration 20261114020000 (chave estável / calendário congelado).
 *
 * O código novo precisa funcionar ANTES de a migration ser aplicada: leituras/gravações que
 * dependem das colunas/funções novas detectam a ausência (PostgREST/Postgres) e caem no
 * comportamento antigo, sem quebrar a tela do aluno.
 */

type Erro = { message?: string; code?: string } | null | undefined

/** Coluna inexistente: 42703 (Postgres) ou PGRST204 (cache de schema do PostgREST). */
export function colunaAusente(e: Erro): boolean {
  if (!e) return false
  return e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the '.*' column/i.test(e.message ?? '')
}

/** Função (RPC) inexistente: 42883 / PGRST202. */
export function funcaoAusente(e: Erro): boolean {
  if (!e) return false
  return e.code === '42883' || e.code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(e.message ?? '')
}

/** `versao_grade` atual do cronograma; null se a coluna ainda não existe. */
export async function lerVersaoGrade(svc: any, tenantId: string, cronogramaId: string): Promise<number | null> {
  const { data, error } = await svc
    .from('simulado_cronogramas')
    .select('versao_grade')
    .eq('id', cronogramaId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error || !data) return null
  const v = Number((data as { versao_grade?: number }).versao_grade)
  return Number.isFinite(v) ? v : null
}

/**
 * Recalcula as chaves estáveis das metas do cronograma (após mutações avulsas). Best-effort:
 * sem a função (migration pendente) ou com erro, segue — a chave só é necessária no diff/reencaixe.
 */
export async function recalcularChaves(svc: any, tenantId: string, cronogramaId: string): Promise<void> {
  try {
    await svc.rpc('simulado_cronograma_recalcular_chaves', { p_tenant: tenantId, p_cronograma: cronogramaId })
  } catch {
    /* sem a função */
  }
}

/** Chaves (`chave`) de metas por id; vazio se a coluna não existe. */
export async function chavesDasMetas(svc: any, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const { data, error } = await svc.from('simulado_cronograma_metas').select('id, chave').eq('tenant_id', tenantId).in('id', ids.slice(0, 80))
  if (error || !data) return out
  for (const r of data as { id: string; chave: string | null }[]) if (r.chave) out.set(r.id, r.chave)
  return out
}
