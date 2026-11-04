import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getProdutoEditorLeve, listarInstrutores, resumoProduto, breadcrumbDaPasta } from '@/lib/produtos/estudio'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { ProdutoEstudioClient } from './produto-estudio-client'

export const dynamic = 'force-dynamic'

// PRODUTO › editor (Informações · Conteúdos · Vitrine · Grupos de acesso · Visibilidade).
// Carga INICIAL = só o leve (identidade + vitrine + instrutores + 4 contagens). Currículo, grupos,
// nomes da vitrine e candidatos são LAZY por aba (lazy-actions.ts) e as listas grandes são BUSCA no servidor.
export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || access.permissions.includes('produtos:view') || access.permissions.includes('produtos:manage')
  if (!permitido) return <SemAcessoArea />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const podeEditar = access.isAdmin || access.permissions.includes('produtos:manage')
  const tid = access.tenantId
  const { id } = await params

  const leve = await getProdutoEditorLeve(tid, id)
  if (!leve) notFound()

  const [instrutores, resumo, breadcrumb] = await Promise.all([
    listarInstrutores(tid, id),
    resumoProduto(tid, id),
    breadcrumbDaPasta(tid, leve.pastaId),
  ])

  return (
    <ProdutoEstudioClient
      tenantId={tid}
      podeEditar={podeEditar}
      produto={leve.produto}
      instrutores={instrutores}
      resumo={resumo}
      breadcrumb={breadcrumb}
      criadoEm={leve.criadoEm}
      atualizadoEm={leve.atualizadoEm}
      mesmoNome={leve.mesmoNome}
    />
  )
}
