'use client'

// DESAFIO DE JURISPRUDÊNCIA — tela de LISTA (design novo, spec das telas internas).
// Port fiel da região de conteúdo do mockup JurisRevisao.dc.html, porém DATA-HONEST:
// as seções editoriais do mockup (Julgado do dia / JurisClub / Informativos) e as métricas
// por-desafio (progresso/acerto) NÃO têm fonte de dados neste contexto, então são OMITIDAS.
// O que fica: hero + KPIs reais (desafios / disponíveis) + grade de desafios (tickets reais)
// que abrem o jogo em /aluno/jurisprudencia?desafio=<id>.

import Link from 'next/link'
import { Gavel, Scale, Play, BookOpen, Check, Zap, Clock, RotateCcw } from 'lucide-react'
import { type Brand, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'

type JurisDesafio = { id: string; nome: string; imagemTicket?: string | null; diasFeitos?: number; totalDias?: number }

const OK = '#1FA868'
const GOLD = '#F1C232'

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
            // Grade de TICKETS igual à Lei Seca (mesmas dimensões): 1 col → 2 (md) → 3 (xl).
            <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-3">
              {desafios.map((d) => (
                <CardDesafio key={d.id} d={d} />
              ))}
            </div>
          )}
        </section>
    </div>
  )
}

// Card de desafio em formato TICKET — IDÊNTICO ao módulo da Lei Seca (mesmas dimensões): capa 150px
// à esquerda + corpo à direita com status, título, barra de progresso (dias dominados/total · %) e
// botão (Jogar / Continuar / Revisar conforme o estado). O card inteiro é o link que abre o jogo.
function CardDesafio({ d }: { d: JurisDesafio }) {
  const href = `/aluno/jurisprudencia?desafio=${d.id}`
  const capa = d.imagemTicket || null
  const total = d.totalDias ?? 0
  const feitos = Math.min(d.diasFeitos ?? 0, total || (d.diasFeitos ?? 0))
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0
  const s: 'done' | 'and' | 'new' = total > 0 && feitos >= total ? 'done' : feitos > 0 ? 'and' : 'new'
  const statusCfg =
    s === 'done'
      ? { cor: OK, icon: <Check size={13} />, rotulo: 'Concluído' }
      : s === 'and'
        ? { cor: 'var(--goldInk)', icon: <Zap size={13} />, rotulo: 'Em andamento' }
        : { cor: 'var(--muted)', icon: <Clock size={13} />, rotulo: 'Não iniciado' }
  const botao =
    s === 'done'
      ? { rotulo: 'Revisar', icon: <RotateCcw size={14} /> }
      : s === 'and'
        ? { rotulo: 'Continuar', icon: <Play size={14} /> }
        : { rotulo: 'Jogar', icon: <Play size={14} /> }
  return (
    <Link
      href={href}
      aria-label={`Abrir desafio ${d.nome}`}
      className="group block transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_40px_-24px_rgba(0,0,0,.5)]"
      style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', minHeight: 164, color: 'inherit' }}
    >
      {/* capa (esquerda, 150px) */}
      <div style={{ width: 150, flexShrink: 0, overflow: 'hidden' }}>
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="transition-transform duration-500 group-hover:scale-105" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div className="transition-transform duration-500 group-hover:scale-105" style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: CAPA_GRAD, color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '14px 16px' }}>
            <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: CAPA_GRID, backgroundSize: '22px 22px' }} />
            <span aria-hidden="true" style={{ position: 'absolute', right: -14, bottom: -16, color: 'rgba(255,255,255,.16)' }}>
              <Scale size={104} strokeWidth={1.4} />
            </span>
            <span style={{ position: 'relative', fontSize: 9, fontWeight: 800, letterSpacing: '.14em', opacity: 0.85 }}>JURISPRUDÊNCIA</span>
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,.16)' }}>
              <Gavel size={20} />
            </span>
          </div>
        )}
      </div>
      {/* corpo (direita) */}
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: statusCfg.cor }}>
          {statusCfg.icon}
          {statusCfg.rotulo}
        </span>
        <b className="line-clamp-2" style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)' }}>{d.nome}</b>
        {total > 0 ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>
              <span>{fmt(feitos)} de {fmt(total)} dias</span>
              <b style={{ color: 'var(--ink)' }}>{pct}%</b>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg,var(--brand),var(--brand2) 70%,${GOLD})` }} />
            </div>
          </div>
        ) : (
          <p className="line-clamp-2" style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
            Decore a jurisprudência dos tribunais superiores jogando.
          </p>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span
            className="transition group-hover:brightness-110"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 32, padding: '0 16px', borderRadius: 12, background: 'var(--brand)', color: '#FFFFFF', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}
          >
            {botao.icon}
            {botao.rotulo}
          </span>
        </div>
      </div>
    </Link>
  )
}
