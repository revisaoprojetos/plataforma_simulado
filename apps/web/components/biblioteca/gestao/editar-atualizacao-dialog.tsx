'use client'

// Edição de um ponto de versão já registrado (rótulo, tipo, data/hora, resumo, itens, visibilidade).
// Publicar/ocultar/excluir ficam nas ações da lista (alterarEstadoPontoAction / excluirPontoAction).

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { TIPOS_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { separarDataHoraBrt, type LinhaAtualizacao, type TipoAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'
import { CamposQuando, type ExibicaoState } from './atualizacao-exibicao'
import { editarPontoVersaoAction } from '@/app/admin/conteudos/atualizacoes-actions'

type Item = { texto: string; local: string }

export function EditarAtualizacaoDialog({ registro, onClose, onDone }: { registro: LinhaAtualizacao | null; onClose: () => void; onDone: () => void }) {
  const [rotulo, setRotulo] = useState('')
  const [tipo, setTipo] = useState<TipoAtualizacao>('legislacao')
  const [quando, setQuando] = useState<ExibicaoState>({ data: '', hora: '', exibirData: true, exibirHora: true, exibirRotulo: true })
  const [resumo, setResumo] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [visivel, setVisivel] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!registro) return
    setRotulo(registro.rotulo ?? ''); setTipo(registro.tipo); setQuando({ ...separarDataHoraBrt(registro.ocorridaEm), exibirData: registro.exibirData, exibirHora: registro.exibirHora, exibirRotulo: registro.exibirRotulo }); setResumo(registro.texto)
    setItens(registro.itens.length ? registro.itens.map((i) => ({ texto: i.texto, local: i.local ?? '' })) : [{ texto: '', local: '' }])
    setVisivel(registro.visivelAluno); setSalvando(false)
  }, [registro])

  async function salvar() {
    if (!registro) return
    setSalvando(true)
    const r = await editarPontoVersaoAction({
      id: registro.id, rotulo, tipo, resumo, data: quando.data || null, hora: quando.hora || null, exibirData: quando.exibirData, exibirHora: quando.exibirHora, exibirRotulo: quando.exibirRotulo, visivelAluno: visivel,
      itens: itens.filter((i) => i.texto.trim()).map((i) => ({ texto: i.texto.trim(), local: i.local.trim() || null })),
    }).catch(() => ({ ok: false as const, error: 'Falha de rede ao salvar.' }))
    setSalvando(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Atualização salva.')
    onClose(); onDone()
  }

  return (
    <Dialog open={!!registro} onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="w-[min(680px,calc(100vw-2rem))] max-w-[min(680px,calc(100vw-2rem))] sm:max-w-[min(680px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Editar atualização</DialogTitle>
          <DialogDescription className="truncate">{registro?.material}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 max-h-[60vh] space-y-4 overflow-y-auto px-1">
          <label className="block space-y-1.5 text-sm"><span className="font-medium">Rótulo da versão</span>
            <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={120} placeholder="Ex.: v2.1" /></label>
          <CamposQuando v={quando} onChange={(p) => setQuando((q) => ({ ...q, ...p }))} rotulo={rotulo} tipo={tipo} texto={resumo || itens.find((i) => i.texto.trim())?.texto || ''} disponivel={registro?.exibicaoDisponivel ?? false} />
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_ATUALIZACAO.map((t) => (
              <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', tipo === t.id ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted')}>{t.nome}</button>
            ))}
          </div>
          <label className="block space-y-1.5 text-sm"><span className="font-medium">Resumo</span>
            <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} maxLength={2000} rows={2} /></label>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">O que mudou</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setItens((l) => [...l, { texto: '', local: '' }])} disabled={itens.length >= 50}><Plus className="h-3.5 w-3.5" />Adicionar item</Button>
            </div>
            {itens.map((it, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input value={it.texto} onChange={(e) => setItens((l) => l.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)))} maxLength={500} className="min-w-0 flex-1" />
                <Input value={it.local} onChange={(e) => setItens((l) => l.map((x, k) => (k === i ? { ...x, local: e.target.value } : x)))} maxLength={120} placeholder="Onde (opcional)" className="w-40 shrink-0" />
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover item" onClick={() => setItens((l) => (l.length > 1 ? l.filter((_, k) => k !== i) : [{ texto: '', local: '' }]))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <button type="button" role="checkbox" aria-checked={visivel} onClick={() => setVisivel((v) => !v)} className="flex items-start gap-2.5 text-left text-sm">
            <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]', visivel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{visivel ? '✓' : ''}</span>
            <span><span className="block font-medium">Visível ao aluno</span><span className="block text-xs text-muted-foreground">Desmarcado, o registro fica oculto para o aluno (continua aqui).</span></span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
