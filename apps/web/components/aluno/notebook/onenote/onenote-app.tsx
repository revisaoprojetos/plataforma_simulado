'use client'
// Caderno (beta) — réplica da interface do Microsoft OneNote, em tela cheia (fixed inset-0 z-50), com o tema do tenant.
// ONDA 1: casca + navegação/estrutura. Orquestra o estado (árvore, seção/página ativas, painéis) e registra os comandos
// de navegação no barramento (contexto-cmd.tsx). Formatação/inserção/desenho: onda 2 registra handlers com useRegistrarComandos.
// Só fala com /api/aluno/notebook/** via cliente-caderno.ts (rotas existentes + lib/aluno/notebook-cliente.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, FolderPlus, Pencil, Trash2, Palette, Copy, Link2, ChevronsUpDown, IndentIncrease, IndentDecrease, Move, FileDown } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import * as api from './cliente-caderno'
import type { Regua } from '@/lib/aluno/notebook-tipos'
import { AbasSecao } from './abas-secao'
import { atalhoGlobal } from './atalhos'
import { BarraCompacta, BarraDesktop, BarraPlataforma, BarraTitulo, type Escopo, type MarcaTenant } from './barra-plataforma'
import { CanvasPagina } from './canvas-pagina'
import { ComandosTexto } from './comandos-texto'
import { useComandosDesenho } from './comandos-desenho'
import { atualizarDesenho, useEstadoDesenho } from './estado-desenho'
import { definirDonoFila } from '../fila-offline'
import { filaCriacao } from '../fila-criacao'
import { aquecerNoOcioso } from '../aquecer'
import { inserirAntesDe, posicaoNova, servidorAplicouNivel } from '@/lib/aluno/notebook-criacao'
import { novoUuid } from '@/lib/aluno/notebook-uuid'
import { OneNoteCmdProvider, useOneNoteCmd, useRegistrarComandos } from './contexto-cmd'
import { DialogoAtalhos, DialogoCorSecao, DialogoMoverCopiar } from './dialogos'
import { LARGURA_LISTA, ListaPaginas } from './lista-paginas'
import { MenuFlutuante, type ItemMenu } from './menu-flutuante'
import { reordenarLista } from './ordem-local'
import { ancestraisDe, grupoDe as grupoDeLista, organizarPaginas, vizinha } from './organizar-paginas'
import { PainelBusca } from './painel-busca'
import { PainelLixeira } from './painel-lixeira'
import { PainelNavegacao } from './painel-navegacao'
import { Ribbon } from './ribbon/ribbon'
import { corDaSecao, ehAuto, FONTE_UI, proximaCorSecao, type Arvore, type AutosaveApi, type EstadoSalvo, type ModoTela, type Ordenacao, type Pagina, type Secao, type Selecao } from './tipos'

