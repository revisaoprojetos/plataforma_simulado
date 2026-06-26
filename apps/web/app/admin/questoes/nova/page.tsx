import { createClient } from '@/lib/supabase/server'
import { QuestaoForm } from '@/components/admin/questao-form'
import { createQuestaoAction } from '../actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NovaQuestaoPage() {
  const supabase = await createClient()

  const [{ data: bancas }, { data: disciplinas }] = await Promise.all([
    supabase.from('simulado_bancas').select('nome').order('nome'),
    supabase.from('simulado_disciplinas').select('nome').order('nome'),
  ])

  const bancasSugestoes = (bancas ?? []).map((b) => b.nome)
  const disciplinasSugestoes = (disciplinas ?? []).map((d) => d.nome)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/questoes"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para Questões
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nova Questão</h1>
      </div>

      <QuestaoForm
        bancasSugestoes={bancasSugestoes}
        disciplinasSugestoes={disciplinasSugestoes}
        onSubmit={createQuestaoAction}
      />
    </div>
  )
}
