'use client'

// Sidebar (drawer à direita) do documento da Biblioteca — substitui a prévia fullscreen. 4 abas:
// Detalhes (campos + toggles "o que o aluno pode fazer"), Acesso (janela + grupos/alunos), Vínculos
// (conteúdo↔conteúdo pro leitor) e Histórico (auditoria + versões). Tokens de cor (white-label) + dark.

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  X, FileText, FileType2, FileCode2, Download, ExternalLink, Users2, Link2, History, Plus, Trash2,
  Eye, Highlighter, Printer, Droplets, Loader2, ChevronRight, Clock, CalendarClock, Settings2,
} from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import {
  carregarSidebarDoc, salvarPermissoesDoc, salvarJanelaDoc, adicionarVinculoLeitor, removerVinculoLeitor,
  type PermissoesAluno, type VinculoLeitor, type AcessoLinhaSidebar, type EventoHistorico,
} from '@/app/admin/biblioteca/actions'

type Aba = 'detalhes' | 'acesso' | 'vinculos' | 'historico'
type Dados = Awaited<ReturnType<typeof carregarSidebarDoc>>

const ICONE_TIPO: Record<string, typeof FileText> = { docx: FileType2, pdf: FileText, html: FileCode2 }
const CORES_TIPO: Record<string, string> = { docx: 'bg-primary text-primary-foreground', pdf: 'bg-rose-600 text-white', html: 'bg-amber-600 text-white' }

function papelLabel(papel: string, podeBaixar: boolean): string {
  if (papel === 'editor') return 'Editor'
  if (papel === 'commenter') return 'Comentar'
  return podeBaixar ? 'Ler + baixar' : 'Só leitura'
}
const soData = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : '')
const paraIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null)
// formatBrt devolve "dd/mm/aaaa HH:MM:SS" (BRT). Helpers curtos p/ a UI.
function fmtData(iso: string | null | undefined): string { const s = formatBrt(iso); if (!s) return ''; const [dd, mm] = s.split(' ')[0].split('/'); return `${dd}/${mm}` }
function fmtDataHora(iso: string | null | undefined): string { const s = formatBrt(iso); if (!s) return ''; const [d, t] = s.split(' '); const [dd, mm] = d.split('/'); const [HH, MM] = (t || '').split(':'); return `${dd}/${mm} · ${HH}:${MM}` }

