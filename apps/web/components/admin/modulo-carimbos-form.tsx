'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Loader2, Stamp, Upload, Trash2, Plus, Save, BookOpenText, RotateCw, Move, Maximize, MapPin, Check, Trophy, ChevronDown, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarCarimbosModulo } from '@/app/admin/leitura/actions'
import { carimboNovo, CONDICAO_LABEL, CONDICAO_TIPOS, usaMeta, usaAula, type CarimboDef, type CarimboCondicaoTipo, type CarimboAlvo } from '@/lib/leitura/carimbos-tipos'
import type { AulaOpcao } from '@/components/admin/modulo-medalhas-form'

/**
 * Sub-aba "Carimbos" do módulo: gerencia os adesivos colecionáveis. Cada carimbo tem imagem, título,
 * texto (o que mostra no perfil do aluno), condição de ganho e ONDE aparece — no balão de uma aula
 * (com deslocamento/rotação) ou num ponto livre da trilha — com prévia no formato do alvo escolhido.
 */
export function ModuloCarimbosForm({ pastaId, inicial, aulas = [] }: { pastaId: string; inicial: CarimboDef[]; aulas?: AulaOpcao[] }) {
  const [lista, setLista] = useState<CarimboDef[]>(inicial)
  const [salvando, setSalvando] = useState(false)

  const patch = (id: string, p: Partial<CarimboDef>) => setLista((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const remover = (id: string) => setLista((l) => l.filter((c) => c.id !== id))
  const add = () => setLista((l) => [...l, carimboNovo()])

  async function salvar() {
    setSalvando(true)
    const r = await salvarCarimbosModulo(pastaId, lista)
    setSalvando(false)
    if (r.ok) { if (r.carimbos) setLista(r.carimbos); toast.success('Carimbos salvos') }
    else toast.error(r.error ?? 'Erro ao salvar')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Stamp className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Carimbos do módulo</h2>
            <p className="max-w-2xl text-xs text-muted-foreground">Adesivos colecionáveis: o aluno ganha ao cumprir a condição e eles ficam no perfil dele (junto das conquistas). Também aparecem estampados na trilha — no balão de uma aula ou num ponto livre — na posição/rotação que você definir.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={add} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Novo carimbo</button>
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <Stamp className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Nenhum carimbo ainda. Crie um com <b>Novo carimbo</b>.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lista.map((c) => <CarimboCard key={c.id} c={c} aulas={aulas} onPatch={(p) => patch(c.id, p)} onRemover={() => remover(c.id)} />)}
        </div>
      )}
    </div>
  )
}

