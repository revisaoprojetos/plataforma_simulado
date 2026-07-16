'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Save, RotateCcw, ImageIcon, Loader2, Bell, Moon, Sun, Menu, ArrowLeft, Upload, X, Copy, Check, ClipboardPaste, Palette, ChevronDown, PanelLeft, LayoutGrid, Sparkles, Trash2, Monitor, BookOpen, ClipboardList, Users, Activity, GraduationCap, BarChart3, Database, PenLine, LayoutDashboard, ClipboardCheck, MessagesSquare, SlidersHorizontal, FileText } from 'lucide-react'

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
  sidebar: string; sidetext: string; sidetextHover: string; sidetextActive: string; icon: string; iconHover: string; iconAtivo: string; active: string; topbar: string; sborder: string
  bg: string; text: string; titulo: string; card: string; cborder: string; inputBg: string; btn: string; accent: string
  tabBg: string; tabAtivo: string; tabTexto: string  // fundo das tabs, tab selecionada, texto (hover/ativo)
}

/** Gera as CSS variables (em hex/color-mix) de uma paleta, para aplicar ao vivo no app.
 *  Espelha o que o servidor injeta em construirPaletaCompleta (tenant-theme.ts). */
function cssVarsFromCores(c: Cores): string {
  const fg = (hex: string) => contraste(hex)
  return [
    `--primary:${c.btn}`, `--primary-foreground:${fg(c.btn)}`, `--ring:${c.btn}`, `--brand-primary:${c.btn}`, `--brand-accent:${c.accent}`,
    `--sidebar-primary:${c.active}`, `--sidebar-primary-foreground:${fg(c.active)}`, `--sidebar-accent:${c.active}`, `--sidebar-accent-foreground:${fg(c.active)}`,
    `--sidebar-icon-hover:${c.iconHover}`, `--sidebar-icon-active:${c.iconAtivo}`, `--sidebar-text-hover:${c.sidetextHover}`, `--sidebar-text-active:${c.sidetextActive}`,
    `--sidebar:${c.sidebar}`, `--sidebar-foreground:${c.sidetext}`, `--sidebar-icon:${c.icon}`, `--sidebar-border:${c.sborder}`, `--sidebar-ring:${c.active}`,
    `--topbar:${c.topbar}`, `--topbar-foreground:${fg(c.topbar)}`,
    `--background:${c.bg}`, `--foreground:${c.text}`, `--content-title:${c.titulo}`,
    `--card:${c.card}`, `--popover:${c.card}`, `--secondary:${c.card}`, `--muted:${c.card}`,
    `--card-foreground:${c.text}`, `--popover-foreground:${c.text}`, `--secondary-foreground:${c.text}`,
    `--muted-foreground:color-mix(in srgb, ${c.text} 55%, ${c.bg})`, `--accent:color-mix(in srgb, ${c.text} 12%, ${c.bg})`, `--accent-foreground:${c.text}`,
    `--border:${c.cborder}`, `--input:${c.cborder}`, `--input-bg:${c.inputBg}`,
    `--tab-bg:${c.tabBg}`, `--tab-active:${c.tabAtivo}`, `--tab-active-foreground:${c.tabTexto}`,
  ].join(';')
}
type LogoEstilo = 'quadrado' | 'arredondado' | 'borda'
type SelecaoEstilo = 'quadrada' | 'redonda' | 'borda'
type LoginLayout = 'painel' | 'centralizado'
const LOGIN_LAYOUTS: { id: LoginLayout; nome: string; desc: string }[] = [
  { id: 'painel', nome: 'Painel', desc: 'Imagem grande ao lado do formulário' },
  { id: 'centralizado', nome: 'Simples', desc: 'Card único no centro da tela' },
]
type LogoFiltro = 'none' | 'branco' | 'preto'
type PresetCor = { id: string; nome: string; cores: Cores; coresDark: Cores }

/** Deriva uma paleta ESCURA a partir de uma clara: escurece as superfícies e
 *  mantém a marca (botão/accent/ativo) e os estados de destaque. */
function derivarEscuro(c: Cores): Cores {
  return {
    ...c,
    sidebar: '#141420', sidetext: '#c8c8d0', icon: '#c8c8d0',
    topbar: '#141420', sborder: '#2a2a38',
    bg: '#0f0f16', text: '#e8e8ee', titulo: '#e8e8ee',
    card: '#1a1a26', cborder: '#2a2a38', inputBg: '#14121d',
    tabBg: '#24242e', tabAtivo: '#33333f', tabTexto: '#e8e8ee',
  }
}
interface Tema {
  nome_site: string; subtitulo_site: string; titulo_pagina: string
  logo_url: string | null; logo_grande_url: string | null; logo_selecao_url: string | null
  logo_png_bg: string; logo_estilo: LogoEstilo; logo_filtro: LogoFiltro; logo_selecao_estilo: SelecaoEstilo
  login_layout: LoginLayout   // layout da tela de login da plataforma
  cores: Cores        // paleta do modo CLARO
  coresDark: Cores    // paleta do modo ESCURO
}

