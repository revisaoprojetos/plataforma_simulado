import { Package } from 'lucide-react'
import { Suspense } from 'react'
import { VoltarCronogramas } from '@/components/admin/cronograma/voltar-cronogramas'
import { SemPermissao } from '@/components/ui/alert-box'
import { checkPermission } from '@/lib/auth/permissions'
import { carregarPacote } from '../actions'
import { PacoteClient } from './pacote-client'

export const dynamic = 'force-dynamic'

export default async function PacoteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [r, podeLiberar] = await Promise.all([carregarPacote(id), checkPermission('cronogramas:liberar')])

  return (
    <div className="animate-page space-y-6">
      <div>
        <Suspense fallback={null}><VoltarCronogramas tela="pacote" /></Suspense>
      </div>

      {!r.ok || !r.dados ? (
        <SemPermissao>{r.error ?? 'Pacote não encontrado.'}</SemPermissao>
      ) : (
        <>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Package className="h-6 w-6 text-primary" />
              {r.dados.pacote.nome}
            </h1>
            {r.dados.pacote.descricao && <p className="text-muted-foreground">{r.dados.pacote.descricao}</p>}
          </div>
          <PacoteClient dados={r.dados} podeLiberar={podeLiberar} />
        </>
      )}
    </div>
  )
}
