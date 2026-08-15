'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Sparkles, MessageCircle } from 'lucide-react'
import { Mascote, REACOES_MASCOTE, type ReacaoMascote } from '@/components/mascote/mascote'

type Assistente = { ativo?: boolean; nome?: string; slogan?: string; ajuda_mensagem?: string; pose?: ReacaoMascote }

/**
 * Configura a MASCOTE/assistente da plataforma (a capivara): liga/desliga, nome, slogan, a
 * mensagem que ela dá na Ajuda e a pose padrão. Salvo em `tema.assistente` (jsonb do tenant).
 */
export function AssistenteForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const a = (tema?.assistente ?? {}) as Assistente
  const [ativo, setAtivo] = useState<boolean>(a.ativo !== false)
  const [nome, setNome] = useState<string>(a.nome ?? 'Capi')
  const [slogan, setSlogan] = useState<string>(a.slogan ?? '')
  const [ajuda, setAjuda] = useState<string>(a.ajuda_mensagem ?? 'Oi! Precisa de ajuda? É só escolher um tópico ao lado que eu te explico o passo a passo. 🐾')
  const [pose, setPose] = useState<ReacaoMascote>((a.pose as ReacaoMascote) ?? 'feliz')
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const marcar = (fn: () => void) => { fn(); setDirty(true) }

  function salvar() {
    start(async () => {
      try {
        await salvarTema({ assistente: { ativo, nome: nome.trim(), slogan: slogan.trim(), ajuda_mensagem: ajuda.trim(), pose } })
        setDirty(false); toast.success('Assistente salva!')
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      {/* ── Config ── */}
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">Assistente (mascote)</span>
            </div>
            <button type="button" onClick={() => marcar(() => setAtivo((v) => !v))} aria-label="Ativar assistente"
              className={`relative h-5 w-9 rounded-full transition-colors ${ativo ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ativo ? 'left-[1.15rem]' : 'left-0.5'}`} />
            </button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">A capivara aparece na <span className="font-medium text-foreground">Ajuda</span> do aluno de forma animada, com recados e reações.</p>

          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Nome</span>
              <input value={nome} onChange={(e) => marcar(() => setNome(e.target.value))} maxLength={24} placeholder="Ex.: Capi"
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Slogan</span>
              <input value={slogan} onChange={(e) => marcar(() => setSlogan(e.target.value))} maxLength={60} placeholder="Ex.: Rumo à aprovação, no seu ritmo."
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Mensagem na Ajuda</span>
              <textarea value={ajuda} onChange={(e) => marcar(() => setAjuda(e.target.value))} maxLength={220} rows={3}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Pose padrão</span>
              <div className="grid grid-cols-5 gap-1.5">
                {REACOES_MASCOTE.map((r) => (
                  <button key={r.id} type="button" onClick={() => marcar(() => setPose(r.id))} title={r.nome}
                    className={`flex aspect-square items-center justify-center rounded-lg border p-1 transition-colors ${pose === r.id ? 'border-primary bg-primary/10' : 'hover:border-primary/50'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/mascote/${r.id}.png`} alt={r.nome} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button type="button" onClick={salvar} disabled={pending || !dirty}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar assistente
        </button>
      </div>

      {/* ── Prévia ── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> Prévia</div>
          <div className={`flex min-h-[320px] items-center justify-center rounded-lg border bg-gradient-to-b from-muted/20 to-muted/5 p-6 ${ativo ? '' : 'opacity-50'}`}>
            {ativo ? (
              <Mascote reacao={pose} tamanho={150} balaoTitulo={nome || 'Assistente'} mensagem={ajuda || slogan || 'Olá! 👋'} />
            ) : (
              <p className="text-sm text-muted-foreground">Assistente desativada.</p>
            )}
          </div>
          {slogan && <p className="mt-3 text-center text-sm font-medium italic text-muted-foreground">“{slogan}”</p>}
        </div>
      </div>
    </div>
  )
}
