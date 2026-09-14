import { Suspense } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/tenant'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { resolverCardView } from '@/lib/card-view'
import { alternativasSaoCertoErrado } from '@/lib/simulado/formato'
import { BancoPersonalizar } from '@/components/admin/banco-personalizar'
import { PrepararConteudoSimulado } from '@/components/admin/preparar-conteudo-simulado'
import { BancoTabsShell } from '@/components/admin/banco-tabs-shell'
import { BancoCadernoTeste } from '@/components/admin/banco-caderno-teste'
import { BancoHud } from '@/components/admin/banco-hud'
import { BancoGrupos } from '@/components/admin/banco-grupos'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SimuladoForm } from '@/components/admin/simulado-form'
import { SimuladoActions } from '@/components/admin/simulado-actions'
import { SimuladoQuestoesTable } from '@/components/admin/simulado-questoes-table'
import { type QuestaoLinha } from '@/components/admin/questoes-tabela-base'
import { listarDisciplinasFiltro, type GrupoBanco } from '@/app/admin/banco-questoes/actions'
import { SimuladoEstudantes } from '@/components/admin/simulado-estudantes'
import { SimuladoSessoes } from '@/components/admin/simulado-sessoes'
import { SimuladoManutencao } from '@/components/admin/simulado-manutencao'
import { SimuladoRelatorio } from '@/components/admin/simulado-relatorio'
import { SimuladoRecorrecao } from '@/components/admin/simulado-recorrecao'
import { SimuladoAcessos } from '@/components/admin/simulado-acessos'
import { SimuladoLiberacoes } from '@/components/admin/simulado-liberacoes'
import { CopyLink } from '@/components/admin/copy-link'
import { updateSimuladoAction, listarSessoesSimulado } from '../actions'
import Link from 'next/link'
import { ChevronLeft, Code, Layers, CalendarClock, Clock, KeyRound, Link2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { isoParaBrtLocal } from '@/lib/brt'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const statusConfig: Record<string, { label: string; class: string }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground' },
  publicado: { label: 'Publicado', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  encerrado: { label: 'Encerrado', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
}

const ABAS = ['visao-geral', 'personalizar', 'questoes', 'caderno', 'hud', 'grupos', 'estudantes', 'sessoes', 'relatorio', 'recorrecao', 'acessos', 'manutencao', 'configuracoes'] as const

/** Esqueleto exibido enquanto a aba (Suspense) carrega seus dados. */
function AbaCarregando() {
  return (
    <div className="animate-pulse space-y-4 py-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-56 rounded-md bg-muted" />
        <div className="h-9 w-40 rounded-lg bg-muted" />
      </div>
      <div className="h-10 w-full rounded-lg bg-muted/70" />
      <div className="space-y-2 rounded-xl border p-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 w-full rounded-md bg-muted/60" />)}
      </div>
    </div>
  )
}

