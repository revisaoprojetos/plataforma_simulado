'use client'

// Aba "Grupos de acesso" do produto (tela ProdutoGrupos.png). Porte FIEL do designer:
//  - tabela master (Grupo de acesso / Conteúdos / Tempo de acesso) + lote + painel de detalhe
//  - modal "Vincular grupo de acesso" em TABELA com colunas por grupo, filtros, banner de aviso e
//    "Criar grupo novo →".
// Reusa salvarGruposAction de /admin/produtos (vincular/desvincular são reais).
// LAZY: monta só quando a aba é aberta e busca SÓ os grupos deste produto; o modal "Vincular" BUSCA grupos
// no servidor (ilike + count + .range, 20 por vez) — nunca recebe a lista inteira de grupos do tenant.
// Membros = contagem real (participação válida). Colunas ainda sem dado no backend (conteúdos / tempo de
// acesso / comunidade) = placeholder "—". Editar/Ver membros/Abrir levam ao grupo ESPECÍFICO (/admin/grupos/[id]).

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  KeyRound, Link2, Plus, Loader2, Search, Unlink, Users, Pencil, ExternalLink, MoreVertical,
  ChevronDown, AlertTriangle, FileStack, Globe,
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
import { salvarGruposAction, lerAcessoGratuitoProdutoAction, definirAcessoGratuitoProdutoAction } from '@/app/admin/produtos/actions'
import { carregarGruposDoProdutoAction, buscarRecursosAction } from './lazy-actions'

type Grupo = { id: string; nome: string; membros?: number | null }
const urlGrupo = (id: string) => `/admin/grupos/${id}`
const fmtMembros = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'))

