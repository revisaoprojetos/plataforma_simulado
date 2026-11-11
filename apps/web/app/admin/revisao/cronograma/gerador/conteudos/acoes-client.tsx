'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, Folder, FolderPlus, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import { criarDisciplina } from '@/app/admin/cronogramas/[id]/metas-actions'
import { criarConjunto, criarPastaConteudo, duplicarConjunto, excluirConjunto, excluirPastaConteudo, renomearPastaConteudo } from '@/app/admin/cronogramas/conteudos/actions'
import { atualizarPlataforma, criarLink, criarPlataforma, atualizarLink, excluirLink, excluirPlataforma } from '@/app/admin/cronogramas/links/actions'
import type { EntradaLink } from '@/app/admin/cronogramas/links/actions-tipos'
import type { PlataformaLinha } from '@/lib/revisao/gerador/conteudos'

// Ilhas client da sub-aba Conteúdos: só chamam as actions EXISTENTES (cronogramas/conteudos e cronogramas/links)
// e dão router.refresh() — a lista em si é lida no servidor.

// ───────────────────────────── conjuntos ─────────────────────────────

export function NovoConjunto({ pastaId, disciplinas: inicial }: { pastaId: string | null; disciplinas: { id: string; nome: string }[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pend, iniciar] = useTransition()
  const [disciplinas, setDisciplinas] = useState(inicial)
  const [nome, setNome] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [disciplinaId, setDisciplinaId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')

  async function criarDisc(n: string) {
    const r = await criarDisciplina(n)
    if (!r.ok || !r.id) { toast.error(r.error ?? 'Não foi possível criar a disciplina.'); return null }
    const nova = { id: r.id, nome: r.nome ?? n.trim() }
    setDisciplinas((xs) => (xs.some((d) => d.id === nova.id) ? xs : [...xs, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
    return nova
  }
  function salvar() {
    if (nome.trim().length < 2) return void toast.error('Informe um nome (mín. 2 letras).')
    if (!disciplina.trim()) return void toast.error('Escolha a disciplina.')
    iniciar(async () => {
      const r = await criarConjunto({ nome, disciplina, disciplina_id: disciplinaId, descricao, pastaId })
      if (!r.ok || !r.id) return void toast.error(r.error ?? 'Não foi possível criar.')
      toast.success('Conjunto criado')
      router.push(`/admin/cronogramas/conteudos/${r.id}`)
    })
  }
  return (
    <>
      <Button size="sm" onClick={() => { setNome(''); setDisciplina(''); setDisciplinaId(null); setDescricao(''); setAberto(true) }}><Plus />Novo conjunto</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo conjunto</DialogTitle>
            <DialogDescription>Um conjunto reúne as aulas de uma disciplina. Depois você seleciona ele ao montar o cronograma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Direito Constitucional — Módulo 1" autoFocus /></div>
            <div className="space-y-1.5"><Label>Disciplina</Label>
              <DisciplinaPicker disciplinas={disciplinas} nome={disciplina} disciplinaId={disciplinaId} onChange={(v) => { setDisciplina(v.nome); setDisciplinaId(v.disciplina_id) }} onCriar={criarDisc} /></div>
            <div className="space-y-1.5"><Label>Descrição <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: aulas 1 a 12, pós-edital" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pend}>Cancelar</Button>
            <Button onClick={salvar} disabled={pend}>{pend && <Loader2 className="animate-spin" />}Criar e abrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function NovaPasta({ paiId }: { paiId: string | null }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [pend, iniciar] = useTransition()
  function salvar() {
    if (!nome.trim()) return void toast.error('Informe um nome.')
    iniciar(async () => {
      const r = await criarPastaConteudo(nome, paiId)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível criar a pasta.')
      toast.success('Pasta criada'); setAberto(false); setNome(''); router.refresh()
    })
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}><FolderPlus />Nova pasta</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nova pasta</DialogTitle><DialogDescription>Organiza os conjuntos deste nível.</DialogDescription></DialogHeader>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da pasta" autoFocus onKeyDown={(e) => e.key === 'Enter' && salvar()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pend}>Cancelar</Button>
            <Button onClick={salvar} disabled={pend}>{pend && <Loader2 className="animate-spin" />}Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Pasta do nível atual: abre (link), renomeia e exclui (só vazia — regra da action). */
export function PastaChip({ id, nome, href }: { id: string; nome: string; href: string }) {
  const router = useRouter()
  const [pend, iniciar] = useTransition()
  function renomear() {
    const novo = window.prompt('Novo nome da pasta', nome)?.trim()
    if (!novo || novo === nome) return
    iniciar(async () => {
      const r = await renomearPastaConteudo(id, novo)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível renomear.')
      router.refresh()
    })
  }
  function excluir() {
    iniciar(async () => {
      if (!(await confirmar({ titulo: `Excluir a pasta "${nome}"`, mensagem: 'Só é possível excluir pastas vazias.', destrutivo: true }))) return
      const r = await excluirPastaConteudo(id)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível excluir.')
      toast.success('Pasta excluída'); router.refresh()
    })
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border bg-card py-1 pl-2.5 pr-1 text-sm shadow-sm">
      <Link href={href} className="inline-flex items-center gap-1.5 font-medium hover:text-primary"><Folder className="h-4 w-4 text-primary" />{nome}</Link>
      <Button size="icon-sm" variant="ghost" onClick={renomear} disabled={pend} aria-label={`Renomear ${nome}`}><Pencil /></Button>
      <Button size="icon-sm" variant="ghost" onClick={excluir} disabled={pend} aria-label={`Excluir ${nome}`}>{pend ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}</Button>
    </span>
  )
}

export function AcoesConjunto({ id, nome, podeEditar }: { id: string; nome: string; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, iniciar] = useTransition()
  if (!podeEditar) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      <Button size="icon-sm" variant="ghost" disabled={pend} aria-label={`Duplicar ${nome}`} title="Duplicar" onClick={() => iniciar(async () => {
        const r = await duplicarConjunto(id)
        if (!r.ok) return void toast.error(r.error ?? 'Não foi possível duplicar.')
        toast.success('Conjunto duplicado'); router.refresh()
      })}><Copy /></Button>
      <Button size="icon-sm" variant="ghost" disabled={pend} aria-label={`Excluir ${nome}`} title="Excluir" onClick={() => iniciar(async () => {
        if (!(await confirmar({ titulo: `Excluir "${nome}"`, mensagem: 'O conjunto e suas aulas saem do banco. Cronogramas já montados a partir dele NÃO são afetados.', destrutivo: true }))) return
        const r = await excluirConjunto(id)
        if (!r.ok) return void toast.error(r.error ?? 'Não foi possível excluir.')
        toast.success('Conjunto excluído'); router.refresh()
      })}>{pend ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}</Button>
    </span>
  )
}

// ───────────────────────────── links de aula ─────────────────────────────

const vazioLink = (): EntradaLink => ({ disciplina: '', aula: '', tema: null, urls: [] })

/** Cria/edita um link de aula (disciplina + aula + tema + 1 URL por plataforma). */
export function LinkDialogo({ modo, inicial, plataformas, rotulo, pequeno }: {
  modo: 'novo' | 'editar'; inicial?: EntradaLink & { id?: string }; plataformas: PlataformaLinha[]; rotulo?: string; pequeno?: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pend, iniciar] = useTransition()
  const [form, setForm] = useState<EntradaLink>(vazioLink())
  const porId = new Map(plataformas.map((p) => [p.id, p]))
  const disponiveis = plataformas.filter((p) => p.ativo && !form.urls.some((u) => u.plataforma_id === p.id))

  function abrir() {
    setForm(inicial ? { disciplina: inicial.disciplina, aula: inicial.aula, tema: inicial.tema ?? null, urls: inicial.urls.map((u) => ({ ...u })) } : vazioLink())
    setAberto(true)
  }
  function salvar() {
    iniciar(async () => {
      const r = modo === 'editar' && inicial?.id ? await atualizarLink(inicial.id, form) : await criarLink(form)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível salvar.')
      toast.success(modo === 'editar' ? 'Link atualizado' : 'Link criado'); setAberto(false); router.refresh()
    })
  }
  return (
    <>
      {pequeno
        ? <Button size="icon-sm" variant="ghost" onClick={abrir} aria-label="Editar link" title="Editar"><Pencil /></Button>
        : <Button size="sm" variant={modo === 'novo' ? 'default' : 'outline'} onClick={abrir}>{modo === 'novo' && <Plus />}{rotulo ?? (modo === 'novo' ? 'Novo link' : 'Cadastrar')}</Button>}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modo === 'editar' ? 'Editar link' : 'Novo link de aula'}</DialogTitle>
            <DialogDescription>O par disciplina + aula é a chave, e o casamento é exato: “01” não encontra “1”.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Disciplina</Label><Input value={form.disciplina} onChange={(e) => setForm((f) => ({ ...f, disciplina: e.target.value }))} placeholder="Direito Constitucional" /></div>
              <div className="space-y-1.5"><Label>Aula</Label><Input value={form.aula} onChange={(e) => setForm((f) => ({ ...f, aula: e.target.value }))} placeholder="01" /></div>
            </div>
            <div className="space-y-1.5"><Label>Tema</Label>
              <Input value={form.tema ?? ''} onChange={(e) => setForm((f) => ({ ...f, tema: e.target.value }))} placeholder="Princípios fundamentais" />
              <p className="text-xs text-muted-foreground">Vira o título da linha na ficha de desempenho.</p></div>
            <div className="space-y-2">
              <Label>Links por plataforma</Label>
              {form.urls.length === 0 && <p className="text-xs text-muted-foreground">Nenhum link ainda. Escolha uma plataforma abaixo.</p>}
              {form.urls.map((u, i) => (
                <div key={u.plataforma_id} className="flex items-center gap-2">
                  <Badge variant="secondary" className="w-32 shrink-0 justify-center">{porId.get(u.plataforma_id)?.nome ?? 'plataforma'}</Badge>
                  <Input value={u.url} onChange={(e) => setForm((f) => ({ ...f, urls: f.urls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))} placeholder="https://…" />
                  <Button size="icon-sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, urls: f.urls.filter((_, j) => j !== i) }))} aria-label="Remover este link"><X /></Button>
                </div>
              ))}
              {disponiveis.length > 0
                ? (
                  <Select value="" onValueChange={(v) => v && setForm((f) => ({ ...f, urls: [...f.urls, { plataforma_id: v, url: '' }] }))}>
                    <SelectTrigger><SelectValue placeholder="+ Adicionar link de outra plataforma" /></SelectTrigger>
                    <SelectContent>{disponiveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                )
                : <p className="text-xs text-muted-foreground">{plataformas.length === 0 ? 'Nenhuma plataforma cadastrada — use o botão “Plataformas”.' : 'Todas as plataformas já têm link nesta aula.'}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pend}>Cancelar</Button>
            <Button onClick={salvar} disabled={pend}>{pend ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ExcluirLinkBtn({ id, rotulo, usos }: { id: string; rotulo: string; usos: number }) {
  const router = useRouter()
  const [pend, iniciar] = useTransition()
  return (
    <Button size="icon-sm" variant="ghost" disabled={pend} aria-label={`Excluir ${rotulo}`} title="Excluir" onClick={() => iniciar(async () => {
      const ok = await confirmar({
        titulo: 'Excluir link',
        mensagem: usos > 0 ? `${rotulo} é citado por ${usos} meta(s) de questões. Sem ele, o aluno verá "Não há link cadastrado para esta aula".` : `Excluir o link de ${rotulo}?`,
        destrutivo: true,
      })
      if (!ok) return
      const r = await excluirLink(id)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível excluir.')
      toast.success('Link excluído'); router.refresh()
    })}>{pend ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}</Button>
  )
}

export function LinksExternos({ urls, plataformas }: { urls: { plataforma_id: string; url: string }[]; plataformas: PlataformaLinha[] }) {
  const porId = new Map(plataformas.map((p) => [p.id, p]))
  if (urls.length === 0) return <span className="text-xs italic text-amber-700 dark:text-amber-400">sem link</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {urls.map((u) => {
        const p = porId.get(u.plataforma_id)
        return (
          <a key={u.plataforma_id} href={u.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-primary hover:bg-muted">
            {p?.nome ?? 'plataforma'}<ExternalLink className="h-3 w-3" />
          </a>
        )
      })}
    </span>
  )
}

/** Cadastro de plataformas de curso (renomear / criar / excluir) — mesmas actions da tela atual. */
export function PlataformasDialogo({ plataformas }: { plataformas: PlataformaLinha[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pend, iniciar] = useTransition()
  const [nova, setNova] = useState('')
  function adicionar() {
    const nome = nova.trim(); if (!nome) return
    iniciar(async () => {
      const r = await criarPlataforma(nome, null)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível criar.')
      toast.success(`Plataforma "${nome}" cadastrada`); setNova(''); router.refresh()
    })
  }
  function renomear(p: PlataformaLinha, nome: string) {
    iniciar(async () => {
      const r = await atualizarPlataforma(p.id, nome, p.cor)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível renomear.')
      router.refresh()
    })
  }
  function remover(p: PlataformaLinha) {
    iniciar(async () => {
      const ok = await confirmar({
        titulo: 'Excluir plataforma',
        mensagem: p.usos > 0 ? `"${p.nome}" é usada em ${p.usos} link(s) de aula. Excluí-la remove esses links junto.` : `Excluir a plataforma "${p.nome}"?`,
        destrutivo: true,
      })
      if (!ok) return
      const r = await excluirPlataforma(p.id)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível excluir.')
      toast.success('Plataforma excluída'); router.refresh()
    })
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}><Layers />Plataformas<span className="text-xs text-muted-foreground">{plataformas.length}</span></Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plataformas de curso</DialogTitle>
            <DialogDescription>Bancos de questões e cursos onde a aula pode ter link. Cada aula tem no máximo um link por plataforma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {plataformas.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Input defaultValue={p.nome} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== p.nome) renomear(p, n) }} />
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{p.usos === 0 ? 'sem uso' : `${p.usos} link(s)`}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => remover(p)} disabled={pend} aria-label={`Excluir ${p.nome}`}><Trash2 className="text-destructive" /></Button>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t pt-3">
              <Input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionar()} placeholder="Nome da plataforma (ex.: Gran Cursos)" />
              <Button size="sm" onClick={adicionar} disabled={pend || !nova.trim()}><Plus /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Renomear é seguro: a chave usada pela importação não muda junto.</p>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
