'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { ArestaFluxo, DiagramaFluxo, NoFluxo } from '@/lib/admin/fluxo/adaptador'
import { ESTILO_NO, GEO } from './estilo-no'

const { W, H, COLW, ROWH, PAD } = GEO
const pos = (n: NoFluxo) => (n.x != null && n.y != null ? { x: n.x, y: n.y } : { x: PAD + n.col * COLW, y: PAD + n.row * ROWH })

function caminhoAresta(a: NoFluxo, b: NoFluxo): { d: string; lx: number; ly: number } {
  const pa = pos(a), pb = pos(b)
  if (pos(b).x >= pos(a).x + W * 0.9) {
    const x1 = pa.x + W, y1 = pa.y + H / 2, x2 = pb.x, y2 = pb.y + H / 2, m = (x1 + x2) / 2
    return { d: `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`, lx: m, ly: (y1 + y2) / 2 }
  }
  const baixo = pos(b).y >= pos(a).y
  const x1 = pa.x + W / 2, y1 = baixo ? pa.y + H : pa.y, x2 = pb.x + W / 2, y2 = baixo ? pb.y : pb.y + H, m = (y1 + y2) / 2
  return { d: `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: m }
}

/** Visualização SVG simples (FALLBACK quando o canvas React Flow falha). Mesmo contrato do canvas: seleção + caminho destacado. */
export function QuadroSvg({ d, sel, onSel, marcados }: { d: DiagramaFluxo; sel: string | null; onSel: (id: string) => void; marcados: ReadonlySet<string> }) {
  const porId = useMemo(() => new Map(d.nos.map((n) => [n.id, n])), [d])
  const largura = Math.max(...d.nos.map((n) => pos(n).x + W), W) + PAD
  const altura = Math.max(...d.nos.map((n) => pos(n).y + H), H) + PAD
  const temCaminho = marcados.size > 0
  return (
    <div className="w-full overflow-auto rounded-xl border bg-muted/20 p-2">
      <div className="relative" style={{ width: largura, height: altura }}>
        <svg className="absolute inset-0" width={largura} height={altura} aria-hidden>
          <defs><marker id={`seta-${d.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker></defs>
          {d.arestas.map((e: ArestaFluxo, k) => {
            const a = porId.get(e.de), b = porId.get(e.para)
            if (!a || !b) return null
            const c = caminhoAresta(a, b), forte = marcados.has(e.de) && marcados.has(e.para)
            return (
              <g key={k} className={cn(forte ? 'text-primary' : 'text-muted-foreground/60', temCaminho && !forte && 'opacity-40')}>
                <path d={c.d} fill="none" stroke="currentColor" strokeWidth={forte ? 2.5 : 1.5} markerEnd={`url(#seta-${d.id})`} />
                {e.rotulo && <text x={c.lx} y={c.ly - 4} textAnchor="middle" className="fill-current text-[10px] font-medium">{e.rotulo}</text>}
              </g>
            )
          })}
        </svg>
        {d.nos.map((n) => {
          const p = pos(n), ativo = sel === n.id, forte = marcados.has(n.id)
          return (
            <button key={n.id} type="button" onClick={() => onSel(n.id)} aria-pressed={ativo} title={n.titulo}
              className={cn('absolute flex flex-col justify-center gap-0.5 border-2 px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:shadow-md', n.tipo === 'decisao' || n.tipo === 'condicao' ? 'rounded-3xl' : 'rounded-lg', ESTILO_NO[n.tipo],
                forte && 'ring-2 ring-primary ring-offset-2 ring-offset-background', temCaminho && !forte && 'opacity-60', ativo && 'outline outline-2 outline-offset-2 outline-foreground')}
              style={{ left: p.x, top: p.y, width: W, height: H }}>
              <span className="line-clamp-2 font-semibold leading-tight">{n.titulo}</span>
              {n.valor && <span className="line-clamp-2 text-[10px] leading-tight opacity-80">{n.valor}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
