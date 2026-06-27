import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Star, ClipboardList, NotebookPen, ArrowRight, Sparkles } from 'lucide-react'

export default async function AlunoHome() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()

  const [{ count: simulados }, { count: favoritos }] = await Promise.all([
    svc.from('simulado_sessoes_prova').select('*', { count: 'exact', head: true })
      .eq('estudante_id', sessao!.estudanteId).eq('status', 'finalizada').eq('is_teste', false),
    svc.from('simulado_favoritos').select('*', { count: 'exact', head: true })
      .eq('estudante_id', sessao!.estudanteId),
  ])

  const atalhos = [
    { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões focadas nos seus pontos fracos' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', desc: 'Pratique questões avulsas com filtros' },
    { href: '/aluno/favoritos', icon: Star, titulo: 'Favoritos', desc: 'Questões que você marcou' },
    { href: '/aluno/cadernos', icon: NotebookPen, titulo: 'Cadernos', desc: 'Organize seus estudos' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Olá, {sessao!.nome.split(' ')[0]} 👋</h1>
        <p className="text-muted-foreground">Bem-vindo à sua área de estudos.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{simulados ?? 0}</div>
              <div className="text-xs text-muted-foreground">Simulados concluídos</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{favoritos ?? 0}</div>
              <div className="text-xs text-muted-foreground">Questões favoritas</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <a.icon className="h-5 w-5 text-primary" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
