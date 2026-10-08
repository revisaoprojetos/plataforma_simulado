'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Heart, Timer, Coins, Image as ImageIcon, BookMarked, X, Plus, Trash2, Award, Music, Upload, Crop, ImagePlus, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TrilhaFundoCropper } from '@/components/admin/trilha-fundo-cropper'
import { salvarConfigDesafio, salvarImagensDesafio, salvarMateriasDesafio, renomearDesafio } from '@/app/admin/jurisprudencia/actions'

// Slots de imagem anexada: formato travado (igual ao enquadramento do fundo da trilha) + tamanho final.
const SLOTS = [
  { k: 'ticket' as const, label: 'Ticket', aspect: 4 / 3, box: 'aspect-[4/3]', fmt: '4:3', maxW: 800, maxH: 600 },
  { k: 'capa' as const, label: 'Capa', aspect: 4 / 5, box: 'aspect-[4/5]', fmt: '4:5', maxW: 600, maxH: 750 },
]
function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = src })
}
/** Rasteriza o recorte (frações 0..1) num JPEG limitado a maxW×maxH — resultado já enquadrado. */
async function rasterizarCrop(src: string, crop: { x: number; y: number; w: number; h: number }, maxW: number, maxH: number): Promise<string> {
  const im = await carregarImg(src)
  const sx = crop.x * im.naturalWidth, sy = crop.y * im.naturalHeight
  const sw = Math.max(1, crop.w * im.naturalWidth), sh = Math.max(1, crop.h * im.naturalHeight)
  const scale = Math.min(1, maxW / sw, maxH / sh)
  const cw = Math.max(1, Math.round(sw * scale)), ch = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d'); if (!ctx) return src
  ctx.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch)
  return canvas.toDataURL('image/jpeg', 0.85)
}

type Pontos = { ponto: number; vadeMecum: number; armadilha: number; tese: number; vida: number; labirintoLimpo: number }
type Config = {
  liberacao: 'progresso' | 'calendario'
  inicioCalendario: string
  vidas: number
  tempoResposta: number
  pontos: Pontos
  storageKey?: string
  musicaFundo?: string
  musicaLoop?: boolean
} | null
type Materia = { id: string; nome: string; curto: string; icon?: string; dias: number[]; cor?: string; iconeImg?: string }

const PONTOS_DEFAULT: Pontos = { ponto: 10, vadeMecum: 50, armadilha: 200, tese: 100, vida: 200, labirintoLimpo: 500 }
const PONTOS_CAMPOS: { k: keyof Pontos; label: string; desc: string }[] = [
  { k: 'ponto', label: 'Acerto (ponto)', desc: 'Por resposta certa' },
  { k: 'tese', label: 'Tese dominada', desc: 'Ao dominar uma tese' },
  { k: 'vadeMecum', label: 'Vade Mécum', desc: 'Bônus de coleta' },
  { k: 'vida', label: 'Vida extra', desc: 'Item de vida' },
  { k: 'armadilha', label: 'Armadilha', desc: 'Evitar/limpar armadilha' },
  { k: 'labirintoLimpo', label: 'Labirinto limpo', desc: 'Concluir sem erro' },
]
// Ícones de pixel art disponíveis no motor do jogo (ICON em jogo.js) — usados por matéria/selo final.
const ICONES = ['building', 'briefcase', 'doc', 'umbrella', 'folder', 'hardhat', 'dollar', 'rg', 'book', 'star', 'heart', 'lock', 'check', 'play']
// Tamanhos recomendados por imagem (mostrados na descrição do slot).
const DICAS_IMG: Record<string, string> = {
  ticket: '800×600 px (4:3) — card de acesso do aluno',
  capa: '600×750 px (4:5) — capa do desafio',
}

