'use client'

// Aba "Conteúdos" do produto (tela ProdutoConteudos): currículo leve por referência, em MASTER-DETAIL.
//  1) Visão de MÓDULOS: grade de cards (agregados calculados no servidor, paginada) — nunca carrega as aulas para montar os cards.
//  2) Visão INTERNA do módulo (?aba=conteudos&modulo=<id>): só as aulas daquele módulo (paginadas) + cards dos submódulos.
//  3) Busca global de aulas: resultados agrupados pelo módulo de origem (sem expandir o currículo inteiro).
// Ações em massa por nível: cards (módulos → aulas dos módulos e submódulos) e lista de aulas (aulas selecionadas).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2, Plus, FileStack, Search, ChevronLeft, ChevronRight, GripVertical, Pencil, MoreVertical, ArrowLeft,
  FolderPlus, Trash2, Shuffle, FolderInput, Copy, CalendarClock, Layers, Eye, EyeOff, Paperclip, Lock, Download, Droplets, ArrowUpDown, ChevronDown, LayoutGrid, List as ListIcon, ArrowUp, ArrowDown, Users,
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
  SUBTIPO_LABEL, TIPO_REF_LABEL, SUBTIPOS, MATERIAIS, resumoDisponibilidade,
  type ModuloRow, type ItemRow, type TipoRef, type Disponibilidade, type ModuloCard, type MaterialChave,
} from '@/lib/produtos/curriculo'
import { CaixaSelecao } from '@/components/admin/caixa-selecao'
import { PaginacaoBib } from '@/app/admin/revisao/biblioteca/paginacao-bib'
import {
  excluirItemAction, salvarItemAction, reordenarItensAction, atualizarItensEmLoteAction, excluirItensEmLoteAction,
  atualizarModulosEmLoteAction, excluirModulosEmLoteAction,
} from '../actions'
import { carregarModulosAction, carregarModuloInternoAction, buscarAulasProdutoAction } from './lazy-actions'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SegmentosDialog, SinaisSegmento, resumoRegrasAlvo, type AbaSegmentos, type SinaisSeg } from './segmentos-dialog'
import { carregarRegrasSegmentoAction } from './segmento-regras-actions'
import type { RegrasSegmentoAdmin } from './segmento-regras-tipos'
import { carregarVisibilidadeConteudoAction } from './visibilidade-actions'
import type { VisibilidadeConteudo } from './visibilidade-actions-tipos'
import type { RegraVisibilidade } from '@/lib/segmentos/tipos'
import { QuestoesMetaDialog } from './questoes-meta-dialog'
import { CardModulo, ReordenarModulosDialog, resumoLiberacaoCard, situacaoModulo } from './modulo-cards'
import {
  ModuloDialog, NovoConteudoDialog, EditarItemDialog, DisponibilidadeDialog,
  MoverAulaDialog, MoverAulasLoteDialog, DuplicarAulaDialog, AlterarTipoDialog, iconeTipoRef,
} from './conteudo-modais'

// Lista fixa de "Tipos de conteúdo" (rodapé do painel de detalhe) — espelha o designer.
const TIPOS_CONTEUDO_LISTA = SUBTIPOS.filter((s) => s.grupo === 'plataforma').map((s) => s.nome)

// Destaque de drop (linha da cor primária no topo/base do alvo) — ligado via atributo data-drop.
const DROP_CLS = 'data-[drop=top]:shadow-[inset_0_2px_0_0_var(--primary)] data-[drop=bottom]:shadow-[inset_0_-2px_0_0_var(--primary)]'
// Grade adaptativa ao CONTAINER (não ao viewport): cards-pôster estreitos (proporção 2/3 do aluno), mín. 180px.
const GRID_CARDS = 'grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3'
type Vista = 'cards' | 'tabela'
const VISTA_LS = 'estudio.conteudos.vista'
const PP_CARDS = [12, 24, 48]
const PP_TABELA = [10, 14, 25, 50, 100]
const SELECT_CLS = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

type FiltroMod = 'todos' | 'com_sub' | 'programadas' | 'rascunho'
type OrdemMod = 'ordem' | 'nome' | 'nome_desc' | 'aulas' | 'aulas_asc' | 'sub' | 'sub_asc' | 'rascunhos' | 'rascunhos_asc'
type ItemEdit = { item: Partial<ItemRow> & { tipo_ref: TipoRef; subtipo?: string | null; modulo_id: string }; criar: boolean }
type AulasPagina = { itens: ItemRow[]; total: number; page: number; ids: string[]; materiais: Partial<Record<MaterialChave, number>> }
type Irmao = { id: string; titulo: string }

