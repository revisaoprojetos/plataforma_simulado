'use client'

// SIMULADO MEQ — ENTRADA LIGADA AO BACKEND REAL (spec 06 §1 "Dados backend").
// Envolve o componente presentacional <Entrada> (via PlatformSimulado) com a lógica
// de identificação (/api/auth/embed/identify), contagem regressiva do estado
// `agendado`, cálculo do estado `es` a partir da janela/status do simulado e o
// loading = tela da PLATAFORMA (PlatformLoader) ao entrar. Substitui o EmbedLoginForm
// genérico só para a marca MEQ, mantendo o MESMO contrato de backend.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlatformSimulado } from '../platform-simulado'
import { PlatformLoader } from '@/components/brand/platform-loader'
import { useDarkMode } from '@/lib/hud/use-dark'
import type {
  AcaoEntrada, Brand, EstadoEntrada, MetodoIdentificacao, SimEntradaReal, SimMock, SimTheme, TipoResposta,
} from '../types'

/** Dados reais do simulado necessários para a Entrada (resolvidos no servidor). */
export interface EntradaRealProps {
  token: string
  /** Marca para o visual da entrada/loader (default 'meq' por compat; 'revisao'/'vnd' idem). */
  brand?: Brand
  metodo: MetodoIdentificacao
  /** tema inicial resolvido no servidor (claro/azul = default do tenant; escuro = dark). */
  temaInicial: SimTheme
  /** slug do estilo de carregamento do tenant (p/ o loader pós-identificação casar com os demais). */
  loadingStyle?: string
  /** logo REAL do tenant (white-label) — exibida no cabeçalho da entrada no lugar da marca genérica. */
  logoUrl?: string | null
  /** logo do tenant p/ fundo ESCURO (tema escuro). No tema claro usa `logoUrl`. */
  logoDarkUrl?: string | null
  /** logo GRANDE (campo da entrada do aluno) — vira a logo ESCURA no tema claro. */
  logoGrandeUrl?: string | null
  /** capa do simulado (imagem ORIGINAL) p/ o fundo do cabeçalho do card. */
  capaUrl?: string | null
  /** enquadramento salvo da capa (formato paisagem) — render fiel ao ajuste do admin. */
  capaCfg?: import('@/lib/capa-meta').CapaViewCfg | null
  /** nome da plataforma (ex.: "MEQ Concursos") para a linha de identificação. */
  plataforma: string
  /** e-mail já logado no portal (read-only/pré-preenchido). */
  emailInicial?: string
  prova: {
    titulo: string
    status: string | null
    dataInicio: string | null
    dataFim: string | null
    tempoLimiteMin: number | null
    /** nº de questões (quando conhecido). */
    nQuestoes: number | null
    tipo: TipoResposta
    banca: string
    subtitulo: string
    curto: string
    permiteFolha: boolean
  }
  /** horário do servidor no 1º render (ISO) — base da contagem regressiva, não o relógio local. */
  agoraISO: string
}

/** Calcula o estado inicial da Entrada a partir da janela/status (sem conhecer o aluno ainda). */
function calcularEs(p: EntradaRealProps['prova'], agora: number): EstadoEntrada {
  const ini = p.dataInicio ? new Date(p.dataInicio).getTime() : null
  const fim = p.dataFim ? new Date(p.dataFim).getTime() : null
  if (p.status === 'encerrado') return 'encerrado'
  if (fim && agora > fim) return 'encerrado'
  if (ini && agora < ini) return 'agendado'
  return 'aberto'
}

function countdownDe(dataInicioISO: string | null, restanteMs: number): SimMock['countdown'] {
  const total = Math.max(0, Math.floor(restanteMs / 1000))
  const dias = Math.floor(total / 86400)
  const horas = Math.floor((total % 86400) / 3600)
  const min = Math.floor((total % 3600) / 60)
  const d = dataInicioISO ? new Date(dataInicioISO) : null
  const p = (n: number) => String(n).padStart(2, '0')
  const dataLabel = d ? `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}` : '—'
  return { dias, horas, min, dataLabel }
}

