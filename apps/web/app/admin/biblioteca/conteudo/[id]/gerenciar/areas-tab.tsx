'use client'

// ABA "ÁREAS" do gerenciamento do conteúdo: quem vê cada área marcada no documento pelo plugin do editor.
// Várias regras por área ("mostrar para" / "ocultar para"), por produto (ou em qualquer lugar), grupo, segmento,
// aluno ou todos. "Ver como o aluno" confere o resultado. Toda autorização é server-side (areas-actions).

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Eye, EyeOff, Loader2, Plus, Search, Trash2, Layers } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import {
  carregarAreasAction, salvarRegraAreaAction, alternarRegraAreaAction, excluirRegraAreaAction,
  definirAreaExpansivaAction, buscarAlunosAreaAction, verComoAlunoAction, salvarBlocoExpansivelAction, salvarEstiloPadraoExpansivelAction,
  type DadosAreas, type EntradaRegra,
} from '@/app/admin/biblioteca/areas-actions'
import { PRESETS_EXP, ESTILO_EXP_PADRAO } from '@/lib/conteudo/areas-presets'

const sel = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AbaAreas({ documentoId }: { documentoId: string }) {
  const [dados, setDados] = useState<DadosAreas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocultasVista, setOcultasVista] = useState<Set<string> | null>(null)
  const [pending, start] = useTransition()

  async function recarregar() {
    const r = await carregarAreasAction(documentoId)
    if (!r.ok) { setErro(r.error); return }
    setErro(null); setDados(r)
  }
  useEffect(() => { void recarregar() }, [documentoId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
  if (!dados) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando áreas…</div>

  const nomeProduto = (id: string | null) => (id ? dados.produtos.find((p) => p.id === id)?.nome ?? 'Produto removido' : 'Qualquer lugar (inclui a Biblioteca)')
  const nomePublico = (tipo: string, id: string | null) => {
    if (tipo === 'todos') return 'Todos os alunos'
    if (tipo === 'segmento') return `Segmento: ${dados.segmentos.find((s) => s.id === id)?.nome ?? 'removido'}`
    if (tipo === 'grupo') return `Grupo: ${dados.grupos.find((s) => s.id === id)?.nome ?? 'removido'}`
    return `Aluno: ${(id && dados.alunos[id]) || 'removido'}`
  }

  const exec = (f: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await f()
    if (!r.ok) { toast.error(r.error || 'Falha.'); return }
    if (ok) toast.success(ok)
    setOcultasVista(null)
    await recarregar()
  })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        As áreas são marcadas no documento pelo plugin <strong className="text-foreground">Visibilidade</strong> do editor (início e fim); os blocos recolhíveis, pelo plugin <strong className="text-foreground">Expansor</strong>.
        Aqui você define quem vê cada uma. Sem nenhuma regra, a área aparece para todos. Quando houver regras, o que o aluno não pode ver
        é <strong className="text-foreground">removido no servidor</strong> (texto e PDF), não apenas escondido.
      </div>

      <VerComo documentoId={documentoId} dados={dados} onResultado={setOcultasVista} />

      <BlocosExpansiveis dados={dados} documentoId={documentoId} exec={exec} pending={pending} />

      {dados.areas.filter((a) => a.tipo !== 'exp').length === 0 ? (
        <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Layers className="mx-auto mb-2 h-6 w-6" />
          Nenhuma área de visibilidade neste documento ainda. Abra o editor, use o plugin <strong>Visibilidade</strong> para marcar início e fim, e salve.
        </div>
      ) : dados.areas.filter((a) => a.tipo !== 'exp').map((a) => {
        const regras = dados.regras.filter((r) => r.area_key === a.key)
        const oculta = ocultasVista?.has(a.key)
        return (
          <section key={a.key} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{a.nome || 'Área'}</h3>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{a.key}</code>
              {!a.presente && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">não está mais no documento</span>}
              {ocultasVista && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${oculta ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>
                  {oculta ? <><EyeOff className="h-3 w-3" />oculta para o aluno</> : <><Eye className="h-3 w-3" />visível para o aluno</>}
                </span>
              )}
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                Expansiva (recolhível no modo texto)
                <Switch checked={!!a.expansiva} onCheckedChange={(v) => exec(() => definirAreaExpansivaAction(documentoId, a.key, v))} disabled={pending} />
              </label>
            </div>

            <ul className="mt-3 space-y-2">
              {regras.length === 0 && <li className="text-xs text-muted-foreground">Sem regras — visível para todos.</li>}
              {regras.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${r.ativo ? '' : 'opacity-50'}`}>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.efeito === 'mostrar' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'}`}>
                    {r.efeito === 'mostrar' ? 'Mostrar somente para' : 'Ocultar para'}
                  </span>
                  <span className="font-medium">{nomePublico(r.publico_tipo, r.publico_id)}</span>
                  <span className="text-xs text-muted-foreground">em: {nomeProduto(r.produto_id)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <Switch checked={r.ativo} onCheckedChange={(v) => exec(() => alternarRegraAreaAction(documentoId, r.id, v))} disabled={pending} aria-label="Regra ativa" />
                    <button type="button" aria-label="Excluir regra" disabled={pending}
                      onClick={async () => { if (await confirmar({ titulo: 'Excluir regra', mensagem: 'Excluir esta regra da área?', confirmar: 'Excluir', destrutivo: true })) exec(() => excluirRegraAreaAction(documentoId, r.id), 'Regra excluída.') }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </span>
                </li>
              ))}
            </ul>

            <NovaRegra areaKey={a.key} dados={dados} pending={pending} onSalvar={(e) => exec(() => salvarRegraAreaAction(documentoId, e), 'Regra salva.')} />
          </section>
        )
      })}
    </div>
  )
}

