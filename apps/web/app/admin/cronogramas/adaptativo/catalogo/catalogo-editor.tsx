'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, ChevronRight, Loader2, Plus, RotateCcw, Save, Search, Trash2, Eye, EyeOff, ExternalLink, AlertTriangle, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { FiltroQuestoesMetaEditor } from '@/components/admin/filtro-questoes-meta-editor'
import { contarCriterios, type FiltroQuestoesMeta } from '@/lib/cronograma/adaptativo/qf'
import {
  type CatalogoOverride, type AulaOv, type AulaNova, type LpOv, type MateriaisOv,
  ordemEfetiva, moverNaDisciplina, contarAlteracoes, OVERRIDE_VAZIO,
} from '@/lib/cronograma/adaptativo/catalogo-override'
import { salvarEditorCatalogo, type EditorCatalogo, type EditorAulaBase, type EditorLpBase } from '../actions'

type Aba = 'aulas' | 'legproc'
const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12))
const inputCls = 'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring'
const urlAbre = (v: string) => (/^https?:\/\//i.test(v) ? v : v ? `https://www.google.com/search?q=${encodeURIComponent(v)}` : '')

interface LinhaAula { key: string; disc: string; num: string; tema: string; pags: number; qc: string; tec: string; ativo: boolean; nova: boolean; alterada: boolean; base: EditorAulaBase | null; mat: MateriaisOv & { pdflashPaginas?: number | null } }
interface LinhaLp { id: string; disc: string; leiNome: string; trecho: string; ativo: boolean; nova: boolean; alterada: boolean; base: EditorLpBase | null }

export function CatalogoEditor({ inicial, filtrosQf = {} }: { inicial: EditorCatalogo; filtrosQf?: Record<string, FiltroQuestoesMeta> }) {
  const router = useRouter()
  const [ov, setOv] = useState<CatalogoOverride>(inicial.override)
  // Filtros de questões da plataforma por aula (tabela própria; salvam na hora, fora do "Salvar catálogo").
  const [qf, setQf] = useState<Record<string, FiltroQuestoesMeta>>(filtrosQf)
  const [qfAbertas, setQfAbertas] = useState<Set<string>>(new Set())
  const [disc, setDisc] = useState<string>(inicial.disciplinas[0] ?? '')
  const [aba, setAba] = useState<Aba>('aulas')
  const [busca, setBusca] = useState('')
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { setOv(inicial.override) }, [inicial.versao, inicial.override])

  const salvas = useMemo(() => new Set(inicial.override.novas.map((n) => n.k)), [inicial.override])
  const baseAula = useMemo(() => new Map(inicial.aulas.map((a) => [a.key, a])), [inicial.aulas])
  const baseLp = useMemo(() => new Map(inicial.lp.map((l) => [l.id, l])), [inicial.lp])
  const novaPorKey = useMemo(() => new Map(ov.novas.map((n) => [n.k, n])), [ov.novas])
  const novaLpPorId = useMemo(() => new Map(ov.lpNovas.map((n) => [n.id, n])), [ov.lpNovas])

  // ── aulas: valores efetivos, ordem global efetiva e linhas da disciplina ──
  const todasChaves = useMemo(() => [...inicial.aulas.map((a) => a.key), ...ov.novas.map((n) => n.k)], [inicial.aulas, ov.novas])
  const ativoAula = (k: string): boolean => {
    const o = ov.aulas[k]; if (o && o.ativo != null) return o.ativo
    const n = novaPorKey.get(k); if (n) return n.ativo !== false
    return baseAula.get(k)?.ativaBase ?? false
  }
  const ordem = useMemo(() => ordemEfetiva(inicial.ordemBase, todasChaves, ativoAula, ov.ordem), [inicial.ordemBase, todasChaves, ov.aulas, ov.novas, ov.ordem]) // eslint-disable-line react-hooks/exhaustive-deps
  const discDeAula = (k: string) => baseAula.get(k)?.disc ?? novaPorKey.get(k)?.disc ?? ''

  const linhasAula = useMemo<LinhaAula[]>(() => {
    const mk = (k: string): LinhaAula | null => {
      const b = baseAula.get(k), n = novaPorKey.get(k), o = ov.aulas[k] || {}
      const fonte = b ?? n; if (!fonte) return null
      const ativo = ativoAula(k)
      return {
        key: k, disc: fonte.disc, ativo, nova: !!n, base: b ?? null,
        num: o.num ?? (n ? n.num : b!.num), tema: o.tema ?? (n ? n.tema : b!.tema), pags: o.pags ?? (n ? n.pags : b!.pags),
        qc: o.qc ?? (n ? n.qc : b!.qc), tec: o.tec ?? (n ? n.tec : b!.tec),
        mat: { ...(b?.mat ?? n?.mat ?? {}), ...(o.mat ?? {}) },
        alterada: !!n || Object.keys(o).length > 0,
      }
    }
    const ativas = ordem.map(mk).filter((x): x is LinhaAula => !!x && x.disc === disc)
    const inativas = todasChaves.filter((k) => !ordem.includes(k)).map(mk).filter((x): x is LinhaAula => !!x && x.disc === disc && !(x.nova && !x.ativo && !salvas.has(x.key)))
    return [...ativas, ...inativas]
  }, [ordem, todasChaves, ov.aulas, ov.novas, disc, baseAula, novaPorKey, salvas]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── LegProc ──
  const todosLp = useMemo(() => [...inicial.lp.map((l) => l.id), ...ov.lpNovas.map((n) => n.id)], [inicial.lp, ov.lpNovas])
  const ativoLp = (id: string) => ov.lp[id]?.ativo !== false
  const ordemLp = useMemo(() => ordemEfetiva(inicial.lp.map((l) => l.id), todosLp, ativoLp, ov.lpOrdem), [inicial.lp, todosLp, ov.lp, ov.lpOrdem]) // eslint-disable-line react-hooks/exhaustive-deps
  const discDeLp = (id: string) => baseLp.get(id)?.disc ?? novaLpPorId.get(id)?.disc ?? ''
  const linhasLp = useMemo<LinhaLp[]>(() => {
    const mk = (id: string): LinhaLp | null => {
      const b = baseLp.get(id), n = novaLpPorId.get(id), o = ov.lp[id] || {}
      const f = b ?? n; if (!f) return null
      return { id, disc: f.disc, nova: !!n, base: b ?? null, ativo: ativoLp(id), leiNome: o.leiNome ?? f.leiNome, trecho: o.trecho ?? f.trecho, alterada: !!n || Object.keys(o).length > 0 }
    }
    const ativas = ordemLp.map(mk).filter((x): x is LinhaLp => !!x && x.disc === disc)
    const inativas = todosLp.filter((id) => !ordemLp.includes(id)).map(mk).filter((x): x is LinhaLp => !!x && x.disc === disc)
    return [...ativas, ...inativas]
  }, [ordemLp, todosLp, ov.lp, disc, baseLp, novaLpPorId]) // eslint-disable-line react-hooks/exhaustive-deps

  const contagens = useMemo(() => {
    const aulas: Record<string, number> = {}, lp: Record<string, number> = {}
    for (const k of ordem) { const d = discDeAula(k); aulas[d] = (aulas[d] || 0) + 1 }
    for (const id of ordemLp) { const d = discDeLp(id); lp[d] = (lp[d] || 0) + 1 }
    return { aulas, lp }
  }, [ordem, ordemLp]) // eslint-disable-line react-hooks/exhaustive-deps

  const mudou = JSON.stringify(ov) !== JSON.stringify(inicial.override)
  const nAlteracoes = contarAlteracoes(ov)
  const q = busca.trim().toLowerCase()

  // ── edição ──
  function setAula(k: string, patch: Partial<AulaOv & AulaNova>) {
    const n = novaPorKey.get(k)
    if (n) { setOv((c) => ({ ...c, novas: c.novas.map((x) => (x.k === k ? { ...x, ...patch, k: x.k, disc: x.disc } : x)) })); return }
    const b = baseAula.get(k); if (!b) return
    setOv((c) => {
      const atual: AulaOv = { ...(c.aulas[k] || {}), ...patch }
      const igual = (f: 'num' | 'tema' | 'pags' | 'qc' | 'tec') => atual[f] === undefined || atual[f] === b[f]
      for (const f of ['num', 'tema', 'pags', 'qc', 'tec'] as const) if (igual(f)) delete atual[f]
      if (atual.ativo === b.ativaBase) delete atual.ativo
      if (atual.mat) {
        const m = atual.mat as Record<string, unknown>, bm = (b.mat ?? {}) as Record<string, unknown>
        for (const f of Object.keys(m)) if ((m[f] ?? null) === (bm[f] ?? null)) delete m[f]
        if (!Object.keys(m).length) delete atual.mat
      }
      const aulas = { ...c.aulas }
      if (Object.keys(atual).length) aulas[k] = atual; else delete aulas[k]
      return { ...c, aulas }
    })
  }
  function setMat(k: string, patch: MateriaisOv) {
    const atual = novaPorKey.get(k)?.mat ?? ov.aulas[k]?.mat ?? {}
    setAula(k, { mat: { ...atual, ...patch } })
  }
  function alternarAula(k: string) { setAula(k, { ativo: !ativoAula(k) }) }
  function removerNova(k: string) {
    if (!salvas.has(k)) { setOv((c) => ({ ...c, novas: c.novas.filter((x) => x.k !== k), ordem: c.ordem?.filter((x) => x !== k) })); return }
    setAula(k, { ativo: false }) // já foi salva: fica como "desativada" (a posição no catálogo não é reaproveitada)
  }
  function moverAula(k: string, dir: -1 | 1) {
    const nova = moverNaDisciplina(ordem, discDeAula, k, dir)
    if (nova !== ordem) setOv((c) => ({ ...c, ordem: nova }))
  }
  function novaAula() {
    const nums = linhasAula.map((l) => parseInt(l.num, 10)).filter((n) => Number.isFinite(n))
    const k = `c:${novoId()}`
    const n: AulaNova = { k, disc, num: String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0'), tema: 'Nova aula', pags: 0, qc: '', tec: '' }
    setOv((c) => ({ ...c, novas: [...c.novas, n] }))
    setAbertas((s) => new Set(s).add(k))
  }

  function setLp(id: string, patch: Partial<LpOv>) {
    const n = novaLpPorId.get(id)
    if (n) { setOv((c) => ({ ...c, lpNovas: c.lpNovas.map((x) => (x.id === id ? { ...x, ...(patch.leiNome != null ? { leiNome: patch.leiNome } : {}), ...(patch.trecho != null ? { trecho: patch.trecho } : {}) } : x)) })); return }
    const b = baseLp.get(id); if (!b) return
    setOv((c) => {
      const atual: LpOv = { ...(c.lp[id] || {}), ...patch }
      if (atual.leiNome === b.leiNome) delete atual.leiNome
      if (atual.trecho === b.trecho) delete atual.trecho
      if (atual.ativo !== false) delete atual.ativo
      const lp = { ...c.lp }
      if (Object.keys(atual).length) lp[id] = atual; else delete lp[id]
      return { ...c, lp }
    })
  }
  function moverLp(id: string, dir: -1 | 1) {
    const nova = moverNaDisciplina(ordemLp, discDeLp, id, dir)
    if (nova !== ordemLp) setOv((c) => ({ ...c, lpOrdem: nova }))
  }
  function novaMeta() {
    const ult = [...linhasLp].reverse().find((l) => l.ativo)
    const id = `lp:ov:${novoId()}`
    setOv((c) => ({ ...c, lpNovas: [...c.lpNovas, { id, disc, leiNome: ult?.leiNome || 'Lei', trecho: '' }] }))
  }
  function removerNovaMeta(id: string) { setOv((c) => ({ ...c, lpNovas: c.lpNovas.filter((x) => x.id !== id), lpOrdem: c.lpOrdem?.filter((x) => x !== id) })) }

  async function salvar() {
    setSalvando(true)
    const r = await salvarEditorCatalogo(ov, inicial.versao)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar o catálogo.'); if (r.conflito) router.refresh(); return }
    toast.success(`Catálogo salvo (versão ${r.versao}). Os cronogramas dos ${r.alunosComPlano ?? inicial.alunosComPlano} alunos são atualizados no próximo acesso, preservando o que já foi concluído.`)
    router.refresh()
  }
  async function restaurarPadrao() {
    const okc = await confirmar({ titulo: 'Restaurar o catálogo padrão?', mensagem: 'Remove TODAS as edições do Catálogo de metas desta plataforma (aulas editadas, novas, ordem e LegProc) e volta ao catálogo original. Só vale depois de salvar.', confirmar: 'Restaurar', destrutivo: true })
    if (okc) setOv(OVERRIDE_VAZIO)
  }

  const aulasFiltradas = linhasAula.filter((l) => !q || `${l.num} ${l.tema} ${l.qc} ${l.tec}`.toLowerCase().includes(q))
  const lpFiltradas = linhasLp.filter((l) => !q || `${l.leiNome} ${l.trecho}`.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      {!inicial.tabelaOk && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>A tabela do catálogo ainda não existe no banco. Você pode editar, mas só consegue salvar depois de aplicar a migração <code className="rounded bg-muted px-1 text-xs">20261104130000_cronograma_adaptativo_catalogo_override.sql</code>.</span>
        </div>
      )}

      {/* seleção de disciplina + abas */}
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-end gap-3 border-b px-4 pt-3">
          <label className="mb-2 block min-w-[220px]">
            <span className="text-xs font-medium text-muted-foreground">Disciplina</span>
            <select value={disc} onChange={(e) => setDisc(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
              {inicial.disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div className="flex gap-1">
            {([['aulas', `Aulas (${contagens.aulas[disc] || 0})`], ['legproc', `LegProc · 30 min (${contagens.lp[disc] || 0})`]] as const).map(([k, rot]) => (
              <button key={k} type="button" onClick={() => setAba(k)}
                className={cn('rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition', aba === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{rot}</button>
            ))}
          </div>
          <div className="mb-2 ml-auto flex items-center gap-2">
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" aria-label="Buscar" className="h-9 w-44 rounded-lg border bg-background pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </span>
            <button type="button" onClick={aba === 'aulas' ? novaAula : novaMeta} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
              <Plus className="h-4 w-4" />{aba === 'aulas' ? 'Nova aula' : 'Nova meta'}
            </button>
          </div>
        </div>

        <p className="px-4 pt-3 text-xs text-muted-foreground">
          {aba === 'aulas'
            ? 'A ordem vale dentro da disciplina (a intercalação entre disciplinas é mantida). Links aceitam endereço completo (https://…) ou termo de busca. Páginas = 0 usa a estimativa de 60 páginas. Aulas desativadas saem dos novos cronogramas.'
            : 'Cada meta dura 30 minutos e pertence a uma disciplina. A ordem vale dentro da disciplina. Metas da mesma lei podem entrar juntas no dia (até 2).'}
        </p>

        <div className="space-y-2 p-4">
          {aba === 'aulas' ? (
            aulasFiltradas.length ? aulasFiltradas.map((l, i) => {
              const aberta = abertas.has(l.key), pos = i + 1
              return (
                <div key={l.key} className={cn('rounded-xl border p-3', !l.ativo && 'bg-muted/30 opacity-70', l.alterada && l.ativo && 'border-primary/40')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{l.ativo ? pos : '—'}</span>
                    <input value={l.num} onChange={(e) => setAula(l.key, { num: e.target.value })} aria-label="Número da aula" placeholder="Nº" className={cn(inputCls, 'w-14 text-center tabular-nums')} />
                    <input value={l.tema} onChange={(e) => setAula(l.key, { tema: e.target.value })} aria-label="Título da aula" placeholder="Título da aula" className={cn(inputCls, 'min-w-[200px] flex-1')} />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">págs
                      <input type="number" min={0} max={5000} value={l.pags} onChange={(e) => setAula(l.key, { pags: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })} aria-label="Páginas" className={cn(inputCls, 'w-16 tabular-nums')} />
                    </label>
                    {l.nova && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">nova</span>}
                    {!l.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">inativa</span>}
                    <div className="ml-auto flex items-center gap-0.5">
                      <button type="button" disabled={!l.ativo} onClick={() => moverAula(l.key, -1)} aria-label="Subir" title="Subir" className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" disabled={!l.ativo} onClick={() => moverAula(l.key, 1)} aria-label="Descer" title="Descer" className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                      {l.nova && l.ativo
                        ? <button type="button" onClick={() => removerNova(l.key)} aria-label="Remover aula nova" title="Remover" className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                        : <button type="button" onClick={() => alternarAula(l.key)} aria-label={l.ativo ? 'Desativar aula' : 'Ativar aula'} title={l.ativo ? 'Desativar' : 'Ativar'} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted">{l.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>}
                      <button type="button" onClick={() => setAbertas((s) => { const n = new Set(s); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n })} aria-label="Materiais de apoio e origem" aria-expanded={aberta} title="Materiais de apoio e origem" className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"><ChevronRight className={cn('h-4 w-4 transition', aberta && 'rotate-90')} /></button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <LinkField label="QConcursos" value={l.qc} onChange={(v) => setAula(l.key, { qc: v })} />
                    <LinkField label="TEC" value={l.tec} onChange={(v) => setAula(l.key, { tec: v })} />
                  </div>
                  {/* Questões da PLATAFORMA: caminho de filtros (disciplina, assunto, banca…) que define o banco desta meta */}
                  <div className="mt-2">
                    <button type="button" aria-expanded={qfAbertas.has(l.key)}
                      onClick={() => setQfAbertas((s) => { const n = new Set(s); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
                      <ListChecks className="h-3.5 w-3.5" />Questões da plataforma
                      {contarCriterios(qf[l.key]) > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{contarCriterios(qf[l.key])} filtro{contarCriterios(qf[l.key]) > 1 ? 's' : ''}</span>}
                      <ChevronRight className={cn('h-3.5 w-3.5 transition', qfAbertas.has(l.key) && 'rotate-90')} />
                    </button>
                    {qfAbertas.has(l.key) && (
                      <div className="mt-2 rounded-xl border bg-muted/20 p-3">
                        <FiltroQuestoesMetaEditor aulaKey={l.key} inicial={qf[l.key] ?? {}}
                          onSalvo={(f) => setQf((m) => { const n = { ...m }; if (contarCriterios(f) > 0) n[l.key] = f; else delete n[l.key]; return n })} />
                      </div>
                    )}
                  </div>
                  {aberta && (
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">Materiais de apoio e origem</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <MiniNum label="PDFlash (págs)" value={l.mat.pdflashPaginas ?? null} onChange={(v) => setMat(l.key, { pdflashPaginas: v })} />
                        <MiniNum label="PDFight (págs)" value={l.mat.pdfightPaginas ?? null} onChange={(v) => setMat(l.key, { pdfightPaginas: v })} />
                        <MiniTxt label="Videoaula" value={l.mat.videoaula ?? ''} onChange={(v) => setMat(l.key, { videoaula: v || null })} />
                        <MiniTxt label="Atualização" value={l.mat.atualizacao ?? ''} onChange={(v) => setMat(l.key, { atualizacao: v || null })} />
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {l.base?.docId ? 'Vinculada a um documento da Biblioteca.' : l.nova ? 'Aula criada neste editor (sem documento na Biblioteca).' : 'Sem documento da Biblioteca (catálogo do modelo).'}
                        {l.base?.origem?.arquivo ? ` Origem: ${l.base.origem.arquivo}${l.base.origem.aba ? ` · aba ${l.base.origem.aba}` : ''}${l.base.origem.linha ? ` · linha ${l.base.origem.linha}` : ''}.` : ''}
                        {' '}PDFlash, PDFight, videoaula e atualização são informativos (referência da equipe).
                      </p>
                    </div>
                  )}
                </div>
              )
            }) : <p className="py-6 text-center text-sm text-muted-foreground">{q ? 'Nenhuma aula encontrada.' : 'Esta disciplina não tem aulas no catálogo.'}</p>
          ) : (
            lpFiltradas.length ? lpFiltradas.map((l, i) => (
              <div key={l.id} className={cn('flex flex-wrap items-center gap-2 rounded-xl border p-3', !l.ativo && 'bg-muted/30 opacity-70', l.alterada && l.ativo && 'border-primary/40')}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{l.ativo ? i + 1 : '—'}</span>
                <input value={l.leiNome} onChange={(e) => setLp(l.id, { leiNome: e.target.value })} aria-label="Lei" placeholder="Lei" className={cn(inputCls, 'min-w-[200px] flex-1')} />
                <input value={l.trecho} onChange={(e) => setLp(l.id, { trecho: e.target.value })} aria-label="Artigos / trecho" placeholder="Artigos / trecho (ex.: Art. 1º ao art. 6º)" className={cn(inputCls, 'min-w-[200px] flex-1')} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">30 min</span>
                {l.nova && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">nova</span>}
                {!l.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">inativa</span>}
                <div className="ml-auto flex items-center gap-0.5">
                  <button type="button" disabled={!l.ativo} onClick={() => moverLp(l.id, -1)} aria-label="Subir" title="Subir" className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={!l.ativo} onClick={() => moverLp(l.id, 1)} aria-label="Descer" title="Descer" className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  {l.nova
                    ? <button type="button" onClick={() => removerNovaMeta(l.id)} aria-label="Remover meta nova" title="Remover" className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    : <button type="button" onClick={() => setLp(l.id, { ativo: l.ativo ? false : true })} aria-label={l.ativo ? 'Desativar meta' : 'Ativar meta'} title={l.ativo ? 'Desativar' : 'Ativar'} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted">{l.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>}
                </div>
                {l.base?.origem?.arquivo && <p className="w-full pl-8 text-[11px] text-muted-foreground">Origem: {l.base.origem.arquivo}{l.base.origem.aba ? ` · aba ${l.base.origem.aba}` : ''}{l.base.origem.linha ? ` · linha ${l.base.origem.linha}` : ''}</p>}
              </div>
            )) : <p className="py-6 text-center text-sm text-muted-foreground">{q ? 'Nenhuma meta encontrada.' : 'Esta disciplina não tem metas de LegProc no catálogo.'}</p>
          )}
        </div>
      </div>

      {/* barra de salvar — sticky na coluna de conteúdo */}
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <span className="mr-auto text-xs text-muted-foreground">
          {mudou ? `${nAlteracoes} item(ns) alterado(s), não salvo(s).` : inicial.versao ? `Versão ${inicial.versao} · salva${inicial.atualizadoEm ? ` em ${new Date(inicial.atualizadoEm).toLocaleString('pt-BR')}` : ''}.` : 'Catálogo padrão (sem edições).'}
          {' '}Ao salvar, os cronogramas dos alunos se atualizam no próximo acesso; o que já foi concluído é preservado.
        </span>
        <button type="button" disabled={salvando || (!nAlteracoes && !inicial.versao)} onClick={restaurarPadrao} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50"><RotateCcw className="h-4 w-4" />Restaurar padrão</button>
        <button type="button" disabled={!mudou || salvando} onClick={() => setOv(inicial.override)} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50">Descartar</button>
        <button type="button" disabled={!mudou || salvando} onClick={salvar} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar catálogo
        </button>
      </div>
    </div>
  )
}

// Campos pequenos no NÍVEL DO MÓDULO (definidos dentro do componente remontariam a cada tecla).
function LinkField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const href = urlAbre(value)
  return (
    <label className="block min-w-0">
      <span className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">{label}: link ou busca
        {href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Abrir ${label}`} className="inline-flex items-center gap-0.5 text-primary hover:underline"><ExternalLink className="h-3 w-3" />abrir</a>}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… ou termo de busca" className={cn(inputCls, 'mt-1')} />
    </label>
  )
}
function MiniNum({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block min-w-0"><span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input type="number" min={0} max={5000} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value)) || 0))} className={cn(inputCls, 'mt-1 tabular-nums')} />
    </label>
  )
}
function MiniTxt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0"><span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'mt-1')} />
    </label>
  )
}
