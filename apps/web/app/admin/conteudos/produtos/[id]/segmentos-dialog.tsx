'use client'

// SEGMENTOS do conteúdo — modal largo com 3 abas (Visibilidade · Liberação · Capa), para 1 ou VÁRIOS módulos/aulas.
// Cada aba tem a mesma estrutura: à esquerda o que JÁ vale para o(s) item(ns) marcado(s); à direita o formulário de
// uma nova regra. Os segmentos (públicos de alunos por condições) são criados/editados aqui mesmo.
//  · Visibilidade — quem vê (mostrar somente para / ocultar para), com "não aparece" ou "cadeado" para os demais;
//  · Liberação    — quando libera: padrão (todos) ou diferente por segmento (datas/prazos próprios);
//  · Capa         — imagem/título/descrição diferentes por segmento (módulos).
// Backend: aplicarVisibilidadeEmLoteAction · aplicarLiberacaoSegmentoAction · salvarCapaSegmentoAction (validam e auditam).

import { useEffect, useMemo, useState } from 'react'
import {
  Eye, EyeOff, Users, X, Loader2, Check, Trash2, Info, Plus, Pencil, Copy, CalendarClock, ImageIcon, Layers, FileText, KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { cn } from '@/lib/utils'
import { resumoDisponibilidade, type Disponibilidade } from '@/lib/produtos/curriculo'
import { EFEITO_LABEL, resumoRegra, type RegraVisibilidade, type Segmento } from '@/lib/segmentos/tipos'
import type { AlvoLote, VisibilidadeConteudo } from './visibilidade-actions-tipos'
import type { RegrasSegmentoAdmin, CapaSegAdmin } from './segmento-regras-tipos'
import {
  aplicarVisibilidadeEmLoteAction, excluirRegraVisibilidadeAction, alternarRegraVisibilidadeAction, duplicarSegmentoAction, excluirSegmentoAction,
} from './visibilidade-actions'
import {
  carregarRegrasSegmentoAction, aplicarLiberacaoSegmentoAction, removerLiberacaoSegmentoAction, alternarRegraSegmentoAction,
  salvarCapaSegmentoAction, removerCapaSegmentoAction,
} from './segmento-regras-actions'
import { SegmentoEditor } from './segmento-editor'
import { PublicoRapido, usePublico, type PublicoApi } from './publico-rapido'
import { verificarAcessoPublicoAction, vincularAcessoPublicoAction } from './segmento-regras-actions'
import { DisponibilidadeDialog } from './conteudo-modais'

export type SinaisSeg = { vis: string | null; lib: string | null; capa: string | null }

/** Sinalização de que o módulo/aula tem regra por segmento: Visibilidade · Liberação · Capa (tooltip com os segmentos). */
export function SinaisSegmento({ sinais, compacto, className, sobreImagem }: { sinais?: SinaisSeg | null; compacto?: boolean; className?: string; sobreImagem?: boolean }) {
  if (!sinais || (!sinais.vis && !sinais.lib && !sinais.capa)) return null
  const itens = [
    { k: 'vis', rot: 'Visibilidade', txt: sinais.vis, Icone: Eye },
    { k: 'lib', rot: 'Liberação', txt: sinais.lib, Icone: CalendarClock },
    { k: 'capa', rot: 'Capa', txt: sinais.capa, Icone: ImageIcon },
  ].filter((x) => x.txt)
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {itens.map(({ k, rot, txt, Icone }) => (
        <span key={k} title={`${rot} por segmento: ${txt}`} aria-label={`${rot} por segmento: ${txt}`}
          className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold', sobreImagem ? 'border-white/30 bg-black/55 text-white backdrop-blur-sm' : 'border-primary/30 bg-primary/10 text-primary')}>
          <Icone className="h-3 w-3 shrink-0" />{!compacto && rot}
        </span>
      ))}
    </span>
  )
}

/** Resumo curto das regras de visibilidade de UM alvo (chip da linha / detalhe da aula). */
export function resumoRegrasAlvo(regras: RegraVisibilidade[] | undefined, nomeSeg: (id: string) => string): string | null {
  const ativas = (regras ?? []).filter((r) => r.ativo)
  if (!ativas.length) return null
  return ativas.map((r) => `${r.efeito === 'mostrar' ? 'só' : 'oculto p/'} ${nomeSeg(r.segmento_id)}`).join(' · ')
}

