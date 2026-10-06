'use client'

// DESAFIO DE JURISPRUDÊNCIA — composição MEQ (spec 04 §2), porte fiel do mockup JurisMEQ{Claro,Azul,Escuro}.
// O shell da marca (rail 96px + top bar com título) já é injetado por shell-meq.tsx; aqui renderizamos
// SÓ a região de conteúdo do mockup: KPIs (raio 12, rótulo em caixa alta + ícone --brand2) + aba
// segmentada "Desafios/Informativos" + TABELA de desafios no estilo MEQ (linha com miniatura + nome +
// botão; hover com inset 3px var(--brand2)). No mobile, a tabela vira lista em card com chevron.
//
// DATA-HONEST (regra 4 do handoff): o Desafio de Jurisprudência é um JOGO (iframe). Não existe backend
// para "Julgado do dia", "JurisClub" nem para progresso/acerto por desafio ou lista de informativos.
// Por isso essas peças editoriais do mockup são OMITIDAS em vez de fabricadas; a aba Desafios usa os
// desafios reais a que o aluno tem acesso, e os KPIs sem fonte ficam honestamente em "—".
//
// Tokens MEQ do mockup (claro/azul/escuro) são aplicados localmente porque o brand2 do mockup (#3E7FE0)
// difere do sim-tokens (cyan). Reage ao toggle de tema ao vivo via useTemaInterno.

import Link from 'next/link'
import { Gavel, Scale, Target, Play, ChevronRight } from 'lucide-react'
import type { InternaTheme } from '@/components/brand/interna/interna-tokens'
import { useTemaInterno } from '@/components/brand/interna/use-tema-interno'

export type JurisMeqDesafio = { id: string; nome: string; imagemTicket?: string | null }