export function AbaConteudos({ tenantId, produtoId, podeEditar, tipoProduto }: {
  tenantId: string; produtoId: string; podeEditar: boolean; tipoProduto?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Navegação master-detail por query string (?aba=conteudos&modulo=<id>); troca sem re-render do servidor ──
  const [moduloId, setModuloId] = useState<string | null>(() => searchParams.get('modulo'))
  useEffect(() => {
    const onPop = () => setModuloId(new URL(window.location.href).searchParams.get('modulo'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const [busca, setBusca] = useState('')               // busca GLOBAL de aula
  const [sel, setSel] = useState<ItemRow | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [modulos, setModulos] = useState<ModuloRow[]>([])

  // Visão de módulos
  const [qMod, setQMod] = useState('')
  const [filtroMod, setFiltroMod] = useState<FiltroMod>('todos')
  const [matMod, setMatMod] = useState<MaterialChave | 'todos'>('todos')
  const [ordemMod, setOrdemMod] = useState<OrdemMod>('ordem')
  const [pageMod, setPageMod] = useState(1)
  const [vista, setVistaState] = useState<Vista>(() => (searchParams.get('vista') === 'tabela' ? 'tabela' : 'cards'))
  const [ppMod, setPpMod] = useState(() => (searchParams.get('vista') === 'tabela' ? 14 : 24))
  // Sem ?vista=, lembra a última escolha (localStorage com try/catch).
  useEffect(() => {
    if (searchParams.get('vista')) return
    try { if (localStorage.getItem(VISTA_LS) === 'tabela') { setVistaState('tabela'); setPpMod(14); setPpSub(14) } } catch { /* storage indisponível */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function setVista(v: Vista) {
    if (v === vista) return
    setVistaState(v); setPageMod(1); setPpMod(v === 'tabela' ? 14 : 24); setPageSub(1); setPpSub(v === 'tabela' ? 14 : 24)
    if (v === 'cards' && !['ordem', 'nome', 'aulas'].includes(ordemMod)) setOrdemMod('ordem')
    if (v === 'cards' && !['ordem', 'nome', 'aulas'].includes(ordemSub)) setOrdemSub('ordem')
    try { localStorage.setItem(VISTA_LS, v) } catch { /* ignore */ }
    const u = new URL(window.location.href); u.searchParams.set('vista', v); window.history.replaceState(null, '', u)
  }
  const [cards, setCards] = useState<ModuloCard[]>([])
  const [totalMod, setTotalMod] = useState(0)
  const [totais, setTotais] = useState({ aulas: 0, modulos: 0 })
  const [marcadosMod, setMarcadosMod] = useState<Set<string>>(new Set())
  // Submódulos do módulo aberto: MESMAS ferramentas da visão de módulos (busca, ordem, página, seleção, lote, reordenar)
  const [qSub, setQSub] = useState('')
  const [ordemSub, setOrdemSub] = useState<OrdemMod>('ordem')
  const [pageSub, setPageSub] = useState(1)
  const [ppSub, setPpSub] = useState(() => (searchParams.get('vista') === 'tabela' ? 14 : 24))
  const [totalSub, setTotalSub] = useState(0)
  const [marcadosSub, setMarcadosSub] = useState<Set<string>>(new Set())
  const [reordenarSub, setReordenarSub] = useState(false)

  // Visão interna
  const [qAula, setQAula] = useState('')
  const [matAula, setMatAula] = useState<MaterialChave | 'todos'>('todos')
  const [pageAula, setPageAula] = useState(1)
  const [ppAula, setPpAula] = useState(25)
  const [aulas, setAulas] = useState<AulasPagina>({ itens: [], total: 0, page: 1, ids: [], materiais: {} })
  const [subs, setSubs] = useState<ModuloCard[]>([])
  const [atual, setAtual] = useState<ModuloCard | null>(null)
  const [irmaos, setIrmaos] = useState<Irmao[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  // Visibilidade por segmentos (regras de módulo/aula): carga leve, só quando o painel abre ou há módulo aberto (chips das linhas).
  type PainelVis = { alvos: { tipo: 'modulo' | 'aula'; id: string }[]; titulo?: string; aba?: AbaSegmentos }
  const [painelVis, setPainelVis] = useState<PainelVis | null>(null)
  const [visDados, setVisDados] = useState<(VisibilidadeConteudo & { disponivel: boolean }) | null>(null)
  const [segRegras, setSegRegras] = useState<RegrasSegmentoAdmin | null>(null)
  const visCarregando = useRef(false)
  const recarregarVis = async () => {
    if (visCarregando.current) return
    visCarregando.current = true
    try {
      const [r, g] = await Promise.all([carregarVisibilidadeConteudoAction(produtoId), carregarRegrasSegmentoAction(produtoId).catch(() => null)])
      if ('error' in r) toast.error(r.error); else setVisDados({ ...r.dados, disponivel: r.disponivel })
      if (g && 'ok' in g) setSegRegras(g.dados)
    } catch { /* mantém o que já havia */ } finally { visCarregando.current = false }
  }
  // Sinais (Visibilidade/Liberação/Capa) nos cards e linhas: carga leve (2 consultas) ao abrir a aba.
  useEffect(() => { if (!visDados) void recarregarVis() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [moduloId, painelVis])
  const regrasPorAlvo = useMemo(() => {
    const m = new Map<string, RegraVisibilidade[]>()
    for (const r of visDados?.regras ?? []) if (r.alvo_id) m.set(r.alvo_id, [...(m.get(r.alvo_id) ?? []), r])
    return m
  }, [visDados])
  /** id → título de módulos (cards/lista) e aulas da página: o modal de Segmentos lista QUEM tem cada regra. */
  const titulosAlvos = useMemo(() => {
    const m: Record<string, string> = {}
    for (const x of modulos) m[x.id] = x.titulo
    for (const x of cards) m[x.id] = x.titulo
    for (const x of subs) m[x.id] = x.titulo
    for (const x of aulas.itens) m[x.id] = x.titulo
    return m
  }, [modulos, cards, subs, aulas.itens])
  const imagensAlvos = useMemo(() => {
    const m: Record<string, string | null> = {}
    for (const x of modulos) m[x.id] = x.imagem_url ?? null
    for (const x of cards) m[x.id] = x.imagem_url ?? m[x.id] ?? null
    for (const x of subs) m[x.id] = x.imagem_url ?? m[x.id] ?? null
    return m
  }, [modulos, cards, subs])
  /** id (módulo/aula) → o que tem de regra por segmento (texto p/ tooltip). */
  const sinais = useMemo(() => {
    const m = new Map<string, SinaisSeg>()
    const seg = (id: string) => visDados?.segmentos.find((x) => x.id === id)?.nome ?? 'segmento'
    const poe = (id: string | null, campo: keyof SinaisSeg, txt: string) => { if (!id) return; const c = m.get(id) ?? { vis: null, lib: null, capa: null }; c[campo] = c[campo] ? `${c[campo]} · ${txt}` : txt; m.set(id, c) }
    for (const r of visDados?.regras ?? []) if (r.ativo && r.alvo_tipo !== 'produto') poe(r.alvo_id, 'vis', `${r.efeito === 'mostrar' ? 'só' : 'oculto p/'} ${seg(r.segmento_id)}`)
    for (const r of segRegras?.disp ?? []) if (r.ativo) poe(r.alvo_id, 'lib', `${seg(r.segmento_id)}: ${resumoDisponibilidade(r.disponibilidade)}`)
    for (const r of segRegras?.capas ?? []) if (r.ativo && r.alvo_tipo === 'modulo') poe(r.alvo_id, 'capa', seg(r.segmento_id))
    return m
  }, [visDados, segRegras])
  const nomeSegVis = (id: string) => visDados?.segmentos.find((s) => s.id === id)?.nome ?? 'segmento'

  const [carregando, setCarregando] = useState(true)
  const seq = useRef(0)
  const refresh = () => { setReloadKey((k) => k + 1); router.refresh() }

  function irModulo(id: string | null, item: ItemRow | null = null) {
    setModuloId(id); setSel(item); setMarcados(new Set()); setQAula(''); setMatAula('todos'); setPageAula(1); setBusca('')
    setMarcadosSub(new Set()); setQSub(''); setOrdemSub('ordem'); setPageSub(1)
    const u = new URL(window.location.href)
    u.searchParams.set('aba', 'conteudos')
    if (id) u.searchParams.set('modulo', id); else u.searchParams.delete('modulo')
    window.history.pushState(null, '', u)
  }

  // ── Carga: cards (sem módulo aberto) ──
  useEffect(() => {
    if (moduloId) return
    const mine = ++seq.current
    setCarregando(true)
    const t = setTimeout(() => {
      carregarModulosAction(produtoId, { q: qMod, filtro: filtroMod, material: matMod, ordem: ordemMod, page: pageMod, pp: ppMod })
        .then((r) => {
          if (mine !== seq.current) return
          if ('error' in r) { toast.error(r.error); return }
          setCards(r.cards); setTotalMod(r.total); setModulos(r.modulos); setTotais({ aulas: r.totalAulas, modulos: r.totalModulos })
          if (r.page !== pageMod) setPageMod(r.page)
        })
        .catch(() => { if (mine === seq.current) toast.error('Falha ao carregar os módulos.') })
        .finally(() => { if (mine === seq.current) setCarregando(false) })
    }, qMod ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduloId, produtoId, qMod, filtroMod, matMod, ordemMod, pageMod, ppMod, reloadKey])

  // ── Carga: módulo aberto (só as aulas dele) ──
  useEffect(() => {
    if (!moduloId) return
    const mine = ++seq.current
    setCarregando(true)
    const t = setTimeout(() => {
      carregarModuloInternoAction(produtoId, moduloId, { q: qAula, material: matAula, page: pageAula, pp: ppAula, subQ: qSub, subOrdem: ordemSub, subPage: pageSub, subPp: ppSub })
        .then((r) => {
          if (mine !== seq.current) return
          if ('error' in r) { toast.error(r.error); return }
          if (!r.atual) { toast.message('Módulo não encontrado — voltando à lista.'); irModulo(null); return }
          setAulas(r.aulas); setSubs(r.subs); setTotalSub(r.subsTotal); if (r.subsPage !== pageSub) setPageSub(r.subsPage); setModulos(r.modulos); setAtual(r.atual); setIrmaos(r.irmaos)
          if (r.aulas.page !== pageAula) setPageAula(r.aulas.page)
        })
        .catch(() => { if (mine === seq.current) toast.error('Falha ao carregar o módulo.') })
        .finally(() => { if (mine === seq.current) setCarregando(false) })
    }, qAula || qSub ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduloId, produtoId, qAula, matAula, pageAula, ppAula, qSub, ordemSub, pageSub, ppSub, reloadKey])

  // ── Busca global (agrupada por módulo de origem) ──
  const [achados, setAchados] = useState<{ itens: ItemRow[]; total: number } | null>(null)
  const [buscando, setBuscando] = useState(false)
  useEffect(() => {
    const q = busca.trim()
    if (!q) { setAchados(null); setBuscando(false); return }
    setBuscando(true)
    let vivo = true
    const t = setTimeout(() => {
      buscarAulasProdutoAction(produtoId, q)
        .then((r) => { if (!vivo) return; if ('error' in r) { toast.error(r.error); return } setAchados({ itens: r.itens, total: r.total }); setModulos(r.modulos) })
        .catch(() => { if (vivo) toast.error('Falha na busca.') })
        .finally(() => { if (vivo) setBuscando(false) })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, produtoId, reloadKey])

  // modais
  const [moduloDlg, setModuloDlg] = useState<{ modulo: ModuloRow | null; paiId: string | null; card?: ModuloCard } | null>(null)
  const [novoConteudo, setNovoConteudo] = useState<{ moduloPadrao: string | null } | null>(null)
  const [editarItem, setEditarItem] = useState<ItemEdit | null>(null)
  const [questoesMeta, setQuestoesMeta] = useState<ItemRow | null>(null) // JurisClub: questões vinculadas à meta
  const [moverItem, setMoverItem] = useState<ItemRow | null>(null)
  const [duplicarItem, setDuplicarItem] = useState<ItemRow | null>(null)
  const [alterarTipo, setAlterarTipo] = useState<ItemRow | null>(null)
  const [reordenar, setReordenar] = useState(false)

  // Reordenação das aulas por arrasto (HTML5 nativo). `ovr` = ordem otimista local (id -> posição); limpa quando o servidor devolve dados.
  const [ovr, setOvr] = useState<Record<string, number>>({})
  useEffect(() => { setOvr({}) }, [aulas])
  const dragRef = useRef<{ id: string } | null>(null)
  const podeArrastar = podeEditar && !qAula.trim() && matAula === 'todos'
  const ord = (id: string, o: number) => ovr[id] ?? o

  function posicao(e: React.DragEvent, el: HTMLElement): 'top' | 'bottom' {
    const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 ? 'top' : 'bottom'
  }
  // `irmaosIds` = ordem COMPLETA das aulas do módulo (sem filtro) — arrastar dentro da página reposiciona na ordem inteira.
  function dnd(id: string, mod: string, irmaosIds: string[]) {
    if (!podeArrastar) return {}
    const compat = () => !!dragRef.current && dragRef.current.id !== id
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => { e.stopPropagation(); dragRef.current = { id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) },
      onDragEnd: () => { dragRef.current = null },
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
        const base = irmaosIds.filter((x) => x !== src)
        base.splice(base.indexOf(id) + (pos === 'bottom' ? 1 : 0), 0, src)
        if (base.join() === irmaosIds.join()) return
        setOvr((p) => { const n = { ...p }; base.forEach((x, i) => { n[x] = i }); return n })
        const r = await reordenarItensAction(produtoId, mod, base)
        if ('error' in r && r.error) { toast.error(r.error); setOvr({}) }
        refresh()
      },
    }
  }

  const itensPagina = useMemo(() => {
    const arr = [...aulas.itens]
    if (Object.keys(ovr).length) arr.sort((a, b) => ord(a.id, a.ordem) - ord(b.id, b.ordem))
    return arr
  }, [aulas.itens, ovr]) // eslint-disable-line react-hooks/exhaustive-deps

  const nomeModulo = useMemo(() => new Map(modulos.map((m) => [m.id, m])), [modulos])
  /** "Módulo › Submódulo" e a raiz (módulo de topo) de um módulo. */
  function caminhoDe(id: string): { raiz: string; rotulo: string } {
    const cadeia: ModuloRow[] = []
    let cur = nomeModulo.get(id)
    while (cur && cadeia.length < 6) { cadeia.unshift(cur); cur = cur.pai_id ? nomeModulo.get(cur.pai_id) : undefined }
    return { raiz: cadeia[0]?.id ?? id, rotulo: cadeia.map((c) => c.titulo).join(' › ') || '—' }
  }
  const toggleMarcado = (id: string) => setMarcados((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleMarcadoMod = (id: string) => setMarcadosMod((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function excluirAula(it: ItemRow) {
    if (!(await confirmar({ titulo: 'Excluir aula', mensagem: `Excluir "${it.titulo}"? A referência ao recurso é removida; o recurso original (documento/simulado) continua.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await excluirItemAction(it.id, produtoId)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success('Aula excluída.'); if (sel?.id === it.id) setSel(null); refresh()
  }

  // ── Ações em lote NO NÍVEL DE AULA: UMA ida ao servidor por ação (valida permissão, atualiza em chunks de 80, audita a lista de ids) ──
  const [emLote, setEmLote] = useState(false)
  const [moverLote, setMoverLote] = useState(false)
  const idsMarcados = () => [...marcados]
  async function aplicarLote(patch: Parameters<typeof atualizarItensEmLoteAction>[2], titulo: string, mensagem: string, ok: string) {
    const ids = idsMarcados(); if (!ids.length) return
    if (!(await confirmar({ titulo, mensagem: `${mensagem} (${ids.length} aula${ids.length === 1 ? '' : 's'}).`, confirmar: 'Aplicar' }))) return
    setEmLote(true)
    const r = await atualizarItensEmLoteAction(produtoId, ids, patch)
    setEmLote(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success(`${(r as { atualizadas: number }).atualizadas} aula(s) atualizada(s) — ${ok}.`)
    setMarcados(new Set()); setSel(null); refresh()
  }
  async function excluirMarcados() {
    const ids = idsMarcados()
    if (!ids.length) return
    if (!(await confirmar({ titulo: 'Excluir selecionadas', mensagem: `Excluir ${ids.length} aula(s)? A referência ao recurso é removida; os recursos originais continuam.`, confirmar: 'Excluir', destrutivo: true }))) return
    setEmLote(true)
    const r = await excluirItensEmLoteAction(produtoId, ids)
    setEmLote(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success(`${(r as { atualizadas: number }).atualizadas} aula(s) excluída(s).`); setMarcados(new Set()); setSel(null); refresh()
  }

  // ── Ações em lote NO NÍVEL DE MÓDULO (valem p/ as aulas do módulo e dos submódulos) ──
  async function aplicarLoteMod(patch: Parameters<typeof atualizarModulosEmLoteAction>[2], titulo: string, mensagem: string, ok: string, marcX: Set<string> = marcadosMod, limpar: () => void = () => setMarcadosMod(new Set())) {
    const ids = [...marcX]; if (!ids.length) return
    if (!(await confirmar({ titulo, mensagem: `${mensagem} em todas as aulas de ${ids.length} módulo${ids.length === 1 ? '' : 's'} (inclui submódulos).`, confirmar: 'Aplicar' }))) return
    setEmLote(true)
    const r = await atualizarModulosEmLoteAction(produtoId, ids, patch)
    setEmLote(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success(`${(r as { aulas: number }).aulas} aula(s) em ${(r as { modulos: number }).modulos} módulo(s) — ${ok}.`)
    limpar(); refresh()
  }
  async function excluirModulosMarcados(marcX: Set<string> = marcadosMod, limpar: () => void = () => setMarcadosMod(new Set())) {
    const ids = [...marcX]; if (!ids.length) return
    if (!(await confirmar({ titulo: 'Excluir módulos', mensagem: `Excluir ${ids.length} módulo(s)? Os submódulos e as aulas dentro deles vão para a Lixeira.`, confirmar: 'Excluir', destrutivo: true }))) return
    setEmLote(true)
    const r = await excluirModulosEmLoteAction(produtoId, ids)
    setEmLote(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success(`${(r as { modulos: number }).modulos} módulo(s) excluído(s).`); limpar(); refresh()
  }

  /** Liberação BASE (todos os alunos) feita pelo painel de Segmento > Liberação: aulas = a(s) aula(s); módulos = as aulas dentro. */
  async function aplicarBase(alvos: { tipo: 'modulo' | 'aula'; id: string }[], d: Disponibilidade) {
    const ids = alvos.map((a) => a.id); if (!ids.length) return
    const mod = alvos.every((a) => a.tipo === 'modulo')
    if (!(await confirmar({ titulo: 'Definir liberação', mensagem: `Aplicar “${resumoDisponibilidade(d)}” a todos os alunos em ${ids.length} ${mod ? `módulo${ids.length === 1 ? '' : 's'} (todas as aulas dentro, inclui submódulos)` : `aula${ids.length === 1 ? '' : 's'}`}.`, confirmar: 'Aplicar' }))) return
    setEmLote(true)
    const r = mod ? await atualizarModulosEmLoteAction(produtoId, ids, { disponibilidade: d }) : await atualizarItensEmLoteAction(produtoId, ids, { disponibilidade: d })
    setEmLote(false)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success(`Liberação aplicada: ${resumoDisponibilidade(d)}.`); refresh()
  }
  const baseResumoPainel = painelVis && painelVis.alvos.length === 1 && painelVis.alvos[0].tipo === 'aula'
    ? (() => { const it = aulas.itens.find((x) => x.id === painelVis.alvos[0].id); return it ? resumoDisponibilidade(it.disponibilidade) : null })() : null

  /** Abre o painel lateral de visibilidade para UMA aula (se havia seleção, o painel fica só nela). */
  function abrirVisAula(it: ItemRow) { setPainelVis({ alvos: [{ tipo: 'aula', id: it.id }], titulo: it.titulo }) }

  function menuAula(it: ItemRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Ações da aula" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground data-popup-open:bg-muted"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditarItem({ item: it, criar: false })}><Pencil className="h-4 w-4" />Editar conteúdo</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAlterarTipo(it)}><Shuffle className="h-4 w-4" />Alterar tipo da aula</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoverItem(it)}><FolderInput className="h-4 w-4" />Mover aula</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDuplicarItem(it)}><Copy className="h-4 w-4" />Duplicar aula</DropdownMenuItem>
          <DropdownMenuItem onClick={() => abrirVisAula(it)}><Users className="h-4 w-4" />Segmento e liberação</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => excluirAula(it)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function linhaAula(it: ItemRow) {
    const ativa = sel?.id === it.id
    const marcada = marcados.has(it.id)
    return (
      <div key={it.id} {...dnd(it.id, it.modulo_id, aulas.ids)}
        className={cn('flex items-center gap-2 border-b px-3 py-2 last:border-0 hover:bg-muted/40', DROP_CLS, (ativa || marcada) && 'bg-primary/5')}>
        {podeEditar && (
          <CaixaSelecao checked={marcada} onChange={() => toggleMarcado(it.id)} label="Selecionar aula" />
        )}
        <GripVertical className={cn('h-4 w-4 shrink-0 text-muted-foreground/60', podeArrastar && 'cursor-grab active:cursor-grabbing')} aria-hidden />
        <button type="button" onClick={() => { setSel(it); setPainelVis(null) }} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{iconeTipoRef(it.tipo_ref)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{it.titulo}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <span className="truncate">{SUBTIPO_LABEL[it.subtipo ?? ''] ?? TIPO_REF_LABEL[it.tipo_ref]} · {resumoDisponibilidade(it.disponibilidade)}</span>
              <ChipLiberacao d={it.disponibilidade} />
            </span>
          </span>
        </button>
        <SinaisSegmento sinais={sinais.get(it.id) ? { ...sinais.get(it.id)!, vis: null, capa: null } : null} compacto className="hidden sm:inline-flex" />
        {(() => {
          const rs = resumoRegrasAlvo(regrasPorAlvo.get(it.id), nomeSegVis)
          if (!rs) return null
          const oculta = (regrasPorAlvo.get(it.id) ?? []).some((r) => r.ativo && r.efeito === 'ocultar')
          return (
            <button type="button" onClick={() => abrirVisAula(it)} title={`Visibilidade: ${rs}`}
              className="hidden max-w-44 shrink-0 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted sm:inline-flex">
              {oculta ? <EyeOff className="h-3 w-3 shrink-0" /> : <Users className="h-3 w-3 shrink-0" />}<span className="truncate">{rs}</span>
            </button>
          )
        })()}
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', it.situacao === 'ativo' ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{it.situacao === 'ativo' ? 'Ativo' : 'Rascunho'}</span>
        {podeEditar && <>{it.subtipo === 'jurisclub' && <Button variant="ghost" size="sm" onClick={() => setQuestoesMeta(it)}><FileStack className="h-4 w-4" />Questões</Button>}<Button variant="ghost" size="sm" onClick={() => setEditarItem({ item: it, criar: false })}><Pencil className="h-4 w-4" />Editar</Button>{menuAula(it)}</>}
      </div>
    )
  }

  const editarCard = (c: ModuloCard) => setModuloDlg({ modulo: nomeModulo.get(c.id) ?? null, paiId: c.pai_id, card: c })
  function cardDe(c: ModuloCard, comSelecao: boolean, marcX: Set<string> = marcadosMod, toggleX: (id: string) => void = toggleMarcadoMod) {
    return (
      <CardModulo key={c.id} m={c} podeEditar={podeEditar} sinais={sinais.get(c.id)}
        marcado={comSelecao ? marcX.has(c.id) : undefined} onMarcar={comSelecao ? () => toggleX(c.id) : undefined}
        onAbrir={() => irModulo(c.id)} onEditar={() => editarCard(c)}
        onSub={() => setModuloDlg({ modulo: null, paiId: c.id })} onConteudo={() => setNovoConteudo({ moduloPadrao: c.id })} />
    )
  }

  const seletorVista = (
    <div className="flex items-center rounded-lg border p-0.5" role="group" aria-label="Visualização">
      <button type="button" onClick={() => setVista('cards')} aria-pressed={vista === 'cards'} className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm', vista === 'cards' ? 'bg-muted text-foreground' : 'text-muted-foreground')}><LayoutGrid className="h-4 w-4" />Cards</button>
      <button type="button" onClick={() => setVista('tabela')} aria-pressed={vista === 'tabela'} className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm', vista === 'tabela' ? 'bg-muted text-foreground' : 'text-muted-foreground')}><ListIcon className="h-4 w-4" />Tabela</button>
    </div>
  )
  const irmaosSub = useMemo(() => modulos.filter((m) => (m.pai_id ?? null) === moduloId).sort((a, b) => a.ordem - b.ordem).map((m) => m.id), [modulos, moduloId])
  const cardDeSub = (c: ModuloCard) => cardDe(c, true, marcadosSub, (id) => setMarcadosSub((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }))
  const topoIds = useMemo(() => modulos.filter((m) => !m.pai_id).map((m) => m.id), [modulos])
  const filtrosMod = !!qMod.trim() || filtroMod !== 'todos' || matMod !== 'todos'
  const buscando_ = !!busca.trim()

  // ── Toolbar (comum às duas visões) ──
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {podeEditar && <Button variant="outline" onClick={() => setModuloDlg({ modulo: null, paiId: null })}><FolderPlus className="h-4 w-4" />Novo módulo</Button>}
      {podeEditar && <Button onClick={() => setNovoConteudo({ moduloPadrao: moduloId ?? topoIds[0] ?? null })} disabled={modulos.length === 0}><Plus className="h-4 w-4" />Novo conteúdo</Button>}
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aula neste produto" className="pl-8" />
      </div>
    </div>
  )

  // ── Resultados da busca global ──
  const resultadosBusca = (() => {
    if (buscando && !achados) return <Carga texto="Buscando aulas…" />
    if (!achados || achados.itens.length === 0) return <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">Nenhuma aula encontrada para “{busca.trim()}”.</div>
    const grupos = new Map<string, ItemRow[]>()
    for (const it of achados.itens) { const arr = grupos.get(it.modulo_id) ?? []; arr.push(it); grupos.set(it.modulo_id, arr) }
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{achados.total} aula{achados.total === 1 ? '' : 's'} encontrada{achados.total === 1 ? '' : 's'}{achados.total > achados.itens.length ? ` (mostrando as ${achados.itens.length} primeiras — refine a busca)` : ''} · agrupadas pelo módulo de origem</p>
        {[...grupos.entries()].map(([mid, its]) => (
          <div key={mid} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
              <Layers className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{caminhoDe(mid).rotulo}</span>
              <span className="text-xs text-muted-foreground">{its.length} resultado{its.length === 1 ? '' : 's'}</span>
              <Button variant="outline" size="sm" onClick={() => irModulo(mid)}>Abrir módulo<ChevronRight className="h-4 w-4" /></Button>
            </div>
            {its.map((it) => (
              <button key={it.id} type="button" onClick={() => irModulo(mid, it)} className="flex w-full items-center gap-2.5 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/40">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{iconeTipoRef(it.tipo_ref)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.titulo}</span><span className="block truncate text-xs text-muted-foreground">{SUBTIPO_LABEL[it.subtipo ?? ''] ?? TIPO_REF_LABEL[it.tipo_ref]} · {resumoDisponibilidade(it.disponibilidade)}</span></span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', it.situacao === 'ativo' ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{it.situacao === 'ativo' ? 'Ativo' : 'Rascunho'}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  })()

  // ── Tabela de módulos: mesmo casco/densidade da TabelaCron (Biblioteca/Cronograma); seleção e ações em massa = as dos cards ──
  /** Tabela de módulos (topo OU submódulos): mesma para os dois níveis; só muda a lista/ordem/seleção. */
  function tabelaDeModulos(lista: ModuloCard[], ordemAtual: OrdemMod, setOrdem: (o: OrdemMod) => void, marcadosX: Set<string>, setMarcadosX: React.Dispatch<React.SetStateAction<Set<string>>>, rotuloPrimeira: string) {
  const toggleX = (id: string) => setMarcadosX((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const ThOrd = ({ rotulo, asc, desc, className }: { rotulo: string; asc: OrdemMod; desc: OrdemMod; className?: string }) => {
    const ativo = ordemAtual === asc || ordemAtual === desc
    return (
      <th className={cn('px-3 py-2.5 font-medium', className)} aria-sort={ordemAtual === asc ? 'ascending' : ordemAtual === desc ? 'descending' : 'none'}>
        <button type="button" onClick={() => setOrdem(ordemAtual === desc ? asc : desc)} className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground', ativo && 'text-foreground')}>
          {rotulo}{ativo ? (ordemAtual === asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
        </button>
      </th>
    )
  }
  const todosPagMarcados = lista.length > 0 && lista.every((c) => marcadosX.has(c.id))
  return (
    <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', carregando && 'opacity-70')} aria-busy={carregando}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {podeEditar && (
                <th className="w-9 px-3 py-2.5">
                  <input type="checkbox" aria-label="Selecionar todos desta página" checked={todosPagMarcados}
                    onChange={(e) => setMarcadosX((p) => { const n = new Set(p); for (const c of lista) { if (e.target.checked) n.add(c.id); else n.delete(c.id) } return n })}
                    className="h-4 w-4 cursor-pointer accent-[var(--primary)]" />
                </th>
              )}
              <ThOrd rotulo={rotuloPrimeira} asc="nome" desc="nome_desc" />
              <ThOrd rotulo="Aulas" asc="aulas_asc" desc="aulas" className="w-20" />
              <ThOrd rotulo="Submódulos" asc="sub_asc" desc="sub" className="w-28" />
              <th className="px-3 py-2.5 font-medium">Tipos de material</th>
              <th className="px-3 py-2.5 font-medium">Liberação</th>
              <ThOrd rotulo="Situação" asc="rascunhos_asc" desc="rascunhos" className="w-36" />
              <th className="w-28 px-3 py-2.5 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const chips = MATERIAIS.filter((x) => (c.materiais[x.v] ?? 0) > 0)
              const sit = situacaoModulo(c)
              return (
                <tr key={c.id} className={cn('border-b last:border-0 hover:bg-muted/40', marcadosX.has(c.id) && 'bg-primary/5')}>
                  {podeEditar && <td className="px-3 py-1.5"><CaixaSelecao checked={marcadosX.has(c.id)} onChange={() => toggleX(c.id)} label={`Selecionar ${c.titulo}`} /></td>}
                  <td className="px-3 py-1.5 align-middle">
                    <button type="button" onClick={() => irModulo(c.id)} className="flex min-w-0 items-center gap-2.5 text-left">
                      <span className="relative h-10 w-[27px] shrink-0 overflow-hidden rounded-md" style={{ background: 'linear-gradient(170deg, var(--primary), color-mix(in srgb, var(--primary) 40%, black))' }}>
                        {c.imagem_url && <img src={c.imagem_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}{/* eslint-disable-line @next/next/no-img-element */}
                      </span>
                      <span className="min-w-0 max-w-[32ch] truncate font-medium hover:underline">{c.titulo}</span>
                    </button>
                    <SinaisSegmento sinais={sinais.get(c.id)} compacto className="mt-1 pl-[37px]" />
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{c.aulas}</td>
                  <td className="px-3 py-1.5 tabular-nums">{c.submodulos}</td>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap gap-1">
                      {chips.length === 0 ? <span className="text-muted-foreground">—</span> : chips.map((x) => <span key={x.v} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{x.label} <span className="tabular-nums">{c.materiais[x.v]}</span></span>)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {resumoLiberacaoCard(c).map((l) => <div key={l.texto} className={l.alerta ? 'font-medium text-foreground' : 'text-muted-foreground'}>{l.texto}</div>)}
                  </td>
                  <td className="px-3 py-1.5"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', sit.ativo ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{sit.texto}</span></td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => irModulo(c.id)}>Abrir</Button>
                      {podeEditar && <>
                        <Button variant="ghost" size="icon-sm" aria-label="Editar módulo" onClick={() => editarCard(c)}><Pencil className="h-4 w-4" /></Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label="Ações do módulo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground data-popup-open:bg-muted"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => editarCard(c)}><Pencil className="h-4 w-4" />Editar módulo</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setModuloDlg({ modulo: null, paiId: c.id })}><FolderPlus className="h-4 w-4" />Novo submódulo</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setNovoConteudo({ moduloPadrao: c.id })}><Plus className="h-4 w-4" />Novo conteúdo</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>}
                    </div>
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
  const tabelaModulos = tabelaDeModulos(cards, ordemMod, (o) => { setOrdemMod(o); setPageMod(1) }, marcadosMod, setMarcadosMod, 'Módulo')

  /** Barra de lote dos módulos (topo OU submódulos): Segmento, Ativar, Rascunho, Excluir sobre os cards/linhas marcados. */
  function barraLoteModulos(o: { total: number; lista: ModuloCard[]; marcados: Set<string>; setMarcados: React.Dispatch<React.SetStateAction<Set<string>>>; todosIds: string[]; filtrado: boolean; extra?: string }) {
    if (!(o.total > 0 && podeEditar)) return null
    const { marcados: mk, setMarcados: setMk } = o
    const limpar = () => setMk(new Set())
    return (
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
        {mk.size === 0 ? (
          <>
            <span className="text-muted-foreground"><span className="font-medium text-foreground">{o.total}</span> módulo{o.total === 1 ? '' : 's'}{!o.filtrado && o.extra} · marque cards para agir em massa nas aulas deles</span>
            <button type="button" onClick={() => setMk(new Set(o.lista.map((c) => c.id)))} className="ml-auto whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline">Selecionar esta página ({o.lista.length})</button>
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">{mk.size} módulo{mk.size === 1 ? '' : 's'} selecionado{mk.size === 1 ? '' : 's'}</span>
            {!o.filtrado && mk.size < o.todosIds.length && <button type="button" onClick={() => setMk(new Set(o.todosIds))} className="whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline">Selecionar todos ({o.todosIds.length})</button>}
            <button type="button" onClick={limpar} className="whitespace-nowrap text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar</button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {emLote && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Button size="sm" variant="outline" disabled={emLote} onClick={() => setPainelVis({ alvos: [...mk].map((id) => ({ tipo: 'modulo' as const, id })) })}><Users className="h-4 w-4" />Segmento</Button>
              <Button size="sm" variant="outline" disabled={emLote} onClick={() => aplicarLoteMod({ situacao: 'ativo' }, 'Ativar aulas', 'Tornar ativas', 'ativas', mk, limpar)}><Eye className="h-4 w-4" />Ativar</Button>
              <Button size="sm" variant="outline" disabled={emLote} onClick={() => aplicarLoteMod({ situacao: 'rascunho' }, 'Passar para rascunho', 'Passar para rascunho', 'em rascunho', mk, limpar)}><EyeOff className="h-4 w-4" />Rascunho</Button>
              <Button size="sm" variant="destructive" disabled={emLote} onClick={() => excluirModulosMarcados(mk, limpar)}><Trash2 className="h-4 w-4" />Excluir</Button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ═════════ VISÃO 1: módulos como cards ═════════
  const visaoModulos = (
    <div className="space-y-4">
      {toolbar}
      {buscando_ ? resultadosBusca : (
        <>
          {/* Filtros + ordenação */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={qMod} onChange={(e) => { setQMod(e.target.value); setPageMod(1) }} placeholder="Filtrar módulos por nome" className="pl-8" />
            </div>
            <select aria-label="Filtro" className={SELECT_CLS} value={filtroMod} onChange={(e) => { setFiltroMod(e.target.value as FiltroMod); setPageMod(1) }}>
              <option value="todos">Todos os módulos</option><option value="com_sub">Com submódulos</option><option value="programadas">Com aulas bloqueadas/com data</option><option value="rascunho">Com aulas em rascunho</option>
            </select>
            <select aria-label="Tipo de material" className={SELECT_CLS} value={matMod} onChange={(e) => { setMatMod(e.target.value as MaterialChave | 'todos'); setPageMod(1) }}>
              <option value="todos">Todos os tipos</option>{MATERIAIS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
            {vista === 'cards' && (
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground"><ArrowUpDown className="h-4 w-4" />
                <select aria-label="Ordenar" className={SELECT_CLS} value={ordemMod} onChange={(e) => { setOrdemMod(e.target.value as OrdemMod); setPageMod(1) }}>
                  <option value="ordem">Ordem do produto</option><option value="nome">Nome (A–Z)</option><option value="aulas">Mais aulas</option>
                </select></label>
            )}
            {podeEditar && <Button variant="outline" onClick={() => setReordenar(true)} disabled={topoIds.length < 2}><ArrowUpDown className="h-4 w-4" />Reordenar</Button>}
            {seletorVista}
          </div>

          {barraLoteModulos({ total: totalMod, lista: cards, marcados: marcadosMod, setMarcados: setMarcadosMod, todosIds: topoIds, filtrado: filtrosMod, extra: ` · ${totais.aulas} aulas` })}

          {carregando && cards.length === 0 ? <Carga texto="Carregando módulos…" /> : cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
              {filtrosMod ? 'Nenhum módulo encontrado com esses filtros.' : <>Este produto ainda não tem módulos nem aulas.{podeEditar && ' Comece por “Novo módulo”.'}</>}
            </div>
          ) : vista === 'cards' ? (
            <div className={cn(GRID_CARDS, carregando && 'opacity-60 transition-opacity')}>{cards.map((c) => cardDe(c, true))}</div>
          ) : tabelaModulos}
          <PaginacaoBib total={totalMod} page={pageMod} pp={ppMod} opcoesPP={vista === 'cards' ? PP_CARDS : PP_TABELA} selecionados={marcadosMod.size} carregando={carregando}
            onPage={setPageMod} onPP={(n) => { setPpMod(n); setPageMod(1) }} rotuloVazio="Nenhum módulo" />
        </>
      )}
    </div>
  )

  // ═════════ VISÃO 2: dentro do módulo ═════════
  const idxIrmao = irmaos.findIndex((i) => i.id === moduloId)
  const anterior = idxIrmao > 0 ? irmaos[idxIrmao - 1] : null
  const proximo = idxIrmao >= 0 && idxIrmao < irmaos.length - 1 ? irmaos[idxIrmao + 1] : null
  const cadeia = (() => {
    const out: ModuloRow[] = []
    let cur = moduloId ? nomeModulo.get(moduloId) : undefined
    while (cur && out.length < 6) { out.unshift(cur); cur = cur.pai_id ? nomeModulo.get(cur.pai_id) : undefined }
    return out
  })()
  const pai = cadeia.length > 1 ? cadeia[cadeia.length - 2] : null
  const todasIds = aulas.ids

  const visaoInterna = (
    <div className="space-y-4">
      {toolbar}
      {buscando_ ? resultadosBusca : (
        <>
          {/* Cabeçalho do módulo */}
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <button type="button" onClick={() => irModulo(pai?.id ?? null)} aria-label="Voltar" className="mr-1 flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => irModulo(null)} className="text-muted-foreground hover:text-foreground">Conteúdos</button>
              {cadeia.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1.5"><span className="text-muted-foreground">›</span>
                  {i < cadeia.length - 1 ? <button type="button" onClick={() => irModulo(c.id)} className="text-muted-foreground hover:text-foreground">{c.titulo}</button> : <span className="font-medium">{c.titulo}</span>}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{atual?.titulo ?? '…'}</h2>
                {atual && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{atual.aulasDiretas} aula{atual.aulasDiretas === 1 ? '' : 's'} · {atual.submodulos} submódulo{atual.submodulos === 1 ? '' : 's'}</span>
                    {resumoLiberacaoCard(atual).map((l) => <span key={l.texto} className={l.alerta ? 'font-medium text-foreground' : ''}>· {l.texto}</span>)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={!anterior} onClick={() => anterior && irModulo(anterior.id)} title={anterior?.titulo}><ChevronLeft className="h-4 w-4" />Anterior</Button>
                <Button variant="outline" size="sm" disabled={!proximo} onClick={() => proximo && irModulo(proximo.id)} title={proximo?.titulo}>Próximo<ChevronRight className="h-4 w-4" /></Button>
                {podeEditar && atual && <>
                  <Button variant="outline" size="sm" onClick={() => editarCard(atual)}><Pencil className="h-4 w-4" />Editar módulo</Button>
                  <Button variant="outline" size="sm" onClick={() => { setSel(null); setPainelVis({ alvos: [{ tipo: 'modulo', id: atual.id }], titulo: atual.titulo, aba: 'capa' }) }}><Users className="h-4 w-4" />Segmentos</Button>
                  <Button variant="outline" size="sm" onClick={() => setModuloDlg({ modulo: null, paiId: atual.id })}><FolderPlus className="h-4 w-4" />Submódulo</Button>
                  <Button size="sm" onClick={() => setNovoConteudo({ moduloPadrao: atual.id })}><Plus className="h-4 w-4" />Conteúdo</Button>
                </>}
              </div>
            </div>
          </div>

          {/* Submódulos: as MESMAS ferramentas da visão de módulos (busca, ordem, reordenar, vista, seleção/lote, paginação) */}
          {(subs.length > 0 || totalSub > 0 || !!qSub.trim()) && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submódulos <span className="font-normal normal-case">({totalSub}{qSub.trim() ? ' no filtro' : ''})</span></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-48 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={qSub} onChange={(e) => { setQSub(e.target.value); setPageSub(1) }} placeholder="Filtrar submódulos por nome" className="pl-8" />
                </div>
                {vista === 'cards' && (
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground"><ArrowUpDown className="h-4 w-4" />
                    <select aria-label="Ordenar submódulos" className={SELECT_CLS} value={ordemSub} onChange={(e) => { setOrdemSub(e.target.value as OrdemMod); setPageSub(1) }}>
                      <option value="ordem">Ordem do produto</option><option value="nome">Nome (A–Z)</option><option value="aulas">Mais aulas</option>
                    </select></label>
                )}
                {podeEditar && <Button variant="outline" onClick={() => setReordenarSub(true)} disabled={irmaosSub.length < 2}><ArrowUpDown className="h-4 w-4" />Reordenar</Button>}
                {seletorVista}
              </div>
              {barraLoteModulos({ total: totalSub, lista: subs, marcados: marcadosSub, setMarcados: setMarcadosSub, todosIds: irmaosSub, filtrado: !!qSub.trim(), extra: '' })}
              {subs.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">{carregando ? 'Carregando…' : 'Nenhum submódulo com esse filtro.'}</div>
              ) : vista === 'cards' ? (
                <div className={cn(GRID_CARDS, carregando && 'opacity-60 transition-opacity')}>{subs.map((c) => cardDeSub(c))}</div>
              ) : tabelaDeModulos(subs, ordemSub, (o) => { setOrdemSub(o); setPageSub(1) }, marcadosSub, setMarcadosSub, 'Submódulo')}
              <PaginacaoBib total={totalSub} page={pageSub} pp={ppSub} opcoesPP={vista === 'cards' ? PP_CARDS : PP_TABELA.filter((n) => n <= 60)} selecionados={marcadosSub.size} carregando={carregando}
                onPage={setPageSub} onPP={(n) => { setPpSub(n); setPageSub(1) }} rotuloVazio="Nenhum submódulo" />
            </div>
          )}

          {/* Aulas do módulo */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aulas deste módulo <span className="font-normal normal-case">({aulas.total}{qAula || matAula !== 'todos' ? ' no filtro' : ''})</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={qAula} onChange={(e) => { setQAula(e.target.value); setPageAula(1) }} placeholder="Buscar aula neste módulo" className="pl-8" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {([['todos', 'Todos', Object.values(aulas.materiais).reduce((a, b) => a + (b ?? 0), 0)], ...MATERIAIS.filter((m) => (aulas.materiais[m.v] ?? 0) > 0 || matAula === m.v).map((m) => [m.v, m.label, aulas.materiais[m.v] ?? 0] as const)] as [MaterialChave | 'todos', string, number][]).map(([v, label, n]) => (
                <button key={v} type="button" onClick={() => { setMatAula(v); setPageAula(1) }} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', matAula === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{label} <span className="tabular-nums opacity-70">{n}</span></button>
              ))}
            </div>

            {/* Barra de lote — AULAS (a mesma de antes) */}
            {aulas.total > 0 && (
              <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
                {marcados.size === 0 ? (
                  <>
                    <span className="text-muted-foreground"><span className="font-medium text-foreground">{aulas.total}</span> {aulas.total === 1 ? 'item' : 'itens'} · marque uma ou mais linhas para agir em lote</span>
                    {podeEditar && <button type="button" onClick={() => setMarcados(new Set(todasIds))} className="ml-auto whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline">Selecionar todas do módulo ({todasIds.length})</button>}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{marcados.size} selecionada{marcados.size === 1 ? '' : 's'}</span>
                    {marcados.size < todasIds.length && (
                      <button type="button" onClick={() => setMarcados(new Set(todasIds))} className="whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline">Selecionar todas do módulo ({todasIds.length})</button>
                    )}
                    <button type="button" onClick={() => setMarcados(new Set())} className="whitespace-nowrap text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar</button>
                    {podeEditar && (
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {emLote && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <Button size="sm" variant="outline" disabled={emLote} onClick={() => { setSel(null); setPainelVis({ alvos: [...marcados].map((id) => ({ tipo: 'aula' as const, id })), titulo: marcados.size === 1 ? aulas.itens.find((x) => marcados.has(x.id))?.titulo : undefined }) }}><Users className="h-4 w-4" />Segmento</Button>
                        <Button size="sm" variant="outline" disabled={emLote} onClick={() => aplicarLote({ situacao: 'ativo' }, 'Ativar aulas', 'Tornar ativas', 'ativas')}><Eye className="h-4 w-4" />Ativar</Button>
                        <Button size="sm" variant="outline" disabled={emLote} onClick={() => aplicarLote({ situacao: 'rascunho' }, 'Desativar aulas', 'Passar para rascunho', 'em rascunho')}><EyeOff className="h-4 w-4" />Rascunho</Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger disabled={emLote} className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted"><Lock className="h-4 w-4" />Acesso<ChevronDown className="h-3.5 w-3.5" /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => aplicarLote({ visibilidade: 'publico' }, 'Visibilidade', 'Tornar públicas', 'públicas')}>Público</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => aplicarLote({ visibilidade: 'privado' }, 'Visibilidade', 'Tornar privadas', 'privadas')}>Privado</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button size="sm" variant="outline" disabled={emLote} onClick={() => setMoverLote(true)}><FolderInput className="h-4 w-4" />Mover</Button>
                        <Button size="sm" variant="destructive" disabled={emLote} onClick={excluirMarcados}><Trash2 className="h-4 w-4" />Excluir</Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {carregando && aulas.itens.length === 0 ? <Carga texto="Carregando aulas…" /> : itensPagina.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                {qAula || matAula !== 'todos' ? 'Nenhuma aula com esses filtros.' : <>Nenhuma aula aqui.{podeEditar && ' Use “Conteúdo”.'}</>}
              </div>
            ) : (
              <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm', carregando && 'opacity-60 transition-opacity')}>{itensPagina.map((it) => linhaAula(it))}</div>
            )}
            <PaginacaoBib total={aulas.total} page={pageAula} pp={ppAula} opcoesPP={[25, 50, 100]} selecionados={marcados.size} carregando={carregando}
              onPage={setPageAula} onPP={(n) => { setPpAula(n); setPageAula(1) }} rotuloVazio="Nenhuma aula" />
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-5', moduloId && 'xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]')}>
      {moduloId ? visaoInterna : visaoModulos}

      {/* Detalhe da aula (só dentro do módulo) */}
      {moduloId && (
        <aside className="rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
          {sel ? <DetalheAula it={sel} podeEditar={podeEditar} visResumo={resumoRegrasAlvo(regrasPorAlvo.get(sel.id), nomeSegVis)} onVis={() => abrirVisAula(sel)} onEditar={() => setEditarItem({ item: sel, criar: false })} onAlterarTipo={() => setAlterarTipo(sel)} onMover={() => setMoverItem(sel)} onDuplicar={() => setDuplicarItem(sel)} onExcluir={() => excluirAula(sel)} /> : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground"><FileStack className="h-7 w-7 opacity-40" />Clique numa aula para ver os detalhes.</div>
              <div className="border-t pt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipos de conteúdo</div>
                <p className="text-xs text-muted-foreground">{TIPOS_CONTEUDO_LISTA.join(' · ')}. A aula aponta ao recurso — sem hospedar.</p>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Modais */}
      {moduloDlg && (
        <ModuloDialog produtoId={produtoId} modulo={moduloDlg.modulo} paiId={moduloDlg.paiId}
          modulosCount={moduloDlg.card?.submodulos} aulasCount={moduloDlg.card?.aulasDiretas}
          onClose={() => setModuloDlg(null)} onPronto={refresh}
          onSegmentos={moduloDlg.modulo ? (aba) => { const m = moduloDlg.modulo!; setModuloDlg(null); setSel(null); setPainelVis({ alvos: [{ tipo: 'modulo', id: m.id }], titulo: m.titulo, aba }) } : undefined} />
      )}
      {novoConteudo && (
        <NovoConteudoDialog tipoProduto={tipoProduto} modulos={modulos} moduloPadrao={novoConteudo.moduloPadrao} onClose={() => setNovoConteudo(null)}
          onContinuar={(s) => { setNovoConteudo(null); setEditarItem({ item: { modulo_id: s.moduloId, tipo_ref: s.tipoRef, subtipo: s.subtipo }, criar: true }) }} />
      )}
      {editarItem && (
        <EditarItemDialog tenantId={tenantId} produtoId={produtoId} modulos={modulos} item={editarItem.item} criar={editarItem.criar}
          onClose={() => setEditarItem(null)} onPronto={refresh} />
      )}
      {questoesMeta && <QuestoesMetaDialog produtoId={produtoId} itemId={questoesMeta.id} titulo={questoesMeta.titulo} onClose={() => setQuestoesMeta(null)} />}
      {moverItem && <MoverAulaDialog produtoId={produtoId} item={moverItem} modulos={modulos} onClose={() => setMoverItem(null)} onPronto={refresh} />}
      {duplicarItem && <DuplicarAulaDialog produtoId={produtoId} item={duplicarItem} modulos={modulos} onClose={() => setDuplicarItem(null)} onPronto={refresh} />}
      {alterarTipo && <AlterarTipoDialog produtoId={produtoId} item={alterarTipo} onClose={() => setAlterarTipo(null)} onPronto={() => { const it = alterarTipo; setAlterarTipo(null); if (it) setEditarItem({ item: it, criar: false }); refresh() }} />}
      {reordenar && <ReordenarModulosDialog produtoId={produtoId} modulos={modulos} onClose={() => setReordenar(false)} onPronto={refresh} />}
      {reordenarSub && moduloId && <ReordenarModulosDialog produtoId={produtoId} modulos={modulos} paiId={moduloId} onClose={() => setReordenarSub(false)} onPronto={refresh} />}
      {/* Visibilidade dos MÓDULOS marcados (a visão de módulos não tem painel lateral → diálogo) */}
      {painelVis && (
        <SegmentosDialog key={`${painelVis.aba ?? 'v'}:${painelVis.alvos.map((a) => a.id).join(',')}`} produtoId={produtoId} podeEditar={podeEditar} dados={visDados}
          alvos={painelVis.alvos} titulo={painelVis.titulo} titulos={titulosAlvos} imagens={imagensAlvos} abaInicial={painelVis.aba} onClose={() => setPainelVis(null)} onMudou={recarregarVis}
          onAplicarBase={aplicarBase} baseResumo={baseResumoPainel} />
      )}
      {moverLote && (
        <MoverAulasLoteDialog quantidade={marcados.size} modulos={modulos} onClose={() => setMoverLote(false)}
          onConfirmar={(destino) => { setMoverLote(false); aplicarLote({ modulo_id: destino }, 'Mover aulas', `Mover para “${modulos.find((m) => m.id === destino)?.titulo ?? ''}”`, 'movidas') }} />
      )}
    </div>
  )
}

function Carga({ texto }: { texto: string }) {
  return <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{texto}</div>
}

function DetalheAula({ it, podeEditar, visResumo, onVis, onEditar, onAlterarTipo, onMover, onDuplicar, onExcluir }: {
  it: ItemRow; podeEditar: boolean; visResumo: string | null; onVis: () => void
  onEditar: () => void; onAlterarTipo: () => void; onMover: () => void; onDuplicar: () => void; onExcluir: () => void
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
          <L k="Segmento" v={visResumo ?? 'Todos com acesso'} />
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
            <Button variant="outline" className="col-span-2" onClick={onVis}><Users className="h-4 w-4" />Segmento e liberação</Button>
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
/** Estado de liberação NA FRENTE da linha: cadeado enquanto a aula não liberou (ou "oculta" se configurada assim). */
function ChipLiberacao({ d }: { d: Disponibilidade | null | undefined }) {
  if (!d || d.tipo === 'na_matricula') return null
  if (d.tipo === 'data' && d.data && Date.parse(d.data) <= Date.now()) return <span className="shrink-0 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">liberada</span>
  const oculto = d.antes === 'oculto'
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
      {oculto ? <EyeOff className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{oculto ? 'oculta até liberar' : 'cadeado'}
    </span>
  )
}
function Lpendente({ k, icon }: { k: string; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 py-2"><dt className="flex items-center gap-1.5 text-muted-foreground">{icon}{k}</dt><dd className="font-medium text-muted-foreground">—</dd></div>
}
function L({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 truncate text-right font-medium">{v}</dd></div>
}
