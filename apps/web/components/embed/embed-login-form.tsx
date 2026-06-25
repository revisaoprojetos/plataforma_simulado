'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookOpen, Loader2, AlertCircle } from 'lucide-react'

type MetodoIdentificacao = 'email' | 'email_cpf' | 'email_telefone'

interface EmbedLoginFormProps {
  token: string
  metodo: MetodoIdentificacao
  simuladoTitulo: string
}

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function EmbedLoginForm({ token, metodo, simuladoTitulo }: EmbedLoginFormProps) {
  const [erro, setErro] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setErro(null)
    setIsLoading(true)

    try {
      parent.postMessage({ type: 'embed-login-start' }, '*')
    } catch {}

    try {
      const res = await fetch('/api/auth/embed/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embed_token: token,
          email: data.email,
          cpf: data.cpf,
          telefone: data.telefone,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErro((json as { message?: string }).message ?? 'Acesso negado. Verifique seus dados.')
        return
      }

      const { sessao_id } = await res.json()
      window.location.href = `/embed/simulado/${token}?sessao_id=${sessao_id}`
    } catch {
      setErro('Erro ao verificar identidade. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const descricaoMetodo =
    metodo === 'email'
      ? 'Informe seu e-mail cadastrado.'
      : metodo === 'email_cpf'
      ? 'Informe seu e-mail e CPF.'
      : 'Informe seu e-mail e telefone.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{simuladoTitulo}</h1>
          <p className="text-sm text-muted-foreground">{descricaoMetodo}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                {...register('email')}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {metodo === 'email_cpf' && (
              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  autoComplete="off"
                  {...register('cpf')}
                  aria-invalid={!!errors.cpf}
                />
                {errors.cpf && (
                  <p className="text-xs text-destructive">{errors.cpf.message}</p>
                )}
              </div>
            )}

            {metodo === 'email_telefone' && (
              <div className="space-y-1.5">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  placeholder="(00) 00000-0000"
                  autoComplete="tel"
                  {...register('telefone')}
                  aria-invalid={!!errors.telefone}
                />
                {errors.telefone && (
                  <p className="text-xs text-destructive">{errors.telefone.message}</p>
                )}
              </div>
            )}

            {erro && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Acessar Simulado'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
