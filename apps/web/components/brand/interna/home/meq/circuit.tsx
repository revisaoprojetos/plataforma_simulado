// Peças decorativas da Home MEQ (spec 03 §3.3/§3.4): "circuito" desenhado + barras
// segmentadas. Porte fiel dos mockups HomeMEQ*.dc.html. Tudo aqui é aria-hidden e
// não interativo. Animações só em stroke-dashoffset/opacity/transform (reduced-motion
// desliga via CSS global no <style> de home.tsx).

import { cn } from '@/lib/utils'

// Os 3 traços do "circuito" (a marca MEQ redesenhada em linhas), extraídos do mockup.
export const MEQ_CIRC_PATHS = [
  'M0.00 25.78L0.00 57.46Q0.00 61.30 1.35 64.90L1.65 65.70Q3.00 69.30 6.06 71.63L133.78 169.01Q137.30 171.70 141.35 173.50L142.25 173.90Q146.30 175.70 150.55 174.43L152.57 173.83Q157.70 172.30 161.92 169.01L268.02 86.46Q276.70 79.70 287.70 79.70L430.74 79.70Q435.70 79.70 440.02 77.27L441.16 76.63Q445.30 74.30 447.28 69.98L447.72 69.02Q449.70 64.70 449.60 59.95L448.80 21.02Q448.70 16.30 445.82 12.57L444.73 11.15Q442.30 8.00 438.56 6.65L437.74 6.35Q434.00 5.00 430.03 5.02L261.30 5.94Q250.30 6.00 241.55 12.67L154.97 78.73Q152.00 81.00 148.26 81.00L147.44 81.00Q143.70 81.00 140.41 79.22L139.63 78.80Q136.30 77.00 133.25 74.75L37.52 4.11Q33.30 1.00 28.08 0.55L26.55 0.42Q21.70 0.00 17.02 1.35L14.76 2.00Q11.30 3.00 8.60 5.38L8.00 5.92Q5.30 8.30 3.81 11.58L2.38 14.73Q0.00 20.00 0.00 25.78Z',
  'M206.94 193.87L206.03 273.42Q206.00 276.00 207.49 278.12L207.81 278.58Q209.30 280.70 211.88 280.70L371.00 280.70Q382.00 280.70 390.15 288.08L404.50 301.07Q406.30 302.70 408.55 303.60L409.05 303.80Q411.30 304.70 413.72 304.70L473.76 304.70Q477.00 304.70 479.56 302.72L480.16 302.26Q482.70 300.30 482.07 297.15L481.93 296.45Q481.30 293.30 479.07 290.99L413.84 223.52Q411.70 221.30 409.00 219.81L408.40 219.49Q405.70 218.00 402.62 217.97L291.27 217.04Q286.30 217.00 282.88 213.40L282.12 212.60Q278.70 209.00 278.70 204.03L278.70 192.67Q278.70 187.70 282.12 184.10L282.88 183.30Q286.30 179.70 291.27 179.66L392.30 178.79Q403.30 178.70 410.67 170.53L447.79 129.41Q449.70 127.30 450.60 124.60L450.80 124.00Q451.70 121.30 449.60 119.38L449.12 118.94Q447.00 117.00 444.13 117.02L299.70 117.93Q288.70 118.00 280.15 124.93L218.63 174.79Q214.30 178.30 211.02 182.80L210.28 183.80Q207.00 188.30 206.94 193.87Z',
  'M9.22 128.32L7.91 129.56Q4.00 133.30 4.00 138.71L4.00 265.83Q4.00 269.30 5.94 272.18L6.37 272.82Q8.30 275.70 11.52 277.00L12.37 277.35Q15.70 278.70 19.29 278.64L67.53 277.77Q71.30 277.70 74.18 275.27L75.52 274.14Q77.70 272.30 78.60 269.60L78.80 269.00Q79.70 266.30 79.67 263.45L78.74 175.65Q78.70 172.30 76.72 169.60L76.28 169.00Q74.30 166.30 71.67 164.23L27.08 129.27Q23.30 126.30 18.53 125.72L17.47 125.58Q12.70 125.00 9.22 128.32Z',
]

/** Circuito grande dos slides do carrossel (cores fixas do mockup: ciano/branco). */
export function CircuitHero() {
  return (
    <svg
      className="hmq-circ"
      viewBox="0 0 483 306"
      aria-hidden="true"
      style={{ position: 'absolute', left: 520, top: -360, width: 1500, height: 950, overflow: 'visible', pointerEvents: 'none' }}
    >
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path key={`ol${i}`} className="hmq-ol" pathLength={1000} fill="none" stroke="#8BEAEA" strokeOpacity={0.4} strokeWidth={0.3864} strokeLinejoin="round" d={d} />
      ))}
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path key={`pl${i}`} className={`hmq-pl hmq-pl${i + 1}`} pathLength={1000} fill="none" stroke="#FFFFFF" strokeWidth={0.7084} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
    </svg>
  )
}

/** Circuito pequeno que fica no canto das capas (selo do simulado). */
export function CircuitCapa() {
  return (
    <svg
      className="hmq-cc"
      viewBox="0 0 483 306"
      aria-hidden="true"
      style={{ position: 'absolute', left: -60, top: -40, width: 260, height: 165, overflow: 'visible', pointerEvents: 'none' }}
    >
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path key={i} className="hmq-ol" pathLength={1000} fill="none" stroke="#8BEAEA" strokeOpacity={0.35} strokeWidth={1.8577} strokeLinejoin="round" d={d} />
      ))}
    </svg>
  )
}

