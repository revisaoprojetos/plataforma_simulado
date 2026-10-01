'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ImagePlus, RefreshCw, Trash2, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CapaCard } from '@/components/aluno/capa-card'
import { TrilhaFundoCropper } from '@/components/admin/trilha-fundo-cropper'
import { DEGRADE_DIRS, DEFAULT_TRILHA_DEGRADE_IMAGEM, type TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'
import { DEFAULT_CAPA_VIEW, type CapaViewCfg, type CapaRect } from '@/lib/capa-meta'

export type CapaEditorValue = { orig: string | null; poster: CapaViewCfg; ticket: CapaViewCfg }
type Formato = 'poster' | 'ticket'
const ASPECTO: Record<Formato, number> = { poster: 4 / 5, ticket: 4 / 3 }
const ROTULO: Record<Formato, string> = { poster: 'Pôster (vertical 4:5)', ticket: 'Ticket (paisagem 4:3)' }

/**
 * Editor PROFISSIONAL da capa do card do simulado — reusa o cropper da trilha (TrilhaFundoCropper) e os
 * controles (desfoque/transparência/degradê). Enquadramento SEPARADO por formato (pôster 4:5 × ticket
 * 4:3), não-destrutivo: guarda a ORIGINAL + o recorte/efeitos de cada formato; a prévia usa o MESMO
 * CapaCard do aluno → WYSIWYG. `prepararImagem` = redimensiona o arquivo p/ dataURL (fica no parent).
 */
export function CapaEditorPro({ value, onChange, cor, icone, prepararImagem }: {
  value: CapaEditorValue
  onChange: (v: CapaEditorValue) => void
  cor: string
  icone?: string | null
  prepararImagem: (file: File) => Promise<string>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [crop, setCrop] = useState<Formato | null>(null)

  const setCfg = (f: Formato, patch: Partial<CapaViewCfg>) => onChange({ ...value, [f]: { ...value[f], ...patch } })
  const setDeg = (f: Formato, patch: Partial<TrilhaDegrade>) => {
    const base = value[f].degrade ?? DEFAULT_TRILHA_DEGRADE_IMAGEM
    setCfg(f, { degrade: { ...base, ...patch } })
  }

  async function enviar(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setEnviando(true)
    try {
      const dataUrl = await prepararImagem(file)
      // Nova imagem → zera os recortes (os efeitos ficam), p/ reenquadrar do zero.
      onChange({ orig: dataUrl, poster: { ...value.poster, crop: null }, ticket: { ...value.ticket, crop: null } })
      toast.success('Imagem enviada. Clique em "Ajustar" em cada formato para enquadrar.')
    } catch { toast.error('Falha ao carregar a imagem.') }
    finally { setEnviando(false) }
  }

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); e.target.value = '' }} />

      {!value.orig ? (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
          {enviando ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
          <span className="text-sm font-medium">Adicionar imagem do card</span>
          <span className="text-xs">Uma imagem serve aos dois formatos. Você enquadra cada um separadamente.</span>
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">A mesma imagem é enquadrada <strong>separadamente</strong> no pôster e no ticket. O card do aluno fica idêntico a cada prévia.</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Trocar
              </button>
              <button type="button" onClick={() => onChange({ orig: null, poster: { ...DEFAULT_CAPA_VIEW }, ticket: { ...DEFAULT_CAPA_VIEW } })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive" title="Remover imagem">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {(['poster', 'ticket'] as Formato[]).map((f) => (
              <FormatoSecao key={f} formato={f} cfg={value[f]} orig={value.orig!} cor={cor} icone={icone}
                onAjustar={() => setCrop(f)} setCfg={(patch) => setCfg(f, patch)} setDeg={(patch) => setDeg(f, patch)} />
            ))}
          </div>
        </>
      )}

      {crop && value.orig && (
        <TrilhaFundoCropper
          src={value.orig}
          titulo={`Ajustar ${crop === 'poster' ? 'pôster (4:5)' : 'ticket (4:3)'}`}
          aspectInicial={ASPECTO[crop]}
          aspectTravado={ASPECTO[crop]}
          cropInicial={(value[crop].crop as CapaRect | null) ?? null}
          onCancel={() => setCrop(null)}
          onConfirm={(c) => { setCfg(crop, { crop: c }); setCrop(null); toast.success('Enquadramento aplicado.') }}
        />
      )}
    </div>
  )
}

