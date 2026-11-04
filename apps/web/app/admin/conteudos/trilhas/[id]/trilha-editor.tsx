'use client'

// TRILHA › editor (TrilhaEditar.png + TrilhaConteudos.png). 3 abas (sublinhado): Informações · Imagens ·
// Conteúdos. Backend-first: cada aba salva via server action; a página recarrega do servidor.
// REUSA <FilePicker> para banner/conquista (imagem via "Link externo" ou vídeo via "Vídeo").

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Link2, Copy, Check, X, GripVertical, Image as ImageIcon, Trophy, Search, Plus, Trash2,
} from 'lucide-react'
import { FilePicker } from '@/components/admin/file-picker'
import { cn } from '@/lib/utils'
import type { TrilhaDetalhe, Visibilidade, OrdemModo, ProdutoOpcao } from '@/lib/trilhas/trilhas'
import { confirmar } from '@/components/ui/confirm-dialog'
import { atualizarTrilhaAction, salvarItensTrilhaAction, duplicarTrilhaAction, excluirTrilhaAction } from '../actions'

type Tab = 'informacoes' | 'imagens' | 'conteudos'
const VIS: { k: Visibilidade; label: string }[] = [{ k: 'publica', label: 'Pública' }, { k: 'privada', label: 'Privada' }, { k: 'nao_listada', label: 'Não listada' }]
const OFFSETS: { v: number | null; label: string }[] = [
  { v: null, label: 'Na matrícula' }, { v: 7, label: '+7 dias' }, { v: 14, label: '+14 dias' }, { v: 21, label: '+21 dias' },
  { v: 28, label: '+28 dias' }, { v: 35, label: '+35 dias' }, { v: 42, label: '+42 dias' }, { v: 60, label: '+60 dias' }, { v: 90, label: '+90 dias' },
]
type ItemLocal = { key: string; produto_id: string; produto_nome: string; offset: number | null }

