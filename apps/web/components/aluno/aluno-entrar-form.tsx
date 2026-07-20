'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AlertBox } from '@/components/ui/alert-box'
import { GraduationCap, Loader2, Wrench } from 'lucide-react'

type Metodo = 'email' | 'email_cpf' | 'email_telefone'

export function AlunoEntrarForm({ metodo, plataforma }: { metodo: Metodo; plataforma: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [manutencao, setManutencao] = useState<{ titulo: string; mensagem: string } | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setManutencao(null)
    setCarregando(true)
    try {
      const res = await fetch('/api/aluno/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cpf, telefone }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (j.manutencao) setManutencao({ titulo: j.titulo ?? 'Plataforma em manutenção', mensagem: j.message ?? 'Estamos em manutenção. Tente novamente mais tarde.' })
        else setErro(j.message ?? 'Não foi possível entrar.')
        return
      }
      router.push('/aluno')
      router.refresh()
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{plataforma}</h1>
          <p className="text-sm text-muted-foreground">Entre na sua área do aluno</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>

          {metodo === 'email_cpf' && (
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
            </div>
          )}
          {metodo === 'email_telefone' && (
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          )}

          {manutencao && <AlertBox variante="aviso" icon={Wrench} titulo={manutencao.titulo}>{manutencao.mensagem}</AlertBox>}
          {erro && <p className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</p>}

          <Button type="submit" className="w-full" disabled={carregando || !email}>
            {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  )
}
