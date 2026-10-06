'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Peças decorativas COMPARTILHADAS entre as 3 variantes VND (spec 02 §2.4).
// Tudo aqui é aria-hidden + pointer-events:none. As animações vivem nos <style>
// escopados de cada variante (prefixos vlc-/vlv-/vld-); estes componentes só
// desenham e recebem a classe-base do contexto (ex. `${P}-vdraw`).
// ─────────────────────────────────────────────────────────────────────────────

import { VND_V_PATH, VND_N_PATH, VND_D_PATH } from '../../brand-marks'

/** Marca pequena do header: tile verde + "V" + "Você na Defensoria / SIMULA VND". */
export function HeaderMarca({ cls }: { cls?: string }) {
  return (
    <div className={cls} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 42, height: 42, borderRadius: 13,
          background: 'linear-gradient(160deg,#0F4A2E,#072A1B)',
          border: '1px solid rgba(120,230,170,.3)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 8px 20px -8px rgba(34,197,110,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 32 32" width={22} height={22} aria-hidden="true">
          <path d={VND_V_PATH} fill="#3FD58A" />
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#FFFFFF' }}>Você na Defensoria</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.18em', color: '#86CFA6' }}>SIMULA VND</span>
      </div>
    </div>
  )
}

/** Botão "Ajuda" fantasma (desktop). */
export function AjudaBtn({ cls }: { cls?: string }) {
  return (
    <a
      className={cls}
      href="#"
      onClick={(e) => e.preventDefault()}
      aria-label="Ajuda"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px',
        borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', color: '#D4EADD',
        fontSize: 13, fontWeight: 600, textDecoration: 'none',
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width={16} height={16}
        fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={10} />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
      </svg>
      Ajuda
    </a>
  )
}

/**
 * "SIMULA" letra a letra (vertical lockup) + linha dourada por baixo.
 * `simula=false` → só a linha dourada (variantes "Linha").
 * `P` = prefixo de classe da variante (p/ animações `sl`/`simline`).
 * `align` controla alinhamento (center no centralizado, start no resto).
 */
export function SimulaLockup({
  P, simula, align = 'center', size = 22,
}: { P: string; simula: boolean; align?: 'center' | 'start'; size?: number }) {
  if (!simula) {
    // variante Linha: só a linha dourada curta
    return (
      <span
        aria-hidden="true"
        className={`${P}-simline`}
        style={{
          display: 'block', width: 120, height: 2, borderRadius: 2,
          background: 'linear-gradient(90deg,#D8B45A,rgba(216,180,90,0))',
        }}
      />
    )
  }
  const letras = ['S', 'I', 'M', 'U', 'L', 'A']
  const items = align === 'center'
    ? { alignItems: 'center' as const }
    : { alignItems: 'flex-start' as const }
  const lineBg = align === 'center'
    ? 'linear-gradient(90deg,rgba(216,180,90,0),#D8B45A 50%,rgba(216,180,90,0))'
    : 'linear-gradient(90deg,#D8B45A,rgba(216,180,90,0))'
  return (
    <div aria-label="SIMULA" style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, ...items }}>
      <div style={{ fontWeight: 800, fontSize: size, letterSpacing: '.34em', paddingLeft: align === 'center' ? '.34em' : 0, color: '#FFFFFF', lineHeight: 1 }}>
        {letras.map((l, i) => (
          <span key={l} className={`${P}-sl ${P}-s${i + 1}`} style={{ display: 'inline-block' }}>{l}</span>
        ))}
      </div>
      <span
        className={`${P}-simline`}
        style={{ width: '70%', height: 2, borderRadius: 2, background: lineBg }}
      />
    </div>
  )
}

/**
 * Lockup grande V + ND + "VOCÊ NA / DEFENSORIA" (usado no vitrine e no dividido).
 * `P` = prefixo; `scale` controla o tamanho (vitrine ~ .75, dividido 1).
 * As classes de animação (vfill/vdraw/ndw) vêm do <style> da variante.
 */
export function LockupVND({ P, scale = 1, gradId }: { P: string; scale?: number; gradId: string }) {
  const vW = 174.6 * scale
  const vH = 120 * scale
  const ndW = 189.8 * scale
  const ndH = 62.4 * scale
  const subSize = 15 * scale
  return (
    <div role="img" aria-label="VND — Você na Defensoria" style={{ display: 'flex', alignItems: 'flex-start', gap: 11 * scale }}>
      <div style={{ position: 'relative', width: vW, height: vH }}>
        <svg className={`${P}-vfill`} viewBox="0.6 5.4 31 21.3" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.1" stopColor="#5BE39E" />
              <stop offset="0.9" stopColor="#22A866" />
            </linearGradient>
          </defs>
          <path fill={`url(#${gradId})`} d={VND_V_PATH} />
        </svg>
        <svg className={`${P}-vdraw`} viewBox="0.6 5.4 31 21.3" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <path pathLength={1000} fill="none" stroke="#B9F5D4" strokeWidth={0.2486} strokeLinejoin="round" d={VND_V_PATH} />
        </svg>
      </div>
      <div className={`${P}-ndw`} style={{ display: 'flex', flexDirection: 'column', gap: 12 * scale, marginTop: 24 * scale }}>
        <svg viewBox="38 23 292 96" aria-hidden="true" style={{ display: 'block', width: ndW, height: ndH, overflow: 'visible' }}>
          <path fill="#FFFFFF" d={VND_N_PATH} />
          <path fill="#FFFFFF" d={VND_D_PATH} />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.12, fontWeight: 800, fontSize: subSize, letterSpacing: '.06em', color: '#E9EFEC', paddingLeft: 2 }}>
          <span style={{ fontWeight: 600, color: '#CFDCD5' }}>VOCÊ NA</span>
          <span>DEFENSORIA</span>
        </div>
      </div>
    </div>
  )
}

/** Ícone de linha genérico (stroke currentColor). */
export function LineIcon({ d, size = 18, extra }: { d: React.ReactNode; size?: number; extra?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...extra }}>
      {d}
    </svg>
  )
}

/** Sublinhado dourado desenhado sob a palavra "aqui." (headline). */
export function Uline({ P }: { P: string }) {
  return (
    <svg className={`${P}-uline`} viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', left: 0, bottom: -10, width: '100%', height: 14 }}>
      <path pathLength={1} d="M3 14C50 4 140 2 197 10" fill="none" stroke="#D8B45A" strokeWidth={4} strokeLinecap="round" />
    </svg>
  )
}
