import { Suspense } from 'react'
import { VoltarCronogramas } from '@/components/admin/cronograma/voltar-cronogramas'
import { SemPermissao } from '@/components/ui/alert-box'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { carregarConjunto } from '../actions'
import { listarDisciplinasFiltro } from '../../../banco-questoes/actions'
import { ConjuntoEditorClient } from './conjunto-editor-client'

export const dynamic = 'force-dynamic'

export default async function ConjuntoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { id } = await params
  const { tipo } = await searchParams
  // Aberto pela aba LegProc: o editor já entra filtrado só nas aulas de tipo legproc.
  const filtroInicial = tipo === 'legproc' ? 'legproc' : undefined
  const acesso = await getCurrentAccess()
  const [r, disciplinas, tipos] = await Promise.all([
    carregarConjunto(id),
    listarDisciplinasFiltro(),
    acesso.tenantId ? listarTiposMeta(acesso.tenantId) : Promise.resolve([]),
  ])

  return (
    <div className="animate-page space-y-6">
      <div>
        <Suspense fallback={null}><VoltarCronogramas tela="conteudo" /></Suspense>
      </div>
      {!r.ok || !r.dados ? (
        <SemPermissao>{r.error ?? 'Conjunto não encontrado.'}</SemPermissao>
      ) : (
        <ConjuntoEditorClient dados={r.dados} tipos={tipos} disciplinas={disciplinas} filtroInicial={filtroInicial} />
      )}
    </div>
  )
}
