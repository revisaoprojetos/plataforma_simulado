'use client'

/**
 * Aulas / Arquivos complementares (Estúdio de Conteúdo) — MODELO do Produtos: <EstudioHeader> (abas
 * Materiais abaixo do título) + <DataTable> único (clique na linha → painel lateral) + filtros reais
 * no servidor (querystring) + export XLSX real.
 *
 * "Aula" não é entidade real → é um documento da Biblioteca. "Arquivos" = documentos office/mídia.
 * Backend-first: a page busca paginado/ordenado/filtrado no banco (listarMateriais). Reusa as ações de
 * produção (substituir/renomear/mover/excluir/baixar) e os modais do bloco.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Replace, Link2, Tag, Download, FolderInput, Trash2, ExternalLink, Upload, Play, Copy, FileText, SquarePen, Eye, ChevronRight,
} from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { formatBrt } from '@/lib/brt'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { MateriaisTabs } from '@/components/admin/materiais-tabs'
import { DataTable, type DataTableColumn, type DataTableRowAction, type DataTableSelection } from '@/components/admin/data-table'
import { IconeItem, rotuloTipo, siglaTipo } from '@/components/admin/estudio/conteudo-ui'
import {
  FiltroPill, useFiltroUrl, baixarExport, BadgeMaterial, DataEmpilhada, PainelLateral, PainelVazio, Secao, LinhaRegistro,
  BTN_ICON_TOP, BTN_ACAO, BTN_PRIMARIO, GRAD_PRIMARY, type OpcaoPill,
} from '@/components/admin/estudio/lista-ui'
import { SubstituirModal } from '@/components/admin/estudio/substituir-modal'
import { AulasVinculadasModal } from '@/components/admin/estudio/aulas-vinculadas-modal'
import { TagsModal } from '@/components/admin/estudio/tags-modal'
import { MoverModal } from '@/components/admin/estudio/mover-modal'
import { VisualizarDocumento, editarDocumento, baixarDocumento } from '@/components/admin/estudio/abrir-documento'
import { moverDocumento, removerDocumento } from '@/app/admin/biblioteca/actions'
import { etiquetasDoDocumento } from '@/app/admin/conteudos/materiais/biblioteca/actions'
import type { RotuloVinculo, EtiquetaConteudo } from '@/app/admin/conteudos/materiais/biblioteca/tipos'

export type DocRow = {
  id: string; titulo: string; tipo_origem: string
  pasta_id: string | null; versao_atual_id: string | null
  criado_em: string | null; atualizado_em: string | null
}

type Modal = { tipo: 'substituir' | 'aulas' | 'tags' | 'mover' | 'ver'; row: DocRow } | null

const TIPOS_AULAS: OpcaoPill[] = [
  { value: 'docx', label: 'Documento' }, { value: 'pdf', label: 'PDF' }, { value: 'pptx', label: 'Apresentação' },
  { value: 'xlsx', label: 'Planilha' }, { value: 'video', label: 'Vídeo' }, { value: 'audio', label: 'Áudio' },
]
const TIPOS_ARQUIVOS = TIPOS_AULAS.filter((t) => t.value !== 'docx')
const SITUACOES: OpcaoPill[] = [{ value: 'com', label: 'Com material' }, { value: 'sem', label: 'Sem material' }]
const rotuloVinculoTipo = (tipo: string) => (tipo === 'produto' ? 'Produto' : tipo === 'simulado' ? 'Simulado' : tipo === 'pasta' ? 'Pasta' : tipo)

export function DocumentosEstudio({
  tenantId: _tenantId, modo, rows, total, vinculos, rotulos, etiquetas, titulo,
}: {
  tenantId: string
  modo: 'aulas' | 'arquivos'
  rows: DocRow[]
  total: number
  vinculos: Record<string, number>
  rotulos: Record<string, RotuloVinculo>
  etiquetas: EtiquetaConteudo[]
  titulo: string
}) {
  const router = useRouter()
  const { searchParams, setFiltro } = useFiltroUrl()
  const [sel, setSel] = useState<DocRow | null>(null)
  const [modal, setModal] = useState<Modal>(null)

  const ehArquivos = modo === 'arquivos'
  const refresh = () => router.refresh()

  async function excluir(r: DocRow) {
    if (!(await confirmar({ titulo: 'Excluir', mensagem: `Excluir “${r.titulo}”? Vai para a Lixeira.`, confirmar: 'Excluir', destrutivo: true }))) return
    const res = await removerDocumento(r.id)
    if (!res.ok) { toast.error(res.error || 'Falha ao excluir.'); return }
    toast.success('Excluído.'); if (sel?.id === r.id) setSel(null); refresh()
  }
  const baixar = (r: DocRow) => baixarDocumento(r.id)
  /** docx → editor OnlyOffice real; demais tipos não têm editor → abre a visualização. */
  async function editar(r: DocRow) { if (!(await editarDocumento(r.id, r.tipo_origem))) setModal({ tipo: 'ver', row: r }) }
  async function copiarLink(r: DocRow) {
    const url = `${window.location.origin}/biblioteca/${r.id}`
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado.') } catch { toast.message(url) }
  }
  function abrirNoProduto(r: DocRow) {
    const v = rotulos[r.id]
    if (v?.produto_tipo === 'produto') router.push(`/admin/conteudos/produtos/${v.produto_ref_id}`)
    else toast.message('Este material não está ligado a um produto.')
  }
  async function moverPara(r: DocRow, destino: string | null) {
    const res = await moverDocumento(r.id, destino)
    if (!res.ok) { toast.error(res.error || 'Falha ao mover.'); return }
    toast.success('Movido.'); refresh()
  }
  async function excluirLote(s: DataTableSelection) {
    if (!s.ids.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    if (!(await confirmar({ titulo: 'Enviar para a Lixeira', mensagem: `Enviar ${s.ids.length} ${s.ids.length === 1 ? 'item' : 'itens'} para a Lixeira?`, confirmar: 'Enviar para a Lixeira', destrutivo: true }))) return
    let erros = 0
    for (const id of s.ids) { const r = await removerDocumento(id); if (!r.ok) erros++ }
    erros ? toast.error(`${erros} não excluído(s).`) : toast.success('Concluído.')
    s.clear(); setSel(null); refresh()
  }

  const columns: DataTableColumn<DocRow>[] = [
    {
      key: 'titulo', header: ehArquivos ? 'Arquivo e aula' : 'Aula', sortable: true, truncate: false,
      render: (r) => {
        const v = rotulos[r.id]
        return (
          <div className="flex min-w-0 items-center gap-3">
            {ehArquivos
              ? <span className="grid h-[34px] w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-[10px] font-bold uppercase tracking-wide text-primary">{siglaTipo(r.tipo_origem)}</span>
              : <IconeItem kind={r.tipo_origem} className="h-[34px] w-[34px] rounded-xl" />}
            <div className="min-w-0">
              <b className="block text-[13.5px] font-bold leading-[1.35] text-foreground [overflow-wrap:anywhere] line-clamp-2">{r.titulo}</b>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-normal text-muted-foreground">
                <span className="truncate">{ehArquivos ? (v ? `Aula: ${v.rotulo}` : 'Sem aula vinculada') : rotuloTipo(r.tipo_origem)}</span>
                {!ehArquivos && <BadgeMaterial tem={!!r.versao_atual_id} />}
              </span>
            </div>
          </div>
        )
      },
    },
    ehArquivos
      ? { key: 'vinculos', header: 'Vínculos', width: '6rem', align: 'center', render: (r) => <b className="text-[13px] tabular-nums text-foreground">{vinculos[r.id] ?? 0}</b> }
      : {
        key: 'conteudo', header: 'Conteúdo', width: '17rem', truncate: false,
        render: (r) => {
          const v = rotulos[r.id]
          if (!v) return <span className="text-muted-foreground">—</span>
          return (
            <div className="min-w-0">
              <span className="flex items-center gap-1 font-semibold text-primary"><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{v.rotulo}</span></span>
              <span className="block truncate text-xs text-muted-foreground">{v.total > 1 ? `+${v.total - 1} ${v.total - 1 === 1 ? 'outro vínculo' : 'outros vínculos'}` : rotuloVinculoTipo(v.produto_tipo)}</span>
            </div>
          )
        },
      },
    { key: 'criado_em', header: 'Criado em', sortable: true, width: '9.5rem', truncate: false, render: (r) => <DataEmpilhada iso={r.criado_em} /> },
    {
      key: 'abrir', header: '', width: '6rem', align: 'right', truncate: false,
      render: (r) => sel?.id === r.id ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'ver', row: r }) }}
          className="inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-[9px] border border-primary/30 bg-primary/10 px-2.5 text-xs font-extrabold text-primary">Abrir<ChevronRight className="h-[13px] w-[13px]" /></button>
      ) : null,
    },
  ]

  // Menus EXATOS do designer (AUDITORIA 4.5). AULA: Abrir no produto · Configurar material · Copiar link da aula ·
  // Adicionar tag · Assistir · Excluir. DOCUMENTO (Arquivos): Editar documento · Aulas vinculadas · Substituir arquivo · Baixar · Mover · Excluir.
  const rowActions = (r: DocRow): DataTableRowAction[] => ehArquivos ? [
    { label: 'Editar documento', icon: <SquarePen className="h-4 w-4" />, onClick: () => editar(r) },
    { label: 'Aulas vinculadas', icon: <Link2 className="h-4 w-4" />, onClick: () => setModal({ tipo: 'aulas', row: r }) },
    { label: 'Substituir arquivo', icon: <Replace className="h-4 w-4" />, onClick: () => setModal({ tipo: 'substituir', row: r }) },
    { label: 'Baixar', icon: <Download className="h-4 w-4" />, onClick: () => baixar(r) },
    { label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => setModal({ tipo: 'mover', row: r }) },
    { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) },
  ] : [
    { label: 'Abrir no produto', icon: <ExternalLink className="h-4 w-4" />, onClick: () => abrirNoProduto(r) },
    { label: 'Configurar material', icon: <Upload className="h-4 w-4" />, onClick: () => setModal({ tipo: 'substituir', row: r }) },
    { label: 'Copiar link da aula', icon: <Copy className="h-4 w-4" />, onClick: () => copiarLink(r) },
    { label: 'Adicionar tag', icon: <Tag className="h-4 w-4" />, onClick: () => setModal({ tipo: 'tags', row: r }) },
    { label: 'Assistir', icon: <Play className="h-4 w-4" />, onClick: () => setModal({ tipo: 'ver', row: r }) },
    { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) },
  ]

  const acoesHeader = (
    <button type="button" aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)" className={BTN_ICON_TOP}
      onClick={() => baixarExport('/api/admin/conteudos/materiais/export', searchParams, { modo })}><Download className="h-4 w-4" /></button>
  )

  const tagOpcoes: OpcaoPill[] = etiquetas.map((t) => ({ value: t.id, label: t.nome }))
  const filtrosSlot = (
    <>
      <FiltroPill label={ehArquivos ? 'Extensão' : 'Tipo'} valorAtual={searchParams.get('tipo')} opcoes={ehArquivos ? TIPOS_ARQUIVOS : TIPOS_AULAS} onPick={(v) => setFiltro('tipo', v)} />
      <FiltroPill label="Situação do material" valorAtual={searchParams.get('situacao')} opcoes={SITUACOES} onPick={(v) => setFiltro('situacao', v)} />
      {tagOpcoes.length > 0 && <FiltroPill label="Tag" valorAtual={searchParams.get('tag')} opcoes={tagOpcoes} onPick={(v) => setFiltro('tag', v)} />}
    </>
  )

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo={titulo} acoes={acoesHeader} subtabs={<MateriaisTabs />} />

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable<DocRow>
          rows={rows}
          total={total}
          columns={columns}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'criado_em', dir: 'desc' }}
          searchable
          searchPlaceholder={ehArquivos ? 'Pesquise pelo nome do arquivo…' : 'Pesquise pelo nome do material…'}
          filters={filtrosSlot}
          rowActions={rowActions}
          onRowClick={(r) => setSel(r)}
          activeRowId={sel?.id ?? null}
          rowHeight="h-20"
          nomeSingular={ehArquivos ? 'arquivo' : 'material'}
          nomePlural={ehArquivos ? 'arquivos' : 'materiais'}
          bulkActions={(s) => (
            <button type="button" onClick={() => excluirLote(s)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-destructive/35 bg-card px-[11px] text-[12.5px] font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
          )}
        />

        <PainelLateral>
          {!sel ? (
            <PainelVazio texto="Clique numa linha para ver os detalhes." />
          ) : ehArquivos ? (
            <DetalheArquivo row={sel} vinc={rotulos[sel.id]} vinculos={vinculos[sel.id] ?? 0}
              onEditar={() => editar(sel)} onVisualizar={() => setModal({ tipo: 'ver', row: sel })}
              onAulas={() => setModal({ tipo: 'aulas', row: sel })} onSubstituir={() => setModal({ tipo: 'substituir', row: sel })}
              onMover={() => setModal({ tipo: 'mover', row: sel })}
              onBaixar={() => baixar(sel)} onExcluir={() => excluir(sel)} />
          ) : (
            <DetalheAula row={sel} vinc={rotulos[sel.id]} vinculos={vinculos[sel.id] ?? 0}
              onConfigurar={() => setModal({ tipo: 'substituir', row: sel })} onAbrirProduto={() => abrirNoProduto(sel)}
              onCopiarLink={() => copiarLink(sel)} onTag={() => setModal({ tipo: 'tags', row: sel })}
              onAssistir={() => setModal({ tipo: 'ver', row: sel })} onExcluir={() => excluir(sel)} />
          )}
        </PainelLateral>
      </div>

      {modal?.tipo === 'substituir' && (
        <SubstituirModal open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.titulo} subtitulo={rotuloTipo(modal.row.tipo_origem)} vinculos={vinculos[modal.row.id] ?? 0} onSubstituido={refresh} />
      )}
      {modal?.tipo === 'aulas' && (
        <AulasVinculadasModal open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.titulo} subtitulo={rotuloTipo(modal.row.tipo_origem)} />
      )}
      {modal?.tipo === 'tags' && (
        <TagsModal open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.titulo} subtitulo={rotuloTipo(modal.row.tipo_origem)} />
      )}
      {modal?.tipo === 'ver' && (
        <VisualizarDocumento open onClose={() => setModal(null)} documentoId={modal.row.id} titulo={modal.row.titulo} tipoOrigem={modal.row.tipo_origem} />
      )}
      {modal?.tipo === 'mover' && (
        <MoverModal open onClose={() => setModal(null)} titulo={modal.row.titulo} onMover={(destino) => moverPara(modal.row, destino)} />
      )}
    </div>
  )
}

