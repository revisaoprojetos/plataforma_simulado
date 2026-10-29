// Controle de manutenção da nova plataforma (AUDITORIA §7) — componente único reutilizável.
// Card central no lugar do conteúdo + selo para o menu/cards. A ligação ao estado real
// (reusa lib/sistema/manutencao* do app) entra na fase de dados; aqui fica o visual + API.
import * as React from 'react'
import { Card, Btn, H2, Muted, IconBox, Row } from './ui'
import { Icon } from './icons'
import { R } from '@/lib/nova/rotas'

/** Card "Esta área está em manutenção" — some o conteúdo, resto da plataforma segue. */
export function ManutencaoCard({ area, mensagem, fim, voltarHref }: { area?: string; mensagem?: string; fim?: string | null; voltarHref?: string }) {
  return (
    <Card pad={32} style={{ alignItems: 'center', textAlign: 'center', gap: 16, maxWidth: 560, margin: '48px auto' }}>
      <IconBox icon="sliders" bg="var(--peachBg)" fg="var(--accentInk)" s={56} />
      <H2>Esta área está em manutenção</H2>
      <Muted>{mensagem || `${area ? `A área "${area}" está` : 'Esta área está'} temporariamente indisponível. Seu progresso está salvo.`}</Muted>
      {fim ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accentInk)' }}>Volta prevista: {fim}</span> : null}
      <Row gap={10} style={{ justifyContent: 'center' }}>
        {voltarHref ? <Btn kind="secondary" icon="back" href={voltarHref}>Voltar</Btn> : null}
        <Btn kind="primary" icon="home" href={R.inicio}>Ir para o Início</Btn>
      </Row>
    </Card>
  )
}

// CSS das animações do "Em breve" (módulo-level; sem backtick dentro p/ não quebrar o parse). Cores via
// tokens da marca (white-label) → o mesmo card fica roxo/dourado na Revisão, verde na defensoria etc.
const EMBREVE_CSS = `
.eb-card{position:relative;overflow:hidden;border-radius:26px;margin:36px auto;max-width:640px;padding:58px 40px;text-align:center;color:#fff;
  background:linear-gradient(135deg, color-mix(in srgb, var(--brand) 86%, #000) 0%, var(--brand) 48%, color-mix(in srgb, var(--brand) 60%, var(--gold)) 100%);
  box-shadow:0 36px 70px -34px color-mix(in srgb, var(--brand) 75%, transparent)}
.eb-grid{position:absolute;inset:0;opacity:.5;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:40px 40px}
.eb-orb{position:absolute;border-radius:50%;filter:blur(32px);pointer-events:none}
.eb-orb1{width:190px;height:190px;background:var(--gold);opacity:.55;top:-56px;left:-44px;animation:eb-f1 9s ease-in-out infinite}
.eb-orb2{width:150px;height:150px;background:#fff;opacity:.16;bottom:-54px;right:-32px;animation:eb-f2 11s ease-in-out infinite}
.eb-orb3{width:130px;height:130px;background:var(--pink);opacity:.32;top:38%;right:16%;animation:eb-f1 13s ease-in-out infinite}
@keyframes eb-f1{0%,100%{transform:translate(0,0)}50%{transform:translate(22px,-26px)}}
@keyframes eb-f2{0%,100%{transform:translate(0,0)}50%{transform:translate(-28px,20px)}}
.eb-shine{position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.14) 50%,transparent 68%);transform:translateX(-120%);animation:eb-shine 5.5s ease-in-out infinite}
@keyframes eb-shine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.eb-iw{position:relative;width:92px;height:92px;display:inline-flex;align-items:center;justify-content:center}
.eb-ico{position:relative;width:74px;height:74px;border-radius:22px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18);box-shadow:0 12px 30px -8px rgba(0,0,0,.45);animation:eb-bob 4s ease-in-out infinite}
.eb-ring{position:absolute;width:74px;height:74px;border-radius:24px;border:2px solid rgba(255,255,255,.55);animation:eb-ping 2.6s cubic-bezier(0,0,.2,1) infinite}
.eb-ring2{animation-delay:1.3s}
@keyframes eb-ping{0%{transform:scale(.82);opacity:.7}80%,100%{transform:scale(1.5);opacity:0}}
@keyframes eb-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.eb-badge{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 15px;border-radius:99px;background:rgba(255,255,255,.16);color:#fff;font-size:12px;font-weight:800;letter-spacing:.03em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);animation:eb-glow 2.4s ease-in-out infinite}
@keyframes eb-glow{0%,100%{box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)}50%{box-shadow:inset 0 0 0 1px rgba(255,255,255,.5),0 0 20px 2px rgba(255,255,255,.28)}}
.eb-bell{display:inline-flex;transform-origin:top center;animation:eb-swing 2.6s ease-in-out infinite}
@keyframes eb-swing{0%,58%,100%{transform:rotate(0)}66%{transform:rotate(15deg)}76%{transform:rotate(-11deg)}86%{transform:rotate(6deg)}}
.eb-dots{display:inline-flex;gap:8px}
.eb-dots i{width:9px;height:9px;border-radius:50%;background:var(--gold);display:inline-block;animation:eb-bounce 1.3s ease-in-out infinite}
.eb-dots i:nth-child(2){animation-delay:.16s}
.eb-dots i:nth-child(3){animation-delay:.32s}
@keyframes eb-bounce{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-9px);opacity:1}}
.eb-btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 20px;border-radius:13px;font-size:14px;font-weight:800;text-decoration:none;transition:transform .15s ease, box-shadow .15s ease}
.eb-btn:hover{transform:translateY(-2px)}
.eb-btn-gold{background:var(--gold);color:var(--goldInk);box-shadow:0 14px 26px -14px rgba(0,0,0,.6)}
.eb-btn-ghost{background:rgba(255,255,255,.08);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
@media (prefers-reduced-motion: reduce){.eb-orb,.eb-ico,.eb-ring,.eb-badge,.eb-bell,.eb-dots i,.eb-shine{animation:none}}
`

