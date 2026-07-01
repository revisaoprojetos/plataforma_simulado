'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, RotateCcw, ImageIcon, Loader2, Bell, Moon, Sun, FolderOpen, MoreVertical, Menu, ArrowLeft, Upload, X } from 'lucide-react'

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
type LogoEstilo = 'quadrado' | 'arredondado' | 'borda'
type SelecaoEstilo = 'quadrada' | 'redonda' | 'borda'
interface Tema {
  nome_site: string; titulo_pagina: string
  logo_url: string | null; logo_grande_url: string | null; logo_selecao_url: string | null
  logo_png_bg: string; logo_estilo: LogoEstilo; logo_selecao_estilo: SelecaoEstilo; cores: Cores
}

const LOGO_ESTILOS: { id: LogoEstilo; nome: string }[] = [
  { id: 'quadrado', nome: 'Reto' },
  { id: 'arredondado', nome: 'Arredondado' },
  { id: 'borda', nome: 'Borda' },
]
const SELECAO_ESTILOS: { id: SelecaoEstilo; nome: string }[] = [
  { id: 'quadrada', nome: 'Quadrada' },
  { id: 'redonda', nome: 'Redonda' },
  { id: 'borda', nome: 'Com borda' },
]
/** Classes do quadro do logo conforme o estilo. */
export function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-lg'
}
/** Classes do quadro da imagem de seleção (tiles do login). */
export function frameSelecao(estilo?: string): string {
  if (estilo === 'quadrada') return 'rounded-xl'
  if (estilo === 'borda') return 'rounded-full border-2'
  return 'rounded-full'
}

