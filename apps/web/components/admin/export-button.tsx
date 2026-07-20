'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { baixarCsv, baixarExcel, sufixoData, type ColunaExport } from '@/lib/exportar'

/**
 * Botão "Exportar" reutilizável (CSV / Excel) para qualquer tabela.
 * Passe `rows` quando o client já tem os dados (exporta o que está filtrado/ordenado),
 * ou `fetchRows` (server action) para buscar TODAS as linhas sob demanda em listas paginadas.
 */
export function ExportButton<T>({ rows, fetchRows, colunas, nomeBase, titulo, subtitulo, disabled }: {
  rows?: T[]
  fetchRows?: () => Promise<T[]>
  colunas: ColunaExport<T>[]
  nomeBase: string
  titulo?: string
  subtitulo?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const nome = `${nomeBase}_${sufixoData()}`
  const vazio = !fetchRows && !(rows && rows.length)

  async function exportar(tipo: 'csv' | 'xlsx') {
    setOpen(false)
    if (vazio) return
    try {
      setBusy(true)
      const data = rows ?? (fetchRows ? await fetchRows() : [])
      if (!data.length) { toast.info('Nada para exportar com os filtros atuais.'); return }
      if (tipo === 'csv') baixarCsv(data, colunas, nome)
      else await baixarExcel(data, colunas, nome, { titulo: titulo ?? nomeBase, subtitulo })
      toast.success(`${data.length} linha(s) exportada(s)`)
    } catch (e) {
      toast.error('Falha ao exportar. Tente novamente.')
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button type="button" disabled={disabled || busy || vazio} onClick={() => setOpen((o) => !o)}
        title={vazio ? 'Nada para exportar' : 'Exportar em CSV ou Excel'}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Exportar
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
            <button type="button" onClick={() => exportar('xlsx')}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-muted">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.xlsx)
            </button>
            <button type="button" onClick={() => exportar('csv')}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-muted">
              <FileText className="h-4 w-4 text-muted-foreground" /> CSV (.csv)
            </button>
          </div>
        </>
      )}
    </div>
  )
}
