import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { FlaskConical, FileText } from 'lucide-react'
import { CriarCadernoTesteBtn } from './criar-btn'

// Área de TESTE do novo editor unificado de cadernos. Não altera os cadernos existentes —
// apenas abre os mesmos cadernos no editor NOVO (tela única) para validarmos na plataforma.
export const dynamic = 'force-dynamic'

function contarBlocos(config: any): number {
  if (config?.docsV2) {
    let n = 0
    for (const doc of Object.values(config.docsV2) as any[]) for (const p of doc?.pages ?? []) n += (p.blocks?.length ?? 0)
    return n
  }
  return (config?.blocos ?? []).length
}

export default async function CadernosTestePage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Cadernos (teste)</h1>
        <SemPermissao>Sem permissão.</SemPermissao>
      </div>
    )
  }

  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Cadernos da ÁREA DE TESTE (tabela isolada simulado_cadernos_teste) — nunca os reais.
  let cadernos: any[] = []
  {
    const sel = (cols: string) => svc.from('simulado_cadernos_teste').select(cols).eq('deletado', false).eq('tenant_id', tid).order('atualizado_em', { ascending: false })
    let r: { data: any[] | null; error: { message: string } | null } = await sel('id, nome, config, cor, icone')
    if (r.error && /cor|icone|column/i.test(r.error.message)) r = await sel('id, nome, config')
    cadernos = r.data ?? []
  }

  const lista = cadernos.map((c: any) => ({ id: c.id, nome: c.nome, blocos: contarBlocos(c.config), cor: c.cor ?? null, icone: c.icone ?? null }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FlaskConical className="h-6 w-6 text-primary" /> Cadernos (teste)</h1>
          <p className="text-muted-foreground">Área de teste <strong>isolada</strong> do novo editor unificado. Cadernos e salvamentos próprios (tabela separada) — <strong>não</strong> afeta &ldquo;Cadernos de Prova&rdquo;.</p>
        </div>
        <CriarCadernoTesteBtn />
      </div>

      <div className="rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        Em construção. Tudo aqui é isolado dos cadernos reais — crie, edite e salve à vontade para testar o editor novo.
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum caderno de teste ainda. Clique em <strong>&ldquo;Criar caderno&rdquo;</strong> para começar do zero.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {lista.map((c) => (
            <Link key={c.id} href={`/admin/cadernos-teste/${c.id}`}
              className="group flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg text-lg" style={{ background: (c.cor ?? '#6d28d9') + '1a', color: c.cor ?? '#6d28d9' }}>
                {c.icone || <FileText className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight" title={c.nome}>{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.blocos} bloco(s)</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
