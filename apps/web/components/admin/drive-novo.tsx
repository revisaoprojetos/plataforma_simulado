'use client'

// Botão "Novo" PORTADO do protótipo card-pasta-drive(1).html: botão arredondado da marca + menu com
// Nova pasta, Uploads, Novo projeto e submenus de Documento/Planilha/Apresentação/Vídeo/Formulário/Mais,
// + diálogo "Nova pasta" com seletor de cor. Reusa as classes gd-menu/gd-item/gd-submenu (DrivePastaStyles)
// e gd-dialog/gd-btn/gd-field/gd-scrim (DriveAcessoStyles), ambas já na página. Cor do botão = token da marca.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { TIPOS_CONTEUDO, ORDEM_TIPOS, seloStyle } from '@/lib/biblioteca/tipos-conteudo'

const sv = (o: Record<string, string | number>): CSSProperties => o as CSSProperties
const PALETTE = ['#444746', '#ac725e', '#d06b64', '#f83a22', '#fa573c', '#ff7537', '#ffad46', '#fad165', '#fbe983', '#b3dc6c', '#7bd148', '#16a765', '#42d692', '#92e1c0']

const P = {
  newFolder: 'M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z',
  upFile: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15.01l1.41 1.41L11 14.84V19h2v-4.16l1.59 1.59L16 15.01 12.01 11 8 15.01z',
  upFolder: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10zM8 13.01l1.41 1.41L11 12.84V17h2v-4.16l1.59 1.59L16 13.01 12.01 9 8 13.01z',
  project: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  doc: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  sheet: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 8h-8v8H9v-8H5V9h4V5h2v4h8v2z',
  slide: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H5V8h14v8z',
  video: 'M8 5v14l11-7z',
  form: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm8 8h-6v-2h6v2zm0-4h-6v-2h6v2zm0-4h-6V7h6v2z',
  drawing: 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a.996.996 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a.996.996 0 0 0 0-1.41z',
  map: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z',
  site: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  script: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  tpl: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  chev: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  folder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
}
const Ico = ({ d }: { d: string }) => (<svg viewBox="0 0 24 24"><path d={d} /></svg>)

