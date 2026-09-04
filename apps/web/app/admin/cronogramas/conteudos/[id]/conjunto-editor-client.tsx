'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookOpen, ChevronDown, Link2, Loader2, Pencil, Plus, Save, Search, Send, Trash2, Video } from 'lucide-react'
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
  contarPropagacao,
  criarAula,
  excluirAula,
  propagarConteudoAula,
  removerQuestao,
  salvarPdfAula,
  salvarUrlsAula,
  type AulaBanco,
  type ConjuntoDetalhe,
  type PropagacaoAlvo,
} from '../actions'

// Rascunho editável de uma aula: tudo que o botão "Salvar" único do topo persiste de uma vez.
// `urls` = links de questões por plataforma (QC/TEC), SEM o PDF/Vídeo (que têm campo próprio).
type Rascunho = { tipo: string; aula: string; conteudo: string; video: string; tema: string; pdf: string; urls: Record<string, string> }

function rascunhoDe(a: AulaBanco, pdfPlatId?: string): Rascunho {
  const urls: Record<string, string> = {}
  let pdf = ''
  for (const u of a.urls) {
    if (pdfPlatId && u.plataforma_id === pdfPlatId) pdf = u.url
    else urls[u.plataforma_id] = u.url
  }
  return { tipo: a.tipo, aula: a.aula ?? '', conteudo: a.conteudo ?? '', video: a.video_url ?? '', tema: a.tema ?? '', pdf, urls }
}

// Chave canônica (trim + urls ordenadas, sem vazios) para detectar alteração pendente.
function chaveRascunho(r: Rascunho): string {
  const urls = Object.keys(r.urls)
    .sort()
    .map((k) => `${k}=${r.urls[k].trim()}`)
    .filter((s) => !s.endsWith('='))
    .join('|')
  return JSON.stringify([r.tipo, r.aula.trim(), r.conteudo.trim(), r.video.trim(), r.tema.trim(), r.pdf.trim(), urls])
}

/**
 * Colapsável animado (abrir/fechar) via truque grid-rows 0fr↔1fr — anima a altura sem
 * precisar medir o conteúdo. Mantém o conteúdo montado durante a animação de fechar e o
 * desmonta só no fim (lazy: nada pesado montado enquanto fechado).
 */
function Expandivel({ aberto, children }: { aberto: boolean; children: ReactNode }) {
  const [montado, setMontado] = useState(aberto)
  const [expandido, setExpandido] = useState(aberto)
  useEffect(() => {
    if (aberto) {
      setMontado(true)
      // Próximo frame: 0fr → 1fr, para a transição pegar (o conteúdo já pintou em 0fr).
      const id = requestAnimationFrame(() => setExpandido(true))
      return () => cancelAnimationFrame(id)
    }
    setExpandido(false)
  }, [aberto])
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandido ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      onTransitionEnd={(e) => { if (!aberto && e.propertyName === 'grid-template-rows') setMontado(false) }}
    >
      <div className="min-h-0 overflow-hidden">{montado ? children : null}</div>
    </div>
  )
}

