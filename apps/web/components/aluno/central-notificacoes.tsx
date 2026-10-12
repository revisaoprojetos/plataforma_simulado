'use client'

// Central de notificações RICA do aluno (spec §2.7) — ligada a DADOS REAIS (/api/aluno/notificacoes).
// Visual fiel ao design: cabeçalho com tile+badge e "N novas", abas em PÍLULA (ativa verde) + linha,
// cards CREME com tile de categoria colorido (laranja/azul/roxo), ponto verde de não-lida e botão de
// ação preenchido; rodapé em pílula contornada. Painel portalizado com tokens da marca inline.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, Check, SlidersHorizontal, ClipboardList, Trophy, Flag, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { internaTokensStyle } from '@/components/brand/interna/interna-tokens'
import { useTemaInterno } from '@/components/brand/interna/use-tema-interno'
import type { Brand } from '@/components/brand/simulado/types'

interface NotifApi { id: string; tipo: string; titulo: string; mensagem: string | null; link: string | null; lida: boolean; criado_em: string }

type Cat = 'est' | 'sim' | 'rank' | 'com'
interface ItemNotif extends NotifApi { cat: Cat; acao?: { rotulo: string; url: string }; grupo: 'hoje' | 'antes' }

type Aba = 'all' | 'unread' | 'est' | 'sim' | 'rank'
const ABAS: { key: Aba; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'est', label: 'Estudos' },
  { key: 'sim', label: 'Simulados' },
  { key: 'rank', label: 'Ranking' },
]

// Tile de categoria — cor SEMÂNTICA fixa + ícone (laranja=estudos, azul=simulados, roxo=ranking).
const CAT_VIS: Record<Cat, { icon: LucideIcon; tile: string }> = {
  est: { icon: Flag, tile: '#F2A23C' },
  sim: { icon: ClipboardList, tile: '#5B8DEF' },
  rank: { icon: Trophy, tile: '#9B7BE8' },
  com: { icon: Bell, tile: 'var(--brand)' },
}

/** Tempo relativo longo ("há 2 h", "ontem", "há 3 dias"). */
function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Deriva categoria + ação a partir do tipo/link/texto (o backend ainda não tem categoria). */
function classificar(it: NotifApi): { cat: Cat; acao?: { rotulo: string; url: string } } {
  const l = (it.link || '').toLowerCase()
  const t = `${it.titulo} ${it.mensagem ?? ''}`.toLowerCase()
  let cat: Cat
  if (l.includes('/simulado') || t.includes('simulado')) cat = 'sim'
  else if (l.includes('/leitura') || l.includes('/desafio') || l.includes('/juris') || t.includes('aula') || t.includes('lei seca') || t.includes('trilha')) cat = 'est'
  else if (l.includes('/liga') || l.includes('/ranking') || t.includes('ranking') || t.includes('liga') || t.includes('pódio') || t.includes('podio')) cat = 'rank'
  else cat = 'com'
  let acao: { rotulo: string; url: string } | undefined
  if (it.link) {
    let rotulo = 'Abrir'
    if (cat === 'sim') rotulo = t.includes('gabarito') ? 'Ver gabarito' : t.includes('resultado') || t.includes('corrig') ? 'Ver resultado' : 'Ver simulado'
    else if (cat === 'est') rotulo = t.includes('aula') ? 'Começar aula' : 'Abrir trilha'
    else if (cat === 'rank') rotulo = 'Ver ranking'
    acao = { rotulo, url: it.link }
  }
  return { cat, acao }
}

