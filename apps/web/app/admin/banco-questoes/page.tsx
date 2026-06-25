import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Pencil, Star, Plus } from 'lucide-react'
import { BancoQuestoesSearch } from '@/components/admin/banco-questoes-search'

interface PageProps {
  searchParams: Promise<{
    q?: string
    banca?: string
    disciplina?: string
    dificuldade?: string
    page?: string
  }>
}

const dificuldadeConfig: Record<string, { label: string; class: string }> = {
  facil: { label: 'Fácil', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  medio: { label: 'Médio', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  dificil: { label: 'Difícil', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

export default async function BancoQuestoesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()

  const [{ data: bancas }, { data: disciplinas }] = await Promise.all([
    supabase.from('bancas').select('id, nome').order('nome'),
    supabase.from('disciplinas').select('id, nome').order('nome'),
  ])

  let query = supabase
    .from('questoes')
    .select(`
      id, enunciado, tipo, nivel_dificuldade, ano, status,
      bancas(id, nome),
      orgaos(id, nome),
      disciplinas(id, nome),
      assuntos(id, nome)
    `)
    .eq('status', 'publicada')
    .order('criado_em', { ascending: false })
    .limit(30)

  if (params.q) {
    query = query.ilike('enunciado', `%${params.q}%`)
  }
  if (params.banca) {
    query = query.eq('banca_id', params.banca)
  }
  if (params.disciplina) {
    query = query.eq('disciplina_id', params.disciplina)
  }
  if (params.dificuldade) {
    query = query.eq('nivel_dificuldade', params.dificuldade)
  }

  const { data: questoes } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banco de Questões</h1>
          <p className="text-muted-foreground">
            Explore, filtre e gerencie todas as questões publicadas
          </p>
        </div>
        <Button render={<Link href="/admin/questoes/nova" />}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Questão
        </Button>
      </div>

      {/* Filters sidebar layout */}
      <div className="flex gap-6">
        {/* Sidebar de filtros */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">Filtros</h3>
            <BancoQuestoesSearch
              bancas={bancas ?? []}
              disciplinas={disciplinas ?? []}
            />
          </div>
        </aside>

        {/* Cards de questões */}
        <div className="flex-1 space-y-3">
          {!questoes || questoes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground">Nenhuma questão encontrada com os filtros selecionados.</p>
            </div>
          ) : (
            questoes.map((q: any) => {
              const difCfg = dificuldadeConfig[q.nivel_dificuldade ?? '']
              const enunciado = (q.enunciado as string) ?? ''
              const preview = enunciado.length > 150 ? enunciado.slice(0, 150) + '…' : enunciado

              return (
                <Card key={q.id} className="group">
                  <CardContent className="p-4">
                    {/* Header da questão */}
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {q.bancas?.nome && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                          {q.bancas.nome}
                        </span>
                      )}
                      {q.orgaos?.nome && (
                        <span>{q.orgaos.nome}</span>
                      )}
                      {q.ano && <span>{q.ano}</span>}
                      {q.disciplinas?.nome && (
                        <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5">
                          {q.disciplinas.nome}
                        </span>
                      )}
                      {q.assuntos?.nome && <span>{q.assuntos.nome}</span>}
                      {difCfg && (
                        <span className={`rounded px-1.5 py-0.5 font-medium ${difCfg.class}`}>
                          {difCfg.label}
                        </span>
                      )}
                    </div>

                    {/* Enunciado */}
                    <p className="text-sm leading-relaxed">{preview}</p>

                    {/* Actions */}
                    <div className="mt-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="outline" size="sm" render={<Link href={`/admin/questoes/${q.id}/editar`} />}>
                        <Pencil className="mr-1.5 h-3 w-3" />
                        Editar
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Favoritar">
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
