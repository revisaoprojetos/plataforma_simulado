'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarPontuacaoModulo } from '@/app/admin/leitura/actions'
import { type PontuacaoLeitura } from '@/lib/leitura/pontuacao'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

/**
 * Config de PONTUAÇÃO do módulo (LegProc) — usada pelo ranking/gamificação. Fica DORMENTE enquanto a
 * gamificação do tenant estiver desligada (o ranking usa só acertos); quando ligada, vale pontos por
 * aula concluída + por acerto + bônus de combo (aula gabaritada 100%).
 */
export function ModuloPontuacaoForm({ pastaId, atual }: { pastaId: string; atual: PontuacaoLeitura }) {
  const [cfg, setCfg] = useState<PontuacaoLeitura>(atual)
  const [salvando, setSalvando] = useState(false)
  const baseRef = useRef(JSON.stringify(atual))
  const dirty = JSON.stringify(cfg) !== baseRef.current

  function setNum(k: 'pontos_aula' | 'pontos_acerto' | 'combo_bonus', v: string) {
    const n = Math.max(0, Math.round(Number(v) || 0))
    setCfg((c) => ({ ...c, [k]: n }))
  }
  async function salvar(): Promise<boolean> {
    setSalvando(true)
    const r = await salvarPontuacaoModulo(pastaId, cfg)
    setSalvando(false)
    if (r.ok) { baseRef.current = JSON.stringify(cfg); return true }
    return false
  }
  async function salvarSozinho() {
    const ok = await salvar()
    if (ok) toast.success('Pontuação salva'); else toast.error('Erro ao salvar')
  }
  // No salvar único da aba Config, esconde o botão próprio e registra dirty + salvar.
  const noSalvarUnico = useRegistrarSalvavel(`${pastaId}:pontuacao`, dirty, salvar)

  const campo = (label: string, k: 'pontos_aula' | 'pontos_acerto' | 'combo_bonus', dica: string) => (
    <label className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input type="number" min={0} value={cfg[k]} onChange={(e) => setNum(k, e.target.value)}
        className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring" />
      <span className="block text-[11px] text-muted-foreground">{dica}</span>
    </label>
  )

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Pontuação (gamificação)</h3>
          <p className="text-xs text-muted-foreground">Define quantos pontos as aulas deste módulo geram no ranking. <strong>Fica dormente até a gamificação ser ativada</strong> — enquanto isso o ranking usa só os acertos.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {campo('Pontos por aula', 'pontos_aula', 'Ao concluir a aula (leitura + quiz).')}
        {campo('Pontos por acerto', 'pontos_acerto', 'Cada questão certa no quiz.')}
        {campo('Bônus de combo', 'combo_bonus', 'Por aula gabaritada (100%).')}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cfg.combo_ativo} onChange={(e) => setCfg((c) => ({ ...c, combo_ativo: e.target.checked }))} className="h-4 w-4 rounded border" />
        <span>Ligar o <strong>combo</strong> (bônus por aula gabaritada)</span>
      </label>

      {!noSalvarUnico && (
        <div className="flex justify-end">
          <button type="button" onClick={salvarSozinho} disabled={salvando}
            className={cn('inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50')}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar pontuação
          </button>
        </div>
      )}
    </div>
  )
}
