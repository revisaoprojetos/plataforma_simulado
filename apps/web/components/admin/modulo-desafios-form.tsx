'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Trophy, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarDesafiosModulo } from '@/app/admin/leitura/actions'
import { DESAFIO_TIPOS, type DesafioModulo, type DesafioTipo } from '@/lib/leitura/desafios'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

let seq = 0
const novoId = () => `d_${Date.now()}_${seq++}`
const selectCls = 'h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring'

/**
 * DESAFIOS do módulo (LegProc) — metas de longo prazo (concluir N aulas, gabaritar N quizzes, acertar N
 * questões) que dão um bônus de XP UMA vez ao aluno. Dormente até a gamificação ser ativada.
 */
export function ModuloDesafiosForm({ pastaId, atual }: { pastaId: string; atual: DesafioModulo[] }) {
  const [lista, setLista] = useState<DesafioModulo[]>(atual)
  const [salvando, setSalvando] = useState(false)
  const baseRef = useRef(JSON.stringify(atual))
  const dirty = JSON.stringify(lista) !== baseRef.current

  const setById = (id: string, patch: Partial<DesafioModulo>) => setLista((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const remById = (id: string) => setLista((l) => l.filter((x) => x.id !== id))
  const add = () => setLista((l) => [...l, { id: novoId(), titulo: 'Novo desafio', tipo: 'concluir_aulas', meta: 5, xp: 50, ativo: true }])

  async function salvar(): Promise<boolean> {
    setSalvando(true)
    const r = await salvarDesafiosModulo(pastaId, lista)
    setSalvando(false)
    if (r.ok) { baseRef.current = JSON.stringify(lista); return true }
    toast.error(r.error ?? 'Erro ao salvar desafios.'); return false
  }
  async function salvarSozinho() { if (await salvar()) toast.success('Desafios salvos') }
  const noSalvarUnico = useRegistrarSalvavel(`${pastaId}:desafios`, dirty, salvar)

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Trophy className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">Desafios do módulo</h3>
          <p className="text-xs text-muted-foreground">Metas do módulo que dão um <strong>bônus de XP</strong> (uma vez por aluno) ao serem atingidas. <strong>Dormente até a gamificação ser ativada.</strong></p>
        </div>
      </div>

      <div className="space-y-2">
        {lista.map((d) => {
          const inativo = !d.ativo
          return (
            <div key={d.id} className={cn('flex flex-wrap items-end gap-3 rounded-xl border p-3 transition-colors', inativo ? 'bg-muted/10 opacity-70' : 'bg-card shadow-sm')}>
              <label className="min-w-[180px] flex-1 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Título</span>
                <input value={d.titulo} onChange={(e) => setById(d.id, { titulo: e.target.value })} className={selectCls} />
              </label>
              <label className="w-52 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Tipo</span>
                <select className={selectCls} value={d.tipo} onChange={(e) => setById(d.id, { tipo: e.target.value as DesafioTipo })}>
                  {DESAFIO_TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>
              <label className="w-24 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Meta</span>
                <input type="number" min={1} value={d.meta} onChange={(e) => setById(d.id, { meta: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className={cn(selectCls, 'text-right tabular-nums')} />
              </label>
              <label className="w-24 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">XP</span>
                <input type="number" min={0} value={d.xp} onChange={(e) => setById(d.id, { xp: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={cn(selectCls, 'text-right tabular-nums')} />
              </label>
              <div className="flex items-center gap-2 self-center pt-4">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={inativo ? 'Ativar' : 'Desativar'}>
                  <input type="checkbox" checked={!inativo} onChange={(e) => setById(d.id, { ativo: e.target.checked })} className="h-4 w-4 rounded border" />
                  {inativo ? 'Inativo' : 'Ativo'}
                </label>
                <button type="button" onClick={() => remById(d.id)} aria-label={`Remover ${d.titulo}`} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          )
        })}
        {lista.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum desafio. Adicione metas como “conclua 10 aulas” ou “gabarite 5 quizzes”.</p>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"><Plus className="h-4 w-4" /> Adicionar desafio</button>
        {!noSalvarUnico && (
          <button type="button" onClick={salvarSozinho} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar desafios
          </button>
        )}
      </div>
    </div>
  )
}
