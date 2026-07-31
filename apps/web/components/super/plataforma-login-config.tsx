'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Loader2, Plus, X, Upload, ExternalLink, RotateCcw, ImageOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { redimensionarImagem } from '@/lib/imagem'
import { salvarTemaSuperAction } from '@/app/admin/tenants/actions'
import { LOGIN_DEFAULT, type LoginConfig, type LoginTemplate, type LoginFundo, type CardEstilo, type LogoEstilo, type LogoFiltro, type LogoTam, type BotaoEstilo } from '@/lib/login-config'
import { AlunoEntrarForm } from '@/components/aluno/aluno-entrar-form'

const TEMPLATES: { v: LoginTemplate; nome: string; desc: string; thumb: React.ReactNode }[] = [
  { v: 'split', nome: 'Split', desc: 'Painel da marca + formulário', thumb: <Thumb><div className="h-full w-1/2 bg-primary" /><div className="flex h-full w-1/2 items-center justify-center bg-muted"><i className="h-2.5 w-4 rounded-sm bg-primary/60" /></div></Thumb> },
  { v: 'central', nome: 'Central', desc: 'Card central sobre a cor', thumb: <Thumb solid><i className="h-3.5 w-6 rounded-sm bg-white/95" /></Thumb> },
  { v: 'hero', nome: 'Hero', desc: 'Imagem/cor cheia + card', thumb: <Thumb solid pos="right"><i className="h-4 w-5 rounded-sm bg-white/95" /></Thumb> },
  { v: 'vitrine', nome: 'Vitrine', desc: 'Faixa da marca + card', thumb: <Thumb col><div className="h-1/2 w-full bg-primary" /><div className="flex h-1/2 w-full items-center justify-center bg-muted"><i className="h-2.5 w-5 rounded-sm bg-primary/50" /></div></Thumb> },
  { v: 'cartao', nome: 'Cartão', desc: 'Card único centralizado', thumb: <Thumb solid><i className="h-5 w-6 rounded-sm bg-white/95" /></Thumb> },
]

function Thumb({ children, solid, col, pos }: { children: React.ReactNode; solid?: boolean; col?: boolean; pos?: 'right' }) {
  return (
    <span className={cn('flex h-9 w-12 shrink-0 overflow-hidden rounded-md border', solid && 'items-center justify-center bg-primary', pos === 'right' && '!justify-end pr-1', col && 'flex-col')}>{children}</span>
  )
}

