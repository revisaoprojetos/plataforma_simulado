import { notFound } from 'next/navigation'
import { listarBancoAulas } from '../../actions'
import { TrilhaBuilder } from '@/components/admin/trilha-builder'

export const dynamic = 'force-dynamic'

export default async function TrilhaBuilderPage({ params }: { params: Promise<{ pasta: string }> }) {
  const { pasta } = await params
  const data = await listarBancoAulas(pasta, true)
  if (!data.ok || !data.moduloAtual) notFound()
  const m = data.moduloAtual
  const capa = m.capa_url ?? m.capa_card_url ?? null
  const aulas = (data.aulas ?? []).map((a: any) => ({ id: a.id, titulo: a.titulo ?? a.nome ?? 'Aula' }))
  return <TrilhaBuilder pastaId={pasta} moduloNome={m.nome} capa={capa} aulas={aulas} atual={m.trilhaAparencia} />
}
