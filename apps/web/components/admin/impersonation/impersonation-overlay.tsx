'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Clock, RefreshCw, Loader2, Eye, ShieldAlert } from 'lucide-react'

type StartResp = { session_id: string; expires_at: string; student: { id: string; name: string }; action_level: string }

const ERROS: Record<string, string> = {
  no_permission: 'Você não tem permissão para visualizar contas de aluno.',
  out_of_scope: 'Este aluno está fora do seu escopo (outro tenant).',
  rate_limited: 'Muitas visualizações em pouco tempo. Aguarde um instante.',
  reauth_required: 'Sua sessão está antiga. Saia e entre de novo para visualizar um aluno.',
  impersonation_disabled: 'A visualização de alunos está desativada para esta plataforma.',
  student_not_found: 'Aluno não encontrado.',
}

/** Janela flutuante que visualiza o portal do aluno via <iframe> (isolamento real de documento).
 *  Somente leitura (read_only): o middleware bloqueia qualquer mutação. Fecha manualmente ou por
 *  expiração; avisa 2 min antes com opção de renovar. Acessível (focus trap, Esc, aria-live, mobile). */
export function ImpersonationOverlay({ estudanteId, estudanteNome, onClose }: { estudanteId: string; estudanteNome: string; onClose: () => void }) {
  const [sess, setSess] = useState<StartResp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [avisar, setAvisar] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const iniciado = useRef(false)

  // Início da sessão (uma vez).
  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    fetch('/api/admin/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: estudanteId }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(ERROS[d?.error] ?? 'Não foi possível iniciar a visualização.')
        setSess(d as StartResp)
      })
      .catch((e) => setErro(e.message))
  }, [estudanteId])

  // Encerrar (fecha o log + limpa o cookie). keepalive p/ sobreviver ao unmount.
  const encerrar = useCallback((reason: 'closed_by_admin' | 'expired') => {
    const s = sess
    if (s) {
      fetch(`/api/admin/impersonate/${s.session_id}`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }), keepalive: true,
      }).catch(() => {})
    }
    onClose()
  }, [sess, onClose])

  // Aviso 2 min antes + auto-encerramento na expiração.
  useEffect(() => {
    if (!sess) return
    const exp = new Date(sess.expires_at).getTime()
    const tAviso = setTimeout(() => setAvisar(true), Math.max(exp - Date.now() - 120_000, 0))
    const tFim = setTimeout(() => encerrar('expired'), Math.max(exp - Date.now(), 0))
    return () => { clearTimeout(tAviso); clearTimeout(tFim) }
  }, [sess, encerrar])

  const renovar = useCallback(() => {
    if (!sess) return
    fetch(`/api/admin/impersonate/${sess.session_id}/renew`, { method: 'POST' })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok && d?.expires_at) { setSess((s) => (s ? { ...s, expires_at: d.expires_at } : s)); setAvisar(false) } })
      .catch(() => {})
  }, [sess])

  // Esc fecha + focus trap dentro da janela (acessibilidade).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); encerrar('closed_by_admin'); return }
      if (e.key !== 'Tab' || !boxRef.current) return
      const foca = boxRef.current.querySelectorAll<HTMLElement>('button, a[href], iframe, [tabindex]:not([tabindex="-1"])')
      if (!foca.length) return
      const primeiro = foca[0], ultimo = foca[foca.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [encerrar])

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-4">
      {/* Abaixo de 768px = tela cheia; acima = janela centralizada. */}
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label={`Visualizando a conta de ${estudanteNome}`}
        className="relative flex h-full w-full flex-col overflow-hidden border bg-card shadow-2xl sm:h-[90vh] sm:max-w-6xl sm:rounded-2xl">
        {/* Barra superior */}
        <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400" title="As ações feitas contam como do próprio aluno">
            <Eye className="h-3.5 w-3.5" /> Operável — edições contam como o aluno
          </span>
          <span className="min-w-0 truncate text-sm text-muted-foreground">Vendo como <span className="font-semibold text-foreground">{estudanteNome}</span></span>
          <button type="button" onClick={() => encerrar('closed_by_admin')} aria-label="Fechar visualização"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors hover:bg-muted">
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>

        {/* Aviso de expiração (aria-live p/ leitor de tela) */}
        {avisar && sess && (
          <div aria-live="polite" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Sua visualização vai expirar em breve.</span>
            <button type="button" onClick={renovar} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold hover:bg-amber-500/30">
              <RefreshCw className="h-3.5 w-3.5" /> Renovar
            </button>
          </div>
        )}

        {/* Conteúdo: iframe do portal do aluno */}
        <div className="min-h-0 flex-1 bg-background">
          {erro ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <ShieldAlert className="h-8 w-8 text-destructive" />
              <p className="max-w-sm text-sm text-destructive">{erro}</p>
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Fechar</button>
            </div>
          ) : !sess ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo a conta do aluno…</div>
          ) : (
            <iframe src="/aluno" title={`Portal de ${estudanteNome}`} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
