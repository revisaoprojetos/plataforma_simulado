'use client'

// LEITOR DA BIBLIOTECA — HOST. Usa LITERALMENTE o leitor do Jurisprudência (public/leitura/leitor-jus.html,
// iframe): mesma top bar, barra de grifos, sumário, caderno, foco — tudo real e compartilhado. O CONTEÚDO
// de leitura é o PDF FIEL (o mesmo do editor), renderizado DENTRO do #article do leitor (canvas + camada de
// texto), e o motor de grifos do Juris opera sobre ele. Aqui o host só faz o handshake + a persistência dos
// grifos por aluno:
//   1) carrega os metadados do PDF (nº de páginas + tamanhos) e manda { type:'leitor-jus-day', cfg:{ modo,
//      pdf, grifos, ... } } quando o iframe avisa 'leitor-jus-ready';
//   2) a cada mudança o iframe manda 'leitor-jus-grifos' → reconciliamos com /api/conteudo/grifo-pdf.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import type { GrifoPdf } from '@/lib/conteudo/leitor'
import { APP_VERSION } from '@/lib/version'
import { prepararHtmlLegproc } from '@/lib/leitura/legproc-caixas'
import { DestinoCadernoDialog } from '@/components/aluno/cadernos/destino-caderno-dialog'
import { SalvarComentarioCaderno, normalizarComentarioCaderno, postarItemCaderno, type ComentarioParaCaderno } from '@/components/aluno/cadernos/salvar-comentario-caderno'
import { AvisoSaidaCaderno, type PendentesResumo } from '@/components/aluno/cadernos/aviso-saida-caderno'
import {
  carregarCadernos, carregarDestinos, salvarDestino, resumoSalvos, limparSalvos, DESTINOS_VAZIOS,
  type CadernoLista, type Destino, type Destinos, type ResumoCaderno,
} from '@/lib/aluno/cadernos-cliente'
import { R } from '@/lib/nova/rotas'

// LEITOR_REV: sobe a cada mudança no leitor-jus.html que precisa chegar SEM esperar a próxima versão do app (o ?v= só muda no deploy).
const LEITOR_REV = 'lp71'
const PROTOTIPO = `/leitura/leitor-jus.html?v=${APP_VERSION}&r=${LEITOR_REV}`
const LARGURA_ALVO = 820 // largura de referência p/ a escala do PDF (host e iframe usam a MESMA)
// Worker do pdf.js = BUILD LEGACY em public/pdf (o mesmo que o iframe usa). O build "moderno" do pdf.js 6
// exige Promise.withResolvers / Map.getOrInsertComputed / Math.sumPrecise… → no Safari do iPhone/iPad e
// em tablets Android com Chrome antigo ele quebrava AQUI, o erro era engolido, o "dia" nunca era enviado e o
// leitor abria SEM conteúdo. ?v= força baixar de novo (o Service Worker serve .mjs cache-first).
const PDFJS_WORKER = '/pdf/pdf.worker.min.mjs?v=6.2.108-legacy'
const TIMEOUT_PDF_MS = 45000 // celular em rede lenta: depois disso mostra o erro (com "tentar de novo")
// A legenda de CATEGORIAS do leitor (Núcleo/Prazos/STF/STJ/Equipe…) é específica do LegProc e NÃO se
// aplica a documentos da Biblioteca (PDFULL/Fight/etc.). Por isso nasce OCULTA (todas as chaves "off");
// o admin pode religar por documento (mostrarLegenda → legendasOff=[]). Esconder todas também remove o
// rótulo "LEGENDA" e o botão "Legenda" no leitor (ver aplicarCfgLegendas no leitor-jus.html).
const LEGENDAS_TODAS = ['nucleo', 'complemento', 'prazo', 'crucial', 'excecao', 'stf', 'stj', 'equipe']

type Rect = { x0: number; y0: number; x1: number; y1: number }
interface GrifoEngine { id: string; sec: string; rects: Rect[]; t: string; c: string; note: string; text: string }

const aEngine = (g: GrifoPdf): GrifoEngine => ({ id: g.id, sec: 'p' + g.pagina, rects: g.rects, t: g.tool, c: g.cor, note: g.nota || '', text: g.texto || '' })
const hashGrifo = (g: GrifoEngine) => `${g.sec}|${JSON.stringify(g.rects)}|${g.t}|${g.c}|${g.note}`
// Chave de GEOMETRIA (sem cor/nota): se só cor/nota mudou, usamos PATCH em vez de apagar+recriar (evita
// perder o grifo numa falha parcial de rede).
const geoGrifo = (g: GrifoEngine) => `${g.sec}|${JSON.stringify(g.rects)}|${g.t}`

/** Grifo do modo TEXTO (LegProc): âncora = trecho (uid) + offsets no trecho. */
interface GrifoTexto { id: string; pid: string; s: number; e: number; t: string; c: string; note: string; sec: string; text: string }
const hashTexto = (g: GrifoTexto) => `${g.pid}|${g.s}|${g.e}|${g.t}|${g.c}|${g.note}`
const geoTexto = (g: GrifoTexto) => `${g.pid}|${g.s}|${g.e}`

export type ParteCrono = { id: string; i: number; f: number; r: string }

