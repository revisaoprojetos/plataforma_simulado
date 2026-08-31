import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SimuladosBoard, type SimuladoCard } from '@/components/admin/simulados-board'
import { NovoSimuladoDialog } from '@/components/admin/novo-simulado-dialog'
import { onlinePorSimulado } from '@/app/admin/simulados/actions'
import { tiposDeSimulados, type TipoSimulado } from '@/lib/simulado/tipo'
import { resolverVisualSimulados, type VisualSim } from '@/lib/aluno/simulado-visual'
import { resolverCardView } from '@/lib/card-view'
import { getOcultarDiscursiva } from '@/lib/sistema/manutencao-areas-server'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { simuladosTiposSql } from '@/lib/data/simulados.repo'

// Hash estável (djb2) do CONJUNTO de simulados → chave de cache. Muda ao criar/excluir/publicar
// simulado (recomputa), e é invalidada por import/re-correção (invalidarRelatorios).
function hashIds(ids: string[]): string {
  let h = 5381
  const s = [...ids].sort().join(',')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + '.' + ids.length
}

export default async function SimuladosPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta: pastaParam } = await searchParams
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
          <p className="text-muted-foreground">Gerencie provas, agendamentos e publicações.</p>
        </div>
        <NovoSimuladoDialog
          trigger={
            <button type="button" className={buttonVariants()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo simulado
            </button>
          }
        />
      </div>

      {/* O shell (título + botão) aparece na hora; o board (leituras pesadas) entra por streaming. */}
      <Suspense key={pastaParam ?? 'raiz'} fallback={<BoardSkeleton />}>
        <BoardData pastaParam={pastaParam} />
      </Suspense>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />)}
      </div>
    </div>
  )
}