export function EntradaReal(props: EntradaRealProps) {
  const { token, metodo, temaInicial, plataforma, prova, agoraISO } = props
  const brand: Brand = props.brand ?? 'meq'
  const router = useRouter()
  const [dark, toggleDark] = useDarkMode(temaInicial === 'escuro')
  // Tema efetivo: dark vence; senão o default do tenant (claro ou azul).
  const theme: SimTheme = dark ? 'escuro' : (temaInicial === 'azul' ? 'azul' : 'claro')

  const [email, setEmail] = useState(props.emailInicial ?? '')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [carregando, setCarregando] = useState<AcaoEntrada | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState<{ titulo?: string; mensagem: string; identidade?: boolean } | null>(null)

  // Relógio base no servidor → contagem regressiva estável (independe do relógio local do cliente).
  const servidorBase = useRef(new Date(agoraISO).getTime())
  const montadoEm = useRef(Date.now())
  const [agora, setAgora] = useState(servidorBase.current)

  // Espera (identidade OK antes do início): o backend devolve {aguardando, data_inicio}.
  const [aguardando, setAguardando] = useState<string | null>(null)
  const ultimoModo = useRef<AcaoEntrada>('iniciar')

  // Tick de 1s para o countdown (relógio = base do servidor + tempo decorrido local).
  const temCountdown = !!prova.dataInicio && new Date(prova.dataInicio).getTime() > servidorBase.current
  useEffect(() => {
    if (!temCountdown && !aguardando) return
    // Pausa com a aba oculta (egress/CPU); o relógio recalcula pelo tempo decorrido, então ao voltar
    // o próximo tick já salta para o valor correto.
    const t = setInterval(() => { if (!document.hidden) setAgora(servidorBase.current + (Date.now() - montadoEm.current)) }, 1000)
    return () => clearInterval(t)
  }, [temCountdown, aguardando])

  const es: EstadoEntrada = useMemo(() => {
    if (erro?.identidade) return 'semcad'
    return calcularEs(prova, agora)
  }, [prova, agora, erro])

  const inicioMs = prova.dataInicio ? new Date(prova.dataInicio).getTime() : null
  const restanteInicio = inicioMs ? Math.max(0, inicioMs - agora) : 0

  const onIdentificar = useCallback(async (modo: AcaoEntrada) => {
    if (carregando) return
    setErro(null)
    setCarregando(modo)
    ultimoModo.current = modo
    try {
      const res = await fetch('/api/auth/embed/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embed_token: token, email, cpf, telefone,
          // "folha" abre a mesma sessão de "iniciar"; o servidor só distingue iniciar × resultado.
          modo: modo === 'folha' ? 'iniciar' : modo,
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { titulo?: string; message?: string; tipo?: string }
        // Identidade não encontrada → estado `semcad` (campo em erro). Demais → erro inline.
        const identidade = json.tipo === 'email_invalido' || res.status === 404
        setErro({ titulo: json.titulo, mensagem: json.message ?? 'Acesso negado. Verifique seus dados.', identidade })
        setCarregando(null)
        return
      }
      const json = await res.json()
      if (json.aguardando && json.data_inicio) {
        setAguardando(json.data_inicio as string)
        setCarregando(null)
        return
      }
      const sessaoId = json.sessao_id as string
      setSucesso(true)
      toast.success(modo === 'resultado' ? 'Identificado! Abrindo seus resultados…' : modo === 'folha' ? 'Login realizado! Abrindo a folha de respostas…' : 'Login realizado! Entrando no simulado…')
      router.push(`/simulado/${token}?st=${sessaoId}${modo === 'folha' ? '&folha=1' : ''}`)
    } catch {
      setErro({ mensagem: 'Erro ao verificar identidade. Tente novamente.' })
      setCarregando(null)
    }
  }, [carregando, token, email, cpf, telefone, router])

  // Valida identidade/acesso SEM criar sessão (modo 'validar'). Usado pela entrada para só abrir o
  // modal "Tudo pronto" quando o e-mail está certo; e-mail errado seta o erro (→ estado sem-cadastro).
  const onValidar = useCallback(async (): Promise<boolean> => {
    if (carregando) return false
    setErro(null)
    setCarregando('iniciar')
    try {
      const res = await fetch('/api/auth/embed/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embed_token: token, email, cpf, telefone, modo: 'validar' }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { titulo?: string; message?: string; tipo?: string }
        const identidade = json.tipo === 'email_invalido' || res.status === 404
        setErro({ titulo: json.titulo, mensagem: json.message ?? 'Acesso negado. Verifique seus dados.', identidade })
        setCarregando(null)
        return false
      }
      const json = await res.json()
      setCarregando(null)
      // Identidade OK mas ainda antes do início (entrada antecipada) → não abre o modal; mostra a espera.
      if (json.aguardando && json.data_inicio) { setAguardando(json.data_inicio as string); return false }
      return true
    } catch {
      setErro({ mensagem: 'Erro ao verificar identidade. Tente novamente.' })
      setCarregando(null)
      return false
    }
  }, [carregando, token, email, cpf, telefone])

  // Chegou a hora durante a espera → refaz a identificação sozinho (trava anti-spam 6s).
  const ultimaAuto = useRef(0)
  useEffect(() => {
    if (!aguardando) return
    const alvo = new Date(aguardando).getTime()
    if (agora >= alvo && !carregando && Date.now() - ultimaAuto.current > 6000) {
      ultimaAuto.current = Date.now()
      setAguardando(null)
      onIdentificar(ultimoModo.current)
    }
  }, [agora, aguardando, carregando, onIdentificar])

  // Loading = tela da PLATAFORMA (regra do PO: o simulado não tem loader próprio).
  if (sucesso) {
    return (
      <PlatformLoader
        brand={brand}
        style={props.loadingStyle}
        theme={theme}
        message={ultimoModo.current === 'resultado' ? 'Abrindo seus resultados…' : 'Preparando seu simulado…'}
      />
    )
  }

  const restanteCountdown = aguardando ? Math.max(0, new Date(aguardando).getTime() - agora) : restanteInicio

  const data: SimMock = {
    info: {
      titulo: prova.titulo,
      curto: prova.curto,
      subtitulo: prova.subtitulo,
      n: prova.nQuestoes ?? 0,
      tipo: prova.tipo,
      banca: prova.banca,
      duracaoMin: prova.tempoLimiteMin,
      inicioISO: prova.dataInicio ?? agoraISO,
      fimISO: prova.dataFim ?? agoraISO,
      semJanela: !prova.dataInicio && !prova.dataFim, // sem data de início/fim → "Sempre aberto"
      capaUrl: props.capaUrl ?? null,
      capaCfg: props.capaCfg ?? null,
      inscritos: 0,
      regras: [],
      recompensa: '',
      permiteFolha: prova.permiteFolha,
      permitePausa: prova.tempoLimiteMin == null,
    },
    questoes: [],
    tentativa: { respostas: {}, marcadas: [], eliminadas: {}, ultimaQuestao: 1, respondidas: 0, ultimaAtividade: '' },
    // Resultado não é usado na Entrada; objeto mínimo compatível com o tipo.
    resultado: {
      certas: 0, erradas: 0, branco: 0, nota: '', posicao: 0, total: 0, tempo: '', inicio: '', termino: '', data: '',
      porMateria: [], histograma: [], faixaAluno: 0, top3: [], correcao: [], downloads: [],
    },
    aluno: { primeiroNome: (email.split('@')[0] || 'Você') },
    countdown: countdownDe(aguardando ?? prova.dataInicio, restanteCountdown),
  }

  const real: SimEntradaReal = {
    metodo, email, setEmail, cpf, setCpf, telefone, setTelefone,
    onIdentificar, onValidar, carregando, erro, voltarHref: '/aluno', onToggleTheme: toggleDark,
    plataforma, logoUrl: props.logoUrl ?? null, logoDarkUrl: props.logoDarkUrl ?? null, logoGrandeUrl: props.logoGrandeUrl ?? null, permiteFolha: prova.permiteFolha,
  }

  return <PlatformSimulado brand={brand} tela="entrada" theme={theme} data={data} es={es} real={real} />
}

// Compat: o nome antigo continua válido (import existente em app/simulado/[token]/page.tsx).
export const EntradaMeqReal = EntradaReal
