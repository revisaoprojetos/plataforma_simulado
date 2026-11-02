'use client'

/**
 * "Adicionar conteúdo à biblioteca" (BibliotecaNovo.png) — PORTE FIEL do designer.
 * Abas por tipo (Arquivo · Vídeo · Áudio · Texto · Incorporação; renderizadas como abas de LINHA/
 * sublinhado por regra do projeto, não segmentadas), dropzone, Título, Pasta, Marca d'água,
 * "Ligar a aulas" e "Bloquear download".
 *
 * Reuso exato do backend de ingestão (NÃO duplica): `prepararUploadConteudo` + `importarDeStorage`
 * (mesma mecânica XHR da Biblioteca) e `criarDocumentoBranco` (aba Texto). Escolher da biblioteca
 * LIGA (não copia) — para isso existe o <FilePicker> na área da aula. Cores via token; pt-BR.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, UploadCloud, FileText, Video as VideoIcon, Music, Type, Code2, Loader2, Info, Link2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  listarPastasConteudo, prepararUploadConteudo, importarDeStorage, criarDocumentoBranco,
} from '@/app/admin/biblioteca/actions'

type Aba = 'arquivo' | 'video' | 'audio' | 'texto' | 'incorporacao'
const ABAS: { k: Aba; rotulo: string; Icone: typeof FileText }[] = [
  { k: 'arquivo', rotulo: 'Arquivo', Icone: FileText },
  { k: 'video', rotulo: 'Vídeo', Icone: VideoIcon },
  { k: 'audio', rotulo: 'Áudio', Icone: Music },
  { k: 'texto', rotulo: 'Texto', Icone: Type },
  { k: 'incorporacao', rotulo: 'Incorporação', Icone: Code2 },
]
const MARCA_DAGUA = [
  { k: 'rodape-esq', label: 'Rodapé · esquerda' }, { k: 'rodape-dir', label: 'Rodapé · direita' },
  { k: 'centro', label: 'Centro · diagonal' }, { k: 'nenhuma', label: 'Sem marca d’água' },
]
type PastaFlat = { id: string; nome: string; pai_id: string | null }

export function AdicionarConteudo({
  tenantId, pastaId, onConcluido, rotulo = 'Adicionar conteúdo', variante = 'primario',
}: {
  tenantId: string
  pastaId: string | null
  onConcluido: () => void
  rotulo?: string
  variante?: 'primario' | 'secundario'
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        style={variante === 'primario' ? { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' } : undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap transition',
          variante === 'primario'
            ? 'h-10 rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)]'
            : 'h-[38px] w-full rounded-[11px] border px-3 text-[12.5px] font-bold leading-tight text-foreground hover:bg-muted',
        )}
      >
        <Plus className={cn('h-[15px] w-[15px]', variante !== 'primario' && 'text-primary')} />{rotulo}
      </button>
      {aberto && <ModalNovo tenantId={tenantId} pastaId={pastaId} onClose={() => setAberto(false)} onConcluido={() => { onConcluido(); setAberto(false) }} />}
    </>
  )
}

function subirComProgresso(signedUrl: string, f: File): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', signedUrl)
      if (f.type) xhr.setRequestHeader('content-type', f.type)
      xhr.setRequestHeader('x-upsert', 'true')
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
      xhr.onerror = () => resolve(false)
      xhr.send(f)
    } catch { resolve(false) }
  })
}

function ModalNovo({ tenantId: _tenantId, pastaId, onClose, onConcluido }: { tenantId: string; pastaId: string | null; onClose: () => void; onConcluido: () => void }) {
  const [aba, setAba] = useState<Aba>('arquivo')
  const [pastas, setPastas] = useState<PastaFlat[]>([])
  const [destino, setDestino] = useState<string | null>(pastaId)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [marcaDagua, setMarcaDagua] = useState('rodape-esq')
  const [bloquear, setBloquear] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { listarPastasConteudo('conteudo').then(setPastas).catch(() => setPastas([])) }, [])

  const pastasOrdenadas = [...pastas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const caminhoPasta = (() => {
    if (!destino) return 'Raiz da Biblioteca'
    const nomes: string[] = []
    const vistos = new Set<string>()
    let cur: string | null = destino
    while (cur && !vistos.has(cur)) {
      vistos.add(cur)
      const atual: PastaFlat | undefined = pastas.find((x) => x.id === cur)
      if (!atual) break
      nomes.unshift(atual.nome)
      cur = atual.pai_id ?? null
    }
    return nomes.join(' › ') || 'Biblioteca'
  })()

  function escolher(f: File | null) { if (!f) return; setArquivo(f); if (!titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, '')) }

  async function adicionarArquivo() {
    if (!arquivo) { toast.error('Solte ou escolha um arquivo.'); return }
    const nome = titulo.trim() || arquivo.name.replace(/\.[^.]+$/, '')
    setEnviando(true)
    try {
      const prep = await prepararUploadConteudo(arquivo.name)
      if (!prep.ok || !prep.path || !prep.uploadUrl) { toast.error(prep.error || 'Falha ao preparar o upload.'); return }
      let subiu = await subirComProgresso(prep.uploadUrl, arquivo)
      if (!subiu && prep.kind === 'supabase' && prep.token && prep.bucket) {
        const up = await createClient().storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, arquivo, { contentType: arquivo.type || undefined })
        subiu = !up.error
      }
      if (!subiu) { toast.error('Falha ao enviar o arquivo.'); return }
      const r = await importarDeStorage({ path: prep.path, titulo: nome, nomeArquivo: arquivo.name, mime: arquivo.type, pastaId: destino, categoria: 'conteudo' })
      if (!r.ok) { toast.error(r.error || 'Falha ao adicionar à biblioteca.'); return }
      toast.success('Conteúdo adicionado à biblioteca.')
      onConcluido()
    } finally { setEnviando(false) }
  }

  async function adicionarTexto() {
    const nome = titulo.trim()
    if (!nome) { toast.error('Informe um título.'); return }
    setEnviando(true)
    try {
      const r = await criarDocumentoBranco({ titulo: nome, pastaId: destino })
      if (!r.ok) { toast.error(r.error || 'Falha ao criar o documento.'); return }
      toast.success('Documento em branco criado.')
      onConcluido()
    } finally { setEnviando(false) }
  }

  const ehArquivo = aba === 'arquivo'
  const ehTexto = aba === 'texto'
  const podeConfirmar = ehArquivo ? !!arquivo : ehTexto ? !!titulo.trim() : false

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[90vh] w-[min(720px,calc(100vw-2rem))] max-w-[min(720px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pt-5">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">Biblioteca{destino ? ` › ${caminhoPasta}` : ''}</p>
          <DialogTitle className="mt-1">Adicionar conteúdo à biblioteca</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">O item fica na biblioteca e pode ser ligado a quantas aulas precisar.</p>
          <div role="tablist" aria-label="Tipo de conteúdo" className="mt-3 flex flex-wrap gap-1">
            {ABAS.map(({ k, rotulo: r, Icone }) => (
              <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  aba === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <Icone className="h-4 w-4" />{r}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {ehArquivo && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0] ?? null) }}
                onClick={() => fileRef.current?.click()}
                className={cn('flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors', arrastando ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:border-primary/50')}
              >
                <UploadCloud className="h-6 w-6 text-primary" />
                <div className="text-sm font-medium text-foreground">{arquivo ? arquivo.name : 'Solte o arquivo aqui, cole ou clique para escolher'}</div>
                <div className="text-xs text-muted-foreground">Até 100 MB por arquivo · documento, PDF, apresentação, planilha, vídeo ou áudio</div>
                <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; e.currentTarget.value = ''; escolher(f) }} />
              </div>

              <Campo label="Título">
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Aula 32 - PDFULL - Direito Administrativo - Desapropriação"
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Pasta">
                  <select value={destino ?? ''} onChange={(e) => setDestino(e.target.value || null)} className="h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    <option value="">Raiz da Biblioteca</option>
                    {pastasOrdenadas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </Campo>
                <Campo label="Marca d’água">
                  <select value={marcaDagua} onChange={(e) => setMarcaDagua(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {MARCA_DAGUA.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
                  </select>
                </Campo>
              </div>

              <Campo label="Ligar a aulas (opcional)">
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input disabled placeholder="Disponível ao abrir a aula (o seletor de arquivo liga à biblioteca, não copia)"
                    className="h-10 w-full rounded-lg border bg-muted/30 pl-9 pr-3 text-sm text-muted-foreground outline-none" />
                </div>
              </Campo>

              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">Bloquear PDF para download</div>
                  <div className="text-xs text-muted-foreground">O aluno lê na plataforma, mas não baixa.</div>
                </div>
                <Switch valor={bloquear} onToggle={setBloquear} label="Bloquear download" />
              </div>
            </>
          )}

          {ehTexto && (
            <>
              <Campo label="Título do documento">
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Aula 01 - Introdução"
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              </Campo>
              <Campo label="Pasta">
                <select value={destino ?? ''} onChange={(e) => setDestino(e.target.value || null)} className="h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <option value="">Raiz da Biblioteca</option>
                  {pastasOrdenadas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
              <div className="flex items-start gap-2 rounded-xl border bg-primary/5 px-3 py-2.5 text-sm text-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Cria um documento .docx em branco, editável no editor da Biblioteca.
              </div>
            </>
          )}

          {(aba === 'video' || aba === 'audio' || aba === 'incorporacao') && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/20 px-6 py-10 text-center">
              {aba === 'video' ? <VideoIcon className="h-7 w-7 text-muted-foreground opacity-60" /> : aba === 'audio' ? <Music className="h-7 w-7 text-muted-foreground opacity-60" /> : <Code2 className="h-7 w-7 text-muted-foreground opacity-60" />}
              <div className="text-sm font-semibold text-foreground">
                {aba === 'video' ? 'Vídeo por link' : aba === 'audio' ? 'Áudio' : 'Incorporação / embed'}
              </div>
              <p className="max-w-sm text-xs text-muted-foreground">
                {aba === 'video'
                  ? 'Vídeo entra por link (YouTube, Vimeo, Panda, Drive) direto na aula, pelo seletor de arquivo. A hospedagem própria de vídeo é fase posterior.'
                  : aba === 'audio'
                    ? 'Áudio entra como arquivo pela aba “Arquivo” ou pelo seletor de arquivo da aula.'
                    : 'Conteúdo incorporado (embed) é configurado como “Link externo” no seletor de arquivo da aula.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button onClick={onClose} disabled={enviando} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
          <button
            onClick={ehTexto ? adicionarTexto : adicionarArquivo}
            disabled={enviando || !podeConfirmar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}Adicionar à biblioteca
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-foreground">{label}</span>{children}</label>
}
function Switch({ valor, onToggle, label }: { valor: boolean; onToggle: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={valor} aria-label={label} onClick={() => onToggle(!valor)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', valor ? 'bg-primary' : 'bg-muted-foreground/30')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all', valor ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}