export function ConjuntoEditorClient({
  dados,
  tipos,
  disciplinas: disciplinasIniciais,
  filtroInicial,
}: {
  dados: ConjuntoDetalhe
  tipos: TipoMetaDef[]
  disciplinas: { id: string; nome: string }[]
  /** Aberto pela aba LegProc → o editor entra filtrado só nesse tipo. */
  filtroInicial?: string
}) {
  const [conjunto, setConjunto] = useState(dados.conjunto)
  const [aulas, setAulas] = useState<AulaBanco[]>(dados.aulas)
  const [disciplinas, setDisciplinas] = useState(disciplinasIniciais)
  const plataformas = dados.plataformas
  const pdfPlatId = plataformas.find((p) => p.slug === 'pdf')?.id
  // "Links" no selo = só QC/TEC (Vídeo/PDF têm campo próprio) — senão o número mente.
  const slugPorPlat = useMemo(() => new Map(plataformas.map((p) => [p.id, p.slug])), [plataformas])
  const contarLinksQC = (a: AulaBanco) => a.urls.filter((u) => { const s = slugPorPlat.get(u.plataforma_id); return s !== 'pdf' && s !== 'video' }).length
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>(() => Object.fromEntries(dados.aulas.map((a) => [a.id, rascunhoDe(a, pdfPlatId)])))
  const [salvos, setSalvos] = useState<Record<string, string>>(() => Object.fromEntries(dados.aulas.map((a) => [a.id, chaveRascunho(rascunhoDe(a, pdfPlatId))])))
  const [salvandoTudo, setSalvandoTudo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState(filtroInicial ?? 'todos')
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set())
  const [aulasAbertas, setAulasAbertas] = useState<Set<string>>(new Set())
  const [editarConjuntoAberto, setEditarConjuntoAberto] = useState(false)
  // null = fechado; {} = nova aula; { aulaFixa, bloqueados } = adicionar conteúdo a uma aula existente.
  const [novaAula, setNovaAula] = useState<{ aulaFixa?: string; bloqueados?: string[] } | null>(null)

  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const corTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null
  const ordemTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.ordem ?? 999

  // Agrupa por AULA normalizada: "01" e "1" caem na mesma aula; sem número vira "Sem aula".
  const chaveAula = (aula: string | null) => {
    const t = (aula ?? '').trim()
    if (!t) return ''
    return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()
  }
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  const grupos = useMemo(() => {
    const t = norm(busca.trim())
    const filtradas = aulas.filter(
      (a) => (filtroTipo === 'todos' || a.tipo === filtroTipo) && (!t || norm(`${a.aula ?? ''} ${a.conteudo ?? ''} ${rotuloTipo(a.tipo)}`).includes(t)),
    )
    const mapa = new Map<string, { key: string; num: number; entries: AulaBanco[] }>()
    for (const a of filtradas) {
      const k = chaveAula(a.aula)
      let g = mapa.get(k)
      if (!g) {
        g = { key: k, num: k ? Number(k) : Number.POSITIVE_INFINITY, entries: [] }
        mapa.set(k, g)
      }
      g.entries.push(a)
    }
    for (const g of mapa.values()) g.entries.sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.ordem - b.ordem)
    return [...mapa.values()].sort((a, b) => a.num - b.num || a.key.localeCompare(b.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aulas, busca, filtroTipo, tipos])

  const toggleGrupo = (k: string) => setGruposAbertos((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleAula = (id: string) => setAulasAbertas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Salvamento único (o botão do topo persiste TODAS as aulas com alteração pendente) ──
  const sujos = useMemo(
    () => aulas.filter((a) => rascunhos[a.id] && chaveRascunho(rascunhos[a.id]) !== salvos[a.id]).map((a) => a.id),
    [aulas, rascunhos, salvos],
  )

  const atualizarRascunho = useCallback((id: string, p: Partial<Rascunho>) => {
    setRascunhos((rs) => ({ ...rs, [id]: { ...rs[id], ...p } }))
  }, [])

  // Toda aula PRECISA de rascunho/baseline — senão o painel de edição não abre ao expandir.
  // Cobre aulas novas e metas que o seeding inicial (ou uma recarga do servidor) não pegou.
  useEffect(() => {
    setRascunhos((rs) => {
      let mudou = false
      const n = { ...rs }
      for (const a of aulas) if (!n[a.id]) { n[a.id] = rascunhoDe(a, pdfPlatId); mudou = true }
      return mudou ? n : rs
    })
    setSalvos((s) => {
      let mudou = false
      const n = { ...s }
      for (const a of aulas) if (n[a.id] == null) { n[a.id] = chaveRascunho(rascunhoDe(a, pdfPlatId)); mudou = true }
      return mudou ? n : s
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aulas])

  // Guarda: avisa ao sair da página com alteração pendente (reload/fechar/URL externa) e
  // confirma em cliques de links internos (a navegação SPA não dispara beforeunload).
  useEffect(() => {
    if (!sujos.length) return
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank') return
      const href = a.getAttribute('href') ?? ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (a.pathname === window.location.pathname) return
      if (!window.confirm('Há alterações não salvas nesta página. Sair mesmo assim?')) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', onBefore)
    document.addEventListener('click', onClick, true)
    return () => { window.removeEventListener('beforeunload', onBefore); document.removeEventListener('click', onClick, true) }
  }, [sujos.length])

  async function salvarTudo() {
    const ids = sujos
    if (!ids.length || salvandoTudo) return
    setSalvandoTudo(true)
    const videoPlatId = plataformas.find((p) => p.slug === 'video')?.id
    let ok = 0
    const falhas: string[] = []
    for (const id of ids) {
      const rc = rascunhos[id]
      if (!rc) continue
      const r1 = await atualizarAula(id, { tipo: rc.tipo, aula: rc.aula, conteudo: rc.conteudo, video_url: rc.video, tema: rc.tema })
      if (!r1.ok) { falhas.push(id); continue }
      // QC/TEC (exclui PDF/Vídeo). salvarUrlsAula apaga TODAS as urls → precisa rodar ANTES do PDF.
      const lista = Object.entries(rc.urls)
        .filter(([pid, url]) => pid !== pdfPlatId && pid !== videoPlatId && url.trim())
        .map(([plataforma_id, url]) => ({ plataforma_id, url: url.trim() }))
      const r2 = await salvarUrlsAula(id, lista)
      if (!r2.ok) { falhas.push(id); continue }
      const rp = await salvarPdfAula(id, rc.pdf)
      if (!rp.ok) { falhas.push(id); continue }
      // Atualiza a baseline (aulas + salvos) sem recarregar.
      const novasUrls: AulaBanco['urls'] = [...lista]
      if (rp.plataformaId && rc.pdf.trim()) novasUrls.push({ plataforma_id: rp.plataformaId, url: rc.pdf.trim() })
      setAulas((xs) => xs.map((a) => (a.id === id ? { ...a, tipo: rc.tipo, aula: rc.aula.trim() || null, conteudo: rc.conteudo.trim() || null, video_url: rc.video.trim() || null, tema: rc.tema.trim() || null, urls: novasUrls } : a)))
      setSalvos((s) => ({ ...s, [id]: chaveRascunho(rc) }))
      ok++
    }
    setSalvandoTudo(false)
    if (falhas.length) toast.error(`${falhas.length} aula(s) não puderam ser salvas.`)
    if (ok) toast.success(`${ok} aula(s) salva(s).`)
  }

  // ── Adição rápida de aula (a duração NÃO fica no conteúdo — é definida na criação do cronograma) ──

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

  function aoCriarAulas(novas: AulaBanco[], aula: string) {
    setAulas((xs) => [...xs, ...novas.map((n, i) => ({ ...n, ordem: xs.length + i }))])
    setRascunhos((rs) => { const n = { ...rs }; for (const a of novas) n[a.id] = rascunhoDe(a, pdfPlatId); return n })
    setSalvos((s) => { const n = { ...s }; for (const a of novas) n[a.id] = chaveRascunho(rascunhoDe(a, pdfPlatId)); return n })
    setGruposAbertos((s) => { const n = new Set(s); n.add(chaveAula(aula || null)); return n })
  }

  async function removerAula(a: AulaBanco) {
    const sim = await confirmar({ titulo: 'Excluir aula', mensagem: `Remover "${a.aula ? `aula ${a.aula} — ` : ''}${a.conteudo ?? rotuloTipo(a.tipo)}" do conjunto?`, destrutivo: true })
    if (!sim) return
    setOcupado(`aula:${a.id}`)
    const r = await excluirAula(a.id)
    setOcupado(null)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
    setAulas((xs) => xs.filter((x) => x.id !== a.id))
    setRascunhos((rs) => { const n = { ...rs }; delete n[a.id]; return n })
    setSalvos((s) => { const n = { ...s }; delete n[a.id]; return n })
  }

  // Exclui a AULA INTEIRA: apaga todos os conteúdos (linhas) daquele número de aula.
  async function removerGrupo(g: { key: string; entries: AulaBanco[] }) {
    const sim = await confirmar({
      titulo: 'Excluir aula inteira',
      mensagem: `Remover a ${g.key ? `Aula ${g.key}` : 'aula sem número'} e TODOS os ${g.entries.length} conteúdo(s) dela? Esta ação não pode ser desfeita.`,
      destrutivo: true,
    })
    if (!sim) return
    setOcupado(`grupo:${g.key}`)
    let falhou = false
    const removidos: string[] = []
    for (const a of g.entries) {
      const r = await excluirAula(a.id)
      if (r.ok) removidos.push(a.id)
      else falhou = true
    }
    setOcupado(null)
    if (removidos.length) {
      const ids = new Set(removidos)
      setAulas((xs) => xs.filter((x) => !ids.has(x.id)))
      setRascunhos((rs) => { const n = { ...rs }; for (const id of ids) delete n[id]; return n })
      setSalvos((s) => { const n = { ...s }; for (const id of ids) delete n[id]; return n })
    }
    if (falhou) toast.error('Alguns conteúdos não puderam ser excluídos.')
    else toast.success('Aula excluída.')
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
        <div className="flex shrink-0 items-center gap-2">
          {sujos.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400" title="Há alterações não salvas">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {sujos.length} não salva(s)
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditarConjuntoAberto(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Editar conjunto
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNovaAula({})}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar aula
          </Button>
          <Button size="sm" onClick={salvarTudo} disabled={!sujos.length || salvandoTudo}>
            {salvandoTudo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar{sujos.length ? ` (${sujos.length})` : ''}
          </Button>
        </div>
      </div>

      {/* Pop-up de criação: "Adicionar aula" (nova) ou "+ Conteúdo" (adiciona a uma aula existente). */}
      <NovaAulaDialog
        aberto={!!novaAula}
        aoFechar={() => setNovaAula(null)}
        tipos={tipos}
        conjuntoId={conjunto.id}
        onCriadas={aoCriarAulas}
        aulaFixa={novaAula?.aulaFixa}
        tiposBloqueados={novaAula?.bloqueados}
      />

      {/* Barra de ferramentas: busca + filtro por tipo + expandir/recolher */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aula ou conteúdo…" className="h-9 pl-8" />
        </div>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v ?? 'todos')}>
          <SelectTrigger className="h-9 w-44"><SelectValue>{filtroTipo === 'todos' ? 'Todos os tipos' : rotuloTipo(filtroTipo)}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tipos.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setGruposAbertos(new Set(grupos.map((g) => g.key)))}>Expandir tudo</Button>
        <Button size="sm" variant="ghost" onClick={() => { setGruposAbertos(new Set()); setAulasAbertas(new Set()) }}>Recolher</Button>
        <span className="ml-auto text-xs text-muted-foreground">{grupos.length} aula(s) · {aulas.length} conteúdo(s)</span>
      </div>

      {/* Tabela de aulas — agrupada por aula (Aula 01 reúne PDF, Resolução, Flashcards…) */}
      {grupos.length === 0 ? (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground shadow-sm">
          {aulas.length === 0 ? 'Nenhuma aula ainda. Adicione a primeira acima.' : 'Nada encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const aberto = gruposAbertos.has(g.key)
            const totalLinks = g.entries.reduce((n, a) => n + contarLinksQC(a), 0)
            const totalQ = g.entries.reduce((n, a) => n + a.questoes.length, 0)
            return (
              <div key={g.key} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="flex items-center gap-2 pr-2">
                  <button onClick={() => toggleGrupo(g.key)} className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left transition hover:bg-muted/30">
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${aberto ? '' : '-rotate-90'}`} />
                    <span className="font-semibold">{g.key ? `Aula ${g.key}` : 'Sem número de aula'}</span>
                    <Badge variant="secondary" className="shrink-0">{g.entries.length} conteúdo(s)</Badge>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {[...new Set(g.entries.map((a) => a.tipo))].map((tp) => (
                        <span key={tp} className="h-2 w-2 rounded-full" style={{ background: corTipo(tp) ?? 'var(--muted-foreground)' }} title={rotuloTipo(tp)} />
                      ))}
                      {totalLinks > 0 && <Badge variant="outline" className="gap-1 text-[10px]"><Link2 className="h-3 w-3" />{totalLinks}</Badge>}
                      {totalQ > 0 && <Badge variant="outline" className="text-[10px]">{totalQ} q</Badge>}
                    </span>
                  </button>
                  {/* Ações da aula: adicionar mais um conteúdo (bloqueando os já criados) e excluir a aula toda. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="group h-7 shrink-0 gap-1 px-2 text-xs transition-colors hover:bg-primary/10 hover:text-primary active:bg-primary/20"
                    onClick={() => setNovaAula({ aulaFixa: g.entries[0]?.aula ?? '', bloqueados: [...new Set(g.entries.map((a) => a.tipo))] })}
                    title="Adicionar mais um conteúdo a esta aula"
                  >
                    <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90 group-active:scale-90" /> Conteúdo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="group h-7 w-7 shrink-0 p-0 transition-colors hover:bg-destructive/10 active:bg-destructive/20"
                    onClick={() => removerGrupo(g)}
                    disabled={ocupado === `grupo:${g.key}`}
                    title="Excluir a aula inteira (todos os conteúdos)"
                  >
                    {ocupado === `grupo:${g.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive transition-transform duration-150 group-hover:-rotate-12 group-hover:scale-110 group-active:scale-90" />}
                  </Button>
                </div>

                <Expandivel aberto={aberto}>
                  <div className="divide-y border-t">
                    {g.entries.map((a) => {
                      const aOpen = aulasAbertas.has(a.id)
                      const nLinks = contarLinksQC(a)
                      return (
                        <div key={a.id} className={aOpen ? 'bg-muted/10' : ''}>
                          <div className="flex items-center gap-2 pr-3">
                            <button onClick={() => toggleAula(a.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-9 text-left">
                              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${aOpen ? '' : '-rotate-90'}`} />
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corTipo(a.tipo) ?? 'var(--muted-foreground)' }} />
                              <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{rotuloTipo(a.tipo)}</span>
                              <span className="min-w-0 flex-1 truncate text-sm">{a.conteudo || <span className="text-muted-foreground">sem conteúdo</span>}</span>
                            </button>
                            {a.video_url && <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            {nLinks > 0 && <Badge variant="outline" className="shrink-0 gap-1 text-[10px]"><Link2 className="h-3 w-3" />{nLinks}</Badge>}
                            {a.questoes.length > 0 && <Badge variant="outline" className="shrink-0 text-[10px]">{a.questoes.length} q</Badge>}
                            <Button size="sm" variant="ghost" className="group h-7 w-7 shrink-0 p-0 transition-colors hover:bg-destructive/10 active:bg-destructive/20" onClick={() => removerAula(a)} disabled={ocupado === `aula:${a.id}`} title="Excluir">
                              {ocupado === `aula:${a.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive transition-transform duration-150 group-hover:-rotate-12 group-hover:scale-110 group-active:scale-90" />}
                            </Button>
                          </div>
                          <Expandivel aberto={aOpen}>
                            <AulaPainel
                              aula={a}
                              rascunho={rascunhos[a.id] ?? rascunhoDe(a, pdfPlatId)}
                              onChange={(p) => atualizarRascunho(a.id, p)}
                              tipos={tipos}
                              plataformas={plataformas}
                              disciplinaFiltro={conjunto.disciplina_id ? [{ id: conjunto.disciplina_id, nome: conjunto.disciplina }] : disciplinas}
                              disciplinaConjunto={conjunto.disciplina}
                              onPatchQuestoes={(questoes) => patchAula(a.id, { questoes })}
                            />
                          </Expandivel>
                        </div>
                      )
                    })}
                  </div>
                </Expandivel>
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

// ── Pop-up "Adicionar aula": configura vários tipos da MESMA aula de uma vez ──
const TIPOS_PADRAO = ['pdfull', 'flash', 'quest', 'legproc']
type LinhaNova = { key: string; tipo: string; conteudo: string; video: string; pdf: string }
let seqLinha = 0

function NovaAulaDialog({
  aberto,
  aoFechar,
  tipos,
  conjuntoId,
  onCriadas,
  aulaFixa,
  tiposBloqueados,
}: {
  aberto: boolean
  aoFechar: () => void
  tipos: TipoMetaDef[]
  conjuntoId: string
  onCriadas: (novas: AulaBanco[], aula: string) => void
  /** Ao adicionar conteúdo a uma aula existente: trava o número da aula. */
  aulaFixa?: string
  /** Tipos que JÁ existem na aula — ficam bloqueados (não podem ser adicionados de novo). */
  tiposBloqueados?: string[]
}) {
  const modoAdd = aulaFixa != null
  const bloqueados = useMemo(() => new Set(tiposBloqueados ?? []), [tiposBloqueados])
  // Tipos que ainda podem ser criados nesta aula (no modo "adicionar", tira os já presentes).
  const tiposLivres = useMemo(() => tipos.filter((t) => !bloqueados.has(t.slug)), [tipos, bloqueados])
  const rotulo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const cor = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null
  const [aulaNum, setAulaNum] = useState('01')
  const [linhas, setLinhas] = useState<LinhaNova[]>([])
  const [salvando, setSalvando] = useState(false)

  // Ao abrir: número da aula (fixo no modo "adicionar") + semeia os tipos livres.
  useEffect(() => {
    if (!aberto) return
    const livres = tiposLivres.map((t) => t.slug)
    let fonte: string[]
    if (modoAdd) {
      // Adicionar: começa com 1 tipo livre (o 1º padrão livre, senão o 1º livre qualquer).
      const padraoLivre = TIPOS_PADRAO.find((s) => livres.includes(s))
      fonte = padraoLivre ? [padraoLivre] : livres.slice(0, 1)
    } else {
      const base = TIPOS_PADRAO.filter((s) => livres.includes(s))
      fonte = base.length ? base : livres.slice(0, 4)
    }
    setLinhas(fonte.map((s) => ({ key: `k${seqLinha++}`, tipo: s, conteudo: '', video: '', pdf: '' })))
    setAulaNum(aulaFixa && aulaFixa.trim() ? aulaFixa : '01')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const disponiveis = tiposLivres.filter((t) => !linhas.some((l) => l.tipo === t.slug))
  const patch = (key: string, p: Partial<LinhaNova>) => setLinhas((xs) => xs.map((l) => (l.key === key ? { ...l, ...p } : l)))
  const remover = (key: string) => setLinhas((xs) => xs.filter((l) => l.key !== key))
  function addLinha() {
    const t = disponiveis[0] ?? tiposLivres[0]
    if (!t) return
    setLinhas((xs) => [...xs, { key: `k${seqLinha++}`, tipo: t.slug, conteudo: '', video: '', pdf: '' }])
  }

  async function salvar() {
    const aula = aulaNum.trim()
    const comConteudo = linhas.filter((l) => l.conteudo.trim() || l.video.trim() || l.pdf.trim())
    if (!comConteudo.length) return toast.error('Preencha o conteúdo (vídeo ou PDF) de ao menos um tipo.')
    setSalvando(true)
    const criadas: AulaBanco[] = []
    for (const l of comConteudo) {
      const r = await criarAula(conjuntoId, { tipo: l.tipo, aula, conteudo: l.conteudo, video_url: l.video })
      if (!r.ok || !r.id) continue
      const urls: AulaBanco['urls'] = []
      // O PDF é um link (sob a plataforma "PDF") — grava após criar a aula.
      if (l.pdf.trim()) {
        const rp = await salvarPdfAula(r.id, l.pdf)
        if (rp.ok && rp.plataformaId) urls.push({ plataforma_id: rp.plataformaId, url: l.pdf.trim() })
      }
      criadas.push({ id: r.id, tipo: l.tipo, aula: aula || null, conteudo: l.conteudo.trim() || null, duracao: null, video_url: l.video.trim() || null, tema: null, ordem: 0, urls, questoes: [] })
    }
    setSalvando(false)
    if (!criadas.length) return toast.error('Não foi possível criar a aula.')
    onCriadas(criadas, aula)
    toast.success(`${criadas.length} tipo(s) criado(s) na Aula ${aula || '—'}`)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modoAdd ? `Adicionar conteúdo à Aula ${aulaNum || '—'}` : 'Adicionar aula'}</DialogTitle>
          <DialogDescription>
            {modoAdd
              ? 'Os tipos já criados nesta aula ficam bloqueados — escolha os que faltam. Só os tipos com conteúdo (vídeo ou PDF) são criados.'
              : 'Configure os tipos desta aula de uma vez. Só os tipos com conteúdo (ou vídeo) são criados.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-3">
          <div className="w-24">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Aula</Label>
            <Input value={aulaNum} onChange={(e) => setAulaNum(e.target.value)} placeholder="01" className="h-9" autoFocus={!modoAdd} disabled={modoAdd} />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            {modoAdd ? 'Os novos tipos entram nesta aula.' : 'Todos os tipos abaixo entram nesta mesma aula.'}
          </p>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {linhas.length === 0 ? (
            <p className="rounded-xl border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Todos os tipos já existem nesta aula.
            </p>
          ) : (
            linhas.map((l) => (
              <div key={l.key} className="space-y-2 rounded-xl border bg-muted/20 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor(l.tipo) ?? 'var(--muted-foreground)' }} />
                  <Select value={l.tipo} onValueChange={(v) => patch(l.key, { tipo: v ?? l.tipo })}>
                    <SelectTrigger className="h-8 w-56"><SelectValue>{rotulo(l.tipo)}</SelectValue></SelectTrigger>
                    <SelectContent>{tiposLivres.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  {linhas.length > 1 && (
                    <button onClick={() => remover(l.key)} className="ml-auto text-muted-foreground hover:text-destructive" title="Remover tipo"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <Input value={l.conteudo} onChange={(e) => patch(l.key, { conteudo: e.target.value })} placeholder="Conteúdo (o que o aluno estuda)" className="h-8" />
                <div className="flex gap-2">
                  <Input value={l.video} onChange={(e) => patch(l.key, { video: e.target.value })} placeholder="Vídeo (URL) — opcional" className="h-8" />
                  <Input value={l.pdf} onChange={(e) => patch(l.key, { pdf: e.target.value })} placeholder="PDF (URL) — opcional" className="h-8" />
                </div>
              </div>
            ))
          )}
          {linhas.length > 0 && (
            <Button size="sm" variant="ghost" onClick={addLinha} disabled={!disponiveis.length} className="h-7"><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar tipo</Button>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || linhas.length === 0}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} {modoAdd ? 'Adicionar' : 'Criar aula'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Painel expandido de uma aula: edição CONTROLADA (o "Salvar" único do topo persiste tudo) ──
function AulaPainel({
  aula,
  rascunho,
  onChange,
  tipos,
  plataformas,
  disciplinaFiltro,
  disciplinaConjunto,
  onPatchQuestoes,
}: {
  aula: AulaBanco
  rascunho: Rascunho
  onChange: (p: Partial<Rascunho>) => void
  tipos: TipoMetaDef[]
  plataformas: { id: string; nome: string; slug: string }[]
  disciplinaFiltro: { id: string; nome: string }[]
  disciplinaConjunto: string
  onPatchQuestoes: (questoes: AulaBanco['questoes']) => void
}) {
  const [propagar, setPropagar] = useState(false)
  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  // Só a "Resolução de Questões" (tipo com mostra_links) tem links + questões. Os outros
  // (PDFULL, PDFLASH, LegProc) são só conteúdo/vídeo/PDF — sem essas funções.
  const mostraLinks = tipos.find((t) => t.slug === rascunho.tipo)?.mostra_links ?? false
  const plataformasLink = plataformas.filter((p) => p.slug !== 'pdf' && p.slug !== 'video')
  // Links QC/TEC JÁ SALVOS nesta aula (baseline) — mesmo num tipo que não usa links (legado de
  // importação). Sem isso, o selo "🔗 N" apareceria sem lugar para ver/limpar os links.
  const temLinksSalvos = aula.urls.some((u) => {
    const p = plataformas.find((x) => x.id === u.plataforma_id)
    return !!p && p.slug !== 'pdf' && p.slug !== 'video' && (u.url ?? '').trim() !== ''
  })

  async function anexar(ids: string[], itens: { id: string; external_id: string | null; enunciado: string }[]) {
    const r = await anexarQuestoes(aula.id, ids)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível anexar.')
    const novos = itens.filter((i) => !aula.questoes.some((q) => q.id === i.id))
    onPatchQuestoes([...aula.questoes, ...novos.map((i) => ({ id: i.id, external_id: i.external_id, enunciado: i.enunciado.slice(0, 140) }))])
    toast.success(`${r.adicionadas ?? novos.length} questão(ões) anexada(s)`)
  }

  async function remover(qid: string) {
    const r = await removerQuestao(aula.id, qid)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível remover.')
    onPatchQuestoes(aula.questoes.filter((q) => q.id !== qid))
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 p-4">
      {/* Linha 1: Tipo · Aula (Vídeo/PDF descem para baixo do conteúdo; Tema só na Resolução) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
          <Select value={rascunho.tipo} onValueChange={(v) => onChange({ tipo: v ?? rascunho.tipo })}>
            <SelectTrigger className="h-8 w-full"><SelectValue>{rotuloTipo(rascunho.tipo)}</SelectValue></SelectTrigger>
            <SelectContent>{tipos.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-16 shrink-0">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Aula</Label>
          <Input value={rascunho.aula} onChange={(e) => onChange({ aula: e.target.value })} placeholder="01" className="h-8" />
        </div>
      </div>

      {/* Conteúdo */}
      <div>
        <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Conteúdo</Label>
        <Textarea rows={2} value={rascunho.conteudo} onChange={(e) => onChange({ conteudo: e.target.value })} placeholder="O que o aluno estuda" />
      </div>

      {/* Vídeo + PDF — abaixo do conteúdo */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Vídeo (URL)</Label>
          <Input value={rascunho.video} onChange={(e) => onChange({ video: e.target.value })} placeholder="https://…" className="h-8" />
        </div>
        <div className="min-w-52 flex-1">
          <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">PDF (URL)</Label>
          <Input value={rascunho.pdf} onChange={(e) => onChange({ pdf: e.target.value })} placeholder="https://… (PDF da matéria)" className="h-8" />
        </div>
      </div>

      {/* Links de questões — só na Resolução (Vídeo/PDF têm campos próprios). O Tema é o rótulo
          do link desta aula, usado na tela admin "Links de aula" para diferenciá-lo. */}
      {(mostraLinks || temLinksSalvos) && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <p className="text-xs font-semibold">Links de questões</p>
          {!mostraLinks && temLinksSalvos && (
            <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              Este tipo não usa links (só a “Resolução de Questões” usa) — estes vieram de importação. Apague os campos e salve para removê-los.
            </p>
          )}
          {mostraLinks && (
            <div>
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tema (rótulo do link) <span className="font-normal normal-case">— opcional</span></Label>
              <Input value={rascunho.tema} onChange={(e) => onChange({ tema: e.target.value })} placeholder="Ex.: Princípios fundamentais" className="h-8" />
            </div>
          )}
          {plataformasLink.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Por plataforma</p>
              {plataformasLink.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 truncate text-xs font-medium text-muted-foreground" title={p.nome}>{p.nome}</span>
                  <Input value={rascunho.urls[p.id] ?? ''} onChange={(e) => onChange({ urls: { ...rascunho.urls, [p.id]: e.target.value } })} placeholder="https://…" className="h-8" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Questões anexadas — na Resolução, ou se a aula já tiver questões (legado) para dar onde ver/limpar */}
      {(mostraLinks || aula.questoes.length > 0) && (
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
      )}

      {/* Propagar o conteúdo SALVO desta aula para as metas dos cronogramas que já a usam. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-[11px] text-muted-foreground">
          Propaga o <strong>conteúdo salvo</strong> desta aula para os cronogramas que já a usam (as metas continuam cópias).
        </p>
        <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setPropagar(true)} title="Aplicar este conteúdo às metas dos cronogramas que já usam esta aula">
          <Send className="h-3.5 w-3.5" /> Propagar
        </Button>
      </div>
      <PropagarDialog
        aberto={propagar}
        aoFechar={() => setPropagar(false)}
        alvo={propagar ? { disciplina: disciplinaConjunto, aula: aula.aula ?? '', tipo: aula.tipo, tipoNome: rotuloTipo(aula.tipo), conteudo: aula.conteudo } : null}
      />
    </div>
  )
}

// ── Dialog: propagar o conteúdo do banco para as metas já compostas ──
function PropagarDialog({
  aberto,
  aoFechar,
  alvo,
}: {
  aberto: boolean
  aoFechar: () => void
  alvo: { disciplina: string; aula: string; tipo: string; tipoNome: string; conteudo: string | null } | null
}) {
  const [carregando, setCarregando] = useState(false)
  const [alvos, setAlvos] = useState<PropagacaoAlvo[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto || !alvo) return
    let vivo = true
    setCarregando(true)
    setAlvos([])
    setSel(new Set())
    contarPropagacao({ disciplina: alvo.disciplina, aula: alvo.aula, tipo: alvo.tipo }).then((r) => {
      if (!vivo) return
      setCarregando(false)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível consultar.')
      const xs = r.alvos ?? []
      setAlvos(xs)
      setSel(new Set(xs.map((a) => a.cronograma_id)))
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const metasSel = alvos.filter((a) => sel.has(a.cronograma_id)).reduce((n, a) => n + a.metas, 0)
  const todosMarcados = alvos.length > 0 && sel.size === alvos.length

  async function aplicar() {
    if (!alvo || !sel.size) return
    setSalvando(true)
    const r = await propagarConteudoAula({ disciplina: alvo.disciplina, aula: alvo.aula, tipo: alvo.tipo, conteudo: alvo.conteudo, cronogramaIds: [...sel] })
    setSalvando(false)
    if (!r.ok) return toast.error(r.error ?? 'Não foi possível propagar.')
    toast.success(`${(r.atualizadas ?? 0).toLocaleString('pt-BR')} meta(s) atualizada(s)`)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Propagar conteúdo</DialogTitle>
          <DialogDescription>{alvo ? `${alvo.disciplina} · aula ${alvo.aula || '—'} · ${alvo.tipoNome}` : ''}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo a aplicar (o salvo desta aula)</p>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-sm">
            {alvo?.conteudo?.trim() || <span className="italic text-muted-foreground">vazio — vai limpar o conteúdo das metas selecionadas</span>}
          </p>
        </div>

        {carregando ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Procurando cronogramas…</p>
        ) : alvos.length === 0 ? (
          <p className="rounded-xl border bg-muted/20 py-8 text-center text-sm text-muted-foreground">Nenhum cronograma usa esta aula ainda.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{alvos.length} cronograma(s) · {metasSel.toLocaleString('pt-BR')} meta(s) selecionada(s)</p>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSel(todosMarcados ? new Set() : new Set(alvos.map((a) => a.cronograma_id)))}>
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>
            <div className="max-h-[40vh] space-y-1 overflow-y-auto pr-1">
              {alvos.map((a) => (
                <label key={a.cronograma_id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={sel.has(a.cronograma_id)}
                    onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(a.cronograma_id) : n.delete(a.cronograma_id); return n })}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                  {a.status === 'liberado' && (
                    <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700 dark:text-amber-300 text-[10px]">liberado</Badge>
                  )}
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{a.metas} meta(s)</Badge>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Cronogramas <strong>liberados</strong> mudam o que o aluno já vê — marque com cuidado.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={aplicar} disabled={salvando || carregando || sel.size === 0}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Propagar para {sel.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
