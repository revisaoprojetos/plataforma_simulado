'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookOpen, Loader2, Clock, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FitaTopo } from '@/components/prova/fita-topo'
import { LoginResultado, type LoginResultadoTipo } from '@/components/prova/login-popups'
import { ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { ThemeToggle } from '@/components/prova/theme-toggle'
import { efetivarHud, type HudCores, type HudPorPagina, type LoginLayout } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { useDarkMode } from '@/lib/hud/use-dark'

type MetodoIdentificacao = 'email' | 'email_cpf' | 'email_telefone'

function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-xl'
}

interface ProvaInfo {
  status?: string | null
  dataInicio?: string | null
  dataFim?: string | null
  tempoLimiteMin?: number | null
}

interface EmbedLoginFormProps {
  token: string
  metodo: MetodoIdentificacao
  simuladoTitulo: string
  branding?: { nome?: string; logoUrl?: string | null; logoGrandeUrl?: string | null; logoBg?: string; logoEstilo?: string } | null
  prova?: ProvaInfo
  /** para onde ir após identificar: 'embed' (widget) ou 'simulado' (página cheia). */
  destino?: 'embed' | 'simulado'
  /** HUD do caderno — usado para a tela "Carregamento" ao entrar no simulado. */
  hud?: { base: Partial<HudCores>; porPagina: HudPorPagina }
  /** tema inicial (cookie, vindo do servidor) — evita piscada claro→escuro. */
  darkInicial?: boolean
  /** Layout: 'padrao' (completo) ou 'centralizado' (simples, tudo no centro da tela). */
  loginLayout?: LoginLayout
}

