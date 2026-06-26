import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { ArrowLeft, NotebookPen } from 'lucide-react'

export default async function CadernoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()

  const { data: caderno } = await svc
    .from('simulado_aluno_cadernos')
    .select('id, nome')
    .eq('id', id)
    .eq('estudante_id', sessao!.estudanteId)
    .maybeSingle()
  if (!caderno) notFound()

  const { data: itens } = await svc
    .from('simulado_aluno_caderno_questoes')
    .select('questao_id, criado_em')
    .eq('caderno_id', id)
    .order('criado_em', { ascending: false })
  const ids = (itens ?? []).map((i: any) => i.questao_id)

  const [{ data: questoes }, { data: alts }, { data: favs }] = await Promise.all([
    ids.length ? svc.from('simulado_questoes').select('id, tipo, enunciado, disciplina_id, ano, comentario_professor').in('id', ids).eq('status', 'publicada') : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', sessao!.estudanteId).in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])

  const discIds = (questoes ?? []).map((x: any) => x.disciplina_id).filter(Boolean)
  const { data: discNomes } = discIds.length
    ? await svc.from('simulado_disciplinas').select('id, nome').in('id', discIds)
    : { data: [] as any[] }
  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))
  const favSet = new Set((favs ?? []).map((f: any) => f.questao_id))
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) {
    const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr)
  }
  const qById = new Map((questoes ?? []).map((x: any) => [x.id, x]))

  const lista: QuestaoAluno[] = ids.map((qid) => qById.get(qid)).filter(Boolean).map((x: any) => ({
    id: x.id,
    tipo: x.tipo,
    enunciado: x.enunciado ?? '',
    disciplina: discMap.get(x.disciplina_id) ?? null,
    ano: x.ano ?? null,
    comentario_professor: x.comentario_professor ?? null,
    favorito: favSet.has(x.id),
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))

  return (
    <div className="space-y-5">
      <Link href="/aluno/cadernos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Cadernos
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{caderno.nome}</h1>
        <p className="text-muted-foreground">{lista.length} questão(ões) neste caderno.</p>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">Caderno vazio. Adicione questões a partir do banco de questões.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((q, i) => <QuestaoCard key={q.id} questao={q} numero={i + 1} />)}
        </div>
      )}
    </div>
  )
}
