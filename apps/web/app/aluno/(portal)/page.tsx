import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { BookOpen, Star, NotebookPen, ArrowRight, Sparkles, ClipboardList, UserRound } from 'lucide-react'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverGruposCatalogo } from '@/lib/aluno/grupos-catalogo'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { BannersPortal, type HeroSimSlide, type BannerChip, type BannerStats } from '@/components/aluno/banners-portal'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { idsSimuladosGratuitos } from '@/lib/simulado/gratuito'
import { SimuladosCatalogoAluno, type ItemSimuladoCat, type ProgressoGrupo } from '@/components/aluno/simulados-catalogo-aluno'
import { SemAcessoModal } from '@/components/aluno/sem-acesso-modal'
import { OCULTAR_ALUNO_EXTRAS, ROTAS_ALUNO_OCULTAS } from '@/lib/flags'

export default async function AlunoHome({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ data: mats }, { data: acs }, { data: sessAll }, { data: banRows }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('simulado_id, status, nota').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: true }),
  ])
  // KPIs do aluno p/ o banner de simulado (Simulados · Nota média · Melhor nota).
  const finalizadasNota = ((sessAll ?? []) as any[]).filter((x) => x.status === 'finalizada')
  const notasAluno = finalizadasNota.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
  const statsAluno: BannerStats = {
    simulados: finalizadasNota.length,
    notaMedia: notasAluno.length ? notasAluno.reduce((a, b) => a + b, 0) / notasAluno.length : null,
    melhorNota: notasAluno.length ? Math.max(...notasAluno) : null,
  }
  const todosBanners = (banRows ?? []) as any[]
  // Banners de DESTAQUE (tipo 'hero'): os que apontam para um simulado (link /simulado/token)
  // viram SLIDE com o fundo do próprio simulado; os demais são banners de imagem.
  const heroAll = todosBanners.filter((b) => b.tipo === 'hero')
  // "Sim banner" = destaque que aponta para um simulado (/simulado/token) OU uma pasta de
  // simulados (…?pasta=id). Ambos viram slide com o fundo do simulado/pasta.
  const ehSimBanner = (b: any) => b.tipo === 'hero' && typeof b.link === 'string' && (b.link.startsWith('/simulado/') || /[?&]pasta=/.test(b.link))
  const simBanners = heroAll.filter(ehSimBanner)
  // Banners de imagem (banner/destaque + pop-up), SEM os de simulado (esses viram slides via `simulados`).
  const bannersSemSim = todosBanners.filter((b) => !ehSimBanner(b))

  // Simulados de "acesso gratuito" (classificação própria) aparecem para TODOS, sem matrícula.
  const gratuitoIds = await idsSimuladosGratuitos(svc, sessao!.tenantId)
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
    ...gratuitoIds,
  ].filter(Boolean))]
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    const { data: s } = await svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at').in('id', ids).eq('deletado', false)
    sims = s ?? []
    for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }
  const feitosSet = new Set(sims.filter((s) => (sessoesPorSim.get(s.id) ?? []).some((x) => x.status === 'finalizada')).map((s) => s.id))

  const visual = await resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras })))
  const itensAll = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.refazer || i.statusLabel === 'Agendado')

  // Grupo (pasta) + enunciado de cada simulado.
  const { grupoPorSim, grupos } = await resolverGruposCatalogo(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras })))
  const enunUrls = await resolverEnunciadoUrls(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras })))
  const itensCat: ItemSimuladoCat[] = itensAll.map((i) => ({ ...i, grupoId: grupoPorSim.get(i.id) ?? null, enunciadoUrl: enunUrls.get(i.id) ?? null }))

  // Progresso por pasta (concluídos / total dos acessíveis).
  const progresso: ProgressoGrupo = {}
  for (const g of grupos) {
    const inGrp = itensCat.filter((s) => s.grupoId === g.id)
    progresso[g.id] = { total: inGrp.length, done: inGrp.filter((s) => feitosSet.has(s.id)).length }
  }

  // Recentes: disponíveis/agendados ainda NÃO feitos, mais novos primeiro.
  const lancamento = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
  const recentes = itensCat
    .filter((i) => (i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado') && !feitosSet.has(i.id))
    .sort((a, b) => lancamento(b) - lancamento(a))
    .slice(0, 12)
  // Banners de simulado (VITRINE): aparecem para TODOS os alunos com a QUANTIDADE de simulados da
  // pasta e a descrição — pra mostrar que há mais conteúdo. O bloqueio real acontece ao clicar
  // (destino sem acesso → pop-up "sem acesso"). Contagem é tenant-wide (não depende do acesso do aluno).
  let heroSims: HeroSimSlide[] = []
  if (!pasta && simBanners.length) {
    const tokenDe = (l: string) => l.startsWith('/simulado/') ? (l.split('/simulado/')[1]?.split(/[/?#]/)[0] || null) : null
    const pastaDe = (l: string) => l.match(/[?&]pasta=([^&#]+)/)?.[1] ? decodeURIComponent(l.match(/[?&]pasta=([^&#]+)/)![1]) : null
    const grupoById = new Map(grupos.map((g) => [g.id, g]))

    // Simulados-alvo (por token) — capa/título/estado genérico + nº de questões/tipo.
    const tokens = [...new Set(simBanners.map((b) => tokenDe(b.link as string)).filter(Boolean))] as string[]
    const simByToken = new Map<string, any>()
    const cntPorSim = new Map<string, number>(); const tiposPorSim = new Map<string, string[]>()
    if (tokens.length) {
      const { data: rows0 } = await svc.from('simulado_simulados').select('id, titulo, embed_token, regras, status, modo_aplicacao, data_inicio, data_fim, created_at').in('embed_token', tokens).eq('deletado', false)
      const rows = (rows0 ?? []) as any[]
      const visB = await resolverVisualSimulados(svc, rows.map((s) => ({ id: s.id, regras: s.regras })))
      const itemById = new Map(montarItensSimulado(rows, new Map(), expiraPorSim, visB).map((i) => [i.id, i]))
      const { data: pq } = rows.length ? await svc.from('simulado_prova_questoes').select('simulado_id, questoes:simulado_questoes(tipo)').in('simulado_id', rows.map((r) => r.id)) : { data: [] as any[] }
      for (const r of (pq ?? []) as any[]) { cntPorSim.set(r.simulado_id, (cntPorSim.get(r.simulado_id) ?? 0) + 1); const a = tiposPorSim.get(r.simulado_id) ?? []; a.push((r.questoes as any)?.tipo); tiposPorSim.set(r.simulado_id, a) }
      for (const s of rows) simByToken.set(s.embed_token, { ...s, vis: visB.get(s.id) ?? null, item: itemById.get(s.id) })
    }

    // Pastas: capa/nome + CONTAGEM TENANT-WIDE de simulados (banco_base_id → banco → pasta-pai, ou a própria pasta).
    const pastaIds = [...new Set(simBanners.map((b) => pastaDe(b.link as string)).filter(Boolean))] as string[]
    const pastaRow = new Map<string, any>(); const pastaCount = new Map<string, number>()
    if (pastaIds.length) {
      const pr = await svc.from('simulado_pastas').select('id, nome, cor, capa_url').in('id', pastaIds)
      for (const p of (pr.data ?? []) as any[]) pastaRow.set(p.id, p)
      const bancos = await svc.from('simulado_pastas').select('id, pai_id').in('pai_id', pastaIds).then((r: any) => r.data ?? [], () => [])
      const bancoToFolder = new Map<string, string>()
      for (const f of pastaIds) bancoToFolder.set(f, f)
      for (const bc of bancos as any[]) if (bc.pai_id) bancoToFolder.set(bc.id, bc.pai_id)
      const { data: simsT } = await svc.from('simulado_simulados').select('regras').eq('tenant_id', sessao!.tenantId).eq('deletado', false).eq('status', 'publicado')
      for (const s of (simsT ?? []) as any[]) { const bb = (s.regras as any)?.banco_base_id; const f = bb ? bancoToFolder.get(bb) : null; if (f) pastaCount.set(f, (pastaCount.get(f) ?? 0) + 1) }
    }

    heroSims = simBanners.map((b): HeroSimSlide => {
      const tok = tokenDe(b.link as string)
      const pid = pastaDe(b.link as string)
      if (pid) {
        const g = grupoById.get(pid); const pr = pastaRow.get(pid)
        const total = pastaCount.get(pid) ?? progresso[pid]?.total ?? 0
        return {
          id: b.id, kind: 'sim',
          capa: b.imagem_url || g?.capa || pr?.capa_url || null,
          cor: b.cor || g?.cor || '#6d28d9',
          titulo: b.titulo || g?.nome || pr?.nome || 'Simulados',
          descricao: b.mensagem || null,
          link: b.link, acao: 'Ver simulados',
          chips: total > 0 ? [{ label: `${total} ${total === 1 ? 'simulado' : 'simulados'}`, tone: 'muted', icon: 'book' }] : undefined,
        }
      }
      const sim = tok ? simByToken.get(tok) : null
      const item = sim?.item
      const chips: BannerChip[] = []
      if (item) chips.push({ label: item.statusLabel + (item.quando ? ` · ${item.quando}` : ''), tone: item.podeFazer ? 'ok' : 'muted' })
      const cnt = sim ? cntPorSim.get(sim.id) ?? 0 : 0
      if (cnt) chips.push({ label: `${cnt} ${cnt === 1 ? 'questão' : 'questões'}`, tone: 'muted', icon: 'book' })
      const tp = tipoDoSimulado(sim ? tiposPorSim.get(sim.id) ?? [] : [])
      const tpLabel = tp === 'mista' ? 'Objetivas + discursiva' : tp === 'discursiva' ? 'Discursivas' : tp === 'objetiva' ? 'Objetivas' : null
      if (tpLabel) chips.push({ label: tpLabel, tone: 'muted' })
      return {
        id: b.id, kind: 'sim',
        capa: b.imagem_url || sim?.vis?.capa || null,
        cor: b.cor || sim?.vis?.cor || '#6d28d9',
        titulo: b.titulo || sim?.titulo || 'Simulado',
        descricao: b.mensagem || null,
        link: b.link, acao: item?.emAndamento ? 'Continuar' : item?.refazer ? 'Refazer' : 'Fazer agora',
        detalhesLink: sim?.id ? `/aluno/simulados/${sim.id}` : null,
        chips: chips.length ? chips : undefined,
      }
    })
  }

  // VISÃO DE PASTA — só o conteúdo da pasta (sem saudação/atalhos).
  if (pasta) {
    const naPasta = itensCat.filter((i) => i.grupoId === pasta)
    let semAcesso: React.ReactNode = null
    if (naPasta.length === 0) {
      // Chegou por um banner de vitrine, mas não tem acesso → pop-up com dados da pasta + suporte.
      const [{ data: pRow }, { data: contatoRow }] = await Promise.all([
        svc.from('simulado_pastas').select('nome, capa_url').eq('id', pasta).maybeSingle(),
        svc.from('simulado_tenant_contatos').select('whatsapp, email_suporte, link_ajuda, horario_atendimento').eq('tenant_id', sessao!.tenantId).maybeSingle().then((r) => r, () => ({ data: null })),
      ])
      const ct = (contatoRow ?? null) as any
      // Imagem do BANNER que leva a esta pasta (fallback: capa da pasta).
      const bannerImg = todosBanners.find((b: any) => typeof b.link === 'string' && b.link.includes('pasta=' + pasta))?.imagem_url ?? null
      semAcesso = (
        <SemAcessoModal
          pastaNome={(pRow as any)?.nome ?? null}
          capa={bannerImg || (pRow as any)?.capa_url || null}
          suporte={ct ? { whatsapp: ct.whatsapp, email: ct.email_suporte, link: ct.link_ajuda, horario: ct.horario_atendimento } : undefined}
        />
      )
    }
    return (
      <div className="animate-page">
        <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} progresso={progresso} pastaAtiva={pasta} />
        {semAcesso}
      </div>
    )
  }

  const atalhos = [
    { href: '/aluno/simulados', icon: ClipboardList, titulo: 'Meus Simulados', desc: 'Seus simulados e resultados' },
    { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões focadas nos seus pontos fracos' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', desc: 'Pratique questões avulsas com filtros' },
    { href: '/aluno/favoritos', icon: Star, titulo: 'Favoritos', desc: 'Questões que você marcou' },
    { href: '/aluno/cadernos', icon: NotebookPen, titulo: 'Cadernos', desc: 'Organize seus estudos' },
    { href: '/aluno/perfil', icon: UserRound, titulo: 'Perfil', desc: 'Seus dados e desempenho' },
  ].filter((a) => !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(a.href)))

  return (
    <div className="animate-page space-y-6">
      {/* Banners do tenant — UM carrossel só (banner + destaque + simulado) + pop-up. SÓ na Início. */}
      <BannersPortal banners={bannersSemSim} simulados={heroSims} stats={statsAluno} />

      {/* Saudação solta. */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Sua área de estudos</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[2rem]">Olá, {sessao!.nome.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-muted-foreground">Bem-vindo à sua área de estudos. {recentes.length > 0 ? `Você tem ${recentes.length} simulado(s) recente(s) para fazer.` : 'Você está em dia com seus simulados.'}</p>
      </div>

      {/* Atalhos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href}>
            <div className="group h-full rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><a.icon className="h-5 w-5" /></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-2">
                <div className="font-medium">{a.titulo}</div>
                <div className="text-xs text-muted-foreground">{a.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Catálogo: simulados recentes + pastas (cursos e pacotes) + avulsos. */}
      <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} progresso={progresso} recentes={recentes} />
    </div>
  )
}