export type AbaSegmentos = 'visibilidade' | 'liberacao' | 'capa'
const DISP_PADRAO: Disponibilidade = { tipo: 'na_matricula', antes: 'bloqueado_cadeado' }
const campo = 'h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function SegmentosDialog({ produtoId, alvos, titulo, titulos, imagens, filhosDe, dados, podeEditar, abaInicial = 'visibilidade', onClose, onMudou, onAplicarBase, baseResumo }: {
  produtoId: string
  alvos: AlvoLote[]
  titulo?: string
  /** id do módulo/aula → título (p/ listar quem tem cada regra quando há vários marcados). */
  titulos?: Record<string, string>
  /** ids de TODOS os submódulos (qualquer nível) de um módulo — p/ aplicar a capa também a eles. */
  filhosDe?: (moduloId: string) => string[]
  /** id do módulo → capa BASE (p/ comparar com a capa do segmento na grade em massa). */
  imagens?: Record<string, string | null>
  dados: (VisibilidadeConteudo & { disponivel: boolean }) | null
  podeEditar: boolean
  abaInicial?: AbaSegmentos
  onClose: () => void
  /** Recarrega as regras de visibilidade/segmentos no pai. */
  onMudou: () => void | Promise<void>
  /** Liberação padrão (todos os alunos) — executada pelo pai. */
  onAplicarBase?: (alvos: AlvoLote[], d: Disponibilidade) => Promise<void>
  baseResumo?: string | null
}) {
  const [aba, setAba] = useState<AbaSegmentos>(abaInicial)
  const [editSeg, setEditSeg] = useState<null | { seg: Segmento | null }>(null)
  const [nomesExtra, setNomesExtra] = useState<Record<string, string>>({})
  const [preferido, setPreferido] = useState('') // segmento recém-criado/editado: já vem selecionado nas abas
  const [rs, setRs] = useState<null | (RegrasSegmentoAdmin & { disponivel: boolean })>(null)
  const recarregarRs0 = () => carregarRegrasSegmentoAction(produtoId).then((r) => {
    if ('error' in r) { toast.error(r.error); setRs((x) => x ?? { disp: [], capas: [], disponivel: true }); return }
    setRs({ ...r.dados, disponivel: r.disponivel })
  }).catch(() => setRs((x) => x ?? { disp: [], capas: [], disponivel: true }))
  // Depois de salvar algo nas abas, também avisa o pai (sinais nos cards/linhas).
  const recarregarRs = async () => { await recarregarRs0(); void onMudou() }
  useEffect(() => { void recarregarRs0() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId])

  const segs = dados?.segmentos ?? []
  const nomesTodos = { ...(dados?.nomes ?? {}), ...nomesExtra }
  const ids = useMemo(() => new Set(alvos.map((a) => a.id)), [alvos])
  const total = alvos.length
  const soModulos = total > 0 && alvos.every((a) => a.tipo === 'modulo')
  const rotulo = soModulos ? 'módulo' : alvos.every((a) => a.tipo === 'aula') ? 'aula' : 'item'
  const plural = (n: number) => (n === 1 ? `1 ${rotulo}` : `${n} ${rotulo === 'item' ? 'itens' : `${rotulo}s`}`)
  const nomeSeg = (id: string) => segs.find((s) => s.id === id)?.nome ?? '(segmento removido)'

  const nVis = (dados?.regras ?? []).filter((r) => r.alvo_id && ids.has(r.alvo_id)).length
  const nLib = (rs?.disp ?? []).filter((r) => ids.has(r.alvo_id)).length
  const nCapa = (rs?.capas ?? []).filter((c) => c.alvo_id && ids.has(c.alvo_id)).length
  const abas: { k: AbaSegmentos; rot: string; n: number; Icone: typeof Eye; ajuda: string }[] = [
    { k: 'visibilidade', rot: 'Visibilidade', n: nVis, Icone: Eye, ajuda: 'Quem vê' },
    { k: 'liberacao', rot: 'Liberação', n: nLib, Icone: CalendarClock, ajuda: 'Quando libera' },
    { k: 'capa', rot: 'Capa', n: nCapa, Icone: ImageIcon, ajuda: 'Como aparece' },
  ]

  const comum = {
    produtoId, alvos, segs, nomesTodos, preferido, nomeAlvo: (id: string) => titulos?.[id] ?? '(item)', imagemBase: (id: string) => imagens?.[id] ?? null, filhosDe: filhosDe ?? (() => []), nomeSeg, plural, total, soModulos, podeEditar,
    onNovoSeg: () => setEditSeg({ seg: null }), onEditarSeg: (s: Segmento) => setEditSeg({ seg: s }), onMudou,
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton={false} className="flex h-[min(90vh,800px)] w-[min(1080px,calc(100vw-2rem))] max-w-[min(1080px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1080px,calc(100vw-2rem))]">
        {/* Cabeçalho */}
        <header className="flex shrink-0 items-center gap-3 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Users className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-semibold leading-tight">Segmentos</DialogTitle>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              {soModulos ? <Layers className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{total === 0 ? 'Nada selecionado' : total === 1 && titulo ? titulo : plural(total)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>

        {editSeg ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <SegmentoEditor key={editSeg.seg?.id ?? 'novo'} seg={editSeg.seg} produtoId={produtoId} podeEditar={podeEditar} nomes={nomesTodos}
              onNomes={(n) => setNomesExtra((x) => ({ ...x, ...n }))} onVoltar={() => setEditSeg(null)}
              onSalvo={(sg) => { setEditSeg(null); setPreferido(sg.id); void onMudou() }} />
          </div>
        ) : null}

        <div className={cn('flex min-h-0 flex-1 flex-col', editSeg && 'hidden')}>
        {/* Abas */}
        <nav role="tablist" aria-label="Regras por segmento" className="flex shrink-0 gap-1 border-b bg-muted/30 px-4">
          {abas.map(({ k, rot, n, Icone, ajuda }) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
              className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors', aba === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icone className="h-4 w-4" />
              <span className="flex flex-col items-start leading-tight"><span>{rot}</span><span className="text-[10px] font-normal opacity-70">{ajuda}</span></span>
              {n > 0 && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', aba === k ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{n}</span>}
            </button>
          ))}
        </nav>

        {/* Corpo */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {!dados ? <Carga t="Carregando segmentos…" />
            : total === 0 ? <Vazio icone={<Users className="h-8 w-8" />} t="Nada selecionado" d="Marque aulas ou módulos na lista e abra os segmentos de novo." />
            : aba === 'visibilidade' ? <AbaVisibilidade {...comum} dados={dados} />
            : aba === 'liberacao' ? <AbaLiberacao {...comum} rs={rs} setRs={setRs} onRs={recarregarRs} onAplicarBase={onAplicarBase} baseResumo={baseResumo} />
            : <AbaCapa {...comum} rs={rs} setRs={setRs} onRs={recarregarRs} />}
        </div>
        </div>
      </DialogContent>

    </Dialog>
  )
}

// ───────────────────────── peças ─────────────────────────
const Carga = ({ t }: { t: string }) => <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t}</div>
const Vazio = ({ icone, t, d }: { icone: React.ReactNode; t: string; d?: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground"><span className="opacity-40">{icone}</span><div className="text-sm font-medium text-foreground">{t}</div>{d && <p className="max-w-sm text-xs">{d}</p>}</div>
)
const AvisoMigracao = ({ nome }: { nome: string }) => <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Recurso ainda não ativado no banco — aplique a migração <code className="rounded bg-muted px-1">{nome}</code>.</div>

/** Duas colunas: o que já vale (esquerda) × formulário de nova regra (direita). */
function Duas({ esquerda, direita, tituloEsq, tituloDir }: { esquerda: React.ReactNode; direita: React.ReactNode; tituloEsq: string; tituloDir: string }) {
  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
      <section className="min-h-0 space-y-3 overflow-y-auto p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tituloEsq}</h3>
        {esquerda}
      </section>
      <section className="min-h-0 space-y-4 overflow-y-auto border-t bg-muted/30 p-6 lg:border-l lg:border-t-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tituloDir}</h3>
        {direita}
      </section>
    </div>
  )
}

function CartaoRegra({ icone, destrutivo, pausada, titulo, sub, direita }: { icone: React.ReactNode; destrutivo?: boolean; pausada?: boolean; titulo: React.ReactNode; sub?: React.ReactNode; direita?: React.ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-opacity', pausada && 'opacity-60')}>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', destrutivo ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>{icone}</span>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{titulo}</div>{sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}</div>
      {direita}
    </div>
  )
}

const BotaoX = ({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
)

/** "Nome A, Nome B +3" para uma lista de ids. */
const listaNomes = (ids: string[], nome: (id: string) => string, max = 3) => ids.slice(0, max).map(nome).join(', ') + (ids.length > max ? ` +${ids.length - max}` : '')

const Dica = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{children}</span></div>
)

type Comum = {
  produtoId: string; alvos: AlvoLote[]; segs: Segmento[]; nomesTodos: Record<string, string>; nomeSeg: (id: string) => string; preferido: string; nomeAlvo: (id: string) => string; imagemBase: (id: string) => string | null; filhosDe: (moduloId: string) => string[]
  plural: (n: number) => string; total: number; soModulos: boolean; podeEditar: boolean
  onNovoSeg: () => void; onEditarSeg: (s: Segmento) => void; onMudou: () => void | Promise<void>
}

/** Grupos que o segmento exige ("está no grupo X") — só condições positivas de grupo. */
function gruposDoSegmento(seg: Segmento | undefined): string[] {
  const out = new Set<string>()
  for (const g of seg?.regra.grupos ?? []) for (const x of g.condicoes) if (x.campo === 'grupo' && x.operador === 'possui' && x.ref) out.add(x.ref)
  return [...out]
}

/**
 * INTELIGÊNCIA DE ACESSO: regra de "mostrar/liberar/capa" só vale para quem já tem acesso ao produto. Confere se os grupos e alunos do público
 * estão em "Grupos de acesso" (ou já têm acesso) e, se faltar, oferece VINCULAR agora (grupos → Grupos de acesso; alunos → acesso manual).
 * Devolve false se o usuário cancelou ou deu erro (não aplica a regra).
 */
async function garantirAcesso(c: Comum, pub: PublicoApi, segAvancadoId: string): Promise<boolean> {
  const grupoIds = pub.modo === 'rapido' ? pub.grupos.map((x) => x.id) : gruposDoSegmento(c.segs.find((x) => x.id === segAvancadoId))
  const emails = pub.modo === 'rapido' ? pub.alunos.map((x) => x.email) : []
  if (!grupoIds.length && !emails.length) return true
  const v = await verificarAcessoPublicoAction(c.produtoId, { grupoIds, emails })
  if ('error' in v) { toast.error(v.error); return false }
  const { grupos, alunos } = v.faltando
  if (!grupos.length && !alunos.length) return true
  const lista = (xs: string[]) => `${xs.slice(0, 4).join(', ')}${xs.length > 4 ? ` e mais ${xs.length - 4}` : ''}`
  const partes = [
    grupos.length ? `${grupos.length} grupo(s) fora de “Grupos de acesso” deste produto: ${lista(grupos.map((x) => x.nome))}` : '',
    alunos.length ? `${alunos.length} aluno(s) sem acesso ao produto: ${lista(alunos.map((x) => x.nome))}` : '',
  ].filter(Boolean)
  const msg = `${partes.join('. ')}. Sem acesso ao produto eles não veem o conteúdo e a regra não terá efeito. Vincular agora?`
  if (await confirmar({ titulo: 'Dar acesso ao produto?', mensagem: msg, confirmar: 'Vincular e aplicar' })) {
    const r = await vincularAcessoPublicoAction(c.produtoId, { grupoIds: grupos.map((x) => x.id), emails: alunos.map((x) => x.email) })
    if ('error' in r) { toast.error(r.error); return false }
    const t = [r.gruposVinculados ? `${r.gruposVinculados} grupo(s) vinculado(s)` : '', r.alunosAdicionados ? `${r.alunosAdicionados} aluno(s) com acesso` : ''].filter(Boolean).join(' · ')
    toast.success(`${t || 'Acesso conferido'}.`)
    if (r.naoEncontrados.length) toast.message(`Sem cadastro: ${r.naoEncontrados.join(', ')}`)
    window.dispatchEvent(new Event('produto-acesso-mudou'))
    return true
  }
  return confirmar({ titulo: 'Aplicar mesmo assim?', mensagem: 'A regra será salva, mas só terá efeito para quem já tem acesso ao produto.', confirmar: 'Aplicar assim mesmo' })
}

/** Seletor de segmento + resumo das condições + criar/editar/duplicar/excluir. `todosLabel` ativa a opção "Todos". */
function BlocoSegmento({ c, pub, valor, onChange, todosLabel, ocupado, setOcupado }: { c: Comum; pub: PublicoApi; valor: string; onChange: (v: string) => void; todosLabel?: string; ocupado: boolean; setOcupado: (b: boolean) => void }) {
  const obj = c.segs.find((s) => s.id === valor) ?? null
  async function duplicar() {
    if (!obj) return
    setOcupado(true); const r = await duplicarSegmentoAction(obj.id); setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Segmento duplicado.'); await c.onMudou()
  }
  async function excluir() {
    if (!obj) return
    if (!(await confirmar({ titulo: 'Excluir segmento', mensagem: `Excluir o segmento "${obj.nome}"? As regras (de qualquer produto) que usam esse segmento também serão excluídas.`, confirmar: 'Excluir', destrutivo: true }))) return
    setOcupado(true); const r = await excluirSegmentoAction(obj.id, c.produtoId); setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    onChange(''); toast.success('Segmento excluído.'); await c.onMudou()
  }
  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-sm font-medium">Para quem</span>
        <div role="tablist" aria-label="Como escolher o público" className="grid grid-cols-2 rounded-xl border bg-muted/50 p-1 text-sm">
          {([['rapido', 'Grupos e alunos'], ['avancado', 'Segmento avançado']] as const).map(([k, rot]) => (
            <button key={k} type="button" role="tab" aria-selected={pub.modo === k} onClick={() => pub.setModo(k)}
              className={cn('rounded-lg px-2 py-1.5 font-medium transition-colors', pub.modo === k ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{rot}</button>
          ))}
        </div>
      </div>
      {pub.modo === 'rapido' ? <PublicoRapido pub={pub} produtoId={c.produtoId} vazioSignifica={todosLabel ? 'Sem seleção = todos os alunos (padrão).' : undefined} /> : (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><span className="text-sm font-medium">Segmento</span>
        <button type="button" onClick={c.onNovoSeg} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="h-3.5 w-3.5" />Criar segmento</button></div>
      {c.segs.length === 0 && !todosLabel
        ? <div className="rounded-xl border border-dashed bg-card px-3 py-4 text-center text-xs text-muted-foreground">Nenhum segmento ainda. Crie um público com condições (grupos, assinaturas, datas, simulados, progresso…).</div>
        : <select value={valor} onChange={(e) => onChange(e.target.value)} className={campo}>
            {todosLabel ? <option value="">{todosLabel}</option> : !valor && <option value="">Escolha um segmento…</option>}
            {c.segs.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>}
      {obj && (
        <div className="rounded-xl border bg-card p-3">
          <p className="line-clamp-4 text-xs text-muted-foreground">{resumoRegra(obj.regra, c.nomesTodos)}</p>
          {c.podeEditar && <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => c.onEditarSeg(obj)} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"><Pencil className="h-3 w-3" />Editar condições</button>
            <button type="button" disabled={ocupado} onClick={duplicar} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-3 w-3" />Duplicar</button>
            <button type="button" disabled={ocupado} onClick={excluir} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-3 w-3" />Excluir</button>
          </div>}
        </div>
      )}
    </div>
      )}
    </div>
  )
}

const Prioridade = ({ valor, onChange }: { valor: number; onChange: (n: number) => void }) => (
  <label className="flex items-center justify-between gap-3 text-sm"><span><span className="font-medium">Prioridade</span><span className="block text-xs text-muted-foreground">0 vence as demais, se o aluno estiver em vários segmentos</span></span>
    <Input type="number" min={0} max={999} value={valor} onChange={(e) => onChange(Math.max(0, Math.min(999, Number(e.target.value) || 0)))} className="h-10 w-20 shrink-0 text-center" /></label>
)

// ═══════════════════════ ABA VISIBILIDADE ═══════════════════════
function AbaVisibilidade({ dados, ...c }: Comum & { dados: VisibilidadeConteudo & { disponivel: boolean } }) {
  const [efeito, setEfeito] = useState<'mostrar' | 'ocultar'>('mostrar')
  const [segId, setSegId] = useState('')
  const pub = usePublico(c)
  const [semAcesso, setSemAcesso] = useState<'oculto' | 'bloqueado_cadeado'>('oculto')
  const [substituir, setSubstituir] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const ids = useMemo(() => new Set(c.alvos.map((a) => a.id)), [c.alvos])
  const regras = useMemo(() => dados.regras.filter((r) => r.alvo_id && ids.has(r.alvo_id)), [dados, ids])
  useEffect(() => { if (c.preferido) { setSegId(c.preferido); pub.setModo('avancado') } }, [c.preferido]) // eslint-disable-line react-hooks/exhaustive-deps
  const seg = segId || c.segs[0]?.id || ''
  const grupos = useMemo(() => {
    const m = new Map<string, { efeito: RegraVisibilidade['efeito']; segmento_id: string; sem: string; ativo: boolean; regras: RegraVisibilidade[] }>()
    for (const r of regras) { const k = `${r.efeito}:${r.segmento_id}:${r.sem_acesso}:${r.ativo}`; const g = m.get(k) ?? { efeito: r.efeito, segmento_id: r.segmento_id, sem: r.sem_acesso, ativo: r.ativo, regras: [] }; g.regras.push(r); m.set(k, g) }
    return [...m.values()]
  }, [regras])
  const comRegra = new Set(regras.map((r) => r.alvo_id)).size

  async function aplicar() {
    if (efeito === 'mostrar' && !(await garantirAcesso(c, pub, seg))) return // antes de criar o segmento automático
    const sr = await pub.resolver(seg); if (sr === false) return
    if (!sr) { toast.error('Escolha grupos/alunos ou um segmento.'); return }
    if (c.total > 1 && !(await confirmar({ titulo: 'Aplicar visibilidade', mensagem: `${efeito === 'mostrar' ? 'Mostrar somente para' : 'Ocultar para'} “${sr.nome}” em ${c.plural(c.total)}${substituir ? ' (substitui as regras que já existem nesses itens)' : ''}.${c.soModulos ? ' Vale para tudo dentro dos módulos, inclusive submódulos.' : ''}`, confirmar: 'Aplicar' }))) return
    setOcupado(true)
    const r = await aplicarVisibilidadeEmLoteAction(c.produtoId, c.alvos, { tipo: 'aplicar', segmento_id: sr.id, efeito, sem_acesso: semAcesso, substituir })
    setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(`Regra aplicada em ${c.plural(r.alvos)}.`); await c.onMudou()
  }
  async function limpar() {
    if (!(await confirmar({ titulo: 'Limpar visibilidade', mensagem: `Remover todas as regras de visibilidade de ${c.plural(c.total)}? Voltam a aparecer para quem tem acesso ao produto. Os segmentos continuam existindo.`, confirmar: 'Limpar regras', destrutivo: true }))) return
    setOcupado(true); const r = await aplicarVisibilidadeEmLoteAction(c.produtoId, c.alvos, { tipo: 'limpar' }); setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(`${r.removidas} regra(s) removida(s).`); await c.onMudou()
  }
  async function alternar(rs: RegraVisibilidade[], ativo: boolean) {
    setOcupado(true)
    for (const x of rs) { const r = await alternarRegraVisibilidadeAction(c.produtoId, x.id, ativo); if ('error' in r) { toast.error(r.error); break } }
    setOcupado(false); await c.onMudou()
  }
  async function remover(rs: RegraVisibilidade[]) {
    setOcupado(true)
    for (const x of rs) { const r = await excluirRegraVisibilidadeAction(c.produtoId, x.id); if ('error' in r) { toast.error(r.error); break } }
    setOcupado(false); toast.success('Regra removida.'); await c.onMudou()
  }

  return (
    <Duas tituloEsq="O que vale hoje" tituloDir="Nova regra"
      esquerda={!dados.disponivel ? <AvisoMigracao nome="20261103130000_segmentos_visibilidade.sql" /> : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground"><Eye className="mx-auto mb-2 h-6 w-6 opacity-40" />{c.total === 1 ? 'Sem regra: visível para todos que têm acesso ao produto.' : `Nenhum dos ${c.total} itens tem regra: todos visíveis para quem tem acesso ao produto.`}</div>
      ) : (
        <>
          {grupos.map((g) => (
            <CartaoRegra key={`${g.efeito}:${g.segmento_id}:${g.sem}:${g.ativo}`} destrutivo={g.efeito === 'ocultar'} pausada={!g.ativo}
              icone={g.efeito === 'ocultar' ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              titulo={<>{EFEITO_LABEL[g.efeito]} <span className="rounded-full border bg-background px-2 py-0.5 text-xs"><Users className="mr-1 inline h-3 w-3" />{c.nomeSeg(g.segmento_id)}</span></>}
              sub={`${c.total > 1 ? `em ${g.regras.length} de ${c.total} (${listaNomes(g.regras.map((x) => x.alvo_id as string), c.nomeAlvo)}) · ` : ''}demais alunos: ${g.sem === 'bloqueado_cadeado' ? 'com cadeado' : 'não aparece'}${g.ativo ? '' : ' · pausada'}`}
              direita={c.podeEditar && <><Switch checked={g.ativo} onCheckedChange={(v: boolean) => alternar(g.regras, v)} disabled={ocupado} aria-label="Regra ativa" /><BotaoX label="Remover regra" disabled={ocupado} onClick={() => remover(g.regras)} /></>} />
          ))}
          <p className="text-xs text-muted-foreground">{comRegra} de {c.total} com alguma regra · {c.total - comRegra} sem regra</p>
        </>
      )}
      direita={!c.podeEditar ? <p className="text-sm text-muted-foreground">Você só pode visualizar.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {([['mostrar', 'Mostrar somente para', 'Só o segmento vê', Eye], ['ocultar', 'Ocultar para', 'O segmento não vê', EyeOff]] as const).map(([v, rot, sub, Icone]) => (
              <button key={v} type="button" aria-pressed={efeito === v} onClick={() => setEfeito(v)}
                className={cn('flex flex-col items-start gap-1 rounded-2xl border-2 bg-card p-3 text-left transition-colors', efeito === v ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border')}>
                <Icone className={cn('h-5 w-5', efeito === v ? 'text-primary' : 'text-muted-foreground')} /><span className="text-sm font-medium leading-tight">{rot}</span><span className="text-xs text-muted-foreground">{sub}</span>
              </button>
            ))}
          </div>
          <BlocoSegmento c={c} pub={pub} valor={seg} onChange={setSegId} ocupado={ocupado} setOcupado={setOcupado} />
          <label className="block space-y-1.5"><span className="text-sm font-medium">Para quem não pode ver</span>
            <select value={semAcesso} onChange={(e) => setSemAcesso(e.target.value as 'oculto' | 'bloqueado_cadeado')} className={campo}>
              <option value="oculto">Não aparece</option><option value="bloqueado_cadeado">Aparece com cadeado (“conteúdo exclusivo”)</option>
            </select></label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
            <span><span className="font-medium">Substituir as regras atuais</span><span className="block text-xs text-muted-foreground">{substituir ? 'Remove as regras que estes itens já têm e deixa só esta.' : 'Mantém as outras regras; troca só a deste segmento.'}</span></span></label>
          <Dica>{efeito === 'mostrar' ? 'Só quem está no segmento vê' : 'Quem está no segmento não vê'} o conteúdo ({c.plural(c.total)}){c.soModulos ? ' e tudo dentro dele' : ''}. Funciona junto com a liberação por data.</Dica>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={aplicar} disabled={ocupado || (pub.modo === 'rapido' ? pub.vazio : !seg)}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aplicar{c.total > 1 ? ` a ${c.total}` : ''}</Button>
            {comRegra > 0 && <Button variant="outline" onClick={limpar} disabled={ocupado}><Trash2 className="h-4 w-4" />Limpar</Button>}
          </div>
        </>
      )} />
  )
}

// ═══════════════════════ ABA LIBERAÇÃO ═══════════════════════
type RsState = (RegrasSegmentoAdmin & { disponivel: boolean }) | null
/** Mescla capas devolvidas pelo servidor no estado local (por id; ou por segmento+módulo). */
const mesclarCapas = (prev: RsState, novas: CapaSegAdmin[]): RsState => {
  if (!prev || !novas.length) return prev
  const chave = (x: CapaSegAdmin) => `${x.segmento_id}|${x.alvo_id}`
  const ks = new Set(novas.map(chave)), ids = new Set(novas.map((x) => x.id))
  return { ...prev, capas: [...prev.capas.filter((x) => !ids.has(x.id) && !ks.has(chave(x))), ...novas] }
}
function AbaLiberacao({ rs, setRs, onRs, onAplicarBase, baseResumo, ...c }: Comum & { rs: RsState; setRs: React.Dispatch<React.SetStateAction<RsState>>; onRs: () => Promise<void> | void; onAplicarBase?: (alvos: AlvoLote[], d: Disponibilidade) => Promise<void>; baseResumo?: string | null }) {
  const [segId, setSegId] = useState('') // '' = todos os alunos
  const pub = usePublico(c)
  const temPublico = pub.modo === 'rapido' ? !pub.vazio : !!segId
  const [restringir, setRestringir] = useState(false) // bloquear quem NÃO está no público (cria regra de Visibilidade "mostrar somente para")
  const [semAcessoRestr, setSemAcessoRestr] = useState<'oculto' | 'bloqueado_cadeado'>('bloqueado_cadeado')
  const [disp, setDisp] = useState<Disponibilidade>(DISP_PADRAO)
  const [prioridade, setPrioridade] = useState(0)
  const [editarDisp, setEditarDisp] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (c.preferido) setSegId(c.preferido) }, [c.preferido]) // eslint-disable-line react-hooks/exhaustive-deps
  const ids = useMemo(() => new Set(c.alvos.map((a) => a.id)), [c.alvos])
  const doAlvo = useMemo(() => (rs?.disp ?? []).filter((r) => ids.has(r.alvo_id)), [rs, ids])
  const grupos = useMemo(() => {
    const m = new Map<string, { segmento_id: string; resumo: string; prioridade: number; ativo: boolean; regras: typeof doAlvo }>()
    for (const r of doAlvo) { const resumo = resumoDisponibilidade(r.disponibilidade); const k = `${r.segmento_id}|${resumo}|${r.prioridade}|${r.ativo}`; const g = m.get(k) ?? { segmento_id: r.segmento_id, resumo, prioridade: r.prioridade, ativo: r.ativo, regras: [] }; g.regras.push(r); m.set(k, g) }
    return [...m.values()].sort((a, b) => a.prioridade - b.prioridade)
  }, [doAlvo])

  async function aplicar() {
    if (temPublico && !(await garantirAcesso(c, pub, segId))) return // antes de criar o segmento automático
    const sr = await pub.resolver(segId); if (sr === false) return
    if (!sr) {
      if (!onAplicarBase) { toast.error('Escolha grupos/alunos ou um segmento.'); return }
      setOcupado(true); await onAplicarBase(c.alvos, disp); setOcupado(false); return
    }
    if (c.total > 1 && !(await confirmar({ titulo: 'Aplicar liberação', mensagem: `Para “${sr.nome}”: ${resumoDisponibilidade(disp)} em ${c.plural(c.total)} (troca a regra anterior deste segmento nesses itens).`, confirmar: 'Aplicar' }))) return
    setOcupado(true); const r = await aplicarLiberacaoSegmentoAction(c.produtoId, c.alvos, { segmento_id: sr.id, disponibilidade: disp, prioridade }); setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    // Atualiza a lista NA HORA com o que o servidor devolveu (sem esperar outra consulta) e confere em segundo plano.
    setRs((prev) => prev && { ...prev, disp: [...prev.disp.filter((x) => !(x.segmento_id === sr.id && ids.has(x.alvo_id))), ...r.regras] })
    if (restringir) {
      const v = await aplicarVisibilidadeEmLoteAction(c.produtoId, c.alvos, { tipo: 'aplicar', segmento_id: sr.id, efeito: 'mostrar', sem_acesso: semAcessoRestr, substituir: false })
      if ('error' in v) toast.error(`Liberação aplicada, mas a restrição falhou: ${v.error}`)
      else { toast.success(`Liberação aplicada e restrita a “${sr.nome}” em ${c.plural(r.alvos)}.`); void c.onMudou(); void onRs(); return }
    }
    toast.success(`Liberação aplicada em ${c.plural(r.alvos)}.`); void onRs()
  }
  async function remover(regras: { id: string }[]) {
    if (!(await confirmar({ titulo: 'Remover liberação do segmento', mensagem: `Remover ${regras.length} regra(s)? Esses alunos voltam a seguir a liberação padrão.`, confirmar: 'Remover', destrutivo: true }))) return
    setOcupado(true); const r = await removerLiberacaoSegmentoAction(c.produtoId, regras.map((x) => x.id)); setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    const gone = new Set(regras.map((x) => x.id))
    setRs((prev) => prev && { ...prev, disp: prev.disp.filter((x) => !gone.has(x.id)) })
    toast.success('Regra removida.'); void onRs()
  }
  async function alternar(regras: { id: string }[], ativo: boolean) {
    setOcupado(true)
    for (const x of regras) { const r = await alternarRegraSegmentoAction(c.produtoId, 'disp', x.id, ativo); if ('error' in r) { toast.error(r.error); break } }
    const set = new Set(regras.map((x) => x.id))
    setRs((prev) => prev && { ...prev, disp: prev.disp.map((x) => (set.has(x.id) ? { ...x, ativo } : x)) })
    setOcupado(false); void onRs()
  }

  if (!rs) return <Carga t="Carregando liberações…" />
  return (
    <>
    <Duas tituloEsq="Como libera hoje" tituloDir="Definir liberação"
      esquerda={
        <>
          {!rs.disponivel && <AvisoMigracao nome="20261115010000_produto_regras_por_segmento.sql" />}
          {grupos.map((g) => (
            <CartaoRegra key={`${g.segmento_id}${g.resumo}${g.prioridade}${g.ativo}`} pausada={!g.ativo} icone={<CalendarClock className="h-5 w-5" />}
              titulo={<><span className="rounded-full border bg-background px-2 py-0.5 text-xs"><Users className="mr-1 inline h-3 w-3" />{c.nomeSeg(g.segmento_id)}</span> <span className="capitalize">{g.resumo}</span></>}
              sub={`${c.total > 1 ? `em ${g.regras.length} de ${c.total} (${listaNomes(g.regras.map((x) => x.alvo_id), c.nomeAlvo)}) · ` : ''}prioridade ${g.prioridade}${g.ativo ? '' : ' · pausada'}`}
              direita={c.podeEditar && <><Switch checked={g.ativo} onCheckedChange={(v: boolean) => alternar(g.regras, v)} disabled={ocupado} aria-label="Regra ativa" /><BotaoX label="Remover regra" disabled={ocupado} onClick={() => remover(g.regras)} /></>} />
          ))}
          {grupos.length === 0 && <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma liberação diferente por segmento. Ex.: o grupo “Black” recebe 7 dias antes dos demais.</p>}
          <CartaoRegra icone={<KeyRound className="h-5 w-5" />} titulo={grupos.length ? 'Demais alunos (padrão)' : 'Todos os alunos'}
            sub={grupos.length ? <>Quem <b>não</b> está nos públicos acima{baseResumo ? <> · <span className="capitalize">{baseResumo}</span></> : ' segue a liberação padrão do item'}</> : baseResumo ? <span className="capitalize">{baseResumo}</span> : 'Liberação padrão — vale para quem não tem regra de segmento'} />
        </>
      }
      direita={!c.podeEditar ? <p className="text-sm text-muted-foreground">Você só pode visualizar.</p> : (
        <>
          <BlocoSegmento c={c} pub={pub} valor={segId} onChange={setSegId} todosLabel={onAplicarBase ? 'Todos os alunos (padrão)' : undefined} ocupado={ocupado} setOcupado={setOcupado} />
          <div className="space-y-1.5"><span className="text-sm font-medium">Quando libera{temPublico ? ' para este público' : ' para todos'}</span>
            <button type="button" onClick={() => setEditarDisp(true)} className="flex h-11 w-full items-center justify-between rounded-xl border bg-card px-3 text-sm hover:bg-muted"><span className="truncate capitalize">{resumoDisponibilidade(disp)}</span><Pencil className="h-4 w-4 shrink-0 text-muted-foreground" /></button></div>
          {temPublico && <Prioridade valor={prioridade} onChange={setPrioridade} />}
          {temPublico && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={restringir} onChange={(e) => setRestringir(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
              <span className="min-w-0 flex-1"><span className="font-medium">Só este público acessa (bloquear os demais)</span>
                <span className="block text-xs text-muted-foreground">Liberação só define <b>quando</b> libera — não impede os outros alunos. Marque para também esconder o conteúdo de quem não está no público.</span>
                {restringir && <select value={semAcessoRestr} onChange={(e) => setSemAcessoRestr(e.target.value as 'oculto' | 'bloqueado_cadeado')} onClick={(e) => e.stopPropagation()} className={cn(campo, 'mt-2')}><option value="bloqueado_cadeado">Demais veem com cadeado</option><option value="oculto">Demais não veem (some)</option></select>}
              </span></label>
          )}
          {temPublico && !restringir && disp.tipo === 'na_matricula' && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /><span><b>“Disponível sempre” não muda nada</b> para ninguém. Para restringir o acesso a este público, marque “Só este público acessa” ou use a aba <b>Visibilidade</b> (Mostrar somente para).</span></div>
          )}
          <Dica>{temPublico ? <>Quem está no público usa esta liberação <b>no lugar</b> da padrão. Quem não está segue “Todos os alunos”.</> : <>Liberação padrão{c.soModulos ? ' das aulas dentro dos módulos (inclui submódulos)' : ''}: vale para quem não tiver liberação própria de segmento.</>}</Dica>
          <Button className="w-full" onClick={aplicar} disabled={ocupado || (!temPublico && !onAplicarBase)}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aplicar{c.total > 1 ? ` a ${c.total}` : ''}</Button>
        </>
      )} />
    {editarDisp && <DisponibilidadeDialog valor={disp} escopo={c.soModulos ? 'módulo' : 'aula'} onClose={() => setEditarDisp(false)} onAplicar={(d: Disponibilidade) => { setDisp(d); setEditarDisp(false) }} />}
    </>
  )
}

// ═══════════════════════ ABA CAPA (módulos) ═══════════════════════
function AbaCapa({ rs, setRs, onRs, ...c }: Comum & { rs: RsState; setRs: React.Dispatch<React.SetStateAction<RsState>>; onRs: () => Promise<void> | void }) {
  const [editId, setEditId] = useState<string | null>(null)
  const [segId, setSegId] = useState('')
  const pub = usePublico(c)
  const [imagem, setImagem] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ocultarTitulo, setOcultarTitulo] = useState(false)
  const [prioridade, setPrioridade] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const modulos = c.alvos.filter((a) => a.tipo === 'modulo')
  const unico = modulos.length === 1
  const [incluirSubs, setIncluirSubs] = useState(false)
  const descendentes = useMemo(() => [...new Set(modulos.flatMap((m) => c.filhosDe(m.id)))].filter((id) => !modulos.some((m) => m.id === id)), [c.alvos]) // eslint-disable-line react-hooks/exhaustive-deps
  const alvosCapa = (base: { id: string }[]) => (incluirSubs ? [...base.map((m) => m.id), ...descendentes.filter((id) => !base.some((m) => m.id === id))].map((id) => ({ id })) : base)
  const [editAlvo, setEditAlvo] = useState<string | null>(null) // módulo da capa em edição
  const editando = editId !== null
  const ids = useMemo(() => new Set(modulos.map((a) => a.id)), [c.alvos]) // eslint-disable-line react-hooks/exhaustive-deps
  const doAlvo = useMemo(() => (rs?.capas ?? []).filter((x) => x.alvo_tipo === 'modulo' && x.alvo_id && ids.has(x.alvo_id)), [rs, ids])
  useEffect(() => { if (c.preferido) { setSegId(c.preferido); pub.setModo('avancado') } }, [c.preferido]) // eslint-disable-line react-hooks/exhaustive-deps
  const seg = segId || c.segs[0]?.id || ''
  const segLista = pub.modo === 'rapido' ? pub.existenteId : seg // segmento cujas capas a grade mostra
  const temSeg = pub.modo === 'rapido' ? !pub.vazio : !!seg
  // EM MASSA (vários módulos marcados): uma imagem por módulo para o MESMO segmento, numa grade, salvando tudo de uma vez.
  const massa = modulos.length > 1
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [modoMassa, setModoMassa] = useState<'individual' | 'unica'>('individual') // 'unica' = a MESMA capa em todos os marcados
  const [imagemUnica, setImagemUnica] = useState('')
  const existentes = useMemo(() => {
    const m: Record<string, string> = {}
    for (const x of rs?.capas ?? []) if (x.alvo_tipo === 'modulo' && x.alvo_id && ids.has(x.alvo_id) && x.segmento_id === segLista && x.imagem_url) m[x.alvo_id] = x.imagem_url
    return m
  }, [rs, ids, segLista])
  useEffect(() => { setRascunho(existentes) }, [existentes])
  const alterados = modulos.filter((m) => rascunho[m.id] && rascunho[m.id] !== existentes[m.id])
  const pendentes = modoMassa === 'unica' ? (imagemUnica ? modulos.length : 0) : alterados.length

  async function salvarMassa() {
    if (!(await garantirAcesso(c, pub, seg))) return // antes de criar o segmento automático
    const sr = await pub.resolver(seg); if (sr === false) return
    if (!sr) { toast.error('Escolha grupos/alunos ou um segmento.'); return }
    const lista = modoMassa === 'unica' ? (imagemUnica ? alvosCapa(modulos).map((m) => ({ id: m.id, url: imagemUnica })) : []) : alvosCapa(alterados).map((m) => ({ id: m.id, url: m.id in rascunho ? rascunho[m.id] : (alterados.length === 1 ? rascunho[alterados[0].id] : '') })).filter((x) => x.url)
    if (!lista.length) { toast.error(modoMassa === 'unica' ? 'Envie a imagem.' : 'Envie ao menos uma imagem nova.'); return }
    if (!(await confirmar({ titulo: 'Salvar capas do segmento', mensagem: modoMassa === 'unica' ? `Usar a MESMA imagem em ${lista.length} módulo(s)${incluirSubs ? ' (marcados + submódulos)' : ' marcados'}, para “${sr.nome}”. (Troca a capa que esse segmento já tinha neles.)` : `Salvar ${lista.length} capa(s) para “${sr.nome}”.`, confirmar: 'Salvar' }))) return
    setOcupado(true)
    let ok = 0
    const salvas: CapaSegAdmin[] = []
    for (const m of lista) {
      const r = await salvarCapaSegmentoAction(c.produtoId, { id: null, segmento_id: sr.id, alvo_tipo: 'modulo', alvo_id: m.id, imagem_url: m.url, ocultar_titulo: ocultarTitulo, prioridade })
      if ('error' in r) { toast.error(`${c.nomeAlvo(m.id)}: ${r.error}`); break }
      salvas.push(r.capa); ok++
    }
    setRs((prev) => mesclarCapas(prev, salvas))
    setOcupado(false)
    if (ok) { toast.success(`${ok} capa(s) salva(s).`); if (modoMassa === 'unica') setImagemUnica(''); void onRs() }
  }

  function limpar() { setEditId(null); setEditAlvo(null); setImagem(''); setTitulo(''); setDescricao(''); setOcultarTitulo(false); setPrioridade(0) }
  function editar(x: CapaSegAdmin) { pub.setModo('avancado'); setEditId(x.id); setEditAlvo(x.alvo_id); setSegId(x.segmento_id); setImagem(x.imagem_url ?? ''); setTitulo(x.titulo ?? ''); setDescricao(x.descricao ?? ''); setOcultarTitulo(x.ocultar_titulo); setPrioridade(x.prioridade) }

  async function salvar() {
    if (!imagem && !titulo.trim() && !descricao.trim()) { toast.error('Envie a imagem ou preencha título/descrição.'); return }
    if (!(await garantirAcesso(c, pub, seg))) return // antes de criar o segmento automático
    const sr = await pub.resolver(seg); if (sr === false) return
    if (!sr) { toast.error('Escolha grupos/alunos ou um segmento.'); return }
    if (!imagem && !titulo.trim() && !descricao.trim()) { toast.error('Envie a imagem ou preencha título/descrição.'); return }
    if (!unico && !editando && !(await confirmar({ titulo: 'Aplicar capa', mensagem: `Aplicar esta capa para “${sr.nome}” em ${modulos.length} módulos?`, confirmar: 'Aplicar' }))) return
    setOcupado(true)
    let ok = 0
    const salvas: CapaSegAdmin[] = []
    const alvoLista = editando && editAlvo ? [{ id: editAlvo }] : alvosCapa(modulos)
    const comTexto = editando || unico
    const originais = new Set(modulos.map((x) => x.id))
    for (const m of alvoLista) {
      const r = await salvarCapaSegmentoAction(c.produtoId, { id: editando ? editId : null, segmento_id: sr.id, alvo_tipo: 'modulo', alvo_id: m.id, imagem_url: imagem || null, titulo: comTexto && (editando || originais.has(m.id)) ? titulo : null, descricao: comTexto && (editando || originais.has(m.id)) ? descricao : null, ocultar_titulo: ocultarTitulo, prioridade })
      if ('error' in r) { toast.error(r.error); break }
      salvas.push(r.capa); ok++
    }
    setRs((prev) => mesclarCapas(prev, salvas))
    setOcupado(false)
    if (ok) { toast.success(ok === 1 ? 'Capa salva.' : `Capa aplicada em ${ok} módulos.`); limpar(); void onRs() }
  }
  async function remover(x: CapaSegAdmin) {
    if (!(await confirmar({ titulo: 'Remover capa do segmento', mensagem: `Remover a capa de “${c.nomeSeg(x.segmento_id)}”? Esses alunos voltam a ver a capa base.`, confirmar: 'Remover', destrutivo: true }))) return
    setOcupado(true); const r = await removerCapaSegmentoAction(c.produtoId, x.id); setOcupado(false)
    if ('error' in r) { toast.error(r.error); return }
    setRs((prev) => prev && { ...prev, capas: prev.capas.filter((y) => y.id !== x.id) })
    toast.success('Capa removida.'); if (editId === x.id) limpar(); void onRs()
  }
  async function alternar(x: CapaSegAdmin, ativo: boolean) {
    setOcupado(true); const r = await alternarRegraSegmentoAction(c.produtoId, 'capa', x.id, ativo); setOcupado(false)
    if ('error' in r) toast.error(r.error); else setRs((prev) => prev && { ...prev, capas: prev.capas.map((y) => (y.id === x.id ? { ...y, ativo } : y)) })
    void onRs()
  }

  if (!rs) return <Carga t="Carregando capas…" />
  if (!modulos.length) return <Vazio icone={<ImageIcon className="h-8 w-8" />} t="A capa por segmento vale para módulos" d="Marque um ou mais cards de módulo — ou abra o módulo e use “Segmentos” — para definir capas diferentes por grupo." />
  if (massa) {
    const comCapa = modulos.filter((m) => existentes[m.id]).length
    return (
      <Duas tituloEsq={`Uma capa por módulo · ${modulos.length} módulos`} tituloDir="Segmento"
        esquerda={
          <>
            {!rs.disponivel && <AvisoMigracao nome="20261115010000_produto_regras_por_segmento.sql" />}
            <Dica>Envie a imagem de <b>cada módulo</b> para o segmento escolhido. Quem está no segmento vê essas capas; os demais seguem a capa base. {seg ? <>Já têm capa neste segmento: <b>{comCapa}</b> de {modulos.length}.</> : null}</Dica>
            <div role="tablist" aria-label="Modo das capas" className="inline-flex rounded-xl border bg-muted/50 p-1 text-sm">
              {([['individual', 'Uma capa por módulo'], ['unica', 'Mesma capa para todos']] as const).map(([k, rot]) => (
                <button key={k} type="button" role="tab" aria-selected={modoMassa === k} onClick={() => setModoMassa(k)}
                  className={cn('rounded-lg px-3 py-1.5 font-medium transition-colors', modoMassa === k ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{rot}</button>
              ))}
            </div>
            {modoMassa === 'unica' ? (
              <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[200px_minmax(0,1fr)]">
                <div><div className="mb-1.5 text-sm font-medium">Imagem única</div><CampoImagem value={imagemUnica || null} onChange={setImagemUnica} aspecto="2 / 3" compacto textoVazio="Capa para todos" /></div>
                <div className="min-w-0"><div className="mb-1.5 text-sm font-medium">Vai para {modulos.length} módulos</div>
                  <div className="flex flex-wrap gap-1.5">{modulos.map((m) => <span key={m.id} className="max-w-full truncate rounded-full border bg-background px-2.5 py-1 text-xs">{c.nomeAlvo(m.id)}</span>)}</div>
                  <p className="mt-3 text-xs text-muted-foreground">Como “mesclar”: a mesma imagem vira a capa do segmento em todos os módulos marcados. Depois dá para trocar a de um módulo no modo “Uma capa por módulo”.</p></div>
              </div>
            ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {modulos.map((m) => {
                const base = c.imagemBase(m.id), nova = rascunho[m.id], mudou = !!nova && nova !== existentes[m.id]
                return (
                  <div key={m.id} className={cn('rounded-2xl border bg-card p-3 shadow-sm', mudou && 'ring-2 ring-primary', existentes[m.id] && !mudou && 'border-primary/40')}>
                    <div className="mb-2 truncate text-sm font-medium" title={c.nomeAlvo(m.id)}>{c.nomeAlvo(m.id)}</div>
                    <div className="flex items-start gap-2">
                      <div className="w-14 shrink-0 space-y-1"><div className="aspect-[2/3] overflow-hidden rounded-lg border bg-muted">{base ? <img src={base} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-muted-foreground"><ImageIcon className="h-4 w-4" /></span>}</div><div className="text-center text-[10px] text-muted-foreground">base</div></div>
                      <div className="min-w-0 flex-1"><CampoImagem value={nova || null} onChange={(u) => setRascunho((r) => ({ ...r, [m.id]: u }))} aspecto="2 / 3" compacto textoVazio="Capa do segmento" /></div>
                    </div>
                    {existentes[m.id] && !mudou && <div className="mt-1.5 text-[10px] font-medium text-primary">Já tem capa neste segmento</div>}
                  </div>
                )
              })}
            </div>
            )}
          </>
        }
        direita={!c.podeEditar ? <p className="text-sm text-muted-foreground">Você só pode visualizar.</p> : (
          <>
            <BlocoSegmento c={c} pub={pub} valor={seg} onChange={setSegId} ocupado={ocupado} setOcupado={setOcupado} />
            {descendentes.length > 0 && !editando && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={incluirSubs} onChange={(e) => setIncluirSubs(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" /><span><span className="font-medium">Aplicar também aos {descendentes.length} submódulo(s) dentro deles</span><span className="block text-xs text-muted-foreground">A capa deste público vai para todos os submódulos (qualquer nível), só a imagem.</span></span></label>
            )}
            {descendentes.length > 0 && !editando && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={incluirSubs} onChange={(e) => setIncluirSubs(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" /><span><span className="font-medium">Aplicar também aos {descendentes.length} submódulo(s) dentro deles</span><span className="block text-xs text-muted-foreground">A capa deste público vai para todos os submódulos (qualquer nível), só a imagem.</span></span></label>
            )}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={ocultarTitulo} onChange={(e) => setOcultarTitulo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" /><span><span className="font-medium">Ocultar o título sobre a imagem</span><span className="block text-xs text-muted-foreground">Use quando a imagem já traz o texto.</span></span></label>
            <Prioridade valor={prioridade} onChange={setPrioridade} />
            <Button className="w-full" onClick={salvarMassa} disabled={ocupado || !temSeg || !pendentes}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar {pendentes ? `${pendentes} capa${pendentes === 1 ? '' : 's'}` : 'capas'}</Button>
            <p className="text-xs text-muted-foreground">Para remover ou editar título/descrição de uma capa, marque só aquele módulo.</p>
          </>
        )} />
    )
  }
  return (
    <Duas tituloEsq="Capas por segmento" tituloDir={editando ? `Editar capa${editAlvo && !unico ? ` · ${c.nomeAlvo(editAlvo)}` : ''}` : 'Nova capa'}
      esquerda={
        <>
          {!rs.disponivel && <AvisoMigracao nome="20261115010000_produto_regras_por_segmento.sql" />}
          {doAlvo.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-2 h-6 w-6 opacity-40" />Sem capa por segmento: todos veem a capa base {unico ? 'do módulo' : 'dos módulos'}. Ex.: o grupo “Black” vê uma capa exclusiva.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {doAlvo.map((x) => (
                <div key={x.id} className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm transition-opacity', !x.ativo && 'opacity-60', editId === x.id && 'ring-2 ring-primary')}>
                  <div className="relative aspect-[16/9] bg-muted">
                    {x.imagem_url ? <img src={x.imagem_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-muted-foreground"><ImageIcon className="h-7 w-7" /></span>}
                    {c.podeEditar && <span className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow"><Switch checked={x.ativo} onCheckedChange={(v: boolean) => alternar(x, v)} disabled={ocupado} aria-label="Capa ativa" /></span>}
                  </div>
                  <div className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">{!unico && x.alvo_id && <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.nomeAlvo(x.alvo_id)}</div>}<div className="truncate text-sm font-medium"><Users className="mr-1 inline h-3.5 w-3.5" />{c.nomeSeg(x.segmento_id)}</div><div className="truncate text-xs text-muted-foreground">{x.titulo ?? (x.imagem_url ? 'Só imagem' : 'Texto')} · prioridade {x.prioridade}</div></div>
                    {c.podeEditar && <><button type="button" onClick={() => editar(x)} aria-label="Editar capa" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button><BotaoX label="Remover capa" disabled={ocupado} onClick={() => remover(x)} /></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      }
      direita={!c.podeEditar ? <p className="text-sm text-muted-foreground">Você só pode visualizar.</p> : (
        <>
          <BlocoSegmento c={c} pub={pub} valor={seg} onChange={setSegId} ocupado={ocupado} setOcupado={setOcupado} />
          <div className="space-y-1.5"><span className="text-sm font-medium">Imagem da capa</span>
            <div className="max-w-[220px]"><CampoImagem value={imagem || null} onChange={(u) => setImagem(u)} aspecto="2 / 3" compacto rotulo="Vertical · 2:3 — como a capa do módulo" /></div></div>
          {(unico || editando) && (
            <>
              <label className="block space-y-1.5"><span className="text-sm font-medium">Título <span className="font-normal text-muted-foreground">(vazio mantém o do módulo)</span></span><Input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 250))} className="h-10" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></span><textarea value={descricao} onChange={(e) => setDescricao(e.target.value.slice(0, 2000))} rows={3} className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            </>
          )}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-sm"><input type="checkbox" checked={ocultarTitulo} onChange={(e) => setOcultarTitulo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" /><span><span className="font-medium">Ocultar o título sobre a imagem</span><span className="block text-xs text-muted-foreground">Use quando a imagem já traz o texto.</span></span></label>
          <Prioridade valor={prioridade} onChange={setPrioridade} />
          <Dica>Quem está no segmento vê esta capa no lugar da base; quem não está vê a base. Mesma área, visuais diferentes por grupo.</Dica>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={salvar} disabled={ocupado || !temSeg}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{editando ? 'Salvar capa' : `Adicionar capa${!unico ? ` a ${modulos.length}` : ''}`}</Button>
            {editando && <Button variant="outline" onClick={limpar}>Cancelar</Button>}
          </div>
        </>
      )} />
  )
}
