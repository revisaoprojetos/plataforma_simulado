'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Minus, PencilLine, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { carregarDiffDocumento } from '../../alteracoes-actions'
import { DiffEspelho } from '@/components/leitura/diff-espelho'
import type { DiffDoc, VersaoInfo } from '@/lib/leitura/diff-tipos'

function rotuloVersao(v: VersaoInfo): string {
  const tag = v.rascunho ? ' · rascunho' : v.atual ? ' · publicada' : ''
  return v.nome ? `${v.nome} (v${v.versao})` : `v${v.versao}${tag}`
}

export function AlteracoesClient({
  documentoId,
  versoes,
  vAntesInicial,
  vDepoisInicial,
  diffInicial,
}: {
  documentoId: string
  versoes: VersaoInfo[]
  vAntesInicial: number
  vDepoisInicial: number
  diffInicial: DiffDoc
}) {
  const [vAntes, setVAntes] = useState(vAntesInicial)
  const [vDepois, setVDepois] = useState(vDepoisInicial)
  const [diff, setDiff] = useState<DiffDoc>(diffInicial)
  const [pendente, iniciar] = useTransition()

  function recarregar(a: number, b: number) {
    iniciar(async () => {
      const r = await carregarDiffDocumento(documentoId, a, b)
      if (!r.ok || !r.diff) { toast.error(r.error ?? 'Não foi possível comparar.'); return }
      setDiff(r.diff)
    })
  }

  const { resumo } = diff
  const semMudanca = resumo.mod + resumo.add + resumo.rem === 0

  return (
    <div className="space-y-4">
      {/* Seletores de versão + resumo */}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Antes
          <select
            value={vAntes}
            onChange={(e) => { const a = Number(e.target.value); setVAntes(a); recarregar(a, vDepois) }}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          >
            {versoes.map((v) => <option key={v.versao} value={v.versao}>{rotuloVersao(v)}</option>)}
          </select>
        </label>
        <ArrowRight className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Depois
          <select
            value={vDepois}
            onChange={(e) => { const b = Number(e.target.value); setVDepois(b); recarregar(vAntes, b) }}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          >
            {versoes.map((v) => <option key={v.versao} value={v.versao}>{rotuloVersao(v)}</option>)}
          </select>
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {pendente && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 font-medium text-amber-700 dark:text-amber-300"><PencilLine className="h-3 w-3" /> {resumo.mod} alterado(s)</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300"><Plus className="h-3 w-3" /> {resumo.add} novo(s)</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 font-medium text-rose-700 dark:text-rose-300"><Minus className="h-3 w-3" /> {resumo.rem} removido(s)</span>
        </div>
      </div>

      {/* Espelho de alterações */}
      {vAntes === vDepois ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Escolha duas versões diferentes para comparar.</p>
      ) : semMudanca ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma diferença de texto entre estas versões.</p>
      ) : (
        <div className={pendente ? 'opacity-60' : ''}>
          <DiffEspelho diff={diff} />
        </div>
      )}
    </div>
  )
}
