'use client'

// Aba "Conteúdos" do produto (tela ProdutoConteudos): currículo leve por referência.
// Árvore módulo → (submódulo) → aulas que APONTAM a recursos existentes. Painel de detalhe à direita.
// LAZY: monta só na 1ª abertura da aba e busca o PRÓPRIO currículo (carregarCurriculoAction). Busca por título
// e filtro de tipo rodam NO BANCO (ilike / tipo_ref in) com debounce — o cliente só agrupa e exibe.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Plus, FileStack, Search, ChevronDown, ChevronRight, GripVertical, Pencil, MoreVertical,
  FolderPlus, Trash2, Shuffle, FolderInput, Copy, CalendarClock, Layers, Eye, Paperclip, Lock, Download, Droplets,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  SUBTIPO_LABEL, TIPO_REF_LABEL, SUBTIPOS, resumoDisponibilidade, type ModuloRow, type ItemRow, type TipoRef, type Disponibilidade,
} from '@/lib/produtos/curriculo'
import { excluirItemAction, salvarItemAction, reordenarItensAction, reordenarModulosAction } from '../actions'
import { carregarCurriculoAction } from './lazy-actions'
import {
  ModuloDialog, NovoConteudoDialog, EditarItemDialog, DisponibilidadeDialog,
  MoverAulaDialog, DuplicarAulaDialog, AlterarTipoDialog, iconeTipoRef,
} from './conteudo-modais'

// Lista fixa de "Tipos de conteúdo" (rodapé do painel de detalhe) — espelha o designer.
const TIPOS_CONTEUDO_LISTA = SUBTIPOS.filter((s) => s.grupo === 'plataforma').map((s) => s.nome)

// Destaque de drop (linha da cor primária no topo/base do alvo) — ligado via atributo data-drop.
const DROP_CLS = 'data-[drop=top]:shadow-[inset_0_2px_0_0_var(--primary)] data-[drop=bottom]:shadow-[inset_0_-2px_0_0_var(--primary)]'

type Filtro = 'todos' | 'arquivo' | 'video' | 'outros'

type ItemEdit = { item: Partial<ItemRow> & { tipo_ref: TipoRef; subtipo?: string | null; modulo_id: string }; criar: boolean }

