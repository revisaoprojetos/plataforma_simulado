import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { questoesParaAluno, progressoCadernos } from '@/lib/aluno/cadernos-aluno'
import { R } from '@/lib/nova/rotas'
import { linkLeitor } from '@/lib/aluno/caderno-marcacoes'
import { ArrowLeft, NotebookPen, BookOpen, MessageSquareQuote } from 'lucide-react'
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
  // Comentários de trecho salvos no caderno (já prontos no servidor; limite sensato). Tabela ausente
  // (migração pendente) → erro ignorado e a página segue só com as questões.
  const { data: comentariosRaw } = await svc
    .from('simulado_aluno_caderno_itens')
    .select('id, documento_id, titulo_documento, trecho, comentario, criado_em')
    .eq('tenant_id', sessao.tenantId)
    .eq('caderno_id', id)
    .eq('tipo', 'comentario')
    .order('criado_em', { ascending: false })
    .limit(200)
  const comentarios = (comentariosRaw ?? []) as { id: string; documento_id: string | null; titulo_documento: string | null; trecho: string | null; comentario: string | null; criado_em: string }[]
  const vazio = lista.length === 0 && comentarios.length === 0
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
          {lista.length === 1 ? '1 questão' : `${lista.length} questões`}
          {comentarios.length > 0 && <> · {comentarios.length === 1 ? '1 comentário' : `${comentarios.length} comentários`}</>} neste caderno
          {lista.length > 0 && <> · {p.resolvidas} resolvida{p.resolvidas === 1 ? '' : 's'} ({pct}%)</>}
        </p>
        {lista.length > 0 && (
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--gold, var(--pn-f1c232,#F1C232))' }} />
          </div>
        )}
      </div>

      {vazio ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">Caderno vazio. No Banco de Questões, toque no ícone de caderno de uma questão para adicioná-la aqui.</p>
          <Link href="/aluno/questoes" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            <BookOpen className="h-4 w-4" /> Ir ao Banco de Questões
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {comentarios.map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="flex justify-end"><RemoverDoCaderno cadernoId={id} itemId={c.id} /></div>
              <article className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
                {c.trecho && (
                  <blockquote className="border-l-4 border-primary bg-muted/40 py-1 pl-3 text-sm italic text-muted-foreground">“{c.trecho}”</blockquote>
                )}
                <p className="flex gap-2 whitespace-pre-wrap text-sm">
                  <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span>{c.comentario}</span>
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{c.titulo_documento || 'Material'}</span>
                  {c.documento_id && (
                    <Link href={linkLeitor(c.documento_id, null, `/aluno/cadernos/${id}`)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      <BookOpen className="h-3.5 w-3.5" /> Abrir no material
                    </Link>
                  )}
                </div>
              </article>
            </div>
          ))}
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
