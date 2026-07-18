'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, Users, Loader2, DownloadCloud, Check, CheckCircle2, FolderPlus, Folder, FolderOpen, Ban, ArrowUpDown, ListFilter, X, Layers, Eye, Mail, AlertTriangle, ChevronRight, ChevronDown, Plus, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { contarMembrosGrupos, contarTodosGrupos, importarGruposCurseduca, agendarImportacaoCurseduca, statusImportacaoCurseduca, previewMembrosGrupo, listarGruposSistema, type GrupoCurseducaDTO, type GrupoSistema, type MembroPreview } from '@/app/admin/curseduca/actions'
import { criarGrupo, criarGrupoMestre } from '@/app/admin/grupos/actions'
import type { ResultadoImportCurseduca } from '@/lib/curseduca/tipos'

// Ramo da árvore (estilo explorador): segmento vertical + tick horizontal de um item.
// Vai até embaixo (conecta ao próximo irmão), exceto no último filho, onde para no centro.
function TreeBranch({ isLast, children }: { isLast: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('relative pl-[14px]', !isLast && 'pb-1.5')}>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 w-px bg-border" style={{ height: isLast ? 18 : '100%' }} />
      <span aria-hidden className="pointer-events-none absolute left-0 top-[18px] h-px w-[14px] bg-border" />
      {children}
    </div>
  )
}

type Destino = 'nenhum' | 'existente'
type Ordem = 'nome' | 'nome_desc' | 'id' | 'id_desc' | 'recentes'

const ORDENS: { valor: Ordem; label: string }[] = [
  { valor: 'nome', label: 'Nome (A → Z)' },
  { valor: 'nome_desc', label: 'Nome (Z → A)' },
  { valor: 'recentes', label: 'Mais recentes' },
  { valor: 'id', label: 'Código (menor)' },
  { valor: 'id_desc', label: 'Código (maior)' },
]

const ehDesatualizado = (nome: string) => /desatualizad/i.test(nome)

