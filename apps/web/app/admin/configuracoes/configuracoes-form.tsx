'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TenantTema } from '@/lib/tenant-theme'

// Fontes Google disponíveis para a marca. Cada item é renderizado na própria fonte.
const FONTES = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Nunito', 'Work Sans', 'Source Sans 3', 'DM Sans', 'Rubik', 'Mulish', 'Quicksand',
  'Merriweather', 'Playfair Display', 'Lora', 'Roboto Slab', 'Oswald', 'Bebas Neue',
]
const SEM_FONTE = '__default__'
// URL única do Google Fonts que carrega todas as opções (para o preview na lista).
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  FONTES.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;600`).join('&') +
  '&display=swap'

// ─── Live preview component ──────────────────────────────────────────────────

interface PreviewProps {
  primary: string
  secondary: string
  accent: string
  fonte: string
}

function LivePreview({ primary, secondary, accent, fonte }: PreviewProps) {
  const style = {
    '--preview-primary': primary || '#000000',
    '--preview-secondary': secondary || '#f3f4f6',
    '--preview-accent': accent || '#e5e7eb',
    fontFamily: fonte ? `"${fonte}", sans-serif` : undefined,
  } as React.CSSProperties

  return (
    <div style={style} className="rounded-lg border p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Prévia ao vivo
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded px-4 py-1.5 text-sm font-medium"
          style={{
            background: 'var(--preview-primary)',
            color: '#fff',
          }}
        >
          Botão Primário
        </button>
        <button
          type="button"
          className="rounded px-4 py-1.5 text-sm font-medium border"
          style={{
            background: 'var(--preview-secondary)',
          }}
        >
          Secundário
        </button>
        <button
          type="button"
          className="rounded px-4 py-1.5 text-sm font-medium"
          style={{
            background: 'var(--preview-accent)',
          }}
        >
          Accent
        </button>
      </div>
      <div
        className="rounded p-3 text-sm"
        style={{ background: 'var(--preview-primary)', color: '#fff' }}
      >
        <p className="font-semibold">Card com cor primária</p>
        <p className="opacity-80 text-xs mt-0.5">Assim ficaria um cabeçalho com esta cor.</p>
      </div>
      <div
        className="rounded p-3 text-sm border"
        style={{ background: 'var(--preview-secondary)' }}
      >
        <p className="font-semibold">Card com cor secundária</p>
        <p className="text-muted-foreground text-xs mt-0.5">Fundo de seções secundárias.</p>
      </div>
    </div>
  )
}

// ─── Main form ───────────────────────────────────────────────────────────────

interface ConfiguracoesFormProps {
  tema: TenantTema | null
  salvarTema: (formData: FormData) => Promise<void>
}

export function ConfiguracoesForm({ tema, salvarTema }: ConfiguracoesFormProps) {
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Live-preview state — seeded from DB values
  const [primary, setPrimary] = useState<string>(
    tema?.cor_primaria && tema.cor_primaria.startsWith('#') ? tema.cor_primaria : '#6d28d9',
  )
  const [secondary, setSecondary] = useState<string>(
    tema?.cor_secundaria && tema.cor_secundaria.startsWith('#') ? tema.cor_secundaria : '#f3f4f6',
  )
  const [accent, setAccent] = useState<string>(
    tema?.cor_accent && tema.cor_accent.startsWith('#') ? tema.cor_accent : '#e5e7eb',
  )
  const [fonte, setFonte] = useState<string>(tema?.fonte ?? '')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      try {
        await salvarTema(formData)
        toast.success('Tema salvo com sucesso!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar tema')
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* ── Identidade Visual ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Identidade Visual</CardTitle>
          <CardDescription>
            Configure a aparência da plataforma (white-label). As alterações se refletem
            imediatamente para todos os estudantes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Left: inputs */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cor_primaria_text">Cor Primária</Label>
                <div className="flex items-center gap-3">
                  {/* Color picker syncs state; name-less so it doesn't submit separately */}
                  <input
                    id="cor_primaria"
                    type="color"
                    value={primary.startsWith('#') ? primary : '#6d28d9'}
                    onChange={(e) => setPrimary(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-0.5"
                    aria-label="Seletor de cor primária"
                  />
                  {/* Text input is the source of truth — carries the actual form value */}
                  <Input
                    id="cor_primaria_text"
                    name="cor_primaria"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                    placeholder="#6d28d9 ou oklch(0.5 0.2 300)"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Aceita hex (#rrggbb) ou oklch(). Ex: #6d28d9 para roxo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor_secundaria_text">Cor Secundária</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="cor_secundaria"
                    type="color"
                    value={secondary.startsWith('#') ? secondary : '#f3f4f6'}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-0.5"
                    aria-label="Seletor de cor secundária"
                  />
                  <Input
                    id="cor_secundaria_text"
                    name="cor_secundaria"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value)}
                    placeholder="#f3f4f6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor_accent_text">Cor de Destaque (Accent)</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="cor_accent"
                    type="color"
                    value={accent.startsWith('#') ? accent : '#e5e7eb'}
                    onChange={(e) => setAccent(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-0.5"
                    aria-label="Seletor de cor de destaque"
                  />
                  <Input
                    id="cor_accent_text"
                    name="cor_accent"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    placeholder="#e5e7eb"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fonte">Fonte</Label>
                {/* Carrega as fontes para que cada opção apareça na própria tipografia */}
                <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
                {/* Valor real submetido no formulário */}
                <input type="hidden" name="fonte" value={fonte} />
                <Select
                  value={fonte || SEM_FONTE}
                  onValueChange={(v) => setFonte(v === SEM_FONTE ? '' : (v ?? ''))}
                >
                  <SelectTrigger
                    id="fonte"
                    className="w-full"
                    style={{ fontFamily: fonte ? `"${fonte}", sans-serif` : undefined }}
                  >
                    <SelectValue placeholder="Selecione uma fonte" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={SEM_FONTE}>Padrão (sistema)</SelectItem>
                    {FONTES.map((f) => (
                      <SelectItem key={f} value={f} style={{ fontFamily: `"${f}", sans-serif`, fontSize: '1rem' }}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cada opção é exibida na própria fonte. Deixe em “Padrão” para usar a fonte do sistema.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="logo_url">URL do Logotipo (tema claro)</Label>
                <Input
                  id="logo_url"
                  name="logo_url"
                  type="url"
                  defaultValue={tema?.logo_url ?? ''}
                  placeholder="https://cdn.exemplo.com/logo.png"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo_dark_url">URL do Logotipo (tema escuro)</Label>
                <Input
                  id="logo_dark_url"
                  name="logo_dark_url"
                  type="url"
                  defaultValue={tema?.logo_dark_url ?? ''}
                  placeholder="https://cdn.exemplo.com/logo-dark.png"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="favicon">URL do Favicon</Label>
                <Input
                  id="favicon"
                  name="favicon"
                  type="url"
                  defaultValue={tema?.favicon ?? ''}
                  placeholder="https://cdn.exemplo.com/favicon.ico"
                />
              </div>
            </div>

            {/* Right: live preview */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Prévia</p>
              <LivePreview
                primary={primary}
                secondary={secondary}
                accent={accent}
                fonte={fonte}
              />
              <p className="text-xs text-muted-foreground">
                A prévia usa as cores hex diretamente. A página real converte para oklch
                e aplica automaticamente no dark mode também.
              </p>
            </div>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar Identidade Visual'}
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}
