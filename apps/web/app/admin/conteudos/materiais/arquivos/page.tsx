import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarMateriais, rotulosVinculosDocs, listarEtiquetasConteudo } from '@/app/admin/conteudos/materiais/biblioteca/actions'
import { paramsMateriais } from '@/app/admin/conteudos/materiais/biblioteca/params'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { DocumentosEstudio } from '@/components/admin/estudio/documentos-estudio'

export const dynamic = 'force-dynamic'

// Arquivos complementares (Estúdio › Materiais): documentos da Biblioteca, paginados/ordenados/filtrados no banco.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('biblioteca:view'))) return <SemAcessoArea />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const sp = await searchParams

  const [res, etiquetas] = await Promise.all([
    listarMateriais(paramsMateriais(sp, 'arquivos')),
    listarEtiquetasConteudo(),
  ])
  const rotulos = await rotulosVinculosDocs(res.rows.map((r) => r.id))

  return (
    <DocumentosEstudio
      tenantId={access.tenantId}
      modo="arquivos"
      rows={res.rows}
      total={res.total}
      vinculos={res.vinculos}
      rotulos={rotulos}
      etiquetas={etiquetas}
      titulo="Arquivos complementares"
    />
  )
}
