'use client'

// Cronograma REVISÃO (plano fixo) dentro do iframe do Cronograma Adaptativo (modo `revisao-fixo`).
// O iframe mostra as telas Hoje/Semana/Configurar; as ações que dependem do portal (renomear, PDF, apagar, restaurar,
// gerar novamente) chegam por postMessage `rej-crono-revisao-acao` e são executadas aqui por ROTAS DE API
// (server action é rejeitada em domínio custom / iframe Curseduca). Marcar/anotar vão direto do iframe para /check e /nota.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Btn, Row } from '@/components/nova/ui'
import { NovaModal } from '@/components/nova/modal'
import { usePdfCronograma } from '@/components/cronograma/use-pdf-cronograma'
import { CronogramaAdaptativoEmbed } from './adaptativo-embed'
import type { InternaTheme } from '../interna-tokens'

async function chamarEmissoes(corpo: Record<string, unknown>): Promise<{ ok: boolean; message?: string; error?: string; emissaoId?: string; migradas?: { checks: number; notas: number } }> {
  try {
    const res = await fetch('/api/aluno/cronograma/emissoes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const j = await res.json().catch(() => null)
    return j && typeof j.ok === 'boolean' ? j : { ok: false, message: 'Não foi possível concluir. Tente de novo.' }
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' }
  }
}

export function RevisaoFixoEmbed({ theme, emissaoId, tituloInicial, semDatas }: { theme: InternaTheme; emissaoId: string; tituloInicial: string; semDatas: boolean }) {
  const router = useRouter()
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [titulo, setTitulo] = useState(tituloInicial)
  const [rascunho, setRascunho] = useState('')
  const [modal, setModal] = useState<null | 'renomear' | 'apagar'>(null)
  const [pendente, setPendente] = useState(false)
  const regerando = useRef(false)
  const { gerando, pedir } = usePdfCronograma(emissaoId)

  const avisarIframe = useCallback((msg: Record<string, unknown>) => {
    try { frame.current?.contentWindow?.postMessage(msg, '*') } catch { /* ignore */ }
  }, [])

  useEffect(() => { avisarIframe({ type: 'rej-crono-revisao-pdf', gerando }) }, [gerando, avisarIframe])

  const gerarNovamente = useCallback(async () => {
    if (regerando.current) return
    regerando.current = true
    toast.info('Gerando novamente…')
    const r = await chamarEmissoes({ acao: 'regenerar', id: emissaoId })
    if (!r.ok || !r.emissaoId) {
      regerando.current = false
      toast.error(r.message ?? r.error ?? 'Não foi possível gerar novamente.')
      return
    }
    const m = r.migradas
    toast.success(m && (m.checks || m.notas) ? `Cronograma gerado novamente — ${m.checks} marcações e ${m.notas} anotações migradas.` : 'Cronograma gerado novamente.')
    router.push(`/aluno/cronograma/${r.emissaoId}`)
  }, [emissaoId, router])

  const restaurar = useCallback(async () => {
    const r = await chamarEmissoes({ acao: 'arquivar', id: emissaoId, arquivar: false })
    if (!r.ok) { toast.error(r.message ?? r.error ?? 'Não foi possível restaurar.'); return }
    toast.success('Cronograma restaurado')
    router.refresh()
  }, [emissaoId, router])

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return
      const d = (e.data || {}) as { type?: string; acao?: string }
      if (d.type !== 'rej-crono-revisao-acao') return
      if (d.acao === 'renomear') { setRascunho(titulo); setModal('renomear') }
      else if (d.acao === 'apagar') setModal('apagar')
      else if (d.acao === 'pdf') void pedir()
      else if (d.acao === 'regenerar') void gerarNovamente()
      else if (d.acao === 'restaurar') void restaurar()
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [titulo, pedir, gerarNovamente, restaurar])

  async function salvarTitulo() {
    if (pendente) return
    setPendente(true)
    const r = await chamarEmissoes({ acao: 'renomear', id: emissaoId, titulo: rascunho })
    setPendente(false)
    if (!r.ok) { toast.error(r.message ?? r.error ?? 'Não foi possível renomear.'); return }
    const novo = rascunho.trim()
    setTitulo(novo)
    avisarIframe({ type: 'rej-crono-revisao-titulo', titulo: novo })
    toast.success('Nome atualizado')
    setModal(null)
  }

  async function apagar() {
    if (pendente) return
    setPendente(true)
    const r = await chamarEmissoes({ acao: 'apagar', id: emissaoId })
    setPendente(false)
    if (!r.ok) { toast.error(r.message ?? r.error ?? 'Não foi possível apagar.'); return }
    toast.success('Cronograma apagado')
    router.push('/aluno/cronograma')
  }

  return (
    <>
      <CronogramaAdaptativoEmbed theme={theme} modo="revisao-fixo" emissaoId={emissaoId} abaInicial={semDatas ? 'semana' : 'hoje'} iframeRef={frame} />

      {modal === 'renomear' && (
        <NovaModal titulo="Renomear cronograma" sub="Só para você distinguir os seus cronogramas." onClose={() => setModal(null)} w={460}>
          <input
            autoFocus
            value={rascunho}
            maxLength={80}
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void salvarTitulo() }}
            placeholder="Dê um nome a este cronograma"
            aria-label="Nome do cronograma"
            style={{ height: 44, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', padding: '0 12px', fontSize: 14, width: '100%' }}
          />
          <Row gap={8} style={{ justifyContent: 'flex-end' }}>
            <Btn kind="secondary" size="sm" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn kind="primary" size="sm" icon="check" onClick={salvarTitulo} style={pendente ? { opacity: 0.7 } : undefined}>{pendente ? 'Salvando…' : 'Salvar'}</Btn>
          </Row>
        </NovaModal>
      )}

      {modal === 'apagar' && (
        <NovaModal titulo="Apagar este cronograma?" sub="Ele será apagado de vez, com todas as marcações e anotações. Não dá para desfazer." onClose={() => setModal(null)} w={460}>
          <Row gap={8} style={{ justifyContent: 'flex-end' }}>
            <Btn kind="secondary" size="sm" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn kind="primary" size="sm" icon="trash" onClick={apagar} style={pendente ? { opacity: 0.7 } : undefined}>{pendente ? 'Apagando…' : 'Apagar definitivamente'}</Btn>
          </Row>
        </NovaModal>
      )}
    </>
  )
}
