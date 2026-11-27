'use client'

// ABAS EM LISTA da página da classificação — "Pastas e metas" (somente leitura, com links), "Pendências" (sugestão por regra +
// classificar em lote) e "Histórico" (auditoria com diff antes/depois). Tudo vem PAGINADO do servidor (<DataTable> exato:
// busca/ordenação/página por searchParams); aqui só se exibe e, nas Pendências, dispara a rota de ação.

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCheck, Info, Loader2 } from 'lucide-react'
import { DataTable, type DataTableColumn, type DataTableSelection } from '@/components/admin/data-table'
import { AbasLinha } from '@/components/ui/abas-linha'
import { Button } from '@/components/ui/button'
import { navProgressStart } from '@/lib/nav-progress'
import { AREAS_CLASSIFICACAO } from '@/lib/conteudo/classificacao/gestao'
import type { LinhaHistorico, LinhaMetaClasse, LinhaPastaClasse, LinhaPendencia, ListaHistorico, ListaMetasClasse, ListaPastasClasse, ListaPendencias } from '@/lib/conteudo/classificacao/detalhe-server'
import { SELECT_CLS, Selo, api, apiDetalhe } from '../classificacao-comuns'

const ROTULO_AREA = Object.fromEntries(AREAS_CLASSIFICACAO.map((a) => [a.id, a.nome])) as Record<string, string>
const fmtData = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

// ───────────── Pastas e metas ─────────────
export function AbaPastas({ pastas, pp }: { pastas: ListaPastasClasse | null; pp: number }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  // Cada pasta abre os documentos dela (desta classificação) — de lá, cada documento abre o seu gerenciar.
  const hrefDocs = (pastaId: string) => { const p = new URLSearchParams(sp.toString()); p.set('aba', 'documentos'); p.set('pasta', pastaId); for (const k of ['page', 'q', 'sort', 'dir', 'sub', 'origem']) p.delete(k); return `${pathname}?${p}` }
  const colPastas: DataTableColumn<LinhaPastaClasse>[] = [
    { key: 'nome', header: 'Pasta', sortable: true, width: '30rem', render: (l) => <Link href={hrefDocs(l.id)} className="font-medium hover:underline" title="Ver os documentos desta pasta e abrir o gerenciar de cada um">{l.caminho || l.nome}</Link>, title: (l) => l.caminho || l.nome },
    { key: 'origem', header: 'Como herda', sortable: true, width: '16rem',
      render: (l) => l.origem === 'direta' ? <Selo cls="bg-primary/15 text-primary" title="Marcada diretamente com esta classificação (cronograma_tipo_material)">Marcada na pasta</Selo>
        : <span className="inline-flex items-center gap-1.5"><Selo cls="bg-muted text-muted-foreground">Herdada</Selo><span className="truncate text-[11.5px] text-muted-foreground">de {l.herdadaDe ?? 'pasta superior'}</span></span> },
    { key: 'disciplina', header: 'Disciplina', width: '14rem', render: (l) => <span className="text-muted-foreground">{l.disciplina ?? '—'}</span> },
    { key: 'docs', header: '', width: '12rem', render: (l) => <Link href={hrefDocs(l.id)} className="text-[12.5px] text-primary hover:underline">Ver documentos →</Link> },
  ]
  return (
    <div className="w-full space-y-4">
      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" />Somente leitura. A classificação de uma pasta se define na própria pasta (tipo de material) e vale para as subpastas. Abra uma pasta para ver os documentos dela e gerenciar cada um.</div>
      {pastas && (
        <DataTable rows={pastas.linhas} total={pastas.total} columns={colPastas} getRowId={(l) => l.id} defaultSort={{ key: 'nome', dir: 'asc' }}
          perPageOptions={[10, 25, 50, 100]} defaultPerPage={pp} searchable searchPlaceholder="Buscar pasta…" nomeSingular="pasta" nomePlural="pastas" selectable={false} redimensionavel
          empty={<span>Nenhuma pasta herda esta classificação. Para usar, marque o tipo de material na pasta.</span>} />
      )}
    </div>
  )
}

