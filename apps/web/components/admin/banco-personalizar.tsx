'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { atualizarBanco } from '@/app/admin/banco-questoes/actions'
import { BANCO_CORES, BANCO_ICONES, iconeBanco } from '@/lib/banco-visual'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Check, ImagePlus, Trash2, RefreshCw, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Redimensiona a imagem no cliente e devolve um data URL leve (JPEG). */
async function redimensionar(file: File, max = 900): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.72)
}

type Banco = { id: string; nome: string; cor: string | null; icone: string | null; capa_url: string | null; capa_card_url: string | null; total: number }

export function BancoPersonalizar({ banco }: { banco: Banco }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const cardInputRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(banco.nome)
  const [cor, setCor] = useState<string | null>(banco.cor)
  const [icone, setIcone] = useState<string>(banco.icone && BANCO_ICONES[banco.icone] ? banco.icone : 'folder')
  const [capa, setCapa] = useState<string | null>(banco.capa_url)
  const [capaCard, setCapaCard] = useState<string | null>(banco.capa_card_url)
  const [salvando, setSalvando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [processandoCard, setProcessandoCard] = useState(false)

  const c = cor ?? '#6d28d9'
  const Preview = iconeBanco(icone)
  // O card (pôster) usa a imagem própria; se vazia, cai para a capa do banner.
  const imgCard = capaCard ?? capa

  async function onFile(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setProcessando(true)
    try { setCapa(await redimensionar(f)) } catch { toast.error('Falha ao processar a imagem.') } finally { setProcessando(false) }
  }

  async function onFileCard(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setProcessandoCard(true)
    // Pôster é vertical (4:5) → redimensiona um pouco maior para manter nitidez.
    try { setCapaCard(await redimensionar(f, 1000)) } catch { toast.error('Falha ao processar a imagem.') } finally { setProcessandoCard(false) }
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const r = await atualizarBanco(banco.id, nome, cor, icone, capa, capaCard)
    setSalvando(false)
    if (r.ok) { toast.success('Personalização salva'); router.refresh() } else toast.error(r.error ?? 'Erro ao salvar')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Formulário */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <div className="flex items-center gap-3 border-b px-5 py-3.5" style={{ background: `linear-gradient(90deg, ${c}1f, transparent 55%)` }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: c }}><Palette className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Personalizar banco</h3>
            <p className="text-xs text-muted-foreground">Cor, ícone e imagem de capa</p>
          </div>
        </div>
        <CardContent className="space-y-6 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {/* Capa */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Imagem de capa</label>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {capa ? (
              <div className="relative overflow-hidden rounded-xl border">
                <img src={capa} alt="Capa" className="h-40 w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                  <button type="button" onClick={() => setCapa(null)} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => inputRef.current?.click()} disabled={processando}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
                {processando ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
                <span className="text-sm font-medium">{processando ? 'Processando…' : 'Adicionar imagem de capa'}</span>
                <span className="text-xs">Usada no banner largo do topo do banco.</span>
              </button>
            )}
          </div>

          {/* Imagem do card (pôster) — separada da capa do banner, para não esticar no formato vertical */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Imagem do card (pôster)</label>
            <input ref={cardInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFileCard(e.target.files?.[0] ?? null)} />
            {capaCard ? (
              <div className="relative overflow-hidden rounded-xl border">
                <img src={capaCard} alt="Imagem do card" className="h-40 w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={() => cardInputRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                  <button type="button" onClick={() => setCapaCard(null)} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => cardInputRef.current?.click()} disabled={processandoCard}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
                {processandoCard ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
                <span className="text-sm font-medium">{processandoCard ? 'Processando…' : 'Adicionar imagem do card'}</span>
                <span className="text-xs">Ideal vertical (pôster 4:5). Se vazio, usa a capa do banner.</span>
              </button>
            )}
          </div>

          {/* Cor */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cor</label>
            <div className="flex flex-wrap items-center gap-2">
              {BANCO_CORES.map((cc) => (
                <button key={cc} type="button" onClick={() => setCor(cc)} title={cc}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', cor === cc && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                  style={{ background: cc }}>
                  {cor === cc && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
              <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor personalizada">
                <span className="absolute inset-0" style={{ background: cor && !BANCO_CORES.includes(cor) ? cor : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                <input type="color" value={cor ?? '#6d28d9'} onChange={(e) => setCor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            </div>
          </div>

          {/* Ícone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ícone</label>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-6">
              {Object.entries(BANCO_ICONES).map(([key, Ic]) => (
                <button key={key} type="button" onClick={() => setIcone(key)}
                  className={cn('flex h-11 items-center justify-center rounded-lg border transition-colors', icone === key ? 'border-transparent text-white' : 'text-muted-foreground hover:bg-muted')}
                  style={icone === key ? { background: c } : undefined}>
                  <Ic className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar personalização
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Pré-visualização do card (formato pôster) */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia do card</p>
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
          {imgCard ? (
            <img src={imgCard} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
          )}
          {!imgCard && <Preview className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
          <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}>
            <Preview className="h-4 w-4" />
          </span>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Banco de questões</p>
            <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{nome || 'Nome do banco'}</h3>
            <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{banco.total} {banco.total === 1 ? 'questão' : 'questões'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
