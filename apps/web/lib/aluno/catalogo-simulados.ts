import 'server-only'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { idsSimuladosGratuitos } from '@/lib/simulado/gratuito'
import { resolverVisualSimulados, type VisualSim } from '@/lib/aluno/simulado-visual'
import { resolverGruposCatalogo, type GrupoCatalogo } from '@/lib/aluno/grupos-catalogo'
import { montarItensSimulado, type ItemSimulado } from '@/lib/aluno/simulado-item'

/**
 * Catálogo de simulados do ALUNO — compute pesado compartilhado (backend-first, workstream B/D).
 *
 * O MESMO cálculo (acessos + matrículas + sessões + gratuitos → sims → visual/capa → estado do
 * card → grupos/pastas) rodava POR RENDER em várias telas do portal (/nova questões, home, etc.),
 * cada uma repetindo ~6 round-trips PostgREST + fan-out de `resolverVisualSimulados`/`resolverGruposCatalogo`.
 * Aqui o RESULTADO (já serializável) é memoizado por aluno no Redis (`remember`, TTL 60s): a 1ª carga
 * computa 1x, a navegação entre telas serve do cache. Dados de TENANT dentro do cálculo (visual/grupos/
 * gratuitos) NÃO ganham cache próprio aqui para não duplicar camadas — o cache por-aluno já os cobre.
 *
 * Contrato: devolve exatamente os mesmos `itens`/`grupos` que as telas já consumiam — só introduz cache.
 * `grupoPorSim` vai como Record (Map não é serializável no Redis). `restantes: Infinity` dos itens
 * ilimitados vira `null` após o round-trip JSON, mas as telas leem os booleanos já derivados
 * (`podeFazer`/`emAndamento`/`refazer`), nunca `restantes` cru — então é inócuo.
 */
export type CatalogoSimulados = {
  itens: ItemSimulado[]
  grupos: GrupoCatalogo[]
  /** simuladoId → grupoId (pasta-pai) ou null. Record porque Map não serializa no cache. */
  grupoPorSim: Record<string, string | null>
}

const VAZIO: CatalogoSimulados = { itens: [], grupos: [], grupoPorSim: {} }

export function chaveCatalogoSimulados(tenantId: string, estId: string): string {
  return `catalogo-sim:${tenantId}:${estId}`
}

/** Invalida o catálogo cacheado de UM aluno (ex.: ao finalizar um simulado → "feitos"/"recentes" mudam).
 * Limpa AMBAS as chaves por-aluno: o catálogo das áreas /nova (`catalogo-sim:`) e o catálogo LEGADO
 * da Início/Realizados (`catalogo-legado:`) — assim o `finalizar` continua com uma única chamada. */
export async function invalidarCatalogoSimulados(tenantId: string | null, estId: string | null): Promise<void> {
  if (!tenantId || !estId) return
  await Promise.all([
    esquecer(chaveCatalogoSimulados(tenantId, estId)),
    esquecer(chaveCatalogoLegado(tenantId, estId)),
  ])
}

async function computar(svc: any, tenantId: string, estId: string): Promise<CatalogoSimulados> {
  // Simulados atribuídos: matrícula liberada + acesso avulso + sessões (histórico) + gratuitos do tenant.
  const [{ data: mats }, { data: acs }, { data: sessAll }, gratuitoIds] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    idsSimuladosGratuitos(svc, tenantId).catch(() => [] as string[]),
  ])

  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
    ...(gratuitoIds ?? []),
  ].filter(Boolean))]
  if (!ids.length) return VAZIO

  // Maior prazo (acesso avulso) por simulado → estado "Prazo"/"Prazo expirado".
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }

  // owner_estudante_id IS NULL: exclui simulados PESSOAIS do aluno (catálogo oficial apenas).
  const sims = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_simulados')
    .select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at')
    .in('id', chunk).eq('deletado', false).is('owner_estudante_id', null).order('id', { ascending: true }))

  const sessoesPorSim = new Map<string, any[]>()
  for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }

  // Estado do card (status/janela/tentativas) + visual (capa/cor da pasta de origem) — loaders reusados.
  const visual = await resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras })))
  const itens = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.refazer || i.statusLabel === 'Agendado')

  // Grupos (pastas) a que os simulados pertencem (banco → pasta-pai).
  const { grupoPorSim, grupos } = await resolverGruposCatalogo(svc, itens.map((i) => ({ id: i.id, regras: i.regras })))

  return { itens, grupos, grupoPorSim: Object.fromEntries(grupoPorSim) }
}

/**
 * Catálogo de simulados do aluno, cacheado por aluno (TTL 60s). Tolerante a falha: qualquer erro no
 * cálculo degrada para catálogo vazio (a tela cai no seu próprio fallback), sem derrubar a página.
 */