async function BoardData({ pastaParam }: { pastaParam?: string }) {
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Simulados + pastas (Aplicação) + bancos + flag ocultar-discursiva em PARALELO (independentes).
  const [simulados, folders, bancos, ocultarDiscursiva] = await Promise.all([
    // Simulados (tolerante à coluna pasta_id ausente). owner_estudante_id IS NULL: só OFICIAIS
    // (os do construtor pessoal do aluno ficam de fora). fetchAll: tenant com >1000 não trunca.
    (async (): Promise<any[]> => {
      const base = 'id, titulo, status, data_inicio, data_fim, modo_aplicacao, tempo_limite_min, embed_token, created_at, regras'
      // Dentro de uma pasta (?pasta=id) buscamos SÓ os simulados dela — bem mais leve que puxar TODOS
      // (com regras jsonb) a cada navegação. Na raiz (sem pastaParam) traz todos, como antes.
      const buscar = (cols: string, comPasta: boolean) => fetchAll<any>(() => {
        let q = supabase.from('simulado_simulados').select(cols).eq('deletado', false).eq('tenant_id', tid).is('owner_estudante_id', null)
        if (comPasta && pastaParam) q = q.eq('pasta_id', pastaParam)
        return q.order('created_at', { ascending: false }).order('id', { ascending: true })
      })
      let sims: any[]
      try { sims = await buscar(`${base}, pasta_id`, true) }
      catch (e: any) { if (/pasta_id|column/i.test(e?.message ?? '')) sims = await buscar(base, false); else throw e }
      return sims.map((s: any) => ({ ...s, pasta_id: s.pasta_id ?? null }))
    })(),
    // Pastas da Aplicação de Simulado (is_folder + folder_area='simulado'), tolerante a colunas ausentes.
    (async (): Promise<any[]> => {
      const selP = (cols: string) => supabase.from('simulado_pastas').select(cols).eq('deletado', false).eq('tenant_id', tid).order('nome')
      let r: { data: any[] | null; error: { message: string } | null } = await selP('id, nome, cor, icone, capa_url, capa_card_url, is_folder, folder_area')
      if (r.error) r = await selP('id, nome, cor, icone, capa_url, is_folder, folder_area')
      return r.error ? [] : (r.data ?? []).filter((p: any) => p.is_folder && p.folder_area === 'simulado')
    })(),
    // Bancos (Banco de Simulado) p/ agrupar o CATÁLOGO — a pasta-pai (is_folder) é a fileira.
    (async (): Promise<any[]> => {
      const selB = (cols: string) => supabase.from('simulado_pastas').select(cols).eq('deletado', false).eq('tenant_id', tid)
      let r: { data: any[] | null; error: { message: string } | null } = await selB('id, nome, cor, icone, capa_url, capa_card_url, is_folder, folder_area, pai_id, tipo')
      if (r.error) r = await selB('id, nome, cor, icone, is_folder, pai_id')
      return (r.data ?? []).filter((p: any) => p.folder_area !== 'simulado' && p.folder_area !== 'caderno')
    })(),
    getOcultarDiscursiva(),
  ])
  const bancoById = new Map<string, any>(bancos.map((b) => [b.id, b]))
  // Pasta (is_folder) que contém o banco do simulado — é a fileira do catálogo (null = avulso).
  const grupoDoBanco = (bancoId: string | null | undefined): any | null => {
    if (!bancoId) return null
    const b = bancoById.get(bancoId)
    const pai = b?.pai_id ? bancoById.get(b.pai_id) : null
    return pai?.is_folder ? pai : null
  }

  // tipos (varre prova_questoes) + visual (capas) são CAROS e mudam pouco → memoizados por conjunto
  // de simulados. Map ⇄ objeto para caber no JSON do cache. Invalidados por import/re-correção.
  const simIds = simulados.map((s) => s.id)
  // Tipo pelo BANCO (barato) quando o simulado herda de um banco tipado; só os demais varrem questões.
  const tipoDoBanco = new Map<string, string>(bancos.filter((b) => !b.is_folder && (b.tipo === 'objetiva' || b.tipo === 'discursiva')).map((b) => [b.id, b.tipo]))
  // Tipo dos simulados sem tipo herdado do banco: 1 query agregada SQL-direto (packages/data),
  // com fallback automático para o fan-out PostgREST quando o SQL direto está desligado (sem DATABASE_URL).
  const tiposDosFaltantes = async (ids: string[]): Promise<Map<string, TipoSimulado | null>> => {
    if (!ids.length) return new Map()
    const rows = await simuladosTiposSql(ids, tid)
    if (rows) {
      const m = new Map<string, TipoSimulado | null>(ids.map((id) => [id, null]))
      for (const r of rows) m.set(r.simulado_id, r.tem_obj && r.tem_dis ? 'mista' : r.tem_dis ? 'discursiva' : r.tem_obj ? 'objetiva' : null)
      return m
    }
    return tiposDeSimulados(supabase, ids) // SQL direto indisponível → PostgREST
  }
  // tipos/visual (cacheados) e "online" (ao vivo, fresco) rodam SOBREPOSTOS — não dependem um do outro.
  const [tv, online] = await Promise.all([
    remember(chaveRelatorio(tenantId, 'board-tv', hashIds(simIds)), TTL_RELATORIO, async () => {
      const tiposPre = new Map<string, TipoSimulado | null>()
      const faltam: string[] = []
      for (const s of simulados) {
        const bt = tipoDoBanco.get((s.regras as any)?.banco_base_id)
        if (bt === 'objetiva' || bt === 'discursiva') tiposPre.set(s.id, bt)
        else faltam.push(s.id)
      }
      const [tiposScan, visual] = await Promise.all([
        tiposDosFaltantes(faltam), // SQL direto (agregado) → fallback PostgREST
        resolverVisualSimulados(supabase, simulados.map((s) => ({ id: s.id, regras: s.regras }))),
      ])
      const tipos = new Map(tiposPre)
      for (const [k, v] of tiposScan) tipos.set(k, v)
      return { tipos: Object.fromEntries(tipos), visual: Object.fromEntries(visual) }
    }),
    // "online" cacheado por 15s: o board atualiza ao vivo por SSE/polling, então este valor é só o
    // ponto de partida — 15s de defasagem evita revarrer as sessões a cada recarga rápida.
    remember(chaveRelatorio(tenantId, 'online', hashIds(simIds)), 15, () => onlinePorSimulado(simIds)),
  ])
  const tipos = new Map<string, TipoSimulado | null>(Object.entries(tv.tipos))
  const visual = new Map<string, VisualSim>(Object.entries(tv.visual) as [string, VisualSim][])

  const comTipo = simulados.map((s) => ({ ...s, tipo: tipos.get(s.id) ?? null, vis: visual.get(s.id) ?? null }))
    .filter((s) => !ocultarDiscursiva || s.tipo !== 'discursiva')

  // Nº de simulados por pasta.
  const contPasta = new Map<string, number>()
  for (const s of comTipo) if (s.pasta_id) contPasta.set(s.pasta_id, (contPasta.get(s.pasta_id) ?? 0) + 1)

  // Nível atual: dentro de uma pasta (?pasta=id) ou raiz. Pastas de nível único.
  const current = pastaParam ? folders.find((f) => f.id === pastaParam) ?? null : null
  const simsNivel = current ? comTipo.filter((s) => s.pasta_id === current.id) : comTipo.filter((s) => !s.pasta_id)
  const foldersNivel = current ? [] : folders

  const capa = (b: any) => (b.capa_card_url ?? b.capa_url) ?? null
  const foldersOut = foldersNivel.map((f) => ({ id: f.id, nome: f.nome, cor: f.cor ?? null, icone: f.icone ?? null, capa: capa(f), count: contPasta.get(f.id) ?? 0 }))
  const destinos = folders.map((f) => ({ id: f.id, nome: f.nome }))

  // Catálogo (view horizontal estilo Netflix): simulados agrupados pela PASTA DO BANCO de simulado
  // (o "grupo" no Banco de Simulado). Só entram no catálogo os que têm grupo; os avulsos ficam à parte.
  // Ordem: mais recente → mais antigo (created_at DESC — já vem assim da query).
  const catalogoSims = comTipo.map((s) => ({ ...s, grupoId: grupoDoBanco((s.regras as any)?.banco_base_id)?.id ?? null }))
  const contGrupo = new Map<string, number>()
  for (const s of catalogoSims) if (s.grupoId) contGrupo.set(s.grupoId, (contGrupo.get(s.grupoId) ?? 0) + 1)
  const catalogoGrupos = bancos
    .filter((b) => b.is_folder && contGrupo.has(b.id))
    .map((b) => ({ id: b.id, nome: b.nome, cor: b.cor ?? null, icone: b.icone ?? null, capa: (b.capa_card_url ?? b.capa_url) ?? null, count: contGrupo.get(b.id) ?? 0 }))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  // Estilo dos cards definido no console (tema.card_view) — o admin apenas obedece.
  const { data: tenantTema } = await supabase.from('simulado_tenants').select('tema').eq('id', tid).maybeSingle()
  const cardView = resolverCardView((tenantTema?.tema as any)?.card_view)

  return (
    <SimuladosBoard
      simulados={simsNivel as SimuladoCard[]}
      appUrl={appUrl}
      onlineInicial={online}
      folders={foldersOut}
      destinos={destinos}
      atual={current ? { id: current.id, nome: current.nome } : null}
      catalogo={{ sims: catalogoSims as (SimuladoCard & { grupoId: string | null })[], grupos: catalogoGrupos }}
      cardView={cardView}
    />
  )
}
