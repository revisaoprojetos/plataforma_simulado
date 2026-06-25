'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GitCompare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  raw?: Record<string, unknown>
}

export function AuditoriaDiff({ antes, depois, raw }: Props) {
  const [open, setOpen] = useState(false)

  const allKeys = new Set([
    ...Object.keys(antes ?? {}),
    ...Object.keys(depois ?? {}),
  ])

  const changedKeys = [...allKeys].filter(
    (k) => JSON.stringify((antes ?? {})[k]) !== JSON.stringify((depois ?? {})[k]),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Ver diff" />}>
        <GitCompare className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diff — antes × depois</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {changedKeys.length === 0 && (
            <p className="text-muted-foreground">Sem alterações de campos detectadas.</p>
          )}
          {changedKeys.map((key) => {
            const prev = (antes ?? {})[key]
            const next = (depois ?? {})[key]
            return (
              <div key={key} className="rounded border overflow-hidden">
                <div className="px-3 py-1 bg-muted text-xs font-mono font-semibold">{key}</div>
                <div className="grid grid-cols-2">
                  <div className={cn('px-3 py-2 font-mono text-xs border-r', antes ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/20')}>
                    <span className="text-red-500 mr-1">−</span>
                    {antes ? renderValue(prev) : <span className="text-muted-foreground italic">n/a</span>}
                  </div>
                  <div className={cn('px-3 py-2 font-mono text-xs', depois ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/20')}>
                    <span className="text-green-500 mr-1">+</span>
                    {depois ? renderValue(next) : <span className="text-muted-foreground italic">n/a</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {!antes && !depois && raw && (
            <div className="rounded border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Detalhes:</p>
              <pre className="text-xs font-mono overflow-auto">{JSON.stringify(raw, null, 2)}</pre>
            </div>
          )}
          {!antes && depois && (
            <div className="rounded border p-3 bg-green-50 dark:bg-green-950/20">
              <p className="text-xs text-muted-foreground mb-2">Dados inseridos:</p>
              <pre className="text-xs font-mono overflow-auto">{JSON.stringify(depois, null, 2)}</pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function renderValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-muted-foreground italic">null</span>
  if (typeof val === 'object') return <pre className="inline">{JSON.stringify(val)}</pre>
  return String(val)
}
