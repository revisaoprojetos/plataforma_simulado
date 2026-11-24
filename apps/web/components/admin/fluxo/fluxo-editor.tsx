'use client'

// EDITOR DE FLUXO GENÉRICO (tela cheia, estilo editor): seletor de diagramas à esquerda, canvas React Flow no centro e painel direito recolhível
// (Propriedades | Verificação | Simular). Nada aqui conhece um domínio: tudo vem de `DadosFluxo` (adaptador). Camada do usuário (overlay) mesclada sobre o grafo base.
// Sem a tabela do overlay: modo construir em RASCUNHO LOCAL (não persistido). Se o canvas falhar, cai no SVG simples (LimiteErro).
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AbasLinhaControlada } from '@/components/ui/abas-linha'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { DadosFluxo, TipoNo } from '@/lib/admin/fluxo/adaptador'
import {
  adicionarNo, ajustarNoBase, conectar, criarDiagrama, desfazer, duplicarNo, editarAresta, editarNoUsuario, empurrar, excluirDiagrama, hashOverlay, historicoVazio, mesclar, moverNo,
  normalizarOverlay, nosOcultos, overlayVazio, posicaoLivre, refazer, removerAresta, removerNo, renomearDiagrama, restaurarNoBase, type OverlayFluxo,
} from '@/lib/admin/fluxo/overlay'
import { validarGrafo } from '@/lib/admin/fluxo/grafo'
import { resumirNoUsuario } from '@/lib/admin/fluxo/resumo'
import { resumirVerificacao, type ItemVerificacao } from '@/lib/admin/fluxo/verificacao'
import { obterVersaoOverlayFluxo, salvarOverlayFluxo, verificarFluxoSistema } from '@/app/admin/fluxo/fluxo-actions'
import { EsqueletoFluxo } from './esqueleto-fluxo'
import { LimiteErro } from './limite-erro'
import { PainelNo } from './painel-no'
import { PainelAresta, PainelUsuario } from './painel-usuario'
import { PainelVerificacao } from './painel-verificacao'
import { BarraConstrutor } from './barra-construtor'
import { NavDiagramas } from './nav-diagramas'
import { AjudaFluxo } from './ajuda-fluxo'
import { QuadroSvg } from './quadro-svg'
import { EXTRAS } from './extras'

const Canvas = dynamic(() => import('./canvas-fluxo'), { ssr: false, loading: () => <EsqueletoFluxo className="h-full w-full" /> })
const TIPOS_LEGENDA: TipoNo[] = ['inicio', 'etapa', 'decisao', 'resultado', 'rejeicao', 'aberto']
type AbaPainel = 'props' | 'verif' | 'sim'
interface Verificado { itens: ItemVerificacao[]; geradoEm: string; hash: string }

