'use client'

// AJUDA ("?"): legenda dos tipos de nó + atalhos e gestos do construtor.
import { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TipoNo } from '@/lib/admin/fluxo/adaptador'
import { ESTILO_NO, ROTULO_NO } from './estilo-no'

export const ATALHOS_FLUXO: ReadonlyArray<[string, string]> = [
  ['Arrastar o fundo / rolar', 'Mover a visão / zoom'],
  ['Clique no nó', 'Ver propriedades (lápis = valor editável)'],
  ['Construir: arrastar o nó', 'Mover (qualquer nó, base ou novo)'],
  ['Construir: arrastar de uma alça', 'Conectar a outro nó (alças aparecem nos nós)'],
  ['Construir: duplo clique', 'Editar o título do nó'],
  ['Construir: botão direito', 'Menu: editar, duplicar, conectar, ocultar/excluir'],
  ['Delete / Backspace', 'Excluir (nó seu) ou ocultar (nó base) o selecionado'],
  ['Shift + arrastar', 'Selecionar vários nós'],
  ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
  ['Ctrl+D', 'Duplicar o nó selecionado'],
  ['Esc', 'Cancelar menu/conexão e limpar seleção'],
]

export function AjudaFluxo({ tipos }: { tipos: readonly TipoNo[] }) {
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    if (!aberto) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [aberto])
  return (
    <div className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label="Ajuda e atalhos" title="Ajuda e atalhos" className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-muted', aberto && 'border-primary')}>
        <HelpCircle className="h-4 w-4" />
      </button>
      {aberto && (
        <div className="absolute right-0 top-9 z-40 w-[22rem] max-w-[90vw] space-y-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg" role="dialog" aria-label="Ajuda do fluxo">
          <div className="flex flex-wrap gap-1.5">{tipos.map((t) => <span key={t} className={cn('rounded-md border-2 px-2 py-0.5 text-[11px] font-medium', ESTILO_NO[t])}>{ROTULO_NO[t]}</span>)}</div>
          <p className="text-[11px] text-muted-foreground">“inferido” = deduzido das regras e do mapa. Borda tracejada / ícone de pessoa = criado por você.</p>
          <dl className="space-y-1.5 text-xs">
            {ATALHOS_FLUXO.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-40 shrink-0 font-semibold">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>)}
          </dl>
        </div>
      )}
    </div>
  )
}
