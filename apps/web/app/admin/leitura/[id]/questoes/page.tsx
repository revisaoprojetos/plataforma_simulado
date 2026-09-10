import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, HelpCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { QuizConteudoAdmin } from '@/components/admin/quiz-conteudo-admin'

export const dynamic = 'force-dynamic'

export default async function QuizConteudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await checkPermission('leitura:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')

  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('id, titulo, pasta_id').eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!doc) notFound()
  const d = doc as any

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={d.pasta_id ? `/admin/leitura?pasta=${d.pasta_id}` : '/admin/leitura'} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight"><HelpCircle className="h-5 w-5 text-primary" /> Questões do conteúdo — {d.titulo}</h1>
          <p className="text-sm text-muted-foreground">Mini-simulado da aula: questões separadas p/ o aluno responder rápido (sem login/tempo). Diferente das questões inline da leitura.</p>
        </div>
      </div>
      <QuizConteudoAdmin documentoId={id} />
    </div>
  )
}
