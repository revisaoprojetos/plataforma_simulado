/**
 * Contagens por banco/pasta via RPC SQL (1 chamada em vez de N HEAD counts), com FALLBACK ao caminho antigo
 * quando a migração 20261203000000 ainda não foi aplicada (ausência memorizada em recurso-ausente.ts).
 */
import { recursoAusente, marcarSeAusente } from './recurso-ausente'

export type ContagemBanco = { q: number; e: number }

/** Normaliza linhas da RPC `contagens_bancos_wizard` p/ { [pastaId]: {q,e} } — ids sem linha ficam 0/0. */
export function mapearContagensBancos(ids: string[], rows: Array<{ pasta_id: string; questoes: number | string | null; estudantes: number | string | null }> | null | undefined): Record<string, ContagemBanco> {
  const out: Record<string, ContagemBanco> = {}
  for (const id of ids) out[id] = { q: 0, e: 0 }
  for (const r of rows ?? []) out[r.pasta_id] = { q: Number(r.questoes) || 0, e: Number(r.estudantes) || 0 }
  return out
}

/** Conjunto de pastas com estudante atribuído a partir das linhas da RPC `pastas_com_estudantes`. */
export function conjuntoPastas(rows: Array<{ pasta_id: string }> | null | undefined): Set<string> {
  return new Set((rows ?? []).map((r) => r.pasta_id).filter(Boolean))
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>

/** `null` = RPC indisponível (use o fallback). */
export async function contagensBancosRpc(svc: { rpc: Rpc }, tenantId: string, ids: string[]): Promise<Record<string, ContagemBanco> | null> {
  if (recursoAusente('rpc:contagens_bancos_wizard')) return null
  try {
    const { data, error } = await svc.rpc('contagens_bancos_wizard', { p_tenant: tenantId, p_pastas: ids })
    if (error) { marcarSeAusente('rpc:contagens_bancos_wizard', error.message); return null }
    return mapearContagensBancos(ids, data)
  } catch { return null }
}

/** `null` = RPC indisponível (use o fallback). Faz chunk de 80 ids por chamada. */
export async function pastasComEstudantesRpc(svc: { rpc: Rpc }, tenantId: string, ids: string[]): Promise<Set<string> | null> {
  if (recursoAusente('rpc:pastas_com_estudantes')) return null
  const out = new Set<string>()
  try {
    for (let i = 0; i < ids.length; i += 80) {
      const { data, error } = await svc.rpc('pastas_com_estudantes', { p_tenant: tenantId, p_pastas: ids.slice(i, i + 80) })
      if (error) { marcarSeAusente('rpc:pastas_com_estudantes', error.message); return null }
      for (const id of conjuntoPastas(data)) out.add(id)
    }
    return out
  } catch { return null }
}
