'use client'

// Editor RICO de Produto / Extensivo. Espelha a "área de membros" da Curseduca:
// identidade visual com preview ao vivo + construtor de vitrine por seções
// (banner / carrossel) + acesso (validade, fontes, grupos) + membros + avisos.
//
// IMPORTANTE: salvarProdutoAction reescreve a LINHA inteira do produto a cada chamada
// (todas as colunas são defaultadas no server). Por isso tanto "Salvar identidade"
// quanto "Salvar acesso" enviam o payload COMPLETO (payloadProduto) — senão um
// sobrescreveria os campos do outro.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Plus, Trash2, Users, Loader2, Search, Boxes, Image as ImageIcon,
  LayoutGrid, ChevronUp, ChevronDown, GripVertical, Megaphone, Pin, Palette, Eye,
  Layers, Trophy, Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  PRODUTO_TIPOS, SECAO_TAMANHOS, ITENS_PASTA,
  type ProdutoDetalhe, type ProdutoTema, type ProdutoTier, type ProdutoTipo,
  type ValidadeTipo, type SecaoTipo, type SecaoTamanho, type SecaoOrdenacao,
  type ItemRef, type ItemTipo,
} from '@/lib/produtos/tipos'
import {
  salvarProdutoAction, excluirProdutoAction, salvarFontesAction, salvarVitrineAction,
  salvarGruposAction, adicionarMembrosAction, removerMembroAction, listarRecursosAction,
  getProdutoAction, listarAvisosAction, salvarAvisoAction, excluirAvisoAction,
} from '../actions'

type Membro = { estudante_id: string; nome: string; email: string; status: string; origem: string; inicio_em: string | null; expira_em: string | null }
type Fonte = { provider: string; fonte_ref: string | null; fonte_nome: string | null }
type Recurso = { id: string; nome: string; area?: string | null }
type Recursos = { grupos: Recurso[]; simulados: Recurso[]; pastas: Recurso[]; cronogramas: Recurso[] }
type AvisoRow = { id: string; titulo: string; corpo: string | null; fixado: boolean; ativo: boolean; criado_em: string }

/** Seção da vitrine em edição (com chave estável para reordenar sem perder foco). */
type SecaoDraft = {
  _key: string
  tipo: SecaoTipo
  nome: string
  tamanho: SecaoTamanho
  ordenacao: SecaoOrdenacao
  config: { imagem?: string; imagem_mobile?: string; link?: string; itens?: ItemRef[] }
}

const ABAS = [
  ['identidade', 'Identidade'], ['vitrine', 'Vitrine'], ['acesso', 'Acesso'],
  ['membros', 'Membros'], ['avisos', 'Avisos'],
] as const
const PROVIDERS: [string, string][] = [['curseduca', 'Curseduca'], ['guru', 'Guru'], ['manual', 'Manual / outro']]
const TIERS: [string, string][] = [['normal', 'Normal'], ['passaporte', 'Passaporte'], ['vitalicio', 'Vitalício']]
const VALIDADES: [string, string][] = [['vitalicio', 'Vitalício'], ['dias', 'Dias a partir da entrada'], ['data_fixa', 'Data fixa']]
const ORDENACOES: [string, string][] = [['manual', 'Manual'], ['alfabetica', 'Alfabética'], ['recentes', 'Recentes']]
const TIPO_LABEL = Object.fromEntries(PRODUTO_TIPOS.map((t) => [t.v, t.label]))

const uid = () => Math.random().toString(36).slice(2, 10)
const isPasta = (t: string) => ITENS_PASTA.includes(t as ItemTipo)

