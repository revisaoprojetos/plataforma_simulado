'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { buscarAlunos, criarExcecoes } from './actions-alunos'
import type { AlunoOpcao, AulaOpt, GrupoOpcao, ModuloOpcao } from './tipos-alunos'

// Diálogo de criação de exceções (liberar/bloquear aula ou módulo) para UM aluno (fixoAluno) ou em massa
// (várias aulas/módulos × vários alunos/grupos). A validação real é no servidor (criarExcecoes).

const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function ListaMarcavel<T extends { id: string }>({ itens, sel, onToggle, rotulo, placeholder, vazio }: {
  itens: T[]; sel: Set<string>; onToggle: (id: string) => void; rotulo: (i: T) => ReactNode; placeholder: string; vazio: string
}) {
  const [f, setF] = useState('')
  const vis = useMemo(() => {
    const t = f.trim().toLowerCase()
    return (t ? itens.filter((i) => String(rotulo(i) as string).toLowerCase().includes(t)) : itens).slice(0, 200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, f])
  return (
    <div className="rounded-lg border">
      <label className="relative block border-b">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={f} onChange={(e) => setF(e.target.value)} placeholder={placeholder} className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none" />
      </label>
      <ul className="max-h-44 overflow-y-auto p-1">
        {vis.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
              <input type="checkbox" checked={sel.has(i.id)} onChange={() => onToggle(i.id)} />
              <span className="min-w-0 flex-1 truncate">{rotulo(i)}</span>
            </label>
          </li>
        ))}
        {!vis.length && <li className="px-2 py-2 text-xs text-muted-foreground">{vazio}</li>}
      </ul>
    </div>
  )
}

interface PropsBase {
  produtoId: string
  aulas: AulaOpt[]
  modulos: ModuloOpcao[]
  grupos: GrupoOpcao[]
  fixoAluno?: AlunoOpcao
  inicial?: { tipo: 'aula' | 'modulo'; id: string; acao: 'liberar' | 'bloquear' }
  titulo?: string
}

/** Versão com botão próprio (trigger recebe a função de abrir). */
export function ExcecaoDialogo({ trigger, ...p }: PropsBase & { trigger: (abrir: () => void) => ReactNode }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      {trigger(() => setAberto(true))}
      {aberto && <ExcecaoDialogoControlado {...p} onFechar={() => setAberto(false)} />}
    </>
  )
}

/** Versão controlada: monte-a quando quiser abrir; `onFechar` desmonta. O estado nasce de `inicial`. */
export function ExcecaoDialogoControlado({ produtoId, aulas, modulos, grupos, fixoAluno, inicial, titulo, onFechar }: PropsBase & { onFechar: () => void }) {
  const router = useRouter()
  const aberto = true
  const setAberto = (o: boolean) => { if (!o) onFechar() }
  const [pend, iniciar] = useTransition()
  const [tipo, setTipo] = useState<'aula' | 'modulo'>(inicial?.tipo ?? 'aula')
  const [alvos, setAlvos] = useState<Set<string>>(new Set(inicial ? [inicial.id] : []))
  const [acao, setAcao] = useState<'liberar' | 'bloquear'>(inicial?.acao ?? 'liberar')
  const [motivo, setMotivo] = useState('')
  const [validade, setValidade] = useState('')
  const [alunos, setAlunos] = useState<AlunoOpcao[]>([])
  const [grupoSel, setGrupoSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<AlunoOpcao[]>([])
  const [buscando, iniciarBusca] = useTransition()

  const alternar = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n }
  const itensAlvo: Array<{ id: string; t: string }> = tipo === 'aula' ? aulas.map((a) => ({ id: a.id, t: `${a.disciplina} — ${a.titulo}` })) : modulos.map((m) => ({ id: m.id, t: m.titulo }))

  function procurar() {
    iniciarBusca(async () => setAchados(await buscarAlunos(produtoId, busca)))
  }
  function salvar() {
    iniciar(async () => {
      const r = await criarExcecoes(produtoId, {
        alvos: [...alvos].map((id) => ({ tipo, id })),
        alunoIds: fixoAluno ? [fixoAluno.id] : alunos.map((a) => a.id),
        grupoIds: fixoAluno ? [] : [...grupoSel],
        acao, motivo, validade,
      })
      if (!r.ok) return void toast.error(r.error)
      toast.success(`${r.criadas} exceção(ões) criada(s)${r.ignoradas ? ` · ${r.ignoradas} já existiam` : ''}`)
      setAberto(false); router.refresh()
    })
  }
  const semDestino = !fixoAluno && !alunos.length && !grupoSel.size

  return (
    <>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{titulo ?? 'Nova exceção de liberação'}</DialogTitle>
            <DialogDescription>
              {fixoAluno ? <>Vale só para <b>{fixoAluno.nome}</b>. </> : null}A exceção vence sobre trilha e planilha. Use a validade para que ela expire sozinha.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Label>O que {acao === 'liberar' ? 'liberar' : 'bloquear'}</Label>
                <select value={tipo} onChange={(e) => { setTipo(e.target.value as 'aula' | 'modulo'); setAlvos(new Set()) }} className={cn(CAMPO, 'h-8 text-xs')} aria-label="Tipo de alvo">
                  <option value="aula">Aulas</option>
                  <option value="modulo">Módulos (matérias inteiras)</option>
                </select>
                <span className="ml-auto text-xs text-muted-foreground">{alvos.size} selecionado(s)</span>
              </div>
              <ListaMarcavel itens={itensAlvo} sel={alvos} onToggle={(id) => setAlvos((s) => alternar(s, id))} rotulo={(i) => i.t} placeholder={tipo === 'aula' ? 'Filtrar aulas…' : 'Filtrar módulos…'} vazio="Nada encontrado." />
            </div>

            {!fixoAluno && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label>Alunos</Label>
                  <div className="flex gap-1">
                    <Input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); procurar() } }} placeholder="Nome ou e-mail (Enter)" />
                    <Button type="button" variant="outline" size="sm" onClick={procurar} disabled={buscando || busca.trim().length < 2}>{buscando ? <Loader2 className="animate-spin" /> : <Search />}</Button>
                  </div>
                  {achados.length > 0 && (
                    <ul className="max-h-32 overflow-y-auto rounded-lg border p-1">
                      {achados.map((a) => (
                        <li key={a.id}>
                          <button type="button" className="w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => setAlunos((l) => l.some((x) => x.id === a.id) ? l : [...l, a])}>
                            {a.nome} <span className="text-xs text-muted-foreground">{a.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {alunos.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs">
                        {a.nome}<button type="button" aria-label="Remover" onClick={() => setAlunos((l) => l.filter((x) => x.id !== a.id))}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label>Grupos / turmas</Label>
                  <ListaMarcavel itens={grupos} sel={grupoSel} onToggle={(id) => setGrupoSel((s) => alternar(s, id))} rotulo={(g) => g.nome} placeholder="Filtrar grupos…" vazio="Nenhum grupo." />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Ação</Label>
                <select value={acao} onChange={(e) => setAcao(e.target.value as 'liberar' | 'bloquear')} className={CAMPO}>
                  <option value="liberar">Liberar (abre mesmo antes da data)</option>
                  <option value="bloquear">Bloquear (fecha mesmo depois da data)</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Válida até (opcional)</Label>
                <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={CAMPO} />
              </div>
              <div className="grid gap-1.5 sm:col-span-1">
                <Label>Motivo</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ex.: pedido do suporte" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={pend}>Cancelar</Button>
            <Button onClick={salvar} disabled={pend || !alvos.size || semDestino}>{pend && <Loader2 className="animate-spin" />}Criar exceção</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
