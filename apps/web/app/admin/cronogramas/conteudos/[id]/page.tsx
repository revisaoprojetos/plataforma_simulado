import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SemPermissao } from '@/components/ui/alert-box'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { carregarConjunto } from '../actions'
import { listarDisciplinasFiltro } from '../../../banco-questoes/actions'
import { ConjuntoEditorClient } from './conjunto-editor-client'

export const dynamic = 'force-dynamic'

export default async function ConjuntoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const acesso = await getCurrentAccess()
  const [r, disciplinas, tipos] = await Promise.all([
    carregarConjunto(id),
    listarDisciplinasFiltro(),
    acesso.tenantId ? listarTiposMeta(acesso.tenantId) : Promise.resolve([]),
  ])

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/admin/cronogramas/conteudos" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao banco
        </Link>
      </div>
      {!r.ok || !r.dados ? (
        <SemPermissao>{r.error ?? 'Conjunto não encontrado.'}</SemPermissao>
      ) : (
        <ConjuntoEditorClient dados={r.dados} tipos={tipos} disciplinas={disciplinas} />
      )}
    </div>
  )
}
