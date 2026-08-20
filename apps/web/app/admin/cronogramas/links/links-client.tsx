'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { atualizarLink, criarLink, excluirLink, type EntradaLink, type LinkAulaRow } from './actions'

const vazio = (): EntradaLink => ({ disciplina: '', aula: '', tema: null, url_qc: null, url_tec: null })

export function LinksClient({
  inicial,
  faltandoInicial,
}: {
  inicial: LinkAulaRow[]
  faltandoInicial: { disciplina: string; aula: string; metas: number }[]
}) {
  const [itens, setItens] = useState(inicial)
  const [faltando, setFaltando] = useState(faltandoInicial)
  const [pendente, iniciar] = useTransition()
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaLink>(vazio())

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

  const semTema = itens.filter((l) => !l.tema).length

  function abrirNovo(pre?: { disciplina: string; aula: string }) {
    setEditando(null)
    setForm({ ...vazio(), ...(pre ?? {}) })
    setAberto(true)
  }

  function abrirEdicao(l: LinkAulaRow) {
    setEditando(l.id)
    setForm({ disciplina: l.disciplina, aula: l.aula, tema: l.tema, url_qc: l.url_qc, url_tec: l.url_tec })
    setAberto(true)
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
      if (editando) {
        setItens((xs) => xs.map((l) => (l.id === editando ? { ...l, ...form } : l)))
      } else {
        setItens((xs) => [...xs, { ...form, id: (r as any).id, usos: 0 }])
        // O par deixou de estar órfão.
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
            ? `${l.disciplina} · aula ${l.aula} é citado por ${l.usos} meta(s) de questões. Sem o link, o aluno verá "Não há link do QC/TEC".`
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

  return (
    <>
      {faltando.length > 0 && (
        <AlertBox variante="aviso" titulo={`${faltando.length} aula(s) de questões sem link`} icon={AlertTriangle}>
          <p className="text-sm">
            Nessas metas o aluno vê “Não há link do QC / TEC”. Clique para cadastrar já com a disciplina e a
            aula preenchidas.
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
          subtitulo={`${itens.length} link(s)${semTema ? ` · ${semTema} sem tema` : ''}`}
          acao={
            <div className="flex items-center gap-2">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-9 w-44" />
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
              Os links aparecem nas metas de questões da grade do aluno. É também aqui que vive o tema da aula,
              usado como título na ficha de desempenho.
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
                      <p className="truncate text-sm">{l.tema ?? <span className="text-muted-foreground italic">sem tema</span>}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.usos === 0 ? 'nenhuma meta usa' : `${l.usos} meta(s) de questões`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {l.url_qc && (
                        <a href={l.url_qc} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline" title="QConcursos">
                          QC <ExternalLink className="inline h-3 w-3" />
                        </a>
                      )}
                      {l.url_tec && (
                        <a href={l.url_tec} target="_blank" rel="noreferrer" className="ml-2 text-xs text-primary hover:underline" title="TEC Concursos">
                          TEC <ExternalLink className="inline h-3 w-3" />
                        </a>
                      )}
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

            <div className="space-y-1.5">
              <Label>Link do QConcursos</Label>
              <Input value={form.url_qc ?? ''} onChange={(e) => setForm((f) => ({ ...f, url_qc: e.target.value }))} placeholder="https://…" />
            </div>

            <div className="space-y-1.5">
              <Label>Link do TEC Concursos</Label>
              <Input value={form.url_tec ?? ''} onChange={(e) => setForm((f) => ({ ...f, url_tec: e.target.value }))} placeholder="https://…" />
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
    </>
  )
}
