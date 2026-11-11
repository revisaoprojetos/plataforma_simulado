// BASE dos renderers da página do extensivo (servidor + cliente; sem hooks/sessão): moldura de estilo/visibilidade,
// texto editável e utilitários. Cores SEMPRE por token (corCss) — nunca hex. Responsivo por CONTAINER QUERY (@container
// é declarado em <PaginaRender/>; as larguras de referência do editor são 1400/820/390).
import type { ReactNode, ElementType, CSSProperties } from 'react'
import type { BlocoAluno } from '@/lib/produtos/pagina-extensivo'
import type { DadosPagina } from '@/lib/produtos/pagina/dados'
import type { RenderProps } from '@/lib/produtos/pagina/registro'
import type { BlocoV1, Raio, TipoElemento } from '@/lib/produtos/pagina/tipos'
import { corCss, TEXTO_SOBRE } from '@/lib/produtos/pagina/tokens'
import { sanitizarHtml } from '@/lib/produtos/pagina/normalizar'
import { Editavel } from './edicao-ctx'

/** Props de um renderer: o contrato + o dado já resolvido no servidor (aluno) e a posição na página. */
export interface PropsRenderer<T extends TipoElemento> extends RenderProps<T> {
  /** Item resolvido por montarPaginaExtensivo (módulos/cronograma/progresso/vitrine). Ausente no editor → resolverLocal. */
  resolvido?: BlocoAluno
  /** 1º elemento visível da página (o hero "sangra" sobre o padding do portal só aí). */
  primeiro?: boolean
}

export const RAIO_CSS: Record<Raio, string> = { none: '0px', sm: '0.375rem', md: '0.75rem', lg: '1rem', full: '2rem' }
export const raioCss = (b: BlocoV1): string | undefined => (b.estilo.raio ? RAIO_CSS[b.estilo.raio] : undefined)

/** Dados com a cor de destaque do bloco (estilo.cor) no lugar da do produto. Sem estilo.cor → o MESMO objeto. */
export function dadosDoBloco(b: BlocoV1, dados: DadosPagina): DadosPagina {
  const c = corCss(b.estilo.cor, { cor: dados.cor, cor2: dados.cor2 })
  return c ? { ...dados, cor: c } : dados
}

// Visibilidade por LARGURA DO CONTAINER (não da viewport): mobile < 600, tablet 600–899, desktop ≥ 900.
const V_MOBILE = '@max-[599px]:hidden'
const V_TABLET = '@min-[600px]:@max-[899px]:hidden'
const V_DESKTOP = '@min-[900px]:hidden'
export function classesVisib(v: BlocoV1['visib']): string {
  if (!v.desktop && !v.tablet && !v.mobile) return 'hidden'
  return [!v.mobile && V_MOBILE, !v.tablet && V_TABLET, !v.desktop && V_DESKTOP].filter(Boolean).join(' ')
}
const ESPACO: Record<string, string> = { sm: 'mb-3', md: 'mb-6', lg: 'mb-12' }
const ALINHA: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right' }

/**
 * Moldura de TODO elemento: aplica estilo (fundo/raio/espaço/alinhamento), visibilidade e âncora.
 * Sem estilo/visib/âncora configurados o wrapper não tem classe nem style (só adiciona o <div> neutro — o
 * espaçamento `space-y-6` do pai age sobre ele como agia sobre o filho direto).
 */
export function Moldura({ bloco, modo, dispositivo, dados, primeiro, sangrar, semFundo, children }: {
  bloco: BlocoV1; modo: 'aluno' | 'edicao'; dispositivo: 'desktop' | 'tablet' | 'mobile'; dados: DadosPagina
  primeiro?: boolean; sangrar?: boolean; semFundo?: boolean; children: ReactNode
}) {
  const e = bloco.estilo
  const edicao = modo === 'edicao'
  const cls: string[] = []
  const style: CSSProperties = {}
  if (e.espaco) cls.push(ESPACO[e.espaco])
  if (e.alinhamento) cls.push(ALINHA[e.alinhamento])
  if (e.fundo && !semFundo) {
    cls.push('p-4 overflow-hidden')
    style.background = corCss(e.fundo, { cor: dados.cor, cor2: dados.cor2 })
    const t = TEXTO_SOBRE[e.fundo]; if (t) style.color = corCss(t, { cor: dados.cor, cor2: dados.cor2 })
  }
  if (e.raio && (!semFundo || e.fundo)) { style.borderRadius = RAIO_CSS[e.raio]; if (!e.fundo) cls.push('overflow-hidden') }
  if (sangrar && !edicao) cls.push('-mx-[14px] min-[900px]:-mx-7', primeiro ? '-mt-[14px] min-[900px]:-mt-6' : '')
  let attrs: Record<string, string | undefined> = {}
  if (edicao) {
    // O editor mostra tudo; o que está oculto neste dispositivo (ou desativado) aparece esmaecido.
    const oculto = !bloco.visib[dispositivo]
    if (oculto || !bloco.ativo) cls.push('opacity-45')
    attrs = { 'data-bloco-id': bloco.id, 'data-bloco-tipo': bloco.tipo, 'data-oculto': oculto ? '1' : undefined, 'data-inativo': bloco.ativo ? undefined : '1' }
  } else {
    const v = classesVisib(bloco.visib); if (v) cls.push(v)
  }
  const className = cls.filter(Boolean).join(' ') || undefined
  const extra = bloco.ancora ? { id: bloco.ancora } : {}
  return (
    <div {...attrs} {...extra} className={bloco.ancora ? `${className ?? ''} scroll-mt-4`.trim() : className}
      style={Object.keys(style).length ? style : undefined}
      // Editor: links/botões não navegam (captura antes do <Link> do Next, que respeita defaultPrevented).
      onClickCapture={edicao ? (ev) => { if ((ev.target as HTMLElement).closest('a')) ev.preventDefault() } : undefined}>
      {children}
    </div>
  )
}

/** Texto do elemento: aluno = texto/HTML sanitizado (sem client boundary); edição = <Editavel/> (contentEditable). */
export function Txt({ modo, blocoId, campo, valor, fallback = '', as, rich, placeholder, className }: {
  modo: 'aluno' | 'edicao'; blocoId: string; campo: string; valor: string; fallback?: string
  as?: ElementType; rich?: boolean; placeholder?: string; className?: string
}) {
  if (modo === 'edicao' && !blocoId.startsWith('implicito:')) {
    return <Editavel blocoId={blocoId} campo={campo} valor={valor} fallback={fallback} as={as} rich={rich} placeholder={placeholder} className={className} />
  }
  const Tag: ElementType = as ?? (rich ? 'div' : 'span')
  const exibido = valor || fallback
  if (!exibido) return null
  return rich ? <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizarHtml(exibido) }} /> : <Tag className={className}>{exibido}</Tag>
}

/** Placeholder do editor para elemento sem dados (no aluno o elemento some). */
export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">{children}</div>
}

/** Estilo de tipografia do HTML rico do elemento Texto (HTML já sanitizado por whitelist). */
export const RICH_CLS = '[&_p]:my-2 first:[&_p]:mt-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-semibold [&_a]:underline'
