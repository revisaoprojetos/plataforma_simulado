'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CampoCs, INPUT_CS, chipCls } from '@/components/admin/revisao/cs-ui'
import { cn } from '@/lib/utils'
import { BARRA_EVENTO } from '@/lib/admin-revisao/cs-estilos'
import { EVENTO_TIPOS, type EventoCal, type EventoTipo, type GrupoOpcao } from '@/lib/admin-revisao/cs-tipos'
import { criarEventoAction, excluirEventoAction } from './actions'

/** Painel lateral: "Criar evento neste dia" + "Neste dia" (com apagar). */
export function EventoForm({ dia, diaTxt, grupos, doDia, podeEditar }: { dia: string; diaTxt: string; grupos: GrupoOpcao[]; doDia: EventoCal[]; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [titulo, setTitulo] = useState(''); const [tipo, setTipo] = useState<EventoTipo>('live')
  const [hora, setHora] = useState('19:00'); const [grupoId, setGrupoId] = useState('')
  const [link, setLink] = useState(''); const [lembrete, setLembrete] = useState(true)
  const [apagar, setApagar] = useState<string | null>(null)

  function criar() {
    start(async () => {
      const r = await criarEventoAction({ titulo, tipo, data: dia, hora, grupoId: grupoId || null, link, lembrete })
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível criar.'); return }
      toast.success('Evento criado e no calendário dos alunos do grupo')
      setTitulo(''); setLink(''); router.refresh()
    })
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirEventoAction(id); setApagar(null)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível apagar.'); return }
      toast.success('Evento apagado'); router.refresh()
    })
  }

  return (
    <aside className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{diaTxt}</div>
        <h2 className="mt-1 text-base font-bold">Criar evento neste dia</h2>
      </div>
      {podeEditar ? (<>
        <CampoCs rotulo="Nome do evento"><input className={INPUT_CS} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Live de correção do simulado" maxLength={140} /></CampoCs>
        <div className="grid gap-1.5 text-sm"><span className="font-medium">Tipo</span>
          <div className="flex flex-wrap gap-2">{EVENTO_TIPOS.map((t) => <button key={t.k} type="button" className={chipCls(tipo === t.k)} onClick={() => setTipo(t.k)}>{t.rotulo}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoCs rotulo="Horário"><input className={INPUT_CS} type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></CampoCs>
          <CampoCs rotulo="Para quem">
            <select className={INPUT_CS} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </CampoCs>
        </div>
        <CampoCs rotulo="Link (YouTube, Zoom ou simulado)"><input className={INPUT_CS} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></CampoCs>
        <label className="flex items-center gap-2 text-sm"><Switch checked={lembrete} onCheckedChange={setLembrete} /> Lembrar os alunos 1 hora antes</label>
        <Button size="lg" disabled={pend || !titulo.trim()} onClick={criar}><Plus /> Criar evento</Button>
      </>) : <p className="text-sm text-muted-foreground">Você pode ver o calendário, mas não criar eventos.</p>}

      <div>
        <h3 className="mb-2 mt-1 text-sm font-semibold">Neste dia</h3>
        <div className="grid gap-2">
          {doDia.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>}
          {doDia.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-xl border p-3">
              <span className={cn('h-9 w-1 shrink-0 rounded-full', BARRA_EVENTO[e.tipo])} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{e.titulo}</div>
                <div className="truncate text-xs text-muted-foreground">{e.data.slice(8, 10)}/{e.data.slice(5, 7)} · {e.hora} · {e.grupoNome ?? 'Todos'}{e.lembrete ? ' · lembrete 1 h antes' : ''}</div>
              </div>
              {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" aria-label="Abrir link" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
              {podeEditar && (apagar === e.id ? (
                <span className="inline-flex items-center gap-1 text-xs">Apagar?
                  <Button variant="destructive" size="xs" disabled={pend} onClick={() => excluir(e.id)}>Sim</Button>
                  <Button variant="ghost" size="xs" onClick={() => setApagar(null)}>Não</Button>
                </span>
              ) : <Button variant="ghost" size="icon-sm" aria-label="Apagar evento" onClick={() => setApagar(e.id)}><Trash2 /></Button>)}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