function CarimboCard({ c, aulas, onPatch, onRemover }: { c: CarimboDef; aulas: AulaOpcao[]; onPatch: (p: Partial<CarimboDef>) => void; onRemover: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  function escolher(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    if (file.size > 1.5 * 1024 * 1024) { toast.error('Imagem muito grande (máx. ~1,5 MB).'); return }
    const reader = new FileReader()
    reader.onload = () => onPatch({ url: String(reader.result) })
    reader.readAsDataURL(file)
  }
  // Ao trocar o alvo, reseta a posição para um default coerente com o novo modo.
  function setAlvo(alvo: CarimboAlvo) {
    if (alvo === c.alvo) return
    const d = alvo === 'no' ? { x: 26, y: -26 } : alvo === 'card' ? { x: 0, y: 0 } : { x: 78, y: 8 }
    onPatch({ alvo, ...d })
  }
  const selectCls = 'h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

  const livre = c.alvo === 'livre'
  // Condição por AULA(s) específica(s): o carimbo aparece NAS MESMAS aulas — sem 2º seletor de dias.
  const condPorAula = usaAula(c.condicao.tipo)
  const nCond = c.condicao.aulaIds?.length ?? 0
  const resumoCond = c.condicao.aulaModo === 'todas'
    ? (nCond ? `todas as aulas, exceto ${nCond}` : 'todas as aulas')
    : (nCond ? `${nCond} dia(s) selecionado(s)` : 'nenhum dia selecionado')
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Imagem + título + texto */}
      <div className="space-y-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"><Upload className="h-3.5 w-3.5" /> {c.url ? 'Trocar imagem' : 'Imagem'}</button>
          {c.url && <button type="button" onClick={() => onPatch({ url: null })} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /> Remover</button>}
          <button type="button" onClick={onRemover} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/5"><Trash2 className="h-3.5 w-3.5" /> Excluir carimbo</button>
        </div>
        <input value={c.titulo} onChange={(e) => onPatch({ titulo: e.target.value })} placeholder="Título (ex.: Concluiu o desafio)" className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
        <input value={c.texto} onChange={(e) => onPatch({ texto: e.target.value })} placeholder="Texto no perfil (ex.: Participou do Desafio de Lei Seca)" className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
      </div>

      {/* Prévia em TAMANHO REAL — bate 1:1 com o que o aluno vê (nó/card) */}
      <Secao titulo="Prévia (tamanho real)" icon={Eye}>
        <div style={XADREZ} className="flex justify-center overflow-auto rounded-xl px-4 py-8 ring-1 ring-border">
          <Previa c={c} />
        </div>
      </Secao>

      {/* ── Condição para ganhar ── */}
      <Secao titulo="Condição para ganhar" icon={Trophy}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={c.condicao.tipo} onChange={(e) => onPatch({ condicao: { ...c.condicao, tipo: e.target.value as CarimboCondicaoTipo } })} className={cn(selectCls, 'min-w-[240px] flex-1')}>
            {CONDICAO_TIPOS.map((t) => <option key={t} value={t}>{CONDICAO_LABEL[t]}</option>)}
          </select>
          {usaMeta(c.condicao.tipo) && (
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">Quantidade
              <input type="number" min={1} value={c.condicao.meta} onChange={(e) => onPatch({ condicao: { ...c.condicao, meta: Math.max(1, Number(e.target.value) || 1) } })} className="h-9 w-16 rounded-lg border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </label>
          )}
        </div>
        {condPorAula && (
          <AulasAlvo modo={c.condicao.aulaModo ?? 'todas'} ids={c.condicao.aulaIds ?? []} aulas={aulas}
            onChange={(modo, ids) => onPatch({ condicao: { ...c.condicao, aulaModo: modo, aulaIds: ids } })}
            rotulos={{ todas: 'Não exigir nestes dias:', especificas: 'Exigir estes dias:' }} />
        )}
      </Secao>

      {/* ── Onde aparece ── */}
      <Secao titulo="Onde aparece" icon={MapPin}>
        <div className="inline-flex flex-wrap rounded-lg border bg-background p-0.5">
          {([['no', 'No dia (nó)'], ['card', 'No balão do conteúdo'], ['livre', 'Ponto livre']] as [CarimboAlvo, string][]).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setAlvo(v)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', c.alvo === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>
        {/* Em quais dias (só nó/card). Condição por aula(s) → segue os MESMOS dias da condição (sem 2º seletor). */}
        {!livre && (condPorAula ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Aparece automaticamente nos <b className="text-foreground">dias da condição</b> — <span className="text-foreground">{resumoCond}</span>.
          </p>
        ) : (
          <AulasAlvo modo={c.alvoModo} ids={c.alvoAulaIds} aulas={aulas}
            onChange={(modo, ids) => onPatch({ alvoModo: modo, alvoAulaIds: ids })}
            rotulos={{ todas: 'Ocultar nestes dias:', especificas: 'Aparecer nestes dias:' }} />
        ))}
        {/* Sobreposição (frente/atrás do texto) + recorte na área — só faz sentido no nó/card. */}
        {!livre && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Sobreposição:</span>
              <div className="inline-flex rounded-lg border bg-background p-0.5">
                {([['frente', 'Na frente'], ['atras', 'Atrás do texto']] as ['frente' | 'atras', string][]).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => onPatch({ sobreposicao: v })} className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', c.sobreposicao === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
                ))}
              </div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={c.recortar} onChange={(e) => onPatch({ recortar: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--primary)]" />
              Não sair da área (recortar o que passar da borda)
            </label>
          </div>
        )}
      </Secao>

      {/* ── Posição e tamanho ── (X/Y mudam de significado conforme o alvo) */}
      <Secao titulo="Posição e tamanho" icon={Move}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <Slider icon={Move} label={livre ? 'X' : 'Desloc. X'} val={c.x} min={livre ? 0 : -80} max={livre ? 100 : 80} onChange={(x) => onPatch({ x })} suf={livre ? '%' : 'px'} />
          <Slider icon={Move} label={livre ? 'Y' : 'Desloc. Y'} val={c.y} min={livre ? 0 : -80} max={livre ? 100 : 80} onChange={(y) => onPatch({ y })} suf={livre ? '%' : 'px'} />
          <Slider icon={RotateCw} label="Rotação" val={c.rotacao} min={-180} max={180} onChange={(rotacao) => onPatch({ rotacao })} suf="°" />
          <Slider icon={Maximize} label="Tamanho" val={c.tamanho} min={24} max={160} onChange={(tamanho) => onPatch({ tamanho })} suf="px" />
        </div>
      </Secao>
    </div>
  )
}

