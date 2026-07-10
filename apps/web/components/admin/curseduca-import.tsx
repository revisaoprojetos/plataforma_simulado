'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, Users, Loader2, DownloadCloud, Check, CheckCircle2, FolderPlus, Folder, Ban, ArrowUpDown, ListFilter, X, Layers, Eye, Mail, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { contarMembrosGrupos, contarTodosGrupos, importarGruposCurseduca, previewMembrosGrupo, type GrupoCurseducaDTO, type GrupoSistema, type ResultadoImportCurseduca, type MembroPreview } from '@/app/admin/curseduca/actions'

type Destino = 'nenhum' | 'existente' | 'novo'
type Ordem = 'nome' | 'nome_desc' | 'id' | 'id_desc' | 'recentes'

const ORDENS: { valor: Ordem; label: string }[] = [
  { valor: 'nome', label: 'Nome (A → Z)' },
  { valor: 'nome_desc', label: 'Nome (Z → A)' },
  { valor: 'recentes', label: 'Mais recentes' },
  { valor: 'id', label: 'Código (menor)' },
  { valor: 'id_desc', label: 'Código (maior)' },
]

const ehDesatualizado = (nome: string) => /desatualizad/i.test(nome)

export function CurseducaImport({ grupos, sistema }: { grupos: GrupoCurseducaDTO[]; sistema: GrupoSistema[] }) {
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('id_desc')
  const [soSelecionados, setSoSelecionados] = useState(false)
  const [ocultarDesatualizados, setOcultarDesatualizados] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [total, setTotal] = useState<number | null>(null)
  const [contando, setContando] = useState(false)
  const [destino, setDestino] = useState<Destino>('nenhum')
  const [grupoId, setGrupoId] = useState('')
  const [nomeNovo, setNomeNovo] = useState('')
  const [importando, setImportando] = useState(false)
  const [res, setRes] = useState<ResultadoImportCurseduca | null>(null)
  const [verGrupo, setVerGrupo] = useState<GrupoCurseducaDTO | null>(null)
  const [contagens, setContagens] = useState<Record<number, number>>({})
  const [contandoTudo, setContandoTudo] = useState(true)

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

  // Conta membros (com debounce) quando a seleção muda.
  useEffect(() => {
    setTotal(null); setRes(null)
    if (sel.size === 0) return
    const t = setTimeout(async () => {
      setContando(true)
      const r = await contarMembrosGrupos([...sel])
      setContando(false)
      if (r.ok) setTotal(r.total ?? 0)
    }, 600)
    return () => clearTimeout(t)
  }, [sel])

  // Sugere o nome do novo grupo a partir do grupo selecionado.
  useEffect(() => {
    if (destino === 'novo' && !nomeNovo && sel.size === 1) {
      const g = grupos.find((x) => x.id === [...sel][0])
      if (g) setNomeNovo(g.nome)
    }
  }, [destino, sel, grupos, nomeNovo])

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selecionarFiltrados = () => setSel((s) => { const n = new Set(s); filtrados.forEach((g) => n.add(g.id)); return n })
  const limpar = () => setSel(new Set())

  async function importar() {
    if (!sel.size) return
    if (destino === 'existente' && !grupoId) { toast.error('Escolha o grupo de destino.'); return }
    if (destino === 'novo' && !nomeNovo.trim()) { toast.error('Informe o nome do novo grupo.'); return }
    setImportando(true); setRes(null)
    const r = await importarGruposCurseduca([...sel], { tipo: destino, grupoId: grupoId || undefined, nomeNovo: nomeNovo || undefined })
    setImportando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha na importação.'); return }
    setRes(r)
    toast.success(`${r.novos ?? 0} novo(s) · ${r.jaExistiam ?? 0} já existia(m)${r.vinculados ? ` · ${r.vinculados} vinculado(s)` : ''}`)
  }

  const temFiltro = !!q || soSelecionados || ocultarDesatualizados

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Lista de grupos da Curseduca */}
      <div className="animate-rise overflow-hidden rounded-2xl border bg-card">
        {/* barra de busca + ordenação */}
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

        {/* chips de filtro */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ListFilter className="h-3.5 w-3.5" /> Filtros:</span>
          <Chip ativo={soSelecionados} onClick={() => setSoSelecionados((v) => !v)} icon={<Check className="h-3 w-3" />}>Só selecionados ({sel.size})</Chip>
          <Chip ativo={ocultarDesatualizados} onClick={() => setOcultarDesatualizados((v) => !v)} icon={<Ban className="h-3 w-3" />}>Ocultar desatualizados</Chip>
          {temFiltro && <button type="button" onClick={() => { setQ(''); setSoSelecionados(false); setOcultarDesatualizados(false) }} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar filtros</button>}
        </div>

        {/* contador + selecionar/limpar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Exibindo <b className="tabular-nums text-foreground">{filtrados.length}</b> de {grupos.length}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={selecionarFiltrados} className="rounded-md border px-2.5 py-1 font-medium text-foreground transition hover:bg-muted">Selecionar exibidos</button>
            {sel.size > 0 && <button type="button" onClick={limpar} className="rounded-md px-2.5 py-1 hover:text-foreground">Limpar</button>}
          </div>
        </div>

        {/* lista */}
        <div className="scroll-claro stagger max-h-[calc(100vh-20rem)] min-h-[24rem] overflow-y-auto p-2">
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
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setVerGrupo(g) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setVerGrupo(g) } }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition hover:bg-primary/10 hover:text-primary focus:opacity-100 group-hover:opacity-100"
                  title="Ver membros do grupo"
                >
                  <Eye className="h-3.5 w-3.5" /> Ver
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">#{g.id}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel de importação */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="animate-pop relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Grupos selecionados</span>
            <span className="bg-gradient-to-br from-primary to-violet-500 bg-clip-text text-3xl font-bold tabular-nums text-transparent">{sel.size}</span>
          </div>
          <div className="relative mt-2 flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            {sel.size === 0 ? <span className="text-muted-foreground">Selecione um ou mais grupos</span>
              : contando ? <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> contando membros…</span>
              : <span><b className="tabular-nums text-foreground">{total ?? '—'}</b> membro(s) a analisar</span>}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Destino dos alunos</p>
          <div className="space-y-1.5">
            <Opcao ativo={destino === 'nenhum'} onClick={() => setDestino('nenhum')} icon={<Ban className="h-4 w-4" />} titulo="Só adicionar ao sistema" desc="Cadastra os alunos (sem vincular a grupo)." />
            <Opcao ativo={destino === 'existente'} onClick={() => setDestino('existente')} icon={<Folder className="h-4 w-4" />} titulo="Vincular a um grupo existente" desc={sistema.length ? undefined : 'Nenhum grupo criado ainda.'} />
            {destino === 'existente' && (
              <Select value={grupoId} onValueChange={(v) => setGrupoId(v ?? '')}>
                <SelectTrigger className="ml-7 h-9 w-[calc(100%-1.75rem)]">
                  <SelectValue placeholder="Escolha o grupo…">
                    {(value: string) => (value ? sistema.find((s) => s.id === value)?.nome : null) ?? 'Escolha o grupo…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sistema.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Opcao ativo={destino === 'novo'} onClick={() => setDestino('novo')} icon={<FolderPlus className="h-4 w-4" />} titulo="Criar um novo grupo" desc="Cria um grupo daqui e vincula todos." />
            {destino === 'novo' && (
              <input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Nome do novo grupo"
                className="ml-7 w-[calc(100%-1.75rem)] rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            )}
          </div>
        </div>

        <button type="button" onClick={importar} disabled={sel.size === 0 || importando}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:shadow-primary/40 disabled:opacity-60 disabled:shadow-none">
          {importando ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando…</> : <><DownloadCloud className="h-4 w-4 transition-transform group-hover:translate-y-0.5" /> Importar membros</>}
        </button>

        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          Traz nome, e-mail, CPF, telefone e classificação (passaporte/assinatura). <b>Data de nascimento</b> não é disponibilizada pela Curseduca — cadastre manualmente ou por planilha, se precisar.
        </p>

        {res && (
          <div className="animate-pop rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Importação concluída</div>
            <ul className="space-y-1 text-sm">
              <li><b className="tabular-nums">{res.total}</b> analisado(s)</li>
              <li><b className="tabular-nums text-emerald-600 dark:text-emerald-400">{res.novos}</b> novo(s) cadastrado(s)</li>
              <li><b className="tabular-nums">{res.jaExistiam}</b> já existia(m) — não duplicado(s)</li>
              {!!res.atualizados && <li><b className="tabular-nums text-sky-600 dark:text-sky-400">{res.atualizados}</b> atualizado(s) (CPF/telefone/classificação)</li>}
              {res.grupoNome && <li><b className="tabular-nums">{res.vinculados}</b> vinculado(s) ao grupo “{res.grupoNome}”</li>}
              {!!res.semIdentificador && <li className="text-amber-600 dark:text-amber-400">{res.semIdentificador} sem e-mail (ignorado[s])</li>}
              {!!res.semDetalhe && <li className="text-amber-600 dark:text-amber-400">{res.semDetalhe} detalhe(s) falharam (CPF/telefone podem faltar — tente reimportar)</li>}
              {!!res.restante && <li className="text-sky-600 dark:text-sky-400">{res.restante} sem detalhe (limite por importação) — <b>reimporte o grupo</b> para completar CPF/telefone</li>}
            </ul>
          </div>
        )}
      </div>

      <MembrosDialog grupo={verGrupo} onClose={() => setVerGrupo(null)}
        selecionado={verGrupo ? sel.has(verGrupo.id) : false}
        onToggle={(id) => toggle(id)} />
    </div>
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

/** Expiração como texto simples (estilo Curseduca): "Vitalício" / "Até dd/mm/aaaa" / "Expirado…". */
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

        {/* resumo + busca */}
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

        {/* corpo */}
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

function Opcao({ ativo, onClick, icon, titulo, desc }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; titulo: string; desc?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition', ativo ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-muted-foreground')}>
        {ativo ? <Check className="h-3 w-3" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{titulo}</span>
        {desc && <span className="block text-xs text-muted-foreground">{desc}</span>}
      </span>
    </button>
  )
}
