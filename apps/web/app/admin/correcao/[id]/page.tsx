import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CorrecaoForm } from '@/components/admin/correcao-form'
import { ArrowLeft } from 'lucide-react'

export default async function CorrigirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const { data: r } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, questao_id, estudante_id, texto, status, nota, feedback')
    .eq('id', id)
    .eq('tenant_id', access.tenantId ?? '')
    .maybeSingle()
  if (!r) notFound()

  const [{ data: questao }, { data: estudante }, { data: comps }, { data: notas }] = await Promise.all([
    svc.from('simulado_questoes').select('enunciado, comentario_professor').eq('id', r.questao_id).maybeSingle(),
    svc.from('simulado_estudantes').select('nome').eq('id', r.estudante_id).maybeSingle(),
    svc.from('simulado_competencias').select('id, nome, pontos, ordem').eq('questao_id', r.questao_id).order('ordem'),
    svc.from('simulado_correcao_competencias').select('competencia_id, nota, comentario').eq('resposta_id', id),
  ])

  const notaMap = new Map((notas ?? []).map((n: any) => [n.competencia_id, n]))
  const competencias = (comps ?? []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    pontos: Number(c.pontos),
    nota: notaMap.get(c.id)?.nota != null ? Number(notaMap.get(c.id).nota) : null,
    comentario: notaMap.get(c.id)?.comentario ?? '',
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/correcao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Fila de correção
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Corrigir resposta</h1>
        <p className="text-muted-foreground">Aluno: {estudante?.nome ?? '—'}</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Enunciado</p>
        <p className="text-sm">{questao?.enunciado ?? '—'}</p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Resposta do aluno</p>
        <p className="whitespace-pre-wrap text-sm">{r.texto ?? '(em branco)'}</p>
      </div>

      <CorrecaoForm
        respostaId={r.id}
        jaCorrigida={r.status === 'corrigida'}
        competencias={competencias}
        feedbackInicial={r.feedback ?? ''}
      />
    </div>
  )
}
