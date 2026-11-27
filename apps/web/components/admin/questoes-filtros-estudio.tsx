'use client'

// BARRA horizontal de filtros do BANCO DE QUESTÕES do Estúdio (admin). Só COMPÕE o núcleo compartilhado (components/filtros/multi-filtro):
// multi-seleção, contagem AO VIVO por opção (rota de facetas, SQL no servidor), árvore assunto/tópico, popover logo abaixo de cada botão (1 aberto por vez),
// "Aplicar N" ao final da barra, chips por valor e "Limpar". Nada é calculado aqui: o servidor devolve total + contagens por opção.

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MultiFiltro, ArvoreAssuntos, EscopoFiltroAdmin, BarraFiltrosHorizontal, CampoFiltro } from '@/components/filtros/multi-filtro'
import type { DimAdmin } from '@/lib/filtros/questoes-sql'
import {
  ROTULO_DIM, ROTULO_VALOR, contarAplicados, paramsDeFiltros, selVazia,
  type Comentario, type ContagensEstudio, type FiltrosEstudio, type OpcoesEstudio,
} from '@/lib/conteudo/questoes-estudio-filtros'

const DIFS = [{ v: 'facil', label: 'Fácil' }, { v: 'medio', label: 'Médio' }, { v: 'dificil', label: 'Difícil' }]
const STATUS = [{ v: 'publicada', label: 'Ativa' }, { v: 'rascunho', label: 'Rascunho' }, { v: 'arquivada', label: 'Arquivada' }]
const TIPOS = [{ v: 'objetiva', label: 'Objetiva' }, { v: 'discursiva', label: 'Discursiva' }]
const COM: { v: Comentario; label: string }[] = [{ v: '', label: 'Todas' }, { v: 'com', label: 'Com comentário' }, { v: 'sem', label: 'Sem comentário' }]

/** Botão "Filtros (N)" que abre/fecha o card (vai no slot de filtros da tabela). */
export function BotaoFiltrosEstudio({ n, aberto, onClick }: { n: number; aberto: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={aberto}
      className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold outline-none transition-colors',
        n > 0 || aberto ? 'border-primary bg-primary/10 text-primary' : 'border-dashed bg-card text-foreground hover:bg-muted')}>
      <SlidersHorizontal className="h-[13px] w-[13px]" />Filtros
      {n > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10.5px] font-extrabold text-primary-foreground">{n}</span>}
    </button>
  )
}

/** Chips do que está APLICADO (um por valor) + Limpar. Remover um chip tira só aquele valor. */
export function ChipsFiltrosEstudio({ opcoes, aplicado, onChange }: { opcoes: OpcoesEstudio; aplicado: FiltrosEstudio; onChange: (f: FiltrosEstudio) => void }) {
  const nome = (arr: { id: string; nome: string }[], id: string) => arr.find((x) => x.id === id)?.nome
  const rot = (d: DimAdmin, v: string): string => {
    switch (d) {
      case 'disciplina': return nome(opcoes.disciplinas, v) ?? 'Disciplina'
      case 'assunto': return nome(opcoes.assuntos, v) ?? 'Assunto'
      case 'banca': return nome(opcoes.bancas, v) ?? 'Banca'
      case 'orgao': return nome(opcoes.orgaos, v) ?? 'Órgão'
      case 'etiqueta': return nome(opcoes.etiquetas, v) ?? 'Etiqueta'
      default: return ROTULO_VALOR[d]?.[v] ?? v
    }
  }
  const chips: { d: DimAdmin | 'com'; v: string; label: string }[] = []
  for (const d of Object.keys(ROTULO_DIM) as DimAdmin[]) for (const v of aplicado.sel[d]) chips.push({ d, v, label: `${ROTULO_DIM[d]}: ${rot(d, v)}` })
  if (aplicado.com) chips.push({ d: 'com', v: aplicado.com, label: aplicado.com === 'com' ? 'Com comentário' : 'Sem comentário' })
  if (!chips.length) return null
  const remover = (c: { d: DimAdmin | 'com'; v: string }) => {
    if (c.d === 'com') { onChange({ ...aplicado, com: '' }); return }
    const sel = { ...aplicado.sel, [c.d]: aplicado.sel[c.d].filter((x) => x !== c.v) }
    // tirar uma disciplina não derruba assunto/tópico (só a troca na seleção do card os limpa)
    onChange({ ...aplicado, sel })
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtros aplicados">
      {chips.map((c) => (
        <button key={`${c.d}:${c.v}`} type="button" onClick={() => remover(c)} title="Remover filtro"
          className="inline-flex h-7 max-w-[22rem] items-center gap-1.5 rounded-full bg-primary/10 pl-2.5 pr-1.5 text-xs font-bold text-primary">
          <span className="truncate">{c.label}</span><X className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      ))}
      <button type="button" onClick={() => onChange({ ...aplicado, sel: selVazia(), com: '' })} className="ml-1 text-xs font-bold text-muted-foreground underline hover:text-foreground">Limpar</button>
    </div>
  )
}

