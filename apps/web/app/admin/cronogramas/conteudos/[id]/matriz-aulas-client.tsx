'use client'

import { useMemo, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Link2, Pencil, Plus, Settings2, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { DataTable, type DataTableColumn, type DataTableSelection } from '@/components/admin/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'
import {
  POR_PAGINA_MATRIZ, ROTULO_SITUACAO, SITUACOES_MATRIZ,
  type CelulaDocumento, type ColunaMatriz, type LinhaMatriz, type MatrizDados,
} from '@/lib/cronograma/matriz-gerador-tipos'
import { EditarConjuntoDialog, NovaAulaDialog } from './conjunto-editor-client'
import { gravarMatrizApi } from './matriz-api'
import { GestaoDialog, LinksDialog } from './matriz-dialogs'
import { SeletorDialog, type AlvoSeletor } from './matriz-seletor-dialog'

const SEL = 'h-11 rounded-xl border bg-card px-3 text-[13.5px] text-foreground'
const SEM_AULA = '__sem_aula__'

function Celula({ coluna, celula, onAbrir }: { coluna: ColunaMatriz; celula: CelulaDocumento; onAbrir: () => void }) {
  const s = celula.selecao
  const efetivo = s && !s.indisponivel && s.visivelAluno ? s : null
  const minutos = celula.regra?.minutos
  return (
    <button type="button" onClick={onAbrir} title={s?.titulo ?? celula.auto?.titulo ?? `Vincular ${coluna.nome}`}
      className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/50">
      {s ? (
        <>
          <span className="w-full truncate text-[13px] font-medium">{s.titulo}</span>
          <span className="flex w-full flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            {s.pasta && <span className="max-w-[9rem] truncate">{s.pasta}</span>}
            {s.parteNome && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Parte: {s.parteNome}</Badge>}
            {s.classificacaoSlug && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{s.classificacaoSlug}</Badge>}
            {!s.visivelAluno && <Badge variant="outline" className="px-1.5 py-0 text-[10px]"><EyeOff className="mr-0.5 h-2.5 w-2.5" />Oculto</Badge>}
            {s.indisponivel && <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">Indisponível</Badge>}
            {efetivo && minutos != null && <span className="tabular-nums">≈ {minutos} min</span>}
          </span>
        </>
      ) : celula.auto ? (
        <>
          <span className="w-full truncate text-[13px] italic text-muted-foreground">{celula.auto.titulo}</span>
          <span className="text-[11px] text-muted-foreground">Automático{minutos != null ? ` · ≈ ${minutos} min` : ''}</span>
        </>
      ) : (
        <span className="text-[12px] text-muted-foreground">{celula.existeSecao ? 'Sem conteúdo · vincular' : 'Sem seção · vincular'}</span>
      )}
    </button>
  )
}

export function MatrizAulasClient({ dados, tipos, disciplinas, podeEditar }: {
  dados: MatrizDados
  tipos: TipoMetaDef[]
  disciplinas: { id: string; nome: string }[]
  podeEditar: boolean
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  const conj = dados.conjunto
  const [alvo, setAlvo] = useState<AlvoSeletor | null>(null)
  const [linksDe, setLinksDe] = useState<LinhaMatriz | null>(null)
  const [gestao, setGestao] = useState(false)
  const [editar, setEditar] = useState(false)
  const [nova, setNova] = useState(false)
  const [conjuntoNome, setConjuntoNome] = useState(conj.nome)
  const refresh = () => router.refresh()

  function setParam(k: string, v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(k, v); else p.delete(k)
    p.delete('page')
    router.push(`${pathname}?${p.toString()}`)
  }

  async function lote(sel: DataTableSelection, corpo: Record<string, unknown>, ok: string, pedeConfirmar?: string) {
    const aulas = (sel.allMatching ? dados.chavesFiltradas : sel.ids).filter((x) => x !== SEM_AULA)
    if (!aulas.length) return toast.error('Nenhuma aula válida na seleção.')
    if (pedeConfirmar && !(await confirmar({ titulo: 'Confirmar', mensagem: `${pedeConfirmar} (${aulas.length} aula(s)).`, destrutivo: true }))) return
    const r = await gravarMatrizApi(conj.id, { ...corpo, aulas })
    if (!r.ok) return toast.error(r.message ?? 'Não foi possível aplicar.')
    const n = Number(r.afetadas ?? 0)
    toast.success(`${ok}: ${n} célula(s)${r.ignoradas ? ` · ${r.ignoradas} ignorada(s)` : ''}.`)
    sel.clear()
    refresh()
  }

  const colunas = useMemo<DataTableColumn<LinhaMatriz>[]>(() => {
    const cols: DataTableColumn<LinhaMatriz>[] = [{
      key: 'aula', header: 'Aula', sortable: true, width: '15rem', truncate: false,
      render: (l) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{l.titulo || (l.chave ? `Aula ${l.chave}` : 'Sem número de aula')}</div>
          {l.titulo && l.chave && <div className="text-[11px] text-muted-foreground">Aula {l.chave}</div>}
          {l.conteudos[0] && <div className="line-clamp-1 text-[11px] text-muted-foreground" title={l.conteudos.join(' · ')}>{l.conteudos[0]}</div>}
        </div>
      ),
    }]
    for (const c of dados.colunas) {
      cols.push({
        key: `col:${c.tipo}`, truncate: false, width: '17rem',
        header: <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c.cor ?? 'var(--muted-foreground)' }} />{c.nome}</span>,
        render: (l) => <Celula coluna={c} celula={l.celulas[c.tipo]} onAbrir={() => setAlvo({ linha: l, coluna: c, celula: l.celulas[c.tipo] })} />,
      })
    }
    if (dados.tipoLinks) {
      cols.push({
        key: 'links', header: <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Links de questões</span>, width: '13rem', truncate: false,
        render: (l) => {
          const n = l.links.itens.length
          return (
            <button type="button" onClick={() => setLinksDe(l)} className="flex w-full flex-col items-start gap-0.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/50">
              {n ? (
                <span className="flex flex-wrap gap-1">
                  {l.links.itens.map((i) => <Badge key={i.plataformaId} variant="outline" className="px-1.5 py-0 text-[10px]">{dados.plataformas.find((p) => p.id === i.plataformaId)?.nome ?? 'Link'}</Badge>)}
                </span>
              ) : <span className="text-[12px] text-muted-foreground">{l.links.aulaId ? 'Sem links · editar' : 'Sem seção de questões'}</span>}
            </button>
          )
        },
      })
    }
    cols.push({
      key: 'situacao', header: 'Situação', sortable: true, width: '10rem',
      render: (l) => <Badge variant={l.situacao === 'sem_conteudo' ? 'outline' : 'secondary'} className={l.situacao === 'sem_conteudo' ? 'border-amber-500/50 text-amber-700 dark:text-amber-300' : ''}>{ROTULO_SITUACAO[l.situacao]}</Badge>,
    })
    return cols
  }, [dados.colunas, dados.tipoLinks, dados.plataformas])

  const r = dados.resumo
  const dadosEditor = { id: conj.id, nome: conjuntoNome, disciplina: conj.disciplina, disciplina_id: conj.disciplina_id, descricao: conj.descricao, cor: null, pasta_id: null }

  return (
    <div className="space-y-4">
      <CabecalhoArea
        eyebrow="Conteúdos do Gerador" titulo={conjuntoNome} denso semBarraSetor
        descricao={<>{conj.disciplina} · {r.aulas.toLocaleString('pt-BR')} aula(s) · {r.selecionado} com seleção · {r.automatico} só automático · <span className={r.semConteudo ? 'font-medium text-amber-700 dark:text-amber-300' : ''}>{r.semConteudo} sem conteúdo</span></>}
        acoes={(
          <>
            <Button size="sm" variant="outline" onClick={() => setGestao(true)}><Settings2 className="mr-1 h-4 w-4" /> Disciplinas e filtros</Button>
            {podeEditar && <Button size="sm" variant="outline" onClick={() => setEditar(true)}><Pencil className="mr-1 h-4 w-4" /> Editar conjunto</Button>}
            {podeEditar && <Button size="sm" onClick={() => setNova(true)}><Plus className="mr-1 h-4 w-4" /> Adicionar aula</Button>}
          </>
        )}
      />

      {dados.semTabelaSelecao && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          A tabela de seleção ainda não existe neste banco (migration 16). A matriz mostra o automático, mas não grava vínculos.
        </div>
      )}

      <DataTable<LinhaMatriz>
        rows={dados.linhas} total={dados.total} columns={colunas} getRowId={(l) => l.chave || SEM_AULA}
        defaultSort={{ key: 'aula', dir: 'asc' }} perPageOptions={[...POR_PAGINA_MATRIZ]} defaultPerPage={10}
        searchable searchPlaceholder="Buscar aula, conteúdo ou seção…"
        nomeSingular="aula" redimensionavel selectable={podeEditar && !dados.semTabelaSelecao}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <select className={SEL} value={sp.get('tipo') ?? ''} onChange={(e) => setParam('tipo', e.target.value)} aria-label="Filtrar por seção">
              <option value="">Todas as seções</option>
              {dados.tiposFiltro.map((t) => <option key={t.tipo} value={t.tipo}>{t.nome}</option>)}
            </select>
            <select className={SEL} value={sp.get('cls') ?? ''} onChange={(e) => setParam('cls', e.target.value)} aria-label="Filtrar por classificação">
              <option value="">Todas as classificações</option>
              {dados.classificacoesFiltro.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
            </select>
            <select className={SEL} value={sp.get('sit') ?? ''} onChange={(e) => setParam('sit', e.target.value)} aria-label="Filtrar por situação">
              <option value="">Todas as situações</option>
              {SITUACOES_MATRIZ.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
            </select>
          </div>
        )}
        bulkActions={(sel) => (
          <>
            <Button size="sm" variant="outline" onClick={() => lote(sel, { operacao: 'sugerir' }, 'Vinculado pela sugestão')}><Wand2 className="mr-1 h-4 w-4" /> Vincular pela sugestão</Button>
            <Button size="sm" variant="outline" onClick={() => lote(sel, { operacao: 'visibilidade', visivel: true }, 'Visível ao aluno')}><Eye className="mr-1 h-4 w-4" /> Visível</Button>
            <Button size="sm" variant="outline" onClick={() => lote(sel, { operacao: 'visibilidade', visivel: false }, 'Oculto ao aluno')}><EyeOff className="mr-1 h-4 w-4" /> Oculto</Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => lote(sel, { operacao: 'limpar' }, 'Vínculo removido', 'Remover os vínculos escolhidos? As aulas voltam ao conteúdo automático')}><Trash2 className="mr-1 h-4 w-4" /> Limpar vínculo</Button>
          </>
        )}
        empty={<span>Nenhuma aula neste filtro.</span>}
      />

      <SeletorDialog conjuntoId={conj.id} alvo={alvo} podeEditar={podeEditar && !dados.semTabelaSelecao} onClose={() => setAlvo(null)} onFeito={() => { setAlvo(null); refresh() }} />
      <LinksDialog conjuntoId={conj.id} linha={linksDe} plataformas={dados.plataformas} nomeSecao={dados.tipoLinks?.nome ?? 'Questões'} podeEditar={podeEditar} onClose={() => setLinksDe(null)} onFeito={() => { setLinksDe(null); refresh() }} />
      <GestaoDialog conjuntoId={conj.id} aberto={gestao} podeEditar={podeEditar} onClose={() => setGestao(false)} onFeito={refresh} />
      <EditarConjuntoDialog
        aberto={editar} aoFechar={() => setEditar(false)} conjunto={dadosEditor} disciplinas={disciplinas}
        onCriarDisciplina={async (nome) => { const r = await gravarMatrizApi(conj.id, { operacao: 'disciplina_criar', nome }); return r.ok ? { id: String(r.id), nome: String(r.nome ?? nome) } : null }}
        onSalvo={(v) => { setConjuntoNome(v.nome); refresh() }}
      />
      <NovaAulaDialog aberto={nova} aoFechar={() => setNova(false)} tipos={tipos} conjuntoId={conj.id} onCriadas={() => refresh()} />
    </div>
  )
}
