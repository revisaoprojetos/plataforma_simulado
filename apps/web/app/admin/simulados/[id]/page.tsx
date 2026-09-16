import { Suspense } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { resolverCardView } from '@/lib/card-view'
import { getTenantTheme } from '@/lib/tenant-theme'
import { Loader, type EstiloLoader } from '@/components/admin/loaders'
import { BancoPersonalizar } from '@/components/admin/banco-personalizar'
import { PrepararConteudoSimulado } from '@/components/admin/preparar-conteudo-simulado'
import { BancoTabsShell } from '@/components/admin/banco-tabs-shell'
import { BancoCadernoTeste } from '@/components/admin/banco-caderno-teste'
import { BancoHud } from '@/components/admin/banco-hud'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SimuladoForm } from '@/components/admin/simulado-form'
import { SimuladoActions } from '@/components/admin/simulado-actions'
import { SimuladoQuestoesData } from '@/components/admin/simulado-questoes-data'
import { simuladosDoBanco } from '@/lib/simulado/banco-do-simulado'
import { SimuladoEstudantesData } from '@/components/admin/simulado-estudantes-data'
import { SimuladoManutencao } from '@/components/admin/simulado-manutencao'
import { SimuladoRelatorio } from '@/components/admin/simulado-relatorio'
import { SimuladoLiberacoes } from '@/components/admin/simulado-liberacoes'
import { CopyLink } from '@/components/admin/copy-link'
import { updateSimuladoAction } from '../actions'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Home, Code, Layers, CalendarClock, Clock, KeyRound, Link2, AlertTriangle } from 'lucide-react'
import { ModuloBanner } from '@/components/admin/modulo-banner'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { isoParaBrtLocal } from '@/lib/brt'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; voltar?: string }>
}

