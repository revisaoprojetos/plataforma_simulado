'use client'

import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, History, Lock, Settings2, Trash2, Upload } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button, buttonVariants } from '@/components/ui/button'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { SubstituirModal } from '@/components/admin/estudio/substituir-modal'
import { SeloTipo } from '@/components/biblioteca/selo-tipo'
import { MenuDoc } from '@/components/biblioteca/menus-drive'
import type { ColunasLista } from '@/components/biblioteca/metadados-toolbar'
import { CAMPOS_META, listaMulti, textoMeta, type Metadados } from '@/lib/conteudo/metadados'
import type { KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import { definirVisibilidadeConteudo } from '@/app/admin/biblioteca/gestao-actions'
import { duplicarDocumento, removerDocumento, renomearDocumento, moverDocumento, urlDownloadDocumento, abrirEdicaoDocx } from '@/app/admin/biblioteca/actions'
import type { LinhaMaterial, TipoBib, VersaoDoc } from '@/lib/admin-revisao/biblioteca-tipos'
import { listarVersoesDocAction } from './actions'

const hm = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h` }
const docKind = (t: string | null): KindConteudo => (t === 'pdf' ? 'pdf' : t === 'video' ? 'video' : t === 'audio' ? 'audio' : t === 'questoes' ? 'questoes' : 'docx')

function BadgeStatus({ s }: { s: string }) {
  const map: Record<string, { cls: string; txt: string }> = {
    publicado: { cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', txt: 'Publicado' },
    rascunho: { cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', txt: 'Rascunho' },
    arquivado: { cls: 'text-muted-foreground bg-muted', txt: 'Arquivado' },
  }
  const v = map[s] ?? map.rascunho
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', v.cls)}>{v.txt}</span>
}

function TituloEdit({ r, onMudou }: { r: LinhaMaterial; onMudou: () => void }) {
  const [v, setV] = useState(r.titulo)
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Título" className="h-8 w-full min-w-[220px] rounded-lg border border-transparent bg-transparent px-2 font-medium hover:border-input focus:border-input focus:bg-background"
      onBlur={async () => {
        const t = v.trim()
        if (!t) { setV(r.titulo); return }
        if (t === r.titulo) return
        const res = await renomearDocumento(r.id, t)
        if (!res.ok) { toast.error(res.error || 'Não foi possível renomear.'); setV(r.titulo); return }
        toast.success('Título salvo.'); onMudou()
      }} />
  )
}

export interface TabelaProps {
  tipo: TipoBib; rows: LinhaMaterial[]; inicio: number; podeEditar: boolean; controleVisivel: boolean; rotuloTipo: string
  categoria: 'conteudo' | 'jurisclub'
  colunas: ColunasLista
  sel: Set<string>; onSel: (id: string, v: boolean) => void; onSelPagina: (v: boolean) => void
  sort: string; dir: 'asc' | 'desc'; onSort: (k: string) => void
  carregando: boolean
  onMudou: () => void
  onDetalhe: (id: string) => void; onAcessoDoc: (r: LinhaMaterial) => void; onCapa: (id: string) => void
  mostrarPasta: boolean
}

export function MateriaisTabela(p: TabelaProps) {
  const { tipo, rows, inicio, podeEditar, controleVisivel, rotuloTipo, categoria, colunas, sel, sort, dir } = p
  const [pendente, iniciar] = useTransition()
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>({})
  const [aberto, setAberto] = useState<string | null>(null)
  const [versoes, setVersoes] = useState<VersaoDoc[] | null>(null)
  const [carregandoVer, setCarregandoVer] = useState(false)
  const [troca, setTroca] = useState<LinhaMaterial | null>(null)
  const ehPdf = tipo === 'pdfull' || tipo === 'pdflash' || tipo === 'pdfight'
  const vis = (r: LinhaMaterial) => visiveis[r.id] ?? r.visivel
  const todosMarcados = rows.length > 0 && rows.every((r) => sel.has(r.id))

  function alternar(r: LinhaMaterial, v: boolean) {
    setVisiveis((s) => ({ ...s, [r.id]: v }))
    iniciar(async () => {
      const res = await definirVisibilidadeConteudo(r.id, v)
      if (!res.ok) { setVisiveis((s) => ({ ...s, [r.id]: !v })); toast.error(res.error || 'Não foi possível alterar.'); return }
      toast.success(v ? 'Material visível ao aluno.' : 'Material escondido do aluno.')
      p.onMudou()
    })
  }
  async function historico(r: LinhaMaterial) {
    if (aberto === r.id) { setAberto(null); return }
    setAberto(r.id); setVersoes(null); setCarregandoVer(true)
    const res = await listarVersoesDocAction(r.id)
    setCarregandoVer(false)
    if (!res.ok) { toast.error(res.error || 'Não foi possível carregar o histórico.'); setAberto(null); return }
    setVersoes(res.versoes ?? [])
  }
  async function excluir(r: LinhaMaterial) {
    const msg = tipo === 'pdfull'
      ? `Excluir “${r.titulo}”? O documento vai para a Lixeira (30 dias). Materiais ligados à aula não são apagados.`
      : `Excluir “${r.titulo}”? O documento vai para a Lixeira (30 dias).`
    if (!(await confirmar({ titulo: 'Excluir material', mensagem: msg, confirmar: 'Excluir', destrutivo: true }))) return
    iniciar(async () => {
      const res = await removerDocumento(r.id)
      if (!res.ok) { toast.error(res.error || 'Não foi possível excluir.'); return }
      toast.success('Material enviado para a Lixeira.'); p.onMudou()
    })
  }
  async function renomear(r: LinhaMaterial) {
    const titulo = await pedirTexto({ titulo: 'Renomear documento', valorInicial: r.titulo, confirmar: 'Salvar' })
    if (!titulo) return
    const res = await renomearDocumento(r.id, titulo); if (!res.ok) return toast.error(res.error || 'Falha.')
    toast.success('Renomeado.'); p.onMudou()
  }
  async function office(r: LinhaMaterial) {
    const t = toast.loading('Abrindo o editor…')
    try {
      const res = await abrirEdicaoDocx(r.id); toast.dismiss(t)
      if (!res.ok || !res.versaoId) return toast.error(res.error || 'Edição no editor disponível só para .docx.')
      window.location.href = `/admin/biblioteca/editar/${res.versaoId}?origem=${encodeURIComponent(window.location.pathname + window.location.search)}`
    } catch (e: any) { toast.dismiss(t); toast.error('Falha ao abrir o editor: ' + (e?.message || 'erro desconhecido')) }
  }

  // ── colunas (ordem do protótipo + colunas do legado, configuráveis pelo menu "Colunas") ──
  const Th = ({ k, children, num, className }: { k?: string; children: React.ReactNode; num?: boolean; className?: string }) => (
    <th className={cn('whitespace-nowrap px-3 py-2.5 font-medium', num && 'text-right', className)} aria-sort={k && sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {k ? (
        <button type="button" onClick={() => p.onSort(k)} className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground', sort === k && 'text-foreground')}>
          {children}{sort === k && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : children}
    </th>
  )
  const metas = CAMPOS_META.filter((c) => colunas[c.k])
  const nCols = 8 + metas.length + (colunas.tipo ? 1 : 0) + (colunas.status ? 1 : 0) + (colunas.atualizado_em ? 1 : 0)

  return (
    <>
      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity xl:flex xl:flex-col xl:h-[calc(100vh-9.5rem)]', p.carregando && 'opacity-70')} aria-busy={p.carregando}>
        <div className="overflow-auto xl:min-h-0 xl:flex-1">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-9 px-3 py-2.5">
                  <input type="checkbox" aria-label="Selecionar todos desta página" checked={todosMarcados} onChange={(e) => p.onSelPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" />
                </th>
                {tipo === 'pdfull' && <Th num>Ordem</Th>}
                <Th k="titulo">{tipo === 'pdfull' ? 'Aula' : tipo === 'legproc' ? 'Lei ou trecho' : tipo === 'questoes' ? 'Conjunto de questões' : tipo === 'jurisclub' ? 'Edição' : 'Aula'}</Th>
                <Th>Ações</Th>
                {p.mostrarPasta && <Th k="pasta">Pasta</Th>}
                {colunas.tipo && <Th k="tipo">Tipo</Th>}
                {colunas.status && <Th k="status">Status</Th>}
                {metas.map((c) => <Th key={c.k} k={c.k}>{c.k === 'disciplina' ? 'Disciplina' : c.rot}</Th>)}
                {tipo !== 'questoes' && <Th k="paginas" num>Páginas</Th>}
                {tipo === 'pdfull' && <Th num>Tempo no ritmo padrão</Th>}
                {tipo === 'questoes' && <Th num>Nº de questões</Th>}
                <Th k="acesso">Acesso</Th>
                {colunas.atualizado_em && <Th k="atualizado">Atualização</Th>}
                <Th>Visível ao aluno</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={nCols} className="px-3 py-10 text-center text-muted-foreground">
                  Nenhum material de {rotuloTipo} encontrado{p.carregando ? '…' : ' com esses filtros. Inclua arquivos pelo botão “Novo”; o tipo vem da subpasta onde o documento está.'}
                </td></tr>
              )}
              {rows.map((r, i) => {
                const m = r.metadados as Metadados
                return (
                  <Fragment key={r.id}>
                    <tr className={cn('border-b last:border-0', sel.has(r.id) && 'bg-primary/5', !vis(r) && 'opacity-60')}>
                      <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Selecionar ${r.titulo}`} checked={sel.has(r.id)} onChange={(e) => p.onSel(r.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
                      {tipo === 'pdfull' && <td className="px-3 py-2.5 text-right tabular-nums">{inicio + i + 1}</td>}
                      <td className="px-3 py-2.5">{podeEditar ? <TituloEdit r={r} onMudou={p.onMudou} /> : <span className="font-medium">{r.titulo}</span>}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-start gap-1.5">
                          <Link href={`/admin/biblioteca/conteudo/${r.id}/gerenciar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                            <Settings2 />{ehPdf ? 'Editar PDF' : 'Gerenciar'}
                          </Link>
                          {podeEditar && <Button variant="outline" size="sm" onClick={() => setTroca(r)}><Upload />Trocar arquivo</Button>}
                          <Button variant="outline" size="sm" onClick={() => historico(r)} aria-label="Histórico de versões"><History />v{r.versao}</Button>
                          {podeEditar && <Button variant="ghost" size="icon-sm" onClick={() => excluir(r)} aria-label="Excluir"><Trash2 /></Button>}
                          {podeEditar && (
                            <MenuDoc d={{ id: r.id, titulo: r.titulo, tipo_origem: r.tipoOrigem ?? 'docx' }} categoria={categoria}
                              onAbrir={() => p.onDetalhe(r.id)} onAcesso={() => p.onAcessoDoc(r)} onCapaPagina={() => p.onCapa(r.id)} onEditarOffice={() => office(r)}
                              onBaixar={async () => { const x = await urlDownloadDocumento(r.id); if (!x.ok || !x.url) return toast.error(x.error || 'Falha ao gerar o link.'); window.open(x.url, '_blank') }}
                              onRenomear={() => renomear(r)}
                              onMover={async (pasta) => { const x = await moverDocumento(r.id, pasta); if (!x.ok) return toast.error(x.error || 'Falha.'); toast.success('Documento movido.'); p.onMudou() }}
                              onArquivar={() => excluir(r)}
                              onDuplicar={async () => { const t = toast.loading('Criando cópia…'); const x = await duplicarDocumento(r.id); toast.dismiss(t); if (!x.ok) return toast.error(x.error || 'Falha ao copiar.'); toast.success('Cópia criada.'); p.onMudou() }} />
                          )}
                        </div>
                      </td>
                      {p.mostrarPasta && <td className="max-w-[18rem] truncate px-3 py-2.5 text-muted-foreground" title={r.pastaCaminho ?? ''}>{r.pastaCaminho ?? <span className="opacity-50">sem pasta</span>}</td>}
                      {colunas.tipo && <td className="px-3 py-2.5"><SeloTipo kind={docKind(r.tipoOrigem)} tamanho="sm" /></td>}
                      {colunas.status && <td className="px-3 py-2.5"><BadgeStatus s={r.status} /></td>}
                      {metas.map((c) => c.k === 'selos' ? (
                        <td key={c.k} className="px-3 py-2.5" title={textoMeta(m, 'selos')}>
                          {listaMulti(m.selos).length ? (
                            <div className="flex max-w-[18rem] gap-1 overflow-hidden">{listaMulti(m.selos).map((s) => <span key={s} className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{s}</span>)}</div>
                          ) : <span className="text-muted-foreground opacity-40">—</span>}
                        </td>
                      ) : (
                        <td key={c.k} className="max-w-[16rem] truncate px-3 py-2.5 text-muted-foreground" title={textoMeta(m, c.k)}>{textoMeta(m, c.k) || <span className="opacity-40">—</span>}</td>
                      ))}
                      {tipo !== 'questoes' && <td className="px-3 py-2.5 text-right tabular-nums">{r.paginas ? r.paginas : <span className="text-muted-foreground">—</span>}</td>}
                      {tipo === 'pdfull' && <td className="px-3 py-2.5 text-right tabular-nums">{r.tempoMin != null ? hm(r.tempoMin) : '—'}</td>}
                      {tipo === 'questoes' && <td className="px-3 py-2.5 text-right tabular-nums">{r.qtdQuestoes ?? 0}</td>}
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', r.restrito ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')} title={r.restrito ? 'Acesso restrito' : 'Liberado a todos'}>
                          {r.restrito && <Lock className="h-3 w-3" />}{r.restrito ? 'Restrito' : 'Todos'}
                        </span>
                      </td>
                      {colunas.atualizado_em && <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{formatBrt(r.atualizadoEm) ?? '—'}</td>}
                      <td className="px-3 py-2.5">
                        <Switch checked={vis(r)} disabled={!podeEditar || pendente || !controleVisivel} onCheckedChange={(v) => alternar(r, v)} aria-label="Visível ao aluno" />
                      </td>
                    </tr>
                    {aberto === r.id && (
                      <tr className="border-b bg-muted/30">
                        <td colSpan={nCols} className="px-4 py-3">
                          {carregandoVer && <span className="text-xs text-muted-foreground">Carregando histórico...</span>}
                          {versoes && versoes.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma versão registrada.</span>}
                          {versoes && versoes.length > 0 && (
                            <ul className="space-y-1 text-xs">
                              {versoes.map((v) => (
                                <li key={v.numero} className="flex flex-wrap gap-x-2">
                                  <b>v{v.numero}</b><span>{formatBrt(v.criadaEm) ?? ''}</span>
                                  <span className="text-muted-foreground">{v.origem === 'upload' ? 'arquivo enviado' : v.origem === 'edicao_editor' ? 'editado no editor' : 'restaurada'}{v.paginas ? ` · ${v.paginas} p.` : ''}</span>
                                  {v.atual && <span className="font-medium text-primary">versão atual</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      {troca && <SubstituirModal open onClose={() => setTroca(null)} documentoId={troca.id} titulo={troca.titulo} subtitulo={`v${troca.versao}`} onSubstituido={() => p.onMudou()} />}
    </>
  )
}
