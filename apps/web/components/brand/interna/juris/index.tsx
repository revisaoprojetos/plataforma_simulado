'use client'

// DESAFIO DE JURISPRUDÊNCIA — tela de LISTA (design novo, spec das telas internas).
// Port fiel da região de conteúdo do mockup JurisRevisao.dc.html, porém DATA-HONEST:
// as seções editoriais do mockup (Julgado do dia / JurisClub / Informativos) e as métricas
// por-desafio (progresso/acerto) NÃO têm fonte de dados neste contexto, então são OMITIDAS.
// O que fica: hero + KPIs reais (desafios / disponíveis) + grade de desafios (tickets reais)
// que abrem o jogo em /aluno/jurisprudencia?desafio=<id>.

import Link from 'next/link'
import { Gavel, Scale, Play, BookOpen } from 'lucide-react'
import { type Brand, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'

type JurisDesafio = { id: string; nome: string; imagemTicket?: string | null }

type PlatformJurisProps = {
  brand: Brand
  theme: InternaTheme
  /** Rótulo customizado pelo tenant (ex.: "Desafio de Jurisprudência"). */
  titulo: string
  desafios: JurisDesafio[]
  /** Contagens reais exibidas nos KPIs. */
  stats: { desafios: number; disponiveis: number }
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

// Gradiente semeado pela marca (dobrado em color-mix com var(--brand), conforme regra de tokens).
const CAPA_GRAD = 'linear-gradient(135deg, color-mix(in oklab, var(--brand) 78%, #000), var(--brand))'
// Textura de grade sutil (como no herói do mockup).
const CAPA_GRID =
  'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)'

export function PlatformJuris({ brand, theme: themeProp, titulo, desafios, stats }: PlatformJurisProps) {
  // Tokens/raiz vêm do InternaPageRoot do pai; aqui só reagimos ao toggle dark ao vivo.
  void brand
  useTemaInterno(themeProp)

  const kpis: { icon: React.ReactNode; valor: string; rotulo: string }[] = [
    { icon: <Scale size={17} />, valor: fmt(stats.desafios), rotulo: 'desafios' },
    { icon: <Gavel size={17} />, valor: fmt(stats.disponiveis), rotulo: 'disponíveis para você' },
    // Extras do layout do mockup (4 KPIs) sem fonte de dados: honestamente em branco ("—").
    { icon: <BookOpen size={17} />, valor: '—', rotulo: 'julgados estudados' },
    { icon: <Play size={17} />, valor: '—', rotulo: 'sequência' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Hero */}
        <div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '.22em',
              color: 'var(--goldInk)',
            }}
          >
            JURISPRUDÊNCIA
          </span>
          <h1 style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>
            {titulo}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>
            Decore a jurisprudência dos tribunais superiores jogando — um desafio por vez.
          </p>
        </div>

        {/* KPIs — só os reais têm valor; extras do layout ficam em "—" (sem inventar dado). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {kpis.map((k) => (
            <div
              key={k.rotulo}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 16,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: 'var(--chip)',
                  color: 'var(--brand)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {k.icon}
              </span>
              <div style={{ lineHeight: 1.2, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
                  {k.valor}
                </b>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{k.rotulo}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desafios (conteúdo principal, dados reais) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Desafios</h2>
            {desafios.length > 0 && (
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{fmt(desafios.length)}</span>
            )}
          </div>

          {desafios.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed p-12 text-center"
              style={{ borderColor: 'var(--line2)', color: 'var(--muted)', fontSize: 14 }}
            >
              Nenhum desafio disponível para você no momento.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {desafios.map((d) => (
                <CardDesafio key={d.id} d={d} />
              ))}
            </div>
          )}
        </section>
    </div>
  )
}

function CardDesafio({ d }: { d: JurisDesafio }) {
  const href = `/aluno/jurisprudencia?desafio=${d.id}`
  const capa = d.imagemTicket || null
  return (
    <Link
      href={href}
      aria-label={`Abrir desafio ${d.nome}`}
      className="group block overflow-hidden transition duration-500 hover:-translate-y-1"
      style={{
        borderRadius: 'var(--r)',
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        boxShadow: '0 1px 2px rgba(0,0,0,.04)',
      }}
    >
      {/* Capa (~4/3): imagem do ticket ou gradiente da marca com textura + marca-d'água. */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capa}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: CAPA_GRAD }}>
            <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: CAPA_GRID, backgroundSize: '22px 22px' }} />
            <span
              aria-hidden="true"
              className="absolute transition-transform duration-700 group-hover:scale-110"
              style={{ right: -14, bottom: -14, color: 'rgba(255,255,255,.16)' }}
            >
              <Scale size={120} strokeWidth={1.4} />
            </span>
            <span className="absolute left-4 top-4 inline-flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: 'rgba(255,255,255,.14)', color: '#FFFFFF' }}>
              <Gavel size={20} />
            </span>
          </div>
        )}
      </div>

      {/* Corpo */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--goldInk)' }}>
            Desafio
          </p>
          <h3
            className="line-clamp-2"
            style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.02em', color: 'var(--ink)' }}
          >
            {d.nome}
          </h3>
        </div>
        <span
          className="inline-flex items-center justify-center gap-2 transition group-hover:brightness-110"
          style={{
            height: 38,
            borderRadius: 12,
            background: 'var(--brand)',
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 800,
            boxShadow: '0 10px 20px -12px color-mix(in oklab, var(--brand) 70%, transparent)',
          }}
        >
          <Play size={14} />
          Jogar
        </span>
      </div>
    </Link>
  )
}