/** Seção do editor com título + ícone e divisória em cima — mantém a área organizada. */
function Secao({ titulo, icon: Icon, children }: { titulo: string; icon: typeof Move; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t pt-3">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {titulo}</span>
      {children}
    </div>
  )
}

// Xadrez de transparência (estilo editor de imagem) — deixa claro que o PNG é transparente e que
// NÃO há “borda/caixa” em volta dele; funciona em claro e escuro (cinza neutro por rgba).
const XADREZ: CSSProperties = {
  backgroundImage: 'conic-gradient(rgba(128,128,128,.20) 25%, transparent 0 50%, rgba(128,128,128,.20) 0 75%, transparent 0)',
  backgroundSize: '14px 14px',
}

/** Prévia do carimbo NO FORMATO e TAMANHO REAIS do alvo — bate 1:1 com a trilha do aluno (nó ≈ 60px,
 *  card ≈ 300px, mesma estrutura/ancoragem), pra não ter diferença entre montagem e visualização. */
function Previa({ c }: { c: CarimboDef }) {
  const z = c.sobreposicao === 'atras' ? 1 : 20
  // Badge com a MESMA lógica do aluno: z-index (sobreposição) + recorte (overflow-hidden na forma da área).
  const Badge = ({ anchor, clip }: { anchor: CSSProperties; clip: string }) => {
    if (!c.url) return null
    // eslint-disable-next-line @next/next/no-img-element
    const img = <img src={c.url} alt="" style={{ ...anchor, width: c.tamanho, height: c.tamanho }} className="pointer-events-none absolute object-contain" />
    if (c.recortar) return <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', clip)} style={{ zIndex: z }}>{img}</div>
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.url} alt="" style={{ ...anchor, width: c.tamanho, height: c.tamanho, zIndex: z }} className="pointer-events-none absolute object-contain" />
  }

  if (c.alvo === 'no') {
    // Nó/dia real ≈ 60px de diâmetro → 1:1. Carimbo por deslocamento (px) a partir do CENTRO do nó.
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative flex h-[60px] w-[60px] items-center justify-center overflow-visible rounded-full border-4 border-emerald-600 bg-emerald-500 text-white shadow-sm">
          <span className="relative z-10"><Check className="h-6 w-6" strokeWidth={3} /></span>
          <Badge clip="rounded-full" anchor={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px)) rotate(${c.rotacao}deg)` }} />
        </div>
        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Dia 01 – Preâmbulo…</span>
      </div>
    )
  }
  if (c.alvo === 'card') {
    // Balão de conteúdo real ≈ 300px (mesma estrutura da trilha) → 1:1. Carimbo no canto sup. direito + desloc.
    return (
      <div className="relative rounded-2xl border bg-card shadow-xl" style={{ width: 300 }}>
        <Badge clip="rounded-2xl" anchor={{ right: 0, top: 0, transform: `translate(calc(50% + ${c.x}px), calc(-50% + ${c.y}px)) rotate(${c.rotacao}deg)` }} />
        <div className="relative z-10 space-y-2 p-3.5">
          <div>
            <p className="text-sm font-bold leading-tight text-foreground">Dia 01 – Preâmbulo ao art. 5, XV</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Concluída</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Reler</div>
            <div className="flex w-full items-center justify-center rounded-xl border-[1.5px] border-primary px-4 py-2 text-sm font-bold text-primary">Questões do conteúdo</div>
          </div>
        </div>
        <span className="absolute -bottom-[7px] left-1/2 z-[5] h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-b border-r bg-card" />
      </div>
    )
  }
  // Ponto livre: a posição é % de TODA a trilha (tamanho variável) → prévia é apenas representativa.
  return (
    <div className="relative h-44 w-72 overflow-hidden rounded-xl ring-1 ring-inset ring-border/70">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
        <BookOpenText className="h-6 w-6" /><span className="text-[10px] font-medium">Trilha (posição em %)</span>
      </div>
      {c.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.url} alt="" style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.tamanho, height: c.tamanho, transform: `translate(-50%,-50%) rotate(${c.rotacao}deg)` }} className="pointer-events-none absolute object-contain" />
      )}
    </div>
  )
}

/** Multi-seleção de dias reutilizável: "Todas as aulas" (com filtro do que excluir) ou "Aulas específicas".
 *  Usada tanto na CONDIÇÃO (quais aulas concluir/gabaritar) quanto no placement (onde aparece). */
export function AulasAlvo({ modo, ids, aulas, onChange, rotulos }: {
  modo: 'todas' | 'especificas'; ids: string[]; aulas: AulaOpcao[]
  onChange: (modo: 'todas' | 'especificas', ids: string[]) => void
  rotulos: { todas: string; especificas: string }
}) {
  // A lista de dias fica RECOLHIDA por padrão em "Todas" (filtro opcional); abre em "Específicas".
  const [aberto, setAberto] = useState(modo === 'especificas')
  const set = new Set(ids)
  const toggle = (id: string) => { const s = new Set(ids); s.has(id) ? s.delete(id) : s.add(id); onChange(modo, [...s]) }
  const setModo = (m: 'todas' | 'especificas') => { onChange(m, []); setAberto(m === 'especificas') }
  const resumo = modo === 'todas'
    ? (set.size ? `Todas, exceto ${set.size} dia(s)` : 'Todas as aulas')
    : (set.size ? `${set.size} dia(s)` : 'Selecione os dias')
  const mostrarLista = aberto && aulas.length > 0
  return (
    <div className="space-y-2 rounded-lg border bg-background/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Em quais dias:</span>
        <div className="inline-flex rounded-lg border bg-background p-0.5">
          {([['todas', 'Todas as aulas'], ['especificas', 'Aulas específicas']] as ['todas' | 'especificas', string][]).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setModo(v)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', modo === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>
        <span className="text-[11px] font-medium text-foreground/70">{resumo}</span>
        {aulas.length > 0 && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
            {modo === 'todas' ? (set.size ? 'Editar filtro' : 'Filtrar dias') : 'Escolher dias'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} />
          </button>
        )}
      </div>
      {mostrarLista && (
        <div>
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{modo === 'todas' ? rotulos.todas : rotulos.especificas}</span>
          <div className="max-h-40 space-y-0.5 overflow-auto rounded-md border bg-background p-1.5">
            {aulas.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted">
                <input type="checkbox" checked={set.has(a.id)} onChange={() => toggle(a.id)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                <span className="truncate" title={a.titulo}>{a.titulo}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {aulas.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma aula no módulo ainda.</p>}
    </div>
  )
}

function Slider({ icon: Icon, label, val, min, max, onChange, suf }: { icon: typeof Move; label: string; val: number; min: number; max: number; onChange: (v: number) => void; suf: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</span><span className="tabular-nums">{Math.round(val)}{suf}</span></span>
      <input type="range" min={min} max={max} value={val} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[var(--primary)]" />
    </label>
  )
}