function Btn({ onClick, icon, label, destrutivo }: { onClick: () => void; icon: React.ReactNode; label: string; destrutivo?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={BTN_ACAO + (destrutivo ? ' text-destructive' : '')}>
      <span className={destrutivo ? 'text-destructive' : 'text-primary'}>{icon}</span>{label}
    </button>
  )
}

function TagsResumo({ documentoId }: { documentoId: string }) {
  const [tags, setTags] = useState<EtiquetaConteudo[] | null>(null)
  useEffect(() => {
    let vivo = true; setTags(null)
    etiquetasDoDocumento(documentoId).then((t) => { if (vivo) setTags(t) }).catch(() => { if (vivo) setTags([]) })
    return () => { vivo = false }
  }, [documentoId])
  if (tags === null) return <span className="text-sm text-muted-foreground">Carregando…</span>
  if (!tags.length) return <span className="text-sm text-muted-foreground">Nenhuma</span>
  return <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{t.nome}</span>)}</div>
}

/** Prévia real (capa da versão atual); sem arquivo → aviso. */
function Previa({ row, vazioTitulo, vazioTexto }: { row: DocRow; vazioTitulo: string; vazioTexto: string }) {
  return (
    <div className="relative rounded-xl border bg-muted/20 p-4 text-center">
      {row.versao_atual_id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/admin/biblioteca/capa/${row.versao_atual_id}`} alt="" className="mx-auto max-h-44 w-auto rounded-lg border object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <div className="flex flex-col items-center gap-1.5 py-6">
          <FileText className="h-7 w-7 text-muted-foreground opacity-60" />
          <div className="text-sm font-semibold text-foreground">{vazioTitulo}</div>
          <div className="text-xs text-muted-foreground">{vazioTexto}</div>
        </div>
      )}
    </div>
  )
}

function DetalheAula({ row, vinc, vinculos, onConfigurar, onAbrirProduto, onCopiarLink, onTag, onAssistir, onExcluir }: {
  row: DocRow; vinc?: RotuloVinculo; vinculos: number
  onConfigurar: () => void; onAbrirProduto: () => void; onCopiarLink: () => void; onTag: () => void; onAssistir: () => void; onExcluir: () => void
}) {
  const tem = !!row.versao_atual_id
  return (
    <>
      <div className="flex items-start gap-2.5">
        <IconeItem kind={row.tipo_origem} className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <b className="block text-[13.5px] leading-[1.35] text-foreground">{row.titulo}</b>
          <span className="block text-xs leading-normal text-muted-foreground">Aula · {rotuloTipo(row.tipo_origem)}</span>
        </div>
      </div>

      <Previa row={row} vazioTitulo="Nenhum arquivo configurado" vazioTexto="A aula existe, mas não tem arquivo. O aluno abre e não vê nada." />

      <button type="button" onClick={onConfigurar} style={GRAD_PRIMARY} className={BTN_PRIMARIO}><Upload className="h-[15px] w-[15px]" />{tem ? 'Substituir material' : 'Configurar material'}</button>

      <Secao titulo="Onde está">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-[12.5px]">
          <span className="font-bold text-primary">{vinc ? `${rotuloVinculoTipo(vinc.produto_tipo)}s` : 'Biblioteca'}</span>
          {vinc && <><span className="text-muted-foreground/60">›</span><span className="font-extrabold text-foreground">{vinc.rotulo}</span></>}
        </div>
      </Secao>
      <button type="button" onClick={onAbrirProduto} className={BTN_ACAO}><ExternalLink className="h-[15px] w-[15px] text-primary" />Abrir no produto</button>

      <Secao titulo="Registro">
        <div>
          <LinhaRegistro rotulo="Criado em" valor={formatBrt(row.criado_em) ?? '—'} />
          <LinhaRegistro rotulo="Atualização" valor={formatBrt(row.atualizado_em) ?? '—'} />
          <LinhaRegistro rotulo="Aulas vinculadas" valor={<span className="tabular-nums">{vinculos}</span>} />
          <div className="flex items-start justify-between gap-3 border-t py-2 text-[13px]"><span className="text-muted-foreground">Tags</span><TagsResumo documentoId={row.id} /></div>
        </div>
      </Secao>

      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={onCopiarLink} icon={<Copy className="h-[15px] w-[15px]" />} label="Copiar link" />
        <Btn onClick={onTag} icon={<Tag className="h-[15px] w-[15px]" />} label="Adicionar tag" />
        <Btn onClick={onAssistir} icon={<Play className="h-[15px] w-[15px]" />} label="Assistir" />
        <Btn onClick={onExcluir} icon={<Trash2 className="h-[15px] w-[15px]" />} label="Excluir" destrutivo />
      </div>
    </>
  )
}

function DetalheArquivo({ row, vinc, vinculos, onEditar, onVisualizar, onAulas, onSubstituir, onMover, onBaixar, onExcluir }: {
  row: DocRow; vinc?: RotuloVinculo; vinculos: number
  onEditar: () => void; onVisualizar: () => void; onAulas: () => void; onSubstituir: () => void; onMover: () => void; onBaixar: () => void; onExcluir: () => void
}) {
  return (
    <>
      <div className="flex items-start gap-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-[11px] font-bold uppercase text-primary">{siglaTipo(row.tipo_origem)}</span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <b className="block text-[13.5px] leading-[1.35] text-foreground">{row.titulo}</b>
          <span className="block text-xs leading-normal text-muted-foreground">Arquivo complementar</span>
        </div>
      </div>

      <Previa row={row} vazioTitulo="Nenhum arquivo configurado" vazioTexto="Use “Substituir arquivo” para enviar o arquivo." />

      <Secao titulo="Vínculo">
        <div>
          <LinhaRegistro rotulo="Aula" valor={vinc?.rotulo ?? '—'} />
          <LinhaRegistro rotulo="Vínculos" valor={<span className="tabular-nums">{vinculos}</span>} />
          <LinhaRegistro rotulo="Criado em" valor={formatBrt(row.criado_em) ?? '—'} />
        </div>
      </Secao>

      <button type="button" onClick={onEditar} style={GRAD_PRIMARY} className={BTN_PRIMARIO}><SquarePen className="h-[15px] w-[15px]" />Editar documento</button>
      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={onVisualizar} icon={<Eye className="h-[15px] w-[15px]" />} label="Visualizar" />
        <Btn onClick={onAulas} icon={<Link2 className="h-[15px] w-[15px]" />} label="Aulas vinculadas" />
        <Btn onClick={onSubstituir} icon={<Replace className="h-[15px] w-[15px]" />} label="Substituir arquivo" />
        <Btn onClick={onBaixar} icon={<Download className="h-[15px] w-[15px]" />} label="Baixar" />
        <Btn onClick={onMover} icon={<FolderInput className="h-[15px] w-[15px]" />} label="Mover" />
        <Btn onClick={onExcluir} icon={<Trash2 className="h-[15px] w-[15px]" />} label="Excluir" destrutivo />
      </div>
    </>
  )
}
