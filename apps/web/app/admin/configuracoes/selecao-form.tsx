'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Upload, X, Loader2, Save, Building2, ArrowRight, GraduationCap, Monitor } from 'lucide-react'

/**
 * Aparência desta plataforma na tela "Escolha a plataforma" (o seletor pós-login,
 * onde quem tem acesso a mais de uma plataforma escolhe qual abrir).
 * Configura a logo do card + prévia FIEL ao seletor real, e é REALMENTE conectada:
 * o seletor (/api/auth/minhas-plataformas e /api/aluno/minhas-plataformas) lê
 * logo_selecao_url ?? logo_dark_url ?? logo_url.
 */
export function SelecaoForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const nome = (tema?.nome_site as string) || 'Minha plataforma'
  const fallback = (typeof tema?.logo_dark_url === 'string' && tema.logo_dark_url) || (typeof tema?.logo_url === 'string' && tema.logo_url) || null
  const [logo, setLogo] = useState<string | null>(tema?.logo_selecao_url ?? null)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLInputElement>(null)

  const imgPreview = logo ?? fallback

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => { setLogo(String(r.result)); setDirty(true) }; r.readAsDataURL(f)
  }
  function remover() { setLogo(null); setDirty(true) }
  function salvar() {
    start(async () => {
      try { await salvarTema({ logo_selecao_url: logo }); setDirty(false); toast.success('Aparência da seleção salva!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* ── Config ── */}
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Logo no seletor</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">A imagem que representa esta plataforma na tela <span className="font-medium text-foreground">“Escolha a plataforma”</span>. Se vazia, usa a logo do sistema.</p>

          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
          <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
            <button type="button" onClick={() => ref.current?.click()} title={logo ? 'Trocar imagem' : 'Enviar imagem'}
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
              {imgPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgPreview} alt="" className="h-full w-full object-cover" />
              ) : <Building2 className="h-6 w-6 text-muted-foreground" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{logo ? 'Logo personalizada' : fallback ? 'Usando a logo do sistema' : 'Sem logo'}</p>
              <p className="truncate text-[10px] text-muted-foreground">PNG/JPG · aparece redonda no card</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => ref.current?.click()} title={logo ? 'Trocar' : 'Enviar'}
                className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:border-primary hover:text-primary"><Upload className="h-3.5 w-3.5" /></button>
              {logo && (
                <button type="button" onClick={remover} title="Usar a logo do sistema"
                  className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:border-destructive hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">O <span className="font-medium text-foreground">nome</span> (“{nome}”) vem da aba <span className="font-medium text-foreground">Identidade</span>.</p>
        </div>

        <button type="button" onClick={salvar} disabled={pending || !dirty}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar aparência da seleção
        </button>
      </div>

      {/* ── Prévia FIEL ao seletor real ── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Monitor className="h-4 w-4 text-primary" /> Prévia — tela de seleção</div>
          <div className="overflow-hidden rounded-lg border shadow-sm">
            <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
              <span className="h-3 w-3 rounded-full bg-red-400" /><span className="h-3 w-3 rounded-full bg-yellow-400" /><span className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 flex-1 truncate rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">app/login</span>
            </div>
            <div className="flex items-center justify-center p-8" style={{ background: 'linear-gradient(180deg,#ffffff,#f6f7fb)' }}>
              <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-24px_rgba(15,23,42,.25)]">
                <div className="mb-5 flex flex-col items-center gap-2 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900"><GraduationCap className="h-6 w-6 text-white" /></span>
                  <div>
                    <p className="text-base font-bold text-slate-900">Escolha a plataforma</p>
                    <p className="text-[11px] text-slate-500">Selecione onde deseja entrar.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {imgPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgPreview} alt="" className="h-full w-full object-cover" />
                    ) : <Building2 className="h-5 w-5 text-slate-400" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{nome}</span>
                    <span className="block text-[11px] text-slate-500">Clique para entrar</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <p className="mt-4 text-center text-[11px] text-slate-400">Entrar com outra conta</p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">É assim que sua plataforma aparece para quem tem acesso a mais de uma. A tela em si é neutra (igual para todas).</p>
        </div>
      </div>
    </div>
  )
}
