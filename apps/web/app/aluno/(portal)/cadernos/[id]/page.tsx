import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { questoesParaAluno, progressoCadernos } from '@/lib/aluno/cadernos-aluno'
import { R } from '@/lib/nova/rotas'
import { ArrowLeft, NotebookPen, BookOpen } from 'lucide-react'
import { RemoverDoCaderno } from './remover-do-caderno'

export const dynamic = 'force-dynamic'

export default async function CadernoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()

  const { data: caderno } = await svc
    .from('simulado_aluno_cadernos')
    .select('id, nome')
    .eq('id', id)
    .eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  if (!caderno) notFound()

  const { data: itens } = await svc
    .from('simulado_aluno_caderno_questoes')
    .select('questao_id, criado_em')
    .eq('caderno_id', id)
    .order('criado_em', { ascending: false })
  const ids = (itens ?? []).map((i: any) => i.questao_id as string)

  const [lista, prog] = await Promise.all([
    questoesParaAluno(svc, sessao.tenantId, sessao.estudanteId, ids),
    progressoCadernos(svc, sessao.tenantId, sessao.estudanteId, ids.map((q) => ({ caderno_id: id, questao_id: q }))),
  ])
  const p = prog[id] ?? { total: 0, resolvidas: 0 }
  const pct = p.total ? Math.round((p.resolvidas / p.total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Volta para Meus Cadernos (portal novo) — antes caía na lista antiga /aluno/cadernos. */}
      <Link href={R.cadernos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Meus Cadernos
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{caderno.nome}</h1>
        <p className="text-muted-foreground">
          {lista.length === 1 ? '1 questão' : `${lista.length} questões`} neste caderno
          {lista.length > 0 && <> · {p.resolvidas} resolvida{p.resolvidas === 1 ? '' : 's'} ({pct}%)</>}
        </p>
        {lista.length > 0 && (
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--gold, #F1C232)' }} />
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">Caderno vazio. No Banco de Questões, toque no ícone de caderno de uma questão para adicioná-la aqui.</p>
          <Link href="/aluno/questoes" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            <BookOpen className="h-4 w-4" /> Ir ao Banco de Questões
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((q, i) => (
            <div key={q.id} className="space-y-1">
              <div className="flex justify-end"><RemoverDoCaderno cadernoId={id} questaoId={q.id} /></div>
              <QuestaoCard questao={q} numero={i + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
