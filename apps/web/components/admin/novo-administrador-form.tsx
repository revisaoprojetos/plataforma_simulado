'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { UserPlus, Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { criarAdministradorAction, type CargoOpcao } from '@/app/admin/administradores/actions'
import { rotuloCargo } from '@/lib/rbac-cargos'

export function NovoAdministradorForm({ cargos }: { cargos: CargoOpcao[] }) {
  const cargoPadrao = cargos.find((c) => c.nome === 'admin')?.nome ?? cargos[0]?.nome ?? 'admin'
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cargo, setCargo] = useState(cargoPadrao)
  const [senha, setSenha] = useState('')
  const [pending, start] = useTransition()
  const [cred, setCred] = useState<{ email: string; senha: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim() || !cargo) return
    start(async () => {
      const r = await criarAdministradorAction({ nome, email, cargo, senha: senha || undefined })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao criar administrador'); return }
      toast.success(r.jaExistia ? 'Usuário já existia — acesso concedido com o cargo escolhido.' : 'Administrador criado.')
      if (r.senha) setCred({ email: email.trim().toLowerCase(), senha: r.senha })
      setNome(''); setEmail(''); setSenha(''); setCargo(cargoPadrao)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="a-nome">Nome *</Label>
          <Input id="a-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Silva" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="a-email">E-mail *</Label>
          <Input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@cliente.com" />
        </div>
        <div className="space-y-1">
          <Label>Cargo *</Label>
          <Select value={cargo} onValueChange={(v) => setCargo(v ?? cargoPadrao)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {cargos.map((c) => (
                <SelectItem key={c.nome} value={c.nome}>{rotuloCargo(c.nome)}{c.is_sistema ? ' · sistema' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="a-senha">Senha inicial</Label>
          <Input id="a-senha" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Gerada automaticamente se vazio" autoComplete="new-password" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || !nome.trim() || !email.trim() || !cargo}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Adicionar administrador
          </Button>
        </div>
      </form>

      {cred && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900/40 dark:bg-green-900/20">
          <p className="font-medium text-green-800 dark:text-green-300">Administrador criado! Credenciais (mostradas uma única vez):</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 text-xs">{cred.email} · {cred.senha}</code>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${cred.email} / ${cred.senha}`)
                setCopiado(true); setTimeout(() => setCopiado(false), 2000)
              }}
            >
              {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