type Props = {
  theme: InternaTheme
  titulo: string
  desafios: JurisMeqDesafio[]
  stats: { desafios: number; disponiveis: number }
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

// Paletas MEQ fiéis aos roots dos mockups (.app style) — claro/azul/escuro.
type MeqVars = {
  surface: string
  surface2: string
  ink: string
  muted: string
  line: string
  line2: string
  track: string
  brand: string
  brand2: string
  cyan: string
  chip: string
  shadow: string
  tBg: string
  tOn: string
  tOnInk: string
}

const MEQ_CLARO: MeqVars = {
  surface: '#FFFFFF', surface2: '#F6F8FC', ink: '#171E3B', muted: '#66729A', line: '#E3E8F2', line2: '#CDD6E8',
  track: '#E4EAF5', brand: '#306AB5', brand2: '#3E7FE0', cyan: '#5ECEF0', chip: '#EAF1FB',
  shadow: '0 1px 2px rgba(16,30,70,.04)', tBg: '#E4EAF5', tOn: '#FFFFFF', tOnInk: '#171E3B',
}
const MEQ_AZUL: MeqVars = {
  surface: '#FFFFFF', surface2: '#F5F8FD', ink: '#171E3B', muted: '#66729A', line: '#E3E8F2', line2: '#CDD6E8',
  track: '#E4EAF5', brand: '#306AB5', brand2: '#3E7FE0', cyan: '#5ECEF0', chip: '#EAF1FB',
  shadow: '0 20px 40px -30px rgba(10,30,80,.6)', tBg: '#E4EAF5', tOn: '#FFFFFF', tOnInk: '#171E3B',
}
const MEQ_ESCURO: MeqVars = {
  surface: '#121A3A', surface2: '#172146', ink: '#FFFFFF', muted: '#8E9BC4', line: 'rgba(140,170,255,.13)',
  line2: 'rgba(140,170,255,.24)', track: 'rgba(140,170,255,.13)', brand: '#7FB2FF', brand2: '#5E9BFF', cyan: '#5ECEF0',
  chip: 'rgba(94,155,255,.14)', shadow: 'none', tBg: 'rgba(140,170,255,.1)', tOn: '#172146', tOnInk: '#FFFFFF',
}
function palette(theme: InternaTheme): MeqVars {
  if (theme === 'escuro') return MEQ_ESCURO
  if (theme === 'azul') return MEQ_AZUL
  return MEQ_CLARO
}

export function JurisprudenciaMeq({ theme: themeProp, titulo, desafios, stats }: Props) {
  const theme = useTemaInterno(themeProp)
  const p = palette(theme)

  const kpis: { icon: React.ReactNode; rotulo: string; valor: string }[] = [
    { icon: <Gavel size={15} />, rotulo: 'Desafios', valor: fmt(stats.desafios) },
    { icon: <Scale size={15} />, rotulo: 'Disponíveis', valor: fmt(stats.disponiveis) },
    // Sem fonte de dados (o desafio é um jogo em iframe) — honestamente em branco.
    { icon: <Target size={15} />, rotulo: 'Acerto', valor: '—' },
    { icon: <Play size={15} />, rotulo: 'Sequência', valor: '—' },
  ]

  return (
    <div
      style={
        {
          '--surface': p.surface,
          '--surface2': p.surface2,
          '--ink': p.ink,
          '--muted': p.muted,
          '--line': p.line,
          '--line2': p.line2,
          '--track': p.track,
          '--brand': p.brand,
          '--brand2': p.brand2,
          '--cyan': p.cyan,
          '--chip': p.chip,
          '--shadow': p.shadow,
          '--tBg': p.tBg,
          '--tOn': p.tOn,
          '--tOnInk': p.tOnInk,
          color: p.ink,
          fontFamily: "'Sora',sans-serif",
        } as React.CSSProperties
      }
      className="juris-meq"
    >
      <style>{juristMeqCss}</style>
      <div className="jm-wrap">
        {/* Manchete (mobile mostra H1 24px; no desktop o título vem da top bar — mantemos discreto p/ contexto). */}
        <div className="jm-head">
          <h1 className="jm-h1">{titulo}</h1>
          <p className="jm-sub">Julgados cobrados em prova, em desafios rápidos.</p>
        </div>

        {/* KPIs — MEQ: raio 12, rótulo em caixa alta + ícone --brand2 à direita + valor 22px/700. */}
        <div className="jm-kpis">
          {kpis.map((k) => (
            <div key={k.rotulo} className="jm-kpi">
              <span className="jm-kpi-top">
                {k.rotulo}
                <span className="jm-kpi-ic">{k.icon}</span>
              </span>
              <b className="jm-kpi-val">{k.valor}</b>
            </div>
          ))}
        </div>

        {/* Aba segmentada (MEQ: raio 8). Só "Desafios" tem conteúdo real; "Informativos" não tem fonte. */}
        <div>
          <div role="tablist" className="jm-tabs">
            <span className="jm-tab jm-tab-on">
              <Gavel size={15} />
              Desafios
            </span>
            <span className="jm-tab jm-tab-off" aria-disabled title="Sem informativos disponíveis">
              <Scale size={15} />
              Informativos
            </span>
          </div>
        </div>

        {/* Tabela de desafios (fiel ao MEQ): ícone sobre cor do tribunal · progresso (segmentos) · acerto · ações. */}
        {desafios.length === 0 ? (
          <div className="jm-empty">Nenhum desafio disponível para você no momento.</div>
        ) : (
          <>
            <div className="jm-table jm-table-desk">
              <div className="jm-thead">
                <span>Desafio</span>
                <span style={{ textAlign: 'right' }}>Ações</span>
              </div>
              {desafios.map((d) => (
                <LinhaDesktop key={d.id} d={d} />
              ))}
            </div>
            <div className="jm-list jm-table-mob">
              {desafios.map((d) => (
                <LinhaMobile key={d.id} d={d} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function href(id: string) {
  return `/aluno/jurisprudencia?desafio=${id}`
}

// Quadrado com a miniatura do desafio (imagem do ticket) ou gradiente neutro da marca + ícone de gavel.
function Quadrado({ d, size }: { d: JurisMeqDesafio; size: number }) {
  if (d.imagemTicket) {
    return (
      <span className="jm-sq" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.imagemTicket} alt="" className="jm-sq-img" />
      </span>
    )
  }
  return (
    <span
      className="jm-sq jm-sq-grad"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Gavel size={Math.round(size * 0.42)} />
    </span>
  )
}

function LinhaDesktop({ d }: { d: JurisMeqDesafio }) {
  return (
    <Link href={href(d.id)} className="jm-row" aria-label={`Abrir desafio ${d.nome}`}>
      <div className="jm-row-main">
        <Quadrado d={d} size={42} />
        <div style={{ minWidth: 0 }}>
          <b className="jm-row-nome">{d.nome}</b>
          <span className="jm-row-sub">Jurisprudência</span>
        </div>
      </div>
      <span className="jm-row-acao">
        <span className="jm-cta">
          <Play size={14} />
          Jogar
        </span>
      </span>
    </Link>
  )
}

function LinhaMobile({ d }: { d: JurisMeqDesafio }) {
  return (
    <Link href={href(d.id)} className="jm-mrow" aria-label={`Abrir desafio ${d.nome}`}>
      <Quadrado d={d} size={46} />
      <div className="jm-mrow-body">
        <b className="jm-row-nome">{d.nome}</b>
        <span className="jm-row-sub">Jurisprudência</span>
      </div>
      <span className="jm-chev">
        <ChevronRight size={18} />
      </span>
    </Link>
  )
}

const juristMeqCss = `
.juris-meq .jm-wrap{display:flex;flex-direction:column;gap:20px;padding:24px 32px 48px}
.juris-meq .jm-head{display:none}
.juris-meq .jm-h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-0.04em;color:var(--ink)}
.juris-meq .jm-sub{margin:4px 0 0;font-size:13px;color:var(--muted)}
.juris-meq .jm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.juris-meq .jm-kpi{padding:14px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}
.juris-meq .jm-kpi-top{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.juris-meq .jm-kpi-ic{color:var(--brand2);display:inline-flex}
.juris-meq .jm-kpi-val{display:block;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:var(--ink);margin-top:4px}
.juris-meq .jm-tabs{display:inline-flex;gap:3px;padding:4px;border-radius:11px;background:var(--tBg)}
.juris-meq .jm-tab{display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;height:40px;padding:0 14px;border:0;border-radius:8px;font-size:13.5px;font-weight:700}
.juris-meq .jm-tab-on{background:var(--tOn);color:var(--tOnInk)}
.juris-meq .jm-tab-off{background:transparent;color:var(--muted);opacity:.65;cursor:not-allowed}
.juris-meq .jm-empty{border-radius:14px;border:1px dashed var(--line2);padding:48px 20px;text-align:center;color:var(--muted);font-size:14px}
.juris-meq .jm-table{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 14px 6px;box-shadow:var(--shadow)}
.juris-meq .jm-thead{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:16px;padding:0 10px 10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.juris-meq .jm-row{display:grid;grid-template-columns:minmax(0,1fr) 130px;align-items:center;gap:16px;padding:12px 10px;border-top:1px solid var(--line);color:var(--ink);transition:background .35s ease,box-shadow .35s ease}
.juris-meq .jm-row:hover{background:var(--surface2);box-shadow:inset 3px 0 0 var(--brand2)}
.juris-meq .jm-row-main{display:flex;align-items:center;gap:12px;min-width:0}
.juris-meq .jm-row-nome{display:block;font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.juris-meq .jm-row-sub{font-size:11.5px;color:var(--muted)}
.juris-meq .jm-row-acao{display:flex;justify-content:flex-end}
.juris-meq .jm-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;padding:0 16px;border-radius:10px;color:#FFFFFF;font-size:12.5px;font-weight:700;white-space:nowrap;background:linear-gradient(180deg,color-mix(in srgb,var(--brand2) 72%,#FFF),var(--brand));box-shadow:0 10px 22px -14px color-mix(in srgb,var(--brand2) 90%,transparent),inset 0 1px 0 rgba(255,255,255,.22);transition:filter .15s,transform .15s}
.juris-meq .jm-row:hover .jm-cta{filter:brightness(1.06);transform:translateY(-1px)}
.juris-meq .jm-sq{position:relative;overflow:hidden;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}
.juris-meq .jm-sq-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
.juris-meq .jm-sq-grad{background:linear-gradient(150deg,color-mix(in srgb,var(--brand) 72%,#000),var(--brand));color:#FFFFFF}
.juris-meq .jm-list{display:none;flex-direction:column;gap:10px}
.juris-meq .jm-mrow{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);color:var(--ink)}
.juris-meq .jm-mrow-body{flex:1;min-width:0;display:flex;flex-direction:column}
.juris-meq .jm-chev{display:inline-flex;color:var(--muted);flex-shrink:0}
@media (max-width:860px){
  .juris-meq .jm-wrap{padding:18px 16px 28px}
  .juris-meq .jm-head{display:block}
  .juris-meq .jm-kpis{grid-template-columns:repeat(2,1fr)}
  .juris-meq .jm-tabs{display:grid;grid-template-columns:repeat(2,1fr);width:100%}
  .juris-meq .jm-tab{height:38px;padding:0 10px;font-size:12.5px}
  .juris-meq .jm-table-desk{display:none}
  .juris-meq .jm-table-mob{display:flex}
}
`
