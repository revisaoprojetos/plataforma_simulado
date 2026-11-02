'use client'

/**
 * "Aulas vinculadas" (AulasVinculadas.png) — PORTE FIEL: onde um DOCUMENTO da Biblioteca é usado.
 * Card do documento + busca + "Vincular a outra aula" + lista (rótulo + chip do alvo + remover) +
 * "Mostrando X de Y aulas" + rodapé Cancelar/Fechar. Extra honesto: quando há vínculos "fixada" presos
 * a uma versão antiga, um aviso oferece reapontá-los à versão atual (capacidade real do backend).
 *
 * Reusa os vínculos de produção (lib/conteudo/vinculos via wrappers em ./biblioteca/actions).
 * "Aula" não é entidade real — um vínculo aponta para um produto/simulado/pasta; o rótulo é resolvido
 * best-effort no servidor. Cores via token; pt-BR.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, FileText, X, RefreshCw, Search, Link2, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  listarVinculosDocumento, removerVinculoDocumento, reapontarVinculosFixados,
} from '@/app/admin/conteudos/materiais/biblioteca/actions'
import type { VinculoCliente } from '@/app/admin/conteudos/materiais/biblioteca/tipos'

const rotuloTipoVinculo = (t: string) => (t === 'produto' ? 'produto' : t === 'simulado' ? 'simulado' : t === 'pasta' ? 'pasta' : t)

export function AulasVinculadasModal({
  open, onClose, documentoId, titulo, subtitulo,
}: {
  open: boolean
  onClose: () => void
  documentoId: string
  titulo: string
  subtitulo?: string
}) {
  const [vinculos, setVinculos] = useState<VinculoCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [busca, setBusca] = useState('')

  async function recarregar() {
    setCarregando(true)
    try {
      const r = await listarVinculosDocumento(documentoId)
      if (!r.ok) { toast.error(r.error || 'Falha ao carregar os vínculos.'); setVinculos([]); return }
      setVinculos(r.vinculos)
    } finally { setCarregando(false) }
  }

  useEffect(() => { if (open) { setBusca(''); recarregar() } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, documentoId])

  const fixadas = vinculos.filter((v) => v.modo === 'fixada').length
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? vinculos.filter((v) => v.rotulo.toLowerCase().includes(q) || v.produto_tipo.toLowerCase().includes(q)) : vinculos
  }, [vinculos, busca])

  async function remover(v: VinculoCliente) {
    if (!(await confirmar({ titulo: 'Remover vínculo', mensagem: `Remover "${v.rotulo}" deste documento?`, confirmar: 'Remover', destrutivo: true }))) return
    setOcupado(true)
    try {
      const r = await removerVinculoDocumento(v.id, documentoId)
      if (!r.ok) { toast.error(r.error || 'Falha ao remover.'); return }
      toast.success('Vínculo removido.')
      setVinculos((prev) => prev.filter((x) => x.id !== v.id))
    } finally { setOcupado(false) }
  }
  async function reapontar() {
    setOcupado(true)
    try {
      const r = await reapontarVinculosFixados(documentoId)
      if (!r.ok) { toast.error(r.error || 'Falha ao reapontar.'); return }
      toast.success(r.atualizados ? `${r.atualizados} vínculo(s) fixado(s) reapontado(s) à versão atual.` : 'Nenhum vínculo fixado para reapontar.')
      await recarregar()
    } finally { setOcupado(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[85vh] w-[min(680px,calc(100vw-2rem))] max-w-[min(680px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pt-5">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">Biblioteca › {titulo}</p>
          <DialogTitle className="mt-1">Aulas vinculadas · {vinculos.length}</DialogTitle>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Todas as aulas que usam este documento. Trocar o arquivo troca em todas.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Card do documento */}
          <div className="mb-4 flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{titulo}</div>
              <div className="truncate text-xs text-muted-foreground">{subtitulo ?? 'Documento'}</div>
            </div>
          </div>

          {/* Busca + vincular a outra aula */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aula ou produto"
                className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </div>
            <button
              onClick={() => toast.message('Para vincular, abra o produto/aula e escolha este documento no seletor de arquivo (liga, não copia).')}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Link2 className="h-4 w-4" />Vincular a outra aula
            </button>
          </div>

          {/* Aviso: fixados presos a versão antiga */}
          {!carregando && fixadas > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-primary/5 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-foreground"><Info className="h-4 w-4 shrink-0 text-primary" />{fixadas} vínculo(s) “fixada” presos a uma versão antiga.</span>
              <button onClick={reapontar} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" />Reapontar à versão atual
              </button>
            </div>
          )}

          {carregando ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : filtradas.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
              {vinculos.length === 0 ? 'Este documento ainda não está vinculado a nenhum produto/aula.' : 'Nenhum vínculo para esta busca.'}
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {filtradas.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{v.rotulo}</div>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    v.modo === 'fixada' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400' : 'bg-primary/10 text-primary',
                  )}>
                    {rotuloTipoVinculo(v.produto_tipo)}{v.modo === 'fixada' ? ' · fixada' : ''}
                  </span>
                  <button type="button" onClick={() => remover(v)} disabled={ocupado} aria-label="Remover vínculo"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!carregando && <p className="mt-3 text-xs text-muted-foreground">Mostrando {filtradas.length} de {vinculos.length} {vinculos.length === 1 ? 'aula' : 'aulas'}.</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110">Fechar</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