export function ProdutoEditor({ produto, membrosIniciais, podeEditar }: { produto: ProdutoDetalhe; membrosIniciais: Membro[]; podeEditar: boolean }) {
  const router = useRouter()
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>('identidade')
  const [pending, start] = useTransition()

  // ── Identidade ──
  const [nome, setNome] = useState(produto.nome)
  const [tipo, setTipo] = useState<ProdutoTipo>(produto.tipo)
  const [descricao, setDescricao] = useState(produto.descricao ?? '')
  const [tier, setTier] = useState<ProdutoTier>(produto.tier)
  const [tema, setTema] = useState<ProdutoTema>(produto.tema)
  const [cor, setCor] = useState(produto.cor ?? '')
  const [corSec, setCorSec] = useState(produto.cor_secundaria ?? '')
  const [logoUrl, setLogoUrl] = useState(produto.logo_url ?? '')
  const [capaUrl, setCapaUrl] = useState(produto.capa_url ?? '')
  const [bannerUrl, setBannerUrl] = useState(produto.banner_url ?? '')
  const [bannerMobileUrl, setBannerMobileUrl] = useState(produto.banner_mobile_url ?? '')
  const [gamificacao, setGamificacao] = useState(produto.gamificacao)
  const [ativo, setAtivo] = useState(produto.ativo)

  // ── Acesso: validade ──
  const [valTipo, setValTipo] = useState<ValidadeTipo>(produto.validade_tipo)
  const [valDias, setValDias] = useState<number | ''>(produto.validade_dias ?? '')
  const [valData, setValData] = useState(produto.validade_data ? produto.validade_data.slice(0, 10) : '')

  // ── Acesso: fontes + grupos ──
  const [fontes, setFontes] = useState<Fonte[]>(produto.fontes.map((f) => ({ provider: f.provider, fonte_ref: f.fonte_ref, fonte_nome: f.fonte_nome })))
  const [grupoIds, setGrupoIds] = useState<string[]>(produto.itens.filter((i) => i.tipo_item === 'grupo').map((i) => i.item_id))

  // ── Vitrine ──
  const [secoes, setSecoes] = useState<SecaoDraft[]>(
    produto.secoes.map((s) => ({ _key: s.id || uid(), tipo: s.tipo, nome: s.nome ?? '', tamanho: s.tamanho, ordenacao: s.ordenacao, config: s.config ?? {} })),
  )

  // ── Membros / Avisos ──
  const [membros, setMembros] = useState<Membro[]>(membrosIniciais)
  const [novosEmails, setNovosEmails] = useState('')
  const [avisos, setAvisos] = useState<AvisoRow[]>([])
  const [novoAviso, setNovoAviso] = useState({ titulo: '', corpo: '', fixado: false })

  // ── Recursos (pickers) ──
  const [recursos, setRecursos] = useState<Recursos | null>(null)

  useEffect(() => { (async () => {
    const r = await listarRecursosAction()
    if ('ok' in r) setRecursos({ grupos: r.grupos ?? [], simulados: r.simulados ?? [], pastas: r.pastas ?? [], cronogramas: r.cronogramas ?? [] })
    const ra = await listarAvisosAction(produto.id)
    if ('ok' in ra) setAvisos((ra.avisos ?? []) as AvisoRow[])
  })() }, [produto.id])

  const recarregarMembros = () => start(async () => {
    const r = await getProdutoAction(produto.id)
    if ('ok' in r) setMembros(r.membros ?? [])
  })

  // Relatório da aba Membros (computado da lista já carregada).
  const stats = useMemo(() => {
    const now = Date.now(), em7 = now + 7 * 86400_000
    let manual = 0, integ = 0, ativos = 0, expSoon = 0
    for (const m of membros) {
      if (m.origem === 'manual') manual++; else integ++
      if (m.status === 'ativo') ativos++
      if (m.expira_em) { const t = new Date(m.expira_em).getTime(); if (t > now && t < em7) expSoon++ }
    }
    return { total: membros.length, manual, integ, ativos, expSoon }
  }, [membros])

  // Monta o payload COMPLETO do produto (usado por Identidade e Acesso).
  function payloadProduto() {
    return {
      id: produto.id, nome: nome.trim(), tipo, tier, ativo,
      descricao: descricao.trim() || null,
      cor: cor || null, cor_secundaria: corSec || null, tema,
      logo_url: logoUrl || null, capa_url: capaUrl || null,
      banner_url: bannerUrl || null, banner_mobile_url: bannerMobileUrl || null,
      gamificacao,
      validade_tipo: valTipo,
      validade_dias: valTipo === 'dias' ? (Number(valDias) || null) : null,
      validade_data: valTipo === 'data_fixa' && valData ? new Date(valData).toISOString() : null,
    }
  }

  function salvarProduto(msg: string) {
    if (!nome.trim()) { toast.error('Informe o nome do produto.'); return }
    start(async () => {
      const r = await salvarProdutoAction(payloadProduto())
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(msg); router.refresh()
    })
  }

  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir produto', mensagem: `Excluir "${produto.nome}"? As fontes, seções e liberações são apagadas; o acesso já concedido aos alunos não é removido automaticamente.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => {
      const r = await excluirProdutoAction(produto.id)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Produto excluído.'); router.push('/admin/produtos')
    })
  }

  // ── Fontes ──
  const addFonte = () => setFontes((f) => [...f, { provider: 'curseduca', fonte_ref: '', fonte_nome: '' }])
  const setFonte = (i: number, patch: Partial<Fonte>) => setFontes((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const rmFonte = (i: number) => setFontes((f) => f.filter((_, j) => j !== i))
  function salvarFontes() {
    start(async () => {
      const r = await salvarFontesAction(produto.id, fontes)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Fontes salvas.'); router.refresh()
    })
  }

  // ── Grupos (acesso) ──
  const toggleGrupo = (_t: ItemTipo, id: string) => setGrupoIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  function salvarGrupos() {
    start(async () => {
      const r = await salvarGruposAction(produto.id, grupoIds)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Grupos de acesso salvos.'); router.refresh()
    })
  }

  // ── Vitrine ──
  const patchSecao = (i: number, patch: Partial<SecaoDraft>) => setSecoes((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const patchConfig = (i: number, patch: Partial<SecaoDraft['config']>) => setSecoes((s) => s.map((x, j) => (j === i ? { ...x, config: { ...x.config, ...patch } } : x)))
  const moveSecao = (i: number, dir: -1 | 1) => setSecoes((s) => {
    const j = i + dir
    if (j < 0 || j >= s.length) return s
    const copy = [...s]; const [it] = copy.splice(i, 1); copy.splice(j, 0, it); return copy
  })
  const rmSecao = (i: number) => setSecoes((s) => s.filter((_, j) => j !== i))
  const addBanner = () => setSecoes((s) => [...s, { _key: uid(), tipo: 'banner', nome: '', tamanho: 'horizontal_large', ordenacao: 'manual', config: {} }])
  const addCarrossel = () => setSecoes((s) => [...s, { _key: uid(), tipo: 'carrossel', nome: 'Nova seção', tamanho: 'vertical_small', ordenacao: 'manual', config: { itens: [] } }])

  function toggleSecaoItem(i: number, tipoItem: ItemTipo, id: string) {
    setSecoes((s) => s.map((x, j) => {
      if (j !== i) return x
      const itens = x.config.itens ?? []
      const on = isPasta(tipoItem)
        ? itens.some((it) => isPasta(it.tipo_item) && it.item_id === id)
        : itens.some((it) => it.tipo_item === tipoItem && it.item_id === id)
      const novos = on
        ? itens.filter((it) => !(it.item_id === id && (isPasta(tipoItem) ? isPasta(it.tipo_item) : it.tipo_item === tipoItem)))
        : [...itens, { tipo_item: tipoItem, item_id: id }]
      return { ...x, config: { ...x.config, itens: novos } }
    }))
  }
  function salvarVitrine() {
    start(async () => {
      const r = await salvarVitrineAction(produto.id, secoes.map((s) => ({
        tipo: s.tipo, nome: s.nome.trim() || null, tamanho: s.tamanho, ordenacao: s.ordenacao, config: s.config,
      })))
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Vitrine salva.'); router.refresh()
    })
  }

  // ── Membros ──
  function adicionarMembros() {
    if (!novosEmails.trim()) return
    start(async () => {
      const r = await adicionarMembrosAction(produto.id, novosEmails)
      if ('error' in r && r.error) { toast.error(r.error); return }
      const res = r as { adicionados: number; naoEncontrados: string[] }
      toast.success(`${res.adicionados} aluno(s) adicionado(s).${res.naoEncontrados.length ? ` ${res.naoEncontrados.length} e-mail(s) sem cadastro.` : ''}`)
      if (res.naoEncontrados.length) toast.error(`Sem cadastro: ${res.naoEncontrados.slice(0, 8).join(', ')}${res.naoEncontrados.length > 8 ? '…' : ''}`)
      setNovosEmails(''); recarregarMembros()
    })
  }
  async function removerMembro(m: Membro) {
    if (!(await confirmar({ titulo: 'Remover do produto', mensagem: `Remover ${m.nome || m.email}? O acesso que só este produto concede será revogado (o que outro produto garante permanece).`, confirmar: 'Remover', destrutivo: true }))) return
    start(async () => {
      const r = await removerMembroAction(produto.id, m.estudante_id)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Removido.'); recarregarMembros()
    })
  }

  // ── Avisos ──
  function addAviso() {
    const titulo = novoAviso.titulo.trim(); if (!titulo) return
    start(async () => {
      const r = await salvarAvisoAction(produto.id, { titulo, corpo: novoAviso.corpo, fixado: novoAviso.fixado })
      if ('error' in r && r.error) { toast.error(r.error); return }
      setNovoAviso({ titulo: '', corpo: '', fixado: false }); toast.success('Aviso publicado.')
      const ra = await listarAvisosAction(produto.id); if ('ok' in ra) setAvisos((ra.avisos ?? []) as AvisoRow[])
    })
  }
  async function removeAviso(a: AvisoRow) {
    if (!(await confirmar({ titulo: 'Remover aviso', mensagem: `Remover "${a.titulo}"?`, confirmar: 'Remover', destrutivo: true }))) return
    start(async () => {
      const r = await excluirAvisoAction(a.id)
      if ('error' in r && r.error) { toast.error(r.error); return }
      setAvisos((cur) => cur.filter((x) => x.id !== a.id)); toast.success('Removido.')
    })
  }

  const itensVitrine = useMemo(() => {
    const s = new Set<string>()
    for (const sec of secoes) if (sec.tipo === 'carrossel') for (const it of (sec.config.itens ?? [])) if (it.tipo_item !== 'grupo') s.add(`${it.tipo_item}:${it.item_id}`)
    return s.size
  }, [secoes])

  return (
    <div className="w-full space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin/produtos" aria-label="Voltar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">{nome || 'Produto'}</h1>
            <p className="text-xs text-muted-foreground">{membros.length} membro(s) · {secoes.length} seção(ões) · {itensVitrine} conteúdo(s) · {grupoIds.length} grupo(s)</p>
          </div>
        </div>
        {podeEditar && <Button variant="destructive" onClick={excluir} disabled={pending}><Trash2 className="h-4 w-4" />Excluir</Button>}
      </div>

      {/* Abas de linha */}
      <div className="flex gap-4 overflow-x-auto border-b">
        {ABAS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setAba(k)}
            className={`-mb-px shrink-0 border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${aba === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ───────── IDENTIDADE ───────── */}
      {aba === 'identidade' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,420px)]">
          {/* Formulário */}
          <div className="space-y-4">
            <Secao titulo="Dados" icon={<Layers className="h-4 w-4 text-muted-foreground" />}>
              <Campo label="Nome"><Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar} /></Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Slug (informativo)"><Input value={produto.slug ?? '—'} readOnly disabled className="opacity-70" /></Campo>
                <Campo label="Tipo"><Select value={tipo} onChange={(v) => setTipo(v as ProdutoTipo)} disabled={!podeEditar} opts={PRODUTO_TIPOS.map((t) => [t.v, t.label])} /></Campo>
              </div>
              <Campo label="Descrição"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!podeEditar} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Campo>
              <Campo label="Tier (classificação)"><Select value={tier} onChange={(v) => setTier(v as ProdutoTier)} disabled={!podeEditar} opts={TIERS} /></Campo>
            </Secao>

            <Secao titulo="Identidade visual" icon={<Palette className="h-4 w-4 text-muted-foreground" />}>
              <Campo label="Tema da área">
                <div className="flex gap-2">
                  {(['claro', 'escuro'] as ProdutoTema[]).map((t) => (
                    <button key={t} type="button" disabled={!podeEditar} onClick={() => setTema(t)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${tema === t ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField label="Cor primária" value={cor} onChange={setCor} disabled={!podeEditar} />
                <ColorField label="Cor secundária" value={corSec} onChange={setCorSec} disabled={!podeEditar} />
              </div>
              <ImgField label="Logo (URL)" value={logoUrl} onChange={setLogoUrl} disabled={!podeEditar} />
              <ImgField label="Capa — card/pôster (URL)" value={capaUrl} onChange={setCapaUrl} disabled={!podeEditar} />
              <ImgField label="Banner — desktop (URL)" value={bannerUrl} onChange={setBannerUrl} disabled={!podeEditar} />
              <ImgField label="Banner — mobile (URL)" value={bannerMobileUrl} onChange={setBannerMobileUrl} disabled={!podeEditar} />
            </Secao>

            <Secao titulo="Opções" icon={<Trophy className="h-4 w-4 text-muted-foreground" />}>
              <SwitchRow label="Gamificação" descricao="Pontos, ranking e conquistas dentro do produto." checked={gamificacao} onChange={setGamificacao} disabled={!podeEditar} />
              <SwitchRow label="Produto ativo" descricao="Inativo não aparece para novos alunos." checked={ativo} onChange={setAtivo} disabled={!podeEditar} />
            </Secao>

            {podeEditar && <div><Button onClick={() => salvarProduto('Identidade salva.')} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar identidade</Button></div>}
          </div>

          {/* Preview ao vivo */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Eye className="h-3.5 w-3.5" />Pré-visualização do aluno</div>
            <Preview tema={tema} cor={cor} corSec={corSec} nome={nome} tipo={tipo} tier={tier} gamificacao={gamificacao}
              logoUrl={logoUrl} capaUrl={capaUrl} bannerUrl={bannerUrl} descricao={descricao} />
          </div>
        </div>
      )}

      {/* ───────── VITRINE ───────── */}
      {aba === 'vitrine' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            A vitrine monta a tela do aluno por seções (como a Curseduca). O <strong className="text-foreground">conteúdo liberado</strong> ao aluno é derivado dos itens dos <strong className="text-foreground">carrosséis</strong> somados aos <strong className="text-foreground">grupos</strong> da aba Acesso.
          </div>

          {secoes.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
              Nenhuma seção ainda. Adicione um banner ou um carrossel.
            </div>
          ) : (
            <div className="space-y-3">
              {secoes.map((s, i) => (
                <div key={s._key} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.tipo === 'banner' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-primary/10 text-primary'}`}>
                        {s.tipo === 'banner' ? <ImageIcon className="h-3 w-3" /> : <LayoutGrid className="h-3 w-3" />}
                        {s.tipo === 'banner' ? 'Banner' : 'Carrossel'}
                      </span>
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    </div>
                    {podeEditar && (
                      <div className="flex items-center gap-1">
                        <IconBtn aria-label="Mover para cima" disabled={i === 0} onClick={() => moveSecao(i, -1)}><ChevronUp className="h-4 w-4" /></IconBtn>
                        <IconBtn aria-label="Mover para baixo" disabled={i === secoes.length - 1} onClick={() => moveSecao(i, 1)}><ChevronDown className="h-4 w-4" /></IconBtn>
                        <IconBtn aria-label="Remover seção" destrutivo onClick={() => rmSecao(i)}><Trash2 className="h-4 w-4" /></IconBtn>
                      </div>
                    )}
                  </div>

                  {s.tipo === 'banner' ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <ImgField label="Imagem (URL)" value={s.config.imagem ?? ''} onChange={(v) => patchConfig(i, { imagem: v })} disabled={!podeEditar} />
                      <ImgField label="Imagem mobile (URL)" value={s.config.imagem_mobile ?? ''} onChange={(v) => patchConfig(i, { imagem_mobile: v })} disabled={!podeEditar} />
                      <Campo label="Link ao clicar (URL)"><Input value={s.config.link ?? ''} onChange={(e) => patchConfig(i, { link: e.target.value })} placeholder="https://…" disabled={!podeEditar} /></Campo>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Campo label="Nome da seção"><Input value={s.nome} onChange={(e) => patchSecao(i, { nome: e.target.value })} placeholder="Ex.: Simulados da semana" disabled={!podeEditar} /></Campo>
                        <Campo label="Tamanho"><Select value={s.tamanho} onChange={(v) => patchSecao(i, { tamanho: v as SecaoTamanho })} disabled={!podeEditar} opts={SECAO_TAMANHOS.map((t) => [t.v, t.label])} /></Campo>
                        <Campo label="Ordenação"><Select value={s.ordenacao} onChange={(v) => patchSecao(i, { ordenacao: v as SecaoOrdenacao })} disabled={!podeEditar} opts={ORDENACOES} /></Campo>
                      </div>
                      {!recursos ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando recursos…</div>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-3">
                          <Seletor titulo="Simulados" tipoItem="simulado" recursos={recursos.simulados} isSelected={(t, id) => secaoTem(s, t, id)} toggle={(t, id) => toggleSecaoItem(i, t, id)} podeEditar={podeEditar} />
                          <Seletor titulo="Pastas · Biblioteca · Desafios" tipoItem="banco" recursos={recursos.pastas} isSelected={(t, id) => secaoTem(s, t, id)} toggle={(t, id) => toggleSecaoItem(i, t, id)} podeEditar={podeEditar} comArea />
                          <Seletor titulo="Cronogramas" tipoItem="cronograma" recursos={recursos.cronogramas} isSelected={(t, id) => secaoTem(s, t, id)} toggle={(t, id) => toggleSecaoItem(i, t, id)} podeEditar={podeEditar} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={addBanner}><Plus className="h-4 w-4" />Banner</Button>
              <Button variant="outline" onClick={addCarrossel}><Plus className="h-4 w-4" />Carrossel</Button>
              <Button onClick={salvarVitrine} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar vitrine</Button>
            </div>
          )}
        </div>
      )}

      {/* ───────── ACESSO ───────── */}
      {aba === 'acesso' && (
        <div className="space-y-5">
          {/* Validade */}
          <Secao titulo="Validade do acesso" icon={<Layers className="h-4 w-4 text-muted-foreground" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Tipo de validade"><Select value={valTipo} onChange={(v) => setValTipo(v as ValidadeTipo)} disabled={!podeEditar} opts={VALIDADES} /></Campo>
              {valTipo === 'dias' && <Campo label="Dias"><Input type="number" value={valDias} onChange={(e) => setValDias(e.target.value === '' ? '' : Number(e.target.value))} disabled={!podeEditar} /></Campo>}
              {valTipo === 'data_fixa' && <Campo label="Expira em"><Input type="date" value={valData} onChange={(e) => setValData(e.target.value)} disabled={!podeEditar} /></Campo>}
            </div>
            {podeEditar && <div><Button onClick={() => salvarProduto('Validade salva.')} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar validade</Button></div>}
          </Secao>

          {/* Fontes */}
          <Secao titulo="Fontes de entrada" icon={<Link2 className="h-4 w-4 text-muted-foreground" />}>
            <p className="text-xs text-muted-foreground">De onde o aluno ENTRA. Ao chegar por uma fonte (grupo Curseduca / produto Guru), o produto é aplicado automaticamente. Sem referência = entrada só manual.</p>
            {fontes.map((f, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center">
                <Select value={f.provider} onChange={(v) => setFonte(i, { provider: v })} disabled={!podeEditar} opts={PROVIDERS} className="sm:w-40" />
                <Input value={f.fonte_ref ?? ''} onChange={(e) => setFonte(i, { fonte_ref: e.target.value })} placeholder="ID do grupo/produto (ref)" disabled={!podeEditar} className="sm:flex-1" />
                <Input value={f.fonte_nome ?? ''} onChange={(e) => setFonte(i, { fonte_nome: e.target.value })} placeholder="Rótulo (opcional)" disabled={!podeEditar} className="sm:flex-1" />
                {podeEditar && <IconBtn aria-label="Remover fonte" destrutivo onClick={() => rmFonte(i)}><Trash2 className="h-4 w-4" /></IconBtn>}
              </div>
            ))}
            {podeEditar && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={addFonte}><Plus className="h-4 w-4" />Adicionar fonte</Button>
                <Button onClick={salvarFontes} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar fontes</Button>
              </div>
            )}
          </Secao>

          {/* Grupos liberados */}
          <Secao titulo="Grupos liberados" icon={<Boxes className="h-4 w-4 text-muted-foreground" />}>
            <p className="text-xs text-muted-foreground">Grupos de acesso concedidos a quem entra neste produto (acesso, não vitrine).</p>
            {!recursos ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando grupos…</div>
            ) : (
              <div className="max-w-xl">
                <Seletor titulo="Grupos de acesso" tipoItem="grupo" recursos={recursos.grupos} isSelected={(_t, id) => grupoIds.includes(id)} toggle={toggleGrupo} podeEditar={podeEditar} />
              </div>
            )}
            {podeEditar && <div><Button onClick={salvarGrupos} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar grupos</Button></div>}
          </Secao>
        </div>
      )}

      {/* ───────── MEMBROS ───────── */}
      {aba === 'membros' && (
        <div className="space-y-4">
          {podeEditar && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <label className="mb-2 block text-sm font-semibold">Adicionar alunos (manual)</label>
              <p className="mb-2 text-xs text-muted-foreground">Cole e-mails (vírgula, espaço ou linha). Precisam ter cadastro de aluno; o acesso do produto é concedido na hora.</p>
              <textarea value={novosEmails} onChange={(e) => setNovosEmails(e.target.value)} rows={2} placeholder="aluno1@exemplo.com, aluno2@exemplo.com" className="mb-2 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <Button onClick={adicionarMembros} disabled={pending || !novosEmails.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar</Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['Membros', stats.total], ['Ativos', stats.ativos], ['Manual · Integração', `${stats.manual} · ${stats.integ}`], ['Expiram em 7 dias', stats.expSoon]] as [string, string | number][]).map(([label, val]) => (
              <div key={label} className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="text-xl font-bold tabular-nums">{val}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b p-3 text-sm font-semibold"><Users className="h-4 w-4" />{membros.length} membro(s)</div>
            {membros.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhum membro ainda.</div>
            ) : (
              <ul className="divide-y">
                {membros.map((m) => (
                  <li key={m.estudante_id + m.origem} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5">{m.origem}</span>
                      {m.status !== 'ativo' && <span className="rounded-full bg-muted px-2 py-0.5">{m.status}</span>}
                      {m.expira_em && <span>até {new Date(m.expira_em).toLocaleDateString('pt-BR')}</span>}
                      {podeEditar && <IconBtn aria-label="Remover membro" destrutivo onClick={() => removerMembro(m)}><Trash2 className="h-4 w-4" /></IconBtn>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ───────── AVISOS ───────── */}
      {aba === 'avisos' && (
        <div className="space-y-4">
          {podeEditar && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold"><Megaphone className="h-4 w-4" />Publicar aviso</label>
              <p className="mb-2 text-xs text-muted-foreground">Aparece na página do produto para o aluno.</p>
              <Input value={novoAviso.titulo} onChange={(e) => setNovoAviso((v) => ({ ...v, titulo: e.target.value }))} placeholder="Título do aviso" className="mb-2" disabled={pending} />
              <textarea value={novoAviso.corpo} onChange={(e) => setNovoAviso((v) => ({ ...v, corpo: e.target.value }))} rows={2} placeholder="Mensagem (opcional)" className="mb-2 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={pending} />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm"><Switch checked={novoAviso.fixado} onCheckedChange={(v) => setNovoAviso((x) => ({ ...x, fixado: v }))} disabled={pending} /><span className="flex items-center gap-1 text-muted-foreground"><Pin className="h-3.5 w-3.5" />Fixar no topo</span></label>
                <Button onClick={addAviso} disabled={pending || !novoAviso.titulo.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Publicar</Button>
              </div>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-3 text-sm font-semibold">{avisos.length} aviso(s)</div>
            {avisos.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhum aviso publicado.</div>
            ) : (
              <ul className="divide-y">
                {avisos.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {a.fixado && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        <span className="truncate text-sm font-medium">{a.titulo}</span>
                        {!a.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">inativo</span>}
                      </div>
                      {a.corpo && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.corpo}</p>}
                    </div>
                    {podeEditar && <IconBtn aria-label="Remover aviso" destrutivo onClick={() => removeAviso(a)}><Trash2 className="h-4 w-4" /></IconBtn>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Verifica se um item está numa seção (pastas colapsam em ITENS_PASTA). */
function secaoTem(s: SecaoDraft, tipoItem: ItemTipo, id: string) {
  const itens = s.config.itens ?? []
  return isPasta(tipoItem)
    ? itens.some((it) => isPasta(it.tipo_item) && it.item_id === id)
    : itens.some((it) => it.tipo_item === tipoItem && it.item_id === id)
}

// ───────── subcomponentes ─────────

function Secao({ titulo, icon, children }: { titulo: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">{icon}{titulo}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>
}

function Select({ value, onChange, opts, disabled, className }: { value: string; onChange: (v: string) => void; opts: [string, string][]; disabled?: boolean; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`h-8 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${className ?? 'w-full'}`}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#7c3aed'} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border bg-background p-0.5 disabled:opacity-50" aria-label={label} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#7c3aed" disabled={disabled} className="font-mono" />
      </div>
    </label>
  )
}

// Imagem: envio do computador (ou URL) via <CampoImagem>. Antes era só um campo de URL.
function ImgField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <CampoImagem variant="linha" value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function SwitchRow({ label, descricao, checked, onChange, disabled }: { label: string; descricao?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {descricao && <span className="block text-xs text-muted-foreground">{descricao}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  )
}

function IconBtn({ children, onClick, disabled, destrutivo, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; destrutivo?: boolean } & React.AriaAttributes) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} {...rest}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-40 ${destrutivo ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground'}`}>
      {children}
    </button>
  )
}

/** Picker de recursos com busca + checkboxes (reusado em Vitrine e Acesso). */
function Seletor({ titulo, tipoItem, recursos, isSelected, toggle, podeEditar, comArea }: {
  titulo: string; tipoItem: ItemTipo; recursos: Recurso[]
  isSelected: (tipoItem: ItemTipo, id: string) => boolean
  toggle: (tipoItem: ItemTipo, id: string) => void
  podeEditar: boolean; comArea?: boolean
}) {
  const [q, setQ] = useState('')
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? recursos.filter((r) => r.nome.toLowerCase().includes(s)) : recursos
  }, [recursos, q])
  const n = recursos.filter((r) => isSelected(tipoItem, r.id)).length
  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b p-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Boxes className="h-4 w-4 text-muted-foreground" />{titulo}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{n} selec.</span>
      </div>
      <div className="p-2.5">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filtrados.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Nada aqui.</div> : filtrados.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
              <input type="checkbox" checked={isSelected(tipoItem, r.id)} onChange={() => toggle(tipoItem, r.id)} disabled={!podeEditar} className="h-4 w-4 accent-[var(--primary)]" />
              <span className="min-w-0 flex-1 truncate">{r.nome}</span>
              {comArea && r.area && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.area}</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Pré-visualização da área do aluno (cores do produto via style inline — são dados, não tokens). */
function Preview({ tema, cor, corSec, nome, tipo, tier, gamificacao, logoUrl, capaUrl, bannerUrl, descricao }: {
  tema: ProdutoTema; cor: string; corSec: string; nome: string; tipo: ProdutoTipo; tier: ProdutoTier
  gamificacao: boolean; logoUrl: string; capaUrl: string; bannerUrl: string; descricao: string
}) {
  const escuro = tema === 'escuro'
  const corP = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#7c3aed'
  const corS = /^#[0-9a-fA-F]{6}$/.test(corSec) ? corSec : corP
  const grad = `linear-gradient(135deg, ${corP}, ${corS})`
  const fundo = escuro ? '#0d0b16' : '#f4f4f7'
  const surf = escuro ? '#17131f' : '#ffffff'
  const fg = escuro ? '#f4f4f5' : '#18181b'
  const fgSub = escuro ? '#a1a1aa' : '#71717a'
  const borda = escuro ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'

  return (
    <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ background: fundo, borderColor: borda }}>
      {/* Banner */}
      <div className="relative h-28" style={{ background: grad }}>
        {bannerUrl && <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget.style.display = 'none') }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.05))' }} />
        <div className="relative flex h-full items-end gap-2 p-3">
          {logoUrl && <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white/15 object-contain p-1 backdrop-blur" onError={(e) => { (e.currentTarget.style.display = 'none') }} />}
          <span className="text-sm font-bold text-white drop-shadow">{nome || 'Nome do produto'}</span>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-3">
        <div className="flex gap-3">
          {/* Pôster */}
          <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-xl" style={{ background: grad }}>
            {capaUrl && <img src={capaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget.style.display = 'none') }} />}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
              <span className="line-clamp-2 text-[10px] font-semibold text-white">{nome || 'Produto'}</span>
            </div>
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: corP }}>{TIPO_LABEL[tipo] ?? tipo}</span>
              {tier !== 'normal' && <span className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: escuro ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)', color: fgSub }}>{tier}</span>}
              {gamificacao && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: escuro ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)', color: fgSub }}><Trophy className="h-2.5 w-2.5" />Gamificado</span>}
            </div>
            {descricao && <p className="mt-1.5 line-clamp-3 text-[11px]" style={{ color: fgSub }}>{descricao}</p>}
            <button type="button" className="mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: corP }}>Acessar</button>
          </div>
        </div>

        {/* Mini carrossel ilustrativo */}
        <div className="mt-3 rounded-xl p-2.5" style={{ background: surf, border: `1px solid ${borda}` }}>
          <div className="mb-1.5 text-[11px] font-semibold" style={{ color: fg }}>Seus conteúdos</div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((k) => <div key={k} className="h-12 flex-1 rounded-md" style={{ background: grad, opacity: 0.85 - k * 0.15 }} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