/** Filtro CSS que força a logo a branco/preto (útil em sidebar escura/clara). */
function filtroLogoCss(f?: string): string | undefined {
  if (f === 'branco') return 'brightness(0) invert(1)'
  if (f === 'preto') return 'brightness(0)'
  return undefined
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
  subtitulo_site: '',
  titulo_pagina: 'Banco de Questões',
  logo_url: null,
  logo_grande_url: null,
  logo_selecao_url: null,
  logo_png_bg: '#ffffff',
  logo_estilo: 'arredondado',
  logo_filtro: 'none',
  logo_selecao_estilo: 'redonda',
  login_layout: 'painel',
  cores: { sidebar: '#0f0f13', sidetext: '#c8c8d0', sidetextHover: '#ffffff', sidetextActive: '#ffffff', icon: '#c8c8d0', iconHover: '#ffffff', iconAtivo: '#ffffff', active: '#7f77dd', topbar: '#111118', sborder: '#35353f', bg: '#18181f', text: '#e8e8ee', titulo: '#e8e8ee', card: '#26262f', cborder: '#35353f', inputBg: '#1f1f28', btn: '#7f77dd', accent: '#7f77dd', tabBg: '#26262f', tabAtivo: '#3a3a48', tabTexto: '#ffffff' },
  // Paleta escura padrão (roxo escuro) — base do modo escuro.
  coresDark: { sidebar: '#161421', sidetext: '#c8c8d0', sidetextHover: '#ffffff', sidetextActive: '#ffffff', icon: '#c8c8d0', iconHover: '#ffffff', iconAtivo: '#ffffff', active: '#7f77dd', topbar: '#161421', sborder: '#2b2838', bg: '#0f0e16', text: '#e8e8ee', titulo: '#e8e8ee', card: '#1b1926', cborder: '#2b2838', inputBg: '#14121d', btn: '#7f77dd', accent: '#7f77dd', tabBg: '#1b1926', tabAtivo: '#2b2838', tabTexto: '#ffffff' },
}

type BuiltinPreset = { id: string; nome: string; cores: Cores; coresDark: Cores }

/** Monta um esquema (paleta CLARA + ESCURA) a partir da cor de marca. */
function esquema(nome: string, o: { btn: string; active?: string; accent?: string; ativoFg?: string }): BuiltinPreset {
  const active = o.active ?? o.btn
  const accent = o.accent ?? o.btn
  const aFg = o.ativoFg ?? '#ffffff' // cor do texto/ícone sobre o item ativo
  const claro: Cores = { sidebar: '#ffffff', sidetext: '#444b58', sidetextHover: aFg, sidetextActive: aFg, icon: active, iconHover: aFg, iconAtivo: aFg, active, topbar: '#ffffff', sborder: '#e5e7eb', bg: '#f6f7f9', text: '#1a1d24', titulo: '#1a1d24', card: '#ffffff', cborder: '#e5e7eb', inputBg: '#f1f3f6', btn: o.btn, accent, tabBg: '#eef1f5', tabAtivo: '#ffffff', tabTexto: '#1a1d24' }
  const escuro: Cores = { sidebar: '#141420', sidetext: '#c8c8d0', sidetextHover: aFg, sidetextActive: aFg, icon: '#c8c8d0', iconHover: aFg, iconAtivo: aFg, active, topbar: '#141420', sborder: '#2a2a38', bg: '#0f0f16', text: '#e8e8ee', titulo: '#e8e8ee', card: '#1a1a26', cborder: '#2a2a38', inputBg: '#12121b', btn: o.btn, accent, tabBg: '#24242e', tabAtivo: '#33333f', tabTexto: '#e8e8ee' }
  return { id: nome, nome, cores: claro, coresDark: escuro }
}

// Roxo & Âmbar — esquema com identidade própria (sidebar roxo escuro + âmbar), nos 2 modos.
const ROXO_AMBAR: BuiltinPreset = {
  id: 'Roxo & Âmbar',
  nome: 'Roxo & Âmbar',
  cores: { sidebar: '#3b3260', sidetext: '#e7e3f5', sidetextHover: '#241f33', sidetextActive: '#241f33', icon: '#f4c430', iconHover: '#241f33', iconAtivo: '#241f33', active: '#f4c430', topbar: '#453a63', sborder: '#4c4276', bg: '#f7f3ec', text: '#241f33', titulo: '#5a4b9a', card: '#ffffff', cborder: '#e8e2d5', inputBg: '#f3eee3', btn: '#5a4b9a', accent: '#f4c430', tabBg: '#efeae0', tabAtivo: '#ffffff', tabTexto: '#241f33' },
  coresDark: { sidebar: '#241f33', sidetext: '#e7e3f5', sidetextHover: '#241f33', sidetextActive: '#241f33', icon: '#f4c430', iconHover: '#241f33', iconAtivo: '#241f33', active: '#f4c430', topbar: '#241f33', sborder: '#3a3450', bg: '#15121e', text: '#e8e6f0', titulo: '#b7a6ff', card: '#1e1a2b', cborder: '#332d47', inputBg: '#17131f', btn: '#8b7fd6', accent: '#f4c430', tabBg: '#2a2540', tabAtivo: '#372f52', tabTexto: '#e8e6f0' },
}

const PRESETS: BuiltinPreset[] = [
  esquema('Violeta', { btn: '#7f77dd' }),
  esquema('Azul', { btn: '#4f7fff' }),
  esquema('Verde', { btn: '#36c08a' }),
  esquema('Coral', { btn: '#ff6b5e' }),
  esquema('Ardósia', { btn: '#64748b' }),
  esquema('Rosa', { btn: '#f43f7f' }),
  ROXO_AMBAR,
]

