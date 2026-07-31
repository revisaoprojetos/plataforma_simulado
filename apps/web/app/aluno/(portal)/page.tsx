import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { BookOpen, Star, NotebookPen, ArrowRight, Sparkles } from 'lucide-react'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverGruposCatalogo } from '@/lib/aluno/grupos-catalogo'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { BannersPortal, type HeroSimSlide } from '@/components/aluno/banners-portal'
import { SimuladosCatalogoAluno, type ItemSimuladoCat, type ProgressoGrupo } from '@/components/aluno/simulados-catalogo-aluno'
import { OCULTAR_ALUNO_EXTRAS, ROTAS_ALUNO_OCULTAS } from '@/lib/flags'

export default async function AlunoHome({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ data: mats }, { data: acs }, { data: sessAll }, { data: banRows }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('simulado_id, status').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: true }),
  ])
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

  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
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
  // Banners de simulado (config no console): resolve o FUNDO de cada um a partir do próprio
  // simulado referenciado (capa/cor), independentemente do acesso do aluno (clique é validado no destino).
  let heroSims: HeroSimSlide[] = []
  if (!pasta && simBanners.length) {
    const tokenDe = (l: string) => l.startsWith('/simulado/') ? (l.split('/simulado/')[1]?.split(/[/?#]/)[0] || null) : null
    const pastaDe = (l: string) => l.match(/[?&]pasta=([^&#]+)/)?.[1] ? decodeURIComponent(l.match(/[?&]pasta=([^&#]+)/)![1]) : null

    // Simulados únicos (por token) → fundo do próprio simulado.
    const tokens = [...new Set(simBanners.map((b) => tokenDe(b.link as string)).filter(Boolean))] as string[]
    const simPorToken = new Map<string, any>()
    if (tokens.length) {
      const { data: simRows } = await svc.from('simulado_simulados').select('id, titulo, embed_token, regras').in('embed_token', tokens).eq('deletado', false)
      const visB = await resolverVisualSimulados(svc, (simRows ?? []).map((s: any) => ({ id: s.id, regras: s.regras })))
      for (const s of (simRows ?? []) as any[]) simPorToken.set(s.embed_token, { ...s, vis: visB.get(s.id) ?? null })
    }

    // Pastas (grupos de simulados) → fundo da pasta + CONTAGEM de simulados que ela tem.
    const pastaIds = [...new Set(simBanners.map((b) => pastaDe(b.link as string)).filter(Boolean))] as string[]
    const pastaRow = new Map<string, any>()
    if (pastaIds.length) {
      const r = await svc.from('simulado_pastas').select('id, nome, cor, capa_url').in('id', pastaIds)
      for (const p of (r.data ?? []) as any[]) pastaRow.set(p.id, p)
    }
    const grupoById = new Map(grupos.map((g) => [g.id, g]))

    heroSims = simBanners.map((b) => {
      const tok = tokenDe(b.link as string)
      const pid = pastaDe(b.link as string)
      if (pid) {
        const g = grupoById.get(pid)
        const pr = pastaRow.get(pid)
        const total = progresso[pid]?.total ?? 0
        return {
          id: b.id, kind: 'sim' as const,
          capa: b.imagem_url || g?.capa || pr?.capa_url || null,
          cor: b.cor || g?.cor || '#6d28d9',
          titulo: b.titulo || g?.nome || pr?.nome || 'Simulados',
          quando: b.mensagem || null,
          link: b.link, acao: 'Ver simulados',
          chip: total > 0 ? `${total} simulado${total === 1 ? '' : 's'}` : null,
        }
      }
      const sim = tok ? simPorToken.get(tok) : null
      return {
        id: b.id, kind: 'sim' as const,
        capa: b.imagem_url || sim?.vis?.capa || null,
        cor: b.cor || sim?.vis?.cor || '#6d28d9',
        titulo: b.titulo || sim?.titulo || 'Simulado',
        quando: b.mensagem || null,
        link: b.link, acao: 'Fazer agora',
      }
    })
  }

  // VISÃO DE PASTA — só o conteúdo da pasta (sem saudação/atalhos).
  if (pasta) {
    return (
      <div className="animate-page">
        <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} progresso={progresso} pastaAtiva={pasta} />
      </div>
    )
  }

  const atalhos = [
    { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões focadas nos seus pontos fracos' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', desc: 'Pratique questões avulsas com filtros' },
    { href: '/aluno/favoritos', icon: Star, titulo: 'Favoritos', desc: 'Questões que você marcou' },
    { href: '/aluno/cadernos', icon: NotebookPen, titulo: 'Cadernos', desc: 'Organize seus estudos' },
  ].filter((a) => !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(a.href)))

  return (
    <div className="animate-page space-y-6">
      {/* Banners do tenant — UM carrossel só (banner + destaque + simulado) + pop-up. SÓ na Início. */}
      <BannersPortal banners={bannersSemSim} simulados={heroSims} />

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
