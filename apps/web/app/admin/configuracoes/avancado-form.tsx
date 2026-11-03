'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, Loader2, Captions } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const FONTES = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Nunito', 'Work Sans', 'Source Sans 3', 'DM Sans', 'Rubik', 'Mulish', 'Quicksand',
  'Merriweather', 'Playfair Display', 'Lora', 'Roboto Slab', 'Oswald', 'Bebas Neue',
]
const SEM = '__default__'
const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?' + FONTES.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;600`).join('&') + '&display=swap'

export function AvancadoForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [fonte, setFonte] = useState<string>(tema?.fonte ?? '')
  const [favicon, setFavicon] = useState<string>(tema?.favicon ?? '')
  const [pending, start] = useTransition()
  const fonteItems = { [SEM]: 'Padrão (sistema)', ...Object.fromEntries(FONTES.map((f) => [f, f])) }

  // Leitor de desafios (Lei Seca, Jurisprudência): oculta a barra de legenda dos grifos (categorias +
  // "Grifos do Revisão") em TODA a plataforma — para a marca "Revisão" não vazar em outras empresas.
  // Auto-save (não depende do botão Salvar abaixo); o nível módulo/documento ajusta exceções por baixo.
  const [ocultarLeg, setOcultarLeg] = useState<boolean>(!!tema?.leitor_ocultar_legenda_grifos)
  const [pendingLeg, startLeg] = useTransition()
  function toggleOcultarLeg() {
    const next = !ocultarLeg; setOcultarLeg(next)
    startLeg(async () => {
      try { await salvarTema({ leitor_ocultar_legenda_grifos: next }); toast.success(next ? 'Legenda de grifos ocultada nos leitores.' : 'Legenda de grifos reativada.') }
      catch (err) { setOcultarLeg(!next); toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  function salvar() {
    start(async () => {
      try {
        await salvarTema({ fonte: fonte || null, favicon: favicon || null })
        toast.success('Configurações avançadas salvas!')
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="max-w-xl space-y-5">
      {/* Leitor de desafios — interruptor por PLATAFORMA (auto-save) */}
      <div className="rounded-xl border bg-card p-4">
        <button type="button" role="switch" aria-checked={ocultarLeg} onClick={toggleOcultarLeg} disabled={pendingLeg}
          className="flex w-full items-start gap-3 text-left disabled:opacity-60">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Captions className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">Ocultar legenda de grifos nos leitores {pendingLeg && <Loader2 className="h-3.5 w-3.5 animate-spin" />}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Esconde a barra de categorias (Núcleo, Prazos, STF/STJ…) e o botão <b>“Grifos do Revisão”</b> em todos os leitores desta plataforma (Lei Seca e Jurisprudência). Use em empresas onde a marca “Revisão” não deve aparecer.</span>
          </span>
          <span className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${ocultarLeg ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ocultarLeg ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </button>
      </div>

      <div className="space-y-2">
        <Label>Fonte</Label>
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
        <Select value={fonte || SEM} onValueChange={(v) => setFonte(v && v !== SEM ? v : '')} items={fonteItems}>
          <SelectTrigger className="w-full" style={{ fontFamily: fonte ? `"${fonte}", sans-serif` : undefined }}>
            <SelectValue placeholder="Selecione uma fonte" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={SEM}>Padrão (sistema)</SelectItem>
            {FONTES.map((f) => (
              <SelectItem key={f} value={f} style={{ fontFamily: `"${f}", sans-serif`, fontSize: '1rem' }}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Cada opção é exibida na própria fonte. “Padrão” usa a fonte do sistema.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="favicon">URL do Favicon</Label>
        <Input id="favicon" type="url" value={favicon} onChange={(e) => setFavicon(e.target.value)} placeholder="https://cdn.exemplo.com/favicon.ico" />
        <p className="text-xs text-muted-foreground">Ícone da aba do navegador. A logo do sistema é definida em <span className="font-medium text-foreground">Identidade</span>.</p>
      </div>

      <button type="button" onClick={salvar} disabled={pending}
        className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
      </button>
    </div>
  )
}
