import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Inbox, PenLine } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'

export default async function CorrecaoPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('correcao:corrigir') || access.permissions.includes('questoes:update')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Correção de discursivas</h1>
        <SemPermissao>Sem permissão para corrigir.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, questao_id, estudante_id, status, lock_expira_em, criado_em')
    .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    .in('status', ['pendente', 'em_correcao'])
    .order('criado_em', { ascending: true })
    .limit(100)

  const rows = data ?? []
  const qIds = [...new Set(rows.map((r: any) => r.questao_id))]
  const eIds = [...new Set(rows.map((r: any) => r.estudante_id))]
  const [{ data: questoes }, { data: estudantes }] = await Promise.all([
    qIds.length ? svc.from('simulado_questoes').select('id, enunciado').in('id', qIds) : Promise.resolve({ data: [] as any[] }),
    eIds.length ? svc.from('simulado_estudantes').select('id, nome').in('id', eIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const qMap = new Map((questoes ?? []).map((q: any) => [q.id, q.enunciado]))
  const eMap = new Map((estudantes ?? []).map((e: any) => [e.id, e.nome]))

  const fila = rows.map((r: any) => ({
    id: r.id,
    status: r.status,
    travada: r.status === 'em_correcao' && r.lock_expira_em && new Date(r.lock_expira_em) > new Date(),
    enunciado: qMap.get(r.questao_id) ?? '—',
    estudante: eMap.get(r.estudante_id) ?? 'Aluno',
    criado_em: r.criado_em,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Correção de discursivas</h1>
        <p className="text-muted-foreground">{fila.length} resposta(s) na fila.</p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={PenLine} titulo="Fila de correção" subtitulo={`${fila.length} resposta(s) na fila`} />
        <CardContent className="space-y-3 px-4 py-4">
          {fila.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">Nenhuma resposta para corrigir.</p>
            </div>
          ) : (
            fila.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.estudante}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.enunciado}</p>
                </div>
                {f.travada && <Badge variant="secondary">em correção</Badge>}
                <Link href={`/admin/correcao/${f.id}`} className={buttonVariants({ size: 'sm' })}>
                  <PenLine className="mr-1 h-3.5 w-3.5" /> Corrigir
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
