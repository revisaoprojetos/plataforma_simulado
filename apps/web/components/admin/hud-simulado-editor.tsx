'use client'

import { useState } from 'react'
import { HexColorField } from '@/components/admin/hex-color-field'
import { ArrowLeft, RotateCcw, ChevronDown, Copy, ClipboardPaste } from 'lucide-react'
import { type HudCores, type HudPorPagina, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { ProvaHud } from '@/components/prova/prova-hud'
import { ProvaIntro, ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { ProvaLoginPreview, ProvaEncerradaPreview } from '@/components/prova/prova-previews'
import { LoginResultado, type LoginResultadoTipo } from '@/components/prova/login-popups'
import { cn } from '@/lib/utils'
import { SCREENS, GRUPOS, STATUS_POR_TAB, DEMO_Q, DEMO_IMG, type ScreenKey } from '@/lib/hud/campos'


const Swatch = HexColorField

export function HudSimuladoEditor({ base, porPagina, onChangePorPagina, onVoltar, titulo = 'Simulado', branding }: {
  base: HudCores; porPagina: HudPorPagina; onChangePorPagina: (p: HudPorPagina) => void; onVoltar: () => void; titulo?: string
  branding?: { nome?: string; logoUrl?: string | null; logoGrandeUrl?: string | null; logoBg?: string; logoEstilo?: string } | null
}) {
  const [verAcabando, setVerAcabando] = useState(false)
  const [verLoginTab, setVerLoginTab] = useState<'form' | LoginResultadoTipo>('form')
  const [verLiberado, setVerLiberado] = useState(true)
  const [verScreen, setVerScreen] = useState<ScreenKey>('prova')
  const [verImagem, setVerImagem] = useState(false) // prévia da prova com/sem card de imagem
  const [copiada, setCopiada] = useState<string | null>(null)
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})
  // Cores efetivas da página atual (base do caderno + override da página).
  const c = efetivarHud(base, porPagina, verScreen)
  const set = (k: keyof HudCores, v: string) => onChangePorPagina({ ...porPagina, [verScreen]: { ...(porPagina[verScreen] ?? {}), [k]: v } })
  const toggleGrupo = (t: string) => setColapsados((p) => ({ ...p, [t]: !p[t] }))
  const noop = () => {}

  // HUD de prova (demo) — usado na tela "Prova" e ao fundo do pop-up de entrada.
  const demoHud = (
    <ProvaHud
      compact
      titulo={titulo}
      logoUrl={branding?.logoUrl ?? null}
      logoBg={branding?.logoBg}
      logoEstilo={branding?.logoEstilo}
      tempoLabel={verAcabando ? '04:12' : '45:00'}
      timerWarning={verAcabando}
      salvando={false}
      questaoIndex={1}
      totalQuestoes={5}
      totalRespondidas={1}
      progresso={20}
      questaoAtual={verImagem ? { ...DEMO_Q, imagem_url: DEMO_IMG } : DEMO_Q}
      respostaId="b"
      eliminadas={['c']}
      onToggleEliminar={noop}
      respondidas={[true, false, false, false, false]}
      marcadas={[false, true, true, false, false]}
      marcadaAtual={true}
      numMarcadas={2}
      anuladas={[false, false, false, true, false]}
      altTrocadas={[false, false, false, false, true]}
      mostrarTempo
      onToggleTempo={noop}
      onToggleMarcar={noop}
      onResponder={noop}
      onPrev={noop}
      onNext={noop}
      onRevisar={noop}
      onGoto={noop}
    />
  )
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* BARRA DE PÁGINAS DO SIMULADO (esquerda) */}
      <div className="w-[190px] shrink-0 space-y-1 overflow-auto border-r p-2">
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Páginas do simulado</p>
        {SCREENS.map((s) => {
          const ativo = verScreen === s.key
          return (
            <button key={s.key} onClick={() => setVerScreen(s.key)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors', ativo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
              <s.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* PRÉVIA — os MESMOS componentes das telas reais, só recoloridos */}
      <div className="flex-1 overflow-auto bg-muted/30 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={onVoltar} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Voltar aos blocos
            </button>
            {(verScreen === 'prova' || verScreen === 'entrada') && (
              <div className="inline-flex overflow-hidden rounded-md border text-xs">
                <button onClick={() => setVerAcabando(false)} className={`px-2.5 py-1 ${!verAcabando ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Tempo normal</button>
                <button onClick={() => setVerAcabando(true)} className={`px-2.5 py-1 ${verAcabando ? (verScreen === 'entrada' ? 'bg-amber-500 text-white' : 'bg-destructive text-white') : 'bg-background text-muted-foreground hover:text-foreground'}`}>{verScreen === 'entrada' ? 'Atraso' : 'Acabando'}</button>
              </div>
            )}
            {verScreen === 'login' && (
              <div className="inline-flex overflow-hidden rounded-md border text-xs">
                {([['form', 'Formulário'], ['sucesso', 'Sucesso'], ['email_invalido', 'E-mail inválido'], ['nao_iniciado', 'Não iniciado'], ['encerrado', 'Encerrado']] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setVerLoginTab(k)}
                    className={`px-2.5 py-1 ${verLoginTab === k ? (k === 'email_invalido' || k === 'encerrado' ? 'bg-destructive text-white' : k === 'nao_iniciado' ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground') : 'bg-background text-muted-foreground hover:text-foreground'}`}>{lbl}</button>
                ))}
              </div>
            )}
            {verScreen === 'encerrada' && (
              <div className="inline-flex overflow-hidden rounded-md border text-xs">
                <button onClick={() => setVerLiberado(true)} className={`px-2.5 py-1 ${verLiberado ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Gabarito liberado</button>
                <button onClick={() => setVerLiberado(false)} className={`px-2.5 py-1 ${!verLiberado ? 'bg-amber-500 text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Não liberado</button>
              </div>
            )}
            {verScreen === 'prova' && (
              <div className="inline-flex overflow-hidden rounded-md border text-xs" title="Prévia da questão com/sem o card de imagem">
                <button onClick={() => setVerImagem(false)} className={`px-2.5 py-1 ${!verImagem ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Sem imagem</button>
                <button onClick={() => setVerImagem(true)} className={`px-2.5 py-1 ${verImagem ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Com imagem</button>
              </div>
            )}
          </div>
          <div className="h-[600px] overflow-auto rounded-xl border shadow-sm" style={hudCssVars(c) as React.CSSProperties}>
            {verScreen === 'loading' && <ProvaLoading compact loop mensagem="Carregando simulado..." tipo={c.loadingTipo as EstiloProvaLoading} logoUrl={branding?.logoUrl ?? null} logoBg={branding?.logoBg} logoEstilo={branding?.logoEstilo} />}
            {verScreen === 'login' && (
              <div className="relative h-full">
                <ProvaLoginPreview compact branding={branding} titulo={titulo} status={STATUS_POR_TAB[verLoginTab]} />
                {verLoginTab !== 'form' && (
                  <LoginResultado overlay compact tipo={verLoginTab} nome="Nome do Aluno" quando="01/07/2026 08:00"
                    plataforma={(branding?.nome ?? 'Revisão').replace(/^plataforma\s+/i, '')}
                    contato={{ whatsapp: '+55 65 9648-6736' }} onVoltar={noop} />
                )}
              </div>
            )}
            {verScreen === 'entrada' && (
              <div className="relative h-full overflow-hidden">
                {/* Fundo = página de PROVA já editada (não as cores da entrada) */}
                <div aria-hidden className="pointer-events-none absolute inset-0 select-none blur-[2px]" style={hudCssVars(efetivarHud(base, porPagina, 'prova')) as React.CSSProperties}>{demoHud}</div>
                <ProvaIntro compact overlay titulo={titulo} logoUrl={branding?.logoUrl ?? null} logoGrandeUrl={branding?.logoGrandeUrl ?? null} logoBg={branding?.logoBg} logoEstilo={branding?.logoEstilo}
                  atraso={verAcabando} inicioLabel="00:00" minAtraso={110}
                  tempoLabel={verAcabando ? '40h 09:23' : '45:00'} totalQuestoes={5} onIniciar={noop} />
              </div>
            )}
            {verScreen === 'encerrada' && (
              <ProvaEncerradaPreview compact branding={branding} titulo={titulo} liberado={verLiberado} />
            )}
            {verScreen === 'prova' && demoHud}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Prévia real da tela selecionada — só as cores mudam para casar com o caderno.</p>
        </div>
      </div>

      {/* SELETORES */}
      <div className="flex w-[290px] shrink-0 flex-col overflow-hidden border-l">
        <div className="sticky top-0 z-10 space-y-2 border-b bg-background px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Cores · {SCREENS.find((s) => s.key === verScreen)?.label}</h3>
            <p className="text-xs text-muted-foreground">Cada página tem cores próprias. Use copiar/colar para reaproveitar entre campos e páginas.</p>
          </div>
          {copiada && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-[11px]">
              <span className="h-4 w-4 rounded border" style={{ background: copiada }} />
              <span className="font-mono">{copiada}</span>
              <span className="text-muted-foreground">copiada</span>
              <button onClick={() => setCopiada(null)} className="ml-auto text-muted-foreground hover:text-foreground">limpar</button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {GRUPOS.filter((g) => g.pages === 'all' || g.pages.includes(verScreen)).map((g) => {
            const aberto = !colapsados[g.titulo]
            return (
              <div key={g.titulo} className="border-b">
                <button onClick={() => toggleGrupo(g.titulo)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.titulo}
                    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium normal-case tabular-nums text-muted-foreground/80">{g.campos.length}</span>
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
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">{f.label}</span>
                              <span className="block truncate text-[10px] leading-tight text-muted-foreground">{f.desc}</span>
                            </span>
                            <select value={c[f.k]} onChange={(e) => set(f.k, e.target.value)}
                              className="shrink-0 rounded-md border bg-background px-2 py-1 text-xs">
                              {f.select.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                            </select>
                          </>
                        ) : (
                          <>
                            <Swatch value={c[f.k]} onChange={(v) => set(f.k, v)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">{f.label}</span>
                              <span className="block truncate text-[10px] leading-tight text-muted-foreground">{f.desc}</span>
                            </span>
                            <button type="button" title="Copiar cor" onClick={() => setCopiada(c[f.k])}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title={copiada ? `Colar ${copiada}` : 'Copie uma cor primeiro'} disabled={!copiada} onClick={() => copiada && set(f.k, copiada)}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                              <ClipboardPaste className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="border-t p-3">
          <button onClick={() => onChangePorPagina({ ...porPagina, [verScreen]: {} })}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            <RotateCcw className="h-4 w-4" /> Resetar cores desta página
          </button>
        </div>
      </div>
    </div>
  )
}