export function AbaGrupos({ produtoId, podeEditar }: {
  produtoId: string; podeEditar: boolean
}) {
  const router = useRouter()
  // Grupos VINCULADOS a este produto (id + nome) — única carga da aba; null = carregando.
  const [ligadosRows, setLigadosRows] = useState<Grupo[] | null>(null)
  const [vincular, setVincular] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  function recarregar(manterSel = false) {
    return carregarGruposDoProdutoAction(produtoId)
      .then((r) => { const g = ('ok' in r ? r.grupos : []) ?? []; setLigadosRows(g); setSel((cur) => (manterSel && cur && g.some((x) => x.id === cur) ? cur : g[0]?.id ?? null)) })
      .catch(() => setLigadosRows((cur) => cur ?? []))
  }
  useEffect(() => { recarregar() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId])
  // Vínculo automático feito pelo modal de Segmentos: atualiza a lista de grupos desta aba.
  useEffect(() => { const h = () => { void recarregar(true) }; window.addEventListener('produto-acesso-mudou', h); return () => window.removeEventListener('produto-acesso-mudou', h) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId])

  const lista = ligadosRows ?? []
  const ligados = lista.map((g) => g.id)
  const selGrupo = sel ? (lista.find((g) => g.id === sel) ?? null) : null

  /** Persiste o conjunto final de ids; nomes resolve o nome dos recém-vinculados (vindos da busca). */
  function persistir(novos: string[], msg: string, nomes: Record<string, string> = {}) {
    start(async () => {
      const r = await salvarGruposAction(produtoId, novos)
      if ('error' in r && r.error) { toast.error(r.error); return }
      const atuais = new Map(lista.map((g) => [g.id, g.nome]))
      setLigadosRows(novos.map((id) => ({ id, nome: atuais.get(id) ?? nomes[id] ?? '(grupo)', membros: undefined })))
      setMarcados(new Set()); toast.success(msg); router.refresh()
      void recarregar(true) // traz a contagem de membros dos recém-vinculados
    })
  }
  async function desvincular(g: Grupo) {
    if (!(await confirmar({ titulo: 'Desvincular grupo', mensagem: `Desvincular "${g.nome}" deste produto? O acesso que só este vínculo concede deixa de ser garantido.`, confirmar: 'Desvincular', destrutivo: true }))) return
    persistir(ligados.filter((x) => x !== g.id), 'Grupo desvinculado.')
  }
  async function desvincularMarcados() {
    if (!marcados.size) return
    if (!(await confirmar({ titulo: 'Desvincular selecionados', mensagem: `Desvincular ${marcados.size} grupo(s) deste produto?`, confirmar: 'Desvincular', destrutivo: true }))) return
    persistir(ligados.filter((x) => !marcados.has(x)), 'Grupos desvinculados.')
  }
  const toggle = (id: string) => setMarcados((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleTodos = () => setMarcados((p) => p.size === ligados.length ? new Set() : new Set(ligados))

  function menuGrupo(g: Grupo) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Ações do grupo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground data-popup-open:bg-muted"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(urlGrupo(g.id))}><Pencil className="h-4 w-4" />Editar grupo</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(urlGrupo(g.id))}><Users className="h-4 w-4" />Ver membros</DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open(urlGrupo(g.id), '_blank', 'noopener')}><ExternalLink className="h-4 w-4" />Abrir grupo</DropdownMenuItem>
          {podeEditar && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => desvincular(g)}><Unlink className="h-4 w-4" />Desvincular</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="space-y-4">
      <LiberarParaTodos produtoId={produtoId} podeEditar={podeEditar} />
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {podeEditar && <Button onClick={() => setVincular(true)} disabled={ligadosRows === null}><Link2 className="h-4 w-4" />Vincular grupo de acesso</Button>}
        {podeEditar && <Button variant="outline" onClick={() => router.push('/admin/grupos')}><Plus className="h-4 w-4" />Criar grupo de acesso para este produto</Button>}
        <span className="text-sm text-muted-foreground">Um produto pode estar em vários grupos, e um grupo pode ter vários produtos.</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(300px,360px)]">
        {/* Master */}
        <div className="space-y-3">
          {/* Lote */}
          <div className="flex h-12 items-center gap-3 rounded-lg border bg-card px-3 text-sm">
            {marcados.size === 0 ? (
              <span className="text-muted-foreground"><span className="font-medium text-foreground">{ligados.length}</span> {ligados.length === 1 ? 'grupo' : 'grupos'} · marque uma ou mais linhas para agir em lote</span>
            ) : (
              <>
                <span className="font-medium text-foreground">{marcados.size} selecionado{marcados.size === 1 ? '' : 's'}</span>
                <button type="button" onClick={() => setMarcados(new Set())} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar</button>
                {podeEditar && <Button size="sm" variant="destructive" className="ml-auto" onClick={desvincularMarcados} disabled={pending}><Unlink className="h-4 w-4" />Desvincular</Button>}
              </>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup><col style={{ width: '2.75rem' }} /><col /><col style={{ width: '7rem' }} /><col style={{ width: '9rem' }} /><col style={{ width: '3rem' }} /></colgroup>
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">
                    <button type="button" role="checkbox" aria-checked={marcados.size > 0 && marcados.size === ligados.length} aria-label="Marcar todos" disabled={ligados.length === 0} onClick={toggleTodos}
                      className={cn('flex h-4 w-4 items-center justify-center rounded border', marcados.size && marcados.size === ligados.length ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {marcados.size > 0 && marcados.size === ligados.length ? '✓' : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Grupo de acesso</th>
                  <th className="px-3 py-2.5 text-left font-medium">Conteúdos</th>
                  <th className="px-3 py-2.5 text-left font-medium">Tempo de acesso</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {ligadosRows === null ? (
                  <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</span></td></tr>
                ) : ligados.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-12 text-center text-sm text-muted-foreground">Nenhum grupo vinculado. Use “Vincular grupo de acesso”.</td></tr>
                ) : lista.map((g) => {
                  const marcada = marcados.has(g.id)
                  return (
                    <tr key={g.id} className={cn('border-b last:border-0 transition-colors hover:bg-muted/40', (sel === g.id || marcada) && 'bg-primary/5')}>
                      <td className="px-3 align-middle">
                        <button type="button" role="checkbox" aria-checked={marcada} aria-label="Selecionar" onClick={() => toggle(g.id)}
                          className={cn('flex h-4 w-4 items-center justify-center rounded border', marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-muted-foreground')}>{marcada ? '✓' : ''}</button>
                      </td>
                      <td className="px-3 align-middle">
                        <button type="button" onClick={() => setSel(g.id)} className="flex w-full items-center gap-2.5 py-2 text-left">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-4 w-4" /></span>
                          <span className="min-w-0"><span className="block truncate text-sm font-medium">{g.nome}</span><span className="block truncate text-xs text-muted-foreground">Grupo de acesso · {g.membros === undefined ? '…' : `${fmtMembros(g.membros)} ${g.membros === 1 ? 'membro' : 'membros'}`}</span></span>
                        </button>
                      </td>
                      <td className="px-3 align-middle text-muted-foreground">—</td>
                      <td className="px-3 align-middle text-muted-foreground">—</td>
                      <td className="px-3 text-right align-middle">{menuGrupo(g)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detalhe */}
        <aside className="rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
          {!selGrupo ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"><KeyRound className="h-7 w-7 opacity-40" />Clique num grupo para ver os detalhes.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></span>
                <div className="min-w-0"><div className="truncate font-semibold">{selGrupo.nome}</div><div className="text-xs text-muted-foreground">Grupo de acesso</div></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border bg-background p-3"><div className="text-xl font-bold tabular-nums">{selGrupo.membros === undefined ? '…' : fmtMembros(selGrupo.membros)}</div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />membros</div></div>
                <div className="rounded-xl border bg-background p-3"><div className="text-xl font-bold tabular-nums">—</div><div className="flex items-center gap-1 text-xs text-muted-foreground"><FileStack className="h-3 w-3" />conteúdos</div></div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acesso</div>
                <dl className="divide-y text-sm">
                  <L k="Tempo de acesso" v="—" />
                  <L k="Libera também" v="—" />
                  <L k="Área de membros" v="—" />
                  <L k="Integrações" v="—" />
                </dl>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que este produto ganha</div>
                <p className="text-xs text-muted-foreground">Todos os membros do grupo veem este produto na vitrine e no ambiente de aulas, conforme a visibilidade escolhida em Informações.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => router.push(urlGrupo(selGrupo.id))}><Pencil className="h-4 w-4" />Editar grupo</Button>
                <Button variant="outline" size="sm" onClick={() => router.push(urlGrupo(selGrupo.id))}><Users className="h-4 w-4" />Ver membros</Button>
                {podeEditar && <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => desvincular(selGrupo)} disabled={pending}><Unlink className="h-4 w-4" />Desvincular</Button>}
                <Button variant="outline" size="sm" onClick={() => window.open(urlGrupo(selGrupo.id), '_blank', 'noopener')}><ExternalLink className="h-4 w-4" />Abrir grupo</Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {vincular && ligadosRows && (
        <VincularDialog ligadosRows={ligadosRows} onClose={() => setVincular(false)}
          onConfirmar={(novos, nomes) => persistir(novos, 'Grupos vinculados.', nomes)} pending={pending}
          onCriarGrupo={() => router.push('/admin/grupos')} />
      )}
    </div>
  )
}

function L({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
}

// ───────────────────────── Modal: Vincular grupo (tabela) ─────────────────────────
function VincularDialog({ ligadosRows, onClose, onConfirmar, pending, onCriarGrupo }: {
  ligadosRows: Grupo[]; onClose: () => void; onConfirmar: (ids: string[], nomes: Record<string, string>) => void; pending: boolean; onCriarGrupo: () => void
}) {
  const ligados = ligadosRows.map((g) => g.id)
  const [sel, setSel] = useState<Set<string>>(new Set(ligados))
  const nomes = useRef<Record<string, string>>(Object.fromEntries(ligadosRows.map((g) => [g.id, g.nome])))
  const [q, setQ] = useState('')
  const [soVinculados, setSoVinculados] = useState(false)
  // Resultado da BUSCA no servidor (20 por página). Nada de lista completa em memória.
  const [rows, setRows] = useState<Grupo[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(true)
  const seq = useRef(0)

  function buscar(pg: number, anexar: boolean) {
    const mine = ++seq.current
    setBuscando(true)
    buscarRecursosAction('grupo', q, pg, soVinculados ? ligados : undefined)
      .then((r) => {
        if (mine !== seq.current) return
        const novos: Grupo[] = ('ok' in r ? r.rows : []) as Grupo[]
        for (const g of novos) nomes.current[g.id] = g.nome
        setRows((cur) => (anexar ? [...cur, ...novos] : novos)); setTotal('ok' in r ? r.total : 0); setPagina(pg)
      })
      .catch(() => { if (mine === seq.current) { setRows([]); setTotal(0) } })
      .finally(() => { if (mine === seq.current) setBuscando(false) })
  }
  // Debounce 250ms ao digitar / trocar o filtro; 1ª carga imediata.
  useEffect(() => {
    const t = setTimeout(() => buscar(1, false), q ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, soVinculados])

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const tiraAlgum = ligados.some((id) => !sel.has(id))

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="w-[min(900px,calc(100vw-2rem))] max-w-[min(900px,calc(100vw-2rem))] sm:max-w-[min(900px,calc(100vw-2rem))]">
        <div className="text-xs text-muted-foreground">Produto › Grupos de acesso</div>
        <DialogTitle>Vincular grupo de acesso</DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">Quem estiver nos grupos marcados recebe este produto.</p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo" className="pl-8" />
          </div>
          <button type="button" disabled title="Em breve" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium text-muted-foreground opacity-70">Tempo de acesso <ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setSoVinculados((v) => !v)} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium', soVinculados ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted')}>Já vinculados <ChevronDown className="h-3.5 w-3.5" /></button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto rounded-xl border">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup><col style={{ width: '2.75rem' }} /><col /><col style={{ width: '7rem' }} /><col style={{ width: '6rem' }} /><col style={{ width: '8rem' }} /></colgroup>
            <tbody>
              {buscando && rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</span></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Nenhum grupo.</td></tr>
              ) : rows.map((g) => {
                const marcada = sel.has(g.id)
                return (
                  <tr key={g.id} className={cn('border-b last:border-0 hover:bg-muted/40', marcada && 'bg-primary/5')}>
                    <td className="px-3 py-2.5 align-middle">
                      <button type="button" role="checkbox" aria-checked={marcada} aria-label="Selecionar" onClick={() => toggle(g.id)}
                        className={cn('flex h-4 w-4 items-center justify-center rounded border', marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-muted-foreground')}>{marcada ? '✓' : ''}</button>
                    </td>
                    <td className="px-3 py-2.5 align-middle"><span className="block truncate font-medium">{g.nome}</span></td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">—</td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">—</td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">—</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Mostrando {rows.length} de {total} grupos</span>
          {rows.length < total && <Button variant="ghost" size="sm" onClick={() => buscar(pagina + 1, true)} disabled={buscando}>{buscando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Carregar mais</Button>}
        </div>

        {tiraAlgum && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="font-medium">Desmarcar um grupo tira o produto dos alunos dele na hora. O sistema pede confirmação antes de salvar.</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onCriarGrupo} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Criar grupo novo <ChevronDown className="h-4 w-4 -rotate-90" /></button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button onClick={() => onConfirmar([...sel], nomes.current)} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar vínculos</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Liberar para todos os alunos da plataforma" — o mesmo recurso do simulado (aba Estudantes). Ligado,
 * TODO aluno do tenant vê o produto em "Meus Extensivos" e acessa o conteúdo, sem assinatura nem grupo;
 * os grupos vinculados abaixo continuam valendo (não precisam ser removidos).
 */
function LiberarParaTodos({ produtoId, podeEditar }: { produtoId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<{ valor: boolean; disponivel: boolean; alunos: number | null } | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    lerAcessoGratuitoProdutoAction(produtoId)
      .then((r) => setEstado('error' in r ? { valor: false, disponivel: false, alunos: null } : { valor: r.valor, disponivel: r.disponivel, alunos: r.alunos }))
      .catch(() => setEstado({ valor: false, disponivel: false, alunos: null }))
  }, [produtoId])

  async function alternar(v: boolean) {
    if (!estado) return
    if (v && !(await confirmar({ titulo: 'Liberar para todos os alunos?', mensagem: `Todos os alunos da plataforma${estado.alunos ? ` (${estado.alunos.toLocaleString('pt-BR')})` : ''} passam a ver este produto e o conteúdo dele, sem precisar de grupo ou assinatura.`, confirmar: 'Liberar para todos' }))) return
    setSalvando(true)
    const anterior = estado.valor
    setEstado({ ...estado, valor: v })
    const r = await definirAcessoGratuitoProdutoAction(produtoId, v).catch(() => ({ error: 'Falha ao salvar.' }))
    setSalvando(false)
    if (r && 'error' in r && r.error) { setEstado((e) => (e ? { ...e, valor: anterior } : e)); toast.error(r.error); return }
    toast.success(v ? 'Produto liberado para todos os alunos' : 'Acesso voltou a ser só por grupo/assinatura')
  }

  const ligado = !!estado?.valor
  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm transition-colors', ligado ? 'border-primary/40 bg-primary/5' : 'bg-card')}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Globe className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="produto-acesso-gratuito" className="cursor-pointer text-sm font-semibold">Liberar para todos os alunos da plataforma</label>
            {estado === null || salvando
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : <Switch id="produto-acesso-gratuito" checked={ligado} disabled={!podeEditar || !estado.disponivel} onCheckedChange={(v) => alternar(!!v)} />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {ligado
              ? <>Todos os alunos cadastrados{estado?.alunos ? <> (<strong>{estado.alunos.toLocaleString('pt-BR')}</strong>)</> : null} veem este produto e o conteúdo dele — <strong>sem precisar de grupo ou assinatura</strong>. Os grupos abaixo continuam valendo.</>
              : <>Todos os alunos cadastrados poderão acessar este produto — <strong>sem precisar vincular grupos ou estudantes</strong>.</>}
          </p>
          {estado && !estado.disponivel && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />Recurso ainda não ativado no banco: aplique a migração <code>20261103120000_produto_acesso_gratuito.sql</code>.</p>
          )}
        </div>
      </div>
    </div>
  )
}