const ZOOMS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]
// Fundos de página (chaves de PALETA_FUNDO) como tints dos tokens do tema, sem hex; no escuro viram tons escuros.
const tint = (cor: string, pct: number) => `color-mix(in srgb, ${cor} ${pct}%, var(--surface))`
const mix = (a: string, b: string, pa = 50) => `color-mix(in srgb, ${a} ${pa}%, ${b})`
const FUNDOS: Record<string, string> = {
  amarelo: tint('var(--gold)', 24), creme: tint('var(--gold)', 10), pessego: tint(mix('var(--gold)', 'var(--danger)', 65), 16), laranja: tint(mix('var(--gold)', 'var(--danger)', 45), 20),
  salmao: tint('var(--danger)', 14), rosa: tint('var(--pink)', 14), lilas: tint(mix('var(--brand)', 'var(--pink)', 60), 16), lavanda: tint('var(--brand)', 12),
  azul: tint('var(--info)', 16), azul_ceu: tint('var(--info)', 8), turquesa: tint(mix('var(--info)', 'var(--ok)'), 16), menta: tint('var(--ok)', 10),
  verde: tint('var(--ok)', 18), lima: tint(mix('var(--ok)', 'var(--gold)', 55), 18), areia: tint(mix('var(--gold)', 'var(--ink)', 55), 13), cinza: tint('var(--ink)', 8),
}
const CSS_FUNDOS = `.onenote-root{${Object.entries(FUNDOS).map(([k, v]) => `--nb-fundo-${k}:${v}`).join(';')}}`
const CSS_GLOBAL = [CSS_FUNDOS,
  '.onenote-root button{font-family:inherit}',
  '.onenote-hover:hover:not(:disabled){background:var(--chip)!important}',
  // o editor (contenteditable) NÃO leva o anel: ele cobriria a página inteira (min-height 50vh) com uma caixa roxa gigante; o cursor já indica o foco
  '.onenote-root :focus-visible:not(.ProseMirror){outline:2px solid var(--brand);outline-offset:-2px}',
  '.onenote-root ::selection{background:var(--chip)}',
  '.onenote-noscroll{scrollbar-width:none;-ms-overflow-style:none}.onenote-noscroll::-webkit-scrollbar{display:none}',
  '.onenote-root{overscroll-behavior:contain}',
  // lixeira por linha da lista de páginas: aparece no hover/foco/linha ativa e SEMPRE em telas de toque
  '.onenote-linha .onenote-lixo{opacity:0}',
  '.onenote-linha:hover .onenote-lixo,.onenote-linha:focus-within .onenote-lixo,.onenote-linha[aria-current=true] .onenote-lixo{opacity:1}',
  '@media (hover:none),(pointer:coarse){.onenote-linha .onenote-lixo{opacity:1}}',
  '.onenote-seta:hover .onenote-seta-i,.onenote-seta:active .onenote-seta-i{background:color-mix(in srgb, var(--brand) 12%, transparent)}',
  '.onenote-seta:focus-visible .onenote-seta-i{background:color-mix(in srgb, var(--brand) 12%, transparent)}',
  // barra superior mobile = .tb da barra brand-on do leitor (leitor-jus.html:95-97): hover 16%, aberto 26% + anel
  '.onenote-tb{color:color-mix(in srgb,var(--onBrand,#fff) 88%,transparent)}',
  '.onenote-tb:hover{background:color-mix(in srgb,var(--onBrand,#fff) 16%,transparent);color:var(--onBrand,#fff)}',
  '.onenote-tb[aria-expanded="true"]{background:color-mix(in srgb,var(--onBrand,#fff) 26%,transparent);color:var(--onBrand,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--onBrand,#fff) 35%,transparent)}',
  '.onenote-tb:focus-visible{outline-color:var(--onBrand,#fff)!important}',
  '.onenote-tb:disabled:hover{background:transparent}',
  // barra desktop: busca realça no foco; rótulos somem <=1400px (leitor-jus.html:1075); trilha colapsa progressivamente, sem quebrar linha
  '.onenote-busca:focus-within{background:color-mix(in srgb,var(--onBrand,#fff) 22%,transparent)!important}',
  '.onenote-busca input::placeholder{color:color-mix(in srgb,var(--onBrand,#fff) 70%,transparent)}',
  '@media (max-width:1400px){.onenote-lbl{display:none}}',
  '@media (max-width:1280px){.onenote-cr-cad{display:none!important}}',
  '@media (max-width:1180px){.onenote-cr-raiz,.onenote-cr-sec{display:none!important}}',
  '@keyframes onenote-sobe{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}.onenote-sheet{animation:onenote-sobe .22s ease}',
  '@media (prefers-reduced-motion:reduce){.onenote-root *{transition:none!important}.onenote-sheet{animation:none}}',
].join('')
const PREF = 'onenote:ui'
const modoDaLargura = (w: number): ModoTela => (w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop')
/** Painel lateral como gaveta sobre o canvas (mobile/tablet): desliza e fica invisível quando fechado. */
const gaveta = (lado: 'esq' | 'dir', aberto: boolean): React.CSSProperties => ({
  position: 'absolute', top: 0, bottom: 0, [lado === 'esq' ? 'left' : 'right']: 0, zIndex: 41, display: 'flex', maxWidth: '88%',
  transform: aberto ? 'none' : `translateX(${lado === 'esq' ? '-100%' : '100%'})`, visibility: aberto ? 'visible' : 'hidden',
  transition: 'transform .2s ease, visibility 0s linear ' + (aberto ? '0s' : '.2s'), boxShadow: aberto ? '0 0 24px -6px color-mix(in srgb, var(--ink) 50%, transparent)' : 'none',
})

export function OneNoteApp(props: { voltarHref: string; paginaInicialId?: string | null; estudanteId?: string; marca?: MarcaTenant }) {
  // Dono da fila offline (IndexedDB): se o navegador trocou de conta, a fila antiga é apagada antes de qualquer leitura.
  useEffect(() => { if (props.estudanteId) definirDonoFila(props.estudanteId) }, [props.estudanteId])
  // baixa em segundo plano o JS do editor/folha: a 1ª página aberta/criada não espera download
  useEffect(() => aquecerNoOcioso(), [])
  // Ao desmontar a casca, o store de módulo do desenho não pode ficar "preso" (folha ativa, ações e zoom apontando p/ componentes mortos).
  useEffect(() => () => { atualizarDesenho({ folhaAtiva: false, acoes: { desfazer: null, refazer: null }, pedirZoom: null }) }, [])
  return <OneNoteCmdProvider><Casca voltarHref={props.voltarHref} paginaInicialId={props.paginaInicialId} marca={props.marca ?? { logo: null, nome: '' }} /></OneNoteCmdProvider>
}

type Ctx = { x: number; y: number; itens: ItemMenu[] }

function Casca({ voltarHref, paginaInicialId, marca }: { voltarHref: string; paginaInicialId?: string | null; marca: MarcaTenant }) {
  const cmd = useOneNoteCmd()
  const raiz = useRef<HTMLDivElement>(null)
  const buscaRef = useRef<HTMLInputElement>(null)
  const ultimaPorSecao = useRef(new Map<string, string>())

  const [arv, setArv] = useState<Arvore>({ secoes: [], paginas: [] })
  const [carga, setCarga] = useState<'carregando' | 'ok' | 'erro' | 'migracao'>('carregando')
  const [secaoId, setSecaoId] = useState<string | null>(null)
  const [sel, setSel] = useState<Selecao>(null)
  const [avisoInfo, setAvisoInfo] = useState(false)
  const [recolhidas, setRecolhidas] = useState<ReadonlySet<string>>(new Set())
  const [navRecolhido, setNavRecolhido] = useState(false)
  const [listaVisivel, setListaVisivel] = useState(true)
  const [listaLargura, setListaLargura] = useState(LARGURA_LISTA.padrao)
  // Layout responsivo: mobile <768, tablet 768-1023, desktop >=1024. Estado inicial 'desktop' + medido=false (sem painéis até medir).
  const [modo, setModo] = useState<ModoTela>('desktop')
  const [medido, setMedido] = useState(false)
  const [drawerNav, setDrawerNav] = useState(false)
  const [drawerLista, setDrawerLista] = useState(false)
  const [sinalRecolher, setSinalRecolher] = useState(0)
  const [vv, setVv] = useState<{ h: number; t: number } | null>(null)
  const estreito = modo !== 'desktop'
  const [zoomIdx, setZoomIdx] = useState(3)
  const [telaCheia, setTelaCheia] = useState(false)
  const [salvo, setSalvo] = useState<EstadoSalvo | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [avisoAcao, setAvisoAcao] = useState<{ rotulo: string; fn: () => void } | null>(null)
  const [criando, setCriando] = useState<ReadonlySet<string>>(new Set()) // páginas criadas de forma otimista, aguardando o servidor
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [busca, setBusca] = useState({ q: '', escopo: 'caderno' as Escopo, aberta: false })
  const [dlg, setDlg] = useState<
    | { t: 'mover'; id: string } | { t: 'cor'; id: string } | { t: 'atalhos' } | { t: 'lixeira' } | null>(null)

  const toast = useCallback((m: string, info = false) => { setAviso(m); setAvisoAcao(null); setAvisoInfo(info); window.setTimeout(() => setAviso((a) => (a === m ? null : a)), 5000) }, [])
  /** Erro com botão de ação (ex.: "Tentar de novo"); fica 12 s. */
  const toastAcao = useCallback((m: string, rotulo: string, fn: () => void, info = false) => {
    setAviso(m); setAvisoInfo(info); setAvisoAcao({ rotulo, fn })
    window.setTimeout(() => { setAviso((a) => (a === m ? null : a)); setAvisoAcao((a) => (a?.fn === fn ? null : a)) }, 12000)
  }, [])
  /** Resposta de PATCH/POST da fase 2: 503 migracao_pendente => aviso discreto (nao e erro do aluno). */
  const falhou = (r: { status: number; code?: string }, msg: string) => (api.migracaoPendente(r) ? toast('Este recurso será liberado em breve.', true) : toast(msg))

  // ---------------------------------------------------------------- preferências + responsivo
  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(PREF) ?? 'null')
      if (j) {
        if (typeof j.nav === 'boolean') setNavRecolhido(j.nav)
        if (typeof j.lista === 'boolean') setListaVisivel(j.lista)
        if (typeof j.larg === 'number') setListaLargura(Math.max(LARGURA_LISTA.min, Math.min(LARGURA_LISTA.max, j.larg)))
      }
    } catch { /* sem storage */ }
    // resize/visualViewport disparam em rajada (teclado virtual, rolagem): coalesce com rAF e só faz setState se o valor mudou.
    let rMedir = 0, rVv = 0
    const medir = () => {
      const m = modoDaLargura(window.innerWidth)
      setModo((anterior) => { if (anterior !== m) { setDrawerNav(false); setDrawerLista(false) } return m }) // cruzou o breakpoint: aplica o padrão (fechado)
      setMedido(true)
    }
    const agMedir = () => { if (!rMedir) rMedir = requestAnimationFrame(() => { rMedir = 0; medir() }) }
    medir(); window.addEventListener('resize', agMedir)
    // Teclado virtual: acompanha a área visível (visualViewport) em telas estreitas.
    const v = window.visualViewport
    const ajustar = () => {
      const novo = v && window.innerWidth < 1024 ? { h: Math.round(v.height), t: Math.round(v.offsetTop) } : null
      setVv((a) => (a === novo || (a && novo && a.h === novo.h && a.t === novo.t) ? a : novo))
    }
    const agVv = () => { if (!rVv) rVv = requestAnimationFrame(() => { rVv = 0; ajustar() }) }
    ajustar(); v?.addEventListener('resize', agVv); v?.addEventListener('scroll', agVv)
    const fs = () => setTelaCheia(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fs)
    return () => {
      window.removeEventListener('resize', agMedir); document.removeEventListener('fullscreenchange', fs); v?.removeEventListener('resize', agVv); v?.removeEventListener('scroll', agVv)
      if (rMedir) cancelAnimationFrame(rMedir); if (rVv) cancelAnimationFrame(rVv)
    }
  }, [])
  useEffect(() => { try { localStorage.setItem(PREF, JSON.stringify({ nav: navRecolhido, lista: listaVisivel, larg: listaLargura })) } catch { /* ignora */ } }, [navRecolhido, listaVisivel, listaLargura])

  // Esc fecha o painel aberto (mobile/tablet).
  useEffect(() => {
    if (!drawerNav && !drawerLista) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawerNav(false); setDrawerLista(false) } }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [drawerNav, drawerLista])
  const alternarNav = () => { setDrawerLista(false); setDrawerNav((v) => !v) }
  const alternarLista = () => { setDrawerNav(false); setDrawerLista((v) => !v) }

  // ---------------------------------------------------------------- dados
  const carregar = useCallback(async (inicial = false) => {
    if (inicial) setCarga('carregando')
    const r = await api.carregarArvore()
    if (!r.ok || !r.dados) { setCarga(r.code === 'migracao_pendente' ? 'migracao' : 'erro'); return }
    const a: Arvore = { notebook: r.dados.notebook, secoes: r.dados.secoes ?? [], paginas: r.dados.paginas ?? [] }
    setArv(a); setCarga('ok')
    if (!inicial) return
    const alvo = paginaInicialId ? a.paginas.find((p) => p.id === paginaInicialId) : null
    if (alvo) { setSecaoId(alvo.secao_id); setSel({ tipo: 'pagina', id: alvo.id }); return }
    const s = a.secoes.find((x) => !ehAuto(x)) ?? a.secoes[0]
    if (s) { setSecaoId(s.id); const p = a.paginas.find((x) => x.secao_id === s.id); if (p) setSel({ tipo: 'pagina', id: p.id }) }
  }, [paginaInicialId])
  useEffect(() => { void carregar(true) }, [carregar])

  const arvRef = useRef(arv); arvRef.current = arv
  const secoes = arv.secoes
  const secao = useMemo(() => secoes.find((s) => s.id === secaoId) ?? null, [secoes, secaoId])
  const paginasSecao = useMemo(() => arv.paginas.filter((p) => p.secao_id === secaoId), [arv.paginas, secaoId])
  const ordenacao: Ordenacao = secao?.ordenar_por ?? 'manual'
  const linhas = useMemo(() => organizarPaginas(paginasSecao, recolhidas), [paginasSecao, recolhidas])
  const paginaSel = sel?.tipo === 'pagina' ? arv.paginas.find((p) => p.id === sel.id) ?? null : null
  const nomeSecao = useCallback((id: string) => secoes.find((s) => s.id === id)?.nome ?? '', [secoes])
  const daSecao = useCallback((secId: string) => arv.paginas.filter((p) => p.secao_id === secId), [arv.paginas]) // ordem final do servidor

  // Autosave da página aberta (exposto pelo corpo): o PATCH de nível/aparência avança a versão no servidor; em vez de REMONTAR o editor
  // (perdia foco/seleção/desfazer), mandamos o que está pendente (flush) e atualizamos só a versão-base do autosave.
  const autosaveApi = useRef<AutosaveApi | null>(null)
  const aoAutosave = useCallback((a: AutosaveApi | null) => { autosaveApi.current = a }, [])
  const apDaPagina = (id: string): AutosaveApi | null => (sel?.tipo === 'pagina' && sel.id === id ? autosaveApi.current : null)
  const versaoDoPatch = (r: { dados: { versao?: unknown } | null }) => (typeof r.dados?.versao === 'number' ? r.dados.versao : undefined)

  const atualizarPagina = useCallback((id: string, patch: Partial<Pagina>) =>
    setArv((a) => ({ ...a, paginas: a.paginas.map((p) => (p.id === id ? { ...p, ...patch } : p)) })), [])
  const ajustarQtd = (a: Arvore, secId: string, d: number): Arvore => ({ ...a, secoes: a.secoes.map((s) => (s.id === secId ? { ...s, qtd_paginas: Math.max(0, s.qtd_paginas + d) } : s)) })

  // ---------------------------------------------------------------- navegação
  const abrirPaginaDe = (a: Arvore, id: string) => {
    const p = a.paginas.find((x) => x.id === id); if (!p) return
    setSecaoId(p.secao_id); setSel({ tipo: 'pagina', id }); ultimaPorSecao.current.set(p.secao_id, id)
    const anc = ancestraisDe(a.paginas.filter((x) => x.secao_id === p.secao_id), id)
    if (anc.length) setRecolhidas((r) => { const n = new Set(r); anc.forEach((x) => n.delete(x)); return n })
    setDrawerNav(false)
  }
  const abrirPagina = (id: string) => abrirPaginaDe(arv, id)

  const selecionarSecao = (id: string) => {
    const s = secoes.find((x) => x.id === id); if (!s) return
    setSecaoId(id); setDrawerNav(false)
    if (ehAuto(s)) { setSel({ tipo: 'auto', secaoId: id, auto: s.tipo === 'auto_erros' ? 'erros' : 'favoritos' }); return }
    const ps = arv.paginas.filter((p) => p.secao_id === id)
    const lembrada = ultimaPorSecao.current.get(id)
    const alvo = ps.find((p) => p.id === lembrada) ?? ps[0]
    setSel(alvo ? { tipo: 'pagina', id: alvo.id } : null)
  }
  const irParaSecao = (delta: 1 | -1) => {
    if (!secoes.length) return
    const i = secoes.findIndex((s) => s.id === secaoId)
    selecionarSecao(secoes[(i + delta + secoes.length) % secoes.length].id)
  }
  const irParaPagina = (alvo: 'prox' | 'ant' | 'primeira' | 'ultima') => {
    if (!linhas.length) return
    const atual = sel?.tipo === 'pagina' ? sel.id : null
    const id = alvo === 'primeira' ? linhas[0].pg.id : alvo === 'ultima' ? linhas[linhas.length - 1].pg.id : vizinha(linhas, atual, alvo === 'prox' ? 1 : -1)
    if (id) abrirPagina(id)
  }

  // ---------------------------------------------------------------- seções
  // Páginas NOVAS nascem como folha livre (estilo OneNote: clicar e digitar, desenhar); a página de texto segue disponível no "+" da lista.
  // CRIAÇÃO OTIMISTA: a página entra na árvore e abre em branco NA HORA (id do cliente); o POST segue em segundo plano (serializado, ver
  // lib/aluno/notebook-criacao.ts) e o autosave dela espera essa criação. Falha => remove a página, volta a seleção e oferece "Tentar de novo".
  const novaPaginaEm = (secId: string, tipo: 'texto' | 'folha_livre' = 'folha_livre', subDe?: Pagina) => {
    const lista = daSecao(secId)
    const pos = posicaoNova(lista, subDe?.id ?? null)
    const id = novoUuid(), opId = novoUuid()
    const agora = new Date().toISOString()
    const nova: Pagina = { id, secao_id: secId, titulo: 'Sem título', tipo_pagina: tipo, ordem: pos.ordem, nivel: pos.nivel, criado_em: agora, atualizado_em: agora }
    const selAnterior = sel, secAnterior = secaoId
    setArv((a) => ajustarQtd({ ...a, paginas: inserirAntesDe(a.paginas, nova, pos.antesDeId) }, secId, 1))
    setCriando((c) => new Set(c).add(id))
    const fim = () => setCriando((c) => { const n = new Set(c); n.delete(id); return n })
    void filaCriacao.registrar(id, async () => {
      const r = await api.criarPagina(secId, tipo, { id, clientOpId: opId, antesDeId: pos.antesDeId, nivel: pos.nivel })
      const p = r.dados?.pagina
      if (!r.ok || !p) {
        // desfaz o otimismo
        setArv((a) => ajustarQtd({ ...a, paginas: a.paginas.filter((x) => x.id !== id) }, secId, -1))
        setSel((cur) => (cur?.tipo === 'pagina' && cur.id === id ? selAnterior : cur))
        setSecaoId((cur) => (cur === secId ? secAnterior ?? cur : cur))
        fim()
        if (api.migracaoPendente(r)) toast('Este recurso será liberado em breve.', true)
        else toastAcao('Não foi possível criar a página.', 'Tentar de novo', () => novaPaginaEm(secId, tipo, subDe))
        return null
      }
      // reconcilia com o servidor (ordem/nível/datas); se o servidor ainda ignora `id`, troca o id local pelo real
      const real: string = p.id
      setArv((a) => ({ ...a, paginas: a.paginas.map((x) => (x.id === id ? { ...x, id: real, ordem: p.ordem ?? x.ordem, criado_em: p.criado_em ?? x.criado_em, atualizado_em: p.atualizado_em ?? x.atualizado_em, ...(typeof p.nivel === 'number' ? { nivel: p.nivel } : {}) } : x)) }))
      if (real !== id) { setSel((cur) => (cur?.tipo === 'pagina' && cur.id === id ? { tipo: 'pagina', id: real } : cur)); ultimaPorSecao.current.set(secId, real) }
      fim()
      // subpágina: se o servidor não aplicou posição/nível no POST, completa em segundo plano (sem recarregar a árvore)
      if (subDe && !servidorAplicouNivel(pos.nivel, p.nivel)) {
        const m = await api.moverPagina(real, secId, pos.antesDeId)
        const n = m.ok ? await api.definirNivel(real, pos.nivel) : m
        if (!n.ok) falhou(n, 'Página criada, mas não foi possível torná-la subpágina.')
        else {
          const v = (n as { dados?: { versao?: unknown } }).dados?.versao
          if (typeof v === 'number') return v
        }
      }
      return typeof p.versao === 'number' ? p.versao : 1
    }, { tipo, secaoId: secId })
    setSecaoId(secId); setSel({ tipo: 'pagina', id }); ultimaPorSecao.current.set(secId, id)
    window.setTimeout(() => document.getElementById('nb-titulo')?.focus(), 150)
  }
  const novaPagina = (tipo: 'texto' | 'folha_livre' = 'folha_livre') => {
    if (!secao || ehAuto(secao)) { toast('Escolha uma seção para adicionar a página.'); return }
    void novaPaginaEm(secao.id, tipo)
  }
  const novaSubpagina = () => {
    if (!secao || ehAuto(secao) || !paginaSel) { toast('Abra uma página para criar uma subpágina.'); return }
    void novaPaginaEm(secao.id, 'folha_livre', paginaSel)
  }
  const novaSecao = async () => {
    const nome = await pedirTexto({ titulo: 'Nova seção', label: 'Nome da seção', confirmar: 'Criar' })
    if (!nome?.trim()) return
    const r = await api.criarSecao(nome.trim().slice(0, 100), proximaCorSecao(secoes))
    if (!r.ok || !r.dados?.secao) { toast('Não foi possível criar a seção.'); return }
    const s: Secao = { qtd_paginas: 0, tipo: 'manual', ordem: 0, ...r.dados.secao }
    setArv((a) => { const i = a.secoes.findIndex(ehAuto); const arr = [...a.secoes]; arr.splice(i < 0 ? arr.length : i, 0, s); return { ...a, secoes: arr } })
    setSecaoId(s.id); setSel(null)
    void novaPaginaEm(s.id)
  }
  const renomearSecao = async (s: Secao) => {
    const nome = await pedirTexto({ titulo: 'Renomear seção', label: 'Nome da seção', valorInicial: s.nome, confirmar: 'Salvar' })
    if (!nome?.trim() || nome.trim() === s.nome) return
    const antes = arv.secoes
    setArv((a) => ({ ...a, secoes: a.secoes.map((x) => (x.id === s.id ? { ...x, nome: nome.trim() } : x)) }))
    const r = await api.editarSecao(s.id, { nome: nome.trim().slice(0, 100) })
    if (!r.ok) { setArv((a) => ({ ...a, secoes: antes })); toast('Não foi possível renomear.') }
  }
  const excluirSecao = async (s: Secao) => {
    if (!(await confirmar({ titulo: 'Excluir seção', mensagem: `Excluir a seção "${s.nome}" e suas ${s.qtd_paginas} página(s)? Você poderá restaurá-la pela lixeira.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await api.excluirSecao(s.id)
    if (!r.ok) { toast('Não foi possível excluir a seção.'); return }
    const restantes = secoes.filter((x) => x.id !== s.id)
    setArv((a) => ({ ...a, secoes: a.secoes.filter((x) => x.id !== s.id), paginas: a.paginas.filter((p) => p.secao_id !== s.id) }))
    if (secaoId === s.id) {
      const prox = restantes.find((x) => !ehAuto(x)) ?? restantes[0]
      setSecaoId(prox?.id ?? null); setSel(null)
      if (prox) { const p = arv.paginas.find((x) => x.secao_id === prox.id); if (p) setSel({ tipo: 'pagina', id: p.id }) }
    }
  }
  const corSecao = async (id: string, chave: string) => {
    setDlg(null)
    const antes = arv.secoes
    setArv((a) => ({ ...a, secoes: a.secoes.map((x) => (x.id === id ? { ...x, cor: chave } : x)) }))
    const r = await api.editarSecao(id, { cor: chave })
    if (!r.ok) { setArv((a) => ({ ...a, secoes: antes })); toast('Não foi possível mudar a cor.') }
  }
  const reordenarSecao = async (id: string, entre: api.Entre) => {
    const antes = arv.secoes
    setArv((a) => ({ ...a, secoes: reordenarLista(a.secoes, id, entre) }))
    const r = await api.editarSecao(id, { entre })
    if (!r.ok) { setArv((a) => ({ ...a, secoes: antes })); toast('Não foi possível reordenar.') }
  }

  // ---------------------------------------------------------------- páginas
  /** Exclui (lixeira) SEM diálogo: toast "Página movida para a lixeira · Desfazer". Espera a criação otimista e o autosave pendente. */
  const excluirPagina = async (pg: Pagina) => {
    if (filaCriacao.pendente(pg.id)) { await filaCriacao.aguardar(pg.id); if (!arvRef.current.paginas.some((x) => x.id === pg.id)) return }
    const ap = apDaPagina(pg.id)
    await ap?.flush()
    const r = await api.excluirPagina(pg.id)
    if (!r.ok) { toast('Não foi possível excluir a página.'); return }
    const v1 = vizinha(linhas, pg.id, 1); const prox = v1 && v1 !== pg.id ? v1 : vizinha(linhas, pg.id, -1)
    setArv((a) => ajustarQtd({ ...a, paginas: a.paginas.filter((p) => p.id !== pg.id) }, pg.secao_id, -1))
    if (sel?.tipo === 'pagina' && sel.id === pg.id) setSel(prox && prox !== pg.id ? { tipo: 'pagina', id: prox } : null)
    toastAcao('Página movida para a lixeira.', 'Desfazer', () => void restaurarExcluida(pg), true)
  }
  const restaurarExcluida = async (pg: Pagina) => {
    const r = await api.restaurarPagina(pg.id)
    if (!r.ok) { toast('Não foi possível restaurar a página.'); return }
    await carregar()
    setSecaoId(pg.secao_id); setSel({ tipo: 'pagina', id: pg.id }); ultimaPorSecao.current.set(pg.secao_id, pg.id)
    toast('Página restaurada.', true)
  }
  /** Nível absoluto (0..2). O servidor faz o clamp; recarrega a árvore (ordem/agrupamento são do servidor). */
  const definirNivelPagina = async (pg: Pagina, nivel: number) => {
    if (nivel > 0 && daSecao(pg.secao_id).findIndex((x) => x.id === pg.id) <= 0) { toast('A primeira página da seção não pode ser subpágina.'); return }
    const antes = pg.nivel ?? 0
    const ap = apDaPagina(pg.id)
    await ap?.flush()
    atualizarPagina(pg.id, { nivel })
    const r = await api.definirNivel(pg.id, nivel)
    if (!r.ok) { atualizarPagina(pg.id, { nivel: antes }); falhou(r, 'Não foi possível mudar o nível da página.'); return }
    const v = versaoDoPatch(r); if (ap && v !== undefined) ap.setVersaoBase(v) // sem remontar o editor
    await carregar()
  }
  const moverNaLista = async (id: string, entre: api.Entre, nivel: 0 | 1) => {
    const pg = arv.paginas.find((p) => p.id === id); if (!pg) return
    const grupo = grupoDeLista(daSecao(pg.secao_id), id)
    if (grupo.length > 1 && grupo.slice(1).some((g) => g.id === entre.depois_id)) return // soltou dentro do próprio grupo
    const ap = apDaPagina(id)
    await ap?.flush()
    const r = await api.moverPagina(id, pg.secao_id, entre.depois_id ?? null)
    if (!r.ok) { falhou(r, 'Não foi possível mover a página.'); await carregar(); return }
    const alvoNivel = grupo.length > 1 ? 0 : nivel
    if (alvoNivel !== (pg.nivel ?? 0)) { const n = await api.definirNivel(id, alvoNivel); if (!n.ok) falhou(n, 'Não foi possível mudar o nível da página.') }
    await carregar()
    // o servidor pode ter avançado a versão (mover/nível): relê só a versão e atualiza a base do autosave (sem remontar o editor)
    if (ap) { const v = await api.lerVersao(id); if (v != null) ap.setVersaoBase(v) }
  }
  const moverOuCopiar = async (id: string, destino: string, copiar: boolean) => {
    setDlg(null)
    const pg = arv.paginas.find((p) => p.id === id); if (!pg || destino === pg.secao_id) return
    const r = copiar ? await api.copiarPagina(id, destino) : await api.moverPagina(id, destino, null)
    if (!r.ok) { toast(copiar ? 'Não foi possível copiar a página.' : 'Não foi possível mover a página.'); return }
    await carregar()
    if (!copiar && sel?.tipo === 'pagina' && sel.id === id) setSecaoId(destino)
    toast(`Página ${copiar ? 'copiada' : 'movida'} para “${nomeSecao(destino)}”.`, true)
  }
  const soltarPaginaEmSecao = (pid: string, destino: string) => void moverOuCopiar(pid, destino, false)
  const copiarLink = async (pg: Pagina) => {
    const url = `${window.location.origin}${window.location.pathname}?pagina=${pg.id}`
    try { await navigator.clipboard.writeText(url); toast('Link copiado.') } catch { toast('Não foi possível copiar o link.') }
  }
  const mais = async () => {
    if (!secao) return
    const r = await api.carregarMaisPaginas(secao.id, paginasSecao.length)
    const novas = r.dados?.paginas ?? []
    if (!r.ok || !novas.length) return
    setArv((a) => { const ids = new Set(a.paginas.map((p) => p.id)); return { ...a, paginas: [...a.paginas, ...novas.filter((p: Pagina) => !ids.has(p.id))] } })
  }
  const definirOrdenacao = async (o: Ordenacao) => {
    if (!secao) return
    const r = await api.definirOrdenacaoSecao(secao.id, o)
    if (!r.ok) { falhou(r, 'Não foi possível mudar a ordenação.'); return }
    setArv((a) => ({ ...a, secoes: a.secoes.map((x) => (x.id === secao.id ? { ...x, ordenar_por: o } : x)) }))
    await carregar()
  }
  const aparencia = async (patch: { fundo?: string | null; regua?: Regua | null }) => {
    if (!paginaSel) return
    const antes = { fundo: paginaSel.fundo, regua: paginaSel.regua }
    const ap = apDaPagina(paginaSel.id)
    await ap?.flush()
    atualizarPagina(paginaSel.id, patch)
    const r = await api.definirAparencia(paginaSel.id, patch)
    if (!r.ok) { atualizarPagina(paginaSel.id, antes); falhou(r, 'Não foi possível mudar a aparência da página.'); return }
    const v = versaoDoPatch(r); if (ap && v !== undefined) ap.setVersaoBase(v) // o PATCH avançou a versão: atualiza a base do autosave (sem remontar)
  }
  const exportar = async (formato: 'pdf' | 'docx') => {
    if (!paginaSel) { toast('Abra uma página para exportar.'); return }
    if (paginaSel.tipo_pagina === 'folha_livre' && formato === 'docx') { toast('A folha livre só pode ser exportada em PDF.'); return }
    try {
      const r = await fetch(api.urlExportar(paginaSel.id, formato), { credentials: 'same-origin' })
      if (!r.ok) { const j = await r.json().catch(() => null); toast(j?.message ?? 'Não foi possível exportar.'); return }
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a'); a.href = url; a.download = `${(paginaSel.titulo || 'pagina').replace(/[^\w\- ]+/g, '').trim() || 'pagina'}.${formato}`
      document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch { toast('Não foi possível exportar.') }
  }
  const alternarFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void raiz.current?.requestFullscreen?.().catch(() => toast('Tela cheia não permitida neste contexto.'))
  }

  // ---------------------------------------------------------------- menus de contexto
  const posicao = (e: React.MouseEvent) => {
    e.preventDefault?.(); e.stopPropagation?.()
    if (typeof e.clientX === 'number' && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: r.left + 16, y: r.bottom }
  }
  const menuSecao = (e: React.MouseEvent, s: Secao) => {
    const p = posicao(e); const auto = ehAuto(s)
    setCtx({ ...p, itens: [
      { rotulo: 'Nova seção', icone: FolderPlus, atalho: 'Ctrl+T', onClick: () => void novaSecao() },
      { rotulo: 'Renomear seção', icone: Pencil, desabilitado: auto, onClick: () => void renomearSecao(s) },
      { rotulo: 'Cor da seção…', icone: Palette, desabilitado: auto, onClick: () => setDlg({ t: 'cor', id: s.id }) },
      { separador: true },
      { rotulo: 'Excluir seção', icone: Trash2, perigo: true, desabilitado: auto, onClick: () => void excluirSecao(s) },
    ] })
  }
  const menuPagina = (e: React.MouseEvent, pg: Pagina) => {
    const p = posicao(e); const temFilhos = grupoDeLista(daSecao(pg.secao_id), pg.id).length > 1; const nivel = pg.nivel ?? 0
    const itens: ItemMenu[] = [
      { rotulo: 'Excluir', icone: Trash2, perigo: true, onClick: () => void excluirPagina(pg) },
      { rotulo: 'Mover ou copiar…', icone: Move, atalho: 'Ctrl+Alt+M', onClick: () => setDlg({ t: 'mover', id: pg.id }) },
      { rotulo: nivel >= 1 ? 'Promover subpágina' : 'Tornar subpágina', icone: nivel >= 1 ? IndentDecrease : IndentIncrease, onClick: () => void definirNivelPagina(pg, nivel >= 1 ? nivel - 1 : 1) },
      { rotulo: 'Nova subpágina', icone: FilePlus2, atalho: 'Ctrl+Shift+Alt+N', onClick: () => { abrirPagina(pg.id); void novaPaginaEm(pg.secao_id, 'folha_livre', pg) } },
      { rotulo: 'Copiar link para a página', icone: Link2, onClick: () => void copiarLink(pg) },
    ]
    if (temFilhos) itens.push({ rotulo: recolhidas.has(pg.id) ? 'Expandir subpáginas' : 'Recolher subpáginas', icone: ChevronsUpDown, onClick: () => alternarRecolher(pg.id) })
    itens.push({ separador: true }, { rotulo: 'Exportar PDF', icone: FileDown, onClick: () => { abrirPagina(pg.id); window.setTimeout(() => void exportar('pdf'), 50) } }, { rotulo: 'Duplicar para…', icone: Copy, onClick: () => setDlg({ t: 'mover', id: pg.id }) })
    setCtx({ ...p, itens })
  }
  const alternarRecolher = (id: string) => setRecolhidas((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // ---------------------------------------------------------------- pesquisa
  const abrirBusca = (escopo?: Escopo) => {
    setBusca((b) => ({ ...b, escopo: escopo ?? b.escopo, aberta: true }))
    window.setTimeout(() => { buscaRef.current?.focus(); buscaRef.current?.select() }, 0)
  }
  const aoBuscar = (paginaId: string, secId: string) => {
    setBusca((b) => ({ ...b, aberta: false }))
    if (!arv.paginas.some((p) => p.id === paginaId)) {
      const a2: Arvore = { ...arv, paginas: [...arv.paginas, { id: paginaId, secao_id: secId, titulo: '', ordem: 0, nivel: 0 }] }
      setArv(a2); abrirPaginaDe(a2, paginaId)
    } else abrirPagina(paginaId)
  }

  // ---------------------------------------------------------------- comandos (barramento)
  const zoom = ZOOMS[zoomIdx]
  useEffect(() => {
    cmd.definirEstado('exibir.navegacao', !navRecolhido); cmd.definirEstado('exibir.lista_paginas', listaVisivel); cmd.definirEstado('exibir.tela_cheia', telaCheia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRecolhido, listaVisivel, telaCheia])

  useComandosDesenho()
  const desenho = useEstadoDesenho() // folha livre aberta: desfazer/refazer são da folha (comandos-desenho.tsx), mesmo com editor de caixa ativo
  useRegistrarComandos({
    'arquivo.nova_pagina': () => novaPagina(), 'arquivo.nova_secao': () => novaSecao(), 'pagina.subpagina': () => novaSubpagina(),
    ...(paginaSel ? { 'pagina.mover': () => setDlg({ t: 'mover', id: paginaSel.id }), 'pagina.excluir': () => void excluirPagina(paginaSel) } : {}),
    ...(secao && !ehAuto(secao) ? { 'secao.excluir': () => void excluirSecao(secao) } : {}),
    'arquivo.exportar_pdf': () => exportar('pdf'), 'arquivo.exportar_docx': () => exportar('docx'), 'arquivo.imprimir': () => window.print(),
    'historico.lixeira': () => setDlg({ t: 'lixeira' }), 'ajuda.atalhos': () => setDlg({ t: 'atalhos' }),
    'exibir.normal': () => { setNavRecolhido(false); setListaVisivel(true); setZoomIdx(3) },
    'exibir.tela_cheia': alternarFullscreen,
    'exibir.navegacao': () => (estreito ? alternarNav() : setNavRecolhido((v) => !v)),
    'exibir.lista_paginas': () => (estreito ? alternarLista() : setListaVisivel((v) => !v)),
    'exibir.ampliar': () => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1)), 'exibir.reduzir': () => setZoomIdx((i) => Math.max(0, i - 1)),
    'exibir.zoom100': () => setZoomIdx(3), 'exibir.largura': () => setZoomIdx(3),
    'exibir.cor_pagina': (chave) => aparencia({ fundo: chave === 'padrao' ? null : (chave as string | null) }),
    'exibir.regua': (chave) => aparencia({ regua: chave === 'nenhuma' ? null : (chave as Regua) }),
    'nav.secao_prox': () => irParaSecao(1), 'nav.secao_ant': () => irParaSecao(-1),
    'nav.pagina_prox': () => irParaPagina('prox'), 'nav.pagina_ant': () => irParaPagina('ant'),
    'nav.pagina_primeira': () => irParaPagina('primeira'), 'nav.pagina_ultima': () => irParaPagina('ultima'),
    'busca.caderno': () => abrirBusca('caderno'), 'busca.pagina': () => abrirBusca('pagina'),
    ...(editor && !desenho.folhaAtiva ? { 'edicao.desfazer': () => { editor.chain().focus().undo().run() }, 'edicao.refazer': () => { editor.chain().focus().redo().run() } } : {}),
  })

  // atalhos globais (só navegação/estrutura; o resto é do editor)
  const cmdRef = useRef(cmd); cmdRef.current = cmd
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const id = atalhoGlobal(e); if (!id || !cmdRef.current.tem(id)) return
      e.preventDefault(); e.stopPropagation(); cmdRef.current.executar(id)
    }
    window.addEventListener('keydown', f, true); return () => window.removeEventListener('keydown', f, true)
  }, [])

  const tituloAtual = paginaSel?.titulo ?? (sel?.tipo === 'auto' ? secao?.nome ?? '' : '')
  const estadoRef = useRef(setSalvo); estadoRef.current = setSalvo
  const aoEstado = useCallback((e: EstadoSalvo) => estadoRef.current(e), [])
  const aoEditor = useCallback((ed: Editor | null) => setEditor(ed), [])
  useEffect(() => { setSalvo(null); setEditor(null) }, [sel])
  const aoTitulo = useCallback((id: string, t: string) => atualizarPagina(id, { titulo: t }), [atualizarPagina])
  const aoSalvo = useCallback((id: string, q: string) => atualizarPagina(id, { atualizado_em: q }), [atualizarPagina])

  // Handlers ESTÁVEIS (identidade fixa; chamam sempre a versão mais recente) para os painéis memoizados não re-renderizarem à toa.
  const acoes = useRef<Record<string, (...a: any[]) => any>>({})
  acoes.current = {
    navToggle: () => (estreito ? setDrawerNav(false) : setNavRecolhido((v) => !v)), selecionarSecao, novaSecao: () => void novaSecao(), menuSecao, reordenarSecao, soltarPaginaEmSecao,
    ordenacao: (o: Ordenacao) => void definirOrdenacao(o), recolher: alternarRecolher,
    selecionarPagina: (id: string) => { abrirPagina(id); if (estreito) setDrawerLista(false) },
    nova: (t: 'texto' | 'folha_livre') => { novaPagina(t); if (estreito) setDrawerLista(false) }, menuPagina, excluirPagina, moverNaLista, mais: () => void mais(),
    novaPaginaVazia: () => novaPagina(),
  }
  const est = useMemo(() => {
    const f = <T extends (...a: any[]) => any>(k: string) => ((...a: any[]) => acoes.current[k](...a)) as T
    return {
      navToggle: f<() => void>('navToggle'), selecionarSecao: f<(id: string) => void>('selecionarSecao'), novaSecao: f<() => void>('novaSecao'),
      menuSecao: f<(e: React.MouseEvent, s: Secao) => void>('menuSecao'), reordenarSecao: f<(id: string, e: api.Entre) => void>('reordenarSecao'),
      soltarPaginaEmSecao: f<(p: string, s: string) => void>('soltarPaginaEmSecao'), ordenacao: f<(o: Ordenacao) => void>('ordenacao'),
      recolher: f<(id: string) => void>('recolher'), selecionarPagina: f<(id: string) => void>('selecionarPagina'), nova: f<(t: 'texto' | 'folha_livre') => void>('nova'),
      menuPagina: f<(e: React.MouseEvent, pg: Pagina) => void>('menuPagina'), moverNaLista: f<(id: string, e: api.Entre, n: 0 | 1) => void>('moverNaLista'),
      excluirPagina: f<(pg: Pagina) => void>('excluirPagina'), mais: f<() => void>('mais'), novaPaginaVazia: f<() => void>('novaPaginaVazia'),
    }
  }, [])
  const opcoesCanvas = useMemo(() => ({ onEstado: aoEstado, onEditor: aoEditor, onAutosave: aoAutosave }), [aoEstado, aoEditor, aoAutosave])

  const alturaRaiz = vv ? vv.h : undefined
  const pgMover = dlg?.t === 'mover' ? arv.paginas.find((p) => p.id === dlg.id) ?? null : null
  const secCor = dlg?.t === 'cor' ? secoes.find((s) => s.id === dlg.id) ?? null : null

  return (
    // z-[100]: acima do dock do portal (aluno-down-bar, z-[60]). Altura = visualViewport (teclado virtual) ou 100dvh; respeita safe-area.
    <div ref={raiz} className="onenote-root fixed inset-x-0 z-[100] flex flex-col"
      style={{ top: vv ? vv.t : 0, height: alturaRaiz ?? '100dvh', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', paddingBottom: vv ? 0 : 'env(safe-area-inset-bottom)', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--ink)', fontFamily: FONTE_UI, fontSize: 14 }}>
      <style>{CSS_GLOBAL}</style>
      {modo === 'mobile' ? (
        <BarraCompacta voltarHref={voltarHref} salvo={salvo} titulo={tituloAtual} buscaRef={buscaRef} busca={busca.q} escopo={busca.escopo}
          onBusca={(q) => setBusca((b) => ({ ...b, q, aberta: true }))} onAbrirBusca={() => setBusca((b) => ({ ...b, aberta: true }))}
          onLimparBusca={() => setBusca((b) => ({ ...b, q: '', aberta: false }))} onEscopo={(escopo) => setBusca((b) => ({ ...b, escopo }))}
          onNav={alternarNav} onLista={alternarLista} navAberto={drawerNav} listaAberta={drawerLista} caderno={arv.notebook?.titulo || 'Meu caderno'} />
      ) : modo === 'desktop' ? (
        <BarraDesktop voltarHref={voltarHref} salvo={salvo} buscaRef={buscaRef} busca={busca.q} escopo={busca.escopo}
          onBusca={(q) => setBusca((b) => ({ ...b, q, aberta: true }))} onAbrirBusca={() => setBusca((b) => ({ ...b, aberta: true }))}
          onLimparBusca={() => setBusca((b) => ({ ...b, q: '', aberta: false }))} onEscopo={(escopo) => setBusca((b) => ({ ...b, escopo }))}
          marca={marca} caderno={arv.notebook?.titulo || 'Meu caderno'} secao={secao?.nome ?? ''} pagina={paginaSel?.titulo ?? tituloAtual} />
      ) : (
      <BarraPlataforma voltarHref={voltarHref} salvo={salvo} buscaRef={buscaRef} busca={busca.q} escopo={busca.escopo}
        onBusca={(q) => setBusca((b) => ({ ...b, q, aberta: true }))} onAbrirBusca={() => setBusca((b) => ({ ...b, aberta: true }))}
        onLimparBusca={() => setBusca((b) => ({ ...b, q: '', aberta: false }))} onEscopo={(escopo) => setBusca((b) => ({ ...b, escopo }))}
        onMenuMobile={alternarNav} onLista={alternarLista} />
      )}
      {busca.aberta ? (
        <PainelBusca q={busca.q} escopo={busca.escopo} secaoId={secaoId} paginaId={paginaSel?.id ?? null} nomeSecao={nomeSecao}
          onAbrir={aoBuscar} onFechar={() => setBusca((b) => ({ ...b, aberta: false }))} />
      ) : null}
      {modo === 'tablet' ? <BarraTitulo titulo={tituloAtual} caderno={arv.notebook?.titulo || 'Meu caderno'} salvo={salvo} /> : null}
      <Ribbon modo={modo} sinalRecolher={sinalRecolher} />
      {aviso ? (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: avisoInfo ? 'var(--infoBg)' : 'var(--dangerBg)', color: avisoInfo ? 'var(--info)' : 'var(--danger)', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{aviso}</span>
          {avisoAcao ? <button type="button" onClick={() => { const f = avisoAcao.fn; setAvisoAcao(null); setAviso(null); f() }} style={{ border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit', fontWeight: 700, fontSize: 12.5, padding: '4px 10px', cursor: 'pointer', minHeight: 32 }}>{avisoAcao.rotulo}</button> : null}
        </div>
      ) : null}

      {carga !== 'ok' ? (
        <div role="status" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--muted)', fontSize: 14, textAlign: 'center' }}>
          {carga === 'carregando' ? 'Carregando o seu caderno…' : carga === 'migracao' ? 'Recurso em preparação, volte em breve.' : (
            <span>Não foi possível carregar o seu caderno. <button type="button" onClick={() => carregar(true)} style={{ border: 0, background: 'transparent', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer' }}>Tentar de novo</button></span>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
          {medido && estreito ? (
            <div onClick={() => { setDrawerNav(false); setDrawerLista(false) }} aria-hidden
              style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'color-mix(in srgb, var(--ink) 40%, transparent)', opacity: drawerNav || drawerLista ? 1 : 0, visibility: drawerNav || drawerLista ? 'visible' : 'hidden', transition: 'opacity .2s ease, visibility 0s linear ' + (drawerNav || drawerLista ? '0s' : '.2s') }} />
          ) : null}
          {medido ? (
            <div aria-hidden={estreito && !drawerNav ? true : undefined} style={estreito ? gaveta('esq', drawerNav) : { display: 'flex', minHeight: 0 }}>
              <PainelNavegacao caderno={arv.notebook?.titulo || 'Meu caderno'} secoes={secoes} ativaId={secaoId} recolhido={estreito ? false : navRecolhido}
                onToggle={est.navToggle} onSelecionar={est.selecionarSecao} onNovaSecao={est.novaSecao} onMenuSecao={est.menuSecao} />
            </div>
          ) : null}

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }} onPointerDownCapture={() => { if (estreito) setSinalRecolher((n) => n + 1) }}>
            <AbasSecao secoes={secoes} ativaId={secaoId} onSelecionar={est.selecionarSecao} onNova={est.novaSecao} onReordenar={est.reordenarSecao} onMenu={est.menuSecao} onSoltarPagina={est.soltarPaginaEmSecao} />
            <CanvasPagina selecao={sel} pagina={paginaSel} zoom={zoom} onTitulo={aoTitulo} onSalvo={aoSalvo} onNovaPagina={est.novaPaginaVazia}
              semPaginas={paginasSecao.length === 0} opcoes={opcoesCanvas} />
          </div>

          {medido && (estreito || listaVisivel) ? (
            <div aria-hidden={estreito && !drawerLista ? true : undefined} style={estreito ? gaveta('dir', drawerLista) : { display: 'flex', minHeight: 0 }}>
              <ListaPaginas secao={secao} linhas={linhas} criando={criando} selecionadaId={paginaSel?.id ?? null} largura={estreito ? Math.min(listaLargura, 260) : listaLargura} onLargura={setListaLargura}
                ordenacao={ordenacao} onOrdenacao={est.ordenacao} recolhidas={recolhidas} onAlternarRecolher={est.recolher}
                onSelecionar={est.selecionarPagina} onNova={est.nova} onMenu={est.menuPagina} onExcluir={est.excluirPagina} onMover={est.moverNaLista}
                temMais={!!secao && !ehAuto(secao) && secao.qtd_paginas > paginasSecao.length} onMais={est.mais} />
            </div>
          ) : null}

          {dlg?.t === 'lixeira' ? <PainelLixeira onFechar={() => setDlg(null)} onRestaurado={() => void carregar()} /> : null}
        </div>
      )}

      <ComandosTexto editor={editor} paginas={arv.paginas} abrirPagina={abrirPagina} />
      {ctx ? <MenuFlutuante x={ctx.x} y={ctx.y} itens={ctx.itens} onFechar={() => setCtx(null)} /> : null}
      {dlg?.t === 'atalhos' ? <DialogoAtalhos onFechar={() => setDlg(null)} /> : null}
      {pgMover ? <DialogoMoverCopiar titulo={pgMover.titulo} secoes={secoes} secaoAtualId={pgMover.secao_id} onFechar={() => setDlg(null)} onConfirmar={(dest, copiar) => void moverOuCopiar(pgMover.id, dest, copiar)} /> : null}
      {secCor ? <DialogoCorSecao secao={secCor} atual={corDaSecao(secCor, secoes.indexOf(secCor)).chave} onEscolher={(c) => void corSecao(secCor.id, c)} onFechar={() => setDlg(null)} /> : null}
    </div>
  )
}
