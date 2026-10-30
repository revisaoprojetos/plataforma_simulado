'use client'

// Editor do FAQ da Ajuda do aluno (por tenant). CRUD de TEMAS (título) e, dentro de cada tema,
// de PERGUNTAS (pergunta + resposta). Reordena temas e perguntas (setas). Salva via server action
// (salvarAjudaFaq) com useTransition + toast. Remoções destrutivas confirmam via confirmar().
// shadcn (Input/Textarea/Button/Card) + tokens; sem hex, sem ícone Sparkles.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronUp, ChevronDown, Save, HelpCircle, Undo2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { FAQ_PADRAO, type Tema } from '@/lib/ajuda/faq'
import { salvarAjudaFaq } from '@/app/admin/configuracoes/ajuda/actions'

/** Move o item `i` do array na direção `dir` (-1 sobe, +1 desce). Imutável. */
function mover<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const copy = [...arr]
  ;[copy[i], copy[j]] = [copy[j], copy[i]]
  return copy
}

export function AjudaFaqForm({ faqInicial }: { faqInicial: Tema[] }) {
  const [temas, setTemas] = useState<Tema[]>(faqInicial)
  const [salvando, start] = useTransition()

  // ── mutações de TEMA ────────────────────────────────────────────────
  const setTitulo = (ti: number, titulo: string) =>
    setTemas((ts) => ts.map((t, i) => (i === ti ? { ...t, titulo } : t)))
  const addTema = () =>
    setTemas((ts) => [...ts, { titulo: '', perguntas: [{ q: '' }] }])
  const moverTema = (ti: number, dir: -1 | 1) => setTemas((ts) => mover(ts, ti, dir))
  async function removerTema(ti: number) {
    if (!(await confirmar({ mensagem: `Remover o tema “${temas[ti].titulo || 'Sem título'}” e todas as suas perguntas?`, destrutivo: true, confirmar: 'Remover' }))) return
    setTemas((ts) => ts.filter((_, i) => i !== ti))
  }

  // ── mutações de PERGUNTA ────────────────────────────────────────────
  const setPergunta = (ti: number, pi: number, campo: 'q' | 'a', valor: string) =>
    setTemas((ts) => ts.map((t, i) => (i === ti
      ? { ...t, perguntas: t.perguntas.map((p, j) => (j === pi ? { ...p, [campo]: valor } : p)) }
      : t)))
  const addPergunta = (ti: number) =>
    setTemas((ts) => ts.map((t, i) => (i === ti ? { ...t, perguntas: [...t.perguntas, { q: '' }] } : t)))
  const moverPergunta = (ti: number, pi: number, dir: -1 | 1) =>
    setTemas((ts) => ts.map((t, i) => (i === ti ? { ...t, perguntas: mover(t.perguntas, pi, dir) } : t)))
  async function removerPergunta(ti: number, pi: number) {
    if (!(await confirmar({ mensagem: 'Remover esta pergunta?', destrutivo: true, confirmar: 'Remover' }))) return
    setTemas((ts) => ts.map((t, i) => (i === ti ? { ...t, perguntas: t.perguntas.filter((_, j) => j !== pi) } : t)))
  }

  async function restaurarPadrao() {
    if (!(await confirmar({ mensagem: 'Restaurar o FAQ padrão? As alterações não salvas serão perdidas.', confirmar: 'Restaurar' }))) return
    setTemas(FAQ_PADRAO)
  }

  function salvar() {
    start(async () => {
      try {
        // Envia apenas temas/perguntas com conteúdo (título + ao menos uma pergunta não-vazia).
        const limpo: Tema[] = temas
          .map((t) => ({ titulo: t.titulo.trim(), perguntas: t.perguntas.filter((p) => p.q.trim()).map((p) => ({ q: p.q.trim(), ...(p.a?.trim() ? { a: p.a.trim() } : {}) })) }))
          .filter((t) => t.titulo && t.perguntas.length)
        await salvarAjudaFaq(limpo)
        toast.success('Ajuda salva!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar a Ajuda')
      }
    })
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Temas e perguntas</CardTitle>
            <CardDescription>
              Cada tema vira um bloco na Ajuda do aluno. As perguntas abrem em acordeão, revelando a resposta.
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={restaurarPadrao} className="shrink-0">
            <Undo2 className="h-4 w-4" /> Restaurar padrão
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {temas.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <HelpCircle className="h-6 w-6" />
              <p className="text-sm">Nenhum tema. A Ajuda do aluno usará o conteúdo padrão enquanto estiver vazia.</p>
            </div>
          )}

          {temas.map((tema, ti) => (
            <div key={ti} className="space-y-3 rounded-lg border bg-muted/30 p-4">
              {/* cabeçalho do tema: título + mover/remover */}
              <div className="flex items-center gap-2">
                <Input
                  value={tema.titulo}
                  onChange={(e) => setTitulo(ti, e.target.value)}
                  placeholder="Título do tema (ex.: Primeiros passos)"
                  className="h-9 flex-1 font-semibold"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={ti === 0} onClick={() => moverTema(ti, -1)} aria-label="Mover tema para cima"><ChevronUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={ti === temas.length - 1} onClick={() => moverTema(ti, 1)} aria-label="Mover tema para baixo"><ChevronDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removerTema(ti)} aria-label="Remover tema"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* perguntas do tema */}
              <div className="space-y-3 pl-1">
                {tema.perguntas.map((p, pi) => (
                  <div key={pi} className="space-y-2 rounded-lg border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={p.q}
                        onChange={(e) => setPergunta(ti, pi, 'q', e.target.value)}
                        placeholder="Pergunta"
                        className="h-8 flex-1 text-sm"
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={pi === 0} onClick={() => moverPergunta(ti, pi, -1)} aria-label="Mover pergunta para cima"><ChevronUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={pi === tema.perguntas.length - 1} onClick={() => moverPergunta(ti, pi, 1)} aria-label="Mover pergunta para baixo"><ChevronDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removerPergunta(ti, pi)} aria-label="Remover pergunta"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <Textarea
                      value={p.a ?? ''}
                      onChange={(e) => setPergunta(ti, pi, 'a', e.target.value)}
                      placeholder="Resposta (opcional — em branco mostra “Sem detalhes por enquanto”)"
                      className="min-h-0 text-sm"
                      rows={2}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addPergunta(ti)}>
                  <Plus className="h-4 w-4" /> Adicionar pergunta
                </Button>
              </div>
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addTema}>
            <Plus className="h-4 w-4" /> Adicionar tema
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={salvar} disabled={salvando}>
          <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar Ajuda'}
        </Button>
      </div>
    </div>
  )
}
