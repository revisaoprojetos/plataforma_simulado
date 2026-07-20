import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernosClient } from '@/components/admin/cadernos-client'
import { SemPermissao } from '@/components/ui/alert-box'

function contarBlocos(config: any): number {
  if (config?.docsV2) {
    let n = 0
    for (const doc of Object.values(config.docsV2) as any[]) for (const p of doc?.pages ?? []) n += (p.blocks?.length ?? 0)
    return n
  }
  return (config?.blocos ?? []).length
}

export default async function CadernosAdminPage() {
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
  // Personalização (cor/ícone/capa) — tolerante caso a migration ainda não tenha rodado.
  let cadernos: any[] | null = null
  {
    const r = await svc.from('simulado_cadernos_designer').select('id, nome, config, atualizado_em, cor, icone, capa_url').eq('deletado', false).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000').order('atualizado_em', { ascending: false })
    if (r.error && /cor|icone|capa_url|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_cadernos_designer').select('id, nome, config, atualizado_em').eq('deletado', false).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000').order('atualizado_em', { ascending: false })
      cadernos = r2.data
    } else cadernos = r.data
  }

  const lista = (cadernos ?? []).map((c: any) => ({ id: c.id, nome: c.nome, blocos: contarBlocos(c.config), cor: c.cor ?? null, icone: c.icone ?? null, capa: c.capa_url ?? null }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de prova</h1>
        <p className="text-muted-foreground">Monte cadernos em blocos (estilo Gutenberg) com a identidade do simulado e gere o PDF.</p>
      </div>
      <CadernosClient cadernos={lista} />
    </div>
  )
}
