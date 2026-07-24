import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
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
  const tenantId = await getCurrentTenantId()
  const admin = createAdminClient()

  const [
    { data: questao },
    { data: bancas },
    { data: disciplinas },
    { data: alternativas },
    { data: bancosDestino },
    { data: vinculos },
  ] = await Promise.all([
    supabase
      .from('simulado_questoes')
      .select('*, bancas:simulado_bancas(nome), disciplinas:simulado_disciplinas(nome)')
      .eq('id', id)
      .single(),
    supabase.from('simulado_bancas').select('nome').order('nome'),
    supabase.from('simulado_disciplinas').select('nome').order('nome'),
    supabase
      .from('simulado_alternativas')
      .select('*')
      .eq('questao_id', id)
      .order('ordem'),
    admin.from('simulado_pastas').select('id, nome').eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome'),
    admin.from('simulado_questao_pasta').select('pasta_id').eq('questao_id', id),
  ])

  if (!questao) {
    notFound()
  }

  const bancasSugestoes = (bancas ?? []).map((b) => b.nome)
  const disciplinasSugestoes = (disciplinas ?? []).map((d) => d.nome)
  const bancoIds = (vinculos ?? []).map((v: { pasta_id: string }) => v.pasta_id)

  const initialData = {
    tipo: questao.tipo as 'objetiva' | 'discursiva',
    enunciado: questao.enunciado,
    banca: (questao.bancas as { nome?: string } | null)?.nome ?? undefined,
    disciplina: (questao.disciplinas as { nome?: string } | null)?.nome ?? undefined,
    ano: questao.ano ?? undefined,
    nivel_dificuldade: (questao.nivel_dificuldade ?? undefined) as 'facil' | 'medio' | 'dificil' | undefined,
    gabarito_tipo: (questao.gabarito_tipo ?? undefined) as 'oficial' | 'extraoficial' | undefined,
    comentario_professor: questao.comentario_professor ?? undefined,
    status: (questao.status ?? 'rascunho') as 'rascunho' | 'publicada' | 'arquivada',
    imagem_url: (questao.imagem_url as string | null) ?? undefined,
    alternativas: alternativas?.map((a) => ({
      texto: a.texto,
      correta: a.correta,
      ordem: a.ordem,
    })),
    bancoIds,
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
        bancasSugestoes={bancasSugestoes}
        disciplinasSugestoes={disciplinasSugestoes}
        bancos={bancosDestino ?? []}
        onSubmit={updateQuestaoAction.bind(null, id)}
      />
    </div>
  )
}
