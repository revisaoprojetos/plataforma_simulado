'use client'

// ABA "CLASSIFICAÇÕES": lista; clicar numa linha/nome ABRE a página própria da classificação ([id]/page.tsx). Gestão das classificações do tenant (simulado_conteudo_tipos) — o equivalente genérico dos "personagens"
// do Catálogo do Cronograma Adaptativo. Só EXIBE o que o servidor calculou (lista paginada, uso, filtros) e dispara as mutações
// pela rota /api/admin/biblioteca/classificacao/tipos. Tabela = <DataTable> exato; cores só por token.

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react'
import { DataTable, type DataTableColumn, type DataTableRowAction } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { navProgressStart } from '@/lib/nav-progress'
import { cn } from '@/lib/utils'
import { PAPEIS_TIPO, TIPOS_SISTEMA } from '@/lib/cronograma/tipos-conteudo-tipos'
import { FILTROS_TIPO, ROTULO_FILTRO_TIPO, filtroTipoValido } from '@/lib/conteudo/classificacao/gestao'
import type { LinhaTipoGestao, ListaTipos } from '@/lib/conteudo/classificacao/gestao-server'

import { API_TIPOS as API, Bolinha, INPUT_CLS, ROTULO_PAPEL, SELECT_CLS, Selo, api, hrefDetalhe } from './classificacao-comuns'

