import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { BibliotecaEstudio } from '@/components/admin/estudio/biblioteca-estudio'
import { montarNivelBiblioteca } from './nivel'

export const dynamic = 'force-dynamic'
const PP = [5, 10, 25, 50]

// BIBLIOTECA (Estúdio › Materiais): pastas + documentos do nível atual. A árvore já vem escopada à pasta
// (listarArvore); busca/filtros/ordenação/paginação do nível são aplicados no servidor (pastas primeiro).
export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('biblioteca:view'))) return <SemAcessoArea />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const sp = await searchParams

  const nivel = await montarNivelBiblioteca(sp)
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const linhas = nivel.todas.slice((page - 1) * perPage, page * perPage)

  return (
    <BibliotecaEstudio
      tenantId={access.tenantId}
      pastaAtual={nivel.pasta}
      breadcrumb={nivel.breadcrumb}
      linhas={linhas}
      total={nivel.todas.length}
    />
  )
}
