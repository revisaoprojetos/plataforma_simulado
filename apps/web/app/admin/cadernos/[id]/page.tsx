import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernoEditor } from '@/components/admin/caderno-editor'
import { ArrowLeft } from 'lucide-react'

export default async function CadernoEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const { data: caderno } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, config')
    .eq('id', id)
    .eq('tenant_id', access.tenantId ?? '')
    .maybeSingle()
  if (!caderno) notFound()

  // Questões publicadas disponíveis (para o seletor).
  const { data: questoes } = await svc
    .from('simulado_questoes')
    .select('id, enunciado, tipo, disciplina_id')
    .eq('tenant_id', access.tenantId ?? '')
    .eq('status', 'publicada')
    .order('created_at', { ascending: false })
    .limit(300)

  const discIds = [...new Set((questoes ?? []).map((q: any) => q.disciplina_id).filter(Boolean))]
  const { data: discs } = discIds.length
    ? await svc.from('simulado_disciplinas').select('id, nome').in('id', discIds)
    : { data: [] as any[] }
  const discMap = new Map((discs ?? []).map((d: any) => [d.id, d.nome]))

  const disponiveis = (questoes ?? []).map((q: any) => ({
    id: q.id,
    enunciado: q.enunciado ?? '',
    tipo: q.tipo,
    disciplina: discMap.get(q.disciplina_id) ?? null,
  }))

  return (
    <div className="space-y-5">
      <Link href="/admin/cadernos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Cadernos de prova
      </Link>
      <CadernoEditor
        cadernoId={caderno.id}
        nome={caderno.nome}
        configInicial={caderno.config ?? { blocos: [] }}
        questoesDisponiveis={disponiveis}
      />
    </div>
  )
}
