'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, Search, Trash2, FileText, ExternalLink, Loader2,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, AlertTriangle, CheckSquare, Square,
} from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { formatarBytes } from '@/lib/storage/formato'
import type { PaginaArquivos } from '@/lib/storage/uso'
import { listarArquivosAction, preverExclusaoAction, excluirArquivosAction } from '../../actions'

export function BrowserClient({
  bucket,
  categoria,
  dadosIniciais,
  buscaInicial,
}: {
  bucket: string
  categoria: string
  dadosIniciais: PaginaArquivos
  buscaInicial: string
}) {
  const [dados, setDados] = useState<PaginaArquivos>(dadosIniciais)
  const [busca, setBusca] = useState(buscaInicial)
  const [carregando, setCarregando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const totalPaginas = Math.max(1, Math.ceil(dados.total / dados.porPagina))

  async function carregar(pagina: number, buscaVal: string) {
    setCarregando(true)
    const r = await listarArquivosAction(bucket, categoria, pagina, buscaVal)
    setCarregando(false)
    if (!r.ok || !r.dados) return toast.error(r.error ?? 'Falha ao listar.')
    setDados(r.dados)
    setSel(new Set())
  }

  function toggle(id: string | null) {
    if (!id) return
    setSel((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function excluir(ids: (string | null)[]) {
    const idsValidos = ids.filter((x): x is string => !!x)
    if (!idsValidos.length) return toast.error('Selecione arquivos catalogados.')

    // Confirmação em massa: digitar a quantidade.
    if (idsValidos.length > 1) {
      const txt = await pedirTexto({
        titulo: 'Confirmar exclusão em massa',
        mensagem: `Digite ${idsValidos.length} para excluir ${idsValidos.length} arquivos.`,
        label: 'Quantidade',
        placeholder: String(idsValidos.length),
      })
      if (txt === null) return
      if (txt !== String(idsValidos.length)) return toast.error('Quantidade não confere.')
    }

    // Referenciados exigem 2ª confirmação (vermelha).
    const prev = await preverExclusaoAction(idsValidos)
    const refs = prev.ok ? (prev.itens ?? []).filter((i) => i.referenciado) : []
    let confirmarReferenciados = false
    if (refs.length) {
      const ok = await confirmar({
        destrutivo: true,
        titulo: 'Arquivos em uso',
        mensagem: `${refs.length} arquivo(s) ainda estão REFERENCIADOS no sistema. Excluir pode quebrar telas ou provas. Excluir mesmo assim?`,
        confirmar: 'Excluir assim mesmo',
      })
      if (!ok) return
      confirmarReferenciados = true
    } else {
      const ok = await confirmar({
        destrutivo: true,
        mensagem: `Excluir ${idsValidos.length} arquivo(s) permanentemente? Um backup é guardado antes de apagar.`,
      })
      if (!ok) return
    }

    setExcluindo(true)
    const r = await excluirArquivosAction(idsValidos, { confirmarReferenciados })
    setExcluindo(false)
    if (!r.ok) return toast.error(r.error ?? 'Falha ao excluir.')
    toast.success(`${r.excluidos} excluído(s)${r.pulados.length ? ` · ${r.pulados.length} pulado(s)` : ''}.`)
    carregar(dados.pagina, busca)
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/super/armazenamento" className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Armazenamento
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="capitalize">{bucket}</span> · {dados.categoriaLabel}
          </h1>
          <p className="text-sm text-muted-foreground">{dados.total.toLocaleString('pt-BR')} arquivo(s)</p>
        </div>
        {sel.size > 0 && (
          <button
            onClick={() => excluir([...sel])}
            disabled={excluindo}
            className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir {sel.size} selecionado(s)
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') carregar(0, busca) }}
            placeholder="Buscar por nome ou caminho…"
            className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button onClick={() => carregar(0, busca)} disabled={carregando} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </button>
      </div>

      {/* Grade */}
      {dados.itens.length === 0 ? (
        <div className="rounded-2xl border bg-muted/30 p-10 text-center text-sm text-muted-foreground">Nenhum arquivo nesta categoria.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {dados.itens.map((it) => {
            const selecionado = !!it.id && sel.has(it.id)
            return (
              <div key={it.path} className={`group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md ${selecionado ? 'ring-2 ring-primary' : ''}`}>
                {/* Prévia */}
                <div className="relative flex aspect-square items-center justify-center bg-muted/40">
                  {it.ehImagem && it.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt={it.nome} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  )}
                  {/* Seleção */}
                  <button
                    onClick={() => toggle(it.id)}
                    disabled={!it.id}
                    aria-label={selecionado ? 'Desmarcar' : 'Selecionar'}
                    className="absolute left-1.5 top-1.5 rounded-md bg-black/40 p-1 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-40"
                  >
                    {selecionado ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  {/* Órfão */}
                  {!it.referenciado && (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white" title="Sem referência no banco">
                      <AlertTriangle className="h-3 w-3" /> órfão
                    </span>
                  )}
                </div>
                {/* Info */}
                <div className="p-2">
                  <p className="truncate text-xs font-medium" title={it.nome}>{it.nome}</p>
                  <p className="truncate text-[10px] text-muted-foreground" title={`${it.bucket}/${it.path}`}>{it.path}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{formatarBytes(it.tamanhoBytes)}</span>
                    <div className="flex items-center gap-1">
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir" className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button onClick={() => excluir([it.id])} disabled={excluindo || !it.id} aria-label="Excluir" className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <button onClick={() => carregar(0, busca)} disabled={dados.pagina === 0 || carregando} className="rounded-lg border p-2 disabled:opacity-40" aria-label="Início"><ChevronsLeft className="h-4 w-4" /></button>
          <button onClick={() => carregar(dados.pagina - 1, busca)} disabled={dados.pagina === 0 || carregando} className="rounded-lg border p-2 disabled:opacity-40" aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-3 text-sm text-muted-foreground">Página {dados.pagina + 1} de {totalPaginas}</span>
          <button onClick={() => carregar(dados.pagina + 1, busca)} disabled={dados.pagina + 1 >= totalPaginas || carregando} className="rounded-lg border p-2 disabled:opacity-40" aria-label="Próxima"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => carregar(totalPaginas - 1, busca)} disabled={dados.pagina + 1 >= totalPaginas || carregando} className="rounded-lg border p-2 disabled:opacity-40" aria-label="Final"><ChevronsRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  )
}
