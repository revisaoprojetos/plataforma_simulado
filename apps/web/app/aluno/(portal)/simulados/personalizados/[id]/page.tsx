import { redirect } from 'next/navigation'
import { questoesDoMeuSimulado } from '../../builder-actions'
import { PersonalizadoEditor } from '@/components/aluno/personalizado-editor'

export const dynamic = 'force-dynamic'

/** Editor de um simulado personalizado do aluno. A action valida a posse (owner_estudante_id);
 *  se não for do aluno logado (ou não existir), volta para Meus simulados. */
export default async function EditorPersonalizadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await questoesDoMeuSimulado(id)
  if (r.error || r.titulo == null) redirect('/aluno/simulados')
  return <PersonalizadoEditor simuladoId={id} titulo={r.titulo} itensIniciais={r.itens ?? []} secoesIniciais={r.secoes ?? []} visualInicial={r.visual ?? { cor: '#6d28d9', icone: 'varinha' }} />
}
