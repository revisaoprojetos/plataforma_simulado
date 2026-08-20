'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MarkdownContent } from '@/components/markdown-content'
import { cn } from '@/lib/utils'
import {
  MousePointer2, Highlighter, Circle, Hash, Type, Trash2, Save, Loader2, Lock, ListChecks, Shapes,
  Flag, Check, RotateCcw, AlertTriangle, MessageSquare, Lightbulb, FileText, Image as ImageIcon,
} from 'lucide-react'
import { CorrecaoFolha, ICONES, type Ferramenta, type Marca } from '@/components/admin/correcao-folha'
import { assumirCorrecao, salvarCorrecao, salvarQuesito, salvarAnotacao, removerAnotacao, atualizarAnotacao } from '@/app/admin/correcao/actions'

interface Comp { id: string; nome: string; pontos: number; nota: number | null; comentario: string; audit_state: string; mensagem: string }

const PALETA = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const COR_GERAL = '#64748b'
const gerarTemp = () => 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const FERRAMENTAS: { id: Ferramenta; nome: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'selecionar', nome: 'Selecionar', Icon: MousePointer2 },
  { id: 'destaque', nome: 'Destaque', Icon: Highlighter },
  { id: 'ponto', nome: 'Ponto', Icon: Circle },
  { id: 'icone', nome: 'Ícone', Icon: Shapes },
  { id: 'bolinha', nome: 'Bolinha', Icon: Hash },
  { id: 'texto', nome: 'Texto', Icon: Type },
]
type Filtro = 'todos' | 'pendentes' | 'revisar' | 'aprovados' | 'com_marca'
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'todos', nome: 'Todos' }, { id: 'pendentes', nome: 'Pendentes' },
  { id: 'revisar', nome: 'Revisar' }, { id: 'aprovados', nome: 'Aprovados' }, { id: 'com_marca', nome: 'Com marca' },
]
const dotEstado = (s: string) => (s === 'approved' ? 'bg-emerald-500' : s === 'review' ? 'bg-amber-500' : 'bg-muted-foreground/30')
const SEV_CLS: Record<string, string> = {
  alto: 'border-destructive/30 bg-destructive/5 text-destructive',
  medio: 'border-amber-300/50 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  baixo: 'border-sky-300/50 bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:text-sky-300',
}

/**
 * Mesa de correção (estilo AURÉA) — 3 colunas em altura cheia:
 *  ① trilho de quesitos (estado/nota/marcas + filtros) · ② PROVA do aluno (grande, anotável) ou
 *  o ENUNCIADO/espelho · ③ inspetor do quesito ATIVO (nota, fundamentação, devolutiva travada, ritual).
 * Preenche o corpo do shell de tela cheia (CorrecaoSessao). Fecho da questão no rodapé do inspetor.
 */