export function AbaConteudos({ tenantId, produtoId, podeEditar }: {
  tenantId: string; produtoId: string; podeEditar: boolean
}) {
  const router = useRouter()

  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  // Dados da aba (lazy): módulos = árvore completa do produto; itens = já filtrados pelo servidor.
  const [modulos, setModulos] = useState<ModuloRow[]>([])
  const [itens, setItens] = useState<ItemRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const seq = useRef(0)
  const buscaRef = useRef(busca); buscaRef.current = busca
  const filtroRef = useRef(filtro); filtroRef.current = filtro
  function carregar() {
    const mine = ++seq.current
    setCarregando(true)
    carregarCurriculoAction(produtoId, { q: buscaRef.current, filtro: filtroRef.current })
      .then((r) => { if (mine === seq.current && r.ok) { setModulos(r.modulos); setItens(r.itens) } })
      .catch(() => { if (mine === seq.current) toast.error('Falha ao carregar o currículo.') })
      .finally(() => { if (mine === seq.current) setCarregando(false) })
  }
  // 1ª carga imediata; busca/filtro com debounce de 250ms (a consulta roda no banco).
  useEffect(() => {
    const t = setTimeout(carregar, busca || filtro !== 'todos' ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, filtro, produtoId])
  // Após mutações: recarrega o currículo local e atualiza as contagens das abas (page leve).
  const refresh = () => { carregar(); router.refresh() }

  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<ItemRow | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const toggleMarcado = (id: string) => setMarcados((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  // modais
  const [moduloDlg, setModuloDlg] = useState<{ modulo: ModuloRow | null; paiId: string | null } | null>(null)
  const [novoConteudo, setNovoConteudo] = useState<{ moduloPadrao: string | null } | null>(null)
  const [editarItem, setEditarItem] = useState<ItemEdit | null>(null)
  const [moverItem, setMoverItem] = useState<ItemRow | null>(null)
  const [duplicarItem, setDuplicarItem] = useState<ItemRow | null>(null)
  const [alterarTipo, setAlterarTipo] = useState<ItemRow | null>(null)
  const [dispItem, setDispItem] = useState<ItemRow | null>(null)

  // Reordenação por arrasto (HTML5 nativo). `ovr` = ordem otimista local (id -> posição); limpa quando o servidor devolve dados.
  const [ovr, setOvr] = useState<Record<string, number>>({})
  useEffect(() => { setOvr({}) }, [modulos, itens])
  const dragRef = useRef<{ kind: 'aula' | 'mod'; id: string; grupo: string } | null>(null)
  const podeArrastar = podeEditar && !busca.trim() && filtro === 'todos'
  const ord = (id: string, o: number) => ovr[id] ?? o

  function posicao(e: React.DragEvent, el: HTMLElement): 'top' | 'bottom' {
    const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 ? 'top' : 'bottom'
  }
  // Props de alvo de drop (e de origem, se `fonte`). Usa atributo DOM p/ destaque, sem re-renderizar durante o arrasto.
  function dnd(kind: 'aula' | 'mod', id: string, grupo: string, irmaos: string[], persistir: (ids: string[]) => Promise<{ error?: string } | { ok: true }>, fonte: boolean) {
    if (!podeArrastar) return {}
    const compat = () => !!dragRef.current && dragRef.current.kind === kind && dragRef.current.grupo === grupo && dragRef.current.id !== id
    return {
      ...(fonte ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => { e.stopPropagation(); dragRef.current = { kind, id, grupo }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) },
        onDragEnd: () => { dragRef.current = null },
      } : {}),
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        if (!compat()) return
        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'
        e.currentTarget.setAttribute('data-drop', posicao(e, e.currentTarget))
      },
      onDragLeave: (e: React.DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.removeAttribute('data-drop') },
      onDrop: async (e: React.DragEvent<HTMLElement>) => {
        if (!compat()) return
        e.preventDefault(); e.stopPropagation()
        const pos = posicao(e, e.currentTarget); e.currentTarget.removeAttribute('data-drop')
        const src = dragRef.current!.id; dragRef.current = null
        const base = irmaos.filter((x) => x !== src)
        base.splice(base.indexOf(id) + (pos === 'bottom' ? 1 : 0), 0, src)
        if (base.join() === irmaos.join()) return
        setOvr((p) => { const n = { ...p }; base.forEach((x, i) => { n[x] = i }); return n })
        const r = await persistir(base)
        if ('error' in r && r.error) { toast.error(r.error); setOvr({}) }
        refresh()
      },
    }
  }

  const topo = useMemo(() => modulos.filter((m) => !m.pai_id).sort((a, b) => ord(a.id, a.ordem) - ord(b.id, b.ordem)), [modulos, ovr]) // eslint-disable-line react-hooks/exhaustive-deps
  // Só AGRUPA por módulo (o filtro/ordem de verdade vêm do banco); `ord` aplica apenas a ordem otimista do arrasto.
  const itensPorModulo = useMemo(() => {
    const m = new Map<string, ItemRow[]>()
    for (const it of itens) { const arr = m.get(it.modulo_id) ?? []; arr.push(it); m.set(it.modulo_id, arr) }
    if (Object.keys(ovr).length) for (const arr of m.values()) arr.sort((a, b) => ord(a.id, a.ordem) - ord(b.id, b.ordem))
    return m
  }, [itens, ovr]) // eslint-disable-line react-hooks/exhaustive-deps
  const subsPorPai = useMemo(() => {
    const m = new Map<string, ModuloRow[]>()
    for (const mod of modulos) if (mod.pai_id) { const arr = m.get(mod.pai_id) ?? []; arr.push(mod); m.set(mod.pai_id, arr) }
    for (const arr of m.values()) arr.sort((a, b) => ord(a.id, a.ordem) - ord(b.id, b.ordem))
    return m
  }, [modulos, ovr]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setRecolhidos((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const expandirTudo = () => setRecolhidos(recolhidos.size ? new Set() : new Set(modulos.map((m) => m.id)))

  async function excluirAula(it: ItemRow) {
    if (!(await confirmar({ titulo: 'Excluir aula', mensagem: `Excluir "${it.titulo}"? A referência ao recurso é removida; o recurso original (documento/simulado) continua.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await excluirItemAction(it.id, produtoId)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success('Aula excluída.'); if (sel?.id === it.id) setSel(null); refresh()
  }
  async function excluirMarcados() {
    const alvos = itens.filter((it) => marcados.has(it.id))
    if (!alvos.length) return
    if (!(await confirmar({ titulo: 'Excluir selecionadas', mensagem: `Excluir ${alvos.length} aula(s)? A referência ao recurso é removida; os recursos originais continuam.`, confirmar: 'Excluir', destrutivo: true }))) return
    for (const it of alvos) { const r = await excluirItemAction(it.id, produtoId); if ('error' in r && r.error) toast.error(`${it.titulo}: ${r.error}`) }
    toast.success('Concluído.'); setMarcados(new Set()); setSel(null); refresh()
  }
  const totalVisiveis = useMemo(() => [...itensPorModulo.values()].reduce((a, b) => a + b.length, 0), [itensPorModulo])
  function menuAula(it: ItemRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Ações da aula" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground data-popup-open:bg-muted"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditarItem({ item: it, criar: false })}><Pencil className="h-4 w-4" />Editar conteúdo</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAlterarTipo(it)}><Shuffle className="h-4 w-4" />Alterar tipo da aula</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoverItem(it)}><FolderInput className="h-4 w-4" />Mover aula</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDuplicarItem(it)}><Copy className="h-4 w-4" />Duplicar aula</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDispItem(it)}><CalendarClock className="h-4 w-4" />Configurar disponibilidade</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => excluirAula(it)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function LinhaAula({ it, irmaos }: { it: ItemRow; irmaos: string[] }) {
    const ativa = sel?.id === it.id
    const marcada = marcados.has(it.id)
    return (
      <div {...dnd('aula', it.id, `aula:${it.modulo_id}`, irmaos, (ids) => reordenarItensAction(produtoId, it.modulo_id, ids), true)}
        className={cn('flex items-center gap-2 border-b px-3 py-2 last:border-0 hover:bg-muted/40', DROP_CLS, (ativa || marcada) && 'bg-primary/5')}>
        {podeEditar && (
          <button type="button" role="checkbox" aria-checked={marcada} aria-label="Selecionar aula" onClick={() => toggleMarcado(it.id)}
            className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-muted-foreground')}>{marcada ? '✓' : ''}</button>
        )}
        <GripVertical className={cn('h-4 w-4 shrink-0 text-muted-foreground/60', podeArrastar && 'cursor-grab active:cursor-grabbing')} aria-hidden />
        <button type="button" onClick={() => setSel(it)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{iconeTipoRef(it.tipo_ref)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{it.titulo}</span>
            <span className="block truncate text-xs text-muted-foreground">{SUBTIPO_LABEL[it.subtipo ?? ''] ?? TIPO_REF_LABEL[it.tipo_ref]} · {resumoDisponibilidade(it.disponibilidade)}</span>
          </span>
        </button>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', it.situacao === 'ativo' ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{it.situacao === 'ativo' ? 'Ativo' : 'Rascunho'}</span>
        {podeEditar && <><Button variant="ghost" size="sm" onClick={() => setEditarItem({ item: it, criar: false })}><Pencil className="h-4 w-4" />Editar</Button>{menuAula(it)}</>}
      </div>
    )
  }

  function Modulo({ mod, nivel, irmaosMod }: { mod: ModuloRow; nivel: number; irmaosMod: string[] }) {
    const grupoMod = `mod:${mod.pai_id ?? 'raiz'}`
    const aberto = !recolhidos.has(mod.id)
    const its = itensPorModulo.get(mod.id) ?? []
    const subs = subsPorPai.get(mod.id) ?? []
    return (
      <div {...dnd('mod', mod.id, grupoMod, irmaosMod, (ids) => reordenarModulosAction(produtoId, ids), false)}
        className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm', DROP_CLS)} style={{ marginLeft: nivel * 16 }}>
        <div {...(podeArrastar ? { draggable: true, onDragStart: (e: React.DragEvent) => { e.stopPropagation(); dragRef.current = { kind: 'mod', id: mod.id, grupo: grupoMod }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', mod.id) }, onDragEnd: () => { dragRef.current = null } } : {})}
          className={cn('flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5', podeArrastar && 'cursor-grab active:cursor-grabbing')}>
          <button onClick={() => toggle(mod.id)} aria-label={aberto ? 'Recolher' : 'Expandir'} className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground">{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{nivel === 0 ? <Layers className="h-4 w-4" /> : <FileStack className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{mod.titulo}</span><span className="block text-xs text-muted-foreground">{nivel === 0 ? 'Módulo' : 'Submódulo'} · {its.length} aula(s){subs.length ? ` · ${subs.length} submódulo(s)` : ''}</span></span>
          {podeEditar && (
            <div className="flex shrink-0 items-center gap-1">
              {nivel === 0 && <Button variant="ghost" size="sm" onClick={() => setModuloDlg({ modulo: null, paiId: mod.id })}><FolderPlus className="h-4 w-4" />Submódulo</Button>}
              <Button variant="ghost" size="sm" onClick={() => setNovoConteudo({ moduloPadrao: mod.id })}><Plus className="h-4 w-4" />Conteúdo</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Editar módulo" onClick={() => setModuloDlg({ modulo: mod, paiId: mod.pai_id })}><Pencil className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
        {aberto && (
          <div>
            {its.length === 0 && subs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma aula aqui.{podeEditar && ' Use “Conteúdo”.'}</div>
            ) : (
              <>
                {its.map((it) => <LinhaAula key={it.id} it={it} irmaos={its.map((x) => x.id)} />)}
                {subs.length > 0 && <div className="space-y-3 p-3">{subs.map((s) => <Modulo key={s.id} mod={s} nivel={nivel + 1} irmaosMod={subs.map((x) => x.id)} />)}</div>}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_minmax(300px,360px)]">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {podeEditar && <Button variant="outline" onClick={() => setModuloDlg({ modulo: null, paiId: null })}><FolderPlus className="h-4 w-4" />Novo módulo</Button>}
          {podeEditar && <Button onClick={() => setNovoConteudo({ moduloPadrao: topo[0]?.id ?? null })} disabled={topo.length === 0}><Plus className="h-4 w-4" />Novo conteúdo</Button>}
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aula neste produto" className="pl-8" />
          </div>
          <Button variant="outline" onClick={expandirTudo}><ChevronDown className="h-4 w-4" />{recolhidos.size ? 'Expandir tudo' : 'Recolher tudo'}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['todos', 'Todos'], ['arquivo', 'Arquivo'], ['video', 'Vídeo'], ['outros', 'Outros']] as [Filtro, string][]).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', filtro === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
          ))}
        </div>

        {/* Barra de lote */}
        {totalVisiveis > 0 && (
          <div className="flex h-12 items-center gap-3 rounded-lg border bg-card px-3 text-sm">
            {marcados.size === 0 ? (
              <span className="text-muted-foreground"><span className="font-medium text-foreground">{totalVisiveis}</span> {totalVisiveis === 1 ? 'item' : 'itens'} · marque uma ou mais linhas para agir em lote</span>
            ) : (
              <>
                <span className="font-medium text-foreground">{marcados.size} selecionada{marcados.size === 1 ? '' : 's'}</span>
                <button type="button" onClick={() => setMarcados(new Set())} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar</button>
                {podeEditar && <Button size="sm" variant="destructive" className="ml-auto" onClick={excluirMarcados}><Trash2 className="h-4 w-4" />Excluir</Button>}
              </>
            )}
          </div>
        )}

        {/* Árvore */}
        {carregando && modulos.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando currículo…</div>
        ) : topo.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            Este produto ainda não tem módulos nem aulas.{podeEditar && ' Comece por “Novo módulo”.'}
          </div>
        ) : (
          <div className="space-y-3">{topo.map((m) => <Modulo key={m.id} mod={m} nivel={0} irmaosMod={topo.map((x) => x.id)} />)}</div>
        )}
      </div>

      {/* Detalhe da aula */}
      <aside className="rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
        {sel ? <DetalheAula it={sel} podeEditar={podeEditar} onEditar={() => setEditarItem({ item: sel, criar: false })} onAlterarTipo={() => setAlterarTipo(sel)} onMover={() => setMoverItem(sel)} onDuplicar={() => setDuplicarItem(sel)} onDisp={() => setDispItem(sel)} onExcluir={() => excluirAula(sel)} /> : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground"><FileStack className="h-7 w-7 opacity-40" />Clique numa aula para ver os detalhes.</div>
            <div className="border-t pt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipos de conteúdo</div>
              <p className="text-xs text-muted-foreground">{TIPOS_CONTEUDO_LISTA.join(' · ')}. A aula aponta ao recurso — sem hospedar.</p>
            </div>
          </div>
        )}
      </aside>

      {/* Modais */}
      {moduloDlg && (
        <ModuloDialog produtoId={produtoId} modulo={moduloDlg.modulo} paiId={moduloDlg.paiId}
          modulosCount={moduloDlg.modulo ? (subsPorPai.get(moduloDlg.modulo.id)?.length ?? 0) : undefined}
          aulasCount={moduloDlg.modulo ? (itensPorModulo.get(moduloDlg.modulo.id)?.length ?? 0) : undefined}
          onClose={() => setModuloDlg(null)} onPronto={refresh} />
      )}
      {novoConteudo && (
        <NovoConteudoDialog modulos={modulos} moduloPadrao={novoConteudo.moduloPadrao} onClose={() => setNovoConteudo(null)}
          onContinuar={(s) => { setNovoConteudo(null); setEditarItem({ item: { modulo_id: s.moduloId, tipo_ref: s.tipoRef, subtipo: s.subtipo }, criar: true }) }} />
      )}
      {editarItem && (
        <EditarItemDialog tenantId={tenantId} produtoId={produtoId} modulos={modulos} item={editarItem.item} criar={editarItem.criar}
          onClose={() => setEditarItem(null)} onPronto={refresh} />
      )}
      {moverItem && <MoverAulaDialog produtoId={produtoId} item={moverItem} modulos={modulos} onClose={() => setMoverItem(null)} onPronto={refresh} />}
      {duplicarItem && <DuplicarAulaDialog produtoId={produtoId} item={duplicarItem} modulos={modulos} onClose={() => setDuplicarItem(null)} onPronto={refresh} />}
      {alterarTipo && <AlterarTipoDialog produtoId={produtoId} item={alterarTipo} onClose={() => setAlterarTipo(null)} onPronto={() => { const it = alterarTipo; setAlterarTipo(null); if (it) setEditarItem({ item: it, criar: false }); refresh() }} />}
      {dispItem && (
        <DisponibilidadeDialog valor={dispItem.disponibilidade} escopo="aula" onClose={() => setDispItem(null)}
          onAplicar={async (d: Disponibilidade) => { const r = await salvarItemAction(dispItem.id, produtoId, { disponibilidade: d }); if ('error' in r && r.error) toast.error(r.error); else { toast.success('Disponibilidade salva.'); refresh() } setDispItem(null) }} />
      )}
    </div>
  )
}

function DetalheAula({ it, podeEditar, onEditar, onAlterarTipo, onMover, onDuplicar, onDisp, onExcluir }: {
  it: ItemRow; podeEditar: boolean
  onEditar: () => void; onAlterarTipo: () => void; onMover: () => void; onDuplicar: () => void; onDisp: () => void; onExcluir: () => void
}) {
  const subLabel = SUBTIPO_LABEL[it.subtipo ?? ''] ?? TIPO_REF_LABEL[it.tipo_ref]
  const arquivoTxt = it.tipo_ref === 'documento_biblioteca' ? (it.ref_id ? 'Documento da Biblioteca' : '—') : (it.ref_url || '—')
  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{iconeTipoRef(it.tipo_ref)}</span>
        <div className="min-w-0"><div className="line-clamp-2 text-sm font-semibold">{it.titulo}</div><div className="text-xs text-muted-foreground">{subLabel}</div></div>
      </div>

      {/* Poster/thumbnail (placeholder visual gerado a partir do tipo) */}
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl text-primary-foreground" style={{ background: 'linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 60%, black))' }}>
        <div className="flex flex-col items-center gap-1">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{subLabel}</span>
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/15">{iconeTipoRef(it.tipo_ref)}</span>
        </div>
      </div>

      {/* Conteúdo atual */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo atual</div>
        <dl className="divide-y text-sm">
          <L k="Tipo" v={TIPO_REF_LABEL[it.tipo_ref]} />
          <L k="Arquivo" v={arquivoTxt} />
          <Lpendente k="Marca d'água" icon={<Droplets className="h-3.5 w-3.5" />} />
          <Lpendente k="Senha do PDF" icon={<Lock className="h-3.5 w-3.5" />} />
          <Lpendente k="Download" icon={<Download className="h-3.5 w-3.5" />} />
        </dl>
      </div>

      {/* Detalhes */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</div>
        <dl className="divide-y text-sm">
          <L k="Situação" v={it.situacao === 'ativo' ? 'Ativo' : 'Rascunho'} />
          <L k="Acesso" v={it.visibilidade === 'publico' ? 'Público' : 'Privado'} />
          <L k="Disponibilidade" v={resumoDisponibilidade(it.disponibilidade)} />
        </dl>
      </div>

      {/* Arquivos complementares (placeholder) */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arquivos complementares <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium normal-case">Em breve</span></div>
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground"><Paperclip className="h-4 w-4 shrink-0" />Nenhum arquivo complementar.</div>
      </div>

      {/* Ações */}
      {podeEditar ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onEditar}><Pencil className="h-4 w-4" />Editar conteúdo</Button>
            <Button variant="outline" onClick={() => toast.message('Pré-visualização do aluno — em breve.')}><Eye className="h-4 w-4" />Ver como aluno</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onAlterarTipo}><Shuffle className="h-4 w-4" />Alterar tipo</Button>
            <Button variant="outline" onClick={onMover}><FolderInput className="h-4 w-4" />Mover aula</Button>
            <Button variant="outline" onClick={onDuplicar}><Copy className="h-4 w-4" />Duplicar aula</Button>
            <Button variant="outline" onClick={onDisp}><CalendarClock className="h-4 w-4" />Disponibilidade</Button>
            <Button variant="destructive" className="col-span-2" onClick={onExcluir}><Trash2 className="h-4 w-4" />Excluir</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => toast.message('Pré-visualização do aluno — em breve.')}><Eye className="h-4 w-4" />Ver como aluno</Button>
      )}

      {/* Tipos de conteúdo */}
      <div className="border-t pt-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipos de conteúdo</div>
        <p className="text-xs text-muted-foreground">{TIPOS_CONTEUDO_LISTA.join(' · ')}</p>
      </div>
    </div>
  )
}
function Lpendente({ k, icon }: { k: string; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 py-2"><dt className="flex items-center gap-1.5 text-muted-foreground">{icon}{k}</dt><dd className="font-medium text-muted-foreground">—</dd></div>
}
function L({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 truncate text-right font-medium">{v}</dd></div>
}
