'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, GraduationCap, Mail, Lock, LogOut, ArrowRight, Building2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { molduraSelecao } from '@/lib/selecao-moldura'

// ENTRADA NEUTRA: o login é brand-agnostic — MESMA identidade em toda plataforma (não puxa
// o tema de nenhum tenant). Tema CLARO/branco, neutro e sóbrio. A marca é só o nome/logo do
// PRODUTO (config global), não de um tenant.
export type Marca = { nome: string; logo: string | null }

// AUTENTICAR-FIRST: o formulário vem primeiro; o seletor de plataformas aparece SÓ depois de
// autenticar (ou se já logado pelo cookie compartilhado). Aluno mantém o fluxo por-subdomínio.
type Modo = 'aluno' | 'admin' | 'selecionar'
type PlatSimples = { id: string; nome: string; slug: string; dominio: string | null; logo: string | null; cor: string | null; estilo?: string | null; semFundo?: boolean }

// Compat: a página ainda pode passar campos antigos; só usamos nome/logo.
export type Plataforma = { id: string; nome: string; [k: string]: unknown }

const KEYFRAMES = `
@keyframes loginUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
@keyframes loginFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes floatBadge { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes breathe { 0%,100% { opacity: .5; transform: scale(1) } 50% { opacity: 1; transform: scale(1.1) } }
@keyframes driftA { 0%,100% { transform: translate(0,0) scale(1); opacity: .65 } 50% { transform: translate(8%,-6%) scale(1.14); opacity: 1 } }
@keyframes driftB { 0%,100% { transform: translate(0,0) scale(1.08); opacity: .65 } 50% { transform: translate(-8%,6%) scale(1); opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .lg-anim { animation: none !important } }
`

/** Fundo claro e calmo: um véu central que respira + dois véus suaves que derivam e pulsam. */
function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* véu central que respira (wrapper centraliza; o filho anima só escala/opacidade) */}
      <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
        <div className="lg-anim h-[48rem] w-[48rem] rounded-full blur-[150px]"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,.12), rgba(148,163,184,.07) 45%, transparent 70%)', animation: 'breathe 15s ease-in-out infinite' }} />
      </div>
      {/* dois véus suaves derivando + pulsando devagar */}
      <div className="lg-anim absolute left-[12%] top-[16%] h-[26rem] w-[26rem] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,.16), transparent 70%)', animation: 'driftA 18s ease-in-out infinite' }} />
      <div className="lg-anim absolute bottom-[12%] right-[10%] h-[24rem] w-[24rem] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(125,211,252,.16), transparent 70%)', animation: 'driftB 22s ease-in-out infinite' }} />
    </div>
  )
}

/** Casca do login: fundo claro fixo + véu calmo + card branco limpo com acento no topo. */
function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 text-slate-900"
      style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f6f7fb 100%)' }}>
      <style>{KEYFRAMES}</style>
      <Aurora />
      <div className={cn('relative w-full', wide ? 'max-w-md' : 'max-w-sm')} style={{ animation: 'loginUp .5s cubic-bezier(.2,.7,.2,1)' }}>
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_24px_60px_-24px_rgba(15,23,42,.18)]">
          {/* linha de acento sutil no topo */}
          <div aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(15,23,42,.18), transparent)' }} />
          {children}
        </div>
      </div>
    </div>
  )
}

