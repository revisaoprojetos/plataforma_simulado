import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { QuestaoResolvivel, type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { Star } from 'lucide-react'

export default async function AlunoFavoritosPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()

  const { data: favs } = await svc
    .from('simulado_favoritos')
    .select('questao_id, criado_em')
    .eq('estudante_id', sessao!.estudanteId)
    .order('criado_em', { ascending: false })

  const ids = (favs ?? []).map((f: any) => f.questao_id)

  const [{ data: questoes }, { data: alts }] = await Promise.all([
    ids.length ? svc.from('simulado_questoes').select('id, enunciado, disciplina_id, ano, comentario_professor').in('id', ids).eq('status', 'publicada') : Promise.resolve({ data: [] as any[] }),
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])

  const discIds = (questoes ?? []).map((x: any) => x.disciplina_id).filter(Boolean)
  const { data: discNomes } = discIds.length
    ? await svc.from('simulado_disciplinas').select('id, nome').in('id', discIds)
    : { data: [] as any[] }
  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))

  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) {
    const arr = altMap.get(a.questao_id) ?? []
    arr.push(a)
    altMap.set(a.questao_id, arr)
  }

  // Preserva a ordem dos favoritos (mais recentes primeiro).
  const qById = new Map((questoes ?? []).map((x: any) => [x.id, x]))
  const lista: QuestaoAluno[] = ids
    .map((id) => qById.get(id))
    .filter(Boolean)
    .map((x: any) => ({
      id: x.id,
      enunciado: x.enunciado ?? '',
      disciplina: discMap.get(x.disciplina_id) ?? null,
      ano: x.ano ?? null,
      comentario_professor: x.comentario_professor ?? null,
      favorito: true,
      alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
    }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Favoritos</h1>
        <p className="text-muted-foreground">{lista.length} questão(ões) salva(s).</p>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Star className="h-8 w-8" />
          <p className="text-sm">Você ainda não favoritou nenhuma questão. Marque a ⭐ no banco de questões.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((q, i) => <QuestaoResolvivel key={q.id} questao={q} numero={i + 1} />)}
        </div>
      )}
    </div>
  )
}
