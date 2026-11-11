// Extensivos REAIS do aluno (produtos ativos = os de "Meus Extensivos") para a Central de Estudos.
// 0 → nada aparece · 1 → abre direto o extensivo · 2+ → abre a lista para escolher.
import 'server-only'
import { produtosDoAluno } from '@/lib/produtos/aluno'
import { getCurrentTenant } from '@/lib/tenant'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'

export type ExtensivoAtalho = { qtd: number; href: string; titulo: string; sub: string; capa: string | null }

export async function extensivoAtalhoDoAluno(tenantId: string, estudanteId: string): Promise<ExtensivoAtalho | null> {
  const produtos = (await produtosDoAluno(tenantId, estudanteId).catch(() => [])).filter((p) => p.tipo !== 'jurisclub') // JurisClub tem área própria
  if (!produtos.length) return null
  if (produtos.length === 1) {
    const p = produtos[0]
    return { qtd: 1, href: `/aluno/extensivos/${p.slug}`, titulo: 'Extensivo da Advocacia', sub: p.descricao || `${p.itens} item(ns) liberado(s)`, capa: p.capa_url ?? null }
  }
  return { qtd: produtos.length, href: '/aluno/extensivos', titulo: 'Extensivos', sub: `${produtos.length} extensivos liberados`, capa: null }
}

/** Para onde o "Voltar" de um extensivo retorna: Revisão (que tem a área Cursos) → Cursos; demais → lista Meus Extensivos. */
export async function voltarDoExtensivo(): Promise<{ href: string; rotulo: string }> {
  const tenant = await getCurrentTenant().catch(() => null)
  const marca = tenant ? lerAparenciaAuth((tenant as any).tema ?? null, { slug: (tenant as any).slug, nome: (tenant as any).nome }).brand : 'revisao'
  return marca === 'revisao' ? { href: '/aluno/nova/cursos', rotulo: 'Cursos' } : { href: '/aluno/extensivos', rotulo: 'Meus Extensivos' }
}