/** Formata data/hora "dd/MM/yyyy HH:mm". */
function fmtDT(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function calcDuracao(p?: ProvaInfo): string {
  if (p?.tempoLimiteMin) {
    const h = Math.floor(p.tempoLimiteMin / 60), m = p.tempoLimiteMin % 60
    return h > 0 ? `${h}h${m ? ` ${m}min` : ''}` : `${m}min`
  }
  if (p?.dataInicio && p?.dataFim) {
    const h = Math.round((new Date(p.dataFim).getTime() - new Date(p.dataInicio).getTime()) / 3600000)
    return `${h}h`
  }
  return '—'
}

function calcStatus(p?: ProvaInfo): string {
  const now = Date.now()
  const ini = p?.dataInicio ? new Date(p.dataInicio).getTime() : null
  const fim = p?.dataFim ? new Date(p.dataFim).getTime() : null
  if (p?.status === 'encerrado') return 'Encerrado'
  if (ini && now < ini) return 'Não iniciado'
  if (fim && now > fim) return 'Encerrado'
  // Publicado e dentro da janela (ou sem janela definida) = em andamento.
  return 'Em andamento'
}

/** Cor do selo de situação — cada situação tem sua cor (editável no HUD do login). */
function statusStyle(label: string): React.CSSProperties {
  if (label === 'Não iniciado') return { background: 'var(--prova-sit-nao-iniciado, #2563eb)', color: '#fff' }
  if (label === 'Encerrado') return { background: 'var(--prova-sit-encerrado, #dc2626)', color: '#fff' }
  if (label === 'Disponível') return { background: 'var(--prova-sit-disponivel, #6d28d9)', color: '#fff' }
  return { background: 'var(--prova-sit-andamento, #e6b83c)', color: '#1a1d24' } // Em andamento (amarelo, texto escuro)
}

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Contato {
  whatsapp?: string | null
  email_suporte?: string | null
  telefone?: string | null
  link_ajuda?: string | null
  horario_atendimento?: string | null
}

interface ErroBloqueio {
  titulo?: string
  message: string
  contato?: Contato | null
  tipo?: LoginResultadoTipo
}

export function EmbedLoginForm({ token, metodo, simuladoTitulo, branding, prova, destino = 'embed', hud, darkInicial = false, loginLayout = 'padrao' }: EmbedLoginFormProps) {
  const [erro, setErro] = useState<ErroBloqueio | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [dark, toggleDark] = useDarkMode(darkInicial)
  const router = useRouter()
  const coresLogin = efetivarHud(hud?.base, hud?.porPagina, 'login')

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
        const json = (await res.json().catch(() => ({}))) as ErroBloqueio
        setErro({
          titulo: json.titulo,
          message: json.message ?? 'Acesso negado. Verifique seus dados.',
          contato: json.contato,
          tipo: json.tipo ?? 'email_invalido',
        })
        setIsLoading(false)
        return
      }

      const { sessao_id } = await res.json()
      // Entra na tela "Carregamento" do caderno antes de abrir o simulado.
      setSucesso(true)
      toast.success('Login realizado! Entrando no simulado...')
      if (destino === 'simulado') {
        // Navegação client-side: mantém a tela de carregamento temada, sem flash branco do navegador.
        router.push(`/simulado/${token}?st=${sessao_id}`)
      } else {
        setTimeout(() => { window.location.href = `/embed/simulado/${token}?sessao_id=${sessao_id}` }, 1600)
      }
    } catch {
      setErro({ message: 'Erro ao verificar identidade. Tente novamente.', tipo: 'email_invalido' })
      setIsLoading(false)
    }
  }

  const plataforma = (branding?.nome ?? 'Revisão').replace(/^plataforma\s+/i, '')
  const statusLabel = calcStatus(prova)
  const statusSty = statusStyle(statusLabel)
  const duracao = calcDuracao(prova)

  // Formulário de identificação — reutilizado nos dois layouts (padrão e centralizado).
  const formulario = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail cadastrado na <strong className="font-semibold" style={{ color: 'var(--prova-login-destaque, var(--primary))' }}>plataforma do {plataforma}</strong> *</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          style={{ background: 'var(--prova-login-input, var(--background))' }}
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {metodo === 'email_cpf' && (
        <div className="space-y-1.5">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" placeholder="000.000.000-00" autoComplete="off" style={{ background: 'var(--prova-login-input, var(--background))' }} {...register('cpf')} aria-invalid={!!errors.cpf} />
          {errors.cpf && <p className="text-xs text-destructive">{errors.cpf.message}</p>}
        </div>
      )}

      {metodo === 'email_telefone' && (
        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" placeholder="(00) 00000-0000" autoComplete="tel" style={{ background: 'var(--prova-login-input, var(--background))' }} {...register('telefone')} aria-invalid={!!errors.telefone} />
          {errors.telefone && <p className="text-xs text-destructive">{errors.telefone.message}</p>}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={isLoading} style={{ background: 'var(--prova-login-botao, var(--primary))' }}>
        {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando...</>) : 'Iniciar simulado'}
      </Button>
    </form>
  )

  // Layout CENTRALIZADO (simples): tudo no centro exato da tela, um único card, mínimo de
  // elementos — pensado para o aluno não clicar/errar. Escolhido no HUD do caderno.
  if (loginLayout === 'centralizado') {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background p-4" style={hudCssVars(coresLogin, dark) as React.CSSProperties}>
        <ThemeToggle dark={dark} onToggle={toggleDark} className="absolute right-4 top-4" />
        <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
          <div className="mb-6 flex flex-col items-center text-center">
            {branding?.logoUrl && (
              <div className={cn('mb-4 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden', frameLogo(branding.logoEstilo))} style={{ background: branding.logoBg ?? '#ffffff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold" style={statusSty}>{statusLabel}</span>
            <h1 className="mt-3 text-2xl font-extrabold uppercase leading-tight tracking-tight" style={{ color: 'var(--prova-titulo, var(--primary))' }}>{simuladoTitulo}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Duração: <strong className="font-semibold text-foreground">{duracao}</strong></p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-lg">
            <FitaTopo />
            <h2 className="mb-4 text-center text-base font-semibold">Identifique-se para iniciar</h2>
            {formulario}
          </div>
        </div>
        {erro && <LoginResultado overlay tipo={erro.tipo ?? 'email_invalido'} mensagem={erro.message} contato={erro.contato} plataforma={plataforma} onVoltar={() => setErro(null)} />}
      </div>
    )
  }

  // Sucesso: entra na tela "Carregamento" do caderno (mesmo estilo/cor) antes de abrir o simulado.
  if (sucesso) {
    const cores = efetivarHud(hud?.base, hud?.porPagina, 'loading')
    return (
      <div style={hudCssVars(cores, dark) as React.CSSProperties}>
        <ProvaLoading
          mensagem="Preparando seu simulado..."
          tipo={cores.loadingTipo as EstiloProvaLoading}
          logoUrl={branding?.logoUrl ?? null}
          logoBg={branding?.logoBg}
          logoEstilo={branding?.logoEstilo}
        />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-start justify-center bg-background p-4 py-10 sm:py-14" style={hudCssVars(coresLogin, dark) as React.CSSProperties}>
      <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
        {/* Cabeçalho: status + título + logo + tema */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding?.logoUrl && (
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden', frameLogo(branding.logoEstilo))} style={{ background: branding.logoBg ?? '#ffffff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <div>
              <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold" style={statusSty}>{statusLabel}</span>
              <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight sm:text-4xl" style={{ color: 'var(--prova-titulo, var(--primary))' }}>{simuladoTitulo}</h1>
            </div>
          </div>
          <ThemeToggle dark={dark} onToggle={toggleDark} className="mt-1" />
        </div>

        {/* Card: Informações da prova */}
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm">
          <FitaTopo />
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5" style={{ color: 'var(--primary)' }} /> Informações do simulado</h2>
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /> Duração: <strong className="font-semibold">{duracao}</strong></div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Início</p>
              <p className="mt-0.5 text-sm font-semibold">{fmtDT(prova?.dataInicio)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Encerra</p>
              <p className="mt-0.5 text-sm font-semibold">{fmtDT(prova?.dataFim)}</p>
            </div>
          </div>
        </div>

        {/* Card: Identificação */}
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm">
          <FitaTopo />
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5" style={{ color: 'var(--primary)' }} /> Identifique-se para iniciar</h2>
          {formulario}
        </div>
      </div>

      {/* Pop-up de bloqueio aparece POR CIMA da página de login (overlay). */}
      {erro && <LoginResultado overlay tipo={erro.tipo ?? 'email_invalido'} mensagem={erro.message} contato={erro.contato} plataforma={plataforma} onVoltar={() => setErro(null)} />}
    </div>
  )
}
