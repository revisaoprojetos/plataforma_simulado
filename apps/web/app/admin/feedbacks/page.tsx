import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { FeedbackItem } from '@/components/admin/feedback-item'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Inbox } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'

export default async function FeedbacksPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')

  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Reports de questões</h1>
        <SemPermissao>Você não tem permissão para ver os reports.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  // Sem embed: a FK feedbacks→questoes não existe (foi dropada no rename do schema).
  const { data } = await svc
    .from('simulado_feedbacks_questao')
    .select('id, tipo, mensagem, status, resposta_admin, criado_em, questao_id, estudante_id')
    .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('criado_em', { ascending: false })
    .limit(100)

  const rows = data ?? []
  const questaoIds = [...new Set(rows.map((f: any) => f.questao_id).filter(Boolean))]
  const estudanteIds = [...new Set(rows.map((f: any) => f.estudante_id).filter(Boolean))]

  const [{ data: questoes }, { data: estudantes }] = await Promise.all([
    questaoIds.length
      ? svc.from('simulado_questoes').select('id, enunciado').in('id', questaoIds)
      : Promise.resolve({ data: [] as { id: string; enunciado: string }[] }),
    estudanteIds.length
      ? svc.from('simulado_estudantes').select('id, nome').in('id', estudanteIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  const qMap = new Map((questoes ?? []).map((q: any) => [q.id, q.enunciado]))
  const eMap = new Map((estudantes ?? []).map((e: any) => [e.id, e.nome]))

  const feedbacks = rows.map((f: any) => ({
    id: f.id,
    tipo: f.tipo,
    mensagem: f.mensagem,
    status: f.status,
    resposta_admin: f.resposta_admin,
    criado_em: f.criado_em,
    enunciado: qMap.get(f.questao_id) ?? '—',
    estudante: eMap.get(f.estudante_id) ?? 'Aluno',
  }))

  const pendentes = feedbacks.filter((f) => f.status === 'pendente').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports de questões</h1>
        <p className="text-muted-foreground">
          Erros reportados pelos alunos — {pendentes} pendente(s) de {feedbacks.length} total.
        </p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Inbox} titulo="Fila de moderação" subtitulo={`${pendentes} pendente(s) de ${feedbacks.length}`} />
        <CardContent className="space-y-3 px-4 py-4">
          {feedbacks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">Nenhum report ainda.</p>
            </div>
          ) : (
            feedbacks.map((fb) => <FeedbackItem key={fb.id} fb={fb} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}