/** As 3 barrinhas da marca MEQ (assinatura visual) — crescentes esquerda→direita. */
export function MarcaBarras({ size = 14, light }: { size?: number; light?: boolean }) {
  const cor = light ? '#5ECEF0' : 'var(--brand2)'
  const w = Math.round((size / 14) * 3)
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: size }}>
      <span style={{ display: 'block', width: w, height: size * 0.43, borderRadius: 1, background: cor, opacity: 0.45 }} />
      <span style={{ display: 'block', width: w, height: size * 0.71, borderRadius: 1, background: cor, opacity: 0.7 }} />
      <span style={{ display: 'block', width: w, height: size, borderRadius: 1, background: cor, opacity: 1 }} />
    </span>
  )
}

/**
 * Barra segmentada (spec §3.3): `total` segmentos; os primeiros `preenchidos` recebem a
 * cor `cor` (default --brand2), o resto fica em --track. `segIn` escalonado na entrada.
 */
export function Segs({
  total,
  preenchidos,
  altura = 6,
  cor = 'var(--brand2)',
  gap = 2,
  base = 0.4,
}: {
  total: number
  preenchidos: number
  altura?: number
  cor?: string
  gap?: number
  base?: number
}) {
  return (
    <div style={{ display: 'flex', gap }} aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => {
        const on = i < preenchidos
        return (
          <span
            key={i}
            className={cn(on && 'hmq-sg')}
            style={{
              flex: 1,
              height: altura,
              borderRadius: 2,
              background: on ? cor : 'var(--track)',
              animationDelay: `${(base + i * 0.05).toFixed(2)}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/** Chama "respirando" da sequência (dia com estudo), cores MEQ. */
export function Fogo() {
  return (
    <svg className="hmq-fl" viewBox="0 0 24 30" aria-hidden="true" style={{ width: 21, height: 26, marginTop: 1, overflow: 'visible' }}>
      <ellipse className="sh" cx={12} cy={27.6} rx={7} ry={1.7} fill="rgba(20,50,120,.3)" />
      <g className="b">
        <path className="o" d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="#3E8BF0" />
        <path className="i" d="M12 23.3C9.9 23.3 8.6 21.8 8.6 20 8.6 17.9 10.5 16.1 11.4 14.3 11.6 13.9 12.4 13.9 12.6 14.3 13.5 16.1 15.4 17.9 15.4 20 15.4 21.8 14.1 23.3 12 23.3Z" fill="#8BEAEA" />
      </g>
    </svg>
  )
}

/** Gota (dia sem estudo / vazio) — ícone estático. */
export function Gota({ ativo }: { ativo?: boolean }) {
  return (
    <svg viewBox="0 0 24 26" aria-hidden="true" style={{ width: 15, height: 16, display: 'block' }}>
      <path d="M12 25.4C7.4 25.4 4.1 22.1 4.1 17.7 4.1 14.7 5.5 12.6 6.3 10.7 6.7 9.6 6.7 6.6 7.1 5.3 7.4 4.4 8.4 4.3 8.9 5.1 9.6 6.3 10 7.2 10.6 7.8 11.1 5.7 11.9 2.9 13.4 1.4 14 .8 14.9 .9 15.3 1.6 17.4 5.3 19.9 9.8 19.9 17.4 19.9 22.1 16.6 25.4 12 25.4Z" fill="currentColor" opacity={ativo ? 1 : 0.6} />
      <path d="M12 23.3C9.9 23.3 8.6 21.8 8.6 20 8.6 17.9 10.5 16.1 11.4 14.3 11.6 13.9 12.4 13.9 12.6 14.3 13.5 16.1 15.4 17.9 15.4 20 15.4 21.8 14.1 23.3 12 23.3Z" fill="#FFFFFF" opacity={0.45} />
    </svg>
  )
}

/** Capa MEQ: gradiente azul + circuito no canto + 3 barrinhas ciano + rótulo. */
export function Capa({ rotulo, grad = 'linear-gradient(150deg,#1F2A55,#306AB5)', radius = 10, fs = 13 }: { rotulo: string; grad?: string; radius?: number; fs?: number }) {
  return (
    <div
      className="hmq-cov"
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        background: grad,
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '10px 12px',
        borderRadius: radius,
      }}
    >
      <CircuitCapa />
      <span style={{ position: 'absolute', left: 12, top: 10, display: 'flex', gap: 2 }} aria-hidden="true">
        <span style={{ display: 'block', width: 4, height: 5, borderRadius: 1, background: '#5ECEF0', opacity: 0.5, alignSelf: 'flex-end' }} />
        <span style={{ display: 'block', width: 4, height: 8, borderRadius: 1, background: '#5ECEF0', opacity: 0.75, alignSelf: 'flex-end' }} />
        <span style={{ display: 'block', width: 4, height: 11, borderRadius: 1, background: '#5ECEF0', opacity: 1, alignSelf: 'flex-end' }} />
      </span>
      <span style={{ position: 'relative', fontWeight: 700, fontSize: fs, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{rotulo}</span>
    </div>
  )
}
