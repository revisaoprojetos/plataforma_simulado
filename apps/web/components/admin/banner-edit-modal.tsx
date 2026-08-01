'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, Upload, Crop, Loader2, Check, Megaphone, MessageSquareWarning, ImageIcon, Clapperboard } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { redimensionarImagem } from '@/lib/imagem'
import { BannerCropper } from '@/components/admin/banner-cropper'
import { atualizarBannerAction } from '@/app/admin/configuracoes/banners/actions'
import { ehBannerSimulado, type Banner, type DestinoBanner } from '@/components/admin/banners-manager'
import { SimSlide, type HeroSimSlide } from '@/components/aluno/banners-portal'

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })
}

/** Pop-up de configuração TOTAL de um banner já criado (tipo, título, mensagem, imagem+recorte,
 *  link/destino, cor, ativo). Salva via atualizarBannerAction. */
export function BannerEditModal({ banner, tenantId, destinos, desempenho, onToggleDesempenho, destaqueAtivoInicial = true, destaqueTextoInicial = '', fadeAtivoInicial = true, fadeNivelInicial = 100, onClose }: { banner: Banner; tenantId?: string; destinos?: DestinoBanner[]; desempenho?: boolean; onToggleDesempenho?: (v: boolean) => void; destaqueAtivoInicial?: boolean; destaqueTextoInicial?: string; fadeAtivoInicial?: boolean; fadeNivelInicial?: number; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Modo da UI: "simulado" é um destaque (hero) que aponta p/ um simulado/pasta. Detecta pelo banner.
  const [uiTipo, setUiTipo] = useState<'banner' | 'popup' | 'hero' | 'simulado'>(ehBannerSimulado(banner) ? 'simulado' : banner.tipo)
  const tipo: Banner['tipo'] = uiTipo === 'simulado' ? 'hero' : uiTipo
  const simulados = (destinos ?? []).filter((d) => (d.grupo ?? 'Simulados') === 'Simulados')
  const pastasDest = (destinos ?? []).filter((d) => d.grupo === 'Pastas')
  const destSim = [...pastasDest, ...simulados]
  const [titulo, setTitulo] = useState(banner.titulo ?? '')
  const [mensagem, setMensagem] = useState(banner.mensagem ?? '')
  const [imagem, setImagem] = useState(banner.imagem_url ?? '')
  const [link, setLink] = useState(banner.link ?? '')
  const [cor, setCor] = useState(banner.cor ?? '#6366f1')
  const [ativo, setAtivo] = useState(banner.ativo)
  const [destaqueAtivo, setDestaqueAtivo] = useState(destaqueAtivoInicial)
  const [destaqueTexto, setDestaqueTexto] = useState(destaqueTextoInicial)
  const [fadeAtivo, setFadeAtivo] = useState(fadeAtivoInicial)
  const [fadeNivel, setFadeNivel] = useState(fadeNivelInicial)
  const [enviando, setEnviando] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onArquivo(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    if (tipo === 'popup') {
      setEnviando(true)
      try { setImagem(await redimensionarImagem(f, 900, 0.72)) } catch { toast.error('Falha ao processar a imagem.') } finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
      return
    }
    setEnviando(true)
    try { const url = await fileToDataUrl(f); setCropSrc(url); setCropOpen(true) }
    catch { toast.error('Falha ao ler a imagem.') }
    finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function salvar() {
    start(async () => {
      const r = await atualizarBannerAction(banner.id, { tipo, titulo, mensagem, imagem_url: imagem, link, cor, ativo, ordem: banner.ordem, destaqueAtivo, destaqueTexto, fadeAtivo, fadeNivel }, tenantId)
      if (r.ok) { toast.success('Banner atualizado.'); router.refresh(); onClose() }
      else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }

  // Prévia EXATA e proporcional: renderiza o SimSlide no tamanho REAL (STAGE) e escala p/ caber na
  // caixa. Assim o texto/botões ficam nas mesmas proporções do banner real, só que menores.
  const STAGE_W = 1100
  const STAGE_H = (STAGE_W * 500) / 1920
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(0.5)
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const upd = () => setPreviewScale(el.clientWidth / STAGE_W)
    upd()
    const ro = new ResizeObserver(upd)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Prévia EXATA: monta um HeroSimSlide com o estado atual e renderiza o MESMO componente do portal.
  const ehPasta = /[?&]pasta=/.test(link)
  const previewSlide: HeroSimSlide = {
    id: banner.id, kind: 'sim',
    capa: imagem || null,
    cor: cor || '#6d28d9',
    titulo: titulo || 'Título do banner',
    descricao: mensagem || null,
    link: link || '#',
    acao: ehPasta ? 'Ver simulados' : 'Fazer agora',
    detalhesLink: !ehPasta && link ? '#' : null,
    stats: desempenho ? { simulados: 12, notaMedia: 82.5, melhorNota: 100 } : null,
    destaqueAtivo, destaqueTexto: destaqueTexto || null,
    fadeAtivo, fadeNivel,
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <span className="text-sm font-semibold">Configurar aviso</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {/* Seleção do simulado/pasta — largura total (só no modo Simulado). */}
          {uiTipo === 'simulado' && (
            <div className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Banner que promove um <strong>simulado</strong> (ou uma <strong>pasta de simulados</strong>) no topo da home, usando o <strong>fundo do próprio simulado/pasta</strong>. Escolha:</p>
              <select value={destSim.some((d) => d.href === link) ? link : ''}
                onChange={(e) => { const d = destSim.find((x) => x.href === e.target.value); setLink(e.target.value); if (d && !titulo.trim()) setTitulo(d.label) }}
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Selecione um simulado ou pasta…</option>
                {pastasDest.length > 0 && <optgroup label="Pastas (grupos de simulados)">{pastasDest.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup>}
                {simulados.length > 0 && <optgroup label="Simulados">{simulados.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup>}
              </select>
              {destSim.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum simulado ou pasta disponível ainda.</p>}
            </div>
          )}

          {/* PRÉVIA no topo — a imagem selecionada com, no modo simulado, o degradê + rótulo + título
              renderizados por cima (WYSIWYG, atualiza ao vivo conforme você configura). */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Imagem {tipo === 'popup' ? '(opcional)' : uiTipo === 'simulado' ? '(prévia — padrão: fundo do simulado)' : '(molde 1920×500 — largura total)'}</label>
            <div ref={previewRef} className={cn('relative w-full overflow-hidden rounded-lg border', tipo === 'popup' ? 'aspect-[16/6]' : 'aspect-[1920/500]')}>
              {uiTipo === 'simulado'
                // Prévia EXATA: mesmo componente do aluno, renderizado no tamanho real e ESCALADO.
                ? <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${previewScale})` }}><SimSlide s={previewSlide} stats={previewSlide.stats} /></div>
                : imagem
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={imagem} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${cor} 0%, #1a1030 75%, #0f0a1e 120%)` }} />}
              {imagem && (
                <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                  {tipo !== 'popup' && (
                    <button type="button" onClick={() => { setCropSrc(cropSrc || imagem); setCropOpen(true) }} title="Ajustar recorte"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><Crop className="h-3.5 w-3.5" /></button>
                  )}
                  <button type="button" onClick={() => setImagem('')} title="Remover imagem"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input value={imagem.startsWith('data:') ? '' : imagem} onChange={(e) => setImagem(e.target.value)} placeholder="Cole uma URL ou envie um arquivo →" className="flex-1" />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onArquivo(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} title="Enviar imagem"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </button>
            </div>
            {cropOpen && cropSrc && <BannerCropper src={cropSrc} onApply={(d) => { setImagem(d); setCropOpen(false) }} onCancel={() => setCropOpen(false)} />}
          </div>

          {/* Controles em 2 colunas: Conteúdo | Opções do slide. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Coluna 1 — Conteúdo */}
            <div className="space-y-3">
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Título</label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Novo simulado disponível!" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Mensagem</label>
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} placeholder="Texto do aviso…" className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className={cn('space-y-1', uiTipo === 'simulado' && 'hidden')}>
                <label className="text-xs text-muted-foreground">Link ao clicar (opcional)</label>
                {destinos && destinos.length > 0 && (
                  <select value={destinos.some((d) => d.href === link) ? link : ''} onChange={(e) => e.target.value && setLink(e.target.value)}
                    className="mb-1.5 h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Destino rápido (pasta, simulado…) — ou digite abaixo</option>
                    {['Pastas', 'Simulados'].map((grp) => {
                      const opts = destinos.filter((d) => (d.grupo ?? 'Simulados') === grp)
                      return opts.length ? <optgroup key={grp} label={grp}>{opts.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup> : null
                    })}
                  </select>
                )}
                <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/aluno ou https://…" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2.5">
                <div className="flex items-center gap-2"><label className="text-xs text-muted-foreground">Cor de destaque</label><input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /></div>
                <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Ativo</span><Switch checked={ativo} onCheckedChange={setAtivo} /></div>
              </div>
            </div>

            {/* Coluna 2 — Opções do slide de simulado (refletem na prévia acima). */}
            <div className="space-y-3">
              {uiTipo === 'simulado' ? (
                <>
                  {/* Rótulo "Em destaque para você" (por banner). */}
                  <div className="space-y-1.5 rounded-lg border bg-background px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <Switch checked={destaqueAtivo} onCheckedChange={setDestaqueAtivo} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Rótulo em destaque (acima do título)</p>
                        <p className="text-[11px] text-muted-foreground">A tarja verde “Em destaque para você”. Desligue para ocultá-la.</p>
                      </div>
                    </div>
                    {destaqueAtivo && <Input value={destaqueTexto} onChange={(e) => setDestaqueTexto(e.target.value)} placeholder="Em destaque para você" className="h-8 text-xs" />}
                  </div>
                  {/* Degradê escuro sobre a imagem: liga/desliga + intensidade (0–150; 100 = padrão). */}
                  <div className="space-y-1.5 rounded-lg border bg-background px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <Switch checked={fadeAtivo} onCheckedChange={setFadeAtivo} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Degradê sobre a imagem</p>
                        <p className="text-[11px] text-muted-foreground">Escurecimento à esquerda que dá legibilidade ao texto.</p>
                      </div>
                    </div>
                    {fadeAtivo && (
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="w-10 shrink-0">Fade</span>
                        <input type="range" min={0} max={150} step={5} value={fadeNivel} onChange={(e) => setFadeNivel(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-primary" />
                        <span className="w-8 shrink-0 text-right tabular-nums">{fadeNivel}%</span>
                      </label>
                    )}
                  </div>
                  {/* Toggle GERAL (vale para todos os banners de simulado). */}
                  {onToggleDesempenho && (
                    <div className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5">
                      <Switch checked={!!desempenho} onCheckedChange={onToggleDesempenho} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Mostrar desempenho do aluno no banner</p>
                        <p className="text-[11px] text-muted-foreground">Painel com Simulados/Nota média/Melhor nota no canto inferior direito. Vale para <strong>todos</strong> os banners de simulado. Desativado por padrão.</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-2.5 text-[11px] text-muted-foreground">As opções de rótulo, degradê e desempenho valem só para banners do tipo <strong>Simulado</strong>.</p>
              )}
            </div>
          </div>

          {/* Tipo do aviso — compacto, no rodapé (troca o modo sem roubar espaço da prévia). */}
          <div className="space-y-1 border-t pt-3">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo do aviso</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { t: 'banner', label: 'Banner', Icon: Megaphone },
                { t: 'popup', label: 'Pop-up', Icon: MessageSquareWarning },
                { t: 'hero', label: 'Destaque', Icon: ImageIcon },
                { t: 'simulado', label: 'Simulado', Icon: Clapperboard },
              ] as const).map(({ t, label, Icon }) => (
                <button key={t} type="button" onClick={() => setUiTipo(t)}
                  className={cn('flex items-center justify-center gap-1.5 rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition', uiTipo === t ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