export function ClassificacoesClient({ dados, podeEditar, pp }: { dados: ListaTipos; podeEditar: boolean; pp: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const filtro = filtroTipoValido(sp.get('f'))
  const ordenadoPorOrdem = (sp.get('sort') ?? 'ordem') === 'ordem' && (sp.get('sort') ? sp.get('dir') === 'asc' : true)
  const voltar = `${pathname}${sp.toString() ? `?${sp.toString()}` : ''}`
  const [criando, setCriando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const ir = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString()); mut(p); p.delete('page')
    navProgressStart(); router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }
  const atualizar = () => router.refresh()

  async function chamar(id: string, fn: () => Promise<{ ok: boolean; data: any }>, ok: string) {
    setOcupado(id)
    const r = await fn()
    setOcupado(null)
    if (!r.ok) { toast.error(r.data?.error || 'Não foi possível concluir.'); return false }
    toast.success(ok); atualizar(); return true
  }

  const duplicar = (l: LinhaTipoGestao) => chamar(l.id, () => api('POST', API, { duplicarDe: l.id, nome: `${l.nome} (cópia)`.slice(0, 60) }), 'Classificação duplicada.')
  const alternarAtivo = (l: LinhaTipoGestao) => chamar(l.id, () => api('PATCH', API, { id: l.id, patch: { ativo: !l.ativo }, versao: l.versao }), l.ativo ? 'Classificação arquivada.' : 'Classificação reativada.')
  async function apagar(l: LinhaTipoGestao) {
    if (!(await confirmar({ titulo: 'Apagar classificação', mensagem: `Apagar "${l.nome}" definitivamente? Só é possível se nada a usa. As regras de uso dela também são removidas.`, confirmar: 'Apagar', destrutivo: true }))) return
    await chamar(l.id, () => api('DELETE', `${API}?id=${l.id}&modo=apagar`), 'Classificação apagada.')
  }
  async function mover(l: LinhaTipoGestao, delta: -1 | 1) {
    const i = dados.linhas.findIndex((x) => x.id === l.id), v = dados.linhas[i + delta]
    if (!v) return
    // troca as ordens; se empatadas, desempata empurrando 1 passo na direção do movimento
    const nova = l.ordem === v.ordem ? v.ordem + delta : v.ordem
    const itens = l.ordem === v.ordem ? [{ id: l.id, ordem: nova }] : [{ id: l.id, ordem: v.ordem }, { id: v.id, ordem: l.ordem }]
    await chamar(l.id, () => api('PATCH', API, { reordenar: { itens } }), 'Ordem atualizada.')
  }
  async function semear() {
    setOcupado('semear')
    const r = await api('POST', API, { semearModeloBase: true })
    setOcupado(null)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível criar o modelo-base.')
    toast.success(`${r.data.criadas} classificação(ões) do modelo-base criada(s).`); atualizar()
  }

  const colunas: DataTableColumn<LinhaTipoGestao>[] = [
    {
      key: 'nome', header: 'Classificação', sortable: true, width: '18rem',
      render: (l) => (
        <span className="flex min-w-0 items-center gap-2">
          <Bolinha cor={l.cor} />
          <span className="min-w-0"><Link href={hrefDetalhe(l.id, undefined, voltar)} onClick={(e) => e.stopPropagation()} className={cn('block truncate font-medium hover:underline', !l.ativo && 'text-muted-foreground line-through')}>{l.nome}</Link>
            <span className="block truncate text-[11.5px] text-muted-foreground">{l.slug}</span></span>
        </span>
      ),
      title: (l) => `${l.nome} (${l.slug})`,
    },
    { key: 'papel', header: 'Papel', sortable: true, width: '12rem', render: (l) => <span className="text-foreground">{ROTULO_PAPEL[l.papel] ?? l.papel}</span> },
    { key: 'aluno', header: 'Aluno vê', width: '11rem', render: (l) => <span className="text-muted-foreground">{l.nomeAluno || l.nome}</span> },
    {
      key: 'leitura', header: 'Exibição', width: '14rem',
      render: (l) => (
        <span className="flex flex-wrap items-center gap-1">
          {l.exibicao.formato_leitura ? <Selo cls="bg-muted text-foreground" title="Formato de leitura">{l.exibicao.formato_leitura}</Selo> : <span className="text-muted-foreground">—</span>}
          {l.exibicao.legenda && <Selo cls="bg-primary/15 text-primary">legenda</Selo>}
          {l.exibicao.indice.tipos.length > 0 && <Selo cls="bg-muted text-muted-foreground" title={`Índice: ${l.exibicao.indice.tipos.join(', ')}`}>índice {l.exibicao.indice.nivel_max}n</Selo>}
        </span>
      ),
    },
    {
      key: 'uso', header: 'Uso', width: '16rem',
      render: (l) => !l.uso ? <span className="text-muted-foreground" title="Uso indisponível no momento">—</span> : (
        <span className="tabular-nums text-muted-foreground" title="documentos · pastas · metas/seleções · áreas com regras">
          <b className="font-semibold text-foreground">{l.uso.documentos}</b> doc · <b className="font-semibold text-foreground">{l.uso.pastas}</b> pastas · <b className="font-semibold text-foreground">{l.uso.metas}</b> metas · <b className="font-semibold text-foreground">{l.uso.regras}</b> áreas
        </span>
      ),
    },
    { key: 'prioridade', header: 'Prior.', sortable: true, width: '5.5rem', align: 'right', render: (l) => <span className="tabular-nums">{l.prioridade}</span> },
    { key: 'ordem', header: 'Ordem', sortable: true, width: '5.5rem', align: 'right', render: (l) => <span className="tabular-nums">{l.ordem}</span> },
    {
      key: 'status', header: 'Situação', width: '12rem',
      render: (l) => (
        <span className="flex flex-wrap items-center gap-1">
          {l.ativo ? <Selo cls="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Ativa</Selo> : <Selo cls="bg-muted text-muted-foreground">Arquivada</Selo>}
          <Selo cls={l.sistema ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}>{l.sistema ? 'Modelo-base' : 'Personalizada'}</Selo>
        </span>
      ),
    },
  ]

  const acoes = (l: LinhaTipoGestao): DataTableRowAction[] => {
    const i = dados.linhas.findIndex((x) => x.id === l.id)
    const base: DataTableRowAction[] = [{ label: 'Abrir', icon: <ExternalLink className="h-4 w-4" />, onClick: () => { navProgressStart(); router.push(hrefDetalhe(l.id, undefined, voltar)) } }]
    if (!podeEditar) return base
    return [
      ...base,
      { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: () => void duplicar(l) },
      { label: 'Subir na ordem', icon: <ArrowUp className="h-4 w-4" />, onClick: () => void mover(l, -1), disabled: !ordenadoPorOrdem || i <= 0 },
      { label: 'Descer na ordem', icon: <ArrowDown className="h-4 w-4" />, onClick: () => void mover(l, 1), disabled: !ordenadoPorOrdem || i >= dados.linhas.length - 1 },
      { label: l.ativo ? 'Arquivar (desativar)' : 'Reativar', icon: l.ativo ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />, onClick: () => void alternarAtivo(l), separatorBefore: true },
      { label: 'Apagar', icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => void apagar(l), disabled: l.sistema, },
    ]
  }

  return (
    <div className="w-full space-y-4">
      {dados.migracaoPendente && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Aplique as migrations 16 e 17 (classificação) para usar esta área.</div>
      )}
      {!dados.migracaoPendente && dados.semModeloBase && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span>O modelo-base (PDFull, PDFight, PDFlash, LegProc, JurisClub, Questões) ainda não está completo neste tenant. Ele é só um ponto de partida, totalmente editável.</span>
          {podeEditar && <Button size="sm" variant="outline" disabled={ocupado === 'semear'} onClick={semear}>{ocupado === 'semear' && <Loader2 className="animate-spin" />} Criar modelo-base</Button>}
        </div>
      )}
      {dados.usoIndisponivel && <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A contagem de uso não está disponível agora (SQL direto desligado). Apagar fica bloqueado; arquivar funciona.</div>}

      <DataTable
        rows={dados.linhas}
        total={dados.total}
        columns={colunas}
        getRowId={(l) => l.id}
        defaultSort={{ key: 'ordem', dir: 'asc' }}
        perPageOptions={[10, 25, 50, 100]}
        defaultPerPage={pp}
        searchable
        searchPlaceholder="Buscar por nome ou identificador…"
        nomeSingular="classificação"
        nomePlural="classificações"
        selectable={false}
        redimensionavel
        rowActions={acoes}
        onRowClick={(l) => { navProgressStart(); router.push(hrefDetalhe(l.id, undefined, voltar)) }}
        filters={(
          <>
            <select aria-label="Filtrar situação" className={SELECT_CLS} value={filtro} onChange={(e) => ir((p) => { e.target.value === 'todas' ? p.delete('f') : p.set('f', e.target.value) })}>
              {FILTROS_TIPO.map((f) => <option key={f} value={f}>{ROTULO_FILTRO_TIPO[f]}</option>)}
            </select>
            {podeEditar && <Button className="h-11" onClick={() => setCriando(true)}><Plus /> Nova classificação</Button>}
          </>
        )}
        empty={<span>Nenhuma classificação neste filtro.</span>}
      />

      {criando && <NovaDialog onClose={() => setCriando(false)} onFeito={(id) => { setCriando(false); navProgressStart(); router.push(hrefDetalhe(id, undefined, voltar)) }} />}
    </div>
  )
}

