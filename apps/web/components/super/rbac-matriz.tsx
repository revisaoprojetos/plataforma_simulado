'use client'

import { Fragment, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { saveRolePermissions } from '@/app/admin/rbac/actions'
import { Check, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { RbacCategoria } from '@/app/admin/tenants/actions'
import { rotuloCargo } from '@/lib/rbac-cargos'

type Role = { id: string; nome: string; descricao: string | null; is_sistema: boolean }
type Permission = { id: string; resource: string; action: string }

// Estilo por ÁREA (resource): fundo suave da linha, bolinha da legenda/subcabeçalho e barra de
// acento à esquerda — agrupa visualmente as permissões da mesma área.
const AREA_ESTILO: Record<string, { row: string; dot: string; bar: string }> = {
  questoes: { row: 'bg-blue-50/60 dark:bg-blue-950/20', dot: 'bg-blue-500', bar: 'border-l-blue-400 dark:border-l-blue-500' },
  simulados: { row: 'bg-violet-50/60 dark:bg-violet-950/20', dot: 'bg-violet-500', bar: 'border-l-violet-400 dark:border-l-violet-500' },
  estudantes: { row: 'bg-emerald-50/60 dark:bg-emerald-950/20', dot: 'bg-emerald-500', bar: 'border-l-emerald-400 dark:border-l-emerald-500' },
  matriculas: { row: 'bg-amber-50/60 dark:bg-amber-950/20', dot: 'bg-amber-500', bar: 'border-l-amber-400 dark:border-l-amber-500' },
  configuracoes: { row: 'bg-slate-100/60 dark:bg-slate-800/30', dot: 'bg-slate-500', bar: 'border-l-slate-400 dark:border-l-slate-500' },
  api_keys: { row: 'bg-cyan-50/60 dark:bg-cyan-950/20', dot: 'bg-cyan-500', bar: 'border-l-cyan-400 dark:border-l-cyan-500' },
  rbac: { row: 'bg-rose-50/60 dark:bg-rose-950/20', dot: 'bg-rose-500', bar: 'border-l-rose-400 dark:border-l-rose-500' },
  console: { row: 'bg-fuchsia-50/60 dark:bg-fuchsia-950/20', dot: 'bg-fuchsia-500', bar: 'border-l-fuchsia-400 dark:border-l-fuchsia-500' },
}
const AREA_FALLBACK = { row: '', dot: 'bg-muted-foreground/50', bar: 'border-l-border' }
const estiloArea = (res: string) => AREA_ESTILO[res] ?? AREA_FALLBACK

/**
 * Matriz estilo "grade": CARGOS nas colunas (cabeçalho vertical, agrupados em bandas por
 * CATEGORIA) e PERMISSÕES nas linhas (listradas). A célula marcada mostra um marcador circular
 * com check. Cargos de sistema ficam somente-leitura (coluna travada).
 */
export function RbacMatriz({ roles, byResource, initialMatrix, tenantId, resourceLabels, actionLabels, categorias, cargoCategoria }: {
  roles: Role[]
  byResource: Record<string, Permission[]>
  initialMatrix: Record<string, string[]>
  tenantId: string
  resourceLabels?: Record<string, string>
  actionLabels?: Record<string, string>
  categorias?: RbacCategoria[]
  cargoCategoria?: Record<string, string>
}) {
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(Object.entries(initialMatrix).map(([k, v]) => [k, new Set(v)])))
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  const perms: Permission[] = Object.keys(byResource).sort().flatMap((res) => byResource[res])
  // super_admin primeiro (cargo maior), depois admin, depois os demais de sistema.
  const rankSis = (nome: string) => (nome === 'super_admin' ? 0 : nome === 'admin' ? 1 : 2)
  const sistema = roles.filter((r) => r.is_sistema).sort((a, b) => rankSis(a.nome) - rankSis(b.nome) || a.nome.localeCompare(b.nome))
  const custom = roles.filter((r) => !r.is_sistema)

  // Bandas = CATEGORIAS. Cargos de sistema numa banda própria; personalizados agrupados pela
  // categoria atribuída (tema.rbac.cargoCategoria); o resto cai em "Sem categoria".
  const cats = categorias ?? []
  const cc = cargoCategoria ?? {}
  const catById = new Map(cats.map((c) => [c.id, c]))
  const bandas: { label: string; cor: string | null; roles: Role[] }[] = []
  if (sistema.length) bandas.push({ label: 'Sistema', cor: null, roles: sistema })
  for (const cat of cats) {
    const rs = custom.filter((r) => cc[r.id] === cat.id)
    if (rs.length) bandas.push({ label: cat.nome, cor: cat.cor, roles: rs })
  }
  const semCat = custom.filter((r) => !cc[r.id] || !catById.has(cc[r.id]))
  if (semCat.length) bandas.push({ label: cats.length ? 'Sem categoria' : 'Personalizados', cor: null, roles: semCat })
  const rolesOrd = bandas.flatMap((b) => b.roles)

  function toggle(roleId: string, permId: string) {
    setMatrix((prev) => {
      const next = { ...prev }
      const s = new Set(next[roleId] ?? [])
      if (s.has(permId)) s.delete(permId); else s.add(permId)
      next[roleId] = s
      return next
    })
    setDirty((prev) => new Set([...prev, roleId]))
  }

  function salvar() {
    start(async () => {
      const alvos = [...dirty]
      const results = await Promise.all(alvos.map((rid) => saveRolePermissions(rid, Array.from(matrix[rid] ?? []), tenantId)))
      const falha = results.find((r) => !r.ok)
      if (falha) toast.error(falha.error ?? 'Erro ao salvar alguns cargos.')
      else toast.success('Permissões salvas.')
      setDirty((prev) => {
        const n = new Set(prev)
        alvos.forEach((rid, i) => { if (results[i].ok) n.delete(rid) })
        return n
      })
    })
  }

  if (!rolesOrd.length) return <p className="p-8 text-center text-sm text-muted-foreground">Crie um cargo primeiro (botão “Novo cargo”) para configurar as permissões.</p>
  if (!perms.length) return <p className="p-8 text-center text-sm text-muted-foreground">Catálogo de permissões vazio — recarregue a página para semeá-lo.</p>

  return (
    <div className="space-y-3 p-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              {/* Canto: Cargos (topo-dir) / Permissões (baixo-esq) com corte diagonal */}
              <th rowSpan={2} className="min-w-[240px] border-b border-r bg-muted/40 p-0 align-bottom">
                <div className="relative h-16">
                  <span className="absolute right-2 top-1.5 text-[11px] font-semibold text-muted-foreground">Cargos</span>
                  <span className="absolute bottom-1.5 left-2 text-[11px] font-semibold text-muted-foreground">Permissões</span>
                  <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top right, transparent calc(50% - 0.5px), var(--border) calc(50% - 0.5px), var(--border) calc(50% + 0.5px), transparent calc(50% + 0.5px))' }} />
                </div>
              </th>
              {bandas.map((b, i) => (
                <th key={i} colSpan={b.roles.length}
                  className={cn('border-b border-l px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide', !b.cor && 'bg-muted text-muted-foreground')}
                  style={b.cor ? { backgroundColor: b.cor, color: '#fff' } : undefined}>{b.label}</th>
              ))}
            </tr>
            <tr>
              {rolesOrd.map((r) => (
                <th key={r.id} className="h-32 min-w-[3rem] border-b border-l bg-muted/30 align-bottom">
                  <div className="mx-auto whitespace-nowrap pb-2 text-xs font-semibold [writing-mode:vertical-rl] rotate-180">
                    {rotuloCargo(r.nome)}
                    {dirty.has(r.id) && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" title="alterações não salvas" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perms.map((p, i) => {
              const est = estiloArea(p.resource)
              const primeiroDaArea = i === 0 || perms[i - 1].resource !== p.resource
              return (
                <Fragment key={p.id}>
                  {primeiroDaArea && (
                    <tr className={cn('border-t-2 border-border', est.row)}>
                      <td colSpan={rolesOrd.length + 1} className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                          <span className={cn('h-2 w-2 rounded-full', est.dot)} />
                          {resourceLabels?.[p.resource] ?? p.resource}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className={cn('border-b transition-colors hover:bg-primary/5', est.row)}>
                    <td className={cn('border-r border-l-4 py-2 pl-4 pr-3 text-foreground/90', est.bar)}>{actionLabels?.[p.action] ?? p.action}</td>
                    {rolesOrd.map((r) => {
                      // Só o super_admin é travado (acesso total, cargo máximo). O Administrador e os
                      // demais cargos são editáveis — marque/desmarque as permissões deles.
                      const total = r.nome === 'super_admin'
                      const on = total ? true : (matrix[r.id]?.has(p.id) ?? false)
                      const editavel = !total
                      return (
                        <td key={r.id} className="border-l px-1 py-1 text-center">
                          <button type="button" disabled={!editavel} onClick={() => editavel && toggle(r.id, p.id)}
                            aria-label={`${resourceLabels?.[p.resource] ?? p.resource} · ${actionLabels?.[p.action] ?? p.action} — ${rotuloCargo(r.nome)}`}
                            aria-pressed={on}
                            className={cn('mx-auto flex h-6 w-6 items-center justify-center rounded-full transition-all',
                              on ? 'bg-primary text-primary-foreground shadow-sm'
                                 : editavel ? 'border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary/10' : 'border border-dashed border-muted-foreground/25 opacity-40',
                              !editavel && 'cursor-not-allowed')}
                            title={total ? 'Acesso total (definido pelo sistema, não editável)' : on ? 'Remover permissão' : 'Conceder permissão'}>
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">O <b>Super Admin</b> tem acesso total e é travado. Todos os demais cargos (inclusive Administrador) são editáveis — marque as permissões e salve. Cada cor de fundo é uma área.</p>
        <Button onClick={salvar} disabled={pending || dirty.size === 0}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar alterações
        </Button>
      </div>
    </div>
  )
}