const SIDEBAR_CAMPOS: [keyof Cores, string][] = [['sidebar', 'Fundo da sidebar'], ['sidetext', 'Texto (normal)'], ['sidetextActive', 'Texto (hover/ativo)'], ['icon', 'Ícones (normal)'], ['iconAtivo', 'Ícones (hover/ativo)'], ['active', 'Item ativo (tabs)'], ['topbar', 'Fundo da topbar'], ['sborder', 'Cor da borda']]
const CONTEUDO_CAMPOS: [keyof Cores, string][] = [['bg', 'Fundo'], ['text', 'Texto'], ['titulo', 'Cor dos títulos'], ['card', 'Cor do card'], ['cborder', 'Borda do card'], ['inputBg', 'Caixas de texto/busca'], ['btn', 'Botão'], ['accent', 'Destaque'], ['tabBg', 'Fundo das tabs'], ['tabAtivo', 'Fundo da tab ativa'], ['tabTexto', 'Texto da tab ativa']]

function Swatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="relative inline-flex h-7 w-9 shrink-0 overflow-hidden rounded-md border" style={{ borderColor: 'var(--cfg-border)' }}>
      <span className="absolute inset-0" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
  )
}

/** Normaliza um hex (com/sem #, 3 ou 6 dígitos) → '#rrggbb' minúsculo, ou null. */
function normalizarHex(s: string): string | null {
  const v = s.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(v) || /^[0-9a-fA-F]{6}$/.test(v)) return '#' + v.toLowerCase()
  return null
}

/** Controle de cor: hex editável (digitar/colar) + copiar + colar + swatch. */
function ColorControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [copiado, setCopiado] = useState(false)
  const [texto, setTexto] = useState(value)
  useEffect(() => setTexto(value), [value])

  const aplicarTexto = () => {
    const v = normalizarHex(texto)
    if (v) onChange(v)
    else setTexto(value) // valor inválido → reverte para o atual
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiado(true)
      toast.success(`Cor ${value.toUpperCase()} copiada`)
      setTimeout(() => setCopiado(false), 1200)
    } catch { toast.error('Não foi possível copiar') }
  }
  const colar = async () => {
    try {
      const t = await navigator.clipboard.readText()
      const v = normalizarHex(t)
      if (v) { onChange(v); toast.success(`Cor ${v.toUpperCase()} colada`) }
      else toast.error('A área de transferência não tem uma cor hex válida')
    } catch { toast.error('Não foi possível colar (permita o acesso à área de transferência)') }
  }
  return (
    <div className="flex items-center gap-1">
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); const v = normalizarHex(e.target.value); if (v) onChange(v) }}
        onBlur={aplicarTexto}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarTexto() } }}
        spellCheck={false}
        className="w-16 rounded-md border bg-[var(--input-bg,transparent)] px-1.5 py-1 text-center font-mono text-[11px] uppercase outline-none focus:ring-1 focus:ring-ring"
      />
      <button type="button" onClick={copiar} title="Copiar cor"
        className="flex h-6 w-6 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-primary hover:text-primary">
        {copiado ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={colar} title="Colar cor"
        className="flex h-6 w-6 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-primary hover:text-primary">
        <ClipboardPaste className="h-3.5 w-3.5" />
      </button>
      <Swatch value={value} onChange={onChange} />
    </div>
  )
}

/** Seção recolhível animada (accordion) para organizar os controles. */
function Secao({ titulo, desc, icon: Icon, defaultOpen = false, children }: { titulo: string; desc?: string; icon: React.ComponentType<{ className?: string }>; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{titulo}</span>
          {desc && <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t p-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** Controle segmentado (pills) reutilizável. */
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; icon?: React.ComponentType<{ className?: string }> }[] }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all duration-200 ${value === o.v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {o.icon && <o.icon className="h-3.5 w-3.5" />} {o.label}
        </button>
      ))}
    </div>
  )
}

