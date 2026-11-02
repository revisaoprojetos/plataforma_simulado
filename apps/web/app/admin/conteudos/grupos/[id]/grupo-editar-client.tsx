'use client'

// GRUPO › editor (GrupoEditar / GrupoMembros do designer): breadcrumb + título + abas internas
// (Informações · Produtos · Membros · Integrações). Listas = <DataTable> server-driven.

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Check, Users, KeyRound, Layers, Link2, ExternalLink, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable, type DataTableSelection } from '@/components/admin/data-table'
import { confirmar } from '@/components/ui/confirm-dialog'
import { salvarConfigGrupo } from '@/app/admin/grupos/actions'
import { definirValidadeTodosMembros, desvincularGrupoBancos } from '@/app/admin/conteudos/grupos/actions'
import { GRAD_PRIMARY, BTN_PRIMARY, BTN_TOP, copiarTexto } from '../ui-estudio'
import { GrupoMembrosPanel } from './grupo-membros-panel'
import { VincularGrupoModal } from './vincular-grupo-modal'

// `bancos` é a CHAVE de rota (mantida p/ compatibilidade com page.tsx/URL),
// mas aparece para o usuário como "Produtos" (porte fiel do mockup GrupoEditar).
export type GrupoTab = 'informacoes' | 'bancos' | 'membros' | 'integracoes'

export type MembroLinha = {
  id: string
  nome: string
  email: string | null
  classificacao: string | null
  expiraEm: string | null
  entrouEm: string | null
}

type GrupoInfo = {
  id: string; nome: string; cor: string | null; descricao: string | null
  isMestre: boolean; paiId: string | null; codigo: string | null; origem: 'guru' | 'curseduca' | null
}

type BancoLinha = { id: string; nome: string; vinculado: boolean }

const TAB_META: { key: GrupoTab; label: string }[] = [
  { key: 'informacoes', label: 'Informações' },
  { key: 'bancos', label: 'Produtos' },
  { key: 'membros', label: 'Membros' },
  { key: 'integracoes', label: 'Integrações' },
]

type ModoAcesso = 'vitalicio' | 'periodo' | 'data'