export function LoginEpic({ marca, jaLogado, tenantAtualId }: { marca: Marca; jaLogado?: boolean; tenantAtualId?: string | null }) {
  const router = useRouter()
  const search = useSearchParams()
  const [modo, setModo] = useState<Modo>(jaLogado ? 'selecionar' : 'aluno')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(search.get('error'))
  const [minhasPlats, setMinhasPlats] = useState<PlatSimples[] | null>(null)
  const [erroCarregar, setErroCarregar] = useState(false)

  const nome = marca?.nome || 'Simulados'

  function irParaPlataforma(p: PlatSimples) {
    if (typeof window === 'undefined') return
    if (p.id === tenantAtualId) { router.push('/admin'); return }
    const { protocol, host } = window.location
    let url: string
    if (p.dominio) url = `${protocol}//${p.dominio}/admin`
    else { const partes = host.split('.'); const base = partes.length > 1 ? partes.slice(1).join('.') : host; url = `${protocol}//${p.slug}.${base}/admin` }
    window.location.href = url
  }

  // Busca as plataformas do admin ao entrar no seletor. NÃO auto-navega mesmo com 1 só —
  // o admin sempre escolhe explicitamente (nunca é encaminhado direto).
  useEffect(() => {
    if (modo !== 'selecionar' || minhasPlats !== null || erroCarregar) return
    let vivo = true
    fetch('/api/auth/minhas-plataformas', { signal: AbortSignal.timeout(8000) })
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json() })
      .then((d) => { if (vivo) setMinhasPlats(Array.isArray(d?.plataformas) ? d.plataformas : []) })
      .catch(() => { if (vivo) { setErroCarregar(true); toast.error('Não foi possível carregar suas plataformas.') } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, minhasPlats, erroCarregar])

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
    setLoading(false); setMinhasPlats(null); setModo('selecionar')
  }

  // Identidade neutra do produto (logo da config global OU emblema grafite).
  const Emblema = (
    <div className="lg-anim relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 shadow-md" style={{ animation: 'floatBadge 5s ease-in-out infinite' }}>
      {marca?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={marca.logo} alt={nome} className="h-full w-full rounded-2xl object-contain" />
      ) : (
        <GraduationCap className="h-7 w-7 text-white" />
      )}
    </div>
  )

  const Titulo = ({ children }: { children: React.ReactNode }) => (
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{children}</h1>
  )

  // Acesso admin DISCRETO — botãozinho fixo no canto (não em aba). Some no seletor.
  const cantoAdmin = modo !== 'selecionar' && (
    <button
      onClick={() => { setErro(null); setSenha(''); setModo(modo === 'admin' ? 'aluno' : 'admin') }}
      className="fixed bottom-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:text-slate-900">
      {modo === 'admin' ? <><GraduationCap className="h-3.5 w-3.5" /> Área do aluno</> : <><ShieldCheck className="h-3.5 w-3.5" /> Admin</>}
    </button>
  )

  // ---------- SELETOR DE PLATAFORMA (pós-login) ----------
  if (modo === 'selecionar') {
    return (
      <Shell wide>
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          {Emblema}
          <div>
            <Titulo>Escolha a plataforma</Titulo>
            <p className="mt-1 text-sm text-slate-500">Selecione onde deseja entrar.</p>
          </div>
        </div>

        {erroCarregar ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-slate-500">Não foi possível carregar suas plataformas.</p>
            <button type="button" onClick={() => { setErroCarregar(false); setMinhasPlats(null) }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">Tentar novamente</button>
          </div>
        ) : minhasPlats === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : minhasPlats.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">Nenhuma plataforma disponível para esta conta.</p>
        ) : (
          <div className={cn('grid gap-3', minhasPlats.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {minhasPlats.map((p) => (
              <button key={p.id} onClick={() => irParaPlataforma(p)} title={`Entrar — ${p.nome}`}
                className={cn('group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md', minhasPlats.length === 1 ? 'flex-row' : 'flex-col text-center')}>
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border-slate-200 transition-transform group-hover:scale-105', molduraSelecao(p.estilo), p.semFundo ? '' : 'border bg-slate-100')}>
                  {p.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo} alt={p.nome} className="h-full w-full object-cover" />
                  ) : <Building2 className="h-6 w-6 text-slate-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight text-slate-900">{p.nome}</span>
                  {minhasPlats.length === 1 && <span className="block text-xs text-slate-500">Clique para entrar</span>}
                </span>
                {minhasPlats.length === 1 && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />}
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={() => { setModo('aluno'); setMinhasPlats(null); setErroCarregar(false); setEmail(''); setSenha(''); setLoading(false); setErro(null) }}
          className="mt-6 inline-flex w-full items-center justify-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-800">
          <LogOut className="h-3.5 w-3.5" /> Entrar com outra conta
        </button>
      </Shell>
    )
  }

  // ---------- LOGIN (form aluno/admin) ----------
  const ehAdmin = modo === 'admin'

  return (
    <>
      <Shell>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {Emblema}
          <div>
            <Titulo>{nome}</Titulo>
            <p className="mt-1 text-sm text-slate-500">{ehAdmin ? 'Acesso administrativo' : 'Sua plataforma de simulados'}</p>
          </div>
        </div>

        {erro && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" style={{ animation: 'loginFade .3s ease' }}>{erro}</div>}

        {ehAdmin ? (
          <form onSubmit={entrarAdmin} className="space-y-3.5">
            <Campo icon={Mail} type="email" placeholder="Endereço de e-mail" value={email} onChange={setEmail} autoComplete="email" />
            <Campo icon={Lock} type="password" placeholder="Senha" value={senha} onChange={setSenha} autoComplete="current-password" />
            <Submit loading={loading} disabled={!email || !senha}>Entrar no painel</Submit>
          </form>
        ) : (
          <form onSubmit={entrarAluno} className="space-y-3.5">
            <Campo icon={Mail} type="email" placeholder="Endereço de e-mail" value={email} onChange={setEmail} autoComplete="email" />
            <Submit loading={loading} disabled={!email}>Continuar</Submit>
            <p className="text-center text-xs leading-relaxed text-slate-500">
              Use o mesmo e-mail cadastrado na plataforma onde você estuda. Como aluno, basta o e-mail — sem senha.
            </p>
          </form>
        )}
      </Shell>
      {cantoAdmin}
    </>
  )
}

function Campo({ icon: Icon, type, placeholder, value, onChange, autoComplete }: {
  icon: React.ComponentType<{ className?: string }>; type: string; placeholder: string; value: string; onChange: (v: string) => void; autoComplete?: string
}) {
  return (
    <div className="group relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-slate-700" />
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10" />
    </div>
  )
}

function Submit({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
      {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
    </button>
  )
}
