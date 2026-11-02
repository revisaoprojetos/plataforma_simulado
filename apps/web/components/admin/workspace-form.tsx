'use client'

import { useMemo, useState, useTransition } from 'react'
import { UsersRound, Plus, Trash2, Search, Mail, Users, Check, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmar } from '@/components/ui/confirm-dialog'
import { salvarWorkspace, type WorkspaceGrupo } from '@/app/admin/sistema/actions'

export function WorkspaceForm({
  emailsIniciais,
  gruposIniciais,
  gruposDisponiveis,
  podeEditar,
}: {
  emailsIniciais: string[]
  gruposIniciais: string[]
  gruposDisponiveis: WorkspaceGrupo[]
  podeEditar: boolean
}) {
  const [emails, setEmails] = useState<string[]>(emailsIniciais)
  const [grupos, setGrupos] = useState<string[]>(gruposIniciais)
  const [novo, setNovo] = useState('')
  const [buscaEmail, setBuscaEmail] = useState('')
  const [buscaGrupo, setBuscaGrupo] = useState('')
  const [gerirGrupos, setGerirGrupos] = useState(false)
  const [pending, start] = useTransition()

  const grupoPorId = useMemo(() => new Map(gruposDisponiveis.map((g) => [g.id, g])), [gruposDisponiveis])

  const emailsFiltrados = useMemo(() => {
    const q = buscaEmail.trim().toLowerCase()
    return (q ? emails.filter((e) => e.includes(q)) : emails).slice().sort()
  }, [emails, buscaEmail])

  const gruposFiltrados = useMemo(() => {
    const q = buscaGrupo.trim().toLowerCase()
    return q ? gruposDisponiveis.filter((g) => g.nome.toLowerCase().includes(q)) : gruposDisponiveis
  }, [gruposDisponiveis, buscaGrupo])

  const gruposSelecionados = useMemo(
    () => grupos.map((id) => grupoPorId.get(id) ?? { id, nome: 'Grupo removido', cor: null }),
    [grupos, grupoPorId],
  )

  function salvar(nextEmails: string[], nextGrupos: string[], msg: string) {
    start(async () => {
      const r = await salvarWorkspace(nextEmails, nextGrupos)
      if ('error' in r && r.error) { toast.error(r.error); return }
      setEmails((r as { emails: string[] }).emails)
      setGrupos((r as { grupos: string[] }).grupos)
      toast.success(msg)
    })
  }

  function adicionarEmail() {
    const email = novo.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('E-mail inválido.'); return }
    if (emails.includes(email)) { setNovo(''); return }
    setNovo('')
    salvar([...emails, email], grupos, 'E-mail adicionado ao Workspace.')
  }

  async function removerEmail(email: string) {
    const ok = await confirmar({
      titulo: 'Remover do Workspace',
      mensagem: `Remover ${email}? Esse e-mail volta a seguir as regras normais de acesso e passa a contar em ranking/estatística.`,
      confirmar: 'Remover',
      destrutivo: true,
    })
    if (!ok) return
    salvar(emails.filter((e) => e !== email), grupos, 'E-mail removido.')
  }

  function alternarGrupo(id: string) {
    const next = grupos.includes(id) ? grupos.filter((g) => g !== id) : [...grupos, id]
    salvar(emails, next, 'Grupos do Workspace atualizados.')
  }

  return (
    <div className="w-full space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UsersRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Workspace</h2>
          <p className="text-sm text-muted-foreground">
            A equipe interna da plataforma. Quem estiver aqui — por <strong>e-mail</strong> ou por <strong>grupo</strong> —
            enxerga todas as áreas normalmente (no painel e no portal do aluno), <strong>por cima da manutenção</strong>.
          </p>
        </div>
      </div>

      {/* Aviso de comportamento */}
      <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1 text-muted-foreground">
          <p>A regra do Workspace fica <strong>acima da manutenção</strong>: as áreas em manutenção continuam bloqueando os demais, mas não o Workspace.</p>
          <p>Membros do Workspace ficam <strong>fora de ranking e estatística</strong> — as sessões de simulado deles entram como teste (não pontuam e não poluem os números).</p>
          <p>O e-mail precisa ter <strong>cadastro de aluno</strong> nesta plataforma para o acesso valer no portal.</p>
        </div>
      </div>

      {/* ── E-MAILS ── */}
      <div className="space-y-3">
        {podeEditar && (
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <label className="mb-2 block text-sm font-semibold">Adicionar por e-mail</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={novo}
                  onChange={(e) => setNovo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarEmail() } }}
                  placeholder="email@exemplo.com"
                  className="pl-9"
                  disabled={pending}
                />
              </div>
              <Button onClick={adicionarEmail} disabled={pending || !novo.trim()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div className="text-sm font-semibold">
              {emails.length} {emails.length === 1 ? 'e-mail' : 'e-mails'}
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={buscaEmail} onChange={(e) => setBuscaEmail(e.target.value)} placeholder="Buscar e-mail…" className="pl-9" />
            </div>
          </div>
          {emailsFiltrados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {emails.length === 0 ? 'Nenhum e-mail no Workspace ainda.' : 'Nenhum e-mail corresponde à busca.'}
            </div>
          ) : (
            <ul className="divide-y">
              {emailsFiltrados.map((email) => (
                <li key={email} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm" title={email}>{email}</span>
                  </span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => removerEmail(email)}
                      disabled={pending}
                      aria-label={`Remover ${email}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── GRUPOS ── */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" />
            {grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'} no Workspace
          </div>
          {podeEditar && (
            <Button variant={gerirGrupos ? 'secondary' : 'outline'} size="sm" onClick={() => setGerirGrupos((v) => !v)}>
              {gerirGrupos ? 'Concluir' : 'Gerenciar grupos'}
            </Button>
          )}
        </div>

        {/* Chips dos grupos selecionados */}
        <div className="p-4">
          {gruposSelecionados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum grupo no Workspace. Todo aluno de um grupo adicionado aqui ganha acesso total.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {gruposSelecionados.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.cor || 'var(--primary)' }} />
                  <span className="max-w-[12rem] truncate" title={g.nome}>{g.nome}</span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => alternarGrupo(g.id)}
                      disabled={pending}
                      aria-label={`Remover grupo ${g.nome}`}
                      className="-mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Painel de seleção (checklist com busca) */}
        {podeEditar && gerirGrupos && (
          <div className="border-t p-4">
            <div className="relative mb-3 w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={buscaGrupo} onChange={(e) => setBuscaGrupo(e.target.value)} placeholder="Buscar grupo…" className="pl-9" />
            </div>
            {gruposFiltrados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {gruposDisponiveis.length === 0 ? 'Nenhum grupo cadastrado neste tenant.' : 'Nenhum grupo corresponde à busca.'}
              </p>
            ) : (
              <ul className="max-h-72 divide-y overflow-auto rounded-xl border">
                {gruposFiltrados.map((g) => {
                  const ativo = grupos.includes(g.id)
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => alternarGrupo(g.id)}
                        disabled={pending}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.cor || 'var(--primary)' }} />
                          <span className="truncate" title={g.nome}>{g.nome}</span>
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
                        >
                          {ativo && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