export function GrupoEditarClient(props: {
  grupo: GrupoInfo
  tab: GrupoTab
  podeEditar: boolean
  membrosTotal: number
  bancosVinculadosCount: number
  bancosPage: BancoLinha[]
  bancosFiltrados: number
  produtosPreview: { id: string; nome: string }[]
  membrosPage: MembroLinha[]
  membrosFiltrados: number
}) {
  const { grupo, tab, podeEditar, membrosTotal, bancosVinculadosCount, bancosPage, bancosFiltrados, produtosPreview, membrosPage, membrosFiltrados } = props
  const router = useRouter()
  const [vincularAberto, setVincularAberto] = React.useState(false)

  // Form da aba Informações. `descricao`/`paiId` não têm campo no mockup, mas são
  // preservados no save (não zerar o que já existe) — porte fiel + sem perda de dado.
  const [nome, setNome] = React.useState(grupo.nome)
  const [descricao] = React.useState(grupo.descricao ?? '')
  const [paiId] = React.useState<string | null>(grupo.paiId)
  const [salvando, setSalvando] = React.useState(false)

  // Tempo de acesso (aplicado a TODOS os membros atuais do grupo — validade por membro no banco).
  const [modo, setModo] = React.useState<ModoAcesso>('vitalicio')
  const [dias, setDias] = React.useState('365')
  const [dataFim, setDataFim] = React.useState('')
  const [aplicando, setAplicando] = React.useState(false)

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const r = await salvarConfigGrupo(grupo.id, nome, descricao || null, paiId)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar.'); return }
    toast.success('Grupo salvo.')
    router.refresh()
  }

  const linkBanco = (b: BancoLinha) => `${window.location.origin}/admin/banco-questoes/${b.id}`

  async function desvincular(alvos: BancoLinha[], s?: DataTableSelection) {
    if (!alvos.length) { toast.message('Selecione um ou mais produtos desta página.'); return }
    if (!(await confirmar({ titulo: 'Desvincular do grupo', mensagem: `Desvincular ${alvos.length === 1 ? `“${alvos[0].nome}”` : `${alvos.length} produtos`} deste grupo? Quem já tem acesso NÃO perde; só o vínculo de auto-sync sai.`, destrutivo: true, confirmar: 'Desvincular' }))) return
    const r = await desvincularGrupoBancos(grupo.id, alvos.map((b) => b.id))
    if (!r.ok) { toast.error(r.error ?? 'Falha ao desvincular.'); return }
    toast.success(`${r.desvinculados ?? 0} produto(s) desvinculado(s).`)
    s?.clear()
    router.refresh()
  }

  async function aplicarAcesso() {
    let iso: string | null = null
    if (modo === 'periodo') {
      const n = Number(dias)
      if (!Number.isFinite(n) || n < 1) { toast.error('Informe a quantidade de dias.'); return }
      iso = new Date(Date.now() + n * 86400000).toISOString()
    } else if (modo === 'data') {
      if (!dataFim) { toast.error('Informe a data final.'); return }
      iso = new Date(`${dataFim}T23:59:59-03:00`).toISOString()
    }
    const ok = await confirmar({
      titulo: 'Aplicar tempo de acesso',
      mensagem: `Aplicar esta validade a todos os ${membrosTotal.toLocaleString('pt-BR')} membros de “${grupo.nome}”? Substitui a validade individual de cada um.`,
      confirmar: 'Aplicar',
    })
    if (!ok) return
    setAplicando(true)
    const r = await definirValidadeTodosMembros(grupo.id, iso)
    setAplicando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao aplicar.'); return }
    toast.success(`Validade atualizada para ${r.atualizados ?? 0} membro(s).`)
    router.refresh()
  }

  const opcoesAcesso: { k: ModoAcesso; label: string }[] = [
    { k: 'vitalicio', label: 'Vitalício' }, { k: 'periodo', label: 'Por período' }, { k: 'data', label: 'Até uma data' },
  ]

  return (
    <div className="flex w-full flex-col gap-[18px]">
      {/* Caminho (breadcrumb) */}
      <div className="flex items-center gap-3">
        <Link href="/admin/conteudos/grupos" aria-label="Voltar" title="Voltar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span aria-hidden className="h-[22px] w-px bg-border" />
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
          <Link href="/admin/conteudos/grupos" className="font-semibold text-muted-foreground hover:text-foreground hover:underline">Grupos de acesso</Link>
          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          <span className="font-extrabold text-foreground">{nome || grupo.nome}</span>
        </nav>
      </div>

      {/* Título + ação principal */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-extrabold uppercase tracking-[.2em]" style={{ color: 'var(--gold-ink, #9A7400)' }}>Grupo de acesso</p>
            <h1 className="m-0 truncate text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-foreground">{nome || grupo.nome}</h1>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Pill>{membrosTotal.toLocaleString('pt-BR')} membros</Pill>
              <Pill>{bancosVinculadosCount.toLocaleString('pt-BR')} conteúdos</Pill>
              {grupo.isMestre && <Pill>Pasta</Pill>}
            </div>
          </div>
        </div>
        {podeEditar && tab === 'informacoes' && (
          <button type="button" onClick={salvar} disabled={salvando} style={GRAD_PRIMARY}
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-60">
            <Check className="h-[15px] w-[15px]" />Salvar grupo
          </button>
        )}
        {podeEditar && tab === 'bancos' && (
          <button type="button" onClick={() => setVincularAberto(true)} style={GRAD_PRIMARY}
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)]">
            <Link2 className="h-[15px] w-[15px]" />Vincular a bancos
          </button>
        )}
      </div>

      {/* Abas (sublinhado, sem ícone — porte fiel) */}
      <div className="flex flex-wrap items-center gap-6 overflow-x-auto border-b">
        {TAB_META.map((t) => {
          const ativo = t.key === tab
          const count = t.key === 'membros' ? membrosTotal : t.key === 'bancos' ? bancosVinculadosCount : null
          return (
            <Link
              key={t.key}
              href={`/admin/conteudos/grupos/${grupo.id}?tab=${t.key}`}
              className={cn('-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-1 py-2.5 text-sm transition-colors',
                ativo ? 'border-primary font-semibold text-foreground' : 'border-transparent font-medium text-muted-foreground hover:text-foreground')}
            >
              {t.label}
              {count != null && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{count.toLocaleString('pt-BR')}</span>}
            </Link>
          )
        })}
      </div>

      {/* Conteúdo da aba */}
      {tab === 'informacoes' && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-2xl border bg-card p-6">
            <Secao titulo="Nome" ajuda="Aparece no admin e nos relatórios." first>
              <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar}
                className="h-11 w-full rounded-[13px] border bg-card px-3.5 text-[13.5px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60" />
            </Secao>

            <Secao titulo="Tempo de acesso" ajuda="Quanto tempo o aluno fica com acesso depois de entrar no grupo.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tempo de acesso">
                {opcoesAcesso.map((op) => (
                  <button key={op.k} type="button" role="radio" aria-checked={modo === op.k} disabled={!podeEditar} onClick={() => setModo(op.k)}
                    className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:opacity-60',
                      modo === op.k ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-muted')}>
                    {modo === op.k && <Check className="h-3 w-3" />}{op.label}
                  </button>
                ))}
              </div>
              {modo === 'periodo' && (
                <div className="mt-3 flex items-center gap-2">
                  <input type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} disabled={!podeEditar}
                    className="h-10 w-28 rounded-[13px] border bg-card px-3 text-[13.5px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" />
                  <span className="text-sm text-muted-foreground">dias a partir de hoje</span>
                </div>
              )}
              {modo === 'data' && (
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} disabled={!podeEditar}
                  className="mt-3 h-10 w-full rounded-[13px] border bg-card px-3 text-[13.5px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 sm:max-w-xs" />
              )}
              {podeEditar && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={aplicarAcesso} disabled={aplicando || membrosTotal === 0} style={GRAD_PRIMARY} className={BTN_PRIMARY}>
                    <Check className="h-[15px] w-[15px]" />Aplicar aos membros
                  </button>
                  <span className="text-xs text-muted-foreground">A validade é gravada por membro; também dá para ajustar um a um na aba Membros.</span>
                </div>
              )}
            </Secao>

            <Secao titulo="Entrada no grupo" ajuda="Como o aluno entra.">
              <div className="divide-y divide-border/60 text-sm">
                <LinhaInfo label="Integrações" valor={grupo.origem ? (grupo.origem === 'guru' ? 'Guru' : 'Curseduca') : 'Nenhuma ligada'} />
                <LinhaInfo label="Entrada manual" valor="Pelo admin, em Membros" />
              </div>
              <Link href={`/admin/conteudos/grupos/${grupo.id}?tab=integracoes`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                Ligar integração de venda <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Secao>
          </div>

          {/* Painel lateral: Produtos + Membros */}
          <aside className="sticky top-4 h-fit space-y-5 rounded-2xl border bg-card p-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">Produtos · {bancosVinculadosCount.toLocaleString('pt-BR')}</p>
                <Link href={`/admin/conteudos/grupos/${grupo.id}?tab=bancos`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                  Gerenciar <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {bancosVinculadosCount === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">Nenhum produto vinculado.</p>
              ) : (
                <>
                  <ul className="divide-y divide-border/60">
                    {produtosPreview.slice(0, 2).map((p) => (
                      <li key={p.id} className="flex items-center gap-2.5 py-2">
                        <span aria-hidden className="grid aspect-video w-11 shrink-0 place-items-center rounded-md text-primary-foreground" style={GRAD_PRIMARY}>
                          <Layers className="h-3.5 w-3.5 opacity-90" />
                        </span>
                        <span className="min-w-0 text-[13px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{p.nome}</span>
                      </li>
                    ))}
                  </ul>
                  {bancosVinculadosCount > 2 && (
                    <p className="text-xs text-muted-foreground">e mais {(bancosVinculadosCount - 2).toLocaleString('pt-BR')}</p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">Membros</p>
              <div className="flex items-center justify-between border-t py-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums text-foreground">{membrosTotal.toLocaleString('pt-BR')}</span>
              </div>
              <Link href={`/admin/conteudos/grupos/${grupo.id}?tab=membros`} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[11px] border bg-card text-[13px] font-bold transition-colors hover:bg-muted">
                <Users className="h-4 w-4" /> Ver membros
              </Link>
            </div>
          </aside>
        </div>
      )}

      {tab === 'bancos' && (
        <DataTable<BancoLinha>
          rows={bancosPage}
          total={bancosFiltrados}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'nome', dir: 'asc' }}
          searchable
          searchPlaceholder="Buscar produto vinculado"
          selectable={podeEditar}
          rowActions={(r) => [
            { label: 'Abrir produto', icon: <ExternalLink className="h-4 w-4" />, href: `/admin/banco-questoes/${r.id}` },
            { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarTexto(linkBanco(r), 'Link copiado.') },
            ...(podeEditar ? [{ label: 'Desvincular deste grupo', icon: <Unlink className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => desvincular([r]) }] : []),
          ]}
          bulkActions={(s) => {
            const alvos = bancosPage.filter((b) => s.ids.includes(b.id))
            return (
              <>
                <button type="button" className={BTN_TOP} onClick={() => { if (!alvos.length) { toast.message('Selecione um ou mais produtos desta página.'); return } copiarTexto(alvos.map(linkBanco).join('\n'), `${alvos.length} link(s) copiado(s).`) }}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
                <button type="button" onClick={() => desvincular(alvos, s)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-destructive/35 bg-card px-3 text-[13px] font-bold text-destructive"><Unlink className="h-3.5 w-3.5" />Desvincular</button>
              </>
            )
          }}
          rowHeight="h-14"
          nomeSingular="produto"
          nomePlural="produtos"
          empty={<span>{bancosVinculadosCount === 0 ? 'Nenhum produto vinculado. Use “Vincular a bancos”.' : 'Nenhum produto com esse filtro.'}</span>}
          columns={[
            {
              key: 'nome', header: 'Produto', sortable: true,
              render: (r) => (
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="grid aspect-video w-11 shrink-0 place-items-center rounded-md text-primary-foreground" style={GRAD_PRIMARY}>
                    <Layers className="h-3.5 w-3.5 opacity-90" />
                  </span>
                  <span className="truncate font-bold text-foreground">{r.nome}</span>
                </div>
              ),
              title: (r) => r.nome,
            },
          ]}
        />
      )}

      {tab === 'membros' && (
        <GrupoMembrosPanel
          grupoId={grupo.id}
          podeEditar={podeEditar}
          membros={membrosPage}
          totalFiltrado={membrosFiltrados}
          totalGrupo={membrosTotal}
        />
      )}

      {tab === 'integracoes' && (
        <div className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
          <h2 className="text-sm font-semibold">Entrada no grupo</h2>
          <div className="divide-y divide-border/60">
            <LinhaInfo label="Integrações" valor={grupo.origem ? (grupo.origem === 'guru' ? 'Guru' : 'Curseduca') : 'Nenhuma ligada'} />
            <LinhaInfo label="Entrada manual" valor="Pelo admin, em Membros" />
          </div>
          {grupo.codigo && <p className="text-xs text-muted-foreground">Código externo: {grupo.codigo}</p>}
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            A ligação com integrações de venda é gerenciada em Conexões/Regras de liberação e na área de Produtos.
          </p>
        </div>
      )}

      {vincularAberto && (
        <VincularGrupoModal
          grupoId={grupo.id}
          grupoNome={grupo.nome}
          onClose={() => setVincularAberto(false)}
          onSalvo={() => { setVincularAberto(false); router.refresh() }}
        />
      )}
    </div>
  )
}

/** Selo (pill) de metadado do cabeçalho. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {children}
    </span>
  )
}

/** Seção de formulário (título/ajuda à esquerda, controle à direita). */
function Secao({ titulo, ajuda, children, first }: { titulo: string; ajuda?: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-[240px_minmax(0,1fr)] md:gap-7', first ? 'pb-6' : 'border-t border-border/60 py-6')}>
      <div>
        <h3 className="text-base font-bold tracking-tight">{titulo}</h3>
        {ajuda && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ajuda}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Linha chave→valor (igual ao padrão das telas de conteúdo). */
function LinhaInfo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground [overflow-wrap:anywhere]">{valor}</span>
    </div>
  )
}
