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
import { toast } from 'sonner'
import type { GrifoPdf } from '@/lib/conteudo/leitor'
import { APP_VERSION } from '@/lib/version'
import { prepararHtmlLegproc } from '@/lib/leitura/legproc-caixas'
import { SalvarComentarioCaderno, normalizarComentarioCaderno, type ComentarioParaCaderno } from '@/components/aluno/cadernos/salvar-comentario-caderno'

// LEITOR_REV: sobe a cada mudança no leitor-jus.html que precisa chegar SEM esperar a próxima versão do app (o ?v= só muda no deploy).
const LEITOR_REV = 'lp11'
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
  partesCrono = [], metaCrono = '', tempoBase = 0, tempoDeterminadoSeg = 0, mostrarLegenda = false,
}: {
  documentoId: string; versaoId: string; titulo: string; pdfUrl: string | null
  /** Documento LegProc: lê em TEXTO (HTML rico) com STF/STJ recolhíveis, em vez do PDF fiel. */
  texto?: { html: string; grifos: GrifoTexto[]; ocultarLegendaTabela?: boolean }
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
  const irPara = useCallback((href: string) => {
    salvarTempo()
    try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* ignore */ }
    router.push(href)
  }, [router, salvarTempo])
  // Rede de segurança: se fechar a aba/atualizar sem concluir, ainda grava o tempo da sessão.
  useEffect(() => {
    const h = () => salvarTempo()
    window.addEventListener('pagehide', h); window.addEventListener('beforeunload', h)
    return () => { window.removeEventListener('pagehide', h); window.removeEventListener('beforeunload', h) }
  }, [salvarTempo])
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pdfMeta, setPdfMeta] = useState<{ url: string; scale: number; pages: { w: number; h: number }[] } | null>(null)
  // Falha ao abrir o PDF → tela de erro (antes: falha silenciosa = leitor vazio, sem saber o porquê).
  const [erroPdf, setErroPdf] = useState<string | null>(pdfUrl || texto ? null : 'sem-pdf')
  const [tentativa, setTentativa] = useState(0)
  const enviados = useRef(new Map<string, { serverId: string; hash: string; geo: string }>())
  const busy = useRef(false); const pendente = useRef<GrifoEngine[] | null>(null); const avisou = useRef(false)
  const dados = useRef({ documentoId, versaoId, titulo, voltarHref, paginaInicial, paginaMinima, partesCrono, metaCrono, mostrarLegenda, tempoDeterminadoSeg, tempoBase })
  dados.current = { documentoId, versaoId, titulo, voltarHref, paginaInicial, paginaMinima, partesCrono, metaCrono, mostrarLegenda, tempoDeterminadoSeg, tempoBase }

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
    if (htmlProc.current === null) htmlProc.current = prepararHtmlLegproc(texto.html)
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
        paginaMinima: d.paginaMinima || 1, // 1ª página que entra na leitura (as anteriores não são montadas nem contadas)
        partes: d.partesCrono || [], metaAtual: d.metaCrono || '',
        grifosRevisaoLigados: !!texto,
        ocultarLegendaDoc: !!texto && texto.ocultarLegendaTabela !== false, // tabela de legenda do início do doc (repete a barra de legendas)
        inclusosRevisao: !!texto, // botão "Inclusos Revisão" (tabelas / entendimentos / Já cobrado) — só no LegProc em texto
        grifoRevisaoOff: !texto, // LegProc (texto): mostra o botão "Grifos do Revisão" (marcações do professor no próprio texto)
        legendasOff: d.mostrarLegenda ? [] : LEGENDAS_TODAS,
        tempoDeterminadoSeg: d.tempoDeterminadoSeg || 0, tempoBaseSeg: d.tempoBase || 0,
      },
    }, '*')
  }, [pdfMeta, iniciais, pdfUrl, texto, htmlTexto])

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

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data; if (!m || typeof m !== 'object') return
      if (m.type === 'leitor-jus-ready') { enviarDia(); return }
      // Comentário de um trecho → salvar num caderno do aluno (modal escolhe/cria o caderno).
      if (m.type === 'leitor-jus-salvar-caderno') {
        const d = dados.current
        const p = normalizarComentarioCaderno(m.grifo, { documento_id: d.documentoId, documento_versao: null, titulo_documento: d.titulo || null })
        if (p) setParaCaderno(p)
        return
      }
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
  }, [enviarDia, reconciliar, reconciliarTexto, irPara, texto])

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
      <iframe ref={iframeRef} src={PROTOTIPO} title={titulo || 'Leitura'} onLoad={enviarDia}
        style={{ display: 'block', width: '100%', height: '100%', border: 0, background: 'var(--bg, #fbfbfc)' }} />
      <SalvarComentarioCaderno dados={paraCaderno} onClose={() => setParaCaderno(null)} />
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

const btnPri: CSSProperties = { height: 44, borderRadius: 12, border: 0, background: 'var(--primary, #6d28d9)', color: 'var(--primary-foreground, #fff)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const btnSec: CSSProperties = { height: 44, borderRadius: 12, border: '1px solid color-mix(in srgb, currentColor 18%, transparent)', background: 'transparent', color: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'grid', placeItems: 'center', textDecoration: 'none' }
