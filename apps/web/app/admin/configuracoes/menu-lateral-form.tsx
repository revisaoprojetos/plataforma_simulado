'use client'

import { useRef, useState, useEffect, useTransition, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Loader2, Save, ImagePlus, RotateCcw, PanelLeft, UserCog, GraduationCap, ChevronDown, Type, EyeOff,
  LayoutDashboard, BookOpen, ClipboardList, PenLine, LayoutTemplate, CalendarDays, BarChart3, Upload,
  Library, Users, UsersRound, Eye, Share2, Plug, Webhook, PieChart, Trophy, Star, ClipboardCheck, LogIn,
  FilePen, Zap, MessagesSquare, MessageSquare, Flag, SlidersHorizontal, KeyRound, ServerCog, Megaphone,
  ShieldCheck, Trash2, HelpCircle, Home, Lightbulb, NotebookPen, Gavel,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { iconeCargo } from '@/lib/gamificacao/cargo-icones'
import { CargoIconePicker } from '@/components/admin/cargo-icone-picker'
import { rotuloDe, IconeMenu, LabelImg, resolverSidebarRotulos, type SidebarRotulos, type IconeOverride, type RotuloOverride } from '@/lib/sidebar-rotulos'

type Ic = ComponentType<{ className?: string }>
type ItemCat = { href: string; label: string; Icon: Ic }

// Catálogo = espelho das sidebars (chaves: grupo=label original, item/filho=href) + ícone padrão real.
const ADMIN_DASH: ItemCat = { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard }
const ADMIN_CAT: { grupo: string; Icon: Ic; itens: ItemCat[] }[] = [
  { grupo: 'Simulado', Icon: BookOpen, itens: [{ href: '/admin/simulados', label: 'Aplicação de Simulado', Icon: ClipboardList }, { href: '/admin/correcao', label: 'Correção (discursivas)', Icon: PenLine }, { href: '/admin/questoes', label: 'Questões', Icon: BookOpen }, { href: '/admin/modelos-caderno', label: 'Modelos de Caderno', Icon: LayoutTemplate }] },
  { grupo: 'Cronograma', Icon: CalendarDays, itens: [{ href: '/admin/cronogramas', label: 'Catálogo', Icon: CalendarDays }, { href: '/admin/cronogramas/relatorios', label: 'Relatórios', Icon: BarChart3 }, { href: '/admin/cronogramas/importar', label: 'Importar', Icon: Upload }] },
  { grupo: 'Desafio de Lei Seca', Icon: Library, itens: [{ href: '/admin/leitura', label: 'Biblioteca', Icon: Library }, { href: '/admin/leitura/analise', label: 'Análise', Icon: BarChart3 }] },
  { grupo: 'Jurisprudência', Icon: Library, itens: [{ href: '/admin/jurisprudencia', label: 'Biblioteca', Icon: Library }] },
  { grupo: 'Alunos', Icon: GraduationCap, itens: [{ href: '/admin/estudantes', label: 'Estudantes', Icon: Users }, { href: '/admin/grupos', label: 'Grupos', Icon: UsersRound }, { href: '/admin/impersonation', label: 'Visualizações de aluno', Icon: Eye }] },
  { grupo: 'Conexões', Icon: Share2, itens: [{ href: '/admin/integracoes', label: 'Integrações', Icon: Plug }, { href: '/admin/conexoes/webhooks', label: 'Webhooks & n8n', Icon: Webhook }] },
  { grupo: 'Análise', Icon: BarChart3, itens: [{ href: '/admin/relatorios/graficos', label: 'Relatório Gráfico', Icon: PieChart }, { href: '/admin/relatorios/simulados', label: 'Relatório Simulado', Icon: ClipboardList }, { href: '/admin/relatorios/disciplinas', label: 'Relatório Disciplina', Icon: BookOpen }, { href: '/admin/relatorios/estudantes', label: 'Relatório Estudantes', Icon: GraduationCap }, { href: '/admin/relatorios/ranking', label: 'Ranking', Icon: Trophy }, { href: '/admin/relatorios/nps', label: 'NPS / Satisfação', Icon: Star }, { href: '/admin/relatorios/grupos', label: 'Grupos por aluno', Icon: Users }] },
  { grupo: 'Auditoria', Icon: ClipboardCheck, itens: [{ href: '/admin/auditoria?tipo=acessos', label: 'Acessos', Icon: LogIn }, { href: '/admin/auditoria?tipo=modificacoes', label: 'Modificações', Icon: FilePen }, { href: '/admin/auditoria?tipo=automacoes', label: 'Automações', Icon: Zap }, { href: '/admin/auditoria?tipo=visualizacoes', label: 'Visualizações', Icon: Eye }] },
  { grupo: 'Engajamento', Icon: Trophy, itens: [{ href: '/admin/gamificacao', label: 'Gamificação', Icon: Trophy }] },
  { grupo: 'Feedback', Icon: MessagesSquare, itens: [{ href: '/admin/comentarios', label: 'Comentários', Icon: MessageSquare }, { href: '/admin/feedbacks', label: 'Reports de Questões', Icon: Flag }] },
  { grupo: 'Configuração', Icon: SlidersHorizontal, itens: [{ href: '/admin/administradores', label: 'Administradores', Icon: UserCog }, { href: '/admin/transcricao', label: 'Chaves de API', Icon: KeyRound }, { href: '/admin/sistema', label: 'Sistema', Icon: ServerCog }, { href: '/admin/configuracoes/mensagens', label: 'Mensagens', Icon: MessageSquare }, { href: '/admin/configuracoes/banners', label: 'Banners & Pop-ups', Icon: Megaphone }, { href: '/admin/lgpd', label: 'LGPD', Icon: ShieldCheck }, { href: '/admin/lixeira', label: 'Lixeira', Icon: Trash2 }, { href: '/admin/ajuda', label: 'Ajuda', Icon: HelpCircle }] },
]
const ALUNO_CAT: (ItemCat & { filhos?: { href: string; label: string }[] })[] = [
  { href: '/aluno', label: 'Início', Icon: Home },
  { href: '/aluno/simulados', label: 'Simulados Realizados', Icon: ClipboardList },
  { href: '/aluno/leitura', label: 'Desafio de Lei Seca', Icon: Library },
  { href: '/aluno/jurisprudencia', label: 'Desafio de Jurisprudência', Icon: Gavel },
  { href: '/aluno/cronograma', label: 'Cronograma', Icon: CalendarDays, filhos: [{ href: '/aluno/cronograma', label: 'Gerar cronograma' }, { href: '/aluno/cronograma/meus', label: 'Meus cronogramas' }] },
  { href: '/aluno/recomendado', label: 'Recomendado', Icon: Lightbulb },
  { href: '/aluno/questoes', label: 'Banco de Questões', Icon: BookOpen },
  { href: '/aluno/ligas', label: 'Ligas', Icon: Trophy },
  { href: '/aluno/favoritos', label: 'Favoritos', Icon: Star },
  { href: '/aluno/cadernos', label: 'Cadernos', Icon: NotebookPen },
]

/** Moldura e filtro da logo — IDÊNTICOS aos aplicados na sidebar real (estilo/filtro do tema). */
function frameLogo(e?: string): string { return e === 'quadrado' ? 'rounded-none' : e === 'borda' ? 'rounded-lg border' : 'rounded-lg' }
function filtroLogo(f?: string): string | undefined { return f === 'branco' ? 'brightness(0) invert(1)' : f === 'preto' ? 'brightness(0)' : undefined }

function Slider({ label, val, min, max, onChange, suffix }: { label: string; val: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>{label}</span><span className="tabular-nums">{val}{suffix}</span></span>
      <input type="range" min={min} max={max} value={val} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
    </label>
  )
}

/** Campo de cor: atalhos (Original/Branco/Preto…) + seletor + campo de texto p/ COLAR/digitar hex. */
function CorField({ label, opcoes, value, onChange }: { label: string; opcoes: [string, string][]; value?: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {opcoes.map(([hex, lbl]) => (
          <button key={lbl} type="button" onClick={() => onChange(hex || null)} className={cn('rounded-md border px-2 py-1 text-[11px] transition', (value ?? '') === hex ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>{lbl}</button>
        ))}
        <input type="color" value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888'} onChange={(e) => onChange(e.target.value)} title="Escolher cor" className="h-6 w-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5" />
        <input type="text" value={value ?? ''} onChange={(e) => { const t = e.target.value.trim(); onChange(t ? (t.startsWith('#') ? t : '#' + t) : null) }} placeholder="#hex" spellCheck={false} className="h-6 w-[4.75rem] rounded-md border bg-transparent px-1.5 text-[11px] uppercase outline-none focus:border-primary" />
      </div>
    </div>
  )
}

/** Ajuste da IMAGEM do ícone (tamanho/posição/encaixe/cor) — estilo o editor da trilha/capa. Popover. */
function AjusteImagem({ value, onChange }: { value: IconeOverride; onChange: (v: IconeOverride) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const set = (patch: Partial<IconeOverride>) => onChange({ ...value, ...patch })
  useEffect(() => {
    if (!open) return
    const p = () => { const b = btnRef.current?.getBoundingClientRect(); if (!b) return; const top = b.bottom + 6 + 300 > window.innerHeight ? Math.max(8, b.top - 6 - 300) : b.bottom + 6; setPos({ left: Math.max(8, Math.min(b.left - 170, window.innerWidth - 256)), top }) }
    p(); const onK = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('resize', p); window.addEventListener('scroll', p, true); window.addEventListener('keydown', onK)
    return () => { window.removeEventListener('resize', p); window.removeEventListener('scroll', p, true); window.removeEventListener('keydown', onK) }
  }, [open])
  const cores: [string, string][] = [['', 'Original'], ['#ffffff', 'Branco'], ['#111827', 'Preto']]
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)} title="Ajustar imagem (tamanho/posição/cor)"
        className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"><SlidersHorizontal className="h-4 w-4" /></button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          <div style={{ left: pos.left, top: pos.top, width: 240 }} className="fixed z-[201] space-y-2.5 rounded-xl border bg-popover p-3 shadow-xl duration-150 animate-in fade-in-0 zoom-in-95">
            <Slider label="Tamanho" val={Math.round((value.escala ?? 1) * 100)} min={40} max={200} onChange={(v) => set({ escala: v / 100 })} suffix="%" />
            <Slider label="Posição horizontal" val={value.posX ?? 50} min={0} max={100} onChange={(v) => set({ posX: v })} suffix="%" />
            <Slider label="Posição vertical" val={value.posY ?? 50} min={0} max={100} onChange={(v) => set({ posY: v })} suffix="%" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Encaixe</span>
              <div className="flex gap-1">
                {(['contain', 'cover'] as const).map((a) => (
                  <button key={a} type="button" onClick={() => set({ ajuste: a })} className={cn('rounded-md px-2 py-1 text-[11px] font-medium transition', (value.ajuste || 'contain') === a ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{a === 'contain' ? 'Conter' : 'Cobrir'}</button>
                ))}
              </div>
            </div>
            <CorField label="Cor (tingir)" opcoes={cores} value={value.cor} onChange={(v) => set({ cor: v })} />
            {/* Cor quando o item está ATIVO/selecionado (acompanha a mudança de cor do menu ao clicar). */}
            <CorField label="Cor ao selecionar (ativo)" opcoes={[['', 'Igual'], ['#ffffff', 'Branco'], ['#111827', 'Preto']]} value={value.corAtiva} onChange={(v) => set({ corAtiva: v })} />
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

/** Seletor de ÍCONE: lucide (grade do RBAC) OU imagem própria; "padrão" limpa. Mostra o ícone atual. */
function IconeControl({ value, fallback: Fallback, onChange }: { value: IconeOverride | null; fallback: Ic; onChange: (v: IconeOverride | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const enviar = (f: File) => {
    if (!f.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    const r = new FileReader(); r.onload = () => onChange({ tipo: 'img', url: String(r.result) }); r.readAsDataURL(f)
  }
  const Ic = value?.tipo === 'lucide' && value.key ? iconeCargo(value.key) : null
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border bg-muted/40" title="Ícone atual">
        {value?.tipo === 'none' ? <EyeOff className="h-4 w-4 text-muted-foreground/50" />
          : value?.tipo === 'img' && value.url ? <IconeMenu override={value} fallback={Fallback} className="h-5 w-5" />
          : Ic ? <Ic className="h-5 w-5 text-primary" />
          : <Fallback className="h-5 w-5 text-muted-foreground/60" />}
      </span>
      <CargoIconePicker value={value?.tipo === 'lucide' ? value.key ?? undefined : undefined} onChange={(k) => onChange({ tipo: 'lucide', key: k })} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
      <button type="button" onClick={() => fileRef.current?.click()} title="Enviar imagem do ícone — recomendado 64×64px quadrado, PNG com fundo transparente"
        className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"><ImagePlus className="h-4 w-4" /></button>
      {/* Ocultar ícone (deixar o item sem ícone). Clicar de novo volta ao padrão. */}
      <button type="button" onClick={() => onChange(value?.tipo === 'none' ? null : { tipo: 'none' })} title={value?.tipo === 'none' ? 'Mostrar ícone (voltar ao padrão)' : 'Ocultar ícone (deixar sem ícone)'}
        className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition', value?.tipo === 'none' ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground')}><EyeOff className="h-4 w-4" /></button>
      {value?.tipo === 'img' && value.url && <AjusteImagem value={value} onChange={(v) => onChange(v)} />}
      {value && <button type="button" onClick={() => onChange(null)} title="Voltar ao padrão"
        className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"><RotateCcw className="h-3.5 w-3.5" /></button>}
    </div>
  )
}

/**
 * Imagem NO LUGAR do texto (ex.: título estilizado). Tamanho recomendado: altura 40px, largura até
 * ~320px, PNG com fundo transparente (é exibida a 20px de altura na barra). O texto segue como alt.
 */
function RotuloImgControl({ value, onChange }: { value?: IconeOverride | null; onChange: (v: IconeOverride | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const enviar = (f: File) => {
    if (!f.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    const r = new FileReader(); r.onload = () => onChange({ ...(value ?? {}), tipo: 'img', url: String(r.result) }); r.readAsDataURL(f)
  }
  const temImg = value?.tipo === 'img' && !!value.url
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {temImg && <span className="flex h-9 items-center overflow-hidden rounded-lg border bg-muted/40 px-1.5" title="Imagem do texto (prévia)"><LabelImg li={value!} alt="" className="h-5 max-w-[6rem]" /></span>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
      <button type="button" onClick={() => ref.current?.click()} title="Imagem no lugar do texto — recomendado 320×40px (altura 40px), PNG com fundo transparente"
        className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition', temImg ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground')}><Type className="h-4 w-4" /></button>
      {/* Ajuste da imagem do texto (tamanho/posição/encaixe/cor) — mesmo editor do ícone. */}
      {temImg && <AjusteImagem value={value!} onChange={(v) => onChange(v)} />}
      {temImg && <button type="button" onClick={() => onChange(null)} title="Remover imagem do texto"
        className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"><RotateCcw className="h-3.5 w-3.5" /></button>}
    </div>
  )
}

/** Uma linha editável: texto (ou imagem no lugar do texto) + (opcional) seletor de ícone. */
function Linha({ labelPadrao, Icon, valorLabel, onLabel, labelImg, onLabelImg, icone, onIcone, filho = false }: {
  labelPadrao: string; Icon?: Ic; valorLabel: string; onLabel: (v: string) => void
  labelImg?: IconeOverride | null; onLabelImg?: (v: IconeOverride | null) => void
  icone?: IconeOverride | null; onIcone?: (v: IconeOverride | null) => void; filho?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2', filho && 'pl-6')}>
      <Input value={valorLabel} onChange={(e) => onLabel(e.target.value)} placeholder={labelImg ? 'usando imagem no lugar do texto' : labelPadrao} className={cn('h-9 flex-1', labelImg && 'opacity-50')} />
      {onLabelImg && <RotuloImgControl value={labelImg} onChange={onLabelImg} />}
      {onIcone && Icon && <IconeControl value={icone ?? null} fallback={Icon} onChange={onIcone} />}
    </div>
  )
}

/**
 * Prévia AO VIVO — réplica fiel da barra lateral real. As CORES vêm 100% dos tokens da
 * personalização (`var(--sidebar-*)`), então mudar a aba "Cores" reflete aqui automaticamente
 * (nada de hex fixo). Largura/alturas/ícones iguais aos do `SidebarMenuButton` real; grupos abrem
 * e fecham (como na sidebar de verdade). Logo/nome/subtítulo vêm do tema (não são cor de paleta).
 */
function Preview({ scope, rot, tema }: { scope: 'admin' | 'aluno'; rot: SidebarRotulos; tema: any }) {
  // Tudo linkado aos MESMOS tokens que a sidebar real consome (injetados pelo tema do tenant).
  const BG = 'var(--sidebar)'
  const FG = 'var(--sidebar-foreground)'
  const BORDA = 'var(--sidebar-border, color-mix(in srgb, var(--sidebar-foreground) 15%, transparent))'
  const ICONE = 'var(--sidebar-icon, var(--sidebar-foreground))'
  const ATIVO_BG = 'var(--sidebar-accent, var(--sidebar-primary))'
  const ATIVO_FG = 'var(--sidebar-text-active, var(--sidebar-accent-foreground, var(--sidebar-primary-foreground)))'
  const ATIVO_ICONE = 'var(--sidebar-icon-active, var(--sidebar-accent-foreground, var(--sidebar-primary-foreground)))'
  const logo = tema?.logo_url as string | undefined
  const logoEstilo = (tema?.logo_estilo as string) || 'arredondado'
  const logoFiltro = (tema?.logo_filtro_sistema as string) || (tema?.logo_filtro as string) || 'none'
  const logoBg = (tema?.logo_png_bg as string) || '#ffffff'
  const nome = (tema?.nome_site as string) || 'Plataforma'
  const sub = (tema?.subtitulo_site as string) || ''
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setAbertos((a) => ({ ...a, [k]: !a[k] }))
  // Item ativo da prévia: clicável, para VER o estado selecionado (cores + imagem com corAtiva), como no sistema real.
  const [ativoKey, setAtivoKey] = useState<string>(scope === 'admin' ? ADMIN_DASH.href : (ALUNO_CAT[0]?.href ?? ''))

  // Linha IDÊNTICA ao SidebarMenuButton real: h-8, p-2, gap-2, text-sm, ícone 16px. A seta usa o
  // MESMO token do ícone (--sidebar-icon / -active), como na sidebar real (NAV_STATES [&>svg]).
  const Row = ({ Icon, icone, label, labelImg, ativo, chevron, aberto, onClick }: { Icon?: Ic; icone?: IconeOverride | null; label: string; labelImg?: IconeOverride | null; ativo?: boolean; chevron?: boolean; aberto?: boolean; onClick?: () => void }) => (
    <button type="button" onClick={onClick} className="flex h-8 w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors"
      style={{ background: ativo ? ATIVO_BG : undefined, color: ativo ? ATIVO_FG : FG, fontWeight: ativo ? 600 : 500 }}>
      {Icon && icone?.tipo !== 'none' && <span className="inline-flex shrink-0" style={{ color: ativo ? ATIVO_ICONE : ICONE }}><IconeMenu override={icone ?? undefined} fallback={Icon} className="h-4 w-4" ativo={ativo} /></span>}
      {labelImg?.url ? <LabelImg li={labelImg} alt={label} className="min-w-0 flex-1 object-left" ativo={ativo} /> : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {chevron && <ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: ativo ? ATIVO_ICONE : ICONE, transform: aberto ? 'rotate(180deg)' : undefined }} />}
    </button>
  )
  // Sub-grupo: barrinha lateral + indentação, como o SidebarMenuSub real.
  const Sub = ({ children }: { children: ReactNode }) => <div className="ml-3.5 mt-1 flex flex-col gap-1 border-l pl-2.5" style={{ borderColor: BORDA }}>{children}</div>

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border shadow-lg" style={{ background: BG, color: FG, borderColor: BORDA, width: '16rem', height: '78vh' }}>
      {/* Cabeçalho idêntico: moldura/filtro/fundo da logo do tema + nome + subtítulo. */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: BORDA }}>
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden', frameLogo(logoEstilo))} style={{ background: logo ? logoBg : ATIVO_BG, borderColor: BORDA }}>
          {logo ? <img src={logo} alt="" className="h-full w-full object-contain" style={{ filter: filtroLogo(logoFiltro) }} /> : <span className="text-xs font-bold" style={{ color: ATIVO_FG }}>{(nome[0] || 'P').toUpperCase()}</span>}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold leading-tight">{nome}</span>
          {sub && <span className="truncate text-[11px] leading-tight" style={{ color: FG, opacity: 0.6 }}>{sub}</span>}
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {scope === 'admin' ? (
          <>
            <Row Icon={ADMIN_DASH.Icon} icone={rot.admin?.itens?.[ADMIN_DASH.href]?.icone} label={rotuloDe(rot.admin?.itens, ADMIN_DASH.href, ADMIN_DASH.label)} labelImg={rot.admin?.itens?.[ADMIN_DASH.href]?.labelImg} ativo={ativoKey === ADMIN_DASH.href} onClick={() => setAtivoKey(ADMIN_DASH.href)} />
            {ADMIN_CAT.map((g) => (
              <div key={g.grupo}>
                {/* grupos recolhíveis: clique abre/fecha E ativa a área (como na sidebar real) */}
                <Row Icon={g.Icon} icone={rot.admin?.grupos?.[g.grupo]?.icone} label={rotuloDe(rot.admin?.grupos, g.grupo, g.grupo)} labelImg={rot.admin?.grupos?.[g.grupo]?.labelImg} ativo={ativoKey === g.grupo} chevron aberto={abertos[g.grupo]} onClick={() => { toggle(g.grupo); setAtivoKey(g.grupo) }} />
                {abertos[g.grupo] && <Sub>{g.itens.map((it) => <Row key={it.href} Icon={it.Icon} icone={rot.admin?.itens?.[it.href]?.icone} label={rotuloDe(rot.admin?.itens, it.href, it.label)} labelImg={rot.admin?.itens?.[it.href]?.labelImg} ativo={ativoKey === it.href} onClick={() => setAtivoKey(it.href)} />)}</Sub>}
              </div>
            ))}
          </>
        ) : (
          ALUNO_CAT.map((it) => (
            <div key={it.href}>
              {/* seta SÓ nos itens com sub-itens (ex.: Cronograma) — abre/fecha; clique ativa a área */}
              <Row Icon={it.Icon} icone={rot.aluno?.itens?.[it.href]?.icone} label={rotuloDe(rot.aluno?.itens, it.href, it.label)} labelImg={rot.aluno?.itens?.[it.href]?.labelImg} ativo={ativoKey === it.href} chevron={!!it.filhos} aberto={abertos[it.href]} onClick={() => { if (it.filhos) toggle(it.href); setAtivoKey(it.href) }} />
              {it.filhos && abertos[it.href] && <Sub>{it.filhos.map((f) => <div key={f.href} className="truncate rounded-md px-2 py-1 text-sm" style={{ color: FG, opacity: 0.85 }}>{rot.aluno?.filhos?.[f.href]?.label?.trim() || f.label}</div>)}</Sub>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Configurador do MENU LATERAL por tenant: renomeia áreas/itens/sub-itens e troca o ícone por outro
 * lucide ou uma imagem própria — admin e aluno — com PRÉVIA ao vivo (tamanho real, cores do tenant).
 * Salva em `tema.sidebar_rotulos` (o salvarTema sobe as imagens base64 → URL). Vazio = padrão do sistema.
 */
export function MenuLateralForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [rot, setRot] = useState<SidebarRotulos>(() => resolverSidebarRotulos(tema?.sidebar_rotulos))
  const [salvando, start] = useTransition()
  const baseRef = useRef(JSON.stringify(rot))
  const dirty = JSON.stringify(rot) !== baseRef.current

  const setOv = (scope: 'admin' | 'aluno', campo: 'grupos' | 'itens', chave: string, patch: Partial<RotuloOverride>) =>
    setRot((r) => {
      const novo: RotuloOverride = { ...((r[scope] as any)?.[campo]?.[chave] ?? {}), ...patch }
      if (!novo.label?.trim()) delete novo.label
      if (!novo.labelImg) delete novo.labelImg
      if (!novo.icone) delete novo.icone
      const mapa = { ...((r[scope] as any)?.[campo] ?? {}) }
      if (Object.keys(novo).length) mapa[chave] = novo; else delete mapa[chave]
      return { ...r, [scope]: { ...(r[scope] ?? {}), [campo]: mapa } }
    })
  const setFilho = (href: string, label: string) =>
    setRot((r) => { const mapa = { ...(r.aluno?.filhos ?? {}) }; if (label.trim()) mapa[href] = { label }; else delete mapa[href]; return { ...r, aluno: { ...(r.aluno ?? {}), filhos: mapa } } })

  const gLabel = (c: string) => rot.admin?.grupos?.[c]?.label ?? ''
  const gIcone = (c: string) => rot.admin?.grupos?.[c]?.icone ?? null
  const gLabelImg = (c: string) => rot.admin?.grupos?.[c]?.labelImg ?? null
  const aiLabel = (scope: 'admin' | 'aluno', h: string) => (rot[scope] as any)?.itens?.[h]?.label ?? ''
  const aiIcone = (scope: 'admin' | 'aluno', h: string) => (rot[scope] as any)?.itens?.[h]?.icone ?? null
  const aiLabelImg = (scope: 'admin' | 'aluno', h: string) => (rot[scope] as any)?.itens?.[h]?.labelImg ?? null

  function salvar() {
    start(async () => {
      const r = await salvarTema({ sidebar_rotulos: rot })
      if (r && (r as any).ok === false) { toast.error('Erro ao salvar.'); return }
      baseRef.current = JSON.stringify(rot); toast.success('Menu lateral salvo.')
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><PanelLeft className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Menu lateral (textos e ícones)</h3>
            <p className="max-w-2xl text-xs text-muted-foreground">Renomeie as áreas, itens e sub-itens da barra lateral e troque o ícone por outro ou por uma imagem própria — no admin e no aluno. A prévia à direita mostra como fica (tamanho real). Em branco = o padrão do sistema.</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80">
              <span className="inline-flex items-center gap-1"><ImagePlus className="h-3 w-3" /> Ícone: quadrado, <b className="font-semibold">64×64px</b> (PNG transparente) — exibido a 16px.</span>
              <span className="inline-flex items-center gap-1"><Type className="h-3 w-3" /> Imagem do texto: altura <b className="font-semibold">40px</b>, largura até ~320px (PNG transparente) — exibida a 20px.</span>
            </p>
          </div>
        </div>
        <button type="button" onClick={salvar} disabled={salvando || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
        </button>
      </div>

      <Tabs defaultValue="admin" className="rounded-xl border bg-muted/20 p-4">
        <TabsList variant="line" className="gap-4">
          <TabsTrigger value="admin"><UserCog /> Admin</TabsTrigger>
          <TabsTrigger value="aluno"><GraduationCap /> Aluno</TabsTrigger>
        </TabsList>

        <TabsContent value="admin">
          <div className="grid gap-5 pt-4 lg:grid-cols-[1fr_17rem]">
            <div className="min-w-0 space-y-4">
              <Linha labelPadrao={ADMIN_DASH.label} Icon={ADMIN_DASH.Icon} valorLabel={aiLabel('admin', ADMIN_DASH.href)} onLabel={(v) => setOv('admin', 'itens', ADMIN_DASH.href, { label: v })} labelImg={aiLabelImg('admin', ADMIN_DASH.href)} onLabelImg={(v) => setOv('admin', 'itens', ADMIN_DASH.href, { labelImg: v })} icone={aiIcone('admin', ADMIN_DASH.href)} onIcone={(v) => setOv('admin', 'itens', ADMIN_DASH.href, { icone: v })} />
              {ADMIN_CAT.map((g) => (
                <div key={g.grupo} className="space-y-2 rounded-lg border bg-card p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Área: {g.grupo}</p>
                  <Linha labelPadrao={g.grupo} Icon={g.Icon} valorLabel={gLabel(g.grupo)} onLabel={(v) => setOv('admin', 'grupos', g.grupo, { label: v })} labelImg={gLabelImg(g.grupo)} onLabelImg={(v) => setOv('admin', 'grupos', g.grupo, { labelImg: v })} icone={gIcone(g.grupo)} onIcone={(v) => setOv('admin', 'grupos', g.grupo, { icone: v })} />
                  {g.itens.map((it) => <Linha key={it.href} filho labelPadrao={it.label} Icon={it.Icon} valorLabel={aiLabel('admin', it.href)} onLabel={(v) => setOv('admin', 'itens', it.href, { label: v })} labelImg={aiLabelImg('admin', it.href)} onLabelImg={(v) => setOv('admin', 'itens', it.href, { labelImg: v })} icone={aiIcone('admin', it.href)} onIcone={(v) => setOv('admin', 'itens', it.href, { icone: v })} />)}
                </div>
              ))}
            </div>
            <div className="hidden lg:block"><div className="sticky top-4 space-y-1.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prévia (tamanho real) · clique p/ ativar</p><Preview scope="admin" rot={rot} tema={tema} /></div></div>
          </div>
        </TabsContent>

        <TabsContent value="aluno">
          <div className="grid gap-5 pt-4 lg:grid-cols-[1fr_17rem]">
            <div className="min-w-0 space-y-2">
              {ALUNO_CAT.map((it) => (
                <div key={it.href} className="space-y-2 rounded-lg border bg-card p-3">
                  <Linha labelPadrao={it.label} Icon={it.Icon} valorLabel={aiLabel('aluno', it.href)} onLabel={(v) => setOv('aluno', 'itens', it.href, { label: v })} labelImg={aiLabelImg('aluno', it.href)} onLabelImg={(v) => setOv('aluno', 'itens', it.href, { labelImg: v })} icone={aiIcone('aluno', it.href)} onIcone={(v) => setOv('aluno', 'itens', it.href, { icone: v })} />
                  {it.filhos?.map((f) => <Linha key={f.href} filho labelPadrao={f.label} valorLabel={rot.aluno?.filhos?.[f.href]?.label ?? ''} onLabel={(v) => setFilho(f.href, v)} />)}
                </div>
              ))}
            </div>
            <div className="hidden lg:block"><div className="sticky top-4 space-y-1.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prévia (tamanho real) · clique p/ ativar</p><Preview scope="aluno" rot={rot} tema={tema} /></div></div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
