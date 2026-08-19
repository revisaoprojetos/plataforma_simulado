'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MarkdownContent } from '@/components/markdown-content'
import { cn } from '@/lib/utils'
import {
  MousePointer2, Highlighter, Circle, Hash, Trash2, Save, Loader2, Lock, BookOpen, ListChecks, Shapes,
} from 'lucide-react'
import { CorrecaoFolha, ICONES, type Ferramenta, type Marca } from '@/components/admin/correcao-folha'
import { assumirCorrecao, salvarCorrecao, salvarAnotacao, removerAnotacao, atualizarAnotacao } from '@/app/admin/correcao/actions'

interface Comp { id: string; nome: string; pontos: number; nota: number | null; comentario: string }

const PALETA = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const COR_GERAL = '#64748b'
const gerarTemp = () => 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const FERRAMENTAS: { id: Ferramenta; nome: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'selecionar', nome: 'Selecionar', Icon: MousePointer2 },
  { id: 'destaque', nome: 'Destaque', Icon: Highlighter },
  { id: 'ponto', nome: 'Ponto', Icon: Circle },
  { id: 'icone', nome: 'Ícone', Icon: Shapes },
  { id: 'bolinha', nome: 'Bolinha', Icon: Hash },
]

/**
 * Mesa de correção (Fase 2 / Fatia 1): 3 colunas —
 *  ① índice dos quesitos (competências) com contagem de marcas e estado (navega/zooma a folha),
 *  ② folha do aluno com camada de anotações (destaque/ponto/ícone/bolinha, coords 0–1),
 *  ③ inspetor: espelho + avaliação por competência + feedback + "Devolver".
 * As marcas são coloridas pelo quesito ativo (reforça o "ligamento dos pontos").
 */
