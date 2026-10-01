// Render NÃO-destrutivo da capa do card por CSS — MESMA fórmula da imagem de fundo da trilha
// (components/admin/modulo-trilha-fundo-form.tsx::estiloFundo), para o card do aluno ficar IDÊNTICO
// ao que o admin enquadrou. Puro/client-safe: só devolve CSSProperties. Reusa estiloDegrade da trilha.
import type { CSSProperties } from 'react'
import { estiloDegrade } from '@/lib/leitura/trilha-aparencia'
import type { CapaRect, CapaViewCfg } from '@/lib/capa-meta'

/** Background (imagem + recorte) a partir do retângulo (frações 0..1). Sem recorte → cover/center. */
export function estiloCapaCrop(url: string, crop?: CapaRect | null): CSSProperties {
  if (crop && crop.w > 0 && crop.h > 0) {
    return {
      backgroundImage: `url("${url}")`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${100 / crop.w}% ${100 / crop.h}%`,
      backgroundPosition: `${crop.w < 1 ? (crop.x / (1 - crop.w)) * 100 : 0}% ${crop.h < 1 ? (crop.y / (1 - crop.h)) * 100 : 0}%`,
    }
  }
  return { backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center' }
}

/** Desfoque + transparência. `scale(1.06)` evita a borda clara que o blur deixa (truque da trilha). */
export function estiloBlurOpacity(cfg?: CapaViewCfg | null): CSSProperties {
  const desfoque = cfg?.desfoque ?? 0
  const opacidade = cfg?.opacidade ?? 100
  return {
    opacity: opacidade / 100,
    filter: desfoque > 0 ? `blur(${desfoque}px)` : undefined,
    transform: desfoque > 0 ? 'scale(1.06)' : undefined,
  }
}

/** Estilo completo da camada da imagem (recorte + desfoque/transparência) para um formato. */
export function estiloCapaView(url: string, cfg?: CapaViewCfg | null): CSSProperties {
  return { ...estiloCapaCrop(url, cfg?.crop), ...estiloBlurOpacity(cfg) }
}

/** CSS do overlay de degradê no topo (ou nulo se desligado). Reusa a fórmula da trilha. */
export function estiloCapaDegrade(cfg?: CapaViewCfg | null): CSSProperties | null {
  const d = cfg?.degrade
  if (!d || !d.ativo) return null
  return estiloDegrade(d) as CSSProperties
}

/** true se há enquadramento novo (original + recorte) para renderizar por CSS. */
export function temEnquadramento(orig?: string | null, cfg?: CapaViewCfg | null): boolean {
  return !!orig && !!cfg?.crop && (cfg.crop.w ?? 0) > 0 && (cfg.crop.h ?? 0) > 0
}
