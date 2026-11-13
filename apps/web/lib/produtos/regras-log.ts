import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import type { ItemHistorico } from './mapa-regras-tipos'

/**
 * LOG UNIFICADO das regras do produto (tabela simulado_regras_log, migração 20261119050000).
 * Gravação BEST-EFFORT: nunca lança nem interrompe a mutação de negócio; sem a tabela, não faz nada.
 * Chamado AO LADO de registrarAudit (que continua sendo a auditoria oficial).
 */
export type CamadaLog = 'visibilidade' | 'disponibilidade' | 'disponibilidade_seg' | 'grupos' | 'excecao' | 'cronograma' | 'acesso'

export async function registrarRegraLog(p: {
  tenantId?: string | null
  produtoId: string | null
  camada: CamadaLog
  acao: string
  alvoTipo?: 'produto' | 'modulo' | 'aula' | 'grupo' | 'segmento' | 'aluno' | null
  alvoId?: string | null
  alvoRotulo?: string | null
  antes?: unknown
  depois?: unknown
  atorId?: string | null
}): Promise<void> {
  try {
    const tenantId = p.tenantId ?? (await getCurrentTenantId())
    if (!tenantId) return
    const uuid = (v: string | null | undefined) => (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null)
    const cortar = (v: unknown) => { if (v == null) return null; try { const s = JSON.stringify(v); return s.length > 20000 ? { truncado: true, tamanho: s.length } : JSON.parse(s) } catch { return null } }
    const svc = createAdminClient()
    const { error } = await svc.from('simulado_regras_log').insert({
      tenant_id: tenantId, produto_id: uuid(p.produtoId), camada: p.camada, acao: p.acao.slice(0, 60),
      alvo_tipo: p.alvoTipo ?? null, alvo_id: uuid(p.alvoId), alvo_rotulo: p.alvoRotulo ? p.alvoRotulo.slice(0, 200) : null,
      antes: cortar(p.antes), depois: cortar(p.depois), ator_id: uuid(p.atorId),
    })
    if (error && !/simulado_regras_log|schema cache|does not exist/i.test(error.message)) console.error('[regras-log] insert falhou:', error.message)
  } catch { /* best-effort */ }
}

const ROTULO_CAMADA: Record<string, string> = { visibilidade: 'Visibilidade', disponibilidade: 'Disponibilidade base', disponibilidade_seg: 'Regra de segmento', grupos: 'Grupos de acesso', excecao: 'Exceção', cronograma: 'Cronograma de referência', acesso: 'Acesso' }

/** Histórico paginado no servidor (.range + count). `migrado=false` = tabela ausente. */
export async function listarHistoricoRegras(tenantId: string, produtoId: string, f: { camada?: string; q?: string; page?: number; pp?: number }): Promise<{ migrado: boolean; rows: ItemHistorico[]; total: number }> {
  const svc = createAdminClient()
  const pp = [10, 25, 50].includes(Number(f.pp)) ? Number(f.pp) : 25
  const page = Math.max(1, Math.floor(Number(f.page)) || 1)
  let q = svc.from('simulado_regras_log').select('id, camada, acao, alvo_tipo, alvo_rotulo, antes, depois, ator_id, ator_nome, criado_em', { count: 'exact' }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  if (f.camada && ROTULO_CAMADA[f.camada]) q = q.eq('camada', f.camada)
  const termo = (f.q ?? '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 80)
  if (termo) q = q.or(`alvo_rotulo.ilike.%${termo}%,acao.ilike.%${termo}%`)
  const { data, count, error } = await q.order('criado_em', { ascending: false }).order('id', { ascending: true }).range((page - 1) * pp, page * pp - 1)
  if (error) return { migrado: !/simulado_regras_log|schema cache|does not exist/i.test(error.message), rows: [], total: 0 }
  const raw = (data ?? []) as any[]
  const nomes = new Map<string, string>()
  await Promise.all([...new Set(raw.map((r) => r.ator_id).filter(Boolean))].slice(0, 40).map(async (uid: string) => {
    try { const { data: u } = await svc.auth.admin.getUserById(uid); const x = u?.user; if (x) nomes.set(uid, ((x.user_metadata as any)?.nome as string) || x.email || '') } catch { /* ignora */ }
  }))
  return {
    migrado: true, total: count ?? 0,
    rows: raw.map((r) => ({ id: r.id, camada: ROTULO_CAMADA[r.camada] ?? r.camada, acao: r.acao, alvo: r.alvo_rotulo ?? '—', antes: r.antes, depois: r.depois, ator: r.ator_nome || (r.ator_id ? nomes.get(r.ator_id) || String(r.ator_id).slice(0, 8) : 'Sistema'), criadoEm: r.criado_em })),
  }
}
