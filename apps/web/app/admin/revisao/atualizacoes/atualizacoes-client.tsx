'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, History, Search, Trash2, Upload, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SubstituirModal } from '@/components/admin/estudio/substituir-modal'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { TIPOS_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import { TEXTO_SEM_ATUALIZACAO } from '@/lib/conteudo/atualizacoes-tipos'
import type { ItemFila, OpcaoMaterial } from '@/lib/admin-revisao/atualizacoes'
import { LIMITE_LOTE } from '@/lib/admin-revisao/atualizacoes-filtros'
import { MaterialAbreEditor } from '../duvidas/duvidas-client'
import { buscarMateriaisAction, criarPedidoAtualizacaoAction, descartarPedidoAction, registrarAtualizacaoAction, registrarAtualizacaoEmLoteAction } from './actions'

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
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                {podeEditar && <MaterialAbreEditor documentoId={f.documentoId} titulo="Abrir no editor" />}
                <Link href={`/admin/revisao/atualizacoes/material/${f.documentoId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><History className="h-3 w-3" />Linha do tempo</Link>
              </span>
              <small className="block text-xs text-muted-foreground">{f.texto}</small>
              <small className="block text-xs text-muted-foreground">{f.origem} · {formatBrt(f.quando)}</small>
            </div>
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setTroca(f)}><Upload />Trocar arquivo</Button>
                <Link href={`/admin/revisao/atualizacoes?aba=fila&registrar=1&doc=${f.documentoId}&src=${f.fonte}:${f.id}`} className={buttonVariants({ size: 'sm' })}><Check />Registrar atualização</Link>
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

/** Pop-up de "Registrar atualização": aberto por ?registrar=1 (o conteúdo é montado no servidor); fechar volta para a aba atual. */
export function RegistrarModal({ aberto, hrefFechar, children }: { aberto: boolean; hrefFechar: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) router.replace(hrefFechar, { scroll: false }) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar atualização</DialogTitle>
          <DialogDescription>Escolha o material, diga o que mudou e publique. O aluno vê no selo “Atualizado em” e nas “Novidades da versão”.</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Seletor de materiais ADICIONAIS (lote): busca no servidor por título, acumula a seleção no cliente (até o limite do lote). */
function SeletorLote({ principal, extras, setExtras }: { principal: string; extras: OpcaoMaterial[]; setExtras: (v: OpcaoMaterial[]) => void }) {
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<OpcaoMaterial[]>([])
  const [buscando, iniciar] = useTransition()
  const marcados = new Set(extras.map((e) => e.id))
  const cheio = extras.length + 1 >= LIMITE_LOTE

  function procurar() {
    if (!busca.trim()) { setAchados([]); return }
    iniciar(async () => {
      const r = await buscarMateriaisAction(busca)
      if (!r.ok) { toast.error(r.error || 'Falha na busca.'); return }
      setAchados((r.itens ?? []).filter((o) => o.id !== principal))
    })
  }
  function alternar(o: OpcaoMaterial) {
    if (marcados.has(o.id)) setExtras(extras.filter((e) => e.id !== o.id))
    else if (cheio) toast.error(`O lote aceita no máximo ${LIMITE_LOTE} materiais.`)
    else setExtras([...extras, o])
  }
  return (
    <details className="rounded-xl border bg-card p-3" open={extras.length > 0}>
      <summary className="cursor-pointer select-none text-sm font-semibold text-primary">Aplicar a outros materiais (lote){extras.length > 0 && ` · ${extras.length} adicionado(s)`}</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); procurar() } }} placeholder="Buscar materiais pelo título" className={CAMPO} />
          <Button type="button" variant="outline" disabled={buscando} onClick={procurar}><Search />Buscar</Button>
        </div>
        {achados.length > 0 && (
          <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
            {achados.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                  <input type="checkbox" checked={marcados.has(o.id)} onChange={() => alternar(o)} />{o.rotulo}
                </label>
              </li>
            ))}
          </ul>
        )}
        {extras.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {extras.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs">
                {e.rotulo}
                <button type="button" onClick={() => setExtras(extras.filter((x) => x.id !== e.id))} aria-label="Remover" className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <small className="block text-xs text-muted-foreground">Até {LIMITE_LOTE} materiais por lote (incluindo o escolhido acima). O mesmo texto, tipo e fonte valem para todos.</small>
      </div>
    </details>
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
  const [dataMud, setDataMud] = useState('')
  const [fonte, setFonte] = useState('')
  const [fonteUrl, setFonteUrl] = useState('')
  const [trecho, setTrecho] = useState('')
  const [jaBaixou, setJaBaixou] = useState(false)
  const [extras, setExtras] = useState<OpcaoMaterial[]>([])
  const [chave] = useState(() => crypto.randomUUID()) // idempotência do lote: reenvio não duplica
  const rotulo = opcoes.find((o) => o.id === doc)?.rotulo ?? 'Material'

  function escolherTipo(t: TipoAtualizacao) {
    setTipo(t)
    if (t === 'sem_atualizacao') { setTexto((x) => (!x.trim() ? TEXTO_SEM_ATUALIZACAO : x)); setAvisar(false); setInicio(false) }
    else if (tipo === 'sem_atualizacao') { setTexto((x) => (x === TEXTO_SEM_ATUALIZACAO ? '' : x)); setAvisar(true); setInicio(true) }
  }

  function publicar() {
    if (!doc) { toast.error('Escolha o material.'); return }
    if (!texto.trim()) { toast.error('Escreva o que mudou.'); return }
    const comum = { tipo, texto, avisarAlunos: avisar, mostrarInicio: inicio, dataMudanca: dataMud, fonteOrigem: fonte, fonteUrl, trechoAfetado: trecho, avisarJaBaixou: jaBaixou }
    iniciar(async () => {
      const ids = [...new Set([doc, ...extras.map((e) => e.id)])]
      if (ids.length > 1) {
        const r = await registrarAtualizacaoEmLoteAction({ ...comum, documentoIds: ids, chave })
        if (!r.ok) { toast.error(r.error || 'Não foi possível registrar o lote.'); return }
        toast.success(`${r.gravados ?? 0} atualização(ões) registrada(s)${r.ignorados ? ` · ${r.ignorados} já estavam gravada(s)` : ''}${avisar ? ` · ${r.avisados ?? 0} aluno(s) avisado(s)` : ''}.`)
      } else {
        const r = await registrarAtualizacaoAction({ ...comum, documentoId: doc, origem })
        if (!r.ok) { toast.error(r.error || 'Não foi possível registrar.'); return }
        toast.success(avisar ? `Atualização publicada. ${r.avisados ?? 0} aluno(s) avisado(s) no sino.` : 'Atualização publicada sem aviso aos alunos.')
      }
      router.push('/admin/revisao/atualizacoes?aba=hist')
    })
  }

  return (
    <div className="space-y-4">
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
              <button key={t.id} type="button" onClick={() => escolherTipo(t.id)}
                className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium', tipo === t.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                {tipo === t.id && <Check className="h-3 w-3" />}{t.nome}
              </button>
            ))}
          </div>
        </div>
      </div>
      <SeletorLote principal={doc} extras={extras} setExtras={setExtras} />
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">O que mudou</span>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} placeholder="Ex.: incluída a nova redação do art. 37 e o julgado mais recente sobre o tema" />
        <small className="block text-xs text-muted-foreground">Aparece para o aluno em “Novidades da versão”, no topo do PDF, junto com o selo “Atualizado em”.</small>
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Fonte / origem <small className="font-normal text-muted-foreground">(opcional)</small></span>
          <input value={fonte} onChange={(e) => setFonte(e.target.value)} maxLength={300} placeholder="Ex.: Lei 15.000/2026 · STF, RE 1.234.567" className={CAMPO} />
        </label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Link da fonte <small className="font-normal text-muted-foreground">(opcional)</small></span>
          <input value={fonteUrl} onChange={(e) => setFonteUrl(e.target.value)} maxLength={500} inputMode="url" placeholder="https://…" className={CAMPO} />
        </label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Trecho afetado <small className="font-normal text-muted-foreground">(opcional)</small></span>
          <input value={trecho} onChange={(e) => setTrecho(e.target.value)} maxLength={300} placeholder="Ex.: arts. 5º e 37 · pp. 12–14" className={CAMPO} />
        </label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Data da mudança <small className="font-normal text-muted-foreground">(vazio = hoje, Brasília)</small></span>
          <input type="date" value={dataMud} onChange={(e) => setDataMud(e.target.value)} className={CAMPO} />
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm"><Switch checked={avisar} onCheckedChange={setAvisar} aria-label="Avisar alunos" />Avisar os alunos que têm este material (notificação e e-mail)</label>
      <label className="flex items-center gap-3 text-sm"><Switch checked={jaBaixou} onCheckedChange={setJaBaixou} aria-label="Avisar quem já baixou" />Avisar quem já baixou o material <small className="text-xs text-muted-foreground">(apenas registra a intenção; nenhum envio novo)</small></label>
      <label className="flex items-center gap-3 text-sm"><Switch checked={inicio} onCheckedChange={setInicio} aria-label="Mostrar nas novidades do Início" />Mostrar nas novidades do Início do aluno</label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={publicar} disabled={pendente}><Check />{extras.length ? `Publicar em ${extras.length + 1} materiais` : 'Publicar atualização'}</Button>
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
