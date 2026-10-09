import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverGruposCatalogo } from '@/lib/aluno/grupos-catalogo'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { BannersPortal, type HeroSimSlide, type BannerChip, type BannerStats } from '@/components/aluno/banners-portal'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { idsSimuladosGratuitos } from '@/lib/simulado/gratuito'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { SimuladosCatalogoAluno, type ItemSimuladoCat, type ProgressoGrupo } from '@/components/aluno/simulados-catalogo-aluno'
import { SemAcessoModal } from '@/components/aluno/sem-acesso-modal'
import { getGamConfig, gamAtivaParaAluno } from '@/lib/gamificacao'
import { resumoGamificacao, missoesHoje, atividadeSemana, conquistasProgresso, posicaoNaLiga } from '@/lib/gamificacao/leitura'
import { NivelCard } from '@/components/aluno/nivel-card'
import { MetaDiariaCard } from '@/components/aluno/meta-diaria-card'
import { MissoesLista } from '@/components/aluno/missoes-lista'
import { StreakCalendario } from '@/components/aluno/streak-calendario'
import { LigaPainel } from '@/components/aluno/liga-painel'
import { RankingLiga } from '@/components/aluno/ranking-liga'
import { ConquistasProgressoLista } from '@/components/aluno/conquistas-progresso'
import { CelebracaoXp } from '@/components/aluno/celebracao-xp'
import { MascoteTour } from '@/components/mascote/mascote-tour'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'
import { cn } from '@/lib/utils'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'
import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { PlatformHome } from '@/components/brand/interna/home'
import { PlatformPasta } from '@/components/brand/interna/pasta'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { montarHomeData } from '@/lib/aluno/home-nova'
import { OCULTAR_CRONOGRAMA } from '@/lib/flags'
import type { InternaTheme } from '@/components/brand/interna/interna-tokens'
import type { HomeDestaque } from '@/components/brand/interna/home/types'

