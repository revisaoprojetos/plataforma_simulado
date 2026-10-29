'use client'

// Editor de LEI SECA por semana (WLP) do Cronograma Adaptativo. Um bloco por linha
// no textarea da semana; salva substituindo os blocos daquela semana.

import { useState } from 'react'
import { Loader2, Plus, Save, FileSearch } from 'lucide-react'
import { toast } from 'sonner'
import { salvarSemanaLegproc, medirPaginasBibliotecaAction, type SemanaLegproc } from './actions'

export function LeiSecaEditor({ inicial }: { inicial: SemanaLegproc[] }) {
  const [semanas, setSemanas] = useState<SemanaLegproc[]>(inicial.length ? inicial : [{ semana: 1, blocos: [] }])
  const [salvando, setSalvando] = useState<number | null>(null)
  const [medindo, setMedindo] = useState(false)

  function setTexto(semana: number, texto: string) {
    setSemanas((ss) => ss.map((s) => (s.semana === semana ? { ...s, blocos: texto.split('\n') } : s)))
  }
  function addSemana() {
    const prox = (semanas.reduce((m, s) => Math.max(m, s.semana), 0) || 0) + 1
    setSemanas((ss) => [...ss, { semana: prox, blocos: [] }])
  }
  async function salvar(s: SemanaLegproc) {
    setSalvando(s.semana)
    const r = await salvarSemanaLegproc(s.semana, s.blocos)
    setSalvando(null)
    if (r.ok) toast.success(`Semana ${s.semana} salva.`)
    else toast.error(r.error ?? 'Falha ao salvar.')
  }
  async function medir() {
    setMedindo(true)
    const r = await medirPaginasBibliotecaAction()
    setMedindo(false)
    if (r.ok) toast.success(`Páginas medidas: ${r.medidos ?? 0}${r.falhas ? ` · ${r.falhas} falha(s)` : ''}.`)
    else toast.error(r.error ?? 'Falha ao medir.')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={addSemana} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:border-primary"><Plus className="h-4 w-4" /> Adicionar semana</button>
        <button onClick={medir} disabled={medindo} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:border-primary disabled:opacity-50">
          {medindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Medir páginas dos PDFs
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {semanas.map((s) => (
          <div key={s.semana} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Semana {s.semana}</h3>
              <button onClick={() => salvar(s)} disabled={salvando === s.semana} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:border-primary disabled:opacity-50">
                {salvando === s.semana ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
              </button>
            </div>
            <textarea
              value={s.blocos.join('\n')}
              onChange={(e) => setTexto(s.semana, e.target.value)}
              rows={6}
              placeholder={'Um bloco por linha, ex.:\nCF - Preâmbulo ao art. 5º, XXVI\nCPC - Arts. 1º a 15'}
              className="w-full resize-y rounded-lg border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{s.blocos.filter((b) => b.trim()).length} bloco(s)</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Cada bloco vira uma meta de LegProc (45 min) na semana correspondente do Cronograma Adaptativo.</p>
    </div>
  )
}
