'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EntradaTipo } from '@/app/admin/cronogramas/tipos-actions-tipos'
import { alternarAtivoTipo, atualizarTipo, criarTipo, excluirTipo, reordenarTipos } from '@/app/admin/cronogramas/tipos-actions'
import { COMPORTAMENTOS, vazio } from '@/app/admin/cronogramas/tipos/tipos-client'

// Ações da sub-aba Tipos de meta: reaproveitam as server actions atuais (tipos-actions.ts) e o mesmo formulário/dicionário
// de comportamentos da tela antiga. A lista em si é a TabelaCron (servidor).

export interface TipoEditavel extends EntradaTipo { id: string; slug: string; ativo: boolean; usos: number }

function TipoDialogo({ tipo, open, onOpenChange }: { tipo: TipoEditavel | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [form, setForm] = useState<EntradaTipo>(() => (tipo ? { ...tipo } : vazio()))

  function salvar() {
    iniciar(async () => {
      const r = tipo ? await atualizarTipo(tipo.id, form) : await criarTipo(form)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível salvar.'); return }
      toast.success(tipo ? 'Tipo atualizado' : 'Tipo criado')
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tipo ? 'Editar tipo de meta' : 'Novo tipo de meta'}</DialogTitle>
          <DialogDescription>As opções abaixo decidem como o gerador trata as metas deste tipo — na tela e no documento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome na tela</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="PDFULL + Videoaula" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome no documento</Label>
              <Input value={form.rotulo_docx} onChange={(e) => setForm((f) => ({ ...f, rotulo_docx: e.target.value }))} placeholder="PDFULL OU VIDEOAULA" />
            </div>
          </div>
          {tipo && <p className="text-xs text-muted-foreground">Renomear é seguro: a chave interna não muda, então as metas existentes continuam ligadas a este tipo.</p>}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Comportamento</p>
            {COMPORTAMENTOS.map((c) => (
              <div key={c.chave} className="flex items-start gap-3">
                <Switch checked={form[c.chave] as boolean} onCheckedChange={(v) => setForm((f) => ({ ...f, [c.chave]: v }))} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">{c.ajuda}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pendente}>Cancelar</Button>
          <Button onClick={salvar} disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NovoTipo() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}><Plus />Novo tipo</Button>
      {aberto && <TipoDialogo tipo={null} open={aberto} onOpenChange={setAberto} />}
    </>
  )
}

/** Ações de uma linha: subir/descer (só quando a lista está na ordem real), ativar/desativar, editar, excluir. */
export function AcoesTipo({ tipo, ordemIds, reordenavel }: { tipo: TipoEditavel; ordemIds: string[]; reordenavel: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  const i = ordemIds.indexOf(tipo.id)

  function mover(d: -1 | 1) {
    const j = i + d
    if (i < 0 || j < 0 || j >= ordemIds.length) return
    const novos = [...ordemIds]
    ;[novos[i], novos[j]] = [novos[j], novos[i]]
    iniciar(async () => {
      const r = await reordenarTipos(novos)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível reordenar.'); return }
      router.refresh()
    })
  }
  function alternar() {
    iniciar(async () => {
      const alvo = !tipo.ativo
      const r = await alternarAtivoTipo(tipo.id, alvo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      toast.success(alvo ? 'Tipo reativado' : 'Tipo desativado')
      router.refresh()
    })
  }
  async function remover() {
    if (tipo.usos > 0) { toast.error(`"${tipo.nome}" está em ${tipo.usos} meta(s). Desative-o em vez de excluir.`); return }
    if (!(await confirmar({ titulo: 'Excluir tipo', mensagem: `Excluir o tipo "${tipo.nome}"?`, destrutivo: true }))) return
    iniciar(async () => {
      const r = await excluirTipo(tipo.id)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível excluir.'); return }
      toast.success('Tipo excluído')
      router.refresh()
    })
  }

  return (
    <span className="flex items-center justify-end gap-0.5">
      {reordenavel && (
        <>
          <Button size="icon-sm" variant="ghost" onClick={() => mover(-1)} disabled={pendente || i <= 0} title="Subir" aria-label="Subir"><ArrowUp /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => mover(1)} disabled={pendente || i < 0 || i >= ordemIds.length - 1} title="Descer" aria-label="Descer"><ArrowDown /></Button>
        </>
      )}
      <Button size="icon-sm" variant="ghost" onClick={alternar} disabled={pendente} title={tipo.ativo ? 'Desativar' : 'Reativar'} aria-label={tipo.ativo ? 'Desativar' : 'Reativar'}>{tipo.ativo ? <Eye /> : <EyeOff />}</Button>
      <Button size="icon-sm" variant="ghost" onClick={() => setEditando(true)} disabled={pendente} title="Editar" aria-label="Editar"><Pencil /></Button>
      <Button size="icon-sm" variant="ghost" onClick={remover} disabled={pendente} title="Excluir" aria-label="Excluir"><Trash2 className="text-destructive" /></Button>
      {editando && <TipoDialogo tipo={tipo} open={editando} onOpenChange={setEditando} />}
    </span>
  )
}
