'use client'

// Miniaturas ESQUEMÁTICAS das variações de cada elemento (SVG 100x40, só classes de token — nenhuma cor literal).
import type { TipoElemento } from '@/lib/produtos/pagina/tipos'

// [x, y, w, h, tom]  tom: m = neutro, p = principal, o = contorno, s = suave
type R = [number, number, number, number, 'm' | 'p' | 'o' | 's']
const linhas = (n: number, x = 8, y = 8, w = 84, gap = 7): R[] => Array.from({ length: n }, (_, i) => [x, y + i * gap, i === n - 1 ? w * 0.6 : w, 3, 'm'])
const grade = (c: number, l: number, w: number, h: number, tom: R[4] = 's'): R[] => {
  const gx = 4, gy = 4, tw = (92 - gx * (c - 1)) / c, th = (32 - gy * (l - 1)) / l
  void w; void h
  return Array.from({ length: c * l }, (_, i) => [4 + (i % c) * (tw + gx), 4 + Math.floor(i / c) * (th + gy), tw, th, tom])
}

const ESQUEMAS: Partial<Record<TipoElemento, Record<string, R[]>>> = {
  hero: {
    banner: [[0, 0, 100, 40, 'p'], [8, 12, 40, 5, 's'], [8, 22, 60, 3, 's']],
    simples: [[0, 0, 100, 40, 'p'], [30, 14, 40, 5, 's']],
    imagem: [[0, 0, 100, 40, 'm'], [10, 28, 50, 4, 's'], [70, 8, 20, 14, 's']],
  },
  avisos: { cards: [[4, 6, 44, 28, 'o'], [52, 6, 44, 28, 'o'], [10, 12, 24, 3, 'm'], [58, 12, 24, 3, 'm']], faixa: [[4, 14, 92, 12, 's'], [10, 19, 50, 3, 'm']] },
  progresso: { padrao: [[4, 8, 92, 24, 'o'], [10, 22, 80, 4, 'm'], [10, 22, 48, 4, 'p']] },
  continuar: { card: [[4, 6, 92, 28, 'o'], [10, 12, 40, 3, 'm'], [10, 20, 80, 4, 'm'], [10, 20, 40, 4, 'p']] },
  modulos: {
    herdar: [[6, 6, 88, 28, 'o']],
    grade: grade(3, 2, 0, 0),
    carrossel: [[2, 8, 26, 24, 's'], [32, 8, 26, 24, 's'], [62, 8, 26, 24, 's'], [92, 16, 6, 8, 'm']],
    lista: [[4, 4, 92, 7, 's'], [4, 14, 92, 7, 's'], [4, 24, 92, 7, 's']],
    trilha: [[10, 18, 80, 2, 'm'], [8, 14, 8, 8, 'p'], [46, 14, 8, 8, 'p'], [84, 14, 8, 8, 'p']],
    trilha_imagem: [[10, 22, 80, 2, 'm'], [6, 4, 20, 14, 's'], [40, 4, 20, 14, 's'], [74, 4, 20, 14, 's'], [12, 19, 8, 8, 'p'], [46, 19, 8, 8, 'p'], [80, 19, 8, 8, 'p']],
    poster: [[4, 3, 20, 34, 's'], [28, 3, 20, 34, 's'], [52, 3, 20, 34, 's'], [76, 3, 20, 34, 's']],
  },
  cronograma: {
    card: [[28, 4, 44, 32, 'o'], [34, 10, 30, 3, 'm'], [34, 18, 30, 3, 'm'], [34, 27, 20, 5, 'p']],
    faixa: [[4, 10, 92, 20, 'o'], [10, 17, 40, 3, 'm'], [76, 16, 14, 6, 'p']],
    lista: [[4, 4, 92, 7, 's'], [4, 14, 92, 7, 's'], [4, 24, 92, 7, 's']],
    semana: Array.from({ length: 7 }, (_, i): R => [5 + i * 13, 10, 10, 20, i === 2 ? 'p' : 's']),
  },
  carrossel: {
    vertical_small: [[3, 6, 20, 28, 's'], [27, 6, 20, 28, 's'], [51, 6, 20, 28, 's'], [75, 6, 20, 28, 's']],
    vertical_large: [[6, 3, 40, 34, 's'], [54, 3, 40, 34, 's']],
    horizontal_small: [[3, 8, 30, 14, 's'], [35, 8, 30, 14, 's'], [67, 8, 30, 14, 's'], [3, 26, 30, 3, 'm']],
    horizontal_large: [[4, 5, 44, 28, 's'], [52, 5, 44, 28, 's']],
    destaque: [[4, 3, 92, 34, 's'], [10, 26, 40, 4, 'p']],
  },
  banner: { cheio: [[0, 6, 100, 28, 's']], cartao: [[6, 6, 88, 28, 'o'], [10, 10, 80, 20, 's']] },
  texto: {
    simples: [[8, 6, 40, 5, 'p'], ...linhas(3, 8, 16, 84, 7)],
    destaque: [[4, 4, 92, 32, 's'], [10, 9, 36, 4, 'p'], ...linhas(2, 10, 19, 80, 7)],
  },
  botao: {
    solido: [[30, 12, 40, 16, 'p']],
    contorno: [[30, 12, 40, 16, 'o']],
    link: [[34, 18, 32, 3, 'm'], [34, 24, 32, 1.5, 'p']],
  },
  divisor: { linha: [[6, 19, 88, 2, 'm']], espaco: [[6, 10, 88, 20, 'o']], titulo: [[4, 19, 30, 2, 'm'], [40, 16, 20, 8, 'p'], [66, 19, 30, 2, 'm']] },
  instrutores: {
    cards: [[8, 6, 24, 28, 'o'], [38, 6, 24, 28, 'o'], [68, 6, 24, 28, 'o'], [14, 9, 12, 12, 'm'], [44, 9, 12, 12, 'm'], [74, 9, 12, 12, 'm']],
    lista: [[6, 5, 10, 10, 'm'], [20, 8, 50, 3, 'm'], [6, 21, 10, 10, 'm'], [20, 24, 50, 3, 'm']],
  },
}

const CLASSE: Record<R[4], string> = {
  m: 'fill-muted-foreground/35', s: 'fill-muted-foreground/15', p: 'fill-primary/70', o: 'fill-card stroke-border',
}

export function Miniatura({ tipo, variacao, className }: { tipo: TipoElemento; variacao: string; className?: string }) {
  const rects = ESQUEMAS[tipo]?.[variacao] ?? ESQUEMAS[tipo]?.[Object.keys(ESQUEMAS[tipo] ?? {})[0]] ?? []
  return (
    <svg viewBox="0 0 100 40" className={className ?? 'h-10 w-full'} aria-hidden>
      {rects.map(([x, y, w, h, t], i) => <rect key={i} x={x} y={y} width={w} height={h} rx={Math.min(2.5, h / 2)} className={CLASSE[t]} strokeWidth={t === 'o' ? 0.8 : 0} />)}
    </svg>
  )
}
