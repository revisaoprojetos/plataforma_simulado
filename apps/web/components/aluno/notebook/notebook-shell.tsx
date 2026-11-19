'use client'
// Caderno (beta) — tela única estilo OneNote: árvore à esquerda (gaveta em <lg) + editor no centro.
// Só fala com as rotas /api/aluno/notebook/** (fetch). Sem server actions.
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { PanelLeft, Search } from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { ArvoreNotebook, type PaginaLeve, type Secao, type Selecao, type TipoNovaPagina } from './arvore-notebook'
import { BarraBusca } from './barra-busca'
import { htmlParaTexto } from './extensoes'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'

const Editor = dynamic(() => import('./editor-pagina'), { ssr: false, loading: () => <Esqueleto /> })

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando editor" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[60, 100, 92, 80].map((w, i) => <div key={i} style={{ height: i ? 14 : 28, width: `${w}%`, borderRadius: 8, background: 'var(--surface2)' }} />)}
    </div>
  )
}

type Arvore = { notebook?: { id: string; titulo: string }; secoes: Secao[]; paginas: PaginaLeve[] }
type Carga = { estado: 'carregando' | 'ok' | 'erro' | 'migracao'; msg?: string }

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const btn: React.CSSProperties = { minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const j = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, j }
}

export function NotebookShell({ inicial }: { inicial?: Arvore }) {
  const [arv, setArv] = useState<Arvore>(inicial ?? { secoes: [], paginas: [] })
  const [carga, setCarga] = useState<Carga>({ estado: inicial ? 'ok' : 'carregando' })
  const [sel, setSel] = useState<Selecao>(null)
  const [gaveta, setGaveta] = useState(false)
  const [busca, setBusca] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const botaoGaveta = useRef<HTMLButtonElement>(null)

  const carregar = useCallback(async () => {
    setCarga({ estado: 'carregando' })
    try {
      const { ok, j } = await api('/api/aluno/notebook')
      if (!ok) { setCarga(j?.code === 'migracao_pendente' ? { estado: 'migracao' } : { estado: 'erro', msg: j?.error }); return }
      setArv({ notebook: j.notebook, secoes: j.secoes ?? [], paginas: j.paginas ?? [] })
      setCarga({ estado: 'ok' })
    } catch { setCarga({ estado: 'erro' }) }
  }, [])
  useEffect(() => { if (!inicial) void carregar() }, [inicial, carregar])

  // Ctrl/Cmd+K abre a busca; Esc fecha a gaveta
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true) }
      else if (e.key === 'Escape' && gaveta && !busca) { setGaveta(false); botaoGaveta.current?.focus() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [gaveta, busca])

  // abre a primeira página quando não há seleção
  useEffect(() => {
    if (sel || carga.estado !== 'ok') return
    const p = arv.paginas[0]
    if (p) setSel({ tipo: 'pagina', id: p.id })
  }, [arv.paginas, sel, carga.estado])

  const erro = (m: string) => { setAviso(m); setTimeout(() => setAviso(null), 5000) }
  const abrirPagina = (id: string) => { setSel({ tipo: 'pagina', id }); setGaveta(false) }

  const criarSecao = async () => {
    const nome = await pedirTexto({ titulo: 'Nova seção', label: 'Nome da seção', confirmar: 'Criar' })
    if (!nome?.trim()) return
    const { ok, j } = await api('/api/aluno/notebook/secoes', { method: 'POST', body: JSON.stringify({ nome: nome.trim().slice(0, 100), client_op_id: uuid() }) })
    if (!ok || !j?.secao) return erro('Não foi possível criar a seção.')
    setArv((a) => ({ ...a, secoes: [...a.secoes, { qtd_paginas: 0, tipo: 'manual', ordem: 0, ...j.secao }] }))
  }
  const criarPagina = async (secaoId: string, tipo: TipoNovaPagina = 'texto') => {
    const { ok, j } = await api('/api/aluno/notebook/paginas', { method: 'POST', body: JSON.stringify({ secao_id: secaoId, titulo: 'Sem título', tipo_pagina: tipo, client_op_id: uuid() }) })
    if (!ok || !j?.pagina) return erro('Não foi possível criar a página.')
    const p = j.pagina
    setArv((a) => ({
      ...a,
      paginas: [...a.paginas, { id: p.id, secao_id: secaoId, titulo: p.titulo ?? 'Sem título', tipo_pagina: p.tipo_pagina ?? tipo, ordem: p.ordem ?? 0, atualizado_em: p.atualizado_em }],
      secoes: a.secoes.map((s) => (s.id === secaoId ? { ...s, qtd_paginas: s.qtd_paginas + 1 } : s)),
    }))
    abrirPagina(p.id)
  }
  const renomearSecao = async (id: string, nome: string) => {
    const antes = arv.secoes
    setArv((a) => ({ ...a, secoes: a.secoes.map((s) => (s.id === id ? { ...s, nome } : s)) }))
    const { ok } = await api(`/api/aluno/notebook/secoes/${id}`, { method: 'PATCH', body: JSON.stringify({ nome }) })
    if (!ok) { setArv((a) => ({ ...a, secoes: antes })); erro('Não foi possível renomear.') }
  }
  const excluirSecao = async (s: Secao) => {
    if (!(await confirmar({ titulo: 'Excluir seção', mensagem: `Excluir a seção "${s.nome}" e suas ${s.qtd_paginas} página(s)?`, confirmar: 'Excluir', destrutivo: true }))) return
    const { ok } = await api(`/api/aluno/notebook/secoes/${s.id}`, { method: 'DELETE' })
    if (!ok) return erro('Não foi possível excluir a seção.')
    setArv((a) => ({ ...a, secoes: a.secoes.filter((x) => x.id !== s.id), paginas: a.paginas.filter((p) => p.secao_id !== s.id) }))
    setSel((cur) => (cur && ((cur.tipo === 'auto' && cur.secaoId === s.id) || (cur.tipo === 'pagina' && arv.paginas.find((p) => p.id === cur.id)?.secao_id === s.id)) ? null : cur))
  }
  const excluirPagina = async (pg: PaginaLeve) => {
    if (!(await confirmar({ titulo: 'Excluir página', mensagem: `Excluir a página "${pg.titulo || 'Sem título'}"?`, confirmar: 'Excluir', destrutivo: true }))) return
    const { ok } = await api(`/api/aluno/notebook/paginas/${pg.id}`, { method: 'DELETE' })
    if (!ok) return erro('Não foi possível excluir a página.')
    setArv((a) => ({ ...a, paginas: a.paginas.filter((p) => p.id !== pg.id), secoes: a.secoes.map((s) => (s.id === pg.secao_id ? { ...s, qtd_paginas: Math.max(0, s.qtd_paginas - 1) } : s)) }))
    setSel((cur) => (cur?.tipo === 'pagina' && cur.id === pg.id ? null : cur))
  }
  const aoTitulo = useCallback((id: string, titulo: string) => setArv((a) => ({ ...a, paginas: a.paginas.map((p) => (p.id === id ? { ...p, titulo } : p)) })), [])
  const aoBuscar = (paginaId: string, secaoId: string) => {
    if (!arv.paginas.some((p) => p.id === paginaId)) setArv((a) => ({ ...a, paginas: [...a.paginas, { id: paginaId, secao_id: secaoId, titulo: '', ordem: 0 }] }))
    abrirPagina(paginaId)
  }

  if (carga.estado === 'carregando') return <Esqueleto />
  if (carga.estado === 'migracao') return <div role="status" style={{ padding: 24, color: 'var(--muted)' }}>Recurso em preparação, volte em breve.</div>
  if (carga.estado === 'erro') return (
    <div role="alert" style={{ padding: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', color: 'var(--ink)' }}>
      Não foi possível carregar o seu caderno.
      <button type="button" onClick={carregar} style={btn}>Tentar de novo</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button ref={botaoGaveta} type="button" className="lg:hidden" onClick={() => setGaveta(true)} aria-label="Abrir lista de páginas" aria-expanded={gaveta} style={btn}><PanelLeft size={18} aria-hidden />Páginas</button>
        <button type="button" onClick={() => setBusca(true)} style={{ ...btn, marginLeft: 'auto' }} aria-label="Buscar (Ctrl+K)"><Search size={16} aria-hidden /><span className="hidden sm:inline">Buscar</span><kbd className="hidden sm:inline" style={{ fontSize: 11, color: 'var(--muted)' }}>Ctrl K</kbd></button>
      </div>
      {aviso ? <div role="alert" style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--dangerBg)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700 }}>{aviso}</div> : null}

      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)]" style={{ gap: 16, alignItems: 'start' }}>
        {gaveta ? <div className="lg:hidden" onClick={() => setGaveta(false)} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 109, background: 'color-mix(in srgb, var(--ink) 45%, transparent)' }} /> : null}
        <aside aria-label="Páginas do caderno"
          className={gaveta ? 'fixed inset-y-0 left-0 z-[110] flex w-[min(88vw,340px)] flex-col lg:static lg:z-auto lg:w-auto' : 'hidden lg:flex lg:flex-col'}
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, minHeight: 0, maxHeight: 'calc(100dvh - 160px)' }}>
          {gaveta ? <button type="button" className="lg:hidden" onClick={() => { setGaveta(false); botaoGaveta.current?.focus() }} aria-label="Fechar lista de páginas" style={{ ...btn, margin: 8, alignSelf: 'flex-end' }}>Fechar</button> : null}
          <ArvoreNotebook secoes={arv.secoes} paginas={arv.paginas} selecao={sel}
            onSelecionarPagina={abrirPagina}
            onSelecionarAuto={(s) => { setSel({ tipo: 'auto', secaoId: s.id, auto: s.tipo === 'auto_erros' ? 'erros' : 'favoritos' }); setGaveta(false) }}
            onCriarSecao={criarSecao} onCriarPagina={criarPagina} onRenomearSecao={renomearSecao}
            onFocarTitulo={() => document.getElementById('nb-titulo')?.focus()}
            onExcluirSecao={excluirSecao} onExcluirPagina={excluirPagina} />
        </aside>

        <section aria-label="Página" style={{ minWidth: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, minHeight: '60vh' }}>
          {sel?.tipo === 'pagina' ? (
            <Editor paginaId={sel.id} onTitulo={aoTitulo} />
          ) : sel?.tipo === 'auto' ? (
            <ListaAuto key={sel.auto} tipo={sel.auto} />
          ) : (
            <div style={{ padding: 24, color: 'var(--muted)', fontSize: 14 }}>
              {arv.secoes.some((s) => s.tipo === 'manual' || s.tipo === 'importada')
                ? 'Escolha uma página na lista ou crie uma nova.'
                : 'Seu caderno está vazio. Crie uma seção e, dentro dela, a sua primeira página.'}
              <div style={{ marginTop: 14 }}><button type="button" onClick={criarSecao} style={btn}>Nova seção</button></div>
            </div>
          )}
        </section>
      </div>

      <BarraBusca aberta={busca} onFechar={() => setBusca(false)} onAbrir={aoBuscar} />
    </div>
  )
}

