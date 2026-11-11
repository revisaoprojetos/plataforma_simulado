'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, Loader2, Merge, Save, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { MarkdownContent } from '@/components/markdown-content'
import { codigoQuestao } from '@/lib/codigo-questao'
import { cn } from '@/lib/utils'
import type { DetalheQuestao } from '@/app/admin/banco-questoes/actions-tipos'
import type { OpcoesQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { ROTULO_NIVEL_DUP, type NivelDup, type UsoQ } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import { cacheG, lerG, postG, prefetchG } from './questoes-api'

const URL_API = '/api/admin/revisao/biblioteca/questoes'
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const campo = 'h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60'
const lbl = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground'

interface Ficha {
  ok: boolean; error?: string
  questao: { id: string; codigo: string | null; status: string | null; tipo: string | null; nivel_dificuldade: string | null; ano: number | null; cargo: string | null; assunto_detalhe: string | null; versao: number | null; anulada: boolean | null; disciplina_id: string | null; assunto_id: string | null; banca_id: string | null; orgao_id: string | null }
  etiquetaIds: string[]; uso: UsoQ; simulados: { id: string; titulo: string; status: string | null }[]
  feedbacks: { tipo: string | null; mensagem: string; status: string | null; criadoEm: string | null }[]
  duplicadas: { nivel: NivelDup; outros: string[] } | null
}
const DETALHES = new Map<string, { t: number; v: any }>()
async function lerDetalhe(id: string): Promise<{ ok: boolean; detalhe?: DetalheQuestao }> {
  const e = DETALHES.get(id); if (e && Date.now() - e.t < 60_000) return e.v
  try { const r = await fetch(`${URL_API}?detalhe=${id}`, { cache: 'no-store' }); const j = await r.json(); if (j?.ok) DETALHES.set(id, { t: Date.now(), v: j }); return j } catch { return { ok: false } }
}
/** Pré-carrega ficha + enunciado/alternativas ao pairar no "Abrir": o painel abre na hora. */
export function prefetchPainel(id: string) { prefetchG({ s: 'ficha', id }); void lerDetalhe(id) }
export function limparCachePainel() { DETALHES.clear() }

/** PAINEL LATERAL da questão: leitura rica (enunciado, alternativas com gabarito, uso em simulados/respostas, reportes, duplicadas) +
 *  edição rápida da CLASSIFICAÇÃO e das ETIQUETAS (mesma rota de gestão). O editor completo (texto, alternativas, gabarito) continua
 *  sendo o /admin/questoes/[id]/editar — aqui há o atalho. */
export function QuestaoPainel({ id, opcoes, podeEditar, onFechar, onMudou, onIrDuplicadas }: {
  id: string | null; opcoes: OpcoesQ | null; podeEditar: boolean; onFechar: () => void; onMudou: () => void; onIrDuplicadas: (grupoIds: string[]) => void
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [det, setDet] = useState<DetalheQuestao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [d, setD] = useState({ disc: '', ass: '', banca: '', orgao: '', ano: '', dif: '', cargo: '', status: '' })
  const [assuntos, setAssuntos] = useState<{ id: string; nome: string }[]>([])
  const [ets, setEts] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async (qid: string, fresh = false) => {
    setErro(null)
    const [f, dt] = await Promise.all([lerG<Ficha>({ s: 'ficha', id: qid }, { fresh }), lerDetalhe(qid)])
    if (!f.ok) { setErro(f.error ?? 'Não foi possível carregar a questão.'); return }
    setFicha(f); setDet(dt.ok ? dt.detalhe ?? null : null)
    const q = f.questao
    setD({ disc: q.disciplina_id ?? '', ass: q.assunto_id ?? '', banca: q.banca_id ?? '', orgao: q.orgao_id ?? '', ano: q.ano != null ? String(q.ano) : '', dif: q.nivel_dificuldade ?? '', cargo: q.cargo ?? '', status: q.status ?? '' })
    setEts(new Set(f.etiquetaIds))
  }, [])

  useEffect(() => {
    if (!id) return
    const f = cacheG<Ficha>({ s: 'ficha', id })
    if (!f || f.questao?.id !== id) { setFicha(null); setDet(null) }
    void carregar(id)
  }, [id, carregar])
  useEffect(() => {
    setAssuntos([])
    if (!d.disc) return
    let vivo = true
    fetch(`${URL_API}?assuntos=${d.disc}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (vivo) setAssuntos(j.assuntos ?? []) }).catch(() => {})
    return () => { vivo = false }
  }, [d.disc])

  const q = ficha?.questao
  const alterado = useMemo(() => {
    if (!q) return false
    return d.disc !== (q.disciplina_id ?? '') || d.ass !== (q.assunto_id ?? '') || d.banca !== (q.banca_id ?? '') || d.orgao !== (q.orgao_id ?? '') || d.ano !== (q.ano != null ? String(q.ano) : '')
      || d.dif !== (q.nivel_dificuldade ?? '') || d.cargo !== (q.cargo ?? '') || d.status !== (q.status ?? '')
  }, [d, q])
  const anoRuim = d.ano !== '' && !(Number(d.ano) >= 1950 && Number(d.ano) <= 2100)

  async function salvar() {
    if (!q || !id) return
    const patch: Record<string, unknown> = {}
    if (d.disc !== (q.disciplina_id ?? '') || d.ass !== (q.assunto_id ?? '')) { patch.disciplinaId = d.disc || null; patch.assuntoId = d.disc && d.ass ? d.ass : null }
    if (d.banca !== (q.banca_id ?? '')) patch.bancaId = d.banca || null
    if (d.orgao !== (q.orgao_id ?? '')) patch.orgaoId = d.orgao || null
    if (d.ano !== (q.ano != null ? String(q.ano) : '')) patch.ano = d.ano ? Number(d.ano) : null
    if (d.dif !== (q.nivel_dificuldade ?? '')) patch.dificuldade = d.dif || null
    if (d.cargo !== (q.cargo ?? '')) patch.cargo = d.cargo.trim() || null
    if (d.status !== (q.status ?? '') && d.status) patch.status = d.status
    setSalvando(true)
    const r = await postG('classificar', { ids: [id], patch, soPreencher: false })
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
    toast.success('Classificação salva.'); limparCachePainel(); await carregar(id, true); onMudou()
  }
  async function alternarEtiqueta(etId: string) {
    if (!id || !podeEditar) return
    const tinha = ets.has(etId)
    setEts((s) => { const n = new Set(s); tinha ? n.delete(etId) : n.add(etId); return n }) // otimista
    const r = await postG('etiqueta_massa', { ids: [id], etiquetaId: etId, modo: tinha ? 'remover' : 'aplicar' })
    if (!r.ok) { setEts((s) => { const n = new Set(s); tinha ? n.add(etId) : n.delete(etId); return n }); toast.error(r.error || 'Não foi possível alterar a etiqueta.'); return }
    onMudou()
  }

  const uso = ficha?.uso
  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onFechar() }}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
            {id && <CopiarCodigo codigo={codigoQuestao(id, q?.codigo)} />}
            {q?.status && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', q.status === 'publicada' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : q.status === 'rascunho' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>{q.status === 'publicada' ? 'Ativa' : q.status === 'rascunho' ? 'Rascunho' : 'Arquivada'}</span>}
            {q?.anulada && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Anulada</span>}
            {q && <span className="text-xs font-normal text-muted-foreground">v{q.versao ?? 1}</span>}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 text-xs">
            Painel rápido da questão.
            {id && <Link href={`/admin/questoes/${id}/editar`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><ExternalLink className="h-3 w-3" />Abrir no editor completo</Link>}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
          {erro && <div className="rounded-xl border p-4 text-center text-sm"><p className="mb-2 text-destructive">{erro}</p><Button variant="outline" size="sm" onClick={() => id && void carregar(id, true)}>Tentar de novo</Button></div>}
          {!ficha && !erro && (
            <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Carregando questão">
              {[60, 90, 40, 80, 70].map((w, i) => <div key={i} className="h-8 rounded-lg bg-muted" style={{ width: `${w}%` }} />)}
            </div>
          )}

          {ficha && q && (
            <>
              {ficha.duplicadas && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <div className="flex-1"><b>Possível duplicada</b> — {ROTULO_NIVEL_DUP[ficha.duplicadas.nivel].toLowerCase()} ({ficha.duplicadas.outros.length} {ficha.duplicadas.outros.length === 1 ? 'outra questão' : 'outras questões'}).</div>
                  <Button size="sm" variant="outline" onClick={() => onIrDuplicadas([q.id, ...ficha.duplicadas!.outros])}><Merge />Revisar</Button>
                </div>
              )}

              <section aria-label="Classificação">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classificação</h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className={lbl}>Disciplina
                    <select className={campo} disabled={!podeEditar} value={d.disc} onChange={(e) => setD((x) => ({ ...x, disc: e.target.value, ass: '' }))} aria-label="Disciplina">
                      <option value="">Sem disciplina</option>{(opcoes?.disciplinas ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </label>
                  <label className={lbl}>Assunto
                    <select className={campo} disabled={!podeEditar || !d.disc} value={d.ass} onChange={(e) => setD((x) => ({ ...x, ass: e.target.value }))} aria-label="Assunto">
                      <option value="">{d.disc ? 'Sem assunto' : 'Escolha a disciplina'}</option>
                      {d.ass && !assuntos.some((a) => a.id === d.ass) && <option value={d.ass}>(assunto atual)</option>}
                      {assuntos.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </label>
                  <label className={lbl}>Banca
                    <select className={campo} disabled={!podeEditar} value={d.banca} onChange={(e) => setD((x) => ({ ...x, banca: e.target.value }))} aria-label="Banca">
                      <option value="">Sem banca</option>{(opcoes?.bancas ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </label>
                  <label className={lbl}>Órgão
                    <select className={campo} disabled={!podeEditar} value={d.orgao} onChange={(e) => setD((x) => ({ ...x, orgao: e.target.value }))} aria-label="Órgão">
                      <option value="">Sem órgão</option>{(opcoes?.orgaos ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </label>
                  <label className={lbl}>Ano
                    <input className={campo} disabled={!podeEditar} inputMode="numeric" value={d.ano} onChange={(e) => setD((x) => ({ ...x, ano: e.target.value.replace(/\D/g, '').slice(0, 4) }))} aria-label="Ano" placeholder="Sem ano" />
                  </label>
                  <label className={lbl}>Dificuldade
                    <select className={campo} disabled={!podeEditar} value={d.dif} onChange={(e) => setD((x) => ({ ...x, dif: e.target.value }))} aria-label="Dificuldade">
                      <option value="">Sem dificuldade</option><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option>
                    </select>
                  </label>
                  <label className={lbl}>Cargo
                    <input className={campo} disabled={!podeEditar} value={d.cargo} maxLength={200} onChange={(e) => setD((x) => ({ ...x, cargo: e.target.value }))} aria-label="Cargo" placeholder="Sem cargo" />
                  </label>
                  <label className={lbl}>Status
                    <select className={campo} disabled={!podeEditar} value={d.status} onChange={(e) => setD((x) => ({ ...x, status: e.target.value }))} aria-label="Status">
                      <option value="publicada">Ativa (publicada)</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option>
                    </select>
                  </label>
                </div>
                {q.assunto_detalhe && <p className="mt-2 text-xs text-muted-foreground">Assunto específico: <span className="text-foreground">{q.assunto_detalhe}</span></p>}
                {podeEditar && (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    {alterado && <Button variant="ghost" size="sm" disabled={salvando} onClick={() => id && void carregar(id)}>Descartar</Button>}
                    <Button size="sm" disabled={!alterado || anoRuim || salvando} onClick={() => void salvar()}>{salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar classificação</Button>
                  </div>
                )}
                {d.status !== (q.status ?? '') && d.status !== 'publicada' && (uso?.simulados ?? 0) > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Esta questão está em {uso!.simulados} simulado(s) e tem {uso!.respostas.toLocaleString('pt-BR')} resposta(s): arquivar/rascunho só a esconde do aluno; o histórico é preservado.</p>}
              </section>

              <section aria-label="Etiquetas">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(opcoes?.etiquetas ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada. Crie na sub-aba Etiquetas.</p>}
                  {(opcoes?.etiquetas ?? []).map((e) => {
                    const on = ets.has(e.id); const cor = e.cor ?? '#64748b'
                    return (
                      <button key={e.id} type="button" disabled={!podeEditar} onClick={() => void alternarEtiqueta(e.id)} aria-pressed={on} title={on ? 'Clique para remover' : 'Clique para aplicar'}
                        className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60', on ? '' : 'border-dashed opacity-70 hover:opacity-100')}
                        style={on ? { background: `${cor}26`, color: cor, borderColor: cor } : undefined}>
                        <Tag className="h-3 w-3" />{e.nome}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section aria-label="Enunciado e alternativas">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enunciado e alternativas</h3>
                {!det ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : (
                  <div className="space-y-2">
                    {det.enunciado && <div className="rounded-lg border bg-background p-3 text-sm leading-relaxed"><MarkdownContent>{det.enunciado}</MarkdownContent></div>}
                    {det.alternativas.map((a) => (
                      <div key={a.ordem} className={cn('rounded-lg border p-2.5 text-sm', a.correta && 'border-emerald-500/40 bg-emerald-500/5')}>
                        <p className={cn('font-semibold', a.correta && 'text-emerald-600 dark:text-emerald-400')}>{LETRAS[a.ordem] ?? '?'}){a.correta ? ' ✓ correta' : ''} <MarkdownContent inline className="font-normal text-foreground">{a.texto}</MarkdownContent></p>
                        {a.comentario && <div className="mt-1 text-xs text-muted-foreground"><b className="text-foreground">Comentário:</b> <MarkdownContent inline>{a.comentario}</MarkdownContent></div>}
                      </div>
                    ))}
                    {det.alternativas.length === 0 && <p className="text-xs text-muted-foreground">Sem alternativas cadastradas.</p>}
                    {det.comentario_professor && <div className="rounded-lg border bg-background p-2.5 text-sm"><b>Comentário do professor:</b> <MarkdownContent inline className="text-muted-foreground">{det.comentario_professor}</MarkdownContent></div>}
                  </div>
                )}
              </section>

              <section aria-label="Uso">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Onde é usada</h3>
                <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-4">
                  {([['simulados', 'Simulados'], ['respostas', 'Respostas'], ['favoritos', 'Favoritos'], ['comentarios', 'Comentários'], ['bancos', 'Bancos'], ['conteudos', 'Conteúdos'], ['feedbacks', 'Reportes']] as const).map(([k, r]) => (
                    <div key={k} className="rounded-lg border p-2"><div className="text-base font-semibold tabular-nums">{(uso?.[k] ?? 0).toLocaleString('pt-BR')}</div><div className="text-muted-foreground">{r}</div></div>
                  ))}
                </div>
                {ficha.simulados.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {ficha.simulados.map((s) => <li key={s.id}><Link href={`/admin/simulados/${s.id}`} className="text-primary hover:underline">{s.titulo}</Link> <span className="text-muted-foreground">· {s.status === 'publicado' ? 'publicado' : s.status === 'encerrado' ? 'encerrado' : 'rascunho'}</span></li>)}
                  </ul>
                )}
              </section>

              {ficha.feedbacks.length > 0 && (
                <section aria-label="Reportes de erro">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reportes de erro dos alunos</h3>
                  <ul className="space-y-1.5">
                    {ficha.feedbacks.map((f, i) => (
                      <li key={i} className="rounded-lg border p-2 text-xs"><span className="mr-1.5 rounded-full bg-muted px-1.5 py-0.5 font-medium">{f.tipo ?? 'outro'}</span><span className="text-muted-foreground">{f.status}</span><p className="mt-1">{f.mensagem || '—'}</p></li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
