'use client'
// Shell da nova plataforma: menu lateral roxo (9 itens) + barra do topo.
// Desktop: sidebar recolhível. Mobile: drawer + barra inferior (Início/Estudos/Cursos/Comunidade/Mais).
// Tema claro/escuro (toggle, persistido). Busca global por overlay (Ctrl+K). Cores via tokens (.novaplat).
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon } from './icons'
import { NAV, navAtivo, R } from '@/lib/nova/rotas'

export type ShellUser = {
  nome: string
  iniciais: string
  nivel: number
  xp: number
  streak: number
  avatarUrl?: string | null
}

type Tema = 'claro' | 'escuro'

function aplicarTema(t: Tema) {
  try { document.querySelectorAll('.novaplat').forEach((el) => el.setAttribute('data-theme', t)) } catch {}
}

export function NovaShell({
  user, foco, pendenciasDuvidas = 0, logo, nome = 'Revisão', temaInicial = 'claro', children,
}: {
  user: ShellUser
  foco?: string | null
  pendenciasDuvidas?: number
  logo?: string | null
  nome?: string
  temaInicial?: Tema
  children: React.ReactNode
}) {
  const pathname = usePathname() || R.inicio
  const router = useRouter()
  const ativo = navAtivo(pathname)
  const [recolhido, setRecolhido] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [buscaOpen, setBuscaOpen] = React.useState(false)
  const [tema, setTema] = React.useState<Tema>(temaInicial)

  React.useEffect(() => {
    try {
      setRecolhido(localStorage.getItem('novaplat:sidebar') === '1')
      const t = localStorage.getItem('novaplat:theme') as Tema | null
      if (t === 'claro' || t === 'escuro') { setTema(t); aplicarTema(t) }
    } catch {}
  }, [])

  // Fecha drawer ao navegar.
  React.useEffect(() => { setMobileOpen(false) }, [pathname])

  const toggleRecolher = () => setRecolhido((v) => { const n = !v; try { localStorage.setItem('novaplat:sidebar', n ? '1' : '0') } catch {}; return n })
  const toggleTema = () => setTema((v) => { const n: Tema = v === 'claro' ? 'escuro' : 'claro'; aplicarTema(n); try { localStorage.setItem('novaplat:theme', n) } catch {}; return n })

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscaOpen(true) }
      if (e.key === 'Escape') { setBuscaOpen(false); setMobileOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const W = recolhido ? 76 : 264
  const abreMais = () => setMobileOpen(true)

  const DOWN = [
    { label: 'Início', icon: 'home', href: R.inicio },
    { label: 'Estudos', icon: 'target', href: R.painel },
    { label: 'Cursos', icon: 'book', href: R.cursos },
    { label: 'Comunidade', icon: 'users', href: R.comunidade },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* backdrop do drawer (mobile) */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(10,5,40,.5)', backdropFilter: 'blur(2px)' }} />}

      {/* ───────── Menu lateral ───────── */}
      <aside className={`np-sidebar${mobileOpen ? ' np-open' : ''}`} style={{ width: W, flexShrink: 0, background: 'var(--sidebar)', color: '#FFFFFF', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', transition: 'width .18s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px', minHeight: 64 }}>
          {logo ? <img src={logo} alt={nome} style={{ height: 30, width: 30, borderRadius: 8, objectFit: 'cover', background: '#fff' }} />
            : <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '.04em' }}>R</span>}
          {!recolhido && <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: '.02em', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>REVISÃO</span>}
          <button type="button" onClick={toggleRecolher} aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Icon n={recolhido ? 'arrow' : 'back'} size={15} />
          </button>
        </div>

        <nav aria-label="Menu principal" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 12px', flex: 1, overflowY: 'auto' }}>
          {NAV.map((item) => {
            const on = item.key === ativo
            const badge = item.key === 'duvidas' && pendenciasDuvidas > 0 ? pendenciasDuvidas : undefined
            return (
              <Link key={item.key} href={item.href} title={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 11, minHeight: 42, padding: recolhido ? '8px 0' : '8px 12px', justifyContent: recolhido ? 'center' : 'flex-start',
                borderRadius: 12, fontSize: 13.5, lineHeight: 1.25, textDecoration: 'none',
                fontWeight: on ? 800 : 600, background: on ? 'var(--gold)' : 'transparent', color: on ? 'var(--goldInk)' : '#E6DEFF',
              }}>
                <Icon n={item.icon} size={18} />
                {!recolhido && <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  {badge ? <span style={{ flexShrink: 0, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 99, background: on ? 'var(--goldInk)' : 'var(--gold)', color: on ? 'var(--gold)' : 'var(--goldInk)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span> : null}
                </span>}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link href={R.perfil} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: recolhido ? 8 : 10, borderRadius: 14, background: 'rgba(255,255,255,.08)', textDecoration: 'none', color: '#fff' }}>
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)', color: 'var(--goldInk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{user.iniciais}</span>}
            {!recolhido && <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.nome}</b>
              <span style={{ fontSize: 11, color: '#CFC4FF' }}>Nível {user.nivel} · {user.xp.toLocaleString('pt-BR')} XP</span>
            </span>}
          </Link>
          <a href="/aluno/sair" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: recolhido ? '8px 0' : '8px 12px', justifyContent: recolhido ? 'center' : 'flex-start', borderRadius: 12, color: '#E6DEFF', fontSize: 13, textDecoration: 'none' }}>
            <Icon n="x" size={16} />{!recolhido && 'Sair'}
          </a>
        </div>
      </aside>

      {/* ───────── Conteúdo ───────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 28px', background: 'var(--top)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)' }}>
          <button type="button" className="np-hamburger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon n="menu" size={18} />
          </button>

          <button type="button" onClick={() => setBuscaOpen(true)} className="np-busca-trigger" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', width: 'min(440px, 42vw)', cursor: 'text', textAlign: 'left' }}>
            <Icon n="search" size={16} />
            <span style={{ flex: 1, fontSize: 14 }}>Buscar simulados, aulas, julgados…</span>
            <kbd style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)' }}>Ctrl K</kbd>
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="np-hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 13px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E0A800' }} />Foco: {foco ?? 'definir'}
            </span>
            <span className="np-hide-sm" title="Sequência de dias" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 38, padding: '0 11px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13, fontWeight: 800 }}>
              <Icon n="flame" size={15} style={{ color: '#E0820A' }} />{user.streak}
            </span>
            <span className="np-hide-sm" title="XP" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 38, padding: '0 11px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13, fontWeight: 800 }}>
              <Icon n="bolt" size={15} style={{ color: 'var(--brand)' }} />{user.xp.toLocaleString('pt-BR')}
            </span>
            <button type="button" onClick={toggleTema} aria-label={tema === 'claro' ? 'Tema escuro' : 'Tema claro'} title={tema === 'claro' ? 'Tema escuro' : 'Tema claro'} style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon n={tema === 'claro' ? 'moon' : 'sun'} size={17} />
            </button>
            <button type="button" aria-label="Notificações" style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon n="bell" size={17} />
              <span style={{ position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)' }} />
            </button>
            <Link href={R.perfil} aria-label="Minha conta" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gold)', color: 'var(--goldInk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, textDecoration: 'none', flexShrink: 0 }}>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : user.iniciais}
            </Link>
          </div>
        </header>

        <main className="np-main" style={{ position: 'relative', padding: '28px 28px 48px', display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 1180, width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>

      {/* ───────── Barra inferior (mobile) ───────── */}
      <nav className="np-downbar" aria-label="Navegação" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'none', alignItems: 'stretch', justifyContent: 'space-around', background: 'var(--surface)', borderTop: '1px solid var(--line)', padding: '6px 4px', paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        {DOWN.map((d) => {
          const on = navAtivo(d.href) === ativo && (d.href === R.inicio ? ativo === 'inicio' : true)
          return (
            <Link key={d.href} href={d.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 0', color: on ? 'var(--brand)' : 'var(--muted)', fontSize: 10.5, fontWeight: 700, textDecoration: 'none' }}>
              <Icon n={d.icon} size={20} />{d.label}
            </Link>
          )
        })}
        <button type="button" onClick={abreMais} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 0', color: 'var(--muted)', fontSize: 10.5, fontWeight: 700, background: 'transparent', border: 0, cursor: 'pointer' }}>
          <Icon n="menu" size={20} />Mais
        </button>
      </nav>

      {/* ───────── Overlay de busca (Ctrl+K) ───────── */}
      {buscaOpen && <BuscaOverlay onClose={() => setBuscaOpen(false)} onGo={(href) => { setBuscaOpen(false); router.push(href) }} />}
    </div>
  )
}

function BuscaOverlay({ onClose, onGo }: { onClose: () => void; onGo: (href: string) => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { ref.current?.focus() }, [])
  const atalhos: [string, string, string][] = [
    ['clip', 'Simulados', R.questoes], ['qbook', 'Banco de questões', R.banco], ['book', 'Meus cursos', R.cursos],
    ['cal', 'Cronograma de hoje', R.cronogramaHoje], ['chart', 'Meu desempenho', R.desempenho], ['gavel', 'JurisClub', R.jurisclub],
    ['bookmark', 'Meus cadernos', R.cadernos], ['info', 'Central de dúvidas', R.duvidas],
  ]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,10,50,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Busca" style={{ width: 'min(640px, 92vw)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(10,5,40,.7)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon n="search" size={18} />
          <input ref={ref} type="text" placeholder="Buscar simulados, aulas, julgados…" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 15, color: 'var(--ink)' }} />
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer' }}><Icon n="x" size={14} /></button>
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 8px' }}>Atalhos</div>
          {atalhos.map(([icon, label, href]) => (
            <button key={href} type="button" onClick={() => onGo(href)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 10, border: 0, background: 'transparent', color: 'var(--ink)', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={icon} size={16} /></span>
              <span style={{ flex: 1 }}>{label}</span>
              <Icon n="chev" size={16} style={{ color: 'var(--muted2)' }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
