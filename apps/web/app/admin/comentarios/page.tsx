import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { ComentarioModerar } from '@/components/admin/comentario-moderar'
import { SecaoHeader } from '@/components/admin/secao-header'
import { MessageSquare } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export default async function ComentariosModeracaoPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Comentários" />
        <SemPermissao>Sem permissão.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  // Comentários de alunos (professor já aparece direto). Pendentes primeiro.
  const { data, count } = await svc
    .from('simulado_comentarios_questao')
    .select('id, texto, autor_id, aprovado, criado_em, questao_id', { count: 'exact' })
    .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    .eq('tipo', 'aluno')
    .order('aprovado', { ascending: true })
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .range(0, 99)

  const rows = data ?? []
  const qIds = [...new Set(rows.map((r: any) => r.questao_id).filter(Boolean))]
  const aIds = [...new Set(rows.map((r: any) => r.autor_id).filter(Boolean))]
  const [{ data: questoes }, { data: alunos }] = await Promise.all([
    fetchAllByIn<any>(qIds, (ch) => svc.from('simulado_questoes').select('id, enunciado').in('id', ch).order('id', { ascending: true })).then((d) => ({ data: d })),
    fetchAllByIn<any>(aIds, (ch) => svc.from('simulado_estudantes').select('id, nome').in('id', ch).order('id', { ascending: true })).then((d) => ({ data: d })),
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
  const haMais = (count ?? 0) > comentarios.length

  return (
    <div className="space-y-6">
      <CabecalhoArea titulo="Comentários" descricao={`Moderação de comentários dos alunos — ${pendentes} pendente(s) de ${comentarios.length}${haMais ? ` (mostrando ${comentarios.length} de ${count})` : ''}.`} />

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
