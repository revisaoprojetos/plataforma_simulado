'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, X, Mail, Loader2, KeyRound, ShieldCheck, ShieldOff, Copy, Check, Dices, Settings2, Trash2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { rotuloCargo, CARGOS_ACESSO_TOTAL } from '@/lib/rbac-cargos'
import {
  trocarCargoAction, toggleAtivoAdminAction, resetarSenhaAdminAction, removerAcessoAdminAction, atualizarDadosAdminAction,
  type AdminMembro, type CargoOpcao,
} from '@/app/admin/administradores/actions'

function iniciais(nome: string | null, email: string | null) {
  const base = nome || email || '?'
  return base.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
}

export function AdministradoresLista({ membros, cargos, tenantId }: { membros: AdminMembro[]; cargos: CargoOpcao[]; tenantId?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  const [alvo, setAlvo] = useState<string | null>(null)
  const [cred, setCred] = useState<{ email: string | null; senha: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [configId, setConfigId] = useState<string | null>(null) // userId em configuração (modal)
  const [novaSenha, setNovaSenha] = useState('')
  const [nomeEdit, setNomeEdit] = useState('')
  const [emailEdit, setEmailEdit] = useState('')

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return membros
    return membros.filter((m) =>
      (m.nome ?? '').toLowerCase().includes(t) ||
      (m.email ?? '').toLowerCase().includes(t) ||
      rotuloCargo(m.cargo).toLowerCase().includes(t))
  }, [membros, q])

  // Membro atual do modal — derivado de `membros` para refletir mudanças após refresh.
  const config = configId ? membros.find((m) => m.userId === configId) ?? null : null

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

  function abrirConfig(m: AdminMembro) { setConfigId(m.userId); setNovaSenha(''); setNomeEdit(m.nome ?? ''); setEmailEdit(m.email ?? '') }

  function salvarDados(m: AdminMembro) {
    const n = nomeEdit.trim(); const e = emailEdit.trim()
    if (!n) { toast.error('Informe o nome.'); return }
    if (!e) { toast.error('Informe o e-mail.'); return }
    agir(m.userId, () => atualizarDadosAdminAction(m.userId, { nome: n, email: e }, tenantId), 'Dados atualizados.')
  }

  function trocarCargo(m: AdminMembro, cargo: string) {
    if (cargo === m.cargo) return
    agir(m.userId, () => trocarCargoAction(m.userId, cargo, tenantId), 'Cargo atualizado.')
  }

  async function toggleAtivo(m: AdminMembro) {
    if (m.ativo && !(await confirmar({
      titulo: 'Desativar acesso',
      mensagem: `Desativar o acesso de ${m.nome || m.email || 'este administrador'}? Ele deixa de entrar no painel (o cadastro é preservado).`,
      confirmar: 'Desativar', destrutivo: true,
    }))) return
    agir(m.userId, () => toggleAtivoAdminAction(m.userId, !m.ativo, tenantId), m.ativo ? 'Acesso desativado.' : 'Acesso reativado.')
  }

  async function remover(m: AdminMembro) {
    if (!(await confirmar({
      titulo: 'Remover acesso',
      mensagem: `Remover o acesso de ${m.nome || m.email || 'este administrador'} a esta plataforma? A conta global (login) permanece — só o vínculo com esta plataforma é apagado.`,
      confirmar: 'Remover acesso', destrutivo: true,
    }))) return
    setAlvo(m.userId)
    start(async () => {
      const r = await removerAcessoAdminAction(m.userId, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success('Acesso removido.'); setConfigId(null); router.refresh()
    })
  }

  function redefinirSenha(m: AdminMembro) {
    const digitada = novaSenha.trim()
    if (digitada && digitada.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres.'); return }
    setAlvo(m.userId)
    start(async () => {
      const r = await resetarSenhaAdminAction(m.userId, digitada || undefined, tenantId)
      setAlvo(null)
      if (!r.ok || !r.senha) { toast.error(r.error ?? 'Falha ao redefinir.'); return }
      setNovaSenha('')
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
            {lista.map((m) => (
              <div key={m.userId} className={cn('flex items-center gap-3 p-3', !m.ativo && 'opacity-60')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(m.nome, m.email)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {m.nome || '—'}
                    {m.ehVoce && <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">você</span>}
                    {!m.ativo && <span className="rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">inativo</span>}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {m.email ?? 'sem e-mail'}</p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline">{rotuloCargo(m.cargo)}</span>
                {/* Engrenagem: configuração INDIVIDUAL deste acesso */}
                <button type="button" onClick={() => abrirConfig(m)} title="Configurar este acesso"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground">
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cargos com <b>acesso total</b> ({[...CARGOS_ACESSO_TOTAL].map(rotuloCargo).join(', ')}) ignoram a matriz de permissões. Os demais seguem as liberações em <b>Permissões (RBAC)</b>.
      </p>

      {/* Modal de configuração INDIVIDUAL */}
      {config && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" onClick={() => { if (!pending) setConfigId(null) }}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{iniciais(config.nome, config.email)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Configurar acesso</p>
                <p className="truncate text-xs text-muted-foreground">{config.email ?? 'sem e-mail'}</p>
              </div>
              <button type="button" onClick={() => setConfigId(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {/* Dados (nome + e-mail) */}
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nome</label>
                  <input value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)} placeholder="Nome do administrador"
                    className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">E-mail (login)</label>
                  <input type="email" value={emailEdit} onChange={(e) => setEmailEdit(e.target.value)} placeholder="email@dominio.com" autoComplete="off"
                    className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <button type="button" onClick={() => salvarDados(config)} disabled={pending || (nomeEdit.trim() === (config.nome ?? '') && emailEdit.trim().toLowerCase() === (config.email ?? '').toLowerCase())}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
                {pending && alvo === config.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar dados
              </button>
            </div>

            {/* Cargo */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cargo</label>
              <select value={config.cargo} disabled={pending}
                onChange={(e) => trocarCargo(config, e.target.value)}
                className="h-9 w-full rounded-lg border bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                {!cargos.some((c) => c.nome === config.cargo) && <option value={config.cargo}>{rotuloCargo(config.cargo)}</option>}
                {cargos.map((c) => <option key={c.nome} value={c.nome}>{rotuloCargo(c.nome)}</option>)}
              </select>
            </div>

            {/* Redefinir senha */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Redefinir senha</label>
              <div className="flex gap-2">
                <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password"
                  placeholder="Deixe em branco para gerar" className="h-9 flex-1 rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <button type="button" onClick={() => setNovaSenha(gerarSenhaCliente())} title="Sugerir senha forte"
                  className="inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition hover:bg-muted"><Dices className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => redefinirSenha(config)} disabled={pending || (!!novaSenha.trim() && novaSenha.trim().length < 6)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
                  {pending && alvo === config.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Redefinir
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">O login é global (vale em todas as plataformas do usuário).</p>
            </div>

            {/* Ações: ativar/desativar + remover */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
              <button type="button" disabled={pending || (config.ehVoce && config.ativo)} onClick={() => toggleAtivo(config)}
                className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50',
                  config.ativo ? 'text-rose-600 hover:bg-rose-500/10 dark:text-rose-400' : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400')}
                title={config.ehVoce && config.ativo ? 'Você não pode desativar o seu acesso' : undefined}>
                {config.ativo ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {config.ativo ? 'Desativar' : 'Reativar'}
              </button>
              <button type="button" disabled={pending || config.ehVoce} onClick={() => remover(config)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                title={config.ehVoce ? 'Você não pode remover o seu acesso' : undefined}>
                {pending && alvo === config.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remover acesso
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Sugestão de senha forte no cliente (o servidor ainda decide a final se o campo ficar vazio).
function gerarSenhaCliente() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '@1'
}
