'use client'

/**
 * "Substituir arquivo" (Substituir.png) — publica uma NOVA versão do documento.
 * Reuso exato: `publicarNovaVersao` (app/admin/biblioteca/actions) → criarVersao + reconciliarVersao
 * (mantém grifos/anotações dos alunos) + definirVersaoAtual. Os vínculos modo 'última' passam a
 * mostrar a nova versão automaticamente; os 'fixada' continuam na versão aprovada (reaponte em
 * "Aulas vinculadas").
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, FileText, UploadCloud, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { publicarNovaVersao } from '@/app/admin/biblioteca/actions'

function lerDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    r.readAsDataURL(f)
  })
}

export function SubstituirModal({
  open, onClose, documentoId, titulo, subtitulo, vinculos = 0, onSubstituido,
}: {
  open: boolean
  onClose: () => void
  documentoId: string
  titulo: string
  subtitulo?: string
  vinculos?: number
  onSubstituido?: () => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [nota, setNota] = useState('')
  const [avisar, setAvisar] = useState(true)
  const [manterGrifos, setManterGrifos] = useState(true)
  const [arrastando, setArrastando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function substituir() {
    if (!arquivo) { toast.error('Escolha o arquivo da nova versão.'); return }
    setEnviando(true)
    try {
      const dataBase64 = await lerDataUrl(arquivo)
      const r = await publicarNovaVersao({ documentoId, nomeArquivo: arquivo.name, mime: arquivo.type, dataBase64, publicar: true })
      if (!r.ok) { toast.error(r.error || 'Falha ao substituir o arquivo.'); return }
      const an = r.reconc?.anotacoes
      toast.success(manterGrifos && an ? `Nova versão publicada. Grifos: ${an.ativas} mantidos, ${an.alteradas} em revisão.` : 'Nova versão publicada.')
      onSubstituido?.()
      onClose()
      setArquivo(null); setNota('')
    } finally { setEnviando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[88vh] w-[min(640px,calc(100vw-2rem))] max-w-[min(640px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pt-5">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">Biblioteca › {titulo}</p>
          <DialogTitle className="mt-1 mb-4">Substituir arquivo</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{titulo}</div>
              <div className="truncate text-xs text-muted-foreground">Arquivo atual{subtitulo ? ` · ${subtitulo}` : ''}{vinculos ? ` · usado em ${vinculos} ${vinculos === 1 ? 'aula' : 'aulas'}` : ''}</div>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) setArquivo(f) }}
            onClick={() => fileRef.current?.click()}
            className={[
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              arrastando ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:border-primary/50',
            ].join(' ')}
          >
            <UploadCloud className="h-6 w-6 text-primary" aria-hidden />
            <div className="text-sm font-medium text-foreground">{arquivo ? arquivo.name : 'Solte a versão nova do arquivo'}</div>
            <div className="text-xs text-muted-foreground">Até 100 MB</div>
            <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) setArquivo(f) }} />
          </div>

          {/* Nota da versão */}
          <label className="mt-5 block">
            <span className="mb-1 block text-sm font-semibold text-foreground">O que mudou nesta versão (o aluno vê no leitor)</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Ex.: atualizado com a Lei 15.xxx; corrigida a página 12."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>

          {/* Toggles */}
          <Toggle titulo="Avisar os alunos dessas aulas" descricao="Selo “Atualizado em” e notificação" valor={avisar} onToggle={setAvisar} />
          <Toggle titulo="Manter grifos e anotações dos alunos" descricao="Os grifos ficam presos ao texto que não mudou (reconciliação)" valor={manterGrifos} onToggle={setManterGrifos} />

          <div className="mt-4 flex items-start gap-2 rounded-xl border bg-primary/5 px-3 py-2.5 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              A troca vale para os vínculos “última” (atualizam sozinhos). A versão anterior fica no histórico e pode ser restaurada.
              Vínculos “fixada” seguem na versão antiga — reaponte-os em “Aulas vinculadas”.
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button onClick={onClose} disabled={enviando} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
          <button
            onClick={substituir}
            disabled={enviando || !arquivo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}Substituir{vinculos ? ` nas ${vinculos} aulas` : ''}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Toggle({ titulo, descricao, valor, onToggle }: { titulo: string; descricao: string; valor: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{titulo}</div>
        <div className="text-xs text-muted-foreground">{descricao}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        aria-label={titulo}
        onClick={() => onToggle(!valor)}
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          valor ? 'bg-primary' : 'bg-muted-foreground/30',
        ].join(' ')}
      >
        <span className={['absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all', valor ? 'left-[22px]' : 'left-0.5'].join(' ')} />
      </button>
    </div>
  )
}