export function CorrecaoMesa({
  respostaId, jaCorrigida, competencias, feedbackInicial, voltarUrl,
  paginas, anotacoesIniciais, espelho, embedded, onDevolvido,
}: {
  respostaId: string
  jaCorrigida: boolean
  competencias: Comp[]
  feedbackInicial: string
  voltarUrl: string
  paginas: { arquivoId: string; url: string }[]
  anotacoesIniciais: Marca[]
  espelho: { enunciado: string; comentarioProfessor: string | null }
  embedded?: boolean
  onDevolvido?: () => void
}) {
  const router = useRouter()
  const [comps, setComps] = useState<Comp[]>(competencias)
  const compsRef = useRef(comps); useEffect(() => { compsRef.current = comps }, [comps])
  const [feedback, setFeedback] = useState(feedbackInicial)
  const [bloqueado, setBloqueado] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [anotacoes, setAnotacoes] = useState<Marca[]>(anotacoesIniciais)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar')
  const [iconeAtivo, setIconeAtivo] = useState<string>('check')
  const [quesitoAtivo, setQuesitoAtivo] = useState<string | null>(competencias[0]?.id ?? null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [aba, setAba] = useState<'prova' | 'enunciado'>('prova')
  const [paginaIndex, setPaginaIndex] = useState(0)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [focoId, setFocoId] = useState<string | null>(null)
  const [focoKey, setFocoKey] = useState(0)

  useEffect(() => {
    if (jaCorrigida) return
    assumirCorrecao(respostaId).then((r) => { if (!r.ok) setBloqueado(r.error ?? 'Indisponível') })
  }, [respostaId, jaCorrigida])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === 'Escape') setSelecionadaId(null)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selecionadaId) { e.preventDefault(); remover(selecionadaId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecionadaId, anotacoes]) // eslint-disable-line react-hooks/exhaustive-deps

  const corDoQuesito = (compId: string | null) => {
    if (!compId) return COR_GERAL
    const i = comps.findIndex((c) => c.id === compId)
    return i >= 0 ? PALETA[i % PALETA.length] : COR_GERAL
  }
  const corAtiva = corDoQuesito(quesitoAtivo)
  const contarMarcas = (compId: string | null) => anotacoes.filter((a) => (a.competencia_id ?? null) === compId).length
  const selecionada = anotacoes.find((a) => a.id === selecionadaId) ?? null
  const ativo = comps.find((c) => c.id === quesitoAtivo) ?? null

  function focar(id: string | null) { if (!id) return; setFocoId(id); setFocoKey((k) => k + 1) }
  function irParaQuesito(compId: string | null) {
    setQuesitoAtivo(compId); setAba('prova')
    const primeira = anotacoes.find((a) => (a.competencia_id ?? null) === compId)
    if (primeira) { setSelecionadaId(primeira.id); focar(primeira.id) }
  }

  async function criar(m: Omit<Marca, 'id'>) {
    const tempId = gerarTemp()
    const payload = { ...m, competencia_id: quesitoAtivo, cor: corDoQuesito(quesitoAtivo) }
    setAnotacoes((a) => [...a, { ...payload, id: tempId }])
    if (m.tipo === 'texto') setSelecionadaId(tempId)
    const r = await salvarAnotacao(respostaId, payload)
    if (r.ok && r.id) { setAnotacoes((a) => a.map((x) => (x.id === tempId ? { ...x, id: r.id! } : x))); setSelecionadaId((s) => (s === tempId ? r.id! : s)) }
    else { setAnotacoes((a) => a.filter((x) => x.id !== tempId)); setSelecionadaId((s) => (s === tempId ? null : s)); toast.error(r.error ?? 'Erro ao salvar marca') }
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
  function atualizarMarca(id: string, patch: Partial<Marca>) {
    setAnotacoes((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    if (!id.startsWith('tmp-')) atualizarAnotacao(id, patch)
  }
  function patchMarcaLocal(id: string, patch: Partial<Marca>) { setAnotacoes((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x))) }
  function selecionarMarca(id: string | null) {
    setSelecionadaId(id)
    if (id) { const m = anotacoes.find((a) => a.id === id); if (m?.competencia_id) setQuesitoAtivo(m.competencia_id) }
  }

  function patchComp(id: string, patch: Partial<Comp>) { setComps((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))) }
  async function persistQuesito(id: string, override?: Partial<Comp>) {
    const c = { ...(compsRef.current.find((x) => x.id === id) ?? {} as Comp), ...override }
    const r = await salvarQuesito(respostaId, id, { nota: Number(c.nota) || 0, comentario: c.comentario ?? null, audit_state: c.audit_state, mensagem_aluno: c.mensagem ?? null })
    if (!r.ok) toast.error(r.error ?? 'Erro ao salvar quesito')
  }
  function editarNota(id: string, nota: number) {
    const c = comps.find((x) => x.id === id)
    patchComp(id, { nota, ...(c?.audit_state === 'approved' ? { audit_state: 'pending' } : {}) })
  }
  function mudarEstado(id: string, audit_state: string, avancar?: boolean) {
    patchComp(id, { audit_state })
    persistQuesito(id, { audit_state })
    if (avancar) { const i = comps.findIndex((c) => c.id === id); const prox = comps[i + 1]; if (prox) irParaQuesito(prox.id) }
  }

  const total = comps.reduce((acc, c) => acc + (Number(c.nota) || 0), 0)
  const maxTotal = comps.reduce((acc, c) => acc + c.pontos, 0)
  const auditados = comps.filter((c) => c.audit_state === 'approved').length
  const pctAud = comps.length ? Math.round((auditados / comps.length) * 100) : 0

  const alertas: { sev: string; msg: string; comp: string }[] = []
  for (const c of comps) {
    const nMarks = contarMarcas(c.id)
    if (c.audit_state === 'approved' && c.nota == null) alertas.push({ sev: 'alto', comp: c.id, msg: `“${c.nome}” aprovado sem nota definida.` })
    if (c.nota != null && c.nota > c.pontos) alertas.push({ sev: 'alto', comp: c.id, msg: `“${c.nome}”: nota acima do máximo (${c.pontos}).` })
    if (c.nota != null && c.nota < c.pontos && nMarks === 0) alertas.push({ sev: 'medio', comp: c.id, msg: `“${c.nome}” perdeu pontos sem nenhuma marca na folha.` })
    if (c.audit_state === 'approved' && !c.mensagem.trim()) alertas.push({ sev: 'baixo', comp: c.id, msg: `“${c.nome}” aprovado sem devolutiva ao aluno.` })
  }
  const alertasAtivo = ativo ? alertas.filter((a) => a.comp === ativo.id) : []

  const quesitosVis = comps.filter((c) => {
    if (filtro === 'pendentes') return c.audit_state === 'pending' || !c.audit_state
    if (filtro === 'revisar') return c.audit_state === 'review'
    if (filtro === 'aprovados') return c.audit_state === 'approved'
    if (filtro === 'com_marca') return contarMarcas(c.id) > 0
    return true
  })

  function salvar() {
    setPending(true)
    ;(async () => {
      const r = await salvarCorrecao(respostaId, comps.map((c) => ({ competencia_id: c.id, nota: Number(c.nota) || 0, comentario: c.comentario })), feedback)
      setPending(false)
      if (r.ok) {
        if (embedded && onDevolvido) { onDevolvido() }
        else { toast.success(jaCorrigida ? 'Correção atualizada' : 'Correção devolvida ao aluno'); router.push(voltarUrl); router.refresh() }
      } else toast.error(r.error ?? 'Erro ao salvar')
    })()
  }

  const btnTool = (a: boolean) => cn('flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors', a ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ① TRILHO */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="shrink-0 space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ListChecks className="h-4 w-4" /> Quesitos</p>
            <span className="text-xs font-medium text-muted-foreground">{quesitosVis.length}/{comps.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors', filtro === f.id ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                {f.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
          {quesitosVis.map((c) => {
            const n = contarMarcas(c.id)
            const at = quesitoAtivo === c.id
            return (
              <button key={c.id} type="button" onClick={() => irParaQuesito(c.id)}
                className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', at ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: corDoQuesito(c.id) }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.nome}</span>
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotEstado(c.audit_state))} title={c.audit_state === 'approved' ? 'Aprovado' : c.audit_state === 'review' ? 'Revisar' : 'Pendente'} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{(c.nota ?? 0).toFixed(1)} / {c.pontos.toFixed(1)} pts</span>
                  {n > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">{n} {n === 1 ? 'marca' : 'marcas'}</span>}
                </div>
              </button>
            )
          })}
          {quesitosVis.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhum quesito neste filtro.</p>}
          <button type="button" onClick={() => irParaQuesito(null)}
            className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', quesitoAtivo === null ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COR_GERAL }} />
              <span className="flex-1 text-sm font-medium">Geral</span>
              {contarMarcas(null) > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{contarMarcas(null)}</span>}
            </div>
          </button>
        </div>

        <div className="shrink-0 border-t p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between"><span>Nota</span><span className="font-semibold text-foreground">{total.toFixed(1)} / {maxTotal.toFixed(1)}</span></div>
          <div className="mt-1 flex items-center justify-between"><span>Auditado</span><span>{pctAud}%</span></div>
        </div>
      </aside>

      {/* ② PROVA / ENUNCIADO */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/10">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button type="button" onClick={() => setAba('prova')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', aba === 'prova' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><ImageIcon className="h-3.5 w-3.5" /> Prova</button>
            <button type="button" onClick={() => setAba('enunciado')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', aba === 'enunciado' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><FileText className="h-3.5 w-3.5" /> Enunciado</button>
          </div>
          {aba === 'prova' && (
            <>
              <div className="flex flex-wrap items-center gap-1">
                {FERRAMENTAS.map(({ id, nome, Icon }) => (
                  <button key={id} type="button" onClick={() => setFerramenta(id)} className={btnTool(ferramenta === id)} title={nome}>
                    <Icon className="h-3.5 w-3.5" /> <span className="hidden xl:inline">{nome}</span>
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
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: corAtiva }} />
                {quesitoAtivo ? (comps.find((c) => c.id === quesitoAtivo)?.nome ?? 'Quesito') : 'Geral'}
              </span>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          {aba === 'prova' ? (
            <CorrecaoFolha
              paginas={paginas} marcas={anotacoes} paginaIndex={paginaIndex} onPagina={setPaginaIndex}
              ferramenta={ferramenta} corAtiva={corAtiva} iconeAtivo={iconeAtivo}
              selecionadaId={selecionadaId} onSelecionar={selecionarMarca}
              onCriar={criar} onAtualizar={atualizarMarca} focoId={focoId} focoKey={focoKey}
            />
          ) : (
            <div className="mx-auto h-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-6">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Enunciado</p>
              <MarkdownContent className="text-sm leading-relaxed">{espelho.enunciado || '—'}</MarkdownContent>
              {espelho.comentarioProfessor && (
                <>
                  <p className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gabarito / espelho</p>
                  <MarkdownContent className="text-sm leading-relaxed">{espelho.comentarioProfessor}</MarkdownContent>
                </>
              )}
            </div>
          )}
        </div>

        {selecionada && aba === 'prova' && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-card px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="h-3 w-3 rounded-full" style={{ background: selecionada.cor || COR_GERAL }} /> Marca: {selecionada.tipo}
            </span>
            {selecionada.tipo === 'texto' && (
              <input value={selecionada.conteudo ?? ''} autoFocus
                onChange={(e) => patchMarcaLocal(selecionada.id, { conteudo: e.target.value })}
                onBlur={(e) => atualizarMarca(selecionada.id, { conteudo: e.target.value })}
                placeholder="Texto da nota…" className="min-w-[8rem] flex-1 rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" />
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Quesito
              <select value={selecionada.competencia_id ?? ''} onChange={(e) => religar(selecionada.id, e.target.value || null)}
                className="rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring">
                <option value="">Geral</option>
                {comps.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => remover(selecionada.id)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          </div>
        )}
      </div>

      {/* ③ INSPETOR DO QUESITO ATIVO */}
      <aside className="flex w-[27rem] shrink-0 flex-col border-l bg-card">
        {bloqueado ? (
          <div className="m-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            <Lock className="h-4 w-4" /> {bloqueado}
          </div>
        ) : !ativo ? (
          <div className="m-3 flex flex-col items-center gap-1 rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            <Lightbulb className="h-4 w-4" /> Selecione um quesito no índice para avaliá-lo.
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {/* kicker + estado */}
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: corDoQuesito(ativo.id) }} />
                <h2 className="min-w-0 flex-1 truncate text-base font-bold">{ativo.nome}</h2>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  ativo.audit_state === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : ativo.audit_state === 'review' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground')}>
                  {ativo.audit_state === 'approved' ? 'Aprovado' : ativo.audit_state === 'review' ? 'Revisar' : 'Pendente'}
                </span>
              </div>

              {/* alertas do quesito */}
              {alertasAtivo.length > 0 && (
                <div className="space-y-1.5">
                  {alertasAtivo.map((a, i) => (
                    <p key={i} className={cn('flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-snug', SEV_CLS[a.sev])}>
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a.msg}
                    </p>
                  ))}
                </div>
              )}

              {/* faixa de avaliação — nota */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                <span className="text-sm font-medium">Nota do quesito</span>
                <div className="flex items-center gap-1 text-sm">
                  <input type="number" step="0.5" min="0" max={ativo.pontos} value={ativo.nota ?? ''}
                    onChange={(e) => editarNota(ativo.id, Math.min(ativo.pontos, Math.max(0, Number(e.target.value))))}
                    onBlur={() => persistQuesito(ativo.id)}
                    className="w-24 rounded-md border bg-card px-2 py-1 text-right text-base font-semibold outline-none focus:ring-1 focus:ring-ring" />
                  <span className="text-muted-foreground">/ {ativo.pontos}</span>
                </div>
              </div>

              {/* ③ fundamentação */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fundamentação (privada — só o corretor vê)</label>
                <textarea value={ativo.comentario} onChange={(e) => patchComp(ativo.id, { comentario: e.target.value })} onBlur={() => persistQuesito(ativo.id)}
                  rows={2} placeholder="Motivo do desconto, observações técnicas…"
                  className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </div>

              {/* ④ devolutiva (travada até aprovar) */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" /> Devolutiva do quesito ao aluno
                  {ativo.audit_state !== 'approved' && <Lock className="h-3 w-3" />}
                </label>
                <textarea value={ativo.mensagem} disabled={ativo.audit_state !== 'approved'}
                  onChange={(e) => patchComp(ativo.id, { mensagem: e.target.value })} onBlur={() => persistQuesito(ativo.id)}
                  rows={4} placeholder={ativo.audit_state === 'approved' ? 'Mensagem ao aluno sobre este quesito…' : 'Aprove o quesito para liberar a devolutiva.'}
                  className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground" />
              </div>

              {/* ritual do quesito */}
              <div className="flex items-center gap-1.5">
                {ativo.audit_state === 'approved' ? (
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => mudarEstado(ativo.id, 'pending')}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reabrir
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => mudarEstado(ativo.id, 'review')}
                      style={ativo.audit_state === 'review' ? { borderColor: '#f59e0b', color: '#b45309' } : undefined}>
                      <Flag className="mr-1.5 h-3.5 w-3.5" /> Revisar
                    </Button>
                    <Button type="button" size="sm" className="flex-1" onClick={() => mudarEstado(ativo.id, 'approved', true)}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Aprovar e próximo
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* rodapé: fecho da QUESTÃO */}
            <div className="shrink-0 space-y-2 border-t bg-card p-3">
              <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback geral da questão (opcional)"
                className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Total <strong className="text-foreground">{total.toFixed(1)}</strong> / {maxTotal.toFixed(1)}</span>
                <Button onClick={salvar} disabled={pending} className="ml-auto">
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {jaCorrigida ? 'Atualizar' : 'Devolver questão'}
                </Button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
