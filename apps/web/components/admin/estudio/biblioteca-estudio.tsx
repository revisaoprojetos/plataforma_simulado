'use client'

/**
 * Biblioteca / BibliotecaPasta (Estúdio de Conteúdo) — NAVEGADOR no MODELO do Produtos:
 * <EstudioHeader> (abas Materiais abaixo do título) + breadcrumb card + <DataTable> único
 * (clique na linha → painel lateral; "Abrir" entra na pasta) + filtros reais no servidor + export XLSX.
 *
 * Backend-first: a page resolve a pasta (listarArvore) e filtra/ordena/pagina NO SERVIDOR.
 * Reusa as ações de produção (criar/renomear/mover/remover pasta e documento, substituir versão).
 * Nunca vaza folder_area/is_folder à UI. Cores via token; pt-BR; nunca ícone Sparkles.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Home, ChevronRight, FolderPlus, FolderOpen, Folder, Pencil, FolderInput, Trash2,
  Replace, Link2, Download, SquarePen, Eye,
} from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { MateriaisTabs } from '@/components/admin/materiais-tabs'
import { DataTable, type DataTableColumn, type DataTableRowAction, type DataTableSelection } from '@/components/admin/data-table'
import { IconeItem, BadgeRestrito, rotuloTipo } from '@/components/admin/estudio/conteudo-ui'
import {
  FiltroPill, useFiltroUrl, baixarExport, DataEmpilhada, PainelLateral, PainelVazio, Secao, LinhaRegistro, CardNumero, dataCurtaBrt,
  BTN_TOP, BTN_ICON_TOP, BTN_ACAO, BTN_PRIMARIO, GRAD_PRIMARY, type OpcaoPill,
} from '@/components/admin/estudio/lista-ui'
import { AdicionarConteudo } from '@/components/admin/estudio/adicionar-conteudo'
import { SubstituirModal } from '@/components/admin/estudio/substituir-modal'
import { AulasVinculadasModal } from '@/components/admin/estudio/aulas-vinculadas-modal'
import { MoverModal } from '@/components/admin/estudio/mover-modal'
import { VisualizarDocumento, editarDocumento, baixarDocumento } from '@/components/admin/estudio/abrir-documento'
import {
  criarPasta, renomearPasta, moverPasta, removerPasta,
  moverDocumento, removerDocumento,
} from '@/app/admin/biblioteca/actions'

export type LinhaBiblioteca = {
  kind: 'pasta' | 'doc'
  id: string
  nome: string
  tipoOrigem?: string
  cor?: string | null
  itens?: number
  vinculos?: number
  restrito?: boolean
  criadoEm?: string | null
  atualizadoEm?: string | null
  versaoAtualId?: string | null
}

type ModalDoc = { tipo: 'substituir' | 'aulas' | 'mover' | 'ver'; row: LinhaBiblioteca } | null

const TIPOS: OpcaoPill[] = [
  { value: 'pasta', label: 'Pasta' }, { value: 'docx', label: 'Documento' }, { value: 'pdf', label: 'PDF' },
  { value: 'pptx', label: 'Apresentação' }, { value: 'xlsx', label: 'Planilha' }, { value: 'video', label: 'Vídeo' }, { value: 'audio', label: 'Áudio' },
]
const VINCULOS: OpcaoPill[] = [{ value: 'com', label: 'Com aulas vinculadas' }, { value: 'sem', label: 'Sem aulas vinculadas' }]

export function BibliotecaEstudio({
  tenantId, pastaAtual, breadcrumb, linhas, total,
}: {
  tenantId: string
  pastaAtual: string | null
  breadcrumb: { id: string; nome: string }[]
  linhas: LinhaBiblioteca[]
  total: number
}) {
  const router = useRouter()
  const { searchParams, setFiltro } = useFiltroUrl()
  const [sel, setSel] = useState<LinhaBiblioteca | null>(null)
  const [modal, setModal] = useState<ModalDoc>(null)

  const refresh = () => { setSel(null); router.refresh() }
  function irParaPasta(id: string | null) { setSel(null); setFiltro('pasta', id) }
  function abrir(l: LinhaBiblioteca) { if (l.kind === 'pasta') irParaPasta(l.id); else setModal({ tipo: 'ver', row: l }) }
  async function editar(l: LinhaBiblioteca) { if (!(await editarDocumento(l.id, l.tipoOrigem ?? 'docx'))) setModal({ tipo: 'ver', row: l }) }

  async function novaPasta() {
    const nome = await pedirTexto({ titulo: 'Nova pasta', label: 'Nome da pasta', confirmar: 'Criar pasta' })
    if (!nome?.trim()) return
    const r = await criarPasta(nome.trim(), pastaAtual, 'conteudo')
    if (!r.ok) { toast.error(r.error || 'Falha ao criar pasta.'); return }
    toast.success('Pasta criada.'); refresh()
  }
  async function renomear(l: LinhaBiblioteca) {
    const nome = await pedirTexto({ titulo: 'Renomear pasta', label: 'Nome', valorInicial: l.nome })
    if (!nome?.trim() || nome.trim() === l.nome) return
    const r = await renomearPasta(l.id, nome.trim())
    if (!r.ok) { toast.error(r.error || 'Falha ao renomear.'); return }
    toast.success('Renomeado.'); refresh()
  }
  async function excluir(l: LinhaBiblioteca) {
    const ok = await confirmar({
      titulo: l.kind === 'pasta' ? 'Excluir pasta' : 'Excluir documento',
      mensagem: l.kind === 'pasta' ? `Excluir a pasta “${l.nome}”? Os itens dentro voltam para a raiz.` : `Excluir “${l.nome}”? Vai para a Lixeira.`,
      confirmar: 'Excluir', destrutivo: true,
    })
    if (!ok) return
    const r = l.kind === 'pasta' ? await removerPasta(l.id) : await removerDocumento(l.id)
    if (!r.ok) { toast.error(r.error || 'Falha ao excluir.'); return }
    toast.success('Excluído.'); refresh()
  }
  const baixar = (l: LinhaBiblioteca) => baixarDocumento(l.id)
  async function moverPara(l: LinhaBiblioteca, destino: string | null) {
    const r = l.kind === 'pasta' ? await moverPasta(l.id, destino) : await moverDocumento(l.id, destino)
    if (!r.ok) { toast.error(r.error || 'Falha ao mover.'); return }
    toast.success('Movido.'); refresh()
  }
  async function excluirLote(s: DataTableSelection) {
    const alvos = linhas.filter((l) => s.ids.includes(l.id))
    if (!alvos.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    if (!(await confirmar({ titulo: 'Enviar para a Lixeira', mensagem: `Enviar ${alvos.length} ${alvos.length === 1 ? 'item' : 'itens'} para a Lixeira?`, confirmar: 'Enviar para a Lixeira', destrutivo: true }))) return
    let erros = 0
    for (const l of alvos) { const r = l.kind === 'pasta' ? await removerPasta(l.id) : await removerDocumento(l.id); if (!r.ok) erros++ }
    erros ? toast.error(`${erros} não excluído(s).`) : toast.success('Concluído.')
    s.clear(); refresh()
  }

  const columns: DataTableColumn<LinhaBiblioteca>[] = [
    {
      key: 'titulo', header: 'Título', sortable: true, truncate: false,
      render: (l) => (
        <div className="flex min-w-0 items-center gap-3">
          <IconeItem pasta={l.kind === 'pasta'} kind={l.tipoOrigem} cor={l.cor} className="h-[34px] w-[34px] rounded-xl" />
          <div className="min-w-0">
            <b className="flex items-center gap-2 text-[13.5px] leading-[1.35] text-foreground">
              <span className="truncate">{l.nome}</span>
              {l.restrito && <BadgeRestrito />}
            </b>
            <span className="block truncate text-xs leading-normal text-muted-foreground">{l.kind === 'pasta' ? 'Pasta' : rotuloTipo(l.tipoOrigem ?? 'docx')}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'itens', header: 'Itens / Aulas', sortable: true, width: '8rem', truncate: false,
      render: (l) => {
        const n = l.kind === 'pasta' ? (l.itens ?? 0) : (l.vinculos ?? 0)
        return (
          <div className="min-w-0">
            <b className="block text-[13px] tabular-nums text-foreground">{n}</b>
            <span className="text-[11.5px] text-muted-foreground">{l.kind === 'pasta' ? (n === 1 ? 'item' : 'itens') : (n === 1 ? 'aula vinculada' : 'aulas vinculadas')}</span>
          </div>
        )
      },
    },
    { key: 'criado_em', header: 'Criação', sortable: true, width: '9rem', truncate: false, render: (l) => <DataEmpilhada iso={l.criadoEm} /> },
    { key: 'atualizado_em', header: 'Atualização', sortable: true, width: '9rem', truncate: false, render: (l) => <DataEmpilhada iso={l.atualizadoEm ?? l.criadoEm} /> },
    {
      key: 'abrir', header: '', width: '6rem', align: 'right', truncate: false,
      render: (l) => (sel?.id === l.id) ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); abrir(l) }}
          className="inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-[9px] border border-primary/30 bg-primary/10 px-2.5 text-xs font-extrabold text-primary">Abrir<ChevronRight className="h-[13px] w-[13px]" /></button>
      ) : null,
    },
  ]

  const rowActions = (l: LinhaBiblioteca): DataTableRowAction[] => l.kind === 'pasta' ? [
    { label: 'Abrir', icon: <FolderOpen className="h-4 w-4" />, onClick: () => abrir(l) },
    { label: 'Renomear', icon: <Pencil className="h-4 w-4" />, onClick: () => renomear(l) },
    { label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => setModal({ tipo: 'mover', row: l }) },
    { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(l) },
  ] : [
    { label: 'Editar documento', icon: <SquarePen className="h-4 w-4" />, onClick: () => editar(l) },
    { label: 'Aulas vinculadas', icon: <Link2 className="h-4 w-4" />, onClick: () => setModal({ tipo: 'aulas', row: l }) },
    { label: 'Substituir arquivo', icon: <Replace className="h-4 w-4" />, onClick: () => setModal({ tipo: 'substituir', row: l }) },
    { label: 'Baixar', icon: <Download className="h-4 w-4" />, onClick: () => baixar(l) },
    { label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => setModal({ tipo: 'mover', row: l }) },
    { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(l) },
  ]

  const acoesHeader = (
    <>
      <button type="button" aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)" className={BTN_ICON_TOP}
        onClick={() => baixarExport('/api/admin/conteudos/materiais/export', searchParams, { modo: 'biblioteca' })}><Download className="h-4 w-4" /></button>
      <button type="button" onClick={novaPasta} className={BTN_TOP}><FolderPlus className="h-[15px] w-[15px]" />Nova pasta</button>
      <AdicionarConteudo tenantId={tenantId} pastaId={pastaAtual} onConcluido={refresh} />
    </>
  )

  const filtrosSlot = (
    <>
      <FiltroPill label="Tipo" valorAtual={searchParams.get('tipo')} opcoes={TIPOS} onPick={(v) => setFiltro('tipo', v)} />
      <FiltroPill label="Aulas vinculadas" valorAtual={searchParams.get('vinculo')} opcoes={VINCULOS} onPick={(v) => setFiltro('vinculo', v)} />
    </>
  )

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Biblioteca" acoes={acoesHeader} subtabs={<MateriaisTabs />} />

      {/* Breadcrumb (card) — navegador com caminho */}
      <div className="flex items-center gap-3 rounded-[14px] border bg-card px-3 py-2.5">
        <button type="button" onClick={() => irParaPasta(null)} aria-label="Raiz da Biblioteca"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary"><Home className="h-4 w-4" /></button>
        <span className="h-[22px] w-px bg-border" />
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
          <button type="button" onClick={() => irParaPasta(null)} className={cn(pastaAtual === null ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground hover:text-foreground')}>Biblioteca</button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
              <button type="button" onClick={() => irParaPasta(b.id)} className={cn(pastaAtual === b.id ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground hover:text-foreground')}>{b.nome}</button>
            </span>
          ))}
        </nav>
      </div>

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable<LinhaBiblioteca>
          rows={linhas}
          total={total}
          columns={columns}
          getRowId={(l) => l.id}
          defaultSort={{ key: 'atualizado_em', dir: 'desc' }}
          searchable
          searchPlaceholder={pastaAtual ? 'Pesquisar nesta pasta…' : 'Pesquise por título ou tipo…'}
          filters={filtrosSlot}
          rowActions={rowActions}
          onRowClick={(l) => setSel(l)}
          activeRowId={sel?.id ?? null}
          rowHeight="h-16"
          nomeSingular="item"
          nomePlural="itens"
          empty={<span className="text-sm">Nenhum item aqui. Use “Nova pasta” ou “Adicionar conteúdo”.</span>}
          bulkActions={(s) => (
            <button type="button" onClick={() => excluirLote(s)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-destructive/35 bg-card px-[11px] text-[12.5px] font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
          )}
        />

        <PainelLateral>
          {!sel ? (
            <PainelVazio texto="Clique num item para ver os detalhes. Use “Abrir” para entrar na pasta ou ver o documento." />
          ) : (
            <Detalhe row={sel} breadcrumb={breadcrumb} tenantId={tenantId} onIrRaiz={() => irParaPasta(null)}
              onAbrir={() => abrir(sel)} onRenomear={() => renomear(sel)}
              onMover={() => setModal({ tipo: 'mover', row: sel })} onExcluir={() => excluir(sel)}
              onSubstituir={() => setModal({ tipo: 'substituir', row: sel })} onAulas={() => setModal({ tipo: 'aulas', row: sel })}
              onEditar={() => editar(sel)} onBaixar={() => baixar(sel)} onAdicionado={refresh} />
          )}
        </PainelLateral>
      </div>

      {modal?.tipo === 'substituir' && (
        <SubstituirModal open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.nome} subtitulo={rotuloTipo(modal.row.tipoOrigem ?? 'docx')} vinculos={modal.row.vinculos ?? 0} onSubstituido={() => router.refresh()} />
      )}
      {modal?.tipo === 'aulas' && (
        <AulasVinculadasModal open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.nome} subtitulo={rotuloTipo(modal.row.tipoOrigem ?? 'docx')} />
      )}
      {modal?.tipo === 'ver' && (
        <VisualizarDocumento open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.nome} tipoOrigem={modal.row.tipoOrigem ?? 'docx'} />
      )}
      {modal?.tipo === 'mover' && (
        <MoverModal open onClose={() => setModal(null)} titulo={modal.row.nome} excluirId={modal.row.kind === 'pasta' ? modal.row.id : undefined} onMover={(destino) => moverPara(modal.row, destino)} />
      )}
    </div>
  )
}

