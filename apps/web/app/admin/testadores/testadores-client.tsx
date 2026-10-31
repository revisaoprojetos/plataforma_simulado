'use client'

import { useMemo, useState, useTransition } from 'react'
import { FlaskConical, Plus, Trash2, Search, Mail, ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmar } from '@/components/ui/confirm-dialog'
import { adicionarTestadorGlobalAction, removerTestadorGlobalAction } from './actions'

export function TestadoresClient({ emailsIniciais, podeEditar }: { emailsIniciais: string[]; podeEditar: boolean }) {
  const [emails, setEmails] = useState<string[]>(emailsIniciais)
  const [novo, setNovo] = useState('')
  const [busca, setBusca] = useState('')
  const [pending, start] = useTransition()

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (q ? emails.filter((e) => e.includes(q)) : emails).slice().sort()
  }, [emails, busca])

  function adicionar() {
    const email = novo.trim().toLowerCase()
    if (!email) return
    start(async () => {
      const r = await adicionarTestadorGlobalAction(email)
      if ('error' in r && r.error) { toast.error(r.error); return }
      setEmails((r as { emails: string[] }).emails)
      setNovo('')
      toast.success('Testador adicionado.')
    })
  }

  async function remover(email: string) {
    const ok = await confirmar({
      titulo: 'Remover testador',
      mensagem: `Remover ${email} da lista de testadores? Esse e-mail volta a seguir as regras normais de acesso.`,
      confirmar: 'Remover',
      destrutivo: true,
    })
    if (!ok) return
    start(async () => {
      const r = await removerTestadorGlobalAction(email)
      if ('error' in r && r.error) { toast.error(r.error); return }
      setEmails((r as { emails: string[] }).emails)
      toast.success('Testador removido.')
    })
  }

  return (
    <div className="w-full space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Testadores</h1>
          <p className="text-sm text-muted-foreground">
            E-mails com <strong>acesso total</strong> ao entrar como aluno — enxergam áreas em manutenção e qualquer
            conteúdo bloqueado para os demais (matrícula, grupo, prazo, não publicado, Biblioteca).
          </p>
        </div>
      </div>

      {/* Aviso de comportamento */}
      <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1 text-muted-foreground">
          <p>O e-mail precisa ter <strong>cadastro de aluno</strong> nesta plataforma (o acesso é checado no login do aluno).</p>
          <p>As ações do testador <strong>contam normalmente</strong> em ranking e estatísticas — eles só ganham o acesso, não ficam de fora dos números.</p>
        </div>
      </div>

      {/* Adicionar */}
      {podeEditar && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">Adicionar testador</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
                placeholder="email@exemplo.com"
                className="pl-9"
                disabled={pending}
              />
            </div>
            <Button onClick={adicionar} disabled={pending || !novo.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="text-sm font-semibold">
            {emails.length} {emails.length === 1 ? 'testador' : 'testadores'}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar e-mail…" className="pl-9" />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {emails.length === 0 ? 'Nenhum testador cadastrado ainda.' : 'Nenhum e-mail corresponde à busca.'}
          </div>
        ) : (
          <ul className="divide-y">
            {filtrados.map((email) => (
              <li key={email} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm" title={email}>{email}</span>
                </span>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => remover(email)}
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
  )
}
