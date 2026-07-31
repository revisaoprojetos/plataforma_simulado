import Link from 'next/link'
import { Play, ArrowRight, Star } from 'lucide-react'
import { iconeBanco } from '@/lib/banco-visual'
import type { ItemSimulado } from '@/lib/aluno/simulado-item'

const modoLabel: Record<string, string> = { janela_fixa: 'Agendado', prazo_relativo: 'Prazo', aberto: 'Aberto' }

/**
 * HERO de um simulado em DESTAQUE — card grande com o FUNDO do próprio simulado (capa/cor),
 * título, chips de estado e CTA "Fazer agora". Aparece no topo da Início; o simulado também
 * segue aparecendo como card nas fileiras. Estilo da referência (Netflix/propaganda).
 */
export function HeroSimulado({ s }: { s: ItemSimulado }) {
  const cor = s.vis?.cor ?? '#6d28d9'
  const capa = s.vis?.capa
  const BancoIcon = iconeBanco(s.vis?.icone)
  const acao = s.emAndamento ? 'Continuar' : s.refazer ? 'Refazer' : 'Fazer agora'
  const link = s.embed_token ? `/simulado/${s.embed_token}` : null

  return (
    <div className="group relative min-h-[300px] overflow-hidden rounded-3xl border shadow-sm sm:min-h-[380px]">
      {/* Fundo: capa do simulado ou degradê da cor */}
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${cor} 0%, #1a1030 70%, #0f0a1e 120%)` }} />}
      {!capa && <BancoIcon className="absolute -right-10 -top-10 h-72 w-72 text-white/[0.06]" />}

      {/* Escurecimento p/ legibilidade (mais forte à esquerda + no rodapé) */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(10,7,20,0.92) 4%, rgba(10,7,20,0.68) 40%, rgba(10,7,20,0.15) 78%, rgba(10,7,20,0.55) 100%)` }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2" style={{ background: `linear-gradient(to top, ${cor}, transparent)`, opacity: 0.35 }} />

      <div className="relative flex h-full min-h-[300px] max-w-2xl flex-col justify-center p-6 sm:min-h-[380px] sm:p-9">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 10px 1px rgba(52,211,153,.7)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Em destaque para você</span>
        </div>

        <h1 className="text-3xl font-extrabold leading-[1.02] tracking-tight text-white drop-shadow-sm sm:text-5xl">{s.titulo}</h1>

        {s.quando && <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:text-base">{s.quando}.</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-400/35 bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">{s.statusLabel}</span>
          {(modoLabel[s.modo_aplicacao] ?? s.modo_aplicacao) !== s.statusLabel && (
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-medium text-white/80">{modoLabel[s.modo_aplicacao] ?? s.modo_aplicacao}</span>
          )}
          {s.refazer && <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-medium text-white/80">Já feito {s.finalizadas}x</span>}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {link ? (
            <Link href={link} className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-black shadow-lg ring-1 ring-white/15 transition-all duration-300 hover:scale-[1.03] hover:shadow-xl"
              style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 62%, #f5e6b8))`, color: '#1b1036' }}>
              <Play className="h-4 w-4 fill-current" /> {acao}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3.5 text-sm font-semibold text-white/70">{s.statusLabel}</span>
          )}
          {link && (
            <Link href={link} className="inline-flex items-center gap-1.5 rounded-xl border border-white/16 bg-white/8 px-5 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/16">
              Ver detalhes <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Link href="/aluno/favoritos" title="Favoritos" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/16 bg-white/8 text-white/85 backdrop-blur transition hover:scale-105 hover:bg-white/16" style={{ color: 'var(--brand-accent)' }}>
            <Star className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
