'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { HexColorField } from '@/components/admin/hex-color-field'
import { Search, RotateCcw, ChevronDown, Copy, ClipboardPaste, Loader2, Save, Sparkles, Palette, Layers, ArrowLeft, ImagePlus, Trash2 } from 'lucide-react'
import { redimensionarImagem } from '@/lib/imagem'
import { hospedarImagemQuestaoAction } from '@/app/admin/questoes/actions'
import { type HudCores, type HudPorPagina, HUD_CORES_PADRAO, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { ProvaHud } from '@/components/prova/prova-hud'
import { ProvaIntro, ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { ProvaLoginPreview, ProvaEncerradaPreview } from '@/components/prova/prova-previews'
import { LoginResultado, type LoginResultadoTipo } from '@/components/prova/login-popups'
import { SCREENS, GRUPOS, STATUS_POR_TAB, DEMO_Q, DEMO_IMG, type ScreenKey } from '@/lib/hud/campos'
import { derivarHud, PRESETS_HUD } from '@/lib/hud/derivar-paleta'
import { salvarHudBanco } from '@/app/admin/banco-questoes/actions'
import { cn } from '@/lib/utils'

type Aba = 'base' | ScreenKey
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function BancoHudDesigner({ bancoId, titulo, baseInicial, porPaginaInicial, cor = '#6d28d9', voltarHref }: {
  bancoId: string; titulo: string; baseInicial: Partial<HudCores>; porPaginaInicial: HudPorPagina; cor?: string; voltarHref?: string
}) {
  const [base, setBase] = useState<Partial<HudCores>>(baseInicial ?? {})
  const [porPagina, setPorPagina] = useState<HudPorPagina>(porPaginaInicial ?? {})
  const [aba, setAba] = useState<Aba>('base')
  const [busca, setBusca] = useState('')
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})
  const [copiada, setCopiada] = useState<string | null>(null)
  const [prim, setPrim] = useState(cor || '#6d28d9')
  const [sec, setSec] = useState('#f59e0b')
  const [salvando, iniciar] = useTransition()
  const [enviandoImg, setEnviandoImg] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  // Prévia interativa
  const [verAcabando, setVerAcabando] = useState(false)
  const [verLoginTab, setVerLoginTab] = useState<'form' | LoginResultadoTipo>('form')
  const [verLiberado, setVerLiberado] = useState(true)
  const [verImagem, setVerImagem] = useState(false)

  const telaPreview: ScreenKey = aba === 'base' ? 'prova' : aba
  const c = efetivarHud(base, porPagina, telaPreview)
  const baseEfetiva = useMemo(() => ({ ...HUD_CORES_PADRAO, ...base }), [base])
  const valorDe = (k: keyof HudCores) => (aba === 'base' ? baseEfetiva[k] : c[k])
  const noop = () => {}

  const set = (k: keyof HudCores, v: string) => {
    if (aba === 'base') setBase((b) => ({ ...b, [k]: v }))
    else setPorPagina((p) => ({ ...p, [aba]: { ...(p[aba] ?? {}), [k]: v } }))
  }
  const resetar = () => {
    if (aba === 'base') setBase({})
    else setPorPagina((p) => ({ ...p, [aba]: {} }))
  }
  const toggleGrupo = (t: string) => setColapsados((p) => ({ ...p, [t]: !p[t] }))

  const [alvoImg, setAlvoImg] = useState<'loadingLogoUrl' | 'bgImagemUrl'>('loadingLogoUrl')
  function abrirUpload(campo: 'loadingLogoUrl' | 'bgImagemUrl') { setAlvoImg(campo); imgRef.current?.click() }
  async function enviarImagem(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setEnviandoImg(true)
    try {
      const dataUri = await redimensionarImagem(file, alvoImg === 'bgImagemUrl' ? 1600 : 900)
      const r = await hospedarImagemQuestaoAction(dataUri)
      if (!r.ok || !r.url) { toast.error(r.error ?? 'Falha ao enviar a imagem.'); return }
      set(alvoImg, r.url)
    } catch {
      toast.error('Falha ao processar a imagem.')
    } finally {
      setEnviandoImg(false)
      if (imgRef.current) imgRef.current.value = ''
    }
  }

  const gruposVisiveis = (aba === 'base' ? GRUPOS : GRUPOS.filter((g) => g.pages === 'all' || g.pages.includes(aba)))
    .map((g) => ({ ...g, campos: busca ? g.campos.filter((f) => norm(f.label + ' ' + f.desc).includes(norm(busca))) : g.campos }))
    .filter((g) => g.campos.length)

  const salvar = () => iniciar(async () => {
    const r = await salvarHudBanco(bancoId, { hudCores: base, hudPorPagina: porPagina })
    if (r.ok) toast.success('HUD do simulado salvo'); else toast.error(r.error ?? 'Erro ao salvar')
  })

  const demoHud = (
    <ProvaHud compact titulo={titulo} tempoLabel={verAcabando ? '04:12' : '45:00'} timerWarning={verAcabando} salvando={false}
      questaoIndex={1} totalQuestoes={5} totalRespondidas={1} progresso={20}
      questaoAtual={verImagem ? { ...DEMO_Q, imagem_url: DEMO_IMG } : DEMO_Q} respostaId="b" eliminadas={['c']} onToggleEliminar={noop}
      respondidas={[true, false, false, false, false]} marcadas={[false, true, true, false, false]} marcadaAtual={true} numMarcadas={2}
      anuladas={[false, false, false, true, false]} altTrocadas={[false, false, false, false, true]}
      mostrarTempo onToggleTempo={noop} onToggleMarcar={noop} onResponder={noop} onPrev={noop} onNext={noop} onRevisar={noop} onGoto={noop} />
  )

  const ABAS: { key: Aba; label: string; icon: typeof Layers }[] = [{ key: 'base', label: 'Base (todas)', icon: Layers }, ...SCREENS.map((s) => ({ key: s.key as Aba, label: s.label, icon: s.icon }))]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Cabeçalho + salvar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
          {voltarHref && (
            <Link href={voltarHref} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          )}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><Palette className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">HUD do simulado</h3>
            <p className="text-xs text-muted-foreground">Tema de cores da prova do aluno — vale p/ os simulados deste banco</p>
          </div>
        </div>
        <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar HUD
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[168px_minmax(0,1fr)_290px]">
        {/* PÁGINAS */}
        <div className="flex flex-col overflow-auto border-r p-2">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Páginas</p>
          <div className="space-y-1">
            {ABAS.map((s) => (
              <button key={s.key} onClick={() => setAba(s.key)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors', aba === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
                <s.icon className="h-4 w-4 shrink-0" /><span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
          <p className="px-2 pt-2 text-[10px] leading-snug text-muted-foreground">“Base” vale p/ todas as páginas. As outras sobrescrevem só a sua.</p>

          {/* Temas prontos (abaixo das páginas) */}
          <div className="mt-4 border-t pt-3">
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Temas prontos</p>
            <div className="flex flex-col gap-1.5">
              {PRESETS_HUD.map((p) => (
                <button key={p.nome} onClick={() => setBase({ ...p.cores })} title={`Aplicar tema ${p.nome}`}
                  className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:border-primary/50 hover:bg-muted/50">
                  <span className="flex shrink-0"><span className="h-3.5 w-3.5 rounded-l-full" style={{ background: p.prim }} /><span className="h-3.5 w-3.5 rounded-r-full" style={{ background: p.sec }} /></span>
                  <span className="truncate">{p.nome}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PRÉVIA */}
        <div className="min-w-0 overflow-auto bg-muted/30 p-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              {(telaPreview === 'prova' || telaPreview === 'entrada') && (
                <div className="inline-flex overflow-hidden rounded-md border text-xs">
                  <button onClick={() => setVerAcabando(false)} className={`px-2.5 py-1 ${!verAcabando ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Tempo normal</button>
                  <button onClick={() => setVerAcabando(true)} className={`px-2.5 py-1 ${verAcabando ? 'bg-destructive text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}>{telaPreview === 'entrada' ? 'Atraso' : 'Acabando'}</button>
                </div>
              )}
              {aba === 'login' && (
                <div className="inline-flex overflow-hidden rounded-md border text-xs">
                  {([['form', 'Formulário'], ['sucesso', 'Sucesso'], ['email_invalido', 'E-mail inválido'], ['nao_iniciado', 'Não iniciado'], ['encerrado', 'Encerrado']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setVerLoginTab(k)} className={`px-2.5 py-1 ${verLoginTab === k ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>{lbl}</button>
                  ))}
                </div>
              )}
              {aba === 'encerrada' && (
                <div className="inline-flex overflow-hidden rounded-md border text-xs">
                  <button onClick={() => setVerLiberado(true)} className={`px-2.5 py-1 ${verLiberado ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Gabarito liberado</button>
                  <button onClick={() => setVerLiberado(false)} className={`px-2.5 py-1 ${!verLiberado ? 'bg-amber-500 text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Não liberado</button>
                </div>
              )}
              {telaPreview === 'prova' && (
                <div className="inline-flex overflow-hidden rounded-md border text-xs">
                  <button onClick={() => setVerImagem(false)} className={`px-2.5 py-1 ${!verImagem ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Sem imagem</button>
                  <button onClick={() => setVerImagem(true)} className={`px-2.5 py-1 ${verImagem ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Com imagem</button>
                </div>
              )}
            </div>
            <div className="h-[560px] overflow-auto rounded-xl border shadow-sm" style={hudCssVars(c) as React.CSSProperties}>
              {aba === 'loading' && <ProvaLoading compact loop mensagem="Carregando simulado..." tipo={c.loadingTipo as EstiloProvaLoading} logoUrl={c.loadingLogoUrl || undefined} />}
              {aba === 'login' && (
                <div className="relative h-full">
                  <ProvaLoginPreview compact branding={null} titulo={titulo} status={STATUS_POR_TAB[verLoginTab]} />
                  {verLoginTab !== 'form' && <LoginResultado overlay compact tipo={verLoginTab} nome="Nome do Aluno" quando="01/07/2026 08:00" plataforma="Revisão" contato={{ whatsapp: '+55 65 9648-6736' }} onVoltar={noop} />}
                </div>
              )}
              {aba === 'entrada' && (
                <div className="relative h-full overflow-hidden">
                  <div aria-hidden className="pointer-events-none absolute inset-0 select-none blur-[2px]" style={hudCssVars(efetivarHud(base, porPagina, 'prova')) as React.CSSProperties}>{demoHud}</div>
                  <ProvaIntro compact overlay titulo={titulo} atraso={verAcabando} inicioLabel="00:00" minAtraso={110} tempoLabel={verAcabando ? '40h 09:23' : '45:00'} totalQuestoes={5} onIniciar={noop} />
                </div>
              )}
              {aba === 'encerrada' && <ProvaEncerradaPreview compact branding={null} titulo={titulo} liberado={verLiberado} />}
              {(aba === 'base' || aba === 'prova') && demoHud}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Prévia real da tela — só as cores mudam. Editando: <strong>{ABAS.find((x) => x.key === aba)?.label}</strong></p>
          </div>
        </div>

        {/* CONTROLES */}
        <div className="flex min-w-0 flex-col overflow-hidden border-l">
          {/* Ferramentas de tema */}
          <div className="space-y-2 border-b p-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gerar paleta da marca</p>
              <div className="grid grid-cols-2 gap-2">
                <HexColorField value={prim} onChange={setPrim} />
                <HexColorField value={sec} onChange={setSec} />
              </div>
              <button onClick={() => setBase(derivarHud(prim, sec))} title="Recolorir tudo a partir destas cores"
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Sparkles className="h-3.5 w-3.5" /> Gerar paleta
              </button>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Cor primária + secundária → recolore a Base inteira automaticamente.</p>
            </div>
          </div>

          {/* Busca + cópia */}
          <div className="sticky top-0 z-10 space-y-2 border-b bg-background px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cor…" className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:border-primary" />
            </div>
            {copiada && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-[11px]">
                <span className="h-4 w-4 rounded border" style={{ background: copiada }} /><span className="font-mono">{copiada}</span>
                <button onClick={() => setCopiada(null)} className="ml-auto text-muted-foreground hover:text-foreground">limpar</button>
              </div>
            )}
          </div>

          {/* input de arquivo compartilhado (carregamento + fundo) */}
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => enviarImagem(e.target.files?.[0] ?? null)} />

          {/* Área rolável: edições de imagem + grupos de cores */}
          <div className="flex-1 overflow-auto">

          {/* Imagem da tela de carregamento (só na página Carregamento) */}
          {aba === 'loading' && !busca && (
            <div className="border-b p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Imagem do carregamento</p>
              {valorDe('loadingLogoUrl') ? (
                <div className="flex items-center gap-2">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={valorDe('loadingLogoUrl')} alt="" className="h-full w-full object-contain" />
                  </span>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <button onClick={() => abrirUpload('loadingLogoUrl')} disabled={enviandoImg} className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-60">
                      {enviandoImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Trocar
                    </button>
                    <button onClick={() => set('loadingLogoUrl', '')} className="inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" /> Remover
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => abrirUpload('loadingLogoUrl')} disabled={enviandoImg}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60">
                  {enviandoImg ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  <span className="text-xs font-medium">{enviandoImg ? 'Enviando…' : 'Importar imagem'}</span>
                </button>
              )}
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">Aparece no centro da animação de carregamento. Sem imagem, usa o logo do sistema.</p>
            </div>
          )}

          {/* Imagem de fundo da tela (todas as páginas) */}
          {!busca && (
            <div className="border-b p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Imagem de fundo{aba !== 'base' && <span className="ml-1 font-normal normal-case text-muted-foreground/70">· só nesta tela</span>}</p>
              {valorDe('bgImagemUrl') ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={valorDe('bgImagemUrl')} alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <button onClick={() => abrirUpload('bgImagemUrl')} disabled={enviandoImg} className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-60">
                        {enviandoImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Trocar
                      </button>
                      <button onClick={() => set('bgImagemUrl', '')} className="inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </div>
                  </div>
                  {/* Opacidade */}
                  <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Opacidade <span className="font-mono text-foreground">{valorDe('bgOpacidade') || '100'}%</span></label>
                  <input type="range" min={0} max={100} step={5} value={Number(valorDe('bgOpacidade') || '100')} onChange={(e) => set('bgOpacidade', e.target.value)} className="mt-1 w-full accent-primary" />
                  {/* Desfoque */}
                  <label className="mt-2 block text-[11px] font-medium text-muted-foreground">Desfoque <span className="font-mono text-foreground">{valorDe('bgDesfoque') || '0'}px</span></label>
                  <input type="range" min={0} max={20} step={1} value={Number(valorDe('bgDesfoque') || '0')} onChange={(e) => set('bgDesfoque', e.target.value)} className="mt-1 w-full accent-primary" />
                  {/* Ajuste */}
                  <label className="mt-2 block text-[11px] font-medium text-muted-foreground">Preenchimento</label>
                  <select value={valorDe('bgAjuste') || 'cover'} onChange={(e) => set('bgAjuste', e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
                    <option value="cover">Cobrir (preenche a tela)</option>
                    <option value="contain">Conter (mostra inteira)</option>
                    <option value="repeat">Repetir (padrão)</option>
                  </select>
                  {/* Posição */}
                  <label className="mt-2 block text-[11px] font-medium text-muted-foreground">Posição</label>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {([['left top', '↖'], ['center top', '↑'], ['right top', '↗'], ['left center', '←'], ['center', '•'], ['right center', '→'], ['left bottom', '↙'], ['center bottom', '↓'], ['right bottom', '↘']] as const).map(([v, ic]) => (
                      <button key={v} onClick={() => set('bgPosicao', v)} title={v}
                        className={cn('flex h-7 items-center justify-center rounded-md border text-sm transition-colors', (valorDe('bgPosicao') || 'center') === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50')}>
                        {ic}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button onClick={() => abrirUpload('bgImagemUrl')} disabled={enviandoImg}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60">
                  {enviandoImg ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  <span className="text-xs font-medium">{enviandoImg ? 'Enviando…' : 'Importar imagem de fundo'}</span>
                </button>
              )}
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{aba === 'base' ? 'Fundo padrão de todas as telas.' : 'Sobrescreve o fundo só nesta tela.'} Ajuste opacidade/desfoque acima.</p>
            </div>
          )}

          {/* Grupos de campos */}
            {gruposVisiveis.map((g) => {
              const aberto = !colapsados[g.titulo]
              return (
                <div key={g.titulo} className="border-b">
                  <button onClick={() => toggleGrupo(g.titulo)} className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/40">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.titulo}<span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium normal-case tabular-nums text-muted-foreground/80">{g.campos.length}</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !aberto && '-rotate-90')} />
                  </button>
                  {aberto && (
                    <div className="px-2 pb-2">
                      {g.desc && <p className="px-2 pb-1.5 pt-0.5 text-[10px] leading-tight text-muted-foreground">{g.desc}</p>}
                      {g.campos.map((f) => (
                        <div key={f.k} className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                          {f.select ? (
                            <>
                              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{f.label}</span><span className="block truncate text-[10px] leading-tight text-muted-foreground">{f.desc}</span></span>
                              <select value={valorDe(f.k)} onChange={(e) => set(f.k, e.target.value)} className="shrink-0 rounded-md border bg-background px-2 py-1 text-xs">
                                {f.select.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                              </select>
                            </>
                          ) : (
                            <>
                              <HexColorField value={valorDe(f.k)} onChange={(v) => set(f.k, v)} />
                              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{f.label}</span><span className="block truncate text-[10px] leading-tight text-muted-foreground">{f.desc}</span></span>
                              <button type="button" title="Copiar cor" onClick={() => setCopiada(valorDe(f.k))} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                              <button type="button" title={copiada ? `Colar ${copiada}` : 'Copie uma cor primeiro'} disabled={!copiada} onClick={() => copiada && set(f.k, copiada)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"><ClipboardPaste className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {!gruposVisiveis.length && <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma cor encontrada para “{busca}”.</p>}
          </div>

          <div className="border-t p-3">
            <button onClick={resetar} className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground">
              <RotateCcw className="h-4 w-4" /> {aba === 'base' ? 'Resetar a Base' : 'Resetar cores desta página'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
