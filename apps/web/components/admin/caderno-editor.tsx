'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Save, Type, ListChecks, ArrowUp, ArrowDown, Trash2, Plus, Search, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { salvarCadernoConfig, type CadernoConfig, type CadernoBloco } from '@/app/admin/cadernos/actions'

interface QDisp { id: string; enunciado: string; tipo: string; disciplina: string | null }

function uid() {
  try { return crypto.randomUUID() } catch { return 'b' + Date.now() + Math.round(Math.random() * 1e6) }
}

export function CadernoEditor({
  cadernoId, nome, configInicial, questoesDisponiveis,
}: {
  cadernoId: string
  nome: string
  configInicial: CadernoConfig
  questoesDisponiveis: QDisp[]
}) {
  const [cabecalho, setCabecalho] = useState(configInicial.cabecalho ?? nome)
  const [instrucoes, setInstrucoes] = useState(configInicial.instrucoes ?? '')
  const [blocos, setBlocos] = useState<CadernoBloco[]>(configInicial.blocos ?? [])
  const [busca, setBusca] = useState('')
  const [pending, start] = useTransition()

  const enunMap = new Map(questoesDisponiveis.map((q) => [q.id, q]))
  const usados = new Set(blocos.filter((b) => b.tipo === 'questao').map((b) => b.questao_id))
  const filtradas = questoesDisponiveis
    .filter((q) => !usados.has(q.id))
    .filter((q) => !busca.trim() || q.enunciado.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 12)

  function addTexto() {
    setBlocos((b) => [...b, { id: uid(), tipo: 'texto', conteudo: '' }])
  }
  function addQuestao(qid: string) {
    setBlocos((b) => [...b, { id: uid(), tipo: 'questao', questao_id: qid }])
  }
  function mover(i: number, dir: -1 | 1) {
    setBlocos((b) => {
      const j = i + dir
      if (j < 0 || j >= b.length) return b
      const cp = [...b]
      ;[cp[i], cp[j]] = [cp[j], cp[i]]
      return cp
    })
  }
  function remover(id: string) {
    setBlocos((b) => b.filter((x) => x.id !== id))
  }
  function setTexto(id: string, conteudo: string) {
    setBlocos((b) => b.map((x) => (x.id === id ? { ...x, conteudo } : x)))
  }

  function salvar() {
    start(async () => {
      const r = await salvarCadernoConfig(cadernoId, { cabecalho, instrucoes, blocos })
      r.ok ? toast.success('Caderno salvo') : toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  const totalQuestoes = blocos.filter((b) => b.tipo === 'questao').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{nome}</h1>
          <p className="text-muted-foreground">{totalQuestoes} questão(ões) · {blocos.length} bloco(s)</p>
        </div>
        <div className="flex gap-2">
          <a href={`/imprimir/caderno/${cadernoId}`} target="_blank" rel="noreferrer">
            <Button variant="outline"><Printer className="mr-2 h-4 w-4" /> Imprimir/PDF</Button>
          </a>
          <Button onClick={salvar} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Cabeçalho (título no topo da prova)</label>
            <Input value={cabecalho} onChange={(e) => setCabecalho(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Instruções</label>
            <textarea value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} rows={2}
              placeholder="Ex.: Leia atentamente. Duração 4h…"
              className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </CardContent>
      </Card>

      {/* Blocos */}
      <div className="space-y-3">
        {blocos.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Adicione blocos de texto e questões abaixo para montar a prova.
          </div>
        )}
        {blocos.map((b, i) => {
          const q = b.tipo === 'questao' ? enunMap.get(b.questao_id ?? '') : null
          return (
            <div key={b.id} className="flex gap-2 rounded-lg border bg-card p-3">
              <div className="flex flex-col gap-1">
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === blocos.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </div>
              <div className="min-w-0 flex-1">
                {b.tipo === 'texto' ? (
                  <textarea value={b.conteudo ?? ''} onChange={(e) => setTexto(b.id, e.target.value)} rows={2}
                    placeholder="Texto / enunciado de bloco…"
                    className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                ) : (
                  <div className="text-sm">
                    <span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {q?.tipo === 'discursiva' ? 'Discursiva' : 'Questão'}
                    </span>
                    <span className="text-muted-foreground">{q ? q.enunciado.slice(0, 90) : '(questão removida)'}</span>
                  </div>
                )}
              </div>
              <button onClick={() => remover(b.id)} className="self-start text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
            </div>
          )
        })}
      </div>

      {/* Adicionar blocos */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addTexto}><Type className="mr-2 h-4 w-4" /> Adicionar texto</Button>
            <span className="text-sm text-muted-foreground"><ListChecks className="mr-1 inline h-4 w-4" /> ou adicione questões:</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar questão pelo enunciado…"
              className="w-full rounded-md border bg-[var(--input-bg,transparent)] py-2 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="max-h-64 space-y-1 overflow-auto">
            {filtradas.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Nenhuma questão disponível.</p>
            ) : filtradas.map((q) => (
              <button key={q.id} onClick={() => addQuestao(q.id)}
                className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm hover:bg-muted">
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{q.enunciado.slice(0, 80)}</span>
                {q.disciplina && <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{q.disciplina}</span>}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
