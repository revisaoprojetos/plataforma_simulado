import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RemoverQuestaoBanco } from '@/components/admin/remover-questao-banco'
import { BancoEstudantes } from '@/components/admin/banco-estudantes'
import { BancoCaderno } from '@/components/admin/banco-caderno'
import { BancoRelatorio } from '@/components/admin/banco-relatorio'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'

// Sempre fresco: questões, estudantes vinculados e relatório mudam e não podem ficar em cache.
export const dynamic = 'force-dynamic'
import { BancoQuestoesTable } from '@/components/admin/banco-questoes-table'
import { BancoGrupos } from '@/components/admin/banco-grupos'
import { BancoPersonalizar } from '@/components/admin/banco-personalizar'
import { iconeBanco } from '@/lib/banco-visual'
import type { GrupoBanco } from '@/app/admin/banco-questoes/actions'
import { ArrowLeft, BookOpen, Layers, Palette, ListTree } from 'lucide-react'

/** Cabeçalho de seção com gradiente da cor do banco + chip de ícone (colado no topo do card). */
function CabecalhoSecao({ icon: Icon, titulo, subtitulo, cor }: { icon: React.ComponentType<{ className?: string }>; titulo: string; subtitulo: string; cor: string }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><Icon className="h-5 w-5" /></span>
      <div>
        <h3 className="text-sm font-semibold leading-tight">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{subtitulo}</p>
      </div>
    </div>
  )
}

