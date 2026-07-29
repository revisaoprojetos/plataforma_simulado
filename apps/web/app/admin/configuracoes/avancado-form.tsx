'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, Loader2 } from 'lucide-react'
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
