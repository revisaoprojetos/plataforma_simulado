'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Trash2, Upload } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { SubstituirModal } from '@/components/admin/estudio/substituir-modal'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { TIPOS_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import type { ItemFila, OpcaoMaterial } from '@/lib/admin-revisao/atualizacoes'
import { criarPedidoAtualizacaoAction, descartarPedidoAction, registrarAtualizacaoAction } from './actions'

const CAMPO = 'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function FilaLista({ itens, podeEditar }: { itens: ItemFila[]; podeEditar: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [troca, setTroca] = useState<ItemFila | null>(null)

  async function descartar(f: ItemFila) {
    if (!(await confirmar({ titulo: 'Descartar pedido', mensagem: 'Descartar este pedido de atualização?', confirmar: 'Descartar', destrutivo: true }))) return
    iniciar(async () => {
      const r = await descartarPedidoAction(f.id)
      if (!r.ok) { toast.error(r.error || 'Não foi possível descartar.'); return }
      toast.success('Pedido descartado.'); router.refresh()
    })
  }

  if (!itens.length) return <p className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Nada para atualizar agora.</p>
  return (
    <>
      <div className="space-y-2">
        {itens.map((f) => (
          <div key={f.chave} className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card p-3 shadow-sm">
            <span className={cn('mt-0.5 h-12 w-1 shrink-0 rounded-full', f.fonte === 'reporte' ? 'bg-amber-500' : 'bg-primary')} aria-hidden />
            <div className="min-w-0 flex-1">
              <b className="block text-sm">{f.material}</b>
              <small className="block text-xs text-muted-foreground">{f.texto}</small>
              <small className="block text-xs text-muted-foreground">{f.origem} · {formatBrt(f.quando)}</small>
            </div>
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setTroca(f)}><Upload />Trocar arquivo</Button>
                <Link href={`/admin/revisao/atualizacoes?aba=nova&doc=${f.documentoId}&src=${f.fonte}:${f.id}`} className={buttonVariants({ size: 'sm' })}><Check />Registrar atualização</Link>
                {f.fonte === 'pedido' && <Button variant="ghost" size="icon-sm" disabled={pendente} onClick={() => descartar(f)} aria-label="Descartar pedido"><Trash2 /></Button>}
              </div>
            )}
          </div>
        ))}
      </div>
      {troca && <SubstituirModal open onClose={() => setTroca(null)} documentoId={troca.documentoId} titulo={troca.material} onSubstituido={() => router.refresh()} />}
    </>
  )
}

export function FormRegistrar({ opcoes, docInicial, origem }: { opcoes: OpcaoMaterial[]; docInicial: string | null; origem: { tipo: 'reporte' | 'pedido'; id: string } | null }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [doc, setDoc] = useState(docInicial ?? opcoes[0]?.id ?? '')
  const [tipo, setTipo] = useState<TipoAtualizacao>('legislacao')
  const [texto, setTexto] = useState('')
  const [avisar, setAvisar] = useState(true)
  const [inicio, setInicio] = useState(true)
  const [troca, setTroca] = useState(false)
  const rotulo = opcoes.find((o) => o.id === doc)?.rotulo ?? 'Material'

  function publicar() {
    if (!doc) { toast.error('Escolha o material.'); return }
    if (!texto.trim()) { toast.error('Escreva o que mudou.'); return }
    iniciar(async () => {
      const r = await registrarAtualizacaoAction({ documentoId: doc, tipo, texto, avisarAlunos: avisar, mostrarInicio: inicio, origem })
      if (!r.ok) { toast.error(r.error || 'Não foi possível registrar.'); return }
      toast.success(avisar ? `Atualização publicada. ${r.avisados ?? 0} aluno(s) avisado(s) no sino.` : 'Atualização publicada sem aviso aos alunos.')
      router.push('/admin/revisao/atualizacoes?aba=hist')
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Material</span>
          <select value={doc} onChange={(e) => setDoc(e.target.value)} className={CAMPO}>
            {opcoes.length === 0 && <option value="">Busque um material acima</option>}
            {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
        </label>
        <div className="space-y-1.5 text-sm">
          <span className="font-medium">Tipo de atualização</span>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_ATUALIZACAO.map((t) => (
              <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium', tipo === t.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                {tipo === t.id && <Check className="h-3 w-3" />}{t.nome}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">O que mudou</span>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} placeholder="Ex.: incluída a nova redação do art. 37 e o julgado mais recente sobre o tema" />
        <small className="block text-xs text-muted-foreground">Aparece para o aluno em “Novidades da versão”, no topo do PDF, junto com o selo “Atualizado em”.</small>
      </label>
      <label className="flex items-center gap-3 text-sm"><Switch checked={avisar} onCheckedChange={setAvisar} aria-label="Avisar alunos" />Avisar os alunos que têm este material (notificação e e-mail)</label>
      <label className="flex items-center gap-3 text-sm"><Switch checked={inicio} onCheckedChange={setInicio} aria-label="Mostrar nas novidades do Início" />Mostrar nas novidades do Início do aluno</label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={publicar} disabled={pendente}><Check />Publicar atualização</Button>
        <Button variant="outline" onClick={() => doc ? setTroca(true) : toast.error('Escolha o material.')}><Upload />Trocar o arquivo antes</Button>
      </div>
      {troca && <SubstituirModal open onClose={() => setTroca(false)} documentoId={doc} titulo={rotulo} />}
    </div>
  )
}

export function FormPedido({ opcoes, docInicial }: { opcoes: OpcaoMaterial[]; docInicial: string | null }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [doc, setDoc] = useState(docInicial ?? opcoes[0]?.id ?? '')
  const [texto, setTexto] = useState('')
  const [origem, setOrigem] = useState('')
  function enviar() {
    iniciar(async () => {
      const r = await criarPedidoAtualizacaoAction({ documentoId: doc, texto, origem })
      if (!r.ok) { toast.error(r.error || 'Não foi possível criar o pedido.'); return }
      toast.success('Pedido incluído na fila.'); setTexto(''); setOrigem(''); router.refresh()
    })
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block space-y-1.5 text-sm"><span className="font-medium">Material</span>
        <select value={doc} onChange={(e) => setDoc(e.target.value)} className={CAMPO}>
          {opcoes.length === 0 && <option value="">Busque um material acima</option>}
          {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm"><span className="font-medium">De quem é o pedido</span>
        <input value={origem} onChange={(e) => setOrigem(e.target.value)} maxLength={120} placeholder="Pedido da Coordenação Pedagógica" className={CAMPO} />
      </label>
      <label className="block space-y-1.5 text-sm md:col-span-2"><span className="font-medium">O que precisa ser atualizado</span>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder="Ex.: conferir o material com o último julgado do STF sobre o tema" />
      </label>
      <div className="md:col-span-2"><Button onClick={enviar} disabled={pendente || !doc || !texto.trim()}>Incluir na fila</Button></div>
    </div>
  )
}
