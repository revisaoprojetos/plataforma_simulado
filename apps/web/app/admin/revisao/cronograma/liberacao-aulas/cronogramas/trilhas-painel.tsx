'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarSync, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Pilula } from '../../../_comp/lista'
import { dataBr } from '../tipos'
import { CORES_TRILHA, OFFSET_PADRAO, type EntradaTrilha, type PreviaRecalculo, type Trilha } from '../tipos-trilhas'
import { chamarTrilhas } from './api'
import { ImportarTrilhas } from './importar-trilhas-dialogo'

// Cabeçalho da aba Cronogramas: CRUD das trilhas (cronogramas de referência), importar a 2ª aba da planilha e
// "Recalcular data-base". A lista é pequena (≤ ~10 trilhas por produto): sem paginação.

const CAMPO = 'h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function TrilhasPainel({ produtoId, trilhas, podeEditar }: { produtoId: string; trilhas: Trilha[]; podeEditar: boolean }) {
  return (
    <section className="mb-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Cronogramas de referência</h3>
          <p className="text-xs text-muted-foreground">Cada cronograma de referência tem a data da aula nele. Só tem efeito para o aluno nas aulas que têm regra do tipo Cronograma (veja o Mapa de regras do produto). Liberação = data do cronograma − antecedência (offset), ou a data manual quando existir. Quem casa em vários cronogramas recebe a menor data.</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <ImportarTrilhas produtoId={produtoId} />
            <Recalcular produtoId={produtoId} />
            <TrilhaDialogo produtoId={produtoId} />
          </div>
        )}
      </div>
      {trilhas.length === 0 ? (
        <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma trilha ainda. Importe a 2ª aba “Data em cada cronograma” da planilha ou crie uma trilha.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {trilhas.map((t) => (
            <li key={t.id} className={cn('flex items-start gap-3 rounded-xl border p-3', !t.ativo && 'opacity-60')}>
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full border" style={{ background: t.cor ?? 'var(--primary)' }} aria-hidden />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm" title={t.nome}>{t.nome}</b>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.aulasComData.toLocaleString('pt-BR')} aula(s) · início {dataBr(t.inicioCronograma)} · offset {t.offsetDias} dia(s)
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!t.ativo && <Pilula tipo="mut">inativa</Pilula>}
                  {t.segmentoIds.length === 0 ? <Pilula tipo="warn">sem regra</Pilula> : <Pilula tipo="vio">{t.segmentoIds.length} segmento(s)</Pilula>}
                </div>
              </div>
              {podeEditar && <TrilhaDialogo produtoId={produtoId} trilha={t} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TrilhaDialogo({ produtoId, trilha }: { produtoId: string; trilha?: Trilha }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [f, setF] = useState<EntradaTrilha>(() => estadoInicial(trilha))
  const abrir = () => { setF(estadoInicial(trilha)); setAberto(true) }

  function salvar() {
    iniciar(async () => {
      const r = await chamarTrilhas('salvarTrilha', produtoId, { entrada: f })
      if (!r.ok) return void toast.error(r.error)
      toast.success(trilha ? 'Cronograma de referência atualizado.' : 'Cronograma de referência criado.')
      setAberto(false); router.refresh()
    })
  }
  async function excluir() {
    if (!trilha) return
    if (!(await confirmar({ titulo: 'Excluir trilha', mensagem: `Excluir “${trilha.nome}” e as ${trilha.aulasComData} data(s) dela? A data-base das aulas não muda até você recalcular.`, confirmar: 'Excluir', destrutivo: true }))) return
    iniciar(async () => {
      const r = await chamarTrilhas('excluirTrilha', produtoId, { trilhaId: trilha.id })
      if (!r.ok) return void toast.error(r.error)
      toast.success('Cronograma de referência excluído.'); setAberto(false); router.refresh()
    })
  }

  return (
    <>
      {trilha
        ? <Button size="icon" variant="ghost" onClick={abrir} aria-label={`Editar ${trilha.nome}`}><Pencil /></Button>
        : <Button size="sm" onClick={abrir}><Plus />Nova trilha</Button>}
      <Dialog open={aberto} onOpenChange={(v) => !pendente && setAberto(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{trilha ? 'Editar trilha' : 'Nova trilha'}</DialogTitle>
            <DialogDescription>Um cronograma de referência do produto (ex.: 9 Matérias Essenciais).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={f.nome} maxLength={120} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea rows={2} value={f.descricao ?? ''} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Início do cronograma</Label><input type="date" className={CAMPO} value={f.inicioCronograma ?? ''} onChange={(e) => setF({ ...f, inicioCronograma: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Antecedência (dias)</Label><input type="number" min={0} max={730} className={CAMPO} value={f.offsetDias} onChange={(e) => setF({ ...f, offsetDias: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Ordem</Label><input type="number" min={0} className={CAMPO} value={f.ordem ?? 0} onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Situação</Label>
                <select className={CAMPO} value={f.ativo ? 'sim' : 'nao'} onChange={(e) => setF({ ...f, ativo: e.target.value === 'sim' })}><option value="sim">Ativa</option><option value="nao">Inativa</option></select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {CORES_TRILHA.map((c) => (
                  <button key={c} type="button" onClick={() => setF({ ...f, cor: c })} aria-label={`Cor ${c}`} className={cn('h-7 w-7 rounded-full border-2', f.cor === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            {trilha && <Button variant="ghost" className="mr-auto text-destructive" disabled={pendente} onClick={excluir}><Trash2 />Excluir</Button>}
            <Button variant="ghost" disabled={pendente} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={pendente || !f.nome.trim()} onClick={salvar}>{pendente && <Loader2 className="animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function estadoInicial(t?: Trilha): EntradaTrilha {
  return t
    ? { id: t.id, nome: t.nome, descricao: t.descricao, cor: t.cor, inicioCronograma: t.inicioCronograma, offsetDias: t.offsetDias, ativo: t.ativo, ordem: t.ordem }
    : { nome: '', descricao: '', cor: CORES_TRILHA[0], inicioCronograma: null, offsetDias: OFFSET_PADRAO, ativo: true }
}

/** Grava em simulado_produto_liberacao_aulas.data_liberacao a MENOR liberação entre os cronogramas de referência ativos — com prévia. */
function Recalcular({ produtoId }: { produtoId: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [gravando, iniciar] = useTransition()
  const [previa, setPrevia] = useState<PreviaRecalculo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setAberto(true); setPrevia(null); setErro(null); setCarregando(true)
    const r = await chamarTrilhas<{ previa: PreviaRecalculo }>('previaRecalculo', produtoId)
    setCarregando(false)
    if (!r.ok) setErro(r.error); else setPrevia(r.previa)
  }
  function aplicar() {
    iniciar(async () => {
      const r = await chamarTrilhas<{ atualizadas: number }>('aplicarRecalculo', produtoId)
      if (!r.ok) return void toast.error(r.error)
      toast.success(`Data-base recalculada: ${r.atualizadas} aula(s) atualizada(s).`)
      setAberto(false); router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir} title="Grava, em cada aula, a menor data de liberação entre os cronogramas de referência ativos"><CalendarSync />Recalcular data-base</Button>
      <Dialog open={aberto} onOpenChange={(v) => !gravando && setAberto(v)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recalcular data-base</DialogTitle>
            <DialogDescription>A data-base de cada aula passa a ser a MENOR liberação entre todos os cronogramas de referência ativos. Aulas que não estão em nenhum cronograma de referência ficam como estão. Fica registrado no log.</DialogDescription>
          </DialogHeader>
          {carregando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando…</p>}
          {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          {previa && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-4">
                {([['Aulas', previa.total, ''], ['Vão mudar', previa.mudam, previa.mudam ? 'warn' : ''], ['Antecipam', previa.antecipam, ''], ['Adiam', previa.adiam, previa.adiam ? 'warn' : '']] as const).map(([r, v, t]) => (
                  <div key={r} className="rounded-xl border bg-card p-3"><span className="block text-xs uppercase tracking-wide text-muted-foreground">{r}</span><b className={cn('text-2xl tabular-nums', t === 'warn' && 'text-amber-700 dark:text-amber-400')}>{v}</b></div>
                ))}
              </div>
              {previa.semTrilha > 0 && <p className="text-xs text-muted-foreground">{previa.semTrilha} aula(s) não aparecem em nenhum cronograma de referência ativo e não serão alteradas.</p>}
              {previa.mudam === 0
                ? <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">A data-base já está igual ao cálculo das trilhas. Nada a fazer.</p>
                : (
                  <div className="max-h-64 overflow-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card"><tr className="border-b text-left uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2">Nº</th><th className="px-2 py-2">Aula</th><th className="px-2 py-2">Hoje</th><th className="px-2 py-2">Passa a</th></tr></thead>
                      <tbody>
                        {previa.amostra.map((m) => (
                          <tr key={m.aulaId} className="border-b last:border-0">
                            <td className="px-2 py-1.5 tabular-nums">{m.ordem}</td>
                            <td className="px-2 py-1.5"><b className="font-medium">{m.disciplina}</b> · {m.titulo}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{dataBr(m.de)}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 font-medium tabular-nums">{dataBr(m.para)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previa.mudam > previa.amostra.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">… e mais {previa.mudam - previa.amostra.length} aula(s).</p>}
                  </div>
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={gravando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={!previa || previa.mudam === 0 || gravando} onClick={aplicar}>{gravando && <Loader2 className="animate-spin" />}Aplicar em {previa?.mudam ?? 0} aula(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
