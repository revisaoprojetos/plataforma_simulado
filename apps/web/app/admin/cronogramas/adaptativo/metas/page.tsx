import { obterPainelMetas } from '../actions'
import { MetasClient } from './metas-client'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { EspelhoMetas } from '@/components/admin/espelho-metas'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — parâmetros das metas e inteligência do motor (por plataforma).
export default async function CronogramaAdaptativoMetasPage() {
  const r = await obterPainelMetas()
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Metas &amp; inteligência</h1>
        <p className="text-muted-foreground">
          Ajuste como o motor monta o cronograma dos alunos: ritmo, duração das metas, revisões, limites de PDFull e LegProc
          e o uso do desempenho. Os valores padrão reproduzem o comportamento atual; só muda o que você alterar.
        </p>
      </div>
      <AdaptativoTabs />
      {!r.ok || !r.painel ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
      ) : (
        <MetasClient inicial={r.painel} />
      )}
      <EspelhoMetas />
    </div>
  )
}
