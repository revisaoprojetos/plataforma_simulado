'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { encaminharDuvidaRevisao, marcarReporteCorrigido, responderDuvidaRevisao } from './actions'

// Interações (client) da Central de Dúvidas: responder, encaminhar e marcar problema como corrigido.

export function ResponderDuvida({ duvidaId, professores, podeEditar }: { duvidaId: string; professores: Array<{ id: string; nome: string }>; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [texto, setTexto] = useState('')
  const [prof, setProf] = useState('')
  if (!podeEditar) return <p className="text-sm text-muted-foreground">Você pode ler as dúvidas, mas não tem permissão para responder.</p>
  return (
    <div className="space-y-3">
      <label className="block space-y-1.5 text-sm font-medium"><span>Sua resposta</span>
        <Textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a resposta. O aluno recebe um aviso na plataforma." />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pend} onClick={() => start(async () => {
          if (!texto.trim()) { toast.error('Escreva a resposta antes de enviar'); return }
          const r = await responderDuvidaRevisao(duvidaId, texto)
          if (r.ok) { toast.success('Resposta enviada'); setTexto(''); router.refresh() } else toast.error(r.error ?? 'Falha ao enviar.')
        })}><Send className="h-4 w-4" />Enviar resposta</Button>
        <select value={prof} onChange={(e) => setProf(e.target.value)} aria-label="Encaminhar para professor" className="h-8 rounded-lg border bg-background px-2 text-sm">
          <option value="">Encaminhar para professor…</option>
          {professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <Button variant="outline" disabled={pend} onClick={() => start(async () => {
          const p = professores.find((x) => x.id === prof)
          if (!p) { toast.error('Escolha o professor'); return }
          const r = await encaminharDuvidaRevisao(duvidaId, p.id, p.nome)
          if (r.ok) { toast.success(`Encaminhada para ${p.nome}`); setProf(''); router.refresh() } else toast.error(r.error ?? 'Falha ao encaminhar.')
        })}>Encaminhar</Button>
      </div>
    </div>
  )
}

export function CorrigidoBotao({ id }: { id: string }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  return (
    <Button size="sm" disabled={pend} onClick={() => start(async () => {
      const r = await marcarReporteCorrigido(id)
      if (r.ok) { toast.success('Marcado como corrigido. O aluno recebe um aviso'); router.refresh() } else toast.error(r.error ?? 'Falha ao marcar.')
    })}><Check className="h-4 w-4" />Corrigido</Button>
  )
}
