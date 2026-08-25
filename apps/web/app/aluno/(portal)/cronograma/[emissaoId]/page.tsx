import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { AlertBox } from '@/components/ui/alert-box'
import { abrirEmissao } from '../emissoes-actions'
import { listarChecks } from '../checks-actions'
import { listarNotas } from '../notas-actions'
import { normalizarPreferencias } from '@/lib/cronograma/preferencias'
import { EmissaoClient } from './emissao-client'

export const dynamic = 'force-dynamic'

export default async function EmissaoPage({ params }: { params: Promise<{ emissaoId: string }> }) {
  const { emissaoId } = await params
  const r = await abrirEmissao(emissaoId)
  // As metas concluídas vêm junto: pedir depois faria a tela abrir com tudo desmarcado e
  // "corrigir" um instante mais tarde, que é pior do que abrir certo.
  const [c, n] = await Promise.all([listarChecks(emissaoId), listarNotas(emissaoId)])

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/aluno/cronograma" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Meus cronogramas
        </Link>
      </div>

      {!r.ok || !r.dados ? (
        <AlertBox variante="aviso" titulo="Não encontramos este cronograma">
          <p className="text-sm">{r.error ?? 'Ele pode ter sido removido.'}</p>
        </AlertBox>
      ) : (
        <EmissaoClient
          emissao={r.dados.emissao}
          grade={r.dados.grade}
          indisponivel={r.dados.indisponivel}
          checks={c.checks ?? {}}
          notas={n.notas ?? {}}
          preferencias={normalizarPreferencias(r.dados.emissao.preferencias)}
        />
      )}
    </div>
  )
}
