'use client'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  estadoInicial, reduzir, proximoEnvio, backoffMs, classificarResposta,
  type Alteracao, type Estado, type Evento, type ItemFila,
} from '@/lib/aluno/notebook-autosave'
import { gravarItem, removerItem, lerItem, semPersistencia, aoMudarPersistencia } from './fila-offline'

const DEBOUNCE = 1000
const MAX_WAIT = 5000

type Opts = {
  paginaId: string
  versaoInicial: number
  /** Materializa a edição atual (doc/título) — chamado só na hora de enviar (evita getJSON a cada tecla). */
  obter: () => Alteracao | null
  onSalvo?: (versao: number, alt: Alteracao) => void
}

const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`)

export function useAutosave({ paginaId, versaoInicial, obter, onSalvo }: Opts) {
  const ref = useRef<Estado>(estadoInicial(versaoInicial))
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  const [online, setOnline] = useState(true)
  const [sempers, setSempers] = useState(false)
  const [paginaServidor, setPaginaServidor] = useState<any>(null)
  const [migracaoPendente, setMigracao] = useState(false)
  const sujoRef = useRef(false)
  const ativoRef = useRef(false) // requisição ativa agora
  const tDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tMax = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tRetry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const obterRef = useRef(obter); obterRef.current = obter
  const salvoRef = useRef(onSalvo); salvoRef.current = onSalvo
  const vivo = useRef(true)

  const despachar = useCallback((e: Evento) => { ref.current = reduzir(ref.current, e); if (vivo.current) forcar() }, [])

  const limparTimers = () => { for (const t of [tDebounce, tMax]) { if (t.current) clearTimeout(t.current); t.current = null } }

  const materializar = useCallback(() => {
    if (!sujoRef.current) return
    sujoRef.current = false
    const alt = obterRef.current()
    if (alt) despachar({ t: 'editar', alt })
  }, [despachar])

  const enviarRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {})

  const agendar = useCallback(() => {
    if (tDebounce.current) clearTimeout(tDebounce.current)
    tDebounce.current = setTimeout(() => { void enviarRef.current() }, DEBOUNCE)
    if (!tMax.current) tMax.current = setTimeout(() => { void enviarRef.current() }, MAX_WAIT)
  }, [])

  const enviar = useCallback(async (keepalive = false): Promise<void> => {
    limparTimers()
    materializar()
    if (tRetry.current) { clearTimeout(tRetry.current); tRetry.current = null }
    if (ativoRef.current) return // um em voo por vez; ao terminar, reagenda o último coalescido
    const s0 = ref.current
    if (s0.fase === 'conflito') return
    if (!s0.emVoo && !proximoEnvio(s0)) return
    despachar({ t: 'iniciar', opId: novoId() })
    const voo = ref.current.emVoo
    if (!voo) return
    ativoRef.current = true
    const item: ItemFila = { paginaId, versao: voo.versao, opId: voo.opId, alt: voo.alt, em: Date.now() }
    void gravarItem(item)
    const corpo = JSON.stringify({
      versao: voo.versao, client_op_id: voo.opId,
      ...(voo.alt.doc !== undefined ? { doc: voo.alt.doc } : {}),
      ...(voo.alt.tinta !== undefined ? { tinta: voo.alt.tinta } : {}),
      ...(voo.alt.titulo !== undefined ? { titulo: voo.alt.titulo } : {}),
    })
    let status: number | null = null
    let json: any = null
    try {
      const r = await fetch(`/api/aluno/notebook/paginas/${paginaId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: corpo,
        credentials: 'same-origin', keepalive: keepalive && corpo.length < 60000,
      })
      status = r.status
      json = await r.json().catch(() => null)
    } catch { status = null }
    ativoRef.current = false
    const res = classificarResposta(status, json)
    if (res.k === 'ok') {
      void removerItem(paginaId, voo.opId)
      despachar({ t: 'ok', versao: res.versao })
      salvoRef.current?.(res.versao, voo.alt)
      if (vivo.current && proximoEnvio(ref.current)) agendar()
    } else if (res.k === 'conflito') {
      setPaginaServidor(json?.pagina ?? null)
      despachar({ t: 'conflito', versaoAtual: res.versaoAtual })
    } else if (res.k === 'rede') {
      despachar({ t: 'rede' })
      if (vivo.current) tRetry.current = setTimeout(() => { void enviarRef.current() }, backoffMs(ref.current.tentativas, Math.random()))
    } else {
      if (res.migracaoPendente) setMigracao(true)
      despachar({ t: 'erro' })
    }
  }, [paginaId, despachar, materializar, agendar])

  enviarRef.current = enviar

  const marcarSujo = useCallback(() => {
    sujoRef.current = true
    if (ref.current.fase === 'ocioso') { ref.current = { ...ref.current, fase: 'sujo' }; forcar() }
    agendar()
  }, [agendar])

  useEffect(() => {
    vivo.current = true
    setSempers(semPersistencia())
    const off = aoMudarPersistencia(() => setSempers(true))
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    let cancel = false
    // restaura edição guardada offline (aba fechada antes de enviar)
    void lerItem(paginaId).then((it) => {
      if (cancel || !it) return
      despachar({ t: 'editar', alt: it.alt })
      if (it.versao < ref.current.versao) despachar({ t: 'conflito', versaoAtual: ref.current.versao }) // servidor andou: não sobrescrever em silêncio
      else agendar()
    })
    const on = () => { setOnline(true); void enviarRef.current() }
    const offl = () => setOnline(false)
    const vis = () => { if (document.visibilityState === 'hidden') void enviarRef.current(true) }
    const hide = () => { void enviarRef.current(true) }
    window.addEventListener('online', on); window.addEventListener('offline', offl)
    document.addEventListener('visibilitychange', vis); window.addEventListener('pagehide', hide)
    return () => {
      cancel = true; off()
      window.removeEventListener('online', on); window.removeEventListener('offline', offl)
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', hide)
      void enviarRef.current(true) // flush ao trocar de página
      vivo.current = false
      limparTimers(); if (tRetry.current) clearTimeout(tRetry.current)
    }
  }, [paginaId, despachar, agendar])

  return {
    fase: ref.current.fase,
    versao: ref.current.versao,
    online, semPersistencia: sempers, migracaoPendente, paginaServidor,
    marcarSujo,
    flush: () => enviar(),
    tentarDeNovo: () => { despachar({ t: 'tentar_de_novo' }); void enviar() },
    usarServidor: (versao: number) => { void removerItem(paginaId); setPaginaServidor(null); despachar({ t: 'usar_servidor', versao }) },
    manterMinha: () => {
      const v = ref.current.conflito?.versaoAtual ?? ref.current.versao
      setPaginaServidor(null)
      despachar({ t: 'manter_minha', versaoAtual: v })
      void enviar()
    },
  }
}