// Seções automáticas (erros/favoritos): somente leitura, paginadas no servidor.
function ListaAuto({ tipo }: { tipo: 'erros' | 'favoritos' }) {
  const [itens, setItens] = useState<QuestaoAluno[]>([])
  const [total, setTotal] = useState(0)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const carregarMais = useCallback(async (offset: number) => {
    setEstado('carregando')
    try {
      const { ok, j } = await api(`/api/aluno/notebook/auto/${tipo}?offset=${offset}&limit=20`)
      if (!ok) throw new Error()
      setItens((a) => (offset === 0 ? j.itens : [...a, ...j.itens])); setTotal(j.total ?? 0); setEstado('ok')
    } catch { setEstado('erro') }
  }, [tipo])
  useEffect(() => { void carregarMais(0) }, [carregarMais])
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 12px' }}>{tipo === 'erros' ? 'Questões que errei' : 'Questões salvas'}</h2>
      {estado === 'erro' ? <p style={{ color: 'var(--danger)', fontSize: 14 }}>Não foi possível carregar. <button type="button" style={btn} onClick={() => carregarMais(0)}>Tentar de novo</button></p> : null}
      {estado === 'ok' && itens.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nada por aqui ainda.</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {itens.map((q, i) => (
          <div key={q.id || i} style={{ border: '1px solid var(--line)', background: 'var(--surface2)', borderRadius: 14, padding: '12px 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
            {[q.disciplina, q.banca, q.ano].filter(Boolean).length ? <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 4 }}>{[q.disciplina, q.banca, q.ano].filter(Boolean).join(' · ')}</div> : null}
            {(() => { const t = htmlParaTexto(typeof q.enunciado === 'string' ? q.enunciado : ''); return t.length > 400 ? t.slice(0, 400) + '…' : t || 'Questão' })()}
          </div>
        ))}
      </div>
      {estado === 'carregando' ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</p> : null}
      {estado === 'ok' && itens.length < total ? <button type="button" style={{ ...btn, marginTop: 12 }} onClick={() => carregarMais(itens.length)}>Carregar mais</button> : null}
    </div>
  )
}