// ───────────── Pendências ─────────────
export function AbaPendencias({ dados, classId, nome, podeEditar, pp }: { dados: ListaPendencias; classId: string; nome: string; podeEditar: boolean; pp: number }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  async function aplicar(ids?: string[]) {
    setOcupado(true)
    const r = await api('POST', apiDetalhe(classId), { acao: 'aplicar-pendencias', ...(ids ? { ids } : {}) })
    setOcupado(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível classificar.')
    toast.success(`${r.data.alterados} documento(s) classificado(s) como ${nome}.`)
    router.refresh()
  }
  const colunas: DataTableColumn<LinhaPendencia>[] = [
    { key: 'titulo', header: 'Documento sem classificação', width: '28rem', render: (l) => <Link href={`/admin/biblioteca/conteudo/${l.id}/gerenciar`} className="font-medium hover:underline">{l.titulo}</Link>, title: (l) => l.titulo },
    { key: 'pasta', header: 'Pasta', width: '16rem', render: (l) => <span className="text-muted-foreground">{l.pastaNome ?? '—'}</span> },
    { key: 'motivo', header: 'Por que sugerimos', width: '18rem', render: (l) => <span className="inline-flex items-center gap-1.5"><Selo cls="bg-muted text-muted-foreground">{l.motivo === 'titulo' ? 'Título' : 'Pasta'}</Selo><span className="truncate text-[11.5px] text-muted-foreground">{l.evidencia}</span></span> },
  ]
  return (
    <div className="w-full space-y-4">
      {dados.semSql && <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Sem acesso SQL direto: as pendências não podem ser calculadas agora.</div>}
      {dados.truncado && <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Foram analisados os primeiros 5.000 documentos sem classificação; resolva estes e volte para ver o restante.</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
        <span>Documentos <b className="text-foreground">sem classificação</b> (nem própria, nem herdada) que, pelo <b className="text-foreground">título ou pelo nome da pasta</b>, parecem ser “{nome}”. Só sugere — nada muda até você confirmar.</span>
        {podeEditar && dados.total > 0 && <Button size="sm" disabled={ocupado} onClick={() => void aplicar()}>{ocupado ? <Loader2 className="animate-spin" /> : <CheckCheck />} Classificar todos ({dados.total})</Button>}
      </div>
      <DataTable rows={dados.linhas} total={dados.total} columns={colunas} getRowId={(l) => l.id} perPageOptions={[10, 25, 50, 100]} defaultPerPage={pp}
        selectable={podeEditar} nomeSingular="pendência" nomePlural="pendências" redimensionavel
        bulkActions={(sel: DataTableSelection) => (
          <Button size="sm" disabled={ocupado || sel.allMatching} onClick={() => void aplicar(sel.ids).then(() => sel.clear())}>{ocupado ? <Loader2 className="animate-spin" /> : <CheckCheck />} Classificar selecionados</Button>
        )}
        empty={<span>{dados.semRegra ? 'As regras de sugestão automática cobrem PDFull, PDFight, PDFlash, LegProc e JurisClub; esta classificação personalizada não tem sugestão.' : 'Nenhuma pendência provável para esta classificação.'}</span>} />
    </div>
  )
}

// ───────────── Histórico ─────────────
export function AbaHistorico({ dados, pp }: { dados: ListaHistorico; pp: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const ir = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); v ? p.set(k, v) : p.delete(k); p.delete('page'); navProgressStart(); router.push(`${pathname}?${p}`) }
  const colunas: DataTableColumn<LinhaHistorico>[] = [
    { key: 'quando', header: 'Quando', width: '11rem', render: (l) => <span className="tabular-nums">{fmtData(l.criadoEm)}</span> },
    { key: 'escopo', header: 'O quê', width: '12rem', render: (l) => <span>{l.escopo}</span> },
    { key: 'op', header: 'Operação', width: '9rem', render: (l) => <Selo cls={l.operacao === 'DELETE' ? 'bg-destructive/10 text-destructive' : l.operacao === 'INSERT' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-foreground'}>{l.operacao}</Selo> },
    { key: 'ator', header: 'Quem', width: '9rem', render: (l) => <span className="text-muted-foreground" title="Identificador do usuário (início)">{l.ator ?? '—'}</span> },
    { key: 'alt', header: 'Alterações (antes → depois)', truncate: false,
      render: (l) => l.alteracoes.length === 0 ? <span className="text-muted-foreground">—</span> : (
        <ul className="space-y-0.5 py-1 text-[12.5px]">
          {l.alteracoes.map((a) => <li key={a.campo}><span className="font-medium">{a.campo}</span>: <span className="text-muted-foreground">{a.antes}</span> → <span>{a.depois}</span></li>)}
        </ul>) },
  ]
  return (
    <div className="w-full space-y-4">
      {dados.indisponivel && <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A auditoria não está disponível agora.</div>}
      <DataTable rows={dados.linhas} total={dados.total} columns={colunas} getRowId={(l) => l.id} perPageOptions={[10, 25, 50]} defaultPerPage={pp}
        selectable={false} nomeSingular="evento" nomePlural="eventos" rowHeight="min-h-11"
        filters={(
          <>
            <select aria-label="Filtrar escopo" className={SELECT_CLS} value={sp.get('escopo') ?? ''} onChange={(e) => ir('escopo', e.target.value)}>
              <option value="">Todo o histórico</option>
              <option value="simulado_conteudo_tipos">Classificação</option>
              <option value="simulado_conteudo_regras_uso">Regras de uso</option>
              <option value="simulado_conteudo_documentos">Documentos</option>
            </select>
            <select aria-label="Filtrar operação" className={SELECT_CLS} value={sp.get('op') ?? ''} onChange={(e) => ir('op', e.target.value)}>
              <option value="">Todas as operações</option><option value="INSERT">Criações</option><option value="UPDATE">Alterações</option><option value="DELETE">Exclusões</option>
            </select>
          </>
        )}
        empty={<span>Nenhum evento registrado para esta classificação.</span>} />
    </div>
  )
}