export function FluxoEditor({ adaptadorId, titulo, dados }: { adaptadorId: string; titulo: string; dados: DadosFluxo }) {
  const cons = dados.construtor
  const router = useRouter()
  const [pend, start] = useTransition()
  const [ov, setOv] = useState<OverlayFluxo>(() => (cons ? normalizarOverlay(cons.overlay, cons.tiposNo) : overlayVazio()))
  const [hist, setHist] = useState(historicoVazio)
  const [salvoHash, setSalvoHash] = useState(() => hashOverlay(ov))
  const [construir, setConstruir] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aba, setAba] = useState(dados.diagramas[0]?.id ?? '')
  const [sel, setSel] = useState<string | null>(null)
  const [selAresta, setSelAresta] = useState<string | null>(null)
  const [caminho, setCaminho] = useState<string[] | null>(null)
  const [painel, setPainel] = useState<AbaPainel>('props')
  const [painelAberto, setPainelAberto] = useState(true)
  const [verif, setVerif] = useState<Verificado | null>(null)
  const [verPend, setVerPend] = useState(false)
  const [foco, setFoco] = useState<{ id: string; n: number } | null>(null)
  const [focarTitulo, setFocarTitulo] = useState(0)
  const [navRecolhido, setNavRecolhido] = useState(false)
  const contFoco = useRef(0)

  const extras = dados.extras ?? []
  const diagramas = useMemo(() => mesclar(dados.diagramas, ov), [dados.diagramas, ov])
  const marcados = useMemo<ReadonlySet<string>>(() => new Set(caminho ?? []), [caminho])
  const editaveis = useMemo<ReadonlySet<string>>(() => new Set(Object.keys(dados.edicao)), [dados.edicao])
  const atual = diagramas.find((d) => d.id === aba) ?? diagramas[0]
  const no = useMemo(() => atual?.nos.find((n) => n.id === sel) ?? null, [atual, sel])
  const aresta = useMemo(() => atual?.arestas.find((a) => a.id === selAresta) ?? null, [atual, selAresta])
  const usuario = useMemo(() => (no ? ov.nos.find((n) => n.id === no.id) ?? null : null), [no, ov.nos])
  const hashAtual = useMemo(() => hashOverlay(normalizarOverlay(ov, cons?.tiposNo)), [ov, cons?.tiposNo])
  const sujo = hashAtual !== salvoHash
  const problemas = useMemo(() => validarGrafo(diagramas), [diagramas])
  const ocultos = useMemo(() => nosOcultos(dados.diagramas, ov), [dados.diagramas, ov])
  const verifAtual = verif && verif.hash === hashAtual ? verif : null
  const porNo = useMemo(() => {
    const m: Record<string, 'erro' | 'aviso'> = {}
    const marcar = (id: string | undefined, nivel: 'erro' | 'aviso') => { if (id && m[id] !== 'erro') m[id] = nivel }
    for (const p of problemas) if (p.diagrama === atual?.id) marcar(p.noId, p.nivel)
    for (const i of verifAtual?.itens ?? []) if (i.diagrama === atual?.id && i.severidade !== 'info') marcar(i.noId, i.severidade)
    return m
  }, [problemas, verifAtual, atual?.id])
  const resumos = useMemo(() => Object.fromEntries(ov.nos.filter((n) => n.diagrama === atual?.id).flatMap((n) => { const r = resumirNoUsuario(n, cons?.catalogo ?? null); return r ? [[n.id, r]] : [] })), [ov.nos, atual?.id, cons?.catalogo])
  const alertas = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of problemas) m[p.diagrama] = (m[p.diagrama] ?? 0) + 1
    for (const i of verifAtual?.itens ?? []) if (i.diagrama && i.severidade !== 'info') m[i.diagrama] = (m[i.diagrama] ?? 0) + 1
    return m
  }, [problemas, verifAtual])
  const contagem = useMemo(() => {
    if (verifAtual) { const r = resumirVerificacao(verifAtual.itens); return { erros: r.erros, avisos: r.avisos } }
    return { erros: problemas.filter((p) => p.nivel === 'erro').length, avisos: problemas.filter((p) => p.nivel === 'aviso').length }
  }, [verifAtual, problemas])

  const podeConstruir = !!cons && dados.podeEditar
  const persistente = !!cons?.habilitado
  const emConstrucao = construir && podeConstruir

  const onCaminho = useCallback((ids: string[] | null) => setCaminho(ids), [])
  const irPara = useCallback((id: string) => { setAba(id); setSel(null); setSelAresta(null) }, [])

  // ── mutações do overlay (com histórico de desfazer) ──
  const mutar = useCallback((fn: (o: OverlayFluxo) => OverlayFluxo) => { setHist((h) => empurrar(h, ov)); setOv(fn(ov)) }, [ov])
  const desfazerAcao = useCallback(() => { const r = desfazer(hist, ov); if (r) { setHist(r.h); setOv(r.overlay) } }, [hist, ov])
  const refazerAcao = useCallback(() => { const r = refazer(hist, ov); if (r) { setHist(r.h); setOv(r.overlay) } }, [hist, ov])

  const duplicarPorId = useCallback((id: string) => {
    const n = atual?.nos.find((k) => k.id === id)
    if (!n || !atual) return
    const r = duplicarNo(ov, n, atual.id)
    if (!r.id) { toast.error('Limite de nós atingido.'); return }
    setHist((h) => empurrar(h, ov)); setOv(r.overlay); setSel(r.id); setSelAresta(null)
  }, [atual, ov])
  const editarPorId = useCallback((id: string) => { setSel(id); setSelAresta(null); setPainel('props'); setPainelAberto(true); setFocarTitulo((c) => c + 1) }, [])

  useEffect(() => {
    if (!emConstrucao) return
    const h = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) refazerAcao(); else desfazerAcao() }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); refazerAcao() }
      else if ((e.ctrlKey || e.metaKey) && k === 'd' && sel) { e.preventDefault(); duplicarPorId(sel) }
      else if (e.key === 'Escape') { setSel(null); setSelAresta(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [emConstrucao, desfazerAcao, refazerAcao, duplicarPorId, sel])
  useEffect(() => {
    if (!sujo) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sujo])

  const verificar = useCallback(() => {
    setVerPend(true)
    const hash = hashAtual
    verificarFluxoSistema(adaptadorId, ov).then((r) => {
      if (!r.ok) { toast.error(r.error); return }
      setVerif({ itens: r.itens, geradoEm: r.geradoEm, hash })
    }).catch(() => toast.error('Não foi possível verificar agora.')).finally(() => setVerPend(false))
  }, [adaptadorId, ov, hashAtual])
  // primeira abertura da aba Verificação roda sozinha
  useEffect(() => { if (painel === 'verif' && painelAberto && !verif && !verPend && cons) verificar() }, [painel, painelAberto, verif, verPend, cons, verificar])

  if (!atual) return <p className="text-sm text-muted-foreground">Nenhum diagrama disponível.</p>

  const adicionar = (tipo: TipoNo, x: number, y: number) => { const r = adicionarNo(ov, tipo, atual.id, x, y); if (!r.id) { toast.error('Limite de nós atingido.'); return }; setHist((h) => empurrar(h, ov)); setOv(r.overlay); setSel(r.id); setSelAresta(null); setPainel('props'); setPainelAberto(true) }
  const aoMover = (id: string, x: number, y: number) => {
    const n = atual.nos.find((k) => k.id === id)
    if (n && Math.abs((n.x ?? 0) - x) < 1 && Math.abs((n.y ?? 0) - y) < 1) return
    mutar((o) => moverNo(o, id, x, y))
  }
  const aoConectar = (de: string, para: string) => {
    const saidas = atual.arestas.filter((a) => a.de === de)
    const origem = atual.nos.find((n) => n.id === de)
    const rotulo = origem && (origem.tipo === 'decisao' || origem.tipo === 'condicao') ? (saidas.some((a) => a.rotulo === 'sim') ? (saidas.some((a) => a.rotulo === 'não') ? '' : 'não') : 'sim') : ''
    const r = conectar(ov, atual.id, de, para, rotulo)
    if (!r.id) { toast.error('Conexão inválida ou duplicada.'); return }
    setHist((h) => empurrar(h, ov)); setOv(r.overlay)
  }
  const aoRemover = (ids: string[], arestas: string[]) => {
    mutar((o) => {
      let n = o
      for (const id of ids) n = removerNo(n, id)
      for (const id of arestas) if (atual.arestas.some((a) => a.id === id)) n = removerAresta(n, id)
      return n
    })
    setSel(null); setSelAresta(null)
  }
  const salvar = () => start(async () => {
    if (!persistente) return
    const enviar = (c: boolean) => salvarOverlayFluxo(adaptadorId, ov, cons?.versao ?? 0, motivo, c)
    let r = await enviar(false)
    if (!r.ok && r.confirmar) {
      const ok = await confirmar({ titulo: r.confirmar.titulo, mensagem: r.confirmar.mensagem, confirmar: 'Salvar mesmo assim', destrutivo: true })
      if (!ok) return
      r = await enviar(true)
    }
    if (!r.ok) {
      toast.error(r.conflito ? 'O fluxo mudou desde que você abriu. Recarregamos; refaça a alteração.' : r.error)
      if (r.conflito) router.refresh()
      return
    }
    toast.success(`Fluxo salvo (versão ${r.versao}).`)
    r.avisos.slice(0, 5).forEach((a) => toast.message(a))
    setOv(r.overlay); setSalvoHash(hashOverlay(r.overlay)); setHist(historicoVazio()); setMotivo(''); setVerif(null)
    router.refresh()
  })
  const carregarVersao = (versao: number) => start(async () => {
    const r = await obterVersaoOverlayFluxo(adaptadorId, versao)
    if (!r.ok) { toast.error(r.error); return }
    setHist((h) => empurrar(h, ov)); setOv(r.overlay)
    toast.success(`Versão ${versao} carregada no rascunho. Revise e salve para restaurar.`)
  })
  const descartar = async () => {
    if (!(await confirmar({ titulo: 'Descartar alterações?', mensagem: persistente ? 'O rascunho volta para a última versão salva.' : 'O rascunho local volta ao fluxo original.', confirmar: 'Descartar', destrutivo: true }))) return
    const base = cons ? normalizarOverlay(cons.overlay, cons.tiposNo) : overlayVazio()
    setOv(base); setSalvoHash(hashOverlay(base)); setHist(historicoVazio()); setSel(null); setSelAresta(null)
  }
  const excluirDiag = async () => {
    if (!(await confirmar({ titulo: `Excluir “${atual.titulo}”?`, mensagem: 'Os nós e conexões deste diagrama serão removidos do rascunho (dá para desfazer antes de salvar).', confirmar: 'Excluir', destrutivo: true }))) return
    mutar((o) => excluirDiagrama(o, atual.id)); setAba(dados.diagramas[0]?.id ?? ''); setSel(null)
  }
  const focar = (i: ItemVerificacao) => {
    if (i.diagrama) setAba(i.diagrama)
    setSelAresta(null)
    const alvo = i.noId ? diagramas.find((d) => d.id === (i.diagrama ?? atual.id))?.nos.find((n) => n.id === i.noId) : null
    if (alvo) { setSel(alvo.id); contFoco.current += 1; setFoco({ id: alvo.id, n: contFoco.current }); setPainel('props'); setPainelAberto(true) } else setSel(null)
  }
  const selecionarDiagrama = (id: string) => { irPara(id) }
  const alternarPainel = (a: AbaPainel) => { setPainel(a); setPainelAberto(true) }

  const mostrarPainelValores = !!no && !!dados.edicao[no.id]
  const abasPainel = [
    { valor: 'props' as const, label: 'Propriedades' },
    { valor: 'verif' as const, label: 'Verificação', badge: contagem.erros + contagem.avisos > 0 ? contagem.erros + contagem.avisos : undefined },
    ...(extras.length ? [{ valor: 'sim' as const, label: 'Simular' }] : []),
  ]
  const legenda = TIPOS_LEGENDA.concat(cons?.tiposNo.filter((t) => !TIPOS_LEGENDA.includes(t)) ?? [])

  return (
    <div className="flex w-full flex-col gap-3 lg:h-[calc(100dvh-10rem)] lg:min-h-[560px]" aria-label={titulo}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <NavDiagramas diagramas={diagramas} atualId={atual.id} marcados={marcados} onSelecionar={selecionarDiagrama} construir={emConstrucao} alertas={alertas} recolhido={navRecolhido} onRecolher={() => setNavRecolhido((v) => !v)}
          onNovo={(t) => { const r = criarDiagrama(ov, t); if (!r.id) { toast.error('Limite de diagramas atingido.'); return }; setHist((h) => empurrar(h, ov)); setOv(r.overlay); setAba(r.id) }}
          onRenomear={(t) => mutar((o) => renomearDiagrama(o, atual.id, t))} onExcluir={excluirDiag} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{atual.titulo}</h2>
              <p className="truncate text-xs text-muted-foreground" title={atual.resumo}>{atual.resumo}</p>
            </div>
            <AjudaFluxo tipos={legenda} />
          </div>
      {cons && (
        <BarraConstrutor cons={cons} podeConstruir={podeConstruir} persistente={persistente} construir={emConstrucao} onAlternar={() => setConstruir((v) => !v)} sujo={sujo} pendente={pend}
          podeDesfazer={hist.passado.length > 0} podeRefazer={hist.futuro.length > 0} onDesfazer={desfazerAcao} onRefazer={refazerAcao}
          onAdicionar={(t) => { const p = posicaoLivre(atual); adicionar(t, p.x, p.y) }}
          ocultos={ocultos} onRestaurar={(id) => mutar((o) => restaurarNoBase(o, id))}
          onVerificar={() => { alternarPainel('verif'); if (verif) verificar() }} contagem={contagem} onCarregarVersao={carregarVersao}
          motivo={motivo} onMotivo={setMotivo} onSalvar={salvar} onDescartar={descartar} />
      )}
        <div className="h-[65dvh] min-h-[420px] min-w-0 flex-1 lg:h-auto">
          <LimiteErro resetKey={atual.id} fallback={<div className="max-h-full overflow-auto"><QuadroSvg d={atual} sel={sel} onSel={setSel} marcados={marcados} /></div>}>
            <Canvas key={atual.id} diagrama={atual} sel={sel} onSel={setSel} selAresta={selAresta} onSelAresta={setSelAresta} marcados={marcados} editaveis={editaveis}
              construir={emConstrucao} resumos={resumos} problemas={porNo} onMover={aoMover} onConectar={aoConectar} onRemover={aoRemover} onSoltar={adicionar}
              tiposNo={cons?.tiposNo} onEditarNo={editarPorId} onDuplicarNo={duplicarPorId} foco={foco} refitKey={`${painelAberto}${navRecolhido}`} />
          </LimiteErro>
        </div>
        </div>

        <aside className={cn('flex shrink-0 flex-col overflow-hidden rounded-xl border bg-card', painelAberto ? 'lg:w-[22rem]' : 'lg:w-10')} aria-label="Painel lateral">
          <div className="flex items-center gap-1 border-b px-2 pt-1">
            <button type="button" onClick={() => setPainelAberto((v) => !v)} className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted lg:inline-flex" aria-label={painelAberto ? 'Recolher painel' : 'Expandir painel'} aria-expanded={painelAberto} title={painelAberto ? 'Recolher painel' : 'Expandir painel'}>
              {painelAberto ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            {painelAberto && <div className="min-w-0 flex-1"><AbasLinhaControlada valor={painel} onChange={(v) => setPainel(v)} itens={abasPainel} aria-label="Painel" /></div>}
          </div>
          {painelAberto && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2 lg:max-h-none max-h-[70dvh]">
              {painel === 'props' && (
                <>
                  {emConstrucao && no && cons && (
                    <PainelUsuario no={no} usuario={usuario} catalogo={cons.catalogo} executavel={cons.executavel} tiposNo={cons.tiposNo} focarTitulo={focarTitulo}
                      onEditar={(p) => mutar((o) => editarNoUsuario(o, no.id, p))} onAjusteBase={(p) => mutar((o) => ajustarNoBase(o, no.id, p))}
                      onDuplicar={() => duplicarPorId(no.id)} onRemover={() => aoRemover([no.id], [])} onFechar={() => setSel(null)} />
                  )}
                  {emConstrucao && aresta && aresta.id && (
                    <PainelAresta rotulo={aresta.rotulo ?? ''} origem={aresta.origem ?? 'base'} onRotulo={(r) => mutar((o) => editarAresta(o, aresta.id as string, r))} onRemover={() => aoRemover([], [aresta.id as string])} onFechar={() => setSelAresta(null)} />
                  )}
                  {no && (!emConstrucao || mostrarPainelValores) && <div className={cn(emConstrucao && 'mt-3 border-t pt-3')}><PainelNo key={no.id} adaptadorId={adaptadorId} no={no} dados={dados} onFechar={() => setSel(null)} /></div>}
                  {!no && !(emConstrucao && aresta) && (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      {emConstrucao
                        ? 'Arraste um tipo da paleta para o canvas, ligue nós pelas alças, dê duplo clique para editar o título ou clique com o botão direito para o menu. Delete remove o selecionado. Veja “?” para todos os atalhos.'
                        : `Clique em uma etapa do fluxograma para ler${dados.podeEditar ? ' e editar os valores' : ''} (lápis = editável).${podeConstruir ? ' Use “Construir” para mover, adicionar e editar nós.' : ''}`}
                    </p>
                  )}
                </>
              )}
              {painel === 'verif' && (cons
                ? <PainelVerificacao itens={verif?.itens ?? null} geradoEm={verif?.geradoEm ?? null} pendente={verPend} desatualizado={!!verif && !verifAtual} onVerificar={verificar} onFocar={focar} />
                : <p className="p-2 text-xs text-muted-foreground">Verificação indisponível neste fluxo.</p>)}
              {painel === 'sim' && extras.map((nome) => { const X = EXTRAS[nome]; return X ? <X key={nome} onCaminho={onCaminho} irPara={irPara} /> : null })}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
