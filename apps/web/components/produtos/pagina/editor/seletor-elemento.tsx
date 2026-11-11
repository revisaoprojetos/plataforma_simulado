'use client'

// Seletor de elemento (abre no "+" entre blocos e no estado vazio). Usa só o catálogo — independe da paleta lateral.
import { icons, Box } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CATALOGO, TIPOS_ELEMENTO } from '@/lib/produtos/pagina/catalogo'
import type { TipoElemento } from '@/lib/produtos/pagina/tipos'
import { useEditor } from './store'

export function IconeElemento({ nome, className }: { nome: string; className?: string }) {
  const I = nome !== 'Sparkles' ? (icons as Record<string, typeof Box>)[nome] ?? Box : Box
  return <I className={className} />
}

export function SeletorElemento({ aberto, onFechar, onEscolher }: { aberto: boolean; onFechar(): void; onEscolher(tipo: TipoElemento): void }) {
  const { blocos, dadosAmostra } = useEditor()
  const ctx = { blocos, temInstrutores: dadosAmostra.instrutores.length > 0 }
  const tipos = TIPOS_ELEMENTO.filter((t) => CATALOGO[t].podeAdicionar(ctx))
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar elemento</DialogTitle>
          <DialogDescription>Escolha o que inserir neste ponto da página.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tipos.map((t) => (
            <button key={t} type="button" onClick={() => onEscolher(t)}
              className="flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-muted">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><IconeElemento nome={CATALOGO[t].icone} className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-sm font-medium">{CATALOGO[t].rotulo}</span><span className="line-clamp-2 text-xs text-muted-foreground">{CATALOGO[t].descricao}</span></span>
            </button>
          ))}
          {tipos.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Todos os elementos únicos já estão na página.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