/** Card "Em breve" — área ainda não liberada, com clima TEMÁTICO e animado de "novidades chegando". */
export function EmBreveCard({ titulo, mensagem, icon = 'users', voltarHref }: { titulo?: string; mensagem?: string; icon?: string; voltarHref?: string }) {
  return (
    <div className="eb-card">
      <style>{EMBREVE_CSS}</style>
      <span aria-hidden className="eb-grid" />
      <span aria-hidden className="eb-orb eb-orb1" />
      <span aria-hidden className="eb-orb eb-orb2" />
      <span aria-hidden className="eb-orb eb-orb3" />
      <span aria-hidden className="eb-shine" />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <span className="eb-iw">
          <span aria-hidden className="eb-ring" />
          <span aria-hidden className="eb-ring eb-ring2" />
          <span className="eb-ico"><Icon n={icon} size={34} /></span>
        </span>
        <span className="eb-badge"><span className="eb-bell"><Icon n="bell" size={13} /></span>Novidades chegando</span>
        <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>{titulo || 'Em breve'}</h2>
        <p style={{ margin: 0, maxWidth: 460, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,.88)' }}>
          {mensagem || 'Estamos preparando esta área com tudo pensado pra você. Fique de olho — vem novidade por aí!'}
        </p>
        <span aria-hidden className="eb-dots"><i /><i /><i /></span>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          {voltarHref ? <a className="eb-btn eb-btn-ghost" href={voltarHref}><Icon n="back" size={16} />Voltar</a> : null}
          <a className="eb-btn eb-btn-gold" href={R.inicio}><Icon n="home" size={16} />Ir para o Início</a>
        </div>
      </div>
    </div>
  )
}

/** Selo "Em manutenção" para item de menu ou card de conteúdo. */
export function SeloManutencao({ compact = false }: { compact?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: compact ? 18 : 22, padding: compact ? '0 6px' : '0 9px', borderRadius: 99, background: 'var(--peachBg)', color: 'var(--accentInk)', fontSize: compact ? 10 : 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
      <Icon n="sliders" size={compact ? 11 : 12} />Em manutenção
    </span>
  )
}

/** Faixa de aviso de manutenção PROGRAMADA (topo do Início). */
export function FaixaManutencaoProgramada({ quando, mensagem }: { quando: string; mensagem?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--peachBg)', color: 'var(--accentInk)', flexWrap: 'wrap' }}>
      <Icon n="alert" size={16} />
      <span style={{ flex: 1, minWidth: 180, fontSize: 13, lineHeight: 1.5 }}>
        <b>Manutenção programada</b> — {mensagem || 'algumas áreas podem ficar indisponíveis.'} {quando}
      </span>
    </div>
  )
}
