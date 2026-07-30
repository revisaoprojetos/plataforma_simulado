'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { deleteRoleAction } from '@/app/admin/rbac/actions'
import { criarCategoriaCargoAction, excluirCategoriaCargoAction, atribuirCategoriaCargoAction, type RbacCategoria } from '@/app/admin/tenants/actions'

export type CargoItem = { id: string; nome: string; descricao: string | null; is_sistema: boolean; permCount: number; categoriaId?: string | null }

/** Gestão de cargos + CATEGORIAS (bandas da matriz): cria/exclui categorias e atribui a categoria
 *  de cada cargo, além de excluir cargos personalizados. Vive no modal "Gerenciar cargos". */
export function GerenciarCargos({ tenantId, cargos, categorias }: { tenantId: string; cargos: CargoItem[]; categorias: RbacCategoria[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [alvo, setAlvo] = useState<string | null>(null)
  const [novaCat, setNovaCat] = useState('')
  const [novaCor, setNovaCor] = useState('#6366f1')

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setAlvo(key)
    start(async () => {
      const r = await fn()
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success(okMsg); router.refresh()
    })
  }

  function criarCat(e: React.FormEvent) {
    e.preventDefault()
    if (!novaCat.trim()) return
    const nome = novaCat.trim()
    setNovaCat('')
    run('novacat', () => criarCategoriaCargoAction(tenantId, nome, novaCor), 'Categoria criada.')
  }

  async function excluirCat(c: RbacCategoria) {
    if (!(await confirmar({ titulo: 'Excluir categoria', mensagem: `Excluir a categoria "${c.nome}"? Os cargos dela ficam sem categoria.`, confirmar: 'Excluir', destrutivo: true }))) return
    run('cat:' + c.id, () => excluirCategoriaCargoAction(tenantId, c.id), 'Categoria excluída.')
  }

  async function excluirCargo(c: CargoItem) {
    if (!(await confirmar({ titulo: 'Excluir cargo', mensagem: `Excluir o cargo "${c.nome.replace(/_/g, ' ')}"? As permissões dele serão removidas e quem tiver esse cargo volta para "estudante".`, confirmar: 'Excluir', destrutivo: true }))) return
    run('del:' + c.id, () => deleteRoleAction(c.id, tenantId), 'Cargo excluído.')
  }

  return (
    <div className="space-y-5">
      {/* Categorias */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias (bandas da matriz)</h3>
        <form onSubmit={criarCat} className="flex items-end gap-2">
          <Input value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nome da categoria (ex.: Administração)" className="flex-1" />
          <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} className="h-9 w-10 cursor-pointer rounded border bg-transparent p-0.5" title="Cor da categoria" />
          <Button type="submit" disabled={pending || !novaCat.trim()}>{pending && alvo === 'novacat' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
        </form>
        {categorias.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} /> {c.nome}
                <button type="button" onClick={() => excluirCat(c)} disabled={pending} className="ml-0.5 text-muted-foreground hover:text-rose-600 disabled:opacity-50" title="Excluir categoria">
                  {pending && alvo === 'cat:' + c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              </span>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">Nenhuma categoria ainda — crie acima.</p>}
      </div>

      {/* Cargos */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cargos</h3>
        <div className="divide-y rounded-xl border">
          {cargos.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum cargo.</p> : cargos.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium capitalize">
                  {c.nome.replace(/_/g, ' ')}
                  {c.is_sistema && <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">sistema</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{c.permCount} permissão(ões)</p>
              </div>
              <select value={c.categoriaId ?? ''} disabled={pending} onChange={(e) => run('atr:' + c.id, () => atribuirCategoriaCargoAction(tenantId, c.id, e.target.value), 'Categoria atualizada.')}
                className="h-8 rounded-lg border bg-transparent px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" title="Categoria do cargo">
                <option value="">Sem categoria</option>
                {categorias.map((cat) => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
              </select>
              {c.is_sistema ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> protegido</span>
              ) : (
                <button type="button" disabled={pending && alvo === 'del:' + c.id} onClick={() => excluirCargo(c)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
                  {pending && alvo === 'del:' + c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Excluir
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
