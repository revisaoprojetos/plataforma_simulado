import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { produtosDoAluno } from '@/lib/produtos/aluno'
import type { Liberacoes } from './jurisclub-tipos'

/**
 * Edições do JurisClub (admin Plataforma Revisão › Pedagógico › JurisClub) visíveis a UM aluno.
 * No ar = status 'publicado' OU 'agendado' com publicar_em vencido (cura o atraso do cron).
 * Visibilidade: `todos` → aluno com produto JurisClub ativo; senão → membro de algum grupo da edição.
 * Leitura só abre se a parte "leitura" estiver liberada e houver documento ligado (Biblioteca › /aluno/biblioteca/[id]).
 */
export interface EdicaoAluno {
  id: string; titulo: string; pasta: 'mensal' | '1a7d'; julgados: number; questoes: number
  cor: string; imagem: string | null; publicadoEm: string | null; href: string | null; liberacoes: Liberacoes
}

async function calcular(tenantId: string, estudanteId: string, voltar: string): Promise<EdicaoAluno[]> {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const rows = await fetchAll<any>(() => svc.from('jurisclub_edicoes')
    .select('id, titulo, pasta, todos, n_julgados, n_questoes, cor, imagem_url, publicado_em, publicar_em, status, documento_id, liberacoes')
    .eq('tenant_id', tenantId).eq('deletado', false).or(`status.eq.publicado,and(status.eq.agendado,publicar_em.lte.${agora})`)
    .order('publicado_em', { ascending: false, nullsFirst: false }).order('id'))
  if (!rows.length) return []
  const restritas = rows.filter((r) => !r.todos).map((r) => r.id as string)
  const [meusGrupos, edGrupos, temProduto] = await Promise.all([
    restritas.length ? svc.from('simulado_grupo_membros').select('grupo_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).then((r: any) => new Set<string>((r.data ?? []).map((x: any) => x.grupo_id))) : Promise.resolve(new Set<string>()),
    restritas.length ? fetchAll<any>(() => svc.from('jurisclub_edicao_grupos').select('edicao_id, grupo_id').eq('tenant_id', tenantId).in('edicao_id', restritas.slice(0, 80)).order('edicao_id').order('grupo_id')) : Promise.resolve([] as any[]),
    rows.some((r) => r.todos) ? produtosDoAluno(tenantId, estudanteId).then((p) => p.some((x) => x.tipo === 'jurisclub')).catch(() => false) : Promise.resolve(false),
  ])
  const gruposPorEd = new Map<string, string[]>()
  for (const g of edGrupos) (gruposPorEd.get(g.edicao_id) ?? gruposPorEd.set(g.edicao_id, []).get(g.edicao_id)!).push(g.grupo_id)
  return rows
    .filter((r) => (r.todos ? temProduto : (gruposPorEd.get(r.id) ?? []).some((g) => meusGrupos.has(g))))
    .map((r) => {
      const lib = { leitura: true, vf: false, pdf: true, cad: false, gab: false, ...(r.liberacoes ?? {}) } as Liberacoes
      return {
        id: r.id, titulo: r.titulo, pasta: r.pasta, julgados: r.n_julgados ?? 0, questoes: r.n_questoes ?? 0, cor: r.cor, imagem: r.imagem_url ?? null,
        publicadoEm: r.publicado_em ?? r.publicar_em ?? null,
        href: lib.leitura && r.documento_id ? `/aluno/biblioteca/${r.documento_id}?voltar=${encodeURIComponent(voltar)}` : null,
        liberacoes: lib,
      }
    })
}

export function edicoesJurisclubDoAluno(tenantId: string, estudanteId: string, voltar: string): Promise<EdicaoAluno[]> {
  return remember(`jurisclub:edicoes-aluno:${tenantId}:${estudanteId}`, 60, () => calcular(tenantId, estudanteId, voltar))
}
