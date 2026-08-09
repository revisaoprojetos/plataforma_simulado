'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HexColorField } from '@/components/admin/hex-color-field'
import { Search, RotateCcw, ChevronDown, Copy, ClipboardPaste, Loader2, Save, Sparkles, Palette, Layers } from 'lucide-react'
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

export function BancoHudDesigner({ bancoId, titulo, baseInicial, porPaginaInicial, cor = '#6d28d9' }: {
  bancoId: string; titulo: string; baseInicial: Partial<HudCores>; porPaginaInicial: HudPorPagina; cor?: string
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
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Cabeçalho + salvar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
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

      <div className="grid min-h-[560px] grid-cols-[168px_minmax(0,1fr)_290px]">
        {/* PÁGINAS */}
        <div className="space-y-1 overflow-auto border-r p-2">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Páginas</p>
          {ABAS.map((s) => (
            <button key={s.key} onClick={() => setAba(s.key)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors', aba === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
              <s.icon className="h-4 w-4 shrink-0" /><span className="truncate">{s.label}</span>
            </button>
          ))}
          <p className="px-2 pt-2 text-[10px] leading-snug text-muted-foreground">“Base” vale p/ todas as páginas. As outras sobrescrevem só a sua.</p>
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
              {aba === 'loading' && <ProvaLoading compact loop mensagem="Carregando simulado..." tipo={c.loadingTipo as EstiloProvaLoading} />}
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
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Temas prontos</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS_HUD.map((p) => (
                  <button key={p.nome} onClick={() => setBase({ ...p.cores })} title={`Aplicar tema ${p.nome}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] hover:border-primary/50 hover:bg-muted/50">
                    <span className="flex"><span className="h-3 w-3 rounded-l-full" style={{ background: p.prim }} /><span className="h-3 w-3 rounded-r-full" style={{ background: p.sec }} /></span>
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
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

          {/* Grupos de campos */}
          <div className="flex-1 overflow-auto">
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