// ── Painel de detalhe (direita) ─────────────────────────────────────────────────────────────────
function Btn({ onClick, icon, label, destrutivo }: { onClick: () => void; icon: React.ReactNode; label: string; destrutivo?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={BTN_ACAO + (destrutivo ? ' text-destructive' : '')}>
      <span className={destrutivo ? 'text-destructive' : 'text-primary'}>{icon}</span>{label}
    </button>
  )
}

function Detalhe({
  row, breadcrumb, tenantId, onIrRaiz, onAbrir, onRenomear, onMover, onExcluir, onSubstituir, onAulas, onEditar, onBaixar, onAdicionado,
}: {
  row: LinhaBiblioteca; breadcrumb: { id: string; nome: string }[]; tenantId: string; onIrRaiz: () => void
  onAbrir: () => void; onRenomear: () => void; onMover: () => void; onExcluir: () => void
  onSubstituir: () => void; onAulas: () => void; onEditar: () => void; onBaixar: () => void; onAdicionado: () => void
}) {
  const pasta = row.kind === 'pasta'
  return (
    <>
      <div className="flex items-center gap-2.5">
        <IconeItem pasta={pasta} kind={row.tipoOrigem} cor={row.cor} className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <b className="block text-[13.5px] leading-[1.35] text-foreground">{row.nome}</b>
          <span className="block text-xs leading-normal text-muted-foreground">{pasta ? 'Pasta' : rotuloTipo(row.tipoOrigem ?? 'docx')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CardNumero valor={pasta ? (row.itens ?? 0) : (row.vinculos ?? 0)} rotulo={pasta ? 'itens' : 'aulas vinculadas'} />
        <CardNumero valor={<span className="text-[20px]">{dataCurtaBrt(row.criadoEm)}</span>} rotulo="criação" />
      </div>

      <Secao titulo="Caminho">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-2.5">
          <button type="button" onClick={onIrRaiz} className="text-[12.5px] font-bold text-primary">Biblioteca</button>
          {breadcrumb.map((b) => (<span key={b.id} className="flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-muted-foreground/60" /><span className="text-[12.5px] font-semibold text-muted-foreground">{b.nome}</span></span>))}
          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-[12.5px] font-extrabold text-foreground">{row.nome}</span>
        </div>
      </Secao>

      <div>
        <LinhaRegistro rotulo="Criação" valor={formatBrt(row.criadoEm) ?? '—'} />
        <LinhaRegistro rotulo="Atualização" valor={formatBrt(row.atualizadoEm ?? row.criadoEm) ?? '—'} />
      </div>

      <p className="text-xs text-muted-foreground">{pasta ? 'Abra a pasta para ver os documentos. Cada item pode ser usado em várias aulas.' : 'Documento da Biblioteca. Trocar o arquivo propaga às aulas vinculadas.'}</p>

      {pasta ? (
        <>
          <button type="button" onClick={onAbrir} style={GRAD_PRIMARY} className={BTN_PRIMARIO}><Folder className="h-[15px] w-[15px]" />Abrir pasta</button>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={onRenomear} icon={<Pencil className="h-[15px] w-[15px]" />} label="Renomear" />
            <Btn onClick={onMover} icon={<FolderInput className="h-[15px] w-[15px]" />} label="Mover" />
            <AdicionarConteudo tenantId={tenantId} pastaId={row.id} onConcluido={onAdicionado} rotulo="Adicionar aqui" variante="secundario" />
            <Btn onClick={onExcluir} icon={<Trash2 className="h-[15px] w-[15px]" />} label="Excluir" destrutivo />
          </div>
        </>
      ) : (
        <>
          <button type="button" onClick={onEditar} style={GRAD_PRIMARY} className={BTN_PRIMARIO}><SquarePen className="h-[15px] w-[15px]" />Editar documento</button>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={onAbrir} icon={<Eye className="h-[15px] w-[15px]" />} label="Visualizar" />
            <Btn onClick={onAulas} icon={<Link2 className="h-[15px] w-[15px]" />} label="Aulas vinculadas" />
            <Btn onClick={onSubstituir} icon={<Replace className="h-[15px] w-[15px]" />} label="Substituir arquivo" />
            <Btn onClick={onBaixar} icon={<Download className="h-[15px] w-[15px]" />} label="Baixar" />
            <Btn onClick={onMover} icon={<FolderInput className="h-[15px] w-[15px]" />} label="Mover" />
            <Btn onClick={onExcluir} icon={<Trash2 className="h-[15px] w-[15px]" />} label="Excluir" destrutivo />
          </div>
        </>
      )}
    </>
  )
}
