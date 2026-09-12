'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Nó já normalizado para o render (id/label/nível + filhos). */
export type NoIndiceView = { id: string; label: string; nivel: number; filhos: NoIndiceView[] }

/**
 * Índice em ÁRVORE recolhível — usado no leitor do aluno E na prévia do admin (mesma UX). Qualquer nó
 * com filhos mostra a seta e recolhe/expande (animado por grid-rows). Aberto por padrão; o estado de
 * recolhidos fica com o componente pai. `cor` (opcional) aplica o tema do leitor; sem ela usa tokens.
 */
export function IndiceArvore({ nodes, estaAberto, onToggle, onPular, cor, base = 0 }: {
  nodes: NoIndiceView[]
  estaAberto: (id: string) => boolean
  onToggle: (id: string) => void
  onPular: (id: string) => void
  cor?: { fg: string; muted: string }
  base?: number
}) {
  return (
    <>
      {nodes.map((n, i) => {
        const tem = n.filhos.length > 0
        const aberto = estaAberto(n.id)
        const pl = 8 + base * 12
        return (
          <div key={`${n.id}-${i}`}>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => onPular(n.id)} title={n.label}
                className={cn('min-w-0 flex-1 truncate rounded py-1 pr-1 text-left text-xs transition-colors', cor ? 'hover:bg-black/5' : 'text-foreground hover:bg-muted')}
                style={{ paddingLeft: pl, fontWeight: base === 0 ? 600 : 500, color: cor?.fg }}>
                {n.label}
              </button>
              {tem && (
                <button type="button" onClick={() => onToggle(n.id)} aria-label={aberto ? 'Recolher' : 'Expandir'} aria-expanded={aberto}
                  className={cn('shrink-0 rounded p-1 transition-colors', cor ? 'hover:bg-black/5' : 'text-muted-foreground hover:bg-muted')} style={{ color: cor?.muted }}>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-300 ease-out" style={{ transform: aberto ? 'rotate(180deg)' : 'none' }} />
                </button>
              )}
            </div>
            {tem && (
              <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }}>
                <div className="min-h-0 overflow-hidden">
                  <IndiceArvore nodes={n.filhos} estaAberto={estaAberto} onToggle={onToggle} onPular={onPular} cor={cor} base={base + 1} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
