'use client'

// CAPA EM LOTE (base): escolhe UMA imagem e aplica aos módulos marcados — e, opcionalmente, a todos os submódulos dentro deles.
// (A capa por segmento continua no modal de Segmentos.) Aulas/conteúdos não têm capa própria.

import { useState } from 'react'
import { Check, Loader2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { confirmar } from '@/components/ui/confirm-dialog'
import { aplicarCapaEmLoteAction } from '../actions'

export function CapaLoteDialog({ produtoId, moduloIds, temSubmodulos, onClose, onPronto }: {
  produtoId: string; moduloIds: string[]; temSubmodulos: boolean; onClose: () => void; onPronto: () => void
}) {
  const [imagem, setImagem] = useState('')
  const [ocultar, setOcultar] = useState(true)
  const [incluir, setIncluir] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const n = moduloIds.length
  async function aplicar() {
    if (!imagem) { toast.error('Envie a imagem da capa.'); return }
    if (!(await confirmar({ titulo: 'Aplicar capa em lote', mensagem: `Trocar a capa de ${n} módulo${n === 1 ? '' : 's'}${incluir ? ' e de todos os submódulos dentro deles' : ''}. A capa atual será substituída.`, confirmar: 'Aplicar' }))) return
    setOcupado(true)
    const r = await aplicarCapaEmLoteAction(produtoId, moduloIds, { imagem_url: imagem, ocultar_titulo: ocultar, incluirSubmodulos: incluir })
    setOcupado(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success(`Capa aplicada em ${(r as { total: number }).total} módulo(s)/submódulo(s).`); onPronto(); onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-xl">
        <DialogTitle>Aplicar capa em lote</DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">{n} módulo{n === 1 ? '' : 's'} selecionado{n === 1 ? '' : 's'}.</p>
        <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div><div className="mb-1.5 text-sm font-medium">Imagem da capa</div><CampoImagem value={imagem || null} onChange={setImagem} aspecto="2 / 3" compacto textoVazio="Enviar capa" rotulo="Vertical · 2:3" /></div>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={ocultar} onChange={(e) => setOcultar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" /><span><span className="font-medium">Ocultar o título sobre a imagem</span><span className="block text-xs text-muted-foreground">Use quando a imagem já traz o texto.</span></span></label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" /><span><span className="flex items-center gap-1.5 font-medium"><Layers className="h-3.5 w-3.5" />Incluir os submódulos dentro deles</span><span className="block text-xs text-muted-foreground">{temSubmodulos ? 'A mesma capa vai para todos os submódulos (qualquer nível).' : 'Os selecionados não parecem ter submódulos — a opção só vale se houver.'}</span></span></label>
            <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">As aulas (conteúdos) não têm capa própria: o aluno vê a capa do módulo ou submódulo onde elas estão. Capas por grupo ficam em <b>Segmento › Capa</b>.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Button><Button onClick={aplicar} disabled={ocupado || !imagem}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aplicar capa</Button></div>
      </DialogContent>
    </Dialog>
  )
}
