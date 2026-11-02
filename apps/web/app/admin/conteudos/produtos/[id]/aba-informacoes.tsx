'use client'

// Aba "Informações" do produto (tela Produto.png). Porte FIEL do designer:
//  - Cabeçalho da aba (Título c/ contador, Instrutores, Imagens 16:9 / 2:3 / banner)
//  - Grade "Outras configurações": Detalhes · Data de lançamento · Abertura para vendas · Visibilidade ·
//    Direcionamento do membro · Marca d'água · Certificado · Recomendação com IA · E-mail · Comentários
//  - RESUMO à direita (Situação/Tipo/Categoria/Código/Criado/Alterado + Conteúdos/Grupos + "mesmo nome").
//
// O salvarProdutoAction é REPLACE TOTAL: todos os campos reais do produto são mantidos em estado e
// reenviados no salvar (inclusive os não editados aqui — tier/tema/cores/validade/gamificação) para
// não perder dado. Campos SEM coluna no backend são renderizados FIEL com a marca "Em breve" e NÃO
// são persistidos (placeholder visual).

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, UserPlus, Trash2, X, ChevronRight, Image as ImageIcon, Upload, Pencil, List, CalendarClock,
  ShoppingCart, Eye, MoveRight, Droplets, Award, Wand2, Mail, MessageSquare, Copy, FolderInput, Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { PRODUTO_TIPOS, type ProdutoLeve, type ProdutoTipo } from '@/lib/produtos/tipos'
import type { InstrutorRow, ResumoProduto } from '@/lib/produtos/estudio'
import { salvarProdutoAction } from '@/app/admin/produtos/actions'
import { listarInstrutorCandidatosAction, adicionarInstrutorAction, removerInstrutorAction } from '../actions'

const codigoCurto = (id: string) => (parseInt(id.replace(/-/g, '').slice(0, 5), 16) % 9000 + 1000).toString()