const DEFAULT: Tema = {
  nome_site: 'Plataforma',
  titulo_pagina: 'Banco de Questões',
  logo_url: null,
  logo_grande_url: null,
  logo_selecao_url: null,
  logo_png_bg: '#ffffff',
  logo_estilo: 'arredondado',
  logo_selecao_estilo: 'redonda',
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
    logo_grande_url: tema?.logo_grande_url ?? null,
    logo_selecao_url: tema?.logo_selecao_url ?? null,
    logo_png_bg: tema?.logo_png_bg ?? DEFAULT.logo_png_bg,
    logo_estilo: (tema?.logo_estilo as LogoEstilo) ?? DEFAULT.logo_estilo,
    logo_selecao_estilo: (tema?.logo_selecao_estilo as SelecaoEstilo) ?? DEFAULT.logo_selecao_estilo,
    cores: { ...DEFAULT.cores, ...(tema?.cores ?? {}) },
  }
  const [t, setT] = useState<Tema>(inicial)
  const [aba, setAba] = useState<'logo' | 'sidebar' | 'conteudo'>('logo')
  const [previewModo, setPreviewModo] = useState<'painel' | 'login' | 'selecao'>('painel')
  const [loginDark, setLoginDark] = useState<boolean>(tema?.modo_padrao === 'dark')
  const [pending, start] = useTransition()
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
        <div className="w-full shrink-0 border-b lg:w-[300px] lg:border-b-0 lg:border-r">
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
              <div className="space-y-5">
                {/* Imagens */}
                <Grupo titulo="Imagens">
                  <LogoRow label="Logo (pequena)" desc="Sidebar, topo e ícones"
                    value={t.logo_url} onChange={(v) => setT((p) => ({ ...p, logo_url: v }))} onRemove={() => setT((p) => ({ ...p, logo_url: null }))}
                    frame={frameLogo(t.logo_estilo)} bg={t.logo_png_bg} inicial={(t.nome_site[0] ?? 'P').toUpperCase()} inicialBg={c.btn} />
                  <LogoRow label="Logo grande (login)" desc="Painel da esquerda do login"
                    value={t.logo_grande_url} onChange={(v) => setT((p) => ({ ...p, logo_grande_url: v }))} onRemove={() => setT((p) => ({ ...p, logo_grande_url: null }))} />
                  <LogoRow label="Imagem da seleção" desc="Bloco de seleção (início)"
                    value={t.logo_selecao_url} onChange={(v) => setT((p) => ({ ...p, logo_selecao_url: v }))} onRemove={() => setT((p) => ({ ...p, logo_selecao_url: null }))} />
                </Grupo>

                {/* Ícone — só faz sentido com a logo pequena */}
                {t.logo_url && (
                  <Grupo titulo="Ícone (logo pequena)">
                    <Field label="Cor de fundo">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setT((p) => ({ ...p, logo_png_bg: p.logo_png_bg === 'transparent' ? '#ffffff' : 'transparent' }))}
                          className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${t.logo_png_bg === 'transparent' ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>
                          Transparente
                        </button>
                        {t.logo_png_bg !== 'transparent' && <Swatch value={t.logo_png_bg} onChange={(v) => setT((p) => ({ ...p, logo_png_bg: v }))} />}
                      </div>
                    </Field>
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted-foreground">Borda</span>
                      <div className="flex gap-1.5">
                        {LOGO_ESTILOS.map((e) => (
                          <button key={e.id} type="button" onClick={() => setT((p) => ({ ...p, logo_estilo: e.id }))}
                            className={`flex-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${t.logo_estilo === e.id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>
                            {e.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Grupo>
                )}

                {/* Bloco de seleção (tiles da tela inicial do login) */}
                <Grupo titulo="Bloco de seleção">
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Formato da imagem</span>
                    <div className="flex gap-1.5">
                      {SELECAO_ESTILOS.map((e) => (
                        <button key={e.id} type="button" onClick={() => setT((p) => ({ ...p, logo_selecao_estilo: e.id }))}
                          className={`flex-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${t.logo_selecao_estilo === e.id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>
                          {e.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                </Grupo>

                {/* Identidade */}
                <Grupo titulo="Identidade">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Nome do site</label>
                    <input value={t.nome_site} onChange={(e) => setT((p) => ({ ...p, nome_site: e.target.value }))}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Título da página</label>
                    <input value={t.titulo_pagina} onChange={(e) => setT((p) => ({ ...p, titulo_pagina: e.target.value }))}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </Grupo>

                {/* Presets de cor */}
                <Grupo titulo="Presets de cor">
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button key={p.nome} type="button" title={p.nome} onClick={() => aplicarPreset(p.cores)}
                        className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: p.cores.btn, borderColor: 'var(--cfg-border)' }} />
                    ))}
                  </div>
                </Grupo>
              </div>
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
            <button type="button" onClick={() => { editou.current = true; setT(DEFAULT) }}
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
          {/* alternador Painel / Login */}
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs">
              {(['painel', 'login', 'selecao'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setPreviewModo(m)}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${previewModo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {m === 'painel' ? 'Painel' : m === 'login' ? 'Login' : 'Seleção'}
                </button>
              ))}
            </div>
            {previewModo !== 'painel' && (
              <button type="button" onClick={() => setLoginDark((v) => !v)} title="Alternar claro/escuro do login"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                {loginDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {loginDark ? 'Escuro' : 'Claro'}
              </button>
            )}
          </div>

          {/* navegador falso */}
          <div className="overflow-hidden rounded-lg border shadow-sm">
            <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 flex-1 truncate rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {t.nome_site.toLowerCase().replace(/\s+/g, '')}.app/{previewModo !== 'painel' ? 'login' : 'admin/banco-questoes'}
              </span>
            </div>
            {previewModo === 'painel' ? <Preview t={t} /> : previewModo === 'login' ? <PreviewLogin t={t} dark={loginDark} /> : <PreviewSelecao t={t} dark={loginDark} />}
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

/** Seção com título dentro do painel de controles. */
function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

/** Linha compacta de upload de imagem (thumb + label + Enviar/Trocar/Remover). */
function LogoRow({ label, desc, value, onChange, onRemove, frame, bg, inicial, inicialBg }: {
  label: string; desc: string; value: string | null; onChange: (v: string) => void; onRemove?: () => void
  frame?: string; bg?: string; inicial?: string; inicialBg?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => onChange(String(r.result)); r.readAsDataURL(f)
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-background p-2">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      <button type="button" onClick={() => ref.current?.click()} title={value ? 'Trocar imagem' : 'Enviar imagem'}
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border ${frame ?? 'rounded-lg'}`}
        style={{ background: value ? (bg ?? 'transparent') : (inicial ? inicialBg : 'var(--muted)'), color: inicial && inicialBg ? contraste(inicialBg) : undefined }}>
        {value ? <img src={value} alt={label} className="h-full w-full object-contain" /> : inicial ? <span className="text-base font-bold">{inicial}</span> : <ImageIcon className="h-4 w-4 opacity-50" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground">{desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => ref.current?.click()} title={value ? 'Trocar' : 'Enviar'}
          className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:border-primary hover:text-primary">
          <Upload className="h-3.5 w-3.5" />
        </button>
        {value && onRemove && (
          <button type="button" onClick={onRemove} title="Remover"
            className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:border-destructive hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/** Prévia do bloco de seleção de plataforma (tela inicial do login). */
function PreviewSelecao({ t, dark }: { t: Tema; dark: boolean }) {
  const c = t.cores
  const bg = dark ? '#0d0d11' : '#f6f7f9'
  const text = dark ? '#e8e8ee' : '#1a1d24'
  const muted = dark ? '#8a8a99' : '#6b7280'
  const cardBg = dark ? '#15151c' : '#ffffff'
  const border = dark ? '#2a2a35' : '#e5e7eb'
  const tileBg = dark ? '#1c1c25' : '#f7f7fa'
  const img = t.logo_selecao_url ?? t.logo_url
  return (
    <div className="flex h-[420px] items-center justify-center" style={{ background: bg, color: text }}>
      <div className="w-72 rounded-2xl border p-6 text-center shadow-sm" style={{ background: cardBg, borderColor: border }}>
        <p className="text-base font-bold">Entrar</p>
        <p className="mb-5 text-[11px]" style={{ color: muted }}>Escolha sua plataforma para acessar.</p>
        <button className="mx-auto flex aspect-[5/4] w-40 flex-col items-center justify-center gap-2.5 rounded-xl border p-3" style={{ borderColor: border, background: tileBg }}>
          <span className={`flex h-16 w-16 items-center justify-center overflow-hidden ${frameSelecao(t.logo_selecao_estilo)}`} style={{ background: dark ? '#26262f' : '#e7e7ee', borderColor: c.btn }}>
            {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <span className="text-lg font-bold" style={{ color: c.btn }}>{(t.nome_site[0] ?? 'P').toUpperCase()}</span>}
          </span>
          <span className="text-xs font-semibold">{t.nome_site}</span>
        </button>
      </div>
    </div>
  )
}

/** Prévia da tela de login (estilo Instagram) com logo, cor da marca e modo claro/escuro. */
function PreviewLogin({ t, dark }: { t: Tema; dark: boolean }) {
  const c = t.cores
  const bg = dark ? '#0d0d11' : '#ffffff'
  const panel = dark ? '#15151c' : '#f4f4f7'
  const text = dark ? '#e8e8ee' : '#1a1d24'
  const muted = dark ? '#8a8a99' : '#6b7280'
  const inputBg = dark ? '#1c1c25' : '#f1f1f4'
  const border = dark ? '#2a2a35' : '#e5e7eb'
  // No login usa a logo GRANDE; cai na pequena se não houver.
  const bigLogo = t.logo_grande_url ?? t.logo_url

  return (
    <div className="flex h-[420px] text-[12px]" style={{ background: bg, color: text, fontFamily: 'system-ui, sans-serif' }}>
      {/* esquerda — logo grande da plataforma */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden" style={{ background: panel, borderRight: `1px solid ${border}` }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 35% 35%, ${c.accent}26, transparent 60%)` }} />
        {bigLogo ? (
          <img src={bigLogo} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl text-3xl font-bold" style={{ background: c.btn, color: contraste(c.btn) }}>
            {(t.nome_site[0] ?? 'P').toUpperCase()}
          </span>
        )}
      </div>

      {/* direita — credenciais */}
      <div className="flex w-[48%] shrink-0 flex-col justify-center gap-3 px-6">
        <span className="flex items-center gap-1 text-[11px]" style={{ color: muted }}><ArrowLeft className="h-3 w-3" /> Trocar plataforma</span>
        <p className="text-sm font-bold">Acesso administrativo</p>
        <div className="flex h-9 items-center rounded-md px-2.5 text-[11px]" style={{ background: inputBg, border: `1px solid ${border}`, color: muted }}>Endereço de e-mail</div>
        <div className="flex h-9 items-center rounded-md px-2.5 text-[11px]" style={{ background: inputBg, border: `1px solid ${border}`, color: muted }}>Senha</div>
        <div className="flex h-9 items-center justify-center rounded-md text-[11px] font-semibold" style={{ background: c.btn, color: contraste(c.btn) }}>Entrar no painel</div>
        <span className="rounded-full border px-3 py-1 text-[10px] font-medium" style={{ alignSelf: 'flex-end', borderColor: border, color: muted }}>Área do aluno</span>
      </div>
    </div>
  )
}

/** Prévia do dashboard com as cores aplicadas. */
function Preview({ t }: { t: Tema }) {
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
          <span className={`flex h-6 w-6 items-center justify-center overflow-hidden text-[11px] font-bold ${frameLogo(t.logo_estilo)}`} style={{ background: t.logo_url ? t.logo_png_bg : c.btn, color: contraste(t.logo_url ? t.logo_png_bg : c.btn), borderColor: c.cborder }}>
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