export default async function SimuladoDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const tabParam = (await searchParams).tab
  const aba = (ABAS as readonly string[]).includes(tabParam ?? '') ? (tabParam as string) : 'visao-geral'
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  const { data: simulado } = await supabase
    .from('simulado_simulados')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tid)
    .maybeSingle()

  if (!simulado) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/simulados"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para Simulados
        </Link>
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <h2 className="text-lg font-semibold">Simulado não encontrado</h2>
            <p className="text-sm text-muted-foreground">
              Este simulado não existe ou foi removido. O link pode estar desatualizado.
            </p>
            <Link href="/admin/simulados" className={buttonVariants({ variant: 'outline' }) + ' mt-2'}>
              Ver todos os simulados
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const modoLabelMap: Record<string, string> = {
    janela_fixa: 'Janela fixa',
    prazo_relativo: 'Prazo relativo',
    aberto: 'Aberto',
  }
  const metodoLabelMap: Record<string, string> = {
    email: 'Somente e-mail',
    email_cpf: 'E-mail + CPF',
    email_telefone: 'E-mail + telefone',
  }

  // Base (sempre): questões (p/ tipo + nomes de disciplina) e sessões (contagem + nota média).
  // fetchAll nas questões para NÃO truncar em 1000 numa prova grande; a contagem vem por head count.
  const [questoes, { count: totalQuestoes }, { data: sessoes, count: totalSessoes }] = await Promise.all([
    fetchAll<any>(() =>
      supabase
        .from('simulado_prova_questoes')
        .select(`
          id, ordem, peso, anulada,
          questoes:simulado_questoes(id, tipo, enunciado, nivel_dificuldade, status, ano, assunto_detalhe, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome))
        `)
        .eq('simulado_id', id)
        .eq('tenant_id', tid)
        .order('ordem')),
    supabase
      .from('simulado_prova_questoes')
      .select('id', { count: 'exact', head: true })
      .eq('simulado_id', id)
      .eq('tenant_id', tid),
    supabase
      .from('simulado_sessoes_prova')
      .select(`id, status, nota, iniciado_em, finalizado_em, is_teste`, { count: 'exact' })
      .eq('simulado_id', id)
      .eq('deletado', false)
      .order('iniciado_em', { ascending: false })
      .limit(50),
  ])

  const tipoSim = tipoDoSimulado((questoes ?? []).map((sq: any) => sq.questoes?.tipo))
  const sessoesFinalizadas = sessoes?.filter((s) => s.status === 'finalizada') ?? []
  const notaMedia =
    sessoesFinalizadas.length > 0
      ? sessoesFinalizadas.reduce((acc, s) => acc + (s.nota ?? 0), 0) / sessoesFinalizadas.length
      : null
  const statusCfg = statusConfig[simulado.status] ?? statusConfig.rascunho
  const bancoBaseId = (simulado.regras as { banco_base_id?: string } | null)?.banco_base_id ?? null

  // ── Visual do banco container (capa/cor/card) — resolvido por banco_base_id. Só nas abas de conteúdo.
  // Na aba Grupos, traz também `grupos` na MESMA query (evita 2ª round-trip à mesma linha).
  const abasConteudo = ['personalizar', 'questoes', 'caderno', 'hud', 'grupos']
  let bancoVisual: { id: string; cor: string | null; icone: string | null; capa_url: string | null; capa_card_url: string | null } | null = null
  let gruposIniciais: GrupoBanco[] = []
  let disciplinasGrupos: string[] = []
  if (bancoBaseId && abasConteudo.includes(aba)) {
    const svcAdmin = createAdminClient()
    const colsBase = 'id, cor, icone, capa_url, capa_card_url, is_folder, deletado'
    const cols = aba === 'grupos' ? `${colsBase}, grupos` : colsBase
    const r = await svcAdmin.from('simulado_pastas').select(cols).eq('id', bancoBaseId).eq('tenant_id', tid).maybeSingle()
    let row: Record<string, any> | null = r.data as any
    if (r.error && /cor|icone|capa_url|capa_card_url|is_folder|deletado|grupos|column/i.test(r.error.message)) {
      row = (await svcAdmin.from('simulado_pastas').select('id').eq('id', bancoBaseId).eq('tenant_id', tid).maybeSingle()).data as any
    }
    if (row && !row.deletado && row.is_folder !== true) bancoVisual = { id: row.id, cor: row.cor ?? null, icone: row.icone ?? null, capa_url: row.capa_url ?? null, capa_card_url: row.capa_card_url ?? null }
    if (aba === 'grupos') {
      gruposIniciais = Array.isArray((row as any)?.grupos) ? (row as any).grupos as GrupoBanco[] : []
      disciplinasGrupos = [...new Set((questoes ?? []).map((sq: any) => sq.questoes?.disciplinas?.nome).filter(Boolean))] as string[]
    }
  }

  // ── cardView (espelha o console) — só na aba Personalizar.
  let cardView = resolverCardView(undefined)
  if (aba === 'personalizar') {
    const temaAdmin = (((await getCurrentTenant())?.tema as Record<string, unknown> | null) ?? {})
    cardView = resolverCardView((temaAdmin.card_view_admin ?? temaAdmin.card_view) as string | undefined)
  }

  // ── Questões: linha rica da TABELA BASE (só na aba). C/E vem das alternativas.
  let questoesLinha: QuestaoLinha[] = []
  let disciplinasFiltro: { id: string; nome: string }[] = []
  if (aba === 'questoes') {
    const ceSet = new Set<string>()
    const qids = (questoes ?? []).map((sq: any) => sq.questoes?.id).filter(Boolean) as string[]
    const [alts, discs] = await Promise.all([
      qids.length ? fetchAllByIn<any>(qids, (chunk) => supabase.from('simulado_alternativas').select('questao_id, texto').in('questao_id', chunk)) : Promise.resolve([]),
      listarDisciplinasFiltro(),
    ])
    disciplinasFiltro = discs
    const textos = new Map<string, string[]>()
    for (const a of alts) { const arr = textos.get(a.questao_id) ?? []; arr.push(a.texto ?? ''); textos.set(a.questao_id, arr) }
    for (const [qid, ts] of textos) if (alternativasSaoCertoErrado(ts)) ceSet.add(qid)
    questoesLinha = (questoes ?? []).map((sq: any) => {
      const q = sq.questoes ?? {}
      return {
        id: q.id, enunciado: q.enunciado ?? '', tipo: q.tipo ?? null,
        formato: q.tipo === 'discursiva' ? null : (ceSet.has(q.id) ? 'certo_errado' : 'multipla'),
        nivel_dificuldade: q.nivel_dificuldade ?? null, status: q.status ?? null,
        disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null,
        assuntoDetalhe: q.assunto_detalhe ?? null, banca: q.bancas?.nome ?? null, orgao: q.orgaos?.nome ?? null, ano: q.ano ?? null,
      }
    }).filter((q: QuestaoLinha) => q.id)
  }

  // ── Sessões (todas, com nome do aluno) — só na aba.
  const sessoesTab = aba === 'sessoes' ? ((await listarSessoesSimulado(id)).sessoes ?? []) : []

  function formatDate(date: string | null) {
    if (!date) return '—'
    // Sempre no horário de Brasília, independente do fuso do servidor.
    const s = isoParaBrtLocal(date)
    if (!s) return '—'
    const [d, t] = s.split('T')
    const [y, mo, da] = d.split('-')
    return `${da}/${mo}/${y} às ${t} (Brasília)`
  }

  const initialFormData = {
    titulo: simulado.titulo,
    descricao: simulado.descricao ?? undefined,
    modo_aplicacao: simulado.modo_aplicacao,
    // Banco guarda UTC; o form edita em horário de Brasília.
    data_inicio: simulado.data_inicio ? isoParaBrtLocal(simulado.data_inicio) : undefined,
    data_fim: simulado.data_fim ? isoParaBrtLocal(simulado.data_fim) : undefined,
    tempo_limite_min: simulado.tempo_limite_min ?? undefined,
    metodo_identificacao: simulado.metodo_identificacao ?? undefined,
    embed_ativo: simulado.embed_ativo ?? false,
    regras: simulado.regras ?? undefined,
  }

  const semBancoCTA = (o: string) => (
    <PrepararConteudoSimulado simuladoId={id} descricao={o} />
  )

  return (
    <BancoTabsShell value={aba}>
      {/* Cabeçalho + abas — fixos no topo ao rolar o conteúdo */}
      <div className="sticky -top-6 z-40 -mx-6 -mt-6 space-y-3 border-b bg-background px-6 pb-3 pt-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href={(simulado as any).pasta_id ? `/admin/simulados?pasta=${(simulado as any).pasta_id}` : '/admin/simulados'}
              className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {(simulado as any).pasta_id ? 'Voltar para a pasta' : 'Voltar para Simulados'}
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{simulado.titulo}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>
                {statusCfg.label}
              </span>
              <TipoSimuladoBadge tipo={tipoSim} />
            </div>
          </div>
          <SimuladoActions simuladoId={id} status={simulado.status} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <TabsList className="max-w-full flex-nowrap overflow-x-auto">
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="personalizar">Personalizar</TabsTrigger>
            <TabsTrigger value="questoes">Questões ({totalQuestoes ?? 0})</TabsTrigger>
            <TabsTrigger value="caderno">Caderno</TabsTrigger>
            <TabsTrigger value="hud">HUD</TabsTrigger>
            <TabsTrigger value="grupos">Grupos</TabsTrigger>
            <TabsTrigger value="estudantes">Estudantes</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões ({totalSessoes ?? 0})</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
            <TabsTrigger value="recorrecao">Re-correção</TabsTrigger>
            <TabsTrigger value="acessos">Acessos</TabsTrigger>
            <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          </TabsList>
          <Link href={`/admin/simulados/${id}/embed`} className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' shrink-0'}>
            <Code className="mr-2 h-3.5 w-3.5" />
            Embed
          </Link>
        </div>
      </div>

      <div className="pt-6">
        {/* Visão Geral */}
        <TabsContent value="visao-geral" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total de Sessões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSessoes ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Finalizadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sessoesFinalizadas.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Nota Média</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {notaMedia !== null ? notaMedia.toFixed(1) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Questões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalQuestoes ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Início e Acesso</CardTitle>
              <CardDescription>
                Como e quando os alunos realizam este simulado, e o link de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Informações de aplicação */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" /> Modo de aplicação
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {modoLabelMap[simulado.modo_aplicacao] ?? simulado.modo_aplicacao}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Disponibilidade
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {simulado.modo_aplicacao === 'aberto'
                      ? 'Sempre disponível'
                      : simulado.modo_aplicacao === 'prazo_relativo'
                      ? 'Liberado por aluno após a matrícula'
                      : simulado.data_inicio || simulado.data_fim
                      ? `${formatDate(simulado.data_inicio)} → ${formatDate(simulado.data_fim)}`
                      : 'Janela fixa — defina as datas'}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Tempo limite
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {simulado.tempo_limite_min ? `${simulado.tempo_limite_min} min` : 'Sem limite'}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5" /> Identificação
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {metodoLabelMap[simulado.metodo_identificacao] ?? 'Somente e-mail'}
                  </div>
                </div>
              </div>

              {/* Link de acesso do aluno */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Link2 className="h-4 w-4" /> Link de acesso do aluno
                </div>
                {simulado.status !== 'publicado' ? (
                  <p className="text-sm text-muted-foreground">
                    Publique o simulado (botão acima) para liberar o link de acesso aos alunos.
                  </p>
                ) : simulado.embed_token ? (
                  <>
                    <CopyLink url={`${appUrl}/aluno/login?token=${simulado.embed_token}`} />
                    <p className="text-xs text-muted-foreground">
                      O aluno entra com {(metodoLabelMap[simulado.metodo_identificacao] ?? 'somente e-mail').toLowerCase()} e precisa ter matrícula ativa neste simulado.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Token de acesso indisponível.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Liberações para o aluno</CardTitle>
              <CardDescription>
                Controle o que cada aluno vê. Os modos vêm da configuração; aqui você libera ou bloqueia manualmente a qualquer momento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SimuladoLiberacoes
                simuladoId={id}
                regras={simulado.regras as any}
                status={simulado.status}
                dataFim={simulado.data_fim}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personalizar — capa/cor/card do simulado (opera no banco container) */}
        <TabsContent value="personalizar">
          {aba === 'personalizar' && (bancoVisual ? (
            <BancoPersonalizar
              banco={{ id: bancoVisual.id, nome: simulado.titulo, cor: bancoVisual.cor, icone: bancoVisual.icone, capa_url: bancoVisual.capa_url, capa_card_url: bancoVisual.capa_card_url, total: totalQuestoes ?? 0 }}
              cardView={cardView}
              titulo="Personalizar simulado"
              subtitulo="Capa, cor e imagem do card do simulado"
              badge="Simulado"
              mostrarNome={false}
            />
          ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para editar a capa, a cor e a imagem do card aqui mesmo.'))}
        </TabsContent>

        {/* Questões — tabela rica com filtros/reordenar/adicionar/importar (opera na prova) */}
        <TabsContent value="questoes" className="space-y-4">
          {aba === 'questoes' && (
            <SimuladoQuestoesTable
              simuladoId={id}
              bancoId={bancoBaseId}
              questoes={questoesLinha}
              disciplinas={disciplinasFiltro}
              cor={bancoVisual?.cor ?? undefined}
            />
          )}
        </TabsContent>

        {/* Caderno — folha/enunciado/gabarito de entrega (opera no banco container) */}
        <TabsContent value="caderno">
          {aba === 'caderno' && (bancoBaseId ? (
            <Suspense fallback={<AbaCarregando />}>
              <BancoCadernoTeste bancoId={bancoBaseId} cor={bancoVisual?.cor ?? undefined} />
            </Suspense>
          ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para montar a folha de respostas e os cadernos aqui mesmo.'))}
        </TabsContent>

        {/* HUD — tema visual da prova (opera no banco container) */}
        <TabsContent value="hud">
          {aba === 'hud' && (bancoBaseId ? (
            <Suspense fallback={<AbaCarregando />}>
              <BancoHud bancoId={bancoBaseId} cor={bancoVisual?.cor ?? undefined} editHref={`/admin/simulados/${id}/hud`} />
            </Suspense>
          ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para configurar o HUD da prova aqui mesmo.'))}
        </TabsContent>

        {/* Grupos de disciplinas (usados nos relatórios por grupo) */}
        <TabsContent value="grupos">
          {aba === 'grupos' && (bancoBaseId ? (
            <BancoGrupos bancoId={bancoBaseId} disciplinas={disciplinasGrupos} gruposIniciais={gruposIniciais} cor={bancoVisual?.cor ?? undefined} subtitulo="Agrupe as disciplinas do simulado — salvas automaticamente." textoVazio="O simulado ainda não tem disciplinas." />
          ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para agrupar as disciplinas aqui mesmo.'))}
        </TabsContent>

        {/* Estudantes linkados (matriculados) */}
        <TabsContent value="estudantes">
          {aba === 'estudantes' && (
            <Card>
              <CardHeader>
                <CardTitle>Estudantes do Simulado</CardTitle>
                <CardDescription>Todos os estudantes matriculados (linkados) neste simulado, com busca, filtros e ordenação.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimuladoEstudantes simuladoId={id} acessoGratuitoInicial={!!(simulado.regras as { acesso_gratuito?: boolean } | null)?.acesso_gratuito} bancoBaseId={bancoBaseId} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Sessões */}
        <TabsContent value="sessoes">
          {aba === 'sessoes' && (
            <Card>
              <CardHeader>
                <CardTitle>Sessões de Prova</CardTitle>
                <CardDescription>Todas as sessões deste simulado, com busca, filtros e ordenação.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimuladoSessoes sessoes={sessoesTab} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="relatorio">
          {aba === 'relatorio' && <SimuladoRelatorio simuladoId={id} />}
        </TabsContent>

        <TabsContent value="recorrecao">
          {aba === 'recorrecao' && <SimuladoRecorrecao simuladoId={id} />}
        </TabsContent>

        <TabsContent value="acessos">
          {aba === 'acessos' && <SimuladoAcessos simuladoId={id} modoAplicacao={simulado.modo_aplicacao} />}
        </TabsContent>

        <TabsContent value="manutencao">
          {aba === 'manutencao' && <SimuladoManutencao simuladoId={id} inicial={(simulado.regras as any)?.manutencao ?? null} />}
        </TabsContent>

        <TabsContent value="configuracoes">
          {aba === 'configuracoes' && (
            <SimuladoForm
              initialData={initialFormData as any}
              onSubmit={updateSimuladoAction.bind(null, id)}
            />
          )}
        </TabsContent>
      </div>
    </BancoTabsShell>
  )
}
