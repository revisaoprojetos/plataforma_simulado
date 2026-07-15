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
    const filhos = Array.from(cont.children) as HTMLElement[]
    const n = filhos.length
    const contH = cont.getBoundingClientRect().height
    // Altura ocupada por cada item via offsetTop — inclui as margens próprias dos blocos
    // (mesmo espaçamento do editor), sem gap artificial.
    const tops = filhos.map((f) => f.offsetTop)
    const alturas = filhos.map((_, i) => (i < n - 1 ? tops[i + 1] : contH) - tops[i])
    const grupos: number[][] = []
    let atual: number[] = []
    let h = 0
    alturas.forEach((alt, i) => {
      // Área segura da página atual: 1ª usa cabH; continuações usam cabCont.
      const safe = PAGE_H - (grupos.length === 0 ? cabH : cabCont) - rodH
      if (atual.length && h + alt > safe) {
        grupos.push(atual)
        atual = []
        h = 0
      }
      atual.push(i)
      h += alt
    })
    if (atual.length) grupos.push(atual)
    setPaginas(grupos.length ? grupos : [[...itens.keys()]])
  }, [itens, cabH, cabCont, rodH])

  const bg = (): React.CSSProperties =>
    letterhead
      ? { position: 'absolute', inset: 0, backgroundImage: `url(${letterhead})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat', backgroundPosition: 'top center', opacity: opac }
      : {}

  // Passe de medição (fora da tela; não sai no PDF).
  if (!paginas) {
    return (
      <div ref={medRef} aria-hidden className="no-print" style={{ position: 'absolute', left: -99999, top: 0, width: CONT_W, display: 'flex', flexDirection: 'column' }}>
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
