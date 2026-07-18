import type { createAdminClient } from '@/lib/supabase/server'

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
    criado_em: g.criado_em ?? null,
  }))
}
