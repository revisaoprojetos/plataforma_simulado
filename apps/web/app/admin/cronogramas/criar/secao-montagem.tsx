'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Calculator, CheckCircle2, Info, Layers, Loader2, Plus, Scale, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'
import { montarPorConteudos, semanasDeConteudo, type ConfigMontagem, type ConteudoMontagem } from '@/lib/cronograma/montador'
import { useCriar, type LinkDraft, type MetaDraft } from './criar-context'
import { Secao } from './secao'
import { dadosMetas } from './dados'
import { buscarConjuntosParaCompor, buscarConteudosParaMontar, type ConjuntoParaCompor } from '../conteudos/actions'

function novoTmpId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m_${Date.now()}_${Math.round(Math.random() * 1e6)}`
}

export function SecaoMontagem() {
  const { draft, patch, montagem, setMontagem } = useCriar()
  const [tipos, setTipos] = useState<TipoMetaDef[]>([])
  const [pickerAberto, setPickerAberto] = useState(false)
  const [autoAplicar, setAutoAplicar] = useState(false)
  const { linhas, selecionados, aulasPorSemana } = montagem

  // Carrega tipos e semeia as linhas-modelo (Lição + Resolução + LegProc) uma única vez.
  useEffect(() => {
    dadosMetas().then((r) => {
      if (!r.ok) return
      const ts = r.tipos ?? []
      setTipos(ts)
      setMontagem((m) => {
        if (m.linhas.length) return m
        // Padrão das 4 linhas, nesta ordem: PDFULL · PDFLASH · Resolução de questões · LegProc.
        const pdfull = ts.find((t) => t.slug === 'pdfull') ?? ts.find((t) => !t.mostra_links) ?? ts[0]
        const flash = ts.find((t) => t.slug === 'flash')
        const quest = ts.find((t) => t.slug === 'quest') ?? ts.find((t) => t.mostra_links)
        const legproc = ts.find((t) => t.slug === 'legproc')
        const out = [] as typeof m.linhas
        // Cada aula percorre as semanas: PDFULL (semana W) → PDFLASH (W+1) → Resolução (W+2).
        if (pdfull) out.push({ id: novoTmpId(), label: 'PDFULL', tipo: pdfull.slug, duracao: '1:30', offset: 0, continuacao: false, usaLinks: false })
        if (flash) out.push({ id: novoTmpId(), label: 'PDFLASH', tipo: flash.slug, duracao: '30M', offset: 1, continuacao: false, usaLinks: false })
        if (quest) out.push({ id: novoTmpId(), label: 'Resolução de questões', tipo: quest.slug, duracao: '30M', offset: 2, continuacao: false, usaLinks: true })
        if (legproc) out.push({ id: novoTmpId(), label: 'LegProc', tipo: legproc.slug, duracao: null, offset: 0, continuacao: false, usaLinks: false, somenteComDado: true })
        // 1 aula por dia → lições/semana = nº de dias de curso, para todos os dias terem aula.
        return { ...m, linhas: out, aulasPorSemana: Math.max(1, draft.diasNome.length) }
      })
    })
    // Semeia uma vez; `draft.diasNome.length` é lido só p/ o padrão inicial de lições/semana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMontagem])

  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const corTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null

  // ── Setters (estado no contexto) ──
  function patchLinha(id: string, p: Partial<(typeof linhas)[number]>) {
    setMontagem((m) => ({ ...m, linhas: m.linhas.map((l) => (l.id === id ? { ...l, ...p } : l)) }))
  }
  function addLinha() {
    const t = tipos.find((x) => !linhas.some((l) => l.tipo === x.slug)) ?? tipos[0]
    if (!t) return
    setMontagem((m) => ({ ...m, linhas: [...m.linhas, { id: novoTmpId(), label: t.nome, tipo: t.slug, duracao: null, offset: 0, continuacao: false, usaLinks: t.mostra_links }] }))
  }
  function removerLinha(id: string) {
    setMontagem((m) => ({ ...m, linhas: m.linhas.filter((x) => x.id !== id) }))
  }
  // A ordem das linhas define a ordem dentro do dia (a 1ª é a lição base do revezamento).
  function moverLinha(id: string, dir: -1 | 1) {
    setMontagem((m) => {
      const i = m.linhas.findIndex((l) => l.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= m.linhas.length) return m
      const copia = [...m.linhas]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return { ...m, linhas: copia }
    })
  }
  function setAulasPorSemana(n: number) {
    setMontagem((m) => ({ ...m, aulasPorSemana: Math.max(1, n || 1) }))
  }
  function removerSelecionado(conjuntoId: string) {
    setMontagem((m) => ({ ...m, selecionados: m.selecionados.filter((s) => s.conjuntoId !== conjuntoId) }))
  }
  function patchSelecionado(conjuntoId: string, p: Partial<(typeof selecionados)[number]>) {
    setMontagem((m) => ({ ...m, selecionados: m.selecionados.map((s) => (s.conjuntoId === conjuntoId ? { ...s, ...p } : s)) }))
  }
  // A ordem define a prioridade no revezamento: quem está mais acima entra primeiro na semana.
  function moverSelecionado(conjuntoId: string, dir: -1 | 1) {
    setMontagem((m) => {
      const i = m.selecionados.findIndex((s) => s.conjuntoId === conjuntoId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= m.selecionados.length) return m
      const copia = [...m.selecionados]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return { ...m, selecionados: copia }
    })
  }

  // Diagnóstico inteligente ao vivo: aulas necessárias × espaços do cronograma, saldo e sugestões.
  const validacao = useMemo(() => {
    const semanas = semanasDeConteudo(draft.totalSemanas, draft.semanasRevisao).length
    const dias = Math.max(1, draft.diasNome.length)
    const capacidade = Math.max(1, aulasPorSemana) * semanas
    const baseTipo = linhas[0]?.tipo
    let somaLicoes = 0
    const faixasRuins: string[] = []
    for (const s of selecionados) {
      const chaves = new Set(s.banco.aulas.filter((a) => a.tipo === baseTipo).map((a) => a.chave).filter(Boolean))
      somaLicoes += chaves.size || new Set(s.banco.aulas.map((a) => a.chave).filter(Boolean)).size
      if (s.semInicio > s.semFim) faixasRuins.push(s.disciplina)
    }
    const saldo = capacidade - somaLicoes
    // Sugestão A: mudar lições/semana p/ caber nas semanas atuais (só se couber em 1/dia).
    const sugAulas = somaLicoes > 0 && semanas > 0 ? Math.ceil(somaLicoes / semanas) : aulasPorSemana
    // Sugestão B: mudar o total de semanas p/ caber com as lições/semana atuais.
    const sugSemanasConteudo = somaLicoes > 0 ? Math.ceil(somaLicoes / Math.max(1, aulasPorSemana)) : semanas
    let sugTotal = Math.max(sugSemanasConteudo, 1)
    while (semanasDeConteudo(sugTotal, draft.semanasRevisao).length < sugSemanasConteudo && sugTotal < 520) sugTotal++
    return {
      capacidade, somaLicoes, faixasRuins, semanas, dias, saldo,
      semLinha: !linhas.length, estoura: somaLicoes > capacidade,
      sugAulas, sugAulasViavel: sugAulas <= dias && sugAulas !== aulasPorSemana && somaLicoes > 0,
      sugTotal, sugTotalViavel: sugTotal !== draft.totalSemanas && somaLicoes > 0,
    }
  }, [selecionados, linhas, aulasPorSemana, draft.totalSemanas, draft.semanasRevisao, draft.diasNome.length])

  // Resultado do montador ao vivo — reusado pelo "Aplicar" e pelo modo automático.
  const resultadoLive = useMemo(() => {
    const conteudos: ConteudoMontagem[] = selecionados.map((s) => {
      const dados: Record<string, Record<string, { aulaReal: string; conteudo: string | null; tema: string | null; urls: Record<string, string>; questaoIds: string[]; videoUrl: string | null }>> = {}
      for (const a of s.banco.aulas) {
        if (!a.chave) continue
        ;(dados[a.chave] ??= {})[a.tipo] = { aulaReal: a.aulaReal, conteudo: a.conteudo, tema: a.tema, urls: a.urls, questaoIds: a.questaoIds ?? [], videoUrl: a.videoUrl ?? null }
      }
      let chaves = [...new Set(s.banco.aulas.filter((a) => a.tipo === linhas[0]?.tipo).map((a) => a.chave).filter(Boolean))]
      if (!chaves.length) chaves = [...new Set(s.banco.aulas.map((a) => a.chave).filter(Boolean))]
      chaves.sort((x, y) => (Number(x) || 0) - (Number(y) || 0) || x.localeCompare(y))
      return { disciplina: s.disciplina, disciplina_id: s.disciplina_id, semInicio: s.semInicio, semFim: s.semFim, aulas: chaves, dados }
    })
    const config: ConfigMontagem = {
      totalSemanas: draft.totalSemanas,
      semanasRevisao: draft.semanasRevisao,
      diasCount: Math.max(1, draft.diasNome.length),
      aulasPorSemana,
      linhas: linhas.map((l) => ({ tipo: l.tipo, duracao: l.duracao, offset: l.offset, continuacao: l.continuacao, usaLinks: l.usaLinks, somenteComDado: l.somenteComDado ?? l.tipo === 'legproc' })),
    }
    return montarPorConteudos(config, conteudos)
  }, [selecionados, linhas, aulasPorSemana, draft.totalSemanas, draft.semanasRevisao, draft.diasNome.length])

  const escreverNoRascunho = () => {
    const metas: MetaDraft[] = resultadoLive.metas.map((m) => ({ tmpId: novoTmpId(), ...m }))
    const links: LinkDraft[] = resultadoLive.links.map((l) => ({ disciplina: l.disciplina, disciplina_id: l.disciplina_id, aula: l.aula, tema: l.tema, urls: l.urls }))
    patch({ metas, links })
  }

  // Modo "aplicar ao vivo": a cada mudança do modelo, grava no rascunho (debounce). Só quando o
  // usuário liga — SOBRESCREVE ajustes manuais da seção Ajuste fino, por isso é opt-in.
  useEffect(() => {
    if (!autoAplicar || !resultadoLive.metas.length || validacao.faixasRuins.length) return
    const t = setTimeout(escreverNoRascunho, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAplicar, resultadoLive, validacao.faixasRuins.length])

  async function adicionarConteudos(ids: string[]) {
    const novos = ids.filter((id) => !selecionados.some((s) => s.conjuntoId === id))
    if (!novos.length) return
    const r = await buscarConteudosParaMontar(novos)
    if (!r.ok || !r.conteudos) {
      toast.error(r.error ?? 'Falha ao carregar os conteúdos.')
      return
    }
    // O banco tem VÁRIOS conjuntos por disciplina (backfill por cronograma). O montador agrupa por
    // disciplina (o último venceria e dobraria as lições) — então cada disciplina entra UMA vez.
    const jaDisc = new Set(selecionados.map((s) => s.disciplina.trim().toLowerCase()))
    const add: typeof selecionados = []
    let pulados = 0
    for (const c of r.conteudos) {
      const d = c.disciplina.trim().toLowerCase()
      if (jaDisc.has(d)) {
        pulados++
        continue
      }
      jaDisc.add(d)
      add.push({
        conjuntoId: c.id,
        disciplina: c.disciplina,
        disciplina_id: c.disciplina_id,
        nome: c.nome,
        qtdAulas: new Set(c.aulas.map((a) => a.chave).filter(Boolean)).size,
        qtdQuestoes: c.aulas.reduce((n, a) => n + (a.questaoIds?.length ?? 0), 0),
        semInicio: 1,
        semFim: draft.totalSemanas,
        banco: c,
      })
    }
    if (!add.length) {
      toast.info('Essas disciplinas já estão na montagem.')
      return
    }
    if (pulados) toast.info(`${pulados} disciplina(s) já estava(m) na montagem — ignorada(s).`)
    setMontagem((m) => ({ ...m, selecionados: [...m.selecionados, ...add] }))
  }

  // Grava as metas do modelo no rascunho (confirma se já houver metas).
  function aplicar() {
    if (!resultadoLive.metas.length) return toast.error('Selecione ao menos um conteúdo para montar.')
    const aplicarAgora = () => {
      escreverNoRascunho()
      toast.success(`${resultadoLive.metas.length.toLocaleString('pt-BR')} metas aplicadas ao rascunho.`)
    }
    if (draft.metas.length) {
      confirmar({
        titulo: 'Substituir as metas atuais?',
        mensagem: `A montagem vai gerar ${resultadoLive.metas.length.toLocaleString('pt-BR')} meta(s) e substituir as ${draft.metas.length.toLocaleString('pt-BR')} que já estão no rascunho (inclusive ajustes finos).`,
        confirmar: 'Gerar e substituir',
      }).then((ok) => ok && aplicarAgora())
      return
    }
    aplicarAgora()
  }

  return (
    <Secao
      numero={3}
      titulo="Conteúdos & linhas"
      descricao="Escolha os conteúdos do banco e as linhas da grade — o revezamento se monta sozinho. Veja o resultado na prévia ao lado e clique em Aplicar para comitar."
      colapsavel
      defaultAberto
      acessorio={selecionados.length > 0 ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{selecionados.length} conteúdo(s)</span> : undefined}
    >
      <div className="space-y-4">
        {/* Linhas (tipos) — a duração aqui vale para todas as semanas */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> Linhas da grade</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={addLinha}><Plus className="mr-1 h-3.5 w-3.5" /> Linha</Button>
          </div>
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={l.id} className="space-y-2 rounded-xl border bg-muted/20 p-2.5">
                {/* Cabeçalho da linha: nome amigável editável + reordenar + remover. */}
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corTipo(l.tipo) ?? 'var(--muted-foreground)' }} />
                  <Input
                    value={l.label}
                    onChange={(e) => patchLinha(l.id, { label: e.target.value })}
                    placeholder="Nome da linha"
                    className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-semibold focus-visible:border-input focus-visible:bg-background"
                  />
                  {i === 0 && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary" title="A 1ª linha é a lição base — é ela que o revezamento distribui.">lição base</span>}
                  <div className="flex shrink-0 flex-col">
                    <button onClick={() => moverLinha(l.id, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir (ordem no dia)"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => moverLinha(l.id, 1)} disabled={i === linhas.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  {linhas.length > 1 && (
                    <button onClick={() => removerLinha(l.id)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover linha">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {/* Controles da linha. */}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-36">
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
                  <div className="w-40">
                    <Label className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Referência
                      <span className="cursor-help text-muted-foreground" title={'“Semana atual” = a lição desta semana. “N sem. antes” faz esta linha acompanhar as lições de N semanas atrás — ex.: a Resolução perseguir a lição (por isso a semana 1 fica só com a lição).'}>
                        <Info className="h-3 w-3" />
                      </span>
                    </Label>
                    <Select value={String(l.offset)} onValueChange={(v) => patchLinha(l.id, { offset: Number(v ?? 0) })}>
                      <SelectTrigger className="h-8"><SelectValue>{l.offset === 0 ? 'Semana atual' : `${l.offset} sem. antes`}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Semana atual</SelectItem>
                        <SelectItem value="1">1 semana antes</SelectItem>
                        <SelectItem value="2">2 semanas antes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-1.5 self-center pb-1.5 text-xs" title="Ocupa 2 dias: aula + continuação">
                    <input type="checkbox" checked={l.continuacao} onChange={(e) => patchLinha(l.id, { continuacao: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                    continuação
                  </label>
                  <label className="flex items-center gap-1.5 self-center pb-1.5 text-xs" title="Mostra os links de questões (QC/TEC) da aula">
                    <input type="checkbox" checked={l.usaLinks} onChange={(e) => patchLinha(l.id, { usaLinks: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--primary)]" />
                    links
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Lições por semana</Label>
            <Input type="number" min={1} max={Math.max(1, draft.diasNome.length)} value={aulasPorSemana} onChange={(e) => setAulasPorSemana(Number(e.target.value))} className="h-8 w-16" />
            <span className="text-xs text-muted-foreground">(1 aula por dia)</span>
          </div>
        </div>

        {/* Conteúdos selecionados + faixa de semanas + ordem */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Conteúdos</p>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPickerAberto(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar do banco</Button>
          </div>
          {selecionados.length === 0 ? (
            <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">Nenhum conteúdo. Adicione disciplinas do Banco de Conteúdos para montar.</p>
          ) : (
            <div className="space-y-1.5">
              {selecionados.map((s, idx) => (
                <div key={s.conjuntoId} className={cn('flex flex-wrap items-center gap-2 rounded-xl border bg-muted/10 px-3 py-2', s.semInicio > s.semFim && 'border-destructive/50 bg-destructive/5')}>
                  <div className="flex shrink-0 flex-col">
                    <button onClick={() => moverSelecionado(s.conjuntoId, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir (entra antes no revezamento)"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => moverSelecionado(s.conjuntoId, 1)} disabled={idx === selecionados.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.disciplina}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.nome} · {s.qtdAulas} aula(s){s.qtdQuestoes > 0 ? ` · ${s.qtdQuestoes} questõe(s)` : ''}</p>
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

        {/* Diagnóstico inteligente: aulas necessárias × espaços, saldo e sugestões de ajuste. */}
        {selecionados.length > 0 && (
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Calculator className="h-4 w-4 text-primary" /> Diagnóstico do cronograma</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-background/60 p-2">
                <p className="text-lg font-bold tabular-nums">{validacao.somaLicoes.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Aulas necessárias</p>
              </div>
              <div className="rounded-lg border bg-background/60 p-2">
                <p className="text-lg font-bold tabular-nums">{validacao.capacidade.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Espaços ({validacao.semanas}×{aulasPorSemana})</p>
              </div>
              <div className={cn('rounded-lg border p-2', validacao.saldo === 0 ? 'border-emerald-500/40 bg-emerald-500/5' : validacao.saldo < 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-amber-500/40 bg-amber-500/5')}>
                <p className={cn('text-lg font-bold tabular-nums', validacao.saldo === 0 ? 'text-emerald-600 dark:text-emerald-400' : validacao.saldo < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')}>
                  {validacao.saldo === 0 ? 'OK' : Math.abs(validacao.saldo).toLocaleString('pt-BR')}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{validacao.saldo === 0 ? 'Compatível' : 'Faltam'}</p>
              </div>
            </div>

            {validacao.saldo === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Encaixa perfeito: {validacao.somaLicoes} aulas em {validacao.capacidade} espaços.</p>
            ) : (
              <div className="space-y-1.5">
                <p className={cn('flex items-center gap-1.5 text-xs', validacao.saldo < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {validacao.saldo < 0
                    ? `Faltam ${Math.abs(validacao.saldo)} espaço(s) — o excedente é empurrado para as últimas semanas.`
                    : `Faltam ${validacao.saldo} aula(s) para preencher o cronograma (espaços vazios no fim).`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {validacao.sugTotalViavel && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch({ totalSemanas: validacao.sugTotal })}>
                      {validacao.saldo < 0 ? 'Aumentar' : 'Reduzir'} para {validacao.sugTotal} semanas
                    </Button>
                  )}
                  {validacao.sugAulasViavel && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAulasPorSemana(validacao.sugAulas)}>
                      Lições/semana → {validacao.sugAulas}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {validacao.faixasRuins.length > 0 && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
                Faixa inválida (início &gt; fim): {validacao.faixasRuins.join(', ')}
              </p>
            )}
          </div>
        )}

        {autoAplicar ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 py-2 text-xs font-medium text-primary">
            <Wand2 className="h-4 w-4" /> Aplicando ao vivo no rascunho
          </div>
        ) : (
          <Button onClick={aplicar} disabled={!selecionados.length || !!validacao.faixasRuins.length} className="w-full">
            <Wand2 className="mr-1.5 h-4 w-4" /> Aplicar ao rascunho{draft.metas.length ? ` (substitui ${draft.metas.length.toLocaleString('pt-BR')})` : ''}
          </Button>
        )}
        <label className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground" title="Grava as metas no rascunho a cada mudança — SOBRESCREVE ajustes manuais da seção Ajuste fino.">
          <input type="checkbox" checked={autoAplicar} onChange={(e) => setAutoAplicar(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
          Aplicar automaticamente <span className="opacity-70">(sobrescreve ajustes manuais)</span>
        </label>
      </div>

      <PickerConteudos
        aberto={pickerAberto}
        aoFechar={() => setPickerAberto(false)}
        jaDisciplinas={selecionados.map((s) => s.disciplina.trim().toLowerCase())}
        onConfirmar={adicionarConteudos}
      />
    </Secao>
  )
}

/**
 * Dialog "Adicionar do banco" — 2 abas (Disciplinas × LegProc), espelhando o Banco de Conteúdos.
 * Deduplica por disciplina (o banco tem vários conjuntos por matéria, do backfill): mostra cada
 * disciplina UMA vez, mantendo o conjunto mais completo (mais aulas, desempate por questões).
 */
function PickerConteudos({
  aberto,
  aoFechar,
  jaDisciplinas,
  onConfirmar,
}: {
  aberto: boolean
  aoFechar: () => void
  jaDisciplinas: string[]
  onConfirmar: (ids: string[]) => Promise<void>
}) {
  const { bancoCache } = useCriar()
  const [busca, setBusca] = useState('')
  const [itensRaw, setItensRaw] = useState<ConjuntoParaCompor[]>([])
  const [carregando, setCarregando] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aba, setAba] = useState<'disciplinas' | 'legproc'>('disciplinas')
  const [sincronizar, setSincronizar] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    // Cache por termo de busca: reabrir (ou repetir a mesma busca) é instantâneo.
    const cache = bancoCache.current.get(busca)
    if (cache) {
      setItensRaw(cache)
      setCarregando(false)
      return
    }
    setCarregando(true)
    buscarConjuntosParaCompor({ busca }).then((r) => {
      const itens = r.ok ? r.itens ?? [] : []
      bancoCache.current.set(busca, itens)
      setItensRaw(itens)
      setCarregando(false)
    })
  }, [aberto, busca, bancoCache])

  // Um conjunto por disciplina (o mais completo).
  const porDisciplina = useMemo(() => {
    const mapa = new Map<string, ConjuntoParaCompor>()
    for (const c of itensRaw) {
      const k = c.disciplina.trim().toLowerCase()
      const cur = mapa.get(k)
      if (!cur || c.aulas > cur.aulas || (c.aulas === cur.aulas && c.questoes > cur.questoes)) mapa.set(k, c)
    }
    return [...mapa.values()].sort((a, b) => a.disciplina.localeCompare(b.disciplina))
  }, [itensRaw])

  const legproc = useMemo(() => porDisciplina.filter((c) => c.aulasLegproc > 0), [porDisciplina])
  const legprocIds = useMemo(() => new Set(legproc.map((c) => c.id)), [legproc])
  const lista = aba === 'legproc' ? legproc : porDisciplina
  const jaDisc = new Set(jaDisciplinas)

  // Seleção por aba (chave `aba:id`). Com "sincronizar" ligado, marcar/desmarcar uma disciplina
  // que tem LegProc reflete na outra aba (Disciplina ⇄ LegProc); desligado, cada aba é independente.
  const toggle = (id: string) => setSel((s) => {
    const kAtual = `${aba}:${id}`
    const selecionar = !s.has(kAtual)
    const chaves = sincronizar && legprocIds.has(id) ? [`disciplinas:${id}`, `legproc:${id}`] : [kAtual]
    const n = new Set(s)
    for (const k of chaves) (selecionar ? n.add(k) : n.delete(k))
    return n
  })
  const idsSelecionados = [...new Set([...sel].map((k) => k.slice(k.indexOf(':') + 1)))]

  async function confirmar() {
    if (!idsSelecionados.length || confirmando) return
    setConfirmando(true)
    try {
      await onConfirmar(idsSelecionados)
      setSel(new Set())
      aoFechar()
    } finally {
      setConfirmando(false)
    }
  }

  const tabCls = (on: boolean) =>
    cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition', on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="w-full sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Adicionar conteúdos do banco</DialogTitle>
          <DialogDescription>Cada disciplina entra uma vez. A aba LegProc mostra as que têm legislação seca.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex w-fit rounded-lg border p-0.5">
            <button onClick={() => setAba('disciplinas')} className={tabCls(aba === 'disciplinas')}><BookOpen className="h-3.5 w-3.5" /> Disciplinas ({porDisciplina.length})</button>
            <button onClick={() => setAba('legproc')} className={tabCls(aba === 'legproc')}><Scale className="h-3.5 w-3.5" /> LegProc ({legproc.length})</button>
          </div>
          <label
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
            title="Ao marcar uma disciplina que tem LegProc, marca também o LegProc dela (e vice-versa). Desligado, cada aba é independente."
          >
            <input type="checkbox" checked={sincronizar} onChange={(e) => setSincronizar(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
            Sincronizar Disciplina &amp; LegProc
          </label>
        </div>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina ou conjunto…" className="h-9" />
        <div className="grid h-[28rem] grid-cols-1 content-start gap-1 overflow-y-auto sm:grid-cols-2">
          {carregando ? (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></p>
          ) : lista.length === 0 ? (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{aba === 'legproc' ? 'Nenhuma disciplina com LegProc.' : 'Nada encontrado.'}</p>
          ) : (
            lista.map((c) => {
              const marcado = sel.has(`${aba}:${c.id}`)
              const jaTem = jaDisc.has(c.disciplina.trim().toLowerCase())
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
                    <span className="block truncate text-xs text-muted-foreground">
                      {aba === 'legproc'
                        ? `${c.aulasLegproc} LegProc`
                        : `${c.aulas} aula(s)${c.questoes > 0 ? ` · ${c.questoes} questõe(s)` : ''}`}
                      {jaTem ? ' · já na montagem' : ''}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={confirmando}><X className="mr-1 h-4 w-4" /> Cancelar</Button>
          <Button onClick={confirmar} disabled={!idsSelecionados.length || confirmando}>
            {confirmando ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Adicionando…</> : <>Adicionar {idsSelecionados.length || ''}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