export function DriveNovoButton({
  rotuloBranco, onNovaPasta, onUploadArquivos, onUploadPasta, onDocumentoBranco, onToast,
}: {
  rotuloBranco: string
  onNovaPasta: (nome: string, cor: string | null) => void
  onUploadArquivos: (files: File[]) => void
  onUploadPasta: (files: File[]) => void
  onDocumentoBranco: () => void
  onToast?: (msg: string) => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (folderRef.current) folderRef.current.setAttribute('webkitdirectory', '') }, [])
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number; origin: string; flip: boolean }>({ left: 0, top: 0, origin: 'top left', flip: false })
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [novaPastaAberta, setNovaPastaAberta] = useState(false)

  const ripple = useCallback((el: HTMLElement, e?: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2
    const x = (e?.clientX ?? r.left + r.width / 2) - r.left - s / 2
    const y = (e?.clientY ?? r.top + r.height / 2) - r.top - s / 2
    const span = document.createElement('span'); span.className = 'gd-ripple'
    Object.assign(span.style, { width: s + 'px', height: s + 'px', left: x + 'px', top: y + 'px', color: '#fff', opacity: '.25' })
    el.appendChild(span); setTimeout(() => span.remove(), 650)
  }, [])

  const fechar = useCallback(() => { setOpen(false); setShown(false); if (subTimer.current) clearTimeout(subTimer.current) }, [])

  useLayoutEffect(() => {
    if (!open) return
    const b = btnRef.current?.getBoundingClientRect(); const el = menuRef.current
    if (!b || !el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let left = b.left, top = b.bottom + 8, oy = 'top'
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8)
    if (top + h > window.innerHeight - 8) { top = Math.max(8, b.top - h - 8); oy = 'bottom' }
    const flip = left + w + 250 > window.innerWidth
    setCoords({ left, top, origin: `${oy} left`, flip })
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) fechar() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    const onMove = () => fechar()
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true); window.addEventListener('resize', onMove)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [open, fechar])

  // Mantém o comportamento de "cancelar submenu pendente" ao passar por um item simples.
  function hoverItem(_alvo?: unknown) { if (subTimer.current) clearTimeout(subTimer.current) }
  const act = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); const t = e.currentTarget as HTMLElement; ripple(t, e); setTimeout(() => { fechar(); fn() }, 140) }
  // Abre o MESMO seletor de arquivo da "Upload de arquivo", restringindo as extensões ao tipo escolhido.
  // Todos passam pelo fluxo de upload existente (onUploadArquivos → ticket → importarDeStorage).
  const pickTipo = (accept: string) => (e: React.MouseEvent) => {
    e.stopPropagation(); ripple(e.currentTarget as HTMLElement, e); fechar()
    const el = fileRef.current
    if (el) el.setAttribute('accept', accept)
    setTimeout(() => el?.click(), 140)
  }

  let idx = 0
  const i = () => idx++

  return (
    <>
      <button
        ref={btnRef}
        className={`gd-new-btn${open ? ' gd-open' : ''}`}
        aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); ripple(btnRef.current!, e); open ? fechar() : setOpen(true) }}
      >
        <span className="gd-plus"><svg viewBox="0 0 24 24"><path d={P.plus} /></svg></span>Novo
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          id="gd-new-menu"
          role="menu"
          className={`gd-menu${shown ? ' gd-open' : ''}`}
          style={{ left: coords.left, top: coords.top, transformOrigin: coords.origin }}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => { if (subTimer.current) clearTimeout(subTimer.current) }}
        >
          <div className="gd-item" style={sv({ '--i': i() })} onMouseEnter={() => hoverItem(null)} onClick={act(() => setNovaPastaAberta(true))}><Ico d={P.newFolder} /><span className="gd-label">Nova pasta</span></div>
          <div className="gd-divider" style={sv({ '--i': i() })} />
          <div className="gd-item" style={sv({ '--i': i() })} onMouseEnter={() => hoverItem(null)} onClick={(e) => { e.stopPropagation(); ripple(e.currentTarget as HTMLElement, e); fechar(); fileRef.current?.removeAttribute('accept'); fileRef.current?.click() }}><Ico d={P.upFile} /><span className="gd-label">Upload de arquivo</span></div>
          <div className="gd-item" style={sv({ '--i': i() })} onMouseEnter={() => hoverItem(null)} onClick={(e) => { e.stopPropagation(); ripple(e.currentTarget as HTMLElement, e); fechar(); folderRef.current?.click() }}><Ico d={P.upFolder} /><span className="gd-label">Upload de pasta</span></div>
          <div className="gd-divider" style={sv({ '--i': i() })} />
          <div className="gd-item" style={sv({ '--i': i() })} onMouseEnter={() => hoverItem(null)} onClick={act(() => onDocumentoBranco())}>
            <span className="gd-tb" style={{ background: 'linear-gradient(135deg, var(--brand-primary, var(--primary)), color-mix(in oklab, var(--brand-primary, var(--primary)) 55%, #7b61ff))' }}><Ico d={P.add} /></span>
            <span className="gd-label">{rotuloBranco}</span>
          </div>
          <div className="gd-divider" style={sv({ '--i': i() })} />
          <div className="gd-colors-title" style={{ padding: '2px 12px 4px' }}>Enviar por tipo</div>
          {/* Todos os tipos (DOC/PDF/PPT/XLS/Vídeo/Áudio) usam o MESMO fluxo de upload; só filtram a extensão. */}
          {ORDEM_TIPOS.map((kind) => {
            const t = TIPOS_CONTEUDO[kind]
            return (
              <div key={kind} className="gd-item" style={sv({ '--i': i() })} onMouseEnter={() => hoverItem(null)} onClick={pickTipo(t.extensoes.join(','))}>
                <span className="gd-tb" style={{ background: seloStyle(kind).color, fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '.02em' }}>{t.sigla}</span>
                <span className="gd-label">Enviar {t.label}</span>
                <span style={{ fontSize: 11, color: 'var(--gd-text-3)' }}>{t.extensoes.join(' ')}</span>
              </div>
            )
          })}
        </div>,
        document.body,
      )}

      {novaPastaAberta && <NovaPastaDialog rotuloBranco={rotuloBranco} onFechar={() => setNovaPastaAberta(false)} onCriar={(nome, cor) => { setNovaPastaAberta(false); onNovaPasta(nome, cor) }} />}
      {/* Seletores NATIVOS (abrem direto o explorador de arquivos) */}
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; if (fs.length) onUploadArquivos(fs) }} />
      <input ref={folderRef} type="file" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.currentTarget.value = ''; if (fs.length) onUploadPasta(fs) }} />
    </>
  )
}

