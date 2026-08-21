'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { CalendarDays, Gift, ListChecks, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  alternarAcessoGratuito,
  alternarLiberacao,
  atualizarCategoria,
  atualizarCronograma,
  criarCategoria,
  criarCronograma,
  excluirCategoria,
  excluirCronograma,
  type CategoriaRow,
  type CronogramaLista,
  type EntradaCronograma,
} from './actions'

/** Rótulo curto de cada dia da semana, indexado pelo número do dia (0=domingo). */
const DIAS = [
  { valor: 1, nome: 'Seg' },
  { valor: 2, nome: 'Ter' },
  { valor: 3, nome: 'Qua' },
  { valor: 4, nome: 'Qui' },
  { valor: 5, nome: 'Sex' },
  { valor: 6, nome: 'Sáb' },
  { valor: 0, nome: 'Dom' }, // por último: na semana de estudo o domingo fecha, não abre (R3)
]

const vazio = (): EntradaCronograma => ({
  nome: '',
  carga_horaria: 4,
  total_semanas: 34,
  dias_curso: [1, 2, 3, 4, 5, 6],
  dias_nome: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  semanas_revisao: [],
  categoria_id: null,
  subtitulo: null,
  ordem: 0,
})

export function CronogramasClient({
  inicial,
  categoriasIniciais,
}: {
  inicial: CronogramaLista[]
  categoriasIniciais: CategoriaRow[]
}) {
  const [itens, setItens] = useState(inicial)
  const [categorias, setCategorias] = useState(categoriasIniciais)
  const [categoriasAberto, setCategoriasAberto] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState('')
  const [pendente, iniciar] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaCronograma>(vazio())
  const [busca, setBusca] = useState('')

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return itens
    return itens.filter((c) => c.nome.toLowerCase().includes(t) || (c.categoria_nome ?? '').toLowerCase().includes(t))
  }, [itens, busca])

  // Agrupa por carga horária — é assim que o aluno escolhe (spec §4, passo 2).
  const porCarga = useMemo(() => {
    const mapa = new Map<number, CronogramaLista[]>()
    for (const c of filtrados) {
      const lista = mapa.get(c.carga_horaria)
      if (lista) lista.push(c)
      else mapa.set(c.carga_horaria, [c])
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0])
  }, [filtrados])

  function abrirNovo() {
    setEditando(null)
    setForm(vazio())
    setAberto(true)
  }

  function abrirEdicao(c: CronogramaLista) {
    setEditando(c.id)
    setForm({
      nome: c.nome,
      carga_horaria: c.carga_horaria,
      total_semanas: c.total_semanas,
      dias_curso: c.dias_curso,
      dias_nome: c.dias_nome,
      semanas_revisao: c.semanas_revisao,
      categoria_id: c.categoria_id,
      subtitulo: null,
      ordem: c.ordem,
    })
    setAberto(true)
  }

  function alternarDia(valor: number, nome: string) {
    setForm((f) => {
      const tem = f.dias_curso.includes(valor)
      const dias = tem ? f.dias_curso.filter((d) => d !== valor) : [...f.dias_curso, valor]
      // Reordena pela ordem de estudo (segunda primeiro, domingo por último) e mantém
      // dias_nome alinhado — a invariante que o banco também cobra.
      const ordenados = DIAS.filter((d) => dias.includes(d.valor))
      return { ...f, dias_curso: ordenados.map((d) => d.valor), dias_nome: ordenados.map((d) => d.nome) }
    })
  }

  function salvar() {
    iniciar(async () => {
      const r = editando ? await atualizarCronograma(editando, form) : await criarCronograma(form)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível salvar.')
        return
      }
      toast.success(editando ? 'Cronograma atualizado' : 'Cronograma criado')
      setAberto(false)
      if (editando) {
        setItens((xs) =>
          xs.map((c) =>
            c.id === editando
              ? { ...c, ...form, faixa: c.faixa, categoria_nome: categorias.find((k) => k.id === form.categoria_id)?.nome ?? null }
              : c,
          ),
        )
      } else {
        // Sem os campos derivados do servidor; a lista recarrega no próximo acesso.
        setItens((xs) => [
          ...xs,
          { ...(form as any), id: (r as any).id, slug: '', status: 'rascunho', acesso_gratuito: false, metas: 0, faixa: '' },
        ])
      }
    })
  }

  function liberar(c: CronogramaLista) {
    iniciar(async () => {
      const alvo = c.status !== 'liberado'
      const r = await alternarLiberacao(c.id, alvo)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível alterar.')
        return
      }
      toast.success(alvo ? 'Liberado para os alunos' : 'Voltou a rascunho')
      setItens((xs) => xs.map((x) => (x.id === c.id ? { ...x, status: alvo ? 'liberado' : 'rascunho' } : x)))
    })
  }

  function gratuito(c: CronogramaLista) {
    iniciar(async () => {
      const alvo = !c.acesso_gratuito
      const r = await alternarAcessoGratuito(c.id, alvo)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível alterar.')
        return
      }
      toast.success(alvo ? 'Liberado para todos os alunos' : 'Acesso gratuito desligado')
      setItens((xs) => xs.map((x) => (x.id === c.id ? { ...x, acesso_gratuito: alvo } : x)))
    })
  }

  function excluir(c: CronogramaLista) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir cronograma',
        mensagem: `"${c.nome}" sai do catálogo${c.metas ? ` junto com as ${c.metas} metas` : ''}. Você pode restaurar pela Lixeira.`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirCronograma(c.id)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Cronograma excluído')
      setItens((xs) => xs.filter((x) => x.id !== c.id))
    })
  }

  function adicionarCategoria() {
    const nome = novaCategoria.trim()
    if (!nome) return
    iniciar(async () => {
      const r = await criarCategoria(nome, null)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível criar.')
      toast.success(`Categoria "${nome}" criada`)
      setCategorias((xs) => [...xs, { id: (r as any).id, nome, slug: (r as any).slug ?? '', cor: null, ordem: xs.length, usos: 0 }])
      setNovaCategoria('')
    })
  }

  function renomearCategoria(c: CategoriaRow, nome: string) {
    iniciar(async () => {
      const r = await atualizarCategoria(c.id, nome, c.cor)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível renomear.')
      setCategorias((xs) => xs.map((x) => (x.id === c.id ? { ...x, nome } : x)))
      setItens((xs) => xs.map((x) => (x.categoria_id === c.id ? { ...x, categoria_nome: nome } : x)))
    })
  }

  function removerCategoria(c: CategoriaRow) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir categoria',
        mensagem:
          c.usos > 0
            ? `"${c.nome}" está em ${c.usos} cronograma(s). Eles não são excluídos — apenas ficam sem categoria.`
            : `Excluir a categoria "${c.nome}"?`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirCategoria(c.id)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
      toast.success('Categoria excluída')
      setCategorias((xs) => xs.filter((x) => x.id !== c.id))
      setItens((xs) => xs.map((x) => (x.categoria_id === c.id ? { ...x, categoria_id: null, categoria_nome: null } : x)))
    })
  }

  return (
    <>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={CalendarDays}
          titulo="Catálogo"
          subtitulo={`${itens.length} cronograma(s) · ${itens.filter((c) => c.status === 'liberado').length} liberado(s)`}
          acao={
            <div className="flex items-center gap-2">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                className="h-9 w-44"
              />
              <Button size="sm" variant="outline" onClick={() => setCategoriasAberto(true)}>
                <Tags className="mr-1 h-4 w-4" />
                Categorias
              </Button>
              <Button size="sm" onClick={abrirNovo}>
                <Plus className="mr-1 h-4 w-4" />
                Novo
              </Button>
            </div>
          }
        />

        {itens.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nenhum cronograma no catálogo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie um cronograma e depois importe as metas, ou use a importação para trazer o catálogo inteiro.
            </p>
            <Button className="mt-4" onClick={abrirNovo}>
              <Plus className="mr-1 h-4 w-4" />
              Criar o primeiro
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {porCarga.map(([carga, lista]) => (
              <div key={carga}>
                <div className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {carga}h por dia · {lista.length} cronograma(s)
                </div>
                {lista.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/cronogramas/${c.id}`} className="truncate font-medium hover:underline">
                          {c.nome}
                        </Link>
                        <Badge variant={c.status === 'liberado' ? 'default' : 'secondary'}>
                          {c.status === 'liberado' ? 'Liberado' : 'Rascunho'}
                        </Badge>
                        {c.acesso_gratuito && (
                          <Badge variant="outline" className="gap-1">
                            <Gift className="h-3 w-3" />
                            Gratuito
                          </Badge>
                        )}
                        {c.categoria_nome && <Badge variant="outline">{c.categoria_nome}</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.faixa} · {c.total_semanas} semanas
                        {c.semanas_revisao.length > 0 && ` (${c.semanas_revisao.length} de revisão)`} ·{' '}
                        {c.metas === 0 ? <span className="text-amber-600">sem metas</span> : `${c.metas} metas`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => gratuito(c)} disabled={pendente} title="Acesso gratuito para todos os alunos">
                        <Gift className={c.acesso_gratuito ? 'h-4 w-4 text-primary' : 'h-4 w-4'} />
                      </Button>
                      <Button size="sm" variant={c.status === 'liberado' ? 'secondary' : 'default'} onClick={() => liberar(c)} disabled={pendente}>
                        {c.status === 'liberado' ? 'Voltar a rascunho' : 'Liberar'}
                      </Button>
                      <Link href={`/admin/cronogramas/${c.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })} title="Metas do cronograma">
                        <ListChecks className="h-4 w-4" />
                      </Link>
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicao(c)} disabled={pendente} title="Editar metadados">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => excluir(c)} disabled={pendente}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar cronograma' : 'Novo cronograma'}</DialogTitle>
            <DialogDescription>
              As metas são cadastradas depois, uma a uma ou por importação. O cronograma nasce como rascunho.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="9 Matérias Essenciais (4 horas)"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Carga (h/dia)</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.5"
                  value={form.carga_horaria}
                  onChange={(e) => setForm((f) => ({ ...f, carga_horaria: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Semanas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.total_semanas}
                  onChange={(e) => setForm((f) => ({ ...f, total_semanas: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.ordem}
                  onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Dias de curso</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((d) => {
                  const ativo = form.dias_curso.includes(d.valor)
                  return (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => alternarDia(d.valor, d.nome)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${
                        ativo ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      {d.nome}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                A ordem é fixa: domingo, quando usado, é o último dia da semana de estudo.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Semanas de revisão originais</Label>
              <Input
                value={form.semanas_revisao.join(', ')}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    semanas_revisao: e.target.value
                      .split(',')
                      .map((s) => Number(s.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0),
                  }))
                }
                placeholder="12, 24"
              />
              <p className="text-xs text-muted-foreground">
                Semanas da grade original que não têm metas. Elas são descartadas na geração e substituídas
                pela periodicidade que o aluno escolher.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setCategoriasAberto(true)}>
                  Gerenciar categorias
                </button>
              </div>
              <Select
                value={form.categoria_id ?? 'nenhuma'}
                onValueChange={(v) => setForm((f) => ({ ...f, categoria_id: v === 'nenhuma' ? null : (v ?? null) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem categoria</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoriasAberto} onOpenChange={setCategoriasAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categorias</DialogTitle>
            <DialogDescription>
              Agrupam o catálogo. Renomear conserta em todos os cronogramas de uma vez; excluir não apaga
              cronograma nenhum, só os deixa sem categoria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {categorias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>}

            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input
                  defaultValue={c.nome}
                  onBlur={(e) => {
                    const nome = e.target.value.trim()
                    if (nome && nome !== c.nome) renomearCategoria(c, nome)
                  }}
                />
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                  {c.usos === 0 ? 'sem uso' : `${c.usos} cronograma(s)`}
                </span>
                <Button size="sm" variant="ghost" onClick={() => removerCategoria(c)} disabled={pendente}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2 border-t pt-3">
              <Input
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionarCategoria()
                }}
                placeholder="Nome da categoria (ex.: Pré-Edital)"
              />
              <Button size="sm" onClick={adicionarCategoria} disabled={pendente || !novaCategoria.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Renomear é seguro: a chave usada pela importação não muda junto.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCategoriasAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
