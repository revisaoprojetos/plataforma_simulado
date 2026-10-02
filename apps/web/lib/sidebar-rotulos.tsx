// White-label da NAVEGAÇÃO por tenant: rótulos (texto) e ícones (lucide OU imagem própria) das barras
// laterais do admin e do aluno. Guardado em `tenants.tema.sidebar_rotulos` (jsonb, sem migração). Chaves
// estáveis: itens/filhos por `href`; grupos do admin pela `label` ORIGINAL (constante no código). Ausente
// = usa o padrão do código. Puro/client-safe (sem hooks) → importável em server e client.
import type { ComponentType } from 'react'
import { iconeCargo } from '@/lib/gamificacao/cargo-icones'
import { cn } from '@/lib/utils'

/** Ícone sobrescrito: um lucide (por `key`), uma imagem (`url`) OU 'none' (sem ícone / oculto). */
export type IconeOverride = {
  tipo: 'lucide' | 'img' | 'none'; key?: string | null; url?: string | null
  // Ajuste da IMAGEM (tipo='img'): tamanho (escala), posição (posX/posY %), encaixe e COR (tingir;
  // vazio/null = imagem original). A cor usa a imagem como máscara → ícone monocromático na cor.
  // `corAtiva` = cor quando o item está ATIVO/selecionado (acompanha a mudança de cor do menu).
  escala?: number; posX?: number; posY?: number; ajuste?: 'contain' | 'cover'; cor?: string | null; corAtiva?: string | null
}

/** Cor efetiva do tingimento da imagem conforme o estado (ativo usa `corAtiva`, senão `cor`). */
export function corTint(li: IconeOverride, ativo?: boolean): string | null | undefined {
  return ativo ? (li.corAtiva || li.cor) : li.cor
}
// `labelImg`: imagem que SUBSTITUI o texto do rótulo (ex.: logotipo/título estilizado). Carrega os
// MESMOS ajustes do ícone (escala/posição/encaixe/cor) via IconeOverride (tipo='img'). Base64 no save
// vira URL (hospedarBase64NoObjeto). Exibida com ~20px de altura; o texto segue como alt/tooltip.
export type RotuloOverride = { label?: string; labelImg?: IconeOverride | null; icone?: IconeOverride | null }
export type SidebarRotulosAdmin = { grupos?: Record<string, RotuloOverride>; itens?: Record<string, RotuloOverride> }
export type SidebarRotulosAluno = { itens?: Record<string, RotuloOverride>; filhos?: Record<string, { label?: string }> }
export type SidebarRotulos = { admin?: SidebarRotulosAdmin; aluno?: SidebarRotulosAluno }

/** Texto efetivo: override (se tiver) ou o padrão do código. */
export function rotuloDe(map: Record<string, RotuloOverride> | undefined, chave: string, fallback: string): string {
  const l = map?.[chave]?.label
  return typeof l === 'string' && l.trim() ? l.trim() : fallback
}