export function PlataformaLoginConfig({
  tenantId, config, corPrimaria = '#6d28d9', corAccent = '#f5c542', logo = null, plataforma = 'Plataforma', dominio = null, slug = '',
  logoBg = '#ffffff', logoEstilo = 'arredondado', logoFiltro = 'none',
}: {
  tenantId: string; config: LoginConfig; corPrimaria?: string; corAccent?: string; logo?: string | null; plataforma?: string; dominio?: string | null; slug?: string
  logoBg?: string; logoEstilo?: string; logoFiltro?: string
}) {
  const router = useRouter()
  const [c, setC] = useState<LoginConfig>({ ...LOGIN_DEFAULT, ...config })
  const [pending, start] = useTransition()
  const [enviando, setEnviando] = useState(false)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [urlPrevia, setUrlPrevia] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof LoginConfig>(k: K, v: LoginConfig[K]) => setC((p) => ({ ...p, [k]: v }))
  const logoAtual = c.logoUrl ?? logo

  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.32)
  useEffect(() => {
    const el = boxRef.current; if (!el) return
    const medir = () => setScale(el.clientWidth / 1200)
    medir(); const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const { protocol, host } = window.location
    const origem = dominio ? `${protocol}//${dominio}` : (() => { const p = host.split('.'); const base = p.length > 1 ? p.slice(1).join('.') : host; return `${protocol}//${slug}.${base}` })()
    setUrlPrevia(`${origem}/aluno/entrar`)
  }, [dominio, slug])

  function salvar() {
    start(async () => {
      try { await salvarTemaSuperAction(tenantId, { login: c }); toast.success('Tela de login salva!'); router.refresh() }
      catch (e: any) { toast.error(e?.message ?? 'Falha ao salvar.') }
    })
  }
  async function onImagem(f: File | null) {
    if (!f) return
    setEnviando(true)
    try { set('fundoImagem', await redimensionarImagem(f, 1600, 0.82)); set('fundo', 'imagem') }
    catch { toast.error('Falha ao processar a imagem.') } finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
  }
  async function onLogo(f: File | null) {
    if (!f) return
    setEnviandoLogo(true)
    try { set('logoUrl', await redimensionarImagem(f, 512, 0.9)) }
    catch { toast.error('Falha ao processar o logo.') } finally { setEnviandoLogo(false); if (logoRef.current) logoRef.current.value = '' }
  }

  const seg = 'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition inline-flex items-center justify-center gap-1.5'
  const on = 'border-primary bg-primary/5 text-primary', off = 'hover:bg-muted'

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_1fr]">
      {/* Controles */}
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold">Aparência do login</h2>
          <p className="text-xs text-muted-foreground">Vale para a tela de alunos e a de administradores desta empresa.</p>
        </div>

        <Bloco titulo="Modelo">
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.v} type="button" onClick={() => set('template', t.v)}
                className={cn('flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition', c.template === t.v ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-muted')}>
                {t.thumb}
                <span className="min-w-0"><span className="block text-xs font-semibold">{t.nome}</span><span className="block truncate text-[10px] text-muted-foreground">{t.desc}</span></span>
              </button>
            ))}
          </div>
          {c.template === 'split' && (
            <div className="flex items-center justify-between pt-1 text-sm"><span className="text-muted-foreground">Painel da marca à</span>
              <button type="button" onClick={() => set('painelLado', c.painelLado === 'esquerda' ? 'direita' : 'esquerda')} className="rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:bg-muted">{c.painelLado === 'esquerda' ? 'Esquerda' : 'Direita'}</button>
            </div>
          )}
          {c.template !== 'central' && c.template !== 'cartao' && (
            <label className="flex items-center justify-between pt-1 text-sm"><span className="text-muted-foreground">Mostrar painel da marca</span><Switch checked={c.mostrarMarca} onCheckedChange={(v) => set('mostrarMarca', v)} /></label>
          )}
        </Bloco>

        <Bloco titulo="Cores">
          <p className="text-[11px] text-muted-foreground">Fundo é definido em “Fundo &amp; card”. As cores de texto ficam ao lado de cada campo em “Textos”.</p>
          <div className="grid grid-cols-2 gap-3">
            <ColorField rotulo="Primária (botões)" valor={c.corPrimaria} fallback={corPrimaria} onChange={(v) => set('corPrimaria', v)} />
            <ColorField rotulo="Destaque" valor={c.corAccent} fallback={corAccent} onChange={(v) => set('corAccent', v)} />
          </div>
        </Bloco>

        <Bloco titulo="Logo">
          <label className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Mostrar logo</span><Switch checked={c.mostrarLogo} onCheckedChange={(v) => set('mostrarLogo', v)} /></label>
          {c.mostrarLogo && (
            <>
              <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border" style={{ background: c.logoBg ?? logoBg }}>
                  {logoAtual ? <img src={logoAtual} alt="" className="h-full w-full object-contain" style={{ filter: (c.logoFiltro ?? logoFiltro) === 'branco' ? 'brightness(0) invert(1)' : (c.logoFiltro ?? logoFiltro) === 'preto' ? 'brightness(0)' : undefined }} /> : <ImageOff className="h-5 w-5 text-muted-foreground" />}
                </span>
                <Input value={c.logoUrl?.startsWith('data:') ? '' : (c.logoUrl ?? '')} onChange={(e) => set('logoUrl', e.target.value || null)} placeholder="URL do logo (ou envie →) — vazio usa o do tema" className="flex-1" />
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => logoRef.current?.click()} disabled={enviandoLogo} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">{enviandoLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</button>
                {c.logoUrl && <button type="button" onClick={() => set('logoUrl', null)} title="Usar logo do tema" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted"><RotateCcw className="h-4 w-4" /></button>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs text-muted-foreground">Fundo do logo</label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" disabled={c.logoBg === 'transparent'} value={c.logoBg && c.logoBg !== 'transparent' ? c.logoBg : logoBg} onChange={(e) => set('logoBg', e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:opacity-40" />
                    <button type="button" onClick={() => set('logoBg', c.logoBg === 'transparent' ? null : 'transparent')} className={cn('flex-1 rounded-lg border py-1.5 text-[11px] font-medium transition', c.logoBg === 'transparent' ? on : off)}>Transparente</button>
                  </div>
                </div>
                <div className="space-y-1"><label className="text-xs text-muted-foreground">Tamanho</label>
                  <div className="flex gap-1">{(['p', 'm', 'g'] as LogoTam[]).map((t) => <button key={t} type="button" onClick={() => set('logoTamanho', t)} className={cn('flex-1 rounded-lg border py-1.5 text-xs font-medium uppercase transition', c.logoTamanho === t ? on : off)}>{t}</button>)}</div>
                </div>
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Moldura</label>
                <div className="flex gap-1">{([['arredondado', 'Arredondado'], ['quadrado', 'Quadrado'], ['borda', 'Borda']] as [LogoEstilo, string][]).map(([v, r]) => <button key={v} type="button" onClick={() => set('logoEstilo', v)} className={cn(seg, (c.logoEstilo ?? logoEstilo) === v ? on : off)}>{r}</button>)}</div>
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Filtro de cor</label>
                <div className="flex gap-1">{([['none', 'Nenhum'], ['branco', 'Branco'], ['preto', 'Preto']] as [LogoFiltro, string][]).map(([v, r]) => <button key={v} type="button" onClick={() => set('logoFiltro', v)} className={cn(seg, (c.logoFiltro ?? logoFiltro) === v ? on : off)}>{r}</button>)}</div>
              </div>
            </>
          )}
        </Bloco>

        <Bloco titulo="Fundo & card">
          <div className="flex gap-2">
            {([['gradiente', 'Gradiente'], ['cor', 'Cor'], ['imagem', 'Imagem']] as [LoginFundo, string][]).map(([v, r]) => (
              <button key={v} type="button" onClick={() => set('fundo', v)} className={cn(seg, c.fundo === v ? on : off)}>{r}</button>
            ))}
          </div>
          {c.fundo === 'cor' && <div className="flex items-center gap-2 pt-1"><span className="text-xs text-muted-foreground">Cor do fundo</span><input type="color" value={c.fundoCor ?? corPrimaria} onChange={(e) => set('fundoCor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /></div>}
          {c.fundo === 'imagem' && (
            <div className="flex gap-2 pt-1">
              <Input value={c.fundoImagem?.startsWith('data:') ? '' : (c.fundoImagem ?? '')} onChange={(e) => set('fundoImagem', e.target.value)} placeholder="Cole uma URL ou envie →" className="flex-1" />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagem(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</button>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1.5">
            <span className="text-xs text-muted-foreground">Card:</span>
            {([['vidro', 'Vidro'], ['solido', 'Sólido']] as [CardEstilo, string][]).map(([v, r]) => (
              <button key={v} type="button" onClick={() => set('cardEstilo', v)} className={cn('rounded-lg border px-3 py-1 text-xs font-medium transition', c.cardEstilo === v ? on : off)}>{r}</button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm"><span className="text-muted-foreground">Animação</span><Switch checked={c.animacao} onCheckedChange={(v) => set('animacao', v)} /></label>
          </div>
        </Bloco>

        <Bloco titulo="Textos">
          {c.titulo !== '' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Título (headline) <span className="text-muted-foreground/70">— cor do texto da marca →</span></label><button type="button" onClick={() => set('titulo', '')} className="text-[11px] text-muted-foreground transition hover:text-destructive">Remover</button></div>
              <div className="flex gap-2"><Input value={c.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder={LOGIN_DEFAULT.titulo} className="flex-1" /><SwatchInline valor={c.corTextoMarca} fallback="#ffffff" onChange={(v) => set('corTextoMarca', v)} title="Cor do texto da marca (título, subtítulo e destaques)" /></div>
            </div>
          ) : <button type="button" onClick={() => set('titulo', LOGIN_DEFAULT.titulo)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Adicionar título</button>}

          {c.subtitulo !== '' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Subtítulo</label><button type="button" onClick={() => set('subtitulo', '')} className="text-[11px] text-muted-foreground transition hover:text-destructive">Remover</button></div>
              <textarea value={c.subtitulo} onChange={(e) => set('subtitulo', e.target.value)} rows={2} className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
          ) : <button type="button" onClick={() => set('subtitulo', LOGIN_DEFAULT.subtitulo)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Adicionar subtítulo</button>}

          <div className="space-y-1.5 border-t pt-2">
            <label className="text-xs text-muted-foreground">Textos do formulário <span className="text-muted-foreground/70">(vazio = oculto)</span></label>
            <div className="flex gap-2"><Input value={c.textoKicker} onChange={(e) => set('textoKicker', e.target.value)} placeholder="Rótulo (aluno) — ex.: Área do aluno" className="flex-1" /><SwatchInline valor={c.corTextoForm} fallback={corAccent} onChange={(v) => set('corTextoForm', v)} title="Cor do rótulo “Área do aluno”" /></div>
            <Input value={c.textoKickerAdmin} onChange={(e) => set('textoKickerAdmin', e.target.value)} placeholder="Rótulo (admin) — ex.: Área administrativa" />
            <Input value={c.textoEntrar} onChange={(e) => set('textoEntrar', e.target.value)} placeholder="Título — ex.: Entrar" />
            <Input value={c.textoPlataforma === null ? plataforma : c.textoPlataforma} onChange={(e) => set('textoPlataforma', e.target.value)} placeholder="Nome exibido — ex.: Revisão" />
            <p className="text-[11px] text-muted-foreground">O rótulo <strong>admin</strong> e o campo de <strong>senha</strong> aparecem quando o aluno clica em “Admin” no canto da tela.</p>
          </div>

          <div className="space-y-1.5 border-t pt-2">
            <label className="text-xs text-muted-foreground">Destaques (bullets)</label>
            {c.destaques.map((d, i) => (
              <div key={i} className="flex gap-2">
                <Input value={d} onChange={(e) => set('destaques', c.destaques.map((x, j) => j === i ? e.target.value : x))} className="flex-1" />
                <button type="button" onClick={() => set('destaques', c.destaques.filter((_, j) => j !== i))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
            ))}
            {c.destaques.length < 5 && <button type="button" onClick={() => set('destaques', [...c.destaques, ''])} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Adicionar destaque</button>}
          </div>
        </Bloco>

        <Bloco titulo="Botão & rodapé">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Texto do botão <span className="text-muted-foreground/70">— cor →</span></label>
            <div className="flex gap-2"><Input value={c.textoBotao} onChange={(e) => set('textoBotao', e.target.value)} placeholder="Entrar" className="flex-1" /><SwatchInline valor={c.botaoCor} fallback={corPrimaria} onChange={(v) => set('botaoCor', v)} title="Cor do botão" /></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Estilo:</span>
            {([['solido', 'Sólido'], ['gradiente', 'Gradiente'], ['contorno', 'Contorno']] as [BotaoEstilo, string][]).map(([v, r]) => (
              <button key={v} type="button" onClick={() => set('botaoEstilo', v)} className={cn('flex-1 rounded-lg border py-1.5 text-xs font-medium transition', c.botaoEstilo === v ? on : off)}>{r}</button>
            ))}
          </div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Texto abaixo do botão <span className="text-muted-foreground/70">(vazio = oculto)</span></label><Input value={c.textoRodape} onChange={(e) => set('textoRodape', e.target.value)} placeholder="Ex.: Como aluno, basta o e-mail — sem senha." /></div>
        </Bloco>

        <div className="flex items-center gap-2 border-t pt-3">
          <Button onClick={salvar} disabled={pending} className="flex-1">{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar login</Button>
          {urlPrevia && <a href={urlPrevia} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted"><ExternalLink className="h-4 w-4" /> Prévia real</a>}
        </div>
      </div>

      {/* Prévia WYSIWYG (a própria tela, escalada) */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Prévia</h2>
        <div ref={boxRef} className="relative w-full overflow-hidden rounded-xl border bg-background" style={{ aspectRatio: '16 / 10' }}>
          <div className="pointer-events-none absolute left-0 top-0" style={{ width: 1200, height: 750, transform: `scale(${scale})`, transformOrigin: 'top left', ['--primary' as any]: corPrimaria, ['--brand-accent' as any]: corAccent }}>
            <AlunoEntrarForm preview metodo="email" plataforma={plataforma} logo={logo} logoBg={logoBg} logoEstilo={logoEstilo} logoFiltro={logoFiltro} config={c} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Prévia com a marca real. A tela de login final abre no endereço da empresa.</p>
      </div>
    </div>
  )
}

/** Swatch de cor compacto para ficar AO LADO de um campo de texto (com reset p/ o padrão). */
function SwatchInline({ valor, fallback, onChange, title }: { valor: string | null; fallback: string; onChange: (v: string | null) => void; title?: string }) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(fallback) ? fallback : '#6d28d9'
  return (
    <div className="flex shrink-0 items-center gap-1" title={title}>
      <input type="color" value={valor ?? hex} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5" />
      {valor && <button type="button" onClick={() => onChange(null)} title="Cor padrão" className="inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" /></button>}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>{children}</div>
}

function ColorField({ rotulo, valor, fallback, onChange, rotuloReset = 'Do tema' }: { rotulo: string; valor: string | null; fallback: string; onChange: (v: string | null) => void; rotuloReset?: string }) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(fallback) ? fallback : '#6d28d9'
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{rotulo}</label>
      <div className="flex items-center gap-1.5">
        <input type="color" value={valor ?? hex} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5" />
        {valor
          ? <button type="button" onClick={() => onChange(null)} title={`Usar ${rotuloReset.toLowerCase()}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" /></button>
          : <span className="truncate text-[10px] text-muted-foreground">{rotuloReset}</span>}
      </div>
    </div>
  )
}