export function AbaInformacoes({
  produto, instrutores: instrIniciais, resumo, podeEditar, criadoEm, atualizadoEm, mesmoNome,
  onIrConteudos, onIrGrupos, onDuplicar, onMover, onExcluir, onManutencao, registerPublicar,
}: {
  produto: ProdutoLeve; instrutores: InstrutorRow[]; resumo: ResumoProduto; podeEditar: boolean
  criadoEm: string | null; atualizadoEm: string | null; mesmoNome: { id: string; nome: string }[]
  onIrConteudos: () => void; onIrGrupos: () => void
  onDuplicar: () => void; onMover: () => void; onExcluir: () => void; onManutencao: () => void
  registerPublicar: (fn: () => void) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // Campos REAIS (persistidos). Os não editados aqui são mantidos p/ reenvio no replace total.
  const [nome, setNome] = useState(produto.nome)
  const [tipo, setTipo] = useState<ProdutoTipo>(produto.tipo)
  const [descricao, setDescricao] = useState(produto.descricao ?? '')
  const [capaUrl, setCapaUrl] = useState(produto.capa_url ?? '')             // Horizontal 16:9
  const [posterUrl, setPosterUrl] = useState(produto.banner_mobile_url ?? '') // Vertical 2:3 (reusa banner_mobile_url)
  const [bannerUrl, setBannerUrl] = useState(produto.banner_url ?? '')        // Banner 1920×600
  const [logoUrl, setLogoUrl] = useState(produto.logo_url ?? '')

  const [instrutores, setInstrutores] = useState<InstrutorRow[]>(instrIniciais)
  const [addInstr, setAddInstr] = useState(false)

  function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do produto.'); return }
    start(async () => {
      const r = await salvarProdutoAction({
        id: produto.id, nome: nome.trim(), tipo, descricao: descricao.trim() || null,
        // pass-through (mantém valores atuais — editáveis em /admin/produtos)
        tier: produto.tier, ativo: produto.ativo, tema: produto.tema,
        cor: produto.cor, cor_secundaria: produto.cor_secundaria, gamificacao: produto.gamificacao,
        validade_tipo: produto.validade_tipo, validade_dias: produto.validade_dias, validade_data: produto.validade_data,
        // imagens
        logo_url: logoUrl || null, capa_url: capaUrl || null,
        banner_url: bannerUrl || null, banner_mobile_url: posterUrl || null,
      })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Alterações publicadas.'); router.refresh()
    })
  }
  // Deixa o botão "Publicar alterações" do cabeçalho acionar o salvar desta aba.
  useEffect(() => { registerPublicar(salvar) })

  async function removerInstr(i: InstrutorRow) {
    if (!(await confirmar({ titulo: 'Remover instrutor', mensagem: `Remover ${i.nome || i.email || 'instrutor'}?`, confirmar: 'Remover', destrutivo: true }))) return
    const r = await removerInstrutorAction(i.id, produto.id)
    if ('error' in r && r.error) { toast.error(r.error); return }
    setInstrutores((cur) => cur.filter((x) => x.id !== i.id)); toast.success('Removido.')
  }

  const tipoLabel = PRODUTO_TIPOS.find((t) => t.v === produto.tipo)?.label ?? produto.tipo

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,360px)]">
      {/* ── Coluna principal ── */}
      <div className="space-y-5">
        {/* Cabeçalho do produto: Título / Instrutores / Imagens */}
        <div className="space-y-5 rounded-2xl border bg-card p-4 shadow-sm">
          {/* Título */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-start">
            <div>
              <h2 className="text-sm font-semibold">Título</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Aparece na vitrine do aluno, nos relatórios e nos e-mails.</p>
            </div>
            <div className="relative">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar} maxLength={100} className="pr-16" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">{nome.length} / 100</span>
            </div>
          </div>

          <div className="border-t" />

          {/* Instrutores */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-start">
            <div>
              <h2 className="text-sm font-semibold">Instrutores</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Instrutores criam e editam conteúdos e administram as matrículas dos seus alunos.</p>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {podeEditar && <Button variant="outline" size="sm" onClick={() => setAddInstr(true)}><UserPlus className="h-4 w-4" />Adicionar instrutor</Button>}
                {instrutores.length === 0 && <span className="text-sm text-muted-foreground">Nenhum instrutor neste produto</span>}
              </div>
              {instrutores.length > 0 && (
                <ul className="space-y-1.5">
                  {instrutores.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{i.nome || '—'}</span>{i.email && <span className="block truncate text-xs text-muted-foreground">{i.email}</span>}</span>
                      {podeEditar && <button onClick={() => removerInstr(i)} aria-label="Remover" className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="border-t" />

          {/* Imagens */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-start">
            <div>
              <h2 className="text-sm font-semibold">Imagens</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">O recorte respeita a proporção de cada espaço: a imagem nunca fica esticada.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_1.4fr]">
              <Dropzone aspecto="16 / 9" rotulo="Horizontal · 16:9 · 1280 × 720" value={capaUrl} onChange={setCapaUrl} disabled={!podeEditar} />
              <Dropzone aspecto="2 / 3" rotulo="Vertical · 2:3 · 400 × 600" value={posterUrl} onChange={setPosterUrl} disabled={!podeEditar} />
              <Dropzone aspecto="16 / 5" rotulo="Banner · 1920 × 600" value={bannerUrl} onChange={setBannerUrl} disabled={!podeEditar} compacto />
              <label className="sm:col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Logo</span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://… (URL do logo)" disabled={!podeEditar} className="h-8" />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Outras configurações */}
        <div>
          <h2 className="text-lg font-bold tracking-tight">Outras configurações</h2>
          <p className="text-sm text-muted-foreground">Tudo aberto: o valor atual de cada opção fica visível sem expandir nada.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Detalhes (coluna que abrange 2 linhas na 1ª coluna) */}
          <CardConfig icon={<List className="h-4 w-4" />} titulo="Detalhes" className="md:row-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoPh label="Subtítulo" />
              <Campo label="Código do produto"><Input value={codigoCurto(produto.id)} readOnly className="bg-muted/40" /></Campo>
              <Campo label="Tipo">
                <select value={tipo} onChange={(e) => setTipo(e.target.value as ProdutoTipo)} disabled={!podeEditar} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                  {PRODUTO_TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </Campo>
              <CampoPh label="Categoria" valor="Geral" />
              <CampoPh label="Nível de complexidade" valor="Básico" />
              <CampoPh label="Carga horária" />
            </div>
            <Campo label="URL personalizada"><Input value={produto.slug ?? ''} readOnly placeholder="definida na criação" className="bg-muted/40 font-mono text-xs" /></Campo>
            <Campo label="Descrição do produto">
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!podeEditar} rows={3} placeholder="Descrição do produto" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </Campo>
          </CardConfig>

          {/* Data de lançamento (placeholder) */}
          <CardConfig icon={<CalendarClock className="h-4 w-4" />} titulo="Data de lançamento" emBreve>
            <SwitchRowPh label="Habilitar lançamento" descricao="O produto aparece com contagem regressiva até a data." />
            <CampoPh label="Data de lançamento" />
          </CardConfig>

          {/* Abertura para vendas (placeholder) */}
          <CardConfig icon={<ShoppingCart className="h-4 w-4" />} titulo="Abertura para vendas" emBreve>
            <Pills opcoes={['Sempre aberto', 'Bloqueado para vendas', 'Lista de espera']} selecionado="Sempre aberto" />
          </CardConfig>

          {/* Visibilidade (placeholder) */}
          <CardConfig icon={<Eye className="h-4 w-4" />} titulo="Visibilidade do produto" emBreve>
            <Pills opcoes={['Aberto ao público', 'Apenas para matriculados', 'Apenas para logados']} selecionado="Apenas para matriculados" />
          </CardConfig>

          {/* Direcionamento do membro (placeholder) */}
          <CardConfig icon={<MoveRight className="h-4 w-4" />} titulo="Direcionamento do membro" emBreve>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Matriculados vão para</span>
              <Pills opcoes={['Ambiente de aulas', 'Vitrine do conteúdo', 'Trilha do conteúdo', 'Página customizada']} selecionado="Ambiente de aulas" />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Não matriculados vão para</span>
              <Pills opcoes={['Checkout Cpay', 'Página de vendas', 'Página do conteúdo', 'Página customizada']} selecionado="Página de vendas" />
            </div>
          </CardConfig>

          {/* Marca d'água (placeholder) */}
          <CardConfig icon={<Droplets className="h-4 w-4" />} titulo="Marca d'água" emBreve>
            <SwitchRowPh label="Habilitar marca d'água" ligado />
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Exibir</span>
              <Pills opcoes={['Logotipo', 'Nome do membro', 'E-mail do membro', 'CPF do membro']} selecionado="Nome do membro" />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Posição</span>
              <Pills opcoes={['Superior esquerda', 'Superior direita', 'Inferior esquerda', 'Inferior direita', 'Alternar entre os cantos']} selecionado="Alternar entre os cantos" />
            </div>
          </CardConfig>

          {/* Certificado (placeholder) */}
          <CardConfig icon={<Award className="h-4 w-4" />} titulo="Certificado" emBreve>
            <SwitchRowPh label="Emitir certificado neste produto" ligado />
            <SwitchRowPh label="Emitir sem concluir todas as aulas" />
            <SwitchRowPh label="Bloquear por média de avaliação" />
            <SwitchRowPh label="Exigir aprovação das entregas" />
            <SwitchRowPh label="Pop-up de certificado ao concluir" ligado />
          </CardConfig>

          {/* Recomendação com IA (placeholder) */}
          <CardConfig icon={<Wand2 className="h-4 w-4" />} titulo="Recomendação com IA" emBreve>
            <textarea rows={3} disabled placeholder="Na visão do aluno: que problemas este produto resolve?" className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" />
            <p className="text-xs text-muted-foreground">O recomendador compara este texto com o que o aluno escreve na vitrine.</p>
          </CardConfig>

          {/* E-mail (placeholder) */}
          <CardConfig icon={<Mail className="h-4 w-4" />} titulo="E-mail" emBreve>
            <LinhaInfo k="E-mails próprios" v="Nenhum" />
            <LinhaInfo k="Usa" v="E-mails da plataforma" />
            <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">Cadastrar e-mail <ChevronRight className="h-4 w-4" /></span>
          </CardConfig>

          {/* Comentários (placeholder) */}
          <CardConfig icon={<MessageSquare className="h-4 w-4" />} titulo="Comentários" emBreve>
            <Pills opcoes={['Desabilitado', 'Habilitado']} selecionado="Desabilitado" />
          </CardConfig>
        </div>
      </div>

      {/* ── RESUMO ── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo</div>
          <dl className="divide-y text-sm">
            <Linha k="Situação" v={produto.ativo ? 'Listado' : 'Não listado'} />
            <Linha k="Tipo" v={tipoLabel} />
            <Linha k="Categoria" v="Geral" />
            <Linha k="Código" v={codigoCurto(produto.id)} />
            <Linha k="Criado" v={formatBrt(criadoEm) ?? '—'} />
            <Linha k="Alterado" v={formatBrt(atualizadoEm) ?? '—'} />
          </dl>

          <button onClick={onIrConteudos} className="mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdos</span><span className="flex items-center gap-1 text-primary">Abrir <ChevronRight className="h-4 w-4" /></span>
          </button>
          <dl className="mt-2 divide-y text-sm">
            <Linha k="Módulos" v={String(resumo.modulos)} />
            <Linha k="Submódulos (aulas)" v={String(resumo.submodulos)} />
            <Linha k="Conteúdos" v={String(resumo.conteudos)} />
          </dl>

          <button onClick={onIrGrupos} className="mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupos de acesso</span><span className="flex items-center gap-1 text-primary">Abrir <ChevronRight className="h-4 w-4" /></span>
          </button>
          <dl className="mt-2 divide-y text-sm">
            <Linha k="Grupos ligados" v={String(resumo.grupos)} />
            <Linha k="Maior grupo" v="—" />
          </dl>

          {mesmoNome.length > 0 && (
            <>
              <div className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mesmo nome em outros produtos</div>
              <dl className="divide-y text-sm">
                {mesmoNome.map((p) => (
                  <a key={p.id} href={`/admin/conteudos/produtos/${p.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-primary">
                    <dt className="min-w-0 truncate text-muted-foreground">{p.nome}</dt>
                    <dd className="shrink-0 font-medium tabular-nums">{codigoCurto(p.id)}</dd>
                  </a>
                ))}
              </dl>
            </>
          )}

          {podeEditar && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={onDuplicar}><Copy className="h-4 w-4" />Duplicar</Button>
              <Button variant="outline" size="sm" onClick={onMover}><FolderInput className="h-4 w-4" />Mover</Button>
              <Button variant="outline" size="sm" onClick={onManutencao}><Wrench className="h-4 w-4" />Manutenção</Button>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onExcluir} disabled={pending}><Trash2 className="h-4 w-4" />Lixeira</Button>
            </div>
          )}
        </div>
      </aside>

      {addInstr && <AddInstrutorDialog produtoId={produto.id} jaIds={new Set(instrutores.map((i) => i.user_id).filter(Boolean) as string[])}
        onClose={() => setAddInstr(false)} onAdicionado={(novo) => { setInstrutores((cur) => [...cur, novo]); router.refresh() }} />}
    </div>
  )
}

// ───────────────────────── Dropzone de imagem (URL — dropzone visual FIEL) ─────────────────────────
function Dropzone({ aspecto, rotulo, value, onChange, disabled, compacto }: {
  aspecto: string; rotulo: string; value: string; onChange: (v: string) => void; disabled?: boolean; compacto?: boolean
}) {
  async function pedirUrl() {
    if (disabled) return
    const url = await pedirTexto({ titulo: 'Imagem', label: 'URL da imagem (JPG, PNG ou WEBP)', placeholder: 'https://…', valorInicial: value, confirmar: 'Usar imagem' })
    if (url === null) return
    onChange(url.trim())
  }
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={pedirUrl} disabled={disabled}
        className={cn('group relative flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/20 text-center transition-colors', !disabled && 'hover:border-primary hover:bg-primary/5', disabled && 'opacity-60')}
        style={{ aspectRatio: aspecto }}>
        {value ? (
          <>
            <img src={value} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            {!disabled && <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 text-xs font-medium text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white"><Pencil className="h-3.5 w-3.5" />Trocar</span>}
          </>
        ) : (
          <span className={cn('flex flex-col items-center gap-1 px-2 text-muted-foreground', compacto && 'flex-row')}>
            <Upload className="h-5 w-5" />
            <span className="text-xs font-medium text-foreground">Solte a capa aqui</span>
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{rotulo}</span>
        {value && !disabled && <button type="button" onClick={() => onChange('')} className="text-[11px] text-muted-foreground hover:text-destructive">Remover</button>}
      </div>
    </div>
  )
}

// ───────────────────────── Adicionar instrutor ─────────────────────────
function AddInstrutorDialog({ produtoId, jaIds, onClose, onAdicionado }: {
  produtoId: string; jaIds: Set<string>; onClose: () => void; onAdicionado: (i: InstrutorRow) => void
}) {
  const [cands, setCands] = useState<{ user_id: string; nome: string; email: string }[] | null>(null)
  const [q, setQ] = useState('')
  const [pending, start] = useTransition()
  useEffect(() => { listarInstrutorCandidatosAction().then((r) => setCands(('candidatos' in r ? r.candidatos : []) ?? [])).catch(() => setCands([])) }, [])
  const lista = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (cands ?? []).filter((c) => !jaIds.has(c.user_id)).filter((c) => !s || c.nome.toLowerCase().includes(s) || c.email.toLowerCase().includes(s))
  }, [cands, q, jaIds])

  function add(c: { user_id: string; nome: string; email: string }) {
    start(async () => {
      const r = await adicionarInstrutorAction(produtoId, { user_id: c.user_id, nome: c.nome, email: c.email })
      if ('error' in r && r.error) { toast.error(r.error); return }
      onAdicionado({ id: `tmp-${c.user_id}`, user_id: c.user_id, nome: c.nome, email: c.email }); toast.success('Instrutor adicionado.'); onClose()
    })
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogTitle>Adicionar instrutor</DialogTitle>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar administrador…" />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {cands === null ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          : lista.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Nenhum administrador disponível.</div>
          : lista.map((c) => (
            <button key={c.user_id} type="button" disabled={pending} onClick={() => add(c)} className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.nome}</span><span className="block truncate text-xs text-muted-foreground">{c.email}</span></span>
              <UserPlus className="h-4 w-4 shrink-0 text-primary" />
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Os candidatos são os administradores do tenant. Precisa de permissão de RBAC para listá-los.</p>
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}><X className="h-4 w-4" />Fechar</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── helpers de layout ─────────────────────────
function CardConfig({ icon, titulo, emBreve, className, children }: { icon: React.ReactNode; titulo: string; emBreve?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {emBreve && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Em breve</span>}
        {!emBreve && <Pencil className="ml-auto h-4 w-4 text-muted-foreground/60" />}
      </div>
      {children}
    </div>
  )
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>
}
/** Campo placeholder (sem coluna no backend): FIEL mas desabilitado, valor "—" ou amostra. */
function CampoPh({ label, valor }: { label: string; valor?: string }) {
  return (
    <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-9 items-center rounded-lg border bg-muted/30 px-2.5 text-sm text-muted-foreground">{valor ?? '—'}</div>
    </label>
  )
}
/** Grupo de pílulas (placeholder visual — mostra a selecionada; não persiste). */
function Pills({ opcoes, selecionado }: { opcoes: string[]; selecionado: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <span key={o} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', o === selecionado ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>{o}</span>
      ))}
    </div>
  )
}
function SwitchRowPh({ label, descricao, ligado }: { label: string; descricao?: string; ligado?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5">
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{descricao && <span className="block text-xs text-muted-foreground">{descricao}</span>}</span>
      <Switch checked={!!ligado} disabled />
    </div>
  )
}
function LinhaInfo({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
}
function Linha({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
}
