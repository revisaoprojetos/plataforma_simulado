'use client'

// LEITOR DE JURISPRUDÊNCIA (redesign) — HOST.
// O leitor é o protótipo fiel (public/leitura/leitor-jus.html) rodando num iframe isolado:
// mesmo motor/visual do que foi desenhado (tokens próprios, marcação, pomodoro, folha espelho,
// caderno/Leitner, busca, voz). Aqui só fazemos o "handshake":
//   1) o iframe avisa { type:'leitor-jus-ready' };
//   2) respondemos { type:'leitor-jus-day', html, cfg } com o HTML REAL do dia (doc.html, formato
//      Word export que o parseDay() do protótipo consome) + os destinos de navegação;
//   3) os botões Voltar/Questões do leitor mandam { type:'leitor-jus-nav', to } → navegamos aqui.
// Config por tópico (tags/tribunal/temas do editor) entra numa fase seguinte, por `cfg`.

import { useCallback, useEffect, useRef } from 'react'
import type { TopicosConfig } from '@/lib/leitura/topicos'
import { SELOS } from '@/lib/leitura/selos'
import { APP_VERSION } from '@/lib/version'

// Cache-bust atrelado à versão do app: como é um asset estático (public/), sem o ?v= o navegador/CDN
// poderia servir o HTML antigo após o deploy. APP_VERSION muda a cada release → sempre busca o novo.
const PROTOTIPO = `/leitura/leitor-jus.html?v=${APP_VERSION}`
// slug → rótulo do selo (p/ alt/title dos PNGs no leitor). O catálogo é a fonte da biblioteca.
const SELO_LABELS: Record<string, string> = Object.fromEntries(Object.entries(SELOS).map(([k, v]) => [k, v.nome]))

export function LeitorJus({
  html, titulo, sobretitulo = '', topicos, caminho, voltarHref, questoesHref, documentoId, versao,
}: {
  html: string
  titulo: string
  sobretitulo?: string
  topicos?: TopicosConfig
  caminho: string[]
  voltarHref?: string
  questoesHref?: string
  /** Documento + versão p/ gravar progresso/conclusão da leitura (gate que libera o quiz no arcade). */
  documentoId?: string
  versao?: number
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Mantém os dados num ref para o listener de mensagem sempre ver o valor atual sem re-registrar.
  const dadosRef = useRef({ html, titulo, sobretitulo, topicos, caminho, voltarHref, questoesHref, documentoId, versao })
  dadosRef.current = { html, titulo, sobretitulo, topicos, caminho, voltarHref, questoesHref, documentoId, versao }

  // O leitor é um iframe isolado → quem fala com a API é o host. Grava progresso/conclusão da leitura.
  const postProgresso = useCallback((body: Record<string, unknown>) => {
    const d = dadosRef.current
    if (!d.documentoId || !d.versao) return Promise.resolve()
    return fetch('/api/leitura/progresso', {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ documento_id: d.documentoId, versao: d.versao, ...body }),
    }).then(() => undefined).catch(() => undefined)
  }, [])

  // Acumula tempo de leitura enquanto o overlay está aberto (p/ desafios com tempo mínimo).
  useEffect(() => {
    if (!documentoId || !versao) return
    const iv = setInterval(() => { void postProgresso({ tempo_inc: 20 }) }, 20000)
    return () => clearInterval(iv)
  }, [documentoId, versao, postProgresso])

  const enviarDia = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    const d = dadosRef.current
    win.postMessage({
      type: 'leitor-jus-day',
      html: d.html,
      cfg: {
        voltarHref: d.voltarHref ?? null,
        questoesHref: d.questoesHref ?? null,
        titulo: d.titulo,
        sobretitulo: d.sobretitulo,
        caminho: d.caminho,
        topicos: d.topicos ?? null,
        selos: SELO_LABELS,
      },
    }, '*')
  }, [])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Só mensagens do nosso iframe.
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data
      if (!m || typeof m !== 'object') return
      if (m.type === 'leitor-jus-ready') { enviarDia(); return }
      if (m.type === 'leitor-jus-nav') {
        const d = dadosRef.current
        const href = m.to === 'questoes' ? d.questoesHref : d.voltarHref
        const ir = () => { if (href) window.location.href = href }
        // "Concluir leitura" → grava a conclusão (pct 100) ANTES de fechar, p/ o arcade liberar o quiz do dia.
        if (m.to === 'questoes') { void postProgresso({ pct: 100, concluir: true }).then(ir) }
        else ir()
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarDia, postProgresso])

  return (
    <iframe
      ref={iframeRef}
      src={PROTOTIPO}
      title={titulo || 'Leitura'}
      // onLoad reenvia o dia caso o iframe recarregue (o próprio leitor pode dar location.reload()).
      onLoad={enviarDia}
      style={{ display: 'block', width: '100%', height: '100%', border: 0, background: 'var(--bg, #fbfbfc)' }}
    />
  )
}
