'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import { useCriar, type LinkDraft } from './criar-context'
import { Secao } from './secao'
import { dadosLinks, dadosMetas } from './dados'
import { criarDisciplina } from '../[id]/metas-actions'

const chaveDe = (disc: string, aula: string) => `${disc.trim().toLowerCase()}|${aula.trim().toLowerCase()}`

export function SecaoLinks() {
  const { draft, patch } = useCriar()
  const [plataformas, setPlataformas] = useState<{ id: string; nome: string; slug: string }[]>([])
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])

  const [novaDisc, setNovaDisc] = useState('')
  const [novaDiscId, setNovaDiscId] = useState<string | null>(null)
  const [novaAula, setNovaAula] = useState('')

  useEffect(() => {
    dadosLinks().then((r) => {
      if (r.ok) setPlataformas(r.plataformas ?? [])
    })
    dadosMetas().then((r) => {
      if (r.ok) setDisciplinas(r.disciplinas ?? [])
    })
  }, [])

  const paresMetas = useMemo(() => {
    const m = new Map<string, { disciplina: string; disciplina_id: string | null; aula: string }>()
    for (const meta of draft.metas) {
      if (!meta.aula) continue
      const k = chaveDe(meta.disciplina, meta.aula)
      if (!m.has(k)) m.set(k, { disciplina: meta.disciplina, disciplina_id: meta.disciplina_id, aula: meta.aula })
    }
    return [...m.values()]
  }, [draft.metas])

  const faltando = useMemo(
    () => paresMetas.filter((p) => !draft.links.some((l) => chaveDe(l.disciplina, l.aula) === chaveDe(p.disciplina, p.aula))),
    [paresMetas, draft.links],
  )

  function puxarDasMetas() {
    if (!faltando.length) return
    const novos: LinkDraft[] = faltando.map((p) => ({ disciplina: p.disciplina, disciplina_id: p.disciplina_id, aula: p.aula, tema: '', urls: {} }))
    patch({ links: [...draft.links, ...novos] })
    toast.success(`${novos.length} aula(s) das metas adicionada(s)`)
  }

  function adicionarManual() {
    if (!novaDisc.trim() || !novaAula.trim()) {
      toast.error('Informe disciplina e aula.')
      return
    }
    if (draft.links.some((l) => chaveDe(l.disciplina, l.aula) === chaveDe(novaDisc, novaAula))) {
      toast.error('Esse par disciplina/aula já está na lista.')
      return
    }
    patch({ links: [...draft.links, { disciplina: novaDisc.trim(), disciplina_id: novaDiscId, aula: novaAula.trim(), tema: '', urls: {} }] })
    setNovaAula('')
  }

  function atualizar(i: number, p: Partial<LinkDraft>) {
    patch({ links: draft.links.map((l, idx) => (idx === i ? { ...l, ...p } : l)) })
  }
  function setUrl(i: number, slug: string, url: string) {
    patch({ links: draft.links.map((l, idx) => (idx === i ? { ...l, urls: { ...l.urls, [slug]: url } } : l)) })
  }
  function remover(i: number) {
    patch({ links: draft.links.filter((_, idx) => idx !== i) })
  }

  async function criarDisciplinaLocal(nome: string) {
    const r = await criarDisciplina(nome)
    if (!r.ok || !r.id) {
      toast.error(r.error ?? 'Não foi possível criar a disciplina.')
      return null
    }
    const nova = { id: r.id, nome: r.nome ?? nome.trim() }
    setDisciplinas((xs) => (xs.some((d) => d.id === nova.id) ? xs : [...xs, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
    return nova
  }

  return (
    <Secao numero={5} titulo="Links de aula" descricao="(disciplina, aula) → tema + link por plataforma. Casa por texto exato com a aula da meta. A Montagem já traz os links do banco — aqui é para complementar. Opcional.">
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={puxarDasMetas} disabled={!faltando.length}>
            <Sparkles className="mr-1 h-4 w-4" />
            Puxar aulas das metas{faltando.length > 0 ? ` (${faltando.length})` : ''}
          </Button>
          <span className="text-xs text-muted-foreground">{draft.links.length.toLocaleString('pt-BR')} link(s)</span>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/20 p-3">
          <div className="min-w-56 flex-1">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Disciplina</Label>
            <DisciplinaPicker
              disciplinas={disciplinas}
              nome={novaDisc}
              disciplinaId={novaDiscId}
              onChange={(v) => {
                setNovaDisc(v.nome)
                setNovaDiscId(v.disciplina_id)
              }}
              onCriar={criarDisciplinaLocal}
            />
          </div>
          <div className="w-24">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Aula</Label>
            <Input value={novaAula} onChange={(e) => setNovaAula(e.target.value)} placeholder="01" className="h-9" />
          </div>
          <Button size="sm" onClick={adicionarManual} className="h-9">
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {draft.links.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Link2 className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/40" />
            Nenhum link ainda. Puxe as aulas das metas ou adicione manualmente — também dá para fazer depois.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.links.map((l, i) => (
              <div key={`${chaveDe(l.disciplina, l.aula)}-${i}`} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {l.disciplina} <span className="font-mono font-normal text-muted-foreground">· aula {l.aula}</span>
                  </p>
                  <button onClick={() => remover(i)} title="Remover" className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  <Input value={l.tema} onChange={(e) => atualizar(i, { tema: e.target.value })} placeholder="Tema (aparece no desempenho)" className="h-8" />
                  {plataformas.map((p) => (
                    <div key={p.slug} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 truncate text-xs font-medium text-muted-foreground" title={p.nome}>
                        {p.nome}
                      </span>
                      <Input value={l.urls[p.slug] ?? ''} onChange={(e) => setUrl(i, p.slug, e.target.value)} placeholder="https://…" className="h-8" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Secao>
  )
}
