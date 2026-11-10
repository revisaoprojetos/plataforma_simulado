'use client'

// ABA "VÍDEO" do gerenciamento do conteúdo: o vídeo que aparece numa faixa recolhível acima da folha na leitura do aluno.
// Origem: link (YouTube/Vimeo/arquivo) OU um vídeo já cadastrado na Biblioteca. Autorização no servidor (video-actions).

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Video } from 'lucide-react'
import type { VideoDoc } from '@/lib/conteudo/metadados'
import { carregarVideoAction, salvarVideoAction } from '@/app/admin/biblioteca/video-actions'

const inp = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AbaVideo({ documentoId }: { documentoId: string }) {
  const [carregou, setCarregou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [videos, setVideos] = useState<{ id: string; titulo: string }[]>([])
  const [tipo, setTipo] = useState<'nenhum' | 'link' | 'plataforma'>('nenhum')
  const [url, setUrl] = useState('')
  const [docId, setDocId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await carregarVideoAction(documentoId)
      if (!vivo) return
      if (!r.ok) { setErro(r.error); return }
      const v: VideoDoc | null = r.video
      setVideos(r.videos); setTipo(v?.tipo ?? 'nenhum'); setUrl(v?.url ?? ''); setDocId(v?.doc_id ?? ''); setTitulo(v?.titulo ?? '')
      setCarregou(true)
    })()
    return () => { vivo = false }
  }, [documentoId])

  function salvar() {
    start(async () => {
      const r = await salvarVideoAction(documentoId, { tipo, url, doc_id: docId, titulo })
      if (r.ok) toast.success(tipo === 'nenhum' ? 'Vídeo removido da leitura.' : 'Vídeo salvo. O aluno vê na faixa de vídeo da leitura.')
      else toast.error(r.error || 'Não foi possível salvar.')
    })
  }

  if (erro) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
  if (!carregou) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  const opcoes: { v: 'nenhum' | 'link' | 'plataforma'; t: string; d: string }[] = [
    { v: 'nenhum', t: 'Sem vídeo', d: 'A leitura não mostra a faixa de vídeo.' },
    { v: 'link', t: 'Link', d: 'YouTube, Vimeo ou arquivo de vídeo (.mp4, .webm, .m3u8).' },
    { v: 'plataforma', t: 'Vídeo da plataforma', d: 'Um vídeo já cadastrado na Biblioteca.' },
  ]
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Video className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold">Vídeo na leitura</h3>
          <p className="text-xs text-muted-foreground">Aparece numa faixa recolhível acima da folha. O aluno recolhe e expande quando quiser.</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {opcoes.map((o) => (
          <button key={o.v} type="button" onClick={() => setTipo(o.v)}
            className={`rounded-xl border p-3 text-left transition-colors ${tipo === o.v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}>
            <div className="text-sm font-semibold">{o.t}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{o.d}</div>
          </button>
        ))}
      </div>

      {tipo === 'link' && (
        <label className="block text-xs text-muted-foreground">Link do vídeo (https)
          <input className={`${inp} mt-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=… ou https://vimeo.com/…" />
        </label>
      )}
      {tipo === 'plataforma' && (
        <label className="block text-xs text-muted-foreground">Vídeo cadastrado
          <select className={`${inp} mt-1`} value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">Selecione…</option>
            {videos.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}
          </select>
          {videos.length === 0 && <span className="mt-1 block text-[11px]">Nenhum vídeo encontrado na Biblioteca. Envie um vídeo como conteúdo primeiro.</span>}
        </label>
      )}
      {tipo !== 'nenhum' && (
        <label className="block text-xs text-muted-foreground">Título mostrado na faixa (opcional)
          <input className={`${inp} mt-1`} value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} placeholder="Videoaula" />
        </label>
      )}

      <button type="button" disabled={pending} onClick={salvar} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
      </button>
    </div>
  )
}
