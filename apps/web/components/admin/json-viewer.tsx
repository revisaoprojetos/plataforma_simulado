'use client'

import { type ReactNode } from 'react'
import { Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Visualizador de JSON aninhado (chaves azuis, valores coloridos, copiar/clicar por folha).
 * `onPick` opcional: se dado, clicar numa folha chama onPick(path); senão copia o caminho.
 */
export function JsonViewer({ data, onPick }: { data: unknown; onPick?: (path: string) => void }) {
  const pick = onPick ?? ((p: string) => { navigator.clipboard?.writeText(p); toast.message(`Copiado: ${p}`) })
  const ind = (d: number) => ({ paddingLeft: 4 + d * 14 })
  const corVal = (v: unknown) =>
    typeof v === 'string' ? 'text-amber-600 dark:text-amber-400'
      : typeof v === 'number' ? 'text-violet-600 dark:text-violet-400'
      : typeof v === 'boolean' ? 'text-rose-600 dark:text-rose-400'
      : 'text-muted-foreground'
  const linhas: ReactNode[] = []

  const walk = (val: any, path: string, key: string | null, depth: number, ultimo: boolean) => {
    const virg = ultimo ? '' : ','
    const rotulo = key != null ? <span className="text-sky-600 dark:text-sky-400">{key}: </span> : null
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const ents = Object.entries(val)
      linhas.push(<div style={ind(depth)}>{rotulo}{'{'}</div>)
      ents.forEach(([k, v], i) => walk(v, path ? `${path}.${k}` : k, k, depth + 1, i === ents.length - 1))
      linhas.push(<div style={ind(depth)}>{'}'}{virg}</div>)
      return
    }
    if (Array.isArray(val)) {
      linhas.push(<div style={ind(depth)}>{rotulo}{'['}</div>)
      val.forEach((v, i) => walk(v, `${path}[${i}]`, null, depth + 1, i === val.length - 1))
      linhas.push(<div style={ind(depth)}>{']'}{virg}</div>)
      return
    }
    linhas.push(
      <div style={ind(depth)} className="group flex cursor-pointer items-center gap-1.5 rounded hover:bg-primary/10" onClick={() => pick(path)} title={`Usar: ${path}`}>
        {key != null && <span className="shrink-0 text-sky-600 dark:text-sky-400">{key}:</span>}
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary" />
        <span className={cn('truncate', corVal(val))}>{typeof val === 'string' ? `"${val}"` : String(val)}{virg}</span>
      </div>,
    )
  }
  walk(data, '', null, 0, true)
  return <div className="font-mono text-[11px] leading-relaxed">{linhas.map((l, i) => <div key={i}>{l}</div>)}</div>
}
