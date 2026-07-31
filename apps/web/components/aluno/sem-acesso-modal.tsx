'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Lock, ArrowRight, ShoppingCart, BadgeCheck, GraduationCap, MessageCircle, Mail, LifeBuoy } from 'lucide-react'

export type SuporteInfo = { whatsapp?: string | null; email?: string | null; link?: string | null; horario?: string | null }

/** Pop-up (upsell) quando o aluno chega a uma pasta/simulado que o perfil dele NÃO tem acesso.
 *  Topo com a capa/logo do conteúdo + passo a passo para adquirir/liberar + contato do suporte. */
export function SemAcessoModal({
  pastaNome, capa = null, cor = '#6d28d9', suporte,
}: {
  pastaNome?: string | null; capa?: string | null; cor?: string; suporte?: SuporteInfo
}) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  if (!montado || typeof document === 'undefined') return null

  const nome = pastaNome || 'esses simulados'
  const waDigits = (suporte?.whatsapp ?? '').replace(/\D/g, '')
  const waLink = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Olá! Quero liberar o acesso a ${nome}.`)}` : null
  const mailLink = suporte?.email ? `mailto:${suporte.email}?subject=${encodeURIComponent(`Acesso a ${nome}`)}` : null
  const suporteLink = waLink || suporte?.link || mailLink

  const passos = [
    { icon: ShoppingCart, titulo: 'Garanta o plano', desc: `Adquira o plano que inclui ${nome} na plataforma.` },
    { icon: BadgeCheck, titulo: 'Ative seu acesso', desc: 'Após a confirmação, o acesso é liberado automaticamente — ou o suporte libera para você.' },
    { icon: GraduationCap, titulo: 'Comece a praticar', desc: 'Volte aqui e os simulados estarão disponíveis para fazer.' },
  ]

  // Fundo da marca (linkado ao --primary via `cor`); a capa aparece INTEIRA (contain, sem cortar).
  const bg: React.CSSProperties = {
    backgroundColor: `color-mix(in oklab, ${cor} 55%, #0b0716)`,
    ...(capa ? { backgroundImage: `url(${capa})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : { backgroundImage: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 55%, #0b0716))` }),
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-primary/60 bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Topo: capa/logo do conteúdo (inteira) + borda roxa da marca. */}
        <div className="relative flex h-40 items-end overflow-hidden border-b-2 border-primary/60 p-4 text-white" style={bg}>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,7,20,.8) 8%, rgba(10,7,20,.15) 70%)' }} />
          <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur"><Lock className="h-4.5 w-4.5" /></span>
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">Conteúdo exclusivo</p>
            <h2 className="line-clamp-2 text-lg font-extrabold leading-tight drop-shadow sm:text-xl">{pastaNome || 'Simulados premium'}</h2>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            Seu perfil <strong className="text-foreground">ainda não tem acesso</strong> a {nome}. Esses simulados fazem parte de outro plano —
            para liberá-los, é só seguir os passos abaixo.
          </p>

          {/* Passo a passo */}
          <ol className="space-y-2.5">
            {passos.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold"><p.icon className="h-3.5 w-3.5 text-primary" /> {p.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{p.desc}</span>
                </span>
              </li>
            ))}
          </ol>

          {/* Suporte */}
          {(suporteLink || suporte?.horario) && (
            <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground"><LifeBuoy className="h-3.5 w-3.5" /> Precisa de ajuda?</p>
              <p className="mt-1">Fale com o suporte que a gente libera seu acesso rapidinho.{suporte?.horario ? ` Atendimento: ${suporte.horario}.` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {waLink && <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
                {mailLink && <a href={mailLink} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition hover:bg-muted"><Mail className="h-3.5 w-3.5" /> E-mail</a>}
                {suporte?.link && !waLink && <a href={suporte.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition hover:bg-muted"><LifeBuoy className="h-3.5 w-3.5" /> Ajuda</a>}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
            {suporteLink && (
              <a href={suporteLink} target="_blank" rel="noreferrer"
                className="group inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110">
                Quero liberar o acesso <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            )}
            <Link href="/aluno"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md">
              Ir para o início
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
