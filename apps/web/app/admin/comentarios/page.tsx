import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { ComentarioModerar } from '@/components/admin/comentario-moderar'
import { SecaoHeader } from '@/components/admin/secao-header'
import { ShieldAlert, MessageSquare } from 'lucide-react'

export default async function ComentariosModeracaoPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Comentários</h1>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4" /> Sem permissão.
        </div>
      </div>
    )
  }

  const svc = createAdminClient()
  // Comentários de alunos (professor já aparece direto). Pendentes primeiro.
  const { data } = await svc
    .from('simulado_comentarios_questao')
    .select('id, texto, autor_id, aprovado, criado_em, questao_id')
    .eq('tenant_id', access.tenantId ?? '')
    .eq('tipo', 'aluno')
    .order('aprovado', { ascending: true })
    .order('criado_em', { ascending: false })
    .limit(100)

  const rows = data ?? []
  const qIds = [...new Set(rows.map((r: any) => r.questao_id).filter(Boolean))]
  const aIds = [...new Set(rows.map((r: any) => r.autor_id).filter(Boolean))]
  const [{ data: questoes }, { data: alunos }] = await Promise.all([
    qIds.length ? svc.from('simulado_questoes').select('id, enunciado').in('id', qIds) : Promise.resolve({ data: [] as any[] }),
    aIds.length ? svc.from('simulado_estudantes').select('id, nome').in('id', aIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const qMap = new Map((questoes ?? []).map((q: any) => [q.id, q.enunciado]))
  const aMap = new Map((alunos ?? []).map((a: any) => [a.id, a.nome]))

  const comentarios = rows.map((r: any) => ({
    id: r.id,
    texto: r.texto,
    aprovado: r.aprovado,
    criado_em: r.criado_em,
    autor: aMap.get(r.autor_id) ?? 'Aluno',
    enunciado: qMap.get(r.questao_id) ?? '—',
  }))
  const pendentes = comentarios.filter((c) => !c.aprovado).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comentários</h1>
        <p className="text-muted-foreground">
          Moderação de comentários dos alunos — {pendentes} pendente(s) de {comentarios.length}.
        </p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={MessageSquare} titulo="Fila de moderação" subtitulo={`${pendentes} pendente(s) de ${comentarios.length}`} />
        <CardContent className="space-y-3 px-4 py-4">
          {comentarios.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8" />
              <p className="text-sm">Nenhum comentário de aluno ainda.</p>
            </div>
          ) : (
            comentarios.map((c) => <ComentarioModerar key={c.id} c={c} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}
