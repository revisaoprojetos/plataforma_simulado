import { Suspense } from 'react'
import { VoltarCronogramas } from '@/components/admin/cronograma/voltar-cronogramas'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarDetalhe, pacotesDoCronograma } from './metas-actions'
import { MetasClient } from './metas-client'
import { getCurrentTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function CronogramaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [r, p, tenantId] = await Promise.all([carregarDetalhe(id), pacotesDoCronograma(id), getCurrentTenantId()])

  if (!r.ok || !r.cronograma) {
    return (
      <div className="animate-page space-y-6">
        <Suspense fallback={null}><VoltarCronogramas tela="cronograma" /></Suspense>
        <SemPermissao>{r.error ?? 'Cronograma não encontrado.'}</SemPermissao>
      </div>
    )
  }

  return (
    <div className="animate-page space-y-6">
      <div>
        <Suspense fallback={null}><VoltarCronogramas tela="cronograma" /></Suspense>
      </div>
      <MetasClient cronograma={r.cronograma} metasIniciais={r.metas ?? []} tipos={r.tipos ?? []} disciplinas={r.disciplinas ?? []} simulados={r.simulados ?? []} pacotes={p.dados ?? { dentro: [], fora: [] }} diagnostico={r.diagnostico!} tenantId={tenantId ?? undefined} />
    </div>
  )
}
