'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Sunset } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarDegradeModulo } from '@/app/admin/leitura/actions'
import { DEFAULT_TRILHA_DEGRADE, DEGRADE_DIRS, estiloDegrade, type TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

/**
 * FADE (degradê escuro) do BANNER do módulo — liga/desliga, intensidade e cor. É o mesmo efeito que
 * escurece o banner do admin e do aluno; a PRÉVIA aqui desenha o banner real + o degradê ao vivo (mesma
 * fórmula do ModuloBanner) enquanto você arrasta. Salva MESCLANDO em trilha_aparencia.degrade.
 */
export function ModuloFadeBannerForm({ pastaId, atual, banner, cor }: { pastaId: string; atual: TrilhaDegrade; banner?: string | null; cor?: string | null }) {
  const [degrade, setDegrade] = useState<TrilhaDegrade>(atual ?? DEFAULT_TRILHA_DEGRADE)
  const [salvando, setSalvando] = useState(false)
  const baseRef = useRef(JSON.stringify(atual ?? DEFAULT_TRILHA_DEGRADE))
  const dirty = JSON.stringify(degrade) !== baseRef.current

  async function salvar(): Promise<boolean> {
    setSalvando(true)
    const r = await salvarDegradeModulo(pastaId, degrade)
    setSalvando(false)
    if (r.ok) { baseRef.current = JSON.stringify(degrade); return true }
    return false
  }
  async function salvarSozinho() {
    const ok = await salvar()
    if (ok) toast.success('Fade do banner salvo'); else toast.error('Erro ao salvar')
  }
  const noSalvarUnico = useRegistrarSalvavel(`${pastaId}:fade-banner`, dirty, salvar)

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sunset className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Fade do banner</h3>
            <p className="text-xs text-muted-foreground">Degradê escuro sobre o banner do módulo (admin e aluno). Ligue/desligue, ajuste a <strong>intensidade</strong> e a <strong>cor</strong>. A prévia mostra o efeito ao vivo.</p>
          </div>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={degrade.ativo} onChange={(e) => setDegrade((d) => ({ ...d, ativo: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />
          Ativo
        </label>
      </div>

      {/* Prévia ao vivo do banner + degradê (mesma fórmula do ModuloBanner). */}
      <div className="relative overflow-hidden rounded-xl border bg-neutral-950" style={{ aspectRatio: '2740 / 400' }}>
        {banner
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0" style={cor ? { background: `linear-gradient(140deg, ${cor} 0%, #0a0a0a 130%)` } : undefined} />}
        <div className="absolute inset-0" style={estiloDegrade(degrade)} />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2 text-[11px] font-medium text-white/90">
          <span className="drop-shadow">Prévia do banner</span>
          <span className="tabular-nums drop-shadow">{degrade.ativo ? `${degrade.intensidade}%` : 'desligado'}</span>
        </div>
      </div>

      <div className={cn('grid gap-3 sm:grid-cols-2', !degrade.ativo && 'pointer-events-none opacity-50')}>
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Intensidade do fade</span><span className="tabular-nums">{degrade.intensidade}%</span></span>
          <input type="range" min={0} max={100} step={1} value={degrade.intensidade} disabled={!degrade.ativo} onChange={(e) => setDegrade((d) => ({ ...d, intensidade: Number(e.target.value) }))} className="w-full accent-[var(--primary)]" />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>Comprimento do fade</span><span className="tabular-nums">{degrade.comprimento}%</span></span>
          <input type="range" min={5} max={100} step={1} value={degrade.comprimento} disabled={!degrade.ativo} onChange={(e) => setDegrade((d) => ({ ...d, comprimento: Number(e.target.value) }))} className="w-full accent-[var(--primary)]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Direção</span>
          <select value={degrade.direcao} disabled={!degrade.ativo} onChange={(e) => setDegrade((d) => ({ ...d, direcao: e.target.value as TrilhaDegrade['direcao'] }))}
            className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            {DEGRADE_DIRS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">Cor</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{degrade.cor}</span>
          <input type="color" value={degrade.cor} disabled={!degrade.ativo} onChange={(e) => setDegrade((d) => ({ ...d, cor: e.target.value }))} className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5" />
        </label>
      </div>

      {!noSalvarUnico && (
        <div className="flex justify-end">
          <button type="button" onClick={salvarSozinho} disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}
    </div>
  )
}