export function TrilhaEditor({ trilha, produtos, outrasTrilhas, tenantId, tabInicial, podeEditar }: {
  trilha: TrilhaDetalhe; produtos: ProdutoOpcao[]; outrasTrilhas: { id: string; nome: string }[]; tenantId: string; tabInicial: Tab; podeEditar: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(tabInicial)
  const [, start] = useTransition()

  // Informações
  const [nome, setNome] = useState(trilha.nome)
  const [descricao, setDescricao] = useState(trilha.descricao ?? '')
  const [visibilidade, setVisibilidade] = useState<Visibilidade>(trilha.visibilidade)
  const [anteriorId, setAnteriorId] = useState(trilha.trilha_anterior_id ?? '')
  const [bloqOrdem, setBloqOrdem] = useState(trilha.bloquear_ordem)
  const [bloqAnterior, setBloqAnterior] = useState(trilha.bloquear_acesso_anterior)

  // Imagens
  const [bannerUrl, setBannerUrl] = useState(trilha.banner_url ?? '')
  const [bannerTipo, setBannerTipo] = useState(trilha.banner_tipo ?? 'imagem')
  const [conquistaUrl, setConquistaUrl] = useState(trilha.conquista_url ?? '')
  const [picker, setPicker] = useState<null | 'banner' | 'conquista'>(null)

  // Conteúdos
  const [itens, setItens] = useState<ItemLocal[]>(trilha.itensLista.map((i) => ({ key: i.id, produto_id: i.produto_id, produto_nome: i.produto_nome, offset: i.liberacao_offset_dias })))
  const [ordemModo, setOrdemModo] = useState<OrdemModo>(trilha.ordem_modo)

  const salvarInfo = () => start(async () => {
    if (!nome.trim()) { toast.error('Informe o nome da trilha.'); return }
    const r = await atualizarTrilhaAction(trilha.id, { nome, descricao, visibilidade, trilha_anterior_id: anteriorId || null, bloquear_ordem: bloqOrdem, bloquear_acesso_anterior: bloqAnterior, regerarSlug: nome !== trilha.nome })
    r.ok ? (toast.success('Trilha salva.'), router.refresh()) : toast.error(r.error)
  })
  const salvarImagens = () => start(async () => {
    const r = await atualizarTrilhaAction(trilha.id, { banner_url: bannerUrl || null, banner_tipo: bannerTipo, conquista_url: conquistaUrl || null })
    r.ok ? (toast.success('Imagens salvas.'), router.refresh()) : toast.error(r.error)
  })
  const salvarConteudos = () => start(async () => {
    const r = await salvarItensTrilhaAction(trilha.id, itens.map((i, idx) => ({ produto_id: i.produto_id, ordem: idx, liberacao_offset_dias: ordemModo === 'data' ? i.offset : null })), ordemModo)
    r.ok ? (toast.success('Conteúdos salvos.'), router.refresh()) : toast.error(r.error)
  })

  const duplicar = () => start(async () => {
    const r = await duplicarTrilhaAction(trilha.id)
    if (r.ok && r.id) { toast.success('Trilha duplicada.'); router.push(`/admin/conteudos/trilhas/${r.id}`) } else toast.error(r.error)
  })
  const excluir = () => start(async () => {
    if (!(await confirmar({ titulo: 'Excluir trilha', mensagem: 'A trilha vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return
    const r = await excluirTrilhaAction(trilha.id)
    r.ok ? (toast.success('Trilha excluída.'), router.push('/admin/conteudos/trilhas')) : toast.error(r.error)
  })

  function onPicker(r: Parameters<React.ComponentProps<typeof FilePicker>['onSelecionar']>[0]) {
    const alvo = picker
    if (r.tipo === 'video') { if (alvo === 'banner') { setBannerUrl(r.url); setBannerTipo('video') } else setConquistaUrl(r.url) }
    else if (r.tipo === 'link') { if (alvo === 'banner') { setBannerUrl(r.url); setBannerTipo('imagem') } else setConquistaUrl(r.url) }
    else toast.info('Para o banner/conquista, use um link de imagem (aba “Link externo”) ou um vídeo.')
    setPicker(null)
  }

  return (
    <div className="w-full space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/conteudos/trilhas" aria-label="Voltar" className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
          {tab === 'informacoes' && (
            trilha.banner_url && trilha.banner_tipo !== 'video'
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={trilha.banner_url} alt="" className="hidden h-[62px] w-[110px] shrink-0 rounded-xl border object-cover sm:block" />
              : <span className="hidden h-[62px] w-[110px] shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-lg font-extrabold text-primary-foreground sm:grid">{trilha.nome.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0">
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/admin/conteudos/trilhas" className="hover:text-foreground">Trilhas</Link>
              <ChevronRight className="h-3 w-3" /><span className="text-foreground">{trilha.nome}</span>
            </nav>
            <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[.2em]" style={{ color: 'var(--gold-ink, var(--pn-9a7400,#9A7400))' }}>Trilha · cód. {trilha.codigo ?? '—'}</div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-foreground">{tab === 'conteudos' ? 'Conteúdos da trilha' : trilha.nome}</h1>
            {tab === 'conteudos'
              ? <p className="mt-1 text-sm text-muted-foreground">Selecione os conteúdos que fazem parte desta trilha e defina a ordem de exibição.</p>
              : (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', trilha.visibilidade === 'publica' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{VIS.find((v) => v.k === trilha.visibilidade)?.label}</span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-semibold text-muted-foreground">{trilha.itensLista.length} cursos ativos</span>
                </div>
              )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/trilhas/${trilha.slug ?? trilha.id}`); toast.success('Link copiado.') }} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted"><Link2 className="h-4 w-4" /> Copiar link</button>
          <button onClick={duplicar} disabled={!podeEditar} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" /> Duplicar</button>
          <button onClick={excluir} disabled={!podeEditar} className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-card px-3.5 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir</button>
          {tab === 'conteudos' ? (
            <>
              <Link href="/admin/conteudos/trilhas" className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted">Cancelar</Link>
              <button onClick={salvarConteudos} disabled={!podeEditar} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Check className="h-4 w-4" /> Salvar conteúdos</button>
            </>
          ) : (
            <button onClick={tab === 'imagens' ? salvarImagens : salvarInfo} disabled={!podeEditar} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Check className="h-4 w-4" /> Salvar trilha</button>
          )}
        </div>
      </div>

      {/* Abas (sublinhado) */}
      <div className="flex items-center gap-1 border-b">
        {([['informacoes', 'Informações'], ['imagens', 'Imagens'], ['conteudos', 'Conteúdos']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}{k === 'conteudos' && <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">{itens.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'informacoes' && (
        <AbaInformacoes
          nome={nome} setNome={setNome} slug={trilha.slug} descricao={descricao} setDescricao={setDescricao}
          visibilidade={visibilidade} setVisibilidade={setVisibilidade} anteriorId={anteriorId} setAnteriorId={setAnteriorId}
          outrasTrilhas={outrasTrilhas} bloqOrdem={bloqOrdem} setBloqOrdem={setBloqOrdem} bloqAnterior={bloqAnterior} setBloqAnterior={setBloqAnterior}
          itens={itens} podeEditar={podeEditar}
        />
      )}
      {tab === 'imagens' && (
        <AbaImagens bannerUrl={bannerUrl} bannerTipo={bannerTipo} setBannerTipo={setBannerTipo} conquistaUrl={conquistaUrl} podeEditar={podeEditar}
          onEscolherBanner={() => setPicker('banner')} onLimparBanner={() => setBannerUrl('')} onEscolherConquista={() => setPicker('conquista')} onLimparConquista={() => setConquistaUrl('')}
          onBannerUrl={setBannerUrl} onConquistaUrl={setConquistaUrl} nome={trilha.nome} />
      )}
      {tab === 'conteudos' && (
        <AbaConteudos itens={itens} setItens={setItens} ordemModo={ordemModo} setOrdemModo={setOrdemModo} produtos={produtos} podeEditar={podeEditar} />
      )}

      {picker && (
        <FilePicker open onClose={() => setPicker(null)} tenantId={tenantId} abaInicial="link" onSelecionar={onPicker} />
      )}
    </div>
  )
}

// ───────────────────────────── Aba: Informações ─────────────────────────────
function AbaInformacoes(p: {
  nome: string; setNome: (v: string) => void; slug: string | null; descricao: string; setDescricao: (v: string) => void
  visibilidade: Visibilidade; setVisibilidade: (v: Visibilidade) => void; anteriorId: string; setAnteriorId: (v: string) => void
  outrasTrilhas: { id: string; nome: string }[]; bloqOrdem: boolean; setBloqOrdem: (v: boolean) => void; bloqAnterior: boolean; setBloqAnterior: (v: boolean) => void
  itens: ItemLocal[]; podeEditar: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-6 rounded-xl border bg-card p-5">
        <Secao titulo="Nome e endereço" sub="O nome aparece para o aluno. O endereço é o link da trilha.">
          <Campo label="Nome da trilha *">
            <input value={p.nome} disabled={!p.podeEditar} onChange={(e) => p.setNome(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
          </Campo>
          <Campo label="URL">
            <input value={p.slug ?? ''} disabled readOnly className="h-10 w-full rounded-lg border bg-muted/40 px-3 font-mono text-sm text-muted-foreground" />
            <span className="mt-1 block text-xs text-muted-foreground">Ao salvar, o endereço é refeito a partir do nome.</span>
          </Campo>
        </Secao>

        <Secao titulo="Descrição" sub="Texto da página da trilha.">
          <textarea value={p.descricao} disabled={!p.podeEditar} onChange={(e) => p.setDescricao(e.target.value)} rows={3} className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
        </Secao>

        <Secao titulo="Quem vê" sub="Quem enxerga esta trilha.">
          <Campo label="Visibilidade">
            <div className="flex flex-wrap gap-2">
              {VIS.map((v) => <button key={v.k} type="button" disabled={!p.podeEditar} onClick={() => p.setVisibilidade(v.k)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60', p.visibilidade === v.k ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>{v.label}</button>)}
            </div>
          </Campo>
        </Secao>

        <Secao titulo="Ordem e bloqueios" sub="Como o aluno avança.">
          <Campo label="Trilha anterior">
            <select value={p.anteriorId} disabled={!p.podeEditar} onChange={(e) => p.setAnteriorId(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <option value="">Nenhuma</option>
              {p.outrasTrilhas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Campo>
          <ToggleBloco titulo="Bloquear ordem de conclusão dos conteúdos da trilha" sub="O aluno só abre o próximo curso depois de concluir o anterior." on={p.bloqOrdem} disabled={!p.podeEditar} onToggle={p.setBloqOrdem} />
          <ToggleBloco titulo="Bloquear acesso antes de terminar a trilha anterior" on={p.bloqAnterior} disabled={!p.podeEditar} onToggle={p.setBloqAnterior} />
        </Secao>
      </div>

      {/* Resumo conteúdos */}
      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdos · {p.itens.length}</div>
        {p.itens.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum conteúdo. Adicione na aba “Conteúdos”.</div> : (
          <ol className="space-y-1.5">
            {p.itens.map((it, i) => (
              <li key={it.key} className="flex items-center gap-2 text-sm"><span className="shrink-0 tabular-nums text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span><span className="truncate text-foreground">{it.produto_nome}</span></li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────── Aba: Imagens ─────────────────────────────
function AbaImagens(p: {
  bannerUrl: string; bannerTipo: string; setBannerTipo: (v: string) => void; conquistaUrl: string; nome: string; podeEditar: boolean
  onEscolherBanner: () => void; onLimparBanner: () => void; onEscolherConquista: () => void; onLimparConquista: () => void
  onBannerUrl: (v: string) => void; onConquistaUrl: (v: string) => void
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold text-foreground">Imagens</h2>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Banner · imagem ou vídeo</div>
          <div className="mb-2 flex gap-2">
            <button type="button" disabled={!p.podeEditar} onClick={() => p.setBannerTipo('imagem')} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', p.bannerTipo === 'imagem' ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>Imagem</button>
            <button type="button" disabled={!p.podeEditar} onClick={() => p.setBannerTipo('video')} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', p.bannerTipo === 'video' ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>Vídeo</button>
          </div>
          <div className="overflow-hidden rounded-xl border bg-muted">
            {p.bannerUrl ? (
              p.bannerTipo === 'video' ? <div className="flex aspect-[16/7] w-full items-center justify-center text-xs text-muted-foreground">Vídeo: {p.bannerUrl}</div>
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={p.bannerUrl} alt="" className="aspect-[16/7] w-full object-cover" />
            ) : <div className="flex aspect-[16/7] w-full items-center justify-center bg-gradient-to-br from-primary to-primary/50 text-xl font-bold text-primary-foreground">{p.nome}</div>}
          </div>
          <input value={p.bannerUrl} disabled={!p.podeEditar} onChange={(e) => p.onBannerUrl(e.target.value)} placeholder="Cole a URL ou use o seletor" className="mt-2 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={!p.podeEditar} onClick={p.onEscolherBanner} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"><ImageIcon className="h-4 w-4" /> Escolher</button>
            {p.bannerUrl && <button type="button" disabled={!p.podeEditar} onClick={p.onLimparBanner} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /> Remover</button>}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Conquista · imagem ao concluir</div>
          <div className="flex items-center justify-center">
            <div className="grid h-40 w-40 place-items-center overflow-hidden rounded-full border bg-muted">
              {p.conquistaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.conquistaUrl} alt="" className="h-full w-full object-cover" />
              ) : <Trophy className="h-10 w-10 text-muted-foreground" />}
            </div>
          </div>
          <input value={p.conquistaUrl} disabled={!p.podeEditar} onChange={(e) => p.onConquistaUrl(e.target.value)} placeholder="Cole a URL ou use o seletor" className="mt-3 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
          <div className="mt-2 flex items-center justify-center gap-2">
            <button type="button" disabled={!p.podeEditar} onClick={p.onEscolherConquista} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"><ImageIcon className="h-4 w-4" /> Escolher</button>
            {p.conquistaUrl && <button type="button" disabled={!p.podeEditar} onClick={p.onLimparConquista} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /> Remover</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Aba: Conteúdos ─────────────────────────────
function AbaConteudos(p: {
  itens: ItemLocal[]; setItens: (v: ItemLocal[]) => void; ordemModo: OrdemModo; setOrdemModo: (v: OrdemModo) => void; produtos: ProdutoOpcao[]; podeEditar: boolean
}) {
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dragKey, setDragKey] = useState<string | null>(null)
  const jaNaTrilha = useMemo(() => new Set(p.itens.map((i) => i.produto_id)), [p.itens])
  const disponiveis = useMemo(() => p.produtos.filter((pr) => !jaNaTrilha.has(pr.id) && (!busca.trim() || pr.nome.toLowerCase().includes(busca.toLowerCase()))), [p.produtos, jaNaTrilha, busca])
  const duracao = useMemo(() => p.itens.reduce((m, i) => Math.max(m, i.offset ?? 0), 0), [p.itens])

  function adicionarSelecionados() {
    const add = p.produtos.filter((pr) => sel.has(pr.id)).map((pr) => ({ key: `new-${pr.id}`, produto_id: pr.id, produto_nome: pr.nome, offset: null as number | null }))
    p.setItens([...p.itens, ...add]); setSel(new Set())
  }
  function remover(key: string) { p.setItens(p.itens.filter((i) => i.key !== key)) }
  function setOffset(key: string, offset: number | null) { p.setItens(p.itens.map((i) => i.key === key ? { ...i, offset } : i)) }
  function soltarEm(alvoKey: string) {
    if (!dragKey || dragKey === alvoKey) return
    const arr = [...p.itens]; const de = arr.findIndex((i) => i.key === dragKey); const para = arr.findIndex((i) => i.key === alvoKey)
    if (de < 0 || para < 0) return
    const [mov] = arr.splice(de, 1); arr.splice(para, 0, mov); p.setItens(arr)
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Ordenação</div>
          <div className="flex gap-2">
            <button disabled={!p.podeEditar} onClick={() => p.setOrdemModo('manual')} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', p.ordemModo === 'manual' ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>Ordenação manual</button>
            <button disabled={!p.podeEditar} onClick={() => p.setOrdemModo('data')} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', p.ordemModo === 'data' ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>Data de liberação</button>
          </div>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
          {p.ordemModo === 'data'
            ? 'Com “Data de liberação”, cada conteúdo abre X dias depois da matrícula.'
            : 'Em “Ordenação manual”, os conteúdos ficam na ordem definida (arraste para reordenar), sem datas.'}
        </div>

        {/* Lista de itens */}
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_11rem_2.5rem] border-b bg-muted/50 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            <span>#</span><span>Conteúdo</span><span>Liberação</span><span />
          </div>
          {p.itens.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum conteúdo. Adicione produtos à direita.</div>
          ) : p.itens.map((it, i) => (
            <div key={it.key} draggable={p.podeEditar} onDragStart={() => setDragKey(it.key)} onDragOver={(e) => { if (dragKey) e.preventDefault() }} onDrop={() => { soltarEm(it.key); setDragKey(null) }} onDragEnd={() => setDragKey(null)}
              className={cn('grid grid-cols-[2.5rem_minmax(0,1fr)_11rem_2.5rem] items-center gap-2 border-b px-3 py-2.5 last:border-0', dragKey === it.key && 'opacity-50')}>
              <div className="flex items-center gap-1 text-muted-foreground">{p.podeEditar && <GripVertical className="h-4 w-4 cursor-grab" />}<span className="text-sm font-semibold tabular-nums">{i + 1}</span></div>
              <div className="truncate text-sm font-medium text-foreground" title={it.produto_nome}>{it.produto_nome}</div>
              <select value={it.offset ?? ''} disabled={!p.podeEditar || p.ordemModo !== 'data'} onChange={(e) => setOffset(it.key, e.target.value === '' ? null : Number(e.target.value))}
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                {OFFSETS.map((o) => <option key={String(o.v)} value={o.v ?? ''}>{o.label}</option>)}
              </select>
              <button disabled={!p.podeEditar} onClick={() => remover(it.key)} aria-label="Remover" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Adicionar conteúdo + resumo */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adicionar conteúdo</div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {disponiveis.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">{p.produtos.length ? 'Nenhum produto disponível.' : 'Cadastre produtos para adicioná-los.'}</div> : disponiveis.map((pr) => (
              <label key={pr.id} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm hover:bg-muted/40">
                <input type="checkbox" checked={sel.has(pr.id)} onChange={() => { const n = new Set(sel); n.has(pr.id) ? n.delete(pr.id) : n.add(pr.id); setSel(n) }} className="mt-0.5 h-4 w-4 accent-[var(--brand-primary,var(--primary))]" />
                <span className="min-w-0"><span className="block truncate font-medium text-foreground">{pr.nome}</span>{pr.tipo && <span className="text-xs text-muted-foreground">{pr.tipo}</span>}</span>
              </label>
            ))}
          </div>
          <button disabled={!p.podeEditar || sel.size === 0} onClick={adicionarSelecionados} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Plus className="h-4 w-4" /> Adicionar selecionados</button>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo</div>
          <LinhaResumo label="Conteúdos" valor={String(p.itens.length)} />
          <LinhaResumo label="Liberação" valor={p.ordemModo === 'data' ? 'Por data' : 'Manual'} />
          <LinhaResumo label="Duração até o último" valor={p.ordemModo === 'data' ? `${duracao} dias` : '—'} />
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Pequenos ─────────────────────────────
function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b pb-6 last:border-0 last:pb-0 md:grid-cols-[180px_minmax(0,1fr)]">
      <div><div className="font-semibold text-foreground">{titulo}</div>{sub && <div className="mt-0.5 text-sm text-muted-foreground">{sub}</div>}</div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>
}
function ToggleBloco({ titulo, sub, on, onToggle, disabled }: { titulo: string; sub?: string; on: boolean; onToggle: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div><div className="text-sm font-medium text-foreground">{titulo}</div>{sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}</div>
      <button role="switch" aria-checked={on} aria-label={titulo} disabled={disabled} onClick={() => onToggle(!on)} className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} />
      </button>
    </div>
  )
}
function LinhaResumo({ label, valor }: { label: string; valor: string }) {
  return <div className="flex items-center justify-between border-t py-1.5 text-sm first:border-0"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-foreground">{valor}</span></div>
}
