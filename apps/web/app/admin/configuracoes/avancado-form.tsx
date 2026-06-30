'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  const [usarFonteCor, setUsarFonteCor] = useState<boolean>(typeof tema?.fonte_cor === 'string')
  const [fonteCor, setFonteCor] = useState<string>(tema?.fonte_cor ?? '#111111')
  const [favicon, setFavicon] = useState<string>(tema?.favicon ?? '')
  const [logoClaro, setLogoClaro] = useState<string>(tema?.logo_url ?? '')
  const [logoEscuro, setLogoEscuro] = useState<string>(tema?.logo_dark_url ?? '')
  const [pending, start] = useTransition()
  const fonteItems = { [SEM]: 'Padrão (sistema)', ...Object.fromEntries(FONTES.map((f) => [f, f])) }

  function salvar() {
    start(async () => {
      try {
        await salvarTema({ fonte: fonte || null, fonte_cor: usarFonteCor ? fonteCor : null, favicon: favicon || null, logo_url: logoClaro || null, logo_dark_url: logoEscuro || null })
        toast.success('Configurações avançadas salvas!')
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-2">
        <Label>Fonte</Label>
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
        <Select value={fonte || SEM} onValueChange={(v) => setFonte(v === SEM ? '' : v)} items={fonteItems}>
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

      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="usar-fonte-cor" className="cursor-pointer">Cor da fonte do sistema</Label>
          <Switch id="usar-fonte-cor" checked={usarFonteCor} onCheckedChange={setUsarFonteCor} />
        </div>
        {usarFonteCor ? (
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-8 w-10 shrink-0 overflow-hidden rounded-md border">
              <span className="absolute inset-0" style={{ background: fonteCor }} />
              <input type="color" value={fonteCor} onChange={(e) => setFonteCor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </span>
            <Input value={fonteCor} onChange={(e) => setFonteCor(e.target.value)} placeholder="#111111" className="w-36" />
            <span className="text-sm" style={{ color: fonteCor }}>Prévia do texto</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Usa a cor de texto padrão do sistema (varia conforme claro/escuro). Ative para definir uma cor fixa.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="favicon">URL do Favicon</Label>
        <Input id="favicon" type="url" value={favicon} onChange={(e) => setFavicon(e.target.value)} placeholder="https://cdn.exemplo.com/favicon.ico" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="logo-claro">URL do Logotipo (tema claro)</Label>
        <Input id="logo-claro" type="url" value={logoClaro} onChange={(e) => setLogoClaro(e.target.value)} placeholder="https://cdn.exemplo.com/logo.png" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="logo-escuro">URL do Logotipo (tema escuro)</Label>
        <Input id="logo-escuro" type="url" value={logoEscuro} onChange={(e) => setLogoEscuro(e.target.value)} placeholder="https://cdn.exemplo.com/logo-dark.png" />
      </div>

      <button type="button" onClick={salvar} disabled={pending}
        className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
      </button>
    </div>
  )
}
