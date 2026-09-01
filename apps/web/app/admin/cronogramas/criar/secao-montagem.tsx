'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layers, Loader2, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'
import {
  montarPorConteudos,
  semanasDeConteudo,
  type ConfigMontagem,
  type ConteudoMontagem,
  type LinhaMontagem,
  type MetaMontada,
} from '@/lib/cronograma/montador'
import { useCriar, type LinkDraft, type MetaDraft } from './criar-context'
import { Secao } from './secao'
import { dadosMetas } from './dados'
import { buscarConjuntosParaCompor, buscarConteudosParaMontar, type ConteudoBanco } from '../conteudos/actions'

function novoTmpId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m_${Date.now()}_${Math.round(Math.random() * 1e6)}`
}

/** Uma linha configurável (tipo + duração + comportamento) — editar aqui reflete em todas as semanas. */
type LinhaUI = LinhaMontagem & { id: string; label: string }

/** Um conteúdo escolhido do banco, com faixa de semanas. */
type Selecionado = { conjuntoId: string; disciplina: string; disciplina_id: string | null; nome: string; qtdAulas: number; semInicio: number; semFim: number; banco: ConteudoBanco }

export function SecaoMontagem() {
  const { draft, patch } = useCriar()
  const [tipos, setTipos] = useState<TipoMetaDef[]>([])
  const [linhas, setLinhas] = useState<LinhaUI[]>([])
  const [aulasPorSemana, setAulasPorSemana] = useState(3)
  const [selecionados, setSelecionados] = useState<Selecionado[]>([])
  const [pickerAberto, setPickerAberto] = useState(false)

  // Carrega tipos e semeia as duas linhas-modelo (Lição + Resolução) uma única vez.
  useEffect(() => {
    dadosMetas().then((r) => {
      if (!r.ok) return
      const ts = r.tipos ?? []
      setTipos(ts)
      setLinhas((atual) => {
        if (atual.length) return atual
        const licao = ts.find((t) => t.slug === 'pdfull') ?? ts.find((t) => !t.mostra_links) ?? ts[0]
        const resol = ts.find((t) => t.slug === 'quest') ?? ts.find((t) => t.mostra_links)
        const out: LinhaUI[] = []
        if (licao) out.push({ id: novoTmpId(), label: 'Lição', tipo: licao.slug, duracao: '1:30', offset: 0, continuacao: true, usaLinks: false })
        if (resol) out.push({ id: novoTmpId(), label: 'Resolução de questões', tipo: resol.slug, duracao: '30M', offset: 1, continuacao: false, usaLinks: true })
        return out
      })
    })
  }, [])

  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const corTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null
  const usaLinksTipo = (slug: string) => linhas.find((l) => l.tipo === slug)?.usaLinks ?? false

  // ── Config do montador + resultado (memoizado) ──
  const conteudosMontagem: ConteudoMontagem[] = useMemo(() => {
    const licaoTipo = linhas[0]?.tipo
    return selecionados.map((s) => {
      const dados: Record<string, Record<string, { aulaReal: string; conteudo: string | null; tema: string | null; urls: Record<string, string> }>> = {}
      for (const a of s.banco.aulas) {
        if (!a.chave) continue
        ;(dados[a.chave] ??= {})[a.tipo] = { aulaReal: a.aulaReal, conteudo: a.conteudo, tema: a.tema, urls: a.urls }
      }
      let chaves = [...new Set(s.banco.aulas.filter((a) => a.tipo === licaoTipo).map((a) => a.chave).filter(Boolean))]
      if (!chaves.length) chaves = [...new Set(s.banco.aulas.map((a) => a.chave).filter(Boolean))]
      chaves.sort((x, y) => (Number(x) || 0) - (Number(y) || 0) || x.localeCompare(y))
      return { disciplina: s.disciplina, disciplina_id: s.disciplina_id, semInicio: s.semInicio, semFim: s.semFim, aulas: chaves, dados }
    })
  }, [selecionados, linhas])

  const config: ConfigMontagem = useMemo(
    () => ({
      totalSemanas: draft.totalSemanas,
      semanasRevisao: draft.semanasRevisao,
      diasCount: Math.max(1, draft.diasNome.length),
      aulasPorSemana,
      linhas: linhas.map((l) => ({ tipo: l.tipo, duracao: l.duracao, offset: l.offset, continuacao: l.continuacao, usaLinks: l.usaLinks })),
    }),
    [draft.totalSemanas, draft.semanasRevisao, draft.diasNome.length, aulasPorSemana, linhas],
  )

  const resultado = useMemo(() => montarPorConteudos(config, conteudosMontagem), [config, conteudosMontagem])
  const semanasConteudo = useMemo(() => semanasDeConteudo(config.totalSemanas, config.semanasRevisao), [config.totalSemanas, config.semanasRevisao])

  // ── Ações ──
  function patchLinha(id: string, p: Partial<LinhaUI>) {
    setLinhas((xs) => xs.map((l) => (l.id === id ? { ...l, ...p } : l)))
  }
  function addLinha() {
    const t = tipos.find((x) => !linhas.some((l) => l.tipo === x.slug)) ?? tipos[0]
    if (!t) return
    setLinhas((xs) => [...xs, { id: novoTmpId(), label: t.nome, tipo: t.slug, duracao: null, offset: 0, continuacao: false, usaLinks: t.mostra_links }])
  }
  function removerSelecionado(conjuntoId: string) {
    setSelecionados((xs) => xs.filter((s) => s.conjuntoId !== conjuntoId))
  }
  function patchSelecionado(conjuntoId: string, p: Partial<Selecionado>) {
    setSelecionados((xs) => xs.map((s) => (s.conjuntoId === conjuntoId ? { ...s, ...p } : s)))
  }

  async function adicionarConteudos(ids: string[]) {
    const novos = ids.filter((id) => !selecionados.some((s) => s.conjuntoId === id))
    if (!novos.length) return
    const r = await buscarConteudosParaMontar(novos)
    if (!r.ok || !r.conteudos) {
      toast.error(r.error ?? 'Falha ao carregar os conteúdos.')
      return
    }
    const add: Selecionado[] = r.conteudos.map((c) => ({
      conjuntoId: c.id,
      disciplina: c.disciplina,
      disciplina_id: c.disciplina_id,
      nome: c.nome,
      qtdAulas: new Set(c.aulas.map((a) => a.chave).filter(Boolean)).size,
      semInicio: 1,
      semFim: draft.totalSemanas,
      banco: c,
    }))
    setSelecionados((xs) => [...xs, ...add])
  }

  async function aplicar() {
    if (!resultado.metas.length) return toast.error('Selecione ao menos um conteúdo para montar.')
    if (draft.metas.length) {
      const ok = await confirmar({
        titulo: 'Substituir as metas atuais?',
        mensagem: `A montagem vai gerar ${resultado.metas.length.toLocaleString('pt-BR')} meta(s) e substituir as ${draft.metas.length.toLocaleString('pt-BR')} que já estão no rascunho.`,
        confirmar: 'Gerar e substituir',
      })
      if (!ok) return
    }
    const metas: MetaDraft[] = resultado.metas.map((m) => ({ tmpId: novoTmpId(), ...m }))
    const links: LinkDraft[] = resultado.links.map((l) => ({ disciplina: l.disciplina, disciplina_id: l.disciplina_id, aula: l.aula, tema: l.tema, urls: l.urls }))
    patch({ metas, links })
    toast.success(`${metas.length.toLocaleString('pt-BR')} metas geradas em ${semanasConteudo.length} semanas de conteúdo.`)
  }

  return (
    <Secao
      numero={3}
      titulo="Montagem por conteúdos"
      descricao="Escolha os conteúdos do banco e marque de qual semana até qual semana cada um roda — o revezamento e as datas se montam sozinhos (semana 1 só com lições; a resolução acompanha a semana anterior). Editar a duração de uma linha reflete em todas as semanas."
    >
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        {/* Linhas (tipos) — a duração aqui vale para todas as semanas */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> Linhas da grade</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={addLinha}><Plus className="mr-1 h-3.5 w-3.5" /> Linha</Button>
          </div>
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={l.id} className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/20 p-2.5">
                <span className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: corTipo(l.tipo) ?? 'var(--muted-foreground)' }} />
                <div className="w-40">
                  <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
                  <Select value={l.tipo} onValueChange={(v) => patchLinha(l.id, { tipo: v ?? l.tipo })}>
                    <SelectTrigger className="h-8"><SelectValue>{rotuloTipo(l.tipo)}</SelectValue></SelectTrigger>
                    <SelectContent>{tipos.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Duração</Label>
                  <Input value={l.duracao ?? ''} onChange={(e) => patchLinha(l.id, { duracao: e.target.value || null })} placeholder="1:30" className="h-8" />
                </div>
                <div className="w-32">
                  <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Referência</Label>
                  <Select value={String(l.offset)} onValueChange={(v) => patchLinha(l.id, { offset: Number(v ?? 0) })}>
                    <SelectTrigger className="h-8"><SelectValue>{l.offset === 0 ? 'Semana atual' : `${l.offset} sem. antes`}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Semana atual</SelectItem>
                      <SelectItem value="1">1 semana antes</SelectItem>
                      <SelectItem value="2">2 semanas antes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-1.5 self-center text-xs" title="Ocupa 2 dias: aula + continuação">
                  <input type="checkbox" checked={l.continuacao} onChange={(e) => patchLinha(l.id, { continuacao: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                  continuação
                </label>
                <label className="flex items-center gap-1.5 self-center text-xs" title="Mostra os links de questões (QC/TEC) da aula">
                  <input type="checkbox" checked={l.usaLinks} onChange={(e) => patchLinha(l.id, { usaLinks: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                  links
                </label>
                {linhas.length > 1 && (
                  <button onClick={() => setLinhas((xs) => xs.filter((x) => x.id !== l.id))} className="ml-auto self-center text-muted-foreground hover:text-destructive" title="Remover linha">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Lições por semana</Label>
            <Input type="number" min={1} max={Math.max(1, Math.floor(config.diasCount / 2))} value={aulasPorSemana} onChange={(e) => setAulasPorSemana(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-16" />
            <span className="text-xs text-muted-foreground">(cada lição ocupa 2 dias)</span>
          </div>
        </div>

        {/* Conteúdos selecionados + faixa de semanas */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Conteúdos</p>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPickerAberto(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar do banco</Button>
          </div>
          {selecionados.length === 0 ? (
            <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">Nenhum conteúdo. Adicione disciplinas do Banco de Conteúdos para montar.</p>
          ) : (
            <div className="space-y-1.5">
              {selecionados.map((s) => (
                <div key={s.conjuntoId} className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/10 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.disciplina}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.nome} · {s.qtdAulas} aula(s)</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">semana</span>
                    <Input type="number" min={1} max={draft.totalSemanas} value={s.semInicio} onChange={(e) => patchSelecionado(s.conjuntoId, { semInicio: Math.max(1, Number(e.target.value) || 1) })} className="h-7 w-14" />
                    <span className="text-muted-foreground">até</span>
                    <Input type="number" min={1} max={draft.totalSemanas} value={s.semFim} onChange={(e) => patchSelecionado(s.conjuntoId, { semFim: Math.min(draft.totalSemanas, Number(e.target.value) || draft.totalSemanas) })} className="h-7 w-14" />
                  </div>
                  <button onClick={() => removerSelecionado(s.conjuntoId)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prévia + aplicar */}
        {resultado.avisos.map((a, i) => (
          <p key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{a}</p>
        ))}

        {resultado.metas.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Prévia da modelagem</p>
              <Badge variant="outline" className="text-[11px]">{resultado.metas.length.toLocaleString('pt-BR')} metas · {semanasConteudo.length} semanas</Badge>
            </div>
            <PreviaMontagem metas={resultado.metas} semanas={semanasConteudo} linhas={linhas} diasNome={draft.diasNome} rotuloTipo={rotuloTipo} usaLinksTipo={usaLinksTipo} />
          </div>
        )}

        <Button onClick={aplicar} disabled={!resultado.metas.length} className="w-full">
          <Wand2 className="mr-1.5 h-4 w-4" /> Gerar e aplicar ao cronograma
        </Button>
      </div>

      <PickerConteudos aberto={pickerAberto} aoFechar={() => setPickerAberto(false)} jaIds={selecionados.map((s) => s.conjuntoId)} onConfirmar={adicionarConteudos} />
    </Secao>
  )
}

/** Prévia estilo-modelo: por semana, uma tabela dias × linhas. Mostra as primeiras semanas. */
function PreviaMontagem({
  metas,
  semanas,
  linhas,
  diasNome,
  rotuloTipo,
  usaLinksTipo,
}: {
  metas: MetaMontada[]
  semanas: number[]
  linhas: LinhaUI[]
  diasNome: string[]
  rotuloTipo: (s: string) => string
  usaLinksTipo: (s: string) => boolean
}) {
  const [limite, setLimite] = useState(4)
  const porSemana = useMemo(() => {
    const m = new Map<number, MetaMontada[]>()
    for (const x of metas) {
      const l = m.get(x.semana) ?? []
      l.push(x)
      m.set(x.semana, l)
    }
    return m
  }, [metas])
  const visiveis = semanas.filter((s) => porSemana.has(s)).slice(0, limite)
  const totalComMetas = semanas.filter((s) => porSemana.has(s)).length

  const celula = (m: MetaMontada) => {
    if ((m.conteudo ?? '').toUpperCase().startsWith('CONTINUAÇÃO')) return <span className="text-muted-foreground">{m.conteudo}</span>
    if (usaLinksTipo(m.tipo)) return <span className="font-medium">{m.disciplina}: Aula {m.aula}</span>
    return (
      <>
        <span className="font-medium">Aula {m.aula} – {m.disciplina}</span>
        {m.conteudo && <span className="block text-muted-foreground">{m.conteudo}</span>}
      </>
    )
  }

  return (
    <div className="space-y-2">
      {visiveis.map((sem) => {
        const daSemana = porSemana.get(sem) ?? []
        return (
          <div key={sem} className="overflow-hidden rounded-xl border">
            <div className="bg-primary/10 px-3 py-1.5 text-xs font-semibold">Semana {sem}</div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-[11px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="w-24 px-2 py-1 text-left font-medium text-muted-foreground">Tipo</th>
                    {diasNome.map((d, i) => <th key={i} className="px-2 py-1 text-left font-medium text-muted-foreground">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha) => {
                    const daLinha = daSemana.filter((m) => m.tipo === linha.tipo)
                    if (!daLinha.length) return null
                    return (
                      <tr key={linha.id} className="border-b last:border-0 align-top">
                        <td className="px-2 py-1 text-muted-foreground">{rotuloTipo(linha.tipo)}{linha.duracao ? ` (${linha.duracao})` : ''}</td>
                        {diasNome.map((_, dia) => {
                          const cel = daLinha.filter((m) => m.dia === dia)
                          return (
                            <td key={dia} className="px-2 py-1">
                              {cel.map((m, k) => <div key={k} className="leading-tight">{celula(m)}</div>)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      {totalComMetas > visiveis.length && (
        <button onClick={() => setLimite((l) => l + 6)} className="w-full rounded-lg border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted/30">
          Ver mais semanas ({visiveis.length} de {totalComMetas})
        </button>
      )}
    </div>
  )
}

/** Dialog para escolher conjuntos do banco (multi-seleção com busca). */
function PickerConteudos({
  aberto,
  aoFechar,
  jaIds,
  onConfirmar,
}: {
  aberto: boolean
  aoFechar: () => void
  jaIds: string[]
  onConfirmar: (ids: string[]) => Promise<void>
}) {
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<{ id: string; nome: string; disciplina: string; aulas: number }[]>([])
  const [carregando, setCarregando] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!aberto) return
    setCarregando(true)
    buscarConjuntosParaCompor({ busca }).then((r) => {
      if (r.ok) setItens((r.itens ?? []).map((c) => ({ id: c.id, nome: c.nome, disciplina: c.disciplina, aulas: c.aulas })))
      setCarregando(false)
    })
  }, [aberto, busca])

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function confirmar() {
    await onConfirmar([...sel])
    setSel(new Set())
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar conteúdos do banco</DialogTitle>
          <DialogDescription>Escolha as disciplinas (conjuntos de aulas) que vão compor este cronograma.</DialogDescription>
        </DialogHeader>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina ou conjunto…" className="h-9" />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></p>
          ) : itens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>
          ) : (
            itens.map((c) => {
              const marcado = sel.has(c.id)
              const jaTem = jaIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => !jaTem && toggle(c.id)}
                  disabled={jaTem}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${jaTem ? 'opacity-40' : marcado ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${marcado ? 'border-primary bg-primary text-primary-foreground' : ''}`}>{marcado && '✓'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.disciplina}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.nome} · {c.aulas} aula(s){jaTem ? ' · já adicionado' : ''}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}><X className="mr-1 h-4 w-4" /> Cancelar</Button>
          <Button onClick={confirmar} disabled={!sel.size}>Adicionar {sel.size || ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
