'use client'

// Peças do Drive da Biblioteca compartilhadas entre a Biblioteca (legado) e a gestão da Plataforma Revisão
// (/admin/revisao/biblioteca): menu da pasta, menu do documento, "Mover para…", overlay e constantes do Cronograma.
// Extraídas SEM alteração de comportamento de app/admin/biblioteca/biblioteca-client.tsx.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Folder, ChevronRight, MoreVertical, Loader2, X, Archive, Download, Pencil, Info, Trash2, FolderInput, Link2, Files,
  Users2, Palette, Check, Settings2, Search, Home, FolderTree, CalendarClock, GraduationCap, Image as ImageIcon,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { DriveAcessoDialog, type DriveNode, type DrivePapel } from '@/components/admin/drive-acesso'
import { listarPastasConteudo, montarArvoreAcessoDrive, salvarAcessoNo, resolverEstudantePorEmail, listarGruposBiblioteca, buscarAlunosBiblioteca, gruposDoEstudante } from '@/app/admin/biblioteca/actions'
import type { PastaConteudo, Categoria } from '@/app/admin/biblioteca/actions-tipos'

// Paleta curta para o menu "Mudar cor" da pasta (mesmas cores do protótipo Drive).
export const CORES_PASTA = ['#444746', '#d06b64', '#f83a22', '#ff7537', '#ffad46', '#fad165', '#b3dc6c', '#16a765', '#42d692', '#9fc6e7', '#4986e7', '#9a9cff', '#b99aff', '#cd74e6', '#f691b2']

// ── Cronograma Adaptativo por pasta: rótulos ──
export const CLASSIF_CRONO: { v: string; rot: string }[] = [
  { v: 'essencial', rot: 'Essencial' },
  { v: 'complementar', rot: 'Complementar' },
  { v: 'especifica', rot: 'Específica' },
]
export const TIPO_MATERIAL_CRONO: { v: string; rot: string }[] = [
  { v: 'pdfull', rot: 'PDFull' },
  { v: 'pdfight', rot: 'PDFight' },
  { v: 'pdflash', rot: 'PDFlash' },
  { v: 'legproc', rot: 'LegProc' },
  { v: 'jurisclub', rot: 'JurisClub' },
  { v: 'questoes', rot: 'Questões' },
]
export const rotuloClasse = (v?: string | null) => CLASSIF_CRONO.find((c) => c.v === v)?.rot ?? null
export const rotuloTipoMaterial = (v?: string | null) => TIPO_MATERIAL_CRONO.find((t) => t.v === v)?.rot ?? null

/** Selo de estado do Cronograma no card da pasta: disciplina (+classificação) OU tipo de material da subpasta. */
export function SeloCronograma({ p }: { p: PastaConteudo }) {
  if (p.disciplina_id) {
    const cls = rotuloClasse(p.disciplina_classificacao)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary" title="Disciplina do Cronograma Adaptativo">
        <GraduationCap className="h-3 w-3" />Disciplina{cls ? ` · ${cls}` : ''}
      </span>
    )
  }
  const tm = rotuloTipoMaterial(p.cronograma_tipo_material)
  if (tm) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400" title="Tipo de material no Cronograma">
      <CalendarClock className="h-3 w-3" />{tm}
    </span>
  )
  return null
}

/** Dropdown em PORTAL (document.body, posição fixed ancorada no botão) — fica ACIMA de qualquer card/seção,
 *  sem ser preso por contexto de empilhamento/overflow de ancestrais (o bug do clique cair no card de baixo). */
