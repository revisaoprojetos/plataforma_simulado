import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

/**
 * Feed de atividade para o sino do admin: alunos que finalizaram simulados
 * recentemente no tenant atual. (Notificações do aluno ficam em
 * simulado_notificacoes, que é escopada por estudante e usada quando houver
 * portal/e-mail do aluno.)
 */
export async function GET() {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('simulados:view'))) {
    return NextResponse.json({ items: [] })
  }

  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_sessoes_prova')
    .select('id, finalizado_em, nota, estudantes:simulado_estudantes(nome), simulados:simulado_simulados(titulo)')
    .eq('tenant_id', access.tenantId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .not('finalizado_em', 'is', null)
    .order('finalizado_em', { ascending: false })
    .limit(20)

  const items = (data ?? []).map((s: any) => ({
    id: s.id,
    titulo: `${s.estudantes?.nome ?? 'Aluno'} finalizou um simulado`,
    descricao: `${s.simulados?.titulo ?? 'Simulado'} · nota ${(s.nota ?? 0).toFixed(1)}`,
    em: s.finalizado_em as string,
  }))

  return NextResponse.json({ items })
}
