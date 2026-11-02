'use client'

// OFERTA › editor (OfertaEditar.png). Porte fiel do designer, menos VENDA:
// seções Informações / Produtos / Acesso (vitalício | até data) / Resumo. SEM card Preço,
// SEM Valor/Parcelamento/Venda por/Cupom/Link de venda. "Oferta fina": só agrupa produtos
// para liberação (reusa o data layer de regras de liberação, inalterado).

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, Check, Search, Boxes, X, Trash2, Infinity as InfinityIcon, CalendarClock, Link2, Copy, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { OfertaAdmin } from '@/lib/integracoes/liberacao/ofertas'
import type { ProdutoSeletor } from '@/lib/integracoes/liberacao/dados'
import { salvarOfertaAction, excluirOfertaAction, duplicarOfertaAction } from '../actions'
import { dataBr, codigoOferta, rotuloSituacao, acessoLabel } from '../oferta-util'
import { GRAD_PRIMARY, BTN_TOP, baixarCsv, copiarTexto } from '../../grupos/ui-estudio'

export function OfertaEditarClient({ oferta, produtos, podeEditar }: {
  oferta: OfertaAdmin; produtos: ProdutoSeletor[]; podeEditar: boolean
}) {
  const router = useRouter()
  const [nome, setNome] = React.useState(oferta.nome)
  const [descricao, setDescricao] = React.useState(oferta.descricao ?? '')
  const [sel, setSel] = React.useState<Set<string>>(new Set(oferta.produtoIds))
  const [buscaProd, setBuscaProd] = React.useState('')
  const fimInicial = oferta.fim?.tipo === 'fixed_date' ? 'fixed_date' : 'lifetime'
  const [tempo, setTempo] = React.useState<'lifetime' | 'fixed_date'>(fimInicial)
  const [dataFim, setDataFim] = React.useState(oferta.fim?.tipo === 'fixed_date' ? (oferta.fim as any).data ?? '' : '')
  const [salvando, setSalvando] = React.useState(false)

  const publicada = oferta.status === 'active'
  const visiveis = produtos.filter((p) => !buscaProd.trim() || p.nome.toLowerCase().includes(buscaProd.trim().toLowerCase()))
  const nomeProd = new Map(produtos.map((p) => [p.id, p.nome]))
  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function salvar(publicar: boolean) {
    if (!nome.trim()) { toast.error('Informe o título.'); return }
    if (!sel.size) { toast.error('Selecione ao menos um produto.'); return }
    if (tempo === 'fixed_date' && !dataFim) { toast.error('Informe a data final.'); return }
    setSalvando(true)
    const r = await salvarOfertaAction({
      id: oferta.id, nome, descricao: descricao || null, produtoIds: [...sel], publicar,
      fim: tempo === 'fixed_date' ? { tipo: 'fixed_date', data: dataFim } : { tipo: 'lifetime' },
    })
    setSalvando(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(publicar ? 'Oferta publicada.' : 'Rascunho salvo.')
    router.refresh()
  }

  async function duplicar() {
    const r = await duplicarOfertaAction(oferta.id)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Oferta duplicada (rascunho).')
    router.push(`/admin/conteudos/ofertas/${r.id}`)
  }

  function exportar() {
    baixarCsv(`oferta_${codigoOferta(oferta.id)}.csv`, ['Cód.', 'Nome', 'Situação', 'Acesso', 'Produtos', 'Acessos ativos'],
      [[codigoOferta(oferta.id), oferta.nome, rotuloSituacao(oferta.status), acessoLabel(oferta), oferta.produtoNomes.join(' | '), oferta.grantsAtivos]])
    toast.success('Oferta exportada.')
  }

  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir oferta', mensagem: `Excluir a oferta "${oferta.nome}"? Os acessos concedidos por ela são revogados com segurança.`, destrutivo: true, confirmar: 'Excluir' }))) return
    const r = await excluirOfertaAction(oferta.id)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Oferta excluída.')
    router.push('/admin/conteudos/ofertas')
  }

  const acessoResumo = tempo === 'fixed_date' ? (dataFim ? dataBr(dataFim) : '—') : 'Vitalício'

  return (
    <div className="w-full space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/conteudos/ofertas" aria-label="Voltar" className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></Link>
          <div className="space-y-1">
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link href="/admin/conteudos/ofertas" className="hover:text-foreground hover:underline">Ofertas</Link><span>/</span><span className="text-foreground">{oferta.nome}</span>
            </nav>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Oferta · {publicada ? 'Publicada' : 'Rascunho'}</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{oferta.nome}</h1>
            <p className="text-sm text-muted-foreground">Junte produtos num combo para liberação. Ao entrar, o aluno recebe acesso a todos eles.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_TOP} onClick={() => copiarTexto(`${window.location.origin}/admin/conteudos/ofertas/${oferta.id}`, 'Link copiado.')}><Link2 className="h-4 w-4" />Copiar link</button>
          <button type="button" className={BTN_TOP} onClick={exportar}><Download className="h-4 w-4" />Exportar</button>
          {podeEditar && <button type="button" className={BTN_TOP} onClick={duplicar}><Copy className="h-4 w-4" />Duplicar</button>}
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" onClick={() => salvar(false)} disabled={salvando}>Salvar rascunho</Button>
            <button type="button" onClick={() => salvar(true)} disabled={salvando} style={GRAD_PRIMARY}
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-60"><Check className="h-[15px] w-[15px]" />{publicada ? 'Atualizar' : 'Publicar oferta'}</button>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Informações */}
          <Secao titulo="Informações" descricao="Nome e texto da oferta.">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Título *</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar} placeholder="Ex.: Sprint Santos + simulados com correção"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!podeEditar} rows={3} placeholder="Descrição da oferta"
                className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
            </div>
          </Secao>

          {/* Produtos */}
          <Secao titulo="Produtos" descricao="O que o aluno recebe ao entrar na oferta.">
            {sel.size > 0 && (
              <ul className="space-y-1.5">
                {[...sel].map((id) => (
                  <li key={id} className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-sm">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Boxes className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{nomeProd.get(id) ?? id}</span>
                    {podeEditar && <button type="button" onClick={() => toggle(id)} aria-label="Remover produto" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
                  </li>
                ))}
              </ul>
            )}
            {podeEditar && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto ou pasta"
                    className="h-10 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                  {produtos.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum produto no catálogo. Cadastre produtos primeiro.</p>
                  ) : visiveis.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum produto encontrado.</p>
                  ) : visiveis.map((p) => {
                    const marcado = sel.has(p.id)
                    return (
                      <button key={p.id} type="button" onClick={() => toggle(p.id)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50">
                        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{marcado && <Check className="h-3 w-3" />}</span>
                        <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                        {!p.ativo && <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">inativo</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </Secao>

          {/* Acesso */}
          <Secao titulo="Acesso" descricao="O que acontece depois da liberação.">
            <div className="grid gap-2 sm:grid-cols-2">
              <RadioCard checked={tempo === 'lifetime'} disabled={!podeEditar} icon={<InfinityIcon className="h-4 w-4" />} titulo="Vitalício" sub="O aluno mantém o acesso para sempre." onClick={() => setTempo('lifetime')} />
              <RadioCard checked={tempo === 'fixed_date'} disabled={!podeEditar} icon={<CalendarClock className="h-4 w-4" />} titulo="Até uma data" sub="O acesso expira na data escolhida." onClick={() => setTempo('fixed_date')} />
            </div>
            {tempo === 'fixed_date' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Data final</label>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} disabled={!podeEditar}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:max-w-xs" />
              </div>
            )}
            <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Esta é a <strong className="font-semibold text-foreground">oferta fina</strong>: agrupa produtos para liberação. Preço, parcelamento e checkout continuam no seu gateway atual (não são geridos aqui).
            </p>
          </Secao>
        </div>

        {/* Resumo */}
        <aside className="h-fit space-y-4 rounded-2xl border bg-card p-5 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo</p>
          <dl className="divide-y text-sm">
            <LinhaResumo label="Produtos" valor={<span className="font-semibold tabular-nums">{sel.size}</span>} />
            <LinhaResumo label="Acesso até" valor={<span className="font-medium">{acessoResumo}</span>} />
            <LinhaResumo label="Situação" valor={<span className="font-medium">{publicada ? 'Publicada' : 'Rascunho'}</span>} />
            <LinhaResumo label="Acessos ativos" valor={<span className="font-semibold tabular-nums">{oferta.grantsAtivos.toLocaleString('pt-BR')}</span>} />
          </dl>
          {podeEditar && (
            <Button variant="destructive" className="w-full" onClick={excluir}><Trash2 className="h-4 w-4" /> Excluir oferta</Button>
          )}
        </aside>
      </div>

    </div>
  )
}

// ───────────────────────────── Subcomponentes ─────────────────────────────
function Secao({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 md:p-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{descricao}</p>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </section>
  )
}

function RadioCard({ checked, titulo, sub, icon, onClick, disabled }: { checked: boolean; titulo: string; sub: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn('flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:opacity-60', checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
      <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', checked ? 'border-primary' : 'border-muted-foreground/40')}>{checked && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">{icon}{titulo}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  )
}

function LinhaResumo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right text-foreground">{valor}</dd></div>
}
