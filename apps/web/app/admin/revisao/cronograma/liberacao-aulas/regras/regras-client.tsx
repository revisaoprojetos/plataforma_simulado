'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Pencil, Plus, RefreshCw, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { novaCondicao, novoId, resumoRegra, type Segmento } from '@/lib/segmentos/tipos'
import { SegmentoEditor } from '@/app/admin/conteudos/produtos/[id]/segmento-editor'
import { Pilula } from '../../../_comp/lista'
import type { ContagemAudiencia, SegmentoLeve, Trilha } from '../tipos-trilhas'
import { chamarTrilhas } from '../cronogramas/api'

// Regras por trilha: escolher os Segmentos (o MESMO motor/criador do Estúdio de conteúdo) que dão acesso à trilha e ver quantos
// alunos casam. A contagem avalia cada aluno com acesso ao produto (amostra de até 2.000), é feita sob demanda e fica em cache 10 min.

export function RegrasClient({ produtoId, trilhas, segmentos, nomesIniciais, podeEditar }: {
  produtoId: string; trilhas: Trilha[]; segmentos: SegmentoLeve[]; nomesIniciais: Record<string, string>; podeEditar: boolean
}) {
  const router = useRouter()
  const [segs, setSegs] = useState<SegmentoLeve[]>(segmentos)
  const [nomes, setNomes] = useState<Record<string, string>>(nomesIniciais)
  const [escolhidos, setEscolhidos] = useState<Record<string, string[]>>(() => Object.fromEntries(trilhas.map((t) => [t.id, t.segmentoIds])))
  const [contagem, setContagem] = useState<ContagemAudiencia | null>(null)
  const [contando, iniciarContagem] = useTransition()
  const [edit, setEdit] = useState<Trilha | null>(null)
  const porId = useMemo(() => new Map(segs.map((s) => [s.id, s])), [segs])

  function contar(forcar = false) {
    iniciarContagem(async () => {
      const r = await chamarTrilhas<{ contagem: ContagemAudiencia }>('contarAudiencia', produtoId, { forcar })
      if (!r.ok) return void toast.error(r.error)
      setContagem(r.contagem)
    })
  }
  const quantos = (id: string) => contagem?.porTrilha.find((c) => c.trilhaId === id)?.alunos

  return (
    <>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Alunos por trilha</h3>
          {contagem ? (
            <p className="text-xs text-muted-foreground">
              {contagem.audiencia.toLocaleString('pt-BR')} aluno(s) com acesso ao produto avaliados{contagem.amostrado ? ` (amostra: o produto tem ${contagem.total.toLocaleString('pt-BR')})` : ''}
              {' · '}<b className="text-foreground">{contagem.emVarias.toLocaleString('pt-BR')}</b> em mais de uma trilha (recebem a menor data)
              {' · '}<b className="text-foreground">{contagem.semTrilha.toLocaleString('pt-BR')}</b> sem cronograma de referência (seguem a data-base)
              {' · '}calculado às {new Date(contagem.calculadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : <p className="text-xs text-muted-foreground">Conta quem tem acesso ao produto e casa nos segmentos de cada trilha (pode levar alguns segundos).</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={contando || trilhas.every((t) => !(escolhidos[t.id]?.length))} onClick={() => contar(!!contagem)}>
            {contando ? <Loader2 className="animate-spin" /> : contagem ? <RefreshCw /> : <Users />}{contagem ? 'Recontar' : 'Contar alunos'}
          </Button>
        </div>
      </section>

      {trilhas.length === 0
        ? <p className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma trilha. Crie ou importe as trilhas na aba “Cronogramas”.</p>
        : (
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {trilhas.map((t) => {
              const ids = escolhidos[t.id] ?? []
              const n = quantos(t.id)
              return (
                <li key={t.id} className={cn('rounded-2xl border bg-card p-4 shadow-sm', !t.ativo && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border" style={{ background: t.cor ?? 'var(--primary)' }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate" title={t.nome}>{t.nome}</b>
                      <small className="text-muted-foreground">{t.aulasComData.toLocaleString('pt-BR')} aula(s){!t.ativo ? ' · inativa' : ''}</small>
                    </div>
                    {contagem && n != null && <Pilula tipo={n ? 'ok' : 'mut'}>{n.toLocaleString('pt-BR')} aluno(s)</Pilula>}
                    {podeEditar && <Button size="sm" variant="outline" onClick={() => setEdit(t)}><Pencil />Segmentos</Button>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ids.length === 0 && <Pilula tipo="warn">sem regra — ninguém casa automaticamente</Pilula>}
                    {ids.map((id) => {
                      const s = porId.get(id)
                      return <span key={id} title={s?.resumo ?? ''} className="inline-flex max-w-full items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"><span className="truncate">{s?.nome ?? '(segmento removido)'}</span></span>
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

      {edit && (
        <SeletorSegmentos
          produtoId={produtoId} trilha={edit} segs={segs} nomes={nomes} inicial={escolhidos[edit.id] ?? []}
          onNomes={(n) => setNomes((x) => ({ ...x, ...n }))}
          onNovoSegmento={(sg) => setSegs((l) => [...l.filter((x) => x.id !== sg.id), { id: sg.id, nome: sg.nome, resumo: resumoRegra(sg.regra, nomes), regra: sg.regra }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))}
          onSalvo={(ids) => { setEscolhidos((e) => ({ ...e, [edit.id]: ids })); setContagem(null); setEdit(null); router.refresh() }}
          onFechar={() => setEdit(null)}
        />
      )}
    </>
  )
}

function passaporte(): Segmento {
  const c = novaCondicao('grupo')
  return {
    id: '', nome: 'Passaporte Vitalício', descricao: 'Alunos do Passaporte Vitalício: casam em todos os cronogramas de referência e recebem a menor data de cada aula.',
    regra: { op: 'e', grupos: [{ id: novoId(), op: 'e', condicoes: [c] }] }, atualizado_em: null,
  }
}

function SeletorSegmentos({ produtoId, trilha, segs, nomes, inicial, onNomes, onNovoSegmento, onSalvo, onFechar }: {
  produtoId: string; trilha: Trilha; segs: SegmentoLeve[]; nomes: Record<string, string>; inicial: string[]
  onNomes: (n: Record<string, string>) => void; onNovoSegmento: (s: Segmento) => void; onSalvo: (ids: string[]) => void; onFechar: () => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set(inicial))
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState<Segmento | null | undefined>(undefined) // undefined = lista; null/objeto = editor
  const [pendente, iniciar] = useTransition()
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? segs.filter((s) => `${s.nome} ${s.resumo}`.toLowerCase().includes(q)) : segs
  }, [segs, busca])

  function salvar() {
    iniciar(async () => {
      const ids = [...marcados]
      const r = await chamarTrilhas('salvarSegmentosTrilha', produtoId, { trilhaId: trilha.id, segmentoIds: ids })
      if (!r.ok) return void toast.error(r.error)
      toast.success('Regra da trilha salva.'); onSalvo(ids)
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pendente && onFechar()}>
      <DialogContent showCloseButton={false} className={cn('flex flex-col gap-0 overflow-hidden p-0', novo !== undefined ? 'h-[min(90vh,800px)] w-[min(1080px,calc(100vw-2rem))] max-w-[min(1080px,calc(100vw-2rem))] sm:max-w-[min(1080px,calc(100vw-2rem))]' : 'max-h-[85vh] sm:max-w-2xl')}>
        {novo !== undefined ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <SegmentoEditor
              key={novo?.id ?? 'novo'} seg={novo} produtoId={produtoId} podeEditar nomes={nomes} onNomes={onNomes} onVoltar={() => setNovo(undefined)}
              onSalvo={(sg) => { onNovoSegmento(sg); setMarcados((m) => new Set(m).add(sg.id)); setNovo(undefined) }} />
          </div>
        ) : (
          <>
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>Quem segue “{trilha.nome}”</DialogTitle>
              <DialogDescription>Marque os Segmentos que dão acesso a este cronograma de referência. O aluno que casar em qualquer um deles segue o cronograma; casando em vários cronogramas, vale a menor data.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
              <label className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar segmento" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <Button size="sm" variant="outline" onClick={() => setNovo(passaporte())}><Plus />Criar segmento Passaporte Vitalício</Button>
              <Button size="sm" variant="outline" onClick={() => setNovo(null)}><Plus />Novo segmento</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {filtrados.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{segs.length ? 'Nenhum segmento encontrado.' : 'Nenhum segmento ainda. Crie o primeiro (ex.: Passaporte Vitalício).'}</p>}
              {filtrados.map((s) => {
                const on = marcados.has(s.id)
                return (
                  <label key={s.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60', on && 'bg-primary/5')}>
                    <input type="checkbox" checked={on} onChange={(e) => setMarcados((m) => { const n = new Set(m); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n })} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{s.nome}</b>
                      <small className="block text-xs text-muted-foreground">{s.resumo}</small>
                    </span>
                    {on && <Check className="mt-1 h-4 w-4 text-primary" />}
                  </label>
                )
              })}
            </div>
            <DialogFooter className="border-t px-6 py-3">
              <span className="mr-auto self-center text-xs text-muted-foreground">{marcados.size} segmento(s) marcado(s)</span>
              <Button variant="ghost" disabled={pendente} onClick={onFechar}>Cancelar</Button>
              <Button disabled={pendente} onClick={salvar}>{pendente && <Loader2 className="animate-spin" />}Salvar regra</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
