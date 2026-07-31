'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertBox } from '@/components/ui/alert-box'
import { cn } from '@/lib/utils'
import { GraduationCap, Loader2, Wrench, Mail, IdCard, Phone, ArrowRight, CheckCircle2 } from 'lucide-react'
import { LOGIN_DEFAULT, fundoLoginStyle, loginVars, corPrimariaLogin, corAccentLogin, type LoginConfig } from '@/lib/login-config'

type Metodo = 'email' | 'email_cpf' | 'email_telefone'

const KF = `@keyframes lgDriftA{0%,100%{transform:translate(0,0) scale(1);opacity:.7}50%{transform:translate(8%,-6%) scale(1.12);opacity:1}}@keyframes lgDriftB{0%,100%{transform:translate(0,0) scale(1.08);opacity:.7}50%{transform:translate(-8%,6%) scale(1);opacity:1}}.lg-aurora{animation:lgDriftA 18s ease-in-out infinite}.lg-aurora2{animation:lgDriftB 22s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.lg-aurora,.lg-aurora2{animation:none}}`

export function AlunoEntrarForm({
  metodo, plataforma, logo = null, subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', config = LOGIN_DEFAULT, preview = false,
}: {
  metodo: Metodo; plataforma: string; logo?: string | null; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; config?: LoginConfig; preview?: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [manutencao, setManutencao] = useState<{ titulo: string; mensagem: string } | null>(null)
  const [carregando, setCarregando] = useState(false)

  const c = config
  const accent = corAccentLogin(c)
  const primaria = corPrimariaLogin(c)
  const screen = preview ? 'h-full' : 'min-h-screen'
  const rootVars = loginVars(c)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (preview) return
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
  function Emblema({ tam = 'md' }: { tam?: 'md' | 'lg' }) {
    const s = tam === 'lg' ? 'h-16 w-16' : 'h-14 w-14'
    return (
      <div className={cn('flex shrink-0 items-center justify-center overflow-hidden shadow-sm', s, molde, !logo && 'bg-primary text-primary-foreground')} style={logo ? { background: logoBg } : undefined}>
        {logo ? <img src={logo} alt={plataforma} className="h-full w-full object-contain" /> : <GraduationCap className={tam === 'lg' ? 'h-8 w-8' : 'h-7 w-7'} />}
      </div>
    )
  }

  const Blobs = c.animacao ? (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="lg-aurora absolute -left-24 top-4 h-96 w-96 rounded-full blur-[130px]" style={{ background: `color-mix(in oklab, ${accent} 42%, transparent)` }} />
      <div className="lg-aurora2 absolute -bottom-24 right-0 h-96 w-96 rounded-full blur-[130px]" style={{ background: `color-mix(in oklab, ${primaria} 70%, transparent)` }} />
    </div>
  ) : null

  function MarcaTexto({ dark = true }: { dark?: boolean }) {
    const muted = dark ? 'text-white/70' : 'text-muted-foreground'
    const strong = dark ? 'text-white' : 'text-foreground'
    return (
      <div className="relative max-w-md space-y-5">
        <h2 className={cn('whitespace-pre-line text-[2.3rem] font-extrabold leading-[1.06] tracking-tight', strong)}>{c.titulo}</h2>
        {c.subtitulo && <p className={muted}>{c.subtitulo}</p>}
        {c.destaques.length > 0 && (
          <ul className="space-y-2.5 pt-1">
            {c.destaques.map((d, i) => (
              <li key={i} className={cn('flex items-center gap-2.5 text-sm', dark ? 'text-white/85' : 'text-foreground/80')}>
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0" style={{ color: accent }} /> {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  function Campos() {
    return (
      <>
        <Campo icon={Mail} type="email" placeholder="Seu e-mail" value={email} onChange={setEmail} autoComplete="email" required readOnly={preview} />
        {metodo === 'email_cpf' && <Campo icon={IdCard} type="text" placeholder="CPF" value={cpf} onChange={setCpf} inputMode="numeric" readOnly={preview} />}
        {metodo === 'email_telefone' && <Campo icon={Phone} type="text" placeholder="Telefone" value={telefone} onChange={setTelefone} inputMode="tel" readOnly={preview} />}
        {manutencao && <AlertBox variante="aviso" icon={Wrench} titulo={manutencao.titulo}>{manutencao.mensagem}</AlertBox>}
        {erro && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</p>}
        <button type="submit" disabled={carregando || (!preview && !email)}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md disabled:opacity-60">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Entrar
          {!carregando && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </>
    )
  }

  function FormBloco({ comEmblema = true, centro = false }: { comEmblema?: boolean; centro?: boolean }) {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className={cn('flex flex-col gap-3', centro ? 'items-center text-center' : 'items-start text-left')}>
          {comEmblema && <Emblema />}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent }}>Área do aluno</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Entrar</h1>
            <p className="mt-1 text-sm text-muted-foreground">{plataforma}</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3.5">
          <Campos />
          <p className={cn('text-xs leading-relaxed text-muted-foreground', centro ? 'text-center' : 'text-left')}>Como aluno, basta o e-mail — sem senha.</p>
        </form>
      </div>
    )
  }

  const cardCls = c.cardEstilo === 'vidro'
    ? 'rounded-2xl border border-white/15 bg-white/95 p-7 shadow-2xl backdrop-blur-md dark:bg-slate-900/90'
    : 'rounded-2xl border bg-card p-7 shadow-xl'

  const style = { ...rootVars } as React.CSSProperties

  // ---------------- TEMPLATE: SPLIT ----------------
  if (c.template === 'split' && c.mostrarMarca) {
    const marca = (
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" style={fundoLoginStyle(c)}>
        {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/45" />}
        {Blobs}
        <div className="relative flex items-center gap-3">
          <Emblema />
          <div className="leading-tight"><p className="text-lg font-semibold">{plataforma}</p>{subtitulo && <p className="text-sm text-white/60">{subtitulo}</p>}</div>
        </div>
        <MarcaTexto />
        <div className="relative text-xs text-white/45">© {new Date().getFullYear()} {plataforma}</div>
      </aside>
    )
    const form = <main className={cn('relative flex items-center justify-center bg-background p-6', screen)}>{FormBloco({})}</main>
    return (
      <div className={cn('lg:grid lg:grid-cols-[1.05fr_1fr]', screen)} style={style}>
        <style>{KF}</style>
        {c.painelLado === 'direita' ? <>{form}{marca}</> : <>{marca}{form}</>}
      </div>
    )
  }

  // ---------------- TEMPLATE: HERO (imagem/gradiente cheio + card) ----------------
  if (c.template === 'hero') {
    return (
      <div className={cn('relative flex items-center justify-center overflow-hidden p-6 text-white', screen)} style={{ ...style, ...fundoLoginStyle(c) }}>
        <style>{KF}</style>{Blobs}
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between">
          {c.mostrarMarca && <div className="hidden max-w-md lg:block"><MarcaTexto /></div>}
          <div className={cn('w-full max-w-sm text-foreground', cardCls)}>{FormBloco({ centro: false })}</div>
        </div>
      </div>
    )
  }

  // ---------------- TEMPLATE: VITRINE (faixa da marca no topo + card) ----------------
  if (c.template === 'vitrine') {
    return (
      <div className={cn('relative flex flex-col bg-background', screen)} style={style}>
        <style>{KF}</style>
        {c.mostrarMarca && (
          <div className="relative flex flex-col items-center gap-4 overflow-hidden px-6 py-12 text-center text-white" style={fundoLoginStyle(c)}>
            {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/45" />}
            {Blobs}
            <div className="relative"><Emblema tam="lg" /></div>
            <div className="relative"><MarcaTexto /></div>
          </div>
        )}
        <div className="relative flex flex-1 items-center justify-center p-6">
          <div className={cn('w-full max-w-sm', cardCls)}>{FormBloco({ comEmblema: !c.mostrarMarca, centro: true })}</div>
        </div>
      </div>
    )
  }

  // ---------------- TEMPLATE: CARTÃO (card único sobre gradiente) ----------------
  if (c.template === 'cartao') {
    return (
      <div className={cn('relative flex items-center justify-center overflow-hidden p-6', screen)} style={{ ...style, ...fundoLoginStyle(c) }}>
        <style>{KF}</style>{Blobs}
        {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/40" />}
        <div className={cn('relative w-full max-w-md', cardCls)}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center">
            <Emblema tam="lg" />
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">{c.titulo}</h2>
              {c.subtitulo && <p className="mt-1 text-sm text-muted-foreground">{c.subtitulo}</p>}
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3.5"><Campos /></form>
          <p className="mt-3 text-center text-xs text-muted-foreground">{plataforma} · basta o e-mail, sem senha.</p>
        </div>
      </div>
    )
  }

  // ---------------- TEMPLATE: CENTRAL (card central sobre gradiente + aurora) ----------------
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden p-6', screen)} style={{ ...style, ...fundoLoginStyle(c) }}>
      <style>{KF}</style>{Blobs}
      {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/40" />}
      <div className={cn('relative w-full max-w-sm text-foreground', cardCls)}>{FormBloco({ centro: true })}</div>
    </div>
  )
}

function Campo({ icon: Icon, type, placeholder, value, onChange, autoComplete, inputMode, required, readOnly }: {
  icon: React.ComponentType<{ className?: string }>; type: string; placeholder: string; value: string
  onChange: (v: string) => void; autoComplete?: string; inputMode?: 'numeric' | 'tel'; required?: boolean; readOnly?: boolean
}) {
  return (
    <div className="group relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} inputMode={inputMode} required={required} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined}
        className="w-full rounded-xl border bg-card py-3 pl-11 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15" />
    </div>
  )
}
