'use client'

// Editor de Produto do Estúdio (telas Produto / ProdutoConteudos / ProdutoGrupos):
// cabeçalho FIEL (logo + eyebrow/título + meta + estado "Publicado ▾" · Ver como aluno · ⋯ · Publicar alterações)
// e abas sublinhadas (Informações · Conteúdos · Vitrine · Grupos de acesso · Visibilidade).
// Reusa as actions de produção (salvarProdutoAction/salvarGruposAction/...) e as tabelas novas do currículo.

import { useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Boxes, Copy, FolderInput, Trash2, MoreVertical, Eye, Check, ChevronDown, Wrench, Loader2, Save, Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { navProgressStart, navProgressDone } from '@/lib/nav-progress'
import { PRODUTO_TIPOS, type Produto, type ProdutoLeve } from '@/lib/produtos/tipos'
import type { InstrutorRow, ResumoProduto, PastaProdutoFlat } from '@/lib/produtos/estudio'
import { definirEstadoProdutoAction, excluirProdutoAction, salvarProdutoAction, type EstadoProduto } from '@/app/admin/produtos/actions'
import { MoverDialog, DuplicarProdutoDialog } from '../produto-modais'
import { AbaInformacoes } from './aba-informacoes'
import { AbaConteudos } from './aba-conteudos'
import { AbaGrupos } from './aba-grupos'
import { AbaVitrine } from './aba-vitrine'
import { AbaVisibilidade } from './aba-visibilidade'
import { listarPastasProdutoAction } from './lazy-actions'

type Aba = 'informacoes' | 'conteudos' | 'vitrine' | 'grupos' | 'visibilidade'

/** Payload COMPLETO do produto (salvarProdutoAction é replace total — tudo que não for enviado volta ao default). */
function payloadCompleto(p: ProdutoLeve, over: Partial<Produto> = {}): Partial<Produto> & { id: string } {
  return {
    id: p.id, nome: p.nome, tipo: p.tipo, descricao: p.descricao, tier: p.tier, ativo: p.ativo,
    cor: p.cor, cor_secundaria: p.cor_secundaria, tema: p.tema, logo_url: p.logo_url, capa_url: p.capa_url,
    banner_url: p.banner_url, banner_mobile_url: p.banner_mobile_url, gamificacao: p.gamificacao,
    vitrine_layout: p.vitrine_layout, validade_tipo: p.validade_tipo, validade_dias: p.validade_dias, validade_data: p.validade_data, ...over,
  }
}

const ABAS: Aba[] = ['informacoes', 'conteudos', 'vitrine', 'grupos', 'visibilidade']

export function ProdutoEstudioClient({
  tenantId, podeEditar, produto, instrutores, resumo, breadcrumb,
  criadoEm, atualizadoEm, mesmoNome,
}: {
  tenantId: string; podeEditar: boolean; produto: ProdutoLeve
  instrutores: InstrutorRow[]; resumo: ResumoProduto; breadcrumb: PastaProdutoFlat[]
  criadoEm: string | null; atualizadoEm: string | null; mesmoNome: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inicial = (searchParams.get('aba') as Aba) || 'informacoes'
  const [aba, setAba] = useState<Aba>(ABAS.includes(inicial) ? inicial : 'informacoes')
  // Abas pesadas só montam (e só buscam seus dados) na 1ª abertura; depois ficam montadas/ocultas (sem recarregar).
  const [visitadas, setVisitadas] = useState<Set<Aba>>(() => new Set([ABAS.includes(inicial) ? inicial : 'informacoes']))
  const [mover, setMover] = useState(false)
  // Árvore de pastas (só p/ o diálogo "Mover") — carregada sob demanda ao abrir.
  const [arvore, setArvore] = useState<PastaProdutoFlat[] | null>(null)
  function abrirMover() {
    setMover(true)
    if (arvore === null) listarPastasProdutoAction().then((r) => setArvore(r.ok ? r.pastas : [])).catch(() => setArvore([]))
  }
  const [duplicar, setDuplicar] = useState(false)
  const [pending, start] = useTransition()

  // A aba Informações registra aqui sua função de salvar — o botão "Publicar alterações" do cabeçalho a chama.
  const publicarRef = useRef<null | (() => void)>(null)

  // Barra de carregamento do topo: voltar navega (start); trocar aba é estado local (start + done).
  function voltar() { navProgressStart(); router.push('/admin/conteudos/produtos') }
  function trocarAba(k: Aba) { if (k === aba) return; setAba(k); setVisitadas((p) => (p.has(k) ? p : new Set(p).add(k))); navProgressStart(); navProgressDone() }

  async function excluir() {
    if (!(await confirmar({ titulo: 'Mover para a Lixeira', mensagem: `Enviar "${produto.nome}" para a Lixeira? As fontes, seções e liberações são apagadas; o acesso já concedido aos alunos não é removido automaticamente.`, confirmar: 'Enviar para a Lixeira', destrutivo: true }))) return
    const r = await excluirProdutoAction(produto.id)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success('Produto enviado para a Lixeira.'); router.push('/admin/conteudos/produtos')
  }

  // Estado ÚNICO do produto: Publicado · Em atualização (bloqueio TOTAL com mensagem) · Rascunho (fora do ar).
  const estadoAtual: EstadoProduto = !produto.ativo ? 'rascunho' : produto.acesso_bloqueado ? 'em_atualizacao' : 'publicado'
  async function definirEstado(novo: EstadoProduto) {
    if (novo === estadoAtual) return
    // Tirar do ar um produto que está ao vivo (em atualização/rascunho) afeta TODOS os alunos → confirma.
    if (estadoAtual === 'publicado') {
      const ok = await confirmar(novo === 'em_atualizacao'
        ? { titulo: 'Colocar em atualização?', mensagem: `"${produto.nome}" ficará inacessível para TODOS os alunos (até matriculados) — eles verão "Produto em atualização". Edite à vontade e volte a Publicado quando terminar.`, confirmar: 'Bloquear acesso', destrutivo: true }
        : { titulo: 'Mover para rascunho?', mensagem: `"${produto.nome}" sai do ar: some da lista dos alunos e a página deixa de abrir, mesmo para matriculados.`, confirmar: 'Mover para rascunho', destrutivo: true })
      if (!ok) return
    }
    start(async () => {
      const r = await definirEstadoProdutoAction(produto.id, novo)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(novo === 'publicado' ? 'Produto publicado — acesso liberado.' : novo === 'em_atualizacao' ? 'Produto em atualização — acesso bloqueado.' : 'Produto movido para rascunho.')
      router.refresh()
    })
  }
  const ESTADOS: { v: EstadoProduto; label: string; desc: string; dot: string }[] = [
    { v: 'publicado', label: 'Publicado', desc: 'Ao vivo: alunos com acesso entram normalmente.', dot: 'bg-emerald-500' },
    { v: 'em_atualizacao', label: 'Em atualização', desc: 'Bloqueia TODOS (até pagantes) com aviso. Use para editar com segurança.', dot: 'bg-amber-500' },
    { v: 'rascunho', label: 'Rascunho', desc: 'Fora do ar: some da lista e não abre para ninguém.', dot: 'bg-muted-foreground' },
  ]
  const estadoInfo = ESTADOS.find((e) => e.v === estadoAtual)!
  const aoVivo = estadoAtual === 'publicado'

  async function publicar() {
    // PUBLICADO = ao vivo → publicar manda as alterações ao ar NA HORA: confirma antes (sugere "Em atualização"
    // p/ editar com segurança). Em atualização / Rascunho = ninguém vê → salva direto.
    if (aoVivo) {
      const ok = await confirmar({
        titulo: 'Publicar alterações?',
        mensagem: `"${produto.nome}" está publicado — ao publicar, as alterações ficam visíveis para os alunos imediatamente. Para editar sem que ninguém veja, mude antes o estado para "Em atualização".`,
        confirmar: 'Publicar agora',
      })
      if (!ok) return
    }
    if (aba === 'informacoes' && publicarRef.current) { publicarRef.current(); return }
    // Nas demais abas as alterações já são salvas por seção; aqui só confirmamos e tocamos atualizado_em.
    start(async () => {
      const r = await salvarProdutoAction(payloadCompleto(produto))
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(aoVivo ? 'Alterações publicadas para os alunos.' : estadoAtual === 'em_atualizacao' ? 'Alterações salvas (produto em atualização — alunos não veem).' : 'Alterações salvas (rascunho).'); router.refresh()
    })
  }

  const tipoLabel = PRODUTO_TIPOS.find((t) => t.v === produto.tipo)?.label ?? produto.tipo
  const verComoAlunoHref = produto.slug ? `/aluno/extensivos/${produto.slug}` : null

  const abas: [Aba, string, number | null][] = [
    ['informacoes', 'Informações', null],
    ['conteudos', 'Conteúdos', resumo.conteudos],
    ['vitrine', 'Vitrine', produto.secoes.length],
    ['grupos', 'Grupos de acesso', resumo.grupos],
    ['visibilidade', 'Visibilidade', null],
  ]

  return (
    <div className="w-full space-y-5">
      {/* Cabeçalho */}
      <div className="space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={voltar} aria-label="Voltar" className="flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
          <button onClick={voltar} className="text-muted-foreground hover:text-foreground">Produtos</button>
          {breadcrumb.map((b) => <span key={b.id} className="text-muted-foreground">› {b.nome}</span>)}
          <span className="truncate font-medium">› {produto.nome}</span>
        </div>

        {/* Linha identidade + ações */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl text-primary-foreground" style={{ background: produto.cor || 'var(--primary)' }}>
              {produto.logo_url
                ? <img src={produto.logo_url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                : <Boxes className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">Produto</div>
              <h1 className="truncate text-2xl font-bold tracking-tight">{produto.nome}</h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{tipoLabel}</span>
                <span className="opacity-50">·</span>
                <span>Geral</span>
                {(criadoEm || atualizadoEm) && <span className="opacity-50">·</span>}
                {criadoEm && <span>Criado {formatBrt(criadoEm)}</span>}
                {atualizadoEm && <span>· alterado {formatBrt(atualizadoEm)}</span>}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Estado único: Publicado · Em atualização (bloqueio total) · Rascunho (fora do ar) */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Estado do produto"
                disabled={!podeEditar || pending}
                className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none transition-colors hover:bg-muted data-popup-open:bg-muted disabled:opacity-60"
              >
                <span className={cn('h-2 w-2 rounded-full', estadoInfo.dot)} />
                {estadoInfo.label}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {ESTADOS.map((e) => (
                  <DropdownMenuItem key={e.v} onClick={() => void definirEstado(e.v)} className="items-start gap-2 py-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{e.label}</span>
                      <span className="block text-xs text-muted-foreground">{e.desc}</span>
                    </span>
                    {e.v === estadoAtual && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {verComoAlunoHref ? (
              <a href={verComoAlunoHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none transition-colors hover:bg-muted"><Eye className="h-4 w-4" />Ver como aluno</a>
            ) : (
              <Button variant="outline" onClick={() => toast.message('Defina a URL personalizada do produto para pré-visualizar como aluno.')}><Eye className="h-4 w-4" />Ver como aluno</Button>
            )}

            {podeEditar && (
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Ações do produto" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted data-popup-open:bg-muted">
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDuplicar(true)}><Copy className="h-4 w-4" />Duplicar</DropdownMenuItem>
                  <DropdownMenuItem onClick={abrirMover}><FolderInput className="h-4 w-4" />Mover</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.message('Modo de manutenção do produto — em breve.')}><Wrench className="h-4 w-4" />Manutenção</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={excluir}><Trash2 className="h-4 w-4" />Lixeira</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {podeEditar && (
              <Button onClick={publicar} disabled={pending}
                title={aoVivo ? 'O produto está publicado — as alterações vão ao ar para os alunos agora' : 'Salva as alterações — os alunos só veem quando o estado for "Publicado"'}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : aoVivo ? <Globe className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {aoVivo ? 'Publicar alterações' : 'Salvar alterações'}
              </Button>
            )}
          </div>
        </div>

        {/* Abas sublinhadas */}
        <div className="flex gap-4 overflow-x-auto border-b">
          {abas.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => trocarAba(k)}
              className={cn('-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
                aba === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {label}
              {n !== null && <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] tabular-nums', aba === k ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{n}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Corpo da aba */}
      {aba === 'informacoes' && (
        <AbaInformacoes
          produto={produto} instrutores={instrutores} resumo={resumo} podeEditar={podeEditar}
          criadoEm={criadoEm} atualizadoEm={atualizadoEm} mesmoNome={mesmoNome}
          onIrConteudos={() => trocarAba('conteudos')} onIrGrupos={() => trocarAba('grupos')}
          onDuplicar={() => setDuplicar(true)} onMover={abrirMover} onExcluir={excluir}
          onManutencao={() => toast.message('Modo de manutenção do produto — em breve.')}
          registerPublicar={(fn) => { publicarRef.current = fn }}
        />
      )}
      {visitadas.has('conteudos') && (
        <div hidden={aba !== 'conteudos'}><AbaConteudos tipoProduto={produto.tipo} produtoId={produto.id} podeEditar={podeEditar} tenantId={tenantId} /></div>
      )}
      {visitadas.has('vitrine') && (
        <div hidden={aba !== 'vitrine'}><AbaVitrine produtoId={produto.id} secoesIniciais={produto.secoes} podeEditar={podeEditar} /></div>
      )}
      {visitadas.has('grupos') && (
        <div hidden={aba !== 'grupos'}><AbaGrupos produtoId={produto.id} podeEditar={podeEditar} /></div>
      )}
      {visitadas.has('visibilidade') && (
        <div hidden={aba !== 'visibilidade'}><AbaVisibilidade produtoId={produto.id} produtoNome={produto.nome} podeEditar={podeEditar} /></div>
      )}

      {mover && arvore !== null && <MoverDialog open onClose={() => setMover(false)} arvore={arvore} alvo={{ kind: 'produto', id: produto.id, nome: produto.nome }} onMovido={() => router.refresh()} />}
      {duplicar && <DuplicarProdutoDialog open onClose={() => setDuplicar(false)} produto={{ id: produto.id, nome: produto.nome }} onDuplicado={(id) => router.push(`/admin/conteudos/produtos/${id}`)} />}
    </div>
  )
}
