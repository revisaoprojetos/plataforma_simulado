'use client'

// Aba VISIBILIDADE do produto — SEGMENTOS (públicos de alunos definidos por condições, estilo
// "Criar um Segmento" do ActiveCampaign: grupos de condições ligados por E/OU, campos por categoria,
// operadores por tipo — é/contém/existe/possui/maior que/entre/nos últimos X dias…) e as REGRAS que
// aplicam os segmentos:
//   · Acesso ao produto — "Liberar acesso para" / "Bloquear acesso para" (bloquear vence tudo);
//   · Conteúdos — módulo ou aula "Mostrar somente para" / "Ocultar para", e o que os demais veem
//     (não aparece / aparece com cadeado).
// Avaliação no servidor por aluno: lib/segmentos/avaliar.ts + lib/segmentos/visibilidade.ts.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  Eye, EyeOff, Plus, Loader2, MoreVertical, Pencil, Copy, Trash2, AlertTriangle, Users, X, Search,
  KeyRound, Layers, Lock, Check, FlaskConical, CircleCheck, CircleX, Filter, ShieldCheck, ShieldOff, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  CAMPOS, CAMPO_POR_ID, CATEGORIAS, EFEITO_LABEL, SEM_ACESSO_LABEL, SEM_VALOR, VALOR_EM_DIAS,
  novaCondicao, novoGrupo, operadoresDoCampo, rotuloOperador, resumoRegra, validarRegra,
  type Condicao, type GrupoCondicoes, type RegraSegmento, type RegraVisibilidade, type Segmento,
  type CampoId, type Efeito, type SemAcesso, type AlvoTipo, type RefTipo, type Juncao,
} from '@/lib/segmentos/tipos'
import type { SegmentoAdmin, AlvosProduto, AlvoNome } from './visibilidade-actions-tipos'
import { carregarVisibilidadeAction, carregarAlvosConteudoAction, salvarSegmentoAction, duplicarSegmentoAction, excluirSegmentoAction, salvarRegraVisibilidadeAction, alternarRegraVisibilidadeAction, excluirRegraVisibilidadeAction, buscarRefsSegmentoAction, buscarAlunosSegmentoAction, testarSegmentoAction } from './visibilidade-actions'