function ehHoje(iso: string): boolean {
  const d = new Date(iso); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

/** Sino + central de notificações branded, ligada à API real. Visual fiel ao design do aluno. */
export function CentralNotificacoes({ brand = 'vnd' }: { brand?: Brand }) {
  const tema = useTemaInterno('claro')
  const router = useRouter()
  const [brutos, setBrutos] = useState<NotifApi[]>([])
  const [lidasLocais, setLidasLocais] = useState<Record<string, boolean>>({})
  const [removidas, setRemovidas] = useState<Record<string, boolean>>({})
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<Aba>('all')
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/aluno/notificacoes')
      if (!res.ok) return
      const json = await res.json()
      setBrutos(Array.isArray(json.items) ? json.items : [])
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (!document.hidden) carregar() }, 300000)
    const onVis = () => { if (!document.hidden) carregar() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [carregar])

  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (btnRef.current?.contains(n) || panelRef.current?.contains(n)) return
      setAberto(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [aberto])

  const itens: ItemNotif[] = brutos
    .filter((n) => !removidas[n.id])
    .map((n) => {
      const c = classificar(n)
      return { ...n, lida: n.lida || !!lidasLocais[n.id], cat: c.cat, acao: c.acao, grupo: ehHoje(n.criado_em) ? 'hoje' : 'antes' }
    })
  const naoLidas = itens.filter((n) => !n.lida).length
  const visiveis = itens.filter((n) => aba === 'all' || (aba === 'unread' ? !n.lida : n.cat === aba))
  const hoje = visiveis.filter((n) => n.grupo === 'hoje')
  const antes = visiveis.filter((n) => n.grupo === 'antes')

  async function marcarLida(id: string) {
    if (lidasLocais[id]) return
    setLidasLocais((m) => ({ ...m, [id]: true }))
    await fetch('/api/aluno/notificacoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
  }
  async function marcarTodas() {
    setLidasLocais(Object.fromEntries(itens.map((n) => [n.id, true])))
    await fetch('/api/aluno/notificacoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {})
  }
  function irPara(it: ItemNotif) {
    marcarLida(it.id)
    if (it.link) { setAberto(false); router.push(it.link) }
  }

  function toggle() {
    if (aberto) { setAberto(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 })
    setAberto(true)
    carregar()
  }

  const tokens = internaTokensStyle(brand, tema)

  return (
    <>
      <style>{`@keyframes cnSino{0%{transform:rotate(0)}8%{transform:rotate(14deg)}16%{transform:rotate(-12deg)}24%{transform:rotate(9deg)}32%{transform:rotate(-6deg)}40%{transform:rotate(3deg)}48%,100%{transform:rotate(0)}}.cn-sino{animation:cnSino 2.4s ease-in-out infinite;transform-origin:50% 2px}@keyframes cnIn{from{opacity:0;transform:translateY(-8px) scale(.98)}}.cn-scroll{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted) 35%,transparent) transparent;overscroll-behavior:contain}.cn-scroll::-webkit-scrollbar{width:8px}.cn-scroll::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 35%,transparent);border-radius:99px;border:2px solid transparent;background-clip:padding-box}@media (prefers-reduced-motion:reduce){.cn-sino{animation:none}}`}</style>

      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={naoLidas > 0 ? 'Notificações (há novas)' : 'Notificações'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg outline-none transition-colors hover:bg-[color:var(--sidebar-accent,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className={cn('h-[1.15rem] w-[1.15rem]', naoLidas > 0 && 'cn-sino')} fill={naoLidas > 0 ? 'currentColor' : 'none'} />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[color:var(--topbar,transparent)]">{naoLidas > 9 ? '9+' : naoLidas}</span>
        )}
      </button>

      {aberto && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" style={{ background: 'rgba(10,17,36,.28)' }} onClick={() => setAberto(false)} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notificações"
            className="app cn-panel fixed z-[95] flex max-h-[80vh] flex-col overflow-hidden"
            data-brand={brand}
            style={{ ...tokens, right: pos?.right ?? 16, top: pos?.top ?? 70, width: 404, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 28px 56px -20px rgba(11,17,36,.5)', animation: 'cnIn .22s cubic-bezier(.22,1,.36,1)', maxHeight: 'calc(100vh - 92px)' }}
          >
            <style>{`@media (max-width:1023px){.cn-panel{left:10px!important;right:10px!important;top:66px!important;width:auto!important;max-height:calc(100dvh - 86px)!important}}`}</style>

            {/* Cabeçalho: tile+badge · título/"N novas" · ações (marcar todas / filtros) */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <span className="relative inline-flex shrink-0 items-center justify-center rounded-2xl" style={{ width: 44, height: 44, background: 'var(--chip)', color: 'var(--brand)' }}>
                <Bell className="h-[22px] w-[22px]" fill={naoLidas > 0 ? 'currentColor' : 'none'} />
                {naoLidas > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-extrabold text-white" style={{ boxShadow: '0 0 0 2px var(--surface)' }}>{naoLidas > 9 ? '9+' : naoLidas}</span>
                )}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <b className="block text-[17px]" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Notificações</b>
                <span className="block text-[12.5px]" style={{ color: 'var(--muted)' }}>{naoLidas ? `${naoLidas} ${naoLidas === 1 ? 'nova' : 'novas'}` : 'tudo em dia'}</span>
              </div>
              <button type="button" title="Marcar todas como lidas" aria-label="Marcar todas como lidas" onClick={marcarTodas} disabled={naoLidas === 0}
                className="inline-flex items-center justify-center rounded-xl transition-opacity disabled:opacity-40" style={{ width: 38, height: 38, background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                <Check className="h-[18px] w-[18px]" />
              </button>
              <button type="button" title="Filtrar não lidas" aria-label="Filtrar não lidas" aria-pressed={aba === 'unread'} onClick={() => setAba((a) => (a === 'unread' ? 'all' : 'unread'))}
                className="inline-flex items-center justify-center rounded-xl transition-colors" style={{ width: 38, height: 38, background: aba === 'unread' ? 'var(--chip)' : 'var(--surface2)', border: '1px solid var(--line)', color: aba === 'unread' ? 'var(--brand)' : 'var(--muted)' }}>
                <SlidersHorizontal className="h-[17px] w-[17px]" />
              </button>
            </div>

            {/* Abas em pílula (ativa verde preenchida) + linha inferior */}
            <div className="cn-scroll flex items-center gap-1.5 overflow-x-auto px-3.5 pb-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
              {ABAS.map((a) => {
                const ativa = aba === a.key
                return (
                  <button key={a.key} type="button" onClick={() => setAba(a.key)}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-colors"
                    style={ativa ? { background: 'var(--brand)', color: '#fff' } : { background: 'transparent', color: 'var(--muted)' }}>
                    {a.label}
                  </button>
                )
              })}
            </div>

            {/* Lista */}
            <div className="cn-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-2">
              {visiveis.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                  <span className="inline-flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: 'var(--surface2)', color: 'var(--muted)' }}>
                    <Bell className="h-[22px] w-[22px]" />
                  </span>
                  <b className="text-[14px]" style={{ color: 'var(--ink)' }}>Nada por aqui</b>
                  <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Você está em dia com essa categoria.</span>
                </div>
              ) : (
                <>
                  {hoje.length > 0 && <Grupo titulo="Hoje" />}
                  {hoje.map((n) => <Cartao key={n.id} item={n} onLer={marcarLida} onAbrir={irPara} onRemover={(id) => setRemovidas((m) => ({ ...m, [id]: true }))} />)}
                  {antes.length > 0 && <Grupo titulo="Anteriores" />}
                  {antes.map((n) => <Cartao key={n.id} item={n} onLer={marcarLida} onAbrir={irPara} onRemover={(id) => setRemovidas((m) => ({ ...m, [id]: true }))} />)}
                </>
              )}
            </div>

            {/* Rodapé: pílula contornada */}
            <div className="px-3.5 pb-3.5 pt-1.5">
              <a href="/aluno/notificacoes" className="flex items-center justify-center rounded-xl py-3 text-[13.5px] font-extrabold transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                Ver todas as notificações
              </a>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

function Grupo({ titulo }: { titulo: string }) {
  return <div className="px-1.5 pb-1.5 pt-2 text-[10.5px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>{titulo}</div>
}

function Cartao({ item, onLer, onAbrir, onRemover }: { item: ItemNotif; onLer: (id: string) => void; onAbrir: (i: ItemNotif) => void; onRemover: (id: string) => void }) {
  const Icone = CAT_VIS[item.cat].icon
  const tile = CAT_VIS[item.cat].tile
  return (
    <div
      className="group relative mb-2 flex gap-3 rounded-[16px] p-3 transition-colors"
      style={{
        background: item.lida ? 'transparent' : 'color-mix(in srgb, var(--flag) 13%, var(--surface))',
        border: item.lida ? '1px solid var(--line)' : '1px solid color-mix(in srgb, var(--flag) 26%, var(--line))',
        cursor: item.link ? 'pointer' : 'default',
      }}
      onClick={() => (item.link ? onAbrir(item) : !item.lida && onLer(item.id))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.link ? onAbrir(item) : onLer(item.id) } }}
    >
      <span className="inline-flex shrink-0 items-center justify-center rounded-[13px] text-white" style={{ width: 42, height: 42, background: tile }}>
        <Icone className="h-[19px] w-[19px]" />
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="flex items-start gap-2">
          <b className="block flex-1 text-[13.5px]" style={{ color: 'var(--ink)', fontWeight: item.lida ? 600 : 800 }}>{item.titulo}</b>
          {!item.lida && <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: '#1FA868', boxShadow: '0 0 6px rgba(31,168,104,.5)' }} aria-hidden />}
        </div>
        {item.mensagem && <span className="mt-0.5 block text-[12.5px]" style={{ color: 'var(--muted)' }}>{item.mensagem}</span>}
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--muted2,var(--muted))' }}>{tempoRelativo(item.criado_em)}</div>
        {item.acao && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLer(item.id); onAbrir(item) }}
            className="mt-2.5 inline-flex items-center rounded-[10px] px-3.5 py-1.5 text-[12px] font-extrabold transition-opacity hover:opacity-90"
            style={{ background: 'var(--flag)', color: '#3a2c08' }}
          >
            {item.acao.rotulo}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Remover notificação"
        title="Remover notificação"
        onClick={(e) => { e.stopPropagation(); onRemover(item.id) }}
        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--muted)' }}
      >
        <span className="text-[16px] leading-none">×</span>
      </button>
    </div>
  )
}