/** Renderiza a imagem-do-texto com os ajustes (escala/posição/encaixe/cor) — mesma lógica do IconeMenu. */
export function LabelImg({ li, alt, className, ativo }: { li: IconeOverride; alt: string; className?: string; ativo?: boolean }) {
  if (!li.url) return null
  const esc = li.escala && li.escala !== 1 ? `scale(${li.escala})` : undefined
  const pos = `${li.posX ?? 50}% ${li.posY ?? 50}%`
  const fit = li.ajuste || 'contain'
  const tint = corTint(li, ativo)
  if (tint) {
    // Tingir: a imagem vira máscara; caixa com altura fixa (h-5) e largura até 9.5rem p/ a cor preencher.
    return <span role="img" aria-label={alt} className={cn('block h-5 w-[9.5rem] max-w-full shrink-0', className)} style={{ backgroundColor: tint, transform: esc, WebkitMaskImage: `url("${li.url}")`, maskImage: `url("${li.url}")`, WebkitMaskSize: fit, maskSize: fit, WebkitMaskPosition: pos, maskPosition: pos, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' }} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={li.url} alt={alt} className={cn('h-5 w-auto max-w-[9.5rem] shrink-0 object-contain', className)} style={{ objectFit: fit, objectPosition: pos, transform: esc }} />
}

/** Rótulo para EXIBIÇÃO: imagem do texto (`labelImg`) quando houver, senão o texto. Mantém o texto como alt. */
export function RotuloMenu({ map, chave, fallback, className, ativo }: { map?: Record<string, RotuloOverride>; chave: string; fallback: string; className?: string; ativo?: boolean }) {
  const texto = rotuloDe(map, chave, fallback)
  const li = map?.[chave]?.labelImg
  if (li?.tipo === 'img' && li.url) return <LabelImg li={li} alt={texto} className={className} ativo={ativo} />
  return <span className={className}>{texto}</span>
}

type SvgProps = { className?: string }
/** Ícone efetivo: imagem própria OU lucide escolhido OU o ícone padrão (fallback). */
export function IconeMenu({ override, fallback: Fallback, className, ativo }: { override?: IconeOverride | null; fallback: ComponentType<SvgProps>; className?: string; ativo?: boolean }) {
  if (override?.tipo === 'none') return null // sem ícone (oculto)
  if (override?.tipo === 'img' && override.url) {
    const esc = override.escala && override.escala !== 1 ? `scale(${override.escala})` : undefined
    const pos = `${override.posX ?? 50}% ${override.posY ?? 50}%`
    const fit = override.ajuste || 'contain'
    const tint = corTint(override, ativo)
    if (tint) {
      // Tingir: a imagem vira máscara e o quadro é preenchido com a cor (muda no estado ativo via corAtiva).
      return <span aria-hidden className={cn('inline-block', className)} style={{ backgroundColor: tint, transform: esc, WebkitMaskImage: `url("${override.url}")`, maskImage: `url("${override.url}")`, WebkitMaskSize: fit, maskSize: fit, WebkitMaskPosition: pos, maskPosition: pos, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' }} />
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={override.url} alt="" className={className} style={{ objectFit: fit, objectPosition: pos, transform: esc }} />
  }
  if (override?.tipo === 'lucide' && override.key) {
    const Ico = iconeCargo(override.key)
    return <Ico className={className} />
  }
  return <Fallback className={className} />
}

/** Sanitiza o jsonb cru de `tema.sidebar_rotulos` para a forma tipada (tolerante). */
export function resolverSidebarRotulos(raw: unknown): SidebarRotulos {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any
  const num = (v: any, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined)
  const limpIcone = (ic: any): IconeOverride | null => {
    if (!ic || typeof ic !== 'object') return null
    if (ic.tipo === 'none') return { tipo: 'none' }
    if (ic.tipo !== 'lucide' && ic.tipo !== 'img') return null
    return {
      tipo: ic.tipo, key: typeof ic.key === 'string' ? ic.key : null, url: typeof ic.url === 'string' ? ic.url : null,
      escala: num(ic.escala, 0.3, 3), posX: num(ic.posX, 0, 100), posY: num(ic.posY, 0, 100),
      ajuste: ic.ajuste === 'cover' ? 'cover' : ic.ajuste === 'contain' ? 'contain' : undefined,
      cor: typeof ic.cor === 'string' && ic.cor.trim() ? ic.cor : null,
      corAtiva: typeof ic.corAtiva === 'string' && ic.corAtiva.trim() ? ic.corAtiva : null,
    }
  }
  const limpOv = (o: any): RotuloOverride | null => {
    if (!o || typeof o !== 'object') return null
    const out: RotuloOverride = {}
    if (typeof o.label === 'string' && o.label.trim()) out.label = o.label
    // labelImg: aceita objeto novo (com ajustes) OU string crua (compat) — normaliza p/ IconeOverride tipo='img'.
    if (typeof o.labelImg === 'string' && o.labelImg.trim()) out.labelImg = { tipo: 'img', url: o.labelImg }
    else { const li = limpIcone(o.labelImg); if (li && li.url) out.labelImg = { ...li, tipo: 'img' } }
    const ic = limpIcone(o.icone); if (ic) out.icone = ic
    return out.label || out.labelImg || out.icone ? out : null
  }
  const mapOv = (m: any): Record<string, RotuloOverride> => {
    const out: Record<string, RotuloOverride> = {}
    if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) { const ov = limpOv(v); if (ov) out[k] = ov }
    return out
  }
  const mapLabel = (m: any): Record<string, { label?: string }> => {
    const out: Record<string, { label?: string }> = {}
    if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) { const l = (v as any)?.label; if (typeof l === 'string' && l.trim()) out[k] = { label: l } }
    return out
  }
  return {
    admin: { grupos: mapOv(r.admin?.grupos), itens: mapOv(r.admin?.itens) },
    aluno: { itens: mapOv(r.aluno?.itens), filhos: mapLabel(r.aluno?.filhos) },
  }
}
