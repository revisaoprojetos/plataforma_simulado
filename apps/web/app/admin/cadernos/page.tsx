import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernosClient } from '@/components/admin/cadernos-client'
import { capasDeBancoPorCaderno } from '@/lib/simulado/capa-caderno'
import { SemPermissao } from '@/components/ui/alert-box'

// Sempre fresco: a lista muda por criação/exclusão/movimentação (não pode ficar em cache).
export const dynamic = 'force-dynamic'

function contarBlocos(config: any): number {
  if (config?.docsV2) {
    let n = 0
    for (const doc of Object.values(config.docsV2) as any[]) for (const p of doc?.pages ?? []) n += (p.blocks?.length ?? 0)
    return n
  }
  return (config?.blocos ?? []).length
}

export default async function CadernosAdminPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta: pastaParam } = await searchParams
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de prova</h1>
        <SemPermissao>Sem permissão.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Cadernos — tolerante às colunas de personalização (cor/ícone/capa) e à de pasta (pasta_id).
  let cadernos: any[] = []
  {
    const sel = (cols: string) => svc.from('simulado_cadernos_designer').select(cols).eq('deletado', false).eq('tenant_id', tid).order('atualizado_em', { ascending: false })
    let r: { data: any[] | null; error: { message: string } | null } = await sel('id, nome, config, atualizado_em, cor, icone, capa_url, pasta_id')
    if (r.error && /pasta_id/i.test(r.error.message)) r = await sel('id, nome, config, atualizado_em, cor, icone, capa_url')
    if (r.error && /cor|icone|capa_url|column/i.test(r.error.message)) r = await sel('id, nome, config, atualizado_em')
    cadernos = (r.data ?? []).map((c: any) => ({ ...c, pasta_id: c.pasta_id ?? null }))
  }

  // Pastas da área de Cadernos (is_folder + folder_area='caderno'). Tolerante: sem colunas, sem pastas.
  let folders: any[] = []
  {
    const selP = (cols: string) => svc.from('simulado_pastas').select(cols).eq('deletado', false).eq('tenant_id', tid).order('nome')
    let r: { data: any[] | null; error: { message: string } | null } = await selP('id, nome, cor, icone, capa_url, capa_card_url, is_folder, folder_area')
    if (r.error) r = await selP('id, nome, cor, icone, capa_url, is_folder, folder_area')
    if (!r.error) folders = (r.data ?? []).filter((p: any) => p.is_folder && p.folder_area === 'caderno')
  }

  // Caderno vinculado a um banco herda a CAPA do banco (senão usa a própria).
  const capasBanco = await capasDeBancoPorCaderno(svc, tid)

  const contPasta = new Map<string, number>()
  for (const c of cadernos) if (c.pasta_id) contPasta.set(c.pasta_id, (contPasta.get(c.pasta_id) ?? 0) + 1)

  const current = pastaParam ? folders.find((f) => f.id === pastaParam) ?? null : null
  const cadsNivel = current ? cadernos.filter((c) => c.pasta_id === current.id) : cadernos.filter((c) => !c.pasta_id)
  const foldersNivel = current ? [] : folders

  const capaFolder = (f: any) => (f.capa_card_url ?? f.capa_url) ?? null
  const lista = cadsNivel.map((c: any) => ({ id: c.id, nome: c.nome, blocos: contarBlocos(c.config), cor: c.cor ?? null, icone: c.icone ?? null, capa: capasBanco.get(c.id) ?? c.capa_url ?? null }))
  const foldersOut = foldersNivel.map((f: any) => ({ id: f.id, nome: f.nome, cor: f.cor ?? null, icone: f.icone ?? null, capa: capaFolder(f), count: contPasta.get(f.id) ?? 0 }))
  const destinos = folders.map((f: any) => ({ id: f.id, nome: f.nome }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de prova</h1>
        <p className="text-muted-foreground">Monte cadernos em blocos (estilo Gutenberg) com a identidade do simulado e gere o PDF.</p>
      </div>
      <CadernosClient cadernos={lista} folders={foldersOut} destinos={destinos} atual={current ? { id: current.id, nome: current.nome } : null} />
    </div>
  )
}