function FormatoSecao({ formato, cfg, orig, cor, icone, onAjustar, setCfg, setDeg }: {
  formato: Formato
  cfg: CapaViewCfg
  orig: string
  cor: string
  icone?: string | null
  onAjustar: () => void
  setCfg: (patch: Partial<CapaViewCfg>) => void
  setDeg: (patch: Partial<TrilhaDegrade>) => void
}) {
  const deg = cfg.degrade ?? DEFAULT_TRILHA_DEGRADE_IMAGEM
  const aspectCls = formato === 'poster' ? 'aspect-[4/5]' : 'aspect-[4/3]'
  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <p className="text-xs font-semibold">{ROTULO[formato]}</p>
      {/* Prévia WYSIWYG (mesmo CapaCard do aluno). Altura FIXA igual nos dois formatos → os controles
          abaixo alinham linha a linha (pôster e ticket ficam lado a lado, não um mais baixo). */}
      <div className="flex h-48 items-center justify-center">
        <div className={cn('group/card relative h-full overflow-hidden rounded-xl border', aspectCls)}>
          <CapaCard capa={orig} cor={cor} icone={icone} orig={orig} cfg={cfg} />
        </div>
      </div>
      <button type="button" onClick={onAjustar}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-primary/10 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
        <Crop className="h-3.5 w-3.5" /> {cfg.crop ? 'Reajustar posição / recorte' : 'Ajustar (posição / recorte)'}
      </button>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Desfoque</span><span className="tabular-nums">{cfg.desfoque ?? 0}px</span></span>
        <input type="range" min={0} max={24} step={1} value={cfg.desfoque ?? 0} onChange={(e) => setCfg({ desfoque: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
      </label>
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Transparência</span><span className="tabular-nums">{100 - (cfg.opacidade ?? 100)}%</span></span>
        <input type="range" min={0} max={100} step={1} value={100 - (cfg.opacidade ?? 100)} onChange={(e) => setCfg({ opacidade: 100 - Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
      </label>

      <div className="space-y-2 rounded-lg border bg-card p-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="text-[11px] font-semibold">Degradê (escurecer p/ legibilidade)</span>
          <input type="checkbox" checked={deg.ativo} onChange={(e) => setDeg({ ativo: e.target.checked })} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
        </label>
        <div className={cn('space-y-2', !deg.ativo && 'pointer-events-none opacity-50')}>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Intensidade</span><span className="tabular-nums">{deg.intensidade}%</span></span>
            <input type="range" min={0} max={100} step={1} value={deg.intensidade} disabled={!deg.ativo} onChange={(e) => setDeg({ intensidade: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Comprimento</span><span className="tabular-nums">{deg.comprimento}%</span></span>
            <input type="range" min={5} max={100} step={1} value={deg.comprimento} disabled={!deg.ativo} onChange={(e) => setDeg({ comprimento: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex min-w-[150px] flex-1 items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Direção</span>
              <select value={deg.direcao} disabled={!deg.ativo} onChange={(e) => setDeg({ direcao: e.target.value as TrilhaDegrade['direcao'] })}
                className="h-8 flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-xs outline-none focus:ring-1 focus:ring-ring">
                {DEGRADE_DIRS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Cor</span>
              <input type="color" value={deg.cor} disabled={!deg.ativo} onChange={(e) => setDeg({ cor: e.target.value })} className="h-7 w-10 cursor-pointer rounded border bg-transparent p-0.5" />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