export function BibliotecaDocSidebar({
  documentoId, pastaLabel, onFechar, onMudou, onGerenciarAcesso, onEditarOffice, onBaixar, semAcesso,
}: {
  documentoId: string
  pastaLabel: string
  onFechar: () => void
  onMudou?: () => void
  onGerenciarAcesso: () => void
  onEditarOffice: () => void
  onBaixar: () => void
  /** Modelos de caderno não têm aluno: oculta a aba Acesso, o Status (publicado) e os toggles do aluno. */
  semAcesso?: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('detalhes')
  const [d, setD] = useState<Dados | null>(null)
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try { const r = await carregarSidebarDoc(documentoId); setD(r) } finally { setCarregando(false) }
  }, [documentoId])

  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onFechar])

  const base = d?.base
  const Icone = ICONE_TIPO[base?.tipo_origem ?? ''] ?? FileText
  const corTipo = CORES_TIPO[base?.tipo_origem ?? ''] ?? 'bg-muted text-foreground'

  async function togglePerm(k: keyof PermissoesAluno, v: boolean) {
    if (!d?.permissoes) return
    setD({ ...d, permissoes: { ...d.permissoes, [k]: v } }) // otimista
    const r = await salvarPermissoesDoc(documentoId, { [k]: v })
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); recarregar() }
  }
  async function salvarJanela(de: string, ate: string) {
    const r = await salvarJanelaDoc(documentoId, paraIso(de), paraIso(ate))
    if (!r.ok) return toast.error(r.error || 'Falha ao salvar a janela.')
    toast.success('Janela de liberação salva.'); setD((p) => (p ? { ...p, janela: { de: paraIso(de), ate: paraIso(ate) } } : p))
  }

  const TABS: [Aba, string, typeof FileText][] = [
    ['detalhes', 'Detalhes', FileText],
    ...(semAcesso ? [] : [['acesso', 'Acesso', Users2]]),
    ['vinculos', 'Vínculos', Link2], ['historico', 'Histórico', History],
  ] as [Aba, string, typeof FileText][]

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onFechar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l bg-card shadow-2xl" style={{ animation: 'bibSidebarIn .22s cubic-bezier(.2,0,0,1)' }}>
        <style>{`@keyframes bibSidebarIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}`}</style>

        {/* Cabeçalho */}
        <div className="border-b p-4">
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${corTipo}`}><Icone className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-[15px] font-bold leading-tight" title={base?.titulo}>{base?.titulo ?? (carregando ? 'Carregando…' : 'Documento')}</h2>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                {(base?.tipo_origem ?? '—')}{base?.versaoNum != null ? ` · v${base.versaoNum}` : ''}
              </p>
            </div>
            <button onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {base?.tipo_origem === 'docx' && (
              <button onClick={onEditarOffice} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" />Abrir no editor</button>
            )}
            <button onClick={() => router.push(`/admin/biblioteca/conteudo/${documentoId}/gerenciar`)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"><Settings2 className="h-3.5 w-3.5" />Gerenciar</button>
          </div>
        </div>

        {/* Abas (tab de linha) */}
        <div className="flex items-center gap-1 border-b px-2">
          {TABS.map(([k, label, Ic]) => (
            <button key={k} onClick={() => setAba(k)} className={`relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${aba === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Ic className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {carregando || !d ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : !d.ok ? (
            <div className="p-4 text-sm text-destructive">{d.error || 'Falha ao carregar.'}</div>
          ) : (
            <>
              {aba === 'detalhes' && <AbaDetalhes d={d} pastaLabel={pastaLabel} onToggle={togglePerm} semAcesso={semAcesso} />}
              {aba === 'acesso' && !semAcesso && <AbaAcesso d={d} onSalvarJanela={salvarJanela} onGerenciar={onGerenciarAcesso} />}
              {aba === 'vinculos' && <AbaVinculos documentoId={documentoId} vinculos={d.vinculos ?? []} onMudou={() => { recarregar(); onMudou?.() }} />}
              {aba === 'historico' && <AbaHistorico historico={d.historico ?? []} />}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

// ── Detalhes ────────────────────────────────────────────────────────────────
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  )
}
function StatusDot({ s }: { s: string }) {
  const cor = s === 'publicado' ? 'bg-emerald-500' : s === 'arquivado' ? 'bg-muted-foreground' : 'bg-amber-500'
  const txt = s === 'publicado' ? 'Publicado' : s === 'arquivado' ? 'Arquivado' : 'Rascunho'
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${cor}`} />{txt}</span>
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}
function PermLinha({ Ic, titulo, sub, on, onChange }: { Ic: typeof Eye; titulo: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Ic className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{titulo}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  )
}
function AbaDetalhes({ d, pastaLabel, onToggle, semAcesso }: { d: Dados; pastaLabel: string; onToggle: (k: keyof PermissoesAluno, v: boolean) => void; semAcesso?: boolean }) {
  const p = d.permissoes
  return (
    <div className="p-4">
      <div className="divide-y rounded-xl border bg-background/40 px-3">
        {!semAcesso && <Linha rotulo="Status"><StatusDot s={d.base?.status ?? 'rascunho'} /></Linha>}
        <Linha rotulo="Pasta">{pastaLabel || '—'}</Linha>
        <Linha rotulo="Extensão"><span className="uppercase">{d.base?.tipo_origem ?? '—'}</span></Linha>
        <Linha rotulo="Versão">{d.base?.versaoNum != null ? `v${d.base.versaoNum}` : '—'}{d.base && d.base.versoesCount > 1 ? ` · ${d.base.versoesCount} no total` : ''}</Linha>
        {!semAcesso && <Linha rotulo="Leituras">{d.leituras ? d.leituras.toLocaleString('pt-BR') : '—'}</Linha>}
        {!semAcesso && <Linha rotulo="Grifos">{d.grifos ? `${d.grifos.toLocaleString('pt-BR')} marcações` : '—'}</Linha>}
      </div>

      {/* "O que o aluno pode fazer" só faz sentido onde há aluno — escondido em Modelos de caderno. */}
      {!semAcesso && p && (
        <>
          <div className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">O que o aluno pode fazer</div>
          <div className="divide-y rounded-xl border px-3">
            <PermLinha Ic={Eye} titulo="Ler na plataforma" sub="Leitor com Caderno, foco e folha espelho" on={p.pode_ler_plataforma} onChange={(v) => onToggle('pode_ler_plataforma', v)} />
            <PermLinha Ic={Download} titulo="Baixar o arquivo" sub="Download do original por aluno" on={p.pode_baixar} onChange={(v) => onToggle('pode_baixar', v)} />
            <PermLinha Ic={Highlighter} titulo="Grifos e anotações" sub="Sobrevivem às novas versões" on={p.pode_grifar} onChange={(v) => onToggle('pode_grifar', v)} />
            <PermLinha Ic={Droplets} titulo="Marca d'água" sub="Nome + CPF em cada página" on={p.marca_dagua} onChange={(v) => onToggle('marca_dagua', v)} />
            <PermLinha Ic={Printer} titulo="Imprimir" sub="Permitir impressão no leitor" on={p.pode_imprimir} onChange={(v) => onToggle('pode_imprimir', v)} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Acesso ──────────────────────────────────────────────────────────────────
function AbaAcesso({ d, onSalvarJanela, onGerenciar }: { d: Dados; onSalvarJanela: (de: string, ate: string) => void; onGerenciar: () => void }) {
  const [de, setDe] = useState(soData(d.janela?.de))
  const [ate, setAte] = useState(soData(d.janela?.ate))
  const acesso = d.acesso!
  const linhas: (AcessoLinhaSidebar & { kind: 'grupo' | 'aluno' })[] = [
    ...acesso.grupos.map((g) => ({ ...g, kind: 'grupo' as const })),
    ...acesso.estudantes.map((e) => ({ ...e, kind: 'aluno' as const })),
  ]
  const total = linhas.length
  return (
    <div className="p-4">
      <div className="rounded-xl border bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Janela de liberação</div>
        <div className="flex items-center gap-2">
          <label className="flex-1 text-xs text-muted-foreground">De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40" /></label>
          <label className="flex-1 text-xs text-muted-foreground">Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40" /></label>
        </div>
        <button onClick={() => onSalvarJanela(de, ate)} className="mt-2 w-full rounded-lg bg-muted py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70">Salvar janela</button>
        {!de && !ate && <p className="mt-1.5 text-[11px] text-muted-foreground">Sem datas = liberado sempre (respeitando o acesso abaixo).</p>}
      </div>

      <div className="mb-1 mt-5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quem tem acesso{total ? ` · ${total}` : ''}</span>
      </div>
      {total === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
          Sem restrição — <strong className="text-foreground">liberado a todos</strong> os alunos do tenant.
        </div>
      ) : (
        <div className="divide-y rounded-xl border">
          {linhas.map((l) => (
            <div key={l.kind + l.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${l.kind === 'grupo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{l.kind === 'grupo' ? <Users2 className="h-3.5 w-3.5" /> : (l.nome?.[0] ?? '?').toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={l.nome}>{l.nome}</div>
                <div className="text-[11px] text-muted-foreground">{l.kind === 'grupo' ? 'grupo' : 'individual'}{l.liberado_ate ? ` · até ${fmtData(l.liberado_ate)}` : ''}</div>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{papelLabel(l.papel, l.pode_baixar)}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={onGerenciar} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold hover:bg-muted"><Users2 className="h-3.5 w-3.5" />Gerenciar acesso</button>
    </div>
  )
}

// ── Vínculos ────────────────────────────────────────────────────────────────
const ALVO_LABEL: Record<string, string> = { conteudo: 'Conteúdo', videoaula: 'Videoaula', desafio: 'Desafio', trilha: 'Trilha', externo: 'Link externo' }
function AbaVinculos({ documentoId, vinculos, onMudou }: { documentoId: string; vinculos: VinculoLeitor[]; onMudou: () => void }) {
  const [novo, setNovo] = useState(false)
  const [tipo, setTipo] = useState('conteudo')
  const [rotulo, setRotulo] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [modo, setModo] = useState<'sempre' | 'ao_concluir'>('sempre')
  const [salvando, setSalvando] = useState(false)

  async function adicionar() {
    if (!rotulo.trim()) return toast.error('Informe o rótulo do vínculo.')
    setSalvando(true)
    const r = await adicionarVinculoLeitor({ documentoId, alvo_tipo: tipo, rotulo: rotulo.trim(), detalhe: detalhe.trim() || null, modo })
    setSalvando(false)
    if (!r.ok) return toast.error(r.error || 'Falha ao vincular.')
    toast.success('Vínculo adicionado.'); setNovo(false); setRotulo(''); setDetalhe(''); setTipo('conteudo'); setModo('sempre'); onMudou()
  }
  async function remover(id: string) {
    const r = await removerVinculoLeitor(id, documentoId)
    if (!r.ok) return toast.error(r.error || 'Falha ao remover.')
    toast.success('Vínculo removido.'); onMudou()
  }

  return (
    <div className="p-4">
      <p className="mb-3 text-[11px] text-muted-foreground">Aparecem para o aluno ao lado do texto, no leitor.</p>
      {vinculos.length === 0 && !novo && (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">Nenhum conteúdo vinculado ainda.</div>
      )}
      <div className="space-y-2">
        {vinculos.map((v) => (
          <div key={v.id} className="group flex items-start gap-2.5 rounded-xl border p-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Link2 className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" title={v.rotulo}>{v.rotulo}</div>
              {v.detalhe && <div className="truncate text-[11px] text-muted-foreground">{v.detalhe}</div>}
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{ALVO_LABEL[v.alvo_tipo] ?? v.alvo_tipo}</span>
                {v.modo === 'ao_concluir' && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400">libera ao concluir</span>}
              </div>
            </div>
            <button onClick={() => remover(v.id)} aria-label="Remover vínculo" className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {novo ? (
        <div className="mt-3 space-y-2 rounded-xl border bg-background/40 p-3">
          <div className="flex gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 flex-1 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              {Object.entries(ALVO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={modo} onChange={(e) => setModo(e.target.value as 'sempre' | 'ao_concluir')} className="h-8 flex-1 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <option value="sempre">Sempre visível</option>
              <option value="ao_concluir">Libera ao concluir</option>
            </select>
          </div>
          <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Rótulo (ex.: Videoaula — Reforma agrária na CF/88)" className="h-8 w-full rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
          <input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Detalhe (ex.: a partir de 08:20 · arts. 184 a 186)" className="h-8 w-full rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
          <div className="flex gap-2">
            <button onClick={adicionar} disabled={salvando} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">{salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Adicionar</button>
            <button onClick={() => setNovo(false)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setNovo(true)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" />Vincular conteúdo</button>
      )}
    </div>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────
function AbaHistorico({ historico }: { historico: EventoHistorico[] }) {
  const cor = (t: string) => (t === 'versao' ? 'bg-primary' : 'bg-muted-foreground')
  return (
    <div className="p-4">
      {historico.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">Sem eventos registrados.</div>
      ) : (
        <ol className="relative space-y-4 border-l pl-4">
          {historico.map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${cor(e.tipo)}`} />
              <div className="text-sm font-medium leading-tight">{e.titulo}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />{fmtDataHora(e.em)}{e.detalhe ? ` · ${e.detalhe}` : ''}
              </div>
            </li>
          ))}
        </ol>
      )}
      <a href="/admin/auditoria" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver auditoria completa <ChevronRight className="h-3.5 w-3.5" /></a>
    </div>
  )
}