export function CorrecaoMesa({
  respostaId, jaCorrigida, competencias, feedbackInicial, voltarUrl,
  paginas, anotacoesIniciais, espelho,
}: {
  respostaId: string
  jaCorrigida: boolean
  competencias: Comp[]
  feedbackInicial: string
  voltarUrl: string
  paginas: { arquivoId: string; url: string }[]
  anotacoesIniciais: Marca[]
  espelho: { enunciado: string; comentarioProfessor: string | null }
}) {
  const router = useRouter()
  // Avaliação (estado elevado p/ o índice ficar vivo).
  const [comps, setComps] = useState<Comp[]>(competencias)
  const [feedback, setFeedback] = useState(feedbackInicial)
  const [bloqueado, setBloqueado] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // Mesa.
  const [anotacoes, setAnotacoes] = useState<Marca[]>(anotacoesIniciais)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar')
  const [iconeAtivo, setIconeAtivo] = useState<string>('check')
  const [quesitoAtivo, setQuesitoAtivo] = useState<string | null>(competencias[0]?.id ?? null)
  const [paginaIndex, setPaginaIndex] = useState(0)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [focoId, setFocoId] = useState<string | null>(null)
  const [focoKey, setFocoKey] = useState(0)

  useEffect(() => {
    if (jaCorrigida) return
    assumirCorrecao(respostaId).then((r) => { if (!r.ok) setBloqueado(r.error ?? 'Indisponível') })
  }, [respostaId, jaCorrigida])

  const corDoQuesito = (compId: string | null) => {
    if (!compId) return COR_GERAL
    const i = comps.findIndex((c) => c.id === compId)
    return i >= 0 ? PALETA[i % PALETA.length] : COR_GERAL
  }
  const corAtiva = corDoQuesito(quesitoAtivo)
  const contarMarcas = (compId: string | null) => anotacoes.filter((a) => (a.competencia_id ?? null) === compId).length
  const selecionada = anotacoes.find((a) => a.id === selecionadaId) ?? null

  function focar(id: string | null) { if (!id) return; setFocoId(id); setFocoKey((k) => k + 1) }
  function irParaQuesito(compId: string | null) {
    setQuesitoAtivo(compId)
    const primeira = anotacoes.find((a) => (a.competencia_id ?? null) === compId)
    if (primeira) { setSelecionadaId(primeira.id); focar(primeira.id) }
  }

  async function criar(m: Omit<Marca, 'id'>) {
    const tempId = gerarTemp()
    const payload = { ...m, competencia_id: quesitoAtivo, cor: corDoQuesito(quesitoAtivo) }
    setAnotacoes((a) => [...a, { ...payload, id: tempId }])
    const r = await salvarAnotacao(respostaId, payload)
    if (r.ok && r.id) setAnotacoes((a) => a.map((x) => (x.id === tempId ? { ...x, id: r.id! } : x)))
    else { setAnotacoes((a) => a.filter((x) => x.id !== tempId)); toast.error(r.error ?? 'Erro ao salvar marca') }
  }
  async function remover(id: string) {
    const bak = anotacoes
    setAnotacoes((a) => a.filter((x) => x.id !== id))
    if (selecionadaId === id) setSelecionadaId(null)
    if (!id.startsWith('tmp-')) { const r = await removerAnotacao(id); if (!r.ok) { setAnotacoes(bak); toast.error(r.error ?? 'Erro ao excluir') } }
  }
  async function religar(id: string, compId: string | null) {
    const cor = corDoQuesito(compId)
    setAnotacoes((a) => a.map((x) => (x.id === id ? { ...x, competencia_id: compId, cor } : x)))
    if (!id.startsWith('tmp-')) atualizarAnotacao(id, { competencia_id: compId, cor })
  }

  function setNota(id: string, nota: number) { setComps((cs) => cs.map((c) => (c.id === id ? { ...c, nota } : c))) }
  function setComentario(id: string, comentario: string) { setComps((cs) => cs.map((c) => (c.id === id ? { ...c, comentario } : c))) }

  const total = comps.reduce((acc, c) => acc + (Number(c.nota) || 0), 0)
  const maxTotal = comps.reduce((acc, c) => acc + c.pontos, 0)

  function salvar() {
    start(async () => {
      const r = await salvarCorrecao(respostaId, comps.map((c) => ({ competencia_id: c.id, nota: Number(c.nota) || 0, comentario: c.comentario })), feedback)
      if (r.ok) { toast.success(jaCorrigida ? 'Correção atualizada' : 'Correção devolvida ao aluno'); router.push(voltarUrl); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  const btnTool = (ativa: boolean) => cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors', ativa ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      {/* ① ÍNDICE / TRILHO */}
      <aside className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ListChecks className="h-4 w-4" /> Quesitos</p>
        <div className="space-y-1.5">
          {comps.map((c) => {
            const n = contarMarcas(c.id)
            const preenchido = c.nota != null
            const ativo = quesitoAtivo === c.id
            return (
              <button key={c.id} type="button" onClick={() => irParaQuesito(c.id)}
                className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: corDoQuesito(c.id) }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.nome}</span>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', preenchido ? 'bg-emerald-500' : 'bg-muted-foreground/30')} title={preenchido ? 'Avaliado' : 'Pendente'} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{(c.nota ?? 0).toFixed(1)} / {c.pontos.toFixed(1)} pts</span>
                  {n > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">{n} {n === 1 ? 'marca' : 'marcas'}</span>}
                </div>
              </button>
            )
          })}
          {/* Geral (marcas sem quesito) */}
          <button type="button" onClick={() => irParaQuesito(null)}
            className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', quesitoAtivo === null ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COR_GERAL }} />
              <span className="flex-1 text-sm font-medium">Geral</span>
              {contarMarcas(null) > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{contarMarcas(null)}</span>}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Marcas sem quesito</p>
          </button>
        </div>
      </aside>

      {/* ② FOLHA + FERRAMENTAS */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
          <div className="flex flex-wrap items-center gap-1">
            {FERRAMENTAS.map(({ id, nome, Icon }) => (
              <button key={id} type="button" onClick={() => setFerramenta(id)} className={btnTool(ferramenta === id)} title={nome}>
                <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{nome}</span>
              </button>
            ))}
          </div>
          {ferramenta === 'icone' && (
            <div className="flex items-center gap-1 border-l pl-2">
              {Object.entries(ICONES).map(([k, Ic]) => (
                <button key={k} type="button" onClick={() => setIconeAtivo(k)} title={k}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-md border', iconeAtivo === k ? 'border-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted')}>
                  <Ic className="h-4 w-4" style={{ color: corAtiva }} />
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Marcando:</span>
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: corAtiva }} />
              {quesitoAtivo ? (comps.find((c) => c.id === quesitoAtivo)?.nome ?? 'Quesito') : 'Geral'}
            </span>
          </div>
        </div>

        <CorrecaoFolha
          paginas={paginas}
          marcas={anotacoes}
          paginaIndex={paginaIndex}
          onPagina={setPaginaIndex}
          ferramenta={ferramenta}
          corAtiva={corAtiva}
          iconeAtivo={iconeAtivo}
          selecionadaId={selecionadaId}
          onSelecionar={setSelecionadaId}
          onCriar={criar}
          focoId={focoId}
          focoKey={focoKey}
        />

        {/* Marca selecionada */}
        {selecionada && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="h-3 w-3 rounded-full" style={{ background: selecionada.cor || COR_GERAL }} />
              Marca: {selecionada.tipo}
            </span>
            <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              Quesito
              <select value={selecionada.competencia_id ?? ''} onChange={(e) => religar(selecionada.id, e.target.value || null)}
                className="rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring">
                <option value="">Geral</option>
                {comps.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => remover(selecionada.id)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5">
              <Trash2 className="h-3.5 w-3.5" /> Excluir marca
            </button>
          </div>
        )}
      </div>

      {/* ③ INSPETOR: espelho + avaliação */}
      <aside className="space-y-3">
        <details className="rounded-lg border bg-muted/20 p-3" open>
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground"><BookOpen className="mr-1 inline h-4 w-4" /> Espelho de correção</summary>
          <div className="mt-2 space-y-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Enunciado</p>
              <MarkdownContent className="text-sm leading-relaxed">{espelho.enunciado || '—'}</MarkdownContent>
            </div>
            {espelho.comentarioProfessor && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gabarito / comentário</p>
                <MarkdownContent className="text-sm leading-relaxed">{espelho.comentarioProfessor}</MarkdownContent>
              </div>
            )}
          </div>
        </details>

        {bloqueado ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            <Lock className="h-4 w-4" /> {bloqueado}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Avaliação</h2>
              <span className="text-xs text-muted-foreground">Total <strong className="text-foreground">{total.toFixed(1)}</strong> / {maxTotal.toFixed(1)}</span>
            </div>
            {comps.length === 0 && <p className="text-sm text-muted-foreground">Esta questão não tem competências — use o feedback abaixo (nota 0).</p>}
            {comps.map((c) => (
              <div key={c.id} className="space-y-1.5 rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDoQuesito(c.id) }} />
                    <span className="truncate">{c.nome}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1 text-sm">
                    <input type="number" step="0.5" min="0" max={c.pontos} value={c.nota ?? ''}
                      onChange={(e) => setNota(c.id, Math.min(c.pontos, Math.max(0, Number(e.target.value))))}
                      className="w-16 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-right outline-none focus:ring-1 focus:ring-ring" />
                    <span className="text-muted-foreground">/ {c.pontos}</span>
                  </div>
                </div>
                <input value={c.comentario} onChange={(e) => setComentario(c.id, e.target.value)} placeholder="Comentário do critério (opcional)"
                  className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Feedback geral</label>
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Observações gerais para o aluno…"
                className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <Button onClick={salvar} disabled={pending} className="w-full">
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {jaCorrigida ? 'Atualizar correção' : 'Devolver ao aluno'}
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}
