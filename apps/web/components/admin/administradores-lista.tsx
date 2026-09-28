'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, X, Mail, Loader2, ShieldCheck, ShieldOff, Copy, Check, Dices, Settings2, Trash2, Save, Building2, Eye, EyeOff, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { rotuloCargo, CARGOS_ACESSO_TOTAL } from '@/lib/rbac-cargos'
import {
  trocarCargoAction, toggleAtivoAdminAction, resetarSenhaAdminAction, removerAcessoAdminAction, atualizarDadosAdminAction,
  listarPlataformasSuper, adicionarAdminEmPlataformasAction, verSenhaAdminCofre,
  type AdminMembro, type CargoOpcao,
} from '@/app/admin/administradores/actions'

function iniciais(nome: string | null, email: string | null) {
  const base = nome || email || '?'
  return base.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
}

export function AdministradoresLista({ membros, cargos, tenantId, super: ehSuper = false }: { membros: AdminMembro[]; cargos: CargoOpcao[]; tenantId?: string; super?: boolean }) {
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
  // [console super] cofre de senha (senha definida pelo painel, cifrada) + toggle de revelar.
  const [cofre, setCofre] = useState<{ senha: string | null; em: string | null } | null>(null)
  const [revelada, setRevelada] = useState(false)
  // [console super] operação EM LOTE na tabela: seleção de admins + todas as plataformas p/ o seletor.
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set())
  const [todasPlats, setTodasPlats] = useState<{ id: string; nome: string }[]>([])

  // Carrega TODAS as plataformas uma vez (para o seletor de adicionar em lote).
  useEffect(() => {
    if (!ehSuper) return
    listarPlataformasSuper().then((r) => { if (r.ok) setTodasPlats(r.plataformas ?? []) }).catch(() => {})
  }, [ehSuper])

  // Cofre: recarrega ao abrir o modal de configuração.
  useEffect(() => {
    if (!ehSuper || !configId) return
    setCofre(null); setRevelada(false)
    verSenhaAdminCofre(configId).then((r) => { if (r.ok) setCofre({ senha: r.senha ?? null, em: r.atualizadoEm ?? null }) }).catch(() => {})
  }, [configId, ehSuper])

  // Pop-up "adicionar a plataforma": abre com a lista de empresas do sistema.
  const [addModal, setAddModal] = useState(false)
  const [addSelPlats, setAddSelPlats] = useState<Set<string>>(new Set())

  const toggleUser = (id: string) => setSelUsers((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // EM LOTE — CONFIRMA no pop-up: adiciona os admins selecionados às plataformas escolhidas,
  // importando a função (cargo) de cada um. Idempotente (pula quem já tem).
  function confirmarAddPlataformas() {
    const users = [...selUsers], plats = [...addSelPlats]
    if (!users.length || !plats.length) { toast.error('Selecione ao menos uma plataforma.'); return }
    setAlvo('bulk')
    start(async () => {
      let add = 0, ja = 0, err = 0
      for (const uid of users) {
        const m = membros.find((x) => x.userId === uid); if (!m) continue
        const r = await adicionarAdminEmPlataformasAction(uid, plats, m.cargo)
        if (!r.ok) err++; else { add += r.adicionadas ?? 0; ja += r.jaTinha ?? 0 }
      }
      setAlvo(null)
      if (err) toast.error(`${err} falharam.`)
      toast.success(`${add} vínculo(s) criado(s)${ja ? ` · ${ja} já tinha(m)` : ''}.`)
      setAddModal(false); setAddSelPlats(new Set()); setSelUsers(new Set())
      router.refresh() // recarrega as etiquetas
    })
  }

  // EM LOTE — REMOVE o acesso dos admins selecionados a ESTA plataforma (pula "você"). Confirma antes.
  async function bulkRemover() {
    const users = [...selUsers].filter((uid) => membros.find((m) => m.userId === uid && !m.ehVoce))
    if (!users.length) { toast.error('Nenhum admin removível selecionado (você não pode se remover).'); return }
    if (!(await confirmar({ titulo: 'Remover acesso em lote', mensagem: `Remover o acesso de ${users.length} administrador(es) a ESTA plataforma? A conta global (login) permanece — só o vínculo com esta plataforma é apagado.`, confirmar: 'Remover acesso', destrutivo: true }))) return
    setAlvo('bulk')
    start(async () => {
      let rem = 0, err = 0
      for (const uid of users) { const r = await removerAcessoAdminAction(uid, tenantId); if (r.ok) rem++; else err++ }
      setAlvo(null)
      if (err) toast.error(`${err} falharam.`)
      toast.success(`${rem} acesso(s) removido(s).`)
      setSelUsers(new Set()); router.refresh()
    })
  }

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
  // Dados do pop-up "adicionar em outras plataformas".
  const admsSel = membros.filter((m) => selUsers.has(m.userId))
  const outrasPlats = todasPlats.filter((p) => p.id !== tenantId)

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

  // Salvar UNIFICADO: nome + e-mail + (se preenchida) a nova SENHA. Campo de senha vazio mantém a atual.
  function salvarDados(m: AdminMembro) {
    const n = nomeEdit.trim(); const e = emailEdit.trim(); const s = novaSenha.trim()
    if (!n) { toast.error('Informe o nome.'); return }
    if (!e) { toast.error('Informe o e-mail.'); return }
    if (s && s.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres.'); return }
    const mudouDados = n !== (m.nome ?? '') || e.toLowerCase() !== (m.email ?? '').toLowerCase()
    if (!mudouDados && !s) { toast.info('Nada para salvar.'); return }
    setAlvo(m.userId)
    start(async () => {
      let erro: string | null = null
      if (mudouDados) { const r = await atualizarDadosAdminAction(m.userId, { nome: n, email: e }, tenantId); if (!r.ok) erro = r.error ?? 'Falha ao salvar dados.' }
      if (!erro && s) { const r = await resetarSenhaAdminAction(m.userId, s, tenantId); if (!r.ok) erro = r.error ?? 'Falha ao definir a senha.' }
      setAlvo(null)
      if (erro) { toast.error(erro); return }
      if (s) setCred({ email: e || m.email, senha: s }) // mostra a nova senha para copiar
      if (s && ehSuper) { setCofre({ senha: s, em: new Date().toISOString() }); setRevelada(true) } // reflete no cofre na hora
      setNovaSenha('')
      toast.success('Salvo.'); router.refresh()
    })
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

      {/* [console super] Barra de AÇÕES em lote dos admins selecionados (adicionar via pop-up · remover). */}
      {ehSuper && selUsers.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-xs font-semibold">{selUsers.size} selecionado(s)</span>
          <button type="button" disabled={pending} onClick={() => { setAddSelPlats(new Set()); setAddModal(true) }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50">
            <Building2 className="h-3.5 w-3.5" /> Adicionar em outras plataformas
          </button>
          <button type="button" disabled={pending} onClick={bulkRemover}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
            <Trash2 className="h-3.5 w-3.5" /> Remover acesso
          </button>
          {pending && alvo === 'bulk' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <button type="button" onClick={() => setSelUsers(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">limpar seleção</button>
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        {lista.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhum administrador encontrado.</p>
        ) : (
          <div className="divide-y">
            {lista.map((m) => (
              <div key={m.userId} className={cn('flex items-center gap-3 p-3', !m.ativo && 'opacity-60')}>
                {ehSuper && (
                  <button type="button" onClick={() => toggleUser(m.userId)} title="Selecionar para adicionar em lote"
                    className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border transition', selUsers.has(m.userId) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                    {selUsers.has(m.userId) && <Check className="h-3.5 w-3.5" />}
                  </button>
                )}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(m.nome, m.email)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{m.nome || '—'}</span>
                    {m.ehVoce && <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">você</span>}
                    {!m.ativo && <span className="rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">inativo</span>}
                    {/* Etiquetas: plataformas (empresas) deste admin — SÓ quando ele tem acesso a
                        MAIS DE UMA plataforma (multi-tenant). Com 1 só de acesso, não mostra nada.
                        Conta SUPER (acesso global a tudo) é excluída — o badge seria ruído. */}
                    {ehSuper && m.cargo !== 'super_admin' && (m.plataformas?.length ?? 0) > 1 && (m.plataformas ?? []).map((p) => (
                      <span key={p.id} title={p.nome} className={cn('max-w-[140px] truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium', p.id === tenantId ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{p.nome}</span>
                    ))}
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
          <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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

            {/* [console super] Senha ATUAL definida pelo painel (cofre cifrado) — revelar/copiar. */}
            {ehSuper && cofre && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> Senha atual (definida no painel)</p>
                {cofre.senha ? (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 rounded bg-background px-3 py-2 text-xs tracking-wider">{revelada ? cofre.senha : '•'.repeat(Math.min(14, cofre.senha.length))}</code>
                    <button type="button" onClick={() => setRevelada((v) => !v)} title={revelada ? 'Ocultar' : 'Revelar'} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted">{revelada ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(cofre.senha!); toast.success('Senha copiada.') }} title="Copiar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">Nenhuma senha registrada aqui ainda. Defina uma abaixo — a partir daí ela fica visível.</p>
                )}
              </div>
            )}

            {/* Senha — vazio mantém a atual; preenchida é aplicada ao Salvar */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Senha</label>
              <div className="flex gap-2">
                <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="off"
                  placeholder="Deixe em branco para manter a senha atual"
                  className="h-9 flex-1 rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <button type="button" onClick={() => setNovaSenha(gerarSenhaCliente())} title="Sugerir senha forte"
                  className="inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition hover:bg-muted"><Dices className="h-3.5 w-3.5" /> Gerar</button>
              </div>
              <p className="text-[11px] text-muted-foreground">Preencha para <b>definir uma nova senha</b> (aplicada ao clicar em Salvar). Vazio = mantém a atual. O login é global.</p>
            </div>

            {/* Rodapé: Desativar (esq) · Remover + Salvar (dir) — todos na mesma linha */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
              <button type="button" disabled={pending || (config.ehVoce && config.ativo)} onClick={() => toggleAtivo(config)}
                className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50',
                  config.ativo ? 'text-rose-600 hover:bg-rose-500/10 dark:text-rose-400' : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400')}
                title={config.ehVoce && config.ativo ? 'Você não pode desativar o seu acesso' : undefined}>
                {config.ativo ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {config.ativo ? 'Desativar' : 'Reativar'}
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" disabled={pending || config.ehVoce} onClick={() => remover(config)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                  title={config.ehVoce ? 'Você não pode remover o seu acesso' : undefined}>
                  {pending && alvo === config.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remover acesso
                </button>
                <button type="button" onClick={() => salvarDados(config)} disabled={pending || (nomeEdit.trim() === (config.nome ?? '') && emailEdit.trim().toLowerCase() === (config.email ?? '').toLowerCase() && !novaSenha.trim())}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                  {pending && alvo === config.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar dados
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* [console super] POP-UP "Adicionar em outras plataformas": mostra quem vai + as empresas; confirma o vínculo em lote. */}
      {ehSuper && addModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]" onClick={() => { if (!pending) setAddModal(false) }}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="flex items-start gap-3 border-b p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-tight">Adicionar em outras plataformas</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{selUsers.size} administrador(es) · cada um entra com a <span className="font-medium text-foreground">função atual dele</span></p>
              </div>
              <button type="button" onClick={() => setAddModal(false)} className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 p-5">
              {/* Quem vai — chips de admins com iniciais + cargo */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Administradores selecionados</p>
                <div className="flex flex-wrap gap-1.5">
                  {admsSel.slice(0, 10).map((m) => (
                    <span key={m.userId} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-1 pr-2 text-xs">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">{iniciais(m.nome, m.email)}</span>
                      <span className="max-w-[130px] truncate font-medium">{m.nome || m.email}</span>
                    </span>
                  ))}
                  {admsSel.length > 10 && <span className="inline-flex items-center rounded-full border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">+{admsSel.length - 10}</span>}
                </div>
              </div>

              {/* Plataformas de destino */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plataformas de destino</p>
                  {outrasPlats.length > 0 && (
                    <button type="button" onClick={() => setAddSelPlats(addSelPlats.size === outrasPlats.length ? new Set() : new Set(outrasPlats.map((p) => p.id)))}
                      className="text-[11px] font-medium text-primary transition hover:underline">
                      {addSelPlats.size === outrasPlats.length ? 'Limpar' : 'Selecionar todas'}
                    </button>
                  )}
                </div>
                <div className="scroll-claro max-h-56 space-y-1 overflow-y-auto rounded-xl border p-1">
                  {outrasPlats.map((p) => {
                    const on = addSelPlats.has(p.id)
                    return (
                      <button key={p.id} type="button" onClick={() => setAddSelPlats((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                        className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition', on ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'hover:bg-muted')}>
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Building2 className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                      </button>
                    )
                  })}
                  {outrasPlats.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma outra plataforma cadastrada no sistema.</p>}
                </div>
              </div>
            </div>

            {/* Rodapé com resumo + ações */}
            <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4">
              <span className="text-xs text-muted-foreground">
                {addSelPlats.size > 0 ? <><b className="text-foreground">{selUsers.size}</b> admin(s) × <b className="text-foreground">{addSelPlats.size}</b> plataforma(s)</> : 'Escolha ao menos uma plataforma'}
              </span>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setAddModal(false)} className="rounded-lg border px-3.5 py-2 text-sm font-medium transition hover:bg-muted">Cancelar</button>
                <button type="button" disabled={pending || addSelPlats.size === 0} onClick={confirmarAddPlataformas}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50">
                  {pending && alvo === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />} Adicionar
                </button>
              </div>
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
