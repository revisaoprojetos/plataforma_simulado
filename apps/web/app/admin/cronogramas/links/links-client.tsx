'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, ExternalLink, Layers, Link2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  atualizarLink,
  atualizarPlataforma,
  criarLink,
  criarPlataforma,
  excluirLink,
  excluirPlataforma,
  type EntradaLink,
  type LinkAulaRow,
  type PlataformaRow,
} from './actions'

const vazio = (): EntradaLink => ({ disciplina: '', aula: '', tema: null, urls: [] })

export function LinksClient({
  inicial,
  plataformasIniciais,
  faltandoInicial,
}: {
  inicial: LinkAulaRow[]
  plataformasIniciais: PlataformaRow[]
  faltandoInicial: { disciplina: string; aula: string; metas: number }[]
}) {
  const [itens, setItens] = useState(inicial)
  const [plataformas, setPlataformas] = useState(plataformasIniciais)
  const [faltando, setFaltando] = useState(faltandoInicial)
  const [pendente, iniciar] = useTransition()
  const [busca, setBusca] = useState('')

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaLink>(vazio())

  const [plataformasAberto, setPlataformasAberto] = useState(false)
  const [novaPlataforma, setNovaPlataforma] = useState('')

  const porId = useMemo(() => new Map(plataformas.map((p) => [p.id, p])), [plataformas])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return itens
    return itens.filter(
      (l) => l.disciplina.toLowerCase().includes(t) || l.aula.toLowerCase().includes(t) || (l.tema ?? '').toLowerCase().includes(t),
    )
  }, [itens, busca])

  const porDisciplina = useMemo(() => {
    const mapa = new Map<string, LinkAulaRow[]>()
    for (const l of filtrados) {
      const lista = mapa.get(l.disciplina)
      if (lista) lista.push(l)
      else mapa.set(l.disciplina, [l])
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [filtrados])

  /** Plataformas ainda não usadas neste formulário — o seletor só oferece essas. */
  const disponiveis = useMemo(
    () => plataformas.filter((p) => p.ativo && !form.urls.some((u) => u.plataforma_id === p.id)),
    [plataformas, form.urls],
  )

  function abrirNovo(pre?: { disciplina: string; aula: string }) {
    setEditando(null)
    setForm({ ...vazio(), ...(pre ?? {}) })
    setAberto(true)
  }

  function abrirEdicao(l: LinkAulaRow) {
    setEditando(l.id)
    setForm({ disciplina: l.disciplina, aula: l.aula, tema: l.tema, urls: l.urls.map((u) => ({ ...u })) })
    setAberto(true)
  }

  function adicionarLinha(plataformaId: string | null) {
    if (!plataformaId) return
    setForm((f) => ({ ...f, urls: [...f.urls, { plataforma_id: plataformaId, url: '' }] }))
  }

  function salvar() {
    iniciar(async () => {
      const r = editando ? await atualizarLink(editando, form) : await criarLink(form)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível salvar.')
        return
      }
      toast.success(editando ? 'Link atualizado' : 'Link criado')
      setAberto(false)
      const urlsLimpas = form.urls.filter((u) => u.url.trim())
      if (editando) {
        setItens((xs) => xs.map((l) => (l.id === editando ? { ...l, ...form, urls: urlsLimpas } : l)))
      } else {
        setItens((xs) => [...xs, { ...form, urls: urlsLimpas, id: (r as any).id, usos: 0 }])
        setFaltando((xs) => xs.filter((f) => !(f.disciplina === form.disciplina.trim() && f.aula === form.aula.trim())))
      }
    })
  }

  function remover(l: LinkAulaRow) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir link',
        mensagem:
          l.usos > 0
            ? `${l.disciplina} · aula ${l.aula} é citado por ${l.usos} meta(s) de questões. Sem ele, o aluno verá "Não há link cadastrado para esta aula".`
            : `Excluir o link de ${l.disciplina} · aula ${l.aula}?`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirLink(l.id)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Link excluído')
      setItens((xs) => xs.filter((x) => x.id !== l.id))
    })
  }

  function adicionarPlataforma() {
    const nome = novaPlataforma.trim()
    if (!nome) return
    iniciar(async () => {
      const r = await criarPlataforma(nome, null)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível criar.')
        return
      }
      toast.success(`Plataforma "${nome}" cadastrada`)
      setPlataformas((xs) => [
        ...xs,
        { id: (r as any).id, nome, slug: '', cor: null, ordem: xs.length, ativo: true, usos: 0 },
      ])
      setNovaPlataforma('')
    })
  }

  function renomearPlataforma(p: PlataformaRow, nome: string) {
    iniciar(async () => {
      const r = await atualizarPlataforma(p.id, nome, p.cor)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível renomear.')
        return
      }
      setPlataformas((xs) => xs.map((x) => (x.id === p.id ? { ...x, nome } : x)))
    })
  }

  function removerPlataforma(p: PlataformaRow) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir plataforma',
        mensagem:
          p.usos > 0
            ? `"${p.nome}" é usada em ${p.usos} link(s) de aula. Excluí-la remove esses links junto.`
            : `Excluir a plataforma "${p.nome}"?`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirPlataforma(p.id)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Plataforma excluída')
      setPlataformas((xs) => xs.filter((x) => x.id !== p.id))
      setItens((xs) => xs.map((l) => ({ ...l, urls: l.urls.filter((u) => u.plataforma_id !== p.id) })))
    })
  }

  return (
    <>
      {faltando.length > 0 && (
        <AlertBox variante="aviso" titulo={`${faltando.length} aula(s) de questões sem link`} icon={AlertTriangle}>
          <p className="text-sm">
            Nessas metas o aluno vê “Não há link cadastrado para esta aula”. Clique para cadastrar já com a
            disciplina e a aula preenchidas.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {faltando.slice(0, 24).map((f) => (
              <button
                key={`${f.disciplina}|${f.aula}`}
                onClick={() => abrirNovo(f)}
                className="rounded-md border border-dashed px-2 py-1 text-xs hover:bg-muted"
              >
                {f.disciplina} · aula {f.aula}
                <span className="ml-1 text-muted-foreground">({f.metas})</span>
              </button>
            ))}
            {faltando.length > 24 && <span className="self-center text-xs text-muted-foreground">e mais {faltando.length - 24}…</span>}
          </div>
        </AlertBox>
      )}

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Link2}
          titulo="Links de aula"
          subtitulo={`${itens.length} aula(s) · ${plataformas.length} plataforma(s) cadastrada(s)`}
          acao={
            <div className="flex items-center gap-2">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-9 w-44" />
              <Button size="sm" variant="outline" onClick={() => setPlataformasAberto(true)}>
                <Layers className="mr-1 h-4 w-4" />
                Plataformas
              </Button>
              <Button size="sm" onClick={() => abrirNovo()}>
                <Plus className="mr-1 h-4 w-4" />
                Novo
              </Button>
            </div>
          }
        />

        {itens.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Link2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nenhum link cadastrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada aula pode ter um link por plataforma. É também aqui que vive o tema da aula, usado como
              título na ficha de desempenho.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {porDisciplina.map(([disciplina, lista]) => (
              <div key={disciplina}>
                <div className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {disciplina} · {lista.length} aula(s)
                </div>
                {lista.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <Badge variant="outline" className="shrink-0 font-mono">
                      {l.aula}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{l.tema ?? <span className="italic text-muted-foreground">sem tema</span>}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.usos === 0 ? 'nenhuma meta usa' : `${l.usos} meta(s) de questões`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {l.urls.length === 0 && <span className="text-xs italic text-amber-600">sem link</span>}
                      {l.urls.map((u) => {
                        const p = porId.get(u.plataforma_id)
                        return (
                          <a
                            key={u.plataforma_id}
                            href={u.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border px-2 py-0.5 text-xs text-primary hover:bg-muted"
                            style={p?.cor ? { borderColor: p.cor } : undefined}
                          >
                            {p?.nome ?? 'plataforma'} <ExternalLink className="inline h-3 w-3" />
                          </a>
                        )
                      })}
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicao(l)} disabled={pendente}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remover(l)} disabled={pendente}>
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

      {/* Formulário do link — disciplina, aula, tema e N links por plataforma. */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar link' : 'Novo link de aula'}</DialogTitle>
            <DialogDescription>
              O par disciplina + aula é a chave, e o casamento é exato: “01” não encontra “1”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Disciplina</Label>
                <Input
                  value={form.disciplina}
                  onChange={(e) => setForm((f) => ({ ...f, disciplina: e.target.value }))}
                  placeholder="Direito Constitucional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Aula</Label>
                <Input value={form.aula} onChange={(e) => setForm((f) => ({ ...f, aula: e.target.value }))} placeholder="01" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tema</Label>
              <Input
                value={form.tema ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, tema: e.target.value }))}
                placeholder="Princípios fundamentais"
              />
              <p className="text-xs text-muted-foreground">Vira o título da linha na ficha de desempenho.</p>
            </div>

            <div className="space-y-2">
              <Label>Links por plataforma</Label>

              {form.urls.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum link ainda. Escolha uma plataforma abaixo.</p>
              )}

              {form.urls.map((u, i) => {
                const p = porId.get(u.plataforma_id)
                return (
                  <div key={u.plataforma_id} className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-32 shrink-0 justify-center">
                      {p?.nome ?? 'plataforma'}
                    </Badge>
                    <Input
                      value={u.url}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          urls: f.urls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                        }))
                      }
                      placeholder="https://…"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm((f) => ({ ...f, urls: f.urls.filter((_, j) => j !== i) }))}
                      title="Remover este link"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}

              {disponiveis.length > 0 ? (
                <Select value="" onValueChange={adicionarLinha}>
                  <SelectTrigger>
                    <SelectValue placeholder="+ Adicionar link de outra plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {disponiveis.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {plataformas.length === 0 ? (
                    <>
                      Nenhuma plataforma cadastrada.{' '}
                      <button className="text-primary underline" onClick={() => setPlataformasAberto(true)}>
                        Cadastre a primeira
                      </button>
                      .
                    </>
                  ) : (
                    'Todas as plataformas já têm link nesta aula.'
                  )}
                </p>
              )}
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

      {/* Cadastro de plataformas. */}
      <Dialog open={plataformasAberto} onOpenChange={setPlataformasAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plataformas de curso</DialogTitle>
            <DialogDescription>
              Bancos de questões e cursos onde a aula pode ter link. Cada aula tem no máximo um link por
              plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {plataformas.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Input
                  defaultValue={p.nome}
                  onBlur={(e) => {
                    const nome = e.target.value.trim()
                    if (nome && nome !== p.nome) renomearPlataforma(p, nome)
                  }}
                />
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {p.usos === 0 ? 'sem uso' : `${p.usos} link(s)`}
                </span>
                <Button size="sm" variant="ghost" onClick={() => removerPlataforma(p)} disabled={pendente}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2 border-t pt-3">
              <Input
                value={novaPlataforma}
                onChange={(e) => setNovaPlataforma(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionarPlataforma()
                }}
                placeholder="Nome da plataforma (ex.: Gran Cursos)"
              />
              <Button size="sm" onClick={adicionarPlataforma} disabled={pendente || !novaPlataforma.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Renomear é seguro: a chave usada pela importação não muda junto.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlataformasAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
