'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { importarMembros } from '@/app/admin/grupos/actions'
import { Loader2, X, Upload, FileUp, Download } from 'lucide-react'

// Modelo de importação (formato provisório — ajustar quando o formato definitivo chegar).
const MODELO_CSV = ['email;cpf;nome', 'joao@email.com;123.456.789-00;João da Silva', 'maria@email.com;987.654.321-00;Maria Souza'].join('\r\n')

function baixarModelo() {
  const blob = new Blob(['﻿' + MODELO_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'modelo-importacao-participantes.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ImportarMembrosDialog({ grupoId, onClose }: { grupoId: string; onClose: () => void }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ adicionados: number; jaEram: number; naoEncontrados: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function enviar() {
    if (!texto.trim() && !arquivo) { toast.error('Cole uma lista ou selecione um arquivo.'); return }
    setEnviando(true)
    const fd = new FormData()
    fd.set('grupoId', grupoId)
    fd.set('texto', texto)
    if (arquivo) fd.set('arquivo', arquivo)
    const r = await importarMembros(fd)
    setEnviando(false)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao importar'); return }
    const adicionados = r.adicionados ?? 0
    const naoEncontrados = r.naoEncontrados ?? []
    // Atualiza a lista de Participantes imediatamente.
    router.refresh()
    if (adicionados > 0) toast.success(`${adicionados} participante(s) adicionado(s)`)
    else toast.message('Nenhum novo participante adicionado')
    // Se tudo casou, fecha o diálogo — os importados já aparecem nos Participantes.
    if (naoEncontrados.length === 0) { onClose(); return }
    setResultado({ adicionados, jaEram: r.jaEram ?? 0, naoEncontrados })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4" /> Importar participantes</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">Cole uma lista (um por linha) de <strong>e-mails</strong>, <strong>CPFs</strong> ou <strong>nomes</strong>, ou envie um arquivo. O sistema casa com os estudantes já cadastrados.</p>
            <button type="button" onClick={baixarModelo} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary">
              <Download className="h-3.5 w-3.5" /> Baixar modelo
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Colar lista</label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder={'joao@email.com\n123.456.789-00\nMaria Silva'}
              className="w-full resize-y rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ou enviar arquivo (.csv, .txt, .xlsx)</label>
            <input ref={inputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="hidden" />
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              <FileUp className="h-4 w-4 shrink-0" />
              <span className="truncate">{arquivo ? arquivo.name : 'Selecionar arquivo…'}</span>
              {arquivo && <span onClick={(e) => { e.stopPropagation(); setArquivo(null); if (inputRef.current) inputRef.current.value = '' }} className="ml-auto shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></span>}
            </button>
          </div>

          {resultado && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="text-emerald-600 dark:text-emerald-400">✓ {resultado.adicionados} adicionado(s){resultado.jaEram > 0 && <span className="text-muted-foreground"> · {resultado.jaEram} já estava(m) no grupo</span>}</p>
              {resultado.naoEncontrados.length > 0 && (
                <div>
                  <p className="text-amber-600 dark:text-amber-400">⚠ {resultado.naoEncontrados.length} não encontrado(s):</p>
                  <p className="mt-1 max-h-24 overflow-auto break-words text-xs text-muted-foreground">{resultado.naoEncontrados.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">{resultado ? 'Fechar' : 'Cancelar'}</button>
            <button type="button" onClick={enviar} disabled={enviando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
