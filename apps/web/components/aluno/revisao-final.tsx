'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { usePdfDownloads } from '@/components/pdf-downloads-provider'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ReportarErroButton } from '@/components/aluno/reportar-erro-button'
import {
  CheckCircle2,
  XCircle,
  Circle,
  Home,
  Lock,
  FileText,
  FileStack,
  Trophy,
  RefreshCw,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { FitaTopo } from '@/components/prova/fita-topo'
import { ThemeToggle } from '@/components/prova/theme-toggle'
import { ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { efetivarHud, type HudCores, type HudPorPagina } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'

interface AltRev {
  id: string
  texto: string
  correta?: boolean
}
interface QuestaoRev {
  numero: number
  id: string
  tipo?: string
  enunciado: string
  resposta_aluno: string | null
  acertou: boolean | null
  anulada?: boolean
  alt_trocada?: boolean
  /** id da alternativa que era correta ANTES da alteração de gabarito */
  alt_correta_anterior?: string | null
  /** se o aluno havia acertado ANTES da alteração de gabarito */
  acertou_antes?: boolean | null
  /** justificativa/comentário da questão (exibida quando o gabarito é liberado) */
  justificativa?: string | null
  discursiva?: { texto: string; status: string; nota: number | null; feedback: string | null } | null
  alternativas: AltRev[]
}
interface StatDisciplina {
  disciplina: string
  acertos: number
  total: number
  percentual: number
}
interface Resultado {
  titulo: string
  nota: number | null
  acertos: number
  total: number
  marcadas: number
  em_branco: number
  tempo: string | null
  aluno_nome: string
  aluno_email: string
  iniciado_em: string | null
  finalizado_em: string | null
  estudante_id: string | null
  caderno_id: string | null
  modalidades?: { id: string; nome: string; semGab?: boolean; comGab?: boolean }[]
  posicao: number | null
  total_participantes: number
  stats_por_disciplina: StatDisciplina[]
  gabarito_liberado: boolean
  nota_liberada?: boolean
  caderno_liberado?: boolean
  questoes: QuestaoRev[]
}

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

// Botões da prova encerrada — a classe .hud-btn (globals.css) aplica cor normal + estado
// ATIVO (hover) lendo as variáveis locais --btn-* definidas abaixo (todas editáveis no HUD).
const BTN_CADERNO = 'hud-btn inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-medium'
// Cada botão aponta as variáveis locais para os tokens do HUD (normal + "-ativo").
const STYLE_CADERNO = {
  '--btn-bg': 'var(--prova-caderno-btn-fundo, var(--background))',
  '--btn-fg': 'var(--prova-caderno-btn, var(--foreground))',
  '--btn-bd': 'var(--prova-caderno-btn, var(--border))',
  '--btn-bg-ativo': 'var(--prova-caderno-btn-fundo-ativo, var(--prova-caderno-btn, var(--primary)))',
  '--btn-fg-ativo': 'var(--prova-caderno-btn-ativo, #fff)',
  '--btn-bd-ativo': 'var(--prova-caderno-btn-fundo-ativo, var(--prova-caderno-btn))',
} as React.CSSProperties
const STYLE_INICIO = {
  '--btn-bg': 'var(--prova-inicio-btn-fundo, var(--background))',
  '--btn-fg': 'var(--prova-inicio-btn, var(--foreground))',
  '--btn-bd': 'var(--prova-inicio-btn, var(--border))',
  '--btn-bg-ativo': 'var(--prova-inicio-btn-fundo-ativo, var(--prova-inicio-btn, var(--primary)))',
  '--btn-fg-ativo': 'var(--prova-inicio-btn-ativo, #fff)',
  '--btn-bd-ativo': 'var(--prova-inicio-btn-fundo-ativo, var(--prova-inicio-btn))',
} as React.CSSProperties
const STYLE_VOLTAR = {
  '--btn-bg': 'var(--prova-voltar-btn-fundo, var(--background))',
  '--btn-fg': 'var(--prova-voltar-btn, var(--foreground))',
  '--btn-bd': 'var(--prova-voltar-btn-fundo, var(--border))',
  '--btn-bg-ativo': 'var(--prova-voltar-btn-fundo-ativo, var(--prova-voltar-btn-fundo))',
  '--btn-fg-ativo': 'var(--prova-voltar-btn-ativo, var(--prova-voltar-btn, #fff))',
  '--btn-bd-ativo': 'var(--prova-voltar-btn-fundo-ativo, var(--prova-voltar-btn-fundo))',
} as React.CSSProperties

// Estilo da justificativa — segue a cor de acerto/erro do aluno (cores editáveis).
function justCor(acertou: boolean | null): string {
  return acertou === null ? 'var(--prova-branco, #6b7280)' : acertou ? 'var(--prova-acerto, #16a34a)' : 'var(--prova-erro, #dc2626)'
}
function justStyle(acertou: boolean | null): React.CSSProperties {
  const cor = justCor(acertou)
  return { borderColor: cor, background: `color-mix(in oklab, ${cor} 10%, var(--card))` }
}

export function RevisaoFinal({
  sessionToken,
  voltarUrl,
  inicioUrl,
  simuladosUrl,
  hudCores,
  hudPorPagina,
  branding,
  dark,
  onToggleDark,
}: {
  sessionToken: string
  voltarUrl: string
  /** Destino do botão "Voltar ao início do simulado" (reinício). Fallback: voltarUrl. */
  inicioUrl?: string
  /** Destino do botão "Meus simulados" (área do aluno). Fallback: voltarUrl. */
  simuladosUrl?: string
  hudCores?: Partial<HudCores>
  hudPorPagina?: HudPorPagina
  branding?: { logoUrl?: string | null; logoBg?: string; logoEstilo?: string } | null
  dark?: boolean
  onToggleDark?: () => void
}) {
  const urlInicio = inicioUrl ?? voltarUrl
  const urlSimulados = simuladosUrl ?? voltarUrl
  const [data, setData] = useState<Resultado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  // O acompanhamento/baixa fica no provider global (continua mesmo trocando de página).
  const { registrar } = usePdfDownloads()
  // Estado local só durante o POST de enfileiramento (evita clique-duplo no mesmo botão).
  const [gerandoPdf, setGerandoPdf] = useState<Set<string>>(new Set())
  const marcarPdf = (id: string, on: boolean) => setGerandoPdf((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  useEffect(() => {
    if (!sessionToken) {
      setErro(true)
      setCarregando(false)
      return
    }
    fetch(`/api/sessoes/resultado?st=${sessionToken}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.questoes)) setData(d)
        else setErro(true)
      })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false))
  }, [sessionToken])

  if (carregando) {
    // Tela de carregamento do caderno (mesma "página Carregamento" — estilo + cor).
    const cores = efetivarHud(hudCores, hudPorPagina, 'loading')
    return (
      <div style={hudCssVars(cores, dark) as React.CSSProperties}>
        <ProvaLoading
          mensagem="Carregando resultado do simulado..."
          tipo={cores.loadingTipo as EstiloProvaLoading}
          logoUrl={branding?.logoUrl ?? null}
          logoBg={branding?.logoBg}
          logoEstilo={branding?.logoEstilo}
        />
      </div>
    )
  }

  if (erro || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Sessão não encontrada</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta sessão do simulado não existe mais ou o link expirou. Acesse o simulado novamente para realizá-lo.
              </p>
            </div>
            <a href={voltarUrl} className={buttonVariants()}>
              <Home className="mr-2 h-4 w-4" />
              Voltar ao menu
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  const liberado = data?.gabarito_liberado ?? false      // gabarito: revela a alternativa correta
  const notaLiberada = data?.nota_liberada ?? false       // nota/desempenho: acertos, erros, média
  const cadernoLiberado = data?.caderno_liberado ?? false // downloads de caderno/gabarito em PDF
  const qs = data?.questoes ?? []
  // Acerto efetivo por questão: na alt. trocada, mantém o ponto quem marcou a correta ANTES ou DEPOIS.
  const acertoEfetivo = (q: QuestaoRev): boolean | null => {
    if (q.alt_trocada && liberado) {
      if (q.resposta_aluno == null) return null
      const novaId = q.alternativas.find((a) => a.correta === true)?.id ?? null
      return q.resposta_aluno === q.alt_correta_anterior || q.resposta_aluno === novaId
    }
    return q.acertou
  }
  const acertos = qs.filter((q) => acertoEfetivo(q) === true).length
  const erros = qs.filter((q) => acertoEfetivo(q) === false).length
  const pendentes = qs.filter((q) => acertoEfetivo(q) === null).length
  const respondidas = qs.filter((q) => q.resposta_aluno !== null).length
  const branco = qs.length - respondidas
  const media = qs.length > 0 ? Math.round((acertos / qs.length) * 100) : 0
  const numAnuladas = qs.filter((q) => q.anulada).length
  const numAlt = qs.filter((q) => q.alt_trocada).length
  // Cores do navegador — iguais às da prova (respondem às CSS vars do caderno).
  const COR_MARCADA = 'var(--prova-marcada, var(--primary))'
  const COR_ANUL = 'var(--prova-anulada, #6b7280)'
  const COR_ALT = 'var(--prova-alt, #0891b2)'
  const COR_ACERTO = 'var(--prova-acerto, #16a34a)'
  const COR_ERRO = 'var(--prova-erro, #dc2626)'
  const COR_BRANCO = 'var(--prova-branco, #6b7280)'
  const COR_MEDIA = 'var(--prova-media, #6d28d9)'
  // Card de resultado: fundo = versão clara da própria cor; ícone e número = a cor.
  const cardStat = (cor: string) => ({ borderColor: `color-mix(in oklab, ${cor} 30%, var(--border))`, background: `color-mix(in oklab, ${cor} 12%, var(--card))` })
  const fmtData = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
  const fmtHora = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
  const fmtDur = (a: string | null | undefined, bb: string | null | undefined) => {
    if (!a || !bb) return data?.tempo ?? '—'
    const seg = Math.max(0, Math.floor((new Date(bb).getTime() - new Date(a).getTime()) / 1000))
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60)
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`
  }
  // Downloads: gabarito (folha de respostas) e caderno completo.
  const urlGabarito = `/imprimir/resultado/${sessionToken}`
  const urlCompleto = data?.caderno_id
    ? `/imprimir/caderno/${data.caderno_id}?mod=caderno_completo&sessao=${sessionToken}${data.estudante_id ? `&aluno=${data.estudante_id}` : ''}`
    : urlGabarito
  // "Como você fez, sem gabarito": modalidades do caderno com as marcações do aluno,
  // sem revelar a correta (semgab=1). Sempre disponível — não depende do gabarito.
  const modalidades = data?.modalidades ?? []
  // Sem caderno vinculado → folha de respostas pública (por sessão).
  const urlComoFezFallback = `${urlGabarito}?sem=1`

  const acaoNav = (url: string) => ({ label: 'Abrir no navegador', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') })

  // Caderno "como você fez" (sem gabarito) de uma modalidade: abre a página de impressão
  // direto (síncrono, sem popup-blocker) — ela traz o botão "Imprimir / Salvar PDF".
  // Escopo de acesso é o id da sessão (mesma credencial de /imprimir/resultado).
  // Baixa o caderno "como você fez" (sem gabarito) como ARQUIVO PDF: a rota gera o PDF
  // no servidor (Edge headless) e devolve como attachment → o navegador baixa direto.
  // Fallback: se a geração falhar, abre a página de impressão para salvar manualmente.
  async function baixarComoFez(mod: string, nome: string, gab = false) {
    const key = `pdf:${mod}:${gab ? 'g' : 's'}`
    if (gerandoPdf.has(key)) return
    if (!data?.caderno_id) { window.open(`${urlComoFezFallback}&print=1`, '_blank', 'noopener,noreferrer'); return }
    const limpar = (s?: string) => (s ?? '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
    const arquivo = [data?.aluno_nome, data?.titulo, nome].map(limpar).filter(Boolean).join('_') || 'caderno'
    const qs = new URLSearchParams({ caderno: data.caderno_id, sessao: sessionToken, mod, nome: arquivo })
    if (data.estudante_id) qs.set('aluno', String(data.estudante_id))
    if (gab) qs.set('gabarito', '1')
    marcarPdf(key, true)
    toast.loading('Download iniciado — gerando PDF…', { id: key })
    try {
      const res = await fetch(`/api/aluno/caderno-pdf?${qs.toString()}`)
      if (!res.ok) throw new Error('falha')
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `${arquivo}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000)
      toast.success('Download concluído', { id: key, description: nome })
    } catch {
      toast.error('Não foi possível gerar o PDF. Abrindo para salvar…', { id: key })
      window.open(`/imprimir/caderno/${data.caderno_id}?mod=${mod}&sessao=${sessionToken}${data.estudante_id ? `&aluno=${data.estudante_id}` : ''}&${gab ? 'gabarito=1' : 'semgab=1'}&rawimg=1&print=1`, '_blank', 'noopener,noreferrer')
    } finally {
      marcarPdf(key, false)
    }
  }

  async function baixarPdf(qual: 'gabarito' | 'completo') {
    if (gerandoPdf.has(qual)) return // o outro botão pode rodar junto
    const fallbackUrl = qual === 'gabarito' ? urlGabarito : urlCompleto
    const nome = qual === 'gabarito' ? 'Gabarito' : 'Caderno completo'
    // Nome do arquivo: {estudante}_{simulado}_{caderno}.
    const limpar = (s?: string) => (s ?? '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
    const arquivo = [data?.aluno_nome, data?.titulo, nome].map(limpar).filter(Boolean).join('_')
    // Caderno completo sem caderno vinculado → não há o que gerar no servidor: abre o gabarito.
    if (qual === 'completo' && !data?.caderno_id) { window.open(urlCompleto, '_blank', 'noopener,noreferrer'); return }
    const payload = qual === 'gabarito'
      ? { sessaoToken: sessionToken, tipo: 'resultado' as const, titulo: 'Gabarito' }
      : { sessaoToken: sessionToken, tipo: 'caderno' as const, cadernoId: data?.caderno_id, mod: 'caderno_completo', titulo: 'Caderno completo' }
    marcarPdf(qual, true)
    try {
      const res = await fetch('/api/pdf/publico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json()
      if (!res.ok || !d.jobId) { toast.error('Servidor de PDF indisponível.', { action: acaoNav(fallbackUrl) }); return }
      // Entrega ao provider global → baixa quando pronto, mesmo que você saia da página.
      registrar({ id: d.jobId, nome, arquivo, statusUrl: `/api/pdf/publico/${d.jobId}?sessao=${sessionToken}` })
    } catch { toast.error('Erro de rede ao iniciar a geração.', { action: acaoNav(fallbackUrl) }) }
    finally { marcarPdf(qual, false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Cabeçalho fixo — top bar com cor própria (HUD) */}
      <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ background: 'var(--prova-topbar, var(--background))', color: 'var(--prova-topbar-texto, var(--foreground))' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-semibold">Simulado finalizado</span>
          </div>
          <div className="flex items-center gap-1.5">
            {onToggleDark && <ThemeToggle dark={!!dark} onToggle={onToggleDark} />}
            <a href={urlInicio} className="hud-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium" style={STYLE_INICIO}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao início
            </a>
            <a href={urlSimulados} className="hud-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium" style={STYLE_VOLTAR}>
              <Home className="h-3.5 w-3.5" />
              Meus simulados
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Resumo — dados do aluno + tempos + marcadas/em branco + downloads */}
        <Card className="relative overflow-hidden">
          <FitaTopo />
          <CardContent className="space-y-5 p-6 sm:p-8">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-4 w-4" /> Simulado finalizado
              </div>
              <h1 className="text-2xl font-bold leading-tight">{data?.titulo ?? 'Simulado'}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{data?.aluno_nome ?? 'Estudante'}</span>
                {data?.aluno_email ? <> · {data.aluno_email}</> : null}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-5 sm:grid-cols-4">
              <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Data</p><p className="text-sm font-semibold">{fmtData(data?.iniciado_em)}</p></div>
              <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Início</p><p className="text-sm font-semibold">{fmtHora(data?.iniciado_em)}</p></div>
              <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Término</p><p className="text-sm font-semibold">{fmtHora(data?.finalizado_em)}</p></div>
              <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tempo utilizado</p><p className="text-sm font-semibold">{fmtDur(data?.iniciado_em, data?.finalizado_em)}</p></div>
            </div>

            {notaLiberada ? (
              // Nota liberada: acertadas / erradas / em branco / média (cores editáveis)
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border p-3 text-center" style={cardStat(COR_ACERTO)}>
                  <CheckCircle2 className="mx-auto mb-1 h-4 w-4" style={{ color: COR_ACERTO }} />
                  <p className="text-xl font-bold tabular-nums" style={{ color: COR_ACERTO }}>{acertos}</p>
                  <p className="text-[11px] text-muted-foreground">Acertadas</p>
                </div>
                <div className="rounded-xl border p-3 text-center" style={cardStat(COR_ERRO)}>
                  <XCircle className="mx-auto mb-1 h-4 w-4" style={{ color: COR_ERRO }} />
                  <p className="text-xl font-bold tabular-nums" style={{ color: COR_ERRO }}>{erros}</p>
                  <p className="text-[11px] text-muted-foreground">Erradas</p>
                </div>
                <div className="rounded-xl border p-3 text-center" style={cardStat(COR_BRANCO)}>
                  <FileText className="mx-auto mb-1 h-4 w-4" style={{ color: COR_BRANCO }} />
                  <p className="text-xl font-bold tabular-nums" style={{ color: COR_BRANCO }}>{branco}</p>
                  <p className="text-[11px] text-muted-foreground">Em branco</p>
                </div>
                <div className="rounded-xl border p-3 text-center" style={cardStat(COR_MEDIA)}>
                  <Trophy className="mx-auto mb-1 h-4 w-4" style={{ color: COR_MEDIA }} />
                  <p className="text-xl font-bold tabular-nums" style={{ color: COR_MEDIA }}>{media}%</p>
                  <p className="text-[11px] text-muted-foreground">Média</p>
                </div>
              </div>
            ) : (
              // Gabarito não liberado: marcadas / em branco
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border bg-muted/40 p-3 text-center">
                  <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <p className="text-xl font-bold tabular-nums">{data?.marcadas ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Marcadas</p>
                </div>
                <div className="rounded-xl border bg-muted/40 p-3 text-center">
                  <FileText className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <p className="text-xl font-bold tabular-nums">{data?.em_branco ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Em branco</p>
                </div>
              </div>
            )}

            {/* Como você fez (sem gabarito) — as opções padrão do caderno, sempre após terminar. */}
            {(() => {
              const semg = modalidades.filter((m) => m.semGab)
              return semg.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Como você fez</p>
                  <div className={cn('grid gap-2', semg.length >= 3 ? 'sm:grid-cols-3' : semg.length === 2 && 'sm:grid-cols-2')}>
                    {semg.map((m) => (
                      <button key={m.id} type="button" onClick={() => baixarComoFez(m.id, m.nome)} disabled={gerandoPdf.has(`pdf:${m.id}:s`)}
                        className={cn(BTN_CADERNO, 'h-11 w-full')} style={STYLE_CADERNO}>
                        {gerandoPdf.has(`pdf:${m.id}:s`) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileStack className="mr-1.5 h-4 w-4" />} {m.nome}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <a href={urlComoFezFallback} target="_blank" rel="noopener noreferrer" className={cn(BTN_CADERNO, 'h-11 w-full')} style={STYLE_CADERNO}>
                  <FileStack className="mr-1.5 h-4 w-4" /> Baixar caderno (como você fez)
                </a>
              )
            })()}

            {/* Com gabarito — aparece embaixo quando o gabarito já está liberado ao terminar. */}
            {liberado && modalidades.some((m) => m.comGab) && (
              <div className="space-y-1.5 rounded-xl border border-primary/25 bg-primary/[0.04] p-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Com gabarito</p>
                <div className={cn('grid gap-2', modalidades.filter((m) => m.comGab).length >= 3 ? 'sm:grid-cols-3' : modalidades.filter((m) => m.comGab).length === 2 && 'sm:grid-cols-2')}>
                  {modalidades.filter((m) => m.comGab).map((m) => (
                    <button key={m.id} type="button" onClick={() => baixarComoFez(m.id, m.nome, true)} disabled={gerandoPdf.has(`pdf:${m.id}:g`)}
                      className={cn(BTN_CADERNO, 'h-11 w-full')} style={STYLE_CADERNO}>
                      {gerandoPdf.has(`pdf:${m.id}:g`) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} {m.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Desempenho por matéria */}
        {liberado && (data?.stats_por_disciplina?.length ?? 0) > 0 && (
          <Card className="relative overflow-hidden">
            <FitaTopo />
            <CardContent className="space-y-3 p-5 pt-6">
              <h2 className="text-sm font-semibold">Desempenho por matéria</h2>
              {data!.stats_por_disciplina.map((s) => (
                <div key={s.disciplina} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.disciplina}</span>
                    <span className="text-muted-foreground">{s.acertos}/{s.total} · {s.percentual}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', s.percentual >= 70 ? 'bg-green-500' : s.percentual >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${s.percentual}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Grid: revisão à esquerda + navegador fixo à direita (mesmo modo da prova) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_14rem] lg:gap-10">
          {/* Coluna: revisão das questões */}
          <div className="space-y-3">
            {(data?.questoes ?? []).map((q) => {
              // Regra da alternativa trocada: mantém o ponto se marcou a correta ANTES ou DEPOIS da alteração;
              // só perde o ponto quem marcou uma que não era nem a anterior nem a nova correta.
              const novaCorretaId = q.alternativas.find((a) => a.correta === true)?.id ?? null
              const manteve = !!q.alt_trocada && liberado && q.resposta_aluno != null &&
                (q.resposta_aluno === q.alt_correta_anterior || q.resposta_aluno === novaCorretaId)
              const acertouEff = q.alt_trocada && liberado
                ? (q.resposta_aluno == null ? null : manteve)
                : q.acertou
              const status = !liberado || acertouEff === null ? 'pendente' : acertouEff ? 'acertou' : 'errou'
              return (
                <Card key={q.id} id={`q-${q.numero}`} className="relative overflow-hidden scroll-mt-20">
                  <FitaTopo />
                  <CardContent className="space-y-3 p-4 pt-5">
                  {/* cabeçalho da questão */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2 text-sm font-semibold">
                      {q.numero}
                    </span>
                    {q.anulada && (
                      <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: COR_ANUL }}>Anulada</span>
                    )}
                    {status === 'acertou' && (
                      <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `color-mix(in oklab, ${COR_ACERTO} 15%, var(--card))`, color: COR_ACERTO }}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acertou
                      </span>
                    )}
                    {status === 'errou' && (
                      <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `color-mix(in oklab, ${COR_ERRO} 15%, var(--card))`, color: COR_ERRO }}>
                        <XCircle className="h-3.5 w-3.5" /> Errou
                      </span>
                    )}
                    {status === 'pendente' && (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <Circle className="h-3.5 w-3.5" /> Respondida
                      </span>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed">{q.enunciado}</p>

                  {/* Gabarito alterado após a resposta — texto neutro, sem "perdeu ponto" */}
                  {liberado && q.alt_trocada && (() => {
                    const idxDe = (id?: string | null) => q.alternativas.findIndex((a) => a.id === id)
                    const L = (i: number) => (i >= 0 ? (LETRA[i] ?? i + 1) : '—')
                    const marc = idxDe(q.resposta_aluno)
                    const antes = idxDe(q.alt_correta_anterior)
                    const depois = q.alternativas.findIndex((a) => a.correta === true)
                    const marcouAntes = marc >= 0 && marc === antes
                    const marcouDepois = marc >= 0 && marc === depois
                    return (
                      <div className="rounded-md border p-3 text-xs" style={{ borderColor: COR_ALT, background: `color-mix(in oklab, ${COR_ALT} 10%, var(--card))` }}>
                        <p className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: COR_ALT }}>
                          <RefreshCw className="h-3.5 w-3.5" /> Esta questão teve a alternativa correta alterada
                        </p>
                        <p className="leading-relaxed">
                          A alternativa correta mudou de <strong>{L(antes)}</strong> para <strong>{L(depois)}</strong>.{' '}
                          {q.resposta_aluno == null
                            ? 'Você deixou esta questão em branco.'
                            : marcouAntes
                              ? <>Você marcou <strong>{L(marc)}</strong>, que era a correta antes da alteração — seu ponto está garantido.</>
                              : marcouDepois
                                ? <>Você marcou <strong>{L(marc)}</strong>, a nova alternativa correta — seu acerto será contabilizado.</>
                                : <>Você marcou <strong>{L(marc)}</strong>.</>}
                        </p>
                      </div>
                    )
                  })()}

                  {/* discursiva: resposta escrita + correção */}
                  {q.tipo === 'discursiva' ? (
                    <div className="space-y-2">
                      {q.discursiva?.status === 'corrigida' ? (
                        <div className="flex items-center gap-2 rounded-md bg-green-50 p-2.5 text-sm dark:bg-green-900/20">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-green-700 dark:text-green-400">Corrigida — nota {Number(q.discursiva.nota ?? 0).toFixed(1)}</span>
                        </div>
                      ) : (
                        <div className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                          Resposta enviada — aguardando correção por um avaliador.
                        </div>
                      )}
                      <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        {q.discursiva?.texto || '(resposta em branco)'}
                      </div>
                      {q.discursiva?.feedback && (
                        <div className="rounded-md border bg-primary/5 p-3 text-sm">
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">Feedback do corretor</p>
                          {q.discursiva.feedback}
                        </div>
                      )}
                    </div>
                  ) : (
                  /* alternativas */
                  <div className="space-y-2">
                    {q.alternativas.map((alt, i) => {
                      const marcada = q.resposta_aluno === alt.id
                      const correta = liberado && alt.correta === true
                      // Se manteve o ponto (alt. trocada), a marcada não é considerada errada.
                      const erradaMarcada = liberado && marcada && alt.correta === false && !manteve
                      // Alternativa que era correta ANTES da alteração de gabarito (destacada em separado).
                      const antesCorreta = liberado && !!q.alt_trocada && alt.id === q.alt_correta_anterior && !correta
                      const boxStyle: React.CSSProperties | undefined =
                        correta ? { borderColor: COR_ACERTO, background: `color-mix(in oklab, ${COR_ACERTO} 10%, var(--card))` }
                        : erradaMarcada ? { borderColor: COR_ERRO, background: `color-mix(in oklab, ${COR_ERRO} 10%, var(--card))` }
                        : antesCorreta ? { borderColor: COR_ALT, background: `color-mix(in oklab, ${COR_ALT} 8%, var(--card))` }
                        : undefined
                      const letraStyle: React.CSSProperties | undefined =
                        correta ? { borderColor: COR_ACERTO, background: COR_ACERTO, color: '#fff' }
                        : erradaMarcada ? { borderColor: COR_ERRO, background: COR_ERRO, color: '#fff' }
                        : antesCorreta ? { borderColor: COR_ALT, color: COR_ALT }
                        : undefined
                      return (
                        <div
                          key={alt.id}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border p-3 text-sm',
                            !correta && !erradaMarcada && !antesCorreta && marcada && 'border-primary bg-primary/5',
                          )}
                          style={boxStyle}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                              !correta && !erradaMarcada && !antesCorreta && 'border-muted-foreground/30 text-muted-foreground',
                            )}
                            style={letraStyle}
                          >
                            {LETRA[i] ?? i + 1}
                          </span>
                          <span className="flex-1">{alt.texto}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {marcada && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Sua resposta
                              </span>
                            )}
                            {antesCorreta && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: COR_ALT }}>
                                Correta antes
                              </span>
                            )}
                            {correta && <CheckCircle2 className="h-4 w-4" style={{ color: COR_ACERTO }} />}
                            {erradaMarcada && <XCircle className="h-4 w-4" style={{ color: COR_ERRO }} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )}

                  {/* Justificativa — só com gabarito liberado; cor segue acerto/erro do aluno */}
                  {liberado && q.tipo !== 'discursiva' && q.justificativa && (
                    <div className="rounded-md border p-3 text-sm" style={justStyle(acertouEff)}>
                      <p className="mb-1 text-xs font-semibold" style={{ color: justCor(acertouEff) }}>Justificativa</p>
                      <p className="whitespace-pre-wrap leading-relaxed">{q.justificativa}</p>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <ReportarErroButton sessaoId={sessionToken} questaoId={q.id} />
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>

          {/* Navegador de questões — card lateral direito (mesmo modo da prova) */}
          <aside>
            <Card className="relative overflow-hidden pb-2 pt-3 lg:sticky lg:top-20">
              <FitaTopo />
              <CardContent className="px-4 pb-0 pt-0">
                <p className="text-center text-sm font-semibold">Navegador de questões</p>
                <div className="mt-2 mb-3 border-t" />
                <div className="grid max-h-[46vh] grid-cols-5 gap-1.5 overflow-y-auto px-1.5 py-1 [scrollbar-width:thin]">
                  {qs.map((q) => {
                    const respondida = q.resposta_aluno !== null
                    let st: React.CSSProperties | undefined
                    let cls = 'bg-muted text-muted-foreground hover:bg-muted/80'
                    if (q.anulada) { cls = 'text-white'; st = { background: COR_ANUL, textDecoration: 'line-through' } }
                    else if (q.alt_trocada) { cls = 'text-white'; st = { background: COR_ALT } }
                    else if (liberado && q.acertou === true) { cls = 'text-white'; st = { background: COR_ACERTO } }
                    else if (liberado && q.acertou === false) { cls = 'text-white'; st = { background: COR_ERRO } }
                    else if (respondida) { cls = 'text-white'; st = { background: COR_MARCADA } }
                    return (
                      <button
                        key={q.id}
                        onClick={() => document.getElementById(`q-${q.numero}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        title={`Questão ${q.numero}${q.anulada ? ' (anulada)' : q.alt_trocada ? ' (alternativa trocada)' : ''}`}
                        className={cn('flex aspect-square items-center justify-center rounded-md text-xs font-bold transition-colors', cls)}
                        style={st}
                      >
                        {q.numero}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                  {liberado ? (
                    <>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ACERTO }} /> Acertou ({acertos})</div>
                      {erros > 0 && <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ERRO }} /> Errou ({erros})</div>}
                      {pendentes > 0 && <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Sem resposta ({pendentes})</div>}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_MARCADA }} /> Respondidas ({respondidas})</div>
                      {branco > 0 && <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Em branco ({branco})</div>}
                    </>
                  )}
                  {numAnuladas > 0 && <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ANUL }} /> Anuladas ({numAnuladas})</div>}
                  {numAlt > 0 && <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ALT }} /> Alternativa trocada ({numAlt})</div>}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  )
}
