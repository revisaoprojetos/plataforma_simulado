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

// Tipo LOCAL (client-safe) do grifo do aluno. NÃO importar de '@/lib/leitura/acesso' — aquele módulo é
// 'server-only'; referenciá-lo num client component quebra o bundle (em dev vira loop de reload). É
// estruturalmente compatível com AnotacaoAluno (o page.tsx passa doc.anotacoes direto).
type GrifoAluno = {
  id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string
  cor: string; nota: string | null; tipo: 'grifo' | 'nota'
}

// Cache-bust atrelado à versão do app: como é um asset estático (public/), sem o ?v= o navegador/CDN
// poderia servir o HTML antigo após o deploy. APP_VERSION muda a cada release → sempre busca o novo.
const PROTOTIPO = `/leitura/leitor-jus.html?v=${APP_VERSION}`
// slug → rótulo do selo (p/ alt/title dos PNGs no leitor). O catálogo é a fonte da biblioteca.
const SELO_LABELS: Record<string, string> = Object.fromEntries(Object.entries(SELOS).map(([k, v]) => [k, v.nome]))

export function LeitorJus({
  html, titulo, sobretitulo = '', topicos, caminho, voltarHref, questoesHref, documentoId, versao, desafio, legendasOff = [], grifoRevisaoOff = false, anotacoes = [],
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
  /** Desafio (pasta) — p/ a conclusão da leitura contar na SEQUÊNCIA do juris (regra: leitura = sequência). */
  desafio?: string
  /** Config do editor: legendas ocultadas e "Grifo do Revisão" desativado (quiz_config do documento). */
  legendasOff?: string[]
  grifoRevisaoOff?: boolean
  /** Grifos/anotações do aluno (persistidos em simulado_leitura_anotacoes) — fonte da verdade cross-device. */
  anotacoes?: GrifoAluno[]
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Mantém os dados num ref para o listener de mensagem sempre ver o valor atual sem re-registrar.
  const dadosRef = useRef({ html, titulo, sobretitulo, topicos, caminho, voltarHref, questoesHref, documentoId, versao, desafio, legendasOff, grifoRevisaoOff, anotacoes })
  dadosRef.current = { html, titulo, sobretitulo, topicos, caminho, voltarHref, questoesHref, documentoId, versao, desafio, legendasOff, grifoRevisaoOff, anotacoes }

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
    // Pausa quando a aba está oculta: não conta tempo de leitura nem gera egress com o usuário fora.
    const iv = setInterval(() => { if (document.hidden) return; void postProgresso({ tempo_inc: 20 }) }, 20000)
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
        legendasOff: d.legendasOff ?? [],
        grifoRevisaoOff: !!d.grifoRevisaoOff,
        // Grifos persistidos no servidor (fonte da verdade): o leitor pinta por âncora text-quote e
        // sincroniza cada criação/edição/remoção de volta pelo host → /api/leitura/anotacao.
        grifosServer: !!(d.documentoId && d.versao),
        grifos: (d.anotacoes ?? []).map((a) => ({
          id: a.id, inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix,
          cor: a.cor, nota: a.nota, tipo: a.tipo,
        })),
      },
    }, '*')
  }, [])

  // Relay de persistência de grifos: o iframe é isolado → o host fala com a API.
  const grifoFetch = useCallback((init: RequestInit & { method: string }, qs = '') => {
    return fetch('/api/leitura/anotacao' + qs, { credentials: 'same-origin', ...init })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  }, [])
  const salvarGrifo = useCallback((m: any) => {
    const d = dadosRef.current
    if (!d.documentoId || !d.versao) return
    const win = iframeRef.current?.contentWindow
    if (m.op === 'add') {
      const a = m.a || {}
      void grifoFetch({
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documento_id: d.documentoId, versao: d.versao,
          inicio_char: a.inicio, fim_char: a.fim, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '',
          cor: a.cor || undefined, nota: a.nota || undefined, tipo: a.tipo === 'nota' ? 'nota' : 'grifo',
        }),
      }).then((r) => { if (r?.id && win) win.postMessage({ type: 'leitor-jus-grifo-saved', cid: m.cid, id: r.id }, '*') })
    } else if (m.op === 'upd' && m.id) {
      void grifoFetch({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: m.id, cor: m.cor, nota: m.nota ?? null }) })
    } else if (m.op === 'del' && m.id) {
      void grifoFetch({ method: 'DELETE' }, '?id=' + encodeURIComponent(m.id))
    }
  }, [grifoFetch])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Só mensagens do nosso iframe.
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data
      if (!m || typeof m !== 'object') return
      if (m.type === 'leitor-jus-ready') { enviarDia(); return }
      if (m.type === 'leitor-jus-grifo') { salvarGrifo(m); return }
      if (m.type === 'leitor-jus-nav') {
        const d = dadosRef.current
        const href = m.to === 'questoes' ? d.questoesHref : d.voltarHref
        const ir = () => { if (href) window.location.href = href }
        // "Concluir leitura" → grava a conclusão (pct 100) ANTES de fechar, p/ o arcade liberar o quiz do dia.
        if (m.to === 'questoes') { void postProgresso({ pct: 100, concluir: true, desafio: d.desafio }).then(ir) }
        else ir()
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarDia, postProgresso, salvarGrifo])

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
