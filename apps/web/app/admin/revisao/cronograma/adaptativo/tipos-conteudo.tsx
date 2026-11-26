'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import { SeletorCor } from '@/components/produtos/pagina/editor/painel/seletor-cor'
import { ehTokenCor } from '@/lib/produtos/pagina/tokens'
import { PAPEIS_TIPO, SLUG_RE, type PapelTipo, type ResultadoTipoConteudo, type TipoConteudo, type UsoTipoConteudo } from '@/lib/cronograma/tipos-conteudo-tipos'
import { obterRegras } from '@/app/admin/cronogramas/adaptativo/regras-actions'
import type { RegistroRegras } from '@/app/admin/cronogramas/adaptativo/regras-actions-tipos'
import { LinkFaixas, MatrizRegrasTipo, regraEfetiva, resumoRegraTipo, tiposGxDe } from './matriz-regras-tipo'
import { criarTipoConteudo, listarTiposConteudo, removerTipoConteudo, salvarTipoConteudo } from '../tipos-conteudo-actions'

type Aba = 'tipos' | 'matriz'
type Col = 'slug' | 'nome' | 'papel' | 'duracao' | 'prioridade' | 'ordem' | 'ativo' | 'uso'
const CORES_SEL = { cor: 'var(--primary)', cor2: 'var(--secondary)' }
const inputCls = 'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
const numCls = 'h-8 w-20 rounded-lg border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
const rotuloPapel = (p: PapelTipo) => PAPEIS_TIPO.find((x) => x.v === p)?.r ?? p
const numOuNull = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }
const msgImpacto = (r: ResultadoTipoConteudo) =>
  `${(r.pastasUsando ?? 0).toLocaleString('pt-BR')} pasta(s) e ${(r.planosAtivos ?? 0).toLocaleString('pt-BR')} plano(s) ativo(s) usam este tipo. As metas serão recalculadas. Deseja continuar?`

/** Vista "Tipos de conteúdo": catálogo editável (lista + ficha lateral) e matriz de edição rápida. Só chama actions. */
export default function TiposConteudo({ podeEditar }: { podeEditar: boolean }) {
  const [tipos, setTipos] = useState<TipoConteudo[] | null>(null)
  const [usos, setUsos] = useState<UsoTipoConteudo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('tipos')
  const [registro, setRegistro] = useState<RegistroRegras | null>(null)

  const recarregar = useCallback(async () => {
    const r = await listarTiposConteudo()
    if (!r.ok) { setErro(r.error || 'Falha ao carregar os tipos.'); return }
    setErro(null); setTipos(r.tipos ?? []); setUsos(r.usos ?? [])
  }, [])
  const recarregarRegras = useCallback(async () => { const r = await obterRegras(); if (r.ok && r.dados) setRegistro(r.dados) }, [])
  useEffect(() => { void recarregar(); void recarregarRegras() }, [recarregar, recarregarRegras])

  if (erro) return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
  if (!tipos) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando tipos…</div>

  const usoMap = new Map(usos.map((u) => [u.slug, u]))
  return (
    <div className="w-full space-y-4">
      <div className="flex gap-1 border-b border-border" role="tablist">
        {([['tipos', 'Tipos'], ['matriz', 'Matriz']] as const).map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', aba === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{r}</button>
        ))}
      </div>
      {aba === 'tipos'
        ? <Catalogo tipos={tipos} usoMap={usoMap} podeEditar={podeEditar} onMudou={recarregar} registro={registro} />
        : (
          <div className="space-y-8">
            <Matriz tipos={tipos} podeEditar={podeEditar} onMudou={recarregar} />
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Regras por tipo personalizado</h2>
              {registro ? <MatrizRegrasTipo key={registro.versao} tipos={tipos} registro={registro} podeEditar={podeEditar} onSalvo={recarregarRegras} /> : <p className="text-sm text-muted-foreground">Carregando regras…</p>}
            </div>
          </div>
        )}
    </div>
  )
}

