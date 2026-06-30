import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { RemoverQuestaoBanco } from '@/components/admin/remover-questao-banco'
import { BancoEstudantes } from '@/components/admin/banco-estudantes'
import { BancoCaderno } from '@/components/admin/banco-caderno'
import { BancoRelatorio } from '@/components/admin/banco-relatorio'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { BancoQuestoesTable } from '@/components/admin/banco-questoes-table'
import { ArrowLeft, Plus, BookOpen, Layers } from 'lucide-react'

export default async function BancoDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const abaInicial = (await searchParams).tab ?? 'visao'
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: banco } = await svc
    .from('simulado_pastas')
    .select('id, nome')
    .eq('id', id)
    .eq('tenant_id', tenantId ?? '')
    .maybeSingle()
  if (!banco) notFound()

  const { data: vinculos } = await svc
    .from('simulado_questao_pasta')
    .select('questao_id')
    .eq('pasta_id', id)
    .eq('tenant_id', tenantId ?? '')
  const ids = (vinculos ?? []).map((v: any) => v.questao_id)

  let questoes: any[] = []
  if (ids.length) {
    const { data } = await svc
      .from('simulado_questoes')
      .select('id, enunciado, tipo, nivel_dificuldade, status, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
      .in('id', ids)
      .order('created_at', { ascending: false })
    questoes = data ?? []
  }

  // Agregações por disciplina e assunto.
  const porDisciplina = new Map<string, number>()
  const porAssunto = new Map<string, number>()
  for (const q of questoes) {
    const d = q.disciplinas?.nome ?? 'Sem disciplina'
    porDisciplina.set(d, (porDisciplina.get(d) ?? 0) + 1)
    const a = q.assuntos?.nome ?? 'Sem assunto'
    porAssunto.set(a, (porAssunto.get(a) ?? 0) + 1)
  }
  const disc = [...porDisciplina.entries()].sort((a, b) => b[1] - a[1])
  const ass = [...porAssunto.entries()].sort((a, b) => b[1] - a[1])

  // Todas as questões do tenant (para o pop-up de adicionar) + disciplinas (filtro).
  const { data: todasRaw } = await svc
    .from('simulado_questoes')
    .select('id, external_id, enunciado, tipo, nivel_dificuldade, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
    .eq('tenant_id', tenantId ?? '')
    .order('created_at', { ascending: false })
    .limit(500)
  const todasQuestoes = (todasRaw ?? []).map((q: any) => ({
    id: q.id, external_id: q.external_id, enunciado: q.enunciado ?? '', tipo: q.tipo,
    nivel_dificuldade: q.nivel_dificuldade, disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null,
  }))
  const disciplinasFiltro = [...new Set(todasQuestoes.map((q: any) => q.disciplina).filter(Boolean))].sort() as string[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/banco-questoes" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{banco.nome}</h1>
          </div>
        </div>
      </div>

      <Tabs defaultValue={abaInicial}>
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="questoes">Questões</TabsTrigger>
          <TabsTrigger value="estudantes">Estudantes</TabsTrigger>
          <TabsTrigger value="caderno">Caderno</TabsTrigger>
          <TabsTrigger value="relatorio">Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <BookOpen className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{questoes.length}</p>
                  <p className="text-xs text-muted-foreground">Questões</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Layers className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{disc.length}</p>
                  <p className="text-xs text-muted-foreground">Disciplinas</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Layers className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{ass.length}</p>
                  <p className="text-xs text-muted-foreground">Assuntos</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Por disciplina</CardTitle></CardHeader>
              <CardContent className="p-0">
                {disc.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sem questões.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {disc.map(([nome, n]) => (
                        <tr key={nome} className="border-t first:border-0">
                          <td className="px-4 py-2">{nome}</td>
                          <td className="px-4 py-2 text-right font-medium">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Por assunto / conteúdo</CardTitle></CardHeader>
              <CardContent className="p-0">
                {ass.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sem questões.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {ass.map(([nome, n]) => (
                        <tr key={nome} className="border-t first:border-0">
                          <td className="px-4 py-2">{nome}</td>
                          <td className="px-4 py-2 text-right font-medium">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="questoes" className="space-y-3">
          {questoes.length === 0 ? (
            <>
              <div className="flex justify-end">
                <AdicionarQuestoesDialog bancoId={id} questoes={todasQuestoes} jaNoBanco={ids} disciplinas={disciplinasFiltro} />
              </div>
              <div className="rounded-lg border border-dashed p-12 text-center">
                <p className="text-muted-foreground">Nenhuma questão neste banco. Clique em “Adicionar questões”.</p>
              </div>
            </>
          ) : (
            <BancoQuestoesTable
              bancoId={id}
              acao={<AdicionarQuestoesDialog bancoId={id} questoes={todasQuestoes} jaNoBanco={ids} disciplinas={disciplinasFiltro} />}
              questoes={questoes.map((q: any) => ({
                id: q.id, enunciado: q.enunciado ?? '', nivel_dificuldade: q.nivel_dificuldade,
                status: q.status, disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null,
              }))}
            />
          )}
        </TabsContent>

        <TabsContent value="estudantes">
          <BancoEstudantes bancoId={id} />
        </TabsContent>

        <TabsContent value="caderno">
          <BancoCaderno bancoId={id} />
        </TabsContent>

        <TabsContent value="relatorio">
          <BancoRelatorio bancoId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