function NovaRegra({ areaKey, dados, pending, onSalvar }: { areaKey: string; dados: DadosAreas; pending: boolean; onSalvar: (e: EntradaRegra) => void }) {
  const [aberto, setAberto] = useState(false)
  const [efeito, setEfeito] = useState<'mostrar' | 'ocultar'>('ocultar')
  const [produto, setProduto] = useState('')
  const [tipo, setTipo] = useState<EntradaRegra['publico_tipo']>('todos')
  const [publicoId, setPublicoId] = useState('')
  const [aluno, setAluno] = useState<{ id: string; rotulo: string } | null>(null)

  if (!aberto) return <button type="button" onClick={() => setAberto(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Adicionar regra</button>

  const opcoes = tipo === 'segmento' ? dados.segmentos : tipo === 'grupo' ? dados.grupos : []
  const id = tipo === 'aluno' ? aluno?.id ?? '' : publicoId
  return (
    <div className="mt-3 grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-muted-foreground">Efeito
        <select className={`${sel} mt-1 w-full`} value={efeito} onChange={(e) => setEfeito(e.target.value as 'mostrar' | 'ocultar')}>
          <option value="ocultar">Ocultar para…</option>
          <option value="mostrar">Mostrar somente para…</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Onde vale
        <select className={`${sel} mt-1 w-full`} value={produto} onChange={(e) => setProduto(e.target.value)}>
          <option value="">Qualquer lugar (inclui a Biblioteca)</option>
          {dados.produtos.map((p) => <option key={p.id} value={p.id}>Só no produto: {p.nome}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Quem
        <select className={`${sel} mt-1 w-full`} value={tipo} onChange={(e) => { setTipo(e.target.value as EntradaRegra['publico_tipo']); setPublicoId(''); setAluno(null) }}>
          <option value="todos">Todos os alunos</option>
          <option value="segmento">Um segmento</option>
          <option value="grupo">Um grupo</option>
          <option value="aluno">Um aluno</option>
        </select>
      </label>
      <div className="text-xs text-muted-foreground">
        {tipo === 'aluno' ? (
          <BuscaAluno valor={aluno?.rotulo ?? ''} onEscolher={setAluno} />
        ) : tipo === 'todos' ? <div className="mt-5 text-sm">—</div> : (
          <label>{tipo === 'segmento' ? 'Segmento' : 'Grupo'}
            <select className={`${sel} mt-1 w-full`} value={publicoId} onChange={(e) => setPublicoId(e.target.value)}>
              <option value="">Escolha…</option>
              {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button type="button" disabled={pending || (tipo !== 'todos' && !id)}
          onClick={() => { onSalvar({ area_key: areaKey, efeito, produto_id: produto || null, publico_tipo: tipo, publico_id: tipo === 'todos' ? null : id }); setAberto(false); setPublicoId(''); setAluno(null) }}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">Salvar regra</button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
        <span className="text-[11px] text-muted-foreground">Ocultar vence mostrar. Regras de produto só valem quando o aluno abre o documento por aquele produto.</span>
      </div>
    </div>
  )
}

function BuscaAluno({ valor, onEscolher }: { valor: string; onEscolher: (a: { id: string; rotulo: string }) => void }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<{ id: string; nome: string; email: string | null }[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return }
    const t = setTimeout(async () => { const r = await buscarAlunosAreaAction(q); if (r.ok) setRows(r.rows) }, 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="relative">
      Aluno
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4" />
        <input className={`${sel} w-full pl-8`} placeholder={valor || 'Nome ou e-mail…'} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {valor && !q && <div className="mt-1 text-[11px] text-foreground">Escolhido: {valor}</div>}
      {rows.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-lg">
          {rows.map((r) => (
            <li key={r.id}><button type="button" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => { onEscolher({ id: r.id, rotulo: `${r.nome}${r.email ? ` · ${r.email}` : ''}` }); setQ(''); setRows([]) }}>
              {r.nome}<span className="text-xs text-muted-foreground"> {r.email}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VerComo({ documentoId, dados, onResultado }: { documentoId: string; dados: DadosAreas; onResultado: (s: Set<string> | null) => void }) {
  const [aluno, setAluno] = useState<{ id: string; rotulo: string } | null>(null)
  const [produto, setProduto] = useState('')
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]">
      <BuscaAluno valor={aluno?.rotulo ?? ''} onEscolher={setAluno} />
      <label className="text-xs text-muted-foreground">Abrindo por
        <select className={`${sel} mt-1 w-full`} value={produto} onChange={(e) => setProduto(e.target.value)}>
          <option value="">Biblioteca direta (só regras de qualquer lugar)</option>
          {dados.produtos.map((p) => <option key={p.id} value={p.id}>Produto: {p.nome}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button type="button" disabled={!aluno || pending} className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await verComoAlunoAction(documentoId, aluno!.id, produto || null)
            if (!r.ok) { toast.error(r.error); return }
            onResultado(new Set(r.ocultas))
          })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ver como o aluno'}
        </button>
        <button type="button" className="h-9 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => onResultado(null)}>Limpar</button>
      </div>
    </div>
  )
}


// ───────────────────────── blocos expansíveis (título + estilo) ─────────────────────────
type Est = DadosAreas['estiloPadrao']
type Exec = (f: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => void
const sw = 'h-8 w-10 cursor-pointer rounded-md border bg-background p-0.5'
const PADRAO_ORIGINAL: Est = ESTILO_EXP_PADRAO

/** Prévia FIEL do bloco recolhível do aluno (cartão roxo ou caixa colorida com prévia do texto). */
function PreviaBloco({ titulo, e }: { titulo: string; e: Est }) {
  const [aberto, setAberto] = useState(!!e.iniciaAberta)
  useEffect(() => setAberto(!!e.iniciaAberta), [e.iniciaAberta])
  const icone = e.icone === 'mais'
    ? <Plus className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} style={{ transform: aberto ? 'rotate(45deg)' : 'none', transition: 'transform .2s', color: e.cor }} />
    : <ChevronDown className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: e.cor }} />
  const corpo = <div className="pb-3 text-sm" style={{ color: '#444' }}>Conteúdo do bloco expansível (texto, tabelas, imagens…).</div>
  if (e.variante === 'caixa') {
    const t = (titulo || 'Título do bloco').trim()
    return (
      <div style={{ border: `1px solid ${e.borda}`, borderRadius: e.raio, background: e.fundo, padding: '0 14px' }}>
        <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 py-2.5 text-left" style={{ fontSize: e.tamanho }}>
          <span style={{ fontWeight: 800, color: e.cor }}>{/[:.!?]$/.test(t) ? t : `${t}:`}</span>
          {!aberto && <span className="min-w-0 flex-1 truncate" style={{ color: '#6b7280', fontSize: '.88em' }}>Conteúdo do bloco expansível (texto, tabelas, imagens…)</span>}
          {aberto && <span className="flex-1" />}
          {icone}
        </button>
        {aberto && corpo}
      </div>
    )
  }
  return (
    <div style={{ border: `1px solid ${e.borda}`, borderRadius: e.raio, background: e.fundo, padding: '0 18px' }}>
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
        style={{ color: e.cor, fontWeight: 700, fontSize: e.tamanho }}>
        <span>{titulo || 'Título do bloco'}</span>
        {icone}
      </button>
      {aberto && corpo}
    </div>
  )
}

function EditorEstilo({ valor, onChange }: { valor: Est; onChange: (e: Est) => void }) {
  const set = (p: Partial<Est>) => onChange({ ...valor, ...p })
  return (
    <div className="space-y-3">
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Modelos prontos</div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS_EXP.map((p) => (
          <button key={p.id} type="button" onClick={() => onChange({ ...p.estilo })} title={p.nome}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
            <span className="h-4 w-4 rounded" style={{ background: p.estilo.fundo, border: `1px solid ${p.estilo.borda}` }} />{p.nome}
          </button>
        ))}
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Formato
        <select className={sel} value={valor.variante} onChange={(e) => set({ variante: e.target.value as Est['variante'] })}><option value="cartao">Cartão (só título)</option><option value="caixa">Caixa com prévia do texto</option></select>
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="color" className={sw} value={valor.cor} onChange={(e) => set({ cor: e.target.value.toUpperCase() })} />Cor do título e ícone</label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="color" className={sw} value={valor.borda} onChange={(e) => set({ borda: e.target.value.toUpperCase() })} />Cor da borda</label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="color" className={sw} value={valor.fundo} onChange={(e) => set({ fundo: e.target.value.toUpperCase() })} />Fundo do cartão</label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Ícone
        <select className={sel} value={valor.icone} onChange={(e) => set({ icone: e.target.value as Est['icone'] })}><option value="seta">Seta</option><option value="mais">Mais (+)</option></select>
      </label>
      <label className="text-xs text-muted-foreground">Arredondamento: {valor.raio}px
        <input type="range" min={0} max={28} value={valor.raio} onChange={(e) => set({ raio: +e.target.value })} className="block w-full" /></label>
      <label className="text-xs text-muted-foreground">Tamanho do título: {valor.tamanho}px
        <input type="range" min={12} max={22} value={valor.tamanho} onChange={(e) => set({ tamanho: +e.target.value })} className="block w-full" /></label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
        <Switch checked={valor.iniciaAberta} onCheckedChange={(v) => set({ iniciaAberta: v })} />Começa aberto
      </label>
    </div>
    </div>
  )
}

function BlocosExpansiveis({ dados, documentoId, exec, pending }: { dados: DadosAreas; documentoId: string; exec: Exec; pending: boolean }) {
  const blocos = dados.areas.filter((a) => a.tipo === 'exp' || a.expansiva)
  const [padrao, setPadrao] = useState<Est>(dados.estiloPadrao)
  useEffect(() => setPadrao(dados.estiloPadrao), [dados.estiloPadrao])
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Blocos expansíveis</h3>
        <p className="text-xs text-muted-foreground">No modo texto o aluno vê estes trechos como blocos recolhíveis (no PDF aparecem normais). O título vem do documento e pode ser editado; o desenho padrão é o da prévia abaixo.</p>
      </div>

      <details className="rounded-xl border bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">Estilo padrão (vale para todos os documentos)</summary>
        <div className="mt-3 space-y-3">
          <EditorEstilo valor={padrao} onChange={setPadrao} />
          <PreviaBloco titulo="Exemplo de título do bloco" e={padrao} />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => exec(() => salvarEstiloPadraoExpansivelAction(padrao), 'Estilo padrão salvo.')} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">Salvar estilo padrão</button>
            <button type="button" onClick={() => setPadrao(PADRAO_ORIGINAL)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Restaurar o desenho original</button>
          </div>
        </div>
      </details>

      {blocos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum bloco neste documento. Use o plugin <strong>Expansor</strong> no editor (ou marque uma área de visibilidade como expansiva) e salve.</p>
      ) : blocos.map((b) => <BlocoLinha key={b.key} b={b} padrao={dados.estiloPadrao} documentoId={documentoId} exec={exec} pending={pending} />)}
    </section>
  )
}

function BlocoLinha({ b, padrao, documentoId, exec, pending }: { b: DadosAreas['areas'][number]; padrao: Est; documentoId: string; exec: Exec; pending: boolean }) {
  const [titulo, setTitulo] = useState(b.titulo ?? '')
  const [custom, setCustom] = useState(!!b.estilo)
  const preset = b.tipo === 'exp' ? PRESETS_EXP.find((p) => p.id === b.preset) ?? null : null
  const base: Est = preset ? preset.estilo : padrao // o modelo escolhido no plugin vale até o admin personalizar
  const [est, setEst] = useState<Est>({ ...base, ...(b.estilo ?? {}) } as Est)
  const efetivo = custom ? est : base
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">{b.tipo === 'exp' ? 'Expansor' : 'Área expansiva'}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{b.key}</code>
        {!b.presente && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">não está mais no documento</span>}
        <span className="text-xs text-muted-foreground">No documento: “{b.nome}”</span>
        {preset && <span className="text-xs text-muted-foreground">· modelo: {preset.nome}</span>}
      </div>
      <label className="block text-xs text-muted-foreground">Título mostrado ao aluno (vazio = nome do documento)
        <input className={`${sel} mt-1 w-full`} value={titulo} placeholder={b.nome} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={custom} onCheckedChange={setCustom} />Personalizar o desenho deste bloco (senão usa o padrão)</label>
      {custom && <EditorEstilo valor={est} onChange={setEst} />}
      <PreviaBloco titulo={titulo || b.nome} e={efetivo} />
      <button type="button" disabled={pending} onClick={() => exec(() => salvarBlocoExpansivelAction(documentoId, b.key, titulo, custom ? est : null), 'Bloco salvo.')}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">Salvar bloco</button>
    </div>
  )
}
