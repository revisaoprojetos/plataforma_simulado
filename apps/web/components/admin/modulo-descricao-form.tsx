'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Text } from 'lucide-react'
import { salvarDescricaoModulo } from '@/app/admin/leitura/actions'

/**
 * Descrição do módulo que aparece ABAIXO do título no BANNER do aluno (aba Trilha). Guardada em
 * trilha_aparencia.descricao (migration-free, via MERGE). Vazio = texto padrão ("Leia cada aula…").
 */
export function ModuloDescricaoForm({ pastaId, atual }: { pastaId: string; atual: string }) {
  const [descricao, setDescricao] = useState(atual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const r = await salvarDescricaoModulo(pastaId, descricao.trim())
    setSalvando(false)
    if (r.ok) toast.success('Descrição salva'); else toast.error(r.error ?? 'Erro ao salvar')
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Text className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Descrição do banner</h3>
          <p className="text-xs text-muted-foreground">Texto que aparece <strong>abaixo do título</strong> no banner do aluno. Em branco, usa o texto padrão.</p>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Descrição</span>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={400} placeholder="Ex.: Domine a Lei Seca artigo por artigo — leia, responda e avance na trilha."
          className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
      </label>

      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
        </button>
      </div>
    </div>
  )
}
