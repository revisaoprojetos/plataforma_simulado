'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Contact, ImagePlus, X, Plus, Images } from 'lucide-react'
import { REACOES_MASCOTE } from '@/components/mascote/mascote'
import { cn } from '@/lib/utils'

const MASCOTE = REACOES_MASCOTE.map((r) => ({ url: `/mascote/${r.id}.png`, nome: r.nome }))

/**
 * Personalização do perfil do aluno (por tenant): AVATARES (poses da capivara), FUNDOS (imagens
 * longas — upload ou capas do sistema) e CORES de fundo. Salvo em `tema.personalizacao_aluno`.
 * Fundos entram como base64 e são hospedados pelo salvarTema (hospedarBase64NoObjeto).
 */
export function PersonalizacaoForm({ tema, salvarTema, capasSistema = [] }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void>; capasSistema?: string[] }) {
  const p = (tema?.personalizacao_aluno ?? {}) as { avatares?: string[]; fundos?: string[]; cores?: string[] }
  const [avatares, setAvatares] = useState<string[]>(Array.isArray(p.avatares) ? p.avatares : MASCOTE.map((m) => m.url))
  const [fundos, setFundos] = useState<string[]>(Array.isArray(p.fundos) ? p.fundos : [])
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const marcar = (fn: () => void) => { fn(); setDirty(true) }

  const toggleAvatar = (url: string) => marcar(() => setAvatares((l) => (l.includes(url) ? l.filter((x) => x !== url) : [...l, url])))
  const toggleFundo = (url: string) => marcar(() => setFundos((l) => (l.includes(url) ? l.filter((x) => x !== url) : [...l, url])))

  function addFundoUpload(file: File) {
    const reader = new FileReader()
    reader.onload = () => marcar(() => setFundos((l) => [...l, reader.result as string]))
    reader.readAsDataURL(file)
  }

  function salvar() {
    start(async () => {
      try {
        await salvarTema({ personalizacao_aluno: { avatares, fundos } })
        setDirty(false); toast.success('Personalização salva!')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar') }
    })
  }

  const capasDisponiveis = capasSistema.filter((c) => !fundos.includes(c))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Escolha o que os alunos podem usar no perfil. Eles só verão as opções liberadas aqui.</p>

      {/* Avatares (poses da capivara) */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Contact className="h-4 w-4 text-primary" /> Avatares (capivara)</div>
        <p className="mb-3 text-xs text-muted-foreground">Toque para liberar/bloquear cada pose — as destacadas ficam disponíveis para o aluno. ({avatares.length} liberadas)</p>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
          {MASCOTE.map((m) => {
            const on = avatares.includes(m.url)
            return (
              <button key={m.url} type="button" onClick={() => toggleAvatar(m.url)} title={m.nome}
                className={cn('flex aspect-square items-center justify-center rounded-lg border p-1 transition-all', on ? 'border-primary bg-primary/10' : 'opacity-35 hover:opacity-100')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.nome} className="h-full w-full object-contain" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Fundos (imagens longas) */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ImagePlus className="h-4 w-4 text-primary" /> Fundos do card (imagens)</div>
        <p className="mb-3 text-xs text-muted-foreground">Imagens largas (banners). O aluno escolhe uma delas como fundo do card de perfil.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fundos.map((u, i) => (
            <div key={i} className="group relative aspect-[16/9] overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => marcar(() => setFundos((l) => l.filter((_, k) => k !== i)))}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <label className="flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            <ImagePlus className="h-5 w-5" /> Enviar imagem
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFundoUpload(f); e.currentTarget.value = '' }} />
          </label>
        </div>

        {/* Capas largas já existentes no sistema — modelos prontos para usar como fundo. */}
        {capasDisponiveis.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Images className="h-3.5 w-3.5" /> Ou use uma capa do sistema</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {capasDisponiveis.map((u) => (
                <button key={u} type="button" onClick={() => toggleFundo(u)} title="Adicionar aos fundos"
                  className="group relative aspect-[16/9] overflow-hidden rounded-lg border opacity-70 transition-all hover:border-primary/50 hover:opacity-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"><Plus className="h-5 w-5" /></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button type="button" onClick={salvar} disabled={pending || !dirty}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar personalização
      </button>
    </div>
  )
}
