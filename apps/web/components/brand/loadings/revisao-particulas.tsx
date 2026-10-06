'use client'

/**
 * Camadas de partículas da Revisão — reaproveitadas pelos loadings da marca:
 *   - `efeitos`   → brilhos de pixel (px) + formas flutuantes subindo (sh/plus).  (slugs "formas" / circuito "efeitos")
 *   - `quadrados` → só brilhos de pixel (px) com leve pan.                         (slug  "quadrados")
 * PORTE FIEL das camadas `.px`/`.sh`/`.plus` dos mockups `LoadingRevisao*` (Formas/Quad/3Efeito/Quad3).
 * Posições/cores/atrasos FIXOS (determinístico — não quebra SSR). Prefixo `rfx-`.
 */

import { cn } from '@/lib/utils'

const MASK = 'radial-gradient(ellipse 70% 70% at 50% 48%,#000 25%,transparent 85%)'

// Brilhos de pixel (quadradinhos 63×63). c: 'p' (lilás) | 'a' (pêssego).
const PX: { l: number; t: number; c: 'p' | 'a'; d: number }[] = [
  { l: 1, t: 385, c: 'p', d: 1.8 }, { l: 1, t: 513, c: 'a', d: 3.4 }, { l: 1, t: 961, c: 'a', d: 8.1 },
  { l: 193, t: 193, c: 'p', d: 4.9 }, { l: 193, t: 513, c: 'a', d: 5.9 }, { l: 321, t: 193, c: 'a', d: 8.3 },
  { l: 385, t: 129, c: 'p', d: 2.8 }, { l: 385, t: 897, c: 'a', d: 4.4 }, { l: 577, t: 257, c: 'a', d: 2.9 },
  { l: 577, t: 513, c: 'p', d: 2.7 }, { l: 641, t: 65, c: 'a', d: 4.9 }, { l: 641, t: 897, c: 'p', d: 3.5 },
  { l: 769, t: 385, c: 'a', d: 3.1 }, { l: 769, t: 577, c: 'p', d: 5.1 }, { l: 961, t: 1, c: 'a', d: 4.6 },
  { l: 1089, t: 193, c: 'a', d: 5.5 }, { l: 1089, t: 833, c: 'p', d: 3.9 }, { l: 1153, t: 641, c: 'a', d: 3.7 },
  { l: 1281, t: 769, c: 'a', d: 4.7 }, { l: 1345, t: 257, c: 'p', d: 8.7 }, { l: 1217, t: 321, c: 'a', d: 5.2 },
  { l: 1409, t: 833, c: 'p', d: 2.1 },
]
// Formas flutuantes (só em `efeitos`): sobem do rodapé girando. k: 'sq' | 'ci' | 'plus'.
const SH: { l: string; w: number; k: 'sq' | 'ci' | 'plus'; b: string; dur: number; delay: number }[] = [
  { l: '9%', w: 18, k: 'sq', b: 'rgba(255,255,255,.35)', dur: 22, delay: 0 },
  { l: '22%', w: 12, k: 'ci', b: 'rgba(255,196,163,.55)', dur: 18, delay: -6 },
  { l: '36%', w: 22, k: 'ci', b: 'rgba(255,255,255,.25)', dur: 26, delay: -14 },
  { l: '58%', w: 14, k: 'sq', b: 'rgba(255,255,255,.3)', dur: 20, delay: -3 },
  { l: '70%', w: 20, k: 'sq', b: 'rgba(255,196,163,.5)', dur: 24, delay: -10 },
  { l: '82%', w: 10, k: 'ci', b: 'rgba(255,255,255,.35)', dur: 17, delay: -8 },
  { l: '92%', w: 16, k: 'sq', b: 'rgba(255,255,255,.25)', dur: 21, delay: -16 },
  { l: '15%', w: 16, k: 'plus', b: '', dur: 25, delay: -12 },
  { l: '47%', w: 16, k: 'plus', b: '', dur: 23, delay: -19 },
  { l: '76%', w: 16, k: 'plus', b: '', dur: 27, delay: -4 },
]

export function RevisaoParticulas({ efeitos = false, quadrados = false }: { efeitos?: boolean; quadrados?: boolean }) {
  if (!efeitos && !quadrados) return null
  const cor = (c: 'p' | 'a') => (c === 'p' ? 'rgba(185,168,255,.26)' : 'rgba(255,196,163,.20)')
  return (
    <>
      <style>{CSS}</style>
      <div className="rfx-pxw" aria-hidden="true" style={{ WebkitMaskImage: MASK, maskImage: MASK }}>
        <div className={cn('rfx-pxm', quadrados && !efeitos && 'rfx-pan')}>
          {PX.map((p, i) => (
            <span key={i} className="rfx-px" style={{ left: p.l, top: p.t, width: 63, height: 63, background: cor(p.c), animationDelay: `${p.d}s` }} />
          ))}
        </div>
      </div>
      {efeitos ? (
        <div className="rfx-shw" aria-hidden="true">
          {SH.map((s, i) => (
            <span
              key={i}
              className={cn('rfx-sh', s.k === 'plus' && 'rfx-plus')}
              style={{
                left: s.l, width: s.w, height: s.w, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`,
                ...(s.k !== 'plus' ? { border: `1.5px solid ${s.b}`, borderRadius: s.k === 'ci' ? '50%' : 4 } : {}),
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

const CSS = `
.rfx-pxw{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rfx-pxm{position:absolute;inset:0}
.rfx-pan{animation:rfxPan 40s linear 1.4s infinite}
.rfx-px{position:absolute;opacity:0;animation:rfxPx 7s ease-in-out infinite}
.rfx-shw{position:absolute;inset:0;pointer-events:none}
.rfx-sh{position:absolute;bottom:-40px;box-sizing:border-box;pointer-events:none;animation-name:rfxShRise;animation-timing-function:linear;animation-iteration-count:infinite}
.rfx-plus{background:linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/100% 1.5px no-repeat,linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/1.5px 100% no-repeat}
@keyframes rfxPx{0%,100%{opacity:0}12%,30%{opacity:1}44%{opacity:0}}
@keyframes rfxPan{from{transform:translateY(0)}to{transform:translateY(-64px)}}
@keyframes rfxShRise{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}85%{opacity:1}100%{transform:translateY(-1100px) rotate(240deg);opacity:0}}
@media (prefers-reduced-motion:reduce){.rfx-px,.rfx-sh{animation:none!important;opacity:0}}
`