// Cores padrão por matéria no jogo (MCOL) — usadas como default do seletor de cor.
const MCOL_DEF: Record<string, string> = { adm: '#a78bfa', civ: '#3fd5ff', con: '#ff6fae', pre: '#4ef0a0', pc: '#ffa53d', tra: '#ff7a59', tri: '#ffd84d', rg: '#ffc83d' }
const corHex = (v: string | undefined, def = '#8b5cf6') => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def)
// Prévia do ícone no CHIP da COR da matéria (mostra o efeito de cor): imagem própria OU a pixel art (SVG branco).
function IconePreview({ icon, cor, img }: { icon?: string; cor?: string; img?: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md" style={{ background: cor || '#0b1150' }} title={icon ?? 'doc'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <img src={`/jurisprudencia/assets/icones/svg/icone-${icon ?? 'doc'}.svg`} alt="" className="h-5 w-5" />}
    </span>
  )
}

// Aba Configurações: nome do desafio + regras do jogo (config) + matérias/final + imagens anexadas.
export function JurisConfigForm({ desafioId, nome, config, materias, final, imagens }: {
  desafioId: string
  nome: string
  config: Config
  materias: Materia[]
  final: { id: string; nome: string; curto: string; icon?: string; dias: number[] } | null
  imagens: Record<string, any>
}) {
  // --- Nome do desafio (nome da pasta) ---
  const [nomeDesafio, setNomeDesafio] = useState(nome ?? '')
  const [pendNome, startNome] = useTransition()
  function salvarNome() {
    const n = nomeDesafio.trim()
    if (!n) { toast.error('Informe um nome.'); return }
    startNome(async () => {
      const r = await renomearDesafio(desafioId, n)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao renomear.'); return }
      toast.success('Nome do desafio salvo.')
    })
  }
  // --- Config --- (a LIBERAÇÃO dos dias foi movida p/ a aba "Dias & Teses"; preservamos as chaves no merge)
  const [vidas, setVidas] = useState(config?.vidas ?? 3)
  const [tempoResposta, setTempoResposta] = useState(config?.tempoResposta ?? 25)
  const [pontos, setPontos] = useState<Pontos>({ ...PONTOS_DEFAULT, ...(config?.pontos ?? {}) })
  const [musicaFundo, setMusicaFundo] = useState(config?.musicaFundo ?? '')
  const [musicaLoop, setMusicaLoop] = useState(config?.musicaLoop !== false) // padrão: em loop
  const musicaRef = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Para o áudio da prévia ao SAIR da aba/página (sem vazar som entre as páginas).
  useEffect(() => () => { try { musicaRef.current?.pause() } catch { /* ignora */ } }, [])
  function importarMusica(file: File | null | undefined) {
    if (!file) return
    if (!/^audio\//.test(file.type)) { toast.error('Selecione um arquivo de áudio (mp3, ogg, m4a…).'); return }
    if (file.size > 12 * 1024 * 1024) { toast.error('Arquivo muito grande (máx. 12 MB).'); return }
    const r = new FileReader()
    r.onload = () => { setMusicaFundo(String(r.result || '')); toast.success('Música importada. Clique em “Salvar regras” para aplicar.') }
    r.onerror = () => toast.error('Não foi possível ler o arquivo.')
    r.readAsDataURL(file)
  }
  const [pendCfg, startCfg] = useTransition()

  function salvarConfig() {
    startCfg(async () => {
      const novo = { ...(config ?? {}), vidas: Number(vidas) || 0, tempoResposta: Number(tempoResposta) || 0, pontos, musicaFundo: musicaFundo.trim(), musicaLoop }
      const r = await salvarConfigDesafio(desafioId, novo)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar configuração.'); return }
      // Reflete a URL final hospedada (data:audio importado vira URL do storage) — feedback + evita re-subir.
      if (typeof r.musicaFundo === 'string' && r.musicaFundo !== musicaFundo) setMusicaFundo(r.musicaFundo)
      toast.success('Configuração salva.')
    })
  }

  // --- Matérias + Selo final ---
  const [mats, setMats] = useState<Materia[]>(materias ?? [])
  const [fin, setFin] = useState<Materia>(final ?? { id: 'rg', nome: 'Selo final', curto: 'RG', icon: 'rg', dias: [15] })
  const [pendMat, startMat] = useTransition()
  const patchMat = (i: number, p: Partial<Materia>) => setMats((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...p } : m)))
  const removerMat = (i: number) => setMats((ms) => ms.filter((_, idx) => idx !== i))
  const addMat = () => setMats((ms) => [...ms, { id: 'm' + Date.now(), nome: '', curto: '', icon: 'doc', dias: [] }])
  function salvarMaterias() {
    startMat(async () => {
      const r = await salvarMateriasDesafio(desafioId, mats, fin)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar matérias.'); return }
      toast.success('Matérias salvas.')
    })
  }

  // --- Imagens ---
  const [imgs, setImgs] = useState<Record<string, string>>({ ticket: imagens?.ticket ?? '', capa: imagens?.capa ?? '' })
  const [pendImg, startImg] = useTransition()
  const [cropSlot, setCropSlot] = useState<'ticket' | 'capa' | null>(null)
  const ticketRef = useRef<HTMLInputElement>(null)
  const capaRef = useRef<HTMLInputElement>(null)
  const refDe = (k: 'ticket' | 'capa') => (k === 'ticket' ? ticketRef : capaRef)
  function enviarImagem(k: 'ticket' | 'capa', file: File | null | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    const r = new FileReader(); r.onload = () => setImgs((s) => ({ ...s, [k]: String(r.result) })); r.readAsDataURL(file)
  }
  async function aplicarEnquadramento(crop: { x: number; y: number; w: number; h: number }) {
    const slot = cropSlot; if (!slot) return
    const cfg = SLOTS.find((s) => s.k === slot)!
    try {
      const out = await rasterizarCrop(imgs[slot], crop, cfg.maxW, cfg.maxH)
      setImgs((s) => ({ ...s, [slot]: out }))
      toast.success('Enquadramento aplicado — clique em "Salvar imagens".')
    } catch { toast.error('Não foi possível reenquadrar esta imagem (hospedada sem permissão). Reenvie a imagem e ajuste.') }
    setCropSlot(null)
  }
  function salvarImagens() {
    startImg(async () => {
      const limpo: Record<string, string> = {}
      Object.entries(imgs).forEach(([k, v]) => { if (v && v.trim()) limpo[k] = v.trim() })
      const r = await salvarImagensDesafio(desafioId, limpo)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar imagens.'); return }
      toast.success('Imagens salvas.')
    })
  }

  return (
    <div className="space-y-5">
      {/* Nome do desafio */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Gamepad2 className="h-4 w-4 text-primary" /> Nome do desafio</h3>
        <p className="text-xs text-muted-foreground">Aparece na lista de desafios, no cabeçalho do admin e para o aluno.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome</span>
            <input value={nomeDesafio} onChange={(e) => setNomeDesafio(e.target.value)} placeholder="Ex.: Desafio de Jurisprudência 2026"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </label>
          <button type="button" onClick={salvarNome} disabled={pendNome || !nomeDesafio.trim() || nomeDesafio.trim() === (nome ?? '').trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pendNome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar nome
          </button>
        </div>
      </section>

      {/* Regras do jogo */}
      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Timer className="h-4 w-4 text-primary" /> Regras do jogo</h3>

        <p className="text-xs text-muted-foreground">A <b>liberação dos dias</b> (progresso/calendário) agora fica na aba <b>Dias &amp; Teses</b>.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Heart className="h-3.5 w-3.5" /> Vidas</span>
            <input type="number" min={1} value={vidas} onChange={(e) => setVidas(Number(e.target.value))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Timer className="h-3.5 w-3.5" /> Tempo por pergunta (segundos)</span>
            <input type="number" min={1} value={tempoResposta} onChange={(e) => setTempoResposta(Number(e.target.value))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </label>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Coins className="h-3.5 w-3.5" /> Tabela de pontos</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PONTOS_CAMPOS.map(({ k, label, desc }) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>
                </span>
                <input type="number" value={pontos[k]} onChange={(e) => setPontos((p) => ({ ...p, [k]: Number(e.target.value) }))}
                  className="w-20 shrink-0 rounded-md border bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Music className="h-3.5 w-3.5" /> Música de fundo</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">Importe um áudio (mp3/ogg/m4a, até 12 MB) ou cole uma URL. Toca em loop no jogo; o aluno regula o volume pelo controle na barra do som.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { importarMusica(e.target.files?.[0]); e.currentTarget.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5">
              <Upload className="h-4 w-4" /> Importar música
            </button>
            {musicaFundo.trim() && (
              <button type="button" onClick={() => { musicaRef.current?.pause(); setMusicaFundo('') }} title="Remover música"
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10">
                <Trash2 className="h-4 w-4" /> Remover
              </button>
            )}
          </div>
          <input value={musicaFundo} onChange={(e) => setMusicaFundo(e.target.value)} placeholder="https://… .mp3  (vazio = sem música)"
            className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          {musicaFundo.trim() && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio ref={musicaRef} src={musicaFundo.trim()} controls preload="metadata" loop={musicaLoop} className="mt-2 h-9 w-full" />
          )}
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={musicaLoop} onChange={(e) => setMusicaLoop(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Repetir em loop infinito (recomendado p/ trechos curtos)
          </label>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={salvarConfig} disabled={pendCfg} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pendCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar regras
          </button>
        </div>
      </section>

      {/* Matérias */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><BookMarked className="h-4 w-4 text-primary" /> Matérias</h3>
        <p className="text-xs text-muted-foreground">Nome, sigla, ícone (pixel art do jogo) e dias que cada matéria cobre.</p>
        <div className="space-y-2">
          {mats.map((m, i) => (
            <div key={m.id ?? i} className="space-y-2 rounded-lg border bg-background p-2">
              <div className="grid items-center gap-2 sm:grid-cols-[1fr_90px_110px_auto]">
                <input value={m.nome} onChange={(e) => patchMat(i, { nome: e.target.value })} placeholder="Nome da matéria"
                  className="rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                <input value={m.curto} onChange={(e) => patchMat(i, { curto: e.target.value })} placeholder="Sigla"
                  className="rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                <input value={(m.dias ?? []).join(', ')} onChange={(e) => patchMat(i, { dias: e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)) })}
                  placeholder="Dias (1, 2)" className="rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                <button type="button" onClick={() => removerMat(i)} title="Remover matéria" className="justify-self-end rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <IconePreview icon={m.icon} cor={m.cor || MCOL_DEF[m.id]} img={m.iconeImg} />
                <select value={m.icon ?? 'doc'} onChange={(e) => patchMat(i, { icon: e.target.value })}
                  className="rounded-md border bg-card px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  {ICONES.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Cor da matéria (efeito do cartucho/brilho)">
                  Cor
                  <input type="color" value={corHex(m.cor || MCOL_DEF[m.id])} onChange={(e) => patchMat(i, { cor: e.target.value })} className="h-8 w-9 cursor-pointer rounded border bg-transparent p-0" />
                </label>
                <input value={m.iconeImg ?? ''} onChange={(e) => patchMat(i, { iconeImg: e.target.value })} placeholder="Imagem do ícone (URL/base64) — opcional"
                  className="min-w-[200px] flex-1 rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
            </div>
          ))}
          {mats.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Nenhuma matéria definida.</p>}
          <button type="button" onClick={addMat} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Plus className="h-4 w-4" /> Adicionar matéria</button>
        </div>

        {/* Selo final (dia 15) */}
        <div className="rounded-lg border bg-muted/20 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Award className="h-3.5 w-3.5" /> Selo final (dia 15)</p>
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
              <input value={fin.nome} onChange={(e) => setFin((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome do selo final"
                className="rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              <input value={fin.curto} onChange={(e) => setFin((f) => ({ ...f, curto: e.target.value }))} placeholder="Sigla"
                className="rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <IconePreview icon={fin.icon} cor={fin.cor || MCOL_DEF[fin.id]} img={fin.iconeImg} />
              <select value={fin.icon ?? 'rg'} onChange={(e) => setFin((f) => ({ ...f, icon: e.target.value }))}
                className="rounded-md border bg-card px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                {ICONES.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Cor do selo final">
                Cor
                <input type="color" value={corHex(fin.cor || MCOL_DEF[fin.id])} onChange={(e) => setFin((f) => ({ ...f, cor: e.target.value }))} className="h-8 w-9 cursor-pointer rounded border bg-transparent p-0" />
              </label>
              <input value={fin.iconeImg ?? ''} onChange={(e) => setFin((f) => ({ ...f, iconeImg: e.target.value }))} placeholder="Imagem do ícone (URL/base64) — opcional"
                className="min-w-[200px] flex-1 rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={salvarMaterias} disabled={pendMat} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pendMat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar matérias
          </button>
        </div>
      </section>

      {/* Imagens anexadas */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-primary" /> Imagens anexadas</h3>
        <p className="text-xs text-muted-foreground">Ticket (card do aluno) e capa do desafio. Envie a imagem e use <strong>Ajustar</strong> para enquadrar (posicionar/ampliar no formato do card) — igual ao fundo da trilha.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SLOTS.map((cfg) => {
            const val = imgs[cfg.k]
            return (
              <div key={cfg.k} className="space-y-2">
                <span className="block text-xs font-medium text-muted-foreground">{cfg.label}</span>
                <span className="block text-[11px] text-muted-foreground">Recomendado: {DICAS_IMG[cfg.k]}</span>
                <input ref={refDe(cfg.k)} type="file" accept="image/*" className="hidden" onChange={(e) => { enviarImagem(cfg.k, e.target.files?.[0]); e.currentTarget.value = '' }} />
                {val ? (
                  <div className={cn('relative overflow-hidden rounded-lg border bg-muted/30', cfg.box)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={val} alt={cfg.label} className="absolute inset-0 h-full w-full object-cover" />
                    <button type="button" onClick={() => setImgs((s) => ({ ...s, [cfg.k]: '' }))} title="Remover" className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1 text-destructive shadow transition hover:bg-background"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div className={cn('flex items-center justify-center rounded-lg border border-dashed bg-muted/20 text-muted-foreground', cfg.box)}><ImageIcon className="h-6 w-6" /></div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => refDe(cfg.k).current?.click()}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-card py-2 text-xs font-medium transition-colors hover:bg-muted">
                    <ImagePlus className="h-3.5 w-3.5" /> {val ? 'Trocar' : 'Enviar'} imagem
                  </button>
                  {val && (
                    <button type="button" onClick={() => setCropSlot(cfg.k)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-primary/10 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
                      <Crop className="h-3.5 w-3.5" /> Ajustar
                    </button>
                  )}
                </div>
                <input value={val ?? ''} onChange={(e) => setImgs((s) => ({ ...s, [cfg.k]: e.target.value }))} placeholder="https://… ou data:image/…"
                  className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
            )
          })}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={salvarImagens} disabled={pendImg} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {pendImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar imagens
          </button>
        </div>
      </section>

      {/* Cropper de enquadramento (formato travado por slot) — mesmo editor do fundo da trilha. */}
      {cropSlot && imgs[cropSlot] && (() => {
        const cfg = SLOTS.find((s) => s.k === cropSlot)!
        return (
          <TrilhaFundoCropper
            src={imgs[cropSlot]}
            aspectInicial={cfg.aspect}
            aspectTravado={cfg.aspect}
            titulo={`Enquadrar ${cfg.label.toLowerCase()} (${cfg.fmt})`}
            onCancel={() => setCropSlot(null)}
            onConfirm={(crop) => aplicarEnquadramento(crop)}
          />
        )
      })()}
    </div>
  )
}
