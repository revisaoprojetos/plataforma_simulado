import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'

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
  const svc = createAdminClient()

  // Notificações de SEGURANÇA (persistentes, lidas no servidor): só para quem tem seguranca:view.
  let segItems: any[] = []
  if (access.userId && accessCan(access, 'seguranca:view')) {
    const { data: ns } = await svc.from('seguranca_notificacoes').select('id, titulo, mensagem, severidade, link, lida, criado_em').order('criado_em', { ascending: false }).limit(30)
    segItems = (ns ?? []).map((n: any) => ({
      id: `seg-${n.id}`,
      tipo: 'seguranca' as const,
      nome: n.titulo as string,
      email: null,
      descricao: `Segurança (${n.severidade}) · ${n.mensagem ?? ''}`.trim(),
      em: n.criado_em as string,
      href: (n.link as string) || '/admin/seguranca',
      lida: !!n.lida,
    }))
  }

  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('simulados:view'))) {
    return NextResponse.json({ items: segItems })
  }

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

  const todos = [...segItems, ...items].sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime())
  return NextResponse.json({ items: todos })
}
