'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertBox } from '@/components/ui/alert-box'
import { cn } from '@/lib/utils'
import { GraduationCap, Loader2, Wrench, Mail, IdCard, Phone, ArrowRight, CheckCircle2 } from 'lucide-react'
import { LOGIN_DEFAULT, fundoLoginStyle, type LoginConfig } from '@/lib/login-config'

type Metodo = 'email' | 'email_cpf' | 'email_telefone'

export function AlunoEntrarForm({
  metodo, plataforma, logo = null, subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', config = LOGIN_DEFAULT,
}: {
  metodo: Metodo; plataforma: string; logo?: string | null; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; config?: LoginConfig
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

  const Blobs = config.animacao && (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="lg-aurora absolute -left-24 top-4 h-96 w-96 rounded-full blur-[130px]" style={{ background: 'color-mix(in oklab, var(--brand-accent) 42%, transparent)' }} />
      <div className="lg-aurora2 absolute -bottom-24 right-0 h-96 w-96 rounded-full blur-[130px]" style={{ background: 'color-mix(in oklab, var(--primary) 70%, transparent)' }} />
    </div>
  )

  const MarcaInner = (
    <>
      {Blobs}
      <div className="relative flex items-center gap-3">
        {Emblema}
        <div className="leading-tight">
          <p className="text-lg font-semibold">{plataforma}</p>
          {subtitulo && <p className="text-sm text-white/60">{subtitulo}</p>}
        </div>
      </div>
      <div className="relative max-w-md space-y-5">
        <h2 className="whitespace-pre-line text-[2.4rem] font-extrabold leading-[1.06] tracking-tight">{config.titulo}</h2>
        {config.subtitulo && <p className="text-white/70">{config.subtitulo}</p>}
        {config.destaques.length > 0 && (
          <ul className="space-y-2.5 pt-1">
            {config.destaques.map((d, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-white/85">
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0" style={{ color: 'var(--brand-accent)' }} /> {d}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative text-xs text-white/45">© {new Date().getFullYear()} {plataforma}</div>
    </>
  )

  const FormInner = (
    <div className="w-full max-w-sm space-y-7">
      <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
        {(!config.mostrarMarca || config.layout !== 'split') && <div>{Emblema}</div>}
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
  )

  const KF = <style>{`@keyframes lgDriftA{0%,100%{transform:translate(0,0) scale(1);opacity:.7}50%{transform:translate(8%,-6%) scale(1.12);opacity:1}}@keyframes lgDriftB{0%,100%{transform:translate(0,0) scale(1.08);opacity:.7}50%{transform:translate(-8%,6%) scale(1);opacity:1}}.lg-aurora{animation:lgDriftA 18s ease-in-out infinite}.lg-aurora2{animation:lgDriftB 22s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.lg-aurora,.lg-aurora2{animation:none}}`}</style>

  // ---- LAYOUT: FULL (fundo cheio + card flutuante) ----
  if (config.layout === 'full') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 text-white" style={fundoLoginStyle(config)}>
        {KF}{Blobs}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-white/95 p-7 text-foreground shadow-2xl backdrop-blur-md dark:bg-slate-900/90">
          {FormInner}
        </div>
      </div>
    )
  }

  // ---- LAYOUT: SPLIT (painel da marca + formulário) ----
  if (config.layout === 'split' && config.mostrarMarca) {
    const marca = (
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" style={fundoLoginStyle(config)}>
        {config.fundo === 'imagem' && <div className="absolute inset-0 bg-black/40" />}
        <div className="relative flex h-full flex-col justify-between">{MarcaInner}</div>
      </aside>
    )
    const form = <main className="relative flex min-h-screen items-center justify-center bg-background p-6">{FormInner}</main>
    return (
      <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
        {KF}
        {config.painelLado === 'direita' ? <>{form}{marca}</> : <>{marca}{form}</>}
      </div>
    )
  }

  // ---- LAYOUT: CENTRO (form central, sem painel lateral) ----
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {KF}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">{Blobs}</div>
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-7 shadow-lg">{FormInner}</div>
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
