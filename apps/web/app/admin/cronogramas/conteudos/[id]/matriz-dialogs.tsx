'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { LinhaMatriz, PlataformaLinkMatriz } from '@/lib/cronograma/matriz-gerador-tipos'
import { gravarMatrizApi, lerMatrizApi } from './matriz-api'

const SEL = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

/** Links de questões por plataforma (QConcursos/TEC/…): editados direto na matriz, sem seletor de documento. */
export function LinksDialog({ conjuntoId, linha, plataformas, nomeSecao, podeEditar, onClose, onFeito }: {
  conjuntoId: string; linha: LinhaMatriz | null; plataformas: PlataformaLinkMatriz[]; nomeSecao: string; podeEditar: boolean; onClose: () => void; onFeito: () => void
}) {
  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full sm:max-w-xl">
        {linha && <LinksCorpo key={linha.chave} conjuntoId={conjuntoId} linha={linha} plataformas={plataformas} nomeSecao={nomeSecao} podeEditar={podeEditar} onClose={onClose} onFeito={onFeito} />}
      </DialogContent>
    </Dialog>
  )
}

function LinksCorpo({ conjuntoId, linha, plataformas, nomeSecao, podeEditar, onClose, onFeito }: { conjuntoId: string; linha: LinhaMatriz; plataformas: PlataformaLinkMatriz[]; nomeSecao: string; podeEditar: boolean; onClose: () => void; onFeito: () => void }) {
  const inicial = Object.fromEntries(plataformas.map((p) => [p.id, linha.links.itens.find((i) => i.plataformaId === p.id)?.url ?? '']))
  const [urls, setUrls] = useState<Record<string, string>>(inicial)
  const [salvando, setSalvando] = useState(false)
  const aulaId = linha.links.aulaId

  async function salvar() {
    if (!aulaId) return
    const itens = plataformas.filter((p) => (urls[p.id] ?? '').trim() !== (inicial[p.id] ?? '').trim()).map((p) => ({ plataformaId: p.id, url: (urls[p.id] ?? '').trim() }))
    if (!itens.length) return onClose()
    setSalvando(true)
    const r = await gravarMatrizApi(conjuntoId, { operacao: 'links', aulaId, itens })
    setSalvando(false)
    if (!r.ok) return toast.error(r.message ?? 'Não foi possível salvar os links.')
    toast.success('Links salvos.')
    onFeito()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Links de questões · {linha.titulo || (linha.chave ? `Aula ${linha.chave}` : 'Sem número de aula')}</DialogTitle>
        <DialogDescription>Um link por plataforma. Vazio remove o link. Vídeo e PDF antigos ficam no painel “Avançado / legado”.</DialogDescription>
      </DialogHeader>
      {!aulaId ? (
        <p className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">Esta aula não tem a seção “{nomeSecao}”. Use “Adicionar aula” e inclua a seção para poder cadastrar links.</p>
      ) : !plataformas.length ? (
        <p className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">Nenhuma plataforma cadastrada. Use “Disciplinas e filtros” para criar (QConcursos, TEC…).</p>
      ) : (
        <div className="space-y-3">
          {plataformas.map((p) => (
            <div key={p.id} className="space-y-1">
              <Label className="text-xs">{p.nome}</Label>
              <Input value={urls[p.id] ?? ''} onChange={(e) => setUrls((u) => ({ ...u, [p.id]: e.target.value }))} placeholder="https://…" disabled={!podeEditar} className="h-9" />
            </div>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        <Button type="button" onClick={salvar} disabled={!podeEditar || salvando || !aulaId}>{salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar links</Button>
      </DialogFooter>
    </>
  )
}

interface Gestao {
  conjunto: { id: string; disciplina: string; disciplina_id: string | null }
  disciplinas: { id: string; nome: string; conjuntos: number }[]
  plataformas: { id: string; nome: string; slug: string; ativo: boolean }[]
}

/** Disciplinas e filtros da plataforma: disciplina do conjunto (e criar nova) + plataformas dos links de questões. */
export function GestaoDialog({ conjuntoId, aberto, podeEditar, onClose, onFeito }: { conjuntoId: string; aberto: boolean; podeEditar: boolean; onClose: () => void; onFeito: () => void }) {
  const [g, setG] = useState<Gestao | null>(null)
  const [novaDisc, setNovaDisc] = useState('')
  const [novaPlat, setNovaPlat] = useState('')
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState(false)

  async function carregar() {
    const r = await lerMatrizApi(conjuntoId, { acao: 'gestao' })
    if (!r.ok) return toast.error(r.message ?? 'Não foi possível carregar.')
    const d = r as unknown as Gestao
    setG(d)
    setNomes(Object.fromEntries(d.plataformas.map((p) => [p.id, p.nome])))
  }
  useEffect(() => { if (aberto) void carregar() }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  async function op(corpo: Record<string, unknown>, ok: string) {
    setOcupado(true)
    const r = await gravarMatrizApi(conjuntoId, corpo)
    setOcupado(false)
    if (!r.ok) { toast.error(r.message ?? 'Não foi possível salvar.'); return null }
    toast.success(ok)
    await carregar()
    return r
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Disciplinas e filtros</DialogTitle>
          <DialogDescription>Disciplina deste conjunto (usada para sugerir documentos) e plataformas dos links de questões.</DialogDescription>
        </DialogHeader>
        {!g ? <div className="flex h-24 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…</div> : (
          <div className="grid gap-5 md:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Disciplina do conjunto</h3>
              <select className={SEL} value={g.conjunto.disciplina_id ?? ''} disabled={!podeEditar || ocupado} aria-label="Disciplina do conjunto"
                onChange={async (e) => { if (e.target.value && (await op({ operacao: 'conjunto_disciplina', disciplinaId: e.target.value }, 'Disciplina do conjunto atualizada.'))) onFeito() }}>
                <option value="">{g.conjunto.disciplina || 'Sem disciplina cadastrada'}</option>
                {g.disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.conjuntos})</option>)}
              </select>
              <div className="flex gap-2">
                <Input value={novaDisc} onChange={(e) => setNovaDisc(e.target.value)} placeholder="Nova disciplina…" className="h-9" disabled={!podeEditar} />
                <Button type="button" size="sm" variant="outline" disabled={!podeEditar || ocupado || novaDisc.trim().length < 2}
                  onClick={async () => { if (await op({ operacao: 'disciplina_criar', nome: novaDisc }, 'Disciplina criada.')) setNovaDisc('') }}><Plus className="mr-1 h-4 w-4" /> Criar</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Trocar a disciplina muda o filtro do seletor e a chave natural usada pelas metas dos cronogramas.</p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Plataformas dos links de questões</h3>
              <div className="space-y-1.5">
                {g.plataformas.map((p) => (
                  <div key={p.id} className="flex gap-2">
                    <Input value={nomes[p.id] ?? p.nome} onChange={(e) => setNomes((n) => ({ ...n, [p.id]: e.target.value }))} className="h-9" disabled={!podeEditar} aria-label={`Nome da plataforma ${p.nome}`} />
                    <Button type="button" size="sm" variant="outline" disabled={!podeEditar || ocupado || (nomes[p.id] ?? p.nome).trim() === p.nome || (nomes[p.id] ?? '').trim().length < 2}
                      onClick={() => op({ operacao: 'plataforma_renomear', id: p.id, nome: nomes[p.id] }, 'Plataforma renomeada.')}>Renomear</Button>
                  </div>
                ))}
                {!g.plataformas.length && <p className="text-xs text-muted-foreground">Nenhuma plataforma ainda.</p>}
              </div>
              <div className="flex gap-2">
                <Input value={novaPlat} onChange={(e) => setNovaPlat(e.target.value)} placeholder="Nova plataforma (ex.: TEC)…" className="h-9" disabled={!podeEditar} />
                <Button type="button" size="sm" variant="outline" disabled={!podeEditar || ocupado || novaPlat.trim().length < 2}
                  onClick={async () => { if (await op({ operacao: 'plataforma_criar', nome: novaPlat }, 'Plataforma criada.')) { setNovaPlat(''); onFeito() } }}><Plus className="mr-1 h-4 w-4" /> Criar</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Excluir plataformas continua em Cronogramas › Links de aula.</p>
            </section>
          </div>
        )}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
