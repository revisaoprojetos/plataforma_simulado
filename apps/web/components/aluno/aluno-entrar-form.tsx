'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertBox } from '@/components/ui/alert-box'
import { cn } from '@/lib/utils'
import { GraduationCap, Loader2, Wrench, Mail, IdCard, Phone, Lock, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LOGIN_DEFAULT, fundoLoginStyle, loginVars, corPrimariaLogin, corAccentLogin, entradaClasse, type LoginConfig } from '@/lib/login-config'
import { LoginLoading } from '@/components/aluno/login-loading'

type Metodo = 'email' | 'email_cpf' | 'email_telefone'

const KF = `@keyframes lgDriftA{0%,100%{transform:translate(0,0) scale(1);opacity:.7}50%{transform:translate(8%,-6%) scale(1.12);opacity:1}}@keyframes lgDriftB{0%,100%{transform:translate(0,0) scale(1.08);opacity:.7}50%{transform:translate(-8%,6%) scale(1);opacity:1}}@keyframes lgUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.lg-aurora{animation:lgDriftA 18s ease-in-out infinite}.lg-aurora2{animation:lgDriftB 22s ease-in-out infinite}.lg-up{animation:lgUp .55s cubic-bezier(.2,.7,.2,1) both}@keyframes lgeFade{from{opacity:0}to{opacity:1}}@keyframes lgeUp{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}@keyframes lgeDown{from{opacity:0;transform:translateY(-26px)}to{opacity:1;transform:none}}@keyframes lgeZoom{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}@keyframes lgeSlide{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:none}}@keyframes lgePop{0%{opacity:0;transform:scale(.8)}60%{opacity:1;transform:scale(1.04)}100%{transform:scale(1)}}@keyframes lgeGiro{from{opacity:0;transform:perspective(900px) rotateX(14deg) translateY(18px)}to{opacity:1;transform:none}}.lge-fade{animation:lgeFade .5s ease both}.lge-up{animation:lgeUp .55s cubic-bezier(.2,.7,.2,1) both}.lge-down{animation:lgeDown .55s cubic-bezier(.2,.7,.2,1) both}.lge-zoom{animation:lgeZoom .5s cubic-bezier(.2,.7,.2,1) both}.lge-slide{animation:lgeSlide .55s cubic-bezier(.2,.7,.2,1) both}.lge-pop{animation:lgePop .6s cubic-bezier(.2,.8,.2,1) both}.lge-giro{animation:lgeGiro .6s ease both}@media (prefers-reduced-motion:reduce){.lg-aurora,.lg-aurora2,.lg-up,[class*="lge-"]{animation:none}}`

