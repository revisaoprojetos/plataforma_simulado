import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { RbacMatriz } from '@/components/super/rbac-matriz'
import { RbacCargosControles } from '@/components/super/rbac-cargos-controles'
import { type CargoItem } from '@/components/super/gerenciar-cargos'
import { type RbacCategoria } from '@/app/admin/tenants/actions'
import { RBAC_RECURSO_LABEL, RBAC_ACAO_LABEL } from '@/lib/rbac-catalogo'
import { ArrowLeft, ShieldCheck, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

/** Roles + permissões + matriz do tenant-alvo (contexto super → service role real). */
async function getRbacData(svc: ReturnType<typeof createAdminClient>, tenantId: string) {
  try {
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      svc.from('simulado_roles').select('id, nome, descricao, is_sistema').eq('tenant_id', tenantId).order('is_sistema', { ascending: false }).order('nome'),
      svc.from('simulado_permissions').select('id, resource, action').order('resource').order('action'),
      svc.from('simulado_role_permissions').select('role_id, permission_id'),
    ])
    if (rolesRes.error?.message?.includes('does not exist')) return null

    // DEDUPE por (resource, action): bancos migrados podem ter permissões repetidas (sem
    // constraint única). Escolhe um id canônico por chave e mapeia os grants para ele — assim
    // a matriz mostra cada permissão UMA vez e os grants continuam consistentes.
    const permsRaw = (permsRes.data ?? []) as { id: string; resource: string; action: string }[]
    const canonical = new Map<string, { id: string; resource: string; action: string }>()
    const idToKey = new Map<string, string>()
    for (const p of permsRaw) {
      const key = `${p.resource}:${p.action}`
      idToKey.set(p.id, key)
      const cur = canonical.get(key)
      if (!cur || p.id < cur.id) canonical.set(key, p)
    }
    const canonId = new Map([...canonical].map(([key, p]) => [key, p.id]))
    const permissions = [...canonical.values()]

    const matrix: Record<string, Set<string>> = {}
    for (const row of rpRes.data ?? []) {
      const key = idToKey.get(row.permission_id)
      const cid = key ? canonId.get(key) : undefined
      if (!cid) continue
      if (!matrix[row.role_id]) matrix[row.role_id] = new Set()
      matrix[row.role_id].add(cid)
    }
    return {
      roles: rolesRes.data ?? [],
      permissions,
      matrix: Object.fromEntries(Object.entries(matrix).map(([k, v]) => [k, Array.from(v)])),
    }
  } catch {
    return null
  }
}

export default async function PlataformaRbacPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createAdminClient()

  const { data: t } = await svc.from('simulado_tenants').select('id, nome, slug, tema').eq('id', id).maybeSingle()
  if (!t) {
    return (
      <div className="space-y-4">
        <Link href="/super/plataformas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Plataforma não encontrada.</div>
      </div>
    )
  }

  // Sem seeds no caminho de render (eram lentos: ~7 idas ao banco por load). O catálogo de
  // permissões, os cargos de sistema e o super-admin são semeados UMA VEZ por `scripts/seed-rbac.mjs`.
  // A página apenas LÊ. Se algo faltar, o aviso abaixo orienta rodar o seed.
  const data = await getRbacData(svc, id)
  const byResource = data
    ? data.permissions.reduce<Record<string, typeof data.permissions>>((acc, p) => { (acc[p.resource] ??= []).push(p); return acc }, {})
    : {}
  // Categorias de cargo (bandas da matriz) — guardadas em tema.rbac, sem migração.
  const rbacTema = ((t.tema as { rbac?: { categorias?: RbacCategoria[]; cargoCategoria?: Record<string, string> } } | null)?.rbac) ?? {}
  const categorias: RbacCategoria[] = Array.isArray(rbacTema.categorias) ? rbacTema.categorias : []
  const cargoCategoria: Record<string, string> = (rbacTema.cargoCategoria && typeof rbacTema.cargoCategoria === 'object') ? rbacTema.cargoCategoria : {}

  const cargos: CargoItem[] = (data?.roles ?? []).map((r: any) => ({
    id: r.id, nome: r.nome, descricao: r.descricao ?? null, is_sistema: !!r.is_sistema,
    permCount: (data?.matrix?.[r.id] ?? []).length,
    categoriaId: cargoCategoria[r.id] ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/super/plataformas/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t.nome}</Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">Configurar RBAC</h1>
            <p className="text-sm text-muted-foreground">Cada cargo (função) e o que ele pode fazer nesta plataforma — marque na matriz para liberar cada permissão.</p>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="flex gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>As tabelas de RBAC ainda não foram criadas no banco. Execute a migration <code className="font-mono text-xs">20260625000003_add_rbac_tables.sql</code> no Supabase.</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Cargos nas colunas, permissões nas linhas — clique na caixa para marcar.</p>
            <RbacCargosControles tenantId={id} cargos={cargos} categorias={categorias} />
          </div>

          <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
            <SecaoHeader icon={ShieldCheck} titulo="Matriz de permissões" subtitulo="Cada coluna é um cargo, cada linha uma permissão — clique na caixa para marcar/desmarcar e salve por cargo." />
            <CardContent className="p-0">
              <RbacMatriz roles={data.roles} byResource={byResource} initialMatrix={data.matrix} tenantId={id} resourceLabels={RBAC_RECURSO_LABEL} actionLabels={RBAC_ACAO_LABEL} categorias={categorias} cargoCategoria={cargoCategoria} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
