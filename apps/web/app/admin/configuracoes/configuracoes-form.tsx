'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, RotateCcw, ImageIcon, Loader2, Bell, Moon, FolderOpen, MoreVertical, Menu } from 'lucide-react'

/**
 * Lê uma variável CSS do sistema e converte para hex. Renderiza a cor (lab,
 * oklch, etc.) num pixel do canvas e lê o RGB real — funciona p/ qualquer espaço.
 * `sobreVar`: pinta esse fundo antes (para compor cores com alpha, ex.: bordas
 * `oklch(1 0 0 / 10%)` ficam na cor efetiva visível, não branco sólido).
 */
function corDoSistema(varName: string, sobreVar?: string): string | null {
  if (typeof document === 'undefined') return null
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return null
  const canvas = document.createElement('canvas')
  canvas.width = 1; canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    if (sobreVar) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue(sobreVar).trim()
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 1, 1) }
    }
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
  } catch { return null }
  const d = ctx.getImageData(0, 0, 1, 1).data
  return '#' + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('')
}

/** Texto que contrasta com um fundo hex (claro → escuro, escuro → branco). */
function contraste(hex: string): string {
  const h = (hex || '#000000').replace('#', '')
  if (h.length < 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), bl = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255
  return lum > 0.6 ? '#18181b' : '#ffffff'
}

interface Cores {
  sidebar: string; sidetext: string; active: string; topbar: string; sborder: string
  bg: string; text: string; card: string; cborder: string; btn: string; accent: string
}
interface Tema {
  nome_site: string; titulo_pagina: string; logo_url: string | null; logo_png_bg: string; cores: Cores
}

const DEFAULT: Tema = {
  nome_site: 'Plataforma',
  titulo_pagina: 'Banco de Questões',
  logo_url: null,
  logo_png_bg: '#ffffff',
  cores: { sidebar: '#0f0f13', sidetext: '#c8c8d0', active: '#7f77dd', topbar: '#111118', sborder: '#35353f', bg: '#18181f', text: '#e8e8ee', card: '#26262f', cborder: '#35353f', btn: '#7f77dd', accent: '#7f77dd' },
}

const PRESETS: { nome: string; cores: Cores }[] = [
  { nome: 'Dark Violet', cores: DEFAULT.cores },
  { nome: 'Dark Blue', cores: { sidebar: '#0c1322', sidetext: '#c2cce0', active: '#4f7fff', topbar: '#0e1626', sborder: '#25304a', bg: '#121a2b', text: '#e6ecf7', card: '#1b2540', cborder: '#25304a', btn: '#4f7fff', accent: '#4f7fff' } },
  { nome: 'Dark Green', cores: { sidebar: '#0c1410', sidetext: '#c2d6c8', active: '#36c08a', topbar: '#0e1812', sborder: '#233129', bg: '#111c16', text: '#e6f2ea', card: '#19271f', cborder: '#233129', btn: '#36c08a', accent: '#36c08a' } },
  { nome: 'Light', cores: { sidebar: '#ffffff', sidetext: '#444b58', active: '#6d28d9', topbar: '#ffffff', sborder: '#e5e7eb', bg: '#f6f7f9', text: '#1a1d24', card: '#ffffff', cborder: '#e5e7eb', btn: '#6d28d9', accent: '#6d28d9' } },
  { nome: 'Coral', cores: { sidebar: '#1a1012', sidetext: '#e6c8c8', active: '#ff6b5e', topbar: '#1f1315', sborder: '#3a2628', bg: '#201416', text: '#f5e6e6', card: '#2b1c1e', cborder: '#3a2628', btn: '#ff6b5e', accent: '#ff6b5e' } },
  { nome: 'Slate', cores: { sidebar: '#0f1318', sidetext: '#c5ccd6', active: '#64748b', topbar: '#121821', sborder: '#2a323d', bg: '#161b22', text: '#e7ecf2', card: '#1f2630', cborder: '#2a323d', btn: '#64748b', accent: '#64748b' } },
  { nome: 'Rose', cores: { sidebar: '#1a0f15', sidetext: '#e6c8d6', active: '#f43f7f', topbar: '#1f1319', sborder: '#3a2630', bg: '#20141a', text: '#f5e6ee', card: '#2b1c24', cborder: '#3a2630', btn: '#f43f7f', accent: '#f43f7f' } },
]

const SIDEBAR_CAMPOS: [keyof Cores, string][] = [['sidebar', 'Fundo da sidebar'], ['sidetext', 'Texto da sidebar'], ['active', 'Item ativo'], ['topbar', 'Fundo da topbar'], ['sborder', 'Cor da borda']]
const CONTEUDO_CAMPOS: [keyof Cores, string][] = [['bg', 'Fundo'], ['text', 'Texto'], ['card', 'Cor do card'], ['cborder', 'Borda do card'], ['btn', 'Botão'], ['accent', 'Destaque']]

function Swatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="relative inline-flex h-7 w-9 shrink-0 overflow-hidden rounded-md border" style={{ borderColor: 'var(--cfg-border)' }}>
      <span className="absolute inset-0" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
  )
}

export function ConfiguracoesForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const inicial: Tema = {
    nome_site: tema?.nome_site ?? DEFAULT.nome_site,
    titulo_pagina: tema?.titulo_pagina ?? DEFAULT.titulo_pagina,
    logo_url: tema?.logo_url ?? null,
    logo_png_bg: tema?.logo_png_bg ?? DEFAULT.logo_png_bg,
    cores: { ...DEFAULT.cores, ...(tema?.cores ?? {}) },
  }
  const [t, setT] = useState<Tema>(inicial)
  const [aba, setAba] = useState<'logo' | 'sidebar' | 'conteudo'>('logo')
  const [isPng, setIsPng] = useState<boolean>(typeof tema?.logo_url === 'string' && tema.logo_url.startsWith('data:image/png'))
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const editou = useRef(false)

  // Sem tema salvo: a prévia espelha as cores reais do sistema (claro/escuro).
  // Reage à troca de modo, a menos que o usuário já tenha editado.
  useEffect(() => {
    if (tema?.cores) return
    const sincronizar = () => {
      if (editou.current) return
      const fb = DEFAULT.cores
      const g = (v: string, d: string) => corDoSistema(v) ?? d
      setT((p) => ({ ...p, cores: {
        sidebar: g('--sidebar', fb.sidebar), sidetext: g('--sidebar-foreground', fb.sidetext), active: corDoSistema('--sidebar-accent', '--sidebar') ?? fb.active,
        topbar: g('--sidebar', fb.topbar), sborder: corDoSistema('--sidebar-border', '--sidebar') ?? fb.sborder,
        bg: g('--background', fb.bg), text: g('--foreground', fb.text), card: g('--card', fb.card),
        cborder: corDoSistema('--border', '--card') ?? fb.cborder, btn: g('--primary', fb.btn), accent: g('--primary', fb.accent),
      } }))
    }
    sincronizar()
    const obs = new MutationObserver(sincronizar)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const c = t.cores
  const setCor = (k: keyof Cores, v: string) => { editou.current = true; setT((p) => ({ ...p, cores: { ...p.cores, [k]: v } })) }
  const aplicarPreset = (cores: Cores) => { editou.current = true; setT((p) => ({ ...p, cores: { ...cores } })) }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsPng(file.type === 'image/png')
    const reader = new FileReader()
    reader.onload = () => setT((p) => ({ ...p, logo_url: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  function salvar() {
    start(async () => {
      const payload = {
        ...t,
        // espelha campos legados p/ compatibilidade com o tema atual
        cor_primaria: c.btn, cor_secundaria: c.card, cor_accent: c.accent, logo_url: t.logo_url ?? undefined,
      }
      try { await salvarTema(payload); toast.success('Identidade visual salva!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ '--cfg-bg': 'var(--card)', '--cfg-border': 'var(--border)', '--cfg-muted': 'var(--muted-foreground)' } as React.CSSProperties}
    >
      <div className="flex flex-col lg:flex-row">
        {/* ── PAINEL DE CONTROLES ── */}
        <div className="w-full shrink-0 border-b lg:w-[230px] lg:border-b-0 lg:border-r">
          {/* Abas */}
          <div className="flex border-b text-sm">
            {(['logo', 'sidebar', 'conteudo'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setAba(k)}
                className={`flex-1 px-2 py-2.5 font-medium capitalize transition-colors ${aba === k ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {k === 'conteudo' ? 'Conteúdo' : k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-3">
            {/* ABA LOGO */}
            {aba === 'logo' && (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground hover:border-primary">
                  <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg text-2xl font-bold"
                    style={{ background: t.logo_url ? (isPng ? t.logo_png_bg : 'transparent') : c.btn, color: contraste(c.btn) }}>
                    {t.logo_url ? <img src={t.logo_url} alt="logo" className="h-full w-full object-contain" /> : (t.nome_site[0] ?? 'P').toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Enviar logo</span>
                </button>
                {isPng && t.logo_url && (
                  <Field label="Fundo (PNG transparente)"><Swatch value={t.logo_png_bg} onChange={(v) => setT((p) => ({ ...p, logo_png_bg: v }))} /></Field>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nome do site</label>
                  <input value={t.nome_site} onChange={(e) => setT((p) => ({ ...p, nome_site: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Título da página</label>
                  <input value={t.titulo_pagina} onChange={(e) => setT((p) => ({ ...p, titulo_pagina: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Presets</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button key={p.nome} type="button" title={p.nome} onClick={() => aplicarPreset(p.cores)}
                        className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: p.cores.btn, borderColor: 'var(--cfg-border)' }} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ABA SIDEBAR */}
            {aba === 'sidebar' && (
              <div className="space-y-2.5">
                {SIDEBAR_CAMPOS.map(([k, label]) => (
                  <Field key={k} label={label}><Swatch value={c[k]} onChange={(v) => setCor(k, v)} /></Field>
                ))}
              </div>
            )}

            {/* ABA CONTEÚDO */}
            {aba === 'conteudo' && (
              <div className="space-y-2.5">
                {CONTEUDO_CAMPOS.map(([k, label]) => (
                  <Field key={k} label={label}><Swatch value={c[k]} onChange={(v) => setCor(k, v)} /></Field>
                ))}
              </div>
            )}
          </div>

          {/* Rodapé do painel */}
          <div className="flex flex-col gap-2 border-t p-3">
            <button type="button" onClick={() => { editou.current = true; setT(DEFAULT); setIsPng(false) }}
              className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-4 w-4" /> Resetar padrão
            </button>
            <button type="button" onClick={salvar} disabled={pending}
              className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
          </div>
        </div>

        {/* ── PRÉVIA ── */}
        <div className="flex-1 bg-muted/30 p-4">
          {/* navegador falso */}
          <div className="overflow-hidden rounded-lg border shadow-sm">
            <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 flex-1 truncate rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t.nome_site.toLowerCase().replace(/\s+/g, '')}.app/admin/banco-questoes</span>
            </div>
            <Preview t={t} isPng={isPng} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** Prévia do dashboard com as cores aplicadas. */
function Preview({ t, isPng }: { t: Tema; isPng: boolean }) {
  const c = t.cores
  const menu = [
    { nome: 'Dashboard' }, { nome: 'Simulado', sub: ['Aplicação', 'Questões', 'Banco de questões', 'Correção'] },
    { nome: 'Alunos' }, { nome: 'Análise' }, { nome: 'Configuração' },
  ]
  return (
    <div className="flex h-[420px] text-[12px]" style={{ background: c.bg, color: c.text, fontFamily: 'system-ui, sans-serif' }}>
      {/* sidebar */}
      <div className="flex w-[150px] shrink-0 flex-col" style={{ background: c.sidebar, borderRight: `1px solid ${c.sborder}` }}>
        <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: `1px solid ${c.sborder}` }}>
          <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md text-[11px] font-bold" style={{ background: t.logo_url ? (isPng ? t.logo_png_bg : 'transparent') : c.btn, color: contraste(c.btn) }}>
            {t.logo_url ? <img src={t.logo_url} alt="" className="h-full w-full object-contain" /> : (t.nome_site[0] ?? 'P').toUpperCase()}
          </span>
          <span className="truncate font-semibold" style={{ color: c.sidetext }}>{t.nome_site}</span>
        </div>
        <div className="space-y-0.5 px-2 py-2">
          <p className="px-1.5 py-1 text-[9px] font-semibold uppercase opacity-50" style={{ color: c.sidetext }}>Menu</p>
          {menu.map((m) => (
            <div key={m.nome}>
              <div className="rounded-md px-2 py-1.5" style={{ color: c.sidetext }}>{m.nome}</div>
              {m.sub && (
                <div className="ml-2 space-y-0.5 border-l pl-2" style={{ borderColor: c.sborder }}>
                  {m.sub.map((s) => {
                    const ativo = s === 'Banco de questões'
                    return (
                      <div key={s} className="rounded-md px-2 py-1" style={ativo ? { background: c.active, color: contraste(c.active) } : { color: c.sidetext, opacity: 0.85 }}>{s}</div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* área principal */}
      <div className="flex flex-1 flex-col">
        {/* topbar */}
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: c.topbar, borderBottom: `1px solid ${c.sborder}` }}>
          <Menu className="h-4 w-4" style={{ color: c.sidetext }} />
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4" style={{ color: c.sidetext }} />
            <Moon className="h-4 w-4" style={{ color: c.sidetext }} />
            <span className="h-6 w-6 rounded-full" style={{ background: c.accent }} />
          </div>
        </div>
        {/* conteúdo */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-base font-bold">{t.titulo_pagina}</h2>
            <button className="rounded-md px-3 py-1.5 text-[11px] font-medium" style={{ background: c.btn, color: contraste(c.btn) }}>+ Criar banco</button>
          </div>
          <p className="mb-3 text-[11px] opacity-60">Crie bancos para organizar suas questões.</p>
          <div className="grid grid-cols-3 gap-2.5">
            {['Test 1', 'Test 2', 'Test 3'].map((n, i) => (
              <div key={n} className="rounded-lg p-2.5" style={{ background: c.card, border: `1px solid ${c.cborder}` }}>
                <div className="mb-2 flex items-start justify-between">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `color-mix(in oklab, ${c.accent} 22%, transparent)`, color: c.accent }}><FolderOpen className="h-4 w-4" /></span>
                  <MoreVertical className="h-4 w-4 opacity-40" />
                </div>
                <p className="font-medium">{n}</p>
                <p className="text-[10px] opacity-60">{[12, 8, 20][i]} questões</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
