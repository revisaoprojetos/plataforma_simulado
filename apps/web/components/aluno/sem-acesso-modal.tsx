'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Lock, ShoppingCart, BadgeCheck, GraduationCap, MessageCircle, Mail, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FitaTopo } from '@/components/prova/fita-topo'

export type SuporteInfo = { whatsapp?: string | null; email?: string | null; link?: string | null; horario?: string | null }

/** Pop-up (upsell) quando o aluno chega a uma pasta/simulado que o perfil dele NÃO tem acesso.
 *  Mesmo visual do aviso de acesso da prova (login-popups): cabeçalho na cor da marca + ícone,
 *  passo a passo para liberar e canal de suporte. */
export function SemAcessoModal({ pastaNome, capa = null, suporte }: { pastaNome?: string | null; capa?: string | null; suporte?: SuporteInfo }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  if (!montado || typeof document === 'undefined') return null

  const nome = pastaNome || 'esses simulados'
  const cor = 'var(--primary)'
  const passos = [
    { icon: ShoppingCart, titulo: 'Garanta o plano', desc: `Adquira o plano que inclui ${nome}.` },
    { icon: BadgeCheck, titulo: 'Ative seu acesso', desc: 'Após a confirmação, o acesso é liberado automaticamente — ou o suporte libera para você.' },
    { icon: GraduationCap, titulo: 'Comece a praticar', desc: 'Volte aqui e os simulados estarão disponíveis.' },
  ]
  const waDigits = (suporte?.whatsapp ?? '').replace(/\D/g, '')

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 text-foreground backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border-2 border-primary/50 bg-card text-center shadow-2xl duration-300">
        <FitaTopo />

        {/* Imagem do BANNER (proporção 1920×500 → não corta) + cadeado sobreposto. */}
        {capa && (
          <div className="relative border-b-2 border-primary/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={capa} alt="" className="aspect-[1920/500] w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,7,20,.5), transparent 62%)' }} />
            <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/35 text-white ring-1 ring-white/25 backdrop-blur"><Lock className="h-4 w-4" /></span>
          </div>
        )}

        {/* Cabeçalho — tom da marca (linkado ao --primary). Ícone só quando NÃO há imagem. */}
        <div className={cn('flex flex-col items-center px-6 pb-5 text-center', capa ? 'pt-5' : 'pt-7')} style={capa ? undefined : { background: `color-mix(in oklab, ${cor} 12%, var(--card))` }}>
          {!capa && (
            <span className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${cor} 22%, var(--card))` }}>
              <span className="absolute inset-0 animate-ping rounded-full" style={{ background: cor, opacity: 0.12 }} />
              <Lock className="h-9 w-9" style={{ color: cor }} />
            </span>
          )}
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Conteúdo exclusivo</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight" style={{ color: cor }}>Acesso não liberado</h2>
          <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-muted-foreground">
            Seu perfil ainda não tem acesso a <strong className="font-semibold text-foreground">{nome}</strong> — esse conteúdo faz parte de outro plano da plataforma.
          </p>
        </div>

        {/* Corpo */}
        <div className="space-y-4 px-6 pb-6 pt-1 text-left">
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Como liberar</p>
            <ol className="space-y-3">
              {passos.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><p.icon className="h-3.5 w-3.5 text-primary" /> {p.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{p.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Suporte (mesmo estilo do aviso da prova) */}
          {waDigits ? (
            <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Olá! Quero liberar o acesso a ${nome}.`)}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-50/70 p-3 text-left transition-colors hover:bg-green-50 dark:bg-green-900/15 dark:hover:bg-green-900/25">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"><MessageCircle className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">Fale com o suporte</span><span className="block truncate text-sm font-semibold">{suporte?.whatsapp}</span></span>
              <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">Abrir →</span>
            </a>
          ) : suporte?.email ? (
            <a href={`mailto:${suporte.email}?subject=${encodeURIComponent(`Acesso a ${nome}`)}`} className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Mail className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">Suporte por e-mail</span><span className="block truncate text-sm font-semibold">{suporte.email}</span></span>
              <span className="shrink-0 text-xs font-medium text-primary">Abrir →</span>
            </a>
          ) : suporte?.link ? (
            <a href={suporte.link} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><ExternalLink className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">Central de ajuda</span><span className="block truncate text-sm font-semibold">Abrir link de suporte</span></span>
              <span className="shrink-0 text-xs font-medium text-primary">Abrir →</span>
            </a>
          ) : null}

          <Link href="/aluno"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md">
            Ir para o início
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}
