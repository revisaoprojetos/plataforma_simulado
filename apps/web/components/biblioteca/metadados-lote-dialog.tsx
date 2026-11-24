'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CAMPOS_META } from '@/lib/conteudo/metadados'

/** Edição EM MASSA dos metadados dos conteúdos selecionados (rota nova /api/admin/revisao/biblioteca/lote). */
export function MetadadosLoteDialog({ n, ids, onClose, onSalvo }: { n: number; ids: string[]; onClose: () => void; onSalvo: () => void }) {
  const [v, setV] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/admin/revisao/biblioteca/lote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'metadados', ids, valores: v }) })
      const j = await r.json().catch(() => null)
      if (!j?.ok) { toast.error(j?.error || 'Não foi possível salvar.'); return }
      toast.success(`Metadados atualizados em ${j.atualizados} ${j.atualizados === 1 ? 'conteúdo' : 'conteúdos'}.`); onSalvo()
    } catch { toast.error('Falha de rede ao salvar.') } finally { setSalvando(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar metadados de {n} {n === 1 ? 'conteúdo' : 'conteúdos'}</DialogTitle>
          <DialogDescription>Campo vazio mantém o valor atual; escreva <code className="rounded bg-muted px-1">-</code> para apagar o valor nos selecionados.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS_META.map((c) => (
            <label key={c.k} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{c.rot}
              <input value={v[c.k] ?? ''} onChange={(e) => setV((s) => ({ ...s, [c.k]: e.target.value }))} placeholder={c.dica} className="h-9 rounded-lg border bg-background px-2 text-sm font-normal text-foreground" />
            </label>
          ))}
        </div>
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !Object.values(v).some((x) => x.trim())}>{salvando && <Loader2 className="animate-spin" />}Aplicar a {n}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