function NovaPastaDialog({ onFechar, onCriar }: { rotuloBranco: string; onFechar: () => void; onCriar: (nome: string, cor: string | null) => void }) {
  const [shown, setShown] = useState(false)
  const [nome, setNome] = useState('Pasta sem título')
  const [cor, setCor] = useState<string>(PALETTE[0])
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }) // eslint-disable-line
  function fechar() { setShown(false); setTimeout(onFechar, 260) }
  function criar() { const v = nome.trim(); if (!v) return; setShown(false); setTimeout(() => onCriar(v, cor === PALETTE[0] ? null : cor), 200) }
  return createPortal(
    <>
      <div className={`gd-scrim${shown ? ' gd-show' : ''}`} onClick={fechar} />
      <div className={`gd-dialog gd-small${shown ? ' gd-show' : ''}`} role="dialog" aria-modal="true">
        <header><h2>Nova pasta</h2><button className="gd-icon-btn" aria-label="Fechar" onClick={fechar}><svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg></button></header>
        <div className="gd-dlg-body">
          <div className="gd-nf-prev"><svg viewBox="0 0 24 24" style={{ fill: cor }}><path d={P.folder} /></svg></div>
          <input className="gd-field gd-big" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criar() }} aria-label="Nome da pasta" />
          <div className="gd-lbl">Cor</div>
          <div className="gd-dots">
            {PALETTE.map((c, k) => (
              <button key={c} className={`gd-dot${c === cor ? ' gd-sel' : ''}`} style={sv({ background: c, '--k': k })} aria-label={`Cor ${c}`} onClick={() => setCor(c)}><svg viewBox="0 0 24 24"><path d={P.check} /></svg></button>
            ))}
          </div>
        </div>
        <footer><span className="gd-spacer" /><button className="gd-btn gd-text" onClick={fechar}>Cancelar</button><button className="gd-btn gd-filled" disabled={!nome.trim()} onClick={criar}>Criar</button></footer>
      </div>
    </>,
    document.body,
  )
}

// ───────── Painel de progresso de UPLOAD (estilo Drive) — total + por arquivo com % ─────────
export type DriveUploadStatus = 'enviando' | 'processando' | 'ok' | 'erro'
export type DriveUploadItem = { id: string; nome: string; cor: string; pct: number; status: DriveUploadStatus }
// Rótulos do título (reutilizável p/ outros contextos além de documentos — ex.: questões do simulado).
export type DriveUploadLabels = { gerundio: string; subSing: string; subPlur: string; verbSing: string; verbPlur: string }
const LABELS_PADRAO: DriveUploadLabels = { gerundio: 'Importando', subSing: 'documento', subPlur: 'documentos', verbSing: 'importado', verbPlur: 'importados' }

export function DriveUploadPanel({ itens, onClose, labels = LABELS_PADRAO }: { itens: DriveUploadItem[]; onClose: () => void; labels?: DriveUploadLabels }) {
  const [colapsado, setColapsado] = useState(false)
  const total = itens.length
  const okCount = itens.filter((x) => x.status === 'ok').length
  const erroCount = itens.filter((x) => x.status === 'erro').length
  const concluidos = okCount + erroCount
  const fracao = (x: DriveUploadItem) => (x.status === 'ok' || x.status === 'erro' ? 1 : x.status === 'processando' ? 0.95 : (x.pct / 100) * 0.9)
  const overall = Math.round((100 * itens.reduce((s, x) => s + fracao(x), 0)) / Math.max(1, total))
  const terminou = concluidos === total
  const titulo = terminou
    ? (erroCount ? `${okCount} ${okCount === 1 ? labels.verbSing : labels.verbPlur} · ${erroCount} com erro` : `${okCount} ${okCount === 1 ? labels.subSing : labels.subPlur} ${okCount === 1 ? labels.verbSing : labels.verbPlur}`)
    : `${labels.gerundio} ${concluidos} de ${total}…`
  return createPortal(
    <div className={`gd-up gd-show${colapsado ? ' gd-collapsed' : ''}`} role="status" aria-live="polite">
      <div className="gd-up-top">
        <span className="gd-up-ttl">{titulo}</span>
        {!terminou && <span className="gd-up-tot">{overall}%</span>}
        <button className="gd-icon-btn" onClick={() => setColapsado((c) => !c)} aria-label={colapsado ? 'Expandir' : 'Recolher'}>
          <svg viewBox="0 0 24 24" style={{ transform: colapsado ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }}><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
        </button>
        <button className="gd-icon-btn" onClick={onClose} aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg></button>
      </div>
      <div className="gd-up-barwrap"><div className="gd-up-bar" style={{ width: `${overall}%` }} /></div>
      <div className="gd-up-list"><div>
        {itens.map((it) => (
          <div key={it.id} className={`gd-up-row gd-u-${it.status}`}>
            <span className="gd-up-ic" style={{ background: it.cor }}><svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg></span>
            <div className="gd-up-mid">
              <span className="gd-up-nome" title={it.nome}>{it.nome}</span>
              <div className="gd-up-mini"><i style={{ width: `${it.status === 'enviando' ? it.pct : 100}%` }} /></div>
            </div>
            <span className="gd-up-st">
              {it.status === 'ok' ? <svg className="gd-up-ck" viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                : it.status === 'erro' ? <span className="gd-up-err">!</span>
                  : it.status === 'processando' ? <span className="gd-up-spin" />
                    : <span className="gd-up-pct">{it.pct}%</span>}
            </span>
          </div>
        ))}
      </div></div>
    </div>,
    document.body,
  )
}

