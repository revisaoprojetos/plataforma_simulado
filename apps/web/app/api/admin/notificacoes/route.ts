import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

/**
 * Feed de atividade para o sino do admin: alunos que finalizaram simulados
 * recentemente no tenant atual. (Notificações do aluno ficam em
 * simulado_notificacoes, que é escopada por estudante e usada quando houver
 * portal/e-mail do aluno.)
 */
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('simulados:view'))) {
    return NextResponse.json({ items: [] })
  }

  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, simulado_id, finalizado_em, nota, estudantes:simulado_estudantes(nome, email), simulados:simulado_simulados(titulo)')
    .eq('tenant_id', access.tenantId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .not('finalizado_em', 'is', null)
    .order('finalizado_em', { ascending: false })
    .limit(100)

  const items = (data ?? []).map((s: any) => ({
    id: s.id,
    tipo: 'simulado_finalizado' as const,
    nome: s.estudantes?.nome ?? 'Aluno',
    email: s.estudantes?.email ?? null,
    descricao: `Finalizou ${s.simulados?.titulo ?? 'um simulado'} · nota ${(s.nota ?? 0).toFixed(1)}`,
    em: s.finalizado_em as string,
    // Leva o admin ao desempenho DAQUELE aluno NAQUELE simulado, já na tentativa desta sessão.
    href: (s.estudante_id && s.simulado_id) ? `/admin/estudantes/${s.estudante_id}/simulado/${s.simulado_id}?tentativa=${s.id}` : null,
  }))

  return NextResponse.json({ items })
}
