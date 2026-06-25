import { createClient } from '@/lib/supabase/server'
import { QuestaoForm } from '@/components/admin/questao-form'
import { updateQuestaoAction } from '../../actions'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditarQuestaoPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: questao },
    { data: bancas },
    { data: disciplinas },
    { data: alternativas },
  ] = await Promise.all([
    supabase
      .from('questoes')
      .select('*')
      .eq('id', id)
      .single(),
    supabase.from('bancas').select('id, nome').order('nome'),
    supabase.from('disciplinas').select('id, nome').order('nome'),
    supabase
      .from('alternativas')
      .select('*')
      .eq('questao_id', id)
      .order('ordem'),
  ])

  if (!questao) {
    notFound()
  }

  const initialData = {
    tipo: questao.tipo as 'objetiva' | 'discursiva',
    enunciado: questao.enunciado,
    banca_id: questao.banca_id ?? undefined,
    disciplina_id: questao.disciplina_id ?? undefined,
    ano: questao.ano ?? undefined,
    nivel_dificuldade: questao.nivel_dificuldade as any,
    gabarito_tipo: questao.gabarito_tipo as any,
    comentario_professor: questao.comentario_professor ?? undefined,
    status: questao.status as any,
    alternativas: alternativas?.map((a) => ({
      texto: a.texto,
      correta: a.correta,
      ordem: a.ordem,
    })),
  }

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
        <h1 className="text-2xl font-bold tracking-tight">Editar Questão</h1>
        <p className="text-sm text-muted-foreground font-mono">{id}</p>
      </div>

      <QuestaoForm
        initialData={initialData}
        bancas={bancas ?? []}
        disciplinas={disciplinas ?? []}
        onSubmit={(data) => updateQuestaoAction(id, data)}
      />
    </div>
  )
}
