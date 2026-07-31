'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Loader2, Plus, X, Upload, Layout, AlignCenter, Image as ImageIcon, ArrowLeftRight, GraduationCap, CheckCircle2, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { redimensionarImagem } from '@/lib/imagem'
import { salvarTemaSuperAction } from '@/app/admin/tenants/actions'
import { LOGIN_DEFAULT, type LoginConfig, type LoginLayout, type LoginFundo } from '@/lib/login-config'

/** Aba "Login" do console: controles curados p/ montar a tela de entrada da empresa (alunos e admin)
 *  + prévia esquemática ao vivo. Salva em tema.login (merge) via salvarTemaSuperAction. */
export function PlataformaLoginConfig({
  tenantId, config, corPrimaria = '#6d28d9', corAccent = '#f5c542', logo = null, plataforma = 'Plataforma', dominio = null, slug = '',
}: {
  tenantId: string; config: LoginConfig; corPrimaria?: string; corAccent?: string; logo?: string | null; plataforma?: string; dominio?: string | null; slug?: string
}) {
  const router = useRouter()
  const [c, setC] = useState<LoginConfig>({ ...LOGIN_DEFAULT, ...config })
  const [pending, start] = useTransition()
  const [enviando, setEnviando] = useState(false)
  const [urlPrevia, setUrlPrevia] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const { protocol, host } = window.location
    const origem = dominio ? `${protocol}//${dominio}` : (() => { const partes = host.split('.'); const base = partes.length > 1 ? partes.slice(1).join('.') : host; return `${protocol}//${slug}.${base}` })()
    setUrlPrevia(`${origem}/aluno/entrar`)
  }, [dominio, slug])
  const set = <K extends keyof LoginConfig>(k: K, v: LoginConfig[K]) => setC((p) => ({ ...p, [k]: v }))

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

  const seg = 'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition inline-flex items-center justify-center gap-1.5'
  const on = 'border-primary bg-primary/5 text-primary'
  const off = 'hover:bg-muted'

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      {/* Controles */}
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold">Aparência do login</h2>
          <p className="text-xs text-muted-foreground">Vale para a tela de alunos e a de administradores desta empresa.</p>
        </div>

        <Bloco titulo="Layout">
          <div className="flex gap-2">
            {([['split', 'Split', Layout], ['centro', 'Central', AlignCenter], ['full', 'Tela cheia', ImageIcon]] as [LoginLayout, string, any][]).map(([v, r, Ic]) => (
              <button key={v} type="button" onClick={() => set('layout', v)} className={cn(seg, c.layout === v ? on : off)}><Ic className="h-3.5 w-3.5" /> {r}</button>
            ))}
          </div>
          {c.layout === 'split' && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Painel da marca à</span>
              <button type="button" onClick={() => set('painelLado', c.painelLado === 'esquerda' ? 'direita' : 'esquerda')}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted">
                <ArrowLeftRight className="h-3.5 w-3.5" /> {c.painelLado === 'esquerda' ? 'Esquerda' : 'Direita'}
              </button>
            </div>
          )}
          {c.layout !== 'centro' && (
            <label className="flex items-center justify-between pt-1 text-sm"><span className="text-muted-foreground">Mostrar painel da marca</span><Switch checked={c.mostrarMarca} onCheckedChange={(v) => set('mostrarMarca', v)} /></label>
          )}
        </Bloco>

        <Bloco titulo="Fundo">
          <div className="flex gap-2">
            {([['gradiente', 'Gradiente'], ['cor', 'Cor'], ['imagem', 'Imagem']] as [LoginFundo, string][]).map(([v, r]) => (
              <button key={v} type="button" onClick={() => set('fundo', v)} className={cn(seg, c.fundo === v ? on : off)}>{r}</button>
            ))}
          </div>
          {c.fundo === 'cor' && (
            <div className="flex items-center gap-2 pt-1"><span className="text-xs text-muted-foreground">Cor do fundo</span><input type="color" value={c.fundoCor ?? corPrimaria} onChange={(e) => set('fundoCor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /></div>
          )}
          {c.fundo === 'imagem' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-2">
                <Input value={c.fundoImagem?.startsWith('data:') ? '' : (c.fundoImagem ?? '')} onChange={(e) => set('fundoImagem', e.target.value)} placeholder="Cole uma URL ou envie →" className="flex-1" />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagem(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
          <label className="flex items-center justify-between pt-1 text-sm"><span className="text-muted-foreground">Animação (véus no fundo)</span><Switch checked={c.animacao} onCheckedChange={(v) => set('animacao', v)} /></label>
        </Bloco>

        <Bloco titulo="Textos">
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Título (headline)</label><Input value={c.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder={LOGIN_DEFAULT.titulo} /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Subtítulo</label><textarea value={c.subtitulo} onChange={(e) => set('subtitulo', e.target.value)} rows={2} className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Destaques (bullets)</label>
            {c.destaques.map((d, i) => (
              <div key={i} className="flex gap-2">
                <Input value={d} onChange={(e) => set('destaques', c.destaques.map((x, j) => j === i ? e.target.value : x))} className="flex-1" />
                <button type="button" onClick={() => set('destaques', c.destaques.filter((_, j) => j !== i))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
            ))}
            {c.destaques.length < 5 && (
              <button type="button" onClick={() => set('destaques', [...c.destaques, ''])} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Adicionar destaque</button>
            )}
          </div>
        </Bloco>

        <div className="flex items-center gap-2 border-t pt-3">
          <Button onClick={salvar} disabled={pending} className="flex-1">{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar login</Button>
          {urlPrevia && <a href={urlPrevia} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted"><ExternalLink className="h-4 w-4" /> Prévia real</a>}
        </div>
      </div>

      {/* Prévia esquemática */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Prévia</h2>
        <Previa c={c} corPrimaria={corPrimaria} corAccent={corAccent} logo={logo} plataforma={plataforma} />
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>{children}</div>
}

/** Prévia esquemática (não interativa) do login com a marca real da empresa. */
function Previa({ c, corPrimaria, corAccent, logo, plataforma }: { c: LoginConfig; corPrimaria: string; corAccent: string; logo: string | null; plataforma: string }) {
  const brandStyle: React.CSSProperties = c.fundo === 'imagem' && c.fundoImagem
    ? { backgroundImage: `url(${c.fundoImagem})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : c.fundo === 'cor' && c.fundoCor ? { background: c.fundoCor }
    : { background: `linear-gradient(150deg, ${corPrimaria} 0%, color-mix(in oklab, ${corPrimaria} 68%, #0b0716) 58%, #0b0716 130%)` }

  const Marca = (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-5 text-white" style={brandStyle}>
      {c.fundo === 'imagem' && <div className="absolute inset-0 bg-black/40" />}
      <div className="relative flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white/90 text-[10px] font-bold" style={{ color: corPrimaria }}>
          {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <GraduationCap className="h-4 w-4" />}
        </span>
        <span className="text-xs font-semibold">{plataforma}</span>
      </div>
      <div className="relative space-y-1.5">
        <p className="whitespace-pre-line text-base font-extrabold leading-tight">{c.titulo}</p>
        {c.subtitulo && <p className="text-[10px] text-white/70">{c.subtitulo}</p>}
        <ul className="space-y-1 pt-1">{c.destaques.slice(0, 3).map((d, i) => (<li key={i} className="flex items-center gap-1.5 text-[10px] text-white/85"><CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: corAccent }} /> {d}</li>))}</ul>
      </div>
      <div className="relative text-[9px] text-white/40">© {plataforma}</div>
    </div>
  )
  const Form = (
    <div className="flex h-full items-center justify-center bg-background p-5">
      <div className="w-full max-w-[200px] space-y-2.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: corAccent }}>Área do aluno</p>
        <p className="text-base font-bold">Entrar</p>
        <div className="h-8 rounded-lg border bg-card" />
        <div className="h-8 rounded-lg" style={{ background: corPrimaria }} />
      </div>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="aspect-[16/10] w-full">
        {c.layout === 'full' ? (
          <div className="relative flex h-full items-center justify-center overflow-hidden text-white" style={brandStyle}>
            <div className="absolute inset-0 bg-black/35" />
            <div className="relative w-full max-w-[220px] rounded-xl border border-white/20 bg-white/95 p-4 text-foreground shadow-xl">
              <div className="space-y-2.5"><p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: corAccent }}>Área do aluno</p><p className="text-base font-bold">Entrar</p><div className="h-8 rounded-lg border bg-card" /><div className="h-8 rounded-lg" style={{ background: corPrimaria }} /></div>
            </div>
          </div>
        ) : c.layout === 'split' && c.mostrarMarca ? (
          <div className="grid h-full grid-cols-[1.05fr_1fr]">{c.painelLado === 'direita' ? <>{Form}{Marca}</> : <>{Marca}{Form}</>}</div>
        ) : (
          <div className="h-full">{Form}</div>
        )}
      </div>
    </div>
  )
}
