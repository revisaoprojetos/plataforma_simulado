'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Settings2, Trash2, Loader2, ShieldOff, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { rotuloCargo } from '@/lib/rbac-cargos'
import { cn } from '@/lib/utils'
import { trocarCargoAction, toggleAtivoAdminAction, removerAcessoAdminAction, type AdminMembro, type CargoOpcao } from '@/app/admin/administradores/actions'

function iniciais(nome: string | null, email: string | null) {
  const base = nome || email || '?'
  return base.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
}

/** Pop-up que RESUME todos os acessos da plataforma num só lugar: trocar cargo, ativar/desativar
 *  e REMOVER o acesso (apaga o vínculo; a conta global permanece). */
export function GerenciarAcessosModal({ membros, cargos, tenantId }: { membros: AdminMembro[]; cargos: CargoOpcao[]; tenantId?: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pending, start] = useTransition()
  const [alvo, setAlvo] = useState<string | null>(null)

  function run(userId: string, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setAlvo(userId)
    start(async () => {
      const r = await fn()
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success(msg); router.refresh()
    })
  }

  async function excluir(m: AdminMembro) {
    if (!(await confirmar({ titulo: 'Remover acesso', mensagem: `Remover o acesso de ${m.nome || m.email || 'este administrador'} a esta plataforma? A conta global (login) permanece — só o vínculo com esta plataforma é apagado.`, confirmar: 'Remover acesso', destrutivo: true }))) return
    run(m.userId, () => removerAcessoAdminAction(m.userId, tenantId), 'Acesso removido.')
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><Settings2 className="mr-2 h-4 w-4" /> Gerenciar acessos</Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Gerenciar acessos</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Todos os administradores desta plataforma. Mude o cargo, ative/desative ou <b>remova o acesso</b>.</p>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {membros.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum administrador ainda.</p>
            ) : membros.map((m) => {
              const emAcao = pending && alvo === m.userId
              return (
                <div key={m.userId} className={cn('flex flex-wrap items-center gap-2 rounded-xl border p-2.5 sm:flex-nowrap', !m.ativo && 'opacity-60')}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(m.nome, m.email)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {m.nome || '—'}
                      {m.ehVoce && <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">você</span>}
                      {!m.ativo && <span className="rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">inativo</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email ?? 'sem e-mail'}</p>
                  </div>

                  <select value={m.cargo} disabled={emAcao}
                    onChange={(e) => { if (e.target.value !== m.cargo) run(m.userId, () => trocarCargoAction(m.userId, e.target.value, tenantId), 'Cargo atualizado.') }}
                    className="h-8 rounded-lg border bg-transparent px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" aria-label="Cargo">
                    {!cargos.some((c) => c.nome === m.cargo) && <option value={m.cargo}>{rotuloCargo(m.cargo)}</option>}
                    {cargos.map((c) => <option key={c.nome} value={c.nome}>{rotuloCargo(c.nome)}</option>)}
                  </select>

                  <button type="button" disabled={emAcao || (m.ehVoce && m.ativo)} title={m.ativo ? 'Desativar' : 'Reativar'}
                    onClick={() => run(m.userId, () => toggleAtivoAdminAction(m.userId, !m.ativo, tenantId), m.ativo ? 'Acesso desativado.' : 'Acesso reativado.')}
                    className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-40', m.ativo ? 'text-muted-foreground hover:bg-muted' : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400')}>
                    {m.ativo ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  </button>

                  <button type="button" disabled={emAcao || m.ehVoce} title={m.ehVoce ? 'Você não pode remover o seu acesso' : 'Remover acesso'}
                    onClick={() => excluir(m)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-400">
                    {emAcao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-muted-foreground">Cargos com <b>acesso total</b> (Administrador, Super Admin, Admin Geral) ignoram a matriz. <b>Remover</b> apaga só o vínculo com esta plataforma.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
