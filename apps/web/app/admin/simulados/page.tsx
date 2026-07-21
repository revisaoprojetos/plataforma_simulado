import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SimuladosBoard, type SimuladoCard } from '@/components/admin/simulados-board'
import { onlinePorSimulado } from '@/app/admin/simulados/actions'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'

export default async function SimuladosPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta: pastaParam } = await searchParams
  const supabase = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Simulados (tolerante a pasta_id: se a migration ainda não rodou, seleciona sem a coluna).
  let simulados: any[] = []
  {
    const base = 'id, titulo, status, data_inicio, data_fim, modo_aplicacao, tempo_limite_min, embed_token, created_at, regras'
    let r: { data: any[] | null; error: { message: string } | null } = await supabase.from('simulado_simulados').select(`${base}, pasta_id`).eq('deletado', false).eq('tenant_id', tid).order('created_at', { ascending: false })
    if (r.error && /pasta_id|column/i.test(r.error.message)) {
      r = await supabase.from('simulado_simulados').select(base).eq('deletado', false).eq('tenant_id', tid).order('created_at', { ascending: false })
    }
    simulados = (r.data ?? []).map((s: any) => ({ ...s, pasta_id: s.pasta_id ?? null }))
  }

  // Pastas da Aplicação de Simulado (is_folder + folder_area='simulado'). Tolerante: se as colunas
  // não existirem, não há pastas (a página segue com os simulados normalmente).
  let folders: any[] = []
  {
    const selP = (cols: string) => supabase.from('simulado_pastas').select(cols).eq('deletado', false).eq('tenant_id', tid).order('nome')
    let r: { data: any[] | null; error: { message: string } | null } = await selP('id, nome, cor, icone, capa_url, capa_card_url, is_folder, folder_area')
    if (r.error) r = await selP('id, nome, cor, icone, capa_url, is_folder, folder_area')
    if (!r.error) folders = (r.data ?? []).filter((p: any) => p.is_folder && p.folder_area === 'simulado')
  }

  const tipos = await tiposDeSimulados(supabase, simulados.map((s) => s.id))
  const visual = await resolverVisualSimulados(supabase, simulados.map((s) => ({ id: s.id, regras: s.regras })))
  const comTipo = simulados.map((s) => ({ ...s, tipo: tipos.get(s.id) ?? null, vis: visual.get(s.id) ?? null }))
    .filter((s) => !OCULTAR_DISCURSIVA || s.tipo !== 'discursiva')

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

  const online = await onlinePorSimulado(simsNivel.map((s) => s.id))
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
      />
    </div>
  )
}
