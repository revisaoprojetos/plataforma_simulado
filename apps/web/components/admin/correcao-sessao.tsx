'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Check, Flag, Lock, AlertTriangle, BookOpenCheck, Image as ImageIcon, FileText, Sparkles, Loader2, ExternalLink, ScrollText, ScanText,
} from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { CorrecaoFolha, ICONES, type Ferramenta, type Marca } from '@/components/admin/correcao-folha'
import { PdfPreview } from '@/components/admin/pdf-preview'
import { assumirCorrecao, salvarCorrecao, salvarQuesito, salvarEspelhoQuesito, salvarTranscricao, imagemParaOCR, salvarAnotacao, removerAnotacao, atualizarAnotacao, type QuesitoPatch } from '@/app/admin/correcao/actions'

export interface CompCorrecao {
  id: string; nome: string; pontos: number
  nota: number | null; comentario: string; audit_state: string; mensagem: string
  descricao: string; conceitos: { nome: string; pontos: number }[]; conceito: string
  excerpt: string; pagina: string; linhas: string
  recognized: string[]; missing: string[]; leituraDuvidosa: boolean
}
export interface QuestaoCorrecao {
  respostaId: string; numero: number; status: string; enunciado: string; jaCorrigida: boolean; feedbackInicial: string
  transcricao: string
  competencias: CompCorrecao[]
  paginas: { arquivoId: string; url: string }[]
  anotacoesIniciais: Marca[]
  espelho: { enunciado: string; comentarioProfessor: string | null }
}

type Linha = { key: string; codigo: string; qi: number; respostaId: string; comp: CompCorrecao; inicial: { nota: number | null; conceito: string } }
type Filtro = 'todos' | 'revisar' | 'aprovados' | 'alterados' | 'integrais' | 'faltou'

const PALETA = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const COR_GERAL = '#64748b'
const gerarTemp = () => 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const dotEstado = (s: string) => (s === 'approved' ? 'bg-emerald-500' : s === 'review' ? 'bg-amber-500' : 'bg-muted-foreground/30')
const nfmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const clampW = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ── OCR estruturado: usa as LINHAS da pauta como régua + as caixas de palavra do
// Tesseract p/ (a) numerar a transcrição por linha, (b) pular o cabeçalho impresso
// ("QUESTÃO 01"…), (c) detectar início/fim de parágrafo. Coords em px da imagem processada.
type PalavraOCR = { text: string; x0: number; y0: number; x1: number; y1: number }
function coletarPalavrasOCR(data: any): PalavraOCR[] {
  const out: PalavraOCR[] = []
  const bom = (b: any) => b && Number.isFinite(b.x0) && b.x1 > b.x0 && b.y1 > b.y0
  // Mantém TODAS as palavras reconhecidas (base completa p/ o corretor editar) — sem filtro de confiança.
  const add = (t: any, b: any) => { const s = String(t ?? '').trim(); if (s && bom(b)) out.push({ text: s, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }) }
  if (Array.isArray(data?.words) && data.words.length) for (const w of data.words) add(w?.text, w?.bbox)
  if (!out.length && Array.isArray(data?.blocks)) for (const bl of data.blocks) for (const p of (bl?.paragraphs ?? [])) for (const ln of (p?.lines ?? [])) for (const w of (ln?.words ?? [])) add(w?.text, w?.bbox)
  return out
}
function regiaoDeCaixas(caixas: { x0: number; y0: number; x1: number; y1: number }[], w: number, h: number): { x: number; y: number; largura: number; altura: number } | null {
  if (!caixas.length || !w || !h) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of caixas) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1) }
  const pad = 0.012
  const x = clamp01(x0 / w - pad), y = clamp01(y0 / h - pad)
  const largura = clamp01(x1 / w + pad - x), altura = clamp01(y1 / h + pad - y)
  if (largura < 0.02 || altura < 0.02) return null
  return { x, y, largura, altura }
}
/** Uma "linha" da folha é referência impressa (cabeçalho), não resposta do aluno? */
function ehCabecalho(txt: string): boolean {
  const t = txt.toUpperCase().replace(/[^0-9A-ZÀ-Ú ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return true
  // "QUESTÃO 01" (mesmo com lixo curto do OCR grudado, ex.: "QUESTÃO 01 E.")
  const semQ = t.replace(/^Q?UEST[AÃ]O\s*(N[º°.]?\s*)?\d+\s*/, '').trim()
  if (semQ !== t && semQ.length < 5) return true
  return /^RESPOSTA( DISCURSIVA| DA QUEST[AÃ]O)?\s*\d*$/.test(t) || /^FOLHA( DE RESPOSTAS?)?$/.test(t) || /^RASCUNHO$/.test(t) || /^GABARITO$/.test(t) || /^P[AÁ]GINA\s*\d+$/.test(t)
}
const mediana = (a: number[]) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
/**
 * Estrutura a saída do OCR: agrupa as palavras em LINHAS por proximidade vertical
 * (robusto — independe das bordas da tabela), numera sequencialmente, pula o cabeçalho
 * ("QUESTÃO 01"…) e detecta parágrafos (indentação à esquerda = início; linha curta = fim).
 * Devolve texto numerado (leitura), texto limpo (excerpt), a faixa de linhas e as caixas
 * das palavras do ALUNO (sem cabeçalho) p/ o destaque.
 */
function estruturarOCR(data: any, w: number, h: number): { numerado: string; limpo: string; linhas: string; caixas: PalavraOCR[] } {
  const palavras = coletarPalavrasOCR(data)
  if (!palavras.length) { const t = String(data?.text || '').trim(); return { numerado: t, limpo: t, linhas: '', caixas: [] } }
  // altura típica de palavra → tolerância p/ agrupar na mesma linha
  const alturas = palavras.map((p) => p.y1 - p.y0).sort((a, b) => a - b)
  const hMed = alturas[Math.floor(alturas.length / 2)] || h / 25
  const ordenadas = palavras.slice().sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  // agrupa por ÂNCORA fixa (o topo de cada linha) p/ não "escorregar" e fundir linhas:
  // a palavra entra na linha atual se seu centro está a até 0.75×altura do topo dela.
  const grupos: { ws: PalavraOCR[]; topo: number }[] = []
  for (const p of ordenadas) {
    const yc = (p.y0 + p.y1) / 2, ult = grupos[grupos.length - 1]
    if (ult && yc - ult.topo <= hMed * 0.75) ult.ws.push(p)
    else grupos.push({ ws: [p], topo: yc })
  }
  const linhasTxt = grupos.map((L) => {
    const ws = L.ws.slice().sort((a, b) => a.x0 - b.x0)
    return { ws, txt: ws.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim(), left: Math.min(...ws.map((x) => x.x0)), right: Math.max(...ws.map((x) => x.x1)) }
  }).filter((L) => L.txt)
  const margemE = mediana(linhasTxt.map((L) => L.left)), margemD = mediana(linhasTxt.map((L) => L.right))
  const indent = w * 0.035, curto = w * 0.14
  const numerado: string[] = [], limpo: string[] = [], numeros: number[] = []
  const caixas: PalavraOCR[] = []
  let anteriorCurta = true // 1ª linha de conteúdo abre parágrafo
  for (const L of linhasTxt) {
    if (ehCabecalho(L.txt)) { anteriorCurta = true; continue } // cabeçalho não conta
    caixas.push(...L.ws)
    const numero = numeros.length + 1
    numeros.push(numero)
    const novoParag = anteriorCurta || (L.left - margemE > indent)
    if (novoParag && limpo.length) { numerado.push(''); limpo.push('') }
    numerado.push(`${String(numero).padStart(2, '0')}. ${L.txt}`)
    limpo.push(L.txt)
    anteriorCurta = L.right < margemD - curto
  }
  const linhas = numeros.length ? (numeros.length === 1 ? String(numeros[0]) : `${numeros[0]}–${numeros[numeros.length - 1]}`) : ''
  // junta linhas do mesmo parágrafo no texto "limpo" (parágrafos separados por linha em branco)
  const limpoTxt = limpo.reduce((acc: string[], ln) => { if (ln === '') acc.push(''); else acc[acc.length - 1] = ((acc[acc.length - 1] ?? '') + ' ' + ln).trim(); return acc }, ['']).filter((s) => s.trim()).join('\n\n')
  return { numerado: numerado.join('\n').trim(), limpo: limpoTxt.trim(), linhas, caixas }
}
// Pré-processa a foto p/ o OCR (canvas), direcionado a folha de resposta pautada:
// upscale → grayscale → binarização ADAPTATIVA (tira o fundo/rosa) → remove as linhas
// da pauta e o grid (runs longos horizontais/verticais) → apaga a coluna de números à
// esquerda. Reduz o "lixo" e ajuda o Tesseract. Devolve as dims processadas.
function preprocessarOCR(dataUrl: string): Promise<{ url: string; w: number; h: number; linhasY: number[] }> {
  return new Promise((res) => {
    const im = new Image()
    im.onload = () => {
      const natW = im.naturalWidth || 0, natH = im.naturalHeight || 0
      if (!natW || !natH) { res({ url: dataUrl, w: 0, h: 0, linhasY: [] }); return }
      // upscale mirando ~2600px de largura, com teto de ~10MP p/ não estourar memória.
      let escala = Math.min(4, Math.max(1, 2600 / natW))
      if (natW * natH * escala * escala > 10_000_000) escala = Math.sqrt(10_000_000 / (natW * natH))
      const w = Math.max(1, Math.round(natW * escala)), h = Math.max(1, Math.round(natH * escala))
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      const ctx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null
      if (!ctx) { res({ url: dataUrl, w: natW, h: natH, linhasY: [] }); return }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(im, 0, 0, w, h)
      const linhasY: number[] = []
      try {
        const img = ctx.getImageData(0, 0, w, h), d = img.data, N = w * h
        // 1) grayscale
        const gray = new Float32Array(N)
        for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        // 2) imagem integral p/ média local (limiar adaptativo)
        const integ = new Float64Array((w + 1) * (h + 1))
        for (let y = 0; y < h; y++) { let soma = 0; for (let x = 0; x < w; x++) { soma += gray[y * w + x]; integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + soma } }
        const r = Math.min(30, Math.max(8, Math.round(w / 120))), C = 10
        const ink = new Uint8Array(N) // 1 = tinta (preto)
        for (let y = 0; y < h; y++) {
          const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r)
          for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r)
            const area = (x1 - x0 + 1) * (y1 - y0 + 1)
            const soma = integ[(y1 + 1) * (w + 1) + (x1 + 1)] - integ[y0 * (w + 1) + (x1 + 1)] - integ[(y1 + 1) * (w + 1) + x0] + integ[y0 * (w + 1) + x0]
            if (gray[y * w + x] < soma / area - C) ink[y * w + x] = 1
          }
        }
        // 3) remove RUNS horizontais longos (linhas da pauta — e REGISTRA seu Y) e verticais longos (grade)
        const limH = Math.round(w * 0.30), limV = Math.round(h * 0.30)
        const ehLinha = new Uint8Array(h)
        for (let y = 0; y < h; y++) { let ini = -1, tem = false; for (let x = 0; x <= w; x++) { const on = x < w && ink[y * w + x] === 1; if (on) { if (ini < 0) ini = x } else { if (ini >= 0 && x - ini >= limH) { for (let k = ini; k < x; k++) ink[y * w + k] = 0; tem = true } ini = -1 } } if (tem) ehLinha[y] = 1 }
        for (let y = 0; y < h; y++) { if (ehLinha[y]) { let y2 = y; while (y2 + 1 < h && ehLinha[y2 + 1]) y2++; linhasY.push((y + y2) / 2); y = y2 } }
        for (let x = 0; x < w; x++) { let ini = -1; for (let y = 0; y <= h; y++) { const on = y < h && ink[y * w + x] === 1; if (on) { if (ini < 0) ini = y } else { if (ini >= 0 && y - ini >= limV) for (let k = ini; k < y; k++) ink[k * w + x] = 0; ini = -1 } } }
        // 4) apaga a coluna de números à esquerda (~6% da largura)
        const corte = Math.round(w * 0.06)
        for (let y = 0; y < h; y++) for (let x = 0; x < corte; x++) ink[y * w + x] = 0
        // 5) escreve preto sobre branco
        for (let p = 0, i = 0; p < N; p++, i += 4) { const v = ink[p] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 }
        ctx.putImageData(img, 0, 0)
      } catch { /* canvas "tainted"/memória: usa o upscale puro */ }
      res({ url: cv.toDataURL('image/png'), w, h, linhasY })
    }
    im.onerror = () => res({ url: dataUrl, w: 0, h: 0, linhasY: [] })
    im.src = dataUrl
  })
}

