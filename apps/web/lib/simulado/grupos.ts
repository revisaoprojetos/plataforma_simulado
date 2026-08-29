import type { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * Grupo mestre (pasta) × grupo comum.
 * - `is_mestre = true`  → pasta organizacional; agrupa sub-grupos; NÃO tem membros diretos.
 * - `is_mestre = false` → grupo comum; `pai_id` aponta para uma pasta (mestre) ou é null (solto).
 * Aninhamento de 1 nível: mestre → grupos.
 */
export type GrupoRow = {
  id: string
  nome: string
  cor: string | null
  pai_id: string | null
  is_mestre: boolean
  codigo_externo?: string | null
  criado_em?: string | null
}

type Svc = ReturnType<typeof createAdminClient>

/**
 * Seleciona os grupos ativos do tenant tolerando colunas ainda ausentes
 * (`cor`, `pai_id`, `is_mestre`) — o mesmo padrão usado para `cor` em todo o app.
 * Enquanto a migração de grupo mestre não roda, todos vêm como grupo comum solto.
 */
export async function selecionarGrupos(
  svc: Svc,
  tenantId: string,
  opts?: { comData?: boolean },
): Promise<GrupoRow[]> {
  const tid = tenantId || '00000000-0000-0000-0000-000000000000'
  const data = opts?.comData ? ',criado_em' : ''
  // Tentativas em cascata: da mais rica para a mais pobre.
  const tentativas = [
    `id,nome,cor,pai_id,is_mestre,codigo_externo${data}`,
    `id,nome,cor,pai_id,is_mestre${data}`,
    `id,nome,cor${data}`,
    `id,nome${data}`,
  ]
  let rows: any[] | null = null
  for (const cols of tentativas) {
    const r = await svc
      .from('simulado_grupos')
      .select(cols)
      .eq('tenant_id', tid)
      .eq('deletado', false)
      .order('nome', { ascending: true })
    if (!r.error) { rows = r.data as any[]; break }
    // Só degrada quando o erro é de coluna inexistente; senão propaga.
    if (!/column|does not exist|pai_id|is_mestre|\bcor\b/i.test(r.error.message)) {
      rows = null
      break
    }
  }
  return (rows ?? []).map((g: any) => ({
    id: g.id,
    nome: g.nome,
    cor: g.cor ?? null,
    pai_id: g.pai_id ?? null,
    is_mestre: g.is_mestre === true,
    codigo_externo: g.codigo_externo ?? null,
    criado_em: g.criado_em ?? null,
  }))
}

// ── Contagem de membros por grupo, MEMORIZADA por tenant (cache em memória do processo) ──────
// Contar membros = varrer ~milhares de filiações (`simulado_grupo_membros`). Fazer isso a cada
// abertura do seletor de grupos (banco e criação) é o que deixava tudo lento. Aqui a contagem é
// calculada UMA vez e reaproveitada por TTL curto → números "pré setados", carregamento rápido.
type ContagemCache = { at: number; counts: Record<string, number> }
const _contagemCache = new Map<string, ContagemCache>()
const CONTAGEM_TTL_MS = 5 * 60_000 // 5 min

/** Mapa grupo_id → nº de membros do tenant, memorizado (TTL 5 min). `forcar` recalcula. */
export async function contarMembrosGrupos(svc: Svc, tenantId: string, opts?: { forcar?: boolean }): Promise<Record<string, number>> {
  const tid = tenantId || '00000000-0000-0000-0000-000000000000'
  const hit = _contagemCache.get(tid)
  if (!opts?.forcar && hit && Date.now() - hit.at < CONTAGEM_TTL_MS) return hit.counts
  const membros = await fetchAll<{ grupo_id: string }>(() =>
    svc.from('simulado_grupo_membros').select('grupo_id').eq('tenant_id', tid).order('grupo_id', { ascending: true }))
  const counts: Record<string, number> = {}
  for (const m of membros) counts[m.grupo_id] = (counts[m.grupo_id] ?? 0) + 1
  _contagemCache.set(tid, { at: Date.now(), counts })
  return counts
}

/** Invalida o cache de contagem (após mudanças de filiação em massa). */
export function invalidarContagemGrupos(tenantId?: string) {
  if (tenantId) _contagemCache.delete(tenantId)
  else _contagemCache.clear()
}
