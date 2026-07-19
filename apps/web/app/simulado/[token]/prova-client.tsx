'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, Loader2, Send, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type HudCores, type HudPorPagina, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { useDarkMode } from '@/lib/hud/use-dark'
import { ProvaHud } from '@/components/prova/prova-hud'
import { ProvaIntro, ProvaLoading, type EstiloProvaLoading } from '@/components/prova/prova-intro'
import { toast } from 'sonner'
import { RevisaoFinal } from '@/components/aluno/revisao-final'

// --- Types ---
interface Alternativa {
  id: string
  texto: string
  ordem: number
}

interface Questao {
  id: string
  enunciado: string
  alternativas: Alternativa[]
}

interface SessaoData {
  id: string
  questoes: Questao[]
  tempo_limite_min: number | null
  iniciado_em: string
  status: string
  respostas: Record<string, string> // questao_id -> alternativa_id
  hudCores?: Partial<HudCores> // cores do HUD do caderno vinculado (base)
  hudPorPagina?: HudPorPagina // cores próprias por página
  simuladoTitulo?: string
  branding?: { nome: string; logoUrl: string | null; logoGrandeUrl: string | null; logoBg: string; logoEstilo: string } | null
}

type ProvaStatus = 'loading' | 'em_andamento' | 'finalizada' | 'erro'