export function carregarCatalogoSimulados(svc: any, tenantId: string, estId: string): Promise<CatalogoSimulados> {
  return remember(chaveCatalogoSimulados(tenantId, estId), 60, () => computar(svc, tenantId, estId).catch(() => VAZIO))
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * Catálogo LEGADO (SUPERSET) — Início (`/aluno`) e Realizados (`/aluno/simulados`)
 *
 * Essas 2 telas legadas (não migradas na Fase 5) rodavam POR RENDER o mesmo compute caro de catálogo:
 * ~4 leituras por-aluno (matrículas/acessos/sessões) + fetch dos simulados + o fan-out de
 * `resolverVisualSimulados` (capas, via prova_questoes → questao_pasta → pastas) e o `grupoPorSim` de
 * TODOS os sims. `carregarCatalogoSimulados` (áreas /nova) NÃO encaixa aqui porque devolve os `itens`
 * já derivados/filtrados — o legado precisa das LINHAS CRUAS (ex.: `pasta_id`, `tentativa_num`, sessões
 * completas) para montar vitrine/banners, pastas por `pasta_id`, maratona/desafio e Realizados.
 *
 * Então este loader cacheia a BASE SUPERSET crua, serializável (TTL 60s por aluno): as telas recebem
 * EXATAMENTE as mesmas linhas que já liam (projeção superset = união das 2 telas; campos extras são
 * inertes para quem não os usa). As derivações específicas de cada tela (montarItens, enunciado, árvore
 * de pastas, desafio, heroSims) seguem na própria tela — mas sobre dados já prontos, sem round-trip.
 *
 * Serialização: Maps viram Record no cache e são re-hidratados para Map na saída (uso drop-in `.get()`),
 * sem `Infinity`/`Date` cru (as telas leem booleanos/strings já derivados). `sims` inclui os gratuitos do
 * tenant (como a Início) — inerte para Realizados, que descarta sims sem sessão.
 * ───────────────────────────────────────────────────────────────────────────────────────────────── */

export type SessaoLegado = { id: string; simulado_id: string; status: string; nota: number | null; finalizado_em: string | null; tentativa_num: number | null }
export type SimLegado = { id: string; titulo: string; status: string; embed_token: string | null; regras: any; modo_aplicacao: string; data_inicio: string | null; data_fim: string | null; created_at: string | null; pasta_id: string | null }

export type CatalogoLegado = {
  mats: { simulado_id: string; liberado: boolean | null }[]
  acs: { simulado_id: string; expira_em: string | null }[]
  sessAll: SessaoLegado[]
  sims: SimLegado[]
  /** capa/cor/ícone por simulado (pasta de origem). Re-hidratado para Map (uso `.get()` drop-in). */
  visual: Map<string, VisualSim>
  /** simuladoId → grupo (pasta-pai do banco) de TODOS os sims — alimenta vitrine/banners da Início. */
  grupoPorSimAll: Map<string, string | null>
}

/** Forma serializável no cache (Maps → Record). */
type CatalogoLegadoSerial = {
  mats: CatalogoLegado['mats']
  acs: CatalogoLegado['acs']
  sessAll: CatalogoLegado['sessAll']
  sims: CatalogoLegado['sims']
  visual: Record<string, VisualSim>
  grupoPorSimAll: Record<string, string | null>
}

const VAZIO_LEGADO: CatalogoLegadoSerial = { mats: [], acs: [], sessAll: [], sims: [], visual: {}, grupoPorSimAll: {} }

export function chaveCatalogoLegado(tenantId: string, estId: string): string {
  return `catalogo-legado:${tenantId}:${estId}`
}

async function computarLegado(svc: any, tenantId: string, estId: string): Promise<CatalogoLegadoSerial> {
  const [{ data: mats }, { data: acs }, { data: sessAll }, gratuitoIds] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em, tentativa_num').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    idsSimuladosGratuitos(svc, tenantId).catch(() => [] as string[]),
  ])

  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
    ...(gratuitoIds ?? []),
  ].filter(Boolean))]
  if (!ids.length) return { mats: (mats ?? []) as any, acs: (acs ?? []) as any, sessAll: (sessAll ?? []) as any, sims: [], visual: {}, grupoPorSimAll: {} }

  // owner_estudante_id IS NULL: exclui simulados PESSOAIS (catálogo oficial apenas). fetchAllByIn (chunk 80,
  // .order('id')) evita o hang de `.in()` com lista grande e o teto de ~1000 linhas.
  const sims = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_simulados')
    .select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at, pasta_id')
    .in('id', chunk).eq('deletado', false).is('owner_estudante_id', null).order('id', { ascending: true }))

  const [visual, grupoAll] = await Promise.all([
    resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras }))),
    resolverGruposCatalogo(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras }))),
  ])

  return {
    mats: (mats ?? []) as any,
    acs: (acs ?? []) as any,
    sessAll: (sessAll ?? []) as any,
    sims: sims as any,
    visual: Object.fromEntries(visual),
    grupoPorSimAll: Object.fromEntries(grupoAll.grupoPorSim),
  }
}

/**
 * Base SUPERSET do catálogo legado (Início + Realizados), cacheada por aluno (TTL 60s). Tolerante a
 * falha: qualquer erro degrada para base vazia (cada tela cai no próprio fallback). Re-hidrata os Maps.
 */
export async function carregarCatalogoLegado(svc: any, tenantId: string, estId: string): Promise<CatalogoLegado> {
  const bruto = await remember(chaveCatalogoLegado(tenantId, estId), 60, () => computarLegado(svc, tenantId, estId).catch(() => VAZIO_LEGADO))
  return {
    mats: bruto.mats,
    acs: bruto.acs,
    sessAll: bruto.sessAll,
    sims: bruto.sims,
    visual: new Map(Object.entries(bruto.visual)),
    grupoPorSimAll: new Map(Object.entries(bruto.grupoPorSimAll)),
  }
}