// Recorta EXATAMENTE a área da caixa (coords 0–1) da imagem → dataURL/base64 p/ OCR/IA.
function recortarRegiao(fullDataUrl: string, box: { x: number; y: number; largura: number; altura: number }, escala = 2): Promise<{ dataUrl: string; base64: string; mediaType: string } | null> {
  return new Promise((res) => {
    const im = new Image()
    im.onload = () => {
      const W = im.naturalWidth, H = im.naturalHeight
      if (!W || !H) { res(null); return }
      const sx = clamp01(box.x) * W, sy = clamp01(box.y) * H
      const sw = Math.max(1, Math.min(W - sx, clamp01(box.largura) * W)), sh = Math.max(1, Math.min(H - sy, clamp01(box.altura) * H))
      const cw = Math.max(1, Math.round(sw * escala)), ch = Math.max(1, Math.round(sh * escala))
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
      const ctx = cv.getContext('2d'); if (!ctx) { res(null); return }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch)
      const dataUrl = cv.toDataURL('image/png')
      res({ dataUrl, base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/png' })
    }
    im.onerror = () => res(null)
    im.src = fullDataUrl
  })
}

/** Divisória arrastável entre colunas (chama onDelta com o dx do arraste). */
function ColResizer({ onDelta }: { onDelta: (dx: number) => void }) {
  const st = useRef({ drag: false, x: 0, fn: onDelta }); st.current.fn = onDelta
  useEffect(() => {
    const move = (e: PointerEvent) => { const s = st.current; if (!s.drag) return; const dx = e.clientX - s.x; s.x = e.clientX; s.fn(dx) }
    const up = () => { st.current.drag = false; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])
  return <div onPointerDown={(e) => { st.current.drag = true; st.current.x = e.clientX; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }}
    className="w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/60" title="Arraste para redimensionar" />
}

export function CorrecaoSessao({ aluno, email, tentativa, simuladoTitulo, questoes, voltarUrl, espelhoPdfUrl, espelhoTexto, iaAtiva = false }: {
  aluno: string; email: string; tentativa: number | null; simuladoTitulo: string
  questoes: QuestaoCorrecao[]; voltarUrl: string; espelhoPdfUrl?: string | null; espelhoTexto?: string
  iaAtiva?: boolean
}) {
  const router = useRouter()
  const { setOpen, open, state, isMobile } = useSidebar()
  useEffect(() => { const anterior = open; setOpen(false); return () => setOpen(anterior) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Mesa em tela cheia (fixed) à DIREITA do rail da sidebar: altura fixa do viewport (não estica a
  // página, cada coluna rola sozinha) e a barra lateral continua visível/recolhida.
  const leftPx = isMobile ? 0 : state === 'collapsed' ? 48 : 256

  // Flatten: 1 linha por QUESITO (Qx.y) de todas as questões.
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    questoes.flatMap((q, qi) => q.competencias.map((comp) => ({
      key: `${qi}:${comp.id}`, codigo: `Q${q.numero}.${q.competencias.indexOf(comp) + 1}`, qi, respostaId: q.respostaId,
      comp: { ...comp }, inicial: { nota: comp.nota, conceito: comp.conceito },
    }))),
  )
  const linhasRef = useRef(linhas); useEffect(() => { linhasRef.current = linhas }, [linhas])
  const [anotPorResp, setAnotPorResp] = useState<Record<string, Marca[]>>(() =>
    Object.fromEntries(questoes.map((q) => [q.respostaId, q.anotacoesIniciais])))
  const anotRef = useRef(anotPorResp); useEffect(() => { anotRef.current = anotPorResp }, [anotPorResp])
  const [statusPorResp, setStatusPorResp] = useState<Record<string, string>>(() =>
    Object.fromEntries(questoes.map((q) => [q.respostaId, q.status])))
  const [transcricaoPorResp, setTranscricaoPorResp] = useState<Record<string, string>>(() =>
    Object.fromEntries(questoes.map((q) => [q.respostaId, q.transcricao ?? ''])))

  const [ativoKey, setAtivoKey] = useState<string>(linhas[0]?.key ?? '')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [aba, setAba] = useState<'prova' | 'espelho' | 'transcricao'>('prova')
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar')
  const [iconeAtivo, setIconeAtivo] = useState<string>('check')
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [focoId, setFocoId] = useState<string | null>(null)
  const [focoKey, setFocoKey] = useState(0)
  const [paginaIndex, setPaginaIndex] = useState(0)
  const [pending, setPending] = useState(false)
  const [showDestaqueIA, setShowDestaqueIA] = useState(true)
  const [iaPending, setIaPending] = useState<string | null>(null)
  const [ocrPending, setOcrPending] = useState<number | null>(null)
  const [espelhoModo, setEspelhoModo] = useState<'pdf' | 'texto'>('pdf')
  // Larguras ajustáveis das colunas + espelho como coluna (persistidos no navegador).
  const [w1, setW1] = useState(256)
  const [w3, setW3] = useState(456)
  const [wEsp, setWEsp] = useState(380)
  const [espelhoColuna, setEspelhoColuna] = useState(false)
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('correcao_cols') || '{}'); if (s.w1) setW1(s.w1); if (s.w3) setW3(s.w3); if (s.wEsp) setWEsp(s.wEsp); if (typeof s.esp === 'boolean') setEspelhoColuna(s.esp) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem('correcao_cols', JSON.stringify({ w1, w3, wEsp, esp: espelhoColuna })) } catch {} }, [w1, w3, wEsp, espelhoColuna])

  useEffect(() => { for (const q of questoes) if (q.status !== 'corrigida') assumirCorrecao(q.respostaId) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const metaQ = useMemo(() => questoes.map((q, qi) => ({ qi, numero: q.numero, respostaId: q.respostaId, paginas: q.paginas, espelho: q.espelho })), [questoes])
  const ativo = linhas.find((l) => l.key === ativoKey) ?? linhas[0] ?? null
  const questaoAtiva = ativo ? metaQ[ativo.qi] : null
  const anotAtivas = questaoAtiva ? (anotPorResp[questaoAtiva.respostaId] ?? []) : []
  const corDoQuesito = (compId: string | null) => { if (!compId) return COR_GERAL; const idx = linhas.filter((l) => l.qi === (ativo?.qi ?? 0)).findIndex((l) => l.comp.id === compId); return idx >= 0 ? PALETA[idx % PALETA.length] : COR_GERAL }
  const corAtiva = ativo ? corDoQuesito(ativo.comp.id) : COR_GERAL

  // ── Alertas (por quesito) ──
  const alertasDe = (l: Linha): { sev: string; msg: string }[] => {
    const c = l.comp, out: { sev: string; msg: string }[] = []
    const nMarks = (anotPorResp[l.respostaId] ?? []).filter((a) => (a.competencia_id ?? null) === c.id).length
    if (c.nota != null && c.nota > c.pontos) out.push({ sev: 'alto', msg: 'Pontuação fora do intervalo do quesito.' })
    if (c.conceito) { const cc = c.conceitos.find((x) => x.nome === c.conceito); if (cc && c.nota != null && Math.abs(c.nota - cc.pontos) > 0.001) out.push({ sev: 'alto', msg: `Pontuação não coincide com ${cc.nome} (${nfmt(cc.pontos)}).` }) }
    if (c.nota != null && c.nota < c.pontos && nMarks === 0) out.push({ sev: 'medio', msg: 'Perdeu pontos sem nenhuma marca na folha.' })
    if (c.leituraDuvidosa) out.push({ sev: 'medio', msg: 'Leitura/transcrição marcada como duvidosa.' })
    if (c.audit_state === 'approved' && c.nota == null) out.push({ sev: 'alto', msg: 'Aprovado sem nota definida.' })
    if (c.audit_state === 'approved' && !c.mensagem.trim()) out.push({ sev: 'baixo', msg: 'Aprovado sem devolutiva ao aluno.' })
    const ex = c.excerpt.trim()
    if (ex.length > 20) { const outros = linhas.filter((o) => o.key !== l.key && o.comp.excerpt.trim() === ex).map((o) => o.codigo); if (outros.length) out.push({ sev: 'medio', msg: `Mesmo trecho do aluno aparece também em ${outros.join(', ')}.` }) }
    return out
  }
  const changedDe = (l: Linha) => l.comp.nota !== l.inicial.nota || l.comp.conceito !== l.inicial.conceito || l.comp.leituraDuvidosa

  const passaFiltro = (l: Linha) => {
    if (filtro === 'revisar') return l.comp.audit_state === 'review' || alertasDe(l).length > 0
    if (filtro === 'aprovados') return l.comp.audit_state === 'approved'
    if (filtro === 'alterados') return changedDe(l)
    if (filtro === 'integrais') return l.comp.nota != null && l.comp.nota >= l.comp.pontos
    if (filtro === 'faltou') return l.comp.missing.length > 0
    return true
  }
  const visiveis = linhas.filter(passaFiltro)
  const cont = (f: Filtro) => linhas.filter((l) => {
    if (f === 'revisar') return l.comp.audit_state === 'review' || alertasDe(l).length > 0
    if (f === 'aprovados') return l.comp.audit_state === 'approved'
    if (f === 'alterados') return changedDe(l)
    if (f === 'integrais') return l.comp.nota != null && l.comp.nota >= l.comp.pontos
    if (f === 'faltou') return l.comp.missing.length > 0
    return true
  }).length

  const notaTotal = linhas.reduce((s, l) => s + (Number(l.comp.nota) || 0), 0)
  const maxTotal = linhas.reduce((s, l) => s + l.comp.pontos, 0)
  const aprovados = linhas.filter((l) => l.comp.audit_state === 'approved').length
  const pctAud = linhas.length ? Math.round((aprovados / linhas.length) * 100) : 0

  // ── edição / persistência do quesito ──
  function patchQ(key: string, patch: Partial<CompCorrecao>) { setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, comp: { ...l.comp, ...patch } } : l))) }
  // Grava APENAS os campos do patch (upsert parcial) — evita corrida entre saves clobberando campos.
  function salvarCampo(key: string, patch: QuesitoPatch) {
    const l = linhasRef.current.find((x) => x.key === key); if (!l) return
    salvarQuesito(l.respostaId, l.comp.id, patch).then((r) => { if (!r.ok) toast.error(r.error ?? 'Erro ao salvar quesito') })
  }
  function salvarEspelho(competenciaId: string, descricao: string) { salvarEspelhoQuesito(competenciaId, descricao).then((r) => { if (!r.ok) toast.error(r.error ?? 'Erro ao salvar espelho') }) }
  function editarNota(key: string, nota: number) {
    const l = linhas.find((x) => x.key === key)
    patchQ(key, { nota, ...(l?.comp.audit_state === 'approved' ? { audit_state: 'pending' } : {}) })
  }
  function escolherConceito(key: string, nome: string) {
    const l = linhas.find((x) => x.key === key); const cc = l?.comp.conceitos.find((x) => x.nome === nome)
    const nota = cc ? cc.pontos : l?.comp.nota ?? 0
    const rebaixa = l?.comp.audit_state === 'approved'
    patchQ(key, { conceito: nome, nota, ...(rebaixa ? { audit_state: 'pending' } : {}) })
    salvarCampo(key, { conceito: nome, nota, ...(rebaixa ? { audit_state: 'pending' } : {}) })
  }
  function mudarEstado(key: string, audit_state: string, avancar?: boolean) {
    patchQ(key, { audit_state }); salvarCampo(key, { audit_state })
    if (avancar) { const i = visiveis.findIndex((l) => l.key === key); const prox = visiveis[i + 1]; if (prox) irPara(prox.key) }
  }

  function foca(id: string | null) { if (!id) return; setFocoId(id); setFocoKey((k) => k + 1) }
  function irPara(key: string) {
    const l = linhas.find((x) => x.key === key); if (!l) return
    setAtivoKey(key); setAba('prova'); setPaginaIndex(0)
    const primeira = (anotPorResp[l.respostaId] ?? []).find((a) => (a.competencia_id ?? null) === l.comp.id)
    if (primeira) { setSelecionadaId(primeira.id); foca(primeira.id) } else setSelecionadaId(null)
  }
  function verNaProva(key: string) { setAba('prova'); irPara(key) }

  // Fase 3 — pede à IA (Claude visão) uma proposta de correção da QUESTÃO ativa e aplica em
  // cinza (pending) p/ o professor revisar/aprovar. A nota final continua sendo do corretor.
  async function sugerirIA() {
    if (!questaoAtiva || !ativo) return
    const resp = questaoAtiva.respostaId, pags = questaoAtiva.paginas
    setIaPending(resp)
    try {
      const r = await fetch('/api/admin/correcao/ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respostaId: resp }) })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) { toast.error(j.error ?? 'Falha na IA'); return }
      if (j.proposta?.transcricao) setTranscricaoPorResp((s) => ({ ...s, [resp]: String(j.proposta.transcricao) }))
      let aplicados = 0, caixas = 0
      for (const q of (j.proposta?.quesitos ?? []) as any[]) {
        const linha = linhasRef.current.find((l) => l.respostaId === resp && l.comp.id === q.competencia_id)
        if (!linha) continue
        const nota = Math.min(linha.comp.pontos, Math.max(0, Number(q.nota) || 0))
        const revisar = !!q.needs_review || q.status === 'revisar'
        // Campos do quesito (UI + persistência)
        const patchUI: Partial<CompCorrecao> = { nota, conceito: q.conceito || '', excerpt: q.excerpt || '', recognized: q.recognized ?? [], missing: q.missing ?? [], comentario: q.rationale || '', leituraDuvidosa: revisar || linha.comp.leituraDuvidosa }
        const patchDB: QuesitoPatch = { nota, conceito: q.conceito || null, excerpt: q.excerpt || null, recognized: q.recognized ?? [], missing: q.missing ?? [], comentario: q.rationale || null, leitura_duvidosa: revisar || linha.comp.leituraDuvidosa }
        if (q.page != null) { patchUI.pagina = String(q.page); patchDB.pagina = String(q.page) }
        if (q.lines) { patchUI.linhas = String(q.lines); patchDB.linhas = String(q.lines) }
        if (revisar) { patchUI.audit_state = 'review'; patchDB.audit_state = 'review' }
        else if (linha.comp.audit_state === 'approved') { patchUI.audit_state = 'pending'; patchDB.audit_state = 'pending' }
        patchQ(linha.key, patchUI); salvarCampo(linha.key, patchDB)
        // Espelho (descrição do quesito) — só preenche se ainda estiver vazio (não sobrescreve o professor)
        if (q.mirror_excerpt && !String(linha.comp.descricao || '').trim()) { patchQ(linha.key, { descricao: String(q.mirror_excerpt) }); salvarEspelho(q.competencia_id, String(q.mirror_excerpt)) }
        // highlightRegions (% da página) → caixas de destaque na prova, ligadas ao quesito. Substitui as marcas IA anteriores.
        const antigas = (anotRef.current[resp] ?? []).filter((a) => (a.competencia_id ?? null) === q.competencia_id && a.tipo === 'destaque' && a.conteudo === 'ia')
        for (const a of antigas) await removerMarca(a.id)
        const cor = corDoQuesito(q.competencia_id)
        for (const reg of (q.regions ?? []) as any[]) {
          const arquivoId = pags[Math.max(0, (Number(reg.page) || 1) - 1)]?.arquivoId ?? pags[0]?.arquivoId
          if (!arquivoId) continue
          const x = clamp01(Number(reg.leftPct) / 100), y = clamp01(Number(reg.topPct) / 100)
          const largura = clamp01(Number(reg.widthPct) / 100), altura = clamp01(Number(reg.heightPct) / 100)
          if (largura < 0.01 || altura < 0.01) continue
          await adicionarMarca(resp, { tipo: 'destaque', competencia_id: q.competencia_id, cor, arquivo_id: arquivoId, conteudo: 'ia', x, y, largura, altura })
          caixas++
        }
        aplicados++
      }
      toast.success(aplicados ? `IA: ${aplicados} quesito(s) e ${caixas} caixa(s) na prova. Revise e aprove — a nota final é sua.` : 'IA não retornou quesitos aplicáveis.')
    } catch { toast.error('Falha ao chamar a IA') } finally { setIaPending(null) }
  }

  // Transcrição por OCR (Tesseract, motor próprio — sem IA). Bom p/ texto impresso; letra de mão sai imperfeita.
  function patchTranscricao(resp: string, texto: string) { setTranscricaoPorResp((s) => ({ ...s, [resp]: texto })) }
  function persistTranscricao(resp: string, texto: string) { salvarTranscricao(resp, texto).then((r) => { if (!r.ok) toast.error(r.error ?? 'Erro ao salvar transcrição') }) }
  async function transcreverOCR() {
    if (!questaoAtiva?.paginas.length || !ativo) { toast.error('Sem foto p/ transcrever nesta questão.'); return }
    const resp = questaoAtiva.respostaId, pgs = questaoAtiva.paginas, key = ativo.key, compId = ativo.comp.id
    setOcrPending(0)
    try {
      const T: any = await import('tesseract.js')
      const createWorker = T.createWorker ?? T.default?.createWorker
      let pgIdx = 0
      const worker = await createWorker('por', 1, { logger: (m: any) => { if (m.status === 'recognizing text') setOcrPending(Math.round(((pgIdx + (m.progress || 0)) / pgs.length) * 100)) } })
      // PSM 6 = bloco único de texto (melhor p/ folha pautada); mantém espaços; whitelist PT corta lixo.
      const WL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú0123456789.,;:!?()-–—/º ª°%\n'
      try { await worker.setParameters({ tessedit_pageseg_mode: (T.PSM?.SINGLE_BLOCK ?? '6'), preserve_interword_spaces: '1', tessedit_char_whitelist: WL }) } catch {}
      const itens: { arquivoId: string; regiao: { x: number; y: number; largura: number; altura: number } }[] = []
      let numerado = '', limpo = '', linhasRef = '', primeiraPag = -1
      try {
        for (let i = 0; i < pgs.length; i++) {
          pgIdx = i
          const img = await imagemParaOCR(pgs[i].url)
          if (!img.ok || !img.dataUrl) continue
          const pre = await preprocessarOCR(img.dataUrl)
          const { data } = await worker.recognize(pre.url, {}, { blocks: true, text: true })
          // agrupa em linhas (por proximidade vertical): numera, pula cabeçalho, detecta parágrafos
          const est = estruturarOCR(data, pre.w, pre.h)
          const pref = pgs.length > 1 ? `— Página ${i + 1} —\n` : ''
          numerado += (numerado ? '\n\n' : '') + pref + est.numerado
          limpo += (limpo ? '\n\n' : '') + est.limpo
          if (est.linhas && !linhasRef) linhasRef = est.linhas
          const reg = regiaoDeCaixas(est.caixas, pre.w, pre.h)
          if (reg) { itens.push({ arquivoId: pgs[i].arquivoId, regiao: reg }); if (primeiraPag < 0) primeiraPag = i }
        }
      } finally { await worker.terminate() }
      numerado = numerado.trim(); limpo = limpo.trim()
      // 1) transcrição por LINHA (aba TRANSCRIÇÃO — leitura com a numeração da folha)
      patchTranscricao(resp, numerado); persistTranscricao(resp, numerado)
      // 2) "Trecho do aluno" = texto limpo (sem cabeçalho, parágrafos) + página + faixa de linhas
      const patchExc: QuesitoPatch = { excerpt: limpo || numerado, ...(primeiraPag >= 0 ? { pagina: String(primeiraPag + 1) } : {}), ...(linhasRef ? { linhas: linhasRef } : {}) }
      patchQ(key, patchExc as Partial<CompCorrecao>); salvarCampo(key, patchExc)
      // 3) marca a(s) região(ões) na prova ligada(s) ao quesito — substitui as marcas OCR anteriores
      const antigas = (anotRef.current[resp] ?? []).filter((a) => (a.competencia_id ?? null) === compId && a.tipo === 'destaque' && a.conteudo === 'ocr')
      for (const a of antigas) await removerMarca(a.id)
      for (const it of itens) await criar({ tipo: 'destaque', arquivo_id: it.arquivoId, conteudo: 'ocr', x: it.regiao.x, y: it.regiao.y, largura: it.regiao.largura, altura: it.regiao.altura })
      if (primeiraPag >= 0) { setAba('prova'); setPaginaIndex(primeiraPag) }
      toast.success(`OCR concluído — transcrição por linha${linhasRef ? ` (linhas ${linhasRef})` : ''}, cabeçalho ignorado${itens.length ? ' e área marcada na prova' : ''}. Revise (letra de mão sai imperfeita).`)
    } catch { toast.error('Falha no OCR.') } finally { setOcrPending(null) }
  }

  // Área de destaque do quesito ativo (a SELECIONADA, senão a 1ª do quesito) — p/ ler só DENTRO dela.
  function regiaoDoQuesito(): { box: Marca; url: string } | null {
    if (!questaoAtiva || !ativo) return null
    const marcas = anotPorResp[questaoAtiva.respostaId] ?? []
    const doQuesito = (m: Marca) => m.tipo === 'destaque' && (m.competencia_id ?? null) === ativo.comp.id && m.largura != null && m.altura != null
    const box = marcas.find((m) => m.id === selecionadaId && doQuesito(m)) ?? marcas.find(doQuesito)
    if (!box) return null
    const pag = questaoAtiva.paginas.find((p) => p.arquivoId === (box.arquivo_id ?? '')) ?? questaoAtiva.paginas[paginaIndex] ?? questaoAtiva.paginas[0]
    if (!pag) return null
    return { box, url: pag.url }
  }

  const WL_OCR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú0123456789.,;:!?()-–—/º ª°%\n'
  // OCR lê APENAS o que está dentro da caixa (não move nem recria a caixa).
  async function transcreverAreaOCR(reg: { box: Marca; url: string }) {
    if (!ativo) return
    const key = ativo.key
    setOcrPending(0)
    try {
      const img = await imagemParaOCR(reg.url)
      if (!img.ok || !img.dataUrl) { toast.error('Falha ao carregar a imagem.'); return }
      const crop = await recortarRegiao(img.dataUrl, { x: reg.box.x, y: reg.box.y, largura: reg.box.largura ?? 0, altura: reg.box.altura ?? 0 }, 2)
      if (!crop) { toast.error('Falha ao recortar a área.'); return }
      const pre = await preprocessarOCR(crop.dataUrl)
      const T: any = await import('tesseract.js'); const createWorker = T.createWorker ?? T.default?.createWorker
      const worker = await createWorker('por', 1, { logger: (m: any) => { if (m.status === 'recognizing text') setOcrPending(Math.round((m.progress || 0) * 100)) } })
      try { await worker.setParameters({ tessedit_pageseg_mode: (T.PSM?.SINGLE_BLOCK ?? '6'), preserve_interword_spaces: '1', tessedit_char_whitelist: WL_OCR }) } catch {}
      let texto = ''
      try { const { data } = await worker.recognize(pre.url, {}, { text: true }); texto = String(data?.text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim() } finally { await worker.terminate() }
      patchQ(key, { excerpt: texto } as Partial<CompCorrecao>); salvarCampo(key, { excerpt: texto })
      toast.success('OCR da área concluído — trecho preenchido (letra de mão pode exigir ajuste).')
    } catch { toast.error('Falha no OCR da área.') } finally { setOcrPending(null) }
  }

  // IA lê APENAS o que está dentro da caixa (recorta e manda ao provedor configurado).
  async function transcreverAreaIA(reg: { box: Marca; url: string }) {
    if (!ativo || !questaoAtiva) return
    const key = ativo.key, resp = questaoAtiva.respostaId
    setIaPending(resp)
    try {
      const img = await imagemParaOCR(reg.url)
      if (!img.ok || !img.dataUrl) { toast.error('Falha ao carregar a imagem.'); return }
      const crop = await recortarRegiao(img.dataUrl, { x: reg.box.x, y: reg.box.y, largura: reg.box.largura ?? 0, altura: reg.box.altura ?? 0 }, 2)
      if (!crop) { toast.error('Falha ao recortar a área.'); return }
      const r = await fetch('/api/admin/correcao/transcrever-regiao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respostaId: resp, imagemBase64: crop.base64, mediaType: crop.mediaType }) })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) { toast.error(j.error ?? 'Falha na IA'); return }
      const texto = String(j.texto || '')
      patchQ(key, { excerpt: texto } as Partial<CompCorrecao>); salvarCampo(key, { excerpt: texto })
      toast.success('IA transcreveu a área — trecho preenchido.')
    } catch { toast.error('Falha ao chamar a IA') } finally { setIaPending(null) }
  }
  // Dispatch dos botões: se há caixa no quesito, lê DENTRO dela; senão, página inteira / proposta completa.
  function ocrDispatch() { const reg = regiaoDoQuesito(); if (reg) transcreverAreaOCR(reg); else transcreverOCR() }
  function iaDispatch() { const reg = regiaoDoQuesito(); if (reg) transcreverAreaIA(reg); else sugerirIA() }

  // ── anotações (na questão ativa) ──
  // Cria uma marca com competência/cor EXPLÍCITAS (usada por OCR/IA, que marcam quesitos
  // que podem não ser o ativo). Otimista + reconciliação do id real.
  async function adicionarMarca(resp: string, payload: Omit<Marca, 'id'>) {
    const tempId = gerarTemp()
    setAnotPorResp((s) => ({ ...s, [resp]: [...(s[resp] ?? []), { ...payload, id: tempId }] }))
    const r = await salvarAnotacao(resp, payload)
    if (r.ok && r.id) setAnotPorResp((s) => ({ ...s, [resp]: (s[resp] ?? []).map((x) => (x.id === tempId ? { ...x, id: r.id! } : x)) }))
    else { setAnotPorResp((s) => ({ ...s, [resp]: (s[resp] ?? []).filter((x) => x.id !== tempId) })); if (r.error) toast.error(r.error) }
    return r
  }
  async function criar(m: Omit<Marca, 'id'>) {
    if (!questaoAtiva || !ativo) return
    const resp = questaoAtiva.respostaId, tempId = gerarTemp()
    const payload = { ...m, competencia_id: ativo.comp.id, cor: corAtiva }
    setAnotPorResp((s) => ({ ...s, [resp]: [...(s[resp] ?? []), { ...payload, id: tempId }] }))
    if (m.tipo === 'texto') setSelecionadaId(tempId)
    const r = await salvarAnotacao(resp, payload)
    if (r.ok && r.id) { setAnotPorResp((s) => ({ ...s, [resp]: (s[resp] ?? []).map((x) => (x.id === tempId ? { ...x, id: r.id! } : x)) })); setSelecionadaId((sel) => (sel === tempId ? r.id! : sel)) }
    else { setAnotPorResp((s) => ({ ...s, [resp]: (s[resp] ?? []).filter((x) => x.id !== tempId) })); toast.error(r.error ?? 'Erro ao salvar marca') }
  }
  async function removerMarca(id: string) {
    if (!questaoAtiva) return; const resp = questaoAtiva.respostaId
    setAnotPorResp((s) => ({ ...s, [resp]: (s[resp] ?? []).filter((x) => x.id !== id) }))
    if (selecionadaId === id) setSelecionadaId(null)
    if (!id.startsWith('tmp-')) removerAnotacao(id)
  }
  function atualizarMarca(id: string, patch: Partial<Marca>) {
    if (!questaoAtiva) return; const resp = questaoAtiva.respostaId
    setAnotPorResp((s) => ({ ...s, [resp]: (s[resp] ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
    if (!id.startsWith('tmp-')) atualizarAnotacao(id, patch)
  }
  function selecionarMarca(id: string | null) {
    setSelecionadaId(id)
    if (id && questaoAtiva) { const m = (anotPorResp[questaoAtiva.respostaId] ?? []).find((a) => a.id === id); if (m?.competencia_id) { const alvo = linhas.find((l) => l.qi === ativo?.qi && l.comp.id === m.competencia_id); if (alvo) setAtivoKey(alvo.key) } }
  }
  const selecionada = questaoAtiva ? (anotPorResp[questaoAtiva.respostaId] ?? []).find((a) => a.id === selecionadaId) ?? null : null

  // ── Finalizar (devolve todas as questões) ──
  function finalizar() {
    setPending(true)
    ;(async () => {
      const porResp = new Map<string, Linha[]>()
      for (const l of linhasRef.current) { const a = porResp.get(l.respostaId) ?? []; a.push(l); porResp.set(l.respostaId, a) }
      let erro = ''
      for (const [resp, ls] of porResp) {
        const r = await salvarCorrecao(resp, ls.map((l) => ({ competencia_id: l.comp.id, nota: Number(l.comp.nota) || 0, comentario: l.comp.comentario })), '')
        if (!r.ok) erro = r.error ?? 'Erro'
        else setStatusPorResp((s) => ({ ...s, [resp]: 'corrigida' }))
      }
      setPending(false)
      if (erro) toast.error(erro)
      else { toast.success('Correção finalizada e devolvida ao aluno'); router.push(voltarUrl); router.refresh() }
    })()
  }

  const FILTROS: { id: Filtro; nome: string }[] = [
    { id: 'todos', nome: 'Todos' }, { id: 'revisar', nome: 'Revisar' }, { id: 'aprovados', nome: 'Aprovados' },
    { id: 'alterados', nome: 'Alterados' }, { id: 'integrais', nome: 'Integrais' }, { id: 'faltou', nome: 'O que faltou' },
  ]

  const alertasAtivo = ativo ? alertasDe(ativo) : []
  const regQuesito = ativo ? regiaoDoQuesito() : null // há caixa no quesito ativo? então OCR/IA lêem DENTRO dela
  const setArr = (key: string, campo: 'recognized' | 'missing', txt: string) => patchQ(key, { [campo]: txt.split('\n') } as Partial<CompCorrecao>)

  return (
    <div style={{ left: leftPx }} className="fixed inset-y-0 right-0 z-40 flex flex-col overflow-hidden bg-background text-foreground transition-[left] duration-200">
      {/* ROW 1 — cabeçalho */}
      <header className="flex h-13 shrink-0 items-center gap-3 border-b bg-card px-3 py-2">
        <Link href={voltarUrl} className="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"><ArrowLeft className="h-4 w-4" /> Sair</Link>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BookOpenCheck className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{aluno}{tentativa != null && ` · Tentativa ${tentativa}`}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{email || '—'} · {simuladoTitulo}</p>
        </div>
      </header>

      {/* ROW 2 — toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-3 py-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums">{nfmt(notaTotal)}</span>
          <span className="text-sm text-muted-foreground">/ {nfmt(maxTotal)}</span>
        </div>
        <div className="text-[11px] leading-tight text-muted-foreground">
          <span className="font-semibold text-foreground">{pctAud}%</span> auditado · {aprovados} de {linhas.length} quesitos aprovados
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
              className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors', filtro === f.id ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              {f.nome} <span className="tabular-nums opacity-70">{cont(f.id)}</span>
            </button>
          ))}
          <button type="button" onClick={finalizar} disabled={pending}
            className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Finalizar
          </button>
        </div>
      </div>

      {/* 3 COLUNAS */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ① QUESITOS */}
        <aside style={{ width: w1 }} className="flex shrink-0 flex-col bg-card">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>QUESITOS</span><span>{visiveis.length}/{linhas.length}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {visiveis.map((l) => {
              const na = alertasDe(l).length
              const at = l.key === ativoKey
              return (
                <button key={l.key} type="button" onClick={() => irPara(l.key)}
                  className={cn('w-full rounded-lg border p-2 text-left transition-colors', at ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotEstado(l.comp.audit_state))} />
                    <span className="text-xs font-bold">{l.codigo}</span>
                    <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">{nfmt(l.comp.nota ?? 0)}/{nfmt(l.comp.pontos)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{l.comp.nome}</p>
                  {(na > 0 || changedDe(l) || l.comp.audit_state === 'approved') && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {na > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">{na} alerta{na > 1 ? 's' : ''}</span>}
                      {changedDe(l) && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">alterado</span>}
                      {l.comp.audit_state === 'approved' && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">aprovado</span>}
                    </div>
                  )}
                </button>
              )
            })}
            {visiveis.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhum quesito neste filtro.</p>}
          </div>
        </aside>
        <ColResizer onDelta={(dx) => setW1((w) => clampW(w + dx, 180, 520))} />

        {/* ② VISUALIZADOR */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/10">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
              <button type="button" onClick={() => setAba('prova')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', aba === 'prova' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><ImageIcon className="h-3.5 w-3.5" /> PROVA</button>
              {!espelhoColuna && <button type="button" onClick={() => setAba('espelho')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', aba === 'espelho' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><FileText className="h-3.5 w-3.5" /> ESPELHO COMPLETO</button>}
              <button type="button" onClick={() => setAba('transcricao')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', aba === 'transcricao' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}><ScrollText className="h-3.5 w-3.5" /> TRANSCRIÇÃO</button>
            </div>
            {aba === 'espelho' && (espelhoPdfUrl || espelhoTexto) && (
              <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
                <button type="button" onClick={() => setEspelhoModo('pdf')} disabled={!espelhoPdfUrl} className={cn('rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40', espelhoModo === 'pdf' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>PDF</button>
                <button type="button" onClick={() => setEspelhoModo('texto')} disabled={!espelhoTexto} className={cn('rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40', espelhoModo === 'texto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>Texto</button>
              </div>
            )}
            <button type="button" onClick={() => { setEspelhoColuna((v) => !v); setAba('prova') }}
              className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors', espelhoColuna ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
              title="Mostrar o espelho como coluna ao lado da prova">
              <FileText className="h-3.5 w-3.5" /> Espelho ao lado
            </button>
            {aba === 'prova' && iaAtiva && (
              <button type="button" onClick={() => setShowDestaqueIA((v) => !v)}
                className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors', showDestaqueIA ? 'border-amber-400 bg-amber-100/60 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'text-muted-foreground hover:bg-muted')}>
                <Sparkles className="h-3.5 w-3.5" /> Destaque IA
              </button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">{ativo ? `${ativo.codigo}${ativo.comp.pagina ? ` · p. ${ativo.comp.pagina}` : ''}${ativo.comp.linhas ? ` · linhas ${ativo.comp.linhas}` : ''}` : ''}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            {aba === 'prova' ? (
              questaoAtiva && questaoAtiva.paginas.length ? (
                <CorrecaoFolha paginas={questaoAtiva.paginas} marcas={anotAtivas} paginaIndex={paginaIndex} onPagina={setPaginaIndex}
                  ferramenta={ferramenta} corAtiva={corAtiva} iconeAtivo={iconeAtivo}
                  selecionadaId={selecionadaId} onSelecionar={selecionarMarca} onCriar={criar} onAtualizar={atualizarMarca} focoId={focoId} focoKey={focoKey} />
              ) : <div className="flex h-full items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">Nenhuma foto enviada nesta questão.</div>
            ) : aba === 'transcricao' ? (
              <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><ScrollText className="h-3.5 w-3.5" /> Transcrição da resposta</span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={transcreverOCR} disabled={ocrPending != null || !questaoAtiva?.paginas.length}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60">
                      {ocrPending != null ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> OCR {ocrPending}%</> : <><ScanText className="h-3.5 w-3.5" /> Transcrever (OCR)</>}
                    </button>
                    {iaAtiva && (
                      <button type="button" onClick={sugerirIA} disabled={!!iaPending}
                        className="inline-flex items-center gap-1 rounded-md border border-violet-300/60 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-60 dark:text-violet-300">
                        {iaPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} IA
                      </button>
                    )}
                  </div>
                </div>
                <textarea value={questaoAtiva ? (transcricaoPorResp[questaoAtiva.respostaId] ?? '') : ''}
                  onChange={(e) => questaoAtiva && patchTranscricao(questaoAtiva.respostaId, e.target.value)}
                  onBlur={(e) => questaoAtiva && persistTranscricao(questaoAtiva.respostaId, e.target.value)}
                  placeholder="Transcreva a resposta do aluno aqui — ou use o OCR (motor próprio) ou a IA. Letra de mão costuma exigir correção manual."
                  className="min-h-0 flex-1 resize-none border-0 bg-transparent p-5 text-sm leading-relaxed outline-none focus:ring-0" />
                <p className="shrink-0 border-t px-4 py-1.5 text-[11px] text-muted-foreground">O OCR é um motor próprio (Tesseract) — excelente p/ texto impresso; em manuscrito costuma sair imperfeito, edite acima.</p>
              </div>
            ) : (espelhoModo === 'texto' && espelhoTexto) ? (
              <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex shrink-0 items-center gap-1.5 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Espelho (texto extraído do gabarito)</div>
                <p className="min-h-0 flex-1 select-text overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed">{espelhoTexto}</p>
              </div>
            ) : espelhoPdfUrl ? (
              <div className="h-full overflow-hidden rounded-lg border"><EspelhoPdf url={espelhoPdfUrl} /></div>
            ) : (
              <div className="mx-auto h-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-6">
                <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Nenhum PDF de gabarito/espelho no banco deste simulado. Importe o gabarito na área do Banco de Simulado (caderno Gabarito / Espelho).</p>
                <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Enunciado</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{questaoAtiva?.espelho.enunciado?.replace(/<[^>]+>/g, ' ') || '—'}</p>
              </div>
            )}
          </div>
          {/* ferramentas de anotação + marca selecionada */}
          {aba === 'prova' && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-card px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Anotar:</span>
              {(['destaque', 'ponto', 'icone', 'bolinha', 'texto', 'selecionar'] as Ferramenta[]).map((f) => (
                <button key={f} type="button" onClick={() => setFerramenta(f)} className={cn('rounded-md border px-2 py-0.5 font-medium capitalize transition-colors', ferramenta === f ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{f}</button>
              ))}
              {ferramenta === 'icone' && <span className="flex items-center gap-1">{Object.entries(ICONES).map(([k, Ic]) => <button key={k} type="button" onClick={() => setIconeAtivo(k)} className={cn('flex h-6 w-6 items-center justify-center rounded border', iconeAtivo === k ? 'border-primary bg-primary/10' : 'hover:bg-muted')}><Ic className="h-3.5 w-3.5" style={{ color: corAtiva }} /></button>)}</span>}
              {selecionada && <button type="button" onClick={() => removerMarca(selecionada.id)} className="ml-auto rounded-md border border-destructive/30 px-2 py-0.5 font-medium text-destructive hover:bg-destructive/5">Excluir marca</button>}
            </div>
          )}
        </div>

        {/* ESPELHO como coluna (opcional) */}
        {espelhoColuna && (<>
          <ColResizer onDelta={(dx) => setWEsp((w) => clampW(w - dx, 240, 720))} />
          <aside style={{ width: wEsp }} className="flex shrink-0 flex-col overflow-hidden border-l bg-card">
            {espelhoPdfUrl ? (
              <EspelhoPdf url={espelhoPdfUrl} />
            ) : (<>
              <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold text-muted-foreground"><FileText className="h-4 w-4" /> ESPELHO</div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Sem PDF de gabarito no banco. Importe-o no Banco de Simulado (caderno Gabarito / Espelho).</p>
                <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Enunciado</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{questaoAtiva?.espelho.enunciado?.replace(/<[^>]+>/g, ' ') || '—'}</p>
              </div>
            </>)}
          </aside>
        </>)}

        <ColResizer onDelta={(dx) => setW3((w) => clampW(w - dx, 320, 720))} />
        {/* ③ INSPETOR */}
        <aside style={{ width: w3 }} className="flex shrink-0 flex-col border-l bg-card">
          {!ativo ? <div className="m-3 text-sm text-muted-foreground">Selecione um quesito.</div> : (<>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {/* kicker + título */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-muted-foreground">{ativo.codigo}</span>
                <span className={cn('font-semibold uppercase tracking-wide', ativo.comp.audit_state === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : ativo.comp.audit_state === 'review' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{ativo.comp.audit_state === 'approved' ? 'Aprovado' : ativo.comp.audit_state === 'review' ? 'Revisar' : 'Pendente'}</span>
              </div>
              <h2 className="text-base font-bold leading-snug">{ativo.comp.nome}</h2>

              {/* Fase 3 — sugestão da IA p/ a questão inteira (o professor aprova). Só quando há chave. */}
              {iaAtiva && (
                <button type="button" onClick={sugerirIA} disabled={!!iaPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-300/60 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 py-2 text-sm font-semibold text-violet-700 transition-colors hover:from-violet-500/20 hover:to-fuchsia-500/20 disabled:opacity-60 dark:border-violet-500/40 dark:text-violet-300">
                  {iaPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A IA está analisando…</> : <><Sparkles className="h-4 w-4" /> Sugerir correção com IA</>}
                </button>
              )}

              {alertasAtivo.length > 0 && (
                <div className="space-y-1.5">
                  {alertasAtivo.map((a, i) => (
                    <p key={i} className={cn('flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-snug', a.sev === 'alto' ? 'border-destructive/30 bg-destructive/5 text-destructive' : a.sev === 'medio' ? 'border-amber-300/50 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' : 'border-sky-300/50 bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:text-sky-300')}>
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i + 1}. {a.msg}
                    </p>
                  ))}
                </div>
              )}

              {/* CONCEITO + PONTUAÇÃO */}
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Conceito</label>
                  <select value={ativo.comp.conceito} onChange={(e) => escolherConceito(ativo.key, e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
                    <option value="">—</option>
                    {ativo.comp.conceitos.map((cc) => <option key={cc.nome} value={cc.nome}>{cc.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pontuação</label>
                  <div className="mt-1 flex items-center gap-1">
                    <input type="number" step="0.01" min="0" max={ativo.comp.pontos} value={ativo.comp.nota ?? ''}
                      onChange={(e) => editarNota(ativo.key, Math.min(ativo.comp.pontos, Math.max(0, Number(e.target.value))))} onBlur={(e) => salvarCampo(ativo.key, { nota: Math.min(ativo.comp.pontos, Math.max(0, Number(e.target.value))) })}
                      className="h-9 w-full rounded-md border bg-card px-2 text-right text-sm font-semibold outline-none focus:ring-1 focus:ring-ring" />
                    <span className="text-xs text-muted-foreground">/ {nfmt(ativo.comp.pontos)}</span>
                  </div>
                </div>
              </div>

              {/* ① Trecho do aluno */}
              <Cartao n={1} titulo="Trecho do aluno" extra={ativo.comp.pagina ? `p. ${ativo.comp.pagina}` : ''}>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={ocrDispatch} disabled={ocrPending != null || !questaoAtiva?.paginas.length}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
                    title={regQuesito ? 'Lê SÓ o que está dentro da caixa de destaque (motor próprio)' : 'Transcreve a resposta na folha (motor próprio) e marca a área na prova'}>
                    {ocrPending != null ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> OCR {ocrPending}%</> : <><ScanText className="h-3.5 w-3.5" /> {regQuesito ? 'Ler área (OCR)' : 'Transcrever (OCR)'}</>}
                  </button>
                  {iaAtiva && (
                    <button type="button" onClick={iaDispatch} disabled={!!iaPending}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-300/60 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-60 dark:text-violet-300"
                      title={regQuesito ? 'IA lê SÓ o que está dentro da caixa de destaque' : 'Transcreve e sugere a correção com IA'}>
                      {iaPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {regQuesito ? 'Ler área (IA)' : 'IA'}
                    </button>
                  )}
                  <span className="text-[10px] leading-tight text-muted-foreground">{regQuesito ? 'lê exatamente dentro da caixa de destaque' : 'preenche o trecho + marca a área na prova'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input value={ativo.comp.pagina} onChange={(e) => patchQ(ativo.key, { pagina: e.target.value })} onBlur={(e) => salvarCampo(ativo.key, { pagina: e.target.value })} placeholder="pág." className="h-7 w-14 rounded border bg-[var(--input-bg,transparent)] px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
                  <input value={ativo.comp.linhas} onChange={(e) => patchQ(ativo.key, { linhas: e.target.value })} onBlur={(e) => salvarCampo(ativo.key, { linhas: e.target.value })} placeholder="linhas (ex.: 1-5)" className="h-7 w-28 rounded border bg-[var(--input-bg,transparent)] px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" onClick={() => verNaProva(ativo.key)} className="h-7 rounded border px-2 text-xs font-medium text-muted-foreground hover:bg-muted">Ver na prova</button>
                  <button type="button" onClick={() => { const nv = !ativo.comp.leituraDuvidosa; patchQ(ativo.key, { leituraDuvidosa: nv, ...(ativo.comp.audit_state === 'approved' ? { audit_state: 'pending' } : {}) }); salvarCampo(ativo.key, { leitura_duvidosa: nv }) }}
                    className={cn('h-7 rounded border px-2 text-xs font-medium', ativo.comp.leituraDuvidosa ? 'border-amber-400 bg-amber-100/60 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'text-muted-foreground hover:bg-muted')}>Marcar leitura</button>
                </div>
                <textarea value={ativo.comp.excerpt} onChange={(e) => patchQ(ativo.key, { excerpt: e.target.value })} onBlur={(e) => salvarCampo(ativo.key, { excerpt: e.target.value })} rows={3} placeholder="Transcreva o trecho do aluno referente a este quesito…" className="mt-1.5 w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </Cartao>

              {/* ② Espelho */}
              <Cartao n={2} titulo="Espelho" extra={ativo.comp.conceito || ''}>
                <textarea value={ativo.comp.descricao} onChange={(e) => patchQ(ativo.key, { descricao: e.target.value })} onBlur={(e) => salvarEspelho(ativo.comp.id, e.target.value)} rows={3} placeholder="O que o espelho espera neste quesito…" className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ativo.comp.conceitos.map((cc) => (
                    <button key={cc.nome} type="button" onClick={() => escolherConceito(ativo.key, cc.nome)}
                      className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors', ativo.comp.conceito === cc.nome ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                      {cc.nome} · {nfmt(cc.pontos)}
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-emerald-300/40 bg-emerald-50/60 p-2 dark:bg-emerald-900/15">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Alcançado</p>
                    <textarea value={ativo.comp.recognized.join('\n')} onChange={(e) => setArr(ativo.key, 'recognized', e.target.value)} onBlur={(e) => salvarCampo(ativo.key, { recognized: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} rows={3} placeholder="um por linha…" className="w-full resize-y bg-transparent text-[12px] leading-snug outline-none" />
                  </div>
                  <div className="rounded-md border border-rose-300/40 bg-rose-50/60 p-2 dark:bg-rose-900/15">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Faltou / equivocado</p>
                    <textarea value={ativo.comp.missing.join('\n')} onChange={(e) => setArr(ativo.key, 'missing', e.target.value)} onBlur={(e) => salvarCampo(ativo.key, { missing: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} rows={3} placeholder="um por linha…" className="w-full resize-y bg-transparent text-[12px] leading-snug outline-none" />
                  </div>
                </div>
              </Cartao>

              {/* ③ Fundamentação */}
              <Cartao n={3} titulo="Fundamentação da pontuação" extra="privado">
                <textarea value={ativo.comp.comentario} onChange={(e) => patchQ(ativo.key, { comentario: e.target.value })} onBlur={(e) => salvarCampo(ativo.key, { comentario: e.target.value })} rows={3} placeholder="Raciocínio técnico do desconto (só o corretor vê)…" className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </Cartao>

              {/* ④ Mensagem */}
              <Cartao n={4} titulo="Mensagem para o aluno" extra={ativo.comp.audit_state !== 'approved' ? '🔒' : ''}>
                {ativo.comp.audit_state !== 'approved' ? (
                  <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"><Lock className="mr-1 inline h-3 w-3" /> Primeiro aprove a análise e a pontuação deste quesito.</p>
                ) : (
                  <textarea value={ativo.comp.mensagem} onChange={(e) => patchQ(ativo.key, { mensagem: e.target.value })} onBlur={(e) => salvarCampo(ativo.key, { mensagem_aluno: e.target.value })} rows={4} placeholder="Mensagem ao aluno sobre este quesito…" className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                )}
              </Cartao>
            </div>

            {/* rodapé sticky */}
            <div className="flex shrink-0 items-center gap-2 border-t bg-card p-3">
              {ativo.comp.audit_state === 'approved' ? (
                <button type="button" onClick={() => mudarEstado(ativo.key, 'pending')} className="flex-1 rounded-lg border py-2 text-sm font-medium hover:bg-muted">Reabrir</button>
              ) : (
                <>
                  <button type="button" onClick={() => mudarEstado(ativo.key, 'review')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"><Flag className="h-4 w-4" /> Marcar para revisar</button>
                  <button type="button" onClick={() => mudarEstado(ativo.key, 'approved', true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"><Check className="h-4 w-4" /> Aprovar e próximo</button>
                </>
              )}
            </div>
          </>)}
        </aside>
      </div>
    </div>
  )
}

/** Painel do PDF do gabarito/espelho — renderizado via PDF.js (canvas): aparece SEM baixar. */
function EspelhoPdf({ url }: { url: string }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-3 py-1.5 text-[11px]">
        <span className="flex items-center gap-1.5 truncate font-semibold text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Gabarito / espelho (PDF do banco)</span>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/5">
          <ExternalLink className="h-3 w-3" /> Abrir em nova aba
        </a>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <PdfPreview url={url} titulo="gabarito" maxPag={40} className="absolute inset-0" />
      </div>
    </div>
  )
}

function Cartao({ n, titulo, extra, children }: { n: number; titulo: string; extra?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/10 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><span className="flex h-4 w-4 items-center justify-center rounded bg-primary/15 text-[10px] font-bold text-primary">{n}</span> {titulo}</p>
        {extra && <span className="text-[11px] text-muted-foreground">{extra}</span>}
      </div>
      {children}
    </div>
  )
}