// --- Timer ---
function useTimer(iniciado_em: string, tempo_limite_min: number | null) {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null)

  useEffect(() => {
    if (!tempo_limite_min) return

    const calcRestante = () => {
      const inicio = new Date(iniciado_em).getTime()
      const agora = Date.now()
      const decorrido = Math.floor((agora - inicio) / 1000)
      const totalSeg = tempo_limite_min * 60
      return Math.max(0, totalSeg - decorrido)
    }

    setSegundosRestantes(calcRestante())

    const interval = setInterval(() => {
      const restante = calcRestante()
      setSegundosRestantes(restante)
      if (restante === 0) clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [iniciado_em, tempo_limite_min])

  return segundosRestantes
}

function formatTime(segundos: number) {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}


// --- Main Component ---
export function ProvaClient({ token, hudInicial, darkInicial = false }: {
  token: string
  hudInicial: { base: Partial<HudCores>; porPagina: HudPorPagina; branding?: { logoUrl?: string | null; logoBg?: string; logoEstilo?: string } | null }
  darkInicial?: boolean
}) {
  const searchParams = useSearchParams()
  const sessionToken = searchParams.get('st')
  const [dark, toggleDark] = useDarkMode(darkInicial)

  const [status, setStatus] = useState<ProvaStatus>('loading')
  const [sessao, setSessao] = useState<SessaoData | null>(null)
  const [questaoIndex, setQuestaoIndex] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set()) // questões marcadas p/ revisar depois
  const [mostrarTempo, setMostrarTempo] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [showRevisao, setShowRevisao] = useState(false)
  const [showConfirmacao, setShowConfirmacao] = useState(false)
  const [isFinalizando, setIsFinalizando] = useState(false)
  const [resultado, setResultado] = useState<{ nota: number; acertos: number; total: number } | null>(null)
  const [eliminadas, setEliminadas] = useState<Record<string, string[]>>({}) // tesoura: alternativas eliminadas por questão
  const [iniciado, setIniciado] = useState(false) // pop-up de entrada confirmado?
  // HUD do caderno já resolvido no servidor (vem por prop) — telas de carregamento já nascem temadas, sem flash.

  // Tesoura: carrega/salva as eliminações por sessão (localStorage — sobrevive a reload)
  useEffect(() => {
    if (!sessao?.id) return
    try { const raw = localStorage.getItem('elim_' + sessao.id); if (raw) setEliminadas(JSON.parse(raw)) } catch {}
  }, [sessao?.id])
  const toggleEliminar = useCallback((questaoId: string, altId: string) => {
    setEliminadas((prev) => {
      const cur = new Set(prev[questaoId] ?? [])
      if (cur.has(altId)) cur.delete(altId)
      else cur.add(altId)
      const next = { ...prev, [questaoId]: Array.from(cur) }
      try { if (sessao?.id) localStorage.setItem('elim_' + sessao.id, JSON.stringify(next)) } catch {}
      return next
    })
  }, [sessao?.id])

  // Retomar a sessão: restaura questão atual + marcações de revisar + se já entrou.
  // (As respostas vêm do servidor; o tempo continua por iniciado_em.)
  const [progHidratado, setProgHidratado] = useState(false)
  useEffect(() => {
    if (!sessao?.id) return
    try {
      const raw = localStorage.getItem('prog_' + sessao.id)
      if (raw) {
        const p = JSON.parse(raw) as { q?: number; marcadas?: string[]; iniciado?: boolean }
        if (typeof p.q === 'number' && sessao.questoes.length) {
          setQuestaoIndex(Math.max(0, Math.min(p.q, sessao.questoes.length - 1)))
        }
        if (Array.isArray(p.marcadas)) setMarcadas(new Set(p.marcadas))
        if (p.iniciado) setIniciado(true)
      }
    } catch {}
    // Já respondeu algo => já começou: pula a tela de entrada ao retomar.
    if (Object.keys(sessao.respostas ?? {}).length > 0) setIniciado(true)
    setProgHidratado(true)
  }, [sessao?.id])

  // Salva o progresso a cada mudança (só após restaurar, p/ não sobrescrever com o padrão).
  useEffect(() => {
    if (!progHidratado || !sessao?.id) return
    try {
      localStorage.setItem('prog_' + sessao.id, JSON.stringify({
        q: questaoIndex,
        marcadas: Array.from(marcadas),
        iniciado,
      }))
    } catch {}
  }, [progHidratado, sessao?.id, questaoIndex, marcadas, iniciado])

  // Fetch sessão
  useEffect(() => {
    if (!sessionToken) {
      setStatus('erro')
      return
    }

    async function loadSessao() {
      try {
        const res = await fetch(`/api/sessoes/current?token=${token}&st=${sessionToken}`)
        if (!res.ok) throw new Error('Sessão inválida')
        const data: SessaoData = await res.json()
        if (!data?.id) throw new Error('Sessão inválida')
        setSessao(data)
        // Mescla respostas do servidor com o backup local (que pode ter respostas
        // não salvas por queda de rede) e re-sincroniza as que faltam no servidor.
        const resp: Record<string, string> = { ...(data.respostas ?? {}) }
        if (data.status !== 'finalizada') {
          try {
            const raw = localStorage.getItem('resp_' + data.id)
            if (raw) {
              const local = JSON.parse(raw) as Record<string, string>
              for (const [qid, aid] of Object.entries(local)) {
                if (aid && resp[qid] !== aid) {
                  resp[qid] = aid
                  fetch('/api/sessoes/resposta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessao_id: data.id, questao_id: qid, alternativa_id: aid, session_token: sessionToken }),
                  }).catch(() => {})
                }
              }
            }
          } catch {}
          try { localStorage.setItem('resp_' + data.id, JSON.stringify(resp)) } catch {}
        }
        setRespostas(resp)
        setStatus(data.status === 'finalizada' ? 'finalizada' : 'em_andamento')
      } catch {
        // Sessão inexistente/expirada → mostra erro (sem dados fictícios).
        setStatus('erro')
      }
    }

    loadSessao()
  }, [token, sessionToken])

  const segundosRestantes = useTimer(
    sessao?.iniciado_em ?? new Date().toISOString(),
    sessao?.tempo_limite_min ?? null
  )

  // Pega mudanças no TEMPO LIMITE feitas durante a prova (ex.: admin muda 3h→5h) SEM recarregar:
  // consulta um endpoint leve ao trocar de questão e a cada 30s; atualiza o cronômetro se mudou.
  useEffect(() => {
    if (!sessionToken || status !== 'em_andamento') return
    let vivo = true
    const sync = async () => {
      try {
        const r = await fetch(`/api/sessoes/tempo?st=${sessionToken}`)
        if (!r.ok) return
        const d = await r.json()
        const novo = d?.tempo_limite_min ?? null
        if (!vivo) return
        setSessao((s) => (s && s.tempo_limite_min !== novo ? { ...s, tempo_limite_min: novo } : s))
      } catch { /* rede instável — tenta no próximo ciclo */ }
    }
    sync() // ao entrar nesta questão
    const t = setInterval(sync, 30_000) // rede de segurança
    return () => { vivo = false; clearInterval(t) }
  }, [sessionToken, status, questaoIndex])

  // Auto-finalizar ao esgotar tempo
  useEffect(() => {
    if (segundosRestantes === 0 && status === 'em_andamento') {
      handleFinalizar()
    }
  }, [segundosRestantes])

  // Auto-save
  const autoSave = useCallback(async (questaoId: string, alternativaId: string) => {
    setSalvando(questaoId)
    try {
      await fetch('/api/sessoes/resposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessao?.id,
          questao_id: questaoId,
          alternativa_id: alternativaId,
          session_token: sessionToken,
        }),
      })
    } catch {
      // Silently fail - will retry on next interaction
    } finally {
      setSalvando(null)
    }
  }, [sessao?.id, sessionToken])

  function handleResponder(questaoId: string, alternativaId: string) {
    setRespostas((prev) => {
      const next = { ...prev, [questaoId]: alternativaId }
      // Backup local imediato — sobrevive a fechar a página / queda de internet.
      try { if (sessao?.id) localStorage.setItem('resp_' + sessao.id, JSON.stringify(next)) } catch {}
      return next
    })
    autoSave(questaoId, alternativaId)
  }

  function toggleMarcar(questaoId: string) {
    setMarcadas((prev) => {
      const next = new Set(prev)
      if (next.has(questaoId)) next.delete(questaoId)
      else next.add(questaoId)
      return next
    })
  }

  async function handleFinalizar() {
    setIsFinalizando(true)
    setShowConfirmacao(false)
    setShowRevisao(false)

    try {
      const res = await fetch('/api/sessoes/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessao?.id,
          session_token: sessionToken,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setResultado(data)
      } else {
        // Mock resultado
        const total = sessao?.questoes.length ?? 0
        const acertos = Object.keys(respostas).length
        setResultado({
          nota: total > 0 ? (acertos / total) * 100 : 0,
          acertos,
          total,
        })
      }
      setStatus('finalizada')
    } catch {
      // Mock
      const total = sessao?.questoes.length ?? 0
      const acertos = Math.floor(Object.keys(respostas).length * 0.7)
      setResultado({ nota: total > 0 ? (acertos / total) * 100 : 0, acertos, total })
      setStatus('finalizada')
    } finally {
      setIsFinalizando(false)
      // Simulado enviado: limpa o backup local para não "retomar" uma sessão já finalizada.
      try {
        if (sessao?.id) {
          localStorage.removeItem('prog_' + sessao.id)
          localStorage.removeItem('resp_' + sessao.id)
          localStorage.removeItem('elim_' + sessao.id)
        }
      } catch {}
    }
  }

  // Tela "Carregamento" do caderno vinculado (estilo + cor) — usada nas transições de ligação.
  const telaCarregamento = (mensagem: string) => {
    const cores = efetivarHud(sessao?.hudCores ?? hudInicial?.base, sessao?.hudPorPagina ?? hudInicial?.porPagina, 'loading')
    const brand = sessao?.branding ?? hudInicial?.branding
    return (
      <div style={hudCssVars(cores, dark) as React.CSSProperties}>
        <ProvaLoading
          mensagem={mensagem}
          tipo={cores.loadingTipo as EstiloProvaLoading}
          logoUrl={brand?.logoUrl ?? null}
          logoBg={brand?.logoBg}
          logoEstilo={brand?.logoEstilo}
        />
      </div>
    )
  }

  if (status === 'loading') return telaCarregamento('Preparando seu simulado...')
  // Enquanto finaliza, mostra a mesma tela de carregamento ("preparando o resultado").
  if (isFinalizando) return telaCarregamento('Preparando seu resultado...')

  if (status === 'erro') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Acesso Negado</h2>
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar seu simulado. Verifique seu link de acesso ou entre em contato com o suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'finalizada') {
    return (
      <div style={hudCssVars(efetivarHud(sessao?.hudCores, sessao?.hudPorPagina, 'encerrada'), dark) as React.CSSProperties}>
        <RevisaoFinal
          sessionToken={sessionToken ?? ''}
          voltarUrl={`/aluno/login?token=${token}`}
          inicioUrl={`/simulado/${token}`}
          simuladosUrl="/aluno/simulados"
          hudCores={sessao?.hudCores ?? hudInicial?.base}
          hudPorPagina={sessao?.hudPorPagina ?? hudInicial?.porPagina}
          branding={sessao?.branding ?? hudInicial?.branding}
          dark={dark}
          onToggleDark={toggleDark}
        />
      </div>
    )
  }

  if (!sessao) return null

  const questaoAtual = sessao.questoes[questaoIndex]
  const totalQuestoes = sessao.questoes.length
  const totalRespondidas = Object.keys(respostas).length
  const progresso = (totalRespondidas / totalQuestoes) * 100

  const timerWarning = segundosRestantes !== null && segundosRestantes < 300

  // HUD do simulado — reutilizado ao fundo do pop-up de entrada e na prova em si.
  const provaHudEl = (
    <ProvaHud
      titulo={sessao.simuladoTitulo ?? 'Simulado'}
      logoUrl={sessao.branding?.logoUrl ?? null}
      logoBg={sessao.branding?.logoBg}
      logoEstilo={sessao.branding?.logoEstilo}
      questaoIndex={questaoIndex}
      totalQuestoes={totalQuestoes}
      totalRespondidas={totalRespondidas}
      salvando={!!salvando}
      tempoLabel={segundosRestantes !== null ? formatTime(segundosRestantes) : null}
      timerWarning={timerWarning}
      progresso={progresso}
      questaoAtual={questaoAtual}
      respostaId={respostas[questaoAtual.id]}
      respondidas={sessao.questoes.map((q) => !!respostas[q.id])}
      marcadas={sessao.questoes.map((q) => marcadas.has(q.id))}
      marcadaAtual={marcadas.has(questaoAtual.id)}
      numMarcadas={marcadas.size}
      onToggleMarcar={() => toggleMarcar(questaoAtual.id)}
      mostrarTempo={mostrarTempo}
      onToggleTempo={() => setMostrarTempo((v) => !v)}
      onResponder={(altId) => handleResponder(questaoAtual.id, altId)}
      eliminadas={eliminadas[questaoAtual.id] ?? []}
      onToggleEliminar={(altId) => toggleEliminar(questaoAtual.id, altId)}
      onGoto={(i) => setQuestaoIndex(i)}
      onPrev={() => setQuestaoIndex((i) => Math.max(0, i - 1))}
      onNext={() => setQuestaoIndex((i) => Math.min(totalQuestoes - 1, i + 1))}
      onRevisar={() => setShowRevisao(true)}
      isFinalizando={isFinalizando}
      dark={dark}
      onToggleDark={toggleDark}
    />
  )

  // Pop-up de entrada aparece POR CIMA do simulado (prova ao fundo, desfocada e inativa).
  if (!iniciado) {
    return (
      <div className="relative" style={hudCssVars(efetivarHud(sessao.hudCores, sessao.hudPorPagina, 'prova'), dark) as React.CSSProperties}>
        <div aria-hidden className="pointer-events-none select-none blur-[3px]">{provaHudEl}</div>
        <div style={hudCssVars(efetivarHud(sessao.hudCores, sessao.hudPorPagina, 'entrada'), dark) as React.CSSProperties}>
          <ProvaIntro
            overlay
            titulo={sessao.simuladoTitulo ?? 'Simulado'}
            logoUrl={sessao.branding?.logoUrl ?? null}
            logoGrandeUrl={sessao.branding?.logoGrandeUrl ?? null}
            logoBg={sessao.branding?.logoBg}
            logoEstilo={sessao.branding?.logoEstilo}
            tempoLabel={segundosRestantes !== null ? formatTime(segundosRestantes) : null}
            totalQuestoes={totalQuestoes}
            onIniciar={() => setIniciado(true)}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={hudCssVars(efetivarHud(sessao.hudCores, sessao.hudPorPagina, 'prova'), dark) as React.CSSProperties}>
      {provaHudEl}

      {/* Modal de Revisão */}
      <Dialog open={showRevisao} onOpenChange={setShowRevisao}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisão do Simulado</DialogTitle>
            <DialogDescription>
              Verifique suas respostas antes de enviar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded" style={{ background: 'var(--prova-marcada, var(--primary))' }} />
                <span>Marcadas ({totalRespondidas})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-muted" />
                <span>Em branco ({totalQuestoes - totalRespondidas})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5" style={{ color: 'var(--prova-revisar, #f59e0b)' }} />
                <span>Para revisar ({marcadas.size})</span>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              {sessao.questoes.map((q, i) => {
                const respondida = !!respostas[q.id]
                const marcada = marcadas.has(q.id)
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setQuestaoIndex(i)
                      setShowRevisao(false)
                    }}
                    title={`Questão ${i + 1}${marcada ? ' (marcada)' : ''}`}
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold',
                      respondida ? 'text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                    style={{
                      ...(respondida ? { background: 'var(--prova-marcada, var(--primary))' } : {}),
                      ...(marcada ? { boxShadow: '0 0 0 2px var(--prova-revisar, #f59e0b)' } : {}),
                    }}
                  >
                    {i + 1}
                    {marcada && (
                      <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full p-0.5 text-white" style={{ background: 'var(--prova-revisar, #f59e0b)' }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisao(false)}>
              Continuar respondendo
            </Button>
            <Button
              onClick={() => {
                setShowRevisao(false)
                setShowConfirmacao(true)
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar simulado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação Final */}
      <Dialog open={showConfirmacao} onOpenChange={setShowConfirmacao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio do simulado</DialogTitle>
            <DialogDescription>
              Você respondeu <strong>{totalRespondidas}</strong> de{' '}
              <strong>{totalQuestoes}</strong> questões.
              {totalRespondidas < totalQuestoes && (
                <span className="mt-1 block text-amber-600 dark:text-amber-400">
                  Atenção: {totalQuestoes - totalRespondidas} questões ainda estão em branco.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Após o envio, não será possível alterar suas respostas. Deseja confirmar?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmacao(false)}
              disabled={isFinalizando}
            >
              Voltar
            </Button>
            <Button onClick={handleFinalizar} disabled={isFinalizando}>
              {isFinalizando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Confirmar envio'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
