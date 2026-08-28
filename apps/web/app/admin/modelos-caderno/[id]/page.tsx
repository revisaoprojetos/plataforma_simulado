import { notFound } from 'next/navigation'
import { abrirModelo } from '../actions'
import { ModeloEditor } from '@/components/admin/modelos-caderno/modelo-editor'

export default async function EditarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await abrirModelo(id)
  if (!r.ok || !r.config) notFound()

  return <ModeloEditor id={id} nomeInicial={r.nome ?? 'Modelo'} configInicial={r.config} />
}