export function ConfiguracoesForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const inicial: Tema = {
    nome_site: tema?.nome_site ?? DEFAULT.nome_site,
    subtitulo_site: tema?.subtitulo_site ?? DEFAULT.subtitulo_site,
    titulo_pagina: tema?.titulo_pagina ?? DEFAULT.titulo_pagina,
    logo_url: tema?.logo_url ?? null,
    logo_grande_url: tema?.logo_grande_url ?? null,
    logo_selecao_url: tema?.logo_selecao_url ?? null,
    logo_png_bg: tema?.logo_png_bg ?? DEFAULT.logo_png_bg,
    logo_estilo: (tema?.logo_estilo as LogoEstilo) ?? DEFAULT.logo_estilo,
    logo_filtro: (tema?.logo_filtro as LogoFiltro) ?? DEFAULT.logo_filtro,
    logo_selecao_estilo: (tema?.logo_selecao_estilo as SelecaoEstilo) ?? DEFAULT.logo_selecao_estilo,
    login_layout: (tema?.login_layout === 'centralizado' ? 'centralizado' : 'painel'),
    cores: { ...DEFAULT.cores, ...(tema?.cores ?? {}) },
    coresDark: { ...DEFAULT.coresDark, ...(tema?.cores_dark ?? {}) },
  }
  const [t, setT] = useState<Tema>(inicial)
  const [modoEdicao, setModoEdicao] = useState<'light' | 'dark'>('light')
  // Presets salvos: retrocompatível — se um preset antigo não tem paleta escura, deriva na hora.
  const [presetsCustom, setPresetsCustom] = useState<PresetCor[]>(() =>
    (Array.isArray(tema?.presets_cor) ? tema.presets_cor : []).map((p: any) => ({
      id: p.id, nome: p.nome, cores: p.cores, coresDark: p.coresDark ?? derivarEscuro(p.cores),
    })),
  )
  const [nomePreset, setNomePreset] = useState('')
  const [presetSelId, setPresetSelId] = useState<string | null>(null) // preset em edição (embutido ou salvo)
  const [previewModo, setPreviewModo] = useState<'painel' | 'login' | 'selecao'>('painel')
  const [pending, start] = useTransition()
  const editou = useRef(false)
  const { setTheme, resolvedTheme } = useTheme()

  // Sem tema salvo: a prévia espelha as cores reais do sistema (claro/escuro).
  // Reage à troca de modo, a menos que o usuário já tenha editado.
  useEffect(() => {
    if (tema?.cores) return
    const sincronizar = () => {
      if (editou.current) return
      const fb = DEFAULT.cores
      const g = (v: string, d: string) => corDoSistema(v) ?? d
      setT((p) => ({ ...p, cores: {
        sidebar: g('--sidebar', fb.sidebar), sidetext: g('--sidebar-foreground', fb.sidetext),
        sidetextHover: corDoSistema('--sidebar-text-hover', '--sidebar-accent') ?? fb.sidetextHover,
        sidetextActive: corDoSistema('--sidebar-text-active', '--sidebar-accent') ?? fb.sidetextActive,
        icon: corDoSistema('--sidebar-icon', '--sidebar') ?? g('--sidebar-foreground', fb.icon),
        iconHover: corDoSistema('--sidebar-icon-hover', '--sidebar-accent') ?? fb.iconHover,
        iconAtivo: corDoSistema('--sidebar-icon-active', '--sidebar-accent') ?? fb.iconAtivo,
        active: corDoSistema('--sidebar-accent', '--sidebar') ?? fb.active,
        topbar: g('--sidebar', fb.topbar), sborder: corDoSistema('--sidebar-border', '--sidebar') ?? fb.sborder,
        bg: g('--background', fb.bg), text: g('--foreground', fb.text), titulo: corDoSistema('--content-title') ?? g('--foreground', fb.titulo),
        card: g('--card', fb.card), cborder: corDoSistema('--border', '--card') ?? fb.cborder, inputBg: corDoSistema('--input-bg', '--card') ?? g('--card', fb.inputBg), btn: g('--primary', fb.btn), accent: g('--primary', fb.accent),
        tabBg: corDoSistema('--tab-bg', '--muted') ?? g('--muted', fb.tabBg), tabAtivo: corDoSistema('--tab-active', '--background') ?? g('--background', fb.tabAtivo), tabTexto: corDoSistema('--tab-active-foreground') ?? g('--foreground', fb.tabTexto),
      } }))
    }
    sincronizar()
    const obs = new MutationObserver(sincronizar)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Paleta ativa = a que está sendo editada/pré-visualizada (claro ou escuro).
  const chaveCores = modoEdicao === 'dark' ? 'coresDark' : 'cores'
  const c = t[chaveCores]
  const setCor = (k: keyof Cores, v: string) => { editou.current = true; setT((p) => ({ ...p, [chaveCores]: { ...p[chaveCores], [k]: v } })) }
  // Aplica um preset inteiro (só na edição/preview): paleta clara → cores, escura → coresDark.
  const aplicarPreset = (preset: { id?: string; cores: Cores; coresDark?: Cores }) => {
    editou.current = true
    if (preset.id) setPresetSelId(preset.id)
    setT((p) => ({ ...p, cores: { ...DEFAULT.cores, ...preset.cores }, coresDark: { ...DEFAULT.coresDark, ...(preset.coresDark ?? derivarEscuro(preset.cores)) } }))
  }
  const presetSel = presetsCustom.find((p) => p.id === presetSelId) ?? PRESETS.find((p) => p.id === presetSelId) ?? null

  // O modo de edição/preview SEGUE o tema real do app (toggle claro/escuro na topbar
  // e o botão Claro/Escuro do preview trocam o mesmo tema) — mantém tudo coerente.
  useEffect(() => { if (resolvedTheme === 'light' || resolvedTheme === 'dark') setModoEdicao(resolvedTheme) }, [resolvedTheme])

  // Aplica a paleta ativa AO VIVO no app inteiro (sidebar, topbar, conteúdo) — não só no
  // quadrinho de preview. Injeta as vars no modo atual; some ao sair da página (tema salvo volta).
  useEffect(() => {
    const id = 'cfg-theme-live'
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }
    const sel = modoEdicao === 'dark' ? '.dark' : ':root:not(.dark)'
    el.textContent = `${sel}{${cssVarsFromCores(c)}}`
  }, [c, modoEdicao])
  useEffect(() => () => { document.getElementById('cfg-theme-live')?.remove() }, [])

  function salvarPreset() {
    if (!nomePreset.trim()) { toast.error('Dê um nome ao preset.'); return }
    const novo: PresetCor = { id: crypto.randomUUID(), nome: nomePreset.trim(), cores: { ...t.cores }, coresDark: { ...t.coresDark } }
    const lista = [...presetsCustom, novo]
    setPresetsCustom(lista); setNomePreset(''); setPresetSelId(novo.id)
    start(async () => { await salvarTema({ presets_cor: lista }); toast.success(`Preset "${novo.nome}" salvo`) })
  }
  async function excluirPreset(id: string) {
    const alvo = presetsCustom.find((p) => p.id === id)
    if (!(await confirmar({ mensagem: `Excluir o preset "${alvo?.nome ?? ''}"? Esta ação não pode ser desfeita.`, destrutivo: true }))) return
    const lista = presetsCustom.filter((p) => p.id !== id)
    setPresetsCustom(lista)
    start(async () => { await salvarTema({ presets_cor: lista }); toast.success('Preset removido') })
  }

  // SALVAR = grava as customizações atuais NO preset selecionado (não mexe no sistema).
  function salvarPresetSelecionado() {
    const custom = presetsCustom.find((p) => p.id === presetSelId)
    if (custom) {
      const lista = presetsCustom.map((p) => p.id === custom.id ? { ...p, cores: { ...t.cores }, coresDark: { ...t.coresDark } } : p)
      setPresetsCustom(lista)
      start(async () => { await salvarTema({ presets_cor: lista }); toast.success(`Preset "${custom.nome}" atualizado`) })
      return
    }
    // Preset embutido (imutável) ou nenhum → cria uma cópia personalizada e a seleciona.
    const base = PRESETS.find((p) => p.id === presetSelId)
    const nome = base ? `${base.nome} (personalizado)` : (nomePreset.trim() || 'Meu tema')
    const novo: PresetCor = { id: crypto.randomUUID(), nome, cores: { ...t.cores }, coresDark: { ...t.coresDark } }
    const lista = [...presetsCustom, novo]
    setPresetsCustom(lista); setPresetSelId(novo.id); setNomePreset('')
    start(async () => { await salvarTema({ presets_cor: lista }); toast.success(base ? `Cópia "${nome}" criada` : `Preset "${nome}" salvo`) })
  }

  // APLICAR = aplica o tema atual NO SISTEMA (persiste como identidade ativa do tenant).
  function aplicarNoSistema() {
    start(async () => {
      const { coresDark, ...restoT } = t
      const payload = {
        ...restoT,
        cores_dark: coresDark,
        presets_cor: presetsCustom,
        cor_primaria: t.cores.btn, cor_secundaria: t.cores.card, cor_accent: t.cores.accent, logo_url: t.logo_url ?? undefined,
      }
      try { await salvarTema(payload); toast.success('Tema aplicado no sistema!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao aplicar') }
    })
  }

  // RESETAR = volta SÓ o preset selecionado ao original (não mexe nos outros nem no logo/nome).
  function resetarPreset() {
    if (presetSel) { aplicarPreset(presetSel); toast.info(`"${presetSel.nome}" restaurado ao original`) }
    else { editou.current = true; setT((p) => ({ ...p, cores: { ...DEFAULT.cores }, coresDark: { ...DEFAULT.coresDark } })); toast.info('Cores redefinidas ao padrão') }
  }

  return (
    <div className="animate-page space-y-4"
      style={{ '--cfg-bg': 'var(--card)', '--cfg-border': 'var(--border)', '--cfg-muted': 'var(--muted-foreground)' } as React.CSSProperties}
    >
      {/* ── TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold leading-none">Aparência do sistema</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {presetSel ? <>Editando <span className="font-medium text-foreground">{presetSel.nome}</span></> : 'Cores, logo e tema — claro e escuro'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={modoEdicao} onChange={(m) => setTheme(m)} options={[{ v: 'light', label: 'Claro', icon: Sun }, { v: 'dark', label: 'Escuro', icon: Moon }]} />
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <button type="button" onClick={resetarPreset} title={presetSel ? `Resetar "${presetSel.nome}"` : 'Resetar cores'}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <RotateCcw className="h-4 w-4" /><span className="hidden md:inline">Resetar</span>
          </button>
          <button type="button" onClick={salvarPresetSelecionado} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-primary/15 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="hidden md:inline">{presetSel ? 'Salvar no preset' : 'Salvar preset'}</span>
          </button>
          <button type="button" onClick={aplicarNoSistema} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar
          </button>
        </div>
      </div>

      {/* ── GRID ── */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* ESQUERDA: controles */}
        <div className="stagger space-y-3">
          {/* Presets */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Modelos de cor</span>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">claro + escuro</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[...PRESETS, ...presetsCustom].map((p) => {
                const isCustom = presetsCustom.some((x) => x.id === p.id)
                const sel = presetSelId === p.id
                return (
                  <div key={p.id} className="group relative">
                    <button type="button" title={`${p.nome} (claro + escuro)`} onClick={() => aplicarPreset(p)}
                      className={`flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow ${sel ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                      <span className="flex h-8 w-full overflow-hidden rounded-md ring-1 ring-black/5">
                        <span className="flex flex-1 items-center justify-center" style={{ background: p.cores.bg }}><span className="h-3 w-3 rounded-full" style={{ background: p.cores.btn }} /></span>
                        <span className="flex flex-1 items-center justify-center" style={{ background: p.coresDark.bg }}><span className="h-3 w-3 rounded-full" style={{ background: p.coresDark.btn }} /></span>
                      </span>
                      <span className="max-w-full truncate text-[10px] font-medium text-muted-foreground group-hover:text-foreground">{p.nome}</span>
                    </button>
                    {isCustom && (
                      <button type="button" title={`Excluir "${p.nome}"`} onClick={() => excluirPreset(p.id)}
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border bg-card text-destructive shadow-sm transition-transform hover:scale-110 group-hover:flex">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex gap-1.5">
              <input value={nomePreset} onChange={(e) => setNomePreset(e.target.value)} placeholder="Novo preset das cores atuais"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvarPreset() } }}
                className="min-w-0 flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <button type="button" onClick={salvarPreset} disabled={pending || !nomePreset.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Criar
              </button>
            </div>
          </div>

          {/* Marca & Logo */}
          <Secao titulo="Marca & Logo" desc="Logos, nome do site e ícone" icon={ImageIcon} defaultOpen>
            <div className="space-y-2.5">
              <LogoRow label="Logo (pequena)" desc="Sidebar, topo e ícones"
                value={t.logo_url} onChange={(v) => setT((p) => ({ ...p, logo_url: v }))} onRemove={() => setT((p) => ({ ...p, logo_url: null }))}
                frame={frameLogo(t.logo_estilo)} bg={t.logo_png_bg} inicial={(t.nome_site[0] ?? 'P').toUpperCase()} inicialBg={c.btn} />
              <LogoRow label="Logo grande (login)" desc="Painel da esquerda do login"
                value={t.logo_grande_url} onChange={(v) => setT((p) => ({ ...p, logo_grande_url: v }))} onRemove={() => setT((p) => ({ ...p, logo_grande_url: null }))} />
              <LogoRow label="Imagem da seleção" desc="Bloco de seleção (início)"
                value={t.logo_selecao_url} onChange={(v) => setT((p) => ({ ...p, logo_selecao_url: v }))} onRemove={() => setT((p) => ({ ...p, logo_selecao_url: null }))} />
            </div>
            {t.logo_url && (
              <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
                <Field label="Fundo do ícone">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setT((p) => ({ ...p, logo_png_bg: p.logo_png_bg === 'transparent' ? '#ffffff' : 'transparent' }))}
                      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${t.logo_png_bg === 'transparent' ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>Transparente</button>
                    {t.logo_png_bg !== 'transparent' && <Swatch value={t.logo_png_bg} onChange={(v) => setT((p) => ({ ...p, logo_png_bg: v }))} />}
                  </div>
                </Field>
                <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Borda</span>
                  <div className="flex gap-1.5">{LOGO_ESTILOS.map((e) => (<button key={e.id} type="button" onClick={() => setT((p) => ({ ...p, logo_estilo: e.id }))} className={`flex-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${t.logo_estilo === e.id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>{e.nome}</button>))}</div>
                </div>
                <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Gama (recolorir a logo)</span>
                  <div className="flex gap-1.5">{(([['none', 'Normal'], ['branco', 'Branca'], ['preto', 'Preta']]) as [LogoFiltro, string][]).map(([id, nome]) => (<button key={id} type="button" onClick={() => setT((p) => ({ ...p, logo_filtro: id }))} className={`flex-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${t.logo_filtro === id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>{nome}</button>))}</div>
                  <p className="text-[10px] text-muted-foreground">Força a logo a branco/preto — útil quando ela some na sidebar escura/clara.</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Formato da imagem de seleção</span>
              <div className="flex gap-1.5">{SELECAO_ESTILOS.map((e) => (<button key={e.id} type="button" onClick={() => setT((p) => ({ ...p, logo_selecao_estilo: e.id }))} className={`flex-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${t.logo_selecao_estilo === e.id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>{e.nome}</button>))}</div>
            </div>
            <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Layout da tela de login</span>
              <div className="grid grid-cols-2 gap-1.5">{LOGIN_LAYOUTS.map((e) => (
                <button key={e.id} type="button" onClick={() => setT((p) => ({ ...p, login_layout: e.id }))}
                  className={`rounded-md border px-2 py-1.5 text-left transition-colors ${t.login_layout === e.id ? 'border-primary bg-primary/10' : 'hover:border-primary/50'}`}>
                  <span className="block text-[11px] font-semibold">{e.nome}</span>
                  <span className="block text-[10px] leading-tight text-muted-foreground">{e.desc}</span>
                </button>))}
              </div>
              <p className="text-[10px] text-muted-foreground">O "Simples" deixa tudo centralizado no meio da tela — mais fácil para o aluno.</p>
            </div>
            <div className="space-y-2.5 border-t pt-3">
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Nome do site</label>
                <input value={t.nome_site} onChange={(e) => setT((p) => ({ ...p, nome_site: e.target.value }))} className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" /></div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Subtítulo (abaixo do nome, na sidebar)</label>
                <input value={t.subtitulo_site} onChange={(e) => setT((p) => ({ ...p, subtitulo_site: e.target.value }))} placeholder="ex.: Ensino Jurídico" className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" /></div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Título da página</label>
                <input value={t.titulo_pagina} onChange={(e) => setT((p) => ({ ...p, titulo_pagina: e.target.value }))} className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" /></div>
            </div>
          </Secao>

          {/* Barra lateral & topo */}
          <Secao titulo="Barra lateral & topo" desc="Fundo, texto, ícones e item ativo" icon={PanelLeft}>
            <div className="space-y-2.5">
              {SIDEBAR_CAMPOS.map(([k, label]) => (<Field key={k} label={label}><ColorControl value={c[k]} onChange={(v) => setCor(k, v)} /></Field>))}
            </div>
            <div className="space-y-1.5 border-t pt-3"><span className="text-xs text-muted-foreground">Gama do ícone (logo)</span>
              <div className="flex gap-1.5">{(([['none', 'Normal'], ['branco', 'Branca'], ['preto', 'Preta']]) as [LogoFiltro, string][]).map(([id, nome]) => (<button key={id} type="button" onClick={() => setT((p) => ({ ...p, logo_filtro: id }))} className={`flex-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${t.logo_filtro === id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/50'}`}>{nome}</button>))}</div>
              <p className="text-[10px] text-muted-foreground">A topbar usa o “Fundo da topbar” acima; os ícones dela seguem a cor dos ícones da sidebar.</p>
            </div>
          </Secao>

          {/* Conteúdo & páginas */}
          <Secao titulo="Conteúdo & páginas" desc="Fundo, títulos, cards e botões" icon={LayoutGrid}>
            <div className="space-y-2.5">
              {CONTEUDO_CAMPOS.map(([k, label]) => (<Field key={k} label={label}><ColorControl value={c[k]} onChange={(v) => setCor(k, v)} /></Field>))}
            </div>
          </Secao>
        </div>

        {/* DIREITA: prévia (sticky) */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Seg value={previewModo} onChange={setPreviewModo} options={[{ v: 'painel', label: 'Painel', icon: Monitor }, { v: 'login', label: 'Login' }, { v: 'selecao', label: 'Seleção' }]} />
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                {modoEdicao === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />} prévia {modoEdicao === 'dark' ? 'escura' : 'clara'}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border shadow-sm">
              <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
                <span className="h-3 w-3 rounded-full bg-red-400" /><span className="h-3 w-3 rounded-full bg-yellow-400" /><span className="h-3 w-3 rounded-full bg-green-400" />
                <span className="ml-2 flex-1 truncate rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t.nome_site.toLowerCase().replace(/\s+/g, '')}.app/{previewModo !== 'painel' ? 'login' : 'admin/banco-questoes'}</span>
              </div>
              <div key={`${previewModo}-${modoEdicao}`} className="animate-pop">
                {previewModo === 'painel' ? <Preview t={t} cores={c} /> : previewModo === 'login' ? <PreviewLogin t={t} cores={c} dark={modoEdicao === 'dark'} /> : <PreviewSelecao t={t} cores={c} dark={modoEdicao === 'dark'} />}
              </div>
            </div>
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
function PreviewSelecao({ t, cores, dark }: { t: Tema; cores: Cores; dark: boolean }) {
  const c = cores
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
function PreviewLogin({ t, cores, dark }: { t: Tema; cores: Cores; dark: boolean }) {
  const c = cores
  const bg = dark ? '#0d0d11' : '#ffffff'
  const panel = dark ? '#15151c' : '#f4f4f7'
  const text = dark ? '#e8e8ee' : '#1a1d24'
  const muted = dark ? '#8a8a99' : '#6b7280'
  const inputBg = dark ? '#1c1c25' : '#f1f1f4'
  const border = dark ? '#2a2a35' : '#e5e7eb'
  // No login usa a logo GRANDE; cai na pequena se não houver.
  const bigLogo = t.logo_grande_url ?? t.logo_url
  const smallLogo = t.logo_url ?? t.logo_grande_url

  // Layout centralizado (simples): card único no meio da tela.
  if (t.login_layout === 'centralizado') {
    return (
      <div className="flex h-[420px] items-center justify-center px-4 text-[12px]" style={{ background: bg, color: text, fontFamily: 'system-ui, sans-serif' }}>
        <div className="w-[248px] rounded-2xl border p-6 shadow-xl" style={{ background: dark ? '#15151c' : '#ffffff', borderColor: border }}>
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-2xl font-bold" style={{ background: c.btn, color: contraste(c.btn) }}>
              {smallLogo ? <img src={smallLogo} alt="" className="h-full w-full object-contain" /> : (t.nome_site[0] ?? 'P').toUpperCase()}
            </span>
            <p className="text-[13px] font-semibold">{t.nome_site}</p>
          </div>
          <span className="mb-3 flex items-center gap-1 text-[11px]" style={{ color: muted }}><ArrowLeft className="h-3 w-3" /> Trocar plataforma</span>
          <p className="mb-3 text-sm font-bold">Acesso administrativo</p>
          <div className="mb-2 flex h-9 items-center rounded-md px-2.5 text-[11px]" style={{ background: inputBg, border: `1px solid ${border}`, color: muted }}>Endereço de e-mail</div>
          <div className="mb-2 flex h-9 items-center rounded-md px-2.5 text-[11px]" style={{ background: inputBg, border: `1px solid ${border}`, color: muted }}>Senha</div>
          <div className="flex h-9 items-center justify-center rounded-md text-[11px] font-semibold" style={{ background: c.btn, color: contraste(c.btn) }}>Entrar no painel</div>
        </div>
      </div>
    )
  }

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
function Preview({ t, cores }: { t: Tema; cores: Cores }) {
  const c = cores
  const menu = [
    { nome: 'Dashboard', icon: LayoutDashboard, ativo: true },
    { nome: 'Simulado', icon: BookOpen, sub: [
      { nome: 'Aplicação', icon: ClipboardList },
      { nome: 'Questões', icon: BookOpen },
      { nome: 'Banco de questões', icon: Database },
      { nome: 'Correção', icon: PenLine },
      { nome: 'Cadernos', icon: FileText },
    ] },
    { nome: 'Alunos', icon: GraduationCap }, { nome: 'Análise', icon: BarChart3 },
    { nome: 'Auditoria', icon: ClipboardCheck }, { nome: 'Feedback', icon: MessagesSquare },
    { nome: 'Configuração', icon: SlidersHorizontal },
  ]
  const stats = [
    { icon: BookOpen, val: '4', label: 'Questões' }, { icon: ClipboardList, val: '1', label: 'Simulados' },
    { icon: Users, val: '1', label: 'Estudantes' }, { icon: Activity, val: '0', label: 'Sessões hoje' },
  ]
  const fgBtn = contraste(c.btn)
  return (
    <div className="flex h-[540px] text-[13px]" style={{ background: c.bg, color: c.text, fontFamily: 'system-ui, sans-serif' }}>
      {/* sidebar */}
      <div className="flex w-[180px] shrink-0 flex-col" style={{ background: c.sidebar, borderRight: `1px solid ${c.sborder}` }}>
        <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: `1px solid ${c.sborder}` }}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden text-[11px] font-bold ${frameLogo(t.logo_estilo)}`} style={{ background: t.logo_url ? t.logo_png_bg : c.btn, color: contraste(t.logo_url ? t.logo_png_bg : c.btn), borderColor: c.cborder }}>
            {t.logo_url ? <img src={t.logo_url} alt="" className="h-full w-full object-contain" style={{ filter: filtroLogoCss(t.logo_filtro) }} /> : (t.nome_site[0] ?? 'P').toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-semibold" style={{ color: c.sidetext }}>{t.nome_site}</span>
            {t.subtitulo_site && <span className="truncate text-[9px] opacity-70" style={{ color: c.sidetext }}>{t.subtitulo_site}</span>}
          </span>
        </div>
        <div className="space-y-0.5 px-2 py-2">
          <p className="px-1.5 py-1 text-[9px] font-semibold uppercase opacity-50" style={{ color: c.sidetext }}>Menu</p>
          {menu.map((m) => (
            <div key={m.nome}>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5" style={m.ativo ? { background: c.active, color: c.sidetextActive } : { color: c.sidetext }}>
                <m.icon className="h-3 w-3 shrink-0" style={{ color: m.ativo ? c.iconAtivo : c.icon }} />
                {m.nome}
              </div>
              {m.sub && (
                <div className="ml-2.5 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: c.sborder }}>
                  {m.sub.map((s) => (
                    <div key={s.nome} className="flex items-center gap-1.5 rounded-md px-2 py-1" style={{ color: c.sidetext, opacity: 0.85 }}>
                      <s.icon className="h-3 w-3 shrink-0" style={{ color: c.icon }} />
                      {s.nome}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* área principal */}
      <div className="flex flex-1 flex-col">
        {/* topbar */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: c.topbar, borderBottom: `1px solid ${c.sborder}` }}>
          <Menu className="h-4 w-4" style={{ color: c.icon }} />
          <div className="flex items-center gap-3.5">
            <span className="relative">
              <Bell className="h-4 w-4" style={{ color: c.icon }} />
              <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[6px] font-bold text-white">5</span>
            </span>
            <Moon className="h-4 w-4" style={{ color: c.icon }} />
            <span className="h-6 w-6 rounded-full" style={{ background: c.accent }} />
          </div>
        </div>
        {/* conteúdo: Dashboard */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <h2 className="text-lg font-bold leading-tight" style={{ color: c.titulo }}>Dashboard</h2>
            <p className="text-[11px] opacity-60">Visão geral da plataforma</p>
          </div>

          {/* stat cards em gradiente */}
          <div className="grid grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="relative overflow-hidden rounded-xl p-3" style={{ background: c.card, border: `1px solid ${c.cborder}` }}>
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c.btn}1f, transparent 70%)` }} />
                <s.icon className="absolute -right-2 -top-2 h-12 w-12" style={{ color: c.btn, opacity: 0.08 }} />
                <div className="relative flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm" style={{ background: c.btn, color: fgBtn }}><s.icon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xl font-bold leading-none">{s.val}</p>
                    <p className="mt-0.5 truncate text-[8px] font-medium uppercase tracking-wide opacity-60">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* gráfico */}
          <div className="overflow-hidden rounded-xl" style={{ background: c.card, border: `1px solid ${c.cborder}` }}>
            <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${c.btn}1f, transparent 55%)`, borderColor: c.cborder }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: c.btn, color: fgBtn }}><Activity className="h-4 w-4" /></span>
              <div className="leading-tight">
                <p className="text-[12px] font-semibold">Sessões nos últimos 7 dias</p>
                <p className="text-[9px] opacity-60">Sessões de prova iniciadas por dia</p>
              </div>
            </div>
            <div className="p-3">
              <div className="flex gap-2">
                <div className="flex w-5 flex-col justify-between text-right text-[8px] opacity-50" style={{ height: 120 }}>
                  {[160, 120, 80, 40, 0].map((y) => <span key={y}>{y}</span>)}
                </div>
                <div className="relative flex-1">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-dashed" style={{ borderColor: c.cborder }} />)}
                  </div>
                  <div className="relative flex h-[120px] items-end gap-2">
                    {[22, 8, 84, 16, 98, 142, 150].map((b, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${(b / 160) * 100}%`, background: c.btn }} />)}
                  </div>
                </div>
              </div>
              <div className="mt-1 flex gap-2">
                <div className="w-5" />
                <div className="flex flex-1 gap-2 text-[8px] opacity-50">
                  {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => <span key={d} className="flex-1 text-center">{d}</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* últimos simulados */}
          <div className="overflow-hidden rounded-xl" style={{ background: c.card, border: `1px solid ${c.cborder}` }}>
            <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${c.btn}1f, transparent 55%)`, borderColor: c.cborder }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: c.btn, color: fgBtn }}><ClipboardList className="h-4 w-4" /></span>
              <div className="leading-tight">
                <p className="text-[12px] font-semibold">Últimos simulados</p>
                <p className="text-[9px] opacity-60">Os 5 mais recentes</p>
              </div>
            </div>
            {([['Concurso TJ Rascunho', '#94a3b8', 'Rascunho'], ['Simulado OAB 2026', '#f59e0b', 'Encerrado'], ['Simulado Teste THEME', '#22c55e', 'Publicado']] as [string, string, string][]).map(([n, cor, st], i) => (
              <div key={n} className="flex items-center justify-between px-3 py-2.5" style={i > 0 ? { borderTop: `1px solid ${c.cborder}` } : undefined}>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium">{n}</p>
                  <p className="text-[8px] opacity-50">Criado em 26/06/2026</p>
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[8px] font-medium" style={{ background: `${cor}22`, color: cor }}>{st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
