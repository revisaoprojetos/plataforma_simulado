'use client'

import { Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type MetodoIdentificacao = 'email' | 'email_cpf' | 'email_telefone'
const metodo: MetodoIdentificacao = 'email_cpf'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
})

type FormData = z.infer<typeof loginSchema>

function AlunoLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const simuladoToken = searchParams.get('token')
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/embed/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          cpf: data.cpf,
          telefone: data.telefone,
          token: simuladoToken,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.message ?? 'Acesso negado. Verifique seus dados.')
        return
      }

      const { sessionToken } = await res.json()
      router.push(`/simulado/${simuladoToken}?st=${sessionToken}`)
    } catch {
      toast.error('Erro ao verificar identidade. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
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
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      {metodo === 'email_cpf' && (
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            placeholder="000.000.000-00"
            {...register('cpf')}
            aria-invalid={!!errors.cpf}
          />
          {errors.cpf && (
            <p className="text-sm text-destructive">{errors.cpf.message}</p>
          )}
        </div>
      )}

      {metodo === 'email_telefone' && (
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input
            id="telefone"
            placeholder="(00) 00000-0000"
            {...register('telefone')}
            aria-invalid={!!errors.telefone}
          />
          {errors.telefone && (
            <p className="text-sm text-destructive">{errors.telefone.message}</p>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
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
  )
}

export default function AlunoLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <BookOpen className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Acessar Simulado</h1>
          <p className="text-sm text-muted-foreground">
            Informe seus dados para acessar a prova
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Identificação</CardTitle>
            <CardDescription>
              {metodo === 'email'
                ? 'Informe seu e-mail cadastrado.'
                : metodo === 'email_cpf'
                ? 'Informe seu e-mail e CPF.'
                : 'Informe seu e-mail e telefone.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-48 animate-pulse rounded bg-muted" />}>
              <AlunoLoginForm />
            </Suspense>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Dúvidas? Entre em contato com sua plataforma de ensino.
        </p>
      </div>
    </div>
  )
}