export function LeitorBiblioteca({
  documentoId, versaoId, titulo, pdfUrl, texto, grifos: iniciais, voltarHref = '/aluno/biblioteca', paginaInicial = 1, paginaMinima = 1,
  partesCrono = [], metaCrono = '', tempoBase = 0, tempoDeterminadoSeg = 0, mostrarLegenda = false, marca, video,
  semProgresso = false, posicaoInicialPct = 0, versaoTag, atualizacoes,
}: {
  /** Selo de versão ao fim do título na barra superior (ex.: 'v3') + tooltip (última atualização publicada). */
  versaoTag?: { texto: string; titulo: string } | null
  /** Aba lateral 'Atualizações' (carregada sob demanda pelo iframe): doc + indicador de novidade recente (calculado no servidor). */
  atualizacoes?: { documentoId: string; recente: boolean; ultimaEm: string | null } | null
  /** NÃO grava progresso de leitura (preview/admin/impersonation). Padrão false = grava. */
  semProgresso?: boolean
  /** Texto/LegProc: % de rolagem (0..100) onde o aluno parou, para retomar. */
  posicaoInicialPct?: number
  /** Vídeo da leitura (faixa recolhível acima da folha). */
  video?: { kind: 'embed' | 'file'; url: string; titulo: string } | null
  /** Identidade da empresa (logo clara + nome) exibida na barra do leitor. */
  marca?: { logo: string | null; nome: string }
  documentoId: string; versaoId: string; titulo: string; pdfUrl: string | null
  /** Documento LegProc: lê em TEXTO (HTML rico) com STF/STJ recolhíveis, em vez do PDF fiel. */
  texto?: { html: string; grifos: GrifoTexto[]; ocultarLegendaTabela?: boolean; modeloJuris?: boolean }
  grifos: GrifoPdf[]; voltarHref?: string; paginaInicial?: number; paginaMinima?: number
  partesCrono?: ParteCrono[]; metaCrono?: string; tempoBase?: number
  /** Tempo DETERMINADO da meta (planejado, segundos) → contagem regressiva no leitor; 0 = sem. */ tempoDeterminadoSeg?: number
  /** Religar a legenda de categorias (LegProc) neste doc. Padrão false = oculta na Biblioteca. */ mostrarLegenda?: boolean
}) {
  const router = useRouter()
  // CRONÔMETRO DA META (cronograma): conta o tempo de leitura DENTRO do leitor. Começa ao abrir a meta,
  // acumula sobre o tempo já registrado (tempoBase) e, ao sair/concluir, grava o tempo da sessão na meta
  // (API acao:'tempo' → somarTempoMeta). sessionStart reseta a cada gravação p/ não contar em dobro.
  const sessaoIni = useRef<number>(metaCrono ? Date.now() : 0)
  const [sessSeg, setSessSeg] = useState(0)
  const [paraCaderno, setParaCaderno] = useState<ComentarioParaCaderno | null>(null)
  // Badge "Tempo nesta meta": o iframe (Pomodoro) decide se aparece — 'meta' mostra, 'pomodoro' oculta.
  const [usarBadgeMeta, setUsarBadgeMeta] = useState(true)
  useEffect(() => {
    if (!metaCrono) return
    sessaoIni.current = Date.now(); setSessSeg(0)
    const t = setInterval(() => setSessSeg(Math.max(0, Math.round((Date.now() - sessaoIni.current) / 1000))), 1000)
    return () => clearInterval(t)
  }, [metaCrono])
  const salvarTempo = useCallback(() => {
    if (!metaCrono || !sessaoIni.current) return
    const seg = Math.max(0, Math.round((Date.now() - sessaoIni.current) / 1000))
    sessaoIni.current = Date.now() // reseta a âncora (evita contar o mesmo intervalo duas vezes)
    if (seg < 2) return
    try {
      fetch('/api/aluno/cronograma/adaptativo', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', keepalive: true,
        body: JSON.stringify({ acao: 'tempo', metaId: metaCrono, segAdd: seg }),
      }).catch(() => {})
    } catch { /* best-effort */ }
  }, [metaCrono])
  // Navega de volta (ou para a origem da meta) com a LINHA DE CARREGAMENTO acesa — client nav (SPA),
  // sem reload branco; o destino (cronograma) ainda mostra a animação de entrada. Grava o tempo antes de sair.
  const sairAgora = useCallback((href: string) => {
    salvarTempo(); limparSalvos()
    try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* ignore */ }
    router.push(href)
  }, [router, salvarTempo])
  // AVISO DE SAÍDA (in-app, sem beforeunload): antes de sair, descarrega as pendências (grifos/cadernos em voo) e,
  // se nesta leitura houve salvamentos em cadernos, mostra o resumo. "Continuar saindo" = 1 clique (forcar).
  const [saida, setSaida] = useState<{ href: string; resumo: ResumoCaderno[]; pendentes: ComentarioParaCaderno[] } | null>(null)
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const pendentesRef = useRef<() => Promise<ComentarioParaCaderno[]>>(async () => [])
  const irPara = useCallback((href: string, forcar = false) => {
    void (async () => {
      let pend: ComentarioParaCaderno[] = []
      try { await flushRef.current(); pend = await pendentesRef.current() } catch { /* best-effort: nunca prende a saída */ }
      const r = resumoSalvos()
      if (!forcar && (r.length || pend.length)) { setSaida({ href, resumo: r, pendentes: pend }); return }
      sairAgora(href)
    })()
  }, [sairAgora])
  // Rede de segurança: se fechar a aba/atualizar sem concluir, ainda grava o tempo da sessão.
  useEffect(() => {
    const h = () => salvarTempo()
    window.addEventListener('pagehide', h); window.addEventListener('beforeunload', h)
    return () => { window.removeEventListener('pagehide', h); window.removeEventListener('beforeunload', h) }
  }, [salvarTempo])
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // PROGRESSO DE LEITURA (folha X de N ou % de rolagem) → POST /api/aluno/biblioteca/progresso.
  // O iframe manda 'leitor-jus-progresso'; aqui só guardamos o último valor e enviamos com debounce (20 s,
  // somente se mudou), com tempo acumulado apenas enquanto a aba está visível. Flush imediato por sendBeacon
  // em pagehide/visibilitychange. Falhas são silenciosas: nunca atrapalha a leitura.
  const prog = useRef<{ pagina: number | null; total: number | null; pct: number | null }>({ pagina: null, total: null, pct: null })
  const progSujo = useRef(false)
  const tempoAc = useRef(0)
  const progIds = useRef({ documentoId, versaoId }); progIds.current = { documentoId, versaoId }
  const semProg = useRef(semProgresso); semProg.current = semProgresso
  useEffect(() => {
    const montar = () => {
      const p = prog.current
      const inc = Math.min(600, Math.max(0, Math.round(tempoAc.current)))
      if (!progSujo.current && inc <= 0) return null
      if (p.pct == null && p.pagina == null && inc <= 0) return null
      const { documentoId: dId, versaoId: vId } = progIds.current
      const body: Record<string, unknown> = { documentoId: dId, versaoId: vId, tempoIncSeg: inc }
      if (p.pagina != null) { body.pagina = p.pagina; body.totalPaginas = p.total }
      if (p.pct != null) body.pct = p.pct
      tempoAc.current = Math.max(0, tempoAc.current - inc); progSujo.current = false
      return JSON.stringify(body)
    }
    const enviar = () => {
      if (semProg.current) return
      const body = montar(); if (!body) return
      try {
        fetch('/api/aluno/biblioteca/progresso', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', keepalive: true, body }).catch(() => {})
      } catch { /* best-effort */ }
    }
    const beacon = () => {
      if (semProg.current) return
      const body = montar(); if (!body) return
      try {
        if (!navigator.sendBeacon?.('/api/aluno/biblioteca/progresso', new Blob([body], { type: 'application/json' }))) {
          fetch('/api/aluno/biblioteca/progresso', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', keepalive: true, body }).catch(() => {})
        }
      } catch { /* best-effort */ }
    }
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data; if (!m || typeof m !== 'object' || m.type !== 'leitor-jus-progresso') return
      const pct = Number.isFinite(Number(m.pct)) ? Math.max(0, Math.min(100, Math.round(Number(m.pct)))) : null
      const pagina = Number.isFinite(Number(m.pagina)) && m.pagina != null ? Math.max(1, Math.trunc(Number(m.pagina))) : null
      const total = Number.isFinite(Number(m.total)) && m.total != null ? Math.max(1, Math.trunc(Number(m.total))) : null
      const a = prog.current
      if (a.pct === pct && a.pagina === pagina && a.total === total) return
      prog.current = { pagina, total, pct }; progSujo.current = true
    }
    const tick = setInterval(() => { if (document.visibilityState === 'visible') tempoAc.current += 1 }, 1000)
    const save = setInterval(() => { if (document.visibilityState === 'visible') enviar() }, 20000)
    const onVis = () => { if (document.visibilityState === 'hidden') beacon() }
    window.addEventListener('message', onMsg)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', beacon)
    return () => {
      clearInterval(tick); clearInterval(save)
      window.removeEventListener('message', onMsg)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', beacon)
      enviar() // troca de rota dentro do app (SPA): grava o que faltou
    }
  }, [])
  const { setTheme } = useTheme()
  const setTemaRef = useRef(setTheme); setTemaRef.current = setTheme
  const [pdfMeta, setPdfMeta] = useState<{ url: string; scale: number; pages: { w: number; h: number }[] } | null>(null)
  // Falha ao abrir o PDF → tela de erro (antes: falha silenciosa = leitor vazio, sem saber o porquê).
  const [erroPdf, setErroPdf] = useState<string | null>(pdfUrl || texto ? null : 'sem-pdf')
  const [tentativa, setTentativa] = useState(0)
  const enviados = useRef(new Map<string, { serverId: string; hash: string; geo: string }>())
  const busy = useRef(false); const pendente = useRef<GrifoEngine[] | null>(null); const avisou = useRef(false)
  const dados = useRef({ documentoId, versaoId, titulo, voltarHref, paginaInicial, paginaMinima, partesCrono, metaCrono, mostrarLegenda, tempoDeterminadoSeg, tempoBase })
  dados.current = { documentoId, versaoId, titulo, voltarHref, paginaInicial, paginaMinima, partesCrono, metaCrono, mostrarLegenda, tempoDeterminadoSeg, tempoBase }

  const inflight = useRef(new Set<Promise<unknown>>())
  const enviadosT = useRef(new Map<string, { serverId: string; hash: string; geo: string }>())
  useEffect(() => {
    enviadosT.current.clear()
    for (const g of texto?.grifos ?? []) enviadosT.current.set(g.id, { serverId: g.id, hash: hashTexto(g), geo: geoTexto(g) })
  }, [texto])
  useEffect(() => {
    enviados.current.clear()
    for (const g of iniciais) { const e = aEngine(g); enviados.current.set(e.id, { serverId: g.id, hash: hashGrifo(e), geo: geoGrifo(e) }) }
  }, [iniciais])

  // carrega os metadados do PDF (nº de páginas + tamanho de cada uma na MESMA escala que o iframe usará)
  useEffect(() => {
    if (!pdfUrl) { if (!texto) setErroPdf('sem-pdf'); return }
    let vivo = true
    setErroPdf(null)
    const limite = setTimeout(() => { if (vivo) setErroPdf('O material demorou demais para carregar. Verifique sua conexão.') }, TIMEOUT_PDF_MS)
    ;(async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
        const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise
        if (!vivo) return
        const v1 = (await pdf.getPage(1)).getViewport({ scale: 1 })
        const scale = Math.max(0.8, Math.min(2, LARGURA_ALVO / v1.width))
        // Mede o tamanho de cada página em PARALELO (lotes de 16): o loop 1-a-1 (await por página)
        // segurava o 1º frame por centenas de ms em PDFs grandes. Em lotes é ordens de grandeza mais
        // rápido e continua limitado (não dispara N promises de uma vez em docs de 200+ páginas).
        const total = pdf.numPages
        const pages: { w: number; h: number }[] = new Array(total)
        const LOTE = 16
        for (let ini = 0; ini < total; ini += LOTE) {
          const fim = Math.min(ini + LOTE, total)
          const vps = await Promise.all(
            Array.from({ length: fim - ini }, (_, k) => pdf.getPage(ini + k + 1).then((p: any) => p.getViewport({ scale }))),
          )
          if (!vivo) return
          for (let k = 0; k < vps.length; k++) pages[ini + k] = { w: Math.round(vps[k].width), h: Math.round(vps[k].height) }
        }
        if (!vivo) return
        clearTimeout(limite)
        setPdfMeta({ url: pdfUrl, scale, pages }); setErroPdf(null) // chegou depois do timeout → some o aviso
      } catch (e: any) {
        clearTimeout(limite)
        if (!vivo) return
        const msg = String(e?.message || e || '')
        console.error('[leitor-biblioteca] falha ao abrir o PDF', e)
        setErroPdf(/is not a function|is not defined|Unexpected token|SyntaxError/i.test(msg)
          ? 'Seu navegador está desatualizado para o leitor. Atualize o navegador (ou o sistema) e tente de novo.'
          : /Missing PDF|Invalid PDF|InvalidPDF|corrupt/i.test(msg) ? 'O arquivo do material está corrompido. Avise o suporte.'
            : /40[13]|Unexpected server response|expired|Forbidden/i.test(msg) ? 'O link do material expirou. Toque em "Tentar de novo".'
              : 'Não foi possível abrir o material.')
      }
    })()
    return () => { vivo = false; clearTimeout(limite) }
  }, [pdfUrl, tentativa, texto])

  // HTML do modo texto processado UMA vez (caixas STF/STJ) — o iframe boota 1x e o "dia" pode ser reenviado.
  const htmlProc = useRef<string | null>(null)
  const htmlTexto = useCallback(() => {
    if (!texto) return ''
    if (htmlProc.current === null) htmlProc.current = prepararHtmlLegproc(texto.html, { juris: !!texto.modeloJuris })
    return htmlProc.current
  }, [texto])

  const enviarDia = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    if (!texto && pdfUrl && !pdfMeta) return // o leitor boota UMA vez → só manda o "dia" quando o PDF já está pronto
    const d = dados.current
    win.postMessage({
      type: 'leitor-jus-day', html: '',
      cfg: {
        modo: 'biblioteca', docKey: d.documentoId, titulo: d.titulo,
        pdf: texto ? null : pdfMeta ? { url: pdfMeta.url, scale: pdfMeta.scale, pages: pdfMeta.pages } : null,
        // LEGPROC (texto): HTML rico já com os entendimentos STF/STJ recolhíveis (lib da Lei Seca) + grifos por âncora de trecho.
        ...(texto ? { html: htmlTexto() } : {}),
        grifos: texto ? texto.grifos : iniciais.map(aEngine),
        caminho: ['Biblioteca', d.titulo], voltarHref: d.voltarHref, questoesHref: d.voltarHref,
        paginaInicial: d.paginaInicial || 1,
        posicaoPct: texto ? posicaoInicialPct || 0 : 0,
        paginaMinima: d.paginaMinima || 1, // 1ª página que entra na leitura (as anteriores não são montadas nem contadas)
        partes: d.partesCrono || [], metaAtual: d.metaCrono || '',
        marca: marca || null,
        video: video || null,
        versaoTag: versaoTag || null, atualizacoes: atualizacoes || null,
        modeloJuris: !!texto?.modeloJuris, // só os modelos de jurisprudência ganham o estilo próprio (títulos roxos, seções expansivas…)
        grifosRevisaoLigados: !!texto,
        ocultarLegendaDoc: !!texto && texto.ocultarLegendaTabela !== false, // tabela de legenda do início do doc (repete a barra de legendas)
        inclusosRevisao: !!texto, // botão "Inclusos Revisão" (tabelas / entendimentos / Já cobrado) — só no LegProc em texto
        grifoRevisaoOff: !texto, // LegProc (texto): mostra o botão "Grifos do Revisão" (marcações do professor no próprio texto)
        legendasOff: d.mostrarLegenda ? [] : LEGENDAS_TODAS,
        tempoDeterminadoSeg: d.tempoDeterminadoSeg || 0, tempoBaseSeg: d.tempoBase || 0,
      },
    }, '*')
  }, [pdfMeta, iniciais, pdfUrl, texto, htmlTexto, posicaoInicialPct, versaoTag, atualizacoes])

  const reconciliar = useCallback(async (grifos: GrifoEngine[]) => {
    if (busy.current) { pendente.current = grifos; return }
    busy.current = true
    const d = dados.current; const map = enviados.current
    let falhou = false
    const del = async (serverId: string) => {
      try { const r = await fetch('/api/conteudo/grifo-pdf?id=' + encodeURIComponent(serverId), { method: 'DELETE', credentials: 'same-origin' }); if (!r.ok) falhou = true } catch { falhou = true }
    }
    try {
      const atual = new Map(grifos.map((g) => [g.id, g]))
      // removidos no cliente → apaga no servidor
      for (const [cid, info] of [...map.entries()]) {
        if (!atual.has(cid)) { await del(info.serverId); map.delete(cid) }
      }
      for (const g of grifos) {
        if (!g.rects || !g.rects.length) continue
        const info = map.get(g.id); const h = hashGrifo(g); const geo = geoGrifo(g)
        if (info && info.hash === h) continue
        // só cor/nota mudou (mesma geometria) → PATCH: NÃO apaga/recria, então falha parcial não perde o grifo
        if (info && info.geo === geo) {
          try {
            const r = await fetch('/api/conteudo/grifo-pdf', {
              method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ id: info.serverId, cor: g.c, nota: g.note }),
            })
            if (r.ok) map.set(g.id, { serverId: info.serverId, hash: h, geo }); else falhou = true
          } catch { falhou = true }
          continue
        }
        // geometria nova ou alterada → apaga a antiga (se houver) e cria
        if (info) { await del(info.serverId); map.delete(g.id) }
        try {
          const r = await fetch('/api/conteudo/grifo-pdf', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ documento_id: d.documentoId, versao_id: d.versaoId, pagina: Number(g.sec.slice(1)) || 1, rects: g.rects, cor: g.c, tool: g.t, nota: g.note, texto: g.text }),
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && j?.id) map.set(g.id, { serverId: j.id, hash: h, geo }); else falhou = true
        } catch { falhou = true }
      }
    } finally {
      busy.current = false
      // Antes os erros eram 100% engolidos → o aluno achava que grifou mas sumia ao reabrir. Agora avisa 1x.
      if (falhou && !avisou.current) { avisou.current = true; toast.error('Não consegui salvar seus grifos agora. Verifique a conexão — eles podem não aparecer ao reabrir.') }
      if (!falhou) avisou.current = false
      if (pendente.current) { const p = pendente.current; pendente.current = null; void reconciliar(p) }
    }
  }, [])

  // Grifos do modo TEXTO → /api/conteudo/anotacao (âncora = trecho_uid + offsets). Grifo em bloco sem uid
  // (pid efêmero 'x…') não tem âncora estável no servidor: fica só na sessão.
  const busyT = useRef(false); const pendenteT = useRef<GrifoTexto[] | null>(null)
  const reconciliarTexto = useCallback(async (grifos: GrifoTexto[]) => {
    if (busyT.current) { pendenteT.current = grifos; return }
    busyT.current = true
    const d = dados.current; const map = enviadosT.current
    let falhou = false
    const json = { 'content-type': 'application/json' }
    const del = async (serverId: string) => {
      try { const r = await fetch('/api/conteudo/anotacao?id=' + encodeURIComponent(serverId), { method: 'DELETE', credentials: 'same-origin' }); if (!r.ok) falhou = true } catch { falhou = true }
    }
    try {
      const validos = grifos.filter((g) => g.pid && !g.pid.startsWith('x') && g.e > g.s && g.text)
      const atual = new Map(validos.map((g) => [g.id, g]))
      for (const [cid, info] of [...map.entries()]) {
        if (!atual.has(cid)) { await del(info.serverId); map.delete(cid) }
      }
      for (const g of validos) {
        const info = map.get(g.id); const h = hashTexto(g); const geo = geoTexto(g)
        if (info && info.hash === h) continue
        const conteudo = { tool: g.t, cor: g.c, nota: g.note }
        const tipo = g.t === 'st' ? 'riscado' : 'destaque'
        if (info && info.geo === geo) {
          try {
            const r = await fetch('/api/conteudo/anotacao', { method: 'PATCH', headers: json, credentials: 'same-origin', body: JSON.stringify({ id: info.serverId, tipo, conteudo }) })
            if (r.ok) map.set(g.id, { serverId: info.serverId, hash: h, geo }); else falhou = true
          } catch { falhou = true }
          continue
        }
        if (info) { await del(info.serverId); map.delete(g.id) }
        try {
          const r = await fetch('/api/conteudo/anotacao', {
            method: 'POST', headers: json, credentials: 'same-origin',
            body: JSON.stringify({ documento_id: d.documentoId, versao_id: d.versaoId, trecho_uid: g.pid, tipo, inicio_offset: g.s, fim_offset: g.e, texto_ancora: g.text, conteudo }),
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && j?.id) map.set(g.id, { serverId: j.id, hash: h, geo }); else falhou = true
        } catch { falhou = true }
      }
    } finally {
      busyT.current = false
      if (falhou && !avisou.current) { avisou.current = true; toast.error('Não consegui salvar seus grifos agora. Verifique a conexão — eles podem não aparecer ao reabrir.') }
      if (!falhou) avisou.current = false
      if (pendenteT.current) { const p = pendenteT.current; pendenteT.current = null; void reconciliarTexto(p) }
    }
  }, [])

  // ---- CADERNOS: destino padrão (Leitura/Questões), salvar grifo/anotação/comentário, "já salvo" ----
  // O host é dono dos dados (cadernos, destinos, itens já salvos) e fala com o iframe por postMessage.
  const cad = useRef({ cadernos: [] as CadernoLista[], destinos: DESTINOS_VAZIOS as Destinos, indisponivel: false, salvos: new Set<string>(), pronto: false })
  const cadCarregando = useRef<Promise<void> | null>(null)
  // cad é um ref: este contador espelha mudanças dele para re-renderizar o dialog de destino.
  const [, setCadVer] = useState(0)
  const bumpCad = useCallback(() => setCadVer((v) => v + 1), [])
  const [dstAberto, setDstAberto] = useState(false)
  const [dstCor, setDstCor] = useState<string | null>(null) // cor sólida da barra superior do leitor (vem do iframe)
  const cadUltimo = useRef(0) // timestamp do último carregamento completo (revalidação em segundo plano)
  const destSeq = useRef<Record<string, number>>({}) // anti respostas fora de ordem do salvarDestino
  const pendBruto = useRef<any[] | null>(null) // pendentes enviados pelo iframe no último flush
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const rastrear = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    inflight.current.add(p); const fim = () => { inflight.current.delete(p) }; p.then(fim, fim); return p
  }, [])
  useEffect(() => { limparSalvos() }, []) // o aviso de saída conta só esta sessão de leitura
  flushRef.current = async () => {
    // pede ao iframe que mande os grifos AGORA (ele faz debounce de 500 ms) e espera a reconciliação/POSTs em voo.
    pendBruto.current = null
    try { iframeRef.current?.contentWindow?.postMessage({ type: 'leitor-jus-flush' }, '*') } catch { /* ignore */ }
    await sleep(180)
    for (let i = 0; i < 8 && pendBruto.current === null && cad.current.pronto; i++) await sleep(100) // lista de pendentes do iframe
    const t0 = Date.now()
    while (Date.now() - t0 < 3000) {
      if (!(busy.current || busyT.current || pendente.current || pendenteT.current || inflight.current.size > 0)) return
      await sleep(120)
    }
  }
  /** ids locais (do motor do leitor) dos grifos que já estão salvos em algum caderno. */
  const idsLocaisSalvos = useCallback(() => {
    const out: string[] = []
    const mapa = texto ? enviadosT.current : enviados.current
    for (const [lid, info] of mapa) if (cad.current.salvos.has(info.serverId)) out.push(lid)
    return out
  }, [texto])
  const postarDestinos = useCallback(() => {
    const c = cad.current; if (!c.pronto) return
    try {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'leitor-jus-destinos', cadernos: c.cadernos.map((x) => ({ id: x.id, nome: x.nome, total: x.total })),
        destinos: c.destinos, indisponivel: c.indisponivel, salvos: idsLocaisSalvos(),
      }, '*')
    } catch { /* ignore */ }
  }, [idsLocaisSalvos])
  const carregarCad = useCallback((): Promise<void> => {
    if (cadCarregando.current) return cadCarregando.current
    cadCarregando.current = (async () => {
      const [cadernos, { destinos, indisponivel }, saved] = await Promise.all([
        carregarCadernos(), carregarDestinos(),
        fetch('/api/aluno/cadernos/item?documento_id=' + encodeURIComponent(documentoId), { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : { itens: [] })).catch(() => ({ itens: [] })),
      ])
      const c = cad.current
      c.cadernos = cadernos; c.destinos = destinos; c.indisponivel = indisponivel || !!saved?.indisponivel
      bumpCad()
      const itens: { grifo_ref: string | null; caderno_id: string }[] = Array.isArray(saved?.itens) ? saved.itens : []
      for (const i of itens) if (i.grifo_ref) c.salvos.add(i.grifo_ref)
      c.pronto = true; cadUltimo.current = Date.now()
      bumpCad()
      // Sinal na REABERTURA: este material já tem coisas salvas em cadernos (1x por sessão do navegador).
      if (itens.length > 0 && !c.indisponivel) {
        try {
          const k = 'cad:reabrir:' + documentoId
          if (!sessionStorage.getItem(k)) {
            sessionStorage.setItem(k, '1')
            const ids = [...new Set(itens.map((i) => i.caderno_id))]
            toast(`Neste material você já salvou ${itens.length === 1 ? '1 item' : `${itens.length} itens`} em ${ids.length === 1 ? 'um caderno' : 'cadernos'}.`, {
              action: { label: 'Ver no caderno', onClick: () => irPara(ids.length === 1 ? `/aluno/cadernos/${ids[0]}` : R.cadernos) },
            })
          }
        } catch { /* storage bloqueado */ }
      }
    })()
    return cadCarregando.current
  }, [documentoId, irPara, bumpCad])
  const aoSalvarCaderno = useCallback((caderno: { id: string; nome: string; total: number }, d: ComentarioParaCaderno) => {
    const c = cad.current
    c.cadernos = c.cadernos.some((x) => x.id === caderno.id) ? c.cadernos.map((x) => (x.id === caderno.id ? { ...x, total: caderno.total } : x)) : [caderno, ...c.cadernos]
    if (d.grifo_ref) c.salvos.add(d.grifo_ref)
    postarDestinos(); bumpCad()
  }, [postarDestinos, bumpCad])
  const definirDestino = useCallback(async (m: any) => {
    const ctx: 'leitura' | 'questoes' | null = m?.contexto === 'questoes' ? 'questoes' : m?.contexto === 'leitura' ? 'leitura' : null
    if (!ctx) return
    const c = cad.current
    const id = typeof m.caderno_id === 'string' && m.caderno_id ? m.caderno_id : null
    const novo: Destino = { caderno_id: id, salvar_sem_perguntar: !!id && m.salvar_sem_perguntar === true }
    const antes = c.destinos[ctx]
    c.destinos = { ...c.destinos, [ctx]: novo }
    postarDestinos(); bumpCad()
    const seq = (destSeq.current[ctx] = (destSeq.current[ctx] ?? 0) + 1)
    const r = await salvarDestino(ctx, novo)
    if (!r.ok && seq === destSeq.current[ctx]) { c.destinos = { ...c.destinos, [ctx]: antes }; toast.error(r.message || 'Não consegui salvar a preferência.'); postarDestinos(); bumpCad() }
  }, [postarDestinos, bumpCad])
  const criarCaderno = useCallback(async (m: any): Promise<boolean> => {
    const nome = typeof m?.nome === 'string' ? m.nome.trim().slice(0, 120) : ''
    if (!nome) return false
    try {
      const r = await fetch('/api/aluno/cadernos', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ nome }) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.caderno) { toast.error(j?.message || 'Não consegui criar o caderno agora.'); return false }
      const c = cad.current
      c.cadernos = [j.caderno, ...c.cadernos]
      const novo: Destino = { caderno_id: j.caderno.id, salvar_sem_perguntar: c.destinos.leitura.salvar_sem_perguntar }
      const antes = c.destinos.leitura
      c.destinos = { ...c.destinos, leitura: novo }
      postarDestinos(); bumpCad()
      const seq = (destSeq.current.leitura = (destSeq.current.leitura ?? 0) + 1)
      const sd = await salvarDestino('leitura', novo)
      if (sd.ok) toast.success(`Caderno “${j.caderno.nome}” criado e definido como destino da leitura`)
      else {
        toast.error(sd.message || 'Caderno criado, mas não consegui defini-lo como destino.')
        if (seq === destSeq.current.leitura) { c.destinos = { ...c.destinos, leitura: antes }; postarDestinos(); bumpCad() }
      }
      return true
    } catch { toast.error('Não consegui criar o caderno agora. Verifique a conexão.'); return false }
  }, [postarDestinos, bumpCad])
  /** Espera o grifo ganhar id no servidor (a reconciliação é assíncrona) — até 5 s. */
  const aguardarRef = useCallback(async (localId: string): Promise<string | null> => {
    const t0 = Date.now()
    for (;;) {
      const i = (texto ? enviadosT.current : enviados.current).get(localId)
      if (i) return i.serverId
      if (Date.now() - t0 > 5000) return null
      await sleep(200)
    }
  }, [texto])
  /** Payload pronto p/ o servidor a partir do que o iframe mandou (resolve grifo_ref/página). null = nada a salvar. */
  const montarPayload = useCallback(async (g: any): Promise<ComentarioParaCaderno | null> => {
    const d = dados.current; const c = cad.current
    const base = { documento_id: d.documentoId, documento_versao: null, titulo_documento: d.titulo || null }
    let payload: ComentarioParaCaderno | null = null
    if (g?.folha_sec) {
      payload = normalizarComentarioCaderno({ ...g, tipo: 'anotacao' }, base)
    } else {
      payload = normalizarComentarioCaderno(g, base)
      if (payload && !c.indisponivel) {
        if (typeof g.local_id === 'string') {
          const ref = await aguardarRef(g.local_id)
          if (ref) { payload.grifo_ref = ref; payload.ref_tabela = texto ? 'simulado_conteudo_anotacoes' : 'simulado_conteudo_grifos_pdf' }
        }
        if (!texto) { const pg = Number(String(g.sec || '').replace(/^p/, '')); payload.pagina = pg > 0 ? Math.trunc(pg) : null }
      }
    }
    if (!payload) return null
    if (c.indisponivel) {
      // Migração nova pendente: mantém o comportamento antigo (só comentário, sem colunas novas).
      if (payload.tipo !== 'comentario') return null
      payload = { ...payload, ref_tabela: null, pagina: null, rects: null, html: null, grifo_ref: null }
    }
    return payload
  }, [aguardarRef, texto])
  const tratarSalvarCaderno = useCallback(async (g: any) => {
    const c = cad.current
    const payload = await montarPayload(g)
    if (!payload) return
    const dest = c.destinos.leitura
    const cad0 = dest.caderno_id ? c.cadernos.find((x) => x.id === dest.caderno_id) : null
    if (cad0 && dest.salvar_sem_perguntar) {
      const r = await postarItemCaderno(payload, { caderno_id: cad0.id })
      if (r.ok) { if (!(g?.auto && payload.folha_sec)) toast.success(`Salvo em ${r.caderno.nome}`); aoSalvarCaderno(r.caderno, payload) } else toast.error(r.message)
      return
    }
    setParaCaderno(payload)
  }, [montarPayload, aoSalvarCaderno])
  // Pendentes da saída: o que o iframe diz não estar em caderno, menos o que o host já sabe salvo (grifo_ref).
  pendentesRef.current = async () => {
    const c = cad.current
    const bruto = pendBruto.current
    if (!c.pronto || c.indisponivel || !bruto?.length) return []
    const out: ComentarioParaCaderno[] = []
    for (const g of bruto.slice(0, 300)) {
      const p = await montarPayload(g)
      if (!p) continue
      if (p.grifo_ref && c.salvos.has(p.grifo_ref)) continue
      out.push(p)
    }
    return out
  }
  /** "Salvar no caderno e sair": grava em lote (um por vez). Falhou -> nao sai, avisa e mantem o aviso aberto. */
  const salvarPendentesESair = useCallback(async (alvo: { caderno_id: string } | { novo_nome: string }): Promise<boolean> => {
    const lista = saida?.pendentes ?? []
    let a = alvo; let feitos = 0; let nomeCad = ''
    for (const p of lista) {
      const r = await rastrear(postarItemCaderno(p, a))
      if (!r.ok) {
        toast.error(`${r.message}${feitos ? ` (${feitos} de ${lista.length} já salvos)` : ''}`)
        // tira da lista o que já foi salvo, p/ não duplicar numa nova tentativa
        setSaida((s) => (s ? { ...s, pendentes: s.pendentes.slice(feitos) } : s))
        return false
      }
      aoSalvarCaderno(r.caderno, p)
      a = { caderno_id: r.caderno.id }; nomeCad = r.caderno.nome; feitos++
    }
    if (feitos) toast.success(`${feitos === 1 ? '1 item salvo' : `${feitos} itens salvos`} em ${nomeCad}`)
    const h = saida?.href
    setSaida(null)
    if (h) sairAgora(h)
    return true
  }, [saida, rastrear, aoSalvarCaderno, sairAgora])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data; if (!m || typeof m !== 'object') return
      if (m.type === 'leitor-jus-ready') { enviarDia(); void carregarCad().then(postarDestinos); return }
      // O iframe reclama os cadernos enquanto o painel "Onde salvar" não foi inicializado (o 'ready' único podia se perder).
      if (m.type === 'leitor-jus-cad-pedir') {
        void carregarCad().catch(() => { cad.current.indisponivel = true; cad.current.pronto = true; cadCarregando.current = null }).then(postarDestinos)
        return
      }
      // Grifo / nota / folha de anotações → caderno: direto (destino padrão + "sem perguntar") ou pelo modal.
      if (m.type === 'leitor-jus-salvar-caderno') { void rastrear(tratarSalvarCaderno(m.grifo)); return }
      if (m.type === 'leitor-jus-pendentes') { pendBruto.current = Array.isArray(m.itens) ? m.itens : []; return }
      if (m.type === 'leitor-jus-destino-set') { void definirDestino(m); return }
      if (m.type === 'leitor-jus-criar-caderno') { void criarCaderno(m); return }
      if (m.type === 'leitor-jus-destino-abrir') {
        if (typeof m.cor === 'string' && /^(rgba?\([\d\s,.%\/]+\)|#[0-9a-fA-F]{3,8})$/.test(m.cor.trim())) setDstCor(m.cor.trim())
        setDstAberto(true)
        // revalida em segundo plano (sem esconder a lista atual) se passaram >30 s desde o último carregamento
        if (cad.current.pronto && Date.now() - cadUltimo.current > 30000) cadCarregando.current = null
        void carregarCad().catch(() => { if (!cad.current.pronto) { cad.current.indisponivel = true; cad.current.pronto = true }; cadCarregando.current = null }).then(() => { postarDestinos(); bumpCad() })
        return
      }
      if (m.type === 'leitor-jus-ver-cadernos') { irPara(R.cadernos); return }
      // Tema escolhido no leitor (Claro/Noite/Auto) → vale também para o portal e persiste ao voltar/avançar.
      if (m.type === 'leitor-jus-tema') { try { setTemaRef.current(m.tema === 'dark' ? 'dark' : m.tema === 'light' ? 'light' : 'system') } catch { /* ignore */ } return }
      if (m.type === 'leitor-jus-grifos') { const gs = Array.isArray(m.grifos) ? m.grifos : []; if (texto) void reconciliarTexto(gs); else void reconciliar(gs); return }
      // O aluno escolhe no Pomodoro qual cronômetro usar: 'meta' (badge aqui) ou 'pomodoro' (timer no iframe).
      // Mostra UM por vez. O tempo da meta continua sendo gravado sempre (independe da escolha).
      if (m.type === 'leitor-jus-cronometro') { setUsarBadgeMeta(m.mode === 'meta'); return }
      if (m.type === 'leitor-jus-nav') {
        const meta = dados.current.metaCrono
        // "Concluir leitura" (topo, to='questoes') numa meta do cronograma → finaliza a meta e volta.
        // "Voltar" (to='voltar') e leitura normal da Biblioteca → só volta, sem concluir.
        if (m.to === 'questoes' && meta) {
          void (async () => {
            try {
              await fetch('/api/aluno/cronograma/adaptativo', {
                method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify({ acao: 'meta', metaId: meta, patch: { estado: 'done' } }),
              })
              toast.success('Meta concluída!')
            } catch { /* mesmo se falhar, volta; o aluno pode concluir pelo cartão do cronograma */ }
            irPara(dados.current.voltarHref)
          })()
        } else { irPara(dados.current.voltarHref) }
        return
      }
      // "Concluir meta" numa divisória de parte → conclui a meta no Cronograma Adaptativo (plano fixado).
      if (m.type === 'leitor-jus-crono-concluir' && typeof m.metaId === 'string') {
        const metaId = m.metaId
        void (async () => {
          try {
            const r = await fetch('/api/aluno/cronograma/adaptativo', {
              method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ acao: 'meta', metaId, patch: { estado: 'done' } }),
            })
            // Concluiu → já volta para onde a meta foi acessada (cronograma), com a linha de carregamento.
            if (r.ok) { toast.success('Meta concluída!'); irPara(dados.current.voltarHref) }
            else { toast.error('Não consegui concluir a meta agora.'); iframeRef.current?.contentWindow?.postMessage({ type: 'leitor-jus-crono-erro', metaId }, '*') }
          } catch { toast.error('Não consegui concluir a meta agora.'); iframeRef.current?.contentWindow?.postMessage({ type: 'leitor-jus-crono-erro', metaId }, '*') }
        })()
        return
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarDia, reconciliar, reconciliarTexto, irPara, texto, carregarCad, postarDestinos, tratarSalvarCaderno, definirDestino, criarCaderno, rastrear, bumpCad])

  // quando os metadados do PDF ficam prontos (após o 'ready'), reenvia o dia já com o PDF
  useEffect(() => { if (pdfMeta) enviarDia() }, [pdfMeta, enviarDia])

  // Transmite ao iframe o tempo TOTAL acumulado na meta (base salva + sessão atual) a cada segundo —
  // o leitor usa p/ a contagem REGRESSIVA do "Tempo do simulado" na lateral esquerda.
  useEffect(() => {
    if (!metaCrono) return
    try { iframeRef.current?.contentWindow?.postMessage({ type: 'leitor-jus-meta-tempo', totalSeg: tempoBase + sessSeg }, '*') } catch { /* ignore */ }
  }, [sessSeg, metaCrono, tempoBase])

  const totalSeg = tempoBase + sessSeg
  const hh = Math.floor(totalSeg / 3600), mm = Math.floor((totalSeg % 3600) / 60), ss = totalSeg % 60
  const z2 = (n: number) => String(n).padStart(2, '0')
  const tempoLabel = hh > 0 ? `${hh}:${z2(mm)}:${z2(ss)}` : `${z2(mm)}:${z2(ss)}`
  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg,#fbfbfc)]">
      <iframe ref={iframeRef} src={PROTOTIPO} title={titulo || 'Leitura'} onLoad={enviarDia} allowFullScreen allow="fullscreen"
        style={{ display: 'block', width: '100%', height: '100%', border: 0, background: 'var(--bg, #fbfbfc)' }} />
      <SalvarComentarioCaderno dados={paraCaderno} onClose={() => setParaCaderno(null)}
        cadernoPadraoId={cad.current.destinos.leitura.caderno_id} onSalvo={aoSalvarCaderno} />
      <DestinoCadernoDialog cor={dstCor} open={dstAberto} onOpenChange={(o) => { setDstAberto(o); if (!o) { try { iframeRef.current?.contentWindow?.postMessage({ type: 'leitor-jus-foco-dst' }, '*') } catch { /* ignore */ } } }}
        cadernos={cad.current.cadernos} cadernoId={cad.current.destinos.leitura.caderno_id}
        automatico={cad.current.destinos.leitura.salvar_sem_perguntar}
        carregando={!cad.current.pronto} erro={cad.current.indisponivel}
        onEscolher={(id) => void definirDestino({ contexto: 'leitura', caderno_id: id, salvar_sem_perguntar: id ? cad.current.destinos.leitura.salvar_sem_perguntar : false })}
        onAutomatico={(v) => void definirDestino({ contexto: 'leitura', caderno_id: cad.current.destinos.leitura.caderno_id, salvar_sem_perguntar: v })}
        onCriar={(nome) => criarCaderno({ nome })}
        onRetentar={() => { const c = cad.current; c.pronto = false; c.indisponivel = false; cadCarregando.current = null; bumpCad(); void carregarCad().catch(() => { c.indisponivel = true; c.pronto = true; cadCarregando.current = null }).then(() => { postarDestinos(); bumpCad() }) }}
        onVer={() => { setDstAberto(false); irPara(R.cadernos) }} />
      <AvisoSaidaCaderno resumo={saida && saida.resumo.length ? saida.resumo : null} pendentes={saida && saida.pendentes.length ? resumirPendentes(saida.pendentes) : null}
        cadernos={cad.current.cadernos} cadernoPadraoId={cad.current.destinos.leitura.caderno_id} onSalvarESair={salvarPendentesESair}
        onFicar={() => setSaida(null)}
        onSair={() => { const h = saida?.href; setSaida(null); if (h) sairAgora(h) }}
        onVer={(id) => { setSaida(null); sairAgora(`/aluno/cadernos/${id}`) }} />
      {erroPdf && (
        <div role="alert" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center', padding: 20, background: 'color-mix(in srgb, var(--bg, #fbfbfc) 88%, transparent)', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: 'min(420px, 100%)', borderRadius: 20, padding: '26px 22px 20px', background: 'var(--card, #fff)', color: 'var(--foreground, #1f1f1f)', boxShadow: '0 24px 60px -18px rgba(0,0,0,.35)', border: '1px solid color-mix(in srgb, currentColor 10%, transparent)', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, margin: '0 auto 14px', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, #d93025 12%, transparent)', color: '#d93025', fontSize: 26, fontWeight: 800 }}>!</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>{erroPdf === 'sem-pdf' ? 'Material indisponível' : 'Não foi possível abrir o material'}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, opacity: .75, margin: '0 0 18px' }}>
              {erroPdf === 'sem-pdf' ? 'Este material ainda não tem a versão de leitura pronta. Tente novamente em alguns minutos.' : erroPdf}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {erroPdf === 'sem-pdf'
                ? <button onClick={() => router.refresh()} style={btnPri}>Tentar de novo</button>
                : <button onClick={() => setTentativa((t) => t + 1)} style={btnPri}>Tentar de novo</button>}
              {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={btnSec}>Abrir o PDF no navegador</a>}
              <button onClick={() => irPara(voltarHref)} style={btnSec}>Voltar</button>
            </div>
          </div>
        </div>
      )}
      {metaCrono && usarBadgeMeta && !tempoDeterminadoSeg ? (
        <div aria-live="off" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 18, zIndex: 50, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderRadius: 999, background: 'color-mix(in srgb, var(--primary, #6d28d9) 92%, #000)', color: '#fff', boxShadow: '0 8px 24px -8px rgba(0,0,0,.4)', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none', userSelect: 'none' }}>
          <style>{'@keyframes lb-pulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'lb-pulse 1.4s ease-in-out infinite' }} />
          <span style={{ opacity: .85, fontWeight: 600, fontSize: 12.5 }}>Tempo nesta meta</span>
          <b>{tempoLabel}</b>
        </div>
      ) : null}
    </div>
  )
}

function resumirPendentes(l: ComentarioParaCaderno[]): PendentesResumo {
  const r = { grifo: 0, comentario: 0, anotacao: 0, total: l.length }
  for (const p of l) r[p.tipo === 'anotacao' ? 'anotacao' : p.tipo === 'grifo' ? 'grifo' : 'comentario']++
  return r
}

const btnPri: CSSProperties = { height: 44, borderRadius: 12, border: 0, background: 'var(--primary, #6d28d9)', color: 'var(--primary-foreground, #fff)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const btnSec: CSSProperties = { height: 44, borderRadius: 12, border: '1px solid color-mix(in srgb, currentColor 18%, transparent)', background: 'transparent', color: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'grid', placeItems: 'center', textDecoration: 'none' }
