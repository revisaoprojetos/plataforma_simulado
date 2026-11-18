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

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TopicosConfig } from '@/lib/leitura/topicos'
import { SELOS } from '@/lib/leitura/selos'
import { APP_VERSION } from '@/lib/version'
import { criarFilaGrifos } from '@/lib/leitura/grifo-fila'
import { SalvarComentarioCaderno, normalizarComentarioCaderno, type ComentarioParaCaderno } from '@/components/aluno/cadernos/salvar-comentario-caderno'

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
  html, titulo, sobretitulo = '', topicos, caminho, voltarHref, questoesHref, documentoId, versao, desafio, legendasOff = [], grifoRevisaoOff = false, anotacoes = [], alunoId,
}: {
  /** Id do aluno logado — chave do localStorage do leitor (isola grifos locais entre contas no mesmo navegador). */
  alunoId?: string
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
  const [paraCaderno, setParaCaderno] = useState<ComentarioParaCaderno | null>(null)
  // Mantém os dados num ref para o listener de mensagem sempre ver o valor atual sem re-registrar.
  const dadosRef = useRef({ html, titulo, sobretitulo, topicos, caminho, voltarHref, questoesHref, documentoId, versao, desafio, legendasOff, grifoRevisaoOff, anotacoes, alunoId })
  dadosRef.current = { html, titulo, sobretitulo, topicos, caminho, voltarHref, questoesHref, documentoId, versao, desafio, legendasOff, grifoRevisaoOff, anotacoes, alunoId }

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
        uid: d.alunoId ?? null, // escopa o localStorage do iframe por aluno (aparelho compartilhado não mistura contas)
        grifosServer: !!(d.documentoId && d.versao),
        grifos: (d.anotacoes ?? []).map((a) => ({
          id: a.id, inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix,
          cor: a.cor, nota: a.nota, tipo: a.tipo,
        })),
      },
    }, '*')
  }, [])

  // Relay de persistência de grifos: o iframe é isolado → o host fala com a API.
  // Fila com retry/backoff (rede instável no celular/tablet; 5xx transitório). Antes a falha era 100% silenciosa.
  // Informa o iframe (leitor-jus-grifo-status) p/ ele mostrar "Salvando… / Salvo / Erro ao salvar".
  // A fila é SERIALIZADA POR cid (lib/leitura/grifo-fila.ts): del/upd que chegam antes do id esperam o add
  // terminar; o add leva `cid` (idempotente no servidor); falha definitiva fica retida e é retomada.
  const filaRef = useRef<ReturnType<typeof criarFilaGrifos> | null>(null)
  const getFila = useCallback(() => {
    if (filaRef.current) return filaRef.current
    const post = (msg: Record<string, unknown>) => {
      try { iframeRef.current?.contentWindow?.postMessage(msg, '*') } catch { /* iframe fechado */ }
    }
    filaRef.current = criarFilaGrifos({
      enviar: async ({ method, qs, body }) => {
        try {
          const txt = body === undefined ? undefined : JSON.stringify(body)
          const r = await fetch('/api/leitura/anotacao' + qs, {
            method, credentials: 'same-origin',
            headers: txt ? { 'content-type': 'application/json' } : undefined,
            body: txt,
            // keepalive: a requisição sobrevive a navegação/fechar aba (limite ~64KB somado → só corpos pequenos).
            keepalive: !txt || txt.length < 30000,
          })
          const json = await r.json().catch(() => ({}))
          return { ok: r.ok, status: r.status, json }
        } catch { return null }
      },
      esperar: (ms) => new Promise((res) => setTimeout(res, ms)),
      onSaved: (cid, id) => post({ type: 'leitor-jus-grifo-saved', cid, id }),
      onStatus: (s) => post({ type: 'leitor-jus-grifo-status', estado: s.estado, pendentes: s.pendentes, naoSync: s.naoSync }),
      onAviso: (msg) => post({ type: 'leitor-jus-grifo-status', estado: 'aviso', msg }),
    })
    return filaRef.current
  }, [])
  // Retoma o que falhou definitivamente: ao voltar a rede e a cada 60 s (nunca descarta o grifo local).
  useEffect(() => {
    const retomar = () => { const f = filaRef.current; if (f && f.naoSincronizados > 0) f.retomarFalhas() }
    const iv = setInterval(retomar, 60000)
    window.addEventListener('online', retomar)
    return () => { clearInterval(iv); window.removeEventListener('online', retomar) }
  }, [])
  const salvarGrifo = useCallback((m: any) => {
    const d = dadosRef.current
    if (!d.documentoId || !d.versao) return
    const fila = getFila()
    if (m.op === 'add' && m.cid) {
      const a = m.a || {}
      void fila.enviar({
        op: 'add', cid: String(m.cid),
        corpo: {
          documento_id: d.documentoId, versao: d.versao,
          inicio_char: a.inicio, fim_char: a.fim, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '',
          cor: a.cor || undefined, nota: a.nota || undefined, tipo: a.tipo === 'nota' ? 'nota' : 'grifo',
        },
      })
    } else if (m.op === 'upd' && (m.cid || m.id)) {
      void fila.enviar({ op: 'upd', cid: m.cid || undefined, id: m.id || null, cor: m.cor, nota: m.nota ?? null })
    } else if (m.op === 'del' && (m.cid || m.id)) {
      void fila.enviar({ op: 'del', cid: m.cid || undefined, id: m.id || null })
    }
  }, [getFila])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Só mensagens do nosso iframe.
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data
      if (!m || typeof m !== 'object') return
      if (m.type === 'leitor-jus-ready') { enviarDia(); return }
      if (m.type === 'leitor-jus-grifo') { salvarGrifo(m); return }
      if (m.type === 'leitor-jus-salvar-caderno') {
        const d = dadosRef.current
        const p = normalizarComentarioCaderno(m.grifo, { documento_id: d.documentoId ?? null, documento_versao: d.versao ?? null, titulo_documento: d.titulo || null })
        if (p) setParaCaderno(p)
        return
      }
      if (m.type === 'leitor-jus-nav') {
        const d = dadosRef.current
        const href = m.to === 'questoes' ? d.questoesHref : d.voltarHref
        // Espera (até ~3 s) a fila de grifos esvaziar antes de sair: não cancela adds em andamento.
        // O que ainda estiver em voo segue por fetch keepalive; o resto fica no localStorage e é reenviado na abertura.
        const fila = filaRef.current
        const ir = () => { if (href) window.location.href = href }
        const esvaziada = fila ? fila.esvaziar(3000) : Promise.resolve()
        // "Concluir leitura" → grava a conclusão (pct 100) ANTES de fechar, p/ o arcade liberar o quiz do dia.
        if (m.to === 'questoes') { void Promise.all([postProgresso({ pct: 100, concluir: true, desafio: d.desafio }), esvaziada]).then(ir) }
        else void esvaziada.then(ir)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarDia, postProgresso, salvarGrifo])

  return (
    <>
    <iframe
      ref={iframeRef}
      src={PROTOTIPO}
      title={titulo || 'Leitura'}
      // onLoad reenvia o dia caso o iframe recarregue (o próprio leitor pode dar location.reload()).
      onLoad={enviarDia}
      allowFullScreen
      allow="fullscreen"
      style={{ display: 'block', width: '100%', height: '100%', border: 0, background: 'var(--bg, #fbfbfc)' }}
    />
    <SalvarComentarioCaderno dados={paraCaderno} onClose={() => setParaCaderno(null)} />
    </>
  )
}
