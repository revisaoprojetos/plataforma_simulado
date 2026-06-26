'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { createTenantAction } from '@/app/admin/tenants/actions'

export function NovoTenantForm() {
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [plano, setPlano] = useState('basico')
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [credenciais, setCredenciais] = useState<{ email: string; senha: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const router = useRouter()

  function slugify(v: string) {
    return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !slug.trim() || !email.trim()) return
    startTransition(async () => {
      const r = await createTenantAction({ nome, slug, plano, admin_email: email })
      if (r.ok) {
        toast.success('Plataforma criada')
        if (r.senha) setCredenciais({ email, senha: r.senha })
        setNome(''); setSlug(''); setEmail(''); setPlano('basico')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Erro ao criar plataforma')
      }
    })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="t-nome">Nome da plataforma *</Label>
          <Input id="t-nome" value={nome} onChange={(e) => { setNome(e.target.value); if (!slug) setSlug(slugify(e.target.value)) }} placeholder="Ex.: Revisão PGE" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-slug">Subdomínio (slug) *</Label>
          <Input id="t-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="revisaopge" />
        </div>
        <div className="space-y-1">
          <Label>Plano</Label>
          <Select value={plano} onValueChange={(v) => setPlano(v ?? 'basico')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basico">Básico</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-email">E-mail do admin inicial *</Label>
          <Input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@cliente.com" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || !nome.trim() || !slug.trim() || !email.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Criar plataforma
          </Button>
        </div>
      </form>

      {credenciais && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900/40 dark:bg-green-900/20">
          <p className="font-medium text-green-800 dark:text-green-300">Plataforma criada! Credenciais do admin (mostradas uma única vez):</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 text-xs">{credenciais.email} · {credenciais.senha}</code>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${credenciais.email} / ${credenciais.senha}`)
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
