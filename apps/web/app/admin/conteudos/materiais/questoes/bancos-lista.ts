// Leitura de bancos (pastas folder_area='banco') com filtros APLICADOS NO SERVIDOR — usada pela page
// e pela rota de export XLSX, para que a lista e a planilha mostrem exatamente o mesmo conjunto.
// Disciplina/Banca vêm da classificação padrão do banco (tenant.tema.banco_class_padrao).

import { createAdminClient } from '@/lib/supabase/server'

export type FiltroBancos = { q: string; disc: string | null; banca: string | null }
export type PastaBanco = { id: string; nome: string; tipo?: string | null; atualizado_em?: string | null }

type ClassLote = Record<string, { disciplina?: { nome: string } | null; banca?: { nome: string } | null } | undefined>

export async function listarBancosFiltrados(
  tid: string, f: FiltroBancos, classLote: ClassLote, range: { page: number; perPage: number } | null,
): Promise<{ pastas: PastaBanco[]; total: number }> {
  const svc = createAdminClient()
  let ids: string[] | null = null
  if (f.disc || f.banca) {
    ids = Object.entries(classLote)
      .filter(([, v]) => (!f.disc || v?.disciplina?.nome === f.disc) && (!f.banca || v?.banca?.nome === f.banca))
      .map(([id]) => id)
    if (!ids.length) return { pastas: [], total: 0 }
  }
  const montar = (cols: string, ordem: string) => {
    let b = svc.from('simulado_pastas').select(cols, { count: 'exact' })
      .eq('tenant_id', tid).eq('folder_area', 'banco').eq('deletado', false)
    if (f.q) b = b.ilike('nome', `%${f.q}%`)
    if (ids) b = b.in('id', ids.slice(0, 300))
    b = b.order(ordem, { ascending: ordem === 'nome' }).order('id', { ascending: true })
    return range ? b.range((range.page - 1) * range.perPage, range.page * range.perPage - 1) : b.range(0, 4999)
  }
  let res: any = await montar('id, nome, tipo, atualizado_em', 'atualizado_em')
  if (res.error) res = await montar('id, nome, tipo', 'nome')
  if (res.error) res = await montar('id, nome', 'nome')
  return { pastas: (res.data ?? []) as PastaBanco[], total: res.count ?? 0 }
}

export async function contarQuestoesPorBanco(tid: string, ids: string[]): Promise<Map<string, number>> {
  const svc = createAdminClient()
  const out = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 25) {
    await Promise.all(ids.slice(i, i + 25).map(async (id) => {
      const { count } = await svc.from('simulado_questao_pasta').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('pasta_id', id)
      out.set(id, count ?? 0)
    }))
  }
  return out
}