export function CurseducaImport({ grupos, sistema, extra }: { grupos: GrupoCurseducaDTO[]; sistema: GrupoSistema[]; extra?: React.ReactNode }) {
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('id_desc')
  const [soSelecionados, setSoSelecionados] = useState(false)
  const [ocultarDesatualizados, setOcultarDesatualizados] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [total, setTotal] = useState<number | null>(null)
  const [contando, setContando] = useState(false)
  const [destino, setDestino] = useState<Destino>('nenhum')
  const [grupoId, setGrupoId] = useState('')
  const [sincronizar, setSincronizar] = useState(false)
  const [segundoPlano, setSegundoPlano] = useState(false)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [res, setRes] = useState<ResultadoImportCurseduca | null>(null)
  const [verGrupo, setVerGrupo] = useState<GrupoCurseducaDTO | null>(null)
  const [contagens, setContagens] = useState<Record<number, number>>({})
  const [contandoTudo, setContandoTudo] = useState(true)
  const [sistemaLocal, setSistemaLocal] = useState<GrupoSistema[]>(sistema)
  const [pickerAberto, setPickerAberto] = useState(false)

  useEffect(() => { setSistemaLocal(sistema) }, [sistema])

  // Carrega a contagem de membros de todos os grupos (uma vez, ao montar).
  useEffect(() => {
    let vivo = true
    setContandoTudo(true)
    contarTodosGrupos(grupos.map((g) => g.id)).then((r) => {
      if (!vivo) return
      if (r.ok && r.contagens) setContagens(r.contagens)
      setContandoTudo(false)
    })
    return () => { vivo = false }
  }, [grupos])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    let lista = grupos.filter((g) =>
      (!t || g.nome.toLowerCase().includes(t)) &&
      (!soSelecionados || sel.has(g.id)) &&
      (!ocultarDesatualizados || !ehDesatualizado(g.nome)),
    )
    const dir = ordem === 'nome_desc' || ordem === 'id_desc' ? -1 : 1
    lista = [...lista].sort((a, b) => {
      if (ordem === 'id' || ordem === 'id_desc') return (a.id - b.id) * dir
      if (ordem === 'recentes') return String(b.criadoEm ?? '').localeCompare(String(a.criadoEm ?? ''))
      return a.nome.localeCompare(b.nome, 'pt-BR') * dir
    })
    return lista
  }, [grupos, q, ordem, soSelecionados, ocultarDesatualizados, sel])

  // Conta membros (com debounce) quando a seleção muda. NÃO zera o resultado aqui —
  // senão limpar a seleção após importar apagaria o painel de resultado (o "limpar
  // resultado" fica nas ações manuais de seleção abaixo).
  useEffect(() => {
    setTotal(null)
    if (sel.size === 0) return
    const t = setTimeout(async () => {
      setContando(true)
      const r = await contarMembrosGrupos([...sel])
      setContando(false)
      if (r.ok) setTotal(r.total ?? 0)
    }, 600)
    return () => clearTimeout(t)
  }, [sel])

  const toggle = (id: number) => { setRes(null); setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const selecionarFiltrados = () => { setRes(null); setSel((s) => { const n = new Set(s); filtrados.forEach((g) => n.add(g.id)); return n }) }
  const limpar = () => { setRes(null); setSel(new Set()) }

  const grupoSel = useMemo(() => sistemaLocal.find((s) => s.id === grupoId) ?? null, [sistemaLocal, grupoId])
  const pastaDoSel = useMemo(() => grupoSel?.pai_id ? sistemaLocal.find((s) => s.id === grupoSel.pai_id) ?? null : null, [grupoSel, sistemaLocal])

  async function importar() {
    if (!sel.size) return
    if (destino === 'existente' && !grupoId) { toast.error('Escolha o grupo de destino.'); return }
    setImportando(true); setRes(null); setJobStatus(null)
    const dest = { tipo: destino, grupoId: grupoId || undefined }
    const sync = destino === 'existente' && sincronizar

    if (segundoPlano) {
      const ag = await agendarImportacaoCurseduca([...sel], dest, sync)
      if (!ag.ok || !ag.jobId) { setImportando(false); toast.error(ag.error ?? 'Falha ao agendar.'); return }
      toast.success('Importação agendada — rodando em segundo plano.')
      setJobStatus('pendente')
      const jobId = ag.jobId
      const poll = async () => {
        const s = await statusImportacaoCurseduca(jobId)
        if (!s.ok) { setJobStatus(null); setImportando(false); toast.error(s.error ?? 'Falha no acompanhamento.'); return }
        setJobStatus(s.status ?? null)
        if (s.status === 'concluido') { setImportando(false); if (s.resultado) setRes(s.resultado); setSel(new Set()); toast.success('Importação concluída.'); return }
        if (s.status === 'erro') { setImportando(false); toast.error(s.erro ?? 'Falha na importação.'); return }
        setTimeout(poll, 5000)
      }
      setTimeout(poll, 5000)
      return
    }

    const r = await importarGruposCurseduca([...sel], dest, sync)
    setImportando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha na importação.'); return }
    setRes(r)
    setSel(new Set()) // limpa a seleção pós-import (evita reimportar os mesmos p/ outro grupo sem querer)
    toast.success(`${r.novos ?? 0} novo(s) · ${r.jaExistiam ?? 0} já existia(m)${r.vinculados ? ` · ${r.vinculados} vinculado(s)` : ''}${r.removidos ? ` · ${r.removidos} removido(s)` : ''}`)
  }

  const temFiltro = !!q || soSelecionados || ocultarDesatualizados

  return (
    <div className="grid gap-6 lg:h-[calc(100vh-16rem)] lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Lista de grupos da Curseduca */}
      <div className="animate-rise flex flex-col overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${grupos.length} grupos…`}
              className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none transition focus:ring-2 focus:ring-ring" />
            {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <Select value={ordem} onValueChange={(v) => v && setOrdem(v as Ordem)}>
            <SelectTrigger className="h-10 gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue>{(value: string) => ORDENS.find((o) => o.valor === value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDENS.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ListFilter className="h-3.5 w-3.5" /> Filtros:</span>
          <Chip ativo={soSelecionados} onClick={() => setSoSelecionados((v) => !v)} icon={<Check className="h-3 w-3" />}>Só selecionados ({sel.size})</Chip>
          <Chip ativo={ocultarDesatualizados} onClick={() => setOcultarDesatualizados((v) => !v)} icon={<Ban className="h-3 w-3" />}>Ocultar desatualizados</Chip>
          {temFiltro && <button type="button" onClick={() => { setQ(''); setSoSelecionados(false); setOcultarDesatualizados(false) }} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar filtros</button>}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Exibindo <b className="tabular-nums text-foreground">{filtrados.length}</b> de {grupos.length}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={selecionarFiltrados} className="rounded-md border px-2.5 py-1 font-medium text-foreground transition hover:bg-muted">Selecionar exibidos</button>
            {sel.size > 0 && <button type="button" onClick={limpar} className="rounded-md px-2.5 py-1 hover:text-foreground">Limpar</button>}
          </div>
        </div>

        <div className="scroll-claro stagger min-h-0 flex-1 overflow-y-auto p-2 max-lg:max-h-[60vh]">
          {filtrados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-muted-foreground">
              <Search className="h-8 w-8 opacity-40" />
              Nenhum grupo encontrado com esses filtros.
            </div>
          ) : filtrados.map((g) => {
            const on = sel.has(g.id)
            const velho = ehDesatualizado(g.nome)
            return (
              <button key={g.id} type="button" onClick={() => toggle(g.id)}
                className={cn('group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-200',
                  on ? 'border-primary/30 bg-primary/10 shadow-sm' : 'hover:border-border hover:bg-muted')}>
                <span className={cn('absolute inset-y-0 left-0 w-1 rounded-r bg-gradient-to-b from-primary to-primary/40 transition-opacity', on ? 'opacity-100' : 'opacity-0')} />
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200',
                  on ? 'scale-110 border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 group-hover:border-primary/50')}>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', velho && 'text-muted-foreground')}>{g.nome}</span>
                {velho && <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">desatualizado</span>}
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" title="Membros no grupo">
                  <Users className="h-3 w-3" />
                  {g.id in contagens ? <span className="tabular-nums text-foreground">{contagens[g.id]}</span> : contandoTudo ? <Loader2 className="h-3 w-3 animate-spin" /> : '—'}
                </span>
                <span role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setVerGrupo(g) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setVerGrupo(g) } }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition hover:bg-primary/10 hover:text-primary focus:opacity-100 group-hover:opacity-100"
                  title="Ver membros do grupo">
                  <Eye className="h-3.5 w-3.5" /> Ver
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">#{g.id}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel de importação */}
      <div className="space-y-2.5 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center justify-between rounded-xl border bg-gradient-to-br from-primary/10 to-transparent px-3.5 py-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {sel.size === 0 ? 'Selecione grupos'
              : contando ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> contando…</span>
              : <span><b className="tabular-nums text-foreground">{total ?? '—'}</b> membro(s)</span>}
          </span>
          <span className="text-2xl font-bold tabular-nums text-primary">{sel.size}</span>
        </div>

        <div className="rounded-2xl border bg-card p-3">
          <p className="mb-2 text-sm font-semibold">Destino dos alunos</p>
          {/* Resumo do destino (abre o pop-up com a área de grupos). */}
          <button type="button" onClick={() => setPickerAberto(true)}
            className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', destino === 'nenhum' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
              {destino === 'nenhum' ? <Ban className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {destino === 'nenhum' ? 'Só adicionar ao sistema' : (grupoSel?.nome ?? 'Grupo removido — escolha outro')}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {destino === 'nenhum'
                  ? 'Cadastra os alunos sem vincular a grupo'
                  : pastaDoSel ? `Pasta: ${pastaDoSel.nome}` : `${grupoSel?.membros ?? 0} membro(s) no grupo`}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary"><Pencil className="h-3.5 w-3.5" /> Alterar</span>
          </button>

          {destino === 'existente' && (
            <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
              <input type="checkbox" checked={sincronizar} onChange={(e) => setSincronizar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border" />
              <span>
                <b>Sincronizar</b> — remove do grupo quem veio da Curseduca e <b>saiu</b> dos grupos selecionados.
                <span className="block text-muted-foreground">Só desvincula do grupo (não apaga o aluno) e preserva quem foi adicionado manualmente.</span>
              </span>
            </label>
          )}
        </div>

        <label className="flex items-center gap-2 px-1 text-xs">
          <input type="checkbox" checked={segundoPlano} onChange={(e) => setSegundoPlano(e.target.checked)} className="h-4 w-4 rounded border" />
          <span><b>Importar em segundo plano</b> — para grupos grandes (roda no servidor).</span>
        </label>

        <button type="button" onClick={importar} disabled={sel.size === 0 || importando}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:shadow-primary/40 disabled:opacity-60 disabled:shadow-none">
          {importando
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {jobStatus ? `Em segundo plano (${jobStatus})…` : 'Importando…'}</>
            : <><DownloadCloud className="h-4 w-4 transition-transform group-hover:translate-y-0.5" /> Importar membros</>}
        </button>

        <p className="px-1 text-[11px] leading-snug text-muted-foreground">Traz nome, e-mail, CPF, telefone e classificação. Data de nascimento não vem da Curseduca.</p>

        {res && (
          <div className="animate-pop rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Importação concluída</div>
            <ul className="space-y-1 text-sm">
              <li><b className="tabular-nums">{res.total}</b> analisado(s)</li>
              <li><b className="tabular-nums text-emerald-600 dark:text-emerald-400">{res.novos}</b> novo(s) cadastrado(s)</li>
              <li><b className="tabular-nums">{res.jaExistiam}</b> já existia(m) — não duplicado(s)</li>
              {!!res.atualizados && <li><b className="tabular-nums text-sky-600 dark:text-sky-400">{res.atualizados}</b> atualizado(s) (CPF/telefone/classificação)</li>}
              {res.grupoNome && <li><b className="tabular-nums">{res.vinculados}</b> vinculado(s) ao grupo “{res.grupoNome}”</li>}
              {!!res.removidos && <li className="text-rose-600 dark:text-rose-400"><b className="tabular-nums">{res.removidos}</b> removido(s) do grupo (saíram na Curseduca)</li>}
              {!!res.semIdentificador && <li className="text-amber-600 dark:text-amber-400">{res.semIdentificador} sem e-mail (ignorado[s])</li>}
              {!!res.semDetalhe && <li className="text-amber-600 dark:text-amber-400">{res.semDetalhe} detalhe(s) falharam (CPF/telefone podem faltar — tente reimportar)</li>}
              {!!res.restante && <li className="text-sky-600 dark:text-sky-400">{res.restante} sem detalhe (limite por importação) — <b>reimporte o grupo</b> para completar CPF/telefone</li>}
            </ul>
          </div>
        )}

        {extra}
      </div>

      <GrupoDestinoDialog
        aberto={pickerAberto}
        onClose={() => setPickerAberto(false)}
        sistema={sistemaLocal}
        onSistemaChange={setSistemaLocal}
        valor={{ destino, grupoId }}
        onConfirmar={(d, id) => { setDestino(d); setGrupoId(id); if (d !== 'existente') setSincronizar(false); setPickerAberto(false) }}
      />

      <MembrosDialog grupo={verGrupo} onClose={() => setVerGrupo(null)}
        selecionado={verGrupo ? sel.has(verGrupo.id) : false}
        onToggle={(id) => toggle(id)} />
    </div>
  )
}

// ── Pop-up: área de grupos (escolher destino, criar grupo/pasta, organizar) ──
function GrupoDestinoDialog({ aberto, onClose, sistema, onSistemaChange, valor, onConfirmar }: {
  aberto: boolean
  onClose: () => void
  sistema: GrupoSistema[]
  onSistemaChange: (s: GrupoSistema[]) => void
  valor: { destino: Destino; grupoId: string }
  onConfirmar: (destino: Destino, grupoId: string) => void
}) {
  const [escolha, setEscolha] = useState<string | null>(valor.destino === 'existente' ? valor.grupoId : null)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [modo, setModo] = useState<'grupo' | 'pasta'>('grupo')
  const [nome, setNome] = useState('')
  const [paiNovo, setPaiNovo] = useState<string>('')

  const byId = useMemo(() => new Map(sistema.map((g) => [g.id, g])), [sistema])
  const { children, top } = useMemo(() => {
    const m = new Map<string, GrupoSistema[]>()
    const t: GrupoSistema[] = []
    for (const g of sistema) {
      const pai = g.pai_id && byId.has(g.pai_id) ? g.pai_id : null
      if (pai) { const a = m.get(pai) ?? []; a.push(g); m.set(pai, a) } else t.push(g)
    }
    const ord = (arr: GrupoSistema[]) => arr.sort((a, b) => Number(b.is_mestre) - Number(a.is_mestre) || a.nome.localeCompare(b.nome))
    for (const a of m.values()) ord(a)
    ord(t)
    return { children: m, top: t }
  }, [sistema, byId])

  const pastas = useMemo(() => {
    const out: { id: string; nome: string; depth: number }[] = []
    const walk = (nodes: GrupoSistema[], d: number) => { for (const n of nodes) if (n.is_mestre) { out.push({ id: n.id, nome: n.nome, depth: d }); walk(children.get(n.id) ?? [], d + 1) } }
    walk(top, 0)
    return out
  }, [children, top])

  // Ao (re)abrir, sincroniza a escolha com o valor atual e expande as pastas.
  useEffect(() => {
    if (!aberto) return
    setEscolha(valor.destino === 'existente' ? valor.grupoId : null)
    setExpandido(new Set(sistema.filter((g) => g.is_mestre).map((g) => g.id)))
    setBusca(''); setNome(''); setModo('grupo'); setPaiNovo('')
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) { setExpandido((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function refresh(): Promise<GrupoSistema[]> {
    const r = await listarGruposSistema()
    if (r.ok && r.sistema) { onSistemaChange(r.sistema); return r.sistema }
    return sistema
  }

  async function criar() {
    const t = nome.trim()
    if (!t) { toast.error('Informe um nome.'); return }
    setCriando(true)
    const r = modo === 'pasta'
      ? await criarGrupoMestre(t, undefined, paiNovo || null)
      : await criarGrupo(t, undefined, { paiId: paiNovo || null })
    setCriando(false)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao criar'); return }
    toast.success(modo === 'pasta' ? 'Pasta criada' : 'Grupo criado')
    setNome('')
    await refresh()
    if (modo === 'grupo' && r.id) setEscolha(r.id)
    if (modo === 'pasta' && r.id) setExpandido((p) => new Set(p).add(r.id!))
  }

  const q = busca.trim().toLowerCase()

  function grupoRow(g: GrupoSistema) {
    const on = escolha === g.id
    return (
      <button key={g.id} type="button" onClick={() => setEscolha(g.id)}
        className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
          {on && <Check className="h-3 w-3" />}
        </span>
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nome}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{g.membros} membro(s)</span>
      </button>
    )
  }

  function renderNo(g: GrupoSistema): React.ReactElement {
    if (!g.is_mestre) return grupoRow(g)
    const filhos = children.get(g.id) ?? []
    const aberto2 = expandido.has(g.id)
    const alvoPasta = paiNovo === g.id
    return (
      <div key={g.id}>
        <div className={cn('flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors', alvoPasta ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/50')}>
          <button type="button" onClick={() => toggle(g.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            {aberto2 ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {aberto2 ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} /> : <Folder className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} />}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.nome}</span>
          <button type="button" onClick={() => { setModo('grupo'); setPaiNovo(g.id) }} title="Criar grupo nesta pasta"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => { setModo('grupo'); setPaiNovo(alvoPasta ? '' : g.id) }}
            title={alvoPasta ? 'Pasta selecionada — novo grupo entra aqui' : 'Selecionar esta pasta para o novo grupo'}
            className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors', alvoPasta ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary/60')}>
            {alvoPasta && <Check className="h-3 w-3" />}
          </button>
        </div>
        {aberto2 && (
          <div className="ml-[18px] mt-1.5">
            {filhos.length === 0
              ? <TreeBranch isLast><p className="py-1 text-xs text-muted-foreground">Pasta vazia.</p></TreeBranch>
              : filhos.map((c, i) => <TreeBranch key={c.id} isLast={i === filhos.length - 1}>{renderNo(c)}</TreeBranch>)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8"><Folder className="h-5 w-5 text-primary" /> Destino dos alunos</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo…"
            className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Árvore de grupos/pastas */}
        <div className="scroll-claro min-h-[14rem] flex-1 space-y-1.5 overflow-y-auto rounded-xl border p-2">
          <button type="button" onClick={() => setEscolha(null)}
            className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', escolha === null ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
            <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', escolha === null ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
              {escolha === null && <Check className="h-3 w-3" />}
            </span>
            <Ban className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm font-medium">Sem grupo — só cadastrar no sistema</span>
          </button>

          {q
            ? (() => {
                const res = sistema.filter((g) => !g.is_mestre && g.nome.toLowerCase().includes(q))
                return res.length === 0
                  ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
                  : res.map((g) => grupoRow(g))
              })()
            : sistema.length === 0
              ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum grupo criado ainda. Crie um abaixo.</p>
              : top.map((g) => renderNo(g))}
        </div>

        {/* Criar grupo / pasta */}
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <button type="button" onClick={() => setModo('grupo')} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition', modo === 'grupo' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><FolderPlus className="h-3.5 w-3.5" /> Novo grupo</button>
            <button type="button" onClick={() => setModo('pasta')} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition', modo === 'pasta' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><Folder className="h-3.5 w-3.5" /> Nova pasta</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criar() } }}
              placeholder={modo === 'pasta' ? 'Nome da nova pasta' : 'Nome do novo grupo'}
              className="min-w-[160px] flex-1 rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <Select value={paiNovo} onValueChange={(v) => setPaiNovo(v === '__raiz__' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Na raiz">
                  {(value: string) => (value && value !== '__raiz__' ? pastas.find((p) => p.id === value)?.nome : null) ?? 'Na raiz'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__raiz__">Na raiz (sem pasta)</SelectItem>
                {pastas.map((p) => <SelectItem key={p.id} value={p.id}>{' '.repeat(p.depth * 2)}{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" onClick={criar} disabled={criando || !nome.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted">Cancelar</button>
          <button type="button" onClick={() => onConfirmar(escolha ? 'existente' : 'nenhum', escolha ?? '')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            <Check className="h-4 w-4" /> Usar este destino
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function fmtDia(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function ExpiracaoTexto({ m }: { m: MembroPreview }) {
  if (!m.temMatricula) return <span className="text-muted-foreground">—</span>
  if (!m.expiraEm) return <span className="text-foreground">Vitalício</span>
  const d = new Date(m.expiraEm)
  if (isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const expirado = d.getTime() < Date.now()
  return <span className={expirado ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}>{expirado ? `Expirado em ${label}` : `Até ${label}`}</span>
}

function SituacaoBadge({ s }: { s: string | null }) {
  if (!s) return <span className="text-xs text-muted-foreground">—</span>
  const ativo = s.toUpperCase() === 'ACTIVE'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
      ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/15 text-slate-600 dark:text-slate-400')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-emerald-500' : 'bg-slate-400')} />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function MembrosDialog({ grupo, onClose, selecionado, onToggle }: { grupo: GrupoCurseducaDTO | null; onClose: () => void; selecionado: boolean; onToggle: (id: number) => void }) {
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [membros, setMembros] = useState<MembroPreview[]>([])
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!grupo) return
    let vivo = true
    setCarregando(true); setErro(null); setMembros([]); setBusca('')
    previewMembrosGrupo(grupo.id).then((r) => {
      if (!vivo) return
      setCarregando(false)
      if (!r.ok) { setErro(r.error ?? 'Falha ao carregar.'); return }
      setMembros(r.membros ?? [])
    })
    return () => { vivo = false }
  }, [grupo])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return membros
    return membros.filter((m) => m.nome.toLowerCase().includes(t) || (m.email ?? '').includes(t) || (m.cpf ?? '').includes(t))
  }, [membros, busca])

  const comEmail = membros.filter((m) => m.email).length

  return (
    <Dialog open={!!grupo} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Users className="h-5 w-5 text-primary" />
            <span className="min-w-0 truncate">{grupo?.nome}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou CPF…"
              className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {grupo && (
            <button type="button" onClick={() => onToggle(grupo.id)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
                selecionado ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              <Check className="h-4 w-4" /> {selecionado ? 'Selecionado' : 'Selecionar grupo'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> <b className="tabular-nums text-foreground">{membros.length}</b> membro(s)</span>
          <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> <b className="tabular-nums text-foreground">{comEmail}</b> com e-mail</span>
        </div>

        <div className="scroll-claro max-h-[55vh] min-h-[16rem] overflow-y-auto rounded-xl border">
          {carregando ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" /> Carregando membros da Curseduca…
            </div>
          ) : erro ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6" /> {erro}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Search className="h-6 w-6 opacity-40" /> Nenhum membro encontrado.
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/40 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr className="border-b">
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Cód</th>
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell">Situação</th>
                  <th className="whitespace-nowrap px-5 py-3 font-medium">Entrada</th>
                  <th className="whitespace-nowrap px-5 py-3 font-medium">Expiração</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30">
                    <td className="hidden px-5 py-4 align-middle text-[13px] tabular-nums text-muted-foreground sm:table-cell">{m.id}</td>
                    <td className="max-w-[300px] px-5 py-4 align-middle">
                      <div className="truncate font-semibold text-foreground">{m.nome || '—'}</div>
                      <div className="truncate text-[13px] text-muted-foreground">
                        {m.email ?? <span className="text-amber-600 dark:text-amber-400">sem e-mail</span>}
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 align-middle lg:table-cell"><SituacaoBadge s={m.situacao} /></td>
                    <td className="whitespace-nowrap px-5 py-4 align-middle">
                      <div className="text-[13px] text-foreground">{fmtDia(m.entrouEm ?? m.criadoEm)}</div>
                      <div className="text-[11px] tabular-nums text-muted-foreground">{fmtHora(m.entrouEm ?? m.criadoEm)}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 align-middle text-[13px] font-medium"><ExpiracaoTexto m={m} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Prévia direto da Curseduca. Ao importar, quem já existe no sistema não é duplicado.</p>
      </DialogContent>
    </Dialog>
  )
}

function Chip({ ativo, onClick, icon, children }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        ativo ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
      {icon}{children}
    </button>
  )
}
