import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { carregarFavoritosAluno } from '@/lib/aluno/favoritos'
import { Star } from 'lucide-react'

export default async function AlunoFavoritosPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()

  const lista = await carregarFavoritosAluno(svc, sessao!.tenantId, sessao!.estudanteId)

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
          {lista.map((q, i) => <QuestaoCard key={q.id} questao={q} numero={i + 1} />)}
        </div>
      )}
    </div>
  )
}