export function MenuPasta({ p, categoria, ancestralEhDisciplina, onAbrir, onAcesso, onCapaPagina, onRenomear, onMudarCor, onMover, onCopiarLink, onExcluir, onDisciplinaCron, onRemoverDisciplinaCron, onTipoMaterialCron, onLegendaTabela, onConfigurar }: {
  p: PastaConteudo; categoria: Categoria; ancestralEhDisciplina: boolean
  onAbrir: () => void; onAcesso: () => void; onCapaPagina: () => void; onRenomear: () => void; onMudarCor: (cor: string | null) => void
  onMover: (destinoId: string | null) => void; onCopiarLink: () => void; onExcluir: () => void
  onDisciplinaCron: (classificacao: string | null) => void; onRemoverDisciplinaCron: () => void; onTipoMaterialCron: (tipo: string | null) => void
  onLegendaTabela: (ocultar: boolean | null) => void
  /** Opcional: "Configurar pasta…" (ação em lote nos documentos da pasta). */
  onConfigurar?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pastas, setPastas] = useState<{ id: string; nome: string; pai_id: string | null }[] | null>(null)
  async function carregarPastas() { if (!pastas) setPastas(await listarPastasConteudo(categoria)) }
  const pick = (fn: () => void) => () => { setOpen(false); fn() }
  // Não pode mover a pasta para DENTRO de si mesma nem de um descendente (evita ciclo).
  const bloqueadas = useMemo(() => {
    const set = new Set<string>([p.id])
    const filhos = new Map<string | null, string[]>()
    for (const x of pastas ?? []) { const k = x.pai_id ?? null; (filhos.get(k) ?? filhos.set(k, []).get(k)!).push(x.id) }
    const stack = [p.id]
    while (stack.length) { const cur = stack.pop()!; for (const f of filhos.get(cur) ?? []) if (!set.has(f)) { set.add(f); stack.push(f) } }
    return set
  }, [pastas, p.id])
  const [moverAberto, setMoverAberto] = useState(false)
  // Mesmo design do menu dos simulados (DropdownMenu base-ui), abrindo para a DIREITA. "Mover para…"
  // abre o POP-UP MoverConteudoDialog (navegação de pastas) — a própria pasta e descendentes ficam de fora.
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label="Ações da pasta"
          title="Mais ações"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={onAbrir}><FolderInput className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
          {categoria !== 'modelo_caderno' && <DropdownMenuItem onClick={onAcesso}><Users2 className="mr-2 h-4 w-4" /> Acesso dos alunos</DropdownMenuItem>}
          {categoria !== 'modelo_caderno' && <DropdownMenuItem onClick={onCapaPagina}><ImageIcon className="mr-2 h-4 w-4" /> Capa e página inicial…</DropdownMenuItem>}
          {onConfigurar && <DropdownMenuItem onClick={onConfigurar}><Settings2 className="mr-2 h-4 w-4" /> Configurar pasta…</DropdownMenuItem>}
          <DropdownMenuItem onClick={onRenomear}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCopiarLink}><Link2 className="mr-2 h-4 w-4" /> Copiar link</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Palette className="mr-2 h-4 w-4" /> Mudar cor</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto">
              <div className="grid grid-cols-5 gap-2 p-2">
                <button onClick={pick(() => onMudarCor(null))} title="Cor padrão" className="grid h-8 w-8 place-items-center rounded-full border bg-muted text-muted-foreground transition hover:ring-2 hover:ring-primary/40">{!p.cor && <Check className="h-4 w-4" />}</button>
                {CORES_PASTA.map((c) => (
                  <button key={c} onClick={pick(() => onMudarCor(c))} title={c} style={{ background: c }} className="grid h-8 w-8 place-items-center rounded-full transition hover:scale-110 hover:ring-2 hover:ring-primary/50">{p.cor === c && <Check className="h-4 w-4 text-white" />}</button>
                ))}
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => { setOpen(false); carregarPastas(); setMoverAberto(true) }}><FolderInput className="mr-2 h-4 w-4" /> Mover para…</DropdownMenuItem>
          {categoria !== 'modelo_caderno' && (
            <>
              <DropdownMenuSeparator />
              {ancestralEhDisciplina ? (
                // SUBpasta de uma pasta-disciplina → define o TIPO de material desta subpasta.
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><CalendarClock className="mr-2 h-4 w-4" /> Tipo de material</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {TIPO_MATERIAL_CRONO.map((t) => (
                      <DropdownMenuItem key={t.v} onClick={pick(() => onTipoMaterialCron(t.v))}>
                        <span className="flex-1">{t.rot}</span>
                        {p.cronograma_tipo_material === t.v && <Check className="ml-2 h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={pick(() => onTipoMaterialCron(null))}>
                      <span className="flex-1 text-muted-foreground">Nenhum</span>
                      {!p.cronograma_tipo_material && <Check className="ml-2 h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                // Pasta de nível de DISCIPLINA → usar no cronograma + classificação.
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><GraduationCap className="mr-2 h-4 w-4" /> Cronograma</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-60">
                    <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">Usar no cronograma como disciplina</div>
                    {CLASSIF_CRONO.map((c) => (
                      <DropdownMenuItem key={c.v} onClick={pick(() => onDisciplinaCron(c.v))}>
                        <span className="flex-1">{c.rot}</span>
                        {p.disciplina_id && p.disciplina_classificacao === c.v && <Check className="ml-2 h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                    {p.disciplina_id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={pick(onRemoverDisciplinaCron)} className="text-destructive focus:text-destructive">
                          <X className="mr-2 h-4 w-4" /> Remover do cronograma
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {/* LegProc: tabela de legenda do início do documento (repete a barra de legendas do leitor) — vale p/ os docs desta pasta e subpastas */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><span className="mr-2 inline-block w-4" /> Tabela de legenda (LegProc)</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">Para os documentos desta pasta</div>
                  <DropdownMenuItem onClick={pick(() => onLegendaTabela(null))}>Ocultar para o aluno (padrão)</DropdownMenuItem>
                  <DropdownMenuItem onClick={pick(() => onLegendaTabela(false))}>Mostrar para o aluno</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onExcluir} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {moverAberto && (
        <MoverConteudoDialog
          titulo={`Mover “${p.nome}”`}
          subtitulo="Escolha a pasta de destino — entre nas pastas ou clique para selecionar"
          pastas={pastas}
          atualId={null}
          bloquear={bloqueadas}
          onConfirm={async (sel) => { setMoverAberto(false); await onMover(sel) }}
          onClose={() => setMoverAberto(false)}
        />
      )}
    </>
  )
}

/** Menu de 3 pontos do documento (estilo Drive): abrir/editar/baixar/renomear/mover/arquivar. */
export function MenuDoc({ d, categoria, onAbrir, onAcesso, onCapaPagina, onEditarOffice, onBaixar, onRenomear, onMover, onArquivar, onDuplicar }: {
  d: { id: string; titulo: string; tipo_origem: string }; categoria: Categoria
  onAbrir: () => void; onAcesso: () => void; onCapaPagina: () => void; onEditarOffice: () => void; onBaixar: () => void; onRenomear: () => void; onMover: (pastaId: string | null) => void; onArquivar: () => void; onDuplicar: () => void
}) {
  const router = useRouter()
  const ehQuestoes = d.tipo_origem === 'questoes'
  const [pastas, setPastas] = useState<{ id: string; nome: string; pai_id: string | null }[] | null>(null)
  const [moverAberto, setMoverAberto] = useState(false)
  async function carregarPastas() { if (!pastas) setPastas(await listarPastasConteudo(categoria)) }
  function copiarLink() {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/biblioteca/${d.id}`
    navigator.clipboard?.writeText(url).then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar.'))
  }
  // Mesmo design do menu dos simulados (DropdownMenu base-ui), abrindo para a DIREITA. "Mover para…"
  // abre o POP-UP MoverConteudoDialog (navegação de pastas), não um submenu lateral.
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Ações do documento"
          title="Mais ações"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => router.push(`/admin/biblioteca/conteudo/${d.id}/gerenciar`)}><Settings2 className="mr-2 h-4 w-4" /> Gerenciar</DropdownMenuItem>
          {/* Questões = card que só agrupa questões (sem arquivo/versão): esconde Detalhes/versões,
              Capa, Office, Cópia e Baixar — não fazem sentido p/ esse tipo. */}
          {!ehQuestoes && <DropdownMenuItem onClick={onAbrir}><Info className="mr-2 h-4 w-4" /> Detalhes / versões</DropdownMenuItem>}
          {categoria !== 'modelo_caderno' && <DropdownMenuItem onClick={onAcesso}><Users2 className="mr-2 h-4 w-4" /> Acesso dos alunos</DropdownMenuItem>}
          {categoria !== 'modelo_caderno' && !ehQuestoes && <DropdownMenuItem onClick={onCapaPagina}><ImageIcon className="mr-2 h-4 w-4" /> Capa e página inicial…</DropdownMenuItem>}
          {d.tipo_origem === 'docx' && <DropdownMenuItem onClick={onEditarOffice}><Pencil className="mr-2 h-4 w-4" /> Editar no OnlyOffice</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copiarLink}><Link2 className="mr-2 h-4 w-4" /> Copiar link</DropdownMenuItem>
          {!ehQuestoes && <DropdownMenuItem onClick={onDuplicar}><Files className="mr-2 h-4 w-4" /> Criar uma cópia</DropdownMenuItem>}
          {!ehQuestoes && <DropdownMenuItem onClick={onBaixar}><Download className="mr-2 h-4 w-4" /> Baixar</DropdownMenuItem>}
          <DropdownMenuItem onClick={onRenomear}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { carregarPastas(); setMoverAberto(true) }}><FolderInput className="mr-2 h-4 w-4" /> Mover para…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onArquivar} className="text-destructive focus:text-destructive"><Archive className="mr-2 h-4 w-4" /> Arquivar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {moverAberto && (
        <MoverConteudoDialog
          titulo={`Mover “${d.titulo}”`}
          subtitulo="Escolha a pasta de destino — entre nas pastas ou clique para selecionar"
          pastas={pastas}
          atualId={null}
          onConfirm={async (sel) => { setMoverAberto(false); await onMover(sel) }}
          onClose={() => setMoverAberto(false)}
        />
      )}
    </>
  )
}

/** Pop-up de "Mover para…" (padrão do board dos simulados): busca, breadcrumb para ENTRAR nas subpastas,
 *  seções "Com subpastas"/"Pastas", seleção por clique e confirmação. `bloquear` = ids a esconder (a
 *  própria pasta + descendentes, p/ evitar ciclo). `onConfirm(sel)` recebe o id do destino (null = raiz). */
export function MoverConteudoDialog({ titulo, subtitulo, pastas, atualId, bloquear, onConfirm, onClose }: {
  titulo: string; subtitulo?: string
  pastas: { id: string; nome: string; pai_id: string | null }[] | null
  atualId: string | null; bloquear?: Set<string>
  onConfirm: (sel: string | null) => void | Promise<void>; onClose: () => void
}) {
  const [sel, setSel] = useState<string | null>(atualId)
  const [busca, setBusca] = useState('')
  const [navPai, setNavPai] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onClose])
  const bloq = bloquear ?? new Set<string>()
  const todas = (pastas ?? []).filter((p) => !bloq.has(p.id))
  const byId = useMemo(() => new Map(todas.map((p) => [p.id, p])), [todas])
  const q = busca.trim().toLowerCase()
  const nSub = (id: string) => todas.filter((p) => (p.pai_id ?? null) === id).length
  const visiveis = q ? todas.filter((p) => p.nome.toLowerCase().includes(q)) : todas.filter((p) => (p.pai_id ?? null) === navPai)
  const comSub = q ? [] : visiveis.filter((p) => nSub(p.id) > 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const semSub = q ? visiveis : visiveis.filter((p) => nSub(p.id) === 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const caminho: { id: string; nome: string; pai_id: string | null }[] = []
  { let cur = navPai; const seen = new Set<string>(); while (cur && byId.has(cur) && !seen.has(cur)) { seen.add(cur); const p = byId.get(cur)!; caminho.unshift(p); cur = p.pai_id ?? null } }
  async function confirmar() { setPending(true); try { await onConfirm(sel) } finally { setPending(false) } }
  const gridCls = 'grid grid-cols-2 gap-3 sm:grid-cols-3'
  const Tile = (p: { id: string; nome: string; pai_id: string | null }) => {
    const n = nSub(p.id); const ativo = sel === p.id
    return (
      <div key={p.id} role="button" tabIndex={0} onClick={() => setSel(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSel(p.id) } }}
        className={`relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors ${ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/40'}`}>
        <span className="flex items-center gap-2"><Folder className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 truncate text-sm font-medium" title={p.nome}>{p.nome}</span></span>
        <span className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{n > 0 ? `${n} subpasta${n > 1 ? 's' : ''}` : 'pasta'}</span>
          {n > 0 && !q && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setNavPai(p.id); setSel(p.id) }} className="inline-flex cursor-pointer items-center gap-0.5 rounded px-1 font-medium text-primary hover:underline">Entrar <ChevronRight className="h-3 w-3" /></span>}
        </span>
      </div>
    )
  }
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FolderInput className="h-5 w-5" /></span>
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold" title={titulo}>{titulo}</h3>{subtitulo && <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pasta (todas as subpastas)…" className="w-full rounded-lg border bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {!q && caminho.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
              <button onClick={() => setNavPai(null)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:text-foreground"><Home className="h-3.5 w-3.5" /> Pastas</button>
              {caminho.map((c, i) => (<span key={c.id} className="inline-flex items-center gap-0.5"><ChevronRight className="h-3.5 w-3.5" /><button onClick={() => setNavPai(c.id)} className={`rounded px-1.5 py-0.5 font-medium hover:text-foreground ${i === caminho.length - 1 ? 'text-foreground' : ''}`}>{c.nome}</button></span>))}
            </div>
          )}
          {pastas === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando pastas…</div>
          ) : (
            <div className="space-y-4">
              {!q && (
                <div className={gridCls}>
                  <div role="button" tabIndex={0} onClick={() => setSel(null)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(null) }} className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors ${sel === null ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/40'}`}>
                    <span className="flex items-center gap-2"><Home className="h-5 w-5 text-primary" /><span className="text-sm font-medium">Raiz (Início)</span></span>
                    <span className="text-[11px] text-muted-foreground">Fora de qualquer pasta</span>
                  </div>
                </div>
              )}
              {comSub.length > 0 && <div><p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><FolderTree className="h-3.5 w-3.5" /> Com subpastas</p><div className={gridCls}>{comSub.map(Tile)}</div></div>}
              {semSub.length > 0 && <div>{!q && <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Folder className="h-3.5 w-3.5" /> Pastas</p>}<div className={gridCls}>{semSub.map(Tile)}</div></div>}
              {visiveis.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">Nenhuma pasta {q ? 'encontrada' : 'aqui'}.</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button onClick={confirmar} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />} Mover</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function Overlay({ children, onFechar, largura = 'max-w-lg' }: { children: React.ReactNode; onFechar: () => void; largura?: string }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onFechar])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className={`w-full ${largura} max-h-[88vh] overflow-auto rounded-2xl border bg-card p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

/** Carrega a árvore real de uma pasta e abre o "Liberar acesso" (estilo Drive). Persiste em lote no Concluído. */
export function DriveAcessoWrapper({ pastaId, categoria, onFechar }: { pastaId: string; categoria: Categoria; onFechar: () => void }) {
  const [root, setRoot] = useState<DriveNode | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    montarArvoreAcessoDrive(pastaId, categoria)
      .then((r) => { if (!vivo) return; if (r.ok && r.root) setRoot(r.root as unknown as DriveNode); else setErro(r.error || 'Falha ao carregar.') })
      .catch(() => { if (vivo) setErro('Falha ao carregar a árvore de acesso.') })
    return () => { vivo = false }
  }, [pastaId, categoria])

  if (erro) { toast.error(erro); onFechar(); return null }
  if (!root) {
    return createPortal(
      <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/40">
        <div className="flex items-center gap-2 rounded-xl bg-background px-4 py-3 text-sm shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />Carregando acessos…</div>
      </div>, document.body)
  }
  return (
    <DriveAcessoDialog
      root={root}
      me={{ id: '__owner__', nome: 'Você' }}
      onClose={onFechar}
      onSalvar={async (mudados) => {
        const r = await Promise.all(mudados.map((n) => salvarAcessoNo({
          id: n.id, tipo: n.tipo, herda: n.herda, geral: n.geral, modo: n.modo, oculto: n.oculto,
          grupos: n.pessoas.filter((p) => p.tipo === 'grupo').map((p) => ({ id: p.id, papel: p.papel, origem: p.origem, perms: p.perms })),
          estudantes: n.pessoas.filter((p) => p.tipo === 'estudante').map((p) => ({ id: p.id, papel: p.papel, origem: p.origem, perms: p.perms })),
        })))
        const falha = r.find((x) => !x.ok)
        if (falha) toast.error(falha.error || 'Falha ao salvar alguns acessos.')
      }}
      resolverEmail={async (email, papel: DrivePapel) => {
        const r = await resolverEstudantePorEmail(email)
        return r.ok && r.pessoa ? { ...r.pessoa, papel } : null
      }}
      listarGrupos={async () => { const r = await listarGruposBiblioteca(); return r.ok && r.grupos ? r.grupos : [] }}
      buscarAlunos={async (q, offset) => { const r = await buscarAlunosBiblioteca(q, offset); return r.ok ? { items: r.items ?? [], total: r.total ?? 0 } : { items: [], total: 0 } }}
      buscarGruposAluno={async (estudanteId) => { const r = await gruposDoEstudante(estudanteId); return r.ok && r.grupos ? r.grupos : [] }}
      onCopiarLink={() => { navigator.clipboard?.writeText(window.location.href).catch(() => {}) }}
      onToast={(m) => toast.message(m)}
    />
  )
}
