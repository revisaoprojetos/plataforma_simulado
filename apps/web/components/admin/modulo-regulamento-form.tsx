'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, ScrollText, Zap, Upload, FileText, Trash2, ExternalLink, Table as TableIcon, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const embed = embedVideoUrl(cfg.video_url)

  async function enviarPdf(file: File) {
    if (file.type && file.type !== 'application/pdf') { toast.error('Envie um PDF. (Documentos Word: exporte como PDF antes.)'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('PDF muito grande (máx. ~8 MB).'); return }
    setEnviando(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('alvo', 'draft'); fd.append('slot', 'material')
      const res = await fetch('/api/admin/material-pdf', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j?.error || 'Falha no upload.')
      setCfg((c) => ({ ...c, documento_url: j.url, documento_nome: j.nome || 'Regulamento.pdf' }))
      toast.success('PDF enviado — clique em Salvar para publicar.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha no upload.') }
    finally { setEnviando(false) }
  }

  // Edição da tabela nativa (linhas × colunas). 1ª linha = cabeçalho.
  const tabela = cfg.tabela ?? []
  const cols = tabela[0]?.length ?? 0
  const setTabela = (t: string[][]) => setCfg((c) => ({ ...c, tabela: t }))
  const criarTabela = () => setTabela([['Coluna 1', 'Coluna 2'], ['', ''], ['', '']])
  const addLinha = () => setTabela([...tabela, Array(Math.max(1, cols)).fill('')])
  const addColuna = () => setTabela(tabela.map((r) => [...r, '']))
  const delLinha = (i: number) => setTabela(tabela.filter((_, k) => k !== i))
  const delColuna = (j: number) => { const t = tabela.map((r) => r.filter((_, k) => k !== j)); setTabela(t.some((r) => r.length) ? t : []) }
  const setCel = (i: number, j: number, v: string) => setTabela(tabela.map((r, ri) => (ri === i ? r.map((c, ci) => (ci === j ? v : c)) : r)))

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

          {/* Documento (PDF) — visto dentro da plataforma pelo aluno (visualizador estilo Drive). */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Documento (PDF)</span>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarPdf(f); e.target.value = '' }} />
            {cfg.documento_url ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 truncate text-sm">{cfg.documento_nome || 'Regulamento.pdf'}</span>
                <a href={cfg.documento_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
                <button type="button" disabled={enviando} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">{enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Trocar</button>
                <button type="button" onClick={() => setCfg((c) => ({ ...c, documento_url: '', documento_nome: '' }))} title="Remover" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button type="button" disabled={enviando} onClick={() => fileRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar PDF do regulamento
              </button>
            )}
            <span className="block text-[11px] text-muted-foreground">O aluno vê o PDF dentro da plataforma (estilo Drive). PDF até ~8 MB. Word: exporte como PDF antes.</span>
          </div>

          {/* Tabela nativa — vista DENTRO do sistema (sem PDF). 1ª linha = cabeçalho. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><TableIcon className="h-3.5 w-3.5" /> Tabela (vista no sistema, sem PDF)</span>
              {tabela.length > 0 && <button type="button" onClick={() => setTabela([])} className="text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-destructive">Remover tabela</button>}
            </div>
            {tabela.length === 0 ? (
              <button type="button" onClick={criarTabela}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                <Plus className="h-4 w-4" /> Adicionar tabela
              </button>
            ) : (
              <div className="space-y-2">
                <div className="overflow-x-auto rounded-xl border">
                  <table className="border-collapse text-sm">
                    <tbody>
                      {tabela.map((row, i) => (
                        <tr key={i}>
                          {row.map((cel, j) => (
                            <td key={j} className={cn('border p-0', i === 0 && 'bg-muted/60')}>
                              <input value={cel} onChange={(e) => setCel(i, j, e.target.value)} placeholder={i === 0 ? `Coluna ${j + 1}` : '—'}
                                className={cn('w-full min-w-[9rem] bg-transparent px-2.5 py-1.5 outline-none focus:bg-primary/5', i === 0 && 'font-semibold')} />
                            </td>
                          ))}
                          <td className="whitespace-nowrap border-0 pl-1">
                            <button type="button" onClick={() => delLinha(i)} disabled={tabela.length <= 1} title="Remover linha"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addLinha} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Linha</button>
                  <button type="button" onClick={addColuna} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Coluna</button>
                  {cols > 1 && <button type="button" onClick={() => delColuna(cols - 1)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"><X className="h-3.5 w-3.5" /> Coluna</button>}
                </div>
                <span className="block text-[11px] text-muted-foreground">A 1ª linha é o cabeçalho. Aumente com “+ Linha” / “+ Coluna”. O aluno vê a tabela direto no sistema.</span>
              </div>
            )}
          </div>

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
