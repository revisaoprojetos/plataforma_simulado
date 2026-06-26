'use client'

import { Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type MetodoIdentificacao = 'email' | 'email_cpf' | 'email_telefone'

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
  // Método resolvido a partir do simulado (não mais fixo no código).
  const [metodo, setMetodo] = useState<MetodoIdentificacao>('email')
  const [carregandoInfo, setCarregandoInfo] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    if (!simuladoToken) {
      setCarregandoInfo(false)
      return
    }
    let ativo = true
    fetch(`/api/simulado/info?token=${simuladoToken}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (ativo && info?.metodo_identificacao) {
          setMetodo(info.metodo_identificacao as MetodoIdentificacao)
        }
      })
      .catch(() => {})
      .finally(() => ativo && setCarregandoInfo(false))
    return () => {
      ativo = false
    }
  }, [simuladoToken])

  async function onSubmit(data: FormData) {
    // Validação client conforme o método exigido pelo simulado.
    if (metodo === 'email_cpf' && !data.cpf?.trim()) {
      toast.error('Informe seu CPF.')
      return
    }
    if (metodo === 'email_telefone' && !data.telefone?.trim()) {
      toast.error('Informe seu telefone.')
      return
    }

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
        const err = await res.json().catch(() => ({}))
        const c = err.contato
        const contatoStr = c
          ? [c.whatsapp && `WhatsApp ${c.whatsapp}`, c.email_suporte, c.telefone].filter(Boolean).join(' · ')
          : ''
        toast.error(err.titulo ?? 'Acesso negado', {
          description: [err.message, contatoStr && `Contato: ${contatoStr}`].filter(Boolean).join('\n'),
        })
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

  if (carregandoInfo) {
    return <div className="h-48 animate-pulse rounded bg-muted" />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {metodo === 'email'
          ? 'Informe seu e-mail cadastrado.'
          : metodo === 'email_cpf'
          ? 'Informe seu e-mail e CPF.'
          : 'Informe seu e-mail e telefone.'}
      </p>

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
              Seus dados são validados contra o cadastro da plataforma.
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