export default async function AlunoHome({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const estId = sessao.estudanteId

  // EGRESS: dados de TENANT (banners, tema, simulados gratuitos) são IGUAIS p/ todos os alunos e eram
  // relidos a cada carregamento de cada aluno. Cacheados por tenant (TTL curto) → 1 leitura por janela
  // em vez de N (nº de alunos × cargas). As leituras PER-ALUNO seguem ao vivo (variam por estudante).
  const [{ data: mats }, { data: acs }, { data: sessAll }, tenantBundle] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    remember(`aluno-home-tenant:${sessao!.tenantId}`, 120, async () => {
      const [{ data: banRows }, { data: tenantRow }, gratuitoIds] = await Promise.all([
        // Mesma ordenação do console (ordem asc, empate por criado_em DESC) para o carrossel bater com a lista de Avisos.
        svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
        svc.from('simulado_tenants').select('tema').eq('id', sessao!.tenantId).maybeSingle(),
        idsSimuladosGratuitos(svc, sessao!.tenantId),
      ])
      return { banRows: banRows ?? [], tema: (tenantRow?.tema ?? null) as any, gratuitoIds }
    }),
  ])
  const banRows = tenantBundle.banRows
  const tenantRow = { tema: tenantBundle.tema } as { tema: any }
  const gratuitoIds = tenantBundle.gratuitoIds
  // Painel de desempenho (KPIs) nos banners de simulado: só quando o tenant liga (default OFF).
  const mostrarDesempenhoBanner = (tenantRow?.tema as any)?.banners_desempenho === true
  // Estilo dos cards de simulado, definido no console (tema.card_view) — o aluno apenas obedece.
  const cardView = resolverCardView((tenantRow?.tema as any)?.card_view)
  // Config por-banner do rótulo "Em destaque para você" (ativo + texto). Default: ativo, texto padrão.
  const destaquesBanner = ((tenantRow?.tema as any)?.banner_destaques ?? {}) as Record<string, { ativo?: boolean; texto?: string; fadeAtivo?: boolean; fadeNivel?: number }>
  const destaqueDe = (id: string) => ({
    destaqueAtivo: destaquesBanner[id]?.ativo !== false,
    destaqueTexto: destaquesBanner[id]?.texto ?? null,
    fadeAtivo: destaquesBanner[id]?.fadeAtivo !== false,
    fadeNivel: destaquesBanner[id]?.fadeNivel ?? 100,
  })
  // KPIs do aluno p/ o banner de simulado (Simulados · Nota média · Melhor nota).
  const finalizadasNota = ((sessAll ?? []) as any[]).filter((x) => x.status === 'finalizada')
  const notasAluno = finalizadasNota.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
  const statsAluno: BannerStats = {
    simulados: finalizadasNota.length,
    notaMedia: notasAluno.length ? notasAluno.reduce((a, b) => a + b, 0) / notasAluno.length : null,
    melhorNota: notasAluno.length ? Math.max(...notasAluno) : null,
  }
  // Agendamento por-aviso (início/fim em tema.banner_destaques[id]): oculta fora da janela.
  const agora = Date.now()
  const dentroJanela = (id: string) => {
    const d = destaquesBanner[id] as any
    const ini = d?.agendaInicio ? Date.parse(d.agendaInicio) : NaN
    const fim = d?.agendaFim ? Date.parse(d.agendaFim) : NaN
    if (!Number.isNaN(ini) && agora < ini) return false
    if (!Number.isNaN(fim) && agora > fim) return false
    return true
  }
  const todosBanners = ((banRows ?? []) as any[]).filter((b) => dentroJanela(b.id))
  // Ordem GLOBAL do carrossel = posição na lista já ordenada por (ordem, criado_em) no console.
  const ordemGlobal = new Map<string, number>(todosBanners.map((b, i) => [b.id, i]))
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
    // owner_estudante_id IS NULL: exclui simulados PESSOAIS do aluno (sessão do runner pessoal os arrastaria pra cá).
    sims = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at, pasta_id').in('id', chunk).eq('deletado', false).is('owner_estudante_id', null).order('id', { ascending: true }))
    for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }
  const feitosSet = new Set(sims.filter((s) => (sessoesPorSim.get(s.id) ?? []).some((x) => x.status === 'finalizada')).map((s) => s.id))
  // Pasta (folder_area='simulado') de cada simulado no admin — usado p/ o link "Copiar link da pasta"
  // levar o aluno à MESMA pasta que o admin vê (o grupo do catálogo é por banco→pai, um id diferente).
  const pastaBySim = new Map<string, string | null>(sims.map((s: any) => [s.id, s.pasta_id ?? null]))

  // Visual dos simulados + mapa pasta→simulado de TODOS os sims (usado nos banners de vitrine):
  // ambos só dependem de `sims`, então rodam em paralelo.
  const [visual, { grupoPorSim: grupoPorSimAll }] = await Promise.all([
    resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras }))),
    resolverGruposCatalogo(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras }))),
  ])
  const itensAll = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.refazer || i.statusLabel === 'Agendado')

  // Grupo (pasta) + enunciado de cada simulado — independentes entre si, buscados em paralelo.
  const [{ grupoPorSim, grupos }, enunUrls] = await Promise.all([
    resolverGruposCatalogo(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras }))),
    resolverEnunciadoUrls(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras }))),
  ])
  // Caderno de questões (sem respostas) para download antes de iniciar. Só quando o admin não
  // bloqueou (regras.enunciado_liberado !== false). Prioriza o PDF "Enunciado de Questões" importado;
  // na falta dele, usa o caderno GERADO (endpoint) quando o simulado tem caderno vinculado.
  const itensCat: ItemSimuladoCat[] = itensAll.map((i) => {
    const info = enunUrls.get(i.id)
    const liberado = (i.regras as any)?.enunciado_liberado !== false
    const url = !liberado ? null
      : info?.pdf ? info.pdf
      : (info?.temCaderno && i.embed_token) ? `/api/aluno/caderno-teste-questoes?token=${encodeURIComponent(i.embed_token)}` : null
    return { ...i, grupoId: grupoPorSim.get(i.id) ?? null, pastaId: pastaBySim.get(i.id) ?? null, enunciadoUrl: url }
  })

  // Progresso por pasta (concluídos / total dos acessíveis).
  const progresso: ProgressoGrupo = {}
  for (const g of grupos) {
    const inGrp = itensCat.filter((s) => s.grupoId === g.id)
    progresso[g.id] = { total: inGrp.length, done: inGrp.filter((s) => feitosSet.has(s.id)).length }
  }

  // Recentes: disponíveis/agendados, mais novos primeiro. Mostra os NÃO feitos E TAMBÉM os
  // RECÉM-PUBLICADOS (últimos 7 dias) mesmo já feitos — senão um simulado novo somia do bloco no
  // instante em que o aluno o concluísse (era o caso do ENAP: publicado e já feito no mesmo dia).
  const lancamento = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
  const SETE_DIAS = 7 * 24 * 60 * 60 * 1000
  const recemPublicado = (i: any) => { const t = lancamento(i); return t > 0 && Date.now() - t < SETE_DIAS }
  const recentes = itensCat
    .filter((i) => (i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado') && (!feitosSet.has(i.id) || recemPublicado(i)))
    .sort((a, b) => lancamento(b) - lancamento(a))
    .slice(0, 5)
  // Banners de simulado (VITRINE): aparecem para TODOS os alunos com a QUANTIDADE de simulados da
  // pasta e a descrição — pra mostrar que há mais conteúdo. O bloqueio real acontece ao clicar
  // (destino sem acesso → pop-up "sem acesso"). Contagem é tenant-wide (não depende do acesso do aluno).
  // KPIs por-slide: estatísticas do aluno ESPECÍFICAS do simulado/pasta de cada banner
  // (antes era um agregado global repetido em todos os slides). `grupoPorSimAll` já foi
  // resolvido em paralelo acima (junto com `visual`).
  const finalizadasAll = ((sessAll ?? []) as any[]).filter((x) => x.status === 'finalizada')
  const statsDe = (pred: (simId: string) => boolean): BannerStats => {
    const fs = finalizadasAll.filter((x) => pred(x.simulado_id))
    const notas = fs.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    return {
      simulados: fs.length,
      notaMedia: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
      melhorNota: notas.length ? Math.max(...notas) : null,
    }
  }

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
      // Visual + contagem/tipos de questões dependem só de `rows` e são independentes entre si → paralelo.
      const [visB, pqRes] = await Promise.all([
        resolverVisualSimulados(svc, rows.map((s) => ({ id: s.id, regras: s.regras }))),
        rows.length ? svc.from('simulado_prova_questoes').select('simulado_id, questoes:simulado_questoes(tipo)').in('simulado_id', rows.map((r) => r.id)) : Promise.resolve({ data: [] as any[] }),
      ])
      const pq = pqRes.data
      const itemById = new Map(montarItensSimulado(rows, new Map(), expiraPorSim, visB).map((i) => [i.id, i]))
      for (const r of (pq ?? []) as any[]) { cntPorSim.set(r.simulado_id, (cntPorSim.get(r.simulado_id) ?? 0) + 1); const a = tiposPorSim.get(r.simulado_id) ?? []; a.push((r.questoes as any)?.tipo); tiposPorSim.set(r.simulado_id, a) }
      for (const s of rows) simByToken.set(s.embed_token, { ...s, vis: visB.get(s.id) ?? null, item: itemById.get(s.id) })
    }

    // Pastas: capa/nome + CONTAGEM TENANT-WIDE de simulados (banco_base_id → banco → pasta-pai, ou a própria pasta).
    const pastaIds = [...new Set(simBanners.map((b) => pastaDe(b.link as string)).filter(Boolean))] as string[]
    const pastaRow = new Map<string, any>(); const pastaCount = new Map<string, number>()
    if (pastaIds.length) {
      // Pasta-alvo (id) + bancos-filhos (pai_id): 2 leituras independentes em simulado_pastas → paralelo.
      const [pr, bancos] = await Promise.all([
        svc.from('simulado_pastas').select('id, nome, cor, capa_url').in('id', pastaIds),
        svc.from('simulado_pastas').select('id, pai_id').in('pai_id', pastaIds).then((r: any) => r.data ?? [], () => []),
      ])
      for (const p of (pr.data ?? []) as any[]) pastaRow.set(p.id, p)
      const bancoToFolder = new Map<string, string>()
      for (const f of pastaIds) bancoToFolder.set(f, f)
      for (const bc of bancos as any[]) if (bc.pai_id) bancoToFolder.set(bc.id, bc.pai_id)
      const simsT = await fetchAll<{ regras: any }>(() => svc.from('simulado_simulados').select('regras').eq('tenant_id', sessao!.tenantId).eq('deletado', false).eq('status', 'publicado').is('owner_estudante_id', null).order('id', { ascending: true }))
      for (const s of simsT as any[]) { const bb = (s.regras as any)?.banco_base_id; const f = bb ? bancoToFolder.get(bb) : null; if (f) pastaCount.set(f, (pastaCount.get(f) ?? 0) + 1) }
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
          stats: mostrarDesempenhoBanner ? statsDe((id) => grupoPorSimAll.get(id) === pid) : null,
          ...destaqueDe(b.id),
          ordem: ordemGlobal.get(b.id) ?? 0,
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
        stats: mostrarDesempenhoBanner && sim?.id ? statsDe((id) => id === sim.id) : null,
        ...destaqueDe(b.id),
        ordem: ordemGlobal.get(b.id) ?? 0,
      }
    })
  }

  // VISÃO DE PASTA — só o conteúdo da pasta (sem saudação/atalhos). Casa pelo GRUPO do catálogo
  // (banco→pai) OU pelo pasta_id do admin (link "Copiar link da pasta" da Aplicação de Simulado).
  if (pasta) {
    const naPasta = itensCat.filter((i) => i.grupoId === pasta || i.pastaId === pasta)
    // SUBPASTAS (admin, folder_area='simulado') desta pasta + contagem RECURSIVA (só sims acessíveis) + breadcrumb.
    let subpastas: { id: string; nome: string; cor: string | null; capa: string | null; count: number }[] = []
    let breadcrumbP: { id: string; nome: string }[] = []
    try {
      const rf = await svc.from('simulado_pastas').select('id, nome, cor, capa_url, capa_card_url, pai_id, folder_area').eq('tenant_id', sessao!.tenantId).eq('is_folder', true).eq('deletado', false)
      const allF = ((rf.data ?? []) as any[]).filter((f) => f.folder_area === 'simulado')
      const contDir = new Map<string, number>()
      for (const i of itensCat) if (i.pastaId) contDir.set(i.pastaId, (contDir.get(i.pastaId) ?? 0) + 1)
      const filhos = new Map<string, string[]>()
      for (const f of allF) if (f.pai_id) (filhos.get(f.pai_id) ?? filhos.set(f.pai_id, []).get(f.pai_id)!).push(f.id)
      const memo = new Map<string, number>()
      const rec = (id: string): number => { const h = memo.get(id); if (h !== undefined) return h; let n = contDir.get(id) ?? 0; for (const c of (filhos.get(id) ?? [])) n += rec(c); memo.set(id, n); return n }
      subpastas = allF.filter((f) => f.pai_id === pasta).map((f) => ({ id: f.id, nome: f.nome, cor: f.cor ?? null, capa: (f.capa_card_url ?? f.capa_url) ?? null, count: rec(f.id) })).filter((s) => s.count > 0)
      const fById = new Map(allF.map((f) => [f.id, f]))
      { let n: any = fById.get(pasta); const seen = new Set<string>(); while (n && !seen.has(n.id)) { seen.add(n.id); breadcrumbP.unshift({ id: n.id, nome: n.nome }); n = n.pai_id ? fById.get(n.pai_id) ?? null : null } }
    } catch { /* tolerante */ }
    // Cabeçalho: grupo do catálogo, senão a pasta manual do admin (nome/cor vindos de simulado_pastas).
    const grupoInfo = grupos.find((g) => g.id === pasta) ?? null
    let pastaInfo: { nome: string | null; cor: string | null } | null = grupoInfo ? { nome: grupoInfo.nome, cor: grupoInfo.cor } : null
    let semAcesso: React.ReactNode = null
    // "Sem acesso" só quando NÃO há sims diretos E NÃO há subpastas com conteúdo (senão é uma pasta-container).
    const vazio = naPasta.length === 0 && subpastas.length === 0
    if (!pastaInfo || vazio) {
      const { data: pRow } = await svc.from('simulado_pastas').select('nome, cor, capa_url').eq('id', pasta).maybeSingle()
      if (!pastaInfo && pRow) pastaInfo = { nome: (pRow as any).nome ?? null, cor: (pRow as any).cor ?? null }
      if (vazio) {
        // Chegou por um link/banner mas não tem acesso → pop-up com dados da pasta + suporte.
        const { data: contatoRow } = await svc.from('simulado_tenant_contatos').select('whatsapp, email_suporte, link_ajuda, horario_atendimento').eq('tenant_id', sessao!.tenantId).maybeSingle().then((r) => r, () => ({ data: null } as any))
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
    }
    // Visual NOVO: dentro da pasta usa o PlatformPasta (mesma linguagem da Início). Só quando há conteúdo
    // (se vazio/sem acesso, mantém o fluxo antigo que mostra o SemAcessoModal).
    const _itPasta = await resolverInterno()
    if (_itPasta.ativo && !vazio) {
      // Nota/liberação/data dos JÁ FEITOS desta pasta (p/ o ticket de concluído com nota, igual a
      // "Simulados realizados"). Vem das sessões já carregadas (sessoesPorSim) — sem query extra.
      const dmPasta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '')
      const notasPasta: Record<string, { nota: number | null; notaLiberada: boolean; data: string; ultimo: string | null }> = {}
      for (const i of naPasta) {
        if ((i.finalizadas ?? 0) <= 0) continue
        const fs = (sessoesPorSim.get(i.id) ?? []).filter((x: any) => x.status === 'finalizada')
        const ns = fs.map((x: any) => (x.nota != null ? Number(x.nota) : null)).filter((n: any): n is number => n != null)
        const ultimo = fs.map((x: any) => x.finalizado_em).filter(Boolean).sort().pop() ?? null
        notasPasta[i.id] = { nota: ns.length ? Math.max(...ns) : null, notaLiberada: !!resolverLiberacoes(i.regras, i).notaLiberada, data: dmPasta(ultimo), ultimo }
      }
      // Progresso dos EM ANDAMENTO (questão atual / total / %) — igual a "Simulados realizados". Só para os
      // poucos em andamento desta pasta (2 counts): total de questões do sim + respondidas na sessão aberta.
      const emAndPasta = naPasta.filter((i) => i.emAndamento && (i.finalizadas ?? 0) <= 0)
      const andamentosPasta: Record<string, { questaoAtual: number; total: number; pct: number }> = {}
      if (emAndPasta.length) {
        const emIds = emAndPasta.map((i) => i.id)
        const emSessIds = emAndPasta.map((i) => (sessoesPorSim.get(i.id) ?? []).find((x: any) => x.status !== 'finalizada')?.id).filter(Boolean) as string[]
        const totalPorSim = new Map<string, number>(); const respPorSess = new Map<string, number>()
        try {
          const [{ data: pqRows }, { data: rsRows }] = await Promise.all([
            svc.from('simulado_prova_questoes').select('simulado_id').in('simulado_id', emIds),
            emSessIds.length ? svc.from('simulado_respostas_objetivas').select('sessao_id').in('sessao_id', emSessIds) : Promise.resolve({ data: [] as any[] }),
          ])
          for (const r of (pqRows ?? []) as any[]) totalPorSim.set(r.simulado_id, (totalPorSim.get(r.simulado_id) ?? 0) + 1)
          for (const r of (rsRows ?? []) as any[]) respPorSess.set(r.sessao_id, (respPorSess.get(r.sessao_id) ?? 0) + 1)
        } catch { /* tolerante */ }
        for (const i of emAndPasta) {
          const total = totalPorSim.get(i.id) ?? 0
          const sessId = (sessoesPorSim.get(i.id) ?? []).find((x: any) => x.status !== 'finalizada')?.id
          const resp = sessId ? (respPorSess.get(sessId) ?? 0) : 0
          andamentosPasta[i.id] = { questaoAtual: Math.min(resp + 1, total || resp + 1), total, pct: total ? Math.round((resp / total) * 100) : 0 }
        }
      }
      return (
        <div className="animate-page">
          <PlatformPasta brand={_itPasta.brand} theme={_itPasta.theme} pastaInfo={{ id: pasta, nome: pastaInfo?.nome ?? 'Simulados', cor: pastaInfo?.cor ?? null, capa: null }} subpastas={subpastas} breadcrumb={breadcrumbP} itens={naPasta} notas={notasPasta} andamentos={andamentosPasta} />
          {semAcesso}
        </div>
      )
    }
    return (
      <div className="animate-page">
        <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} progresso={progresso} pastaAtiva={pasta} pastaInfo={pastaInfo} subpastas={subpastas} breadcrumb={breadcrumbP} view={cardView} />
        {semAcesso}
      </div>
    )
  }

  // Assistente/mascote (config do tenant) — usada no tour de novidades da gamificação.
  const tenant = await getCurrentTenant()
  const assistente = ((tenant?.tema as any)?.assistente ?? {}) as { ativo?: boolean; nome?: string }

  // Gamificação (hero + missões + calendário de sequência) — só quando o tenant ativou.
  const gamConfig = await getGamConfig(svc, sessao!.tenantId)
  // gamAtivo é POR ALUNO (respeita o público 'selecionados' — grupos/alunos vinculados).
  const gamAtivo = await gamAtivaParaAluno(svc, sessao!.tenantId, estId, gamConfig)
  const [gamResumo, gamMissoes, gamSemana, gamConquistas] = gamConfig && gamAtivo
    ? await Promise.all([
        resumoGamificacao(svc, sessao!.tenantId, estId, gamConfig),
        missoesHoje(svc, sessao!.tenantId, estId, gamConfig),
        atividadeSemana(svc, sessao!.tenantId, estId, gamConfig.timezone),
        conquistasProgresso(svc, sessao!.tenantId, estId, gamConfig),
      ])
    : [null, [], [], []]

  const chest = gamConfig?.xp_regras.chest
  const proxima = gamResumo?.proxima ?? null

  // ── NOVO VISUAL INTERNO (opt-in por plataforma): quando o console liga `internoAtivo`, a Início
  // usa a home redesenhada ligada aos dados reais. Desligado (padrão) → home atual (abaixo). ──
  const aparencia = lerAparenciaAuth(tenantRow?.tema, { nome: (tenantRow?.tema as any)?.nome_site ?? tenant?.nome ?? null, slug: tenant?.slug ?? null })
  if (aparencia.internoAtivo) {
    // Tema interno: claro/escuro via cookie `theme` (espelho do next-themes). O MEQ tem um 3º
    // tema "azul" (cards brancos sobre fundo gradiente). O seletor de tema fica no SHELL (shared,
    // não editável aqui); quando ele gravar `theme=azul`, a home já respeita. Fallback: claro/escuro.
    const temaCookie = (await cookies()).get('theme')?.value
    const dark = await resolveTemaDark()
    const theme: InternaTheme =
      aparencia.brand === 'meq' && temaCookie === 'azul' ? 'azul' : dark ? 'escuro' : 'claro'
    // Banners REAIS da plataforma (os mesmos do carrossel atual): banners de imagem (sem pop-ups) +
    // banners de simulado, ordenados pela ordem global do console.
    const bannerSlides = (bannersSemSim as any[])
      .filter((b) => b.tipo !== 'popup')
      .map((b): HomeDestaque & { ordem: number } => {
        // Respeita "ocultar título/mensagem" do admin (tema.banner_destaques[id]): zera o texto →
        // a home mostra a imagem limpa (sem overlay de texto). Antes esse config não era aplicado aqui.
        const cfg = (destaquesBanner[b.id] as any) ?? {}
        return {
          eyebrow: '',
          titulo: cfg.bannerOcultarTitulo ? '' : (b.titulo ?? ''),
          subtitulo: cfg.bannerOcultarMensagem ? '' : (b.mensagem ?? ''),
          chips: [], cta: { rotulo: 'Abrir', url: b.link ?? '#' },
          imagem: b.imagem_url ?? null, cores: b.cor ?? undefined,
          ordem: ordemGlobal.get(b.id) ?? 0,
        }
      })
    const heroSlides = (heroSims as any[]).map((h): HomeDestaque & { ordem: number } => ({
      eyebrow: 'DESTAQUE', titulo: h.titulo ?? 'Simulado', subtitulo: h.descricao ?? '',
      chips: Array.isArray(h.chips) ? h.chips.map((c: any) => c.label).filter(Boolean) : [],
      cta: { rotulo: h.acao ?? 'Ver', url: h.link ?? '#' },
      imagem: h.capa ?? null, cores: h.cor ?? undefined,
      ordem: h.ordem ?? 0,
    }))
    const destaquesReais: HomeDestaque[] = [...bannerSlides, ...heroSlides].sort((a, b) => a.ordem - b.ordem)
    // Posição do aluno na sua liga (KPI "Liga · Nº lugar" no MEQ) — count barato (head:true),
    // só quando a gamificação está ativa (há liga/xp). Sem isso o KPI mostrava "0º lugar".
    const posicaoLiga = gamResumo?.liga?.id
      ? await posicaoNaLiga(svc, sessao!.tenantId, gamResumo.liga.id, gamResumo.xpTotal ?? 0)
      : 0
    // KPIs reais da Início: "Questões resolvidas" (total de respostas objetivas do aluno em TODAS as
    // suas sessões) e "Taxa de acerto" (corretas / resolvidas). Dois counts (head:true) — sem puxar
    // linhas. A lista de sessões é pequena (dezenas), então `.in()` sem chunk é seguro aqui.
    let questoesResolvidas = 0
    let taxaAcerto = 0
    try {
      const sessIds = ((sessAll ?? []) as any[]).map((s) => s.id).filter(Boolean)
      if (sessIds.length) {
        const baseR = () => svc.from('simulado_respostas_objetivas').select('*', { count: 'exact', head: true }).in('sessao_id', sessIds)
        const [{ count: tot }, { count: corr }] = await Promise.all([baseR(), baseR().eq('correta', true)])
        questoesResolvidas = tot ?? 0
        if (questoesResolvidas > 0) taxaAcerto = Math.round(((corr ?? 0) / questoesResolvidas) * 100)
      }
    } catch { /* tolerante: mantém 0 se a contagem falhar */ }
    const homeData = montarHomeData({
      nomeCompleto: sessao!.nome,
      gamResumo, gamMissoes, gamSemana,
      recentes, grupos, progresso, destaquesReais,
      feitos: feitosSet.size,
      questoesResolvidas, taxaAcerto,
      chest,
      posicaoLiga,
      gamAtivo,
      // Cronograma desativado globalmente (flag) → esconde o card "Sua semana" na home.
      cronogramaAtivo: !OCULTAR_CRONOGRAMA,
      // Cargos/áreas do "Rumo a …" (rotativo): configurável por tenant. Sem config = estático.
      rotativo: Array.isArray((tenantRow?.tema as any)?.hero_rotativo) ? (tenantRow?.tema as any).hero_rotativo : undefined,
      // Marca → slide de boas-vindas (Revisão=redesign; VND/MEQ=plataforma nova).
      brand: aparencia.brand,
    })
    return <PlatformHome brand={aparencia.brand} theme={theme} data={homeData} />
  }

  return (
    <div className="animate-page space-y-6">
      {/* Aviso de mudança de gabarito saiu da home (era um card intrusivo): a recorreção já gera a
          notificação no sininho (simulado_notificacoes), então o aluno vê só por lá. */}
      {/* Celebração de XP (partículas voando para o card de nível) quando há XP recém-contabilizado. */}
      {gamResumo && <CelebracaoXp assistenteAtivo={assistente.ativo !== false} />}
      {gamResumo && assistente.ativo !== false && <MascoteTour nome={assistente.nome || 'Capi'} ativo temSimulado={feitosSet.size > 0} nivel={gamResumo.nivel} />}
      {/* Banners do tenant — UM carrossel só (banner + destaque + simulado) + pop-up. SÓ na Início. */}
      <BannersPortal banners={bannersSemSim.map((b) => ({ ...b, ordem: ordemGlobal.get(b.id) ?? 0, estilo: (destaquesBanner[b.id] as any)?.popupEstilo ?? null, pontas: (destaquesBanner[b.id] as any)?.popupPontas ?? null, textoPos: (destaquesBanner[b.id] as any)?.bannerTextoPos ?? null, textoCor: (destaquesBanner[b.id] as any)?.bannerTextoCor ?? null, textoTam: (destaquesBanner[b.id] as any)?.bannerTextoTam ?? null, textoX: (destaquesBanner[b.id] as any)?.bannerTextoX ?? null, textoY: (destaquesBanner[b.id] as any)?.bannerTextoY ?? null, ocultarTitulo: (destaquesBanner[b.id] as any)?.bannerOcultarTitulo ?? false, ocultarMensagem: (destaquesBanner[b.id] as any)?.bannerOcultarMensagem ?? false, freq: (destaquesBanner[b.id] as any)?.freq ?? null }))} simulados={heroSims} stats={mostrarDesempenhoBanner ? statsAluno : null} />

      <div className={cn('grid grid-cols-1 items-start gap-6', gamResumo && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
        {/* ── Coluna principal: nível + trilha + recentes + cursos e pacotes ── */}
        <div className="min-w-0 space-y-6">
          {gamResumo ? (
            <NivelCard nome={sessao!.nome} resumo={gamResumo} />
          ) : (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Sua área de estudos</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-[2rem]">Olá, {sessao!.nome.split(' ')[0]} 👋</h1>
              <p className="mt-1 text-muted-foreground">Bem-vindo à sua área de estudos.</p>
            </div>
          )}

          <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} progresso={progresso} recentes={recentes} full={!gamResumo} recentesConcluidos={recentes.length === 0 && feitosSet.size > 0} view={cardView} />
        </div>

        {/* ── Coluna direita: meta, sequência, missões, liga, conquistas ── */}
        {gamResumo && (
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
            {gamResumo.metaDiaXp > 0 && <div data-tour="meta"><MetaDiariaCard xpHoje={gamResumo.xpHoje} meta={gamResumo.metaDiaXp} /></div>}
            <div data-tour="sequencia"><StreakCalendario dias={gamSemana} streak={gamResumo.streakAtual} feitoHoje={gamResumo.feitoHoje} chestXp={chest?.xp ?? 0} chestCadaN={chest?.cada_n_dias ?? 0} /></div>
            {gamMissoes.length > 0 && <div data-tour="missoes"><MissoesLista missoes={gamMissoes} renova="meia-noite" /></div>}
            <LigaPainel ligas={gamConfig!.ligas} ligaAtual={gamResumo.liga.id} xpTotal={gamResumo.xpTotal} proximaNome={proxima?.nome ?? null} faltam={proxima ? Math.max(0, proxima.xp_min - gamResumo.xpTotal) : 0} />
            <div data-tour="ranking"><RankingLiga inicial="total" /></div>
            {gamConquistas.length > 0 && <div data-tour="conquistas"><ConquistasProgressoLista itens={gamConquistas} /></div>}
          </aside>
        )}
      </div>
    </div>
  )
}
