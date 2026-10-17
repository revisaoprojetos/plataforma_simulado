'use client'

// Card "Novo desafio — Maratona de Simulados" na Home do Revisão (acima de "Simulados recentes").
// Porte FIEL do design `desafio-maratona` (markup + desafio-card.css + desafio-card.js):
//  • ABERTO: card "noturno" com borda girando, linhas de velocidade, capa flutuando, selo pulsando,
//    brilho no CTA. RECOLHIDO (.col): barra fina e discreta, sem animações, na cor dos cards da página.
//  • CTA depende do acesso (só renderiza p/ quem tem) e do estado: "Aceitar desafio" → "Continuar".
//  • A escolha (recolhido) e o "iniciado" são lembrados no servidor (POST /api/maratona/estado).
// Estilos via <style> namespeado (.mx-*), mesmo padrão da home do Revisão.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MaratonaConfig } from '@/lib/maratona/config'

const DMa = (iso: string) => { const [, m, d] = (iso || '').split('-'); return d && m ? `${d}/${m}` : iso }
const diasEntre = (a: string, b: string) => { const x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z'); return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) + 1 : 0 }

export function MaratonaCardDestaque({ config, estado, recolhidoInicial, feitos: feitosProp = 0 }: {
  config: MaratonaConfig
  estado: 'aceitar' | 'continuar'
  recolhidoInicial: boolean
  /** Simulados concluídos pelo aluno (0..qtdSimulados) — progressão real no card. */
  feitos?: number
}) {
  const router = useRouter()
  const [recolhido, setRecolhido] = useState(recolhidoInicial)
  const [, start] = useTransition()

  const persistir = (patch: { iniciado?: boolean; recolhido?: boolean }) => {
    fetch('/api/maratona/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {})
  }
  const toggle = () => { const n = !recolhido; setRecolhido(n); persistir({ recolhido: n }) }
  const abrirDesafio = () => { if (estado === 'aceitar') persistir({ iniciado: true }); start(() => router.push('/aluno/maratona')) }

  const feitos = Math.max(0, Math.min(feitosProp, config.qtdSimulados))
  const segs = Array.from({ length: config.qtdSimulados })
  const dias = diasEntre(config.inicio, config.fim)
  const chip = 'display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:99px'

  return (
    <section aria-label="Novo desafio" className="hrv-up">
      <style>{CSS}</style>
      <div className={'mx' + (recolhido ? ' col' : '')} data-maratona={config.id} aria-expanded={!recolhido}>
       <div className="mx-in">
        {/* linhas de velocidade (aberto) */}
        <span className="mx-st" aria-hidden="true" style={{ left: 0, top: '18%', width: '34%', animationDelay: '0s' }} />
        <span className="mx-st" aria-hidden="true" style={{ left: 0, top: '32%', width: '58%', animationDelay: '0.7s' }} />
        <span className="mx-st" aria-hidden="true" style={{ left: 0, top: '58%', width: '46%', animationDelay: '1.4s' }} />
        <span className="mx-st" aria-hidden="true" style={{ left: 0, top: '76%', width: '30%', animationDelay: '2.0s' }} />

        {/* ESTADO ABERTO */}
        <div className="mx-full">
          <div style={{ minHeight: 0, overflow: 'hidden' }}>
            <div className="mx-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 24, padding: '20px 24px 20px 20px' }}>
              <svg viewBox="0 0 68 66" aria-hidden="true" style={{ position: 'absolute', right: -30, top: -40, width: 260, height: 252, opacity: 0.06 }}>
                <path fill="#FFFFFF" fillRule="evenodd" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z" />
              </svg>
              <div className="mx-cov" style={{ position: 'relative', width: 214, height: 214, flexShrink: 0, borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 40px -14px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.14)' }}>
                <img src={config.capaUrl} alt={`${config.titulo} ${config.destaque}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="mx-new" style={{ ...css(chip), height: 28, padding: '0 12px', background: '#F1C232', color: '#2A1A55', fontSize: 11.5, fontWeight: 800, letterSpacing: '.14em' }}>
                    <span className="mx-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#2A1A55' }} />NOVO DESAFIO
                  </span>
                  <span style={{ ...css(chip), background: 'rgba(255,138,61,.16)', border: '1px solid rgba(255,138,61,.45)', color: '#FFB37A', fontSize: 12, fontWeight: 700 }}>
                    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 13, height: 13 }}><path d="M12 22c4 0 7-2.7 7-6.6 0-3.4-2.3-5.6-4-7.4-.4 2-1.4 3-2.5 3.4C13 8 12 4.6 9 2c.3 3.6-4 6.4-4 11.4C5 19.3 8 22 12 22z" /></svg>
                    Inscrições até {DMa(config.inscricoesAte)}
                  </span>
                </div>
                <b style={{ display: 'block', marginTop: 12, fontSize: 27, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.08 }}>
                  {config.titulo} <span style={{ whiteSpace: 'nowrap', background: 'linear-gradient(90deg,#FFE27A,#F1C232 45%,#FF8A3D)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{config.destaque}</span>
                </b>
                <p style={{ margin: '8px 0 0', maxWidth: 560, fontSize: 13.5, lineHeight: 1.55, color: '#DCD3FF' }}>{config.descricao}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', marginTop: 14 }}>
                  <Destaque icon={<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>} titulo={`${config.qtdSimulados} simulados`} sub={`padrão ${config.padrao}`} />
                  <Destaque icon={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} titulo={`${dias} dias`} sub={`${DMa(config.inicio)} a ${DMa(config.fim)}`} />
                  <Destaque icon={<><path d="M6 9H4a2 2 0 0 1 0-4h2M18 9h2a2 2 0 0 0 0-4h-2" /><path d="M6 3h12v6a6 6 0 0 1-12 0z" /><path d="M12 15v4M8 21h8" /></>} titulo={`+${config.recompensa.xp} XP`} sub={config.recompensa.extra ?? ''} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                  <div style={{ flex: 1, display: 'flex', gap: 4, maxWidth: 300 }}>
                    {segs.map((_, i) => <span key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: i < feitos ? '#F1C232' : 'rgba(255,255,255,.16)' }} />)}
                  </div>
                  <span style={{ fontSize: 12, color: '#CFC4FF', whiteSpace: 'nowrap' }}><b style={{ color: '#FFFFFF' }}>{feitos}/{config.qtdSimulados}</b> · {config.inscritos.toLocaleString('pt-BR')} inscritos</span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                  <button type="button" onClick={abrirDesafio} className="mx-cta" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 46, padding: '0 22px', borderRadius: 13, border: 0, cursor: 'pointer', background: 'linear-gradient(180deg,#FFD54F,#F1C232)', color: '#2A1A55', fontSize: 14.5, fontWeight: 800, boxShadow: '0 10px 24px -10px rgba(241,194,50,.8)' }}>
                    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16 }}><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>
                    {estado === 'continuar' ? 'Continuar desafio' : 'Aceitar desafio'}
                    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 15, height: 15 }}><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                  <a href={config.regulamentoUrl} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, padding: '0 18px', borderRadius: 13, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.06)', color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Ver regulamento</a>
                  <button type="button" onClick={toggle} className="mx-hide" aria-label="Ocultar desafio" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, padding: '0 16px', borderRadius: 13, border: 0, background: 'transparent', color: '#CFC4FF', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 15, height: 15 }}><path d="m6 15 6-6 6 6" /></svg>Ocultar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ESTADO RECOLHIDO */}
        <div className="mx-bar">
          <div style={{ minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 10px 6px 6px' }}>
              <img src={config.capaUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              <b style={{ flex: 1, minWidth: 0, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.titulo} {config.destaque}<span className="mx-sub" style={{ fontWeight: 500 }}> · inscrições até {DMa(config.inscricoesAte)}</span></b>
              <button type="button" onClick={toggle} className="mx-exp" aria-label="Expandir desafio" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 10, border: 0, background: 'linear-gradient(180deg,#FFD54F,#F1C232)', color: '#2A1A55', font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>Expandir<svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 15, height: 15 }}><path d="m6 9 6 6 6-6" /></svg></button>
            </div>
          </div>
        </div>
       </div>
      </div>
    </section>
  )
}

// parser do estilo compacto do chip (string "a:b;c:d") → objeto React (p/ reuso dos chips).
function css(s: string): React.CSSProperties {
  const o: any = {}
  for (const d of s.split(';')) { const [k, v] = d.split(':'); if (!k || !v) continue; o[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim() }
  return o
}

function Destaque({ icon, titulo, sub }: { icon: React.ReactNode; titulo: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.1)', color: '#F1C232', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16 }}>{icon}</svg>
      </span>
      <div style={{ lineHeight: 1.2 }}><b style={{ display: 'block', fontSize: 14 }}>{titulo}</b><span style={{ fontSize: 11.5, color: '#CFC4FF' }}>{sub}</span></div>
    </div>
  )
}

const CSS = `
@property --mxa { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.mx .i { fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex-shrink:0; }
.mx { position:relative; border-radius:24px; padding:2px; background:conic-gradient(from var(--mxa), #F1C232, #FF8A3D, #B05BFF, #5B3FD0, #3A27A0, #F1C232); animation:mxSpin 5s linear infinite; box-shadow:0 26px 60px -28px rgba(91,63,208,.75), 0 0 0 1px rgba(241,194,50,.15); transition:border-radius .4s; }
@keyframes mxSpin { to { --mxa:360deg; } }
.mx-in { position:relative; overflow:hidden; border-radius:22px; background:radial-gradient(120% 140% at 85% 0%, #4B2BC4 0%, #24126E 45%, #120838 100%); color:#fff; transition:border-radius .4s; }
.mx-st { position:absolute; height:3px; border-radius:99px; background:linear-gradient(90deg, transparent, rgba(255,180,60,.85), transparent); animation:mxStreak 2.8s cubic-bezier(.4,0,.2,1) infinite; opacity:0; }
@keyframes mxStreak { 0%{transform:translateX(-120%);opacity:0} 15%{opacity:1} 60%{opacity:.9} 100%{transform:translateX(260%);opacity:0} }
.mx-cov { animation:mxFloat 4.5s ease-in-out infinite; }
@keyframes mxFloat { 50%{transform:translateY(-5px) rotate(-1deg)} }
.mx-new { animation:mxPop .6s cubic-bezier(.3,1.6,.5,1) .3s both; }
@keyframes mxPop { from{transform:scale(.6);opacity:0} }
.mx-dot { animation:mxPing 1.4s ease-out infinite; }
@keyframes mxPing { 0%{box-shadow:0 0 0 0 rgba(42,26,85,.55)} 100%{box-shadow:0 0 0 8px rgba(42,26,85,0)} }
.mx-cta { position:relative; overflow:hidden; transition:transform .15s, filter .15s; }
.mx-cta:hover { transform:translateY(-1px); filter:brightness(1.05); }
.mx-cta::after { content:""; position:absolute; top:0; bottom:0; width:40%; left:-60%; background:linear-gradient(100deg, transparent, rgba(255,255,255,.65), transparent); animation:mxShine 2.6s ease-in-out infinite; }
@keyframes mxShine { 0%,55%{left:-60%} 100%{left:130%} }
.mx-hide { transition:background .15s, color .15s; }
.mx-hide:hover { background:rgba(255,255,255,.08)!important; color:#fff!important; }
.mx-full { display:grid; grid-template-rows:1fr; opacity:1; transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1), opacity .35s ease .1s; }
.mx-bar { display:grid; grid-template-rows:0fr; opacity:0; transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1), opacity .25s ease; }
.mx.col .mx-full { grid-template-rows:0fr; opacity:0; transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1), opacity .2s ease; }
.mx.col .mx-bar { grid-template-rows:1fr; opacity:1; transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1), opacity .35s ease .15s; }
.mx.col { border-radius:16px; animation:none; background:var(--line); box-shadow:none; padding:1px; }
.mx.col .mx-in { border-radius:14px; background:var(--surface); color:var(--ink); }
.mx.col .mx-st, .mx.col .mx-new, .mx.col .mx-dot { animation:none; display:none; }
.mx-bar img { opacity:.85; }
.mx-bar b { font-weight:700!important; font-size:13.5px!important; color:var(--muted); }
.mx-sub { color:var(--muted); opacity:.8; }
.mx-exp { background:transparent!important; color:var(--muted)!important; border:1px solid var(--line)!important; height:32px!important; font-weight:700!important; transition:background .15s, color .15s; }
.mx-exp:hover { background:var(--surface2, rgba(0,0,0,.04))!important; color:var(--ink)!important; }
/* MOBILE: capa no topo, botões empilhados */
@media (max-width:640px) {
  .mx-row { flex-direction:column; align-items:stretch!important; gap:14px!important; padding:0 0 16px!important; }
  .mx-cov { width:100%!important; height:200px!important; border-radius:18px 18px 0 0!important; }
  .mx-row > div:last-child { padding:0 16px; }
  .mx-cta, .mx-row a, .mx-hide { width:100%; }
}
@media (prefers-reduced-motion: reduce) {
  .mx, .mx-st, .mx-cov, .mx-dot, .mx-new, .mx-cta::after { animation:none!important; }
  .mx-st { display:none; }
  .mx-full, .mx-bar { transition:none!important; }
}
`