export default async function BancoDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const abaInicial = (await searchParams).tab ?? 'visao'
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  // Banco + personalização (cor/ícone/capa) — tolerante caso a migration ainda não tenha rodado.
  let banco: any = null
  {
    const r = await svc.from('simulado_pastas').select('id, nome, cor, icone, capa_url, capa_card_url, pai_id').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
    if (r.error && /cor|icone|capa_url|capa_card_url|pai_id|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_pastas').select('id, nome').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
      banco = r2.data
    } else banco = r.data
  }
  if (!banco) notFound()

  const { data: vinculos } = await svc
    .from('simulado_questao_pasta')
    .select('questao_id')
    .eq('pasta_id', id)
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
  const ids = (vinculos ?? []).map((v: any) => v.questao_id)

  let questoes: any[] = []
  if (ids.length) {
    const { data } = await svc
      .from('simulado_questoes')
      .select('id, enunciado, tipo, nivel_dificuldade, status, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
      .in('id', ids)
      // Ordem de leitura (a 1ª questão importada aparece primeiro). Import insere 1→100
      // com created_at crescente; ASC preserva a ordem do CSV. `ordem_questoes` (abaixo)
      // ainda sobrepõe quando o admin reordena manualmente.
      .order('created_at', { ascending: true })
    questoes = data ?? []
  }

  // Ordem manual das questões no banco (tolerante: coluna pode não existir até a migration).
  let ordemQuestoes: string[] = []
  {
    const { data: oRow, error: oErr } = await svc.from('simulado_pastas').select('ordem_questoes').eq('id', id).maybeSingle()
    if (!oErr && Array.isArray((oRow as any)?.ordem_questoes)) ordemQuestoes = (oRow as any).ordem_questoes
  }
  if (ordemQuestoes.length && questoes.length) {
    const pos = new Map(ordemQuestoes.map((qid, i) => [qid, i]))
    const FIM = Number.MAX_SAFE_INTEGER
    questoes = [...questoes].sort((a, b) => (pos.has(a.id) ? pos.get(a.id)! : FIM) - (pos.has(b.id) ? pos.get(b.id)! : FIM))
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
  const maxDisc = disc[0]?.[1] ?? 1
  const maxAss = ass[0]?.[1] ?? 1

  // Grupos de disciplinas do banco (tolerante: coluna pode não existir até rodar a migration).
  let gruposIniciais: GrupoBanco[] = []
  {
    const { data: gRow, error: gErr } = await svc.from('simulado_pastas').select('grupos').eq('id', id).maybeSingle()
    if (!gErr && Array.isArray((gRow as any)?.grupos)) gruposIniciais = (gRow as any).grupos
  }

  // Todas as questões do tenant (para o pop-up de adicionar) + disciplinas (filtro).
  const { data: todasRaw } = await svc
    .from('simulado_questoes')
    .select('id, external_id, enunciado, tipo, nivel_dificuldade, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
    .limit(500)
  const todasQuestoes = (todasRaw ?? []).map((q: any) => ({
    id: q.id, external_id: q.external_id, enunciado: q.enunciado ?? '', tipo: q.tipo,
    nivel_dificuldade: q.nivel_dificuldade, disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null,
  }))
  const disciplinasFiltro = [...new Set(todasQuestoes.map((q: any) => q.disciplina).filter(Boolean))].sort() as string[]

  const IconeBanco = iconeBanco(banco.icone)
  const corBanco = banco.cor ?? '#6d28d9'
  const capaBanco = banco.capa_url ?? null

  return (
    <div className="space-y-6">
      {/* HERO no estilo pôster (usa capa/cor/ícone do banco) */}
      <div className="relative overflow-hidden rounded-2xl border shadow-sm">
        {capaBanco ? (
          <img src={capaBanco} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${corBanco} 0%, #0f172a 130%)` }} />
        )}
        {!capaBanco && <IconeBanco className="absolute -right-8 -top-10 h-56 w-56 text-white/10" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />

        <div className="relative flex min-h-[172px] flex-col justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <Link href={banco.pai_id ? `/admin/banco-questoes?pasta=${banco.pai_id}` : '/admin/banco-questoes'} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-medium text-white/90 backdrop-blur transition-colors hover:bg-white/20">
              <ArrowLeft className="h-4 w-4" /> {banco.pai_id ? 'Pasta' : 'Bancos'}
            </Link>
            <Link href={`/admin/banco-questoes/${id}?tab=personalizar`} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-medium text-white/90 backdrop-blur transition-colors hover:bg-white/20">
              <Palette className="h-4 w-4" /> Personalizar
            </Link>
          </div>

          <div className="flex items-end gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ring-1 ring-white/20" style={{ background: corBanco }}>
              <IconeBanco className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Banco de questões</p>
              <h1 className="truncate text-2xl font-bold tracking-tight drop-shadow-sm" style={{ color: '#ffffff' }}>{banco.nome}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
                <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'}</span>
                <span className="text-white/40">·</span>
                <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {disc.length} disciplina(s)</span>
                <span className="text-white/40">·</span>
                <span>{ass.length} assunto(s)</span>
              </div>
            </div>
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
          <TabsTrigger value="personalizar">Personalizar</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          {/* Cards de estatística com gradiente da cor do banco */}
          <div className="stagger grid gap-3 sm:grid-cols-3">
            {[
              { icon: BookOpen, valor: questoes.length, label: 'Questões' },
              { icon: Layers, valor: disc.length, label: 'Disciplinas' },
              { icon: ListTree, valor: ass.length, label: 'Assuntos' },
            ].map((s, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="pointer-events-none absolute inset-0 opacity-[0.09]" style={{ background: `linear-gradient(135deg, ${corBanco} 0%, transparent 70%)` }} />
                <s.icon className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 opacity-[0.06]" style={{ color: corBanco }} />
                <div className="relative flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: corBanco }}><s.icon className="h-6 w-6" /></span>
                  <div>
                    <p className="text-3xl font-bold leading-none tracking-tight">{s.valor}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {([
              { titulo: 'Por disciplina', icon: Layers, dados: disc, max: maxDisc, col: 'Disciplina' },
              { titulo: 'Por assunto / conteúdo', icon: ListTree, dados: ass, max: maxAss, col: 'Assunto' },
            ] as const).map((sec) => (
              <Card key={sec.titulo} className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
                <CabecalhoSecao icon={sec.icon} titulo={sec.titulo} subtitulo={`Distribuição das questões · ${sec.dados.length}`} cor={corBanco} />
                {/* Tabela com scroll interno — não estica a página quando há muitas linhas. */}
                <CardContent className="p-0">
                  {sec.dados.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem questões.</p>
                  ) : (
                    <div className="max-h-[340px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-card">
                          <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-2 font-medium">{sec.col}</th>
                            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Questões</th>
                            <th className="w-[42%] px-4 py-2 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.dados.map(([nome, n], i) => {
                            const pct = Math.round((n / questoes.length) * 100)
                            return (
                              <tr key={nome} className="border-b last:border-0 hover:bg-muted/40">
                                <td className="px-4 py-2">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: corBanco }}>{i + 1}</span>
                                    <span className="truncate font-medium">{nome}</span>
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{n}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                      <div className="h-full rounded-full" style={{ width: `${(n / sec.max) * 100}%`, background: corBanco }} />
                                    </div>
                                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Grupos de disciplinas (usados nos relatórios por grupo) */}
          <BancoGrupos bancoId={id} disciplinas={disc.map(([nome]) => nome)} gruposIniciais={gruposIniciais} cor={corBanco} />
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
              cor={corBanco}
              acao={<AdicionarQuestoesDialog bancoId={id} questoes={todasQuestoes} jaNoBanco={ids} disciplinas={disciplinasFiltro} />}
              questoes={questoes.map((q: any) => ({
                id: q.id, enunciado: q.enunciado ?? '', nivel_dificuldade: q.nivel_dificuldade,
                status: q.status, disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null,
              }))}
            />
          )}
        </TabsContent>

        <TabsContent value="estudantes">
          <BancoEstudantes bancoId={id} cor={corBanco} />
        </TabsContent>

        <TabsContent value="caderno">
          <BancoCaderno bancoId={id} cor={corBanco} />
        </TabsContent>

        <TabsContent value="relatorio">
          <BancoRelatorio bancoId={id} cor={corBanco} />
        </TabsContent>

        <TabsContent value="personalizar">
          <BancoPersonalizar banco={{ id: banco.id, nome: banco.nome, cor: banco.cor ?? null, icone: banco.icone ?? null, capa_url: banco.capa_url ?? null, capa_card_url: banco.capa_card_url ?? null, total: questoes.length }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
