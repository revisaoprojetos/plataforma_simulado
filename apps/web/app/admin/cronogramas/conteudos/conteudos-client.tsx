'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Folder, FolderPlus, Loader2, Plus, Scale, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import { criarDisciplina } from '../[id]/metas-actions'
import { criarConjunto, criarPastaConteudo, excluirConjunto, excluirPastaConteudo, type ConjuntoLista, type PastaLista } from './actions'

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function ConteudosClient({
  conjuntos,
  pastas,
  trilha,
  pastaAtual,
  disciplinas: disciplinasIniciais,
}: {
  conjuntos: ConjuntoLista[]
  pastas: PastaLista[]
  trilha: { id: string; nome: string }[]
  pastaAtual: string | null
  disciplinas: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'disciplinas' | 'legproc'>('disciplinas')
  const [busca, setBusca] = useState('')
  const [disciplinas, setDisciplinas] = useState(disciplinasIniciais)
  const [novoAberto, setNovoAberto] = useState(false)
  const [pastaAberta, setPastaAberta] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Novo conjunto
  const [nome, setNome] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [disciplinaId, setDisciplinaId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  // Nova pasta
  const [nomePasta, setNomePasta] = useState('')

  const nDisc = conjuntos.length
  const nLeg = useMemo(() => conjuntos.filter((c) => c.aulasLegproc > 0).length, [conjuntos])
  // LegProc mostra as MESMAS disciplinas (mesma ordem), só as que TÊM aula de legproc.
  const daAba = useMemo(
    () => (aba === 'legproc' ? conjuntos.filter((c) => c.aulasLegproc > 0) : conjuntos),
    [conjuntos, aba],
  )
  const conjuntosFiltrados = useMemo(() => {
    const t = normalizar(busca.trim())
    if (!t) return daAba
    return daAba.filter((c) => normalizar(c.nome).includes(t) || normalizar(c.disciplina).includes(t))
  }, [daAba, busca])

  async function criarDisciplinaLocal(n: string) {
    const r = await criarDisciplina(n)
    if (!r.ok || !r.id) {
      toast.error(r.error ?? 'Não foi possível criar a disciplina.')
      return null
    }
    const nova = { id: r.id, nome: r.nome ?? n.trim() }
    setDisciplinas((xs) => (xs.some((d) => d.id === nova.id) ? xs : [...xs, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
    return nova
  }

  async function salvarConjunto() {
    if (nome.trim().length < 2) return toast.error('Informe um nome (mín. 2 letras).')
    if (!disciplina.trim()) return toast.error('Escolha a disciplina.')
    setOcupado('novo')
    const r = await criarConjunto({ nome, disciplina, disciplina_id: disciplinaId, descricao, pastaId: pastaAtual })
    setOcupado(null)
    if (!r.ok || !r.id) return toast.error(r.error ?? 'Não foi possível criar.')
    toast.success('Conjunto criado')
    router.push(`/admin/cronogramas/conteudos/${r.id}`)
  }

  async function salvarPasta() {
    if (!nomePasta.trim()) return toast.error('Informe um nome.')
    setOcupado('pasta')
    const r = await criarPastaConteudo(nomePasta, pastaAtual)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível criar a pasta.')
    setPastaAberta(false)
    setNomePasta('')
    router.refresh()
  }

  async function apagarConjunto(c: ConjuntoLista) {
    const sim = await confirmar({ titulo: `Excluir "${c.nome}"`, mensagem: 'O conjunto e suas aulas saem do banco. Cronogramas já montados a partir dele NÃO são afetados.', destrutivo: true })
    if (!sim) return
    setOcupado(c.id)
    const r = await excluirConjunto(c.id)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
    toast.success('Conjunto excluído')
    router.refresh()
  }

  async function apagarPasta(p: PastaLista) {
    setOcupado(p.id)
    const r = await excluirPastaConteudo(p.id)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb + ações */}
      {/* Sub-abas Disciplinas × LegProc na MESMA linha das ações (Nova pasta / Novo conjunto). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
            {([['disciplinas', 'Disciplinas', nDisc], ['legproc', 'LegProc', nLeg]] as const).map(([v, rot, n]) => (
              <button
                key={v}
                type="button"
                onClick={() => setAba(v)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition',
                  aba === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'legproc' && <Scale className="h-3.5 w-3.5" />}
                {rot}
                <span className="text-xs text-muted-foreground">{n}</span>
              </button>
            ))}
          </div>
          {trilha.length > 0 && (
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
              {trilha.map((t, i) => (
                <span key={t.id} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/50">/</span>}
                  <Link href={`/admin/cronogramas/conteudos?pasta=${t.id}`} className="hover:text-foreground">{t.nome}</Link>
                </span>
              ))}
            </nav>
          )}
        </div>
        {aba === 'disciplinas' && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPastaAberta(true)}>
              <FolderPlus className="mr-1 h-4 w-4" /> Nova pasta
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setNome('')
                setDisciplina('')
                setDisciplinaId(null)
                setDescricao('')
                setNovoAberto(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Novo conjunto
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conjunto ou disciplina…" className="pl-8" />
      </div>

      {(aba === 'legproc' ? conjuntosFiltrados.length === 0 : pastas.length === 0 && conjuntosFiltrados.length === 0) ? (
        <div className="rounded-2xl border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
          {busca ? 'Nada encontrado.' : aba === 'legproc' ? 'Nenhuma disciplina tem conteúdo de LegProc ainda. Adicione aulas de tipo LegProc dentro de uma disciplina.' : 'Nenhum conjunto ainda. Crie o primeiro para reunir aulas de uma disciplina.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Pastas primeiro (só na aba Disciplinas e sem busca) */}
          {aba === 'disciplinas' && !busca &&
            pastas.map((p) => (
              <div key={p.id} className="group relative flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/40">
                <Link href={`/admin/cronogramas/conteudos?pasta=${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Folder className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                </Link>
                <button onClick={() => apagarPasta(p)} disabled={ocupado === p.id} title="Excluir pasta (vazia)" className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100">
                  {ocupado === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}

          {/* Conjuntos */}
          {conjuntosFiltrados.map((c) => (
            <div key={c.id} className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: c.cor || 'var(--primary)' }} />
              <Link href={`/admin/cronogramas/conteudos/${c.id}${aba === 'legproc' ? '?tipo=legproc' : ''}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {aba === 'legproc' ? <Scale className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                  </span>
                  {aba === 'legproc' ? (
                    <Badge variant="outline" className="shrink-0 gap-1"><Scale className="h-3 w-3" /> LegProc</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 max-w-[60%] truncate">{c.disciplina}</Badge>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 font-semibold leading-snug">{c.nome}</p>
                {aba !== 'legproc' && c.descricao && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.descricao}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {aba === 'legproc' ? (
                    <Badge variant="outline">{c.aulasLegproc.toLocaleString('pt-BR')} aula(s) de LegProc</Badge>
                  ) : (
                    <>
                      <Badge variant="outline">{c.aulas.toLocaleString('pt-BR')} aula(s)</Badge>
                      {c.questoes > 0 && <Badge variant="outline">{c.questoes.toLocaleString('pt-BR')} questões</Badge>}
                    </>
                  )}
                </div>
              </Link>
              <button onClick={() => apagarConjunto(c)} disabled={ocupado === c.id} title="Excluir conjunto" className="absolute right-3 top-3 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100">
                {ocupado === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dialog: novo conjunto */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo conjunto</DialogTitle>
            <DialogDescription>Um conjunto reúne as aulas de uma disciplina. Depois você seleciona ele ao montar o cronograma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Direito Constitucional — Módulo 1" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Disciplina</Label>
              <DisciplinaPicker disciplinas={disciplinas} nome={disciplina} disciplinaId={disciplinaId} onChange={(v) => { setDisciplina(v.nome); setDisciplinaId(v.disciplina_id) }} onCriar={criarDisciplinaLocal} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: aulas 1 a 12, pós-edital" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovoAberto(false)} disabled={ocupado === 'novo'}>Cancelar</Button>
            <Button onClick={salvarConjunto} disabled={ocupado === 'novo'}>
              {ocupado === 'novo' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Criar e abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nova pasta */}
      <Dialog open={pastaAberta} onOpenChange={setPastaAberta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
            <DialogDescription>Organiza os conjuntos deste nível.</DialogDescription>
          </DialogHeader>
          <Input value={nomePasta} onChange={(e) => setNomePasta(e.target.value)} placeholder="Nome da pasta" autoFocus onKeyDown={(e) => e.key === 'Enter' && salvarPasta()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPastaAberta(false)} disabled={ocupado === 'pasta'}>Cancelar</Button>
            <Button onClick={salvarPasta} disabled={ocupado === 'pasta'}>
              {ocupado === 'pasta' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
