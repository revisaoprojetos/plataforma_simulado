import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverGruposCatalogo } from '@/lib/aluno/grupos-catalogo'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { BannersPortal, type HeroSimSlide, type BannerChip, type BannerStats } from '@/components/aluno/banners-portal'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import { idsSimuladosGratuitos } from '@/lib/simulado/gratuito'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { SimuladosCatalogoAluno, type ItemSimuladoCat, type ProgressoGrupo } from '@/components/aluno/simulados-catalogo-aluno'
import { SemAcessoModal } from '@/components/aluno/sem-acesso-modal'
import { getGamConfig } from '@/lib/gamificacao'
import { resumoGamificacao, missoesHoje, atividadeSemana, conquistasProgresso } from '@/lib/gamificacao/leitura'
import { NivelCard } from '@/components/aluno/nivel-card'
import { MetaDiariaCard } from '@/components/aluno/meta-diaria-card'
import { MissoesLista } from '@/components/aluno/missoes-lista'
import { StreakCalendario } from '@/components/aluno/streak-calendario'
import { TrilhaSimulados, type Trilha } from '@/components/aluno/trilha-simulados'
import { LigaPainel } from '@/components/aluno/liga-painel'
import { RankingLiga } from '@/components/aluno/ranking-liga'
import { ConquistasProgressoLista } from '@/components/aluno/conquistas-progresso'
import { CelebracaoXp } from '@/components/aluno/celebracao-xp'
import { MascoteTour } from '@/components/mascote/mascote-tour'
import { getCurrentTenant } from '@/lib/tenant'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default async function AlunoHome({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ data: mats }, { data: acs }, { data: sessAll }, { data: banRows }, { data: tenantRow }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('simulado_id, status, nota, finalizado_em').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    // Mesma ordenação do console (ordem asc, empate por criado_em DESC) para o carrossel bater com a lista de Avisos.
    svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
    svc.from('simulado_tenants').select('tema').eq('id', sessao!.tenantId).maybeSingle(),
  ])
  // Painel de desempenho (KPIs) nos banners de simulado: só quando o tenant liga (default OFF).
  const mostrarDesempenhoBanner = (tenantRow?.tema as any)?.banners_desempenho === true
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
    sims = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at').in('id', chunk).eq('deletado', false).order('id', { ascending: true }))
    for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }
  const feitosSet = new Set(sims.filter((s) => (sessoesPorSim.get(s.id) ?? []).some((x) => x.status === 'finalizada')).map((s) => s.id))

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
    return { ...i, grupoId: grupoPorSim.get(i.id) ?? null, enunciadoUrl: url }
  })

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

  // Assistente/mascote (config do tenant) — usada no tour de novidades da gamificação.
  const tenant = await getCurrentTenant()
  const assistente = ((tenant?.tema as any)?.assistente ?? {}) as { ativo?: boolean; nome?: string }

  // Gamificação (hero + missões + calendário de sequência) — só quando o tenant ativou.
  const gamConfig = await getGamConfig(svc, sessao!.tenantId)
  const [gamResumo, gamMissoes, gamSemana, gamConquistas] = gamConfig?.ativo
    ? await Promise.all([
        resumoGamificacao(svc, sessao!.tenantId, estId, gamConfig),
        missoesHoje(svc, sessao!.tenantId, estId, gamConfig),
        atividadeSemana(svc, sessao!.tenantId, estId, gamConfig.timezone),
        conquistasProgresso(svc, sessao!.tenantId, estId, gamConfig),
      ])
    : [null, [], [], []]

  // Trilhas de simulados (estilo Duolingo): por grupo, nós concluído → atual → bloqueado.
  const baseXp = gamConfig?.ativo ? (gamConfig.xp_regras.simulado.base || 0) : 0
  // Contagem de questões (válidas) por simulado das trilhas — para exibir "· N questões".
  const cntQ = new Map<string, number>()
  {
    const idsTrilha = [...new Set(itensCat.map((i) => i.id))]
    if (idsTrilha.length) {
      const rows = await fetchAllByIn<any>(idsTrilha, (chunk) => svc.from('simulado_prova_questoes').select('simulado_id, anulada').in('simulado_id', chunk).order('simulado_id'))
      for (const r of rows) if (!r.anulada) cntQ.set(r.simulado_id, (cntQ.get(r.simulado_id) ?? 0) + 1)
    }
  }
  const lanc = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
  // Ordem da trilha: prioriza a DATA no título ("DD/MM/AAAA – …"); senão, publicado_em/created_at.
  const dataTitulo = (tit?: string) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(tit || ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null }
  const ordKey = (i: any) => dataTitulo(i.titulo) ?? lanc(i)
  // Baús de trilha já resgatados (evento de chest no ledger) — estado autoritativo do servidor.
  let bausResgatados = new Set<string>()
  if (gamConfig?.ativo) {
    try {
      const { data } = await svc.from('simulado_xp_eventos').select('ref_id').eq('tenant_id', sessao!.tenantId).eq('estudante_id', estId).eq('origem', 'chest').like('ref_id', 'trilha:%')
      bausResgatados = new Set((data ?? []).map((r: any) => String(r.ref_id).slice('trilha:'.length)))
    } catch { /* tolerante */ }
  }

  const trilhas: Trilha[] = grupos.map((g) => {
    const its = itensCat.filter((i) => i.grupoId === g.id).sort((a, b) => ordKey(a) - ordKey(b) || (a.titulo || '').localeCompare(b.titulo || ''))
    // Sem bloqueio: todos os simulados ficam disponíveis em qualquer ordem. O 1º não feito
    // ganha o destaque "atual" (Comece aqui), mas todos podem ser feitos.
    let primeiroPendente = true
    const nodes = its.map((i) => {
      const sess = sessoesPorSim.get(i.id) ?? []
      const notas = sess.filter((s: any) => s.status === 'finalizada' && s.nota != null).map((s: any) => Number(s.nota))
      const done = feitosSet.has(i.id)
      const acerto = notas.length ? Math.round(Math.max(...notas)) : null
      let estado: 'concluido' | 'atual' | 'disponivel'
      if (done) estado = 'concluido'
      else if (primeiroPendente) { estado = 'atual'; primeiroPendente = false }
      else estado = 'disponivel'
      const runner = i.embed_token ? `/simulado/${i.embed_token}` : `/aluno/simulados/${i.id}`
      const podeRefazer = i.refazer || i.podeFazer || i.emAndamento
      const href = done ? (podeRefazer ? runner : `/aluno/simulados/${i.id}`) : runner
      const acao = done ? (podeRefazer ? 'Refazer' : 'Ver resultado') : i.emAndamento ? 'Continuar' : 'Fazer agora'
      const vis = visual.get(i.id)
      const capa = vis?.capa ?? null
      // Banner "comprido" do banco (capa_url) — encaixa no card largo da trilha como fundo.
      const capaBanner = vis?.capaBanner ?? vis?.capa ?? null
      const nota = notas.length ? Math.max(...notas) : null
      return { id: i.id, titulo: i.titulo, quando: i.quando, estado, acerto, nota, tentativas: notas.length, statusLabel: i.statusLabel, questoes: cntQ.get(i.id) ?? 0, xp: baseXp, href, acao, capa, capaBanner, cadernoUrl: i.enunciadoUrl ?? null }
    })
    return { id: g.id, nome: g.nome, cor: g.cor ?? null, capa: (g as any).capa ?? null, capaCard: (g as any).capaCard ?? null, total: nodes.length, done: nodes.filter((n) => n.estado === 'concluido').length, trilhaXp: baseXp * nodes.length, bauResgatado: bausResgatados.has(g.id), nodes }
  }).filter((tr) => tr.nodes.length > 0)

  const chest = gamConfig?.xp_regras.chest
  const proxima = gamResumo?.proxima ?? null

  // Aviso de mudança de gabarito na home: simulados que o aluno FEZ e que tiveram anulação/troca
  // de gabarito DEPOIS da sessão dele (nota recalculada). Deriva de simulado_recorrecoes.
  let avisosGabarito: { id: string; titulo: string }[] = []
  if (feitosSet.size) {
    const ultimaPorSim = new Map<string, number>()
    for (const s of (sessAll ?? []) as any[]) {
      if (s.status !== 'finalizada' || !s.finalizado_em) continue
      const t = new Date(s.finalizado_em).getTime()
      if (!ultimaPorSim.has(s.simulado_id) || t > ultimaPorSim.get(s.simulado_id)!) ultimaPorSim.set(s.simulado_id, t)
    }
    const { data: recs } = await svc.from('simulado_recorrecoes').select('simulado_id, executado_em').in('simulado_id', [...feitosSet])
    const afetados = new Set<string>()
    for (const r of (recs ?? []) as any[]) {
      const fin = ultimaPorSim.get(r.simulado_id)
      if (fin && r.executado_em && new Date(r.executado_em).getTime() > fin) afetados.add(r.simulado_id)
    }
    avisosGabarito = sims.filter((s) => afetados.has(s.id)).map((s) => ({ id: s.id, titulo: s.titulo }))
  }

  return (
    <div className="animate-page space-y-6">
      {avisosGabarito.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Mudança de gabarito em {avisosGabarito.length === 1 ? 'um simulado que você fez' : `${avisosGabarito.length} simulados que você fez`}</p>
            <p className="text-xs opacity-90">{avisosGabarito.map((a) => a.titulo).join(' · ')} — sua nota já foi recalculada; confira o resultado atualizado.</p>
          </div>
        </div>
      )}
      {/* Celebração de XP (partículas voando para o card de nível) quando há XP recém-contabilizado. */}
      {gamResumo && <CelebracaoXp assistenteAtivo={assistente.ativo !== false} />}
      {gamResumo && assistente.ativo !== false && <MascoteTour nome={assistente.nome || 'Capi'} ativo temSimulado={feitosSet.size > 0} nivel={gamResumo.nivel} />}
      {/* Banners do tenant — UM carrossel só (banner + destaque + simulado) + pop-up. SÓ na Início. */}
      <BannersPortal banners={bannersSemSim.map((b) => ({ ...b, ordem: ordemGlobal.get(b.id) ?? 0, estilo: (destaquesBanner[b.id] as any)?.popupEstilo ?? null, pontas: (destaquesBanner[b.id] as any)?.popupPontas ?? null, textoPos: (destaquesBanner[b.id] as any)?.bannerTextoPos ?? null, textoCor: (destaquesBanner[b.id] as any)?.bannerTextoCor ?? null, textoTam: (destaquesBanner[b.id] as any)?.bannerTextoTam ?? null, textoX: (destaquesBanner[b.id] as any)?.bannerTextoX ?? null, textoY: (destaquesBanner[b.id] as any)?.bannerTextoY ?? null, ocultarTitulo: (destaquesBanner[b.id] as any)?.bannerOcultarTitulo ?? false, ocultarMensagem: (destaquesBanner[b.id] as any)?.bannerOcultarMensagem ?? false, freq: (destaquesBanner[b.id] as any)?.freq ?? null }))} simulados={heroSims} stats={mostrarDesempenhoBanner ? statsAluno : null} />

      <div className={cn('grid items-start gap-6', gamResumo && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
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

          {gamResumo && trilhas.length > 0 && <TrilhaSimulados trilhas={trilhas} gamAtivo={!!gamResumo} estilo={gamConfig?.trilha_estilo ?? 'cards'} visiveis={gamConfig?.trilha_visiveis ?? 3} />}

          {/* Divisória horizontal (quase às bordas) separando a trilha dos simulados recentes. */}
          {gamResumo && trilhas.length > 0 && <div className="mx-auto h-px w-[92%]" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 24%, transparent) 18%, color-mix(in oklab, var(--foreground) 24%, transparent) 82%, transparent)' }} />}

          <SimuladosCatalogoAluno itens={itensCat} grupos={grupos} progresso={progresso} recentes={recentes} full={!gamResumo} recentesConcluidos={recentes.length === 0 && feitosSet.size > 0} />
        </div>

        {/* ── Coluna direita: meta, sequência, missões, liga, conquistas ── */}
        {gamResumo && (
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
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
