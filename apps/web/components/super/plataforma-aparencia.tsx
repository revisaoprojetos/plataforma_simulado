'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save, Palette, GraduationCap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { salvarAparenciaAction } from '@/app/admin/tenants/actions'

export type AparenciaInicial = {
  nome_site: string; subtitulo_site: string; titulo_pagina: string
  cor_primaria: string; cor_secundaria: string; cor_accent: string
  modo_padrao: string; logoAtual: string | null
}

const MODOS = [{ v: 'light', r: 'Claro' }, { v: 'dark', r: 'Escuro' }, { v: 'system', r: 'Sistema' }]

export function PlataformaAparencia({ tenantId, inicial }: { tenantId: string; inicial: AparenciaInicial }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [nome, setNome] = useState(inicial.nome_site)
  const [subtitulo, setSubtitulo] = useState(inicial.subtitulo_site)
  const [titulo, setTitulo] = useState(inicial.titulo_pagina)
  const [primaria, setPrimaria] = useState(inicial.cor_primaria || '#5a4b9a')
  const [secundaria, setSecundaria] = useState(inicial.cor_secundaria || '#ffffff')
  const [accent, setAccent] = useState(inicial.cor_accent || '#f4c430')
  const [modo, setModo] = useState(inicial.modo_padrao || 'light')
  const [logo, setLogo] = useState('')

  function salvar() {
    start(async () => {
      const r = await salvarAparenciaAction(tenantId, {
        nome_site: nome, subtitulo_site: subtitulo, titulo_pagina: titulo,
        cor_primaria: primaria, cor_secundaria: secundaria, cor_accent: accent,
        modo_padrao: modo, logo_url: logo,
      })
      if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar.'); return }
      toast.success('Aparência atualizada.'); setLogo(''); router.refresh()
    })
  }

  const escuro = modo === 'dark'
  const previewLogo = logo.trim() || inicial.logoAtual

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,340px)]">
      {/* Editor */}
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="h-4 w-4" /></span>
          <h2 className="text-sm font-semibold">Identidade visual</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Nome do site</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Simulado Revisão" /></div>
          <div className="space-y-1.5"><Label>Subtítulo</Label><Input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="Ex.: Ensino Jurídico" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Título da aba do navegador</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Simulado Revisão — Plataforma" /></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CorField label="Primária" value={primaria} onChange={setPrimaria} />
          <CorField label="Secundária" value={secundaria} onChange={setSecundaria} />
          <CorField label="Destaque (accent)" value={accent} onChange={setAccent} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Modo padrão</Label>
            <div className="flex gap-1.5">
              {MODOS.map((m) => (
                <button key={m.v} type="button" onClick={() => setModo(m.v)}
                  className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition', modo === m.v ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted')}>{m.r}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Logo por URL <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://… (deixe vazio p/ manter)" />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">O upload de logo (imagem) e o modo avançado de cores (tokens) continuam no painel da plataforma. Aqui você ajusta a marca principal.</p>

        <Button onClick={salvar} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar aparência
        </Button>
      </div>

      {/* Preview ao vivo */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia</p>
        <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ background: escuro ? '#15121e' : '#f6f7fb' }}>
          {/* topbar */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: primaria }}>
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg" style={{ background: secundaria }}>
              {previewLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewLogo} alt="" className="h-full w-full object-contain" />
              ) : <GraduationCap className="h-4 w-4" style={{ color: primaria }} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">{nome || 'Nome do site'}</p>
              <p className="truncate text-[11px] leading-tight text-white/70">{subtitulo || 'Subtítulo'}</p>
            </div>
          </div>
          {/* conteúdo */}
          <div className="space-y-3 p-4">
            <div className="rounded-xl border p-3" style={{ background: escuro ? '#1e1a2b' : '#ffffff', borderColor: escuro ? '#2a2440' : '#e5e7eb' }}>
              <p className="text-sm font-semibold" style={{ color: escuro ? '#e8e6f5' : '#241f3a' }}>Card de exemplo</p>
              <p className="text-xs" style={{ color: escuro ? '#a29fc0' : '#6b7280' }}>Como o aluno vê a sua marca.</p>
            </div>
            <button className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: primaria }}>Botão primário</button>
            <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: accent + '33', color: accent }}>Destaque</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  )
}
