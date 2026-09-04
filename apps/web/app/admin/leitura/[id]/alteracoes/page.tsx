import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, GitCompare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { listarVersoesDocumento, carregarDiffDocumento } from '../../alteracoes-actions'
import { AlteracoesClient } from './alteracoes-client'

export const dynamic = 'force-dynamic'

export default async function AlteracoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await checkPermission('leitura:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')

  const svc = createAdminClient()
  const { data: doc } = await svc
    .from('simulado_documentos')
    .select('titulo')
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
    .eq('deletado', false)
    .maybeSingle()
  if (!doc) notFound()

  const r = await listarVersoesDocumento(id)
  const versoes = r.versoes ?? []
  const pub = r.publicada ?? 1
  const rasc = r.rascunho ?? pub
  // Padrão: Depois = a MAIOR versão que realmente tem conteúdo (rascunho se houver, senão a
  //   publicada); Antes = a versão anterior. Usar a lista (que vem de conteudos) evita apontar
  //   para um número de rascunho sem linha de conteúdo. `rasc`/`pub` ficam como fallback.
  const vDepois = versoes.length ? Math.max(...versoes.map((v) => v.versao)) : (rasc > pub ? rasc : pub)
  const anteriores = versoes.map((v) => v.versao).filter((v) => v < vDepois)
  const vAntes = anteriores.length ? Math.max(...anteriores) : vDepois
  const diffInicial = versoes.length
    ? (await carregarDiffDocumento(id, vAntes, vDepois)).diff ?? { blocos: [], resumo: { mod: 0, add: 0, rem: 0, igual: 0 } }
    : { blocos: [], resumo: { mod: 0, add: 0, rem: 0, igual: 0 } }

  return (
    <div className="space-y-5">
      <Link href={`/admin/leitura/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar ao documento
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GitCompare className="h-6 w-6 text-primary" /> Alterações · {(doc as any).titulo}
        </h1>
        <p className="text-muted-foreground">Antes e depois entre versões — o que foi adicionado, removido e alterado.</p>
      </div>

      {versoes.length <= 1 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          Este documento ainda tem só uma versão — não há histórico para comparar.
        </div>
      ) : (
        <AlteracoesClient documentoId={id} versoes={versoes} vAntesInicial={vAntes} vDepoisInicial={vDepois} diffInicial={diffInicial} />
      )}
    </div>
  )
}