// ───────────── Nova classificação ─────────────
function NovaDialog({ onClose, onFeito }: { onClose: () => void; onFeito: (id: string) => void }) {
  const [nome, setNome] = useState('')
  const [modelo, setModelo] = useState('')
  const [papel, setPapel] = useState('generico')
  const [salvando, setSalvando] = useState(false)
  async function criar() {
    setSalvando(true)
    const r = await api('POST', API, { nome: nome.trim(), ...(modelo ? { modelo } : { papel }) })
    setSalvando(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível criar.')
    toast.success('Classificação criada. Ajuste a exibição e as regras de uso.'); onFeito(r.data.id as string)
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova classificação</DialogTitle>
          <DialogDescription>Comece em branco ou a partir de um modelo-base (copia papel, exibição e descrição). Depois é tudo editável.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Nome
            <input className={INPUT_CLS} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mapa mental" autoFocus />
          </label>
          <label className="block space-y-1 text-sm font-medium">Partir de
            <select className={cn(SELECT_CLS, 'w-full')} value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">Em branco</option>
              {TIPOS_SISTEMA.map((t) => <option key={t.slug} value={t.slug}>Modelo-base: {t.nome}</option>)}
            </select>
          </label>
          {!modelo && (
            <label className="block space-y-1 text-sm font-medium">Papel
              <select className={cn(SELECT_CLS, 'w-full')} value={papel} onChange={(e) => setPapel(e.target.value)}>
                {PAPEIS_TIPO.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
              </select>
              <span className="block text-xs font-normal text-muted-foreground">{PAPEIS_TIPO.find((p) => p.v === papel)?.desc}</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando || !nome.trim()}>{salvando && <Loader2 className="animate-spin" />} Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