function Catalogo({ tipos, usoMap, podeEditar, onMudou, registro }: { registro: RegistroRegras | null; tipos: TipoConteudo[]; usoMap: Map<string, UsoTipoConteudo>; podeEditar: boolean; onMudou: () => Promise<void> }) {
  const [q, setQ] = useState('')
  const [fPapel, setFPapel] = useState('')
  const [fOrigem, setFOrigem] = useState('')
  const [ord, setOrd] = useState<Col>('ordem')
  const [asc, setAsc] = useState(true)
  const [sel, setSel] = useState<string | 'novo'>(tipos[0]?.slug ?? 'novo')

  const chave = (t: TipoConteudo, c: Col): string | number => {
    const u = usoMap.get(t.slug)
    return c === 'duracao' ? (t.duracaoPadraoMin ?? -1) : c === 'ativo' ? (t.ativo ? 1 : 0) : c === 'uso' ? (u ? u.pastas + u.documentos + u.planosAtivos : 0) : c === 'papel' ? rotuloPapel(t.papel) : t[c]
  }
  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    const f = tipos.filter((t) => (!fPapel || t.papel === fPapel) && (!fOrigem || (fOrigem === 'sistema') === t.sistema) && (!b || `${t.slug} ${t.nome} ${t.nomeAluno}`.toLowerCase().includes(b)))
    return [...f].sort((a, c) => {
      const x = chave(a, ord), y = chave(c, ord)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
      return (r || a.slug.localeCompare(c.slug)) * (asc ? 1 : -1)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipos, q, fPapel, fOrigem, ord, asc, usoMap])
  const atual = sel === 'novo' ? null : tipos.find((t) => t.slug === sel) ?? null

  const Th = ({ c, children }: { c: Col; children: string }) => (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => { if (ord === c) setAsc(!asc); else { setOrd(c); setAsc(true) } }} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{ord === c ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por slug ou nome" aria-label="Buscar tipo" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={fPapel} onChange={(e) => setFPapel(e.target.value)} aria-label="Filtrar por papel" className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Todos os papéis</option>
          {PAPEIS_TIPO.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
        </select>
        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} aria-label="Filtrar por origem" className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Sistema e personalizados</option>
          <option value="sistema">Só de sistema</option>
          <option value="custom">Só personalizados</option>
        </select>
        {podeEditar && (
          <button type="button" onClick={() => setSel('novo')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" />Novo tipo</button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
              <Th c="slug">Slug</Th><Th c="nome">Nome</Th><Th c="papel">Papel</Th><Th c="duracao">Duração</Th><Th c="prioridade">Prioridade</Th><Th c="ordem">Ordem</Th><Th c="ativo">Ativo</Th><th className="px-3 py-2 text-left font-medium">Meta própria</th><Th c="uso">Em uso (pastas / docs / planos)</Th>
            </tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhum tipo encontrado.</td></tr>}
              {lista.map((t) => {
                const u = usoMap.get(t.slug)
                return (
                  <tr key={t.slug} onClick={() => setSel(t.slug)} className={cn('cursor-pointer border-t border-border transition hover:bg-muted/40', atual?.slug === t.slug && 'bg-primary/5', !t.ativo && 'opacity-60')}>
                    <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                    <td className="px-3 py-2 font-medium">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-border align-middle" style={{ background: t.cor && ehTokenCor(t.cor) ? `var(--${t.cor})` : undefined }} />
                      {t.nome}{t.sistema && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">sistema</span>}
                    </td>
                    <td className="px-3 py-2">{rotuloPapel(t.papel)}</td>
                    <td className="px-3 py-2 tabular-nums">{t.duracaoPadraoMin == null ? 'padrão' : `${t.duracaoPadraoMin} min`}</td>
                    <td className="px-3 py-2 tabular-nums">{t.prioridade}</td>
                    <td className="px-3 py-2 tabular-nums">{t.ordem}</td>
                    <td className="px-3 py-2">{t.ativo ? 'Sim' : 'Não'}</td>
                    <td className="px-3 py-2">{t.geraMeta ? 'Sim' : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{u ? `${u.pastas} / ${u.documentos} / ${u.planosAtivos}` : '0 / 0 / 0'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Ficha key={sel === 'novo' ? 'novo' : `${atual?.slug}:${(atual as (TipoConteudo & { versao?: number }) | null)?.versao ?? ''}:${atual?.nome}`}
          tipo={atual} novo={sel === 'novo'} uso={atual ? usoMap.get(atual.slug) : undefined} podeEditar={podeEditar} registro={registro}
          onSalvo={async (slug) => { await onMudou(); if (slug) setSel(slug) }} onRemovido={async () => { await onMudou(); setSel(tipos.find((t) => t.slug !== sel)?.slug ?? 'novo') }} />
      </div>
    </div>
  )
}

function Ficha({ tipo, novo, uso, podeEditar, onSalvo, onRemovido, registro }: {
  registro: RegistroRegras | null
  tipo: TipoConteudo | null; novo: boolean; uso?: UsoTipoConteudo; podeEditar: boolean
  onSalvo: (slug?: string) => Promise<void>; onRemovido: () => Promise<void>
}) {
  const [slug, setSlug] = useState(tipo?.slug ?? '')
  const [nome, setNome] = useState(tipo?.nome ?? '')
  const [nomeAluno, setNomeAluno] = useState(tipo?.nomeAluno ?? '')
  const [cor, setCor] = useState<string | null>(tipo?.cor ?? null)
  const [papel, setPapel] = useState<PapelTipo>(tipo?.papel ?? 'generico')
  const [dur, setDur] = useState(tipo?.duracaoPadraoMin == null ? '' : String(tipo.duracaoPadraoMin))
  const [prio, setPrio] = useState(String(tipo?.prioridade ?? 60))
  const [ordem, setOrdem] = useState(String(tipo?.ordem ?? 99))
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true)
  const [desc, setDesc] = useState(tipo?.descricao ?? '')
  const [geraMeta, setGeraMeta] = useState(!!tipo?.geraMeta)
  const [pend, start] = useTransition()
  // Versão para concorrência otimista (a action pode devolvê-la no tipo).
  const versao = (tipo as (TipoConteudo & { versao?: number }) | null)?.versao
  const travado = !!tipo?.sistema
  const desab = !podeEditar || pend
  const papelDesc = PAPEIS_TIPO.find((p) => p.v === papel)

  function corpo() {
    return { nome: nome.trim(), nomeAluno: nomeAluno.trim() || nome.trim(), cor, duracaoPadraoMin: numOuNull(dur), prioridade: numOuNull(prio) ?? 0, ordem: numOuNull(ordem) ?? 0, ativo, descricao: desc.trim() || null, ...(travado ? {} : { geraMeta: papel === 'generico' && geraMeta }) }
  }

  function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do tipo.'); return }
    if (novo && !SLUG_RE.test(slug)) { toast.error('Slug inválido: use a-z, 0-9, _ ou - (2 a 40 caracteres).'); return }
    start(async () => {
      if (novo) {
        const r = await criarTipoConteudo({ slug, papel, ...corpo() })
        if (!r.ok) { toast.error(r.error || 'Não foi possível criar.'); return }
        toast.success('Tipo criado.'); await onSalvo(slug); return
      }
      const patch = travado ? corpo() : { ...corpo(), papel }
      const base = { versaoEsperada: versao }
      let r = await salvarTipoConteudo(tipo!.slug, patch, base)
      if (r.ok && r.precisaConfirmar) {
        const ok = await confirmar({ titulo: 'Esta mudança afeta planos ativos', mensagem: msgImpacto(r), confirmar: 'Aplicar mudança', destrutivo: true })
        if (!ok) return
        r = await salvarTipoConteudo(tipo!.slug, patch, { ...base, confirmarImpacto: true })
      }
      if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
      toast.success('Tipo salvo.'); await onSalvo(tipo!.slug)
    })
  }

  function excluir() {
    if (!tipo) return
    start(async () => {
      if (!await confirmar({ titulo: `Excluir “${tipo.nome}”?`, mensagem: 'O tipo será removido do catálogo.', confirmar: 'Excluir', destrutivo: true })) return
      let r = await removerTipoConteudo(tipo.slug)
      if (r.ok && r.precisaConfirmar) {
        if (!await confirmar({ titulo: 'Este tipo está em uso', mensagem: msgImpacto(r), confirmar: 'Excluir mesmo assim', destrutivo: true })) return
        r = await removerTipoConteudo(tipo.slug, { confirmarImpacto: true })
      }
      if (!r.ok) { toast.error(r.error || 'Não foi possível excluir.'); return }
      toast.success('Tipo excluído.'); await onRemovido()
    })
  }

  const campo = (rot: string, el: React.ReactNode) => <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">{rot}</span>{el}</label>

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{novo ? 'novo tipo' : tipo?.slug}{travado ? ' · sistema' : ''}</p>
        <h2 className="text-lg font-bold">{novo ? 'Novo tipo de conteúdo' : tipo?.nome}</h2>
        {uso && <p className="text-sm text-muted-foreground">Em uso: {uso.pastas} pasta(s), {uso.documentos} documento(s), {uso.planosAtivos} plano(s) ativo(s).</p>}
      </div>
      {travado && <p className="rounded-xl border border-border bg-muted/30 p-2 text-xs text-muted-foreground">Tipo de sistema: slug e papel são fixos. Você pode ajustar nome, cor, duração, prioridade, ordem e ativo.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {campo('Slug', <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} disabled={!novo || desab} placeholder="ex.: mapa-mental" className={cn(inputCls, 'font-mono')} />)}
        {campo('Nome', <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={desab} className={inputCls} />)}
        {campo('Nome para o aluno', <input value={nomeAluno} onChange={(e) => setNomeAluno(e.target.value)} disabled={desab} placeholder="Igual ao nome se vazio" className={inputCls} />)}
        {campo('Papel', (
          <select value={papel} onChange={(e) => setPapel(e.target.value as PapelTipo)} disabled={desab || travado} className={inputCls}>
            {PAPEIS_TIPO.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
          </select>
        ))}
        {campo('Duração padrão (min)', <input type="number" min={0} value={dur} onChange={(e) => setDur(e.target.value)} disabled={desab} placeholder="padrão do motor" className={inputCls} />)}
        {campo('Prioridade', <input type="number" value={prio} onChange={(e) => setPrio(e.target.value)} disabled={desab} className={inputCls} />)}
        {campo('Ordem', <input type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} disabled={desab} className={inputCls} />)}
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={ativo} disabled={desab} onCheckedChange={(c) => setAtivo(!!c)} aria-label="Ativo" />Ativo</label>
      </div>
      {campo('Descrição', <textarea value={desc} onChange={(e) => setDesc(e.target.value)} disabled={desab} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />)}
      <div className={cn('space-y-1', desab && 'pointer-events-none opacity-60')}>
        <span className="text-xs font-semibold text-muted-foreground">Cor</span>
        <SeletorCor value={cor && ehTokenCor(cor) ? cor : undefined} onChange={(t) => setCor(t ?? null)} cores={CORES_SEL} padraoRotulo="Sem cor" />
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como este tipo se comporta no cronograma</p>
        <p className="mt-1 text-sm">{papelDesc?.desc}</p>
        {papel === 'generico' && (
          <div className="mt-2 space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={geraMeta} disabled={desab} onCheckedChange={(c) => setGeraMeta(!!c)} aria-label="Gera meta própria no cronograma" />Gera meta própria no cronograma</label>
            <p className="text-xs text-muted-foreground">Desligado, o tipo entra como material de apoio. Ligado, cada documento vira uma meta própria (duração, prioridade e ordem deste tipo). Vale só para planos gerados ou regenerados dali em diante; os planos já gerados não mudam.</p>
          </div>
        )}
      </div>

      {tipo && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regra no cronograma</p>
          {!tipo.sistema && tipo.geraMeta ? (
            <>
              <p className="mt-1 text-sm">{registro ? resumoRegraTipo(regraEfetiva(tiposGxDe(registro.regras), tipo.slug)) : 'Carregando…'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Edite na aba Matriz. Vale ao gerar/regenerar planos; planos já gerados não mudam.</p>
            </>
          ) : <p className="mt-1 text-sm text-muted-foreground">— <LinkFaixas className="ml-1" /></p>}
        </div>
      )}

      {podeEditar && (
        <div className="flex flex-wrap justify-between gap-2">
          {tipo && !tipo.sistema
            ? <button type="button" onClick={excluir} disabled={pend} className="h-9 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive disabled:opacity-50">Excluir</button>
            : <span />}
          <button type="button" onClick={salvar} disabled={pend} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {pend && <Loader2 className="h-4 w-4 animate-spin" />}{novo ? 'Criar tipo' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  )
}

interface Rascunho { papel: PapelTipo; dur: string; prio: string; ordem: string; ativo: boolean; geraMeta: boolean }
const rascunhoDe = (t: TipoConteudo): Rascunho => ({ papel: t.papel, dur: t.duracaoPadraoMin == null ? '' : String(t.duracaoPadraoMin), prio: String(t.prioridade), ordem: String(t.ordem), ativo: t.ativo, geraMeta: !!t.geraMeta })

function Matriz({ tipos, podeEditar, onMudou }: { tipos: TipoConteudo[]; podeEditar: boolean; onMudou: () => Promise<void> }) {
  const [q, setQ] = useState('')
  const [soCustom, setSoCustom] = useState(false)
  const [rasc, setRasc] = useState<Record<string, Rascunho>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  const linhas = useMemo(() => {
    const b = q.trim().toLowerCase()
    return tipos.filter((t) => (!soCustom || !t.sistema) && (!b || `${t.slug} ${t.nome}`.toLowerCase().includes(b))).sort((a, c) => a.ordem - c.ordem || a.slug.localeCompare(c.slug))
  }, [tipos, q, soCustom])

  const set = (t: TipoConteudo, p: Partial<Rascunho>) => setRasc((o) => ({ ...o, [t.slug]: { ...(o[t.slug] ?? rascunhoDe(t)), ...p } }))
  const sujo = (t: TipoConteudo) => { const r = rasc[t.slug]; return !!r && JSON.stringify(r) !== JSON.stringify(rascunhoDe(t)) }

  async function salvar(t: TipoConteudo) {
    const r0 = rasc[t.slug]; if (!r0) return
    setSalvando(t.slug)
    try {
      const patch = { ...(t.sistema ? {} : { papel: r0.papel }), duracaoPadraoMin: numOuNull(r0.dur), prioridade: numOuNull(r0.prio) ?? 0, ordem: numOuNull(r0.ordem) ?? 0, ativo: r0.ativo, ...(t.sistema ? {} : { geraMeta: (r0.papel === 'generico') && r0.geraMeta }) }
      const base = { versaoEsperada: (t as TipoConteudo & { versao?: number }).versao }
      let r = await salvarTipoConteudo(t.slug, patch, base)
      if (r.ok && r.precisaConfirmar) {
        if (!await confirmar({ titulo: 'Esta mudança afeta planos ativos', mensagem: msgImpacto(r), confirmar: 'Aplicar mudança', destrutivo: true })) return
        r = await salvarTipoConteudo(t.slug, patch, { ...base, confirmarImpacto: true })
      }
      if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
      toast.success(`“${t.nome}” salvo.`)
      setRasc((o) => { const n = { ...o }; delete n[t.slug]; return n })
      await onMudou()
    } finally { setSalvando(null) }
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">Edição rápida em linha. Cada linha é salva separadamente; tipos de sistema não permitem trocar o papel. "Meta própria" só vale para tipos genéricos e afeta planos gerados dali em diante.</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tipo" aria-label="Buscar tipo na matriz" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soCustom} onChange={(e) => setSoCustom(e.target.checked)} /> Só personalizados</label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            {['Tipo', 'Papel', 'Duração (min)', 'Prioridade', 'Ordem', 'Ativo', 'Meta própria', ''].map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum tipo encontrado.</td></tr>}
            {linhas.map((t) => {
              const r = rasc[t.slug] ?? rascunhoDe(t)
              const off = !podeEditar || salvando === t.slug
              return (
                <tr key={t.slug} className="border-t border-border">
                  <td className="px-3 py-2"><span className="block font-medium">{t.nome}</span><span className="font-mono text-[11px] text-muted-foreground">{t.slug}{t.sistema ? ' · sistema' : ''}</span></td>
                  <td className="px-3 py-2">
                    <select value={r.papel} disabled={off || t.sistema} onChange={(e) => set(t, { papel: e.target.value as PapelTipo })} aria-label={`Papel de ${t.nome}`} className="h-8 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-60">
                      {PAPEIS_TIPO.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input type="number" min={0} value={r.dur} disabled={off} placeholder="padrão" onChange={(e) => set(t, { dur: e.target.value })} aria-label={`Duração de ${t.nome}`} className={numCls} /></td>
                  <td className="px-3 py-2"><input type="number" value={r.prio} disabled={off} onChange={(e) => set(t, { prio: e.target.value })} aria-label={`Prioridade de ${t.nome}`} className={numCls} /></td>
                  <td className="px-3 py-2"><input type="number" value={r.ordem} disabled={off} onChange={(e) => set(t, { ordem: e.target.value })} aria-label={`Ordem de ${t.nome}`} className={numCls} /></td>
                  <td className="px-3 py-2"><Switch checked={r.ativo} disabled={off} onCheckedChange={(c) => set(t, { ativo: !!c })} aria-label={`Ativo: ${t.nome}`} /></td>
                  <td className="px-3 py-2"><Switch checked={r.geraMeta && r.papel === 'generico'} disabled={off || t.sistema || r.papel !== 'generico'} onCheckedChange={(c) => set(t, { geraMeta: !!c })} aria-label={`Gera meta própria: ${t.nome}`} /></td>
                  <td className="px-3 py-2 text-right">
                    {podeEditar && sujo(t) && (
                      <button type="button" onClick={() => void salvar(t)} disabled={salvando === t.slug} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">
                        {salvando === t.slug && <Loader2 className="h-3 w-3 animate-spin" />}Salvar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
