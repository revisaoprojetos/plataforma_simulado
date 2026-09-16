'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trophy, Upload, Trash2 } from 'lucide-react'
import { salvarAdesivoModulo } from '@/app/admin/leitura/actions'

/**
 * Config do "Adesivo de conquista" do módulo (LegProc): imagem que aparece SOBRE o balão da aula na
 * trilha quando o aluno GABARITA aquela aula (100% do quiz). Envia a imagem (base64 → storage) via
 * salvarAdesivoModulo. PNG com fundo transparente fica melhor.
 */
export function ModuloAdesivoForm({ pastaId, atual }: { pastaId: string; atual: string | null }) {
  const [url, setUrl] = useState<string | null>(atual)
  const [preview, setPreview] = useState<string | null>(atual)
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function escolher(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    if (file.size > 1.5 * 1024 * 1024) { toast.error('Imagem muito grande (máx. ~1,5 MB).'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = String(reader.result)
      setPreview(base64); setSalvando(true)
      const r = await salvarAdesivoModulo(pastaId, base64)
      setSalvando(false)
      if (r.ok) { setUrl(r.url ?? null); setPreview(r.url ?? base64); toast.success('Adesivo salvo') }
      else { toast.error(r.error ?? 'Erro ao salvar'); setPreview(url) }
    }
    reader.readAsDataURL(file)
  }

  async function remover() {
    setSalvando(true)
    const r = await salvarAdesivoModulo(pastaId, null)
    setSalvando(false)
    if (r.ok) { setUrl(null); setPreview(null); toast.success('Adesivo removido') } else toast.error(r.error ?? 'Erro ao remover')
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Trophy className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Adesivo de conquista</h3>
          <p className="text-xs text-muted-foreground">Aparece sobre o balão da aula na trilha quando o aluno <strong>gabarita</strong> (acerta 100% das questões). Um PNG com fundo transparente fica melhor.</p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }} />
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
          {preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={preview} alt="Adesivo" className="h-full w-full -rotate-12 object-contain drop-shadow" />
            : <Trophy className="h-7 w-7 text-muted-foreground/40" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {preview ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {preview && (
            <button type="button" onClick={remover} disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Remover
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