// CSS do botão Novo + diálogo pequeno (dots). Reusa gd-menu/gd-item/gd-submenu (DrivePastaStyles) e
// gd-dialog/gd-btn/gd-field/gd-scrim (DriveAcessoStyles). Cor = token da marca (white-label).
export function DriveNovoStyles() {
  return (
    <style>{`
  .gd-new-btn{position:relative;overflow:hidden;isolation:isolate;display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 20px 0 8px;border:none;border-radius:14px;
    background:var(--brand-primary,var(--primary));color:var(--primary-foreground);font:inherit;font-size:14px;font-weight:600;letter-spacing:.2px;cursor:pointer;
    box-shadow:0 1px 2px color-mix(in oklab,var(--brand-primary,var(--primary)) 40%,transparent),0 4px 10px 1px color-mix(in oklab,var(--brand-primary,var(--primary)) 26%,transparent);
    transition:box-shadow .3s cubic-bezier(.2,0,0,1),background .25s,transform .25s cubic-bezier(.34,1.56,.64,1),border-radius .3s}
  .gd-new-btn:hover{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 90%,black);transform:translateY(-1px);
    box-shadow:0 2px 4px color-mix(in oklab,var(--brand-primary,var(--primary)) 38%,transparent),0 10px 22px 2px color-mix(in oklab,var(--brand-primary,var(--primary)) 30%,transparent)}
  .gd-new-btn:active{transform:scale(.96)}
  .gd-new-btn.gd-open{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 82%,black);border-radius:12px;transform:none}
  .gd-plus{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.18);transition:transform .5s cubic-bezier(.34,1.56,.64,1),background .3s,border-radius .3s}
  .gd-plus svg{width:20px;height:20px;fill:currentColor;transition:transform .5s cubic-bezier(.34,1.56,.64,1),fill .3s}
  .gd-new-btn:hover .gd-plus{transform:rotate(90deg);background:rgba(255,255,255,.26)}
  .gd-new-btn.gd-open .gd-plus{background:#fff;border-radius:50%}
  .gd-new-btn.gd-open .gd-plus svg{fill:var(--brand-primary,var(--primary));transform:rotate(135deg)}

  #gd-new-menu{min-width:336px}
  #gd-new-menu .gd-tb{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;flex-shrink:0;transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
  #gd-new-menu .gd-tb svg{width:14px;height:14px;fill:#fff}
  #gd-new-menu .gd-item:hover>.gd-tb{transform:scale(1.14) rotate(-6deg)}
  .gd-pchip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;background:var(--brand-primary,var(--primary));color:var(--primary-foreground);font-size:11px;font-weight:500;flex-shrink:0}

  /* diálogo Nova pasta */
  .gd-dialog.gd-small{width:min(440px,calc(100vw - 24px))}
  .gd-field.gd-big{width:100%;height:48px;font-size:16px}
  .gd-nf-prev{display:grid;place-items:center;height:110px;margin-bottom:16px;border-radius:18px;background:var(--gd-surface);border:1px solid var(--gd-divider)}
  .gd-nf-prev svg{width:64px;height:64px;transition:fill .4s cubic-bezier(.2,0,0,1);animation:gdIcoPulse2 .6s cubic-bezier(.34,1.56,.64,1)}
  @keyframes gdIcoPulse2{0%{transform:scale(1)}40%{transform:scale(1.22) rotate(-6deg)}100%{transform:scale(1)}}
  .gd-lbl{font-size:13px;font-weight:500;color:var(--gd-text-2);margin:18px 0 8px}
  .gd-dots{display:flex;flex-wrap:wrap;gap:10px}
  .gd-dot{width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;position:relative;padding:0;animation:gdDotIn .45s cubic-bezier(.34,1.56,.64,1) calc(var(--k)*22ms) both;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
  @keyframes gdDotIn{from{transform:scale(0)}}
  .gd-dot:hover{transform:scale(1.15)}
  .gd-dot::after{content:"";position:absolute;inset:-4px;border:2px solid var(--gd-accent);border-radius:50%;transform:scale(.6);opacity:0;transition:.3s cubic-bezier(.34,1.56,.64,1)}
  .gd-dot.gd-sel::after{transform:scale(1);opacity:1}
  .gd-dot svg{position:absolute;inset:6px;width:16px;height:16px;fill:#fff;opacity:0;transform:scale(.4);transition:.3s cubic-bezier(.34,1.56,.64,1)}
  .gd-dot.gd-sel svg{opacity:1;transform:scale(1)}

  /* painel de progresso de upload (reusa os tokens de .gd-up definidos no DriveAcessoStyles) */
  .gd-up{position:fixed;right:24px;bottom:24px;z-index:2500;width:360px;max-width:calc(100vw - 32px);border-radius:16px;
    background:var(--gd-menu-bg,#fff);color:var(--gd-text,#1f1f1f);overflow:hidden;
    box-shadow:0 24px 64px -12px rgba(32,33,36,.35),0 8px 24px rgba(32,33,36,.12);
    transform:translateY(24px) scale(.96);opacity:0;transition:transform .45s cubic-bezier(.05,.7,.1,1),opacity .25s}
  .gd-up.gd-show{transform:none;opacity:1}
  .gd-up-top{display:flex;align-items:center;gap:4px;padding:8px 8px 8px 16px;background:#303134;color:#fff;font-size:14px;font-weight:500}
  .gd-up-ttl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-up-tot{font-size:12px;color:#c7cacd;margin-right:2px;font-variant-numeric:tabular-nums}
  .gd-up-top .gd-icon-btn svg{fill:#fff;width:20px;height:20px}
  .gd-up-top .gd-icon-btn:hover{background:rgba(255,255,255,.12)}
  .gd-up-barwrap{height:3px;background:color-mix(in oklab,var(--brand-primary,var(--primary)) 16%,#fff)}
  .dark .gd-up-barwrap{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 22%,#2d2e31)}
  .gd-up-bar{height:100%;background:var(--brand-primary,var(--primary));transition:width .3s ease}
  .gd-up-list{display:grid;grid-template-rows:1fr;transition:grid-template-rows .35s cubic-bezier(.2,0,0,1)}
  .gd-up.gd-collapsed .gd-up-list{grid-template-rows:0fr}
  .gd-up-list>div{min-height:0;overflow:auto;max-height:300px}
  .gd-up-row{display:flex;align-items:center;gap:12px;padding:10px 16px;animation:gdUpFade .3s both}
  @keyframes gdUpFade{from{opacity:0;transform:translateY(4px)}}
  .gd-up-ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
  .gd-up-ic svg{width:17px;height:17px;fill:#fff}
  .gd-up-mid{flex:1;min-width:0}
  .gd-up-nome{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-up-mini{height:4px;border-radius:2px;background:color-mix(in oklab,var(--brand-primary,var(--primary)) 14%,#e9eef6);overflow:hidden;margin-top:5px}
  .dark .gd-up-mini{background:#3c4043}
  .gd-up-mini i{display:block;height:100%;width:0;background:var(--brand-primary,var(--primary));border-radius:2px;transition:width .2s linear}
  .gd-u-ok .gd-up-mini i{background:#0d904f}
  .gd-u-erro .gd-up-mini i{background:#d93025}
  .gd-up-st{min-width:44px;text-align:right;flex-shrink:0;font-size:12px;color:var(--gd-text-3,#5f6368);display:flex;align-items:center;justify-content:flex-end}
  .gd-up-ck{width:22px;height:22px;fill:#fff;background:#0d904f;border-radius:50%;padding:4px}
  .gd-up-err{width:22px;height:22px;border-radius:50%;background:#d93025;color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px}
  .gd-up-spin{width:18px;height:18px;border-radius:50%;border:2px solid color-mix(in oklab,var(--brand-primary,var(--primary)) 25%,transparent);border-top-color:var(--brand-primary,var(--primary));animation:gdUpSpin .7s linear infinite}
  @keyframes gdUpSpin{to{transform:rotate(360deg)}}
  .gd-up-pct{font-variant-numeric:tabular-nums}
    `}</style>
  )
}
