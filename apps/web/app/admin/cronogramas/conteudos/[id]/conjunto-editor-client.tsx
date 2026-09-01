'use client'

import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Link2, Loader2, Pencil, Plus, Trash2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'
import { criarDisciplina } from '../../[id]/metas-actions'
import {
  anexarQuestoes,
  atualizarAula,
  atualizarConjunto,
  criarAula,
  excluirAula,
  removerQuestao,
  salvarUrlsAula,
  type AulaBanco,
  type ConjuntoDetalhe,
} from '../actions'

export function ConjuntoEditorClient({
  dados,
  tipos,
  disciplinas: disciplinasIniciais,
}: {
  dados: ConjuntoDetalhe
  tipos: TipoMetaDef[]
  disciplinas: { id: string; nome: string }[]
}) {
  const [conjunto, setConjunto] = useState(dados.conjunto)
  const [aulas, setAulas] = useState<AulaBanco[]>(dados.aulas)
  const [disciplinas, setDisciplinas] = useState(disciplinasIniciais)
  const plataformas = dados.plataformas
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [editarConjuntoAberto, setEditarConjuntoAberto] = useState(false)

  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const corTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null

  // ── Adição rápida de aula ──
  const [tipo, setTipo] = useState(tipos[0]?.slug ?? '')
  const [aulaTxt, setAulaTxt] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [duracao, setDuracao] = useState('')
  const [video, setVideo] = useState('')

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

  async function adicionarAula() {
    if (!tipo) return toast.error('Escolha o tipo.')
    setOcupado('nova')
    const r = await criarAula(conjunto.id, { tipo, aula: aulaTxt, conteudo, duracao, video_url: video })
    setOcupado(null)
    if (!r.ok || !r.id) return toast.error(r.error ?? 'Não foi possível adicionar.')
    setAulas((xs) => [...xs, { id: r.id!, tipo, aula: aulaTxt.trim() || null, conteudo: conteudo.trim() || null, duracao: duracao.trim() || null, video_url: video.trim() || null, tema: null, ordem: xs.length, urls: [], questoes: [] }])
    // O que repete fica; a aula avança sozinha e o conteúdo limpa.
    setConteudo('')
    setVideo('')
    setAulaTxt((a) => {
      const t = a.trim()
      if (!/^\d+$/.test(t)) return ''
      const nv = String(Number(t) + 1)
      return /^0\d/.test(t) ? nv.padStart(t.length, '0') : nv
    })
    toast.success('Aula adicionada', { duration: 900 })
  }

  async function removerAula(a: AulaBanco) {
    const sim = await confirmar({ titulo: 'Excluir aula', mensagem: `Remover "${a.aula ? `aula ${a.aula} — ` : ''}${a.conteudo ?? rotuloTipo(a.tipo)}" do conjunto?`, destrutivo: true })
    if (!sim) return
    setOcupado(`aula:${a.id}`)
    const r = await excluirAula(a.id)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
    setAulas((xs) => xs.filter((x) => x.id !== a.id))
  }

  function patchAula(id: string, p: Partial<AulaBanco>) {
    setAulas((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }

  return (
    <>
      {/* Cabeçalho do conjunto */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpen className="h-6 w-6 text-primary" />
            {conjunto.nome}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline">{conjunto.disciplina}</Badge>
            <Badge variant="outline">{aulas.length.toLocaleString('pt-BR')} aula(s)</Badge>
          </div>
          {conjunto.descricao && <p className="mt-1 text-sm text-muted-foreground">{conjunto.descricao}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditarConjuntoAberto(true)}>
          <Pencil className="mr-1 h-4 w-4" /> Editar conjunto
        </Button>
      </div>

      {/* Adição rápida de aula */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Adicionar aula</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v ?? tipo)}>
              <SelectTrigger className="h-8"><SelectValue>{rotuloTipo(tipo)}</SelectValue></SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-16">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Aula</Label>
            <Input value={aulaTxt} onChange={(e) => setAulaTxt(e.target.value)} placeholder="01" className="h-8" />
          </div>
          <div className="min-w-44 flex-1">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Conteúdo</Label>
            <Input value={conteudo} onChange={(e) => setConteudo(e.target.value)} placeholder="O que o aluno estuda" className="h-8" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarAula())} />
          </div>
          <div className="w-24">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Duração</Label>
            <Input value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="1:30" className="h-8" />
          </div>
          <div className="min-w-40 flex-1">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Vídeo (URL)</Label>
            <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…" className="h-8" />
          </div>
          <Button size="sm" onClick={adicionarAula} disabled={ocupado === 'nova'} className="h-8">
            {ocupado === 'nova' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Adicionar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Enter grava e a aula avança sozinha. Questões e links QC/TEC ficam em cada aula abaixo.</p>
      </div>

      {/* Aulas */}
      {aulas.length === 0 ? (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground shadow-sm">Nenhuma aula ainda. Adicione a primeira acima.</div>
      ) : (
        <div className="space-y-2">
          {aulas.map((a) => {
            const aberta = expandida === a.id
            return (
              <div key={a.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <button onClick={() => setExpandida(aberta ? null : a.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {aberta ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corTipo(a.tipo) ?? 'var(--muted-foreground)' }} />
                    <span className="shrink-0 text-xs text-muted-foreground">{rotuloTipo(a.tipo)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {a.aula && <span className="font-medium">aula {a.aula} · </span>}
                      {a.conteudo || <span className="text-muted-foreground">sem conteúdo</span>}
                    </span>
                  </button>
                  {a.duracao && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{a.duracao}</span>}
                  {a.video_url && <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  {a.urls.length > 0 && <Badge variant="outline" className="shrink-0 gap-1 text-[10px]"><Link2 className="h-3 w-3" />{a.urls.length}</Badge>}
                  {a.questoes.length > 0 && <Badge variant="outline" className="shrink-0 text-[10px]">{a.questoes.length} q</Badge>}
                  <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => removerAula(a)} disabled={ocupado === `aula:${a.id}`} title="Excluir aula">
                    {ocupado === `aula:${a.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                  </Button>
                </div>

                {aberta && (
                  <AulaPainel
                    aula={a}
                    tipos={tipos}
                    plataformas={plataformas}
                    disciplinaFiltro={conjunto.disciplina_id ? [{ id: conjunto.disciplina_id, nome: conjunto.disciplina }] : disciplinas}
                    ocupado={ocupado}
                    setOcupado={setOcupado}
                    onPatch={(p) => patchAula(a.id, p)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog: editar conjunto */}
      <EditarConjuntoDialog
        aberto={editarConjuntoAberto}
        aoFechar={() => setEditarConjuntoAberto(false)}
        conjunto={conjunto}
        disciplinas={disciplinas}
        onCriarDisciplina={criarDisciplinaLocal}
        onSalvo={(v) => setConjunto((c) => ({ ...c, ...v }))}
      />
    </>
  )
}

// ── Painel expandido de uma aula: editar campos + links + questões ──
function AulaPainel({
  aula,
  tipos,
  plataformas,
  disciplinaFiltro,
  ocupado,
  setOcupado,
  onPatch,
}: {
  aula: AulaBanco
  tipos: TipoMetaDef[]
  plataformas: { id: string; nome: string; slug: string }[]
  disciplinaFiltro: { id: string; nome: string }[]
  ocupado: string | null
  setOcupado: (v: string | null) => void
  onPatch: (p: Partial<AulaBanco>) => void
}) {
  const [tipo, setTipo] = useState(aula.tipo)
  const [aulaTxt, setAulaTxt] = useState(aula.aula ?? '')
  const [conteudo, setConteudo] = useState(aula.conteudo ?? '')
  const [duracao, setDuracao] = useState(aula.duracao ?? '')
  const [video, setVideo] = useState(aula.video_url ?? '')
  const [tema, setTema] = useState(aula.tema ?? '')
  const [urls, setUrls] = useState<Record<string, string>>(() => Object.fromEntries(aula.urls.map((u) => [u.plataforma_id, u.url])))
  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug

  async function salvarCampos() {
    setOcupado(`salvar:${aula.id}`)
    const r = await atualizarAula(aula.id, { tipo, aula: aulaTxt, conteudo, duracao, video_url: video, tema })
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível salvar.')
    onPatch({ tipo, aula: aulaTxt.trim() || null, conteudo: conteudo.trim() || null, duracao: duracao.trim() || null, video_url: video.trim() || null, tema: tema.trim() || null })
    toast.success('Aula salva')
  }

  async function salvarLinks() {
    const lista = Object.entries(urls).map(([plataforma_id, url]) => ({ plataforma_id, url })).filter((u) => u.url.trim())
    setOcupado(`links:${aula.id}`)
    const r = await salvarUrlsAula(aula.id, lista)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível salvar os links.')
    onPatch({ urls: lista })
    toast.success('Links salvos')
  }

  async function anexar(ids: string[], itens: { id: string; external_id: string | null; enunciado: string }[]) {
    const r = await anexarQuestoes(aula.id, ids)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível anexar.')
    const novos = itens.filter((i) => !aula.questoes.some((q) => q.id === i.id))
    onPatch({ questoes: [...aula.questoes, ...novos.map((i) => ({ id: i.id, external_id: i.external_id, enunciado: i.enunciado.slice(0, 140) }))] })
    toast.success(`${r.adicionadas ?? novos.length} questão(ões) anexada(s)`)
  }

  async function remover(qid: string) {
    const r = await removerQuestao(aula.id, qid)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível remover.')
    onPatch({ questoes: aula.questoes.filter((q) => q.id !== qid) })
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 p-4">
      {/* Campos */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v ?? tipo)}>
            <SelectTrigger className="h-8"><SelectValue>{rotuloTipo(tipo)}</SelectValue></SelectTrigger>
            <SelectContent>{tipos.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-16">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Aula</Label>
          <Input value={aulaTxt} onChange={(e) => setAulaTxt(e.target.value)} placeholder="01" className="h-8" />
        </div>
        <div className="w-28">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Duração</Label>
          <Input value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="1:30" className="h-8" />
        </div>
        <div className="min-w-52 flex-1">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Vídeo (URL)</Label>
          <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…" className="h-8" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Conteúdo</Label>
          <Textarea rows={2} value={conteudo} onChange={(e) => setConteudo(e.target.value)} placeholder="O que o aluno estuda" />
        </div>
        <div className="w-52">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tema (link)</Label>
          <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Título que aparece no desempenho" className="h-8" />
        </div>
        <Button size="sm" onClick={salvarCampos} disabled={ocupado === `salvar:${aula.id}`} className="h-8">
          {ocupado === `salvar:${aula.id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar aula
        </Button>
      </div>

      {/* Links por plataforma */}
      {plataformas.length > 0 && (
        <div className="space-y-1.5 rounded-xl border bg-card p-3">
          <p className="text-xs font-semibold">Links de questões (por plataforma)</p>
          {plataformas.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-xs font-medium text-muted-foreground" title={p.nome}>{p.nome}</span>
              <Input value={urls[p.id] ?? ''} onChange={(e) => setUrls((u) => ({ ...u, [p.id]: e.target.value }))} placeholder="https://…" className="h-8" />
            </div>
          ))}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={salvarLinks} disabled={ocupado === `links:${aula.id}`} className="h-7">
              {ocupado === `links:${aula.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Salvar links
            </Button>
          </div>
        </div>
      )}

      {/* Questões anexadas */}
      <div className="space-y-1.5 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">Questões da aula <span className="font-normal text-muted-foreground">({aula.questoes.length})</span></p>
          <AdicionarQuestoesDialog
            disciplinas={disciplinaFiltro}
            jaIds={new Set(aula.questoes.map((q) => q.id))}
            onSelecionar={(items) => anexar(items.map((i) => i.id), items.map((i) => ({ id: i.id, external_id: i.external_id, enunciado: i.enunciado })))}
          />
        </div>
        {aula.questoes.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Nenhuma questão anexada. Use "Adicionar questões".</p>
        ) : (
          <div className="space-y-0.5">
            {aula.questoes.map((q) => (
              <div key={q.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/40">
                {q.external_id && <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{q.external_id}</Badge>}
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{q.enunciado || '—'}</span>
                <button onClick={() => remover(q.id)} title="Remover" className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dialog: editar dados do conjunto ──
function EditarConjuntoDialog({
  aberto,
  aoFechar,
  conjunto,
  disciplinas,
  onCriarDisciplina,
  onSalvo,
}: {
  aberto: boolean
  aoFechar: () => void
  conjunto: ConjuntoDetalhe['conjunto']
  disciplinas: { id: string; nome: string }[]
  onCriarDisciplina: (n: string) => Promise<{ id: string; nome: string } | null>
  onSalvo: (v: { nome: string; disciplina: string; disciplina_id: string | null; descricao: string | null }) => void
}) {
  const [nome, setNome] = useState(conjunto.nome)
  const [disciplina, setDisciplina] = useState(conjunto.disciplina)
  const [disciplinaId, setDisciplinaId] = useState<string | null>(conjunto.disciplina_id)
  const [descricao, setDescricao] = useState(conjunto.descricao ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (nome.trim().length < 2) return toast.error('Informe um nome (mín. 2 letras).')
    setSalvando(true)
    const r = await atualizarConjunto(conjunto.id, { nome, disciplina, disciplina_id: disciplinaId, descricao })
    setSalvando(false)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível salvar.')
    onSalvo({ nome: nome.trim(), disciplina: disciplina.trim(), disciplina_id: disciplinaId, descricao: descricao.trim() || null })
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar conjunto</DialogTitle>
          <DialogDescription>Nome, disciplina e descrição do conjunto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Disciplina</Label>
            <DisciplinaPicker disciplinas={disciplinas} nome={disciplina} disciplinaId={disciplinaId} onChange={(v) => { setDisciplina(v.nome); setDisciplinaId(v.disciplina_id) }} onCriar={onCriarDisciplina} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
