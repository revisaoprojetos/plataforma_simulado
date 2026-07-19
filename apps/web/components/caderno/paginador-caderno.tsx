'use client'

import { useEffect, useRef, useState } from 'react'
import { SHEET_W, PAD_H } from '@/lib/caderno-designer/types'

const MM = 3.7795
const PAGE_H = 297 * MM // altura A4 em px @96dpi
const CONT_W = SHEET_W - 2 * PAD_H // largura útil do conteúdo (igual ao editor)

/**
 * Paginador determinístico do caderno para impressão/PDF.
 *
 * Mede a altura de cada item (banner, tabela do estudante, questões) e distribui
 * em folhas A4 explícitas. Cada folha mostra o letterhead INTEIRO como fundo
 * (cabeçalho com logos no topo, rodapé no rodapé — sem fatiar) e o conteúdo na
 * "área segura" (com padding reservando cabeçalho/rodapé). Assim o letterhead
 * aparece igual em TODAS as páginas e nenhuma questão invade o cabeçalho/rodapé,
 * sem depender de `@page` (que o Chrome não aplica em páginas de continuação).
 */
export function PaginadorCaderno({
  itens,
  letterhead,
  opac = 1,
  cabH,
  cabHCont,
  rodH,
  fundo,
}: {
  itens: { key: string; node: React.ReactNode; gapTop?: number }[]
  letterhead?: string | null
  opac?: number
  cabH: number // px reservados no topo da 1ª página do conteúdo (igual ao editor)
  cabHCont?: number // px reservados no topo das páginas de CONTINUAÇÃO (libera o cabeçalho da arte)
  rodH: number // px reservados embaixo (rodapé)
  fundo: string
}) {
  const [paginas, setPaginas] = useState<number[][] | null>(null)
  const medRef = useRef<HTMLDivElement>(null)
  const cabCont = cabHCont ?? cabH

  useEffect(() => {
    const cont = medRef.current
    if (!cont) return
    let cancel = false

    const medir = () => {
      if (cancel || !medRef.current) return
      const filhos = Array.from(medRef.current.children) as HTMLElement[]
      // Altura REAL de cada bloco (getBoundingClientRect = border-box; margem/gap fica de fora
      // e é somada separadamente na hora de empacotar). Cada filho envolve exatamente um item.
      const alturas = filhos.map((f) => f.getBoundingClientRect().height)
      // Folga contra arredondamento sub-pixel (evita que um bloco "quase cabe" seja cortado).
      const BUF = 4
      const grupos: number[][] = []
      let atual: number[] = []
      let h = 0
      for (let i = 0; i < alturas.length; i++) {
        const safe = PAGE_H - (grupos.length === 0 ? cabH : cabCont) - rodH - BUF
        const alt = alturas[i]
        const gap = atual.length ? (itens[i].gapTop || 0) : 0 // 1º item da página não tem gap
        // Não cabe no espaço restante desta página (e a página já tem conteúdo) →
        // NÃO corta: fecha a página e move o bloco INTEIRO para o topo da próxima.
        if (atual.length && h + gap + alt > safe) {
          grupos.push(atual)
          atual = []
          h = 0
        }
        // Se um único bloco é maior que a página inteira, ele fica sozinho na própria página
        // (não é cortado; com overflow liberado, transborda de forma visível em vez de sumir).
        const gap2 = atual.length ? (itens[i].gapTop || 0) : 0
        atual.push(i)
        h += gap2 + alt
      }
      if (atual.length) grupos.push(atual)
      setPaginas(grupos.length ? grupos : [[...itens.keys()]])
    }

    // IMPORTANTE (correção de quebras/cards): só medimos DEPOIS que as fontes e as
    // imagens do conteúdo carregam. Medir antes disso usa fonte de fallback / imagem
    // sem dimensão → alturas erradas → cards cortados e quebras de página tortas.
    ;(async () => {
      try { await (document as any).fonts?.ready } catch { /* noop */ }
      const imgs = Array.from(cont.querySelectorAll('img')) as HTMLImageElement[]
      await Promise.all(
        imgs.map((img) => (img.complete ? null : new Promise<void>((res) => {
          img.addEventListener('load', () => res(), { once: true })
          img.addEventListener('error', () => res(), { once: true })
        }))),
      )
      medir()
    })()

    return () => { cancel = true }
  }, [itens, cabH, cabCont, rodH])

  const bg = (): React.CSSProperties =>
    letterhead
      ? { position: 'absolute', inset: 0, backgroundImage: `url(${letterhead})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat', backgroundPosition: 'top center', opacity: opac }
      : {}

  // Passe de medição (fora da tela; não sai no PDF).
  if (!paginas) {
    return (
      <div ref={medRef} aria-hidden className="no-print caderno-medindo" style={{ position: 'absolute', left: -99999, top: 0, width: CONT_W, display: 'flex', flexDirection: 'column' }}>
        {itens.map((it, i) => (
          <div key={it.key} style={{ marginTop: i === 0 ? 0 : (it.gapTop || 0) }}>{it.node}</div>
        ))}
      </div>
    )
  }

  return (
    <>
      {paginas.map((grupo, pi) => (
        <div key={pi} className="folha folha-cont" style={{ position: 'relative', background: fundo }}>
          {letterhead && <div style={bg()} />}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', paddingTop: pi === 0 ? cabH : cabCont, paddingBottom: rodH, paddingLeft: PAD_H, paddingRight: PAD_H }}>
            {grupo.map((idx, gi) => (
              <div key={itens[idx].key} style={{ marginTop: gi === 0 ? 0 : (itens[idx].gapTop || 0) }}>{itens[idx].node}</div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
