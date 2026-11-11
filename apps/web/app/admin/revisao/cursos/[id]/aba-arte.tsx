'use client'

import { useRef, useState } from 'react'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CampoImagem, enviarImagemAdmin } from '@/components/admin/campo-imagem'
import { CursoCover } from '../curso-cover'
import { salvarArteAction } from '../actions'
import { useAcao } from '../ui-cursos'

export function AbaArte({ id, nome, tipo, d, podeEditar }: {
  id: string; nome: string; tipo: string; podeEditar: boolean
  d: { img_horizontal: string | null; img_vertical: string | null; img_banner: string | null; galeria: string[]; cor_principal: string; cor_destaque: string }
}) {
  const [pendente, executar] = useAcao()
  const [h, setH] = useState(d.img_horizontal ?? '')
  const [v, setV] = useState(d.img_vertical ?? '')
  const [b, setB] = useState(d.img_banner ?? '')
  const [gal, setGal] = useState<string[]>(d.galeria)
  const [c1, setC1] = useState(d.cor_principal)
  const [c2, setC2] = useState(d.cor_destaque)
  const [enviando, setEnviando] = useState(false)
  const inp = useRef<HTMLInputElement>(null)
  const lock = !podeEditar || pendente

  async function incluir(files: FileList | null) {
    if (!files?.length) return
    setEnviando(true)
    try {
      const urls: string[] = []
      for (const f of Array.from(files)) urls.push(await enviarImagemAdmin(f))
      setGal((g) => [...g, ...urls])
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar a imagem.') }
    setEnviando(false)
    if (inp.current) inp.current.value = ''
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div><h2 className="text-sm font-semibold">Artes do curso</h2><p className="mt-1 text-xs text-muted-foreground">Use as artes feitas no Gerador de ID do Revisão. JPG, PNG ou WEBP.</p></div>
        <div className="grid items-start gap-3 sm:grid-cols-3">
          <CampoImagem value={h} onChange={setH} disabled={lock} aspecto="16 / 9" rotulo="Capa horizontal · 1280 × 720" />
          <CampoImagem value={v} onChange={setV} disabled={lock} aspecto="2 / 3" rotulo="Capa vertical · 600 × 900" />
          <CampoImagem value={b} onChange={setB} disabled={lock} aspecto="4 / 1" rotulo="Banner do topo · 1600 × 400" />
        </div>
        <div><h2 className="text-sm font-semibold">Galeria de imagens do curso</h2><p className="mt-1 text-xs text-muted-foreground">Imagens para usar nos pop-ups, avisos e e-mails deste curso.</p></div>
        <div className="flex flex-wrap gap-3">
          {gal.map((g, i) => (
            <div key={g + i} className="relative size-28 rounded-xl border bg-muted bg-cover bg-center" style={{ backgroundImage: `url('${g}')` }}>
              <Button variant="outline" size="icon-sm" className="absolute right-1 top-1" aria-label="Remover imagem" disabled={lock} onClick={() => { setGal((x) => x.filter((_, j) => j !== i)); toast.success('Imagem removida da galeria') }}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
          <label className="flex size-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center text-xs text-muted-foreground hover:border-primary hover:text-primary">
            <input ref={inp} type="file" accept="image/*" multiple hidden disabled={lock || enviando} onChange={(e) => incluir(e.target.files)} />
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}<b>Incluir imagens</b><span>JPG, PNG ou WEBP</span>
          </label>
        </div>
        <h2 className="text-sm font-semibold">Cores do curso</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="color" value={c1} onChange={(e) => setC1(e.target.value)} disabled={lock} className="h-9 w-12 cursor-pointer rounded-md border bg-background p-0.5" />Cor principal</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="color" value={c2} onChange={(e) => setC2(e.target.value)} disabled={lock} className="h-9 w-12 cursor-pointer rounded-md border bg-background p-0.5" />Cor de destaque</label>
        </div>
        <p className="text-xs text-muted-foreground">A cor principal pinta o topo do curso e o card gerado quando não há capa. A cor de destaque vai nos botões e selos do curso.</p>
        <div><Button size="lg" disabled={lock} onClick={() => executar(() => salvarArteAction(id, { img_horizontal: h || null, img_vertical: v || null, img_banner: b || null, galeria: gal, cor_principal: c1, cor_destaque: c2 }), 'Capa e cores salvas')}><Check className="size-4" />Salvar capa e cores</Button></div>
      </section>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
        <div className="text-xs font-semibold text-muted-foreground">Como o aluno vê</div>
        <div className="overflow-hidden rounded-2xl p-5 text-white shadow-sm" style={{ background: b ? `center/cover url('${b}')` : `linear-gradient(165deg, ${c1}, color-mix(in srgb, ${c1} 55%, black))` }}>
          <small className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: c2 }}>{tipo}</small>
          <b className="mt-1 block text-xl leading-tight">{nome}</b>
          <span className="mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-bold text-black" style={{ background: c2 }}>Continuar estudando</span>
        </div>
        <div className="w-44 overflow-hidden rounded-xl border bg-card shadow-sm">
          {v ? <div className="aspect-[2/3] bg-cover bg-center" style={{ backgroundImage: `url('${v}')` }} /> : <CursoCover nome={nome} c1={c1} c2={c2} img={h || null} className="aspect-[2/3]" />}
          <div className="p-2 text-xs font-bold">{nome}</div>
        </div>
      </aside>
    </div>
  )
}
