'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Copy, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import {
  adicionarDisciplinaCronograma, alterarDisciplinaCronograma, carregarVersaoCronograma, excluirSprintCronograma,
  exportarConfigCronograma, importarConfigCronograma, removerDisciplinaCronograma, salvarSprintCronograma, salvarVersaoCronograma,
} from './actions'
import type { CampoDisc } from '@/lib/revisao/cronograma-schema'

// Peças interativas (client) das abas do Cronograma. A página (server) só LÊ e entrega os dados prontos.

function useAcao() {
  const router = useRouter()
  const [pend, start] = useTransition()
  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (r.ok) { toast.success(ok); router.refresh() } else toast.error(r.error ?? 'Falha ao salvar.')
    })
  return { pend, rodar }
}

export function SalvarVersaoBotao({ podeEditar }: { podeEditar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  if (!podeEditar) return null
  return (
    <Button disabled={pend} onClick={() => start(async () => {
      const r = await salvarVersaoCronograma()
      if (r.ok) { toast.success(`Versão ${r.numero} salva`); router.refresh() } else toast.error(r.error ?? 'Falha ao salvar a versão.')
    })}><Check className="h-4 w-4" />{pend ? 'Salvando…' : 'Salvar versão'}</Button>
  )
}

// ───────────── disciplinas ─────────────

export function DiscSwitch({ nome, campo, valor, podeEditar, desabilitado }: { nome: string; campo: CampoDisc; valor: boolean; podeEditar: boolean; desabilitado?: boolean }) {
  const { pend, rodar } = useAcao()
  return <Switch checked={valor} disabled={pend || !podeEditar || desabilitado} aria-label={`${campo} · ${nome}`}
    onCheckedChange={(c) => rodar(() => alterarDisciplinaCronograma(nome, campo, !!c), 'Disciplina atualizada')} />
}

export function AdicionarDisciplina() {
  const { pend, rodar } = useAcao()
  return (
    <Button variant="outline" size="sm" disabled={pend} onClick={async () => {
      const nome = await pedirTexto({ titulo: 'Adicionar disciplina', label: 'Nome da disciplina', placeholder: 'Ex.: Direito Tributário', confirmar: 'Adicionar' })
      if (nome?.trim()) rodar(() => adicionarDisciplinaCronograma(nome), 'Disciplina adicionada')
    }}><Plus className="h-4 w-4" />Adicionar disciplina</Button>
  )
}

export function RemoverDisciplina({ nome }: { nome: string }) {
  const { pend, rodar } = useAcao()
  return (
    <Button variant="ghost" size="sm" disabled={pend} aria-label="Remover disciplina" onClick={async () => {
      if (await confirmar({ titulo: 'Remover disciplina', mensagem: `Remover “${nome}” do cronograma?`, destrutivo: true })) rodar(() => removerDisciplinaCronograma(nome), 'Disciplina removida')
    }}><Trash2 className="h-4 w-4" /></Button>
  )
}

// ───────────── sprints ─────────────

export interface SprintForm { id?: string; nome: string; dias: number; metas: number; status: string; observacao: string | null }

export function SprintDialogo({ sprint, rotulo, podeEditar }: { sprint?: SprintForm; rotulo: string; podeEditar: boolean }) {
  const { pend, rodar } = useAcao()
  const [aberto, setAberto] = useState(false)
  const [f, setF] = useState<SprintForm>(sprint ?? { nome: '', dias: 5, metas: 0, status: 'rascunho', observacao: '' })
  if (!podeEditar) return null
  return (
    <>
      <Button variant={sprint ? 'outline' : 'default'} size="sm" onClick={() => { if (!sprint) setF({ nome: '', dias: 5, metas: 0, status: 'rascunho', observacao: '' }); setAberto(true) }}>
        {sprint ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{sprint ? 'Editar sprint' : 'Criar sprint'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1 text-sm"><span>Nome</span><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Sprint Final PGE" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm"><span>Dias</span><Input type="number" min={0} value={f.dias} onChange={(e) => setF({ ...f, dias: Number(e.target.value) })} /></label>
              <label className="block space-y-1 text-sm"><span>Metas</span><Input type="number" min={0} value={f.metas} onChange={(e) => setF({ ...f, metas: Number(e.target.value) })} /></label>
            </div>
            <label className="block space-y-1 text-sm"><span>Situação</span>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
                <option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="encerrado">Encerrado</option>
              </select></label>
            <label className="block space-y-1 text-sm"><span>Observação</span><Textarea rows={3} value={f.observacao ?? ''} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></label>
          </div>
          <DialogFooter className="-mx-4 -mb-4">
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={pend} onClick={() => rodar(async () => {
              const r = await salvarSprintCronograma({ id: sprint?.id ?? null, nome: f.nome, dias: f.dias, metas: f.metas, status: f.status, observacao: f.observacao ?? '' })
              if (r.ok) setAberto(false)
              return r
            }, sprint ? 'Sprint salvo' : 'Sprint criado como rascunho')}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ExcluirSprint({ id, nome, podeEditar }: { id: string; nome: string; podeEditar: boolean }) {
  const { pend, rodar } = useAcao()
  if (!podeEditar) return null
  return (
    <Button variant="ghost" size="sm" disabled={pend} aria-label="Excluir sprint" onClick={async () => {
      if (await confirmar({ titulo: 'Excluir sprint', mensagem: `Excluir o sprint “${nome}”?`, destrutivo: true })) rodar(() => excluirSprintCronograma(id), 'Sprint excluído')
    }}><Trash2 className="h-4 w-4" /></Button>
  )
}

// ───────────── versões e exportação ─────────────

export function CarregarVersao({ id, numero, podeEditar }: { id: string; numero: number; podeEditar: boolean }) {
  const { pend, rodar } = useAcao()
  if (!podeEditar) return null
  return (
    <Button variant="outline" size="sm" disabled={pend} onClick={async () => {
      if (await confirmar({ titulo: 'Carregar versão', mensagem: `Carregar a versão ${numero}? As regras e disciplinas atuais serão substituídas (a versão fica registrada na auditoria).` })) rodar(() => carregarVersaoCronograma(id), 'Versão carregada')
    }}>Carregar</Button>
  )
}

export function ConfigIO({ resumo, podeEditar }: { resumo: string; podeEditar: boolean }) {
  const { pend, rodar } = useAcao()
  const [texto, setTexto] = useState('')
  async function copiar() {
    const r = await exportarConfigCronograma()
    if (!r.ok || !r.json) { toast.error(r.error ?? 'Falha ao gerar a configuração.'); return }
    try { await navigator.clipboard.writeText(r.json); toast.success('Configuração copiada') }
    catch {
      const blob = new Blob([r.json], { type: 'application/json' }), a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = 'cronograma-adaptativo.json'; a.click(); URL.revokeObjectURL(a.href)
      toast.success('Não foi possível copiar; o arquivo foi baixado.')
    }
  }
  return (
    <div className="space-y-3">
      <Textarea readOnly rows={8} value={resumo} className="font-mono text-xs" />
      <Button size="sm" onClick={copiar}><Copy className="h-4 w-4" />Copiar configuração</Button>
      {podeEditar && (
        <>
          <label className="block space-y-1 text-sm"><span>Carregar uma configuração copiada antes</span>
            <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui a configuração" /></label>
          <Button variant="outline" size="sm" disabled={pend || !texto.trim()} onClick={() => rodar(async () => {
            const r = await importarConfigCronograma(texto)
            if (r.ok) setTexto('')
            return r
          }, 'Configuração carregada')}><Upload className="h-4 w-4" />Carregar configuração</Button>
        </>
      )}
    </div>
  )
}
