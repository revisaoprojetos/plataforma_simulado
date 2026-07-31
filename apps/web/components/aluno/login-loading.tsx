'use client'

import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fundoLoginStyle, loginVars, corPrimariaLogin, corAccentLogin, type LoginConfig } from '@/lib/login-config'

const KF = `
@keyframes llBar{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
@keyframes llPulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}
@keyframes llDot{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-9px);opacity:1}}
@keyframes llOrbit{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.ll-bar{animation:llBar 1.1s ease-in-out infinite}
.ll-pulse{animation:llPulse 1.4s ease-in-out infinite}
.ll-dot{animation:llDot 1.2s ease-in-out infinite}
.ll-orbit{animation:llOrbit 1.4s linear infinite}
@media (prefers-reduced-motion:reduce){.ll-bar,.ll-pulse,.ll-dot,.ll-orbit{animation:none}}`

/** Tela de carregamento branded (mostrada ao entrar na plataforma). Usa o mesmo fundo/cores da
 *  marca do login e o MODELO escolhido na config (spinner/barra/pulso/pontos/órbita). */
export function LoginLoading({
  config, plataforma = '', logo = null, logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none', preview = false,
}: {
  config: LoginConfig; plataforma?: string; logo?: string | null; logoBg?: string; logoEstilo?: string; logoFiltro?: string; preview?: boolean
}) {
  const c = config
  const accent = c.carCorAnim ?? corAccentLogin(c)
  const primaria = corPrimariaLogin(c)
  const texto = c.carCorTexto ?? c.corTextoMarca ?? '#ffffff'
  // Logo do carregamento é INDEPENDENTE do login (config própria; herda o tema quando null).
  const effLogo = c.carLogoUrl ?? logo
  const effBg = c.carLogoBg ?? logoBg
  const effEstilo = c.carLogoEstilo ?? logoEstilo
  const effFiltro = c.carLogoFiltro ?? logoFiltro
  const transp = effBg === 'transparent'
  const molde = effEstilo === 'quadrado' ? 'rounded-none' : effEstilo === 'borda' ? 'rounded-xl border' : 'rounded-xl'
  const filtroCss = effFiltro === 'branco' ? 'brightness(0) invert(1)' : effFiltro === 'preto' ? 'brightness(0)' : undefined
  const effOpac = (c.carLogoOpacidade ?? 100) / 100
  const logoTint = effFiltro === 'cor' ? (c.carLogoCor ?? primaria) : null
  const maskStyle = (url: string): React.CSSProperties => ({ WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")`, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' })
  const nomeMarca = c.carTextoMarca === null ? (c.marcaNome ?? plataforma) : c.carTextoMarca
  const [boxSz, icSz] = c.carLogoTamanho === 'p' ? ['h-12 w-12', 'h-6 w-6'] : c.carLogoTamanho === 'g' ? ['h-24 w-24', 'h-12 w-12'] : ['h-16 w-16', 'h-8 w-8']

  const Logo = c.carMostrarLogo ? (
    <div className={cn('flex items-center justify-center overflow-hidden', boxSz, molde, transp ? '' : 'shadow-sm', !effLogo && 'bg-primary text-primary-foreground')} style={effLogo ? { background: transp ? 'transparent' : effBg } : undefined}>
      {!effLogo ? <GraduationCap className={icSz} />
        : logoTint ? <span className="h-full w-full" style={{ background: logoTint, opacity: effOpac, ...maskStyle(effLogo) }} />
        : <img src={effLogo} alt="" className="h-full w-full object-contain" style={{ filter: filtroCss, opacity: effOpac }} />}
    </div>
  ) : null

  const anim = () => {
    switch (c.carModelo) {
      case 'barra':
        return <div className="h-1.5 w-52 overflow-hidden rounded-full bg-white/15"><div className="ll-bar h-full w-1/3 rounded-full" style={{ background: accent }} /></div>
      case 'pulso':
      case 'anel':
        return null // logo-cêntricos: tratados no render abaixo
      case 'pontos':
        return <div className="flex gap-2">{[0, 1, 2].map((i) => <span key={i} className="ll-dot h-2.5 w-2.5 rounded-full" style={{ background: accent, animationDelay: `${i * 0.15}s` }} />)}</div>
      case 'orbita':
        return null // órbita envolve o logo abaixo
      case 'spinner':
      default:
        return <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-white/20" style={{ borderTopColor: accent }} />
    }
  }

  return (
    <div className={cn('relative flex flex-col items-center justify-center gap-5 overflow-hidden text-white', preview ? 'h-full' : 'min-h-screen')} style={{ ...loginVars(c), ...fundoLoginStyle(c) }}>
      <style>{KF}</style>
      {c.animacao && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-8 h-80 w-80 rounded-full blur-[120px]" style={{ background: `color-mix(in oklab, ${accent} 40%, transparent)` }} />
          <div className="absolute -bottom-20 right-0 h-80 w-80 rounded-full blur-[120px]" style={{ background: `color-mix(in oklab, ${primaria} 65%, transparent)` }} />
        </div>
      )}
      {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/45" />}

      <div className="relative flex flex-col items-center gap-5">
        {c.carModelo === 'orbita' ? (
          // Raio maior p/ o ponto não bater no logo (container 8rem, logo 4rem).
          <div className="relative flex h-32 w-32 items-center justify-center">
            <div className="ll-orbit absolute inset-0"><span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full" style={{ background: accent, boxShadow: `0 0 10px 1px ${accent}` }} /></div>
            {Logo}
          </div>
        ) : c.carModelo === 'anel' ? (
          // Spinner com o logo NO MEIO: anel girando ao redor.
          <div className="relative flex h-28 w-28 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-white/15" style={{ borderTopColor: accent }} />
            {Logo}
          </div>
        ) : c.carModelo === 'pulso' ? (
          <div className="ll-pulse">{Logo}</div>
        ) : (
          <>
            {Logo}
            {anim()}
          </>
        )}
        {c.carTexto && <p className="text-sm font-medium" style={{ color: `color-mix(in oklab, ${texto} 85%, transparent)` }}>{c.carTexto}</p>}
        {nomeMarca && <p className="text-xs" style={{ color: `color-mix(in oklab, ${texto} 50%, transparent)` }}>{nomeMarca}</p>}
      </div>
    </div>
  )
}
