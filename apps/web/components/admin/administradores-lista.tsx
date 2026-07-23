'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, X, Mail, Loader2, KeyRound, ShieldCheck, ShieldOff, Copy, Check, Dices } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { rotuloCargo, CARGOS_ACESSO_TOTAL } from '@/lib/rbac-cargos'
import {
  trocarCargoAction, toggleAtivoAdminAction, resetarSenhaAdminAction,
  type AdminMembro, type CargoOpcao,
} from '@/app/admin/administradores/actions'

function iniciais(nome: string | null, email: string | null) {
  const base = nome || email || '?'
  return base.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
}

export function AdministradoresLista({ membros, cargos }: { membros: AdminMembro[]; cargos: CargoOpcao[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  const [alvo, setAlvo] = useState<string | null>(null) // userId em ação (spinner)
  const [cred, setCred] = useState<{ email: string | null; senha: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [resetAlvo, setResetAlvo] = useState<AdminMembro | null>(null) // membro no modal de redefinir senha
  const [resetSenha, setResetSenha] = useState('')

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return membros
    return membros.filter((m) =>
      (m.nome ?? '').toLowerCase().includes(t) ||
      (m.email ?? '').toLowerCase().includes(t) ||
      rotuloCargo(m.cargo).toLowerCase().includes(t))
  }, [membros, q])

  function agir(userId: string, fn: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) {
    setAlvo(userId)
    start(async () => {
      const r = await fn()
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success(sucesso)
      router.refresh()
    })
  }

  function trocarCargo(m: AdminMembro, cargo: string) {
    if (cargo === m.cargo) return
    agir(m.userId, () => trocarCargoAction(m.userId, cargo), 'Cargo atualizado.')
  }

  async function toggleAtivo(m: AdminMembro) {
    if (m.ativo && !(await confirmar({
      titulo: 'Desativar acesso',
      mensagem: `Desativar o acesso de ${m.nome || m.email || 'este administrador'}? Ele deixa de conseguir entrar no painel (o cadastro é preservado).`,
      confirmar: 'Desativar', destrutivo: true,
    }))) return
    agir(m.userId, () => toggleAtivoAdminAction(m.userId, !m.ativo), m.ativo ? 'Acesso desativado.' : 'Acesso reativado.')
  }

  function confirmarReset() {
    const m = resetAlvo
    if (!m) return
    const digitada = resetSenha.trim()
    if (digitada && digitada.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres.'); return }
    setAlvo(m.userId)
    start(async () => {
      const r = await resetarSenhaAdminAction(m.userId, digitada || undefined)
      setAlvo(null)
      if (!r.ok || !r.senha) { toast.error(r.error ?? 'Falha ao redefinir.'); return }
      setResetAlvo(null); setResetSenha('')
      // Mostra a senha uma vez quando foi gerada; se o admin digitou, ele já a conhece.
      if (r.gerada) setCred({ email: m.email, senha: r.senha })
      toast.success('Senha redefinida.')
    })
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou cargo…"
          className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none transition focus:ring-2 focus:ring-ring" />
        {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {cred && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900/40 dark:bg-green-900/20">
          <p className="font-medium text-green-800 dark:text-green-300">Nova senha (mostrada uma única vez):</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 text-xs">{cred.email ?? '—'} · {cred.senha}</code>
            <button type="button" onClick={() => { navigator.clipboard.writeText(`${cred.email ?? ''} / ${cred.senha}`); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted">
              {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => setCred(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        {lista.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhum administrador encontrado.</p>
        ) : (
          <div className="divide-y">
            {lista.map((m) => {
              const emAcao = alvo === m.userId && pending
              return (
                <div key={m.userId} className={cn('flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap', !m.ativo && 'opacity-60')}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(m.nome, m.email)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {m.nome || '—'}
                      {m.ehVoce && <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">você</span>}
                      {!m.ativo && <span className="rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">inativo</span>}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {m.email ?? 'sem e-mail'}</p>
                  </div>

                  {/* Cargo */}
                  <select
                    value={m.cargo}
                    disabled={emAcao}
                    onChange={(e) => trocarCargo(m, e.target.value)}
                    className="h-9 rounded-lg border bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    aria-label={`Cargo de ${m.nome || m.email || 'administrador'}`}
                  >
                    {/* Garante o cargo atual na lista mesmo se não estiver entre os perfis conhecidos */}
                    {!cargos.some((c) => c.nome === m.cargo) && <option value={m.cargo}>{rotuloCargo(m.cargo)}</option>}
                    {cargos.map((c) => (
                      <option key={c.nome} value={c.nome}>{rotuloCargo(c.nome)}</option>
                    ))}
                  </select>

                  {/* Redefinir senha */}
                  <button type="button" disabled={emAcao} onClick={() => { setResetAlvo(m); setResetSenha('') }}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
                    title="Redefinir senha">
                    {emAcao ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Senha
                  </button>

                  {/* Ativar / desativar */}
                  <button type="button" disabled={emAcao || (m.ehVoce && m.ativo)} onClick={() => toggleAtivo(m)}
                    className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50',
                      m.ativo ? 'text-rose-600 hover:bg-rose-500/10 dark:text-rose-400' : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400')}
                    title={m.ehVoce && m.ativo ? 'Você não pode desativar o seu próprio acesso' : (m.ativo ? 'Desativar acesso' : 'Reativar acesso')}>
                    {m.ativo ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {m.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cargos com <b>acesso total</b> ({[...CARGOS_ACESSO_TOTAL].map(rotuloCargo).join(', ')}) ignoram a matriz de permissões. Os demais seguem exatamente as liberações definidas em <b>Permissões (RBAC)</b>.
      </p>

      {/* Modal: redefinir senha (digitar ou gerar) */}
      {resetAlvo && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" onClick={() => { if (!pending) { setResetAlvo(null); setResetSenha('') } }}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-4 w-4" /></span>
              <h3 className="text-sm font-semibold">Redefinir senha</h3>
              <button type="button" onClick={() => { setResetAlvo(null); setResetSenha('') }} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {resetAlvo.nome || resetAlvo.email || 'Administrador'} · <b>Digite uma nova senha</b> ou deixe em branco para gerar automaticamente.
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={resetSenha}
                onChange={(e) => setResetSenha(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarReset() } }}
                placeholder="Deixe em branco para gerar"
                className="h-9 flex-1 rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setResetSenha(gerarSenhaCliente())}
                className="inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition hover:bg-muted" title="Preencher com uma senha forte">
                <Dices className="h-3.5 w-3.5" /> Sugerir
              </button>
            </div>
            {resetSenha.trim() && resetSenha.trim().length < 6 && (
              <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">Mínimo de 6 caracteres.</p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">A senha atual deixa de funcionar. O login é global (vale em todas as plataformas do usuário).</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setResetAlvo(null); setResetSenha('') }}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
              <button type="button" onClick={confirmarReset} disabled={pending || (!!resetSenha.trim() && resetSenha.trim().length < 6)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {pending && alvo === resetAlvo.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Redefinir
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Sugestão de senha forte no cliente (o mesmo formato do servidor); o servidor
// ainda decide a senha final — se o campo ficar vazio, gera outra por lá.
function gerarSenhaCliente() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '@1'
}
