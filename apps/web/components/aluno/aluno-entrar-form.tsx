'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertBox } from '@/components/ui/alert-box'
import { cn } from '@/lib/utils'
import { GraduationCap, Loader2, Wrench, Mail, IdCard, Phone, ArrowRight, CheckCircle2 } from 'lucide-react'

type Metodo = 'email' | 'email_cpf' | 'email_telefone'

const DESTAQUES = [
  'Simulados no padrão da banca',
  'Correção automática e gabarito',
  'Seu desempenho e evolução num só lugar',
]

export function AlunoEntrarForm({
  metodo, plataforma, logo = null, subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado',
}: {
  metodo: Metodo; plataforma: string; logo?: string | null; subtitulo?: string | null; logoBg?: string; logoEstilo?: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [manutencao, setManutencao] = useState<{ titulo: string; mensagem: string } | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setManutencao(null); setCarregando(true)
    try {
      const res = await fetch('/api/aluno/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cpf, telefone }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (j.manutencao) setManutencao({ titulo: j.titulo ?? 'Plataforma em manutenção', mensagem: j.message ?? 'Estamos em manutenção. Tente novamente mais tarde.' })
        else setErro(j.message ?? 'Não foi possível entrar.')
        return
      }
      router.push('/aluno'); router.refresh()
    } catch { setErro('Erro de conexão. Tente novamente.') } finally { setCarregando(false) }
  }

  const molde = logoEstilo === 'quadrado' ? 'rounded-none' : logoEstilo === 'borda' ? 'rounded-xl border' : 'rounded-xl'
  const Emblema = (
    <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden shadow-sm', molde, !logo && 'bg-primary text-primary-foreground')} style={logo ? { background: logoBg } : undefined}>
      {logo
        ? <img src={logo} alt={plataforma} className="h-full w-full object-contain" /> // eslint-disable-line @next/next/no-img-element
        : <GraduationCap className="h-7 w-7" />}
    </div>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* PAINEL DA MARCA (desktop) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ background: 'linear-gradient(150deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 68%, #0b0716) 58%, #0b0716 130%)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-4 h-96 w-96 rounded-full blur-[130px]" style={{ background: 'color-mix(in oklab, var(--brand-accent) 42%, transparent)' }} />
          <div className="absolute -bottom-24 right-0 h-96 w-96 rounded-full blur-[130px]" style={{ background: 'color-mix(in oklab, var(--primary) 70%, transparent)' }} />
        </div>
        <div className="relative flex items-center gap-3">
          {Emblema}
          <div className="leading-tight">
            <p className="text-lg font-semibold">{plataforma}</p>
            {subtitulo && <p className="text-sm text-white/60">{subtitulo}</p>}
          </div>
        </div>
        <div className="relative max-w-md space-y-5">
          <h2 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">Sua preparação<br />começa aqui.</h2>
          <p className="text-white/70">Entre com o seu e-mail e continue de onde parou — sem senha, sem atrito.</p>
          <ul className="space-y-2.5 pt-2">
            {DESTAQUES.map((d) => (
              <li key={d} className="flex items-center gap-2.5 text-sm text-white/85">
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0" style={{ color: 'var(--brand-accent)' }} /> {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-white/45">© {new Date().getFullYear()} {plataforma}</div>
      </aside>

      {/* FORMULÁRIO */}
      <main className="relative flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-7">
          <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <div className="lg:hidden">{Emblema}</div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--brand-accent)' }}>Área do aluno</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Entrar</h1>
              <p className="mt-1 text-sm text-muted-foreground">{plataforma}</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <Campo icon={Mail} type="email" placeholder="Seu e-mail" value={email} onChange={setEmail} autoComplete="email" required />
            {metodo === 'email_cpf' && <Campo icon={IdCard} type="text" placeholder="CPF" value={cpf} onChange={setCpf} inputMode="numeric" />}
            {metodo === 'email_telefone' && <Campo icon={Phone} type="text" placeholder="Telefone" value={telefone} onChange={setTelefone} inputMode="tel" />}

            {manutencao && <AlertBox variante="aviso" icon={Wrench} titulo={manutencao.titulo}>{manutencao.mensagem}</AlertBox>}
            {erro && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</p>}

            <button type="submit" disabled={carregando || !email}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md disabled:opacity-50">
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Entrar
              {!carregando && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </button>

            <p className="text-center text-xs leading-relaxed text-muted-foreground lg:text-left">
              Use o mesmo e-mail cadastrado na plataforma. Como aluno, basta o e-mail — sem senha.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}

function Campo({ icon: Icon, type, placeholder, value, onChange, autoComplete, inputMode, required }: {
  icon: React.ComponentType<{ className?: string }>; type: string; placeholder: string; value: string
  onChange: (v: string) => void; autoComplete?: string; inputMode?: 'numeric' | 'tel'; required?: boolean
}) {
  return (
    <div className="group relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} inputMode={inputMode} required={required}
        className="w-full rounded-xl border bg-card py-3 pl-11 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15" />
    </div>
  )
}
