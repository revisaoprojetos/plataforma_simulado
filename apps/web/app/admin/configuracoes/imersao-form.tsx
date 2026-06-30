'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, Loader2, Check, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TelaImersao, ESTILOS_IMERSAO, type EstiloImersao } from '@/components/admin/tela-imersao'

export function ImersaoForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [estilo, setEstilo] = useState<EstiloImersao>((tema?.splash_estilo as EstiloImersao) ?? 'spinner')
  const [logo, setLogo] = useState<string | null>(tema?.splash_logo ?? null)
  const [mensagem, setMensagem] = useState<string>(tema?.splash_mensagem ?? 'Preparando seu simulado…')
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const logoEfetiva = logo ?? tema?.logo_url ?? null

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogo(String(reader.result))
    reader.readAsDataURL(file)
  }

  function salvar() {
    start(async () => {
      try { await salvarTema({ splash_estilo: estilo, splash_logo: logo, splash_mensagem: mensagem || null }); toast.success('Tela de carregamento salva!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Controles */}
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Estilo da tela</p>
          <div className="grid grid-cols-1 gap-2">
            {ESTILOS_IMERSAO.map((e) => (
              <button key={e.id} type="button" onClick={() => setEstilo(e.id)}
                className={cn('relative rounded-lg border-2 p-2.5 text-left text-sm transition-colors', estilo === e.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                {estilo === e.id && <Check className="absolute right-2 top-2.5 h-4 w-4 text-primary" />}
                {e.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo da tela</Label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground hover:border-primary">
            <span className="flex h-16 items-center justify-center overflow-hidden rounded-lg">
              {logoEfetiva ? <img src={logoEfetiva} alt="logo" className="h-full w-auto object-contain" /> : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-2xl font-bold text-primary-foreground">{(tema?.nome_site?.[0] ?? 'P').toUpperCase()}</span>}
            </span>
            <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> {logo ? 'Trocar logo' : 'Enviar logo'}</span>
          </button>
          {logo && <button type="button" onClick={() => setLogo(null)} className="text-xs text-muted-foreground hover:text-foreground">Usar a logo do sistema</button>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="msg">Mensagem</Label>
          <Input id="msg" value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Preparando seu simulado…" />
        </div>

        <button type="button" onClick={salvar} disabled={pending}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
      </div>

      {/* Prévia */}
      <div className="rounded-xl border bg-muted/30 p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia (tela cheia ao carregar)</p>
        <div className="overflow-hidden rounded-lg border">
          <TelaImersao key={estilo} estilo={estilo} logo={logoEfetiva} nome={tema?.nome_site ?? 'Plataforma'} mensagem={mensagem} compacto />
        </div>
      </div>
    </div>
  )
}