export function AlunoEntrarForm({
  metodo, plataforma, logo = null, subtitulo, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', config = LOGIN_DEFAULT, preview = false, modoInicial = 'aluno',
}: {
  metodo: Metodo; plataforma: string; logo?: string | null; subtitulo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string; config?: LoginConfig; preview?: boolean; modoInicial?: 'aluno' | 'admin'
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'aluno' | 'admin'>(modoInicial)
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [manutencao, setManutencao] = useState<{ titulo: string; mensagem: string } | null>(null)
  const [carregando, setCarregando] = useState(false)

  const ehAdmin = modo === 'admin'
  const c = config
  const accent = corAccentLogin(c)
  const primaria = corPrimariaLogin(c)
  const screen = preview ? 'h-full' : 'min-h-screen'
  const rootVars = loginVars(c)

  // Preserva o DESTINO original (?redirectTo=) do link acessado antes do login (ex.: proxy
  // manda /admin/... → /login?redirectTo=/admin/...). Só aceita caminho interno, nunca /login.
  const destinoRedirect = (): string | null => {
    if (typeof window === 'undefined') return null
    const rt = new URLSearchParams(window.location.search).get('redirectTo')
    return rt && rt.startsWith('/') && !rt.startsWith('/login') ? rt : null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (preview) return
    if (ehAdmin) return entrarAdmin()
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
      // Marca "acabou de logar" → o portal mostra o pop-up 1x (só no login, não a cada visita à home).
      try { sessionStorage.setItem('popup-login', '1') } catch {}
      // Se veio de um link do aluno (ex.: /aluno/... ou /simulado/...), volta pra lá; senão, home.
      const rt = destinoRedirect()
      const destino = rt && /^\/(aluno|simulado)(\/|$|\?)/.test(rt) ? rt : '/aluno'
      setEntrando(true); router.push(destino); router.refresh()
    } catch { setErro('Erro de conexão. Tente novamente.') } finally { setCarregando(false) }
  }

  // Login administrativo (e-mail + senha). Após autenticar, mantém o ?redirectTo= (o proxy leva ao
  // destino); sem ele, vai ao /login que roteia: admin comum → /admin; super-admin → seletor + console.
  async function entrarAdmin() {
    setErro(null); setManutencao(null); setCarregando(true)
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password: senha })
      if (error) { setErro(error.message === 'Invalid login credentials' ? 'Credenciais inválidas. Verifique e-mail e senha.' : error.message); return }
      void fetch('/api/audit/login', { method: 'POST' }).catch(() => {})
      // Com destino (link direto) → vai DIRETO pra ele (o cookie de sessão já foi setado pelo signIn).
      // Sem destino → /login, que roteia: admin comum → /admin; super-admin → seletor de plataformas.
      const rt = destinoRedirect()
      setEntrando(true); router.push(rt ?? '/login'); router.refresh()
    } catch { setErro('Erro de conexão. Tente novamente.') } finally { setCarregando(false) }
  }

  function alternarModo() { setModo((m) => (m === 'admin' ? 'aluno' : 'admin')); setErro(null); setManutencao(null); setSenha('') }

  // Config de logo (override do login) com fallback ao tema.
  const effLogo = c.logoUrl ?? logo
  const effBg = c.logoBg ?? logoBg
  const effEstilo = c.logoEstilo ?? logoEstilo
  const effFiltro = c.logoFiltro ?? logoFiltro ?? 'none'
  const molde = effEstilo === 'quadrado' ? 'rounded-none' : effEstilo === 'borda' ? 'rounded-xl border' : 'rounded-xl'
  const filtroCss = effFiltro === 'branco' ? 'brightness(0) invert(1)' : effFiltro === 'preto' ? 'brightness(0)' : undefined
  const effOpac = (c.logoOpacidade ?? 100) / 100
  const logoTint = effFiltro === 'cor' ? (c.logoCor ?? primaria) : null
  const SZ: Record<string, [string, string]> = { p: ['h-11 w-11', 'h-6 w-6'], m: ['h-14 w-14', 'h-7 w-7'], g: ['h-20 w-20', 'h-10 w-10'] }
  const bump: Record<string, 'p' | 'm' | 'g'> = { p: 'm', m: 'g', g: 'g' }
  const logoTransp = effBg === 'transparent'
  const maskStyle = (url: string): React.CSSProperties => ({ WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")`, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' })
  function Emblema({ tam }: { tam?: 'lg' }) {
    if (!c.mostrarLogo) return null
    const key = tam === 'lg' ? bump[c.logoTamanho] : c.logoTamanho
    const [box, ic] = SZ[key]
    return (
      <div className={cn('flex shrink-0 items-center justify-center overflow-hidden', box, molde, logoTransp ? 'shadow-none' : 'shadow-sm', !effLogo && 'bg-primary text-primary-foreground')}
        style={effLogo ? { background: logoTransp ? 'transparent' : (effBg ?? '#ffffff') } : undefined}>
        {!effLogo ? <GraduationCap className={ic} />
          : logoTint ? <span className="h-full w-full" style={{ background: logoTint, opacity: effOpac, ...maskStyle(effLogo) }} />
          : <img src={effLogo} alt={plataforma} className="h-full w-full object-contain" style={{ filter: filtroCss, opacity: effOpac }} />}
      </div>
    )
  }

  // Brilhos (primária/destaque): "Animação" é o interruptor master (desligou → some sempre).
  // Com imagem de fundo, o toggle "Cores sobre a imagem" (fundoImagemCores) desliga ADICIONALMENTE.
  // Ou seja: qualquer um dos dois desativa os brilhos sobre a imagem.
  const temImg = c.fundo === 'imagem' && !!c.fundoImagem
  const mostrarGlow = c.animacao && (!temImg || c.fundoImagemCores !== false)
  const Blobs = mostrarGlow ? (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="lg-aurora absolute -left-24 top-4 h-96 w-96 rounded-full blur-[130px]" style={{ background: `color-mix(in oklab, ${accent} 42%, transparent)` }} />
      <div className="lg-aurora2 absolute -bottom-24 right-0 h-96 w-96 rounded-full blur-[130px]" style={{ background: `color-mix(in oklab, ${primaria} 70%, transparent)` }} />
    </div>
  ) : null

  const textoMarca = c.corTextoMarca ?? '#ffffff'
  const mix = (pct: number) => `color-mix(in oklab, ${textoMarca} ${pct}%, transparent)`
  // Rótulo "Área do aluno/administrativa": tem cor PRÓPRIA (corTextoForm). Fallback = primária,
  // NÃO o destaque — assim mudar a "Cor de destaque" não altera este texto (ficam desvinculados).
  const kickerCor = ehAdmin ? (c.corTextoFormAdmin ?? c.corTextoForm ?? primaria) : (c.corTextoForm ?? primaria)
  const kickerTexto = ehAdmin ? (c.textoKickerAdmin || 'Área administrativa') : c.textoKicker
  const rodapeTexto = ehAdmin ? c.textoRodapeAdmin : c.textoRodape
  const marcaNome = c.marcaNome ?? plataforma
  const marcaSub = c.marcaSub === null ? (subtitulo ?? null) : c.marcaSub
  // Renderiza o rodapé com suporte a links markdown [texto](url) — link em negrito e na cor primária (roxo p/ marcas roxas).
  function rodapeNodes(txt: string): React.ReactNode {
    const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
    const out: React.ReactNode[] = []
    let last = 0, m: RegExpExecArray | null, i = 0
    while ((m = re.exec(txt))) {
      if (m.index > last) out.push(txt.slice(last, m.index))
      out.push(
        <a key={i} href={m[2]} target="_blank" rel="noreferrer" onClick={preview ? (e) => e.preventDefault() : undefined}
          className="font-bold underline decoration-transparent underline-offset-2 transition hover:decoration-current" style={{ color: primaria }}>{m[1]}</a>,
      )
      last = m.index + m[0].length; i++
    }
    if (last < txt.length) out.push(txt.slice(last))
    return out
  }
  const plataformaLabel = c.textoPlataforma === null ? plataforma : c.textoPlataforma
  const anim = c.animacao && !preview
  const btnCor = c.botaoCor ?? primaria
  const btnStyle: React.CSSProperties = c.botaoEstilo === 'contorno'
    ? { background: 'transparent', border: `1.5px solid ${btnCor}`, color: btnCor }
    : c.botaoEstilo === 'gradiente'
      ? { background: `linear-gradient(135deg, ${btnCor}, color-mix(in oklab, ${btnCor} 66%, #000))`, color: '#ffffff' }
      : { background: btnCor, color: '#ffffff' }
  function MarcaTexto() {
    return (
      <div className="relative max-w-md space-y-5">
        {c.titulo && <h2 className={cn('whitespace-pre-line text-[2.3rem] font-extrabold leading-[1.06] tracking-tight', anim && 'lg-up')} style={{ color: textoMarca, animationDelay: '.05s' }}>{c.titulo}</h2>}
        {c.subtitulo && <p className={cn(anim && 'lg-up')} style={{ color: mix(72), animationDelay: '.12s' }}>{c.subtitulo}</p>}
        {c.destaques.length > 0 && (
          <ul className="space-y-2.5 pt-1">
            {c.destaques.map((d, i) => (
              <li key={i} className={cn('flex items-center gap-2.5 text-sm', anim && 'lg-up')} style={{ color: mix(85), animationDelay: `${0.18 + i * 0.06}s` }}>
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
        {ehAdmin ? (
          <Campo icon={Lock} type="password" placeholder="Senha" value={senha} onChange={setSenha} autoComplete="current-password" required readOnly={preview} />
        ) : (
          <>
            {metodo === 'email_cpf' && <Campo icon={IdCard} type="text" placeholder="CPF" value={cpf} onChange={setCpf} inputMode="numeric" readOnly={preview} />}
            {metodo === 'email_telefone' && <Campo icon={Phone} type="text" placeholder="Telefone" value={telefone} onChange={setTelefone} inputMode="tel" readOnly={preview} />}
          </>
        )}
        {manutencao && <AlertBox variante="aviso" icon={Wrench} titulo={manutencao.titulo}>{manutencao.mensagem}</AlertBox>}
        {erro && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</p>}
        <button type="submit" disabled={carregando || (!preview && (!email || (ehAdmin && !senha)))}
          className={cn('group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all hover:opacity-95 disabled:opacity-60', c.botaoEstilo !== 'contorno' && 'shadow-sm hover:shadow-md')}
          style={btnStyle}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {c.textoBotao}
          {!carregando && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </>
    )
  }

  function FormBloco({ comEmblema = true, centro = false, className = '' }: { comEmblema?: boolean; centro?: boolean; className?: string }) {
    return (
      <div className={cn('w-full max-w-sm space-y-6', className)}>
        <div className={cn('flex flex-col gap-3', centro ? 'items-center text-center' : 'items-start text-left')}>
          {comEmblema && Emblema({})}
          {(kickerTexto || c.textoEntrar || plataformaLabel) && (
            <div>
              {kickerTexto && <p className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', anim && 'lg-up')} style={{ color: kickerCor, animationDelay: '.05s' }}>{kickerTexto}</p>}
              {c.textoEntrar && <h1 className={cn('mt-1 text-2xl font-bold tracking-tight', anim && 'lg-up')} style={{ animationDelay: '.1s' }}>{c.textoEntrar}</h1>}
              {plataformaLabel && <p className={cn('mt-1 text-sm text-muted-foreground', anim && 'lg-up')} style={{ animationDelay: '.14s' }}>{plataformaLabel}</p>}
            </div>
          )}
        </div>
        <form onSubmit={submit} className="space-y-3.5">
          {Campos()}
          {rodapeTexto && <p className={cn('text-xs leading-relaxed text-muted-foreground', centro ? 'text-center' : 'text-left')}>{rodapeNodes(rodapeTexto)}</p>}
        </form>
      </div>
    )
  }

  // Animação de aparecimento do card (classe entra no cardCls e na versão card-less do split).
  const entrada = entradaClasse(c.animacaoEntrada)
  const cardCls = cn(
    c.cardEstilo === 'vidro'
      ? 'rounded-2xl border border-white/15 bg-white/95 p-7 shadow-2xl backdrop-blur-md dark:bg-slate-900/90'
      : 'rounded-2xl border bg-card p-7 shadow-xl',
    entrada,
  )

  const style = { ...rootVars } as React.CSSProperties

  let tela: React.ReactNode

  // ---------------- TEMPLATE: SPLIT ----------------
  if (c.template === 'split' && c.mostrarMarca) {
    // O "fundo" do Split é o PAINEL DA MARCA. Qualquer fundo (gradiente/cor/imagem) fica SÓ nesse
    // painel — a imagem não invade o lado do formulário (senão viraria um Hero). O lado do form usa
    // o fundo normal do sistema. Com imagem, um overlay escuro no painel mantém o texto branco legível.
    const ehImg = c.fundo === 'imagem' && !!c.fundoImagem
    const marca = (
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" style={fundoLoginStyle(c)}>
        {ehImg && <div className="pointer-events-none absolute inset-0 bg-black/45" />}
        {Blobs}
        <div className="relative flex items-center gap-3">
          {Emblema({})}
          <div className="leading-tight">{marcaNome && <p className="text-lg font-semibold" style={{ color: textoMarca }}>{marcaNome}</p>}{marcaSub && <p className="text-sm" style={{ color: mix(60) }}>{marcaSub}</p>}</div>
        </div>
        {MarcaTexto()}
        <div className="relative text-xs" style={{ color: mix(45) }}>© {new Date().getFullYear()} {plataforma}</div>
      </aside>
    )
    const form = (
      <main className={cn('relative flex items-center justify-center bg-background p-6', screen)}>
        {FormBloco({ className: entrada })}
      </main>
    )
    tela = (
      <div className={cn('relative lg:grid lg:grid-cols-[1.05fr_1fr]', screen)} style={style}>
        <style>{KF}</style>
        {c.painelLado === 'direita' ? <>{form}{marca}</> : <>{marca}{form}</>}
      </div>
    )
  }

  // ---------------- TEMPLATE: HERO (imagem/gradiente cheio + card) ----------------
  else if (c.template === 'hero') {
    tela = (
      <div className={cn('relative flex items-center justify-center overflow-hidden p-6 text-white', screen)} style={{ ...style, ...fundoLoginStyle(c) }}>
        <style>{KF}</style>{Blobs}
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between">
          {c.mostrarMarca && <div className="hidden max-w-md lg:block">{MarcaTexto()}</div>}
          <div className={cn('w-full max-w-sm text-foreground', cardCls)}>{FormBloco({ centro: false })}</div>
        </div>
      </div>
    )
  }

  // ---------------- TEMPLATE: VITRINE (faixa da marca no topo + card) ----------------
  else if (c.template === 'vitrine') {
    // O "fundo" do Vitrine é a FAIXA da marca (topo). Qualquer fundo — inclusive imagem — fica SÓ
    // nessa faixa; o resto da tela usa o fundo normal do sistema (não cobre a tela toda).
    const ehImg = c.fundo === 'imagem' && !!c.fundoImagem
    tela = (
      <div className={cn('relative flex flex-col bg-background', screen)} style={style}>
        <style>{KF}</style>
        {c.mostrarMarca && (
          <div className="relative flex flex-col items-center gap-4 overflow-hidden px-6 py-12 text-center text-white" style={fundoLoginStyle(c)}>
            {ehImg && <div className="pointer-events-none absolute inset-0 bg-black/45" />}
            {Blobs}
            <div className="relative">{Emblema({ tam: 'lg' })}</div>
            <div className="relative">{MarcaTexto()}</div>
          </div>
        )}
        <div className="relative flex flex-1 items-center justify-center p-6">
          <div className={cn('w-full max-w-sm', cardCls)}>{FormBloco({ comEmblema: !c.mostrarMarca, centro: true })}</div>
        </div>
      </div>
    )
  }

  // ---------------- TEMPLATE: CARTÃO (card único sobre gradiente) ----------------
  else if (c.template === 'cartao') {
    tela = (
      <div className={cn('relative flex items-center justify-center overflow-hidden p-6', screen)} style={{ ...style, ...fundoLoginStyle(c) }}>
        <style>{KF}</style>{Blobs}
        {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/40" />}
        <div className={cn('relative w-full max-w-md', cardCls)}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center">
            {Emblema({ tam: 'lg' })}
            {(c.titulo || c.subtitulo) && (
              <div>
                {c.titulo && <h2 className={cn('text-xl font-extrabold tracking-tight', anim && 'lg-up')} style={{ animationDelay: '.06s' }}>{c.titulo}</h2>}
                {c.subtitulo && <p className={cn('mt-1 text-sm text-muted-foreground', anim && 'lg-up')} style={{ animationDelay: '.12s' }}>{c.subtitulo}</p>}
              </div>
            )}
          </div>
          <form onSubmit={submit} className="space-y-3.5">{Campos()}</form>
          {rodapeTexto && <p className="mt-3 text-center text-xs text-muted-foreground">{rodapeNodes(rodapeTexto)}</p>}
        </div>
      </div>
    )
  }

  // ---------------- TEMPLATE: CENTRAL (card central sobre gradiente + aurora) ----------------
  else {
    tela = (
      <div className={cn('relative flex items-center justify-center overflow-hidden p-6', screen)} style={{ ...style, ...fundoLoginStyle(c) }}>
        <style>{KF}</style>{Blobs}
        {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/40" />}
        <div className={cn('relative w-full max-w-sm text-foreground', cardCls)}>{FormBloco({ centro: true })}</div>
      </div>
    )
  }

  return (
    <>
      {tela}
      {/* Tela de carregamento branded ao entrar na plataforma. */}
      {entrando && !preview && (
        <div className="fixed inset-0 z-[60]">
          <LoginLoading config={c} plataforma={plataforma} logo={logo} logoBg={logoBg} logoEstilo={logoEstilo} logoFiltro={logoFiltro} />
        </div>
      )}
      {/* Botão que alterna Aluno ↔ Admin. Também aparece (e funciona) na prévia do console. */}
      <button type="button" onClick={alternarModo} aria-label={ehAdmin ? 'Voltar para a área do aluno' : 'Acesso administrativo'}
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-medium text-white/80 shadow-sm backdrop-blur transition-colors hover:border-white/30 hover:text-white">
        {ehAdmin ? <><GraduationCap className="h-3.5 w-3.5" /> Área do aluno</> : <><ShieldCheck className="h-3.5 w-3.5" /> Admin</>}
      </button>
    </>
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
