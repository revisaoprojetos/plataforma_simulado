'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sun, Moon, Save, Check, Trash2, Loader2, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'

// Campos que um "modelo" (preset) captura do tema atual para reaplicar depois.
const CAMPOS_MODELO = [
  'cores', 'cores_dark', 'fonte', 'fonte_cor', 'logo_url', 'logo_dark_url', 'favicon',
  'modo_padrao', 'nome_site', 'titulo_pagina', 'splash_estilo', 'splash_logo',
  'splash_mensagem', 'loading_estilo',
] as const

type Modelo = { id: string; nome: string; dados: Record<string, unknown> }
type Salvar = (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void>

export function TemaSistemaForm({ tema, salvarTema }: { tema: any; salvarTema: Salvar }) {
  const [modo, setModo] = useState<'light' | 'dark'>(tema?.modo_padrao === 'dark' ? 'dark' : 'light')
  const [modelos, setModelos] = useState<Modelo[]>(Array.isArray(tema?.modelos) ? tema.modelos : [])
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()
  const [acting, setActing] = useState<string | null>(null)

  function salvarModo(m: 'light' | 'dark') {
    setModo(m)
    start(async () => {
      await salvarTema({ modo_padrao: m })
      toast.success(`Modo padrão do sistema: ${m === 'dark' ? 'Escuro' : 'Claro'}`)
    })
  }

  function salvarModelo() {
    if (!nome.trim()) { toast.error('Dê um nome ao modelo.'); return }
    const dados: Record<string, unknown> = { modo_padrao: modo }
    for (const c of CAMPOS_MODELO) if (tema?.[c] !== undefined) dados[c] = tema[c]
    const novo: Modelo = { id: crypto.randomUUID(), nome: nome.trim(), dados }
    const lista = [...modelos, novo]
    setModelos(lista); setNome('')
    start(async () => { await salvarTema({ modelos: lista }); toast.success(`Modelo "${novo.nome}" salvo`) })
  }

  function aplicar(m: Modelo) {
    setActing(m.id)
    start(async () => {
      await salvarTema({ ...m.dados })
      setActing(null)
      toast.success(`Modelo "${m.nome}" aplicado`)
      window.location.reload() // recarrega o tema injetado no layout
    })
  }

  async function excluir(m: Modelo) {
    if (!(await confirmar({ mensagem: `Excluir o modelo "${m.nome}"?`, destrutivo: true }))) return
    const lista = modelos.filter((x) => x.id !== m.id)
    setModelos(lista)
    start(async () => { await salvarTema({ modelos: lista }); toast.success('Modelo removido') })
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Modo padrão (claro/escuro) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modo padrão do sistema</CardTitle>
          <CardDescription>
            Define se a plataforma abre em claro ou escuro para quem ainda não escolheu (login + novos
            admins e alunos). Cada um pode alternar o seu individualmente depois.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:max-w-md">
          {([['light', 'Claro', Sun], ['dark', 'Escuro', Moon]] as const).map(([val, label, Icon]) => (
            <button key={val} onClick={() => salvarModo(val)} disabled={pending}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors disabled:opacity-60',
                modo === val ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50',
              )}>
              <span className={cn('flex h-14 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium',
                val === 'light' ? 'bg-white text-neutral-800' : 'bg-neutral-900 text-neutral-100')}>
                <Icon className="h-4 w-4" /> {label}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {modo === val && <Check className="h-3.5 w-3.5 text-primary" />}
                {modo === val ? 'Padrão atual' : 'Definir'}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Modelos de tema (presets) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelos de tema</CardTitle>
          <CardDescription>
            Salve o tema atual (modo, cores, fonte e logo) como um modelo nomeado e reaplique num clique —
            sem reconfigurar tudo de novo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do modelo (ex.: Procuradoria roxo)"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvarModelo() } }} />
            <button onClick={salvarModelo} disabled={pending || !nome.trim()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              <Save className="h-4 w-4" /> Salvar atual
            </button>
          </div>

          {modelos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-muted-foreground">
              <Palette className="h-7 w-7 opacity-40" />
              <p className="text-sm">Nenhum modelo salvo ainda.</p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {modelos.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold',
                    m.dados?.modo_padrao === 'dark' ? 'bg-neutral-900 text-neutral-100' : 'bg-white text-neutral-800 ring-1 ring-border')}>
                    {m.dados?.modo_padrao === 'dark' ? 'D' : 'C'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.nome}</span>
                  <button onClick={() => aplicar(m)} disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
                    {pending && acting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aplicar
                  </button>
                  <button onClick={() => excluir(m)} disabled={pending} title="Excluir modelo"
                    className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
