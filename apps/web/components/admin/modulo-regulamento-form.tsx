'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, ScrollText, Zap } from 'lucide-react'
import { salvarRegulamentoModulo } from '@/app/admin/leitura/actions'
import { type RegulamentoConfig, embedVideoUrl } from '@/lib/leitura/regulamento'
import { type PontuacaoLeitura } from '@/lib/leitura/pontuacao'

/**
 * Regulamento do módulo (LegProc): área descritiva que o aluno consulta na aba "Regulamento" — título,
 * descrição, vídeo (YouTube/Vimeo) e as metas/ganhos (derivados AUTOMATICAMENTE da pontuação do módulo).
 */
export function ModuloRegulamentoForm({ pastaId, atual, pontuacao }: { pastaId: string; atual: RegulamentoConfig; pontuacao: PontuacaoLeitura }) {
  const [cfg, setCfg] = useState<RegulamentoConfig>(atual)
  const [salvando, setSalvando] = useState(false)
  const embed = embedVideoUrl(cfg.video_url)

  async function salvar() {
    setSalvando(true)
    const r = await salvarRegulamentoModulo(pastaId, cfg)
    setSalvando(false)
    if (r.ok) toast.success('Regulamento salvo'); else toast.error(r.error ?? 'Erro ao salvar')
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ScrollText className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Regulamento do módulo</h3>
            <p className="text-xs text-muted-foreground">Aba que o aluno consulta: descrição do conteúdo, um vídeo e os ganhos/metas (puxados da pontuação abaixo).</p>
          </div>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg((c) => ({ ...c, ativo: e.target.checked }))} className="h-4 w-4 rounded border" />
          Ativo
        </label>
      </div>

      {cfg.ativo && (
        <div className="space-y-3">
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Título</span>
            <input value={cfg.titulo} onChange={(e) => setCfg((c) => ({ ...c, titulo: e.target.value }))} maxLength={80} placeholder="Regulamento do desafio"
              className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Descrição</span>
            <textarea value={cfg.descricao} onChange={(e) => setCfg((c) => ({ ...c, descricao: e.target.value }))} rows={5} placeholder="Explique como funciona o módulo, o que o aluno precisa saber, prazos, etc."
              className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Vídeo (YouTube ou Vimeo)</span>
            <input value={cfg.video_url} onChange={(e) => setCfg((c) => ({ ...c, video_url: e.target.value }))} placeholder="https://youtube.com/watch?v=…"
              className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            {cfg.video_url && !embed && <span className="text-[11px] text-amber-600 dark:text-amber-400">Link não reconhecido como YouTube/Vimeo — o aluno verá um botão "Assistir".</span>}
          </label>

          {embed && (
            <div className="overflow-hidden rounded-xl border">
              <div className="aspect-video w-full"><iframe src={embed} className="h-full w-full" title="Prévia do vídeo" allowFullScreen /></div>
            </div>
          )}

          {/* Prévia das metas/ganhos — derivadas da pontuação do módulo (read-only). */}
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Zap className="h-3.5 w-3.5 text-primary" /> Ganhos & metas (da pontuação do módulo)</p>
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <li>• <strong className="text-foreground">+{pontuacao.pontos_aula}</strong> pts por aula concluída</li>
              <li>• <strong className="text-foreground">+{pontuacao.pontos_acerto}</strong> pts por acerto no quiz</li>
              {pontuacao.combo_ativo && <li>• <strong className="text-foreground">+{pontuacao.combo_bonus}</strong> pts de bônus ao gabaritar uma aula</li>}
            </ul>
            <p className="mt-1.5 text-[11px] text-muted-foreground/80">Edite esses valores na aba "Configurações" → Pontuação.</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
        </button>
      </div>
    </div>
  )
}
