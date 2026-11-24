import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { listarLegproc } from './actions'
import { LeiSecaEditor } from './lei-seca-editor'

export const dynamic = 'force-dynamic'

// Admin: Lei seca (WLP) do Cronograma Adaptativo — blocos por semana.
export default async function LeiSecaPage() {
  const r = await listarLegproc()
  const semanas = r.ok ? r.semanas ?? [] : []
  return (
    <div className="w-full space-y-5">
      <TituloTela titulo="Lei seca" descricao="Blocos de LegProc por semana. Alimentam as metas de lei seca do cronograma gerado para o aluno." />

      {!r.ok ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
      ) : (
        <LeiSecaEditor inicial={semanas} />
      )}
    </div>
  )
}