const MIGRACAO = '20261103130000_segmentos_visibilidade.sql'
const REF_LABEL: Record<RefTipo, string> = { grupo: 'grupo', produto: 'produto', simulado: 'simulado' }
const PERIODOS: [number | null, string][] = [[null, 'desde sempre'], [7, 'nos últimos 7 dias'], [15, 'nos últimos 15 dias'], [30, 'nos últimos 30 dias'], [60, 'nos últimos 60 dias'], [90, 'nos últimos 90 dias'], [180, 'nos últimos 180 dias'], [365, 'nos últimos 365 dias']]
const sel = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function AbaVisibilidade({ produtoId, produtoNome, podeEditar }: { produtoId: string; produtoNome: string; podeEditar: boolean }) {
  const [dados, setDados] = useState<null | { disponivel: boolean; segmentos: SegmentoAdmin[]; regras: RegraVisibilidade[]; alvosNomes: Record<string, AlvoNome>; temModulos: boolean }>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [editSeg, setEditSeg] = useState<null | { seg: Segmento | null; aoCriar?: (s: Segmento) => void }>(null)
  const [editRegra, setEditRegra] = useState<null | { modo: 'acesso' | 'conteudo'; regra: RegraVisibilidade | null }>(null)
  const [, start] = useTransition()
  const vazio = { disponivel: true, segmentos: [], regras: [], alvosNomes: {}, temModulos: false }

  function recarregar() {
    return carregarVisibilidadeAction(produtoId).then((r) => {
      if ('error' in r) { toast.error(r.error); setDados((d) => d ?? vazio); return }
      setDados({ disponivel: r.disponivel, segmentos: r.segmentos, regras: r.regras, alvosNomes: r.alvosNomes, temModulos: r.temModulos })
      setNomes((n) => ({ ...n, ...r.nomes }))
    }).catch(() => setDados((d) => d ?? vazio))
  }
  useEffect(() => { void recarregar() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId])

  const segPorId = useMemo(() => new Map((dados?.segmentos ?? []).map((s) => [s.id, s])), [dados])

  if (!dados) return <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando visibilidade…</div>
  if (!dados.disponivel) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div><div className="font-semibold">Segmentos ainda não ativados no banco</div><p className="text-muted-foreground">Aplique a migração <code className="rounded bg-muted px-1">{MIGRACAO}</code> no SQL editor do Supabase e recarregue a página.</p></div>
      </div>
    )
  }

  const regrasAcesso = dados.regras.filter((r) => r.alvo_tipo === 'produto')
  const regrasConteudo = dados.regras.filter((r) => r.alvo_tipo !== 'produto')

  function nomeAlvo(r: RegraVisibilidade): { tipo: string; titulo: string; sub: string | null } {
    const info = r.alvo_id ? dados?.alvosNomes[r.alvo_id] : undefined
    if (r.alvo_tipo === 'modulo') return { tipo: info?.sub ? 'Submódulo' : 'Módulo', titulo: info?.titulo ?? '(módulo removido)', sub: info?.sub ?? null }
    return { tipo: 'Aula', titulo: info?.titulo ?? '(aula removida)', sub: info?.sub ?? null }
  }

  function alternar(r: RegraVisibilidade, ativo: boolean) {
    setDados((d) => d && { ...d, regras: d.regras.map((x) => (x.id === r.id ? { ...x, ativo } : x)) })
    start(async () => {
      const res = await alternarRegraVisibilidadeAction(produtoId, r.id, ativo)
      if ('error' in res) { toast.error(res.error); void recarregar() } else toast.success(ativo ? 'Regra ativada.' : 'Regra pausada.')
    })
  }
  async function excluirRegra(r: RegraVisibilidade) {
    if (!(await confirmar({ titulo: 'Excluir regra', mensagem: 'Excluir esta regra de visibilidade? O segmento continua existindo.', confirmar: 'Excluir', destrutivo: true }))) return
    const res = await excluirRegraVisibilidadeAction(produtoId, r.id)
    if ('error' in res) { toast.error(res.error); return }
    setDados((d) => d && { ...d, regras: d.regras.filter((x) => x.id !== r.id) }); toast.success('Regra excluída.')
  }
  async function excluirSeg(s: SegmentoAdmin) {
    const aviso = s.uso ? ` Ele é usado em ${s.uso} regra(s) (somando todos os produtos), que também serão excluídas.` : ''
    if (!(await confirmar({ titulo: 'Excluir segmento', mensagem: `Excluir o segmento "${s.nome}"?${aviso}`, confirmar: 'Excluir', destrutivo: true }))) return
    const res = await excluirSegmentoAction(s.id, produtoId)
    if ('error' in res) { toast.error(res.error); return }
    toast.success('Segmento excluído.'); void recarregar()
  }
  async function duplicarSeg(s: SegmentoAdmin) {
    const res = await duplicarSegmentoAction(s.id)
    if ('error' in res) { toast.error(res.error); return }
    toast.success('Segmento duplicado.'); void recarregar()
  }

  function linhaRegra(r: RegraVisibilidade) {
    const s = segPorId.get(r.segmento_id)
    const alvo = r.alvo_tipo === 'produto' ? null : nomeAlvo(r)
    const Icone = r.efeito === 'liberar' ? ShieldCheck : r.efeito === 'bloquear' ? ShieldOff : r.efeito === 'mostrar' ? Eye : EyeOff
    return (
      <div key={r.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !r.ativo && 'opacity-60')}>
        <Switch checked={r.ativo} onCheckedChange={(v: boolean) => alternar(r, v)} disabled={!podeEditar} aria-label="Regra ativa" />
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', r.efeito === 'bloquear' || r.efeito === 'ocultar' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}><Icone className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          {alvo && <div className="truncate text-sm font-medium"><span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{alvo.tipo}</span>{alvo.titulo}{alvo.sub && <span className="font-normal text-muted-foreground"> · {alvo.sub}</span>}</div>}
          <div className={cn('flex flex-wrap items-center gap-1.5 text-sm', alvo && 'mt-0.5 text-xs text-muted-foreground')}>
            <span>{EFEITO_LABEL[r.efeito]}</span>
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-foreground"><Users className="h-3 w-3" />{s?.nome ?? '(segmento excluído)'}</span>
            {alvo && <span>· demais alunos: {SEM_ACESSO_LABEL[r.sem_acesso].toLowerCase()}</span>}
          </div>
        </div>
        {podeEditar && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Ações da regra" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted data-popup-open:bg-muted"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditRegra({ modo: r.alvo_tipo === 'produto' ? 'acesso' : 'conteudo', regra: r })}><Pencil className="h-4 w-4" />Editar</DropdownMenuItem>
              {s && <DropdownMenuItem onClick={() => setEditSeg({ seg: s })}><Filter className="h-4 w-4" />Editar segmento</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => excluirRegra(r)}><Trash2 className="h-4 w-4" />Excluir regra</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  const semSegmentos = dados.segmentos.length === 0
  const novaRegra = (modo: 'acesso' | 'conteudo') => {
    if (semSegmentos) { toast.message('Crie um segmento primeiro.'); setEditSeg({ seg: null, aoCriar: () => setEditRegra({ modo, regra: null }) }); return }
    setEditRegra({ modo, regra: null })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Eye className="h-5 w-5" /></span>
        <div className="text-sm">
          <div className="font-semibold">Visibilidade por segmentos</div>
          <p className="text-muted-foreground">Monte <b>segmentos</b> de alunos com condições (grupos, assinaturas, datas, simulados, questões, progresso…) e use-os para <b>liberar ou bloquear o acesso</b> a este produto e para <b>mostrar ou ocultar módulos e aulas</b>. Os segmentos valem para todos os produtos.</p>
        </div>
      </div>

      {/* 1. Acesso ao produto */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4 text-primary" />Acesso ao produto</h2>
            <p className="text-xs text-muted-foreground">Somam-se às assinaturas e aos grupos de acesso. <b>Bloquear</b> vence qualquer outra forma de acesso.</p></div>
          {podeEditar && <Button variant="outline" onClick={() => novaRegra('acesso')}><Plus className="h-4 w-4" />Adicionar regra de acesso</Button>}
        </div>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {regrasAcesso.length ? regrasAcesso.map(linhaRegra) : <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma regra de acesso. O acesso a “{produtoNome}” vem só das assinaturas e grupos.</p>}
        </div>
      </section>

      {/* 2. Conteúdos */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="flex items-center gap-2 text-base font-semibold"><Layers className="h-4 w-4 text-primary" />Conteúdos (módulos e aulas)</h2>
            <p className="text-xs text-muted-foreground">Regra no módulo vale para tudo dentro dele. Funciona junto com a disponibilidade por data.</p></div>
          {podeEditar && <Button variant="outline" onClick={() => novaRegra('conteudo')} disabled={!dados.temModulos}><Plus className="h-4 w-4" />Adicionar regra de conteúdo</Button>}
        </div>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {regrasConteudo.length ? regrasConteudo.map(linhaRegra) : <p className="px-4 py-6 text-center text-sm text-muted-foreground">{dados.temModulos ? 'Todos os módulos e aulas estão visíveis para quem tem acesso ao produto.' : 'Este produto ainda não tem módulos — crie na aba Conteúdos.'}</p>}
        </div>
      </section>

      {/* 3. Segmentos */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="flex items-center gap-2 text-base font-semibold"><Filter className="h-4 w-4 text-primary" />Segmentos</h2>
            <p className="text-xs text-muted-foreground">Públicos reutilizáveis em qualquer produto.</p></div>
          {podeEditar && <Button onClick={() => setEditSeg({ seg: null })}><Plus className="h-4 w-4" />Criar segmento</Button>}
        </div>
        {semSegmentos ? (
          <div className="rounded-xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nenhum segmento ainda. Ex.: “Alunos do grupo Revisão há mais de 30 dias”, “Quem fez 3+ simulados”, “Assinantes que vencem nos próximos 15 dias”.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dados.segmentos.map((s) => (
              <div key={s.id} className="flex flex-col rounded-xl border bg-card p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.nome}</div>
                    {s.descricao && <p className="line-clamp-2 text-xs text-muted-foreground">{s.descricao}</p>}
                  </div>
                  {podeEditar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label="Ações do segmento" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted data-popup-open:bg-muted"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditSeg({ seg: s })}><Pencil className="h-4 w-4" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicarSeg(s)}><Copy className="h-4 w-4" />Duplicar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => excluirSeg(s)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">{resumoRegra(s.regra, nomes)}</p>
                <div className="mt-auto pt-2 text-[11px] text-muted-foreground">{s.uso ? `Usado em ${s.uso} regra${s.uso === 1 ? '' : 's'}` : 'Ainda não usado'}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editSeg && (
        <SegmentoDialog
          seg={editSeg.seg} produtoId={produtoId} podeEditar={podeEditar} nomes={nomes}
          onNomes={(n) => setNomes((x) => ({ ...x, ...n }))}
          onClose={() => setEditSeg(null)}
          onSalvo={(s) => { const cb = editSeg.aoCriar; setEditSeg(null); void recarregar().then(() => cb?.(s)) }}
        />
      )}
      {editRegra && (
        <RegraDialog
          modo={editRegra.modo} regra={editRegra.regra} produtoId={produtoId} segmentos={dados.segmentos}
          onCriarSegmento={() => { const atual = editRegra; setEditRegra(null); setEditSeg({ seg: null, aoCriar: () => setEditRegra(atual) }) }}
          onClose={() => setEditRegra(null)}
          onSalvo={(r) => { setEditRegra(null); setDados((d) => d && { ...d, regras: d.regras.some((x) => x.id === r.id) ? d.regras.map((x) => (x.id === r.id ? r : x)) : [...d.regras, r] }); void recarregar() }}
        />
      )}
    </div>
  )
}

// ═══════════════════════ Regra (acesso / conteúdo) ═══════════════════════
function RegraDialog({ modo, regra, produtoId, segmentos, onClose, onSalvo, onCriarSegmento }: {
  modo: 'acesso' | 'conteudo'; regra: RegraVisibilidade | null; produtoId: string; segmentos: SegmentoAdmin[]
  onClose: () => void; onSalvo: (r: RegraVisibilidade) => void; onCriarSegmento: () => void
}) {
  const [segmentoId, setSegmentoId] = useState(regra?.segmento_id ?? segmentos[0]?.id ?? '')
  const [efeito, setEfeito] = useState<Efeito>(regra?.efeito ?? (modo === 'acesso' ? 'liberar' : 'mostrar'))
  const [alvo, setAlvo] = useState<string>(regra?.alvo_id ? `${regra.alvo_tipo}:${regra.alvo_id}` : '')
  const [semAcesso, setSemAcesso] = useState<SemAcesso>(regra?.sem_acesso ?? 'oculto')
  const [filtro, setFiltro] = useState('')
  const [pending, start] = useTransition()
  // Árvore de módulos/aulas carregada SÓ aqui (lazy) quando o dialog de CONTEÚDO abre — nunca na carga da aba.
  const [alvos, setAlvos] = useState<AlvosProduto | null>(modo === 'conteudo' ? null : { modulos: [], aulas: [] })
  useEffect(() => {
    if (modo !== 'conteudo') return
    let vivo = true
    void carregarAlvosConteudoAction(produtoId).then((r) => { if (!vivo) return; if ('error' in r) { toast.error(r.error); setAlvos({ modulos: [], aulas: [] }) } else setAlvos(r.alvos) })
    return () => { vivo = false }
  }, [modo, produtoId])

  // Árvore achatada: módulo → submódulos → aulas (com indentação), filtrada pelo texto.
  const opcoes = useMemo(() => {
    if (!alvos) return []
    const out: { v: string; label: string; nivel: number; tipo: AlvoTipo }[] = []
    const filhos = new Map<string | null, AlvosProduto['modulos']>()
    const ids = new Set(alvos.modulos.map((m) => m.id))
    for (const m of alvos.modulos) { const p = m.pai_id && ids.has(m.pai_id) ? m.pai_id : null; const l = filhos.get(p) ?? []; l.push(m); filhos.set(p, l) }
    const aulas = new Map<string, AlvosProduto['aulas']>()
    for (const a of alvos.aulas) { const l = aulas.get(a.modulo_id) ?? []; l.push(a); aulas.set(a.modulo_id, l) }
    const visit = (pai: string | null, nivel: number) => {
      for (const m of filhos.get(pai) ?? []) {
        out.push({ v: `modulo:${m.id}`, label: m.titulo, nivel, tipo: 'modulo' })
        visit(m.id, nivel + 1)
        for (const a of aulas.get(m.id) ?? []) out.push({ v: `aula:${a.id}`, label: a.titulo, nivel: nivel + 1, tipo: 'aula' })
      }
    }
    visit(null, 0)
    const t = filtro.trim().toLowerCase()
    return t ? out.filter((o) => o.v === alvo || o.label.toLowerCase().includes(t)) : out
  }, [alvos, filtro, alvo])

  function salvar() {
    const [tipo, id] = modo === 'acesso' ? ['produto', null] : (alvo.split(':') as [AlvoTipo, string])
    if (modo === 'conteudo' && !id) { toast.error('Escolha o módulo ou a aula.'); return }
    if (!segmentoId) { toast.error('Escolha um segmento.'); return }
    start(async () => {
      const r = await salvarRegraVisibilidadeAction(produtoId, { id: regra?.id, segmento_id: segmentoId, alvo_tipo: tipo as AlvoTipo, alvo_id: id, efeito, sem_acesso: semAcesso })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(regra ? 'Regra atualizada.' : 'Regra criada.'); onSalvo(r.regra)
    })
  }

  const efeitos: { v: Efeito; d: string }[] = modo === 'acesso'
    ? [{ v: 'liberar', d: 'Quem está no segmento ganha acesso ao produto (sem prazo), mesmo sem assinatura ou grupo.' }, { v: 'bloquear', d: 'Quem está no segmento perde o acesso ao produto, mesmo com assinatura ou grupo.' }]
    : [{ v: 'mostrar', d: 'Só quem está no segmento vê o conteúdo.' }, { v: 'ocultar', d: 'Quem está no segmento não vê o conteúdo.' }]

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-xl">
        <DialogTitle>{regra ? 'Editar regra' : modo === 'acesso' ? 'Nova regra de acesso' : 'Nova regra de conteúdo'}</DialogTitle>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {modo === 'conteudo' && (
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Conteúdo</span>
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar módulos e aulas…" className="pl-8" /></div>
              <div className="max-h-56 overflow-y-auto rounded-lg border">
                {!alvos ? <p className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando módulos e aulas…</p>
                : opcoes.length ? opcoes.map((o) => (
                  <button key={o.v} type="button" onClick={() => setAlvo(o.v)}
                    className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted', alvo === o.v && 'bg-primary/10 font-medium text-primary')}
                    style={{ paddingLeft: `${12 + o.nivel * 16}px` }}>
                    {o.tipo === 'modulo' ? <Layers className="h-3.5 w-3.5 shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />}
                    <span className={cn('truncate', o.tipo === 'modulo' && 'font-medium')}>{o.label}</span>
                    {alvo === o.v && <Check className="ml-auto h-4 w-4 shrink-0" />}
                  </button>
                )) : <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">O que fazer</span>
            {efeitos.map((e) => (
              <label key={e.v} className={cn('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5', efeito === e.v && 'border-primary bg-primary/5')}>
                <input type="radio" checked={efeito === e.v} onChange={() => setEfeito(e.v)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span><span className="block text-sm font-medium">{EFEITO_LABEL[e.v]}…</span><span className="block text-xs text-muted-foreground">{e.d}</span></span>
              </label>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="flex items-center justify-between text-sm font-medium">Segmento<button type="button" onClick={onCriarSegmento} className="text-xs font-normal text-primary hover:underline">+ Criar segmento</button></span>
            <select value={segmentoId} onChange={(e) => setSegmentoId(e.target.value)} className={cn(sel, 'w-full')}>
              {!segmentoId && <option value="">Escolha…</option>}
              {segmentos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          {modo === 'conteudo' && (
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium">Para quem não pode ver</span>
              <select value={semAcesso} onChange={(e) => setSemAcesso(e.target.value as SemAcesso)} className={cn(sel, 'w-full')}>
                <option value="oculto">Não aparece</option>
                <option value="bloqueado_cadeado">Aparece com cadeado (“conteúdo exclusivo”)</option>
              </select>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar regra</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════ Criar / editar segmento ═══════════════════════
export function SegmentoDialog({ seg, produtoId, podeEditar, nomes, onNomes, onClose, onSalvo }: {
  seg: Segmento | null; produtoId: string; podeEditar: boolean; nomes: Record<string, string>
  onNomes: (n: Record<string, string>) => void; onClose: () => void; onSalvo: (s: Segmento) => void
}) {
  const [nome, setNome] = useState(seg?.nome ?? '')
  const [descricao, setDescricao] = useState(seg?.descricao ?? '')
  const [regra, setRegra] = useState<RegraSegmento>(() => (seg?.regra.grupos.length ? seg.regra : { op: 'e', grupos: [novoGrupo()] }))
  const [teste, setTeste] = useState<null | { aluno: { id: string; nome: string }; corresponde: boolean; condicoes: Record<string, boolean>; grupos: Record<string, boolean> }>(null)
  const [pending, start] = useTransition()

  function mudarGrupo(gid: string, f: (g: GrupoCondicoes) => GrupoCondicoes | null) {
    setTeste(null)
    setRegra((r) => ({ ...r, grupos: r.grupos.map((g) => (g.id === gid ? f(g) : g)).filter(Boolean) as GrupoCondicoes[] }))
  }
  function mudarCond(gid: string, cid: string, patch: Partial<Condicao>) {
    mudarGrupo(gid, (g) => ({ ...g, condicoes: g.condicoes.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }))
  }
  function removerCond(gid: string, cid: string) {
    mudarGrupo(gid, (g) => { const cs = g.condicoes.filter((c) => c.id !== cid); return cs.length ? { ...g, condicoes: cs } : null })
  }

  function salvar() {
    const erro = !nome.trim() ? 'Dê um nome ao segmento.' : validarRegra(regra)
    if (erro) { toast.error(erro); return }
    start(async () => {
      const r = await salvarSegmentoAction({ id: seg?.id, nome, descricao, regra })
      if ('error' in r) { toast.error(r.error); return }
      onNomes(r.nomes); toast.success(seg ? 'Segmento atualizado.' : 'Segmento criado.'); onSalvo(r.segmento)
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <div className="border-b px-6 py-4"><DialogTitle>{seg ? 'Editar segmento' : 'Criar um Segmento'}</DialogTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Nome do segmento</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 250))} maxLength={250} disabled={!podeEditar} />
            <span className="mt-1 block text-xs font-medium text-muted-foreground">{nome.length}/250</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value.slice(0, 1000))} maxLength={1000} rows={3} disabled={!podeEditar}
              placeholder="Descreva este segmento para encontrá-lo facilmente…" className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <span className="block text-right text-xs text-muted-foreground">{descricao.length}/1000</span>
          </label>

          <div>
            <span className="mb-2 block text-sm font-semibold">Condições do segmento</span>
            <div className="space-y-0 rounded-xl border bg-muted/20 p-3 sm:p-4">
              {regra.grupos.map((g, gi) => (
                <div key={g.id}>
                  {gi > 0 && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="h-px flex-1 bg-border" />
                      <JuncaoToggle valor={regra.op} onChange={(op) => { setTeste(null); setRegra((r) => ({ ...r, op })) }} disabled={!podeEditar} grande />
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className={cn('rounded-xl border bg-card', teste && (teste.grupos[g.id] ? 'border-emerald-500/60' : 'border-destructive/50'))}>
                    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-semibold uppercase tracking-wide">Grupo {gi + 1}</span>
                      {g.condicoes.length > 1 && <><span>· corresponder a</span><JuncaoToggle valor={g.op} onChange={(op) => mudarGrupo(g.id, (x) => ({ ...x, op }))} disabled={!podeEditar} rotulos={['todas (E)', 'qualquer (OU)']} /></>}
                      {regra.grupos.length > 1 && podeEditar && <button type="button" onClick={() => mudarGrupo(g.id, () => null)} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"><Trash2 className="h-3.5 w-3.5" />Remover grupo</button>}
                    </div>
                    <div className="space-y-2 p-3">
                      {g.condicoes.map((c, ci) => (
                        <div key={c.id}>
                          {ci > 0 && <div className="py-1 pl-1 text-[11px] font-bold uppercase tracking-wider text-primary">{g.op === 'ou' ? 'ou' : 'e'}</div>}
                          <LinhaCondicao
                            c={c} nomes={nomes} disabled={!podeEditar} produtoId={produtoId}
                            resultado={teste ? teste.condicoes[c.id] : undefined}
                            onChange={(p) => mudarCond(g.id, c.id, p)} onNome={(id, n) => onNomes({ [id]: n })}
                            onRemover={() => removerCond(g.id, c.id)}
                          />
                        </div>
                      ))}
                      {podeEditar && <button type="button" onClick={() => mudarGrupo(g.id, (x) => ({ ...x, condicoes: [...x.condicoes, novaCondicao()] }))} className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"><Plus className="h-4 w-4" />Adicionar condição</button>}
                    </div>
                  </div>
                </div>
              ))}
              {podeEditar && (
                <div className="pt-3">
                  <button type="button" onClick={() => { setTeste(null); setRegra((r) => ({ ...r, grupos: [...r.grupos, novoGrupo()] })) }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"><Plus className="h-4 w-4" />Adicionar condições de um segundo grupo</button>
                </div>
              )}
            </div>
            <p className="mt-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><b className="text-foreground">Resumo:</b> {resumoRegra(regra, nomes)}</p>
          </div>

          <TestarAluno regra={regra} teste={teste} onTeste={setTeste} />
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {podeEditar && <Button onClick={salvar} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar segmento</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function JuncaoToggle({ valor, onChange, disabled, grande, rotulos = ['E', 'OU'] }: { valor: Juncao; onChange: (v: Juncao) => void; disabled?: boolean; grande?: boolean; rotulos?: [string, string] }) {
  return (
    <span className={cn('inline-flex overflow-hidden rounded-full border bg-background', grande ? 'text-xs' : 'text-[11px]')}>
      {(['e', 'ou'] as Juncao[]).map((v, i) => (
        <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
          className={cn('px-3 py-1 font-bold uppercase tracking-wide transition-colors', valor === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{rotulos[i]}</button>
      ))}
    </span>
  )
}

export function LinhaCondicao({ c, nomes, disabled, resultado, onChange, onNome, onRemover }: {
  c: Condicao; nomes: Record<string, string>; disabled: boolean; produtoId: string; resultado?: boolean
  onChange: (p: Partial<Condicao>) => void; onNome: (id: string, nome: string) => void; onRemover: () => void
}) {
  const def = CAMPO_POR_ID[c.campo]
  const ops = operadoresDoCampo(def)
  const semValor = SEM_VALOR.includes(c.operador)
  const emDias = VALOR_EM_DIAS.includes(c.operador)
  const entre = c.operador === 'entre'

  function trocarCampo(id: CampoId) {
    const novo = CAMPO_POR_ID[id]
    onChange({ campo: id, operador: operadoresDoCampo(novo)[0], valor: null, valor2: null, dias: null, ref: novo.ref && novo.ref === def.ref ? c.ref : null })
  }
  function trocarOperador(op: string) {
    const eraDias = VALOR_EM_DIAS.includes(c.operador), viraDias = VALOR_EM_DIAS.includes(op as any)
    onChange({ operador: op as Condicao['operador'], ...(eraDias !== viraDias ? { valor: null, valor2: null } : {}) })
  }

  const tipoInput = def.tipo === 'numero' || emDias ? 'number' : def.tipo === 'data' ? 'date' : 'text'
  const valorInput = (k: 'valor' | 'valor2') => (
    <Input type={tipoInput} value={(c[k] ?? '') as string} disabled={disabled}
      onChange={(e) => onChange({ [k]: tipoInput === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } as Partial<Condicao>)}
      className={cn('h-9', tipoInput === 'number' ? 'w-24' : tipoInput === 'date' ? 'w-40' : 'min-w-40 flex-1')} placeholder={tipoInput === 'text' ? 'Valor' : undefined} min={tipoInput === 'number' ? 0 : undefined} />
  )

  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2', resultado === true && 'border-emerald-500/60 bg-emerald-500/5', resultado === false && 'border-destructive/50 bg-destructive/5')}>
      {resultado !== undefined && (resultado ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" /> : <CircleX className="h-4 w-4 shrink-0 text-destructive" />)}
      <select value={c.campo} onChange={(e) => trocarCampo(e.target.value as CampoId)} disabled={disabled} className={cn(sel, 'w-48')} title={def.ajuda}>
        {CATEGORIAS.map((cat) => (
          <optgroup key={cat} label={cat}>{CAMPOS.filter((x) => x.categoria === cat).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
        ))}
      </select>
      {def.ref && <RefPicker tipo={def.ref} value={c.ref ?? null} nome={c.ref ? nomes[c.ref] : undefined} obrigatoria={!!def.refObrigatoria} disabled={disabled} onChange={(id, n) => { onChange({ ref: id }); if (id && n) onNome(id, n) }} />}
      <select value={c.operador} onChange={(e) => trocarOperador(e.target.value)} disabled={disabled} className={cn(sel, 'w-44')}>
        {ops.map((o) => <option key={o} value={o}>{rotuloOperador(def, o)}</option>)}
      </select>
      {!semValor && (
        <>
          {valorInput('valor')}
          {entre && <><span className="text-xs text-muted-foreground">e</span>{valorInput('valor2')}</>}
          {emDias ? <span className="text-sm text-muted-foreground">dias</span> : def.unidade && <span className="text-sm text-muted-foreground">{def.unidade}</span>}
        </>
      )}
      {def.periodo && (
        <select value={c.dias ?? ''} onChange={(e) => onChange({ dias: e.target.value === '' ? null : Number(e.target.value) })} disabled={disabled} className={cn(sel, 'w-44')}>
          {PERIODOS.map(([v, l]) => <option key={l} value={v ?? ''}>{l}</option>)}
        </select>
      )}
      {!disabled && <button type="button" onClick={onRemover} aria-label="Remover condição" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
      {def.ajuda && <p className="basis-full pl-1 text-[11px] text-muted-foreground">{def.ajuda}</p>}
    </div>
  )
}

/** Seletor de grupo/produto/simulado com busca no servidor. */
function RefPicker({ tipo, value, nome, obrigatoria, disabled, onChange }: {
  tipo: RefTipo; value: string | null; nome?: string; obrigatoria: boolean; disabled?: boolean; onChange: (id: string | null, nome?: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<{ id: string; nome: string }[] | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  // A lista abre FORA da área rolável (em portal dentro do pop-up), posicionada pelo botão: antes ficava cortada/atrás da coluna lateral.
  const [pos, setPos] = useState<null | { host: HTMLElement; left: number; top: number; width: number; maxH: number }>(null)
  function abrir() {
    const btn = caixa.current?.querySelector('button')
    const host = btn?.closest('[role=dialog]') as HTMLElement | null
    if (btn && host) {
      const b = btn.getBoundingClientRect(), h = host.getBoundingClientRect()
      const left = Math.max(8, b.left - h.left)
      const abaixo = h.bottom - b.bottom - 16
      const acima = b.top - h.top - 16
      const emCima = abaixo < 260 && acima > abaixo
      const maxH = Math.max(180, Math.min(420, emCima ? acima : abaixo))
      setPos({ host, left, top: emCima ? Math.max(8, b.top - h.top - maxH - 6) : b.bottom - h.top + 6, width: Math.max(320, Math.min(560, h.width - left - 16)), maxH })
    } else setPos(null)
    setAberto((a) => !a); setRows(null)
  }

  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => {
      buscarRefsSegmentoAction(tipo, q).then((r) => setRows('ok' in r ? r.rows : [])).catch(() => setRows([]))
    }, 220)
    return () => clearTimeout(t)
  }, [aberto, q, tipo])
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { const t = e.target as Node; if (caixa.current?.contains(t) || lista.current?.contains(t)) return; setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const rotulo = value ? (nome ?? `(${REF_LABEL[tipo]})`) : obrigatoria ? `Escolher ${REF_LABEL[tipo]}…` : `Qualquer ${REF_LABEL[tipo]}`
  return (
    <div ref={caixa} className="relative">
      <button type="button" disabled={disabled} onClick={abrir}
        className={cn(sel, 'inline-flex w-72 items-center justify-between gap-1 text-left', !value && obrigatoria && 'text-muted-foreground')}>
        <span className="truncate">{rotulo}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {aberto && (pos ? createPortal(
        <div ref={lista} style={pos ? { left: pos.left, top: pos.top, width: pos.width } : undefined} className={cn('z-[300] rounded-xl border bg-popover p-2 shadow-xl', pos ? 'absolute' : 'absolute left-0 top-10 w-[34rem] max-w-[calc(100vw-4rem)]')}>
          <div className="relative mb-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${REF_LABEL[tipo]}…`} className="h-8 pl-8" /></div>
          <div style={pos ? { maxHeight: pos.maxH - 56 } : undefined} className="max-h-72 overflow-auto [scrollbar-gutter:stable]">
            <div className="min-w-max">
            {!obrigatoria && <button type="button" onClick={() => { onChange(null); setAberto(false) }} className={cn('flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', !value && 'font-medium text-primary')}>Qualquer {REF_LABEL[tipo]}</button>}
            {rows === null ? <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</div>
              : rows.length ? rows.map((r) => (
                <button key={r.id} type="button" onClick={() => { onChange(r.id, r.nome); setAberto(false) }} className={cn('flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', value === r.id && 'font-medium text-primary')}>
                  <span>{r.nome}</span>{value === r.id && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </button>
              )) : <p className="px-2 py-3 text-sm text-muted-foreground">Nada encontrado.</p>}
            </div>
          </div>
        </div>
        , pos.host) : (
        <div ref={lista} className="absolute left-0 top-10 z-[300] w-[34rem] max-w-[calc(100vw-4rem)] rounded-xl border bg-popover p-2 shadow-xl">
          <div className="relative mb-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${REF_LABEL[tipo]}…`} className="h-8 pl-8" /></div>
          <div className="max-h-72 overflow-auto [scrollbar-gutter:stable]">
            <div className="min-w-max">
            {!obrigatoria && <button type="button" onClick={() => { onChange(null); setAberto(false) }} className={cn('flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', !value && 'font-medium text-primary')}>Qualquer {REF_LABEL[tipo]}</button>}
            {rows === null ? <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</div>
              : rows.length ? rows.map((r) => (
                <button key={r.id} type="button" onClick={() => { onChange(r.id, r.nome); setAberto(false) }} className={cn('flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', value === r.id && 'font-medium text-primary')}>
                  <span>{r.nome}</span>{value === r.id && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </button>
              )) : <p className="px-2 py-3 text-sm text-muted-foreground">Nada encontrado.</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** "Testar com um aluno": avalia a regra (mesmo sem salvar) e marca cada condição ✓/✗. */
export function TestarAluno({ regra, teste, onTeste }: {
  regra: RegraSegmento
  teste: null | { aluno: { id: string; nome: string }; corresponde: boolean }
  onTeste: (t: null | { aluno: { id: string; nome: string }; corresponde: boolean; condicoes: Record<string, boolean>; grupos: Record<string, boolean> }) => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<{ id: string; nome: string; email: string | null }[]>([])
  const [testando, setTestando] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return }
    const t = setTimeout(() => { buscarAlunosSegmentoAction(q).then((r) => setRows('ok' in r ? r.rows : [])).catch(() => setRows([])) }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function testar(a: { id: string; nome: string }) {
    const erro = validarRegra(regra)
    if (erro) { toast.error(erro); return }
    setTestando(a.id)
    try {
      const r = await testarSegmentoAction(regra, a.id)
      if ('error' in r) { toast.error(r.error); return }
      onTeste({ aluno: a, corresponde: r.corresponde, condicoes: r.condicoes, grupos: r.grupos }); setRows([]); setQ('')
    } finally { setTestando(null) }
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-primary" />Testar com um aluno</div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aluno por nome ou e-mail…" className="pl-8" />
        {rows.length > 0 && (
          <div className="absolute left-0 right-0 top-10 z-50 max-h-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
            {rows.map((a) => (
              <button key={a.id} type="button" onClick={() => testar(a)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.nome}</span>{a.email && <span className="block truncate text-xs text-muted-foreground">{a.email}</span>}</span>
                {testando === a.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {teste ? (
        <div className={cn('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm', teste.corresponde ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive')}>
          {teste.corresponde ? <CircleCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          <span><b>{teste.aluno.nome}</b> {teste.corresponde ? 'está neste segmento.' : 'não está neste segmento.'} As condições acima mostram ✓/✗ para este aluno.</span>
          <button type="button" onClick={() => onTeste(null)} className="ml-auto text-xs underline-offset-2 hover:underline">limpar</button>
        </div>
      ) : <p className="mt-2 text-xs text-muted-foreground">Avalia as condições atuais (mesmo sem salvar) com os dados reais do aluno.</p>}
    </div>
  )
}
