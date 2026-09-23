'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, ShieldCheck, Bell, BellOff, History, Eye, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarPapelImpersonacao, salvarModoNotificacaoImpersonacao, type PapelImpersonacao } from '@/app/admin/impersonation/actions'
import type { NotifMode } from '@/lib/impersonation/notification'

const NOME_PAPEL: Record<string, string> = {
  admin: 'Administrador', super_admin: 'Super admin', admin_geral: 'Admin geral',
  admin_conteudo: 'Admin de conteúdo', admin_correcao: 'Admin de correção',
  admin_relatorio: 'Admin de relatório', admin_comercial: 'Admin comercial',
  comercial: 'Comercial', coordenador: 'Coordenador', estudante: 'Estudante', testador: 'Testador',
}
const rotulo = (n: string) => NOME_PAPEL[n] ?? n

const MODOS: { valor: NotifMode; titulo: string; desc: string; icon: typeof Bell }[] = [
  { valor: 'passive_history', titulo: 'Só histórico (padrão)', desc: 'Registra no log de auditoria, sem avisar o aluno.', icon: History },
  { valor: 'mandatory_notification', titulo: 'Notificar o aluno', desc: 'Cria uma notificação in-app avisando que a conta foi visualizada.', icon: Bell },
  { valor: 'disabled', titulo: 'Desativado', desc: 'Bloqueia totalmente a visualização de alunos neste tenant.', icon: BellOff },
]

export function ImpersonationConfig({ roles, modo }: { roles: PapelImpersonacao[]; modo: NotifMode }) {
  const [lista, setLista] = useState(roles)
  const [modoAtual, setModoAtual] = useState<NotifMode>(modo)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [pend, start] = useTransition()

  function togglePapel(p: PapelImpersonacao) {
    if (p.bloqueado) return
    const novo = !p.habilitado
    setSalvandoId(p.id)
    setLista((l) => l.map((x) => (x.id === p.id ? { ...x, habilitado: novo } : x))) // otimista
    start(async () => {
      const r = await salvarPapelImpersonacao(p.id, novo)
      setSalvandoId(null)
      if (!r.ok) {
        setLista((l) => l.map((x) => (x.id === p.id ? { ...x, habilitado: !novo } : x))) // reverte
        toast.error(r.error ?? 'Erro ao salvar.')
      } else {
        toast.success(`${rotulo(p.nome)} ${novo ? 'pode' : 'não pode mais'} visualizar alunos.`)
      }
    })
  }

  function trocarModo(m: NotifMode) {
    if (m === modoAtual) return
    const anterior = modoAtual
    setModoAtual(m)
    start(async () => {
      const r = await salvarModoNotificacaoImpersonacao(m)
      if (!r.ok) { setModoAtual(anterior); toast.error(r.error ?? 'Erro ao salvar.') }
      else toast.success('Modo de notificação atualizado.')
    })
  }

  return (
    <div className="space-y-6">
      {/* Papéis que podem visualizar */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Quem pode visualizar alunos</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Papéis habilitados podem abrir a conta do aluno no console. É <b>modo operável</b>: as ações feitas são gravadas como se fossem do aluno (contam na nota/ranking). Só ações de identidade irreversível (LGPD, e-mail de login, exclusão de conta) ficam bloqueadas.</p>
        <div className="divide-y rounded-xl border">
          {lista.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum papel neste tenant.</p>
          ) : lista.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{rotulo(p.nome)}</span>
                {p.bloqueado && <span className="text-[11px] text-muted-foreground">Sempre habilitado (acesso global)</span>}
              </span>
              {p.bloqueado ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Lock className="h-3 w-3" /> Sempre</span>
              ) : (
                <button type="button" role="switch" aria-checked={p.habilitado} aria-label={`${rotulo(p.nome)} pode visualizar`}
                  onClick={() => togglePapel(p)} disabled={pend && salvandoId === p.id}
                  className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60', p.habilitado ? 'bg-primary' : 'bg-muted-foreground/30')}>
                  <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform', p.habilitado ? 'translate-x-5' : 'translate-x-0.5')}>
                    {salvandoId === p.id ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : p.habilitado ? <Check className="h-3 w-3 text-primary" /> : null}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Modo de notificação */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Notificação ao aluno</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Controla o que acontece quando um admin abre a conta de um aluno.</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {MODOS.map((m) => {
            const on = modoAtual === m.valor
            return (
              <button key={m.valor} type="button" onClick={() => trocarModo(m.valor)}
                className={cn('rounded-xl border p-3 text-left transition-colors', on ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'hover:border-primary/40')}>
                <span className={cn('mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><m.icon className="h-4 w-4" /></span>
                <span className="block text-sm font-semibold">{m.titulo}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.desc}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
