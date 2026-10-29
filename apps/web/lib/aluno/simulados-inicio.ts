import 'server-only'

// PORTE FIEL da montagem de "Simulados recentes" + "Pastas de simulados" da Início (app/aluno/(portal)/
// page.tsx, caminho SEM `pasta` selecionada, ~linhas 110-221) para a aba "Simulado Revisão" de
// /aluno/simulados. Reusa os MESMOS helpers e a MESMA base cacheada (carregarCatalogoLegado), e mapeia
// para `HomeSimuladoCard[]` / `HomePasta[]` EXATAMENTE como lib/aluno/home-nova.ts:45-71. Backend-first:
// dado pronto, determinístico e idêntico ao que a Início mostra.

import { carregarCatalogoLegado } from '@/lib/aluno/catalogo-simulados'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverGruposCatalogo, type GrupoCatalogo } from '@/lib/aluno/grupos-catalogo'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { resolverBancasSimulados } from '@/lib/aluno/banca-simulado'
import type { HomeSimuladoCard, HomePasta } from '@/components/brand/interna/home/types'

export async function carregarSimuladosInicio(
  svc: any,
  tenantId: string,
  estId: string,
): Promise<{ recentes: HomeSimuladoCard[]; pastas: HomePasta[] }> {
  const base = await carregarCatalogoLegado(svc, tenantId, estId)
  const { acs, sessAll, sims, visual } = base

  // Maior prazo (acesso avulso) por simulado → estado "Prazo"/"Prazo expirado".
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }

  const sessoesPorSim = new Map<string, any[]>()
  for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  const feitosSet = new Set(sims.filter((s: any) => (sessoesPorSim.get(s.id) ?? []).some((x: any) => x.status === 'finalizada')).map((s: any) => s.id))
  // Pasta (folder_area='simulado') de cada simulado no admin.
  const pastaBySim = new Map<string, string | null>(sims.map((s: any) => [s.id, s.pasta_id ?? null]))

  const itensAll = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.refazer || i.statusLabel === 'Agendado')

  // Grupo (pasta) + enunciado de cada simulado — independentes, buscados em paralelo.
  const [{ grupoPorSim, grupos }, enunUrls] = await Promise.all([
    resolverGruposCatalogo(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras }))),
    resolverEnunciadoUrls(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras }))),
  ])

  const itensCat = itensAll.map((i) => {
    const info = enunUrls.get(i.id)
    const liberado = (i.regras as any)?.enunciado_liberado !== false
    const url = !liberado ? null
      : info?.pdf ? info.pdf
      : (info?.temCaderno && i.embed_token) ? `/api/aluno/caderno-teste-questoes?token=${encodeURIComponent(i.embed_token)}` : null
    return { ...i, grupoId: grupoPorSim.get(i.id) ?? null, pastaId: pastaBySim.get(i.id) ?? null, enunciadoUrl: url }
  })

  // Progresso por pasta (concluídos / total dos acessíveis).
  const progresso: Record<string, { total: number; done: number }> = {}
  for (const g of grupos) {
    const inGrp = itensCat.filter((s) => s.grupoId === g.id)
    progresso[g.id] = { total: inGrp.length, done: inGrp.filter((s) => feitosSet.has(s.id)).length }
  }

  // DESAFIO (maratona): pasta/recentes do desafio só aparecem se o admin ligar (desafio_jogo.config).
  const ocultarPastaDesafio = new Set<string>()
  const ocultarRecenteDesafio = new Set<string>()
  try {
    const { data: desRows } = await svc.from('simulado_pastas')
      .select('id, desafio_jogo').eq('tenant_id', tenantId).eq('folder_area', 'maratona').eq('deletado', false)
    for (const d of (desRows ?? []) as any[]) {
      const cfg = d.desafio_jogo?.config ?? {}
      if (cfg.mostrarNasPastas !== true) ocultarPastaDesafio.add(d.id)
      if (cfg.mostrarNosRecentes !== true) ocultarRecenteDesafio.add(d.id)
    }
  } catch { /* sem desafios → nada a ocultar */ }
  const itensHome = itensCat.filter((i) => !(i.pastaId && ocultarPastaDesafio.has(i.pastaId)))

  // Pastas do ALUNO espelham a "Aplicação de Simulados" do admin (árvore de pasta_id): raiz da Aplicação
  // (preferida) OU grupo do catálogo (banco) como fallback. Idêntico ao caminho SEM `pasta` da Início.
  let pastasHome: GrupoCatalogo[] = grupos
  {
    const appFolders = await (async (): Promise<any[]> => {
      try {
        const r = await svc.from('simulado_pastas')
          .select('id, nome, cor, icone, capa_url, capa_card_url, pai_id, is_folder, folder_area')
          .eq('tenant_id', tenantId).eq('is_folder', true).eq('deletado', false)
        return ((r.data ?? []) as any[]).filter((f) => f.folder_area === 'simulado')
      } catch { return [] }
    })()
    const appById = new Map<string, any>(appFolders.map((f) => [f.id, f]))
    const topApp = (pid: string | null): string | null => {
      let cur = pid ? appById.get(pid) : null
      const seen = new Set<string>()
      while (cur && cur.pai_id && appById.has(cur.pai_id) && !seen.has(cur.id)) { seen.add(cur.id); cur = appById.get(cur.pai_id) }
      return cur?.id ?? null
    }
    const grupoHomeDe = (s: any): string | null => (s.pastaId ? topApp(s.pastaId) : null) ?? s.grupoId ?? null
    const visualById = new Map<string, GrupoCatalogo>()
    for (const g of grupos) visualById.set(g.id, g)
    for (const f of appFolders) if (!visualById.has(f.id)) visualById.set(f.id, { id: f.id, nome: f.nome, cor: f.cor ?? null, icone: f.icone ?? null, capa: f.capa_url ?? null, capaCard: f.capa_card_url ?? null })
    const progHome: Record<string, { total: number; done: number }> = {}
    for (const s of itensHome) {
      const gid = grupoHomeDe(s)
      if (!gid || ocultarPastaDesafio.has(gid)) continue
      const p = progHome[gid] ?? { total: 0, done: 0 }
      p.total++; if (feitosSet.has(s.id)) p.done++
      progHome[gid] = p
    }
    for (const [k, v] of Object.entries(progHome)) progresso[k] = v
    pastasHome = (Object.keys(progHome).map((id) => visualById.get(id)).filter(Boolean) as GrupoCatalogo[])
      .filter((g) => !ocultarPastaDesafio.has(g.id))
  }

  // Recentes: disponíveis/agendados que o aluno AINDA NÃO concluiu (mantém os em andamento). Mais novos 1º.
  const lancamento = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
  const recentes = itensCat
    .filter((i) => (i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado') && (!feitosSet.has(i.id) || i.emAndamento))
    .filter((i) => !(i.pastaId && ocultarRecenteDesafio.has(i.pastaId)))
    .sort((a, b) => lancamento(b) - lancamento(a))
    .slice(0, 5)

  // Banca PREDOMINANTE dos recentes (via questões → banca) — coluna "Banca" dos cards.
  const bancaPorSim = await resolverBancasSimulados(svc, tenantId, recentes.map((i) => i.id))
  const recentesEnriquecidos = recentes.map((i) => ({ ...i, banca: bancaPorSim.get(i.id) ?? '' }))

  // Mapeamento final → HomeSimuladoCard[] / HomePasta[] (cópia EXATA de lib/aluno/home-nova.ts:45-71).
  const recentesCards: HomeSimuladoCard[] = recentesEnriquecidos.map((i: any) => ({
    id: String(i.id),
    titulo: i.titulo ?? 'Simulado',
    capa: { rotulo: (i.titulo ?? 'Simulado').slice(0, 18), sub: i.banca ?? '', cores: i.vis?.cor ?? undefined, capa: i.vis?.capa ?? i.vis?.capaBanner ?? null },
    tipo: i.refazer ? 'Prova real' : 'Inédito',
    banca: i.banca ?? '',
    quando: i.quando ?? '',
    status: i.statusLabel ?? (i.emAndamento ? 'Em andamento' : i.refazer ? 'Concluído' : 'Não iniciado'),
    progresso: typeof i.progresso === 'number' ? i.progresso : 0,
    cadernoUrl: i.enunciadoUrl ?? undefined,
    fazerUrl: i.embed_token ? `/simulado/${i.embed_token}` : null,
  }))

  const pastasCards: HomePasta[] = pastasHome.map((g: any) => ({
    id: String(g.id),
    nome: g.nome ?? 'Pasta',
    rotuloCapa: (g.nome ?? 'Pasta').slice(0, 14),
    subCapa: '',
    qtdSimulados: progresso[g.id]?.total ?? 0,
    concluidos: progresso[g.id]?.done ?? 0,
    categoria: 'todas',
    capa: g.capaCard ?? g.capa ?? null,
    cor: g.cor ?? null,
  }))

  return { recentes: recentesCards, pastas: pastasCards }
}