const statusConfig: Record<string, { label: string; class: string }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground' },
  publicado: { label: 'Publicado', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  encerrado: { label: 'Encerrado', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
}

const ABAS = ['visao-geral', 'questoes', 'estudantes', 'caderno', 'hud', 'relatorio', 'manutencao', 'configuracoes'] as const

export default async function SimuladoDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const tabParam = sp.tab
  const voltarParam = sp.voltar
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
  // Loader configurado no tenant (mesma "linha que passa" do carregamento de rota) — usado nos
  // fallbacks de Suspense das abas, para a animação de carregamento ser consistente.
  const loaderEstilo = (((await getTenantTheme()).tema as Record<string, unknown> | null)?.loading_estilo as EstiloLoader) ?? 'skeleton'
  const fallbackAba = <Loader estilo={loaderEstilo} className="py-2" />

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

  // Base (sempre, LEVE): contagem de questões (head), sessões (contagem + nota p/ a Visão Geral) e só o
  // TIPO de cada questão (p/ o badge do cabeçalho). A carga RICA das questões (joins + alternativas) só
  // roda na aba Questões — não pesa as demais abas.
  const [{ count: totalQuestoes }, { data: sessoes, count: totalSessoes }, tiposRows] = await Promise.all([
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
    fetchAll<any>(() =>
      supabase.from('simulado_prova_questoes').select('questoes:simulado_questoes(tipo)').eq('simulado_id', id).eq('tenant_id', tid).order('ordem')),
  ])

  const tipoSim = tipoDoSimulado((tiposRows ?? []).map((sq: any) => sq.questoes?.tipo))
  const sessoesFinalizadas = sessoes?.filter((s) => s.status === 'finalizada') ?? []
  const notaMedia =
    sessoesFinalizadas.length > 0
      ? sessoesFinalizadas.reduce((acc, s) => acc + (s.nota ?? 0), 0) / sessoesFinalizadas.length
      : null
  const statusCfg = statusConfig[simulado.status] ?? statusConfig.rascunho
  const bancoBaseId = (simulado.regras as { banco_base_id?: string } | null)?.banco_base_id ?? null

  // ── Visual do banco container (capa/cor/card) — resolvido por banco_base_id. Só nas abas de conteúdo
  // (Questões/Caderno/HUD/Configurações — a personalização vive em Configurações).
  const abasConteudo = ['questoes', 'caderno', 'hud', 'configuracoes']
  let bancoVisual: { id: string; cor: string | null; icone: string | null; capa_url: string | null; capa_card_url: string | null } | null = null
  // Banner do topo (capa larga + cor do banco) — resolvido SEMPRE (query única barata) p/ o banner
  // aparecer em todas as abas, não só nas de conteúdo.
  let bannerCapa: string | null = null
  let bannerCor: string | null = null
  // Salvaguarda D1: normalmente o banco é 1:1 com o simulado. Se ele alimentar >1 simulado, editar o
  // CONTEÚDO aqui (questões/caderno/HUD/capa) afeta todos → avisa nas abas de conteúdo.
  let bancoCompartilhadoN = 1
  if (bancoBaseId) {
    const svcAdmin = createAdminClient()
    const r = await svcAdmin.from('simulado_pastas').select('id, cor, icone, capa_url, capa_card_url, is_folder, deletado').eq('id', bancoBaseId).eq('tenant_id', tid).maybeSingle()
    let row: Record<string, any> | null = r.data as any
    if (r.error && /cor|icone|capa_url|capa_card_url|is_folder|deletado|column/i.test(r.error.message)) {
      row = (await svcAdmin.from('simulado_pastas').select('id').eq('id', bancoBaseId).eq('tenant_id', tid).maybeSingle()).data as any
    }
    if (row && !row.deletado && row.is_folder !== true) {
      bannerCapa = row.capa_url ?? null
      bannerCor = row.cor ?? null
      if (abasConteudo.includes(aba)) bancoVisual = { id: row.id, cor: row.cor ?? null, icone: row.icone ?? null, capa_url: row.capa_url ?? null, capa_card_url: row.capa_card_url ?? null }
    }
    if (abasConteudo.includes(aba) && tenantId) bancoCompartilhadoN = (await simuladosDoBanco(svcAdmin, tenantId, bancoBaseId)).length || 1
  }

  // ── cardView (espelha o console) — a personalização (capa/card) vive em Configurações.
  let cardView = resolverCardView(undefined)
  if (aba === 'configuracoes') {
    const temaAdmin = (((await getCurrentTenant())?.tema as Record<string, unknown> | null) ?? {})
    cardView = resolverCardView((temaAdmin.card_view_admin ?? temaAdmin.card_view) as string | undefined)
  }

  // Questões: a carga rica (joins + alternativas) foi movida para <SimuladoQuestoesData> (Suspense),
  // para o loader aparecer na troca de aba em vez de bloquear a página no await.

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

  // Abas reutilizadas nos dois cabeçalhos (com/sem banner). `claro` = tema claro sobre o banner escuro.
  // Sempre sem barra de rolagem visível (só o scroll horizontal em telas estreitas).
  const listaTabs = (claro: boolean) => (
    <TabsList className={cn(
      'max-w-full flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      claro && 'border-white/20 [&_[data-slot=tabs-trigger]]:text-white/70 [&_[data-slot=tabs-trigger]:hover]:text-white [&_[data-slot=tabs-trigger][data-active]]:text-white',
    )}>
      <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
      <TabsTrigger value="questoes">Questões ({totalQuestoes ?? 0})</TabsTrigger>
      <TabsTrigger value="estudantes">Estudantes</TabsTrigger>
      <TabsTrigger value="caderno">Caderno</TabsTrigger>
      <TabsTrigger value="hud">HUD</TabsTrigger>
      <TabsTrigger value="relatorio">Relatório</TabsTrigger>
      <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
      <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
    </TabsList>
  )

  // Volta: prioriza a ORIGEM da navegação (?voltar=, setado pelo card conforme onde o admin estava),
  // caindo na pasta do simulado só como fallback. Validado (deve apontar p/ /admin/simulados) contra open-redirect.
  const voltarSeguro = voltarParam && voltarParam.startsWith('/admin/simulados') ? voltarParam : null
  const voltarHref = voltarSeguro ?? ((simulado as any).pasta_id ? `/admin/simulados?pasta=${(simulado as any).pasta_id}` : '/admin/simulados')
  const voltarLabel = (voltarSeguro ? voltarSeguro.includes('pasta=') : !!(simulado as any).pasta_id) ? 'Voltar para a pasta' : 'Voltar para Simulados'

  return (
    // Pré-carrega as abas no acesso p/ troca instantânea — EXCETO 'relatorio' (pesado: varreria as
    // respostas em todo acesso, aumentando egress). O Relatório carrega sob demanda (com Suspense).
    <BancoTabsShell value={aba} prefetch={ABAS.filter((t) => t !== 'relatorio')} className={bannerCapa ? '[overflow-anchor:none]' : undefined}>
      {bannerCapa ? (
        // COM imagem alocada: banner no topo recolhendo/expandindo no scroll (abas claras na base).
        <ModuloBanner
          banner={bannerCapa}
          cor={bannerCor}
          icone={null}
          titulo={simulado.titulo}
          subtitulo={simulado.descricao || 'Gerencie questões, caderno, estudantes e configurações deste simulado.'}
          voltarHref={voltarHref}
          voltarLabel={voltarLabel}
          tituloBadges={
            <>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>{statusCfg.label}</span>
              <TipoSimuladoBadge tipo={tipoSim} />
            </>
          }
          topoDireita={
            <>
              <Link href={`/admin/simulados/${id}/embed`} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-foreground' })}>
                <Code className="mr-2 h-3.5 w-3.5" /> Embed
              </Link>
              <SimuladoActions simuladoId={id} status={simulado.status} />
            </>
          }
          breadcrumb={
            <>
              <Link href="/admin/simulados" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/15 hover:text-white"><Home className="h-3.5 w-3.5" /> Simulados</Link>
              <span className="inline-flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5" /><span className="rounded-md px-1.5 py-0.5 font-medium text-white">{simulado.titulo}</span></span>
            </>
          }
          tabs={listaTabs(true)}
        />
      ) : (
        // SEM imagem: cabeçalho claro seguindo o tema do sistema (bg-background), sticky no topo.
        <div className="sticky -top-6 z-40 -mx-6 -mt-6 space-y-3 bg-background px-6 pt-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={voltarHref}
                className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                {voltarLabel}
              </Link>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{simulado.titulo}</h1>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>{statusCfg.label}</span>
                <TipoSimuladoBadge tipo={tipoSim} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`/admin/simulados/${id}/embed`} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-foreground' })}>
                <Code className="mr-2 h-3.5 w-3.5" /> Embed
              </Link>
              <SimuladoActions simuladoId={id} status={simulado.status} />
            </div>
          </div>
          {listaTabs(false)}
        </div>
      )}

      <div className="pt-6">
        {/* Salvaguarda D1: banco compartilhado por >1 simulado → editar conteúdo afeta todos. */}
        {bancoCompartilhadoN > 1 && abasConteudo.includes(aba) && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Este conteúdo é <strong>compartilhado com {bancoCompartilhadoN} simulados</strong>. Editar questões, caderno, HUD ou a capa aqui afeta <strong>todos</strong> eles. Para mudar só este, será preciso desmembrá-lo (em breve).</span>
          </div>
        )}

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

        {/* Questões — tabela rica (opera na prova); carregada em Suspense com o loader do tenant. */}
        <TabsContent value="questoes" className="space-y-4">
          {aba === 'questoes' && (
            <Suspense fallback={fallbackAba}>
              <SimuladoQuestoesData simuladoId={id} bancoId={bancoBaseId} cor={bancoVisual?.cor ?? undefined} />
            </Suspense>
          )}
        </TabsContent>

        {/* Estudantes linkados (matriculados) + adicionar aluno/turma — carregados no servidor (SQL/API)
            e streamados via Suspense; assim o prefetch pré-carrega e não há spinner no 1º acesso. */}
        <TabsContent value="estudantes">
          {aba === 'estudantes' && (
            <Suspense fallback={fallbackAba}>
              <SimuladoEstudantesData simuladoId={id} acessoGratuitoInicial={!!(simulado.regras as { acesso_gratuito?: boolean } | null)?.acesso_gratuito} bancoBaseId={bancoBaseId} />
            </Suspense>
          )}
        </TabsContent>

        {/* Caderno — folha/enunciado/gabarito de entrega (opera no banco container) */}
        <TabsContent value="caderno">
          {aba === 'caderno' && (bancoBaseId ? (
            <Suspense fallback={fallbackAba}>
              <BancoCadernoTeste bancoId={bancoBaseId} cor={bancoVisual?.cor ?? undefined} />
            </Suspense>
          ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para montar a folha de respostas e os cadernos aqui mesmo.'))}
        </TabsContent>

        {/* HUD — tema visual da prova (opera no banco container) */}
        <TabsContent value="hud">
          {aba === 'hud' && (bancoBaseId ? (
            <Suspense fallback={fallbackAba}>
              <BancoHud bancoId={bancoBaseId} cor={bancoVisual?.cor ?? undefined} editHref={`/admin/simulados/${id}/hud`} />
            </Suspense>
          ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para configurar o HUD da prova aqui mesmo.'))}
        </TabsContent>

        {/* Relatório — desempenho, ranking e estatísticas. PESADO (varre respostas) → Suspense p/ o
            shell aparecer na hora e o relatório streamar; fora do prefetch p/ não varrer em todo acesso. */}
        <TabsContent value="relatorio">
          {aba === 'relatorio' && (
            <Suspense fallback={fallbackAba}>
              <SimuladoRelatorio simuladoId={id} />
            </Suspense>
          )}
        </TabsContent>

        {/* Manutenção — bloquear o simulado num período */}
        <TabsContent value="manutencao">
          {aba === 'manutencao' && <SimuladoManutencao simuladoId={id} inicial={(simulado.regras as any)?.manutencao ?? null} />}
        </TabsContent>

        {/* Configurações — duas seções claras: Aparência (capa/cor/card) e Aplicação (título/modo/regras) */}
        <TabsContent value="configuracoes" className="space-y-8">
          {aba === 'configuracoes' && (
            <>
              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-base font-semibold tracking-tight">Aparência do card</h2>
                  <p className="text-sm text-muted-foreground">A capa, a cor e a imagem que aparecem no card do simulado (aluno e board).</p>
                </div>
                {bancoVisual ? (
                  <BancoPersonalizar
                    banco={{ id: bancoVisual.id, nome: simulado.titulo, cor: bancoVisual.cor, icone: bancoVisual.icone, capa_url: bancoVisual.capa_url, capa_card_url: bancoVisual.capa_card_url, total: totalQuestoes ?? 0 }}
                    cardView={cardView}
                    badge="Simulado"
                    mostrarNome={false}
                    semCabecalho
                    autoSalvar
                  />
                ) : semBancoCTA('Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para editar a capa, a cor e a imagem do card aqui mesmo.')}
              </section>

              <section className="space-y-3 border-t pt-6">
                <div className="space-y-0.5">
                  <h2 className="text-base font-semibold tracking-tight">Configurações da aplicação</h2>
                  <p className="text-sm text-muted-foreground">Título, modo de aplicação, datas, tempo, regras e identificação do aluno.</p>
                </div>
                <SimuladoForm
                  initialData={initialFormData as any}
                  onSubmit={updateSimuladoAction.bind(null, id)}
                />
              </section>
            </>
          )}
        </TabsContent>
      </div>
    </BancoTabsShell>
  )
}
