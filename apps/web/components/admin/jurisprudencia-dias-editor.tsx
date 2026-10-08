'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronRight, ChevronUp, Trash2, Loader2,
  Eye, EyeOff, Clock, CalendarClock, X, FilePlus2, Pencil, BookOpen, HelpCircle, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { brtLocalParaIso, isoParaBrtLocal } from '@/lib/brt'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  criarDiaDesafio, excluirDiaDesafio, reordenarDiasDesafio, definirPublicacaoDiasDesafio,
  editarLeituraDia, type DiaEstado,
} from '@/app/admin/jurisprudencia/actions'

// Shape de uma tese (casa com dados.js: ref, tema, q, o[3], a=índice correto, tese).
type Tese = { ref: string; tema: string; q: string; o: string[]; a: number; tese: string }
type Pub = { estado?: DiaEstado; publicarEm?: string | null }
type Dia = { titulo?: string; teses?: Tese[] | null; materia?: string | null; ordem?: number; pub?: Pub; documento_id?: string | null }
type Materia = { id: string; nome: string; curto: string; icon?: string; cor?: string; dias?: number[] }
type Final = { id: string; nome: string; curto: string; icon?: string; cor?: string; dias?: number[] } | null

// Estado efetivo de um dia (publicada / visualizável / agendada / rascunho) a partir do `pub`.
function estadoDoDia(pub?: Pub): 'publicada' | 'visualizavel' | 'agendada' | 'rascunho' {
  const est = pub?.estado ?? 'publicada' // legado sem pub = publicado (não some do aluno)
  // Qualquer data FUTURA = agendada (mostra a hora), mesmo que "oculto até lá"; data passada = já liberado.
  if (pub?.publicarEm) { const t = Date.parse(pub.publicarEm); if (!isNaN(t)) return t > Date.now() ? 'agendada' : 'publicada' }
  if (est === 'rascunho') return 'rascunho'
  return est === 'visualizavel' ? 'visualizavel' : 'publicada'
}
function fmtAgendada(iso: string): string {
  try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// Editor dos dias no modelo "Desafio de Lei Seca": tabela de dias (só questões), publicar/agendar,
// reordenar, multi-seleção; cada dia expande para o editor de teses.
export function JurisDiasEditor({ desafioId, dias, materias, final, quizPorDia }: {
  desafioId: string
  dias: Record<string, Dia>
  materias: Materia[]
  final: Final
  /** Contagem de "Questões do conteúdo" por chave de dia (do documento vinculado). */
  quizPorDia?: Record<string, number>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aberto, setAberto] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [agendarKeys, setAgendarKeys] = useState<string[] | null>(null)

  const matOpts = useMemo(() => [...(materias ?? []), ...(final ? [final] : [])], [materias, final])
  const matInfo = (id?: string | null) => matOpts.find((m) => m.id === id) ?? null

  // Dias ordenados por `ordem` (fallback chave numérica).
  const entradas = useMemo(() =>
    Object.entries(dias ?? {})
      .map(([key, dia]) => ({ key, dia: dia ?? {} }))
      .sort((a, b) => ((a.dia.ordem ?? Number(a.key)) - (b.dia.ordem ?? Number(b.key))) || (Number(a.key) - Number(b.key)))
  , [dias])
  const keysOrdenadas = entradas.map((e) => e.key)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => { const r = await fn(); if (r.ok) { if (okMsg) toast.success(okMsg); router.refresh() } else toast.error(r.error ?? 'Erro') })

  // Seleção
  const toggleSel = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const nSel = sel.size
  const todasMarcadas = keysOrdenadas.length > 0 && nSel >= keysOrdenadas.length
  const toggleTodas = () => setSel((s) => (s.size >= keysOrdenadas.length && keysOrdenadas.length > 0 ? new Set() : new Set(keysOrdenadas)))
  const limparSel = () => setSel(new Set())

  function criarDia() { run(() => criarDiaDesafio(desafioId), 'Dia adicionado') }
  async function excluirDia(key: string) {
    if (!(await confirmar({ titulo: 'Excluir dia', mensagem: 'Excluir este dia e suas teses? Não pode ser desfeito.', confirmar: 'Excluir', destrutivo: true }))) return
    run(() => excluirDiaDesafio(desafioId, key))
  }
  function mover(idx: number, delta: number) {
    const ks = [...keysOrdenadas]; const j = idx + delta
    if (j < 0 || j >= ks.length) return
    ;[ks[idx], ks[j]] = [ks[j], ks[idx]]
    run(() => reordenarDiasDesafio(desafioId, ks))
  }
  function aplicarEstado(keys: string[], estado: DiaEstado, publicarEm: string | null = null, okMsg?: string) {
    if (!keys.length) return
    run(() => definirPublicacaoDiasDesafio(desafioId, keys, { estado, publicarEm }), okMsg)
  }
  async function excluirSelecionados() {
    const ids = [...sel]; if (!ids.length) return
    if (!(await confirmar({ titulo: 'Excluir dias', mensagem: `Excluir ${ids.length} dia(s)? Não pode ser desfeito.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => { let ok = 0; for (const k of ids) { const r = await excluirDiaDesafio(desafioId, k); if (r.ok) ok++; else { toast.error(r.error ?? 'Erro'); break } } router.refresh(); limparSel(); if (ok) toast.success(`${ok} dia(s) excluído(s)`) })
  }

  function confirmarAgendamento(patch: { estado: DiaEstado; publicarEm: string | null }) {
    const keys = agendarKeys ?? []; setAgendarKeys(null); if (!keys.length) return
    run(() => definirPublicacaoDiasDesafio(desafioId, keys, patch), `Publicação agendada (${keys.length} dia(s))`)
    limparSel()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{entradas.length} dia(s) — cada dia configura as teses (questões) do jogo. Publique, agende e reordene como no Desafio de Lei Seca.</p>
        <button onClick={criarDia} disabled={pending || entradas.length >= 15} title={entradas.length >= 15 ? 'Máximo de 15 dias' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
          <FilePlus2 className="h-4 w-4" /> Adicionar dia
        </button>
      </div>

      {entradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum dia ainda. Clique em <span className="font-medium text-foreground">"Adicionar dia"</span> para configurar as questões.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {/* Barra de seleção */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <CaixaSelecao checked={todasMarcadas} indeterminate={nSel > 0 && !todasMarcadas} onChange={toggleTodas} label="Selecionar todas" />
              {nSel > 0 ? `${nSel} selecionado(s)` : 'Selecionar todas'}
            </label>
            {nSel > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button type="button" disabled={pending} onClick={() => { aplicarEstado([...sel], 'publicada', null, `${nSel} dia(s) publicado(s)`); limparSel() }} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"><Eye className="h-3.5 w-3.5" /> Publicar</button>
                <button type="button" disabled={pending} onClick={() => { aplicarEstado([...sel], 'visualizavel', null, `${nSel} dia(s) visualizável`); limparSel() }} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-400"><Clock className="h-3.5 w-3.5" /> Visualizável</button>
                <button type="button" disabled={pending} onClick={() => setAgendarKeys([...sel])} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"><CalendarClock className="h-3.5 w-3.5" /> Agendar</button>
                <button type="button" disabled={pending} onClick={() => { aplicarEstado([...sel], 'rascunho', null, `${nSel} dia(s) em rascunho`); limparSel() }} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"><EyeOff className="h-3.5 w-3.5" /> Rascunho</button>
                <button type="button" disabled={pending} onClick={excluirSelecionados} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-card px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
                <button type="button" onClick={limparSel} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Limpar seleção"><X className="h-4 w-4" /></button>
              </div>
            )}
          </div>

          {entradas.map((e, i) => (
            <DiaLinha
              key={e.key}
              desafioId={desafioId}
              chave={e.key}
              posicao={i + 1}
              total={entradas.length}
              dia={e.dia}
              materiaInfo={matInfo(e.dia.materia)}
              quizCount={quizPorDia?.[e.key] ?? 0}
              pending={pending}
              aberto={aberto === e.key}
              selecionado={sel.has(e.key)}
              onToggleSel={() => toggleSel(e.key)}
              onToggle={() => setAberto((a) => (a === e.key ? null : e.key))}
              onMover={(delta) => mover(i, delta)}
              onExcluir={() => excluirDia(e.key)}
              onEstado={(estado) => aplicarEstado([e.key], estado, null, estado === 'publicada' ? 'Dia publicado' : estado === 'visualizavel' ? 'Dia visualizável' : 'Dia em rascunho')}
              onAgendar={() => setAgendarKeys([e.key])}
            />
          ))}
        </div>
      )}

      {agendarKeys && (() => {
        const alvo = agendarKeys.length === 1 ? dias[agendarKeys[0]] : null
        return <AgendarDialog quantidade={agendarKeys.length} inicialQuando={alvo?.pub?.publicarEm ?? null} inicialEstado={alvo?.pub?.estado} onCancel={() => setAgendarKeys(null)} onConfirm={confirmarAgendamento} />
      })()}
    </div>
  )
}

function DiaLinha({ desafioId, chave, posicao, total, dia, materiaInfo, quizCount = 0, pending, aberto, selecionado, onToggleSel, onToggle, onMover, onExcluir, onEstado, onAgendar }: {
  desafioId: string
  chave: string
  posicao: number
  total: number
  dia: Dia
  materiaInfo: Materia | null
  quizCount?: number
  pending: boolean
  aberto: boolean
  selecionado: boolean
  onToggleSel: () => void
  onToggle: () => void
  onMover: (delta: -1 | 1) => void
  onExcluir: () => void
  onEstado: (estado: DiaEstado) => void
  onAgendar: () => void
}) {
  const router = useRouter()
  const [abrindoLeitura, startLeitura] = useTransition()
  const [abrindoQuestoes, startQuestoes] = useTransition()
  const voltarJuris = () => encodeURIComponent(`/admin/jurisprudencia?desafio=${desafioId}&aba=dias`)

  // Abre (criando se preciso) o documento do dia no editor de CONTEÚDO (leitura), com "voltar" p/ a juris.
  function abrirLeitura() {
    startLeitura(async () => {
      const r = await editarLeituraDia(desafioId, chave)
      if (r.ok && r.documentoId) router.push(`/admin/leitura/${r.documentoId}?tab=conteudo&voltar=${voltarJuris()}`)
      else toast.error(r.error ?? 'Erro ao abrir a leitura.')
    })
  }
  // Abre a área "Questões do conteúdo" do dia — EXATAMENTE a mesma da Lei Seca (QuizConteudoAdmin).
  function abrirQuestoes() {
    startQuestoes(async () => {
      const r = await editarLeituraDia(desafioId, chave)
      if (r.ok && r.documentoId) router.push(`/admin/leitura/${r.documentoId}/questoes?voltar=${voltarJuris()}`)
      else toast.error(r.error ?? 'Erro ao abrir as questões.')
    })
  }

  const titulo = dia.titulo ?? ''
  const estado = estadoDoDia(dia.pub)
  const cor = materiaInfo?.cor ?? '#6d28d9'

  return (
    <div className={cn('border-b last:border-0 transition-colors', selecionado && 'bg-primary/5', aberto && 'bg-muted/20')}>
      {/* Linha da tabela */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30">
        <CaixaSelecao checked={selecionado} onChange={onToggleSel} label={`Selecionar dia ${posicao}`} />
        <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{posicao}</span>
        <button onClick={onToggle} className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={aberto ? 'Recolher' : 'Expandir'} aria-expanded={aberto}>
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: cor }}>{materiaInfo?.curto?.slice(0, 3) || posicao}</span>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left" title="Abrir editor de questões">
          <p className="truncate text-sm font-semibold text-foreground">{titulo || <span className="text-muted-foreground">Dia {posicao} — sem título</span>}</p>
          <p className="truncate text-[11px] text-muted-foreground">{materiaInfo?.nome ?? 'Aula do dia'}</p>
        </button>

        {/* Estado de publicação (dropdown) */}
        <DropdownMenu>
          <DropdownMenuTrigger disabled={pending} title="Estado de publicação"
            className={cn('hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium outline-none transition-colors disabled:opacity-50 sm:inline-flex',
              estado === 'publicada' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
              : estado === 'visualizavel' ? 'bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400'
              : estado === 'agendada' ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400'
              : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
            {estado === 'publicada' ? <><Eye className="h-3 w-3" /> Publicada</>
              : estado === 'visualizavel' ? <><Clock className="h-3 w-3" /> Visualizável</>
              : estado === 'agendada' ? <><CalendarClock className="h-3 w-3" /> Agendada{dia.pub?.publicarEm ? ` · ${fmtAgendada(dia.pub.publicarEm)}` : ''}</>
              : <><EyeOff className="h-3 w-3" /> Rascunho</>}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEstado('publicada')}><Eye className="mr-2 h-4 w-4 text-emerald-600" /> Publicar (liberar)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEstado('visualizavel')}><Clock className="mr-2 h-4 w-4 text-sky-600" /> Visualizável (bloqueada)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEstado('rascunho')}><EyeOff className="mr-2 h-4 w-4" /> Rascunho (oculta)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAgendar}><CalendarClock className="mr-2 h-4 w-4" /> Agendar publicação…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 items-center gap-0.5">
          {dia.documento_id && <span title="Leitura configurada" className="mr-0.5 inline-flex h-4 w-4 items-center justify-center text-emerald-600 dark:text-emerald-400"><BookOpen className="h-3.5 w-3.5" /></span>}
          <button onClick={() => onMover(-1)} disabled={posicao === 1 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
          <button onClick={() => onMover(1)} disabled={posicao === total || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
          <button onClick={onToggle} title="Editar questões" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
          <button onClick={onExcluir} title="Excluir dia" className="rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Expansão IDÊNTICA à Lei Seca: Conteúdo + Questões do conteúdo — mesmas áreas/configurações. */}
      {aberto && (
        <div className="border-t bg-muted/20">
          <button type="button" onClick={abrirLeitura} disabled={abrindoLeitura}
            className="group flex w-full items-center gap-2.5 py-2.5 pl-16 pr-3 text-sm transition-colors hover:bg-muted/50 disabled:opacity-60">
            <FileText className={cn('h-4 w-4 shrink-0', dia.documento_id ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
            <span className="flex-1 text-left font-medium text-foreground">Conteúdo</span>
            <span className="text-[11px] text-muted-foreground">{dia.documento_id ? 'editar conteúdo' : 'inserir conteúdo'}</span>
            {abrindoLeitura ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
          </button>
          <button type="button" onClick={abrirQuestoes} disabled={abrindoQuestoes}
            className="group flex w-full items-center gap-2.5 border-t py-2.5 pl-16 pr-3 text-sm transition-colors hover:bg-muted/50 disabled:opacity-60">
            <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left font-medium text-foreground">Questões do conteúdo</span>
            <span className="text-[11px] text-muted-foreground">{quizCount > 0 ? `${quizCount} questão(ões)` : 'adicionar questões'}</span>
            {abrindoQuestoes ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

/** Diálogo para AGENDAR a publicação (1 ou vários dias): data/hora (Brasília) + como fica até lá. */
function AgendarDialog({ quantidade, inicialQuando, inicialEstado, onCancel, onConfirm }: {
  quantidade: number
  inicialQuando?: string | null
  inicialEstado?: DiaEstado
  onCancel: () => void
  onConfirm: (patch: { estado: DiaEstado; publicarEm: string | null }) => void
}) {
  const [quando, setQuando] = useState(() => (inicialQuando ? isoParaBrtLocal(inicialQuando) : ''))
  const [ate, setAte] = useState<'rascunho' | 'visualizavel'>(inicialEstado === 'rascunho' ? 'rascunho' : 'visualizavel')
  const isoQuando = brtLocalParaIso(quando)
  const valido = !!isoQuando && Date.parse(isoQuando) > Date.now()
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Agendar publicação {quantidade > 1 ? `(${quantidade} dias)` : ''}</h3>
          <button onClick={onCancel} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {inicialQuando && <p className="mb-3 -mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><CalendarClock className="h-3 w-3" /> Já agendada para {fmtAgendada(inicialQuando)}</p>}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Publicar em (data e hora de Brasília)</span>
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <div className="mt-4 space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Até lá, o dia fica:</span>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/40">
            <input type="radio" name="ate" checked={ate === 'visualizavel'} onChange={() => setAte('visualizavel')} className="mt-0.5 accent-[var(--primary)]" />
            <span><span className="font-medium">Visualizável (bloqueado)</span><br /><span className="text-[11px] text-muted-foreground">O aluno vê o dia na seleção com a data, mas não joga até lá.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/40">
            <input type="radio" name="ate" checked={ate === 'rascunho'} onChange={() => setAte('rascunho')} className="mt-0.5 accent-[var(--primary)]" />
            <span><span className="font-medium">Oculto</span><br /><span className="text-[11px] text-muted-foreground">Não aparece para o aluno até a data.</span></span>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Na data marcada, o dia é liberado automaticamente.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button onClick={() => onConfirm({ estado: ate, publicarEm: isoQuando })} disabled={!valido}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            <CalendarClock className="h-4 w-4" /> Agendar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Caixa de seleção arredondada (quadrado com ✓) — consistente com o Banco de Aulas. */
function CaixaSelecao({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label?: string }) {
  return (
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={label}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate }}
      className="relative h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[6px] border-2 border-muted-foreground/30 bg-card transition-all hover:border-primary/60 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40 after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-[11px] after:font-bold after:leading-none after:text-primary-foreground after:content-[''] checked:after:content-['✓'] indeterminate:after:content-['–']" />
  )
}

