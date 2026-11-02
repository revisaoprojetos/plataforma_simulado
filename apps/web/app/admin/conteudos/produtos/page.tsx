import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarPastasUnificadas, breadcrumbPasta, conteudoUnificado } from '@/lib/produtos/estudio'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { ProdutosEstudioClient } from './produtos-estudio-client'

export const dynamic = 'force-dynamic'
const PP = [5, 10, 25, 50]

// PRODUTOS (Estúdio): navegador ÚNICO de pastas + produtos + simulados, paginado/ordenado/filtrado no banco.
export default async function ProdutosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('produtos:view') || access.permissions.includes('produtos:manage')
  if (!permitido) return <SemAcessoArea />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const podeEditar = access.isAdmin || access.permissions.includes('produtos:manage')
  const podeEditarSim = access.isAdmin || access.permissions.includes('simulados:update') || access.permissions.includes('simulados:create')

  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const sort = sp.sort ?? 'atualizacao'
  const dir = (sp.dir ?? 'desc') === 'asc' ? 'asc' : 'desc'
  const q = (sp.q ?? '').trim()
  const pasta = sp.pasta || null
  const tipo = sp.tipo === 'pasta' || sp.tipo === 'produto' || sp.tipo === 'simulado' ? sp.tipo : null

  const [arvore, conteudo] = await Promise.all([
    listarPastasUnificadas(access.tenantId),
    conteudoUnificado(access.tenantId, pasta, { page, perPage, q, sort, dir, tipo }),
  ])

  return (
    <ProdutosEstudioClient
      podeEditar={podeEditar}
      podeEditarSim={podeEditarSim}
      rows={conteudo.rows}
      total={conteudo.total}
      arvore={arvore}
      breadcrumb={breadcrumbPasta(arvore, pasta)}
      pastaAtual={pasta}
      tipo={tipo}
    />
  )
}
