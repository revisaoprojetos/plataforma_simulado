'use client'

// "Leitura rápida": o admin cola o HTML de uma página enxuta (poucas interações) para o aluno ler
// rápido. É sanitizado ao salvar (quiz_config.leitura_rapida) e renderizado na área de leitura.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Eye, Upload, Copy, Code2 } from 'lucide-react'
import { salvarLeituraRapida } from '@/app/admin/leitura/actions'
import { SNIPPET_LEITURA_RAPIDA } from '@/lib/leitura/leitura-rapida'

export function LeituraRapidaEditor({ documentoId, inicial }: { documentoId: string; inicial: string }) {
  const [html, setHtml] = useState(inicial ?? '')
  const [pend, start] = useTransition()

  const salvar = () => start(async () => {
    const r = await salvarLeituraRapida(documentoId, html)
    if (!r.ok) return void toast.error(r.error ?? 'Erro ao salvar.')
    toast.success('Leitura rápida salva.')
  })

  const enviarArquivo = (file: File | null | undefined) => {
    if (!file) return
    if (!/\.(html?|txt)$/i.test(file.name) && file.type !== 'text/html') return void toast.error('Envie um arquivo .html')
    if (file.size > 2 * 1024 * 1024) return void toast.error('Arquivo muito grande (máx. 2 MB).')
    const fr = new FileReader()
    fr.onload = () => setHtml(String(fr.result ?? ''))
    fr.readAsText(file)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Cole (ou envie) o HTML de uma <strong>página enxuta</strong> (leitura + questões). Roda num iframe isolado. Para contar como o desafio feito, o HTML deve <strong>avisar as respostas</strong> via <code>postMessage</code> (snippet abaixo) — ao responder todas, grava XP/sequência/ranking.</p>
      <details className="group rounded-lg border bg-muted/30">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
          <Code2 className="h-3.5 w-3.5 text-primary" /> Contrato de eventos (incluir no HTML)
          <button type="button" onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(SNIPPET_LEITURA_RAPIDA).then(() => toast.success('Snippet copiado.')) }} className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"><Copy className="h-3 w-3" /> Copiar</button>
        </summary>
        <pre className="max-h-48 overflow-auto border-t bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{SNIPPET_LEITURA_RAPIDA}</pre>
      </details>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">HTML</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Enviar .html
              <input type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { enviarArquivo(e.target.files?.[0]); e.currentTarget.value = '' }} />
            </label>
          </div>
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={14} spellCheck={false} placeholder="<div> … </div>" className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
        </div>
        <div>
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Prévia (isolada)</span>
          {/* IFRAME sandbox allow-scripts (sem same-origin): roda o JS da página ISOLADO — não vaza
              estilo/script pra plataforma nem escapa do sandbox. */}
          <iframe title="Prévia da leitura rápida" sandbox="allow-scripts" srcDoc={html || '<p style="font-family:sans-serif;opacity:.5">A prévia aparece aqui…</p>'} className="h-[60vh] min-h-[220px] w-full rounded-lg border bg-white" />
        </div>
      </div>
      <button onClick={salvar} disabled={pend} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
        {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar leitura rápida
      </button>
    </div>
  )
}
