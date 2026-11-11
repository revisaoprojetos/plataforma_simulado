'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, Folder, FolderOpen, FolderPlus, GraduationCap, Home, Inbox, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { MenuPasta, rotuloClasse, rotuloTipoMaterial } from '@/components/biblioteca/menus-drive'
import type { PastaConteudo } from '@/app/admin/biblioteca/actions-tipos'
import { criarPasta, definirCorPasta, definirLegendaTabelaPasta, definirPastaDisciplinaCronograma, definirTipoMaterialSubpasta, moverPasta, removerPasta, removerPastaDisciplinaCronograma, renomearPasta } from '@/app/admin/biblioteca/actions'
import type { ArvoreBib, NoPasta } from '@/lib/admin-revisao/biblioteca-tipos'

export const RAIZ = '__raiz__'

/** Painel de PASTAS e SUBPASTAS (disciplina = pasta; tipo de material = subpasta). Menu "⋮" = o MESMO MenuPasta da Biblioteca
 *  (acesso, capa, renomear, cor, mover, cronograma/tipo de material, legenda, excluir), com as MESMAS actions do legado. */
export function PastasPainel({ arvore, pasta, onPasta, onPrefetch, podeEditar, ocultarVazias, onOcultarVazias, onMudou, onAcessoPasta, onCapaPasta, carregando, rotulos, totalGeral: totalFixo, cabecalho, iconeNo, dicaNo }: {
  arvore: ArvoreBib | null; pasta: string | null; onPasta: (id: string | null) => void; onPrefetch?: (id: string | null) => void; podeEditar: boolean
  ocultarVazias: boolean; onOcultarVazias: (v: boolean) => void; onMudou: () => void
  onAcessoPasta: (id: string, nome: string) => void; onCapaPasta: (id: string) => void; carregando: boolean
  /** Reuso para outras árvores (ex.: taxonomia do banco de questões): rótulos, total geral explícito, slot sob o título e ícone/dica por nó. */
  rotulos?: { titulo: string; todas: string; sem: string; ocultar: string; vazio: string; aria: string }
  totalGeral?: number; cabecalho?: React.ReactNode
  iconeNo?: (n: NoPasta, aberto: boolean) => React.ReactNode; dicaNo?: (n: NoPasta) => string
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const categoria = arvore?.categoria ?? 'conteudo'
  const { filhos, porId } = useMemo(() => {
    const filhos = new Map<string | null, NoPasta[]>(); const porId = new Map<string, NoPasta>()
    for (const n of arvore?.nos ?? []) { porId.set(n.id, n); (filhos.get(n.paiId) ?? filhos.set(n.paiId, []).get(n.paiId)!).push(n) }
    return { filhos, porId }
  }, [arvore])
  const totalGeral = useMemo(() => totalFixo ?? (arvore ? arvore.semPasta + (filhos.get(null) ?? []).reduce((s, n) => s + n.total, 0) : 0), [arvore, filhos, totalFixo])

  // ancestrais da pasta selecionada ficam abertos
  const ancestrais = useMemo(() => {
    const s = new Set<string>(); let cur = pasta && pasta !== RAIZ ? porId.get(pasta)?.paiId ?? null : null; let g = 0
    while (cur && g++ < 40) { s.add(cur); cur = porId.get(cur)?.paiId ?? null }
    return s
  }, [pasta, porId])
  const estaAberto = (id: string) => abertos.has(id) || ancestrais.has(id)
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (estaAberto(id)) { n.delete(id); } else n.add(id); return n })
  const ancestralDisc = (no: NoPasta) => { let cur = no.paiId; let g = 0; while (cur && g++ < 40) { if (porId.get(cur)?.disciplinaId) return true; cur = porId.get(cur)?.paiId ?? null } return false }

  const atual = pasta && pasta !== RAIZ ? porId.get(pasta) ?? null : null
  async function novaPasta() {
    const nome = await pedirTexto({ titulo: atual ? `Nova subpasta em “${atual.nome}”` : 'Nova pasta', placeholder: 'Nome da pasta', confirmar: 'Criar' })
    if (!nome) return
    const r = await criarPasta(nome, atual?.id ?? null, categoria)
    if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Pasta criada.'); if (atual) setAbertos((s) => new Set(s).add(atual.id)); onMudou()
  }

  const ok = async (r: { ok: boolean; error?: string }, msg: string) => { if (!r.ok) { toast.error(r.error || 'Falha.'); return } if (msg) toast.success(msg); onMudou() }
  const paraPasta = (n: NoPasta): PastaConteudo => ({ id: n.id, nome: n.nome, pai_id: n.paiId, cor: n.cor, disciplina_id: n.disciplinaId, disciplina_classificacao: n.classificacao, cronograma_tipo_material: n.tipoMaterial, capa_url: null })

  function linha(n: NoPasta, nivel: number): React.ReactNode {
    const sub = filhos.get(n.id) ?? []
    const visiveis = ocultarVazias ? sub.filter((s) => s.total > 0) : sub
    const aberto = estaAberto(n.id)
    const ativo = pasta === n.id
    const p = paraPasta(n)
    const tm = rotuloTipoMaterial(n.tipoMaterial)
    return (
      <li key={n.id}>
        <div className={cn('group flex items-center gap-1 rounded-lg pr-1 text-sm', ativo ? 'bg-primary/10 text-primary' : 'hover:bg-muted', n.total === 0 && !ativo && 'opacity-55')} style={{ paddingLeft: 4 + nivel * 14 }}>
          <button type="button" aria-label={aberto ? 'Recolher' : 'Expandir'} onClick={() => alternar(n.id)} className={cn('grid h-6 w-5 shrink-0 place-items-center text-muted-foreground', visiveis.length === 0 && 'invisible')}>
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-90')} />
          </button>
          <button type="button" onClick={() => onPasta(n.id)} onPointerEnter={() => onPrefetch?.(n.id)} aria-current={ativo} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left font-medium" title={dicaNo ? dicaNo(n) : n.disciplinaId ? `${n.nome} — disciplina${n.classificacao ? ' ' + (rotuloClasse(n.classificacao) ?? '').toLowerCase() : ''} do cronograma` : n.nome}>
            {iconeNo ? iconeNo(n, aberto) : n.disciplinaId ? <GraduationCap className="h-4 w-4 shrink-0" style={n.cor ? { color: n.cor } : undefined} /> : aberto ? <FolderOpen className="h-4 w-4 shrink-0" style={n.cor ? { color: n.cor } : undefined} /> : <Folder className="h-4 w-4 shrink-0" style={n.cor ? { color: n.cor } : undefined} />}
            <span className="truncate">{n.nome}</span>
            {tm && <span className="shrink-0 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">{tm}</span>}
            {n.restrito && <Lock className="h-3 w-3 shrink-0 text-amber-600" aria-label="Restrito" />}
          </button>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{n.total.toLocaleString('pt-BR')}</span>
          {podeEditar && (
            <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              <MenuPasta p={p} categoria={categoria} ancestralEhDisciplina={ancestralDisc(n)}
                onAbrir={() => onPasta(n.id)} onAcesso={() => onAcessoPasta(n.id, n.nome)} onCapaPagina={() => onCapaPasta(n.id)}
                onRenomear={async () => { const nome = await pedirTexto({ titulo: 'Renomear pasta', valorInicial: n.nome, confirmar: 'Salvar' }); if (nome) await ok(await renomearPasta(n.id, nome), 'Pasta renomeada.') }}
                onMudarCor={async (c) => ok(await definirCorPasta(n.id, c), '')}
                onMover={async (dest) => ok(await moverPasta(n.id, dest), 'Pasta movida.')}
                onCopiarLink={() => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); toast.success(`Link de "${n.nome}" copiado.`) }}
                onExcluir={async () => {
                  if (!(await confirmar({ titulo: 'Excluir pasta?', mensagem: `"${n.nome}" — as subpastas e os documentos dentro dela voltam para a raiz (nada é apagado).`, confirmar: 'Excluir', destrutivo: true }))) return
                  if (pasta === n.id) onPasta(null)
                  await ok(await removerPasta(n.id), 'Pasta excluída.')
                }}
                onDisciplinaCron={async (cls) => ok(await definirPastaDisciplinaCronograma(n.id, { classificacao: cls }), `"${n.nome}" usada no cronograma como disciplina.`)}
                onRemoverDisciplinaCron={async () => ok(await removerPastaDisciplinaCronograma(n.id), 'Pasta removida do cronograma.')}
                onTipoMaterialCron={async (t) => ok(await definirTipoMaterialSubpasta(n.id, t), t ? 'Tipo de material definido.' : 'Tipo de material removido.')}
                onLegendaTabela={async (o) => ok(await definirLegendaTabelaPasta(n.id, o), 'Legenda atualizada.')} />
            </span>
          )}
        </div>
        {aberto && visiveis.length > 0 && <ul>{visiveis.map((s) => linha(s, nivel + 1))}</ul>}
      </li>
    )
  }

  const raizes = (filhos.get(null) ?? []).filter((n) => !ocultarVazias || n.total > 0 || pasta === n.id)
  return (
    <aside className="flex min-h-[320px] flex-col rounded-2xl border bg-card p-2 shadow-sm xl:sticky xl:top-3 xl:h-[calc(100vh-9.5rem)]" aria-label={rotulos?.aria ?? 'Pastas e subpastas'} aria-busy={carregando}>
      <div className="mb-1 flex items-center justify-between gap-2 px-2 pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotulos?.titulo ?? 'Pastas'}</h2>
        {podeEditar && (
          <button type="button" onClick={novaPasta} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" title={atual ? `Criar subpasta em ${atual.nome}` : 'Criar pasta na raiz'}>
            <FolderPlus className="h-3.5 w-3.5" />{atual ? 'Subpasta' : 'Nova pasta'}
          </button>
        )}
      </div>
      {cabecalho}
      <div className="min-h-0 flex-1 overflow-auto pb-1 pr-1 [scrollbar-gutter:stable]">
        {!arvore && (
          <div className="animate-pulse space-y-2 p-2" aria-busy="true" aria-label="Carregando pastas">
            {Array.from({ length: 14 }).map((_, i) => <div key={i} className="h-7 rounded-lg bg-muted" style={{ width: `${88 - (i % 4) * 9}%` }} />)}
          </div>
        )}
        {arvore && (
          <ul className="w-full min-w-max space-y-0.5">
            <li>
              <button type="button" onClick={() => onPasta(null)} aria-current={pasta === null} className={cn('flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium', pasta === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                <Home className="h-4 w-4 shrink-0" /><span className="flex-1">{rotulos?.todas ?? 'Todas as pastas'}</span><span className="text-[11px] tabular-nums text-muted-foreground">{totalGeral.toLocaleString('pt-BR')}</span>
              </button>
            </li>
            {arvore.semPasta > 0 && (
              <li>
                <button type="button" onClick={() => onPasta(RAIZ)} aria-current={pasta === RAIZ} className={cn('flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium', pasta === RAIZ ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                  <Inbox className="h-4 w-4 shrink-0" /><span className="flex-1">{rotulos?.sem ?? 'Sem pasta'}</span><span className="text-[11px] tabular-nums text-muted-foreground">{arvore.semPasta.toLocaleString('pt-BR')}</span>
                </button>
              </li>
            )}
            {raizes.map((n) => linha(n, 0))}
            {raizes.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">{rotulos?.vazio ?? `Nenhuma pasta${ocultarVazias ? ' com itens nesta aba' : ''}.`}</li>}
          </ul>
        )}
      </div>
      <label className="mt-1 flex cursor-pointer items-center gap-2 border-t px-2 pt-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={ocultarVazias} onChange={(e) => onOcultarVazias(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />{rotulos?.ocultar ?? 'Ocultar pastas sem itens nesta aba'}
      </label>
    </aside>
  )
}