export function FiltrosEstudioCard({ opcoes, aplicado, banco, q, facInicial, facetasUrl = '/api/admin/conteudos/questoes/facetas', onAplicar }: {
  opcoes: OpcoesEstudio
  /** filtros já aplicados (URL) — o card edita um RASCUNHO e só aplica no botão */
  aplicado: FiltrosEstudio
  banco: string
  /** busca atual da tabela (entra na contagem, mas não é editada aqui) */
  q: string
  /** contagens já calculadas no servidor (só vale quando nada está aplicado) */
  facInicial?: { total: number; contagens: ContagensEstudio } | null
  facetasUrl?: string
  onAplicar: (f: FiltrosEstudio) => void
  onFechar?: () => void
}) {
  const [f, setF] = useState<FiltrosEstudio>(aplicado)
  const aplicadoKey = JSON.stringify([aplicado.sel, aplicado.com])
  useEffect(() => { setF(aplicado) }, [aplicadoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Acordeão: só um painel aberto por vez.
  const [painel, setPainel] = useState<string | null>(null)
  const tp = (k: string) => () => setPainel((a) => (a === k ? null : k))

  // Contagem AO VIVO: a cada mudança do rascunho pergunta ao servidor (total + por opção). Debounce + abort.
  const [fac, setFac] = useState<{ total: number; contagens: ContagensEstudio } | null>(facInicial ?? null)
  const [contando, setContando] = useState(false)
  const rascunhoKey = JSON.stringify([f.sel, f.com, q, banco])
  const primeira = useRef(!!facInicial && contarAplicados(aplicado) === 0 && !aplicado.com)
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return } // SSR já trouxe a contagem do estado sem filtros
    const ac = new AbortController()
    setContando(true)
    const t = setTimeout(async () => {
      try {
        const usp = paramsDeFiltros(f); usp.set('banco', banco); if (q) usp.set('q', q)
        const r = await fetch(`${facetasUrl}?${usp}`, { signal: ac.signal, cache: 'no-store' })
        const j = await r.json()
        if (j?.ok) setFac({ total: j.total, contagens: j.contagens })
      } catch { /* abortado/offline: mantém o último valor */ }
      if (!ac.signal.aborted) setContando(false)
    }, 250)
    return () => { clearTimeout(t); ac.abort() }
  }, [rascunhoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const setDim = (d: DimAdmin) => (v: string[]) => setF((p) => ({ ...p, sel: { ...p.sel, [d]: v } }))

  // Assuntos/tópicos oferecidos: só os das disciplinas escolhidas (nenhuma escolhida = todos).
  const discSel = f.sel.disciplina
  const assuntosDaDisc = useMemo(
    () => (discSel.length ? opcoes.assuntos.filter((a) => !a.disciplina_id || discSel.includes(a.disciplina_id)) : opcoes.assuntos),
    [opcoes.assuntos, discSel],
  )
  const detalhesDaDisc = useMemo(() => {
    const ids = new Set(assuntosDaDisc.map((a) => a.id))
    return opcoes.detalhes.filter((d) => ids.has(d.assunto_id))
  }, [assuntosDaDisc, opcoes.detalhes])

  const total = fac?.total
  const n = contarAplicados(f)
  const c = fac?.contagens
  const opt = (arr: { id: string; nome: string }[]) => arr.map((x) => ({ v: x.id, label: x.nome }))

  const campo = (label: string, el: React.ReactNode) => <CampoFiltro label={label}>{el}</CampoFiltro>
  return (
    <EscopoFiltroAdmin className="rounded-2xl border bg-card p-3 sm:p-4">
      <BarraFiltrosHorizontal>
        {campo('Disciplina', <MultiFiltro vazio="Todas" busca="Buscar disciplina…" options={opt(opcoes.disciplinas)} selecionados={f.sel.disciplina} contagens={c?.disciplina}
          aberto={painel === 'disciplina'} onToggle={tp('disciplina')}
          onChange={(v) => setF((p) => ({ ...p, sel: { ...p.sel, disciplina: v, assunto: [], detalhe: [] } }))} />)}
        {campo('Assunto e tópico', <ArvoreAssuntos vazio="Todos" assuntos={assuntosDaDisc.map((a) => ({ id: a.id, nome: a.nome, pai_id: a.pai_id }))} detalhes={detalhesDaDisc}
          selAssuntos={f.sel.assunto} selDetalhes={f.sel.detalhe} onAssuntos={setDim('assunto')} onDetalhes={setDim('detalhe')}
          contAssunto={c?.assunto} contDetalhe={c?.detalhe} aberto={painel === 'assunto'} onToggle={tp('assunto')} />)}
        {campo('Banca', <MultiFiltro vazio="Todas" busca="Buscar banca…" options={opt(opcoes.bancas)} selecionados={f.sel.banca} contagens={c?.banca}
          aberto={painel === 'banca'} onToggle={tp('banca')} onChange={setDim('banca')} />)}
        {opcoes.orgaos.length > 0 && campo('Órgão', <MultiFiltro vazio="Todos" busca="Buscar órgão…" options={opt(opcoes.orgaos)} selecionados={f.sel.orgao} contagens={c?.orgao}
          aberto={painel === 'orgao'} onToggle={tp('orgao')} onChange={setDim('orgao')} />)}
        {opcoes.cargos.length > 0 && campo('Cargo', <MultiFiltro vazio="Todos" busca="Buscar cargo…" options={opcoes.cargos.map((x) => ({ v: x, label: x }))} selecionados={f.sel.cargo} contagens={c?.cargo}
          aberto={painel === 'cargo'} onToggle={tp('cargo')} onChange={setDim('cargo')} />)}
        {opcoes.anos.length > 0 && campo('Ano', <MultiFiltro vazio="Todos" options={opcoes.anos.map((a) => ({ v: String(a), label: String(a) }))} selecionados={f.sel.ano} contagens={c?.ano}
          aberto={painel === 'ano'} onToggle={tp('ano')} onChange={setDim('ano')} />)}
        {campo('Dificuldade', <MultiFiltro vazio="Todas" options={DIFS} selecionados={f.sel.dificuldade} contagens={c?.dificuldade} aberto={painel === 'dificuldade'} onToggle={tp('dificuldade')} onChange={setDim('dificuldade')} />)}
        {campo('Status', <MultiFiltro vazio="Todos" options={STATUS} selecionados={f.sel.status} contagens={c?.status} aberto={painel === 'status'} onToggle={tp('status')} onChange={setDim('status')} />)}
        {campo('Tipo', <MultiFiltro vazio="Todos" options={TIPOS} selecionados={f.sel.tipo} contagens={c?.tipo} aberto={painel === 'tipo'} onToggle={tp('tipo')} onChange={setDim('tipo')} />)}
        {opcoes.etiquetas.length > 0 && campo('Etiqueta', <MultiFiltro vazio="Todas" busca="Buscar etiqueta…" options={opt(opcoes.etiquetas)} selecionados={f.sel.etiqueta} contagens={c?.etiqueta}
          aberto={painel === 'etiqueta'} onToggle={tp('etiqueta')} onChange={setDim('etiqueta')} />)}
        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="text-[10.5px] font-extrabold uppercase tracking-[.08em] text-muted-foreground">Comentário do professor</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Comentário do professor">
            {COM.map((o) => (
              <button key={o.v || 'todas'} type="button" role="radio" aria-checked={f.com === o.v} onClick={() => setF((p) => ({ ...p, com: o.v }))}
                className={cn('inline-flex h-9 items-center rounded-full border px-3 text-[12.5px] font-bold transition-colors',
                  f.com === o.v ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground')}>{o.label}</button>
            ))}
          </div>
        </div>
      </BarraFiltrosHorizontal>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t pt-3">
        <button type="button" onClick={() => setF({ ...f, sel: selVazia(), com: '' })} disabled={n === 0} className="text-xs font-bold text-muted-foreground underline hover:text-foreground disabled:opacity-40">Limpar</button>
        <button type="button" onClick={() => { setPainel(null); onAplicar(f) }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13.5px] font-extrabold text-primary-foreground transition hover:brightness-110">
          {contando && <Loader2 className="h-4 w-4 animate-spin" />}
          Aplicar{total !== undefined ? ` ${total.toLocaleString('pt-BR')} ${total === 1 ? 'questão' : 'questões'}` : ''}
        </button>
      </div>
    </EscopoFiltroAdmin>
  )
}
