import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SimuladosBoard, type SimuladoCard } from '@/components/admin/simulados-board'
import { onlinePorSimulado } from '@/app/admin/simulados/actions'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { getOcultarDiscursiva } from '@/lib/sistema/manutencao-areas-server'

export default async function SimuladosPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta: pastaParam } = await searchParams
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'
  const ocultarDiscursiva = await getOcultarDiscursiva()

  // Simulados + pastas (Aplicação) + bancos em PARALELO — 3 leituras independentes (só dependem do tenant).
  const [simulados, folders, bancos] = await Promise.all([
    // Simulados (tolerante à coluna pasta_id ausente). owner_estudante_id IS NULL: só OFICIAIS
    // (os do construtor pessoal do aluno ficam de fora). fetchAll: tenant com >1000 não trunca.
    (async (): Promise<any[]> => {
      const base = 'id, titulo, status, data_inicio, data_fim, modo_aplicacao, tempo_limite_min, embed_token, created_at, regras'
      const buscar = (cols: string) => fetchAll<any>(() => supabase.from('simulado_simulados').select(cols).eq('deletado', false).eq('tenant_id', tid).is('owner_estudante_id', null).order('created_at', { ascending: false }).order('id', { ascending: true }))
      let sims: any[]
      try { sims = await buscar(`${base}, pasta_id`) }
      catch (e: any) { if (/pasta_id|column/i.test(e?.message ?? '')) sims = await buscar(base); else throw e }
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
      let r: { data: any[] | null; error: { message: string } | null } = await selB('id, nome, cor, icone, capa_url, capa_card_url, is_folder, folder_area, pai_id')
      if (r.error) r = await selB('id, nome, cor, icone, is_folder, pai_id')
      return (r.data ?? []).filter((p: any) => p.folder_area !== 'simulado' && p.folder_area !== 'caderno')
    })(),
  ])
  const bancoById = new Map<string, any>(bancos.map((b) => [b.id, b]))
  // Pasta (is_folder) que contém o banco do simulado — é a fileira do catálogo (null = avulso).
  const grupoDoBanco = (bancoId: string | null | undefined): any | null => {
    if (!bancoId) return null
    const b = bancoById.get(bancoId)
    const pai = b?.pai_id ? bancoById.get(b.pai_id) : null
    return pai?.is_folder ? pai : null
  }

  const [tipos, visual] = await Promise.all([
    tiposDeSimulados(supabase, simulados.map((s) => s.id)),
    resolverVisualSimulados(supabase, simulados.map((s) => ({ id: s.id, regras: s.regras }))),
  ])
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

  const online = await onlinePorSimulado(comTipo.map((s) => s.id))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
          <p className="text-muted-foreground">Gerencie provas, agendamentos e publicações.</p>
        </div>
        <Link href="/admin/simulados/novo" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Novo simulado
        </Link>
      </div>

      <SimuladosBoard
        simulados={simsNivel as SimuladoCard[]}
        appUrl={appUrl}
        onlineInicial={online}
        folders={foldersOut}
        destinos={destinos}
        atual={current ? { id: current.id, nome: current.nome } : null}
        catalogo={{ sims: catalogoSims as (SimuladoCard & { grupoId: string | null })[], grupos: catalogoGrupos }}
      />
    </div>
  )
}
