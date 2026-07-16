'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, ShieldCheck, GraduationCap, Mail, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LoginLayout = 'painel' | 'centralizado'
export type Plataforma = { id: string; nome: string; dominio: string | null; logo: string | null; logoGrande: string | null; logoSelecao: string | null; selecaoEstilo: 'quadrada' | 'redonda' | 'borda'; loginLayout: LoginLayout; cor: string | null; modoPadrao: 'light' | 'dark' }

function frameSelecao(estilo?: string): string {
  if (estilo === 'quadrada') return 'rounded-xl'
  if (estilo === 'borda') return 'rounded-full border-2'
  return 'rounded-full'
}
type Marca = { nome: string; logo: string | null; logoGrande: string | null; cor: string | null; modoPadrao: 'light' | 'dark'; loginLayout: LoginLayout }
type Modo = 'select' | 'aluno' | 'admin'

const KEYFRAMES = `
@keyframes loginPop { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: none } }
@keyframes loginLeft { from { opacity: 0; transform: translateX(-32px) } to { opacity: 1; transform: none } }
@keyframes loginRight { from { opacity: 0; transform: translateX(32px) } to { opacity: 1; transform: none } }
`

export function LoginEpic({ plataformas, marca }: { plataformas: Plataforma[]; marca: Marca }) {
  const router = useRouter()
  const search = useSearchParams()
  const [modo, setModo] = useState<Modo>('select')
  const [sel, setSel] = useState<Plataforma | null>(plataformas[0] ?? null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(search.get('error'))

  const brand: Marca = modo === 'admin'
    ? marca
    : { nome: sel?.nome ?? marca.nome, logo: sel?.logo ?? marca.logo, logoGrande: sel?.logoGrande ?? marca.logoGrande, cor: sel?.cor ?? marca.cor, modoPadrao: sel?.modoPadrao ?? marca.modoPadrao, loginLayout: sel?.loginLayout ?? marca.loginLayout }
  const cor = brand.cor ?? '#6d28d9'
  const layout: LoginLayout = brand.loginLayout ?? 'painel'
  const logoLogin = brand.logoGrande ?? brand.logo // grande no painel da esquerda
  // Tema escopado: a plataforma escolhida define claro/escuro do login/admin;
  // a tela de seleção fica sempre neutra (clara), sem herdar o tema de uma plataforma.
  const temaPlataforma = brand.modoPadrao === 'dark' ? 'theme-dark' : 'theme-light'

  function escolher(p: Plataforma) {
    if (p.dominio && typeof window !== 'undefined' && !window.location.host.includes(p.dominio)) {
      window.location.href = `https://${p.dominio}/login`
      return
    }
    setSel(p); setErro(null); setModo('aluno')
  }

  async function entrarAluno(e: React.FormEvent) {
    e.preventDefault(); setErro(null); setLoading(true)
    try {
      const res = await fetch('/api/aluno/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const msg = j.message ?? 'E-mail incorreto ou não cadastrado.'
        setErro(msg); toast.error('Não foi possível entrar', { description: msg }); return
      }
      toast.success('Login realizado com sucesso!')
      router.push('/aluno')
    } catch { setErro('Erro de conexão. Tente novamente.'); toast.error('Erro de conexão. Tente novamente.') } finally { setLoading(false) }
  }

  async function entrarAdmin(e: React.FormEvent) {
    e.preventDefault(); setErro(null); setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      const msg = error.message === 'Invalid login credentials' ? 'Credenciais inválidas. Verifique e-mail e senha.' : error.message
      setErro(msg); toast.error('Login incorreto', { description: msg }); setLoading(false); return
    }
    void fetch('/api/audit/login', { method: 'POST' }).catch(() => {})
    toast.success('Login realizado com sucesso!')
    router.push('/admin')
  }

  const adminBtn = (
    <button
      onClick={() => { setErro(null); setSenha(''); setModo(modo === 'admin' ? 'aluno' : 'admin') }}
      className={cn(
        'fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors',
        modo === 'admin' ? 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25' : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground',
      )}>
      {modo === 'admin' ? <GraduationCap className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
      {modo === 'admin' ? 'Área do aluno' : 'Admin'}
    </button>
  )

  // ---------- TELA DE SELEÇÃO (blocos) ----------
  if (modo === 'select') {
    return (
      <div className="theme-light relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground">
        <style>{KEYFRAMES}</style>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full blur-[120px]" style={{ background: `${cor}1f` }} />
        </div>
        <div className="relative w-full max-w-md rounded-2xl border bg-card p-8 shadow-2xl" style={{ animation: 'loginPop .4s ease' }}>
          <div className="mb-7 flex flex-col items-center gap-2 text-center">
            <h1 className="text-xl font-bold tracking-tight">Entrar</h1>
            <p className="text-sm text-muted-foreground">Escolha sua plataforma para acessar.</p>
          </div>

          {erro && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}

          {plataformas.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">Nenhuma plataforma disponível.</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              {plataformas.map((p) => (
                <button key={p.id} onClick={() => escolher(p)} title={`Entrar — ${p.nome}`}
                  className="group flex aspect-[5/4] w-40 flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/40 p-4 text-center transition-colors hover:border-primary/60 hover:bg-primary/10">
                  <span className={`flex h-20 w-20 items-center justify-center overflow-hidden bg-muted transition-transform group-hover:scale-105 ${frameSelecao(p.selecaoEstilo)}`}
                    style={{ borderColor: p.cor ?? cor }}>
                    {(p.logoSelecao ?? p.logo) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logoSelecao ?? p.logo!} alt={p.nome} className="h-full w-full object-cover" />
                    ) : <GraduationCap className="h-9 w-9" style={{ color: p.cor ?? cor }} />}
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold leading-tight">{p.nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {adminBtn}
      </div>
    )
  }

  // ---------- LOGIN (após escolher plataforma / admin) ----------
  const titulo = modo === 'admin' ? 'Acesso administrativo' : `Entre na ${sel?.nome ?? 'plataforma'}`

  // Formulário de credenciais — reutilizado nos dois layouts (painel e centralizado).
  const formLogin = modo === 'aluno' ? (
    <form onSubmit={entrarAluno} className="space-y-4">
      <Campo icon={Mail} type="email" placeholder="Endereço de e-mail" value={email} onChange={setEmail} autoComplete="email" />
      <Submit loading={loading} disabled={!email}>Continuar</Submit>
      <p className="text-center text-xs text-muted-foreground">Estudantes entram apenas com o e-mail cadastrado.</p>
    </form>
  ) : (
    <form onSubmit={entrarAdmin} className="space-y-4">
      <Campo icon={Mail} type="email" placeholder="Endereço de e-mail" value={email} onChange={setEmail} autoComplete="email" />
      <Campo icon={Lock} type="password" placeholder="Senha" value={senha} onChange={setSenha} autoComplete="current-password" />
      <Submit loading={loading} disabled={!email || !senha}>Entrar no painel</Submit>
    </form>
  )

  // LAYOUT CENTRALIZADO (simples): logo + título + formulário num único card no meio da tela.
  if (layout === 'centralizado') {
    return (
      <div className={cn('relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground', temaPlataforma)}>
        <style>{KEYFRAMES}</style>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full blur-[120px]" style={{ background: `${cor}1f` }} />
        </div>
        <div className="relative w-full max-w-sm rounded-2xl border bg-card p-8 shadow-2xl" style={{ animation: 'loginPop .4s ease' }}>
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
              {(brand.logo ?? brand.logoGrande) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(brand.logo ?? brand.logoGrande)!} alt={brand.nome} className="h-full w-full object-contain" />
              ) : <GraduationCap className="h-10 w-10" style={{ color: cor }} />}
            </div>
            <p className="text-lg font-semibold">{brand.nome}</p>
          </div>
          <button type="button" onClick={() => { setModo('select'); setErro(null); setSenha('') }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Trocar plataforma
          </button>
          <h1 className="mb-5 text-xl font-bold tracking-tight">{titulo}</h1>
          {erro && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}
          {formLogin}
        </div>
        {adminBtn}
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-screen overflow-hidden bg-background text-foreground', temaPlataforma)}>
      <style>{KEYFRAMES}</style>

      {/* ESQUERDA — logo da plataforma (configurada em Configurações do sistema) */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden border-r bg-muted/30 lg:flex" style={{ animation: 'loginLeft .5s ease' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 35% 35%, ${cor}26, transparent 60%)` }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full blur-[120px]" style={{ background: `${cor}1f` }} />
        {logoLogin ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoLogin} alt={brand.nome} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="relative flex flex-col items-center gap-6 text-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-[2rem] bg-muted ring-1 ring-border">
              <GraduationCap className="h-16 w-16" style={{ color: cor }} />
            </div>
            <div>
              <p className="text-4xl font-bold tracking-tight">{brand.nome}</p>
              <p className="mt-2 text-muted-foreground">Sua plataforma de simulados</p>
            </div>
          </div>
        )}
      </div>

      {/* DIREITA — credenciais */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-10 lg:w-[480px] lg:shrink-0" style={{ animation: 'loginRight .5s ease' }}>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo} alt={brand.nome} className="h-full w-full object-contain" />
              ) : <GraduationCap className="h-8 w-8" style={{ color: cor }} />}
            </div>
            <p className="text-lg font-semibold">{brand.nome}</p>
          </div>

          <button type="button" onClick={() => { setModo('select'); setErro(null); setSenha('') }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Trocar plataforma
          </button>
          <h1 className="mb-6 text-2xl font-bold tracking-tight">{titulo}</h1>

          {erro && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}

          {formLogin}
        </div>
      </div>

      {adminBtn}
    </div>
  )
}

function Campo({ icon: Icon, type, placeholder, value, onChange, autoComplete }: {
  icon: React.ComponentType<{ className?: string }>; type: string; placeholder: string; value: string; onChange: (v: string) => void; autoComplete?: string
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required
        className="w-full rounded-lg border bg-muted/40 py-3 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:bg-muted" />
    </div>
  )
}

function Submit({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
